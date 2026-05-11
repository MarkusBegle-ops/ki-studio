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

      const systemPrompt = isRefinement
        ? `Du bist ein Elite-Webentwickler. Du hast bereits eine vollständige HTML-App generiert und sollst sie nun präzise verfeinern.

WICHTIGE REGELN:
- Setze JEDE Änderung vollständig um — kein Detail ist zu klein
- Behalte ALLE bestehenden Funktionen bei, es sei denn, der Nutzer möchte explizit etwas entfernen
- Verbessere gleichzeitig Qualität, Performance und Aussehen wo möglich
- Wenn Bilder/Screenshots als Referenz hochgeladen wurden, passe das Design EXAKT daran an — gleiche Farben, Schriften, Layout, Abstände, Elemente
- Gib die KOMPLETTE, überarbeitete HTML-Datei zurück — niemals nur Teile oder Snippets

OUTPUT-FORMAT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen, KEINE Codeblöcke.`
        : `Du bist ein Elite-Webentwickler und UI/UX-Designer. Erstelle eine professionelle, vollständige Web-App als einzelne HTML-Datei.

DEINE KERNAUFGABE: Setze ALLES um was der Nutzer beschreibt — bis ins kleinste Detail, vollständig ausgearbeitet, keine Abkürzungen, keine Platzhalter.

QUALITÄTSSTANDARDS (alle MÜSSEN erfüllt sein):
1. VOLLSTÄNDIGKEIT: Jede beschriebene Funktion muss vollständig implementiert sein. Kein "TODO", kein "coming soon", keine Platzhalter
2. DESIGN: Modernes, professionelles UI — schöne Farben, saubere Typographie, durchdachte Abstände, Hover-Effekte, Transitions, Animationen
3. FUNKTIONALITÄT: Alle Interaktionen müssen funktionieren — Formulare, Klicks, Navigation, Filter, Suche, alles
4. DATENMENGE: Füge realistische Beispieldaten ein (mind. 10-20 Einträge wo sinnvoll), damit die App sofort lebendig wirkt
5. RESPONSIVITÄT: Perfektes Layout auf Desktop, Tablet und Mobile
6. DETAILS: Hover-States, aktive Zustände, Ladeanimationen, Error-States, leere Zustände — alles ausgearbeitet
7. CODE-QUALITÄT: Sauberer, gut strukturierter Code mit vollständigem CSS und JavaScript

TECHNISCHE VORGABEN:
- Eine einzige HTML-Datei mit allem eingebettet (CSS in <style>, JS in <script>)
- Externe CDN-Bibliotheken erlaubt und erwünscht (Chart.js, Alpine.js, Lucide Icons, Google Fonts, Animate.css, usw.)
- Keine externen API-Aufrufe — alles client-seitig mit realistischen Mock-Daten
- Sprache: Deutsch (außer der Nutzer gibt etwas anderes an)

WENN BILDER/SCREENSHOTS hochgeladen wurden:
- Analysiere das Design GENAU — Farben (exakte Hex-Codes), Schriften, Layout, Abstände, Icons, Struktur
- Reproduziere das Aussehen so präzise wie möglich
- Füge alle sichtbaren Elemente und Funktionen ein

UMFANG: Schreibe so viel Code wie nötig — 500, 1000, 2000+ Zeilen wenn das zur Vollständigkeit beiträgt. Qualität geht vor Kürze.

OUTPUT-FORMAT: Nur reines HTML, direkt startend mit <!DOCTYPE html>, KEIN Markdown, KEINE Erklärungen, KEINE Codeblöcke.`;

      type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Array<{ type: string; [k: string]: unknown }> };

      const previousMessages = history.slice(0, -1);
      const chatMessages: ChatMsg[] = [
        { role: "system", content: systemPrompt },
        ...previousMessages.map((m): ChatMsg => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      if (images.length > 0) {
        chatMessages.push({
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mediaType};base64,${img.data}` },
            })),
            { type: "text" as const, text: prompt },
          ],
        });
      } else {
        chatMessages.push({ role: "user", content: prompt });
      }

      let fullResponse = "";

      const model = images.length > 0 ? visionModel : textModel;
      const stream = await aiClient.chat.completions.create({
        model,
        max_tokens: 16000,
        messages: chatMessages as Parameters<typeof aiClient.chat.completions.create>[0]["messages"],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) fullResponse += delta;
      }

      let htmlCode = fullResponse.trim();
      if (htmlCode.startsWith("```")) {
        htmlCode = htmlCode.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim();
      }

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
