import React from "react";
import { Link } from "wouter";
import { Sparkles, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 max-w-screen-xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">KI Studio</span>
          </Link>

          {user && (
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
          )}
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
