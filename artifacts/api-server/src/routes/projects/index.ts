import { Router, type IRouter } from "express";
import { eq, desc, count, isNotNull, and, sql } from "drizzle-orm";
import { db, projectsTable, conversations as conversationsTable, messages as messagesTable, usersTable, projectVersionsTable } from "@workspace/db";
import { getAIClient, getSupportClient } from "@workspace/integrations-openai-ai-server";
import {
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  GenerateProjectParams,
  GenerateProjectBody,
  PublishProjectParams,
  PreviewProjectParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, req.user.id))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      userId: req.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      sourceUrl: parsed.data.sourceUrl ?? null,
    })
    .returning();

  res.status(201).json(project);
});

router.get("/projects/stats/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const userId = req.user.id;

  const [totalRow] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));
  const [publishedRow] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), eq(projectsTable.isPublished, true)));
  const [withCodeRow] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), isNotNull(projectsTable.htmlCode)));

  const recentProjects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(desc(projectsTable.updatedAt))
    .limit(5);

  res.json({
    total: Number(totalRow?.count ?? 0),
    published: Number(publishedRow?.count ?? 0),
    withCode: Number(withCodeRow?.count ?? 0),
    recentProjects,
  });
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, req.user.id)));

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.json(project);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, req.user.id)))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, req.user.id)))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.sendStatus(204);
});

