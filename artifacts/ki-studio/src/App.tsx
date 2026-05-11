import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NewProject from "@/pages/new-project";
import ProjectEditor from "@/pages/project-editor";
import { Sparkles, Zap, Eye, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/projekt/neu" component={NewProject} />
      <Route path="/projekt/:id" component={ProjectEditor} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

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
        {/* Ambient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="orb-1 absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="orb-2 absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full bg-primary/4 blur-[140px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-blue-600/3 blur-[100px]" />
        </div>
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />

        {/* Header */}
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

        {/* Hero + Form */}
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

            {/* Auth card */}
            <div className="animate-fade-in-up animate-fade-in-up-delay-1 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 space-y-5">
              <Button
                onClick={login}
                className="w-full gap-2 h-10 font-medium glow-primary-sm hover:glow-primary transition-all"
                data-testid="button-login"
              >
                Kostenlos anmelden
              </Button>
            </div>

            {/* Feature tiles */}
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
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
