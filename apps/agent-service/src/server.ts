import "dotenv/config";
import Fastify from "fastify";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import { aiService } from "./ai/ai.service.js";
import { CEOAgent } from "./agents/ceo/ceo.agent.js";

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
