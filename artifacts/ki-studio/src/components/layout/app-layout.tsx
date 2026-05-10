import React from "react";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <Link href="/" className="flex items-center gap-2 mr-6 hover:opacity-80 transition-opacity">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight text-lg">KI Studio</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
