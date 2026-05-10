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
  AlertCircle, Download, ExternalLink, User, Bot, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) },
  });

  const conversationId = project?.conversationId ?? 0;
  const { data: messages, isLoading: isMessagesLoading } = useListAnthropicMessages(conversationId, {
    query: {
      enabled: !!conversationId,
      queryKey: getListAnthropicMessagesQueryKey(conversationId),
    },
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
        body: JSON.stringify({ prompt: currentPrompt, isRefinement }),
      });

      if (!res.ok) throw new Error("Fehler bei der Anfrage");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);

        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) {
              setGenerationStatus("Abgeschlossen");
              setIframeKey((k) => k + 1);
              queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
              if (conversationId) {
                queryClient.invalidateQueries({ queryKey: getListAnthropicMessagesQueryKey(conversationId) });
              }
              setTimeout(() => queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) }), 600);
            } else if (json.content) {
              setGenerationStatus("Generiert Code…");
            } else if (json.status) {
              setGenerationStatus(json.status);
            } else if (json.error) {
              throw new Error(json.error);
            }
          } catch {
            // ignore parse errors for incomplete chunks
          }
        }
      }
    } catch {
      toast({ title: "Fehler", description: "Code konnte nicht generiert werden.", variant: "destructive" });
      setGenerationStatus("Fehlgeschlagen");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenerationStatus(""), 2500);
    }
  };

  const handlePublish = () => {
    publishProject.mutate({ id }, {
      onSuccess: (data) => {
        toast({ title: "Veröffentlicht", description: "Deine App ist jetzt live." });
        queryClient.setQueryData(getGetProjectQueryKey(id), data);
      },
      onError: () => {
        toast({ title: "Fehler beim Veröffentlichen", variant: "destructive" });
      },
    });
  };

  const getPublicUrl = () => {
    if (!project?.publishedUrl) return "";
    return `${window.location.origin}${project.publishedUrl}`;
  };

  const copyLink = () => {
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
  };

  const openInNewTab = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.open(`${base}/api/projects/${id}/preview`, "_blank");
  };

  if (isProjectLoading) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Lädt Projekt…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-center p-4">
          <AlertCircle className="w-10 h-10 text-destructive/60 mb-4" />
          <h2 className="text-lg font-semibold mb-1">Projekt nicht gefunden</h2>
          <p className="text-sm text-muted-foreground mb-4">Dieses Projekt existiert nicht oder du hast keinen Zugriff.</p>
          <Link href="/" className="text-sm text-primary hover:underline">Zurück zur Übersicht</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/20 backdrop-blur-sm gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted/60 shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Zurück zur Übersicht</TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm truncate leading-tight">{project.title}</h2>
                {project.isPublished && (
                  <Badge variant="outline" className="bg-primary/8 text-primary border-primary/20 text-xs py-0 h-4.5 shrink-0 leading-none">
                    Live
                  </Badge>
                )}
              </div>
              {project.description && (
                <p className="text-xs text-muted-foreground/60 truncate leading-tight mt-0.5 hidden md:block max-w-[280px]">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 mr-1">
              <Switch
                id="refine-mode"
                checked={isRefinement}
                onCheckedChange={setIsRefinement}
                className="data-[state=checked]:bg-primary scale-90"
                data-testid="switch-refine-mode"
              />
              <Label htmlFor="refine-mode" className="text-xs font-medium cursor-pointer text-muted-foreground select-none">
                Verfeinern
              </Label>
            </div>

            {project.htmlCode && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleDownload} className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid="button-download">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>HTML herunterladen</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={openInNewTab} className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid="button-open-new-tab">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>In neuem Tab öffnen</TooltipContent>
                </Tooltip>
              </>
            )}

            {project.isPublished && project.publishedUrl ? (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => window.open(getPublicUrl(), "_blank")} className="h-8 gap-1.5 text-xs" data-testid="button-open-published">
                  <Globe className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Live-Link</span>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={copyLink} className="h-8 w-8" data-testid="button-copy-link">
                      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Link kopieren</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Button
                onClick={handlePublish}
                disabled={publishProject.isPending || !project.htmlCode}
                size="sm"
                className="h-8 gap-1.5 text-xs glow-primary-sm hover:glow-primary transition-all"
                data-testid="button-publish"
              >
                {publishProject.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>Veröffentlichen</span>
              </Button>
            )}
          </div>
        </div>

        {/* Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat */}
          <div className="w-[360px] shrink-0 flex flex-col border-r border-border/50 bg-card/10">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">KI Assistent</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* System greeting */}
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-card/60 border border-border/50 px-3 py-2.5 rounded-2xl rounded-tl-none max-w-[85%]">
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    {project.htmlCode
                      ? `Projekt bereit. Beschreibe Änderungen oder aktiviere "Verfeinern" für gezielte Anpassungen.`
                      : `Hallo! Beschreibe unten, was ich für dich bauen soll.`}
                  </p>
                </div>
              </div>

              {/* Message history */}
              {isMessagesLoading && conversationId ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-3/4 ml-auto rounded-2xl" />
                  <Skeleton className="h-8 w-2/3 rounded-2xl" />
                </div>
              ) : (
                messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
                      msg.role === "user"
                        ? "bg-muted/60 border-border/50"
                        : "bg-primary/10 border-primary/20"
                    }`}>
                      {msg.role === "user"
                        ? <User className="w-3 h-3 text-muted-foreground" />
                        : <Bot className="w-3 h-3 text-primary" />
                      }
                    </div>
                    <div className={`px-3 py-2.5 rounded-2xl max-w-[80%] text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary/12 border border-primary/20 rounded-tr-none text-foreground"
                        : "bg-card/60 border border-border/50 rounded-tl-none text-foreground/70"
                    }`}>
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <span className="text-primary/70 font-medium">Code generiert ✓</span>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Active generation */}
              {isGenerating && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                  <div className="bg-card/60 border border-border/50 px-3 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
                    </div>
                    <span className="text-xs text-muted-foreground">{generationStatus}</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/40 bg-background/40">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={
                    isRefinement
                      ? "Was soll geändert werden?"
                      : "Beschreibe, was die KI bauen soll…"
                  }
                  className="min-h-[80px] max-h-[160px] resize-none pr-11 text-sm bg-card/50 border-border/60 focus-visible:ring-primary/40 placeholder:text-muted-foreground/40 rounded-xl leading-relaxed"
                  disabled={isGenerating}
                  data-testid="input-prompt"
                />
                <Button
                  size="icon"
                  className="absolute bottom-2.5 right-2.5 h-7 w-7 rounded-lg"
                  disabled={!prompt.trim() || isGenerating}
                  onClick={handleGenerate}
                  data-testid="button-send"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/30 text-right mt-1.5 pr-1">
                Shift + Enter für neue Zeile
              </p>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col bg-[#0a0c12] overflow-hidden">
            {/* Browser chrome */}
            <div className="h-9 shrink-0 bg-card/60 border-b border-border/40 flex items-center px-3 gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
              </div>
              <div className="flex-1 mx-2">
                <div className="bg-background/50 border border-border/40 rounded-md px-2.5 py-0.5 text-[11px] text-muted-foreground/50 font-mono truncate max-w-xs mx-auto text-center">
                  {project.isPublished ? getPublicUrl() : "vorschau"}
                </div>
              </div>
              {project.htmlCode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openInNewTab}
                  className="h-6 w-6 text-muted-foreground/40 hover:text-muted-foreground shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}
            </div>

            {/* Preview content */}
            <div className="flex-1 relative overflow-hidden">
              {!project.htmlCode && !isGenerating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-5">
                    <Sparkles className="w-7 h-7 text-primary/30" />
                  </div>
                  <p className="text-base font-medium text-foreground/50 mb-2">Bereit für deine Anweisungen</p>
                  <p className="text-sm text-muted-foreground/40 max-w-xs leading-relaxed">
                    Schreibe links was du bauen möchtest. Die KI generiert sofort eine Live-Vorschau.
                  </p>
                </div>
              ) : (
                <div className="absolute inset-3 bg-white rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5">
                  <iframe
                    key={iframeKey}
                    src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/projects/${id}/preview`}
                    className="w-full h-full border-none"
                    title="Live Vorschau"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-[3px] flex items-center justify-center">
                      <div className="bg-card/95 backdrop-blur-sm border border-primary/20 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
                          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
                          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
                        </div>
                        <span className="text-xs font-medium text-foreground/80">KI generiert…</span>
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
