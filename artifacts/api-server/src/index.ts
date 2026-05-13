import app from "./app";
import { logger } from "./lib/logger";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Reset projects stuck in "generating" from a previous server run (crash/restart mid-generation)
  db.update(projectsTable)
    .set({
      generationStatus: "error",
      generationError: "Die Generierung wurde durch einen Server-Neustart unterbrochen. Bitte erneut versuchen.",
      updatedAt: new Date(),
    })
    .where(eq(projectsTable.generationStatus, "generating"))
    .then(() => logger.info("Startup: stuck generating projects reset"))
    .catch((e) => logger.error({ err: e }, "Startup: failed to reset stuck projects"));
});
