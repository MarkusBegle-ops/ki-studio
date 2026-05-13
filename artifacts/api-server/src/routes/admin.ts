import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getAIClient, getSupportClient } from "@workspace/integrations-openai-ai-server";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function isAdmin(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return req.user.email === adminEmail;
}

const KEY_FILES = [
  "artifacts/ki-studio/src/App.tsx",
  "artifacts/ki-studio/src/pages/home.tsx",
  "artifacts/ki-studio/src/pages/new-project.tsx",
  "artifacts/ki-studio/src/pages/project-editor.tsx",
  "artifacts/ki-studio/src/pages/settings.tsx",
  "artifacts/ki-studio/src/components/layout/app-layout.tsx",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/conversations.ts",
  "artifacts/api-server/src/routes/projects/index.ts",
];

async function readSourceFiles(): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  for (const file of KEY_FILES) {
    try {
      const content = await fs.readFile(path.join(REPO_ROOT, file), "utf-8");
      results.push({ path: file, content });
    } catch {
      // skip missing files
    }
  }
  return results;
}

router.get("/admin/status", (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ isAdmin: isAdmin(req) });
});

router.post("/admin/chat", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }

  const { message, history = [] } = req.body as { message: string; history: { role: string; content: string }[] };
  if (!message?.trim()) { res.status(400).json({ error: "Nachricht fehlt" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));

  const userKeys = {
    openaiApiKey: user?.openaiApiKey ?? null,
    groqApiKey: user?.groqApiKey ?? null,
    geminiApiKey: user?.geminiApiKey ?? null,
    openrouterApiKey: user?.openrouterApiKey ?? null,
    mistralApiKey: user?.mistralApiKey ?? null,
    nvidiaApiKey: user?.nvidiaApiKey ?? null,
  };

  const aiClient = (userKeys.openrouterApiKey || userKeys.nvidiaApiKey || userKeys.groqApiKey || userKeys.geminiApiKey || userKeys.openaiApiKey || userKeys.mistralApiKey)
    ? getAIClient(userKeys)
    : getSupportClient();

  const sourceFiles = await readSourceFiles();
  const fileContext = sourceFiles.map(f =>
    `[DATEI: ${f.path}]\n\`\`\`tsx\n${f.content.length > 4000 ? f.content.slice(0, 4000) + "\n... (gekürzt)" : f.content}\n\`\`\``
  ).join("\n\n---\n\n");

  const systemPrompt = `Du bist ein Experte-Entwickler für KI Studio — eine React+Vite+TypeScript Fullstack-App mit einem Express-Backend.
Du hilfst dem Admin dabei, die App direkt zu modifizieren.

Antworte IMMER auf Deutsch. Erkläre zuerst was du ändern wirst oder was du über die Anfrage denkst.

Wenn du Code-Änderungen bereitstellst, hänge sie AM ENDE deiner Antwort in GENAU diesem Format an:
__CHANGES__{"files":[{"path":"PFAD_VOM_REPO_ROOT","content":"VOLLSTÄNDIGER_DATEIINHALT"}]}__END__

WICHTIGE REGELN:
- Immer den VOLLSTÄNDIGEN Dateiinhalt angeben, nie nur Ausschnitte
- Pfade sind relativ zum Repository-Root (z.B. "artifacts/ki-studio/src/pages/home.tsx")
- Nur Dateien in artifacts/ki-studio/src/ oder artifacts/api-server/src/ ändern
- Alle Imports müssen korrekt sein
- TypeScript-Typen müssen stimmen
- Wenn keine Code-Änderungen nötig sind (z.B. bei Fragen), kein __CHANGES__ Block

AKTUELLE QUELLDATEIEN:

${fileContext}`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(-8).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const completion = await aiClient.client.chat.completions.create({
      model: aiClient.textModel,
      messages,
      max_tokens: 8000,
    });
    const content = completion.choices[0]?.message?.content ?? "";
    res.json({ content });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "KI-Fehler";
    res.status(502).json({ error: `KI-Fehler: ${errMsg}` });
  }
});

router.post("/admin/apply", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }

  const { files } = req.body as { files: { path: string; content: string }[] };
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Keine Dateien angegeben" }); return;
  }

  const allowedPrefixes = ["artifacts/ki-studio/src/", "artifacts/api-server/src/"];
  const applied: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const normalPath = path.normalize(file.path).replace(/\\/g, "/");
    if (!allowedPrefixes.some(p => normalPath.startsWith(p))) {
      errors.push(`Nicht erlaubter Pfad: ${file.path}`); continue;
    }
    if (!/\.(ts|tsx|css|json)$/.test(normalPath)) {
      errors.push(`Dateityp nicht erlaubt: ${file.path}`); continue;
    }
    try {
      const fullPath = path.join(REPO_ROOT, normalPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, "utf-8");
      applied.push(normalPath);
    } catch {
      errors.push(`Schreibfehler: ${file.path}`);
    }
  }

  res.json({ applied, errors });
});

export default router;
