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


  /* ───────── مسار 3: التصويت على قرارات اجتماع (مجلس/لجنة) ───────── */
  console.log("مسار 3) قرارات الاجتماع: الأهلية والتصويت وتغيير الصوت");
  const f3 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    const settle = () => new Promise((r) => setTimeout(r, 250));
    window.uiConfirm = async () => true;
    let promptAnswer = "";
    window.uiPrompt = async () => promptAnswer;
    __db.board_members = [
      { id: 1, company_id: 1, name: "رئيس", claimed_by_email: "p@test.sa", status: "نشط" },
      { id: 2, company_id: 1, name: "عضو لجنة", claimed_by_email: "m@test.sa", status: "نشط" },
      { id: 3, company_id: 1, name: "عضو آخر", claimed_by_email: "o@test.sa", status: "نشط" },
    ];
    __db.committees = [{ id: 7, company_id: 1, name: "لجنة المراجعة" }];
    __db.committee_members = [{ id: 1, committee_id: 7, member_id: 2 }];
    __db.meetings = [{ id: 10, company_id: 1, committee_id: null }, { id: 11, company_id: 1, committee_id: 7 }];
    __db.board_decisions = [
      { id: 100, meeting_id: 10, company_id: 1, decision_text: "اعتماد الموازنة" },
      { id: 110, meeting_id: 11, company_id: 1, decision_text: "اعتماد خطة المراجعة" },
    ];
    __db.board_decision_votes = [];
    const as = (email, name, role) => { __fakeUser = { email }; currentUserProfile = { email, full_name: name, is_platform_admin: false }; userMemberships = [{ company_id: 1, role: role || "عضو مجلس" }]; };
    const grid = () => document.getElementById("mdView-decisionsGrid").innerHTML;
    const wrapShown = () => document.getElementById("mdView-decisionsWrap").style.display !== "none";
    const votes = (d) => __db.board_decision_votes.filter((v) => v.decision_id === d);
    const res = {};
    currentCompanyId = 1;

    // اجتماع المجلس: عضو المجلس يرى أزرار التصويت ويصوّت
    as("p@test.sa", "رئيس"); currentAttendanceMeetingId = 10; await loadMeetingDecisionsGrid(10);
    res.boardButtons = /castMeetingDecisionVote\(100,'موافق'\)/.test(grid());
    await castMeetingDecisionVote(100, "موافق"); await settle();
    res.boardVote = votes(100).length === 1 && votes(100)[0].voter_email === "p@test.sa";
    res.myVoteShown = /صوّتك: موافق/.test(grid());
    // تغيير الصوت: يُحذف الصوت الحالي ثم يُعاد التصويت
    await changeMeetingDecisionVote(100); await settle();
    res.afterDelete = votes(100).length;
    await castMeetingDecisionVote(100, "معارض"); await settle();
    res.afterChange = votes(100).map((v) => v.vote).join(",");

    // الامتناع يتطلب سبباً يُحفظ، والإلغاء لا يسجّل شيئاً
    as("m@test.sa", "عضو لجنة"); currentAttendanceMeetingId = 10; await loadMeetingDecisionsGrid(10);
    promptAnswer = null; await castMeetingDecisionVote(100, "ممتنع"); await settle();
    res.abstainCancelled = votes(100).length === 1;
    promptAnswer = "تعارض مصالح"; await castMeetingDecisionVote(100, "ممتنع"); await settle();
    const ab = votes(100).find((v) => v.voter_email === "m@test.sa");
    res.abstainReason = !!ab && ab.vote === "ممتنع" && ab.justification === "تعارض مصالح";

    // اجتماع لجنة: غير العضو في اللجنة لا يرى القسم، وعضو اللجنة يراه
    as("o@test.sa", "عضو آخر"); currentAttendanceMeetingId = 11; await loadMeetingDecisionsGrid(11);
    res.nonMemberHidden = wrapShown() === false;
    as("m@test.sa", "عضو لجنة"); await loadMeetingDecisionsGrid(11);
    res.memberSees = wrapShown() === true && /castMeetingDecisionVote\(110,'موافق'\)/.test(grid());
    // مدير النظام يرى قرارات اللجنة دون أن يكون عضواً، لكن بلا أزرار تصويت
    as("admin@test.sa", "المدير", "مدير النظام"); await loadMeetingDecisionsGrid(11);
    res.adminSeesNoButtons = wrapShown() === true && !/castMeetingDecisionVote/.test(grid());
    res.errors = msgs;
    return res;
  });
  ok("عضو المجلس يرى أزرار التصويت ويُسجَّل صوته", f3.boardButtons && f3.boardVote, f3);
  ok("يظهر للعضو صوته الحالي", f3.myVoteShown, f3);
  ok("تغيير الصوت: يُحذف الأول ثم يُسجَّل الجديد (صوت واحد فقط)", f3.afterDelete === 0 && f3.afterChange === "معارض", f3);
  ok("إلغاء نافذة سبب الامتناع لا يسجّل صوتًا", f3.abstainCancelled, f3);
  ok("الامتناع يُحفظ مع سببه", f3.abstainReason, f3);
  ok("اجتماع اللجنة: غير الأعضاء لا يرون القسم", f3.nonMemberHidden, f3);
  ok("عضو اللجنة يرى قراراتها ويصوّت", f3.memberSees, f3);
  ok("مدير النظام يرى قرارات اللجنة دون أزرار تصويت", f3.adminSeesNoButtons, f3);


  /* ───────── مسار 4: طلب مراجعة داخلية (العميل ← المدير ← المراجع ← العميل) ───────── */
  console.log("مسار 4) طلب المراجعة الداخلية: من الطلب حتى رد العميل");
  const f4 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    const settle = () => new Promise((r) => setTimeout(r, 400));
    window.uiConfirm = async () => true; window.uiPrompt = async () => "";
    const mails = []; window.sendNotificationEmail = async (to, subject) => { mails.push({ to, subject }); return { success: true }; };
    window.notifyOwnerNewRequest = async () => {};
    const as = (email, name, role) => { __fakeUser = { email }; currentUserProfile = { email, full_name: name, is_platform_admin: false }; userMemberships = [{ company_id: 1, role: role || "مدير النظام" }]; };
    __db.audit_service_types = [{ id: 1, name: "مراجعة سياسة" }];
    __db.audit_requests = []; __db.audit_questions = [];
    currentCompanyId = 1; currentCompanyTrialEndsAt = null;
    const q = (id) => document.getElementById(id);
    const reqRow = () => __db.audit_requests[0] || {};
    const res = {};

    // 1) العميل يرسل الطلب: نطاق قصير يُرفض، ثم الطلب الكامل يُقبل
    as("client@test.sa", "العميل");
    openNewAuditRequest(1, "مراجعة سياسة");
    q("anr-client-name").value = "العميل"; q("anr-sector").value = "التقنية"; q("anr-scope").value = "قصير";
    msgs.length = 0; await submitAuditRequest();
    res.shortBlocked = __db.audit_requests.length === 0 && msgs.length > 0;
    q("anr-scope").value = "مراجعة سياسة المشتريات والعمليات المرتبطة بها كاملة";
    await submitAuditRequest(); await settle();
    res.created = __db.audit_requests.length === 1 && reqRow().status === "تم الاستلام" && reqRow().requested_by_email === "client@test.sa";
    const id = reqRow().id;

    // 2) المدير يكلّف مراجعًا ويضيف أسئلة ويرسلها
    as("admin@test.sa", "المدير"); await openAuditAdminDetail(id); await settle();
    if (!q("aad-reviewer")) { const i = document.createElement("input"); i.id = "aad-reviewer"; document.body.appendChild(i); }
    q("aad-reviewer").value = "bad"; msgs.length = 0; await assignAuditReviewer(id);
    res.badReviewerBlocked = !reqRow().assigned_reviewer_email;
    q("aad-reviewer").value = "Reviewer@Test.sa"; await assignAuditReviewer(id); await settle();
    res.reviewer = reqRow().assigned_reviewer_email;
    res.reviewerMailed = mails.some((m) => m.to === "reviewer@test.sa");
    await auditAddQuestion(id, 0); await settle(); await auditAddQuestion(id, 1); await settle();
    res.questions = __db.audit_questions.length; res.positions = __db.audit_questions.map((x) => x.position).join(",");
    res.notSentYet = __db.audit_questions.every((x) => !x.sent);
    await openAuditAdminDetail(id); await auditSendQuestions(id); await settle();
    res.sent = __db.audit_questions.every((x) => x.sent === true);
    res.statusAfterSend = reqRow().status;
    res.clientMailed = mails.some((m) => m.to === "client@test.sa");

    // 3) العميل يجيب عن سؤال واحد فقط، ثم عن الباقي
    as("client@test.sa", "العميل"); await openAuditRequestDetail(id); await settle();
    const areas = [...document.querySelectorAll(".audit-ans-input")];
    res.answerBoxes = areas.length;
    areas[0].value = "إجابة السؤال الأول";
    await submitAuditAnswers(id); await settle();
    res.oneAnswered = __db.audit_questions.filter((x) => x.answer).length;
    res.statusPartial = reqRow().status;
    await openAuditRequestDetail(id); await settle();
    const left = [...document.querySelectorAll(".audit-ans-input")];
    res.leftBoxes = left.length;
    left.forEach((t) => (t.value = "إجابة أخرى")); await submitAuditAnswers(id); await settle();
    res.allAnswered = __db.audit_questions.every((x) => x.answer);
    res.statusFinal = reqRow().status;
    res.reviewerNotified = mails.filter((m) => m.to === "reviewer@test.sa").length >= 2;
    res.activity = (__db.activity_log || []).map((a) => a.action_type + ":" + a.entity_type);
    return res;
  });
  ok("نطاق المراجعة القصير يُرفض، والطلب الكامل يُسجَّل بحالة «تم الاستلام»", f4.shortBlocked && f4.created, f4);
  ok("بريد المراجع الخاطئ يُرفض، والصحيح يُحفظ بحروف صغيرة ويُبلَّغ المراجع", f4.badReviewerBlocked && f4.reviewer === "reviewer@test.sa" && f4.reviewerMailed, f4);
  ok("الأسئلة تُضاف مرتبة وغير مرسلة بعد", f4.questions === 2 && f4.positions === "1,2" && f4.notSentYet, f4);
  ok("إرسال الأسئلة يحوّل الحالة إلى «بانتظار رد العميل» ويبلّغ العميل", f4.sent && f4.statusAfterSend === "بانتظار رد العميل" && f4.clientMailed, f4);
  ok("العميل يرى خانة لكل سؤال", f4.answerBoxes === 2, f4);
  ok("الإجابة الجزئية تُحفظ ولا تغيّر الحالة", f4.oneAnswered === 1 && f4.statusPartial === "بانتظار رد العميل", f4);
  ok("إكمال كل الإجابات يحوّل الحالة إلى «قيد التحليل» ويبلّغ المراجع", f4.allAnswered && f4.statusFinal === "قيد التحليل" && f4.reviewerNotified, f4);
  ok("الخطوات تُسجَّل في سجل النشاط", ["إنشاء:طلب مراجعة", "تكليف:طلب مراجعة", "إرسال:أسئلة مراجعة"].every((x) => f4.activity.includes(x)), f4.activity);


  /* ───────── مسار 5: دعوة الأعضاء وربط الحسابات ───────── */
  console.log("مسار 5) الدعوات: توليد رابط، دور مخصص، ربط حساب موجود، إلغاء");
  const f5 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    const settle = () => new Promise((r) => setTimeout(r, 300));
    window.uiConfirm = async () => true; window.loadUsers = async () => {};
    const q = (id) => document.getElementById(id);
    currentCompanyId = 1; __fakeUser = { email: "admin@test.sa" }; currentUserProfile = { email: "admin@test.sa", is_platform_admin: false };
    __db.company_invites = []; __db.user_company_memberships = [];
    __db.user_profiles = [{ id: 1, email: "Existing@Test.sa", full_name: "مستخدم قائم" }];
    const res = {};
    // 1) دعوة بدور جاهز
    openInviteModal(); res.defaultRole = q("mi-role").value;
    await generateInvite(); await settle();
    const inv = __db.company_invites[0] || {};
    res.code = /^[A-HJ-NP-Z2-9]{8}$/.test(inv.invite_code || ""); res.role = inv.suggested_role; res.by = inv.created_by; res.used = inv.used;
    res.link = (q("mi-link").value || "").endsWith("?invite=" + inv.invite_code);
    res.resultShown = q("mi-result").style.display === "block";
    res.pendingShown = /عضو مجلس/.test(q("pendingInvitesList") ? q("pendingInvitesList").innerHTML : "") && (q("pendingInvitesList").innerHTML || "").includes(inv.invite_code);
    // 2) دور مخصص بلا اسم يُرفض، ومعه اسم يُحفظ
    openInviteModal(); q("mi-role").value = "__custom__"; toggleCustomRoleInput("mi-role", "mi-role-custom"); q("mi-role-custom").value = "";
    msgs.length = 0; await generateInvite(); res.customBlocked = __db.company_invites.length === 1 && msgs.length > 0;
    q("mi-role-custom").value = "مستشار قانوني"; await generateInvite(); await settle();
    res.customSaved = __db.company_invites.length === 2 && __db.company_invites[1].suggested_role === "مستشار قانوني";
    res.codesDiffer = __db.company_invites[0].invite_code !== __db.company_invites[1].invite_code;
    // 3) ربط حساب موجود
    openInviteModal(); switchInviteTab("existing");
    q("mi-existing-email").value = "nobody@test.sa"; msgs.length = 0; await linkExistingAccount();
    res.unknownBlocked = __db.user_company_memberships.length === 0 && /لا يوجد حساب/.test(msgs[0] || "");
    q("mi-existing-role").value = "عضو مجلس"; q("mi-existing-email").value = "existing@test.sa"; await linkExistingAccount(); await settle();
    const m = __db.user_company_memberships;
    res.linked = m.length === 1 && m[0].company_id === 1 && m[0].role === "عضو مجلس" && m[0].email === "Existing@Test.sa";
    // إعادة الربط بدور آخر تحدّث الدور ولا تكرر السجل
    openInviteModal(); switchInviteTab("existing"); q("mi-existing-email").value = "existing@test.sa"; q("mi-existing-role").value = "سكرتير المجلس";
    await linkExistingAccount(); await settle();
    res.relinkNoDup = __db.user_company_memberships.length === 1 && __db.user_company_memberships[0].role === "سكرتير المجلس";
    // 4) إلغاء دعوة
    const firstId = __db.company_invites[0].id; await deleteInvite(firstId); await settle();
    res.deleted = __db.company_invites.length === 1 && __db.company_invites[0].id !== firstId;
    res.activity = (__db.activity_log || []).map((a) => a.action_type + ":" + a.entity_type);
    return res;
  });
  ok("الدعوة تُولَّد بكود من 8 خانات ودور افتراضي «عضو مجلس» وباسم المنشئ", f5.code && f5.role === "عضو مجلس" && f5.by === "admin@test.sa" && f5.used === false, f5);
  ok("رابط الدعوة يحمل الكود ويظهر في قائمة الدعوات المعلّقة", f5.link && f5.resultShown && f5.pendingShown, f5);
  ok("الدور المخصص بلا اسم يُرفض، ومعه اسم يُحفظ بكود مختلف", f5.customBlocked && f5.customSaved && f5.codesDiffer, f5);
  ok("ربط بريد غير مسجّل يُرفض", f5.unknownBlocked, f5);
  ok("ربط حساب موجود يضيفه للشركة بالدور المحدد (دون تأثر بحروف البريد)", f5.linked, f5);
  ok("إعادة الربط تحدّث الدور ولا تكرر العضوية", f5.relinkNoDup, f5);
  ok("إلغاء الدعوة يحذفها", f5.deleted, f5);
  ok("الدعوة والربط يُسجَّلان في سجل النشاط", f5.activity.includes("دعوة:رابط دعوة") && f5.activity.includes("صلاحيات:مستخدم"), f5.activity);


  /* ───────── مسار 6: طلب تقييم مخاطر (الطلب ← المستشار ← سجل المخاطر ← المعالجة) ───────── */
  console.log("مسار 6) تقييم المخاطر: من الطلب حتى سجل المخاطر وتحديث المعالجة");
  const f6 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    const settle = () => new Promise((r) => setTimeout(r, 400));
    window.uiConfirm = async () => true;
    const mails = []; window.sendNotificationEmail = async (to, subject) => { mails.push({ to, subject }); return { success: true }; };
    window.notifyOwnerNewRequest = async () => {};
    const as = (email, name) => { __fakeUser = { email }; currentUserProfile = { email, full_name: name, is_platform_admin: false }; userMemberships = [{ company_id: 1, role: "مدير النظام" }]; };
    __db.risk_service_types = [{ id: 1, name: "تقييم مخاطر" }]; __db.risk_requests = []; __db.risk_items = []; __db.risk_questions = [];
    currentCompanyId = 1; currentCompanyTrialEndsAt = null;
    const q = (id) => document.getElementById(id);
    const reqRow = () => __db.risk_requests[0] || {};
    const res = {};

    // 1) العميل: نطاق قصير يُرفض، بلا نوع مخاطر يُرفض، والكامل يُقبل
    as("client@test.sa", "العميل");
    openNewRiskRequest(1, "تقييم مخاطر");
    q("rnr-client-name").value = "العميل"; q("rnr-sector").value = "الصحة"; q("rnr-scope").value = "قصير";
    await submitRiskRequest(); res.shortBlocked = __db.risk_requests.length === 0;
    q("rnr-scope").value = "تقييم مخاطر عملية المشتريات والتعاقدات كاملة";
    document.querySelectorAll(".rnr-risktype-chk").forEach((c) => (c.checked = false));
    msgs.length = 0; await submitRiskRequest(); res.noTypeBlocked = __db.risk_requests.length === 0 && msgs.length > 0;
    const chk = document.querySelectorAll(".rnr-risktype-chk"); chk[0].checked = true; if (chk[1]) chk[1].checked = true;
    await submitRiskRequest(); await settle();
    res.created = __db.risk_requests.length === 1 && reqRow().status === "تم الاستلام" && !!reqRow().risk_types_needed && reqRow().requested_by_email === "client@test.sa";
    const id = reqRow().id;

    // 2) المدير يكلّف مستشارًا
    as("admin@test.sa", "المدير"); await openRiskAdminDetail(id); await settle();
    if (!q("rad-consultant")) { const i = document.createElement("input"); i.id = "rad-consultant"; document.body.appendChild(i); }
    q("rad-consultant").value = "bad"; await assignRiskConsultant(id); res.badBlocked = !reqRow().assigned_consultant_email;
    q("rad-consultant").value = "Consultant@Test.sa"; await assignRiskConsultant(id); await settle();
    res.consultant = reqRow().assigned_consultant_email; res.mailed = mails.some((m) => m.to === "consultant@test.sa");

    // 3) المستشار المكلَّف وحده يسجّل المخاطر (المدير غير المكلَّف لا يرى نموذج الإضافة)
    as("consultant@test.sa", "المستشار"); await riskSetStatusQuick(id, "قيد التحليل"); await settle(); res.statusAnalysis = reqRow().status;
    as("admin@test.sa", "المدير"); await openRiskAdminDetail(id); await settle();
    res.adminCannotAdd = !q("rad-item-desc");
    as("consultant@test.sa", "المستشار"); await openRiskAdminDetail(id); await settle(); res.consultantSeesForm = !!q("rad-item-desc");
    const set = (k, v) => (q("rad-item-" + k).value = v);
    set("desc", ""); msgs.length = 0; await addRiskItem(id); res.emptyBlocked = __db.risk_items.length === 0;
    set("desc", "تأخر الموردين"); set("source", "خارجي"); set("likelihood", "4"); set("impact", "4"); set("treatment", "عقود بديلة"); set("responsible", "المشتريات"); set("target-date", "2020-01-01");
    await addRiskItem(id); await settle();
    await openRiskAdminDetail(id); await settle();
    set("desc", "تسرب بيانات"); set("likelihood", "2"); set("impact", "3"); set("treatment", ""); set("responsible", ""); set("target-date", "");
    await addRiskItem(id); await settle();
    res.items = __db.risk_items.length; res.itemRow = __db.risk_items[0];
    res.levels = [riskLevelInfo(4, 4).label, riskLevelInfo(2, 3).label, riskLevelInfo(1, 1).label, riskLevelInfo(5, 5).label, riskLevelInfo(2, 5).label, riskLevelInfo(null, 3).label];
    res.heat = renderRiskHeatMap(__db.risk_items);
    res.heatMarkers = (res.heat.match(/border-radius:50%/g) || []).length;
    res.heatLegend = /تأخر الموردين/.test(res.heat) && /تسرب بيانات/.test(res.heat);
    res.emptyHeat = /لا توجد مخاطر مقيَّمة/.test(renderRiskHeatMap([]));
    delete res.heat;

    // 4) تحديث حالة المعالجة وحذف خطر
    const first = __db.risk_items[0].id;
    await updateRiskItemStatus(first, "قيد التنفيذ", id); await settle();
    res.status1 = __db.risk_items.find((x) => x.id === first).action_status;
    const second = __db.risk_items[1].id; await deleteRiskItem(second, id); await settle();
    res.afterDelete = __db.risk_items.length;
    res.activity = (__db.activity_log || []).map((a) => a.action_type + ":" + a.entity_type);
    return res;
  });
  ok("نطاق قصير أو بلا نوع مخاطر يُرفض، والطلب الكامل يُسجَّل بأنواعه", f6.shortBlocked && f6.noTypeBlocked && f6.created, f6);
  ok("بريد المستشار الخاطئ يُرفض والصحيح يُحفظ ويُبلَّغ المستشار", f6.badBlocked && f6.consultant === "consultant@test.sa" && f6.mailed, f6);
  ok("نموذج إضافة الأخطار للمستشار المكلَّف فقط (وفي مرحلة التحليل)", f6.adminCannotAdd && f6.consultantSeesForm && f6.statusAnalysis === "قيد التحليل", f6);
  ok("خطر بلا وصف يُرفض، والأخطار الصحيحة تُسجَّل بتفاصيلها", f6.emptyBlocked && f6.items === 2 && f6.itemRow && f6.itemRow.likelihood === 4 && f6.itemRow.impact === 4 && f6.itemRow.responsible_person === "المشتريات", f6);
  ok("مستويات الخطر: 16 عالٍ جدًا، 6 متوسط، 1 منخفض، 25 عالٍ جدًا، 10 عالٍ، بلا تقييم «—»", f6.levels.join("|") === "عالٍ جداً|متوسط|منخفض|عالٍ جداً|عالٍ|—", f6.levels);
  ok("الخريطة الحرارية تعرض الأخطار المقيَّمة بعلاماتها وقائمتها، وتعرض رسالة عند الفراغ", f6.heatMarkers >= 2 && f6.heatLegend && f6.emptyHeat, f6);
  ok("تحديث حالة المعالجة وحذف الخطر يعملان", f6.status1 === "قيد التنفيذ" && f6.afterDelete === 1, f6);
  ok("الإنشاء والتكليف يُسجَّلان في سجل النشاط", f6.activity.includes("إنشاء:طلب تقييم مخاطر") && f6.activity.includes("تكليف:طلب تقييم مخاطر"), f6.activity);


  /* ───────── مسار 7: تسجيل شركة جديدة (التجربة الفورية وطلب الاشتراك المباشر) ───────── */
  console.log("مسار 7) تسجيل شركة جديدة");
  const f7 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m)); window.__nativeAlert = window.alert;
    const q = (id) => document.getElementById(id);
    const res = {}; const settle = () => new Promise((r) => setTimeout(r, 250));
    __db.company_requests = []; __rpcLog = [];
    __fakeUser = { email: "owner@test.sa" };
    currentUserProfile = { email: "owner@test.sa", full_name: "صاحب الشركة", phone_number: "0500000000", is_platform_admin: false };
    document.body.insertAdjacentHTML("beforeend", '<div id="companyRequestBody"></div>');
    await loadCompanyRequestPage(); await settle();
    res.formShown = !!q("cr-name") && q("cr-resp-email").value === "owner@test.sa" && q("cr-resp-name").value === "صاحب الشركة";
    // إظهار الحقول حسب نوع الشركة
    const tog = (v) => { q("cr-type").value = v; toggleCrLLCFields(); return [q("cr-llc-fields").style.display, q("cr-tadawul-box").style.display, q("cr-other-note").style.display].join("/"); };
    res.toggles = [tog("ذات مسؤولية محدودة"), tog("مساهمة مدرجة"), tog("شكل آخر — تواصل معنا"), tog("مساهمة غير مدرجة")];
    // التحقق من المدخلات (التجربة الفورية)
    const trial = async () => { msgs.length = 0; const n = __rpcLog.length; await startInstantTrial(); return { msg: msgs[0] || "", rpc: __rpcLog.length - n }; };
    q("cr-name").value = ""; res.noName = await trial();
    q("cr-name").value = "شركة النخبة"; q("cr-cr-number").value = "123456789"; res.shortCr = await trial();
    q("cr-cr-number").value = "٧٠٤٩٣٨٨٢٠٥"; // أرقام عربية
    q("cr-type").value = "مساهمة مدرجة"; q("cr-tadawul").value = "22"; res.noSymbol = await trial();
    // رد الخادم: حد الشركات التجريبية، ثم الجوال غير موثق
    q("cr-tadawul").value = "٢٢٢٢";
    __rpc = { create_trial_company: () => ({ data: { status: "limit" }, error: null }) };
    res.limit = await trial();
    __rpc = { create_trial_company: () => ({ data: { status: "phone_unverified" }, error: null }) };
    res.phone = await trial();
    __rpc = { create_trial_company: () => ({ data: null, error: { message: "boom" } }) };
    res.err = await trial();
    const call = __rpcLog.filter((x) => x.n === "create_trial_company").pop();
    res.args = call && call.a;
    res.lockReleased = trialSubmitLock === false;
    // طلب الاشتراك المباشر (بدون تجربة)
    q("cr-type").value = "ذات مسؤولية محدودة"; toggleCrLLCFields();
    msgs.length = 0; await submitCompanyRequest(); await settle();
    res.requests = __db.company_requests.length;
    const row = __db.company_requests[0] || {};
    res.row = { by: row.requested_by_email, name: row.company_name, type: row.company_type, cr: row.cr_number, status: row.status, symbol: row.tadawul_symbol };
    res.pendingShown = /طلبك قيد المراجعة/.test(q("companyRequestBody").innerHTML);
    // إعادة الطلب بنفس الاسم لا تكرره
    await loadCompanyRequestPage(); // يعرض «قيد المراجعة» فلا يظهر النموذج
    res.formHiddenWhilePending = !q("cr-name");
    // رفض الطلب: يظهر النموذج مع إشعار الرفض
    __db.company_requests[0].status = "مرفوض"; await loadCompanyRequestPage();
    res.rejectedNotice = !!q("cr-name") && /تم رفض طلبك/.test(q("companyRequestBody").innerHTML);
    // محاولتان متتاليتان لطلب قيد المراجعة بنفس الاسم تُرفضان
    q("cr-name").value = "شركة النخبة"; q("cr-type").value = "مساهمة غير مدرجة"; q("cr-cr-number").value = "7049388205";
    __db.company_requests[0].status = "قيد المراجعة";
    msgs.length = 0; await submitCompanyRequestImpl();
    res.dupMsg = msgs.some((m) => /قيد المراجعة/.test(m)); res.stillOne = __db.company_requests.length === 1;
    return res;
  });
  ok("نموذج التسجيل يعرض بيانات المسؤول، والحقول تظهر حسب نوع الشركة", f7.formShown && f7.toggles.join("|") === "block/none/none|none/block/none|none/none/block|none/none/none", f7);
  ok("الاسم الفارغ والسجل غير المكتمل ورمز تداول الناقص تُرفض قبل أي استدعاء للخادم", f7.noName.rpc === 0 && f7.shortCr.rpc === 0 && f7.noSymbol.rpc === 0 && /اسم الشركة/.test(f7.noName.msg) && /إلزامي/.test(f7.shortCr.msg) && /تداول/.test(f7.noSymbol.msg), f7);
  ok("الأرقام العربية تُحوَّل إلى أرقام لاتينية في الطلب المرسل للخادم", f7.args && f7.args.p_cr_number === "7049388205" && f7.args.p_name === "شركة النخبة" && f7.args.p_type === "مساهمة مدرجة", f7.args);
  ok("حد التجارب والجوال غير الموثق وخطأ الخادم تُعرض برسائل واضحة ويُفك قفل الزر", /من الشركات التجريبية/.test(f7.limit.msg) && /توثيق رقم الجوال/.test(f7.phone.msg) && /تعذّر إنشاء الشركة/.test(f7.err.msg) && f7.lockReleased, f7);
  ok("طلب الاشتراك المباشر يُسجَّل بحالة «قيد المراجعة» وببيانات صحيحة ويظهر للمستخدم", f7.requests === 1 && f7.row.by === "owner@test.sa" && f7.row.status === "قيد المراجعة" && f7.row.cr === "7049388205" && f7.pendingShown && f7.formHiddenWhilePending, f7);
  ok("الطلب المرفوض يظهر معه إشعار الرفض، والطلب المكرر قيد المراجعة يُمنع", f7.rejectedNotice && f7.dupMsg && f7.stillOne, f7);

  /* ───────── مسار 8: الاشتراك (التجربة ← الاشتراك ← الانتهاء ← التجديد) ───────── */
  console.log("مسار 8) الاشتراك والتجربة والتجديد");
  const f8 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m));
    const q = (id) => document.getElementById(id);
    const res = {}; const settle = () => new Promise((r) => setTimeout(r, 250));
    const day = 86400000, iso = (d) => new Date(Date.now() + d * day).toISOString();
    const page = (sub) => { currentCompanySub = sub; renderMySubscription(); return q("mySubBody").innerHTML; };
    // صفحة «اشتراكي» في الحالات الخمس
    const h1 = page({ trial: iso(5) });
    res.trial = /فترة تجريبية/.test(h1) && />5</.test(h1) && /pk-grid/.test(h1);
    const h2 = page({ paid: true, pkg: "مدار", ends: iso(200), starts: iso(-165), price: 12000, cycle: "annual", risk: true, audit: false });
    res.paid = /اشتراك فعّال/.test(h2) && /مدار/.test(h2) && /إدارة المخاطر/.test(h2) && !/المراجعة الداخلية/.test(h2) && /12,000/.test(h2) && !/pk-grid/.test(h2);
    const h3 = page({ paid: true, pkg: "ذاتي", ends: iso(-10), starts: iso(-375) });
    res.expired = /اشتراك منتهٍ/.test(h3) && /منذ الانتهاء/.test(h3);
    const h4 = page({ paid: true, pkg: "ذاتي", ends: iso(12), starts: iso(-353) });
    res.nearEnd = /قارب على الانتهاء/.test(h4);
    res.none = /لا يوجد اشتراك/.test(page({})) && /pk-grid/.test(q("mySubBody").innerHTML);
    res.missing = /تعذّر تحميل/.test(page(null));
    // الشريط العلوي
    const banner = () => { const b = q("trialBanner"); return b ? b.textContent : ""; };
    const fresh = () => { clearTimeout(window._tbTimer); try { sessionStorage.clear(); } catch (e) {} const b = q("trialBanner"); if (b) b.remove(); };
    currentCompanyId = 1; userMemberships = [{ company_id: 1, role: "مدير النظام" }]; currentUserProfile = { email: "a@test.sa", is_platform_admin: false };
    fresh(); currentCompanyTrialEndsAt = iso(3); currentCompanySub = null; renderTrialBanner(); res.bTrial = /متبقٍ [34] يوم/.test(banner()) && /اشترك الآن/.test(banner());
    fresh(); currentCompanyTrialEndsAt = iso(-2); renderTrialBanner(); res.bTrialEnded = /انتهت فترة/.test(banner());
    fresh(); currentCompanyTrialEndsAt = null; currentCompanySub = { paid: true, ends: iso(10) }; renderTrialBanner(); res.bSubAdmin = /ينتهي اشتراكك خلال/.test(banner());
    fresh(); userMemberships = [{ company_id: 1, role: "مساهم" }]; renderTrialBanner(); res.bSubShareholder = banner() === "";
    fresh(); userMemberships = [{ company_id: 1, role: "مدير النظام" }]; currentCompanySub = { paid: true, ends: iso(200) }; renderTrialBanner(); res.bFar = banner() === "";
    fresh(); currentCompanySub = { paid: true, ends: iso(-3) }; renderTrialBanner(); res.bExpired = /انتهى اشتراكك/.test(banner());
    dismissTrialBanner(); res.dismissed = banner() === ""; renderTrialBanner(); res.stayDismissed = banner() === "";
    fresh();
    // تجديد الاشتراك من مالك المنصة
    window.loadManageCompanies = async () => {};
    const ends0 = iso(30);
    __db.companies = [
      { id: 10, name: "شركة أ", billing_cycle: "annual", subscription_ends_at: ends0 },
      { id: 11, name: "شركة ب", billing_cycle: "monthly", subscription_ends_at: ends0 },
      { id: 12, name: "شركة قديمة", subscription_ends_at: null, converted_to_paid_at: iso(-100) },
    ];
    window.confirm = () => true;
    currentUserProfile = { email: "x@test.sa", is_platform_admin: false };
    await renewSubscription(10); res.nonOwnerBlocked = __db.companies[0].subscription_ends_at === ends0;
    currentUserProfile = { email: "owner@hwkm.net", is_platform_admin: true };
    await renewSubscription(10); await settle();
    const yrs = (a, b) => Math.round((new Date(b) - new Date(a)) / day);
    res.annual = yrs(ends0, __db.companies[0].subscription_ends_at);       // +سنة من نهاية الاشتراك الحالي
    await renewSubscription(11); await settle();
    res.monthly = yrs(ends0, __db.companies[1].subscription_ends_at);      // +شهر
    const answers = ["شهري", "500"]; window.prompt = () => answers.shift();
    await renewSubscription(12); await settle();
    const c12 = __db.companies[2];
    res.old = { cycle: c12.billing_cycle, price: c12.subscription_price, hasEnd: !!c12.subscription_ends_at, startsKept: !!c12.subscription_starts_at };
    window.confirm = () => false; const before = __db.companies[0].subscription_ends_at;
    await renewSubscription(10); res.cancelKeeps = __db.companies[0].subscription_ends_at === before;
    res.activity = (__db.activity_log || []).filter((a) => a.entity_type === "اشتراك").length;
    return res;
  });
  ok("صفحة «اشتراكي»: التجربة والفعّال والمنتهي والقارب على الانتهاء وبلا اشتراك وتعذّر التحميل", f8.trial && f8.paid && f8.expired && f8.nearEnd && f8.none && f8.missing, f8);
  ok("الشريط العلوي: تجربة، تجربة منتهية، اشتراك قارب على الانتهاء (للمدير فقط)، اشتراك منتهٍ", f8.bTrial && f8.bTrialEnded && f8.bSubAdmin && f8.bSubShareholder && f8.bFar && f8.bExpired, f8);
  ok("الشريط يُغلق ولا يعود في نفس الجلسة", f8.dismissed && f8.stayDismissed, f8);
  ok("التجديد لمالك المنصة فقط، سنويًا (+365 يومًا) وشهريًا (+شهر) من نهاية الاشتراك الحالي", f8.nonOwnerBlocked && (f8.annual === 365 || f8.annual === 366) && f8.monthly >= 28 && f8.monthly <= 31, f8);
  ok("المشترك القديم بلا مدة: يُسأل عن الدورة والسعر ثم يُسجَّل، وإلغاء التأكيد لا يغيّر شيئًا", f8.old.cycle === "monthly" && f8.old.price === 500 && f8.old.hasEnd && f8.old.startsKept && f8.cancelKeeps, f8);
  ok("التجديد يُسجَّل في سجل النشاط", f8.activity >= 3, f8.activity);

  /* ───────── مسار 9: الجمعية العامة (الحضور ← النصاب ← الأغلبية ← قائمة الحاضرين) ───────── */
  console.log("مسار 9) الجمعية العامة: الحضور والنصاب والأغلبية");
  const f9 = await pg.evaluate(async () => {
    const msgs = []; window.alert = (m) => msgs.push(String(m)); window.uiConfirm = async () => true;
    const q = (id) => document.getElementById(id);
    const res = {}; const settle = () => new Promise((r) => setTimeout(r, 250));
    __db.companies = [{ id: 1, name: "شركة تجريبية", total_shares: 1000 }];
    __db.shareholders = [
      { id: 1, company_id: 1, name: "أحمد", shares_count: 400 }, { id: 2, company_id: 1, name: "بسمة", shares_count: 350 }, { id: 3, company_id: 1, name: "جمال", shares_count: 250 },
    ];
    __db.meetings = [{ id: 7, company_id: 1, type: "جمعية عامة", agm_type: "عادية", call_number: 1 }];
    __db.agm_attendance = []; __db.votes = [];
    currentCompanyId = 1; currentUserProfile = { email: "admin@test.sa", full_name: "المدير", is_platform_admin: false }; __fakeUser = { email: "admin@test.sa" };
    userMemberships = [{ company_id: 1, role: "مدير النظام" }];
    const box = () => q("agmView-quorum").textContent.replace(/\s+/g, " ");
    q("agmCheckin-shareholder").dataset.meetingId = "7";
    await loadCheckinShareholdersDropdown();
    res.options = q("agmCheckin-shareholder").options.length - 1;
    // تسجيل بلا اسم يُرفض
    msgs.length = 0; await checkInAttendee(); res.emptyBlocked = msgs.some((m) => /اختيار مساهم/.test(m)) && __db.agm_attendance.length === 0;
    // اختيار مساهم يملأ الاسم والأسهم تلقائيًا
    q("agmCheckin-shareholder").value = "1"; onCheckinShareholderPick();
    res.autofill = q("agmCheckin-name").value === "أحمد" && q("agmCheckin-asalah").value === "400";
    await checkInAttendee(); await settle();
    res.row1 = __db.agm_attendance[0] && { n: __db.agm_attendance[0].shareholder_name, a: __db.agm_attendance[0].shares_asalah, c: __db.agm_attendance[0].company_id };
    res.q1 = box();                                    // 40% من 1000 ← عادية دعوة أولى (25%) متحقق
    res.fieldsReset = q("agmCheckin-name").value === "" && q("agmCheckin-asalah").value === "0";
    // الجمعية غير العادية: النصاب 50% فلا يتحقق بـ 40%
    __db.meetings[0].agm_type = "غير عادية"; await renderAGMQuorumWidget(7); res.q2 = box();
    // حضور بالوكالة 150 سهمًا يرفع الحضور إلى 55%
    q("agmCheckin-shareholder").value = ""; q("agmCheckin-name").value = "بسمة"; q("agmCheckin-asalah").value = "0"; q("agmCheckin-wakala").value = "150"; q("agmCheckin-card").value = "C-9";
    await checkInAttendee(); await settle();
    res.q3 = box();
    res.list = q("agmCheckin-list").textContent.replace(/\s+/g, " ");
    // قائمة الحاضرين للوثائق
    const att = await getAttendeesList(7);
    res.att = att.list.map((x) => x.name + ":" + x.shares + ":" + x.cardNo);
    // الأغلبية على الأسهم الممثلة (550 سهمًا)
    res.ordPass = agmEvaluateTopic("عادية", "الموافقة على القوائم المالية", 300, 550).passed;      // 54.5% > 50%
    res.extFail = agmEvaluateTopic("غير عادية", "تعديل النظام", 300, 550).passed;                // 54.5% < 66.67%
    res.extPass = agmEvaluateTopic("غير عادية", "تعديل النظام", 370, 550).passed;                // 67.3% ≥ 66.67%
    res.spec75 = agmEvaluateTopic("غير عادية", "زيادة رأس المال", 370, 550).passed;               // 67.3% < 75%
    res.spec75ok = agmEvaluateTopic("غير عادية", "زيادة رأس المال", 420, 550).passed;             // 76.4% ≥ 75%
    // معدل التصويت الحي
    __db.votes = [
      { id: 1, meeting_id: 7, shareholder_name: "أحمد", shares_count: 400 }, { id: 2, meeting_id: 7, shareholder_name: "أحمد", shares_count: 400 },
      { id: 3, meeting_id: 7, shareholder_name: "بسمة", shares_count: 150 }, { id: 4, meeting_id: 7, shareholder_name: null, shares_count: 99 },
    ];
    await renderAGMVotingRateWidget(7); res.rate = q("agmView-votingRate").textContent.replace(/\s+/g, " ");
    // عدم تطابق مجموع المساهمين مع أسهم الشركة يظهر تحذيرًا
    __db.shareholders[2].shares_count = 100; await renderAGMQuorumWidget(7); res.mismatch = /لا يساوي إجمالي أسهم الشركة/.test(box());
    __db.shareholders[2].shares_count = 250; __db.companies[0].total_shares = 0; await renderAGMQuorumWidget(7); res.noTotal = /غير مُدخل/.test(box());
    __db.companies[0].total_shares = 1000;
    // حذف تسجيل حضور يعيد حساب النصاب
    await deleteCheckin(__db.agm_attendance[1].id, 7); await settle(); res.afterDelete = box();
    return res;
  });
  ok("قائمة المساهمين تظهر، والتسجيل بلا اسم يُرفض، واختيار المساهم يملأ اسمه وأسهمه", f9.options === 3 && f9.emptyBlocked && f9.autofill, f9);
  ok("تسجيل الحضور يُحفظ بشركته الصحيحة ويصفّر الحقول", f9.row1 && f9.row1.n === "أحمد" && f9.row1.a === 400 && f9.row1.c === 1 && f9.fieldsReset, f9);
  ok("النصاب: 40% يحقق نصاب العادية (25%) ولا يحقق غير العادية (50%)، ثم يتحقق بإضافة وكالة 150 سهمًا (55%)", /تحقق النصاب/.test(f9.q1) && /25%/.test(f9.q1) && /لم يتحقق/.test(f9.q2) && /50%/.test(f9.q2) && /55\.0%/.test(f9.q3) && /تحقق النصاب/.test(f9.q3) && !/لم يتحقق/.test(f9.q3), f9);
  ok("قائمة الحاضرين ومحضر الحضور يجمعان الأصالة والوكالة ويحفظان رقم البطاقة", /بسمة/.test(f9.list) && f9.att.join("|") === "أحمد:400:V-001|بسمة:150:C-9", f9);
  ok("الأغلبية محسوبة على الأسهم الممثلة: عادية 50%، غير عادية ثلثان، وقرارات خاصة 75%", f9.ordPass && !f9.extFail && f9.extPass && !f9.spec75 && f9.spec75ok, f9);
  ok("معدل التصويت الحي يحسب آخر صوت لكل مساهم ويتجاهل بلا اسم (550 سهمًا = 55%)", /2/.test(f9.rate) && /55\.0%/.test(f9.rate), f9.rate);
  ok("تحذير عدم تطابق أسهم المساهمين مع إجمالي الشركة، وتحذير غياب الإجمالي", f9.mismatch && f9.noTotal, f9);
  ok("حذف تسجيل حضور يعيد حساب النصاب (40%)", /40\.0%/.test(f9.afterDelete), f9.afterDelete);

  ok("لا أخطاء برمجية أثناء المسارات", errs.length === 0, errs);
  await browser.close();
  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})();
