import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  getGetProjectQueryKey,
  usePublishProject,
  useListAnthropicMessages,
  getListAnthropicMessagesQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, ArrowLeft, Send, Globe, Copy, Check,
  TerminalSquare, AlertCircle, Download, ExternalLink, User, Bot
} from "lucide-react";
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
  const [linkCopied, setLinkCopied] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) }
  });

  const conversationId = project?.conversationId ?? 0;
  const { data: messages, isLoading: isMessagesLoading } = useListAnthropicMessages(conversationId, {
    query: {
      enabled: !!conversationId,
      queryKey: getListAnthropicMessagesQueryKey(conversationId),
      refetchInterval: false,
    }
  });

  const publishProject = usePublishProject();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating, generationStatus]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    const currentPrompt = prompt;
    setPrompt("");
    setIsGenerating(true);
    setGenerationStatus("Starte Generierung…");

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/projects/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: currentPrompt, isRefinement })
      });

      if (!res.ok) {
        throw new Error("Fehler bei der Anfrage");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

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
                setIframeKey(k => k + 1);
                queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
                if (project?.conversationId) {
                  queryClient.invalidateQueries({ queryKey: getListAnthropicMessagesQueryKey(project.conversationId) });
                }
                // After generation a conversationId will exist — refresh project to get it
                setTimeout(() => {
                  queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
                }, 500);
              } else if (json.content) {
                setGenerationStatus("Generiere Code…");
              } else if (json.status) {
                setGenerationStatus(json.status);
              } else if (json.error) {
                throw new Error(json.error);
              }
            } catch (e) {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }
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
        toast({ title: "Erfolgreich veröffentlicht", description: "Deine App ist jetzt live erreichbar." });
        queryClient.setQueryData(getGetProjectQueryKey(id), data);
      },
      onError: () => {
        toast({ title: "Fehler", description: "Veröffentlichung fehlgeschlagen.", variant: "destructive" });
      }
    });
  };

  const getPublicUrl = () => {
    if (!project?.publishedUrl) return "";
    const domain = window.location.origin;
    return `${domain}${project.publishedUrl}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(getPublicUrl());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyPublishedUrl = () => {
    navigator.clipboard.writeText(getPublicUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!project?.htmlCode) return;
    const blob = new Blob([project.htmlCode], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Heruntergeladen", description: "HTML-Datei wurde gespeichert." });
  };

  const openInNewTab = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.open(`${base}/api/projects/${id}/preview`, "_blank");
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

  const userMessages = messages?.filter(m => m.role === "user") ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/30 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h2 className="font-semibold text-lg flex items-center gap-2 truncate">
                <span className="truncate">{project.title}</span>
                {project.isPublished && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs py-0 h-5 shrink-0">Live</Badge>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center space-x-2">
              <Switch
                id="refine-mode"
                checked={isRefinement}
                onCheckedChange={setIsRefinement}
                className="data-[state=checked]:bg-primary"
                data-testid="switch-refine-mode"
              />
              <Label htmlFor="refine-mode" className="text-sm font-medium cursor-pointer hidden sm:inline">Verfeinern</Label>
            </div>

            {project.htmlCode && (
              <>
                <Button variant="ghost" size="icon" onClick={handleDownload} className="h-9 w-9" title="HTML herunterladen" data-testid="button-download">
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={openInNewTab} className="h-9 w-9" title="In neuem Tab öffnen" data-testid="button-open-new-tab">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </>
            )}

            {project.isPublished && project.publishedUrl ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(getPublicUrl(), '_blank')} className="h-9 gap-2" data-testid="button-open-published">
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">Öffnen</span>
                </Button>
                <Button variant="secondary" size="icon" onClick={copyPublishedUrl} className="h-9 w-9" data-testid="button-copy-link">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handlePublish}
                disabled={publishProject.isPending || !project.htmlCode}
                className="shadow-[0_0_10px_rgba(0,255,255,0.15)] hover:shadow-[0_0_20px_rgba(0,255,255,0.3)] h-9 gap-2"
                data-testid="button-publish"
              >
                {publishProject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                <span className="hidden sm:inline">Veröffentlichen</span>
              </Button>
            )}
          </div>
        </div>

        {/* Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat Panel */}
          <div className="w-[380px] flex flex-col border-r border-border/50 bg-card/20 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
            <div className="p-4 border-b border-border/30 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TerminalSquare className="w-4 h-4" />
              KI Kommandozentrale
            </div>

            {/* Message history */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Initial system message */}
              <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg rounded-tl-none">
                <p className="text-xs font-semibold text-primary mb-1">System</p>
                <p className="text-sm text-foreground/80">
                  {project.htmlCode
                    ? `Projekt "${project.title}" ist bereit. Schalte "Verfeinern" ein für gezielte Änderungen.`
                    : `Projekt "${project.title}" wurde erstellt. Beschreibe was die KI bauen soll.`}
                </p>
              </div>

              {/* Conversation history */}
              {isMessagesLoading && conversationId ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg ml-4" />
                </div>
              ) : (
                messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={msg.role === "user"
                      ? "flex gap-2 justify-end"
                      : "flex gap-2 justify-start"
                    }
                    data-testid={`message-${msg.role}-${msg.id}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-3 h-3 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      msg.role === "user"
                        ? "bg-primary/15 border border-primary/25 text-foreground rounded-br-none"
                        : "bg-card border border-border/60 text-foreground/80 rounded-bl-none"
                    }`}>
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Code generiert ✓</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Active generation indicator */}
              {isGenerating && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-primary animate-pulse" />
                  </div>
                  <div className="bg-card border border-border/60 px-3 py-2 rounded-xl rounded-bl-none flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{generationStatus}</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 bg-background border-t border-border/50">
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={isRefinement
                    ? "Was soll am aktuellen Code geändert werden?"
                    : "Beschreibe, was die KI bauen soll…"}
                  className="min-h-[90px] resize-none pr-12 bg-card/50 focus-visible:ring-primary border-primary/20 placeholder:text-muted-foreground/50 text-sm"
                  disabled={isGenerating}
                  data-testid="input-prompt"
                />
                <Button
                  size="icon"
                  className="absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-[0_0_10px_rgba(0,255,255,0.2)]"
                  disabled={!prompt.trim() || isGenerating}
                  onClick={handleGenerate}
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/40 text-center mt-2">
                Shift + Enter für neue Zeile
              </p>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 relative bg-black/40 overflow-hidden flex flex-col">
            <div className="h-10 bg-card/80 border-b border-border/50 flex items-center px-4 shadow-sm">
              <div className="flex space-x-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="mx-auto bg-background/60 text-xs text-muted-foreground px-3 py-1 rounded-md border border-border/50 font-mono truncate max-w-xs">
                {project.isPublished ? getPublicUrl() || "vorschau" : "vorschau"}
              </div>
              {project.htmlCode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openInNewTab}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                  title="In neuem Tab öffnen"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex-1 relative p-4 lg:p-6">
              {!project.htmlCode && !isGenerating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
                  <TerminalSquare className="w-16 h-16 opacity-20 mb-6" />
                  <p className="text-lg font-medium text-foreground/70 mb-2">Bereit für deine Anweisungen</p>
                  <p className="text-sm max-w-md">
                    Gib links ein, was du bauen möchtest. Die KI generiert in Echtzeit Code und zeigt ihn hier als Live-Vorschau an.
                  </p>
                </div>
              ) : (
                <div className="w-full h-full bg-white rounded-lg overflow-hidden border border-border shadow-2xl relative ring-1 ring-primary/20">
                  <iframe
                    key={iframeKey}
                    src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/projects/${id}/preview`}
                    className="w-full h-full border-none bg-white"
                    title="Live Vorschau"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                      <div className="bg-card/95 text-foreground px-5 py-2.5 rounded-full border border-primary/30 shadow-[0_0_20px_rgba(0,255,255,0.2)] flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                        <span className="text-sm font-medium tracking-wide">KI generiert…</span>
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
