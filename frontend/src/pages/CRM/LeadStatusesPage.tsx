import { MastersPage } from "@/components/crm/MastersPage";
import { Badge } from "@/components/ui/badge";
import { ListChecks } from "lucide-react";

const COLOR_DOT: Record<string, string> = {
  black: "bg-zinc-600", gray: "bg-zinc-400", blue: "bg-blue-500", green: "bg-emerald-500",
  red: "bg-rose-500", pink: "bg-pink-500", orange: "bg-orange-500", amber: "bg-amber-500",
  yellow: "bg-yellow-500", cyan: "bg-cyan-500", teal: "bg-teal-500", violet: "bg-violet-500",
  purple: "bg-purple-500",
};

/** Master data for `CRM Lead Status` — the lead pipeline stages. */
export default function LeadStatusesPage() {
  return (
    <MastersPage
      config={{
        title: "Lead Statuses",
        subtitle: "Stages of the lead pipeline, in the order leads progress",
        icon: <ListChecks className="h-5 w-5" />,
        doctype: "CRM Lead Status",
        fields: ["name", "lead_status", "color", "type", "position"],
        orderBy: { field: "position", order: "asc" },
        formFields: [
          { fieldname: "lead_status", label: "Status Name", fieldtype: "Data", reqd: true },
          { fieldname: "color", label: "Color", fieldtype: "Select", options: "black\ngray\nblue\ngreen\nred\npink\norange\namber\nyellow\ncyan\nteal\nviolet\npurple" },
          { fieldname: "type", label: "Type", fieldtype: "Select", options: "Open\nOngoing\nOn Hold\nWon\nLost" },
          { fieldname: "position", label: "Position", fieldtype: "Int" },
        ],
        primaryField: "lead_status",
        primaryLabel: "Status Name",
        secondaryFields: [{ field: "type", label: "Type" }, { field: "position", label: "#" }],
        renderBadge: (row) => (
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${COLOR_DOT[row.color] ?? "bg-zinc-400"}`} />
            <Badge variant="outline" className="text-xs">{row.color || "gray"}</Badge>
          </span>
        ),
        extraStats: (rows) => [
          { label: "Open", value: rows.filter((r) => r.type === "Open").length, tone: "sky" },
          { label: "Won", value: rows.filter((r) => r.type === "Won").length, tone: "emerald" },
          { label: "Lost", value: rows.filter((r) => r.type === "Lost").length, tone: "amber" },
        ],
      }}
    />
  );
}
