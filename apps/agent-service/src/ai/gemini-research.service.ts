import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const sourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
});

export type ResearchSource = z.infer<typeof sourceSchema>;

export interface GroundedResearch {
  text: string;
  sources: ResearchSource[];
  search_queries: string[];
  model: string;
}

export class GeminiResearchService {
  private client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async research(prompt: string): Promise<GroundedResearch> {
    const model = process.env.GEMINI_MODEL
      ?? "gemini-3.8-flash";

    const response = await this.client.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 3000,
      },
    });

    const metadata =
      response.candidates?.[0]?.groundingMetadata;

    const sources = (
      metadata?.groundingChunks ?? []
    )
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => ({
        title: chunk.web?.title ?? "Untitled source",
        url: chunk.web!.uri!,
      }));

    const uniqueSources = Array.from(
      new Map(
        sources.map((source) => [source.url, source])
      ).values()
    );

    if (
      !response.text?.trim() ||
      uniqueSources.length === 0
    ) {
      throw new Error(
        "Gemini did not return grounded research with sources"
      );
    }

    return {
      text: response.text,
      sources: uniqueSources,
      search_queries: metadata?.webSearchQueries ?? [],
      model,
    };
  }
}

export const geminiResearchService =
  new GeminiResearchService();
