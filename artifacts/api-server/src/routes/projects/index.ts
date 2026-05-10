import { Router, type IRouter } from "express";
import { eq, desc, count, isNotNull } from "drizzle-orm";
import { db, projectsTable, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
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
import { logger } from "../../lib/logger";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
    })
    .returning();

  res.status(201).json(project);
});

router.get("/projects/stats/summary", async (req, res): Promise<void> => {
  const [totalRow] = await db
    .select({ count: count() })
    .from(projectsTable);
  const [publishedRow] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.isPublished, true));
  const [withCodeRow] = await db
    .select({ count: count() })
    .from(projectsTable)
    .where(isNotNull(projectsTable.htmlCode));

  const recentProjects = await db
    .select()
    .from(projectsTable)
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
  const params = GetProjectParams.safeParse(req.params);
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

  res.json(project);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
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
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
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
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Get or create conversation for this project
    let conversationId = project.conversationId;

    if (!conversationId) {
      const [conv] = await db
        .insert(conversationsTable)
        .values({ title: project.title })
        .returning();
      conversationId = conv.id;
      await db
        .update(projectsTable)
        .set({ conversationId, updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));
    }

    // Save user message
    await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content: parsed.data.prompt,
    });

    // Load message history
    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    send({ status: "Generiere Code..." });

    const systemPrompt = parsed.data.isRefinement
      ? `Du bist ein Experte für Web-Entwicklung. Du hast bereits eine Single-Page-HTML-App für den Nutzer generiert. Nun möchte der Nutzer Änderungen vornehmen.
Gib NUR vollständiges, eigenständiges HTML zurück — eine einzige HTML-Datei mit eingebettetem CSS (im <style>-Tag) und JavaScript (im <script>-Tag).
Behalte alle bestehenden Funktionen bei, es sei denn, der Nutzer möchte explizit etwas entfernen.
Antworte AUSSCHLIESSLICH mit dem HTML-Code, ohne Erklärungen, ohne Markdown-Codeblöcke, ohne \`\`\`html. Beginne direkt mit <!DOCTYPE html>.`
      : `Du bist ein Experte für Web-Entwicklung. Erstelle eine vollständige, eigenständige Single-Page-HTML-App basierend auf der Beschreibung des Nutzers.
Gib NUR vollständiges, eigenständiges HTML zurück — eine einzige HTML-Datei mit eingebettetem CSS (im <style>-Tag) und JavaScript (im <script>-Tag).
Die App soll:
- Modern und professionell aussehen
- Vollständig funktionsfähig sein (alle beschriebenen Features)
- Responsiv sein (mobile-friendly)
- Keine externen Abhängigkeiten benötigen außer CDN-Links die du inline einbettest
- Auf Deutsch sein falls der Nutzer keine andere Sprache angibt
Antworte AUSSCHLIESSLICH mit dem HTML-Code, ohne Erklärungen, ohne Markdown-Codeblöcke, ohne \`\`\`html. Beginne direkt mit <!DOCTYPE html>.`;

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
        send({ content: event.delta.text });
      }
    }

    // Clean up response — remove markdown code fences if AI added them
    let htmlCode = fullResponse.trim();
    if (htmlCode.startsWith("```")) {
      htmlCode = htmlCode.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    // Save assistant message
    await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: fullResponse,
    });

    // Save generated code to project
    await db
      .update(projectsTable)
      .set({ htmlCode, updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));

    send({ done: true });
    res.end();
  } catch (err) {
    req.log.error({ err }, "Generation error");
    send({ error: "Fehler bei der Code-Generierung" });
    res.end();
  }
});

router.post("/projects/:id/publish", async (req, res): Promise<void> => {
  const params = PublishProjectParams.safeParse(req.params);
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

  const publishedUrl = `/api/projects/${project.id}/preview`;

  const [updated] = await db
    .update(projectsTable)
    .set({ isPublished: true, publishedUrl, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id))
    .returning();

  res.json(updated);
});

export default router;
