import React, { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, LogOut, ChevronDown, Settings, LayoutDashboard, Layers } from "lucide-react";
import { useAuth } from "@workspace/auth-web";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminPanel } from "@/components/admin-panel";

const NAV_LINKS = [
  { href: "/", label: "Meine Apps", icon: LayoutDashboard },
  { href: "/vorlagen", label: "Vorlagen", icon: Layers },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = useCallback(async (e: React.MouseEvent) => {
    clickCountRef.current += 1;

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      e.preventDefault();

      if (isAdmin === null) {
        try {
          const res = await fetch("/api/admin/status", { credentials: "include", cache: "no-store" });
          const data = await res.json() as { isAdmin: boolean };
          setIsAdmin(data.isAdmin);
          if (data.isAdmin) setAdminOpen(true);
        } catch {
          setIsAdmin(false);
        }
      } else if (isAdmin) {
        setAdminOpen(true);
      }
    }
  }, [isAdmin]);

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 max-w-screen-xl items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity select-none shrink-0"
            onClick={handleLogoClick}
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">KI Studio</span>
          </Link>

          {user && (
            <nav className="flex items-center gap-0.5 flex-1">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const isActive = href === "/" ? location === "/" : location.startsWith(href);
                return (
                  <Link key={href} href={href}>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  </Link>
                );
              })}
            </nav>
          )}

          {user && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 h-8 px-2 text-muted-foreground hover:text-foreground"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.profileImageUrl ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/15 text-primary border border-primary/20">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm hidden sm:inline">
                      {user.firstName ?? user.email ?? "Konto"}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2.5 py-2">
                    <p className="text-sm font-medium leading-none">
                      {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Konto"}
                    </p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/einstellungen" className="gap-2 cursor-pointer">
                      <Settings className="h-3.5 w-3.5" />
                      Einstellungen
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="gap-2 text-muted-foreground focus:text-destructive"
                    data-testid="button-logout"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Abmelden
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}
