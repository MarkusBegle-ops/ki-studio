import OpenAI from "openai";

export interface UserApiKeys {
  openaiApiKey?: string | null;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  openrouterApiKey?: string | null;
}

export interface AIClient {
  client: OpenAI;
  textModel: string;
  visionModel: string;
  provider: "openrouter" | "groq" | "gemini" | "openai" | "pollinations";
}

export function getAIClient(keys: UserApiKeys): AIClient {
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
      provider: "gemini",
    };
  }

  if (keys.openaiApiKey) {
    return {
      client: new OpenAI({ apiKey: keys.openaiApiKey }),
      textModel: "gpt-4o",
      visionModel: "gpt-4o",
      provider: "openai",
    };
  }

  // Pollinations AI — kein API-Key nötig, kostenlos
  return {
    client: new OpenAI({
      apiKey: "pollinations",
      baseURL: "https://text.pollinations.ai/openai",
    }),
    textModel: "openai-fast",
    visionModel: "openai-fast",
    provider: "pollinations",
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
