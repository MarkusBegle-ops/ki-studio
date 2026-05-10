import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetProject, 
  getGetProjectQueryKey,
  usePublishProject,
  useUpdateProject
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, Send, Globe, Copy, Check, TerminalSquare, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function ProjectEditor() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [isRefinement, setIsRefinement] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) }
  });

  const publishProject = usePublishProject();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [generationStatus]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    
    setIsGenerating(true);
    setGenerationStatus("Starte Generierung...");
    
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/projects/${id}/generate`.replace('//', '/'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, isRefinement })
      });
      
      if (!res.ok) {
        throw new Error("Fehler bei der Anfrage");
      }
      
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let completeCode = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.done) {
                setGenerationStatus("Abgeschlossen!");
                setIframeKey(k => k + 1); // reload iframe
                // Invalidate query to get updated project state with HTML code
                queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
              } else if (json.content) {
                setGenerationStatus("Generiere Code...");
                completeCode += json.content;
              } else if (json.status) {
                setGenerationStatus(json.status);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
      setPrompt("");
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Code konnte nicht generiert werden.",
        variant: "destructive"
      });
      setGenerationStatus("Fehlgeschlagen");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenerationStatus(""), 3000);
    }
  };

  const handlePublish = () => {
    publishProject.mutate({ id }, {
      onSuccess: (data) => {
        toast({
          title: "Erfolgreich veröffentlicht",
          description: "Ihr Projekt ist nun live.",
        });
        queryClient.setQueryData(getGetProjectQueryKey(id), data);
      },
      onError: () => {
        toast({
          title: "Fehler",
          description: "Veröffentlichung fehlgeschlagen.",
          variant: "destructive"
        });
      }
    });
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isProjectLoading) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-center p-4">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Projekt nicht gefunden</h2>
          <Link href="/" className="mt-4 text-primary hover:underline">Zurück zur Übersicht</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background">
        {/* Editor Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/30">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h2 className="font-semibold text-lg flex items-center gap-2">
                {project.title}
                {project.isPublished && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs py-0 h-5">Live</Badge>
                )}
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <Switch 
                id="refine-mode" 
                checked={isRefinement}
                onCheckedChange={setIsRefinement}
                className="data-[state=checked]:bg-primary"
              />
              <Label htmlFor="refine-mode" className="text-sm font-medium cursor-pointer">Verfeinern</Label>
            </div>
            
            {project.isPublished && project.publishedUrl ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(project.publishedUrl!, '_blank')} className="h-9">
                  <Globe className="w-4 h-4 mr-2" />
                  Öffnen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => copyToClipboard(project.publishedUrl!)} className="h-9 w-9 p-0">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <Button 
                onClick={handlePublish} 
                disabled={publishProject.isPending || !project.htmlCode}
                className="shadow-[0_0_10px_rgba(0,255,255,0.15)] hover:shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all h-9"
              >
                {publishProject.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                Veröffentlichen
              </Button>
            )}
          </div>
        </div>

        {/* Main Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Chat / Prompt */}
          <div className="w-[400px] flex flex-col border-r border-border/50 bg-card/20 z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
            <div className="p-4 border-b border-border/30 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TerminalSquare className="w-4 h-4" />
              KI Kommandozentrale
            </div>
            
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-6 pb-4">
                <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg rounded-tl-none">
                  <h3 className="font-semibold text-primary mb-1 text-sm">System</h3>
                  <p className="text-sm text-foreground/90">
                    {project.htmlCode 
                      ? "Der Code wurde generiert. Nutzen Sie das Eingabefeld unten, um Änderungen vorzunehmen, oder verfeinern Sie spezifische Details."
                      : `Das Projekt "${project.title}" wurde erstellt. Geben Sie unten Ihre Anweisungen ein, um den ersten Entwurf zu generieren.`}
                  </p>
                </div>

                {isGenerating && (
                  <div className="bg-card border border-border p-4 rounded-lg rounded-tr-none ml-8 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm font-medium text-foreground/80">{generationStatus}</span>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-4 bg-background border-t border-border/50">
              <div className="relative">
                <Textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={isRefinement ? "Was soll am aktuellen Code geändert werden?" : "Beschreiben Sie, was die KI bauen soll..."}
                  className="min-h-[100px] resize-none pr-12 bg-card/50 focus-visible:ring-primary border-primary/20 placeholder:text-muted-foreground/50"
                  disabled={isGenerating}
                />
                <Button 
                  size="icon" 
                  className="absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-[0_0_10px_rgba(0,255,255,0.2)]" 
                  disabled={!prompt.trim() || isGenerating}
                  onClick={handleGenerate}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/50 text-center mt-2">
                Shift + Enter für neue Zeile
              </p>
            </div>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="flex-1 relative bg-black/40 overflow-hidden flex flex-col">
            <div className="h-10 bg-card/80 border-b border-border/50 flex items-center px-4 shadow-sm z-10">
              <div className="flex space-x-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="mx-auto bg-background/60 text-xs text-muted-foreground px-3 py-1 rounded-md border border-border/50 font-mono">
                vorschau.kistudio.app
              </div>
            </div>
            <div className="flex-1 relative p-4 lg:p-8">
              {!project.htmlCode && !isGenerating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
                  <TerminalSquare className="w-16 h-16 opacity-20 mb-6" />
                  <p className="text-lg font-medium text-foreground/70 mb-2">Bereit für Ihre Anweisungen</p>
                  <p className="text-sm max-w-md mx-auto">
                    Geben Sie im linken Bereich ein, was Sie bauen möchten. Die KI wird in Echtzeit Code generieren und hier als Live-Vorschau anzeigen.
                  </p>
                </div>
              ) : (
                <div className="w-full h-full bg-white rounded-lg overflow-hidden border border-border shadow-2xl relative ring-1 ring-primary/20">
                  <iframe 
                    key={iframeKey}
                    ref={iframeRef}
                    src={`${import.meta.env.BASE_URL}api/projects/${id}/preview`}
                    className="w-full h-full border-none bg-white"
                    title="Live Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                      <div className="bg-card/90 text-foreground px-4 py-2 rounded-full border border-primary/30 shadow-[0_0_20px_rgba(0,255,255,0.15)] flex items-center gap-3 backdrop-blur-md">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium tracking-wider">AKTUALISIERE</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
