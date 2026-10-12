import { ConfigRoutes } from "@/components/doc/config-routes";
import { SUBCONTRACTING_CONFIGS } from "./subcontracting-configs";

/** /subcontracting/* — list and form for every Subcontracting DocType. */
export function SubcontractingRoutes() {
  return <ConfigRoutes prefix="subcontracting" configs={SUBCONTRACTING_CONFIGS} />;
}
