import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAIClient, getSupportClient } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const MAX_URLS = 6;

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitize(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/\s{2,}/g, " ").trim();
}

function extractText(html: string): string {
  return sanitize(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/(nav|header|footer|aside)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .slice(0, 12000),
  );
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return sanitize(m ? m[1] : "");
}

function extractMetaDesc(html: string): string {
  const m =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return sanitize(m ? m[1] : "");
}

function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Analyse fehlgeschlagen.";
  const msg = err.message;
  if (msg.startsWith("{") || msg.includes('"type":"error"') || /^\d{3}\s*\{/.test(msg)) {
    return "KI-Analyse fehlgeschlagen. Bitte erneut versuchen.";
  }
  if (msg.includes("aborted") || msg.includes("timeout") || msg.includes("abort")) {
    return "Zeitüberschreitung — Seite antwortet zu langsam.";
  }
  if (msg.startsWith("HTTP ")) return `Seite nicht erreichbar (${msg}).`;
  if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("EAI_AGAIN")) {
    return "Domain nicht erreichbar.";
  }
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}

function parseJson(raw: string): Record<string, unknown> {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("Kein JSON in der Antwort");
  return JSON.parse(raw.slice(first, last + 1));
}

export interface AnalysisResult {
  url: string;
  title: string;
  description: string;
  features: string[];
  prompt: string;
}

async function getUserKeys(userId: string) {
  const [user] = await db.select({
    openaiApiKey: usersTable.openaiApiKey,
    groqApiKey: usersTable.groqApiKey,
    geminiApiKey: usersTable.geminiApiKey,
    openrouterApiKey: usersTable.openrouterApiKey,
    mistralApiKey: usersTable.mistralApiKey,
    nvidiaApiKey: usersTable.nvidiaApiKey,
  }).from(usersTable).where(eq(usersTable.id, userId));
  return {
    openaiApiKey: user?.openaiApiKey ?? null,
    groqApiKey: user?.groqApiKey ?? null,
    geminiApiKey: user?.geminiApiKey ?? null,
    openrouterApiKey: user?.openrouterApiKey ?? null,
    mistralApiKey: user?.mistralApiKey ?? null,
    nvidiaApiKey: user?.nvidiaApiKey ?? null,
  };
}

async function analyzeOne(url: string, keys: Awaited<ReturnType<typeof getUserKeys>>): Promise<AnalysisResult> {
  let html: string;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) throw new Error("Kein HTML zurückgegeben");
    html = await response.text();
  } catch (err: unknown) {
    clearTimeout(timeout);
    throw new Error(friendlyError(err));
  }

  const pageTitle = extractTitle(html);
  const metaDesc = extractMetaDesc(html);
  const bodyText = extractText(html);

  const systemMsg =
    'Du bist ein App-Analyse-Experte. Analysiere den Inhalt einer Webseite. ' +
    'Antworte NUR mit einem JSON-Objekt, kein Markdown, kein Text davor oder danach. ' +
    'Format: {"title":"...","description":"...","features":["..."],"prompt":"..."}';

  const userMsg =
    `URL: ${url}\n` +
    `Titel: ${pageTitle || "(kein Titel)"}\n` +
    `Beschreibung: ${metaDesc || "(keine)"}\n\n` +
    `Seiteninhalt:\n${bodyText || "(kein Text extrahierbar)"}`;

  const messages = [
    { role: "system" as const, content: systemMsg },
    { role: "user" as const, content: userMsg },
  ];

  // Build fallback chain: primary provider → Pollinations (always available, no key needed)
  const primary = getAIClient(keys);
  const support = getSupportClient();
  const candidates = [
    { client: primary.client, model: primary.textModel },
    { client: support.client, model: "openai" },
    { client: support.client, model: "mistral" },
  ];

  let lastErr: unknown;
  for (const cand of candidates) {
    try {
      const completion = await cand.client.chat.completions.create({
        model: cand.model,
        max_tokens: 1024,
        messages,
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      if (!raw.trim()) continue; // try next provider
      let parsed: Record<string, unknown>;
      try {
        parsed = parseJson(raw);
      } catch {
        // If JSON parsing fails, build a minimal result from page metadata
        return {
          url,
          title: pageTitle || "Neues Projekt",
          description: metaDesc || raw.slice(0, 200),
          features: [],
          prompt: `Erstelle eine App ähnlich wie: ${pageTitle || url}. ${metaDesc || ""}`.trim(),
        };
      }
      return {
        url,
        title: typeof parsed.title === "string" ? parsed.title : pageTitle || "Neues Projekt",
        description: typeof parsed.description === "string" ? parsed.description : "",
        features: Array.isArray(parsed.features) ? (parsed.features as string[]) : [],
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      };
    } catch (err) {
      lastErr = err;
      // continue to next provider
    }
  }

  // All providers failed — return minimal result based on page metadata so the user can still proceed
  if (pageTitle || metaDesc) {
    return {
      url,
      title: pageTitle || "Analyse fehlgeschlagen",
      description: metaDesc || "",
      features: [],
      prompt: `Erstelle eine App ähnlich wie: ${pageTitle || url}. ${metaDesc || ""}`.trim(),
    };
  }
  throw new Error(friendlyError(lastErr));
}

router.post("/analyze-url", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!rawUrl || !isValidUrl(rawUrl)) { res.status(400).json({ error: "Ungültige oder fehlende URL." }); return; }
  const keys = await getUserKeys(req.user.id);
  try {
    res.json(await analyzeOne(rawUrl, keys));
  } catch (err) {
    req.log.error({ err }, "analyze-url error");
    res.status(422).json({ error: friendlyError(err) });
  }
});

