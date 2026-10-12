/** English / Urdu for the real-estate screens (owner portal first). Urdu switches the layout to right-to-left. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ur";

const UR: Record<string, string> = {
  "My plots": "میرے پلاٹ", "Home": "ہوم", "Payments": "ادائیگیاں", "Documents": "دستاویزات", "Help": "مدد", "Complaints": "شکایات",
  "Sign out": "لاگ آؤٹ", "Welcome": "خوش آمدید", "Total price": "کل قیمت", "Paid": "ادا شدہ", "Outstanding": "بقایا", "Overdue": "زائد المیعاد",
  "Society dues": "سوسائٹی واجبات", "Surcharge": "تاخیری جرمانہ", "Next due": "اگلی قسط", "on": "بتاریخ", "Plot": "پلاٹ", "Block": "بلاک",
  "Size": "سائز", "Status": "حیثیت", "Payment plan": "ادائیگی کا منصوبہ", "Booked on": "بکنگ کی تاریخ", "Installment schedule": "اقساط کا شیڈول",
  "Installment": "قسط", "Due date": "آخری تاریخ", "Amount": "رقم", "Receipts": "رسیدیں", "Society bills": "سوسائٹی بل", "Month": "مہینہ",
  "Download": "ڈاؤن لوڈ", "Payment schedule": "ادائیگی کا شیڈول", "Account statement": "کھاتے کا گوشوارہ", "Allotment letter": "الاٹمنٹ لیٹر",
  "Site plan": "سائٹ پلان", "No demand certificate": "عدم مطالبہ سرٹیفکیٹ", "Maintenance bill": "مینٹیننس بل", "Receipt": "رسید",
  "Raise a complaint": "شکایت درج کریں", "What is the problem?": "مسئلہ کیا ہے؟", "Type": "قسم", "Details": "تفصیل", "Submit": "جمع کریں",
  "Your complaints": "آپ کی شکایات", "Your agent": "آپ کا ایجنٹ", "Call": "کال", "WhatsApp": "واٹس ایپ", "Paid off": "مکمل ادا",
  "of": "میں سے", "paid": "ادا", "Due": "واجب الادا", "Unpaid": "غیر ادا شدہ", "Partly Paid": "جزوی ادا شدہ", "Open": "زیر کارروائی",
  "Completed": "مکمل", "Working": "جاری", "Available": "دستیاب", "Booked": "بک شدہ", "Sold": "فروخت شدہ", "Possession Given": "قبضہ دیا گیا",
  "View": "دیکھیں", "Back": "واپس", "Complaint submitted": "شکایت درج ہو گئی", "No complaints yet": "ابھی کوئی شکایت نہیں",
  "Nothing yet": "ابھی کچھ نہیں", "Pay at the society office or by bank transfer quoting your booking number.": "سوسائٹی آفس میں یا بینک ٹرانسفر سے بکنگ نمبر کے حوالے سے ادائیگی کریں۔",
  "Owner portal": "مالکان پورٹل", "Location on the map": "نقشے پر مقام", "Language": "زبان", "Generated documents": "جاری شدہ دستاویزات",
  "Get your documents": "اپنی دستاویزات حاصل کریں", "Medium": "درمیانی", "High": "زیادہ", "Urgent": "فوری", "Low": "کم", "Priority": "ترجیح",
  "Corner": "کارنر", "Site photos": "سائٹ کی تصاویر", "Critical": "انتہائی اہم", "Normal": "عام", "Park facing": "پارک کے سامنے",
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string) => string;
  dir: "ltr" | "rtl";
}

const I18n = createContext<Ctx>({ lang: "en", setLang: () => undefined, t: (s) => s, dir: "ltr" });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("re-lang") as Lang) || "en";
    } catch {
      return "en";
    }
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("re-lang", l);
    } catch {
      /* private mode */
    }
  };
  useEffect(() => {
    if (lang === "ur" && !document.getElementById("re-urdu-font")) {
      const link = Object.assign(document.createElement("link"), {
        id: "re-urdu-font", rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap",
      });
      document.head.appendChild(link);
    }
  }, [lang]);
  const value: Ctx = { lang, setLang, t: (s) => (lang === "ur" ? UR[s] ?? s : s), dir: lang === "ur" ? "rtl" : "ltr" };
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`flex rounded-full border-[1.5px] border-input bg-input-bg p-0.5 text-xs font-semibold ${className}`} role="radiogroup" aria-label="Language">
      {(["en", "ur"] as const).map((l) => (
        <button key={l} role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          {l === "en" ? "EN" : "اردو"}
        </button>
      ))}
    </div>
  );
}
