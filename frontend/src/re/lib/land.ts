/** Module 0 — land purchase: types and queries for /re/land, /re/land/payments and /re/land/legal (server: realestate.land_api). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Geometry } from "geojson";
import { get, post } from "@/re/lib/api";

export const LAYER_COLORS: Record<string, string> = {
  Acquired: "#16a34a", "Payment in Progress": "#0ea5e9", Agreement: "#8b5cf6", Negotiation: "#f59e0b", Disputed: "#dc2626", Dropped: "#94a3b8",
};
export const STAGES = [
  "Identified", "Under Negotiation", "Due Diligence", "Token Paid", "Agreement Signed", "Payment in Progress",
  "Registry / Mutation Done", "Possession Taken", "Acquired", "Dropped", "Disputed",
] as const;
export const STAGE_LAYER: Record<string, string> = {
  Identified: "Negotiation", "Under Negotiation": "Negotiation", "Due Diligence": "Negotiation", "Token Paid": "Agreement", "Agreement Signed": "Agreement",
  "Payment in Progress": "Payment in Progress", "Registry / Mutation Done": "Acquired", "Possession Taken": "Acquired", Acquired: "Acquired",
  Dropped: "Dropped", Disputed: "Disputed",
};
export const stageColor = (stage: string) => LAYER_COLORS[STAGE_LAYER[stage] ?? "Negotiation"] ?? "#94a3b8";

export interface LandParcel {
  name: string; title: string; mauza: string; khasra_nos: string; khewat_no: string; area_sqft: number; area_display: string; kanal: number;
  stage: string; layer: string; color: string; land_type: string; diligence_clear: number; diligence_override: number; responsible: string | null;
  geojson: Geometry | null; owners: string[]; pending_checks: number; open_cases: string[]; deals: { name: string; status: string }[];
}
export interface LandDealRow {
  name: string; description: string; deal_date: string; land_for: string; land_owners_type: string; status: string; workflow_state: string;
  deal_area_sqft: number; deal_area_display: string; net_due_amount: number; paid_amount: number; adjusted_amount: number; balance_amount: number;
  overdue_lines: number; signed_count: string;
}
export interface DueLine { deal: string; description: string; ser: number; owner_name: string; balance: number; due: string; overdue: number; status: string }
export interface LandOverview {
  project: string; project_kanal: number; target_kanal: number; total_kanal: number; acquired_kanal: number; process_kanal: number; disputed_kanal: number;
  parcels: LandParcel[]; bank: { layer: string; kanal: number; parcels: number; color: string }[];
  pipeline: { stage: string; parcels: number; kanal: number; layer: string }[];
  money: { net_due: number; paid: number; adjusted: number; balance: number; per_kanal: number; per_marla: number };
  deals: LandDealRow[]; overdue: DueLine[]; maturing: DueLine[];
  hearings: { name: string; case_title: string; court: string; next_hearing: string; status: string; lawyer: string }[];
  deadlines: { name: string; description: string; registry_deadline: string; possession_date: string; status: string }[];
  recent_payments: { name: string; deal: string; owner_name: string; payment_kind: string; posting_date: string; amount: number; mode_of_payment: string }[];
  conflicts: { checked: boolean; blocks: { name: string; outside_pct: number }[]; plots: { name: string; outside_pct: number; block: string; status: string }[]; plot_count: number };
  can_merge: boolean;
}
export interface ParcelDetail {
  name: string; title: string; stage: string; mauza: string; tehsil: string; district: string; khewat_no: string; khatooni_no: string; square_no: string;
  killa_nos: string; khasra_nos: string; area_display: string; area_acre: number; kanal: number; land_type: string; current_use: string; access_road: string;
  responsible: string | null; diligence_clear: number; diligence_override: number; override_reason: string | null;
  owners: { owner: string; name: string; share: string; pct: number }[];
  checks: { item: string; mandatory: number; status: string; verified_by: string | null; verified_on: string | null; document: string | null }[];
  history: { stage: string; date: string; by: string | null; notes: string | null }[];
  lines: { deal: string; description: string; deal_status: string; workflow_state: string; ser: number; owner_name: string; kanal: number; marla: number;
    unit: string; rate: number; net_due: number; paid_amount: number; adjusted_amount: number; balance: number; status: string; overdue: number; signed: number;
    mature_date: string | null; date_ext: string | null }[];
  payments: { name: string; deal: string; ser: number; owner_name: string; payment_kind: string; posting_date: string; amount: number; wht_amount: number; mode_of_payment: string; instrument_no: string }[];
  documents: { name: string; title: string; document_type: string; issue_date: string | null; expiry_date: string | null; status: string; file: string | null }[];
  cases: { name: string; case_title: string; court: string; case_no: string; status: string; next_hearing: string | null; lawyer: string }[];
}
export interface Seller {
  owner: string; name: string; cnic: string | null; mobile: string | null; customer: string | null; bank: string; supplier: string | null; deals: string[];
  kanal: number; net_due: number; paid: number; adjusted: number; balance: number; overdue: number; next_due: string | null; cancelled: number;
}
export interface LandPayments {
  sellers: Seller[]; aging: { bucket: string; amount: number }[];
  schedule: { deal: string; description: string; ser: number; owner_name: string; label: string; due_date: string; amount: number; paid: number; status: string }[];
  recent: { name: string; deal: string; ser: number; owner_name: string; payment_kind: string; posting_date: string; amount: number; wht_amount: number; net_paid: number;
    mode_of_payment: string; instrument_no: string; workflow_state: string; docstatus: number; received_by_seller: number }[];
  adjustments: { name: string; deal: string; owner_name: string; posting_date: string; total_value: number; applied_amount: number; excess_receivable: number;
    workflow_state: string; docstatus: number; plots: { plot: string; agreed_value: number; booking: string | null }[] }[];
  pending: { name: string; owner_name: string; amount: number; deal: string }[];
  totals: { net_due: number; paid: number; adjusted: number; balance: number; overdue: number };
  reconciliation: { gl_balance: number; deal_balances: number; difference: number; matches: boolean; creditors_account: string } | null;
}
export interface LandLegal {
  items: string[]; mandatory: string[];
  parcels: { name: string; title: string; khasra_nos: string; stage: string; diligence_clear: number; diligence_override: number; area_display: string; pending: number;
    cells: Record<string, { status: string; by: string | null; on: string | null; doc: boolean }> }[];
  cases: { name: string; case_title: string; court: string; case_no: string; status: string; next_hearing: string | null; lawyer: string; affected_area: string | null;
    deal: string | null; filed_on: string | null; parcels: string[] }[];
  documents: { name: string; title: string; document_type: string; land_parcel: string; issue_date: string | null; expiry_date: string | null; status: string; file: string | null }[];
  doc_types: { type: string; n: number }[];
  summary: { clear: number; overridden: number; pending: number; open_cases: number };
}

export const useLandOverview = () => useQuery({ queryKey: ["land-overview"], queryFn: () => get<LandOverview>("realestate.land_api.overview") });
export const useLandPayments = () => useQuery({ queryKey: ["land-payments"], queryFn: () => get<LandPayments>("realestate.land_api.payments") });
export const useLandLegal = () => useQuery({ queryKey: ["land-legal"], queryFn: () => get<LandLegal>("realestate.land_api.legal") });
export const useParcel = (name: string | null) =>
  useQuery({ queryKey: ["land-parcel", name], enabled: Boolean(name), queryFn: () => get<ParcelDetail>("realestate.land_api.parcel", { name: name ?? "" }) });

export function useMoveParcel() {
  const qc = useQueryClient();
  return async (name: string, stage: string) => {
    const r = await post<{ name: string; stage: string }>("realestate.land_api.move_parcel", { name, stage });
    await Promise.all([qc.invalidateQueries({ queryKey: ["land-overview"] }), qc.invalidateQueries({ queryKey: ["land-parcel", name] }), qc.invalidateQueries({ queryKey: ["map-data"] })]);
    return r;
  };
}

export const kanal = (v: number) => `${v.toLocaleString("en-PK", { maximumFractionDigits: 1 })} K`;
