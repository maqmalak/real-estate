import { Routes, Route, Navigate } from "react-router-dom";
import { DocListPage } from "@/components/doc/doc-list-page";
import { DocFormPage } from "@/components/doc/doc-form-page";
import { AssetsDashboardPage } from "./AssetsDashboardPage";
import { ASSET_CATEGORY_CONFIG, ASSET_CONFIG, ASSET_MOVEMENT_CONFIG, ASSET_REPAIR_CONFIG, LOCATION_CONFIG } from "./asset-configs";

/** /asset-management/* — overview, the register, movements, repairs and the category / location masters. */
export function AssetsRoutes() {
  return (
    <Routes>
      <Route index element={<AssetsDashboardPage />} />
      <Route path="register" element={<DocListPage config={ASSET_CONFIG} />} />
      <Route path="register/:name" element={<DocFormPage config={ASSET_CONFIG} />} />
      <Route path="movements" element={<DocListPage config={ASSET_MOVEMENT_CONFIG} />} />
      <Route path="movements/:name" element={<DocFormPage config={ASSET_MOVEMENT_CONFIG} />} />
      <Route path="repairs" element={<DocListPage config={ASSET_REPAIR_CONFIG} />} />
      <Route path="repairs/:name" element={<DocFormPage config={ASSET_REPAIR_CONFIG} />} />
      <Route path="categories" element={<DocListPage config={ASSET_CATEGORY_CONFIG} />} />
      <Route path="categories/:name" element={<DocFormPage config={ASSET_CATEGORY_CONFIG} />} />
      <Route path="locations" element={<DocListPage config={LOCATION_CONFIG} />} />
      <Route path="locations/:name" element={<DocFormPage config={LOCATION_CONFIG} />} />
      <Route path="*" element={<Navigate to="/asset-management" replace />} />
    </Routes>
  );
}
