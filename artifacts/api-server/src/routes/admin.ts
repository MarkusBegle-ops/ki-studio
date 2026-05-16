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
  "artifacts/ki-studio/src/pages/templates.tsx",
  "artifacts/ki-studio/src/pages/settings.tsx",
  "artifacts/ki-studio/src/components/layout/app-layout.tsx",
  "artifacts/ki-studio/src/components/admin-panel.tsx",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/conversations.ts",
  "artifacts/api-server/src/routes/projects/index.ts",
  "artifacts/api-server/src/routes/admin.ts",
  "artifacts/api-server/src/index.ts",
  "lib/db/src/schema/projects.ts",
  "lib/db/src/schema/auth.ts",
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

router.get("/download/code", async (_req: Request, res: Response) => {
  try {
    const filePath = path.join(REPO_ROOT, "artifacts/ki-studio/public/KI-Studio-Code.txt");
    const content = await fs.readFile(filePath, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="KI-Studio-Code.txt"');
    res.setHeader("Cache-Control", "no-store");
    res.send(content);
  } catch {
    res.status(404).json({ error: "Datei nicht gefunden" });
  }
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

  const systemPrompt = `Du bist ein Senior Full-Stack-Entwickler und Code-Reviewer für KI Studio — eine React+Vite+TypeScript SPA mit Express 5 Backend, Drizzle ORM, PostgreSQL und shadcn/ui Komponenten.

Du bist der persönliche KI-Assistent des Admins und hast zwei Hauptaufgaben:

## 1. BERATUNG & ANALYSE
Wenn der Admin nach Analyse, Empfehlungen, Bugs oder Informationen fragt:
- Antworte ausführlich und konkret auf Deutsch
- Nutze **Markdown-Formatierung** (Fettschrift, Listen, Überschriften) für Lesbarkeit
- Erkläre WARUM etwas ein Problem ist oder verbessert werden könnte
- Priorisiere Empfehlungen nach Wichtigkeit (🔴 Kritisch / 🟡 Mittel / 🟢 Nice-to-have)
- Zeige konkrete Code-Beispiele wo sinnvoll
- Kein __CHANGES__ Block bei reiner Analyse

## 2. CODE-ÄNDERUNGEN
Wenn der Admin eine Änderung möchte:
- Erkläre zuerst kurz was du änderst und warum
- Hänge Änderungen AM ENDE in GENAU diesem Format an:
  __CHANGES__{"files":[{"path":"PFAD_VOM_REPO_ROOT","content":"VOLLSTÄNDIGER_DATEIINHALT"}]}__END__
- IMMER den vollständigen Dateiinhalt — nie Ausschnitte
- Nur Dateien in artifacts/ki-studio/src/ oder artifacts/api-server/src/
- TypeScript-Typen korrekt, alle Imports vorhanden

## TECH-STACK (für präzise Empfehlungen)
- Frontend: React 18, Vite, TypeScript, TanStack Query, wouter, shadcn/ui, Tailwind CSS
- Backend: Express 5, Node.js 24, TypeScript, esbuild bundle
- DB: PostgreSQL + Drizzle ORM, Zod v4 validation
- Auth: bcrypt + session-based (keine JWTs)
- AI: OpenRouter → NVIDIA → Groq → Gemini → OpenAI → Mistral → Pollinations (Fallback-Kette)
- Monorepo: pnpm workspaces, lib/db, lib/api-spec, artifacts/

## AKTUELLE QUELLDATEIEN

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
