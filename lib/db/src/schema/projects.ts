import { pgTable, text, serial, boolean, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  htmlCode: text("html_code"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedUrl: text("published_url"),
  conversationId: integer("conversation_id"),
  sourceUrl: text("source_url"),
  generationStatus: text("generation_status").notNull().default("idle"),
  generationError: text("generation_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
