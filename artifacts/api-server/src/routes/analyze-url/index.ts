import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Strip HTML tags and compress whitespace, return readable text */
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
    .slice(0, 18000);
}

/** Extract <title> from HTML */
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

/** Extract meta description */
function extractMetaDesc(html: string): string {
  const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return m ? m[1].trim() : "";
}

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

  const url = rawUrl;

  let html = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KIStudioBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(422).json({ error: `Seite nicht erreichbar (HTTP ${response.status})` });
      return;
    }

    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      res.status(422).json({ error: "Die URL liefert kein HTML zurück." });
      return;
    }

    html = await response.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ url, err: msg }, "URL fetch failed");
    res.status(422).json({ error: `URL konnte nicht abgerufen werden: ${msg}` });
    return;
  }

  const pageTitle = extractTitle(html);
  const metaDesc = extractMetaDesc(html);
  const bodyText = extractText(html);

  const systemPrompt = `Du bist ein App-Analyse-Experte. Analysiere den Inhalt einer Webseite und beschreibe detailliert, was für eine App oder Webseite das ist und welche Funktionen sie hat. Antworte ausschließlich mit einem JSON-Objekt in folgendem Format (kein Markdown, kein Text davor oder danach):
{
  "title": "kurzer prägnanter Projektname (auf Deutsch)",
  "description": "ausführliche Beschreibung was diese App kann, wie sie aussieht, welche Features sie hat und welches Ziel sie verfolgt — mindestens 3 Sätze auf Deutsch",
  "features": ["Feature 1", "Feature 2", "Feature 3", ...],
  "prompt": "detaillierter Prompt auf Deutsch (mindestens 200 Wörter) der an eine KI gegeben werden kann um genau so eine App nachzubauen — beschreibe Layout, Farben, Features, Interaktionen, Datenmodell, UI-Komponenten, alles was nötig ist"
}`;

  const userMsg = `Analysiere diese Webseite:

URL: ${url}
Seiten-Titel: ${pageTitle}
Meta-Beschreibung: ${metaDesc}

Seiten-Inhalt (extrahierter Text):
${bodyText}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    let result: { title: string; description: string; features: string[]; prompt: string };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Kein JSON gefunden");
      result = JSON.parse(jsonMatch[0]);
    } catch {
      req.log.warn({ raw }, "Failed to parse Claude response as JSON");
      res.status(422).json({ error: "KI-Analyse konnte nicht verarbeitet werden." });
      return;
    }

    res.json({
      title: result.title ?? pageTitle ?? "Neues Projekt",
      description: result.description ?? "",
      features: Array.isArray(result.features) ? result.features : [],
      prompt: result.prompt ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Claude analysis error");
    res.status(500).json({ error: "KI-Analyse fehlgeschlagen." });
  }
});

export default router;
