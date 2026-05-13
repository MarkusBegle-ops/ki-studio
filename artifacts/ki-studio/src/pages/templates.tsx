import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  emoji: string;
  title: string;
  description: string;
  category: "Tools" | "Produktivität" | "Spaß" | "Gesundheit";
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    id: "calculator",
    emoji: "🧮",
    title: "Wissenschaftlicher Rechner",
    description: "Taschenrechner mit Grundrechenarten, Prozent, Wurzel, Potenzen, Klammern und Verlauf.",
    category: "Tools",
    prompt: "Erstelle einen modernen wissenschaftlichen Taschenrechner. Funktionen: Grundrechenarten (+, -, ×, ÷), Prozent (%), Quadratwurzel (√), Potenzen (x²), Klammern. Design: dunkles UI mit abgerundeten Buttons, animierten Druckeffekten, großem Display das auch die Formel anzeigt. Keyboard-Eingabe soll funktionieren. Verlauf der letzten 8 Berechnungen anzeigen.",
  },
  {
    id: "todo",
    emoji: "✅",
    title: "To-Do Liste",
    description: "Aufgabenverwaltung mit Prioritäten, Kategorien, Fälligkeitsdaten und Fortschrittsanzeige.",
    category: "Produktivität",
    prompt: "Erstelle eine moderne To-Do Liste App. Features: Aufgaben hinzufügen/bearbeiten/löschen, Prioritäten (Hoch/Mittel/Niedrig) mit farbigen Badges, Kategorien (Arbeit/Privat/Einkaufen), Fälligkeitsdatum, abgehakte Aufgaben werden durchgestrichen, Filter nach Status/Priorität/Kategorie, Fortschrittsbalken. Daten im localStorage speichern. Minimalistisches Design mit Cyan-Akzenten.",
  },
  {
    id: "password",
    emoji: "🔐",
    title: "Passwort-Generator",
    description: "Starke Passwörter generieren mit Länge, Zeichentypen und visueller Stärke-Anzeige.",
    category: "Tools",
    prompt: "Erstelle einen Passwort-Generator. Features: Länge per Slider (8–64 Zeichen), Checkboxen für Großbuchstaben/Kleinbuchstaben/Zahlen/Sonderzeichen, Stärke-Anzeige (Schwach/Mittel/Stark/Sehr stark) als farbiger Balken, Knopf zum Generieren mit Animation, Kopierfunktion mit Bestätigung, gleichzeitig 5 Varianten zur Auswahl zeigen. Ansprechendes dunkles Design.",
  },
  {
    id: "quiz",
    emoji: "🎯",
    title: "Quiz-App",
    description: "Interaktives Quiz mit 10 Fragen, 30-Sekunden-Timer, Punkten und Highscore-Liste.",
    category: "Spaß",
    prompt: "Erstelle eine Quiz-App mit 10 Allgemeinwissen-Fragen (Multiple Choice, 4 Antworten). Features: 30-Sekunden-Timer pro Frage, Punkte (schnelle Antwort = mehr Punkte), sofortiges Feedback (richtig = grün, falsch = rot + Lösung zeigen), Fortschrittsbalken, Highscore Top-5 in localStorage, Abschlussscreen mit Auswertung und Neustart-Button. Buntes animiertes Design.",
  },
  {
    id: "timer",
    emoji: "⏱️",
    title: "Timer & Stoppuhr",
    description: "Countdown-Timer und Stoppuhr mit Runden-Funktion und animiertem Fortschrittsring.",
    category: "Tools",
    prompt: "Erstelle eine Timer & Stoppuhr App. Stoppuhr-Modus: Start/Stop/Reset, bis zu 10 Rundenzeiten. Countdown-Timer: Zeit in mm:ss einstellen, akustisches Signal am Ende (Web Audio API). Anzeige als großer Kreis mit animiertem SVG-Fortschrittsring. Leertaste = Start/Stop. Dunkles minimalistisches Design.",
  },
  {
    id: "notes",
    emoji: "📝",
    title: "Notizbuch",
    description: "Mehrere Notizen mit Volltextsuche, automatischer Speicherung und Zwei-Spalten-Layout.",
    category: "Produktivität",
    prompt: "Erstelle eine Notizbuch-App. Features: Unbegrenzt viele Notizen erstellen, linke Sidebar mit Liste (Titel+Vorschau+Datum), rechts Editierbereich, Titel automatisch aus erster Zeile, Echtzeit-Volltextsuche, Notizen löschen, automatische Speicherung in localStorage. Zwei-Spalten-Layout wie ein echter Editor. Elegantes minimalistisches Design.",
  },
  {
    id: "budget",
    emoji: "💰",
    title: "Budget-Tracker",
    description: "Einnahmen und Ausgaben mit Kategorien, Monatsübersicht und interaktiven Diagrammen.",
    category: "Produktivität",
    prompt: "Erstelle einen Budget-Tracker. Features: Einnahmen und Ausgaben hinzufügen (Betrag, Beschreibung, Kategorie, Datum), Kategorien (Miete, Lebensmittel, Transport, Unterhaltung, Gesundheit, Sonstiges), Monatssaldo prominent (positiv = grün, negativ = rot), Balkendiagramm Einnahmen vs. Ausgaben, Kreisdiagramm Ausgaben nach Kategorie (per Canvas oder SVG), Transaktionsliste mit Filter. LocalStorage. Professionelles Design.",
  },
  {
    id: "bmi",
    emoji: "📊",
    title: "Gesundheits-Dashboard",
    description: "BMI-Rechner, Wasser-Tracker und Aktivitäts-Log in einem modernen Dashboard.",
    category: "Gesundheit",
    prompt: "Erstelle ein Gesundheits-Dashboard mit 3 Widgets: 1. BMI-Rechner: Gewicht+Größe eingeben, BMI berechnen mit Farbindikator und Kategorie-Text. 2. Wasser-Tracker: +250ml Buttons, animierter Fortschrittsring bis 2L Tagesziel. 3. Aktivitäts-Log: Schritte eingeben, Wochenchart als Balkendiagramm. Daten in localStorage. Modernes Design mit grünen Akzenten.",
  },
  {
    id: "colorpalette",
    emoji: "🎨",
    title: "Farbpaletten-Generator",
    description: "Harmonische Farbpaletten aus einer Basisfarbe mit CSS-Export und Vorschau.",
    category: "Tools",
    prompt: "Erstelle einen Farbpaletten-Generator. Features: Farbrad oder Hex-Eingabe für Basisfarbe, automatisch 5 harmonische Farben generieren (komplementär, analog, triadisch), Farben als Hex, RGB und HSL anzeigen, Per-Klick kopieren, Paletten-Vorschau als Rechtecke und als UI-Mockup (Button, Karte, Text), Palette als CSS-Variablen exportieren. Elegantes Tool-Design.",
  },
  {
    id: "flashcards",
    emoji: "🃏",
    title: "Lernkarten",
    description: "Vokabeln und Fakten mit Karteikarten lernen, mit Flip-Animation und Lernstatistik.",
    category: "Spaß",
    prompt: "Erstelle eine Lernkarten-App. Features: Karten erstellen (Vorderseite = Frage, Rückseite = Antwort), Karte umdrehen per Klick mit 3D-Flip-Animation (CSS), Navigation durch Deck (zurück/weiter), Karte als 'gewusst' oder 'nicht gewusst' markieren, Statistik (x von y gewusst), Deck zufällig mischen, Karten bearbeiten und löschen. Mehrere Decks möglich. Daten in localStorage. Cleanes Karten-Design.",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Tools: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Produktivität: "bg-primary/10 text-primary border-primary/20",
  Spaß: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Gesundheit: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function Templates() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("Alle");

  const categories = ["Alle", "Tools", "Produktivität", "Spaß", "Gesundheit"];
  const filtered = filter === "Alle" ? TEMPLATES : TEMPLATES.filter(t => t.category === filter);

  async function handleUseTemplate(template: Template) {
    setCreatingId(template.id);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: template.title, description: template.prompt }),
      });
      let data: { id?: number; error?: string } = {};
      try { data = await res.json() as typeof data; } catch { /* ignore */ }
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      navigate(`/projekt/${data.id}`);
    } catch (err) {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannter Fehler", variant: "destructive" });
      setCreatingId(null);
    }
  }

  return (
    <AppLayout>
      <div className="relative">
        <div className="absolute inset-0 dot-grid opacity-25 pointer-events-none" />
        <div className="relative container max-w-screen-xl py-10 px-4 md:px-8 space-y-8">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">Vorlagen</h1>
              <p className="text-muted-foreground text-sm">Starte direkt mit einer fertigen App-Vorlage — die KI baut sie in Sekunden.</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  filter === cat
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-card/40 text-muted-foreground border-border/40 hover:border-border hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(template => (
              <Card
                key={template.id}
                className="bg-card/50 border-border/60 hover:border-primary/30 hover:bg-card/70 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 flex flex-col"
              >
                <CardHeader className="pb-3 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-3xl">{template.emoji}</span>
                    <Badge className={`text-[10px] px-2 py-0 border shrink-0 ${CATEGORY_COLORS[template.category]}`}>
                      {template.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-sm font-semibold leading-tight">{template.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed mt-1">{template.description}</CardDescription>
                </CardHeader>
                <div className="px-4 pb-4">
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs gap-2 glow-primary-sm hover:glow-primary transition-all"
                    onClick={() => handleUseTemplate(template)}
                    disabled={creatingId === template.id}
                  >
                    {creatingId === template.id ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />Erstellt Projekt…</>
                    ) : (
                      "Vorlage verwenden"
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
