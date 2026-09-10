import type { AssetDecisionRecord, NewsImage, SourceAssetContract } from "@newsforge/shared/schemas";
import { SourceAssetContractSchema } from "@newsforge/shared/schemas";

/**
 * TRI-R04 item 4 — merge per-asset decisions from the composed layout with
 * the source-manifest contract projection, then validate the result against
 * the shared SourceAssetContract schema before it is persisted on the run.
 *
 * Precedence: the layout pipeline's own decisions (inner-spread composer or
 * compound planner) win over the manifest projection, because they reflect
 * what actually happened at layout time. The manifest projection supplies
 * decisions for assets the layout never saw (e.g. unresolved photo refs).
 * Both sources keep rejected assets with recorded reasons, so the union
 * never silently drops an accepted story or photo.
 */
export function finalizeSourceAssetContract(input: {
  contract: SourceAssetContract;
  layoutAssetDecisions?: AssetDecisionRecord[];
  images?: NewsImage[];
}): SourceAssetContract {
  const layoutDecisions = (input.layoutAssetDecisions ?? []).map((decision) => ({ ...decision }));
  const byAsset = new Map<string, AssetDecisionRecord>();
  for (const decision of input.contract.assetDecisions) {
    byAsset.set(decision.assetId, { ...decision });
  }
  for (const decision of layoutDecisions) {
    byAsset.set(decision.assetId, decision);
  }
  const merged = Array.from(byAsset.values()).sort(
    (a, b) => a.assetId.localeCompare(b.assetId) || (a.unitId ?? "").localeCompare(b.unitId ?? ""),
  );
  // Invariant: every non-placed asset carries a recorded reason.
  for (const decision of merged) {
    if (decision.outcome !== "placed" && !decision.reason) {
      decision.reason = "asset not placed by the layout pipeline; no explicit rejection was recorded upstream";
      decision.decisionCode = decision.decisionCode ?? "default-rejection";
    }
  }
  const next: SourceAssetContract = { ...input.contract, assetDecisions: merged };
  const parsed = SourceAssetContractSchema.safeParse(next);
  if (!parsed.success) {
    throw new Error(
      `SourceAssetContract finalization failed: ${parsed.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
