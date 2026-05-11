import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
} from "../lib/auth";

const router: IRouter = Router();

const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

const LoginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    return;
  }

  const { email, password, firstName, lastName } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "E-Mail-Adresse wird bereits verwendet" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, firstName: firstName ?? null, lastName: lastName ?? null })
    .returning();

  if (!user) {
    res.status(500).json({ error: "Benutzer konnte nicht erstellt werden" });
    return;
  }

  const sid = await createSession({
    user: {
      id: user.id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profileImageUrl: null,
    },
  });

  setSessionCookie(res, sid);
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: null,
    },
  });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "E-Mail oder Passwort fehlt" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "E-Mail oder Passwort falsch" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "E-Mail oder Passwort falsch" });
    return;
  }

  const sid = await createSession({
    user: {
      id: user.id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profileImageUrl: user.profileImageUrl ?? null,
    },
  });

  setSessionCookie(res, sid);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
  });
});

function keyPreview(key: string | null | undefined, prefix = ""): string | null {
  if (!key) return null;
  return (prefix || key.slice(0, 6)) + "…" + key.slice(-4);
}

router.get("/settings", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json({
    openai:     { hasKey: !!(user?.openaiApiKey),     preview: keyPreview(user?.openaiApiKey, "sk-") },
    groq:       { hasKey: !!(user?.groqApiKey),        preview: keyPreview(user?.groqApiKey, "gsk_") },
    gemini:     { hasKey: !!(user?.geminiApiKey),      preview: keyPreview(user?.geminiApiKey, "AIza") },
    openrouter: { hasKey: !!(user?.openrouterApiKey),  preview: keyPreview(user?.openrouterApiKey, "sk-or-") },
  });
});

router.post("/settings/provider-key", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const provider = typeof req.body?.provider === "string" ? req.body.provider : "";
  const key = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

  const columnMap: Record<string, keyof typeof usersTable.$inferInsert> = {
    openai:     "openaiApiKey",
    groq:       "groqApiKey",
    gemini:     "geminiApiKey",
    openrouter: "openrouterApiKey",
  };

  if (!columnMap[provider]) {
    res.status(400).json({ error: "Unbekannter Anbieter" }); return;
  }

  await db.update(usersTable)
    .set({ [columnMap[provider]]: key || null })
    .where(eq(usersTable.id, req.user.id));

  res.json({ success: true, hasKey: !!key });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/");
});

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

export default router;
