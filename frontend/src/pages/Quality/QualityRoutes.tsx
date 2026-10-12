import { Routes, Route, Navigate } from "react-router-dom";
import { DocListPage } from "@/components/doc/doc-list-page";
import { DocFormPage } from "@/components/doc/doc-form-page";
import { AnalyticsDashboardPage } from "@/pages/Analytics/AnalyticsDashboardPage";
import { QUALITY_CONFIGS } from "./quality-configs";

/** /quality/* — QA/QC analysis as the home page, plus a list and a form for every quality DocType (the form also serves `/new`). */
export function QualityRoutes() {
  return (
    <Routes>
      <Route index element={<AnalyticsDashboardPage module="quality" />} />
      {QUALITY_CONFIGS.map((cfg) => {
        const path = cfg.base.replace(/^\/quality\//, "");
        return [
          <Route key={path} path={path} element={<DocListPage config={cfg} />} />,
          <Route key={`${path}/:name`} path={`${path}/:name`} element={<DocFormPage config={cfg} />} />,
        ];
      })}
      <Route path="*" element={<Navigate to="/quality" replace />} />
    </Routes>
  );
}
