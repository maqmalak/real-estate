import { Routes, Route, Navigate } from "react-router-dom";
import { DocListPage } from "@/components/doc/doc-list-page";
import { DocFormPage } from "@/components/doc/doc-form-page";
import { AnalyticsSuitePage } from "@/pages/Analytics/AnalyticsSuitePage";
import { ProductionGanttPage } from "./ProductionGanttPage";
import { CostSimulatorPage } from "./CostSimulatorPage";
import {
  BOM_CONFIG,
  DOWNTIME_CONFIG,
  JOB_CARD_CONFIG,
  PRODUCTION_PLAN_CONFIG,
  WORK_ORDER_CONFIG,
  WORKSTATION_CONFIG,
  ROUTING_CONFIG,
  OPERATION_CONFIG,
  WORKSTATION_TYPE_CONFIG,
  ITEM_ALTERNATIVE_CONFIG,
  MANUFACTURING_SETTINGS_CONFIG,
} from "./production-configs";

/** /production/* — the Production + WO Analysis overview (one page with a section nav) plus a list and a form for each production DocType (the form also serves `/new`). */
export function ProductionRoutes() {
  return (
    <Routes>
      <Route index element={<AnalyticsSuitePage suite="production" />} />
      <Route path="schedule" element={<ProductionGanttPage />} />
      <Route path="cost-simulator" element={<CostSimulatorPage />} />
      <Route path="status" element={<Navigate to="/production" replace />} />
      <Route path="production-plans" element={<DocListPage config={PRODUCTION_PLAN_CONFIG} />} />
      <Route path="production-plans/:name" element={<DocFormPage config={PRODUCTION_PLAN_CONFIG} />} />
      <Route path="boms" element={<DocListPage config={BOM_CONFIG} />} />
      <Route path="boms/:name" element={<DocFormPage config={BOM_CONFIG} />} />
      <Route path="work-orders" element={<DocListPage config={WORK_ORDER_CONFIG} />} />
      <Route path="work-orders/:name" element={<DocFormPage config={WORK_ORDER_CONFIG} />} />
      <Route path="job-cards" element={<DocListPage config={JOB_CARD_CONFIG} />} />
      <Route path="job-cards/:name" element={<DocFormPage config={JOB_CARD_CONFIG} />} />
      <Route path="downtime" element={<DocListPage config={DOWNTIME_CONFIG} />} />
      <Route path="downtime/:name" element={<DocFormPage config={DOWNTIME_CONFIG} />} />
      <Route path="workstations" element={<DocListPage config={WORKSTATION_CONFIG} />} />
      <Route path="workstations/:name" element={<DocFormPage config={WORKSTATION_CONFIG} />} />
      <Route path="routings" element={<DocListPage config={ROUTING_CONFIG} />} />
      <Route path="routings/:name" element={<DocFormPage config={ROUTING_CONFIG} />} />
      <Route path="operations" element={<DocListPage config={OPERATION_CONFIG} />} />
      <Route path="operations/:name" element={<DocFormPage config={OPERATION_CONFIG} />} />
      <Route path="workstation-types" element={<DocListPage config={WORKSTATION_TYPE_CONFIG} />} />
      <Route path="workstation-types/:name" element={<DocFormPage config={WORKSTATION_TYPE_CONFIG} />} />
      <Route path="item-alternatives" element={<DocListPage config={ITEM_ALTERNATIVE_CONFIG} />} />
      <Route path="item-alternatives/:name" element={<DocFormPage config={ITEM_ALTERNATIVE_CONFIG} />} />
      <Route path="settings" element={<DocFormPage config={MANUFACTURING_SETTINGS_CONFIG} />} />
      <Route path="*" element={<Navigate to="/production" replace />} />
    </Routes>
  );
}
