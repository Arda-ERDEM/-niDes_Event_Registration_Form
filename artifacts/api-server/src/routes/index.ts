import { Router } from "express";
import healthRouter from "./health.js";
import registrationRouter from "./registration.js";

const router = Router();

router.use(healthRouter);
router.use(registrationRouter);

export default router;
