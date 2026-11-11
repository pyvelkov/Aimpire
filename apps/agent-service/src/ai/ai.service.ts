import type {
  AIProvider,
  GenerateTextOptions,
  GenerateTextResult,
} from "./types.js";

import { GeminiProvider } from "./providers/gemini.provider.js";

const providerName = process.env.AI_PROVIDER ?? "gemini";

function createProvider(): AIProvider {
  switch (providerName) {
    case "gemini":
      return new GeminiProvider();

    default:
      throw new Error(
        `Unsupported AI provider: ${providerName}`
      );
  }
}

const provider = createProvider();

export const aiService = {
  generateText(
    options: GenerateTextOptions
  ): Promise<GenerateTextResult> {
    return provider.generateText(options);
  },
};
