import { z } from "zod";
import { aiService } from "../../ai/ai.service.js";
import {
  taskListSchema,
  taskService,
} from "../../services/task.service.js";

export class CEOAgent {
  async plan(objective: string) {
    const result = await aiService.generateText({
      systemInstruction: `
You are the CEO of an AI-powered dropshipping company.

Your responsibility is to break business objectives into
clear, actionable tasks and delegate them to the correct
department.

Available departments:

- research: Market research, trends and competitors.
- product: Product evaluation, suppliers and pricing.
- marketing: Advertising, SEO and marketing content.
- finance: Financial analysis and profitability.
- operations: Orders, fulfillment and logistics.
- support: Customer service and returns.

Rules:

1. Break objectives into independent, actionable tasks.
2. Assign each task to the most appropriate department.
3. Use priorities from 1 to 5, where 1 is highest.
4. Include relevant context in the input object.
5. Do not invent research findings or claim tasks are completed.
6. Do not exceed 8 tasks.
7. Return ONLY valid JSON.
8. Return a JSON array, without markdown formatting.

Each task must have:
title, description, agent_type, priority, input.
      `,
      prompt: `
Create an execution plan for this objective:

${objective}

Return a JSON array of tasks.
      `,
      temperature: 0.2,
      maxOutputTokens: 2500,
    });

    let parsed: unknown;

    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("CEO Agent returned invalid JSON");
    }

    const tasks = taskListSchema.parse(parsed);

    const createdTasks = await taskService.createTasks(tasks);

    return {
      objective,
      tasks_created: createdTasks.length,
      tasks: createdTasks,
    };
  }
}
