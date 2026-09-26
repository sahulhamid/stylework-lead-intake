import { Router } from "express";
import { getLead, listLeads, updateLeadStatus } from "./leads.controller";

export const leadsRouter = Router();

leadsRouter.get("/", listLeads);
leadsRouter.get("/:id", getLead);
leadsRouter.patch("/:id/status", updateLeadStatus);
