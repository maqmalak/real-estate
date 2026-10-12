import type { ChildRow } from "@/components/tables/child-table";
import type { DocValues } from "@/components/doc/doc-config";
import { asNumber } from "@/utils/cn";

/**
 * Spinning-mill calculations, mirrored client-side so the forms update live while typing.
 *
 * This is a TypeScript port of `apps/micromax/micromax/mfg_logic.py` (which the server applies on save via the
 * BOM / Work Order doc events). Keep the two in step. Every rule was recovered from the hik data — see the
 * match rates documented in that file.
 */
export const SPINDLE_FACTOR = 16; // spindle_required = 16 * qty / target_ops
export const SPINDLES_PER_FRAME = 480;
export const SHIFTS_PER_DAY = 3;

const div = (a: number, b: number) => (b ? a / b : 0);

/** BOM: blend ratio → item qty, gross-up, blended yield, material issued, waste, spindles and frames. */
export function computeBom(values: DocValues, items: ChildRow[]): { values?: DocValues; rows?: ChildRow[] } {
  const quantity = asNumber(values.quantity);
  const spinning = values.bom_type === "Spinning";

  // Amounts are useful for every BOM type.
  let rows: ChildRow[] = items.map((r): ChildRow => ({ ...r, amount: asNumber(r.qty) * asNumber(r.rate) }));
  if (!spinning) return { rows };

  rows = rows.map((r): ChildRow => {
    const qty = asNumber(r.blend_ratio) > 0 ? (quantity * asNumber(r.blend_ratio)) / 100 : asNumber(r.qty);
    const y = asNumber(r.item_yield);
    return { ...r, qty, amount: qty * asNumber(r.rate), gross_up_qty: y > 0 ? div(qty, y / 100) : qty };
  });

  const totalBlend = rows.reduce((s, r) => s + asNumber(r.blend_ratio), 0);
  const targetYield =
    totalBlend > 0
      ? rows.reduce((s, r) => s + asNumber(r.blend_ratio) * (asNumber(r.item_yield) || 100), 0) / totalBlend
      : asNumber(values.target_yield);
  const materialIssued = targetYield > 0 ? div(quantity, targetYield / 100) : quantity;
  const invisiblePct = asNumber(values.invisible_lose_percentage);
  const wastePct = targetYield > 0 ? Math.max(0, 100 - targetYield - invisiblePct) : 0;
  const ops = asNumber(values.target_ops);
  const spindle = ops > 0 ? div(SPINDLE_FACTOR * quantity, ops) : 0;
  const frame = spindle / SPINDLES_PER_FRAME;

  return {
    rows,
    values: {
      target_yield: targetYield,
      material_required: quantity,
      material_issued: materialIssued,
      target_waste_percentage: wastePct,
      target_waste: (materialIssued * wastePct) / 100,
      invisible_lose_qty: (materialIssued * invisiblePct) / 100,
      spindle_required: spindle,
      frame_required: frame,
      per_shift_frame_required: frame / SHIFTS_PER_DAY,
    },
  };
}

/** Blend ratios should add up to 100 % — returns the running total. */
export const totalBlend = (items: ChildRow[]) => items.reduce((s, r) => s + asNumber(r.blend_ratio), 0);

/** Work Order: material issued, spindles and frames, planned and actual. */
export function computeWorkOrder(v: DocValues): DocValues {
  const qty = asNumber(v.qty);
  const out: DocValues = {};
  const ty = asNumber(v.target_yield);
  if (ty > 0) out.material_issued = div(qty, ty / 100);
  const ops = asNumber(v.target_ops);
  if (ops > 0) {
    const spindle = div(SPINDLE_FACTOR * qty, ops);
    out.spindle_required = spindle;
    out.frame_required = spindle / (SPINDLES_PER_FRAME * SHIFTS_PER_DAY);
  }
  const actualOps = asNumber(v.actual_ops);
  const spindleWorked = actualOps > 0 ? div(SPINDLE_FACTOR * asNumber(v.produced_qty), actualOps) : asNumber(v.spindle_worked);
  if (actualOps > 0) out.spindle_worked = spindleWorked;
  if (spindleWorked > 0) {
    out.actual_frame_required = spindleWorked / SPINDLES_PER_FRAME;
    out.actual_per_shift_frame_required = out.actual_frame_required / SHIFTS_PER_DAY;
  }
  return out;
}
