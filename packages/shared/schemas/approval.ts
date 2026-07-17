import { z } from "zod";

/**
 * Wire values are lower-case; Prisma enum ApprovalStatus is upper-case.
 * routes/runs.ts converts at the boundary.
 */
export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "changes_requested",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalStateSchema = z.object({
  approvalStatus: ApprovalStatusSchema,
  approvalNotes: z.string().nullable(),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
});
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
