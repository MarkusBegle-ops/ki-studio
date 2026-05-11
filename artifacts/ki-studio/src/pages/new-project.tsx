import React, { useState, useId } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCreateProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Loader2, ArrowLeft, Calculator, ListTodo, BarChart3,
  Calendar, ShoppingCart, MessageSquare, BookOpen, Music,
  Link2, Sparkles, CheckCircle2, X, ChevronDown, ChevronUp,
  Plus, Merge, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  title: z.string().min(1, "Bitte gib einen Titel ein.").max(100),
  description: z.string().min(10, "Die Beschreibung sollte mindestens 10 Zeichen lang sein."),
});

const TEMPLATES = [
  { icon: ListTodo, title: "Aufgabenliste", description: "Eine To-Do App zum Verwalten von Aufgaben mit Prioritäten, Kategorien und Erledigungsstatus." },
  { icon: Calculator, title: "Taschenrechner", description: "Ein moderner Taschenrechner mit Grundrechenarten, Verlauf und wissenschaftlichen Funktionen." },
  { icon: BarChart3, title: "Dashboard", description: "Ein übersichtliches Analyse-Dashboard mit interaktiven Charts, KPIs und Filtermöglichkeiten." },
  { icon: Calendar, title: "Kalender", description: "Ein Monatskalender zum Planen von Terminen mit Farbkodierung und Erinnerungen." },
  { icon: ShoppingCart, title: "Einkaufsliste", description: "Eine Einkaufsliste mit Kategorien, Mengenangaben und der Möglichkeit, Artikel abzuhaken." },
  { icon: MessageSquare, title: "Feedback-Formular", description: "Ein professionelles Kontakt- und Feedback-Formular mit Bewertungssystem und Validierung." },
  { icon: BookOpen, title: "Notizblock", description: "Ein einfacher Notizblock mit automatischem Speichern, Stichwortsuche und Markdown-Unterstützung." },
  { icon: Music, title: "Playlist-Manager", description: "Eine App zum Erstellen und Verwalten von Musik-Playlists mit Songtiteln und Bewertungen." },
];

const MAX_URLS = 6;

interface AnalysisResult {
  url: string;
  title: string;
  description: string;
  features: string[];
  prompt: string;
}

type UrlResult =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; data: AnalysisResult }
  | { state: "error"; message: string };

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return t.startsWith("http://") || t.startsWith("https://") ? t : "https://" + t;
}

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const json = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Fehler");
  return json;
}

// ─── Expandable features list ────────────────────────────────────────────────
function FeatureList({ features }: { features: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? features : features.slice(0, 5);
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((f, i) => (
        <Badge key={i} variant="secondary" className="text-xs py-0 h-5 border border-border/50">{f}</Badge>
      ))}
      {features.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" />Weniger</> : <><ChevronDown className="w-3 h-3" />+{features.length - 5} weitere</>}
        </button>
      )}
    </div>
  );
}

