import type { AuthUser } from '@housy/shared';
import { query } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';

/**
 * Asserts that the authenticated staff member has permission to access the specified lead.
 * - Sales Head (admin): can access any lead.
 * - Sales Executive: can ONLY access leads assigned to them.
 * - Forbidden access explicitly throws ForbiddenError (403), never 404.
 */
export async function assertLeadOwnership(leadId: string, user: AuthUser): Promise<void> {
  // Sales Head has global organizational access
  if (user.role === 'sales_head') {
    return;
  }

  // Query lead assignment
  const res = await query<{ id: string; assigned_to: string | null }>(
    `SELECT id, assigned_to FROM leads WHERE id = $1`,
    [leadId],
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Lead with ID '${leadId}' not found`);
  }

  const lead = res.rows[0]!;
  if (lead.assigned_to !== user.id) {
    throw new ForbiddenError(
      `Forbidden: Lead '${leadId}' is not assigned to executive '${user.name}' (${user.id})`,
    );
  }
}
