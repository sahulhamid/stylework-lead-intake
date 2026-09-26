import { ConflictError, InvalidTransitionError, NotFoundError } from "../../lib/errors";
import { canTransition, nextStatuses } from "./lead-status";
import {
  findLeadById,
  findLeadWithActivities,
  updateStatusWithActivity,
} from "./leads.repository";
import type { UpdateStatusBody } from "./leads.schemas";

// No authentication yet, so dashboard changes carry a fixed actor (see README).
const ACTOR = "dashboard";

// Business rules of a status change, checked in order: the lead exists (404), the client
// saw its latest version (409), the lifecycle allows the move (422). The version is then
// re-checked atomically in the update, which catches a change that lands in between.
export async function changeLeadStatus(id: string, { status, note, version }: UpdateStatusBody) {
  const lead = await findLeadById(id);
  if (!lead) throw new NotFoundError(`Lead ${id} not found`);

  if (lead.version !== version) {
    throw new ConflictError("Lead was changed by someone else. Reload it and try again.", {
      currentVersion: lead.version,
    });
  }

  if (!canTransition(lead.status, status)) {
    throw new InvalidTransitionError(`Cannot change status from ${lead.status} to ${status}`, {
      from: lead.status,
      to: status,
      allowed: nextStatuses(lead.status),
    });
  }

  const updated = await updateStatusWithActivity({
    leadId: id,
    expectedVersion: version,
    from: lead.status,
    to: status,
    note,
    actor: ACTOR,
  });
  if (!updated) {
    throw new ConflictError("Lead was changed by someone else. Reload it and try again.");
  }

  const result = await findLeadWithActivities(id);
  if (!result) throw new NotFoundError(`Lead ${id} not found`);
  return result;
}
