import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useFrappeGetDocCount } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { ArrowLeft, Trash2, Plus, UserRound, Sparkles } from "lucide-react";
import { EmployeeInsights } from "@/components/hr/employee-insights";
import { EmployeeProfileHero } from "@/components/hr/employee-profile-hero";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { useEmployee, useEmployeeMutations } from "@/hooks/useEmployee";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";

const sb = (fieldname: string, label?: string): FormFieldMeta => ({ fieldname, fieldtype: "Section Break", label });
const cb = (fieldname: string): FormFieldMeta => ({ fieldname, fieldtype: "Column Break" });

interface ConnectionItem {
  doctype: string;
  label: string;
  to: (employee: string) => string;
}

const CONNECTIONS: { title: string; items: ConnectionItem[] }[] = [
  {
    title: "Attendance",
    items: [
      { doctype: "Attendance", label: "Attendance", to: (e) => `/hr/attendance?employee=${encodeURIComponent(e)}` },
      { doctype: "Employee Checkin", label: "Employee Checkin", to: (e) => `/hr/checkins?employee=${encodeURIComponent(e)}` },
    ],
  },
  {
    title: "Leave",
    items: [
      { doctype: "Leave Application", label: "Leave Application", to: (e) => `/hr/leave-applications?employee=${encodeURIComponent(e)}` },
      { doctype: "Leave Allocation", label: "Leave Allocation", to: (e) => `/hr/leave-allocations?employee=${encodeURIComponent(e)}` },
    ],
  },
  {
    title: "Payroll",
    items: [
      { doctype: "Salary Structure Assignment", label: "Salary Structure Assignment", to: (e) => `/payroll/salary-structure-assignments?employee=${encodeURIComponent(e)}` },
      { doctype: "Salary Slip", label: "Salary Slip", to: (e) => `/payroll/salary-slips?employee=${encodeURIComponent(e)}` },
    ],
  },
  {
    title: "Expense & Advances",
    items: [
      { doctype: "Expense Claim", label: "Expense Claim", to: (e) => `/hr/expense-claims?employee=${encodeURIComponent(e)}` },
      { doctype: "Employee Advance", label: "Employee Advance", to: (e) => `/hr/advances?employee=${encodeURIComponent(e)}` },
    ],
  },
  {
    title: "Other",
    items: [
      { doctype: "Gratuity", label: "Gratuity", to: (e) => `/hr/gratuity?employee=${encodeURIComponent(e)}` },
      { doctype: "Shift Assignment", label: "Shift Assignment", to: (e) => `/hr/shift-assignments?employee=${encodeURIComponent(e)}` },
    ],
  },
];

