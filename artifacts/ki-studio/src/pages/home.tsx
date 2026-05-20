import React, { useState, useRef } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  useListProjects,
  useGetProjectsSummary,
  useDeleteProject,
  getGetProjectsSummaryQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Code2, Globe, LayoutDashboard, Trash2, Clock, ArrowRight, Pencil, Check, X, PackageOpen, Layers, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CARD_GRADIENTS = [
  "from-cyan-500/20 via-primary/10 to-blue-600/15",
  "from-violet-500/20 via-purple-500/10 to-indigo-600/15",
  "from-emerald-500/20 via-teal-500/10 to-cyan-600/15",
  "from-orange-500/20 via-amber-500/10 to-yellow-600/15",
  "from-rose-500/20 via-pink-500/10 to-fuchsia-600/15",
  "from-blue-500/20 via-sky-500/10 to-cyan-600/15",
  "from-indigo-500/20 via-violet-500/10 to-purple-600/15",
  "from-teal-500/20 via-emerald-500/10 to-green-600/15",
];

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return format(new Date(dateStr), "dd. MMM yyyy", { locale: de });
}

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { data: summary, isLoading: isSummaryLoading } = useGetProjectsSummary({
    query: { queryKey: getGetProjectsSummaryQueryKey() },
  });

  const { data: projects, isLoading: isProjectsLoading } = useListProjects({
    query: { queryKey: getListProjectsQueryKey() },
  });

  const deleteProject = useDeleteProject();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingId(id);
    deleteProject.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
        toast({ title: "Projekt gelöscht" });
        setDeletingId(null);
      },
      onError: () => {
        toast({ title: "Fehler beim Löschen", variant: "destructive" });
        setDeletingId(null);
      },
    });
  };

  function startRename(id: number, currentTitle: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.select(), 50);
  }

  async function handleRename(id: number) {
    const newTitle = renameValue.trim();
    const originalTitle = projects?.find(p => p.id === id)?.title ?? "";
    setRenamingId(null);
    if (!newTitle || newTitle === originalTitle) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Umbenennung gespeichert" });
      }
    } catch {
      toast({ title: "Fehler beim Umbenennen", variant: "destructive" });
    }
  }

  async function handleExport() {
    if (!projects || projects.length === 0) return;
    const withCode = projects.filter(p => p.htmlCode);
    if (withCode.length === 0) {
      toast({ title: "Keine Apps zum Exportieren", description: "Generiere zuerst mindestens eine App." });
      return;
    }
    setIsExporting(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder("ki-studio-apps");
      for (const p of withCode) {
        const safeName = p.title.replace(/[^a-z0-9äöüß\s-]/gi, "").trim().replace(/\s+/g, "_").toLowerCase();
        folder?.file(`${safeName}_${p.id}.html`, p.htmlCode ?? "");
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ki-studio-apps.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Export erfolgreich",
        description: `${withCode.length} App${withCode.length !== 1 ? "s" : ""} als ZIP exportiert.`,
      });
    } catch {
      toast({ title: "Fehler beim Export", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <AppLayout>
      <div className="relative">
        <div className="absolute inset-0 dot-grid opacity-25 pointer-events-none" />

        <div className="relative container max-w-screen-xl py-10 px-4 md:px-8 space-y-10">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Meine Projekte</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Alle deine KI-generierten Apps auf einen Blick.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/vorlagen">
                <Button variant="outline" className="gap-2 text-sm h-9 border-border/60 hover:border-primary/30">
                  <Layers className="w-4 h-4" />
                  <span className="hidden sm:inline">Vorlagen</span>
                </Button>
              </Link>
              {projects && projects.some(p => p.htmlCode) && (
                <Button
                  variant="outline"
                  className="gap-2 text-sm h-9 border-border/60 hover:border-primary/30"
                  onClick={handleExport}
                  disabled={isExporting}
                  data-testid="button-export"
                >
                  <PackageOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">{isExporting ? "Exportiert…" : "Exportieren"}</span>
                </Button>
              )}
              <Link href="/projekt/neu">
                <Button
                  className="gap-2 glow-primary-sm hover:glow-primary transition-all h-9"
                  data-testid="button-new-project"
                >
                  <Plus className="w-4 h-4" />
                  Neues Projekt
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 grid-cols-3">
            {[
              { label: "Projekte gesamt", icon: LayoutDashboard, value: summary?.total },
              { label: "Veröffentlicht", icon: Globe, value: summary?.published },
              { label: "Mit Code", icon: Code2, value: summary?.withCode },
            ].map(({ label, icon: Icon, value }) => (
              <Card
                key={label}
                className="bg-card/50 border-border/60 relative overflow-hidden"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className="w-4 h-4 text-muted-foreground/40" />
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="text-2xl font-bold tracking-tight">
                    {isSummaryLoading ? <Skeleton className="h-7 w-10" /> : (value ?? 0)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Projects */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Alle Projekte
            </h2>

            {isProjectsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="bg-card/40 border-border/50">
                    <CardHeader className="pb-3">
                      <Skeleton className="h-5 w-2/3 mb-2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardFooter><Skeleton className="h-3 w-32" /></CardFooter>
                  </Card>
                ))}
              </div>
            ) : !projects || projects.length === 0 ? (
              <Card className="flex flex-col items-center justify-center p-16 text-center bg-card/20 border-dashed border-2 border-border/40 hover:border-primary/20 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/15 flex items-center justify-center mb-5">
                  <Code2 className="w-7 h-7 text-primary/60" />
                </div>
                <h3 className="text-base font-semibold mb-2">Noch keine Projekte</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs leading-relaxed">
                  Starte dein erstes Projekt oder wähle eine Vorlage.
                </p>
                <div className="flex gap-2">
                  <Link href="/vorlagen">
                    <Button variant="outline" className="gap-2">
                      <Layers className="w-4 h-4" />
                      Vorlage wählen
                    </Button>
                  </Link>
                  <Link href="/projekt/neu">
                    <Button className="gap-2" data-testid="button-start-project">
                      <Plus className="w-4 h-4" />
                      Erstes Projekt starten
                    </Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project, i) => (
                  <div key={project.id} className="group relative" style={{ animationDelay: `${i * 40}ms` }}>

                    {renamingId === project.id ? (
                      /* Rename mode */
                      <Card className="h-full bg-card/70 border-primary/30 shadow-lg shadow-primary/5">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleRename(project.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              onBlur={() => handleRename(project.id)}
                              autoFocus
                              className="flex-1 text-sm font-semibold bg-transparent border-b border-primary/40 focus:outline-none focus:border-primary px-0 py-0.5"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-primary"
                              onMouseDown={e => { e.preventDefault(); handleRename(project.id); }}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onMouseDown={e => { e.preventDefault(); setRenamingId(null); }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <CardDescription className="line-clamp-2 mt-2 text-xs leading-relaxed min-h-[2.5rem]">
                            {project.description || <span className="italic opacity-60">Keine Beschreibung</span>}
                          </CardDescription>
                        </CardHeader>
                        <CardFooter className="pt-0 pb-4">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                            <Clock className="w-3 h-3" />
                            {format(new Date(project.createdAt), "dd. MMM yyyy", { locale: de })}
                          </div>
                        </CardFooter>
                      </Card>
                    ) : (
                      /* Normal view mode */
                      <Link href={`/projekt/${project.id}`} className="block" data-testid={`card-project-${project.id}`}>
                        <Card className="h-full bg-card/50 border-border/60 hover:border-primary/30 transition-all duration-200 hover:bg-card/70 hover:shadow-xl hover:shadow-primary/8 overflow-hidden group/card">
                          {/* Colored gradient strip + mini preview */}
                          <div className={`h-16 bg-gradient-to-br ${CARD_GRADIENTS[project.id % CARD_GRADIENTS.length]} relative overflow-hidden shrink-0`}>
                            <div className="absolute inset-0 flex items-center justify-center opacity-20">
                              <div className="flex gap-1.5">
                                {[...Array(6)].map((_, k) => (
                                  <div key={k} className="flex flex-col gap-1">
                                    {[...Array(4)].map((_, j) => (
                                      <div key={j} className="h-1 rounded-full bg-white" style={{ width: `${12 + ((project.id + k * 3 + j * 7) % 20)}px`, opacity: 0.4 + (j % 3) * 0.2 }} />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                            {project.htmlCode && (
                              <div className="absolute top-2 right-2">
                                <div className="bg-black/30 backdrop-blur-sm rounded-full px-1.5 py-0.5 flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-white/80" />
                                  <span className="text-[9px] text-white/80 font-medium">{Math.round((project.htmlCode?.length ?? 0) / 1000)}k</span>
                                </div>
                              </div>
                            )}
                            {project.isPublished && (
                              <div className="absolute top-2 left-2">
                                <div className="bg-black/30 backdrop-blur-sm rounded-full px-1.5 py-0.5 flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span className="text-[9px] text-white/80 font-medium">Live</span>
                                </div>
                              </div>
                            )}
                          </div>
                          <CardHeader className="pb-2 pt-3">
                            <div className="flex justify-between items-start gap-3">
                              <CardTitle className="text-sm font-semibold line-clamp-1 group-hover/card:text-primary transition-colors">
                                {project.title}
                              </CardTitle>
                              {!project.isPublished && (
                                <Badge variant="secondary" className="shrink-0 text-[10px] py-0 h-4 px-1.5 border border-border/50">
                                  Entwurf
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="line-clamp-2 mt-1 text-xs leading-relaxed min-h-[2.25rem]">
                              {project.description || <span className="italic opacity-60">Keine Beschreibung</span>}
                            </CardDescription>
                          </CardHeader>
                          <CardFooter className="pt-0 pb-3 flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                              <Clock className="w-2.5 h-2.5" />
                              {relativeTime(project.updatedAt ?? project.createdAt)}
                            </div>
                            <span className="text-[10px] text-primary/0 group-hover/card:text-primary/60 transition-colors flex items-center gap-0.5">
                              Öffnen <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </CardFooter>
                        </Card>
                      </Link>
                    )}

                    {/* Rename button */}
                    {renamingId !== project.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 right-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-primary hover:bg-primary/10 z-10"
                        onClick={(e) => startRename(project.id, project.title, e)}
                        data-testid={`button-rename-project-${project.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {/* Delete */}
                    {renamingId !== project.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-3 right-3 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 z-10"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            data-testid={`button-delete-project-${project.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>"{project.title}"</strong> wird dauerhaft gelöscht — das kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => handleDelete(project.id, e)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={deletingId === project.id}
                              data-testid={`button-confirm-delete-${project.id}`}
                            >
                              {deletingId === project.id ? "Lösche…" : "Löschen"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}

                {/* New project card */}
                <Link href="/projekt/neu" className="block group">
                  <Card className="h-full min-h-[140px] flex flex-col items-center justify-center bg-card/20 border-dashed border-2 border-border/30 hover:border-primary/30 transition-all duration-200 hover:bg-card/40 cursor-pointer">
                    <div className="w-9 h-9 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-center mb-2 group-hover:bg-primary/10 group-hover:border-primary/25 transition-all">
                      <Plus className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      Neues Projekt
                    </p>
                  </Card>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
