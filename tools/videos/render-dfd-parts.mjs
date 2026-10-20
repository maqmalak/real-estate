// Level 1 DFD split into three readable parts for slides and the PDF.
import { chromium } from "playwright";
const out = new URL("../../docs/fsd-assets/", import.meta.url).pathname;
const parts = {
  "dfd-1a-sell": `flowchart LR
  Buyer["Prospect / Buyer"]:::ext
  Agent["Sales Agent / Dealer"]:::ext
  Mgr["Sales Manager"]:::ext
  P2(("2.0 CRM &<br/>site visits"))
  P3(("3.0 Booking &<br/>schedule"))
  D1[("D1 Plots & map")]
  D2[("D2 Leads, deals,<br/>calls, visits")]
  D3[("D3 Bookings &<br/>installments")]
  D5[("D5 General ledger")]
  D10[("D10 Plans, discount limit")]
  Buyer -- enquiry --> P2
  Agent -- "calls, visits" --> P2
  P2 -- "lead, deal, follow-ups" --> D2
  D1 -- "available plots" --> P2
  D2 -- "won deal → customer" --> P3
  D1 -- "plot, list price" --> P3
  D10 -- "payment plan" --> P3
  Mgr -- "discount approval" --> P3
  P3 -- "booking, schedule" --> D3
  P3 -- "plot = Booked" --> D1
  P3 -- "Sales Invoice" --> D5
  P3 -- "allotment letter" --> Buyer
  classDef ext fill:#ffffff,stroke:#14201e,stroke-width:1.5px`,
  "dfd-1a-collect": `flowchart LR
  Owner["Plot Owner"]:::ext
  Agent["Agent / Dealer"]:::ext
  P4(("4.0 Collections<br/>& recovery"))
  P6(("6.0 Commissions"))
  D3[("D3 Bookings &<br/>installments")]
  D4[("D4 Receipts &<br/>allocations")]
  D5[("D5 General ledger")]
  Owner -- payment --> P4
  D3 -- "dues, overdue" --> P4
  P4 -- "receipt, allocation" --> D4
  P4 -- "Payment Entry,<br/>surcharge, dunning" --> D5
  P4 -- "reminders, notices" --> Owner
  D4 -- "share paid" --> P6
  P6 -- "payout Payment Entry" --> D5
  P6 -- "voucher" --> Agent
  classDef ext fill:#ffffff,stroke:#14201e,stroke-width:1.5px`,
  "dfd-1a-postsale": `flowchart LR
  Owner["Plot Owner /<br/>new buyer"]:::ext
  Mgr["Sales Manager"]:::ext
  P5(("5.0 Post-sale<br/>operations"))
  D1[("D1 Plots & map")]
  D3[("D3 Bookings &<br/>installments")]
  D5[("D5 General ledger")]
  D9[("D9 Documents")]
  Owner -- "transfer / cancel /<br/>re-allot / merge request" --> P5
  Mgr -- "approve / reject" --> P5
  D3 -- "dues check" --> P5
  P5 -- "new owner, refund,<br/>new booking" --> D3
  P5 -- "released / merged plot" --> D1
  P5 -- "fee invoice, credit notes,<br/>refund, waiver" --> D5
  P5 -- "transfer / cancellation letter" --> D9
  D9 -- "letters" --> Owner
  classDef ext fill:#ffffff,stroke:#14201e,stroke-width:1.5px`,
  "dfd-1b-society": `flowchart LR
  Owner["Plot Owner"]:::ext
  Soc["Society Manager &<br/>Technicians"]:::ext
  Sup["Suppliers &<br/>Contractors"]:::ext
  Mgmt["Management"]:::ext
  P7(("7.0 Society billing<br/>& maintenance"))
  P8(("8.0 Development,<br/>stock & assets"))
  D1[("D1 Plots & map")]
  D5[("D5 General ledger")]
  D6[("D6 Society bills &<br/>charge heads")]
  D7[("D7 Tasks &<br/>maintenance plans")]
  D8[("D8 Purchases, stock,<br/>assets, budgets")]
  D1 -- "occupied plots" --> P7
  Soc -- "charge heads, job updates" --> P7
  Owner -- complaint --> P7
  P7 -- "monthly bills, arrears" --> D6
  P7 -- jobs --> D7
  P7 -- "bill invoices, receipts" --> D5
  P7 -- "bills, job done" --> Owner
  Mgmt -- budgets --> P8
  Sup -- "goods, running bills" --> P8
  P8 -- "MR, PO, receipt, issue, asset" --> D8
  P8 -- "purchase invoices, depreciation" --> D5
  P8 -- "orders, payments" --> Sup
  classDef ext fill:#ffffff,stroke:#14201e,stroke-width:1.5px`,
  "dfd-1c-setup-docs": `flowchart LR
  Admin["Admin / Management"]:::ext
  WA["WhatsApp / SMS / Email"]:::ext
  Users["All users"]:::ext
  P1(("1.0 Project &<br/>land setup"))
  P9(("9.0 Documents &<br/>messaging"))
  P10(("10.0 Reports &<br/>dashboards"))
  D1[("D1 Project, blocks,<br/>plots, map")]
  D3[("D3 Bookings")]
  D5[("D5 General ledger")]
  D6[("D6 Society bills")]
  D9[("D9 Documents, vault,<br/>conversations")]
  D10[("D10 Settings,<br/>plans, rates")]
  Admin -- "boundary, layout, sizes, prices" --> P1
  D10 --> P1
  P1 --> D1
  D3 --> P9
  D6 --> P9
  P9 -- "PDF versions, chats" --> D9
  P9 -- "templates, reminders" --> WA
  WA -- "incoming messages, status" --> P9
  D5 --> P10
  D3 --> P10
  D6 --> P10
  P10 -- "dashboards, insights, reports" --> Users
  classDef ext fill:#ffffff,stroke:#14201e,stroke-width:1.5px`,
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0;background:#fff"><div id="d"></div><script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script></body></html>`);
await page.waitForFunction(() => window.mermaid);
let n = 0;
for (const [name, code] of Object.entries(parts)) {
  await page.evaluate(async ([c, i]) => {
    mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { primaryColor: "#e2f1ee", primaryBorderColor: "#0f766e", primaryTextColor: "#14201e",
      lineColor: "#51625f", fontFamily: "Arial", fontSize: "16px" }, flowchart: { curve: "basis", padding: 16, nodeSpacing: 40, rankSpacing: 70 } });
    const { svg } = await mermaid.render(`p${i}`, c);
    document.getElementById("d").innerHTML = svg;
  }, [code, n++]);
  await page.locator("#d svg").screenshot({ path: `${out}${name}.png` });
  console.log("rendered", name);
}
await browser.close();
