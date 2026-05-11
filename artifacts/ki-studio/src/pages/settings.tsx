import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Key, CheckCircle2, Trash2, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface SettingsData {
  hasOpenaiKey: boolean;
  openaiKeyPreview: string | null;
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include", cache: "no-store" })
      .then(r => r.json() as Promise<SettingsData>)
      .then(setSettings)
      .catch(() => setSettings({ hasOpenaiKey: false, openaiKeyPreview: null }))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      setSettings({ hasOpenaiKey: true, openaiKeyPreview: "sk-…" + apiKey.trim().slice(-4) });
      setApiKey("");
      toast({ title: "API-Key gespeichert", description: "Du kannst jetzt Apps mit KI generieren." });
    } catch (err) {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : "Speichern fehlgeschlagen.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/settings/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: "" }),
      });
      if (!res.ok) throw new Error("Fehler");
      setSettings({ hasOpenaiKey: false, openaiKeyPreview: null });
      toast({ title: "API-Key entfernt" });
    } catch {
      toast({ title: "Fehler beim Entfernen", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
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

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground text-sm mt-1">Verwalte deinen Account und API-Zugang.</p>
        </div>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Key className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">OpenAI API-Key</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Wird für KI-Generierung und URL-Analyse benötigt.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lade Einstellungen…
              </div>
            ) : settings?.hasOpenaiKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">API-Key hinterlegt</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{settings.openaiKeyPreview}</p>
                  </div>
                  <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">Aktiv</Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Key ersetzen</p>
                  <form onSubmit={handleSave} className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="sk-…"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="flex-1 bg-background/60 border-border/60 focus-visible:ring-primary/40 font-mono text-sm h-9"
                    />
                    <Button type="submit" size="sm" className="h-9" disabled={!apiKey.trim() || isSaving}>
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
                    </Button>
                  </form>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground/60 hover:text-destructive gap-1.5 h-7 px-2"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Key entfernen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-500">Kein API-Key hinterlegt</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ohne API-Key kann die KI keine Apps generieren oder URLs analysieren.
                    </p>
                  </div>
                </div>
                <form onSubmit={handleSave} className="space-y-3">
                  <Input
                    type="password"
                    placeholder="sk-proj-…"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="bg-background/60 border-border/60 focus-visible:ring-primary/40 font-mono text-sm h-10"
                    autoFocus
                  />
                  <Button type="submit" className="w-full gap-2" disabled={!apiKey.trim() || isSaving}>
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    API-Key speichern
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  Du findest deinen Key unter{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    platform.openai.com/api-keys
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  . Der Key wird verschlüsselt gespeichert.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
