import React, { useState, useRef, useEffect } from "react";
import {
  X, Send, Loader2, CheckCircle2, FileCode2, RefreshCw,
  ChevronDown, ChevronUp, Terminal, Sparkles, Zap,
  Shield, Bug, BarChart3, Lightbulb, Search, Bot,
} from "lucide-react";
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

/** Minimal markdown → JSX renderer */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="mt-2 mb-2 bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[10px] font-mono overflow-auto max-h-40 text-foreground/80">
          {lang && <span className="text-primary/50 text-[9px] uppercase tracking-wider block mb-1">{lang}</span>}
          {codeLines.join("\n")}
        </pre>
      );
    }
    // Heading
    else if (line.startsWith("### ")) {
      elements.push(<p key={i} className="font-bold text-xs text-foreground mt-2 mb-0.5">{line.slice(4)}</p>);
    }
    else if (line.startsWith("## ")) {
      elements.push(<p key={i} className="font-bold text-xs text-primary mt-2 mb-1">{line.slice(3)}</p>);
    }
    else if (line.startsWith("# ")) {
      elements.push(<p key={i} className="font-semibold text-sm text-foreground mt-2 mb-1">{line.slice(2)}</p>);
    }
    // List item
    else if (line.match(/^[-*•] /)) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 leading-relaxed">
          <span className="text-primary/60 mt-px shrink-0">•</span>
          <span>{inlineFormat(line.replace(/^[-*•] /, ""))}</span>
        </div>
      );
    }
    else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1];
      elements.push(
        <div key={i} className="flex items-start gap-1.5 leading-relaxed">
          <span className="text-primary/60 font-mono text-[10px] mt-px shrink-0 w-4">{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="border-border/30 my-2" />);
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    }
    // Normal text
    else {
      elements.push(<p key={i} className="leading-relaxed">{inlineFormat(line)}</p>);
    }
    i++;
  }
  return <div className="text-xs space-y-0.5">{elements}</div>;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-[10px] bg-muted/50 border border-border/40 px-1 py-0 rounded text-primary/80">{part.slice(1, -1)}</code>;
    return part;
  });
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
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <Bot className="w-3 h-3 text-primary" />
        </div>
      )}
      <div className={`max-w-[88%] ${isUser
        ? "bg-primary/15 border-primary/20 text-foreground"
        : "bg-card/60 border-border/40 text-foreground/80"
        } rounded-xl border px-4 py-3`}>
        {msg.error ? (
          <p className="text-xs text-destructive">{msg.error}</p>
        ) : (
          <>
            {isUser
              ? <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              : <MarkdownText text={msg.content} />
            }
            {msg.files && msg.files.length > 0 && (
              <>
                <FileList files={msg.files} applied={msg.applied} />
                {!msg.applied && (
                  <Button
                    size="sm"
                    className="mt-3 h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-500 text-white w-full"
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

const QUICK_ACTIONS = [
  { icon: Search, label: "Code analysieren", prompt: "Analysiere den gesamten Code von KI Studio gründlich. Erkläre die aktuelle Architektur und Struktur. Liste dann die 5 wichtigsten Verbesserungsmöglichkeiten auf — priorisiert nach Nutzen." },
  { icon: Bug, label: "Bugs suchen", prompt: "Durchsuche alle Quelldateien nach möglichen Bugs, Edge Cases, unbehandelten Fehlern oder fragilen Stellen. Erstelle eine priorisierte Liste mit Erklärung und Empfehlung wie man sie behebt." },
  { icon: Zap, label: "Performance", prompt: "Analysiere die App auf Performance-Probleme. Prüfe unnötige Re-Renders, zu häufige API-Calls, fehlende Optimierungen (memo, useCallback, lazy loading) und gib konkrete Empfehlungen." },
  { icon: Shield, label: "Sicherheit prüfen", prompt: "Mache einen Sicherheits-Audit. Prüfe auf XSS-Lücken, unsichere Datenverarbeitung, fehlende Validierungen, CORS-Konfiguration und andere Sicherheitsprobleme. Bewerte den Schweregrad jedes Problems." },
  { icon: Sparkles, label: "UX verbessern", prompt: "Analysiere die User Experience von KI Studio aus Nutzerperspektive. Was ist verwirrend? Was fehlt? Welche kleinen Änderungen hätten den größten positiven Einfluss? Gib konkrete, umsetzbare Empfehlungen." },
  { icon: BarChart3, label: "Features vorschlagen", prompt: "Schau dir die aktuelle Funktionalität von KI Studio an und schlage die 5 sinnvollsten neuen Features vor, die den größten Mehrwert für die Nutzer hätten. Erkläre für jedes Feature warum es wertvoll ist und wie es technisch umgesetzt werden könnte." },
  { icon: Lightbulb, label: "Was läuft gut?", prompt: "Analysiere den Code und erkläre was bereits sehr gut gemacht ist — gute Architekturentscheidungen, sauberer Code, gutes UX-Design, etc. Was sind die Stärken von KI Studio?" },
];

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `**Admin-Modus aktiv.** Ich habe Zugriff auf alle Quelldateien von KI Studio.

Was ich für dich tun kann:
- **Code analysieren** — Architektur, Qualität, Verbesserungspotenzial
- **Bugs finden** — Edge Cases, Fehlerbehandlung, fragile Stellen
- **Empfehlungen geben** — Features, UX, Performance, Sicherheit
- **Code ändern** — Direkte Dateiänderungen mit "Jetzt ändern" anwenden

Nutze die **Schnellaktionen** unten für eine sofortige Analyse, oder stell mir eine konkrete Frage.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const history = messages
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setShowQuickActions(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, history }),
      });
      let data: { content?: string; error?: string } = {};
      try { data = await res.json() as typeof data; } catch { /* ignore */ }
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
        {/* Header */}
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
          {/* Left: Chat */}
          <div className="flex flex-col w-[55%] border-r border-border/40 bg-background">

            {/* Messages */}
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
                  <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                  <div className="bg-card/60 border border-border/40 rounded-xl px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                    </div>
                    <span className="text-xs text-muted-foreground">Analysiert…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {showQuickActions && (
              <div className="px-3 pb-2 border-t border-border/30 pt-2.5">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium mb-2 px-0.5">Schnellanalysen</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map(action => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => sendMessage(action.prompt)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <action.icon className="w-3 h-3" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-border/40 bg-card/30">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Frage stellen, Änderung beschreiben oder Empfehlung anfordern… (Enter senden)"
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40 disabled:opacity-50"
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 shrink-0"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <p className="text-[10px] text-muted-foreground/40">
                  "Jetzt ändern" schreibt direkt auf die Festplatte · Vite lädt automatisch neu
                </p>
                {!showQuickActions && (
                  <button
                    type="button"
                    onClick={() => setShowQuickActions(true)}
                    className="text-[10px] text-primary/50 hover:text-primary transition-colors"
                  >
                    Schnellaktionen zeigen
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
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
