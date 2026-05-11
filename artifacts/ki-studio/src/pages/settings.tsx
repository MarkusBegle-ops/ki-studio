import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Key, CheckCircle2, Trash2, Loader2, ExternalLink, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ProviderStatus { hasKey: boolean; preview: string | null }
interface SettingsData {
  openai: ProviderStatus;
  groq: ProviderStatus;
  gemini: ProviderStatus;
  openrouter: ProviderStatus;
}

interface ProviderConfig {
  id: keyof SettingsData;
  name: string;
  badge: string;
  badgeColor: string;
  placeholder: string;
  keyUrl: string;
  keyUrlLabel: string;
  description: string;
  free: boolean;
  note?: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "groq",
    name: "Groq",
    badge: "Kostenlos",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    placeholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    keyUrlLabel: "console.groq.com/keys",
    description: "Sehr schnell, großzügiges kostenloses Kontingent. Llama 3.3 70B Modell.",
    free: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Kostenlos",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    placeholder: "AIzaSy…",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com/apikey",
    description: "Google Gemini 2.0 Flash — kostenlos mit großzügigem Monatslimit.",
    free: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Kostenlos",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    placeholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "openrouter.ai/keys",
    description: "Zugang zu vielen Modellen — viele davon komplett kostenlos (Gemini, Llama, Mistral).",
    free: true,
    note: "Kein Kreditkarte für kostenlose Modelle nötig.",
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    badge: "Kostenpflichtig",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    placeholder: "sk-proj-…",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "platform.openai.com/api-keys",
    description: "GPT-4o — höchste Qualität, aber kostenpflichtig (sehr günstig pro Nutzung).",
    free: false,
  },
];

function ProviderCard({ config, status, onSave, onDelete }: {
  config: ProviderConfig;
  status: ProviderStatus;
  onSave: (provider: string, key: string) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    try { await onSave(config.id, apiKey.trim()); setApiKey(""); setExpanded(false); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await onDelete(config.id); }
    finally { setDeleting(false); }
  }

  return (
    <Card className={`border-border/60 bg-card/50 backdrop-blur-sm transition-all ${status.hasKey ? "border-primary/20" : ""}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`flex-1 flex items-center gap-2.5`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${status.hasKey ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">{config.name}</CardTitle>
                <Badge className={`text-[10px] px-1.5 py-0 border ${config.badgeColor}`}>{config.badge}</Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">{config.description}</CardDescription>
            </div>
          </div>
          {status.hasKey ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-muted-foreground hidden sm:block">{status.preview}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive"
                onClick={handleDelete} disabled={deleting}
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground/60"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs border-border/60 shrink-0"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? "Abbrechen" : "Einrichten"}
            </Button>
          )}
        </div>
      </CardHeader>

      {(expanded || (!status.hasKey && expanded)) && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="h-px bg-border/40" />
          {config.note && (
            <p className="text-xs text-emerald-400/80 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {config.note}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Key abrufen:{" "}
            <a href={config.keyUrl} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5">
              {config.keyUrlLabel}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </p>
          <form onSubmit={handleSave} className="flex gap-2">
            <Input
              type="password"
              placeholder={config.placeholder}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="flex-1 bg-background/60 border-border/60 focus-visible:ring-primary/40 font-mono text-sm h-9"
              autoFocus
            />
            <Button type="submit" size="sm" className="h-9" disabled={!apiKey.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include", cache: "no-store" })
      .then(r => r.json() as Promise<SettingsData>)
      .then(setSettings)
      .catch(() => setSettings({ openai: { hasKey: false, preview: null }, groq: { hasKey: false, preview: null }, gemini: { hasKey: false, preview: null }, openrouter: { hasKey: false, preview: null } }))
      .finally(() => setIsLoading(false));
  }, []);

  const activeCount = settings ? Object.values(settings).filter(s => s.hasKey).length : 0;

  async function handleSave(provider: string, apiKey: string) {
    const res = await fetch("/api/settings/provider-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Fehler");
    const cfg = PROVIDERS.find(p => p.id === provider)!;
    setSettings(prev => prev ? {
      ...prev,
      [provider]: { hasKey: true, preview: apiKey.slice(0, 6) + "…" + apiKey.slice(-4) }
    } : prev);
    toast({ title: `${cfg.name} verbunden`, description: "Du kannst jetzt Apps generieren." });
  }

  async function handleDelete(provider: string) {
    const res = await fetch("/api/settings/provider-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider, apiKey: "" }),
    });
    if (!res.ok) { toast({ title: "Fehler beim Entfernen", variant: "destructive" }); return; }
    const cfg = PROVIDERS.find(p => p.id === provider)!;
    setSettings(prev => prev ? { ...prev, [provider]: { hasKey: false, preview: null } } : prev);
    toast({ title: `${cfg.name} entfernt` });
  }

  return (
    <AppLayout>
      <div className="container max-w-2xl py-10 px-4 space-y-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Zurück
          </Link>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
            <p className="text-muted-foreground text-sm mt-1">Verbinde einen oder mehrere KI-Anbieter.</p>
          </div>
          {!isLoading && activeCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-primary/20 mt-1">
              {activeCount} {activeCount === 1 ? "Anbieter" : "Anbieter"} aktiv
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Lade Einstellungen…
          </div>
        ) : (
          <>
            {activeCount === 0 && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-500">Noch kein KI-Anbieter eingerichtet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Richte mindestens einen Anbieter ein — <strong className="text-foreground/70">Groq, Gemini und OpenRouter sind kostenlos</strong> und ohne Kreditkarte verfügbar.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">KI-Anbieter</p>
              <p className="text-xs text-muted-foreground -mt-1 px-0.5">
                KI Studio nutzt automatisch den besten verfügbaren Anbieter. Priorität: OpenRouter → Groq → Gemini → OpenAI → Pollinations (immer aktiv).
              </p>

              {/* Pollinations — built-in, always available */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3 pt-4 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">Pollinations AI</CardTitle>
                        <Badge className="text-[10px] px-1.5 py-0 border bg-primary/15 text-primary border-primary/20">Eingebaut · Kein Key nötig</Badge>
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        Kostenlos, kein Account, kein API-Key. Reasoning-Modell — gut für Code-Generierung geeignet.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span className="text-xs text-primary font-medium">Aktiv</span>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {settings && PROVIDERS.map(cfg => (
                <ProviderCard
                  key={cfg.id}
                  config={cfg}
                  status={settings[cfg.id]}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 p-3 rounded-xl border border-border/40 bg-muted/10">
          <Key className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <p className="text-xs text-muted-foreground/70">
            Alle API-Keys werden verschlüsselt in deinem Account gespeichert und nie weitergegeben.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