router.get("/projects/:id/preview", async (req, res): Promise<void> => {
  const params = PreviewProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  // Unpublished projects: only the owner may preview them
  if (!project.isPublished) {
    if (!req.isAuthenticated() || req.user.id !== project.userId) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }
  }

  if (!project.htmlCode) {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Noch kein Code</title>
<style>
  body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh;
    background: #0f0f13; color: #888; font-family: system-ui, sans-serif; text-align: center; }
  .msg { max-width: 400px; }
  h2 { color: #ccc; margin-bottom: 8px; }
  p { font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="msg">
    <h2>Kein Code vorhanden</h2>
    <p>Gib eine Anweisung in den Chat ein, um deine App zu generieren.</p>
  </div>
</body>
</html>`);
    return;
  }

  res.setHeader("Content-Type", "text/html");
  res.send(project.htmlCode);
});

router.post("/projects/:id/generate", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const params = GenerateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = GenerateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, req.user.id)));

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  // Already generating — don't start a second job
  if (project.generationStatus === "generating") {
    res.status(202).json({ queued: true, status: "generating" });
    return;
  }

  // Mark as generating immediately so polling sees it
  await db
    .update(projectsTable)
    .set({ generationStatus: "generating", generationError: null, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id));

  // Return immediately — generation continues in the background
  res.status(202).json({ queued: true, status: "generating" });

  // ── Background job (runs after response is sent) ──────────────────────────
  const log = req.log;
  const { prompt, isRefinement, images = [] } = parsed.data;
  const projectId = project.id;
  const projectTitle = project.title;

  (async () => {
    try {
      const [userRow] = await db.select({
        openaiApiKey: usersTable.openaiApiKey,
        groqApiKey: usersTable.groqApiKey,
        geminiApiKey: usersTable.geminiApiKey,
        openrouterApiKey: usersTable.openrouterApiKey,
        mistralApiKey: usersTable.mistralApiKey,
        nvidiaApiKey: usersTable.nvidiaApiKey,
      }).from(usersTable).where(eq(usersTable.id, req.user.id));
      const userKeys = {
        openaiApiKey: userRow?.openaiApiKey ?? null,
        groqApiKey: userRow?.groqApiKey ?? null,
        geminiApiKey: userRow?.geminiApiKey ?? null,
        openrouterApiKey: userRow?.openrouterApiKey ?? null,
        mistralApiKey: userRow?.mistralApiKey ?? null,
        nvidiaApiKey: userRow?.nvidiaApiKey ?? null,
      };
      const { client: aiClient, textModel, visionModel, codeModel, provider } = getAIClient(userKeys);

      let conversationId = project.conversationId;

      if (!conversationId) {
        const [conv] = await db
          .insert(conversationsTable)
          .values({ title: projectTitle })
          .returning();
        conversationId = conv.id;
        await db
          .update(projectsTable)
          .set({ conversationId, updatedAt: new Date() })
          .where(eq(projectsTable.id, projectId));
      }

      // Save user message (text only) to conversation history
      await db.insert(messagesTable).values({
        conversationId,
        role: "user",
        content: prompt,
      });

      // Load full history (all but the just-inserted message will be context)
      const history = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(messagesTable.createdAt);

      // Current HTML (for refinement context)
      const currentHtml = project.htmlCode ?? "";

      type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Array<{ type: string; [k: string]: unknown }> };

      // Only include user messages as context — assistant messages contained full HTML (huge), skip them
      const previousMessages = history.slice(0, -1);
      const userHistory = previousMessages
        .filter((m) => m.role === "user")
        .map((m): ChatMsg => ({ role: "user", content: m.content }));

      const planModel = images.length > 0 ? visionModel : textModel;
      const genModel = images.length > 0 ? visionModel : codeModel;

      // ── STEP 1: Planning (only for new generation, not refinement) ──────────
      // The AI first creates a concise implementation plan before writing code.
      // This "think first" approach dramatically improves the final output quality.
      // For Pollinations/Mistral: planModel = reasoning model, genModel = code specialist
      let implementationPlan = "";

      if (!isRefinement) {
        const planningMessages: ChatMsg[] = [
          {
            role: "system",
            content: `Du bist ein erfahrener Softwarearchitekt und UI/UX-Experte. Erstelle einen konkreten, detaillierten Implementierungsplan für eine erstklassige Web-App.

Dein Plan MUSS enthalten:
1. ZWECK & KERNFUNKTIONEN: Was macht die App — alle wichtigen Features auflisten
2. LAYOUT-ENTSCHEIDUNG: Sidebar-Dashboard ODER Top-Nav-Portal ODER Single-Page — begründen
3. VIEWS/SEKTIONEN: Alle Bereiche/Tabs mit je 1-2 Sätzen Beschreibung
4. DATEN-BEISPIELE: Konkrete, realistische deutschsprachige Beispieldaten (Personen-Namen, Produktnamen, Städte etc.)
5. DESIGN-ENTSCHEIDUNG: Dark-Theme ODER Light-Theme — Hauptfarbe + Akzentfarbe konkret nennen (Hex-Codes)
6. CDN-LIBRARIES: Welche Libraries konkret verwendet werden und wofür (Chart.js für Liniendiagramm der Umsätze, etc.)
7. BESONDERE FEATURES: Animationen, Microinteractions, Filter-Logik, Suchfunktion

Antworte NUR mit dem Plan — strukturiert, präzise, max. 400 Wörter.`,
          },
          ...userHistory,
          ...(images.length > 0
            ? [{ role: "user" as const, content: [
                ...images.map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
                { type: "text" as const, text: prompt },
              ]}]
            : [{ role: "user" as const, content: prompt }]),
        ];

        try {
          const planStream = await aiClient.chat.completions.create({
            model: planModel,
            max_tokens: 800,
            temperature: 0.3,
            messages: planningMessages as Parameters<typeof aiClient.chat.completions.create>[0]["messages"],
            stream: true,
          });
          for await (const chunk of planStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) implementationPlan += delta;
          }
          // Strip think-tags from planning response too
          implementationPlan = implementationPlan
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
            .replace(/<think>[\s\S]*$/i, "")
            .trim();
          log.info({ provider, planModel, genModel }, "Planning step completed");
        } catch {
          // Planning step failed — continue without plan (still better than nothing)
          implementationPlan = "";
        }
      }

      // ── STEP 2: Code generation (uses specialized codeModel) ─────────────────
      const codeSystemPrompt = isRefinement
        ? `Du bist ein Senior Full-Stack-Entwickler und UI/UX-Experte der Extraklasse. Du hast bereits eine vollständige HTML-App generiert. Überarbeite sie jetzt präzise und mit höchster Sorgfalt anhand der Nutzeranweisung.

AKTUELLE APP:
\`\`\`html
${currentHtml.slice(0, 55000)}
\`\`\`

ÜBERARBEITUNGSREGELN:
- Setze JEDE gewünschte Änderung vollständig und fehlerfrei um
- Behalte ALLE bestehenden Funktionen, Daten und Designs — außer explizit geändert
- Verbessere dabei aktiv: Animationen verfeinern, Hover-States ergänzen, Code optimieren
- Wenn Bilder/Screenshots beigefügt: Design pixelgenau anpassen
- Keine Regressions — alles was vorher funktionierte, muss weiter funktionieren
- Gib die KOMPLETTE überarbeitete HTML-Datei zurück — niemals nur Ausschnitte

OUTPUT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Kommentare, KEINE Erklärungen.`
        : `Du bist ein weltklasse Frontend-Entwickler und UI/UX-Designer. Deine Aufgabe: Erstelle eine atemberaubend schöne, vollständig funktionierende Web-App als einzelne HTML-Datei — auf dem Niveau professioneller SaaS-Produkte.

${implementationPlan ? `IMPLEMENTIERUNGSPLAN:\n${implementationPlan}\n\n` : ""}═══════════════════════════════════════════
DESIGN-STANDARD (PFLICHT — jeder Punkt muss erfüllt sein)
═══════════════════════════════════════════

VISUELLES DESIGN:
• Konsistentes Farbsystem mit CSS Custom Properties (--primary, --bg, --surface, --text, --border, --accent)
• Entweder elegantes dunkles Theme (bg: #0f1117 / #1a1d27) ODER frisches helles Theme — je nach App-Typ
• Glassmorphism für Karten: background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08)
• Schöne Farbverläufe: gradient backgrounds für Hero-Bereiche, Buttons, Highlights
• Typographie: Google Fonts einbinden (Inter, Poppins oder Outfit — nach App-Typ wählen)
• Klare visuelle Hierarchie: Headlines groß & fett, Body lesbar, Labels klein & dezent
• Icons: Lucide Icons CDN für alle Icons (<i data-lucide="name"></i>, lucide.createIcons() am Ende)

LAYOUT & STRUKTUR:
• Sidebar-Navigation (240px breit, collapsible) für alle Dashboard/Management-Apps
• Top-Navigation mit Logo + Suchfeld + User-Avatar für Portal-Apps
• CSS Grid für Karten-Layouts, Flexbox für Zeilen und Toolbar-Elemente
• Responsive: mobile-first, Breakpoints bei 768px und 1024px
• Consistent spacing: 4px-Raster (8, 12, 16, 24, 32, 48px)

ANIMATIONEN & INTERAKTIONEN (PFLICHT):
• Page-Load: Karten erscheinen mit fadeInUp (0.3s, 50ms staggered delay pro Element)
• Hover-Effekte: alle klickbaren Elemente — transform: translateY(-2px), box-shadow wächst, background ändert sich
• Buttons: scale(0.97) on click (active state), smooth 0.15s transition
• Sidebar active state: animierter linker Balken (::before pseudo-element), background highlight
• Smooth Scroll, smooth Farbübergänge (transition: all 0.2s ease auf fast allen Elementen)
• Modale/Overlays: opacity + transform fade-in (0.25s)
• Loading-Spinner für async-artige Aktionen

KOMPONENTEN-QUALITÄT:
• Suchfelder: live-filter der Daten per JavaScript (kein Submit nötig)
• Tabellen: sortierbar per Klick auf Header, zebra-striping, hover-Highlight
• Formulare: inline Validierung mit visuellen Fehlermeldungen, Erfolgs-Feedback
• Buttons: primär (filled), sekundär (outlined), gefährlich (rot) — alle mit Icons
• Badges/Tags: Statusindikatoren mit Farb-Codierung (grün/gelb/rot/blau)
• Notifications/Toast: oben rechts einblendende Benachrichtigungen bei Aktionen
• Empty States: schöne Illustration (SVG inline) wenn keine Daten vorhanden
• Tooltips: erscheinen bei Hover über Buttons/Icons

═══════════════════════════════════════════
TECHNISCHE VORGABEN
═══════════════════════════════════════════

PFLICHT-CDN-LIBRARIES (immer einbinden wenn sinnvoll):
\`\`\`html
<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<!-- Lucide Icons -->
<script src="https://unpkg.com/lucide@latest"></script>
<!-- Chart.js (für Diagramme) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Alpine.js (optional, für reaktive UI ohne Vue/React) -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
\`\`\`

DATEN-ANFORDERUNGEN:
• Mindestens 15-25 realistische, deutschsprachige Datensätze — Namen, Städte, Produkte etc.
• Daten sollen sofort die Stärken der App demonstrieren (verschiedene Stati, Kategorien, Zeiträume)
• Bei Diagrammen: mehrere Datenpunkte über 6-12 Monate

ARCHITEKTUR:
• Einzelne HTML-Datei: CSS in <style> im <head>, JavaScript in <script> vor </body>
• State-Management in einem zentralen JS-Objekt (let state = { ... })
• Render-Funktionen: renderApp() und spezifische render*() Funktionen
• Event-Listener nach dem initialen render() setzen
• Keine externen API-Aufrufe — alles client-seitig mit eingebetteten Mock-Daten
• localStorage nutzen wo sinnvoll (Einstellungen, Favoriten)

VOLLSTÄNDIGKEIT:
• Jede Funktion vollständig implementiert — KEIN "TODO", KEIN "// implement later"
• Alle UI-Elemente klickbar und mit sinnvoller Reaktion verbunden
• Formularabsendung mit Validierung und Bestätigungsmeldung
• Mindestens 2-3 verschiedene "Views" oder Sektionen navigierbar

SPRACHE: Deutsch (außer der Nutzer gibt explizit etwas anderes an)
UMFANG: 1000 bis 4000+ Zeilen — lieber zu viel als zu wenig

OUTPUT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen davor oder danach.`;

      const codeMessages: ChatMsg[] = [
        { role: "system", content: codeSystemPrompt },
        ...userHistory,
        ...(images.length > 0
          ? [{ role: "user" as const, content: [
              ...images.map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
              { type: "text" as const, text: prompt },
            ]}]
          : [{ role: "user" as const, content: prompt }]),
      ];

      let fullResponse = "";
      let providerNote = ""; // Set when auto-fallback fires — shown to the user in chat

      type FallbackEntry = { client: typeof aiClient; model: string; name: string; isPollinations: boolean };
      const fallbackChain: FallbackEntry[] = [];

      // Primary provider first
      fallbackChain.push({ client: aiClient, model: genModel, name: provider, isPollinations: provider === "pollinations" });

      // Add remaining providers with keys as fallbacks (skip primary)
      const candidateFallbacks = [
        { keyVal: userKeys.openrouterApiKey, keyName: "openrouter" as const },
        { keyVal: userKeys.groqApiKey, keyName: "groq" as const },
        { keyVal: userKeys.geminiApiKey, keyName: "gemini" as const },
        { keyVal: userKeys.openaiApiKey, keyName: "openai" as const },
        { keyVal: userKeys.nvidiaApiKey, keyName: "nvidia" as const },
        { keyVal: userKeys.mistralApiKey, keyName: "mistral" as const },
      ];
      for (const cand of candidateFallbacks) {
        if (cand.keyName === provider || !cand.keyVal) continue;
        try {
          const partialKeys: typeof userKeys = {
            openrouterApiKey: cand.keyName === "openrouter" ? cand.keyVal : null,
            groqApiKey: cand.keyName === "groq" ? cand.keyVal : null,
            geminiApiKey: cand.keyName === "gemini" ? cand.keyVal : null,
            openaiApiKey: cand.keyName === "openai" ? cand.keyVal : null,
            nvidiaApiKey: cand.keyName === "nvidia" ? cand.keyVal : null,
            mistralApiKey: cand.keyName === "mistral" ? cand.keyVal : null,
          };
          const fb = getAIClient(partialKeys);
          fallbackChain.push({ client: fb.client, model: fb.codeModel, name: cand.keyName, isPollinations: false });
        } catch { /* skip */ }
      }
      // Always add Pollinations as last resort — three models for reliability
      const support = getSupportClient();
      if (provider !== "pollinations") {
        for (const polModel of ["openai", "mistral", "deepseek"] as const) {
          fallbackChain.push({ client: support.client, model: polModel, name: "pollinations", isPollinations: true });
        }
      } else {
        // Primary IS pollinations — still try all three models
        fallbackChain.push({ client: support.client, model: "mistral", name: "pollinations", isPollinations: true });
        fallbackChain.push({ client: support.client, model: "deepseek", name: "pollinations", isPollinations: true });
      }

      const runGeneration = async (entry: FallbackEntry): Promise<string> => {
        if (entry.isPollinations) {
          // Pollinations legacy API does NOT support SSE streaming reliably.
          // Use plain JSON POST instead — more reliable for long responses.
          const sysPrompt = typeof codeMessages[0]?.content === "string"
            ? codeMessages[0].content.slice(0, 2500)
            : "";
          const userParts = codeMessages.slice(1).map(m =>
            typeof m.content === "string" ? m.content : JSON.stringify(m.content)
          ).join("\n");
          const body = JSON.stringify({
            model: entry.model,
            max_tokens: 8192,
            temperature: 0.2,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: userParts.slice(0, 4000) },
            ],
          });
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 90_000);
          let text = "";
          try {
            const res = await fetch("https://text.pollinations.ai/openai", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              signal: ctrl.signal,
            });
            clearTimeout(t);
            if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
            // May return either JSON or SSE — handle both
            const raw = await res.text();
            // Try SSE parsing first
            if (raw.includes("data: {")) {
              for (const line of raw.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === "[DONE]") break;
                try {
                  const chunk = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> };
                  const delta = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? "";
                  if (delta) text += delta;
                } catch { /* skip malformed chunk */ }
              }
            } else {
              // Plain JSON response
              try {
                const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
                text = json.choices?.[0]?.message?.content ?? "";
              } catch {
                text = raw;
              }
            }
          } finally {
            clearTimeout(t);
          }
          if (!text.trim()) throw new Error(`Pollinations ${entry.model} returned empty response`);
          return text;
        }

        // Non-Pollinations: standard OpenAI streaming
        const stream = await entry.client.chat.completions.create({
          model: entry.model,
          max_tokens: 16000,
          temperature: 0.2,
          messages: codeMessages as Parameters<typeof entry.client.chat.completions.create>[0]["messages"],
          stream: true,
        });
        let text = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) text += delta;
        }
        if (!text.trim()) throw new Error(`Provider ${entry.model} returned empty response`);
        return text;
      };

      let lastError: unknown = null;
      for (const entry of fallbackChain) {
        try {
          log.info({ provider: entry.name, model: entry.model }, "Attempting generation");
          fullResponse = await runGeneration(entry);
          if (entry.name !== provider) {
            providerNote = `⚠️ **Automatischer Anbieterwechsel:** Primärer Anbieter (${provider}) schlug fehl — erfolgreich mit **${entry.name}** generiert.`;
          }
          break;
        } catch (err: unknown) {
          const errStatus = (err as { status?: number })?.status;
          const errMsg = err instanceof Error ? err.message : String(err);
          log.warn({ provider: entry.name, model: entry.model, errStatus, errMsg }, "Provider failed, trying next");
          lastError = err;
        }
      }

      if (!fullResponse && lastError) {
        throw lastError;
      }

      // Robust HTML extraction — handles code blocks, <think> tags, leading text, any wrapping
      let htmlCode = fullResponse.trim();

      // 0. Strip reasoning/thinking blocks from all known reasoning models
      // qwen3-coder uses <think>...</think>, deepseek uses <think>, some use <thinking>
      htmlCode = htmlCode.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      htmlCode = htmlCode.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
      // Strip incomplete <think> at end (if model was cut off mid-thinking)
      htmlCode = htmlCode.replace(/<think>[\s\S]*$/i, "").trim();

      // 1. If inside a code block, extract the content
      const codeBlockMatch = htmlCode.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/is);
      if (codeBlockMatch?.[1]) {
        htmlCode = codeBlockMatch[1].trim();
      }

      // 2. Find <!DOCTYPE html> and slice from there — ignores any leading explanation text
      const doctypeIdx = htmlCode.toLowerCase().indexOf("<!doctype html>");
      if (doctypeIdx >= 0) {
        htmlCode = htmlCode.slice(doctypeIdx);
      }

      // 3. If still no DOCTYPE, try finding <html> as fallback
      if (!htmlCode.toLowerCase().startsWith("<!doctype") && !htmlCode.toLowerCase().startsWith("<html")) {
        const htmlTagIdx = htmlCode.toLowerCase().indexOf("<html");
        if (htmlTagIdx >= 0) {
          htmlCode = htmlCode.slice(htmlTagIdx);
        }
      }

      htmlCode = htmlCode.trim();

      // ── STEP 3: Support-KI Review (immer aktiv, kostenlos via Pollinations) ──
      // Wenn der primäre Provider NICHT Pollinations ist, nutze Pollinations als
      // zweite Meinung — findet Bugs, ergänzt fehlende Details, poliert die Qualität.
      if (provider !== "pollinations" && htmlCode.length > 200) {
        try {
          const { client: supportClient, codeReviewModel } = getSupportClient();
          let reviewedResponse = "";

          const reviewStream = await supportClient.chat.completions.create({
            model: codeReviewModel,
            max_tokens: 16000,
            temperature: 0.15,
            stream: true,
            messages: [
              {
                role: "system",
                content: `Du bist ein Elite-Code-Reviewer für Web-Apps. Du erhältst eine HTML-App und verbesserst sie.

DEINE AUFGABE:
- Finde und korrigiere alle Bugs, JavaScript-Fehler und CSS-Probleme
- Stelle sicher dass alle Funktionen vollständig implementiert sind (keine TODOs, keine Platzhalter)
- Verbessere das Design, die Animationen und Hover-Effekte wo möglich
- Füge fehlende Beispieldaten oder Inhalte hinzu
- Optimiere die Responsivität für Mobile

WICHTIG: Ändere NICHT den grundlegenden Zweck oder das Design — verbessere nur die Ausführung.

OUTPUT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen.`,
              },
              {
                role: "user",
                content: `Überprüfe und verbessere diese HTML-App:\n\n${htmlCode.slice(0, 55000)}`,
              },
            ],
          });

          for await (const chunk of reviewStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) reviewedResponse += delta;
          }

          // Extract HTML from review response
          let reviewedHtml = reviewedResponse.trim();
          const reviewBlockMatch = reviewedHtml.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/is);
          if (reviewBlockMatch?.[1]) reviewedHtml = reviewBlockMatch[1].trim();
          const reviewDoctypeIdx = reviewedHtml.toLowerCase().indexOf("<!doctype html>");
          if (reviewDoctypeIdx > 0) reviewedHtml = reviewedHtml.slice(reviewDoctypeIdx);
          reviewedHtml = reviewedHtml.trim();

          // Only use the review if it returned valid HTML that's not empty
          if (reviewedHtml.length > 500 && reviewedHtml.toLowerCase().includes("</html>")) {
            htmlCode = reviewedHtml;
            log.info({ codeReviewModel }, "Support-KI Review completed — using improved version");
          }
        } catch (reviewErr) {
          // Review failed — use original code, no problem
          log.warn({ err: reviewErr }, "Support-KI Review skipped (error)");
        }
      }

      // Validate that we actually have HTML — don't overwrite previous htmlCode with empty/invalid content
      const isValidHtml = htmlCode.length > 100 && (
        htmlCode.toLowerCase().includes("<!doctype html>") ||
        htmlCode.toLowerCase().includes("<html")
      );

      log.info({ projectId, provider, htmlLength: htmlCode.length, isValidHtml }, "Saving generated code");

      if (!isValidHtml) {
        log.warn({ projectId, provider, htmlLength: htmlCode.length, preview: htmlCode.slice(0, 200) }, "HTML extraction failed — keeping previous htmlCode");
        await db
          .update(projectsTable)
          .set({ generationStatus: "error", generationError: "KI hat keinen gültigen HTML-Code zurückgegeben. Bitte erneut versuchen.", updatedAt: new Date() })
          .where(eq(projectsTable.id, projectId));
        return;
      }

      // Extract only the analysis/explanation text before the HTML — don't store the full HTML in messages
      // (HTML is already saved in projectsTable.htmlCode)
      const htmlStartIdx = fullResponse.search(/<!doctype html>/i);
      const analysisText = htmlStartIdx > 0 ? fullResponse.slice(0, htmlStartIdx).trim() : "";
      // Combine provider error note (if fallback fired) with any analysis text from the AI
      const messageContent = [providerNote, analysisText].filter(Boolean).join("\n\n");

      await db.insert(messagesTable).values({
        conversationId,
        role: "assistant",
        content: messageContent,
      });

      await db
        .update(projectsTable)
        .set({ htmlCode, generationStatus: "done", updatedAt: new Date() })
        .where(eq(projectsTable.id, projectId));

      // Save version snapshot for history
      try {
        const [maxRow] = await db
          .select({ maxVer: sql<number>`COALESCE(MAX(${projectVersionsTable.versionNumber}), 0)` })
          .from(projectVersionsTable)
          .where(eq(projectVersionsTable.projectId, projectId));
        await db.insert(projectVersionsTable).values({
          projectId,
          versionNumber: (maxRow?.maxVer ?? 0) + 1,
          htmlCode,
          prompt,
        });
      } catch (vErr) {
        log.warn({ err: vErr }, "Version snapshot save failed (non-critical)");
      }

    } catch (err) {
      log.error({ err }, "Background generation error");
      await db
        .update(projectsTable)
        .set({ generationStatus: "error", generationError: String(err instanceof Error ? err.message : err), updatedAt: new Date() })
        .where(eq(projectsTable.id, projectId));
    }
  })();
});

