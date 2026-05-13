import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError("Ungültiger oder fehlender Token.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben."); return; }
    if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Fehler aufgetreten");
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/"), 3000);
    } catch {
      setError("Netzwerkfehler — bitte erneut versuchen");
    } finally {
      setLoading(false);
    }
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
              Zur Anmeldung
            </Link>
            <h1 className="text-2xl font-bold tracking-tight mt-3">Neues Passwort</h1>
            <p className="text-muted-foreground text-sm">Lege ein neues Passwort für dein Konto fest.</p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 space-y-5">
            {success ? (
              <div className="space-y-3 text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
                <p className="font-medium">Passwort erfolgreich geändert!</p>
                <p className="text-sm text-muted-foreground">Du wirst in wenigen Sekunden zur Anmeldung weitergeleitet…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm text-foreground/80">Neues Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mindestens 8 Zeichen"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    disabled={!token}
                    className="bg-card/60 border-border/60 focus:border-primary/50"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-sm text-foreground/80">Passwort bestätigen</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Nochmals eingeben"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    disabled={!token}
                    className="bg-card/60 border-border/60 focus:border-primary/50"
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading || !token || !password || !confirm}
                  className="w-full gap-2 h-10 font-medium"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Passwort ändern"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
