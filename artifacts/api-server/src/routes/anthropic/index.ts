import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
  projectsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
  SendAnthropicMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Verify that a conversation belongs to the authenticated user
 * by checking the linked project's userId.
 * Returns the conversation row or null if not found / not owned.
 */
async function getOwnedConversation(conversationId: number, userId: string) {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));

  if (!conv) return null;

  // Verify ownership through the projects table
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.conversationId, conversationId),
        eq(projectsTable.userId, userId),
      ),
    );

  return project ? conv : null;
}

router.get("/anthropic/conversations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }

  // Return only conversations belonging to the current user's projects
  const rows = await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      createdAt: conversationsTable.createdAt,
    })
    .from(conversationsTable)
    .innerJoin(
      projectsTable,
      and(
        eq(projectsTable.conversationId, conversationsTable.id),
        eq(projectsTable.userId, req.user.id),
      ),
    )
    .orderBy(conversationsTable.createdAt);

  res.json(rows);
});

router.get(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Nicht angemeldet" });
      return;
    }

    const params = GetAnthropicConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const conv = await getOwnedConversation(params.data.id, req.user.id);
    if (!conv) {
      res.status(404).json({ error: "Konversation nicht gefunden" });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);

    res.json({ ...conv, messages: msgs });
  },
);

router.delete(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Nicht angemeldet" });
      return;
    }

    const params = DeleteAnthropicConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const conv = await getOwnedConversation(params.data.id, req.user.id);
    if (!conv) {
      res.status(404).json({ error: "Konversation nicht gefunden" });
      return;
    }

    await db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, conv.id));

    res.sendStatus(204);
  },
);

router.get(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Nicht angemeldet" });
      return;
    }

    const params = ListAnthropicMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const conv = await getOwnedConversation(params.data.id, req.user.id);
    if (!conv) {
      res.status(404).json({ error: "Konversation nicht gefunden" });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);

    res.json(msgs);
  },
);

router.post(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Nicht angemeldet" });
      return;
    }

    const params = SendAnthropicMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = SendAnthropicMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const conv = await getOwnedConversation(params.data.id, req.user.id);
    if (!conv) {
      res.status(404).json({ error: "Konversation nicht gefunden" });
      return;
    }

    await db.insert(messagesTable).values({
      conversationId: conv.id,
      role: "user",
      content: parsed.data.content,
    });

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
        res.write(
          `data: ${JSON.stringify({ content: event.delta.text })}\n\n`,
        );
      }
    }

    await db.insert(messagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  },
);

export default router;
