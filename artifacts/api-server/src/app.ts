import express from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app = express();
const pinoHttp = ((pinoHttpModule as unknown as { default?: unknown }).default ?? pinoHttpModule) as (
  options: Record<string, unknown>,
) => ReturnType<typeof express.json>;

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: unknown) {
        const request = req as { id?: string; method?: string; url?: string };
        return {
          id: request.id,
          method: request.method,
          url: request.url?.split("?")[0],
        };
      },
      res(res: unknown) {
        const response = res as { statusCode?: number };
        return {
          statusCode: response.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
