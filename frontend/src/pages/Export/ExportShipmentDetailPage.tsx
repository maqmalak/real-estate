import { DocFormPage } from "@/components/doc/doc-form-page";
import { EXPORT_SHIPMENT_CONFIG } from "./export-configs";

/** Export Shipment — tabbed form with status stepper, packing, order and LC at a glance (export-configs.tsx). */
export function ExportShipmentDetailPage() {
  return <DocFormPage config={EXPORT_SHIPMENT_CONFIG} />;
}
