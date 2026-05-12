import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Link as LinkIcon, Paperclip, X, Image as ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttachedImage {
  name: string;
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  preview: string;
}

export default function ProjectEditor() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [isRefinement, setIsRefinement] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const prevStatusRef = useRef<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(id, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id),
      // Poll every 2.5 s while the AI is generating — stops automatically when done
      refetchInterval: (query) => {
        const status = (query.state.data as { generationStatus?: string } | undefined)?.generationStatus;
        return status === "generating" ? 2500 : false;
      },
    },
  });

  const generationStatus = (project as unknown as { generationStatus?: string } | undefined)?.generationStatus ?? "idle";
  const isGenerating = generationStatus === "generating";

  // Refresh iframe when generation finishes
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "generating" && generationStatus === "done") {
      setIframeKey((k) => k + 1);
      const convId = project?.conversationId;
      if (convId) {
        queryClient.invalidateQueries({ queryKey: getListAnthropicMessagesQueryKey(convId) });
      }
    }
    if (prev === "generating" && generationStatus === "error") {
      const errMsg = (project as unknown as { generationError?: string } | undefined)?.generationError;
      toast({ title: "Fehler", description: errMsg ?? "Code konnte nicht generiert werden.", variant: "destructive" });
    }
    prevStatusRef.current = generationStatus;
  }, [generationStatus, project, queryClient, toast]);

  const conversationId = project?.conversationId ?? 0;
  const { data: messages, isLoading: isMessagesLoading } = useListAnthropicMessages(conversationId, {
    query: {
      enabled: !!conversationId,
      queryKey: getListAnthropicMessagesQueryKey(conversationId),
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  const publishProject = usePublishProject();

  const handleGenerate = useCallback(async (promptOverride?: string, imagesOverride?: AttachedImage[]) => {
    const currentPrompt = promptOverride ?? prompt;
    const currentImages = imagesOverride ?? attachedImages;
    if (!currentPrompt.trim() || isGenerating) return;

    if (!promptOverride) {
      setPrompt("");
      setAttachedImages([]);
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview));
    }

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const body: Record<string, unknown> = { prompt: currentPrompt, isRefinement };
      if (currentImages.length > 0) {
        body.images = currentImages.map(img => ({
          data: img.data,
          mediaType: img.mediaType,
          name: img.name,
        }));
      }

      const res = await fetch(`${base}/api/projects/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Fehler bei der Anfrage");
      }

      // Immediately update query cache so UI shows "generating" without waiting for next poll
      queryClient.setQueryData(getGetProjectQueryKey(id), (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        return { ...old as object, generationStatus: "generating" };
      });

    } catch (err) {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannter Fehler", variant: "destructive" });
    }
  }, [prompt, attachedImages, isGenerating, isRefinement, id, queryClient, toast]);

  // Auto-generate when project was created from URL analysis and never generated before
  useEffect(() => {
    if (
      !autoGenTriggered &&
      project &&
      !isProjectLoading &&
      !project.htmlCode &&
      !project.conversationId &&
      project.sourceUrl &&
      project.description &&
      !isGenerating
    ) {
      setAutoGenTriggered(true);
      handleGenerate(project.description, []);
    }
  }, [project, isProjectLoading, autoGenTriggered, isGenerating, handleGenerate]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    const newImages: AttachedImage[] = [];

    for (const file of files) {
      if (!validTypes.includes(file.type as typeof validTypes[number])) {
        toast({ title: "Ungültiger Dateityp", description: `${file.name} wird nicht unterstützt. Erlaubt: JPG, PNG, GIF, WebP`, variant: "destructive" });
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Datei zu groß", description: `${file.name} überschreitet das 5 MB Limit.`, variant: "destructive" });
        continue;
      }

      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      newImages.push({
        name: file.name,
        data,
        mediaType: file.type as AttachedImage["mediaType"],
        preview: URL.createObjectURL(file),
      });
    }

    if (newImages.length > 0) {
      setAttachedImages(prev => [...prev, ...newImages]);
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
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
                {isGenerating && (
                  <Badge variant="outline" className="bg-primary/8 text-primary border-primary/20 text-xs py-0 h-4.5 shrink-0 leading-none gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Generiert…
                  </Badge>
                )}
                {!isGenerating && project.isPublished && (
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
                disabled={publishProject.isPending || !project.htmlCode || isGenerating}
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
          <div className="w-[380px] shrink-0 flex flex-col border-r border-border/50 bg-card/10">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">KI Assistent</span>
              {isGenerating && (
                <span className="ml-auto text-[10px] text-primary/60 flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Läuft im Hintergrund
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

              {/* URL source card */}
              {project.sourceUrl && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <LinkIcon className="w-3 h-3 text-primary/60 shrink-0" />
                    <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider">Analysierte URL</span>
                  </div>
                  <p className="text-xs text-foreground/70 break-all leading-relaxed">{project.sourceUrl}</p>
                </div>
              )}

              {/* Description card */}
              {project.description && (
                <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary/60 shrink-0" />
                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Projektbeschreibung</span>
                  </div>
                  <p className="text-xs text-foreground/70 leading-relaxed line-clamp-6">{project.description}</p>
                  {!project.conversationId && !project.htmlCode && !isGenerating && !autoGenTriggered && (
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs mt-1 glow-primary-sm"
                      onClick={() => {
                        setAutoGenTriggered(true);
                        handleGenerate(project.description, []);
                      }}
                    >
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      Jetzt generieren
                    </Button>
                  )}
                </div>
              )}

              {/* System greeting */}
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-card/60 border border-border/50 px-3 py-2.5 rounded-2xl rounded-tl-none max-w-[85%]">
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    {isGenerating
                      ? `KI arbeitet gerade — du kannst den Tab schließen und später zurückkommen.`
                      : project.htmlCode
                      ? `Projekt bereit. Beschreibe Änderungen — du kannst auch Bilder oder Screenshots anhängen.`
                      : project.sourceUrl
                      ? `Ich analysiere die URL und baue dir die App…`
                      : `Hallo! Beschreibe was ich bauen soll. Du kannst auch Bilder oder Screenshots anhängen.`}
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
                      ) : msg.content.startsWith("__HTML_VERSION_") ? (
                        <span className="text-primary/70 font-medium flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />
                          Version {msg.content.replace("__HTML_VERSION_", "").replace("__", "")} generiert ✓
                        </span>
                      ) : (
                        <span className="text-primary/70 font-medium flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />
                          Code generiert ✓
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Active generation indicator */}
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
                    <span className="text-xs text-muted-foreground">Generiert Code…</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/40 bg-background/40">
              {/* Image previews */}
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {attachedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img.preview}
                        alt={img.name}
                        className="w-16 h-16 rounded-lg object-cover border border-border/60 bg-muted/40"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

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
                    isGenerating
                      ? "KI generiert — Eingabe gesperrt…"
                      : isRefinement
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
                  disabled={(!prompt.trim() && attachedImages.length === 0) || isGenerating}
                  onClick={() => handleGenerate()}
                  data-testid="button-send"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/50 hover:text-muted-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isGenerating}
                        data-testid="button-attach"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bild anhängen (JPG, PNG, GIF, WebP · max. 5 MB)</TooltipContent>
                  </Tooltip>
                  {attachedImages.length > 0 && (
                    <span className="text-[10px] text-primary/60 font-medium">{attachedImages.length} Bild{attachedImages.length !== 1 ? "er" : ""}</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/30 pr-1">
                  {isGenerating ? "Generierung läuft im Hintergrund…" : "Shift + Enter für neue Zeile"}
                </p>
              </div>
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
                    Schreibe links was du bauen möchtest — oder lade ein Screenshot hoch.
                  </p>
                </div>
              ) : isGenerating && !project.htmlCode ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-5">
                    <Loader2 className="w-7 h-7 text-primary/40 animate-spin" />
                  </div>
                  <p className="text-base font-medium text-foreground/50 mb-2">KI generiert deinen Code…</p>
                  <p className="text-sm text-muted-foreground/40 max-w-xs leading-relaxed">
                    Du kannst den Tab schließen — die Generierung läuft im Hintergrund weiter.
                  </p>
                </div>
              ) : (
                <div className="absolute inset-3 bg-white rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5">
                  <iframe
                    key={iframeKey}
                    srcDoc={project.htmlCode ?? ""}
                    className="w-full h-full border-none"
                    title="Live Vorschau"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
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
