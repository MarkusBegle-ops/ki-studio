import React, { useState } from "react";
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
import { Wand2, Loader2, ArrowLeft, Calculator, ListTodo, BarChart3, Calendar, ShoppingCart, MessageSquare, BookOpen, Music } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  title: z.string().min(1, "Bitte gib einen Titel ein.").max(100),
  description: z.string().min(10, "Die Beschreibung sollte mindestens 10 Zeichen lang sein."),
});

const TEMPLATES = [
  {
    icon: ListTodo,
    title: "Aufgabenliste",
    description: "Eine To-Do App zum Verwalten von Aufgaben mit Prioritäten, Kategorien und Erledigungsstatus.",
  },
  {
    icon: Calculator,
    title: "Taschenrechner",
    description: "Ein moderner Taschenrechner mit Grundrechenarten, Verlauf und wissenschaftlichen Funktionen.",
  },
  {
    icon: BarChart3,
    title: "Dashboard",
    description: "Ein übersichtliches Analyse-Dashboard mit interaktiven Charts, KPIs und Filtermöglichkeiten.",
  },
  {
    icon: Calendar,
    title: "Kalender",
    description: "Ein Monatskalender zum Planen von Terminen mit Farbkodierung und Erinnerungen.",
  },
  {
    icon: ShoppingCart,
    title: "Einkaufsliste",
    description: "Eine Einkaufsliste mit Kategorien, Mengenangaben und der Möglichkeit, Artikel abzuhaken.",
  },
  {
    icon: MessageSquare,
    title: "Feedback-Formular",
    description: "Ein professionelles Kontakt- und Feedback-Formular mit Bewertungssystem und Validierung.",
  },
  {
    icon: BookOpen,
    title: "Notizblock",
    description: "Ein einfacher Notizblock mit automatischem Speichern, Stichwortsuche und Markdown-Unterstützung.",
  },
  {
    icon: Music,
    title: "Playlist-Manager",
    description: "Eine App zum Erstellen und Verwalten von Musik-Playlists mit Songtiteln und Bewertungen.",
  },
];

export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const createProject = useCreateProject();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "" },
  });

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template.title);
    form.setValue("title", template.title, { shouldValidate: true });
    form.setValue("description", template.description, { shouldValidate: true });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    createProject.mutate({ data: values }, {
      onSuccess: (project) => {
        toast({ title: "Projekt erstellt", description: "Leite weiter zum Editor…" });
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
              Wähle eine Vorlage oder beschreibe deine eigene Idee.
            </p>
          </div>

          {/* Templates */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Schnellstart-Vorlagen
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
                Je genauer deine Beschreibung, desto besser das Ergebnis.
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
                        <FormLabel className="text-sm">Beschreibung</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Beschreibe detailliert, wie deine App aussehen und funktionieren soll — Stil, Features, Farben, Zielgruppe…"
                            className="min-h-[130px] bg-background/60 focus-visible:ring-primary/40 border-border/60 resize-y text-sm leading-relaxed"
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
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Erstelle…
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Projekt erstellen
                      </>
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
