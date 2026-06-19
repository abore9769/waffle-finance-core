import { Router } from "express";
import { z } from "zod";
import type { Logger } from "pino";
import type { SecretService } from "../../services/secret-service.js";
import { makeRateLimiter, loadApiKeys, loadTrustedProxies } from "../middleware/ratelimit.js";

export function secretsRoutes(secrets: SecretService, log?: Logger): Router {
  const router = Router();

  const apiKeys = loadApiKeys();
  const trustedProxies = loadTrustedProxies();

  // Secret reveal is high-value: stricter window (5 reveals per IP per minute).
  // Resolvers presenting a valid API key bypass this limit entirely.
  const revealRateLimit = makeRateLimiter({
    windowMs: 60_000,
    max: 5,
    name: "secrets/reveal",
    log,
    apiKeys,
    trustedProxies
  });

  // Secret GET endpoint: 30 reads per IP per minute (lenient — it's a public read).
  const getSecretRateLimit = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    name: "secrets/get",
    log,
    apiKeys,
    trustedProxies
  });

  const revealSchema = z.object({
    publicId: z.string().min(1),
    preimage: z.string().regex(/^0x[0-9a-fA-F]+$/),
    txHash: z.string().min(1)
  });

  router.post("/secrets/reveal", revealRateLimit, async (req, res, next) => {
    try {
      const body = revealSchema.parse(req.body);
      await secrets.reveal(body.publicId, body.preimage, body.txHash);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error", details: err.errors });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: "secret_error", message: err.message });
        return;
      }
      next(err);
    }
  });

  router.get("/secrets/:publicId", getSecretRateLimit, async (req, res, next) => {
    try {
      const publicId = req.params["publicId"] ?? "";
      const preimage = await secrets.get(publicId);
      if (!preimage) {
        res.status(404).json({ error: "not_revealed" });
        return;
      }
      res.json({ publicId, preimage });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