router.post("/projects/:id/publish", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  const params = PublishProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, req.user.id)));

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  const publishedUrl = `/api/projects/${project.id}/preview`;

  const [updated] = await db
    .update(projectsTable)
    .set({ isPublished: true, publishedUrl, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id))
    .returning();

  res.json(updated);
});

router.get("/projects/:id/versions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.user.id)));
  if (!project) { res.status(404).json({ error: "Projekt nicht gefunden" }); return; }

  const versions = await db.select({
    id: projectVersionsTable.id,
    versionNumber: projectVersionsTable.versionNumber,
    prompt: projectVersionsTable.prompt,
    createdAt: projectVersionsTable.createdAt,
  }).from(projectVersionsTable)
    .where(eq(projectVersionsTable.projectId, projectId))
    .orderBy(desc(projectVersionsTable.versionNumber));

  res.json(versions);
});

router.post("/projects/:id/versions/:versionId/restore", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const projectId = parseInt(req.params.id, 10);
  const versionId = parseInt(req.params.versionId, 10);
  if (isNaN(projectId) || isNaN(versionId)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.user.id)));
  if (!project) { res.status(404).json({ error: "Projekt nicht gefunden" }); return; }

  const [version] = await db.select().from(projectVersionsTable)
    .where(and(eq(projectVersionsTable.id, versionId), eq(projectVersionsTable.projectId, projectId)));
  if (!version) { res.status(404).json({ error: "Version nicht gefunden" }); return; }

  const [updated] = await db.update(projectsTable)
    .set({ htmlCode: version.htmlCode, generationStatus: "done", updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId))
    .returning();

  res.json(updated);
});

export default router;
