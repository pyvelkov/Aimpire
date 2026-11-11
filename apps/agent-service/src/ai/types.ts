export interface GenerateTextOptions {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  generateText(
    options: GenerateTextOptions
  ): Promise<GenerateTextResult>;
}
