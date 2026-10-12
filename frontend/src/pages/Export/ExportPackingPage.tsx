import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { EXPORT_PACKING_CONFIG } from "./export-configs";

/** Export packing lists — list, and a tabbed form with carton generation and container fill. */
export function ExportPackingPage() {
  return <DocListPage config={EXPORT_PACKING_CONFIG} />;
}
export function ExportPackingFormPage() {
  return <DocFormPage config={EXPORT_PACKING_CONFIG} />;
}
