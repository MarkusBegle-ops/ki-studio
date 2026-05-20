import OpenAI from "openai";

export interface UserApiKeys {
  openaiApiKey?: string | null;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  openrouterApiKey?: string | null;
  mistralApiKey?: string | null;
  nvidiaApiKey?: string | null;
}

export interface AIClient {
  client: OpenAI;
  textModel: string;
  visionModel: string;
  /** Specialized model for code generation — may differ from textModel */
  codeModel: string;
  provider: "openrouter" | "nvidia" | "groq" | "gemini" | "openai" | "pollinations" | "mistral";
}

export function getAIClient(keys: UserApiKeys): AIClient {
  // Priority: OpenRouter → NVIDIA → Groq → Gemini → OpenAI → Mistral → Server OpenRouter → Pollinations (free fallback)

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
      // qwen3-coder: dedicated code model, 262K context — best free option for HTML generation
      // nemotron-nano-12b-v2-vl: vision-language model for image uploads
      // llama-3.3-70b: reliable general model for planning
      textModel: "meta-llama/llama-3.3-70b-instruct:free",
      visionModel: "nvidia/nemotron-nano-12b-v2-vl:free",
      codeModel: "qwen/qwen3-coder:free",
      provider: "openrouter",
    };
  }

  if (keys.nvidiaApiKey) {
    return {
      client: new OpenAI({
        apiKey: keys.nvidiaApiKey,
        baseURL: "https://integrate.api.nvidia.com/v1",
      }),
      // nemotron-super: NVIDIA's flagship reasoning model (49B, excellent for complex apps)
      // llama-3.2-90b-vision: vision-capable for image uploads
      // qwen3-coder: specialized code model, 235B params
      textModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      visionModel: "nvidia/llama-3.2-90b-vision-instruct",
      codeModel: "qwen/qwen3-235b-a22b",
      provider: "nvidia",
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

  // Server-seitiger OpenRouter-Key (Render-Umgebungsvariable) — Fallback ohne User-Key
  const serverOpenRouterKey = process.env["OPENROUTER_API_KEY"];
  if (serverOpenRouterKey) {
    return {
      client: new OpenAI({
        apiKey: serverOpenRouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://ki-studio.app",
          "X-Title": "KI Studio",
        },
      }),
      textModel: "meta-llama/llama-3.3-70b-instruct:free",
      visionModel: "nvidia/nemotron-nano-12b-v2-vl:free",
      codeModel: "qwen/qwen3-coder:free",
      provider: "openrouter",
    };
  }

  // Pollinations AI — kein API-Key nötig, kostenlos
  // openai = GPT-4o equivalent — das einzige zuverlässige Modell auf der Legacy-API
  return {
    client: new OpenAI({
      apiKey: "pollinations",
      baseURL: "https://text.pollinations.ai/openai",
    }),
    textModel: "openai",
    visionModel: "openai",
    codeModel: "openai",
    provider: "pollinations",
  };
}

/**
 * Returns a Pollinations client that is ALWAYS available (no API key needed).
 * Used as a support/review AI regardless of which primary provider is active.
 * reviewModel = openai (GPT-4o equiv) — best reasoning for catching bugs
 * codeReviewModel = openai — the only reliable model on Pollinations legacy API
 */
export function getSupportClient(): { client: OpenAI; reviewModel: string; codeReviewModel: string } {
  return {
    client: new OpenAI({
      apiKey: "pollinations",
      baseURL: "https://text.pollinations.ai/openai",
    }),
    reviewModel: "openai",
    codeReviewModel: "openai",
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
