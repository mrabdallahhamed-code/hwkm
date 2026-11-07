// اختبارات المسارات الكاملة — تشغيل: node tests/flows.js
// تشغّل كود المنصة الحقيقي فوق قاعدة بيانات وهمية في الذاكرة (tests/fake-supabase.js)،
// فتجرّب المسار من أوله إلى آخره بلا حسابات حقيقية ولا لمس بيانات العملاء.
const fs = require("fs");
const path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) { try { pw = require("/opt/npm-tools/node_modules/playwright"); } catch (e2) { console.error("playwright غير مثبت"); process.exit(1); } }

const SRC_ROOT = path.resolve(__dirname, "..");
const ROOT = process.env.DIST === "1" ? path.join(SRC_ROOT, "dist") : SRC_ROOT;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; console.log("  ✘", name, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}

(async () => {
  const browser = await pw.chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined }).catch(() => pw.chromium.launch());
  const pg = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
  await pg.addInitScript({ content: fs.readFileSync(path.join(__dirname, "fake-supabase.js"), "utf8") });
  await pg.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : r.abort()));
  await pg.goto("file://" + path.join(ROOT, "index.html"));
  await pg.waitForTimeout(1200);

  /* ───────── مسار 1: قرار تمرير للجمعية العامة (إنشاء ← تصويت ← اعتماد) ───────── */
  console.log("مسار 1) قرار التمرير: من الإنشاء حتى الاعتماد");
  const f1 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    window.uiConfirm = async () => true; window.uiPrompt = async () => "";
    // بيانات الشركة والمساهمين
    __db.companies = [{ id: 1, name: "شركة تجريبية", total_shares: 1000, company_type: "مساهمة غير مدرجة" }];
    __db.shareholders = [
      { id: 1, company_id: 1, name: "أحمد", shares_count: 400, claimed_by_email: "a@test.sa" },
      { id: 2, company_id: 1, name: "بسمة", shares_count: 350, claimed_by_email: "b@test.sa" },
      { id: 3, company_id: 1, name: "جمال", shares_count: 250, claimed_by_email: "c@test.sa" },
    ];
    __db.board_members = [];
    currentCompanyId = 1; currentCompanyType = "مساهمة غير مدرجة"; circTab = "الجمعية العامة";
    userMemberships = [{ company_id: 1, role: "مدير النظام" }];
    currentUserProfile = { email: "admin@test.sa", full_name: "المدير", is_platform_admin: false };
    __fakeUser = { email: "admin@test.sa" };
    const q = (id) => document.getElementById(id);
    const res = {};
    const settle = () => new Promise((r) => setTimeout(r, 250)); // الواجهة تعيد التحميل دون انتظار

    // 1) المدير ينشئ القرار بمرفق
    circOpenNew();
    q("cn-title").value = "الموافقة على القوائم المالية"; q("cn-text").value = "الموافقة على القوائم المالية للسنة المنتهية";
    q("cn-kind").value = "عادية"; circSuggest();
    const dt = new DataTransfer(); dt.items.add(new File(["x"], "financials.pdf", { type: "application/pdf" })); q("cn-files").files = dt.files;
    await circCreate(); await settle();
    res.created = (__db.circulation_resolutions || []).length;
    const r0 = (__db.circulation_resolutions || [])[0] || {};
    res.status0 = r0.status; res.req = r0.required_pct; res.hasAttachment = Array.isArray(r0.attachments) && r0.attachments.length === 1;
    res.listHasTitle = /الموافقة على القوائم المالية/.test(q("circBody").innerHTML);
    const id = r0.id;
    const as = (email, name, role) => { __fakeUser = { email }; currentUserProfile = { email, full_name: name, is_platform_admin: false }; userMemberships = [{ company_id: 1, role: role || "مساهم" }]; };
    const votes = () => (__db.circulation_votes || []).length;
    const status = () => (__db.circulation_resolutions.find((r) => r.id === id) || {}).status;

    // 2) أحمد (40%) يوافق — لا يكفي
    msgs.length = 0; as("a@test.sa", "أحمد"); await circVote(id, "موافق"); await settle();
    res.afterA = { votes: votes(), status: status() };
    // 3) أحمد يكرر التصويت — مرفوض
    msgs.length = 0; await circVote(id, "معارض"); await settle();
    res.dupMsg = msgs.some((m) => /سبق أن صوّتّ/.test(m)); res.afterDup = votes();
    // 4) بسمة (35%) تعارض — ما زال ممكنًا
    as("b@test.sa", "بسمة"); await circVote(id, "معارض"); await settle();
    res.afterB = { votes: votes(), status: status() };
    // 5) جمال (25%) يوافق — المجموع 65% فيُعتمد
    as("c@test.sa", "جمال"); await circVote(id, "موافق"); await settle();
    const fin = __db.circulation_resolutions.find((r) => r.id === id);
    res.afterC = { votes: votes(), status: fin.status, hasClosed: !!fin.closed_at, note: fin.result_note || "" };
    res.shareWeights = (__db.circulation_votes || []).map((v) => v.shares).join(",");
    // 6) بعد الاعتماد لا يُقبل تصويت جديد
    __db.shareholders.push({ id: 4, company_id: 1, name: "دانة", shares_count: 10, claimed_by_email: "d@test.sa" });
    msgs.length = 0; as("d@test.sa", "دانة"); await circVote(id, "موافق"); await settle();
    res.lateBlocked = msgs.some((m) => /لم يعد مفتوحاً/.test(m)); res.afterLate = votes();
    // 7) نشاط مسجّل
    res.activity = (__db.activity_log || []).map((a) => a.action_type + ":" + a.entity_type);
    return res;
  });
  ok("القرار يُنشأ بمرفقه وحالته «مفتوح» والنسبة 50%", f1.created === 1 && f1.status0 === "مفتوح" && f1.req === 50 && f1.hasAttachment, f1);
  ok("القرار يظهر في قائمة الجمعية العامة", f1.listHasTitle);
  ok("صوت المساهم (40%) يُسجَّل ولا يعتمد القرار", f1.afterA.votes === 1 && f1.afterA.status === "مفتوح", f1.afterA);
  ok("التصويت المكرر يُرفض برسالة ولا يُسجَّل", f1.dupMsg && f1.afterDup === 1, f1);
  ok("معارضة 35% لا تُغلق القرار (ما زال بلوغ النسبة ممكنًا)", f1.afterB.votes === 2 && f1.afterB.status === "مفتوح", f1.afterB);
  ok("بلوغ 65% يعتمد القرار تلقائيًا ويُحفظ وقت الإغلاق وسببه", f1.afterC.status === "معتمد" && f1.afterC.hasClosed && /65/.test(f1.afterC.note), f1.afterC);
  ok("أوزان الأسهم تُحفظ مع كل صوت", f1.shareWeights === "400,350,250", f1.shareWeights);
  ok("لا يُقبل تصويت بعد الاعتماد", f1.lateBlocked && f1.afterLate === 3, f1);
  ok("الإنشاء والتصويت والاعتماد تُسجَّل في سجل النشاط", f1.activity.includes("إنشاء:قرار تمرير") && f1.activity.includes("تصويت:قرار تمرير") && f1.activity.includes("اعتماد:قرار تمرير"), f1.activity);

  /* ───────── مسار 2: قرار بنسبة 75% (غير عادي) يصير مستحيلًا ───────── */
  console.log("مسار 2) قرار بنسبة 75%: يُرفض تلقائيًا عند استحالة بلوغها");
  const f2 = await pg.evaluate(async () => {
    window.alert = () => {};
    const settle = () => new Promise((r) => setTimeout(r, 250));
    const q = (id) => document.getElementById(id);
    __fakeUser = { email: "admin@test.sa" }; currentUserProfile = { email: "admin@test.sa", is_platform_admin: false }; userMemberships = [{ company_id: 1, role: "مدير النظام" }];
    circTab = "الجمعية العامة"; circOpenNew();
    q("cn-title").value = "تعديل النظام الأساس"; q("cn-text").value = "تعديل النظام الأساس للشركة";
    q("cn-kind").value = "غير عادية"; circSuggest();
    const dt = new DataTransfer(); dt.items.add(new File(["x"], "a.pdf")); q("cn-files").files = dt.files;
    const reqShown = Number(q("cn-req").value);
    await circCreate(); await settle();
    const r = __db.circulation_resolutions.find((x) => x.title === "تعديل النظام الأساس");
    __fakeUser = { email: "b@test.sa" }; currentUserProfile = { email: "b@test.sa", is_platform_admin: false }; userMemberships = [{ company_id: 1, role: "مساهم" }];
    await circVote(r.id, "معارض"); await settle(); // 35% معارضة ← أقصى ما يمكن 65% < 75%
    const after = __db.circulation_resolutions.find((x) => x.id === r.id);
    return { reqShown, req: r.required_pct, status: after.status, note: after.result_note || "" };
  });
  ok("القرار غير العادي يقترح 75% نظاميًا", f2.reqShown === 75 && f2.req === 75, f2);
  ok("معارضة 35% تجعل بلوغ 75% مستحيلًا فيصير «غير معتمد»", f2.status === "غير معتمد" && /لم يعد بلوغ/.test(f2.note), f2);

  ok("لا أخطاء برمجية أثناء المسارات", errs.length === 0, errs);
  await browser.close();
  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})();
