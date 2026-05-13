import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, messages as messagesTable, projectsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/anthropic/conversations/:id/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  const convId = parseInt(req.params.id ?? "", 10);
  if (isNaN(convId) || convId <= 0) {
    res.status(400).json({ error: "Ungültige Konversations-ID" });
    return;
  }

  // Make sure the requesting user owns a project with this conversationId
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.conversationId, convId),
        eq(projectsTable.userId, req.user.id),
      ),
    );

  if (!project) {
    res.status(403).json({ error: "Kein Zugriff" });
    return;
  }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(messagesTable.createdAt);

  // For assistant messages: if the content contains HTML (old format), replace with placeholder.
  // If content is just analysis text (new format) or empty, pass it through.
  let versionCounter = 0;
  const sanitized = msgs.map((m) => {
    if (m.role !== "assistant") return { id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt };

    versionCounter++;
    const hasHtml = m.content.toLowerCase().includes("<!doctype html>") || m.content.toLowerCase().includes("<html");

    if (hasHtml) {
      // Old format: full HTML stored — replace with version placeholder only
      return { id: m.id, conversationId: m.conversationId, role: m.role, content: `__HTML_VERSION_${versionCounter}__`, createdAt: m.createdAt };
    }

    // New format: analysis text stored (or empty) — pass through + append version tag
    const analysisText = m.content.trim();
    const versionTag = `__HTML_VERSION_${versionCounter}__`;
    return {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: analysisText ? `${analysisText}\n${versionTag}` : versionTag,
      createdAt: m.createdAt,
    };
  });

  res.json(sanitized);
});

export default router;
