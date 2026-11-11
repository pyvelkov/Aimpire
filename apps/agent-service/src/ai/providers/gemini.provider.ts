import { GoogleGenAI } from "@google/genai";
import type {
  AIProvider,
  GenerateTextOptions,
  GenerateTextResult,
} from "../types.js";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    this.model =
      process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

    this.client = new GoogleGenAI({ apiKey });
  }

  async generateText(
    options: GenerateTextOptions
  ): Promise<GenerateTextResult> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: options.prompt,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    return {
      text,
      provider: "gemini",
      model: this.model,
    };
  }
}
