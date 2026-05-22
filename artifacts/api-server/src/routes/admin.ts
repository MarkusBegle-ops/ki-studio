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

// Reduced file list — only the most critical files to keep token count low
const KEY_FILES = [
  "artifacts/ki-studio/src/App.tsx",
  "artifacts/ki-studio/src/pages/project-editor.tsx",
  "artifacts/ki-studio/src/components/admin-panel.tsx",
  "artifacts/api-server/src/routes/projects/index.ts",
  "artifacts/api-server/src/routes/admin.ts",
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


router.post("/admin/chat", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }

  const { message, history = [] } = req.body as { message: string; history: { role: string; content: string }[] };
  if (!message?.trim()) { res.status(400).json({ error: "Nachricht fehlt" }); return; }

  if (!req.user) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));

  const userKeys = {
    openaiApiKey: user?.openaiApiKey ?? null,
    groqApiKey: user?.groqApiKey ?? null,
    geminiApiKey: user?.geminiApiKey ?? null,
    openrouterApiKey: user?.openrouterApiKey ?? null,
    mistralApiKey: user?.mistralApiKey ?? null,
    nvidiaApiKey: user?.nvidiaApiKey ?? null,
  };

  // Build fallback chain: primary model first, then multiple OpenRouter free models
  const primary = getAIClient(userKeys);
  type FbEntry = { client: typeof primary.client; model: string };
  const fallbackChain: FbEntry[] = [{ client: primary.client, model: primary.textModel }];

  // If using OpenRouter (server key or user key), add free model fallbacks
  const orKey = userKeys.openrouterApiKey ?? process.env["OPENROUTER_API_KEY"] ?? process.env["AI_INTEGRATIONS_OPENROUTER_BASE_URL"];
  if (orKey && primary.provider === "openrouter") {
    for (const m of [
      "deepseek/deepseek-r1:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-235b-a22b:free",
      "nousresearch/hermes-3-llama-3.1-405b:free",
    ]) {
      if (m !== primary.textModel) fallbackChain.push({ client: primary.client, model: m });
    }
  }
  // Always add Pollinations as final fallback — unlimited, no key needed
  const support = getSupportClient();
  fallbackChain.push({ client: support.client, model: support.reviewModel });

  const sourceFiles = await readSourceFiles();
  // Limit each file to 1500 chars to keep total token count manageable
  const fileContext = sourceFiles.map(f =>
    `[DATEI: ${f.path}]\n\`\`\`tsx\n${f.content.length > 1500 ? f.content.slice(0, 1500) + "\n... (gekürzt)" : f.content}\n\`\`\``
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

  const isRetryable = (e: unknown) => {
    const s = (e as { status?: number })?.status;
    const msg = e instanceof Error ? e.message : String(e);
    // Retry on rate-limit (429) OR model-not-found (404) — both mean "try next model"
    return s === 429 || s === 404
      || msg.includes("429") || msg.includes("404")
      || msg.toLowerCase().includes("rate limit")
      || msg.toLowerCase().includes("no endpoints found");
  };
  const is429 = (e: unknown) => {
    const s = (e as { status?: number })?.status;
    const msg = e instanceof Error ? e.message : String(e);
    return s === 429 || msg.includes("429") || msg.toLowerCase().includes("rate limit");
  };

  let lastErr: unknown = null;
  for (const entry of fallbackChain) {
    try {
      const completion = await entry.client.chat.completions.create({
        model: entry.model,
        messages,
        max_tokens: 8000,
      });
      const content = completion.choices[0]?.message?.content ?? "";
      res.json({ content });
      return;
    } catch (err: unknown) {
      lastErr = err;
      if (!isRetryable(err)) break; // hard error: stop trying
      // 429 or 404: try next model in chain
    }
  }

  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const userMsg = is429(lastErr)
    ? "KI momentan ausgelastet — alle Modelle sind gerade belegt. Bitte in 1-2 Minuten erneut versuchen."
    : `KI-Fehler: ${errMsg.slice(0, 200)}`;
  res.status(502).json({ error: userMsg });
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
