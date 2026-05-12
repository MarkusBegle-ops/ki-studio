import OpenAI from "openai";

export interface UserApiKeys {
  openaiApiKey?: string | null;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  openrouterApiKey?: string | null;
  mistralApiKey?: string | null;
}

export interface AIClient {
  client: OpenAI;
  textModel: string;
  visionModel: string;
  /** Specialized model for code generation — may differ from textModel */
  codeModel: string;
  provider: "openrouter" | "groq" | "gemini" | "openai" | "pollinations" | "mistral";
}

export function getAIClient(keys: UserApiKeys): AIClient {
  // Priority: OpenRouter → Groq → Gemini → OpenAI → Mistral → Pollinations (free fallback)

  if (keys.openrouterApiKey) {
    return {
      client: new OpenAI({
        apiKey: keys.openrouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://ki-studio.app",
          "X-Title": "KI Studio",
        },
      }),
      textModel: "google/gemini-2.0-flash-exp:free",
      visionModel: "google/gemini-2.0-flash-exp:free",
      codeModel: "google/gemini-2.0-flash-exp:free",
      provider: "openrouter",
    };
  }

  if (keys.groqApiKey) {
    return {
      client: new OpenAI({
        apiKey: keys.groqApiKey,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      textModel: "llama-3.3-70b-versatile",
      visionModel: "llama-3.2-90b-vision-preview",
      codeModel: "llama-3.3-70b-versatile",
      provider: "groq",
    };
  }

  if (keys.geminiApiKey) {
    return {
      client: new OpenAI({
        apiKey: keys.geminiApiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      textModel: "gemini-2.0-flash",
      visionModel: "gemini-2.0-flash",
      codeModel: "gemini-2.0-flash",
      provider: "gemini",
    };
  }

  if (keys.openaiApiKey) {
    return {
      client: new OpenAI({ apiKey: keys.openaiApiKey }),
      textModel: "gpt-4o",
      visionModel: "gpt-4o",
      codeModel: "gpt-4o",
      provider: "openai",
    };
  }

  if (keys.mistralApiKey) {
    return {
      client: new OpenAI({
        apiKey: keys.mistralApiKey,
        baseURL: "https://api.mistral.ai/v1",
      }),
      // codestral-latest is Mistral's dedicated code model — best for HTML/JS/CSS generation
      textModel: "mistral-large-latest",
      visionModel: "mistral-large-latest",
      codeModel: "codestral-latest",
      provider: "mistral",
    };
  }

  // Pollinations AI — kein API-Key nötig, kostenlos
  // openai = GPT-4o equivalent (Planung & Review)
  // qwen-coder = Qwen 2.5 Coder 32B (speziell für Code — deutlich besser!)
  return {
    client: new OpenAI({
      apiKey: "pollinations",
      baseURL: "https://text.pollinations.ai/openai",
    }),
    textModel: "openai",
    visionModel: "openai",
    codeModel: "qwen-coder",
    provider: "pollinations",
  };
}

/**
 * Returns a Pollinations client that is ALWAYS available (no API key needed).
 * Used as a support/review AI regardless of which primary provider is active.
 * reviewModel = openai (GPT-4o equiv) — best reasoning for catching bugs
 * codeReviewModel = qwen-coder — specialized for reading and fixing code
 */
export function getSupportClient(): { client: OpenAI; reviewModel: string; codeReviewModel: string } {
  return {
    client: new OpenAI({
      apiKey: "pollinations",
      baseURL: "https://text.pollinations.ai/openai",
    }),
    reviewModel: "openai",
    codeReviewModel: "qwen-coder",
  };
}

export function getOpenAIClient(apiKey?: string | null): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Kein OpenAI API-Key hinterlegt. Bitte trage deinen Key in den Einstellungen ein.",
    );
  }
  return new OpenAI({ apiKey: key });
}
