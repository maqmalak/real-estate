import { DocFormPage } from "@/components/doc/doc-form-page";
import { LC_PROFORMA_CONFIG } from "./lc-proforma-config";

/**
 * LC Proforma — tabbed form (Proforma · Items · Letter of Credit · Shipment · Banking · Connections · Activity)
 * with the workflow's actions in the header, an at-a-glance LC panel and "Create Sales Order" (lc-proforma-config.tsx).
 */
export function LCProformaFormPage() {
  return <DocFormPage config={LC_PROFORMA_CONFIG} />;
}