function ConnectionButton({ item, employee }: { item: ConnectionItem; employee: string }) {
  const navigate = useNavigate();
  const { data: count } = useFrappeGetDocCount(
    item.doctype,
    [["employee", "=", employee]],
    false,
    `micromax.hr.employee.connections.${item.doctype}.${employee}`,
  );
  return (
    <button
      onClick={() => navigate(item.to(employee))}
      className="flex w-full items-center justify-between rounded-md border border-input bg-popover px-3 py-2 text-sm hover:bg-accent"
    >
      <span className="flex items-center gap-2">
        {item.label}
        {!!count && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">{count}</span>
        )}
      </span>
      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function ConnectionsTab({ employee }: { employee: string }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {CONNECTIONS.map((group) => (
        <div key={group.title} className="space-y-2">
          <h4 className="text-sm font-semibold">{group.title}</h4>
          <div className="space-y-2">
            {group.items.map((item) => (
              <ConnectionButton key={item.doctype} item={item} employee={employee} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const TABS: { key: string; label: string; fields: FormFieldMeta[] }[] = [
  {
    key: "overview",
    label: "Overview",
    fields: [
      sb("sb_basic", "Basic Details"),
      { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
      { fieldname: "middle_name", label: "Middle Name", fieldtype: "Data" },
      { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
      cb("cb_basic1"),
      { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender", reqd: true },
      { fieldname: "date_of_birth", label: "Date of Birth", fieldtype: "Date", reqd: true },
      { fieldname: "salutation", label: "Salutation", fieldtype: "Link", options: "Salutation" },
      cb("cb_basic2"),
      { fieldname: "date_of_joining", label: "Date of Joining", fieldtype: "Date", reqd: true },
      { fieldname: "status", label: "Status", fieldtype: "Select", options: "Active\nInactive\nSuspended\nLeft", reqd: true },
      sb("sb_user", "User Details"),
      { fieldname: "user_id", label: "User ID", fieldtype: "Link", options: "User" },
      { fieldname: "create_user_permission", label: "Create User Permission", fieldtype: "Check" },
      sb("sb_company", "Company Details"),
      { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
      { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" },
      { fieldname: "employee_number", label: "Employee Number", fieldtype: "Data" },
      cb("cb_company1"),
      { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation" },
      { fieldname: "reports_to", label: "Reports to", fieldtype: "Link", options: "Employee" },
      cb("cb_company2"),
      { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
      { fieldname: "cell_number", label: "Mobile", fieldtype: "Data" },
      cb("cb_company3"),
      { fieldname: "company_email", label: "Company Email", fieldtype: "Data" },
      { fieldname: "personal_email", label: "Personal Email", fieldtype: "Data" },
      cb("cb_company4"),
      { fieldname: "prefered_contact_email", label: "Preferred Contact Email", fieldtype: "Select", options: "\nCompany Email\nPersonal Email\nUser ID" },
      { fieldname: "prefered_email", label: "Preferred Email", fieldtype: "Data" },
      { fieldname: "unsubscribed", label: "Unsubscribed", fieldtype: "Check" },
    ],
  },
  {
    key: "address",
    label: "Address & Contacts",
    fields: [
      sb("sb_address", "Address"),
      { fieldname: "current_address", label: "Current Address", fieldtype: "Text" },
      { fieldname: "current_accommodation_type", label: "Current Address Is", fieldtype: "Select", options: "\nRented\nOwned" },
      cb("cb_address"),
      { fieldname: "permanent_address", label: "Permanent Address", fieldtype: "Text" },
      { fieldname: "permanent_accommodation_type", label: "Permanent Address Is", fieldtype: "Select", options: "\nRented\nOwned" },
      sb("sb_emergency", "Emergency Contact"),
      { fieldname: "person_to_be_contacted", label: "Emergency Contact Name", fieldtype: "Data" },
      cb("cb_emergency1"),
      { fieldname: "emergency_phone_number", label: "Emergency Phone", fieldtype: "Data" },
      cb("cb_emergency2"),
      { fieldname: "relation", label: "Relation", fieldtype: "Data" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance & Leaves",
    fields: [
      { fieldname: "attendance_device_id", label: "Attendance Device ID (Biometric/RF tag ID)", fieldtype: "Data" },
      cb("cb_att"),
      { fieldname: "holiday_list", label: "Holiday List", fieldtype: "Link", options: "Holiday List" },
    ],
  },
  {
    key: "salary",
    label: "Salary",
    fields: [
      { fieldname: "ctc", label: "Cost to Company (CTC)", fieldtype: "Currency" },
      { fieldname: "salary_currency", label: "Salary Currency", fieldtype: "Link", options: "Currency" },
      { fieldname: "salary_mode", label: "Salary Mode", fieldtype: "Select", options: "\nBank\nCash\nCheque" },
      sb("sb_bank", "Bank Details"),
      { fieldname: "bank_name", label: "Bank Name", fieldtype: "Data" },
      cb("cb_bank"),
      { fieldname: "bank_ac_no", label: "Bank A/C No.", fieldtype: "Data" },
      { fieldname: "iban", label: "IBAN", fieldtype: "Data" },
    ],
  },
  {
    key: "personal",
    label: "Personal Details",
    fields: [
      { fieldname: "marital_status", label: "Marital Status", fieldtype: "Select", options: "\nSingle\nMarried\nDivorced\nWidowed" },
      { fieldname: "family_background", label: "Family Background", fieldtype: "Text" },
      cb("cb_personal"),
      { fieldname: "blood_group", label: "Blood Group", fieldtype: "Select", options: "\nA+\nA-\nB+\nB-\nAB+\nAB-\nO+\nO-" },
      { fieldname: "health_details", label: "Health Details", fieldtype: "Text" },
      sb("sb_passport", "Passport Details"),
      { fieldname: "passport_number", label: "Passport Number", fieldtype: "Data" },
      { fieldname: "valid_upto", label: "Valid Up To", fieldtype: "Date" },
      cb("cb_passport"),
      { fieldname: "date_of_issue", label: "Date of Issue", fieldtype: "Date" },
      { fieldname: "place_of_issue", label: "Place of Issue", fieldtype: "Data" },
      sb("sb_bio", "Bio"),
      { fieldname: "bio", label: "Bio / Cover Letter", fieldtype: "Text Editor" },
    ],
  },
  {
    key: "joining",
    label: "Joining",
    fields: [
      { fieldname: "scheduled_confirmation_date", label: "Offer Date", fieldtype: "Date" },
      cb("cb_join1"),
      { fieldname: "final_confirmation_date", label: "Confirmation Date", fieldtype: "Date" },
      { fieldname: "contract_end_date", label: "Contract End Date", fieldtype: "Date" },
      cb("cb_join2"),
      { fieldname: "notice_number_of_days", label: "Notice (days)", fieldtype: "Int" },
      { fieldname: "date_of_retirement", label: "Date Of Retirement", fieldtype: "Date" },
    ],
  },
  {
    key: "exit",
    label: "Exit",
    fields: [
      { fieldname: "resignation_letter_date", label: "Resignation Letter Date", fieldtype: "Date" },
      { fieldname: "relieving_date", label: "Relieving Date", fieldtype: "Date" },
      cb("cb_exit1"),
      { fieldname: "held_on", label: "Exit Interview Held On", fieldtype: "Date" },
      { fieldname: "new_workplace", label: "New Workplace", fieldtype: "Data" },
      cb("cb_exit2"),
      { fieldname: "leave_encashed", label: "Leave Encashed?", fieldtype: "Select", options: "\nYes\nNo" },
      { fieldname: "encashment_date", label: "Encashment Date", fieldtype: "Date" },
      sb("sb_feedback", "Feedback"),
      { fieldname: "reason_for_leaving", label: "Reason for Leaving", fieldtype: "Text" },
      cb("cb_feedback"),
      { fieldname: "feedback", label: "Feedback", fieldtype: "Text" },
    ],
  },
  { key: "connections", label: "Connections", fields: [] },
];

const ALL_EDITABLE_FIELDNAMES = TABS.flatMap((t) => t.fields)
  .filter((f) => f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break")
  .map((f) => f.fieldname);

/**
 * Employee view/edit page — tabbed like ERPNext's own desk form, instead of
 * the flat single-dialog editor the generic management-page list uses.
 * Related records (attendance, leave, payroll) live on their own list pages
 * rather than a Frappe-style "Connections" tab — filtering by employee there
 * covers the same ground.
 */
export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: doc, error, isLoading, mutate } = useEmployee(name);
  const { updateDoc, deleteDoc, saving, deleting } = useEmployeeMutations();

  const [activeTab, setActiveTab] = useState(TABS[0].key);
  const [values, setValues] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (doc) {
      const picked: Record<string, any> = {};
      ALL_EDITABLE_FIELDNAMES.forEach((f) => {
        picked[f] = doc[f] ?? "";
      });
      setValues(picked);
      setDirty(false);
    }
  }, [doc]);

  const tab = useMemo(() => TABS.find((t) => t.key === activeTab) ?? TABS[0], [activeTab]);

  const handleChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name) return;
    try {
      await updateDoc(name, values);
      toast.success("Employee updated");
      setDirty(false);
      await mutate();
      notifyDataChanged();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Employee deleted");
      notifyDataChanged();
      navigate("/hr/employees");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" />
        <Card className="p-4">
          <p className="text-sm text-destructive">Failed to load employee {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const displayName = doc.employee_name || `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() || doc.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        subtitle="Employee"
        icon={<UserRound className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/hr/employees" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Employees
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Employee" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={doc.status} />
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </>
        }
      />
      <EmployeeProfileHero
        doc={doc}
        displayName={displayName}
        onPhotoChange={async (url) => {
          try {
            await updateDoc(doc.name, { image: url });
            toast.success(url ? "Photo updated" : "Photo removed");
            await mutate();
            notifyDataChanged();
          } catch (err) {
            toast.error(humanizeError(err));
          }
        }}
      />

      <DocPageTabs
        doctype="Employee"
        name={doc?.name ?? name}
        initial="insights"
        extraTabs={[{ id: "insights", label: "Insights", icon: Sparkles, content: <EmployeeInsights employee={doc.name} /> }]}
      />

      <Card className="overflow-x-auto p-1">
        <div className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        {tab.key === "connections" ? (
          <ConnectionsTab employee={doc.name} />
        ) : (
          <FrappeForm fields={tab.fields} values={values} onChange={handleChange} />
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this employee?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
