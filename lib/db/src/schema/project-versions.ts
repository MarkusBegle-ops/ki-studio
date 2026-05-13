import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const projectVersionsTable = pgTable("project_versions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  htmlCode: text("html_code").notNull(),
  prompt: text("prompt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProjectVersion = typeof projectVersionsTable.$inferSelect;
