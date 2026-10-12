import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";
import { ConfigRoutes } from "@/components/doc/config-routes";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";
import { POS_CONFIGS } from "./pos-configs";
import { usePosManifest } from "./pos-offline";

const POSDashboardPage = lazy(() => import("./POSDashboardPage"));
const POSTerminalPage = lazy(() => import("./POSTerminalPage"));
const POSCashPage = lazy(() => import("./POSCashPage"));
const POSStockPage = lazy(() => import("./POSStockPage"));

/** /pos/* — dashboard, the terminal, and list / form for every POS DocType (invoices, shifts, profiles, coupons, loyalty). */
export function POSRoutes() {
  usePosManifest();          // makes the POS installable as its own desktop app
  return (
    <ConfigRoutes prefix="pos" configs={POS_CONFIGS}
      index={<Suspense fallback={<FullPageLoader />}><POSDashboardPage /></Suspense>}
      extra={<>
        <Route path="terminal" element={<Suspense fallback={<FullPageLoader />}><POSTerminalPage /></Suspense>} />
        <Route path="cash" element={<Suspense fallback={<FullPageLoader />}><POSCashPage /></Suspense>} />
        <Route path="stock" element={<Suspense fallback={<FullPageLoader />}><POSStockPage /></Suspense>} />
      </>} />
  );
}
