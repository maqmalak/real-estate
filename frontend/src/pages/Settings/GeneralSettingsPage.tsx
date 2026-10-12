import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { useGlobalDefaults } from "@/hooks/useSettings";
import { humanizeError } from "@/services/frappe";

const FIELDS: FormFieldMeta[] = [
  { fieldname: "default_company", label: "Default Company", fieldtype: "Link", options: "Company" },
  { fieldname: "default_currency", label: "Default Currency", fieldtype: "Link", options: "Currency" },
  { fieldname: "country", label: "Country", fieldtype: "Link", options: "Country" },
  { fieldname: "column_break_gd_1", fieldtype: "Column Break" },
  { fieldname: "default_distance_unit", label: "Default Distance Unit", fieldtype: "Link", options: "UOM" },
  { fieldname: "hide_currency_symbol", label: "Hide Currency Symbol", fieldtype: "Check" },
  { fieldname: "disable_rounded_total", label: "Disable Rounded Total", fieldtype: "Check" },
  { fieldname: "disable_in_words", label: "Disable Amount in Words", fieldtype: "Check" },
  { fieldname: "use_posting_datetime_for_naming_documents", label: "Use Posting Datetime for Naming Documents", fieldtype: "Check" },
];

/** Global Defaults — the site-wide default company/currency/country and a few workspace-wide toggles. */
export function GeneralSettingsPage() {
  const { data, isLoading, error, mutate, save, saving } = useGlobalDefaults();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (data) setValues({ ...data });
  }, [data]);

  const handleSave = async () => {
    try {
      await save(values);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Company defaults and workspace preferences" icon={<SettingsIcon className="h-5 w-5" />} />
      <Card className="max-w-3xl">
        <CardContent className="space-y-5 pt-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => void mutate()} />
          ) : (
            <>
              <FrappeForm fields={FIELDS} values={values} onChange={(fieldname, value) => setValues((v) => ({ ...v, [fieldname]: value }))} />
              <div className="flex justify-end border-t pt-4">
                <Button onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
