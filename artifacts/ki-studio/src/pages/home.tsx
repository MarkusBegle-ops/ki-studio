import React from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  useListProjects,
  useGetProjectsSummary,
  getGetProjectsSummaryQueryKey,
  getListProjectsQueryKey
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Code2, Globe, LayoutDashboard } from "lucide-react";

export default function Home() {
  const { data: summary, isLoading: isSummaryLoading } = useGetProjectsSummary({
    query: { queryKey: getGetProjectsSummaryQueryKey() }
  });

  const { data: projects, isLoading: isProjectsLoading } = useListProjects({
    query: { queryKey: getListProjectsQueryKey() }
  });

  return (
    <AppLayout>
      <div className="container max-w-screen-xl py-8 px-4 md:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meine Projekte</h1>
            <p className="text-muted-foreground mt-1">Verwalten Sie Ihre KI-generierten Anwendungen.</p>
          </div>
          <Link href="/projekt/neu" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]">
            <Plus className="w-4 h-4" />
            Neues Projekt
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-card/50 border-primary/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><LayoutDashboard className="w-12 h-12" /></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamtprojekte</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.total || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-primary/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Globe className="w-12 h-12" /></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Veröffentlicht</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.published || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-primary/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Code2 className="w-12 h-12" /></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mit Code</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.withCode || 0}
              </div>
            </CardContent>
          </Card>
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
                  <CardContent>
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !projects || projects.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center bg-card/20 border-dashed border-2">
              <Code2 className="w-12 h-12 text-muted-foreground mb-4" />
              <CardTitle className="text-lg mb-2">Noch keine Projekte</CardTitle>
              <CardDescription className="mb-6">
                Erstellen Sie Ihr erstes Projekt, um KI-generierten Code zu erleben.
              </CardDescription>
              <Link href="/projekt/neu" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                Neues Projekt starten
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/projekt/${project.id}`} className="block group">
                  <Card className="h-full bg-card/40 border-border/50 hover:border-primary/50 transition-all hover:bg-card/60 relative overflow-hidden group-hover:shadow-[0_0_15px_rgba(0,255,255,0.05)]">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-4">
                        <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{project.title}</CardTitle>
                        <Badge variant={project.isPublished ? "default" : "secondary"} className={project.isPublished ? "bg-primary/20 text-primary border-primary/30" : ""}>
                          {project.isPublished ? "Veröffentlicht" : "Entwurf"}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2 mt-2 h-10 text-xs">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="text-xs text-muted-foreground pt-0 mt-auto">
                      Erstellt am {format(new Date(project.createdAt), "dd. MMM yyyy", { locale: de })}
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
