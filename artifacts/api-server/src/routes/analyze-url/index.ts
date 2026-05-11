import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

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

function extractText(html: string): string {
  return html
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
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 14000);
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

function extractMetaDesc(html: string): string {
  const m =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return m ? m[1].trim() : "";
}

export interface AnalysisResult {
  url: string;
  title: string;
  description: string;
  features: string[];
  prompt: string;
}

/** Fetch one URL and run Claude analysis. Throws on error. */
async function analyzeOne(url: string): Promise<AnalysisResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KIStudioBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("html")) throw new Error("Kein HTML zurückgegeben");
    html = await response.text();
  } catch (err: unknown) {
    clearTimeout(timeout);
    throw new Error(err instanceof Error ? err.message : String(err));
  }

  const pageTitle = extractTitle(html);
  const metaDesc = extractMetaDesc(html);
  const bodyText = extractText(html);

  const system = `Du bist ein App-Analyse-Experte. Analysiere den Inhalt einer Webseite und beschreibe detailliert, was für eine App oder Webseite das ist und welche Funktionen sie hat. Antworte ausschließlich mit einem JSON-Objekt in folgendem Format (kein Markdown, kein Text davor oder danach):
{
  "title": "kurzer prägnanter Projektname (auf Deutsch)",
  "description": "ausführliche Beschreibung was diese App kann, wie sie aussieht, welche Features sie hat — mindestens 3 Sätze auf Deutsch",
  "features": ["Feature 1", "Feature 2", "Feature 3"],
  "prompt": "detaillierter Prompt auf Deutsch (mindestens 200 Wörter) der an eine KI gegeben werden kann um genau so eine App nachzubauen — beschreibe Layout, Farben, Features, Interaktionen, Datenmodell, UI-Komponenten, alles was nötig ist"
}`;

  const userMsg = `Analysiere diese Webseite:\n\nURL: ${url}\nSeiten-Titel: ${pageTitle}\nMeta-Beschreibung: ${metaDesc}\n\nSeiten-Inhalt:\n${bodyText}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("KI-Antwort konnte nicht verarbeitet werden");

  const parsed = JSON.parse(jsonMatch[0]) as {
    title?: string;
    description?: string;
    features?: string[];
    prompt?: string;
  };

  return {
    url,
    title: parsed.title ?? pageTitle ?? "Neues Projekt",
    description: parsed.description ?? "",
    features: Array.isArray(parsed.features) ? parsed.features : [],
    prompt: parsed.prompt ?? "",
  };
}

// ── Single URL (existing, backwards-compatible) ─────────────────────────────
router.post("/analyze-url", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!rawUrl || !isValidUrl(rawUrl)) {
    res.status(400).json({ error: "Ungültige oder fehlende URL." });
    return;
  }

  try {
    const result = await analyzeOne(rawUrl);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Single analyze-url error");
    res.status(422).json({ error: err instanceof Error ? err.message : "Analyse fehlgeschlagen." });
  }
});

// ── Multiple URLs in parallel ────────────────────────────────────────────────
router.post("/analyze-urls", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const rawUrls: unknown = req.body?.urls;
  if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
    res.status(400).json({ error: "Keine URLs angegeben." });
    return;
  }

  const urls: string[] = rawUrls
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_URLS);

  const invalid = urls.filter((u) => !isValidUrl(u));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Ungültige URL(s): ${invalid.join(", ")}` });
    return;
  }

  // Run all analyses in parallel; collect successes + errors separately
  const settled = await Promise.allSettled(urls.map((u) => analyzeOne(u)));

  const results: Array<AnalysisResult | { url: string; error: string }> = settled.map(
    (s, i) => {
      if (s.status === "fulfilled") return s.value;
      return { url: urls[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) };
    },
  );

  res.json({ results });
});

// ── Merge multiple analysis results into one combined prompt ─────────────────
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
    .map((a, i) => `### App ${i + 1}: ${a.title}\nURL: ${a.url}\n\nBeschreibung: ${a.description}\n\nFeatures: ${a.features.join(", ")}\n\nPrompt:\n${a.prompt}`)
    .join("\n\n---\n\n");

  const system = `Du bist ein erfahrener App-Entwickler und Designer. Du erhältst Analysen mehrerer Web-Apps und sollst eine neue, kombinierte App konzipieren, die die besten Ideen, Features und Design-Elemente aller Quellen vereint. Antworte ausschließlich mit einem JSON-Objekt (kein Markdown):
{
  "title": "prägnanter Name für die kombinierte App (auf Deutsch)",
  "description": "Was die kombinierte App kann — wie sie die besten Elemente aller Quellen vereint — mindestens 4 Sätze",
  "features": ["Feature 1", "Feature 2", ...],
  "prompt": "ausführlicher Entwicklungs-Prompt (mindestens 300 Wörter) der genau beschreibt wie die kombinierte App gebaut werden soll — Layout, Farben, alle Features, Interaktionen, UI-Komponenten"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: `Führe diese ${valid.length} App-Analysen zu einer einzigen, besseren App zusammen:\n\n${summary}` }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("KI-Antwort konnte nicht verarbeitet werden");

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      features?: string[];
      prompt?: string;
    };

    res.json({
      title: parsed.title ?? "Kombiniertes Projekt",
      description: parsed.description ?? "",
      features: Array.isArray(parsed.features) ? parsed.features : [],
      prompt: parsed.prompt ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Merge analysis error");
    res.status(500).json({ error: "Zusammenführen fehlgeschlagen." });
  }
});

export default router;
