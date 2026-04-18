import { Router } from "express";

const router = Router();

router.get("/healthz", (_req, res: any) => {
  res.json({ status: "ok" });
});

export default router;
