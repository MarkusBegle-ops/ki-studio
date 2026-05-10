import React from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCreateProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  title: z.string().min(1, "Bitte geben Sie einen Titel ein.").max(100),
  description: z.string().min(10, "Die Beschreibung sollte mindestens 10 Zeichen lang sein."),
});

export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createProject = useCreateProject();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    createProject.mutate({ data: values }, {
      onSuccess: (project) => {
        toast({
          title: "Projekt erstellt",
          description: "Ihr neues Projekt wurde erfolgreich angelegt.",
        });
        setLocation(`/projekt/${project.id}`);
      },
      onError: () => {
        toast({
          title: "Fehler",
          description: "Das Projekt konnte nicht erstellt werden. Bitte versuchen Sie es erneut.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <AppLayout>
      <div className="container max-w-2xl py-12 px-4">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück zur Übersicht
          </Link>
        </div>
        
        <Card className="border-primary/20 bg-card/60 backdrop-blur-sm shadow-[0_0_30px_rgba(0,255,255,0.05)]">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-primary" />
              Neues Projekt
            </CardTitle>
            <CardDescription>
              Beschreiben Sie, was Sie bauen möchten. Die KI wird den Code für Sie generieren.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Projekttitel</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Persönliches Dashboard" className="bg-background/50 focus-visible:ring-primary/50" {...field} />
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
                      <FormLabel>Beschreibung</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Beschreiben Sie detailliert, wie Ihre Anwendung aussehen und funktionieren soll..." 
                          className="min-h-[150px] bg-background/50 focus-visible:ring-primary/50 resize-y" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Je genauer Ihre Beschreibung, desto besser das Ergebnis.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex justify-end border-t border-border/50 pt-6">
                <Button 
                  type="submit" 
                  disabled={createProject.isPending}
                  className="shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] transition-all"
                >
                  {createProject.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Erstelle...
                    </>
                  ) : (
                    <>Projekt starten</>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </AppLayout>
  );
}
