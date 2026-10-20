// فحص أسماء غير معرّفة في ملفات js (دالة مكتوبة بخطأ، أو متغير غير موجود).
// يستخدم TypeScript بوضع الفحص فقط، ويتجاهل المكتبات الخارجية المعروفة والدوال المعرّفة عبر window.
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(__dirname, "..");
let tsc = null;
for (const c of [path.join(ROOT, "node_modules/typescript/bin/tsc"), "/opt/npm-tools/node_modules/typescript/bin/tsc"]) if (fs.existsSync(c)) { tsc = c; break; }
if (!tsc) { console.error("typescript غير مثبت (npm install)"); process.exit(2); }

const ALLOWED = new Set(["XLSX", "html2pdf", "PDFLib", "pdfjsLib", "PizZip", "docxtemplater", "Docxtemplater", "Sentry",
  "uiConfirm", "uiPrompt", "uiToast", "supabase"]);   // مكتبات خارجية + دوال تُعرَّف عبر window.*
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hwkm-chk-"));
for (const f of fs.readdirSync(path.join(ROOT, "js"))) if (f.endsWith(".js")) fs.copyFileSync(path.join(ROOT, "js", f), path.join(tmp, f));
fs.writeFileSync(path.join(tmp, "tsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: true, noEmit: true, target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: false, skipLibCheck: true, types: [] }, include: ["*.js"] }));
let out = "";
try { execFileSync(process.execPath, [tsc, "-p", tmp], { stdio: "pipe" }); }
catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); }
const bad = out.split("\n").filter(l => /error TS(2304|2552):/.test(l)).filter(l => {
  const m = l.match(/Cannot find name '([^']+)'/);
  return !(m && ALLOWED.has(m[1]));
});
if (bad.length) { console.log("أسماء غير معرّفة:\n" + bad.join("\n")); process.exit(1); }
console.log("✔ لا أسماء غير معرّفة");
