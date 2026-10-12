import { DocListPage } from "@/components/doc/doc-list-page";
import { EXPORT_SHIPMENT_CONFIG } from "./export-configs";

/** Export Shipments — status tabs with counts, search and filters. */
export function ExportShipmentsPage() {
  return <DocListPage config={EXPORT_SHIPMENT_CONFIG} />;
}
