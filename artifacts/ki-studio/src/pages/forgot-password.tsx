import React, { useState } from "react";
import { Link } from "wouter";
import { Sparkles, ArrowLeft, Mail, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { resetUrl?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Fehler aufgetreten");
        return;
      }
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch {
      setError("Netzwerkfehler — bitte erneut versuchen");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full bg-primary/4 blur-[140px]" />
      </div>
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />

      <header className="relative z-10 w-full border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="container flex h-14 max-w-screen-xl items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">KI Studio</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full space-y-8">
          <div className="space-y-2">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Zurück zur Anmeldung
            </Link>
            <h1 className="text-2xl font-bold tracking-tight mt-3">Passwort vergessen</h1>
            <p className="text-muted-foreground text-sm">
              Gib deine E-Mail-Adresse ein und erhalte einen Reset-Link.
            </p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 space-y-5">
            {!resetUrl ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm text-foreground/80">E-Mail-Adresse</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="du@beispiel.de"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="bg-card/60 border-border/60 focus:border-primary/50"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full gap-2 h-10 font-medium"
                >
                  <Mail className="w-4 h-4" />
                  {loading ? "Wird erstellt…" : "Reset-Link erstellen"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <KeyRound className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">Reset-Link erstellt</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Kopiere diesen Link und öffne ihn im Browser. Er ist <strong className="text-foreground/70">1 Stunde</strong> gültig.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 truncate font-mono text-foreground/80">
                    {resetUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0 gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Kopiert" : "Kopieren"}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => { setResetUrl(null); setEmail(""); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Anderen Link erstellen
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
