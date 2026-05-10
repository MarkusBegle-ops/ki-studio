import React, { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  useListProjects,
  useGetProjectsSummary,
  useDeleteProject,
  getGetProjectsSummaryQueryKey,
  getListProjectsQueryKey
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
import { Plus, Code2, Globe, LayoutDashboard, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: summary, isLoading: isSummaryLoading } = useGetProjectsSummary({
    query: { queryKey: getGetProjectsSummaryQueryKey() }
  });

  const { data: projects, isLoading: isProjectsLoading } = useListProjects({
    query: { queryKey: getListProjectsQueryKey() }
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
        toast({ title: "Projekt gelöscht", description: "Das Projekt wurde erfolgreich entfernt." });
        setDeletingId(null);
      },
      onError: () => {
        toast({ title: "Fehler", description: "Projekt konnte nicht gelöscht werden.", variant: "destructive" });
        setDeletingId(null);
      }
    });
  };

  return (
    <AppLayout>
      <div className="container max-w-screen-xl py-8 px-4 md:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meine Projekte</h1>
            <p className="text-muted-foreground mt-1">Verwalte deine KI-generierten Anwendungen.</p>
          </div>
          <Link href="/projekt/neu">
            <Button className="gap-2 shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]" data-testid="button-new-project">
              <Plus className="w-4 h-4" />
              Neues Projekt
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Gesamtprojekte", icon: LayoutDashboard, value: summary?.total },
            { label: "Veröffentlicht", icon: Globe, value: summary?.published },
            { label: "Mit Code", icon: Code2, value: summary?.withCode },
          ].map(({ label, icon: Icon, value }) => (
            <Card key={label} className="bg-card/50 border-primary/20 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Icon className="w-12 h-12" /></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : value ?? 0}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Letzte Projekte</h2>
          {isProjectsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="bg-card/40 border-border/50">
                  <CardHeader>
                    <Skeleton className="h-5 w-2/3 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent><Skeleton className="h-4 w-24" /></CardContent>
                </Card>
              ))}
            </div>
          ) : !projects || projects.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center bg-card/20 border-dashed border-2">
              <Code2 className="w-12 h-12 text-muted-foreground mb-4" />
              <CardTitle className="text-lg mb-2">Noch keine Projekte</CardTitle>
              <CardDescription className="mb-6">
                Erstelle dein erstes Projekt, um KI-generierten Code zu erleben.
              </CardDescription>
              <Link href="/projekt/neu">
                <Button data-testid="button-start-project">Neues Projekt starten</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div key={project.id} className="group relative">
                  <Link href={`/projekt/${project.id}`} className="block" data-testid={`card-project-${project.id}`}>
                    <Card className="h-full bg-card/40 border-border/50 hover:border-primary/50 transition-all hover:bg-card/60 overflow-hidden group-hover:shadow-[0_0_15px_rgba(0,255,255,0.05)]">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start gap-4">
                          <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors pr-6">
                            {project.title}
                          </CardTitle>
                          <Badge variant={project.isPublished ? "default" : "secondary"} className={project.isPublished ? "bg-primary/20 text-primary border-primary/30 shrink-0" : "shrink-0"}>
                            {project.isPublished ? "Live" : "Entwurf"}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2 mt-2 h-10 text-xs">
                          {project.description}
                        </CardDescription>
                      </CardHeader>
                      <CardFooter className="text-xs text-muted-foreground pt-0 mt-auto justify-between">
                        <span>Erstellt {format(new Date(project.createdAt), "dd. MMM yyyy", { locale: de })}</span>
                        {project.htmlCode && (
                          <span className="text-primary/60 text-xs">Mit Code</span>
                        )}
                      </CardFooter>
                    </Card>
                  </Link>

                  {/* Delete button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 right-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 z-10"
                        data-testid={`button-delete-project-${project.id}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Das Projekt <strong>"{project.title}"</strong> wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
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
                          {deletingId === project.id ? "Lösche…" : "Endgültig löschen"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
