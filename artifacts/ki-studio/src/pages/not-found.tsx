import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background dark text-foreground">
      <div className="text-center space-y-4">
        <p className="text-7xl font-bold text-primary/20">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Seite nicht gefunden</h1>
        <p className="text-muted-foreground text-sm">Diese Seite existiert nicht oder wurde verschoben.</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-4">
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Übersicht
        </Link>
      </div>
    </div>
  );
}
