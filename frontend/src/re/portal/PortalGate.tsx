/** Keeps plot owners (portal logins linked to a Customer, no staff role) out of the staff shell: they land on /portal. */
import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function PortalGate({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/method/realestate.portal.whoami", { credentials: "include", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { message?: { customer: string | null; is_staff: boolean } } | null) => live && setOwner(Boolean(j?.message?.customer) && !j?.message?.is_staff))
      .catch(() => live && setOwner(false));
    return () => {
      live = false;
    };
  }, []);
  if (owner === null) return null;
  return owner ? <Navigate to="/portal" replace /> : <>{children}</>;
}
