import { Router } from "express";
import { getLead, listLeads } from "./leads.controller";

export const leadsRouter = Router();

leadsRouter.get("/", listLeads);
leadsRouter.get("/:id", getLead);
