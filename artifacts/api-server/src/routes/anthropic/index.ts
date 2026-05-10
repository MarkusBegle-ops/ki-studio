import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  CreateAnthropicConversationBody,
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
  SendAnthropicMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/anthropic/conversations", async (_req, res): Promise<void> => {
  const convs = await db
    .select()
    .from(conversationsTable)
    .orderBy(conversationsTable.createdAt);
  res.json(convs);
});

router.post("/anthropic/conversations", async (req, res): Promise<void> => {
  const parsed = CreateAnthropicConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title })
    .returning();

  res.status(201).json(conv);
});

router.get(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    const params = GetAnthropicConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, params.data.id));

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
  }
);

router.delete(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    const params = DeleteAnthropicConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [conv] = await db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, params.data.id))
      .returning();

    if (!conv) {
      res.status(404).json({ error: "Konversation nicht gefunden" });
      return;
    }

    res.sendStatus(204);
  }
);

router.get(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = ListAnthropicMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, params.data.id))
      .orderBy(messagesTable.createdAt);

    res.json(msgs);
  }
);

router.post(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
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

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, params.data.id));

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
          `data: ${JSON.stringify({ content: event.delta.text })}\n\n`
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
  }
);

export default router;
