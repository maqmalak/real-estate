import { ConfigRoutes } from "@/components/doc/config-routes";
import { SUPPORT_CONFIGS } from "./support-configs";

/** /support/* — list and form for every Support DocType. */
export function SupportRoutes() {
  return <ConfigRoutes prefix="support" configs={SUPPORT_CONFIGS} />;
}
