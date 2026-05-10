import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import anthropicRouter from "./anthropic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(anthropicRouter);

export default router;
