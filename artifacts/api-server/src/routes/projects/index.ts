import { Router, type IRouter } from "express";
import { eq, desc, count, isNotNull, and } from "drizzle-orm";
import { db, projectsTable, conversations as conversationsTable, messages as messagesTable, usersTable } from "@workspace/db";
import { getAIClient } from "@workspace/integrations-openai-ai-server";
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
      }).from(usersTable).where(eq(usersTable.id, req.user.id));
      const userKeys = {
        openaiApiKey: userRow?.openaiApiKey ?? null,
        groqApiKey: userRow?.groqApiKey ?? null,
        geminiApiKey: userRow?.geminiApiKey ?? null,
        openrouterApiKey: userRow?.openrouterApiKey ?? null,
      };
      const { client: aiClient, textModel, visionModel } = getAIClient(userKeys);

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

      const model = images.length > 0 ? visionModel : textModel;

      // ── STEP 1: Planning (only for new generation, not refinement) ──────────
      // The AI first creates a concise implementation plan before writing code.
      // This "think first" approach dramatically improves the final output quality.
      let implementationPlan = "";

      if (!isRefinement) {
        const planningMessages: ChatMsg[] = [
          {
            role: "system",
            content: `Du bist ein erfahrener Softwarearchitekt. Erstelle einen präzisen Implementierungsplan für eine Web-App.

Dein Plan soll enthalten:
1. ZWECK: Was macht die App (1-2 Sätze)
2. SCREENS/SEITEN: Welche Views/Bereiche gibt es
3. KOMPONENTEN: Wichtigste UI-Elemente und ihre Funktion
4. DATEN: Welche Beispieldaten werden benötigt (konkrete Beispiele)
5. DESIGN: Farbschema, Stil, besondere visuelle Elemente
6. TECHNOLOGIE: Welche CDN-Libraries sinnvoll sind (Chart.js, Alpine.js, etc.)

Antworte NUR mit dem Plan — kompakt, präzise, max. 300 Wörter.`,
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
            model,
            max_tokens: 800,
            temperature: 0.3,
            messages: planningMessages as Parameters<typeof aiClient.chat.completions.create>[0]["messages"],
            stream: true,
          });
          for await (const chunk of planStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) implementationPlan += delta;
          }
        } catch {
          // Planning step failed — continue without plan (still better than nothing)
          implementationPlan = "";
        }
      }

      // ── STEP 2: Code generation ───────────────────────────────────────────────
      const codeSystemPrompt = isRefinement
        ? `Du bist ein Elite-Webentwickler. Du hast bereits eine vollständige HTML-App generiert. Verfeinere sie präzise anhand der Nutzeranweisung.

AKTUELLE APP:
\`\`\`html
${currentHtml.slice(0, 55000)}
\`\`\`

REGELN:
- Setze JEDE Änderung vollständig um — kein Detail zu klein
- Behalte ALLE bestehenden Funktionen, außer wenn explizit anders gewünscht
- Verbessere Qualität, Performance und Aussehen wo möglich
- Wenn Bilder/Screenshots hochgeladen: Design EXAKT anpassen
- Gib die KOMPLETTE überarbeitete HTML-Datei zurück

OUTPUT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen.`
        : `Du bist ein Elite-Webentwickler und UI/UX-Designer. Setze den folgenden Plan als vollständige, professionelle Web-App in einer einzigen HTML-Datei um.

${implementationPlan ? `IMPLEMENTIERUNGSPLAN:\n${implementationPlan}\n\n` : ""}QUALITÄTSSTANDARDS — alle MÜSSEN erfüllt sein:
1. VOLLSTÄNDIGKEIT: Jede Funktion vollständig implementiert — kein "TODO", keine Platzhalter
2. DESIGN: Professionelles, modernes UI — sorgfältige Farben, Typographie, Hover-Effekte, Übergänge
3. FUNKTIONALITÄT: Alle Interaktionen funktionieren — Formulare, Navigation, Filter, Animationen
4. DATEN: Mindestens 10-15 realistische Beispieldatensätze — die App soll sofort lebendig wirken
5. RESPONSIVITÄT: Einwandfreies Layout auf Desktop, Tablet und Mobile
6. DETAILS: Hover-States, Lade-Animationen, Fehlerzustände, leere Zustände

TECHNISCHE VORGABEN:
- Einzelne HTML-Datei: CSS in <style>, JS in <script>
- CDN-Libraries nach Bedarf: Tailwind CSS, Chart.js, Alpine.js, Lucide Icons, Google Fonts, Animate.css
- Keine externen API-Aufrufe — alles client-seitig mit eingebetteten Mock-Daten
- Sprache: Deutsch (außer der Nutzer gibt explizit etwas anderes an)
- Umfang: So viel Code wie nötig — 800 bis 3000+ Zeilen

OUTPUT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen.`;

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

      const stream = await aiClient.chat.completions.create({
        model,
        max_tokens: 16000,
        temperature: 0.2,
        messages: codeMessages as Parameters<typeof aiClient.chat.completions.create>[0]["messages"],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) fullResponse += delta;
      }

      // Robust HTML extraction — handles code blocks, leading text, any wrapping
      let htmlCode = fullResponse.trim();

      // 1. If inside a code block, extract the content
      const codeBlockMatch = htmlCode.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/is);
      if (codeBlockMatch?.[1]) {
        htmlCode = codeBlockMatch[1].trim();
      }

      // 2. Find <!DOCTYPE html> and slice from there — ignores any leading explanation text
      const doctypeIdx = htmlCode.toLowerCase().indexOf("<!doctype html>");
      if (doctypeIdx > 0) {
        htmlCode = htmlCode.slice(doctypeIdx);
      }

      // 3. If still no DOCTYPE, try finding <html> as fallback
      if (!htmlCode.toLowerCase().startsWith("<!doctype") && !htmlCode.toLowerCase().startsWith("<html")) {
        const htmlTagIdx = htmlCode.toLowerCase().indexOf("<html");
        if (htmlTagIdx > 0) {
          htmlCode = htmlCode.slice(htmlTagIdx);
        }
      }

      htmlCode = htmlCode.trim();

      await db.insert(messagesTable).values({
        conversationId,
        role: "assistant",
        content: fullResponse,
      });

      await db
        .update(projectsTable)
        .set({ htmlCode, generationStatus: "done", updatedAt: new Date() })
        .where(eq(projectsTable.id, projectId));

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

export default router;
