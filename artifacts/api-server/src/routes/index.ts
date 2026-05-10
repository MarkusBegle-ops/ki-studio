import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import anthropicRouter from "./anthropic";
import analyzeUrlRouter from "./analyze-url";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(anthropicRouter);
router.use(analyzeUrlRouter);

export default router;
