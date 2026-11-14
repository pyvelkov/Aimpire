import "dotenv/config";
import Fastify from "fastify";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import { aiService } from "./ai/ai.service.js";
import { CEOAgent } from "./agents/ceo/ceo.agent.js";
import { agentExecutionService } from "./services/agent-execution.service.js";
import { geminiResearchService } from "./ai/gemini-research.service.js";
import { productExtractionService } from "./services/product-extraction.service.js";
import { productEvaluationService } from "./services/product-evaluation.service.js";
import {
    unitEconomicsService,
    unitEconomicsSchema,
} from "./services/unit-economics.service.js";
import {
    supplierQuoteService,
    createSupplierQuoteSchema,
} from "./services/supplier-quote.service.js";
import {
    supplierComparisonService,
    supplierComparisonSchema,
} from "./services/supplier-comparison.service.js";

const app = Fastify({
    logger: true,
});

const ceoAgent = new CEOAgent();

app.get("/health", async () => {
    return {
        status: "ok",
        service: "Aimpire",
        timestamp: new Date().toISOString(),
    };
});

app.get("/health/database", async (_request, reply) => {
    const { error } = await supabase
        .from("agent_tasks")
        .select("id")
        .limit(1);

    if (error) {
        app.log.error(error);

        return reply.status(500).send({
            status: "error",
            database: "disconnected",
            message: error.message,
        });
    }

    return {
        status: "ok",
        database: "connected",
    };
});

app.post("/ai/test", async (request, reply) => {
    try {
        const body = request.body as {
            prompt?: string;
        };

        if (!body.prompt || !body.prompt.trim()) {
            return reply.status(400).send({
                error: "A prompt is required",
            });
        }

        const result = await aiService.generateText({
            systemInstruction:
                "You are the AI assistant powering an autonomous ecommerce company. Be concise, practical, and analytical.",
            prompt: body.prompt,
            temperature: 0.7,
            maxOutputTokens: 1024,
        });

        return {
            success: true,
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "AI generation failed",
        });
    }
});

app.post("/agents/ceo/plan", async (request, reply) => {
    try {
        const bodySchema = z.object({
            objective: z.string().min(10).max(2000),
        });

        const parsed = bodySchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: "Invalid objective",
                details: parsed.error.issues,
            });
        }

        const result = await ceoAgent.plan(
            parsed.data.objective
        );

        return {
            success: true,
            agent: "ceo",
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "CEO Agent failed to create a plan",
        });
    }
});

app.post("/agents/research/execute-next", async (_request, reply) => {
    try {
        const result = await agentExecutionService.executeNext(
            "research"
        );

        return {
            success: true,
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "Research Agent execution failed",
        });
    }
});

app.get("/ai/test-grounding", async (_request, reply) => {
    try {
        const result = await geminiResearchService.research(
            "Find one recent ecommerce trend relevant to Canada in 2026. Include a source."
        );

        return {
            success: true,
            model: result.model,
            sources_found: result.sources.length,
            search_queries: result.search_queries,
            text: result.text,
            sources: result.sources,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Grounding test failed",
        });
    }
});

app.post("/agents/research/extract-products", async (request, reply) => {
    const bodySchema = z.object({
        task_id: z.string().uuid(),
    });

    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid task_id",
            details: parsed.error.issues,
        });
    }

    try {
        const result = await productExtractionService.extract(
            parsed.data.task_id
        );

        return {
            success: true,
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Product extraction failed",
        });
    }
});

app.post("/agents/product/evaluate", async (request, reply) => {
    const bodySchema = z.object({
        candidate_id: z.string().uuid(),
    });

    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid candidate_id",
            details: parsed.error.issues,
        });
    }

    try {
        const result = await productEvaluationService.evaluate(
            parsed.data.candidate_id
        );

        return {
            success: true,
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Product evaluation failed",
        });
    }
});

app.post("/finance/calculate", async (request, reply) => {
    const parsed = unitEconomicsSchema.safeParse(
        request.body
    );

    if (!parsed.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid financial inputs",
            details: parsed.error.issues,
        });
    }

    return {
        success: true,
        result: unitEconomicsService.calculate(
            parsed.data
        ),
    };
});

app.post("/supplier-quotes", async (request, reply) => {
    const parsed = createSupplierQuoteSchema.safeParse(
        request.body
    );

    if (!parsed.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid supplier quote",
            details: parsed.error.issues,
        });
    }

    try {
        const result = await supplierQuoteService.create(
            parsed.data
        );

        return reply.status(201).send({
            success: true,
            ...result,
        });
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "Failed to create supplier quote",
        });
    }
});

app.get("/supplier-quotes/:candidateId", async (request, reply) => {
    const params = z.object({
        candidateId: z.string().uuid(),
    }).safeParse(request.params);

    if (!params.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid candidate ID",
        });
    }

    try {
        const quotes = await supplierQuoteService.getByCandidate(
            params.data.candidateId
        );

        return {
            success: true,
            count: quotes.length,
            quotes,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "Failed to retrieve supplier quotes",
        });
    }
});

app.post("/supplier-quotes/compare", async (request, reply) => {
    const parsed = supplierComparisonSchema.safeParse(
        request.body
    );

    if (!parsed.success) {
        return reply.status(400).send({
            success: false,
            error: "Invalid comparison input",
            details: parsed.error.issues,
        });
    }

    try {
        const result =
            await supplierComparisonService.compare(
                parsed.data
            );

        return {
            success: true,
            ...result,
        };
    } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
            success: false,
            error: "Supplier comparison failed",
        });
    }
});

const start = async () => {
    try {
        await app.listen({
            port: Number(process.env.PORT ?? 3000),
            host: "0.0.0.0",
        });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

void start();
