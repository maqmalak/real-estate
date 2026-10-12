/**
 * "Generate document…" dialog for real-estate forms (booking, plot, bill, receipt, transfer, customer): pick the document,
 * English or Urdu (اردو, right-to-left PDF), generate a new version on the letterhead, and re-open earlier versions.
 * Forms open it with openGenerateDocs(); <GenerateDocsHost/> (mounted once in the real-estate routes) renders it.
 */
import { Check, Download, FileText, Languages, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Dialog } from "@/components/ui/dialog";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/re/lib/utils";

export type DocLang = "en" | "ur";
interface Version { name: string; version: number; language: DocLang | null; issued_on: string; issued_by: string; file: string | null }
interface Available { document_type: string; versions: Version[]; languages: DocLang[] }
interface Request { doctype: string; name: string; types?: string[]; preselect?: string; reload?: () => void }

const EVENT = "re:generate-docs";
const LANG_KEY = "re-doc-lang";
export const LANG_LABEL: Record<DocLang, string> = { en: "English", ur: "اردو" };

export function openGenerateDocs(req: Request) {
  window.dispatchEvent(new CustomEvent<Request>(EVENT, { detail: req }));
}

function savedLang(): DocLang {
  try {
    return localStorage.getItem(LANG_KEY) === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

/** English / اردو switch (also used on the Documents page). */
export function LangToggle({ value, onChange, disabledUr }: { value: DocLang; onChange: (v: DocLang) => void; disabledUr?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-sm" role="radiogroup" aria-label="Document language">
      {(["en", "ur"] as DocLang[]).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} disabled={l === "ur" && disabledUr}
          onClick={() => onChange(l)} title={l === "ur" ? "Urdu, right-to-left" : "English"}
          className={cn("rounded-md px-3 py-1 font-medium transition disabled:opacity-40", value === l ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            l === "ur" && "font-[serif]")}>
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export function GenerateDocsHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [docs, setDocs] = useState<Available[] | null>(null);
  const [type, setType] = useState("");
  const [lang, setLang] = useState<DocLang>(savedLang);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<Request>).detail;
      setReq(r);
      setDocs(null);
      void getCall<Available[]>("realestate.documents.available", { doctype: r.doctype, name: r.name })
        .then((list) => {
          const shown = r.types ? list.filter((d) => r.types!.includes(d.document_type)) : list;
          setDocs(shown);
          setType(r.preselect && shown.some((d) => d.document_type === r.preselect) ? r.preselect : shown[0]?.document_type ?? "");
        })
        .catch((err) => { toast.error(humanizeError(err)); setReq(null); });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const current = docs?.find((d) => d.document_type === type);
  const urOk = current?.languages.includes("ur") ?? false;
  const effLang: DocLang = lang === "ur" && !urOk ? "en" : lang;
  const pickLang = (l: DocLang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* not remembered */ }
  };
  const generate = async () => {
    if (!req || !type) return;
    setBusy(true);
    try {
      const r = await postCall<{ file_url: string; version: number }>("realestate.documents.generate", { document_type: type, reference_name: req.name, language: effLang });
      toast.success(`${type} (${LANG_LABEL[effLang]}) v${r.version} generated`);
      window.open(r.file_url, "_blank");
      req.reload?.();
      setReq(null);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(req)} onClose={() => setReq(null)} title="Generate document" size="lg"
      description={req ? `${req.doctype.replace(/^RE /, "")} ${req.name} — a new version on the letterhead, in English or Urdu` : undefined}>
      {!docs ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !docs.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No documents for this record.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {docs.map((d) => {
              const on = d.document_type === type;
              const last = d.versions[0];
              return (
                <button key={d.document_type} type="button" onClick={() => setType(d.document_type)}
                  className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", on ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "hover:bg-muted/60")}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {on ? <Check className="size-4" /> : <FileText className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{d.document_type}</span>
                    <span className="block text-xs text-muted-foreground">
                      {last ? `v${last.version} · ${LANG_LABEL[last.language ?? "en"]} · ${new Date(last.issued_on).toLocaleDateString()}` : "Not generated yet"}
                      {d.languages.includes("ur") ? "" : " · English only"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium"><Languages className="size-4 text-muted-foreground" /> Language</span>
            <LangToggle value={effLang} onChange={pickLang} disabledUr={!urOk} />
          </div>
          {effLang === "ur" && <p className="-mt-2 text-xs text-muted-foreground" dir="rtl">اردو دستاویز دائیں سے بائیں — رقم، تاریخ اور شناختی کارڈ نمبر انگریزی ہندسوں میں رہیں گے۔</p>}

          {current && current.versions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earlier versions</p>
              <ul className="max-h-40 divide-y overflow-y-auto rounded-xl border">
                {current.versions.map((v) => (
                  <li key={v.name} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span>v{v.version} · <span className={cn(v.language === "ur" && "font-[serif]")}>{LANG_LABEL[v.language ?? "en"]}</span>
                      <span className="text-xs text-muted-foreground"> · {new Date(v.issued_on).toLocaleString()} · {v.issued_by}</span></span>
                    {v.file && <a href={v.file} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open"><Download className="size-4" /></a>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={() => setReq(null)} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="button" onClick={() => void generate()} disabled={busy || !type}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Generate {LANG_LABEL[effLang]} PDF
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