router.post("/analyze-urls", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }

  const rawUrls: unknown = req.body?.urls;
  if (!Array.isArray(rawUrls) || rawUrls.length === 0) { res.status(400).json({ error: "Keine URLs angegeben." }); return; }

  const urls: string[] = rawUrls
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_URLS);

  const invalid = urls.filter((u) => !isValidUrl(u));
  if (invalid.length > 0) { res.status(400).json({ error: `Ungültige URL(s): ${invalid.join(", ")}` }); return; }

  const keys = await getUserKeys(req.user.id);
  const settled = await Promise.allSettled(urls.map((u) => analyzeOne(u, keys)));

  const results: Array<AnalysisResult | { url: string; error: string }> = settled.map(
    (s, i) => {
      if (s.status === "fulfilled") return s.value;
      return { url: urls[i], error: friendlyError(s.reason) };
    },
  );
  res.json({ results });
});

router.post("/analyze-urls/merge", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const analyses: unknown = req.body?.analyses;
  if (!Array.isArray(analyses) || analyses.length < 2) {
    res.status(400).json({ error: "Mindestens 2 Analysen zum Zusammenführen nötig." });
    return;
  }

  const valid = (analyses as AnalysisResult[]).filter(
    (a) => typeof a?.title === "string" && typeof a?.prompt === "string",
  );
  if (valid.length < 2) {
    res.status(400).json({ error: "Ungültige Analysedaten." });
    return;
  }

  const summary = valid
    .map(
      (a, i) =>
        `App ${i + 1}: ${sanitize(a.title)}\n` +
        `Features: ${a.features.slice(0, 8).map(sanitize).join(", ")}\n` +
        `Beschreibung: ${sanitize(a.description).slice(0, 300)}\n` +
        `Prompt-Auszug: ${sanitize(a.prompt).slice(0, 500)}`,
    )
    .join("\n\n---\n\n");

  try {
    const keys = await getUserKeys(req.user.id);
    const { client, textModel } = getAIClient(keys);
    const completion = await client.chat.completions.create({
      model: textModel,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "Du bist ein App-Architekt. Kombiniere die Analysen mehrerer Apps zu EINER verbesserten App. " +
            'Antworte NUR mit JSON, kein Markdown, kein erklärender Text. Format: {"title":"...","description":"...","features":["..."],"prompt":"..."}',
        },
        {
          role: "user",
          content: `Führe diese ${valid.length} App-Analysen zu einer einzigen, besseren App zusammen:\n\n${summary}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseJson(raw);

    res.json({
      title: typeof parsed.title === "string" ? parsed.title : "Kombiniertes Projekt",
      description: typeof parsed.description === "string" ? parsed.description : "",
      features: Array.isArray(parsed.features) ? parsed.features : [],
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
    });
  } catch (err) {
    req.log.error({ err }, "Merge analysis error");
    res.status(500).json({ error: "Zusammenführen fehlgeschlagen. Bitte erneut versuchen." });
  }
});

export default router;
