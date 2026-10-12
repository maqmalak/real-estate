import { useMemo } from "react";
import { StickyNote, FileText, Users } from "lucide-react";
import { CrmManagementPage, countStat, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import { CrmReferenceCell } from "@/components/crm/CrmReferenceCell";
import { textPreview } from "@/components/crm/doc-panels";
import type { ColumnDef } from "@/components/tables/data-table";
import { Avatar } from "@/components/ui/avatar";
import { avatarTone } from "@/components/common/avatar-tone";
import { relativeDays, formatDateTime, parseDate } from "@/utils/dates";
import { useCrmReferenceLabels } from "@/hooks/useCrmReferenceLabels";
import type { CrmNote } from "@/types/frappe";

export default function NotesPage() {
  const { referenceMap } = useCrmReferenceLabels();

  const columns: ColumnDef<CrmNote>[] = useMemo(
    () => [
      {
        key: "content",
        label: "Content",
        render: (r) => (
          <p className="max-w-md truncate text-sm text-muted-foreground">{r.content ? textPreview(r.content, 200) : "—"}</p>
        ),
        getValue: (r) => r.content,
      },
      {
        key: "reference",
        label: "Lead / Deal",
        render: (r) => <CrmReferenceCell referenceDocname={r.reference_docname} referenceMap={referenceMap} />,
        getValue: (r) => r.reference_docname,
      },
      {
        key: "owner",
        label: "Author",
        render: (r) =>
          r.owner ? (
            <div className="flex items-center gap-2">
              <Avatar name={r.owner} className={`h-6 w-6 text-[10px] ${avatarTone(r.owner)}`} />
              <span className="text-sm">{r.owner}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
        getValue: (r) => r.owner,
      },
      {
        key: "modified",
        label: "Updated",
        render: (r) => <span className="text-xs text-muted-foreground">{relativeDays(r.modified)}</span>,
        getValue: (r) => r.modified,
      },
    ],
    [referenceMap],
  );

  const config: CrmManagementConfig<CrmNote> = useMemo(
    () => ({
      title: "Notes",
      subtitle: "Free-form notes linked to your leads, deals and organizations",
      icon: <StickyNote className="h-5 w-5" />,
      doctype: "FCRM Note",
      fields: ["name", "title", "content", "owner", "modified", "reference_doctype", "reference_docname"],
      formFields: [
        { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
        { fieldname: "content", label: "Content", fieldtype: "Text Editor", reqd: true },
      ],
      kanbanField: "owner",
      searchField: "title",
      statusField: "owner",
      columns,
      dateField: "modified",
      dateLabel: "Updated",
      // Each card's count and its click-to-filter predicate come from the same function (countStat).
      stats: (rows) => {
        const authors = new Set(rows.map((r) => r.owner).filter(Boolean));
        return [
          countStat(rows, { label: "Total Notes", icon: <StickyNote className="h-4 w-4" />, tone: "amber", clear: true }),
          countStat(rows, {
            label: "This Week",
            icon: <FileText className="h-4 w-4" />,
            tone: "sky",
            predicate: (r) => !!r.modified && Date.now() - (parseDate(r.modified)?.getTime() ?? 0) < 7 * 864e5,
          }),
          // Distinct-author count isn't a row subset, so this card stays informational (no predicate).
          { label: "Authors", value: authors.size, icon: <Users className="h-4 w-4" />, tone: "indigo" as const },
        ];
      },
      rowName: (r) => r.title || "Untitled note",
      rowSubtitle: (r) => (r.modified ? formatDateTime(r.modified) : undefined),
      renderCard: (r) => (
        <div className="space-y-2">
          <p className="truncate text-sm font-medium">{r.title || "Untitled note"}</p>
          <CrmReferenceCell referenceDocname={r.reference_docname} referenceMap={referenceMap} />
          <p className="line-clamp-2 text-xs text-muted-foreground">{r.content ? textPreview(r.content, 160) : ""}</p>
        </div>
      ),
      showId: true,
      emptyTitle: "No notes yet",
      emptyDescription: "Capture important context by creating your first note",
      newLabel: "New Note",
    }),
    [columns, referenceMap],
  );

  return <CrmManagementPage config={config} />;
}
