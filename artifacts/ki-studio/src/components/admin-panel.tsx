import React, { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, CheckCircle2, FileCode2, RefreshCw, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  files?: { path: string; content: string }[];
  applied?: boolean;
  error?: string;
}

const CHANGES_RE = /__CHANGES__(\{[\s\S]*?\})__END__/;

function parseResponse(raw: string): { text: string; files?: { path: string; content: string }[] } {
  const match = CHANGES_RE.exec(raw);
  if (!match) return { text: raw.trim() };
  const text = raw.replace(match[0], "").trim();
  try {
    const parsed = JSON.parse(match[1]) as { files?: { path: string; content: string }[] };
    return { text, files: parsed.files };
  } catch {
    return { text };
  }
}

function FileList({ files, applied }: { files: { path: string; content: string }[]; applied?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-1">
      {files.map(f => (
        <div key={f.path} className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden text-xs">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
            onClick={() => setExpanded(expanded === f.path ? null : f.path)}
          >
            <FileCode2 className="w-3 h-3 text-primary shrink-0" />
            <span className="flex-1 font-mono text-foreground/70 truncate">{f.path}</span>
            {applied && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
            {expanded === f.path ? <ChevronUp className="w-3 h-3 opacity-50 shrink-0" /> : <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />}
          </button>
          {expanded === f.path && (
            <pre className="px-3 pb-3 text-[10px] font-mono text-foreground/60 overflow-auto max-h-48 leading-relaxed whitespace-pre-wrap break-all">
              {f.content.slice(0, 2000)}{f.content.length > 2000 ? "\n... (gekürzt)" : ""}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageBubble({
  msg,
  onApply,
}: {
  msg: ChatMessage;
  onApply: (files: { path: string; content: string }[]) => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    if (!msg.files) return;
    setApplying(true);
    await onApply(msg.files);
    setApplying(false);
  }

  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[90%] ${isUser ? "bg-primary/15 border-primary/20 text-primary" : "bg-card/60 border-border/40"} rounded-xl border px-4 py-3`}>
        {msg.error ? (
          <p className="text-xs text-destructive">{msg.error}</p>
        ) : (
          <>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            {msg.files && msg.files.length > 0 && (
              <>
                <FileList files={msg.files} applied={msg.applied} />
                {!msg.applied && (
                  <Button
                    size="sm"
                    className="mt-3 h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-500 text-white"
                    onClick={handleApply}
                    disabled={applying}
                  >
                    {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    {applying ? "Wird angewendet…" : `Jetzt ändern (${msg.files.length} ${msg.files.length === 1 ? "Datei" : "Dateien"})`}
                  </Button>
                )}
                {msg.applied && (
                  <div className="mt-2 flex items-center gap-1.5 text-green-500 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Änderungen übernommen · Vite lädt automatisch neu
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Admin-Modus aktiv. Beschreib welche Änderung du an KI Studio vornehmen möchtest — ich lese den aktuellen Quellcode und setze die Änderung um.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const history = messages
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json() as { content?: string; error?: string };
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: "", error: data.error ?? "Fehler" }]);
        return;
      }
      const { text: responseText, files } = parseResponse(data.content ?? "");
      setMessages(prev => [...prev, { role: "assistant", content: responseText, files }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "", error: "Netzwerkfehler" }]);
    } finally {
      setLoading(false);
    }
  }

  async function applyFiles(msgIndex: number, files: { path: string; content: string }[]) {
    const res = await fetch("/api/admin/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ files }),
    });
    const data = await res.json() as { applied?: string[]; errors?: string[] };
    if (data.applied && data.applied.length > 0) {
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, applied: true } : m));
      setTimeout(() => setPreviewKey(k => k + 1), 1500);
    }
    if (data.errors?.length) {
      alert("Fehler:\n" + data.errors.join("\n"));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex dark" style={{ fontFamily: "inherit" }}>
      <div className="absolute inset-0 bg-background/95 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full h-full flex-col">
        <div className="flex items-center gap-3 h-12 px-4 border-b border-border/50 bg-card/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">KI Studio · Admin Panel</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono">ADMIN</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col w-[55%] border-r border-border/40 bg-background">
            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  onApply={(files) => applyFiles(i, files)}
                />
              ))}
              {loading && (
                <div className="flex justify-start mb-3">
                  <div className="bg-card/60 border border-border/40 rounded-xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">KI denkt nach…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border/40 bg-card/30">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Beschreib eine Änderung… (Enter zum Senden, Shift+Enter für neue Zeile)"
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50 disabled:opacity-50"
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 shrink-0"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-0.5">
                KI liest die Quelldateien · "Jetzt ändern" schreibt direkt auf die Festplatte · Vite lädt automatisch neu
              </p>
            </div>
          </div>

          <div className="flex flex-col w-[45%] bg-muted/5">
            <div className="flex items-center gap-2 h-9 px-3 border-b border-border/30 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground font-mono">Live-Vorschau · KI Studio</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setPreviewKey(k => k + 1)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Vorschau neu laden"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <iframe
              key={previewKey}
              src="/"
              className="flex-1 w-full border-0"
              title="KI Studio Vorschau"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
