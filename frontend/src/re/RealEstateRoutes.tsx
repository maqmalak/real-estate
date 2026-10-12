import "maplibre-gl/dist/maplibre-gl.css";
import { Navigate, Route, Routes } from "react-router-dom";
import { MetaDocPage } from "./meta/MetaDocPage";
import { AcceptancePage } from "./pages/Acceptance";
import { CustomerPage } from "./pages/Customer";
import { GenerateDocsHost } from "./components/record/GenerateDocs";
import { CustomersPage } from "./pages/Lists";
import { AssetsPage } from "./pages/Assets";
import { DashboardPage } from "./pages/Dashboard";
import { DevelopmentPage } from "./pages/Development";
import { DocumentsPage } from "./pages/Documents";
import { HomePage } from "./pages/Home";
import { InboxPage } from "./pages/Inbox";
import { InsightsPage } from "./pages/Insights";
import { MapPage } from "./pages/MapPage";
import { OperationsPage } from "./pages/Operations";
import { PlotsPage } from "./pages/Plots";
import { ReportsPage } from "./pages/Reports";
import { SocietyCollectPage } from "./pages/SocietyCollect";
import { UsersRolesPage } from "./pages/UsersRoles";
import { TodayPage } from "./pages/Today";
import { ReProviders } from "./ReProviders";

/** /re/* — Zarmeen Gardens: dashboard, map, plots, customers, insights, development, documents and a generated
 *  list + form for every real-estate DocType (/re/d/<doctype-slug>). */
export function RealEstateRoutes() {
  return (
    <ReProviders>
      <div className="h-[calc(100vh-4rem)] overflow-y-auto">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="plots" element={<PlotsPage />} />
          <Route path="plots/:plot" element={<PlotsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:customer" element={<CustomerPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="development" element={<DevelopmentPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="society/collect" element={<SocietyCollectPage />} />
          <Route path="settings/users" element={<UsersRolesPage />} />
          <Route path="acceptance" element={<AcceptancePage />} />
          <Route path="d/:slug" element={<MetaDocPage mode="list" />} />
          <Route path="d/:slug/:name" element={<MetaDocPage mode="form" />} />
          <Route path="*" element={<Navigate to="/re" replace />} />
        </Routes>
        <GenerateDocsHost />
      </div>
    </ReProviders>
  );
}
