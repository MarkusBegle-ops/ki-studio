import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/auth-web";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NewProject from "@/pages/new-project";
import ProjectEditor from "@/pages/project-editor";
import Settings from "@/pages/settings";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Templates from "@/pages/templates";
import { Sparkles, Zap, Eye, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/vorlagen" component={Templates} />
      <Route path="/projekt/neu" component={NewProject} />
      <Route path="/projekt/:id" component={ProjectEditor} />
      <Route path="/einstellungen" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/passwort-vergessen" component={ForgotPassword} />
      <Route path="/passwort-zurücksetzen" component={ResetPassword} />
      <Route>
        <AuthGate>
          <Router />
        </AuthGate>
      </Route>
    </Switch>
  );
}

type AuthMode = "login" | "register";

function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { email, password };
      if (mode === "register" && firstName) body.firstName = firstName;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      let data: { error?: string } = {};
      try {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) data = await res.json() as { error?: string };
      } catch { /* ignore parse errors */ }
      if (!res.ok) {
        setError(data.error ?? "Unbekannter Fehler");
        return;
      }
      onSuccess();
    } catch {
      setError("Netzwerkfehler — bitte erneut versuchen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      {mode === "register" && (
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className="text-sm text-foreground/80">Vorname (optional)</Label>
          <Input
            id="firstName"
            type="text"
            placeholder="Max"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="bg-card/60 border-border/60 focus:border-primary/50"
            autoComplete="given-name"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm text-foreground/80">E-Mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="du@beispiel.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-card/60 border-border/60 focus:border-primary/50"
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm text-foreground/80">Passwort</Label>
        <Input
          id="password"
          type="password"
          placeholder={mode === "register" ? "Mindestens 8 Zeichen" : "Dein Passwort"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-card/60 border-border/60 focus:border-primary/50"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full gap-2 h-10 font-medium glow-primary-sm hover:glow-primary transition-all"
        data-testid="button-submit-auth"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : mode === "login" ? "Anmelden" : "Konto erstellen"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {mode === "login" ? (
          <>Noch kein Konto?{" "}
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className="text-primary hover:underline"
            >
              Registrieren
            </button>
          </>
        ) : (
          <>Bereits registriert?{" "}
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className="text-primary hover:underline"
            >
              Anmelden
            </button>
          </>
        )}
      </p>
      {mode === "login" && (
        <p className="text-center text-xs text-muted-foreground">
          <a href="/passwort-vergessen" className="text-muted-foreground hover:text-primary transition-colors">
            Passwort vergessen?
          </a>
        </p>
      )}
    </form>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, refetch } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground text-xs tracking-widest uppercase">Lädt…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground dark overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="orb-1 absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="orb-2 absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full bg-primary/4 blur-[140px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-blue-600/3 blur-[100px]" />
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
          <div className="max-w-md w-full space-y-10">
            <div className="text-center space-y-4 animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Kostenlos · Kein Code nötig · Sofort verfügbar
              </div>
              <h1 className="text-4xl font-bold tracking-tight leading-[1.1]">
                Deine Idee.<br />
                <span className="text-primary">KI baut sie.</span>
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed">
                Beschreibe was du brauchst — erhalte in Sekunden eine fertige Web-App.
              </p>
            </div>

            <div className="animate-fade-in-up animate-fade-in-up-delay-1 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 space-y-5">
              <AuthForm onSuccess={() => refetch()} />
            </div>

            <div className="grid grid-cols-3 gap-3 animate-fade-in-up animate-fade-in-up-delay-2">
              {[
                { icon: Zap, label: "KI generiert", desc: "vollständigen Code" },
                { icon: Eye, label: "Live-Vorschau", desc: "in Echtzeit" },
                { icon: Globe, label: "Veröffentlichen", desc: "mit einem Klick" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:border-primary/20 hover:bg-card/60 transition-all">
                  <Icon className="h-5 w-5 text-primary/80" />
                  <div>
                    <p className="text-xs font-semibold text-foreground/90">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <PublicRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
