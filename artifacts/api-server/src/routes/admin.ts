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

const SOURCE_DIRS = [
  "artifacts/ki-studio/src",
  "artifacts/api-server/src",
  "lib/db/src",
  "lib/api-spec",
];

const ALWAYS_INCLUDE = [
  "lib/db/src/schema/projects.ts",
  "lib/db/src/schema/auth.ts",
  "artifacts/api-server/src/index.ts",
  "artifacts/api-server/src/routes/index.ts",
];

async function walkDir(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  let names: string[];
  try {
    names = await fs.readdir(path.join(root, dir));
  } catch {
    return results;
  }
  for (const name of names) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const rel = `${dir}/${name}`;
    const fullPath = path.join(root, rel);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try { stat = await fs.stat(fullPath); } catch { continue; }
    if (stat.isDirectory()) {
      const sub = await walkDir(rel, root);
      results.push(...sub);
    } else if (/\.(ts|tsx|css|json|yaml|md)$/.test(name) && !name.endsWith(".d.ts")) {
      results.push(rel);
    }
  }
  return results;
}

async function readSourceFiles(): Promise<{ path: string; content: string }[]> {
  const allFiles = new Set<string>();

  for (const dir of SOURCE_DIRS) {
    const files = await walkDir(dir, REPO_ROOT);
    for (const f of files) allFiles.add(f);
  }
  for (const f of ALWAYS_INCLUDE) allFiles.add(f);

  const results: { path: string; content: string }[] = [];
  for (const file of allFiles) {
    try {
      const content = await fs.readFile(path.join(REPO_ROOT, file), "utf-8");
      results.push({ path: file, content });
    } catch {
      // skip missing
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function pushToGitHub(files: { path: string; content: string; delete?: boolean }[]): Promise<{ pushed: string[]; errors: string[] }> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return { pushed: [], errors: ["GITHUB_TOKEN oder GITHUB_REPO nicht gesetzt"] };

  const pushed: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}`, {
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      const getData = await getRes.json() as { sha?: string };

      if (file.delete) {
        if (!getData.sha) { errors.push(`GitHub: Datei nicht gefunden: ${file.path}`); continue; }
        const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}`, {
          method: "DELETE",
          headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
          body: JSON.stringify({ message: `admin: delete ${file.path}`, sha: getData.sha }),
        });
        if (delRes.status === 200) pushed.push(`DELETE:${file.path}`);
        else errors.push(`GitHub Lösch-Fehler ${delRes.status}: ${file.path}`);
      } else {
        const body: Record<string, string> = {
          message: `admin: update ${file.path}`,
          content: Buffer.from(file.content).toString("base64"),
        };
        if (getData.sha) body.sha = getData.sha;
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}`, {
          method: "PUT",
          headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
          body: JSON.stringify(body),
        });
        if (putRes.status === 200 || putRes.status === 201) pushed.push(file.path);
        else errors.push(`GitHub Fehler ${putRes.status}: ${file.path}`);
      }
    } catch {
      errors.push(`Netzwerk-Fehler: ${file.path}`);
    }
  }
  return { pushed, errors };
}

router.get("/admin/status", (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ isAdmin: isAdmin(req) });
});

router.get("/admin/files", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }
  const files = await readSourceFiles();
  res.json({ files: files.map(f => ({ path: f.path, size: f.content.length })) });
});

router.post("/admin/file", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }
  const { path: filePath } = req.body as { path: string };
  if (!filePath) { res.status(400).json({ error: "Pfad fehlt" }); return; }
  try {
    const content = await fs.readFile(path.join(REPO_ROOT, filePath), "utf-8");
    res.json({ content });
  } catch {
    res.status(404).json({ error: "Datei nicht gefunden" });
  }
});

router.post("/admin/chat", async (req: Request, res: Response) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Zugriff verweigert" }); return; }

  const { message, history = [], selectedFiles } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    selectedFiles?: string[];
  };
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

  const support = getSupportClient();
  type FbEntry = { client: typeof primary.client; model: string };
  const primary = getAIClient(userKeys);
  const fallbackChain: FbEntry[] = [
    { client: support.client, model: support.reviewModel },
  ];
  const hasUserKey = !!(userKeys.openaiApiKey || userKeys.openrouterApiKey || userKeys.groqApiKey || userKeys.geminiApiKey);
  if (hasUserKey) {
    fallbackChain.unshift({ client: primary.client, model: primary.textModel });
  }

  const allFiles = await readSourceFiles();

  let sourceFiles: { path: string; content: string }[];
  if (selectedFiles && selectedFiles.length > 0) {
    sourceFiles = allFiles.filter(f => selectedFiles.includes(f.path));
  } else {
    sourceFiles = allFiles;
  }

  const fileNames = sourceFiles.map(f => f.path).join(", ");
  const fileContext = sourceFiles.map(f =>
    `[DATEI: ${f.path}]\n\`\`\`tsx\n${f.content}\n\`\`\``
  ).join("\n\n---\n\n");

  const hasGitHub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);

  const systemPrompt = `Du bist ein Senior Full-Stack-Entwickler und der persönliche KI-Assistent von Markus (Admin) für KI Studio.

Du hast VOLLSTÄNDIGEN Zugriff auf den gesamten Quellcode dieser App und kannst ALLES ändern.

## ⚠️ KRITISCHE REGEL — HALLUZINATIONEN VERBOTEN
Du hast GENAU diese Dateien: ${fileNames}
Erwähne NUR Dateipfade und Komponenten die in diesen Dateien existieren.
Erfinde NIEMALS Dateinamen oder Komponenten die nicht im Code stehen.

## 1. BERATUNG & ANALYSE
Bei Fragen, Analyse, Bugs oder Verbesserungsvorschlägen:
- Antworte ausführlich und konkret auf Deutsch
- Nutze **Markdown-Formatierung** für Lesbarkeit
- Erkläre WARUM etwas ein Problem ist, zeige genaue Zeile/Funktion aus dem echten Code
- Priorisiere: 🔴 Kritisch / 🟡 Mittel / 🟢 Nice-to-have
- Kein __CHANGES__ Block bei reiner Analyse

## 2. CODE-ÄNDERUNGEN & DATEI-VERWALTUNG
Du hast VOLLSTÄNDIGE Schreib- und Lösch-Berechtigung für den gesamten Quellcode.

Wenn Markus eine Änderung möchte:
- Erkläre kurz was du änderst und warum
- Hänge Änderungen AM ENDE in GENAU diesem Format an:
  __CHANGES__{"files":[{"path":"PFAD_VOM_REPO_ROOT","content":"VOLLSTÄNDIGER_DATEIINHALT"},{"path":"PFAD_ZU_LÖSCHENDER_DATEI","delete":true}]}__END__
- Für neue/geänderte Dateien: IMMER vollständiger Dateiinhalt — nie Ausschnitte oder "..." Platzhalter
- Für zu löschende Dateien: "delete": true statt "content" setzen
- Du kannst Dateien erstellen, umbenennen (alt löschen + neu erstellen), und löschen
- Erlaubte Pfade: artifacts/ki-studio/src/, artifacts/api-server/src/, lib/db/src/, lib/api-spec/
- TypeScript-Typen korrekt, alle Imports vorhanden
${hasGitHub ? "- Änderungen werden automatisch auf GitHub gepusht → Render deployt danach automatisch" : "- Hinweis: GITHUB_TOKEN nicht gesetzt — Änderungen gelten nur lokal"}

## TECH-STACK
- Frontend: React 18, Vite, TypeScript, TanStack Query, wouter, shadcn/ui, Tailwind CSS
- Backend: Express 5, Node.js 24, TypeScript, esbuild bundle
- DB: PostgreSQL + Drizzle ORM, Zod v4 validation
- Auth: bcrypt + session-based (keine JWTs)
- AI: Pollinations (GPT-OSS) → OpenRouter Free Models → user keys
- Monorepo: pnpm workspaces, lib/db, lib/api-spec, artifacts/
- GitHub → Render auto-deploy (Node.js, Oregon)

## VOLLSTÄNDIGER QUELLCODE

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
        max_tokens: 16000,
      });
      const content = completion.choices[0]?.message?.content ?? "";
      res.json({ content });
      return;
    } catch (err: unknown) {
      lastErr = err;
      if (!isRetryable(err)) break;
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

  const { files, pushGitHub = true } = req.body as {
    files: { path: string; content?: string; delete?: boolean }[];
    pushGitHub?: boolean;
  };
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Keine Dateien angegeben" }); return;
  }

  const allowedPrefixes = [
    "artifacts/ki-studio/src/",
    "artifacts/api-server/src/",
    "lib/db/src/",
    "lib/api-spec/",
  ];
  const applied: string[] = [];
  const deleted: string[] = [];
  const errors: string[] = [];
  const toGitHub: { path: string; content: string; delete?: boolean }[] = [];

  for (const file of files) {
    const normalPath = path.normalize(file.path).replace(/\\/g, "/");
    if (!allowedPrefixes.some(p => normalPath.startsWith(p))) {
      errors.push(`Nicht erlaubter Pfad: ${file.path}`); continue;
    }
    if (!/\.(ts|tsx|css|json|yaml|md)$/.test(normalPath)) {
      errors.push(`Dateityp nicht erlaubt: ${file.path}`); continue;
    }

    if (file.delete) {
      // Delete the file locally
      try {
        await fs.unlink(path.join(REPO_ROOT, normalPath));
        deleted.push(normalPath);
        toGitHub.push({ path: normalPath, content: "", delete: true });
      } catch {
        errors.push(`Löschfehler: ${file.path}`);
      }
    } else {
      // Write/overwrite the file
      if (!file.content) { errors.push(`Kein Inhalt für: ${file.path}`); continue; }
      try {
        const fullPath = path.join(REPO_ROOT, normalPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, file.content, "utf-8");
        applied.push(normalPath);
        toGitHub.push({ path: normalPath, content: file.content });
      } catch {
        errors.push(`Schreibfehler: ${file.path}`);
      }
    }
  }

  let gitHubResult: { pushed: string[]; errors: string[] } | null = null;
  if (pushGitHub && toGitHub.length > 0) {
    gitHubResult = await pushToGitHub(toGitHub);
  }

  res.json({ applied, deleted, errors, gitHub: gitHubResult });
});

export default router;
