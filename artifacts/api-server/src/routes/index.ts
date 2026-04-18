import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import registrationRouter from "./registration.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(registrationRouter);

export default router;
