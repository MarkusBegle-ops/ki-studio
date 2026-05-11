import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(apiKey?: string | null): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Kein OpenAI API-Key hinterlegt. Bitte trage deinen Key in den Einstellungen ein.",
    );
  }
  if (apiKey) {
    return new OpenAI({ apiKey });
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}
