import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NewProject from "@/pages/new-project";
import ProjectEditor from "@/pages/project-editor";
import { Sparkles, LogIn } from "lucide-react";
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
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="h-10 w-10 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm">Wird geladen…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground dark">
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur">
          <div className="container flex h-14 max-w-screen-2xl items-center">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-bold tracking-tight text-lg">KI Studio</span>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="h-10 w-10 text-primary" />
                  </div>
                </div>
              </div>
              <h1 className="text-4xl font-bold tracking-tight">KI Studio</h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Beschreibe deine App — die KI baut sie für dich.
                <br />
                Keine Programmierkenntnisse erforderlich.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                onClick={login}
                size="lg"
                className="w-full gap-2 text-base h-12"
                data-testid="button-login"
              >
                <LogIn className="h-5 w-5" />
                Anmelden und loslegen
              </Button>
              <p className="text-xs text-muted-foreground">
                Deine Projekte sind privat und nur für dich sichtbar.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                { icon: "✦", label: "KI generiert Code" },
                { icon: "⬡", label: "Live-Vorschau" },
                { icon: "↑", label: "Ein-Klick-Publish" },
              ].map((f) => (
                <div key={f.label} className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border/40 bg-card/50">
                  <span className="text-primary text-xl">{f.icon}</span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">{f.label}</span>
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
