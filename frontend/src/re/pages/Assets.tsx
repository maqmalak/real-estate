/** /re/assets — the scheme's fixed assets: insights (value by category, on the map, purchases, largest assets with their
 *  upkeep) above the standard ERPNext asset register; rows open the asset form in the app. */
import { DocListPage } from "@/components/doc/doc-list-page";
import { AssetInsights } from "@/re/components/record/OpsInsights";
import { ASSET_CONFIG } from "@/pages/Assets/asset-configs";

const CONFIG = { ...ASSET_CONFIG, subtitle: "Land, buildings, transformers, generators, machinery and tools — value, map links and upkeep", listHeaderExtra: <AssetInsights /> };

export function AssetsPage() {
  return <DocListPage config={CONFIG} />;
}