// ─── Single URL result card ───────────────────────────────────────────────────
function ResultCard({
  result,
  index,
  onApply,
}: {
  result: AnalysisResult;
  index: number;
  onApply: (r: AnalysisResult) => void;
}) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5 animate-fade-in-up">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-sm font-semibold text-primary truncate">{result.title}</span>
          <span className="text-xs text-muted-foreground/60 shrink-0">URL {index + 1}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => onApply(result)}
        >
          Übernehmen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">{result.description}</p>
      <FeatureList features={result.features} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const uid = useId();

  const [urls, setUrls] = useState<string[]>(["", ""])
  const [lastAnalyzedUrls, setLastAnalyzedUrls] = useState<string[]>([]);
  const [results, setResults] = useState<UrlResult[]>([{ state: "idle" }, { state: "idle" }]);
  const [mergedResult, setMergedResult] = useState<AnalysisResult | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<"none" | "template" | "url" | "merged">("none");

  const createProject = useCreateProject();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "" },
  });

  // ── URL list management ───────────────────────────────────────────────────
  const setUrl = (i: number, val: string) => {
    setUrls(prev => { const n = [...prev]; n[i] = val; return n; });
  };

  const addUrl = () => {
    if (urls.length >= MAX_URLS) return;
    setUrls(prev => [...prev, ""]);
    setResults(prev => [...prev, { state: "idle" }]);
  };

  const removeUrl = (i: number) => {
    if (urls.length <= 1) return;
    setUrls(prev => prev.filter((_, idx) => idx !== i));
    setResults(prev => prev.filter((_, idx) => idx !== i));
    setMergedResult(null);
  };

  // ── Apply a result to the form ────────────────────────────────────────────
  const applyResult = (r: AnalysisResult, source: "url" | "merged") => {
    form.setValue("title", r.title, { shouldValidate: true });
    form.setValue("description", r.prompt, { shouldValidate: true });
    setSelectedTemplate(null);
    setActiveSource(source);
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setSelectedTemplate(t.title);
    setActiveSource("template");
    setMergedResult(null);
    form.setValue("title", t.title, { shouldValidate: true });
    form.setValue("description", t.description, { shouldValidate: true });
  };

  // ── Analyze all URLs in parallel ──────────────────────────────────────────
  const handleAnalyzeAll = async () => {
    const filledUrls = urls.map(normalizeUrl).filter(u => u.length > 0);
    if (filledUrls.length === 0) return;

    setIsAnalyzing(true);
    setMergedResult(null);

    // Mark all filled slots as loading
    const nextResults: UrlResult[] = urls.map(u =>
      normalizeUrl(u) ? { state: "loading" } : { state: "idle" },
    );
    setResults(nextResults);

    try {
      const response = await apiFetch<{
        results: Array<AnalysisResult | { url: string; error: string }>;
      }>("/api/analyze-urls", { urls: filledUrls });

      const updated: UrlResult[] = [...nextResults];
      let filled = false;
      let ri = 0;

      for (let i = 0; i < urls.length; i++) {
        const norm = normalizeUrl(urls[i]);
        if (!norm) continue;
        const r = response.results[ri++];
        if (!r) continue;

        if ("error" in r) {
          updated[i] = { state: "error", message: r.error };
        } else {
          updated[i] = { state: "success", data: r };
          // Auto-fill form with first success
          if (!filled) {
            applyResult(r, "url");
            filled = true;
          }
        }
      }
      setResults(updated);

      const successCount = updated.filter(r => r.state === "success").length;
      if (successCount > 0) {
        setLastAnalyzedUrls(filledUrls.filter((_, i) => updated[i]?.state === "success"));
      }
      toast({
        title: successCount > 0 ? `${successCount} URL${successCount > 1 ? "s" : ""} analysiert` : "Analyse abgeschlossen",
        description: successCount > 1
          ? "Du kannst einzelne Ergebnisse übernehmen oder alle zusammenführen."
          : successCount === 1
          ? "Formular wurde automatisch ausgefüllt."
          : "Keine URLs konnten analysiert werden.",
      });
    } catch (err) {
      setResults(prev => prev.map(r => r.state === "loading" ? { state: "error", message: "Analyse fehlgeschlagen." } : r));
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Analyse fehlgeschlagen.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Merge all successful results ──────────────────────────────────────────
  const handleMerge = async () => {
    const successResults = results
      .filter((r): r is { state: "success"; data: AnalysisResult } => r.state === "success")
      .map(r => r.data);

    if (successResults.length < 2) return;

    setIsMerging(true);
    try {
      const merged = await apiFetch<AnalysisResult>("/api/analyze-urls/merge", {
        analyses: successResults,
      });
      setMergedResult(merged);
      applyResult(merged, "merged");
      toast({
        title: "Zusammengeführt",
        description: `${successResults.length} Apps zu einer kombinierten App vereint.`,
      });
    } catch (err) {
      toast({
        title: "Fehler beim Zusammenführen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler.",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  const successCount = results.filter(r => r.state === "success").length;
  const hasAnyFilled = urls.some(u => u.trim().length > 0);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const sourceUrl = lastAnalyzedUrls.length === 1
      ? lastAnalyzedUrls[0]
      : lastAnalyzedUrls.length > 1
      ? lastAnalyzedUrls.join(", ")
      : undefined;
    createProject.mutate({ data: { ...values, sourceUrl } }, {
      onSuccess: (project) => {
        toast({ title: "Projekt erstellt" });
        setLocation(`/projekt/${project.id}`);
      },
      onError: () => {
        toast({ title: "Fehler", description: "Projekt konnte nicht erstellt werden.", variant: "destructive" });
      },
    });
  }

  return (
    <AppLayout>
      <div className="relative">
        <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

        <div className="relative container max-w-3xl py-10 px-4 space-y-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Zurück
            </Link>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <Wand2 className="w-5 h-5 text-primary" />
              Neues Projekt
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Wähle eine Vorlage, analysiere URLs oder beschreibe deine eigene Idee.
            </p>
          </div>

          {/* ── Multi-URL Analyzer ── */}
          <Card className="border-primary/25 bg-card/40 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-3 pt-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Apps von URLs analysieren</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Füge bis zu {MAX_URLS} Links ein — die KI analysiert alle gleichzeitig und kann sie zu einer App zusammenführen.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pb-4 space-y-3">
              {/* URL inputs */}
              <div className="space-y-2">
                {urls.map((url, i) => (
                  <div key={`${uid}-url-${i}`} className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                      <Input
                        value={url}
                        onChange={(e) => setUrl(i, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAnalyzeAll()}
                        placeholder={`https://beispiel${i + 1}.com`}
                        className="pl-8 bg-background/60 border-border/60 focus-visible:ring-primary/40 h-9 text-sm"
                        disabled={isAnalyzing}
                      />
                    </div>
                    {/* Status indicator */}
                    <div className="w-5 shrink-0 flex items-center justify-center">
                      {results[i]?.state === "loading" && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      )}
                      {results[i]?.state === "success" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                      )}
                      {results[i]?.state === "error" && (
                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      )}
                    </div>
                    {urls.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeUrl(i)}
                        disabled={isAnalyzing}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add URL + Analyze buttons */}
              <div className="flex gap-2 flex-wrap">
                {urls.length < MAX_URLS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40"
                    onClick={addUrl}
                    disabled={isAnalyzing}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    URL hinzufügen
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs gap-1.5 ml-auto"
                  onClick={handleAnalyzeAll}
                  disabled={!hasAnyFilled || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analysiere…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" />{urls.filter(u => u.trim()).length > 1 ? "Alle analysieren" : "Analysieren"}</>
                  )}
                </Button>
              </div>

              {/* Individual results */}
              {results.some(r => r.state === "success" || r.state === "error") && (
                <div className="space-y-2 pt-1">
                  {results.map((r, i) => {
                    if (r.state === "success") {
                      return (
                        <ResultCard
                          key={i}
                          result={r.data}
                          index={i}
                          onApply={(res) => applyResult(res, "url")}
                        />
                      );
                    }
                    if (r.state === "error") {
                      return (
                        <div key={i} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                          <span className="text-xs text-destructive/80 truncate">URL {i + 1}: {r.message}</span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              {/* Merge button — only when 2+ succeeded */}
              {successCount >= 2 && !mergedResult && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-sm gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50"
                    onClick={handleMerge}
                    disabled={isMerging}
                  >
                    {isMerging ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Führe zusammen…</>
                    ) : (
                      <><Merge className="w-4 h-4" />{successCount} Apps zu einer kombinieren</>
                    )}
                  </Button>
                </div>
              )}

              {/* Merged result card */}
              {mergedResult && (
                <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/8 to-primary/3 p-4 space-y-2.5 animate-fade-in-up">
                  <div className="flex items-center gap-2">
                    <Merge className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">{mergedResult.title}</span>
                    <Badge className="text-xs py-0 h-4 ml-auto bg-primary/15 text-primary border-primary/30">Kombiniert</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">{mergedResult.description}</p>
                  <FeatureList features={mergedResult.features} />
                  <p className="text-xs text-primary/60 italic">
                    Formular wurde mit der kombinierten App aktualisiert.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick templates */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Oder Schnellstart-Vorlage wählen
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const isSelected = selectedTemplate === t.title;
                return (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all duration-150 cursor-pointer group
                      ${isSelected
                        ? "border-primary/50 bg-primary/8 text-primary"
                        : "border-border/50 bg-card/40 hover:border-primary/25 hover:bg-card/60 text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Icon className={`w-5 h-5 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground/60 group-hover:text-primary/70"}`} />
                    <span className="text-xs font-medium leading-tight">{t.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Projektdetails</CardTitle>
              <CardDescription className="text-xs">
                {activeSource === "url" && "Von URL-Analyse ausgefüllt — du kannst es anpassen."}
                {activeSource === "merged" && "Aus kombinierten App-Analysen — du kannst es anpassen."}
                {activeSource === "template" && `Vorlage „${selectedTemplate}" ausgewählt — du kannst es anpassen.`}
                {activeSource === "none" && "Je genauer die Beschreibung, desto besser das Ergebnis."}
              </CardDescription>
            </CardHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <CardContent className="space-y-5">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Projekttitel</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="z.B. Persönliches Dashboard"
                            className="bg-background/60 focus-visible:ring-primary/40 border-border/60 h-10"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">
                          Beschreibung / Prompt
                          {activeSource === "merged" && (
                            <span className="ml-2 text-xs font-normal text-primary/70">(kombinierte KI-Analyse)</span>
                          )}
                          {activeSource === "url" && (
                            <span className="ml-2 text-xs font-normal text-primary/70">(von KI-Analyse)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Beschreibe detailliert, wie deine App aussehen und funktionieren soll — Stil, Features, Farben, Zielgruppe…"
                            className="min-h-[160px] bg-background/60 focus-visible:ring-primary/40 border-border/60 resize-y text-sm leading-relaxed"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter className="flex justify-between items-center border-t border-border/40 pt-5">
                  <Link href="/">
                    <Button variant="ghost" type="button" size="sm" className="text-muted-foreground">
                      Abbrechen
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    disabled={createProject.isPending}
                    className="gap-2 glow-primary-sm hover:glow-primary transition-all"
                  >
                    {createProject.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Erstelle…</>
                    ) : (
                      <><Wand2 className="w-4 h-4" />Projekt erstellen</>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
