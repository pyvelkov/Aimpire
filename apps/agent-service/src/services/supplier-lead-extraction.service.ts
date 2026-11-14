import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const leadSchema = z.object({
  supplier_name: z.string().min(2),
  supplier_url: z.string().url(),
  product_url: z.string().url().nullable(),
  platform: z.string().nullable(),
  evidence_notes: z.string().min(10),
});

const resultSchema = z.object({
  suppliers: z.array(leadSchema).max(5),
});

type GroundingSource = {
  index: number;
  title: string;
  url: string;
};

function normalizeSupplierUrl(value: string): string {
  const url = new URL(value);

  return (
    `${url.protocol}//${url.host}${url.pathname}`
      .replace(/\/+$/, "")
      .toLowerCase()
  );
}

function getHostname(value: string): string | null {
  try {
    const url = new URL(value);

    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }

    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sourceMatchesSupplier(
  source: GroundingSource,
  supplierUrl: string
): boolean {
  const hostname = getHostname(supplierUrl);

  if (!hostname) return false;

  const title = source.title.toLowerCase().trim();

  // Require an explicit domain reference in the
  // grounding title. A generic supplier name alone
  // is insufficient.
  return (
    title === hostname ||
    title === `www.${hostname}` ||
    title.includes(`https://${hostname}`) ||
    title.includes(`http://${hostname}`)
  );
}

export class SupplierLeadExtractionService {
  async extract(runId: string) {
    const { data: run, error } = await supabase
      .from("supplier_discovery_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (error || !run) {
      throw new Error("Supplier discovery run not found");
    }

    const sources =
      (run.grounding_sources ?? []) as GroundingSource[];

    if (!run.research_text || sources.length === 0) {
      throw new Error("No saved research evidence available");
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `
Extract up to five potential suppliers from the
following research about dropshipping products.

Rules:
- Only extract suppliers explicitly named in the research.
- supplier_url must appear in the research text.
- Do not invent supplier URLs.
- product_url must be null unless a specific
  product URL appears in the research.
- Do not invent prices, shipping costs or certifications.
- evidence_notes must explain what was found
  and what remains unverified.
- Return only valid JSON.

Required JSON:
{
  "suppliers": [
    {
      "supplier_name": "string",
      "supplier_url": "https://...",
      "product_url": null,
      "platform": null,
      "evidence_notes": "string"
    }
  ]
}

Research:
${run.research_text.slice(0, 16000)}
      `,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 2500,
      },
    });

    const parsed = resultSchema.parse(
      JSON.parse(response.text ?? "{}")
    );

    const saved = [];
    const skipped = [];

    const { data: existing, error: existingError } =
      await supabase
        .from("supplier_discoveries")
        .select("supplier_url, product_url")
        .eq("candidate_id", run.candidate_id);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const knownSuppliers = new Set(
      (existing ?? [])
        .filter((item) => item.product_url === null)
        .map((item) =>
          normalizeSupplierUrl(item.supplier_url)
        )
    );

    for (const lead of parsed.suppliers) {
      const supplierHost = getHostname(lead.supplier_url);

      if (
        !supplierHost ||
        !run.research_text.includes(lead.supplier_url)
      ) {
        skipped.push({
          supplier: lead.supplier_name,
          reason: "Supplier URL not present in research",
        });
        continue;
      }

      const normalizedSupplier = normalizeSupplierUrl(
        lead.supplier_url
      );

      if (
        lead.product_url === null &&
        knownSuppliers.has(normalizedSupplier)
      ) {
        skipped.push({
          supplier: lead.supplier_name,
          reason: "Supplier already discovered",
        });
        continue;
      }

      const matchingSource = sources.find((source) =>
        sourceMatchesSupplier(source, lead.supplier_url)
      );

      if (!matchingSource) {
        skipped.push({
          supplier: lead.supplier_name,
          reason: "No matching grounding source title",
        });
        continue;
      }

      if (
        lead.product_url &&
        !run.research_text.includes(lead.product_url)
      ) {
        skipped.push({
          supplier: lead.supplier_name,
          reason: "Product URL not present in research",
        });
        continue;
      }

      const { data, error: insertError } =
        await supabase
          .from("supplier_discoveries")
          .insert({
            candidate_id: run.candidate_id,
            supplier_name: lead.supplier_name,
            supplier_url: lead.supplier_url,
            product_url: lead.product_url,
            platform: lead.platform,
            evidence_url: matchingSource.url,
            evidence_notes: lead.evidence_notes,
            discovery_method: "gemini_google_search",
            verification_status: "unverified",
          })
          .select()
          .single();

      if (insertError) {
        if (insertError.code === "23505") {
          skipped.push({
            supplier: lead.supplier_name,
            reason: "Duplicate supplier discovery",
          });
          continue;
        }

        throw new Error(insertError.message);
      }

      saved.push(data);

      if (lead.product_url === null) {
        knownSuppliers.add(normalizedSupplier);
      }
    }

    const extractionResult = {
      extracted_count: parsed.suppliers.length,
      saved_count: saved.length,
      skipped_count: skipped.length,
      skipped,
      extracted_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("supplier_discovery_runs")
      .update({
        extraction_result: extractionResult,
        status: "extracted",
      })
      .eq("id", runId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      run_id: runId,
      ...extractionResult,
      saved,
    };
  }
}

export const supplierLeadExtractionService =
  new SupplierLeadExtractionService();
