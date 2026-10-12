import { Route } from "react-router-dom";
import { ConfigRoutes } from "@/components/doc/config-routes";
import { APPROVAL_CONFIGS } from "./approval-configs";
import { ApprovalsInboxPage } from "./ApprovalsInboxPage";

/** /approvals/* — the approvals inbox (home), then list and form for every Approvals DocType. */
export function ApprovalsRoutes() {
  return (
    <ConfigRoutes
      prefix="approvals"
      configs={APPROVAL_CONFIGS}
      index={<ApprovalsInboxPage />}
      extra={<Route path="inbox" element={<ApprovalsInboxPage />} />}
    />
  );
}
