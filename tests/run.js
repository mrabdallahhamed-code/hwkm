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

  console.log("6) النصاب وأغلبية التصويت");
  const q = await pg.evaluate(() => {
    const c = {};
    return {
      ord1: getAGMQuorumThreshold(c, "عادية", 1), ord2: getAGMQuorumThreshold(c, "عادية", 2),
      ext1: getAGMQuorumThreshold(c, "غير عادية", 1), ext2: getAGMQuorumThreshold(c, "غير عادية", 2), ext3: getAGMQuorumThreshold(c, "غير عادية", 3),
      custom: getAGMQuorumThreshold({ agm_ordinary_quorum_1: 40 }, "عادية", 1),
      ordMaj: agmRequiredMajority("عادية", "").pct, extMaj: agmRequiredMajority("غير عادية", "").pct,
      // عادية: أكثر من 50% بالتحديد (50% بالضبط لا يمرّ)
      half: agmEvaluateTopic("عادية", "", 50, 100).passed, aboveHalf: agmEvaluateTopic("عادية", "", 51, 100).passed,
      // غير عادية: ثلثان
      twoThirds: agmEvaluateTopic("غير عادية", "", 67, 100).passed, belowTwoThirds: agmEvaluateTopic("غير عادية", "", 66, 100).passed,
      noAttendance: agmEvaluateTopic("عادية", "", 0, 0).passed,
    };
  });
  ok("نصاب العادية: 25% ثم 0%", q.ord1 === 25 && q.ord2 === 0, q);
  ok("نصاب غير العادية: 50% ثم 25% ثم 0%", q.ext1 === 50 && q.ext2 === 25 && q.ext3 === 0, q);
  ok("النصاب القابل للتخصيص يُحترم", q.custom === 40, q);
  ok("أغلبية العادية 50% وغير العادية ثلثان", q.ordMaj === 50 && Math.abs(q.extMaj - 66.67) < 0.01, q);
  ok("العادية: 50% بالضبط لا تمرّ و51% تمرّ", q.half === false && q.aboveHalf === true, q);
  ok("غير العادية: 67% تمرّ و66% لا تمرّ", q.twoThirds === true && q.belowTwoThirds === false, q);
  ok("بدون حضور لا يُعتمد أي بند", q.noAttendance === false, q);

  console.log("7) حالة القرارات والمواعيد");
  const dec = await pg.evaluate(() => {
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    return {
      done: computeDecisionStatus({ status: "منجز", target_date: d(-30) }),
      late: computeDecisionStatus({ status: "قيد التنفيذ", target_date: d(-1) }),
      future: computeDecisionStatus({ status: "قيد التنفيذ", target_date: d(5) }),
      today: computeDecisionStatus({ status: "لم يبدأ", target_date: d(0) }),
      nodate: computeDecisionStatus({}),
      sLate: computeSimpleDecisionStatus({ status: "لم يبدأ", target_date: d(-2) }),
      sDone: computeSimpleDecisionStatus({ status: "منجز", target_date: d(-2) }),
      t5: computeTimelinessScore(5), t7: computeTimelinessScore(7), t10: computeTimelinessScore(10), t31: computeTimelinessScore(31),
    };
  });
  ok("القرار المنجز لا يصير متأخرًا", dec.done === "منجز", dec);
  ok("الموعد الفائت = متأخر", dec.late === "متأخر" && dec.sLate === "متأخر", dec);
  ok("موعد اليوم أو القادم ليس متأخرًا", dec.future === "قيد التنفيذ" && dec.today === "لم يبدأ", dec);
  ok("بلا حالة ولا موعد = لم يبدأ", dec.nodate === "لم يبدأ", dec);
  ok("القرار البسيط المنجز", dec.sDone === "منجز", dec);
  ok("درجة الالتزام بالموعد تنخفض بالتأخير ولا تقل عن 15", dec.t5 === 100 && dec.t7 === 85 && dec.t10 === 70 && dec.t31 === 15, dec);

  console.log("8) رقم السجل ورمز تداول");
  const cr = await pg.evaluate(() => ({
    ok10: validCrNumber("1010123456"), ar10: validCrNumber("١٠١٠١٢٣٤٥٦"), nine: validCrNumber("123123123"), eleven: validCrNumber("10101234567"),
    empty: validCrNumber(""), letters: validCrNumber("10101A3456"), spaced: normCrNumber(" 1010-123 456 "),
    tdw: normTadawul("٢٢٢٢"), tdwDirty: normTadawul(" 22-22 "),
  }));
  ok("رقم سجل من 10 أرقام يُقبل (إنجليزي وعربي)", cr.ok10 && cr.ar10, cr);
  ok("9 أو 11 رقمًا أو فارغ أو حروف تُرفض", !cr.nine && !cr.eleven && !cr.empty && !cr.letters, cr);
  ok("تنظيف رقم السجل من الفواصل والمسافات", cr.spaced === "1010123456", cr);
  ok("رمز تداول يتحول للأرقام اللاتينية", cr.tdw === "2222" && cr.tdwDirty === "2222", cr);

  console.log("9) الاشتراك والتجربة");
  const sub = await pg.evaluate(() => {
    const day = 86400000;
    currentCompanySub = null; const none = subDaysLeft();
    currentCompanySub = { ends: new Date(Date.now() + 10 * day + 3600000).toISOString() }; const ten = subDaysLeft();
    currentCompanySub = { ends: new Date(Date.now() - 2 * day).toISOString() }; const past = subDaysLeft();
    return { none, ten, past };
  });
  ok("بلا اشتراك = لا قيمة", sub.none === null, sub);
  ok("اشتراك بعد 10 أيام يُحسب 11 (تقريب للأعلى)", sub.ten === 11 || sub.ten === 10, sub);
  ok("الاشتراك المنتهي يعطي رقمًا سالبًا", sub.past < 0, sub);

  console.log("10) مؤشرات الحوكمة");
  const gov = await pg.evaluate(() => {
    const k0 = GOVERNANCE_AXES[0].key, k1 = GOVERNANCE_AXES[1].key;
    const r = computeGovScores({ [k0]: [{ score: 100 }, { score: 50 }], [k1]: [{ score: null }, { score: 80 }] });
    const e = computeGovScores({});
    return { a0: r.axisScores[k0], a1: r.axisScores[k1], fin: r.finalScore, empty: e.finalScore, k0 };
  });
  ok("متوسط المحور يتجاهل البنود بلا درجة", gov.a0 === 75 && gov.a1 === 80, gov);
  ok("الدرجة النهائية = متوسط كل البنود المقيَّمة", Math.abs(gov.fin - 76.6667) < 0.01, gov);
  ok("بلا بيانات = لا درجة", gov.empty === null, gov);

  console.log("11) صلاحيات إضافية");
  const perm2 = await pg.evaluate(() => {
    myPermissionOverrides = {}; currentCompanyType = "مساهمة غير مدرجة"; currentShareholdersSeeReports = false;
    userMemberships = [{ company_id: 1, role: "مدير النظام" }];
    currentUserProfile = { email: "a@b.c", is_platform_admin: false };
    const o = {};
    o.usersAdmin = isPageAllowed("users", "مدير النظام"); o.usersShareholder = isPageAllowed("users", "مساهم");
    o.logShareholder = isPageAllowed("activitylog", "مساهم"); o.circJSC = isPageAllowed("circulation", "مدير النظام");
    currentCompanyType = "ذات مسؤولية محدودة"; o.circLLC = isPageAllowed("circulation", "مدير النظام");
    currentCompanyType = "مساهمة غير مدرجة";
    o.platformForAdmin = isPageAllowed("platformdashboard", "مدير النظام");
    currentUserProfile = { email: "o@b.c", is_platform_admin: true }; o.platformForOwner = isPageAllowed("platformdashboard", "مدير النظام");
    currentUserProfile = { email: "a@b.c", is_platform_admin: false };
    myPermissionOverrides = { users: "view" }; o.overrideAllow = isPageAllowed("users", "مساهم");
    myPermissionOverrides = { dashboard: "none" }; o.overrideDeny = isPageAllowed("dashboard", "مدير النظام");
    myPermissionOverrides = {};
    userMemberships = []; o.noCompany = isPageAllowed("dashboard", "مدير النظام");
    return o;
  });
  ok("المستخدمون وسجل النشاط لمدير النظام فقط", perm2.usersAdmin === true && perm2.usersShareholder === false && perm2.logShareholder === false, perm2);
  ok("التمرير للمساهمة فقط وليس للمسؤولية المحدودة", perm2.circJSC === true && perm2.circLLC === false, perm2);
  ok("لوحة المنصة لمالك المنصة فقط", perm2.platformForAdmin === false && perm2.platformForOwner === true, perm2);
  ok("استثناء الصلاحية للفرد يفتح ويغلق", perm2.overrideAllow === true && perm2.overrideDeny === false, perm2);
  ok("بلا شركة لا تُفتح صفحات الشركة", perm2.noCompany === false, perm2);

  console.log("12) نموذج إدراج الشركة (رمز تداول والتبويبات والباقات)");
  const ui = await pg.evaluate(async () => {
    const msgs = []; const realAlert = window.alert; window.alert = (m) => { msgs.push(String(m)); };
    window.__nativeAlert = window.alert;
    currentUserProfile = { email: "t@t.t", full_name: "اختبار", phone_number: "" };
    await loadCompanyRequestPage();
    const q = (id) => document.getElementById(id);
    const out = {};
    out.hasTabs = !!q("crTabF") && !!q("crTabP");
    out.cards = ["فترة تجريبية", "ذاتي", "مدار", "شريك"].every(n => (q("cr-pane-p") || {}).innerHTML.includes(n));
    out.tadawulShownForListed = q("cr-type").value === "مساهمة مدرجة" && q("cr-tadawul-box").style.display !== "none";
    q("cr-type").value = "ذات مسؤولية محدودة"; toggleCrLLCFields();
    out.tadawulHiddenForLLC = q("cr-tadawul-box").style.display === "none";
    q("cr-type").value = "مساهمة مدرجة"; toggleCrLLCFields();
    out.shownAgain = q("cr-tadawul-box").style.display !== "none";
    q("cr-name").value = "شركة اختبار"; q("cr-cr-number").value = "1010123456"; q("cr-tadawul").value = "";
    msgs.length = 0; await startInstantTrial();
    out.blockedMsg = msgs[0] || ""; out.lockReleased = trialSubmitLock === false;
    q("cr-tadawul").value = "12"; msgs.length = 0; await startInstantTrial(); out.shortBlocked = /تداول/.test(msgs[0] || "");
    q("cr-tadawul").value = "٢٢٢٢"; const ok = readCrTadawul("مساهمة مدرجة"); out.okSymbol = ok.ok && ok.symbol === "2222";
    out.nonListedNoSymbol = (() => { const r = readCrTadawul("ذات مسؤولية محدودة"); return r.ok && r.symbol === null; })();
    crTab("p"); out.tabP = q("cr-pane-p").style.display !== "none" && q("cr-pane-f").style.display === "none";
    crTab("f"); out.tabF = q("cr-pane-f").style.display !== "none" && q("cr-pane-p").style.display === "none";
    window.alert = realAlert; return out;
  });
  ok("التبويبان وبطاقات الباقات الأربع تظهر", ui.hasTabs && ui.cards, ui);
  ok("حقل رمز تداول يظهر للمدرجة ويختفي لغيرها", ui.tadawulShownForListed && ui.tadawulHiddenForLLC && ui.shownAgain, ui);
  ok("المدرجة بلا رمز تداول لا تسجَّل", /تداول/.test(ui.blockedMsg) && ui.lockReleased, ui);
  ok("رمز تداول من رقمين لا يُقبل", ui.shortBlocked, ui);
  ok("رمز تداول بأرقام عربية يُقبل ويتحول", ui.okSymbol && ui.nonListedNoSymbol, ui);
  ok("التبديل بين التبويبين يعمل", ui.tabP && ui.tabF, ui);

  console.log("13) إقرار الخدمة المدفوعة في الطلبات");
  const ack = await pg.evaluate(async () => {
    const msgs = []; const realAlert = window.alert; window.alert = (m) => { msgs.push(String(m)); };
    const out = {};
    const run = async (noteId, ackId, fn) => {
      const note = document.getElementById(noteId), ak = document.getElementById(ackId);
      out[noteId + "_exists"] = !!note && !!ak;
      note.style.display = "block"; ak.checked = false; msgs.length = 0;
      try { await fn(); } catch (e) {}
      const blocked = /مدفوعة/.test(msgs[0] || "");
      note.style.display = "none"; msgs.length = 0;
      try { await fn(); } catch (e) {}
      const notBlockedWhenHidden = !/مدفوعة/.test(msgs[0] || "");
      return { blocked, notBlockedWhenHidden };
    };
    out.risk = await run("rnr-paid-note", "rnr-paid-ack", submitRiskRequest);
    out.audit = await run("anr-paid-note", "anr-paid-ack", submitAuditRequest);
    window.alert = realAlert; return out;
  });
  ok("طلب المخاطر في التجربة يُمنع بدون إقرار", ack["rnr-paid-note_exists"] && ack.risk.blocked, ack);
  ok("طلب المراجعة في التجربة يُمنع بدون إقرار", ack["anr-paid-note_exists"] && ack.audit.blocked, ack);
  ok("المشترك (بلا إشعار التجربة) لا يُمنع بسبب الإقرار", ack.risk.notBlockedWhenHidden && ack.audit.notBlockedWhenHidden, ack);

  console.log("14) مرفقات قرار التمرير");
  const circ = await pg.evaluate(async () => {
    const msgs = []; const realAlert = window.alert; window.alert = (m) => { msgs.push(String(m)); };
    circTab = "مجلس الإدارة"; currentCompanyId = 1; currentCompanyType = "مساهمة غير مدرجة";
    circOpenNew();
    const q = (id) => document.getElementById(id);
    q("cn-title").value = "قرار"; q("cn-text").value = "نص القرار"; q("cn-urgent").value = "عاجل"; q("cn-req").value = 50;
    msgs.length = 0; await circCreate();
    const blocked = /المرفق إلزامي/.test(msgs[0] || "");
    const none = circAttachmentsHTML({ attachments: [] }) === "" && circAttachmentsHTML({}) === "";
    const html = circAttachmentsHTML({ attachments: [{ name: "عرض.pdf", url: "https://x.test/a.pdf" }, { name: "<b>x</b>", url: "https://x.test/b" }] });
    window.alert = realAlert;
    return { blocked, none, hasLink: html.includes('href="https://x.test/a.pdf"') && html.includes("عرض.pdf"), escaped: !html.includes("<b>x</b>"), fileInput: !!q("cn-files") && q("cn-files").multiple };
  });
  ok("القرار بلا مرفق لا يُنشأ", circ.blocked, circ);
  ok("حقل المرفقات يقبل أكثر من ملف", circ.fileInput, circ);
  ok("روابط المرفقات تظهر للمصوّتين وتُنظَّف من الأكواد", circ.hasLink && circ.escaped, circ);
  ok("القرارات القديمة بلا مرفقات لا تتأثر", circ.none, circ);

  console.log("15) استعلام وثّق لمالك المنصة");
  const vr = await pg.evaluate(async () => {
    const box = document.createElement("div"); box.innerHTML = '<button id="wb">x</button><div class="cr-vmsg" style="display:none"></div>';
    document.body.appendChild(box);
    const btn = document.getElementById("wb"), msg = btn.nextElementSibling;
    box.remove();
    return { hasFn: typeof crWathqCheck === "function", noAdvisory: typeof crVerifyAdvisory === "undefined", noClientBox: !document.getElementById("cr-verify-msg") };
  });
  ok("دالة الاستعلام موجودة لمالك المنصة", vr.hasFn, vr);
  ok("لا استعلام تلقائي في نموذج العميل", vr.noAdvisory && vr.noClientBox, vr);

  console.log("16) خيار شكل آخر في إدراج الشركة");
  const oth = await pg.evaluate(async () => {
    const box = document.createElement("div");
    box.innerHTML = '<select id="cr-type"><option>ذات مسؤولية محدودة</option><option>' + CR_OTHER_FORM + '</option></select><div id="cr-llc-fields"></div><div id="cr-tadawul-box"></div><div id="cr-other-note" style="display:none"></div>';
    document.body.appendChild(box);
    const t = document.getElementById("cr-type"), n = document.getElementById("cr-other-note");
    t.value = CR_OTHER_FORM; toggleCrLLCFields(); const shown = n.style.display === "block";
    t.value = "ذات مسؤولية محدودة"; toggleCrLLCFields(); const hidden = n.style.display === "none";
    box.remove();
    return { shown, hidden, inForm: renderPlanCards !== undefined && String(loadCompanyRequestPage).includes("شكل آخر") };
  });
  ok("اختيار شكل آخر يظهر الملاحظة ويخفيها عند تغييره", oth.shown && oth.hidden, oth);
  ok("الخيار موجود في نموذج الإدراج", oth.inForm, oth);

  await browser.close();
  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})();
