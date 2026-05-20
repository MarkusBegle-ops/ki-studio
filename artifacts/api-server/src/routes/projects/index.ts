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
      let providerNote = ""; // Set when auto-fallback fires — shown to the user in chat

      type FallbackEntry = { client: typeof aiClient; model: string; name: string };
      const fallbackChain: FallbackEntry[] = [];

      // Primary provider first
      fallbackChain.push({ client: aiClient, model: genModel, name: provider });

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
          fallbackChain.push({ client: fb.client, model: fb.codeModel, name: cand.keyName });
        } catch { /* skip */ }
      }
      // Always add Pollinations as last resort
      const support = getSupportClient();
      if (provider !== "pollinations") {
        fallbackChain.push({ client: support.client, model: support.codeReviewModel, name: "pollinations" });
      }

      const runGeneration = async (genClient: typeof aiClient, model: string) => {
        const stream = await genClient.chat.completions.create({
          model,
          max_tokens: 8000,
          temperature: 0.2,
          messages: codeMessages as Parameters<typeof genClient.chat.completions.create>[0]["messages"],
          stream: true,
        });
        let text = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) text += delta;
        }
        if (!text.trim()) throw new Error(`Provider ${model} returned empty response`);
        return text;
      };

      let lastError: unknown = null;
      for (const entry of fallbackChain) {
        try {
          log.info({ provider: entry.name, model: entry.model }, "Attempting generation");
          fullResponse = await runGeneration(entry.client, entry.model);
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
