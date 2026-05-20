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

        // Try planning with multiple models — 429 on first → silently retry next
        const planModelsToTry = [planModel];
        if (provider === "openrouter") {
          // Add fallback planning models so rate limits don't skip planning
          for (const m of [
            "meta-llama/llama-3.3-70b-instruct:free",
            "google/gemini-2.0-flash-exp:free",
            "nousresearch/hermes-3-llama-3.1-405b:free",
          ]) {
            if (m !== planModel) planModelsToTry.push(m);
          }
        }
        for (const tryModel of planModelsToTry) {
          try {
            const planStream = await aiClient.chat.completions.create({
              model: tryModel,
              max_tokens: 800,
              temperature: 0.3,
              messages: planningMessages as Parameters<typeof aiClient.chat.completions.create>[0]["messages"],
              stream: true,
            });
            let planText = "";
            for await (const chunk of planStream) {
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) planText += delta;
            }
            implementationPlan = planText
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
              .replace(/<think>[\s\S]*$/i, "")
              .trim();
            log.info({ provider, planModel: tryModel, genModel }, "Planning step completed");
            break; // success — stop trying
          } catch (planErr) {
            const planErrStatus = (planErr as { status?: number })?.status;
            log.warn({ model: tryModel, status: planErrStatus }, "Planning model failed, trying next");
            // Continue to next model
          }
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
        : `Du bist ein Experten-Team aus Senior Frontend-Entwickler, UI/UX-Designer und Produktarchitekt. Deine Mission: Baue eine vollständig funktionsfähige, professionelle Web-App als einzelne HTML-Datei — auf dem absoluten Niveau von Figma, Linear, Notion oder Vercel Dashboard.

${implementationPlan ? `══════════════════════════════════════════\nDEIN IMPLEMENTIERUNGSPLAN (exakt umsetzen):\n${implementationPlan}\n══════════════════════════════════════════\n\n` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHRITT 1: CSS-FUNDAMENT (immer diese Basis verwenden)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Starte den <style>-Block IMMER mit diesem Fundament und erweitere es:

\`\`\`css
/* 1. Imports */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

/* 2. Farb-Tokens */
:root {
  /* Hauptfarben — je nach App wählen: */
  /* Dunkel: */ --bg: #0f1117; --surface: #1a1d27; --surface2: #242836; --border: rgba(255,255,255,0.08);
  /* ODER Hell: */ /* --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9; --border: rgba(0,0,0,0.08); */
  
  --primary: #6366f1;       /* Akzentfarbe — an App anpassen (cyan: #06b6d4, grün: #10b981, etc.) */
  --primary-hover: #4f46e5;
  --primary-glow: rgba(99,102,241,0.15);
  --text: #f1f5f9;          /* oder #0f172a für helles Theme */
  --text-muted: #64748b;
  --text-dim: #94a3b8;
  --success: #10b981; --warning: #f59e0b; --danger: #ef4444; --info: #3b82f6;
  --radius: 12px; --radius-sm: 8px; --radius-lg: 16px;
  --shadow: 0 4px 24px rgba(0,0,0,0.3);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.15);
  --shadow-glow: 0 0 40px var(--primary-glow);
}

/* 3. Reset + Base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh; }
a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; border: none; background: none; }
input, textarea, select { font-family: inherit; outline: none; }

/* 4. Animationen — PFLICHT */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.fade-in    { animation: fadeIn 0.3s ease; }
.fade-in-up { animation: fadeInUp 0.4s ease both; }
.scale-in   { animation: scaleIn 0.25s ease both; }

/* 5. Universelle Transition */
* { transition: color 0.15s, background-color 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s; }
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHRITT 2: LAYOUT-PATTERN (exakt eines wählen)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PATTERN A — Sidebar Dashboard** (für Verwaltungs-, Analyse-, CRM-Apps):
\`\`\`html
<div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-logo"><!-- Logo + Name --></div>
    <nav class="sidebar-nav"><!-- Nav-Links mit Icons --></nav>
    <div class="sidebar-footer"><!-- User-Avatar + Logout --></div>
  </aside>
  <div class="main-area">
    <header class="topbar"><!-- Suchfeld + Aktions-Buttons + Notifications --></header>
    <main class="content" id="main-content"><!-- dynamisch befüllt --></main>
  </div>
</div>
\`\`\`

**PATTERN B — Top-Nav App** (für Tools, Rechner, Formulare, Spiele, Single-Feature-Apps):
\`\`\`html
<header class="navbar"><!-- Logo + Nav-Links + User-Menu --></header>
<main class="page-content"><!-- Sections/Views --></main>
\`\`\`

Sidebar-CSS-Basis (für Pattern A):
\`\`\`css
.app-shell { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: 240px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-nav a { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: var(--radius-sm); color: var(--text-muted); font-size: 14px; font-weight: 500; position: relative; }
.sidebar-nav a:hover { background: var(--surface2); color: var(--text); }
.sidebar-nav a.active { background: var(--primary-glow); color: var(--primary); }
.sidebar-nav a.active::before { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 3px; background: var(--primary); border-radius: 0 4px 4px 0; }
.main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.topbar { height: 60px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 24px; gap: 12px; flex-shrink: 0; }
.content { flex: 1; overflow-y: auto; padding: 28px; }
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHRITT 3: KOMPONENTEN (genaue Muster benutzen)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Karte:**
\`\`\`css
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-sm); }
.card:hover { border-color: rgba(255,255,255,0.15); box-shadow: var(--shadow); transform: translateY(-2px); }
\`\`\`

**Button-System:**
\`\`\`css
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 500; }
.btn:active { transform: scale(0.97); }
.btn-primary { background: var(--primary); color: #fff; box-shadow: 0 0 20px var(--primary-glow); }
.btn-primary:hover { background: var(--primary-hover); box-shadow: 0 0 30px var(--primary-glow); }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.btn-danger { background: rgba(239,68,68,0.15); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }
\`\`\`

**Badge/Status:**
\`\`\`css
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.badge-green { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
.badge-yellow { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
.badge-red { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.badge-blue { background: rgba(59,130,246,0.12); color: #3b82f6; border: 1px solid rgba(59,130,246,0.2); }
\`\`\`

**Toast-Notifications:**
\`\`\`js
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = \`toast toast-\${type}\`;
  t.innerHTML = \`<span>\${type==='success'?'✓':type==='error'?'✗':'ℹ'}</span> \${msg}\`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
\`\`\`
\`\`\`css
#toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
.toast { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 14px; box-shadow: var(--shadow); transform: translateX(120%); transition: transform 0.3s ease; max-width: 320px; }
.toast.show { transform: translateX(0); }
.toast-success { border-left: 3px solid var(--success); }
.toast-error { border-left: 3px solid var(--danger); }
\`\`\`

**Modal:**
\`\`\`css
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px; width: 90%; max-width: 500px; box-shadow: var(--shadow); animation: scaleIn 0.2s ease; }
\`\`\`

**Suche (live-filter):**
\`\`\`css
.search-box { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 14px; }
.search-box input { background: none; border: none; color: var(--text); font-size: 14px; width: 100%; }
.search-box:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }
\`\`\`

**KPI-Stat-Karten (3-4 in einer Reihe):**
\`\`\`html
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Gesamtumsatz</div>
    <div class="stat-value">€ 48.290</div>
    <div class="stat-delta positive">↑ +12,4% ggü. Vormonat</div>
  </div>
</div>
\`\`\`
\`\`\`css
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--text); }
.stat-delta { font-size: 12px; margin-top: 6px; }
.stat-delta.positive { color: var(--success); }
.stat-delta.negative { color: var(--danger); }
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHRITT 4: JAVASCRIPT-ARCHITEKTUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`\`\`js
// Zentrale App-State
const state = {
  currentView: 'dashboard',
  searchQuery: '',
  filter: 'all',
  sortBy: 'date',
  data: [...], // alle Datensätze
};

// Router / Navigation
function navigate(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  renderContent();
}

// Haupt-Render
function renderContent() {
  const el = document.getElementById('main-content');
  el.innerHTML = views[state.currentView]();
  // Staggered fade-in für Listenelemente
  el.querySelectorAll('.card, .list-item, tr').forEach((c, i) => {
    c.style.animationDelay = i * 40 + 'ms';
    c.classList.add('fade-in-up');
  });
  lucide.createIcons(); // Icons neu initialisieren
  attachListeners();    // Event-Listener neu setzen
}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHRITT 5: CDN-LIBRARIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Immer einbinden (was passt):
\`\`\`html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
\`\`\`
Icons: <i data-lucide="NAME"></i> — nach render() IMMER lucide.createIcons() aufrufen!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PFLICHT-CHECKLISTE — vor Output prüfen:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☑ Sidebar oder Top-Nav vorhanden und voll funktional (min. 3-4 Navigationspunkte)
☑ Mindestens 20 realistische Datensätze auf Deutsch (echte Namen, Orte, Produkte)
☑ KPI-Stat-Karten auf der Hauptseite mit echten Zahlen und Trend-Indikatoren
☑ Live-Suchfunktion filtert Daten ohne Seitenneuladen
☑ Mindestens ein Chart (Chart.js) mit echten Datenpunkten über mehrere Monate
☑ Hover-Effekte auf ALLEN klickbaren Elementen
☑ Staggered fadeInUp-Animation beim Rendern von Listen/Karten
☑ Toast-Notification bei jeder Benutzeraktion (Speichern, Löschen, etc.)
☑ Mindestens ein Modal/Dialog (für Erstellen, Bearbeiten oder Bestätigen)
☑ Formular mit inline Validierung und Erfolgs-Feedback
☑ Aktiver Zustand in Navigation mit visueller Markierung
☑ Lucide Icons überall (keine Text-Icons oder Emojis)
☑ Leerezustand (Empty State) mit Illustration wenn keine Daten
☑ KEIN "TODO", KEIN Platzhalter, KEINE unvollständige Funktion
☑ lucide.createIcons() nach jedem render() aufgerufen

SPRACHE: Deutsch (außer explizit anders gewünscht)
UMFANG: 1200–5000+ Zeilen — schreibe alles aus, kürze nichts ab!

OUTPUT: Nur reines HTML, direkt mit <!DOCTYPE html> beginnend. KEIN Markdown. KEINE Erklärung.`;

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

      // ── OpenRouter multi-model fallback ─────────────────────────────────────
      // When the primary OpenRouter model is rate-limited (429), automatically
      // try the other top-tier free models before falling back to Pollinations.
      // This prevents 429 errors from ever reaching the user.
      const activeOpenRouterKey = userKeys.openrouterApiKey ?? process.env["OPENROUTER_API_KEY"] ?? null;
      if (activeOpenRouterKey && provider === "openrouter") {
        const orClient = aiClient; // reuse — same client, different models
        // Best free code models on OpenRouter, ordered by quality:
        const orFallbackModels = [
          "deepseek/deepseek-r1:free",                    // DeepSeek R1 — reasoning, excellent code
          "qwen/qwen3-235b-a22b:free",                    // Qwen3 235B — top code model
          "google/gemini-2.0-flash-exp:free",             // Gemini Flash — fast, high quality
          "nousresearch/hermes-3-llama-3.1-405b:free",   // Hermes 405B — reliable fallback
          "meta-llama/llama-3.3-70b-instruct:free",      // Llama 3.3 70B — last resort free
        ].filter(m => m !== genModel); // skip if it's already the primary
        for (const m of orFallbackModels) {
          fallbackChain.push({ client: orClient, model: m, name: "openrouter", isPollinations: false });
        }
      }

      // Add remaining providers with personal API keys as fallbacks (skip primary)
      const candidateFallbacks = [
        { keyVal: userKeys.groqApiKey, keyName: "groq" as const },
        { keyVal: userKeys.geminiApiKey, keyName: "gemini" as const },
        { keyVal: userKeys.openaiApiKey, keyName: "openai" as const },
        { keyVal: userKeys.nvidiaApiKey, keyName: "nvidia" as const },
        { keyVal: userKeys.mistralApiKey, keyName: "mistral" as const },
      ];
      for (const cand of candidateFallbacks) {
        if (!cand.keyVal) continue;
        try {
          const partialKeys: typeof userKeys = {
            openrouterApiKey: null,
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
      // Pollinations as absolute last resort — only reached if ALL OpenRouter models fail
      const support = getSupportClient();
      if (provider !== "pollinations") {
        for (const polModel of ["openai", "mistral"] as const) {
          fallbackChain.push({ client: support.client, model: polModel, name: "pollinations", isPollinations: true });
        }
      } else {
        fallbackChain.push({ client: support.client, model: "mistral", name: "pollinations", isPollinations: true });
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
