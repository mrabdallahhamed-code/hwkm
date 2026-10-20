// اختبارات حوكم التلقائية — تشغيل: node tests/run.js
// تعمل بدون اتصال بقاعدة البيانات (Supabase مستبدل بنسخة وهمية)، وتغطي: سلامة الملفات، التحميل، الصلاحيات، منطق الأسماء والهيكل.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC_ROOT = path.resolve(__dirname, "..");
const DIST_MODE = process.env.DIST === "1";
const ROOT = DIST_MODE ? path.join(SRC_ROOT, "dist") : SRC_ROOT;
let pw;
try { pw = require("playwright"); } catch (e) { try { pw = require("/opt/npm-tools/node_modules/playwright"); } catch (e2) { console.error("playwright غير مثبت"); process.exit(2); } }

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; console.log("  ✘", name, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}

(async () => {
  if(!DIST_MODE){
  console.log("1) سلامة الملفات");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script[^>]+src="(js\/[^"?]+)/g)].map(m => m[1]);
  ok("كل ملفات js المذكورة في index.html موجودة", srcs.length > 0 && srcs.every(s => fs.existsSync(path.join(ROOT, s))), srcs.filter(s => !fs.existsSync(path.join(ROOT, s))));
  ok("style.css موجود ومربوط", fs.existsSync(path.join(ROOT, "style.css")) && /href="style\.css/.test(html));
  const onDisk = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f);
  ok("لا ملفات js يتيمة غير مربوطة", onDisk.every(f => srcs.includes(f)), onDisk.filter(f => !srcs.includes(f)));
  let syntaxBad = [];
  for (const s of srcs) { try { execFileSync(process.execPath, ["--check", path.join(ROOT, s)], { stdio: "pipe" }); } catch (e) { syntaxBad.push(s); } }
  ok("لا أخطاء صياغة في ملفات js", syntaxBad.length === 0, syntaxBad);

  }

  console.log("2) تحميل الصفحة");
  const browser = await pw.chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined }).catch(() => pw.chromium.launch());
  const pg = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  pg.on("pageerror", e => errs.push(e.message.slice(0, 150)));
  await pg.addInitScript(() => {
    const mk = () => new Proxy(function () {}, { get: (t, k) => k === "then" ? (res) => res({ data: null, error: null, count: 0 }) : mk(), apply: () => mk() });
    window.supabase = { createClient: () => mk() };
  });
  await pg.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  await pg.goto("file://" + path.join(ROOT, "index.html"));
  await pg.waitForTimeout(1200);
  ok("لا أخطاء برمجية عند التحميل", errs.length === 0, errs);
  const fnCount = await pg.evaluate(() => Object.getOwnPropertyNames(window).filter(k => typeof window[k] === "function").length);
  ok("الدوال محمّلة (أكثر من 1500)", fnCount > 1500, fnCount);

  console.log("3) الصلاحيات حسب الدور");
  const perms = await pg.evaluate(() => {
    myPermissionOverrides = {}; userMemberships = [{ company_id: 1, role: "مساهم" }];
    currentUserProfile = { email: "a@b.c", is_platform_admin: false };
    currentShareholdersSeeReports = false;
    const o = {};
    o.shAgm = isPageAllowed("agm", "مساهم"); o.shVoting = isPageAllowed("voting", "مساهم"); o.shSigning = isPageAllowed("signing", "مساهم");
    o.shDashboard = isPageAllowed("dashboard", "مساهم"); o.shRisks = isPageAllowed("risks", "مساهم"); o.shReportsOff = isPageAllowed("reports", "مساهم");
    currentShareholdersSeeReports = true; o.shReportsOn = isPageAllowed("reports", "مساهم"); currentShareholdersSeeReports = false;
    o.adminDashboard = isPageAllowed("dashboard", "مدير النظام");
    o.nonPlatformAdminPage = isPageAllowed("platformusers", "مدير النظام");
    return o;
  });
  ok("المساهم يرى الجمعية والتصويت والتوقيع", perms.shAgm && perms.shVoting && perms.shSigning, perms);
  ok("المساهم لا يرى لوحة التحكم ولا المخاطر", !perms.shDashboard && !perms.shRisks, perms);
  ok("تقارير الحوكمة للمساهم تتبع إذن المدير", perms.shReportsOff === false && perms.shReportsOn === true, perms);
  ok("مدير النظام يرى لوحة التحكم", perms.adminDashboard === true);
  ok("صفحات مالك المنصة لا تظهر لغيره", perms.nonPlatformAdminPage === false);

  console.log("4) منطق الأسماء والتوقيع");
  const names = await pg.evaluate(() => {
    currentUserProfile = { full_name: "عبدالله حامد محمد" };
    return {
      same: isMyName("عبدالله حامد محمد"),
      hamza: isMyName("عبدالله حامد"),
      diacritic: isMyName("عَبدالله حامد محمد"),
      other: isMyName("خالد العتيبي"),
      empty: isMyName(""),
      norm: normArName("أحمد  المُهندِس"),
    };
  });
  ok("اسم مطابق", names.same); ok("اسم مختصر يطابق", names.hamza); ok("التشكيل لا يؤثر", names.diacritic);
  ok("اسم مختلف لا يطابق", names.other === false); ok("اسم فارغ لا يطابق", names.empty === false);
  ok("تطبيع الهمزات", names.norm === "احمد المهندس", names.norm);

  console.log("5) الهيكل التنظيمي");
  const org = await pg.evaluate(() => ({
    legacy: orgHolderList({ holder_name: "سالم", appointment_date: "2025-01-01" }),
    multi: orgHolderList({ holders: [{ name: "أ" }, { name: "ب" }, { name: "ج" }], holder_name: "x" }).length,
    none: orgHolderList({}).length,
    levels: [ORG_UNIT_LEVEL.department, ORG_UNIT_LEVEL.section, ORG_UNIT_LEVEL.unit],
  }));
  ok("شاغل قديم يُقرأ كشخص واحد", org.legacy.length === 1 && org.legacy[0].name === "سالم", org.legacy);
  ok("منصب بثلاثة أشخاص", org.multi === 3); ok("منصب بلا شاغل", org.none === 0);
  ok("مستويات الإدارة والقسم والوحدة", JSON.stringify(org.levels) === "[6,7,8]", org.levels);

  await browser.close();
  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})();
