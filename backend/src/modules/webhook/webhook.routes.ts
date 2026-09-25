import { Router } from "express";
import { receiveLead, verifySubscription } from "./webhook.controller";
import { requireMetaSignature } from "./webhook.middleware";

export const webhookRouter = Router();

webhookRouter.get("/meta-lead", verifySubscription);
webhookRouter.post("/meta-lead", requireMetaSignature, receiveLead);
