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

  // For assistant messages, don't send the full HTML — just a placeholder
  const sanitized = msgs.map((m, idx) => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.role === "assistant"
      ? `__HTML_VERSION_${Math.ceil((idx + 1) / 2)}__`
      : m.content,
    createdAt: m.createdAt,
  }));

  res.json(sanitized);
});

export default router;
