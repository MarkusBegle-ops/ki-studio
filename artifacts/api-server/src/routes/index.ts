import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import analyzeUrlRouter from "./analyze-url";
import conversationsRouter from "./conversations";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(analyzeUrlRouter);
router.use(conversationsRouter);
router.use(adminRouter);

export default router;
