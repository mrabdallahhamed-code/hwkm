/* ══════════ Admin management of the criteria banks themselves ══════════ */
async function openPerfCriteriaManager(){
  if(!perfCriteriaCache) await loadPerfCriteriaCache();
  openM("m-perf-criteria");
  document.getElementById("pc-role-select").value = "عضو مجلس";
  renderPerfCriteriaList();
}

function renderPerfCriteriaList(){
  const role = document.getElementById("pc-role-select").value;
  const list = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const box = document.getElementById("pc-list");
  box.innerHTML = list.map((c,i) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--offwhite);border-radius:6px;margin-bottom:6px">
    <span style="flex:1;font-size:12px;color:var(--dark)">${i+1}. ${c}</span>
    <button onclick="deletePerfCriterion(${i})" style="background:none;border:none;cursor:pointer;padding:4px" title="حذف هذا البند"><span class="ico ico-trash" style="width:14px;height:14px;color:var(--red)"></span></button>
  </div>`).join("") || '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد بنود بهذه القائمة.</div>';
}

async function persistPerfCriteria(role, items){
  await sb.from("performance_criteria").delete().eq("company_id", currentCompanyId).eq("role_type", role);
  if(items.length){
    const { error } = await sb.from("performance_criteria").insert(items.map((text,i) => ({ company_id: currentCompanyId, role_type: role, criterion_text: text, sort_order: i })));
    if(error){ alert("تعذّر الحفظ: " + error.message); return false; }
  }
  await loadPerfCriteriaCache();
  return true;
}

async function addPerfCriterion(){
  const role = document.getElementById("pc-role-select").value;
  const input = document.getElementById("pc-new-item");
  const text = input.value.trim();
  if(!text) return;
  const current = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const ok = await persistPerfCriteria(role, [...current, text]);
  if(ok){ input.value = ""; renderPerfCriteriaList(); }
}

async function deletePerfCriterion(index){
  if(!await uiConfirm("حذف هذا البند من قائمة التقييم؟ هذا يؤثر على أي تقييم يفتح لاحقًا بهذه الفئة.")) return;
  const role = document.getElementById("pc-role-select").value;
  const current = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const ok = await persistPerfCriteria(role, current.filter((_,i)=>i!==index));
  if(ok) renderPerfCriteriaList();
}

async function resetPerfCriteriaToDefault(){
  const role = document.getElementById("pc-role-select").value;
  if(!(await uiConfirm("رجّع القائمة الافتراضية لهذي الفئة؟ يلغي أي تخصيص سابق لها."))) return;
  persistPerfCriteria(role, []).then(ok => { if(ok) renderPerfCriteriaList(); });
}

function selectPerfCriterionScore(btn, val){
  const row = btn.closest(".perf-crit-row");
  row.dataset.selected = val;
  row.querySelectorAll(".perf-crit-btn").forEach(b => {
    const active = Number(b.dataset.val) === val;
    b.style.background = active ? "linear-gradient(135deg,var(--primary),var(--accent))" : "#fff";
    b.style.color = active ? "#fff" : "var(--dark)";
  });
}

async function submitPerfReview(evaluationId){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }

  // Locked once submitted — checked here too, not just hidden in the UI, so this can't be
  // bypassed by calling the function directly. Intentional: a reviewer who could keep revising
  // after seeing others' scores (or simply reconsidering) is exactly the opening for favoritism
  // this lock exists to close.
  const { data: existing } = await sb.from("performance_evaluation_reviews").select("id").eq("evaluation_id", evaluationId).eq("reviewer_email", myEmail).limit(1);
  if(existing && existing.length){ alert("سبق أن أرسلت تقييمك لهذا الشخص — غير قابل للتعديل."); if(perfDetailContext) renderPerfReviewForm({id:evaluationId, ...perfCache.find(e=>e.id===evaluationId)}); return; }

  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("perf-review-notes-"+evaluationId);
  const notes = notesEl ? notesEl.value.trim() : "";

  const rows = document.querySelectorAll('.perf-crit-row[data-eval="'+evaluationId+'"]');
  const payloads = [];
  for(const row of rows){
    const val = row.dataset.selected;
    if(!val){ alert("الرجاء اختيار تقييم لكل البنود قبل الإرسال"); return; }
    payloads.push({
      evaluation_id: evaluationId, reviewer_email: myEmail, reviewer_name,
      criterion: row.dataset.criterion, score: Number(val), notes, company_id: currentCompanyId
    });
  }
  if(!await uiConfirm("بعد الإرسال ما تقدر تعدّل تقييمك لهذا الشخص. متابعة؟")) return;

  const { error } = await sb.from("performance_evaluation_reviews").insert(payloads);
  if(error){ alert("تعذّر حفظ تقييمك: " + error.message); return; }
  const ev = perfCache.find(e=>e.id===evaluationId);
  if(ev) renderPerfReviewForm(ev);
}

const titles={
  dashboard:['لوحة التحكم الرئيسية','نظرة شاملة على حوكمة الشركة — مارس 2026'],
  users:['إدارة الصلاحيات','التحكم بأدوار وصلاحيات المستخدمين'],
  meetings:['اجتماعات مجلس الإدارة','إدارة الاجتماعات والمحاضر والقرارات'],
  members:['أعضاء مجلس الإدارة','ملفات الأعضاء وسجل الحضور والمؤهلات'],
  risks:['إدارة المخاطر المؤسسية','سجل المخاطر وخطط المعالجة والمتابعة'],
  compliance:['الالتزام التنظيمي','متابعة الامتثال للأنظمة واللوائح السعودية'],
  signing:['التوقيع الإلكتروني','وثائق تنتظر التوقيع الإلكتروني المعتمد'],
  committees:['اللجان المتخصصة','لجان المجلس والمهام والاجتماعات'],
  agm:['الجمعيات العامة','إدارة الجمعيات العامة العادية والغير عادية'],
  governance:['السياسات والحوكمة','إدارة سياسات الشركة وأدلة الحوكمة'],
  announcements:['الإعلانات','إعلانات هيئة السوق المالية للشركات المدرجة'],
  archive:['الأرشيف والوثائق','حفظ واسترجاع الوثائق الحوكمية'],
  structure:['الهيكل التنظيمي','الهيكل الإداري وتسلسل الصلاحيات'],
  procedures:['الإجراءات','إجراءات العمل والترابط بين الإدارات'],
  permissions:['مصفوفة الصلاحيات','تحديد الصلاحيات والأدوار'],
  perf:['تقييم الأداء','تقييم أداء المجلس واللجان والإدارة العليا'],
  voting:['التصويت الإلكتروني','إدارة القرارات والتصويت الإلكتروني'],
  audit:['التدقيق الداخلي','خطط التدقيق والتقارير ومتابعة التوصيات'],
  reports:['تقارير الحوكمة','تقارير الأداء والامتثال والحوكمة'],
  appoint:['طلب تعيين عضو','طلب تعيين عضو مجلس إدارة أو عضو لجنة متخصصة'],
  consultants:['الاستشارات','الاستشارات القانونية والإدارية وعقودها'],
};

let viewingPlatformOverview = false;
let pendingUpgradeModuleKey = null;

/* Lightweight upgrade request — no self-service checkout exists yet, so this just gets a clear,
   specific request in front of HWKM's platform team by email, who then activates it via the
   existing "Manage Active Subscription" tool once payment is arranged. */
async function requestModuleUpgrade(){
  if(!pendingUpgradeModuleKey) return;
  const moduleLabel = { risk_management: 'إدارة المخاطر (ضمن باقة شريك)', internal_audit: 'التدقيق الداخلي (ضمن باقة شريك)' }[pendingUpgradeModuleKey] || pendingUpgradeModuleKey;
  const btn = document.getElementById('btnRequestUpgrade');
  if(btn){ btn.disabled = true; btn.textContent = 'جارِ الإرسال...'; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email || '—';
  const requesterName = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const companyName = document.getElementById('companySwitcher')?.selectedOptions?.[0]?.textContent?.trim() || currentCompanyId;

  const { success, error } = await sendNotificationEmail(
    'info@hwkm.net',
    `طلب ترقية باقة — ${companyName}`,
    `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2>🔓 طلب تفعيل ميزة إضافية</h2>
      <p><b>الشركة:</b> ${companyName} (ID: ${currentCompanyId})</p>
      <p><b>الميزة المطلوبة:</b> ${moduleLabel}</p>
      <p><b>مقدَّم من:</b> ${requesterName} (${myEmail})</p>
    </div>`
  );

  if(btn){ btn.disabled = false; }
  if(!success){ alert('تعذّر إرسال الطلب: ' + error); if(btn) btn.textContent = 'اطلب تفعيل هذي الميزة'; return; }
  if(btn){ btn.innerHTML = '<span class="ico-i ico-check"></span>تم إرسال طلبك ✅'; btn.style.background = 'var(--green)'; }
  setTimeout(() => alert('وصل طلبك لفريقنا — بنتواصل معك قريبًا لإتمام الترقية.'), 200);
}

let currentPageId = null;

/* ══════════ PROCEDURES — ready templates per department kind ══════════
   Each step: [title, responsible, handoff-kind (or null), inputs, outputs, duration].
   A handoff kind is resolved to the company's real department at generation time. */
const PROC_KINDS = [
  ["audit",   /مراجعة داخلية|المراجعة الداخلية|تدقيق داخلي/],
  ["gov",     /حوكمة|امتثال|التزام/],
  ["risk",    /مخاطر/],
  ["legal",   /قانون|شؤون قانونية|شئون قانونية/],
  ["it",      /تقنية|معلومات|نظم|تكنولوجيا/],
  ["proc",    /مشتريات|إمداد|امداد|توريد/],
  ["hr",      /موارد بشرية|الموارد البشرية|شؤون الموظفين|شئون الموظفين/],
  ["finance", /مالي|محاسب|خزينة|ميزاني|زكاة|ضريب/],
  ["sales",   /مبيعات|تجاري|التجارية/],
  ["marketing",/تسويق|علامة تجارية|اتصال مؤسسي/],
  ["quality", /جودة|سلامة/],
  ["ops",     /تشغيل|عمليات|إنتاج|انتاج|لوجست|مخازن/],
  ["projects",/مشاريع|مشروع/],
  ["cs",      /عملاء|خدمة العملاء/]
];
function procKindOf(title){ const t = String(title || ""); const k = PROC_KINDS.find(x => x[1].test(t)); return k ? k[0] : null; }

const PROC_TEMPLATES = {
  proc: [
    { title:"إجراء الشراء", purpose:"تأمين احتياجات الشركة من السلع والخدمات وفق سياسة الشراء المعتمدة.", steps:[
      ["استلام طلب الشراء ومراجعة المواصفات","موظف المشتريات",null,"طلب شراء معتمد من الإدارة الطالبة","طلب مكتمل المواصفات","يوم"],
      ["طلب عروض الأسعار والمقارنة بينها","موظف المشتريات",null,"طلب الشراء، قائمة الموردين المعتمدين","جدول مقارنة العروض","3-5 أيام"],
      ["اعتماد التوصية بالترسية حسب الصلاحية","مدير المشتريات","finance","جدول المقارنة","توصية معتمدة بالترسية","يومان"],
      ["إصدار أمر الشراء ومتابعة التوريد والاستلام","موظف المشتريات","finance","أمر الشراء","إشعار استلام مطابق","حسب العقد"],
      ["تسليم المستندات للمالية لصرف المستحقات","موظف المشتريات","finance","أمر الشراء، إشعار الاستلام، الفاتورة","ملف مستندات مكتمل","يوم"] ] },
    { title:"إجراء تقييم الموردين", purpose:"ضمان جودة الموردين والتزامهم بالشروط التعاقدية.", steps:[
      ["جمع بيانات أداء الموردين","موظف المشتريات","ops","سجل التوريد وملاحظات الاستلام","بيانات الأداء","شهر"],
      ["تقييم الموردين وفق معايير معتمدة","مدير المشتريات",null,"بيانات الأداء","درجات التقييم","أسبوع"],
      ["تحديث قائمة الموردين المعتمدين","موظف المشتريات",null,"نتائج التقييم","قائمة محدّثة","يومان"] ] } ],
  hr: [
    { title:"إجراء التوظيف والتعيين", purpose:"استقطاب وتعيين الكفاءات المناسبة وفق الاحتياج المعتمد.", steps:[
      ["استلام طلب الاحتياج الوظيفي واعتماده","مدير الموارد البشرية","finance","طلب احتياج من الإدارة الطالبة","احتياج معتمد ضمن الموازنة","3 أيام"],
      ["الإعلان والفرز الأولي للمرشحين","أخصائي توظيف",null,"الوصف الوظيفي","قائمة مختصرة","أسبوعان"],
      ["المقابلات والتقييم","لجنة المقابلة",null,"القائمة المختصرة","توصية بالمرشح","أسبوع"],
      ["إصدار العرض والعقد","أخصائي توظيف","legal","التوصية المعتمدة","عقد موقّع","3 أيام"],
      ["مباشرة العمل والتعريف بالمنشأة","أخصائي توظيف","it","عقد موقّع","موظف مباشر وصلاحيات ممنوحة","يوم"] ] },
    { title:"إجراء الإجازات والحضور", purpose:"تنظيم الإجازات والحضور وفق نظام العمل ولوائح الشركة.", steps:[
      ["تقديم طلب الإجازة","الموظف",null,"نموذج طلب إجازة","طلب مقدّم","—"],
      ["موافقة المدير المباشر","المدير المباشر",null,"طلب الإجازة","موافقة أو رفض","يومان"],
      ["تسجيل الإجازة وتحديث الرصيد","أخصائي موارد بشرية","finance","الموافقة","رصيد محدّث وإشعار للرواتب","يوم"] ] } ],
  finance: [
    { title:"إجراء صرف المستحقات", purpose:"ضمان صرف المستحقات الصحيحة في وقتها وفق الصلاحيات المعتمدة.", steps:[
      ["استلام المستندات ومراجعة اكتمالها","محاسب الذمم الدائنة",null,"فاتورة، أمر شراء، إشعار استلام","ملف مراجع","يومان"],
      ["المطابقة الثلاثية","محاسب الذمم الدائنة",null,"الملف المراجع","مطابقة معتمدة","يوم"],
      ["اعتماد الصرف حسب الصلاحية","المدير المالي",null,"المطابقة","موافقة صرف","يومان"],
      ["تنفيذ الدفع والقيد المحاسبي","أمين الصندوق / الخزينة",null,"موافقة الصرف","دفعة منفذة وقيد","يوم"] ] },
    { title:"إجراء الإقفال المالي الشهري", purpose:"إعداد قوائم مالية دقيقة في موعدها.", steps:[
      ["استلام بيانات الإدارات (رواتب، مشتريات، مبيعات)","محاسب عام","hr","كشوف الإدارات","بيانات مستلمة","3 أيام"],
      ["قيود التسوية والإقفال","محاسب عام",null,"البيانات","ميزان مراجعة","3 أيام"],
      ["مراجعة القوائم واعتمادها","المدير المالي",null,"ميزان المراجعة","قوائم مالية معتمدة","يومان"],
      ["رفع التقرير للإدارة العليا","المدير المالي","gov","القوائم المعتمدة","تقرير شهري مرفوع","يوم"] ] } ],
  sales: [
    { title:"إجراء التعاقد مع العملاء", purpose:"تحويل الفرص إلى عقود موثقة ومعتمدة.", steps:[
      ["تأهيل الفرصة وإعداد العرض","مسؤول مبيعات","finance","طلب العميل","عرض سعر","3 أيام"],
      ["مراجعة الشروط التعاقدية","مسؤول مبيعات","legal","العرض والعقد النموذجي","عقد مراجع","3 أيام"],
      ["اعتماد العقد حسب الصلاحية","مدير المبيعات",null,"العقد المراجع","عقد معتمد","يومان"],
      ["توقيع العقد وتسليمه للتنفيذ","مسؤول مبيعات","ops","عقد موقّع","طلب تنفيذ","يوم"] ] },
    { title:"إجراء التحصيل", purpose:"متابعة تحصيل المستحقات من العملاء.", steps:[
      ["إصدار الفاتورة وإرسالها","مسؤول مبيعات","finance","إشعار إنجاز","فاتورة مرسلة","يوم"],
      ["متابعة السداد والتذكير","مسؤول تحصيل",null,"كشف أعمار الديون","تحصيلات","حسب الاستحقاق"],
      ["تصعيد المتأخرات","مدير المبيعات","legal","قائمة المتأخرين","إنذار أو إجراء نظامي","أسبوع"] ] } ],
  marketing: [
    { title:"إجراء الحملات التسويقية", purpose:"تنفيذ الحملات وفق الخطة والموازنة المعتمدة.", steps:[
      ["إعداد فكرة الحملة والموازنة","مسؤول تسويق","finance","خطة تسويقية سنوية","مقترح حملة","أسبوع"],
      ["اعتماد الحملة","مدير التسويق",null,"مقترح الحملة","موافقة","يومان"],
      ["التنفيذ والنشر","مسؤول تسويق",null,"المحتوى المعتمد","حملة منشورة","حسب الخطة"],
      ["قياس الأداء وتسليم العملاء المحتملين","مسؤول تسويق","sales","بيانات الحملة","تقرير نتائج وعملاء محتملون","أسبوع"] ] } ],
  legal: [
    { title:"إجراء مراجعة العقود", purpose:"حماية مصالح الشركة النظامية قبل توقيع العقود.", steps:[
      ["استلام العقد وطلب المراجعة","مستشار قانوني",null,"مسودة العقد من الإدارة الطالبة","طلب مراجعة مسجّل","يوم"],
      ["المراجعة وإبداء الملاحظات","مستشار قانوني",null,"مسودة العقد","ملاحظات قانونية","3 أيام"],
      ["إعادة العقد للإدارة الطالبة للتعديل","مستشار قانوني",null,"الملاحظات","عقد معدّل","يومان"],
      ["اعتماد الصيغة النهائية","مدير الشؤون القانونية",null,"العقد المعدّل","صيغة نهائية معتمدة","يوم"] ] } ],
  it: [
    { title:"إجراء منح صلاحيات الأنظمة", purpose:"ضبط الدخول للأنظمة وفق مبدأ أقل صلاحية.", steps:[
      ["استلام طلب الصلاحية من الإدارة المعنية","موظف الدعم الفني","hr","طلب معتمد من المدير المباشر","طلب مسجّل","يوم"],
      ["مراجعة الطلب مقابل مصفوفة الصلاحيات","مسؤول أمن المعلومات","gov","الطلب، مصفوفة الصلاحيات","موافقة أمنية","يوم"],
      ["تنفيذ الصلاحية وتوثيقها","موظف الدعم الفني",null,"الموافقة","صلاحية ممنوحة وسجل","يوم"] ] },
    { title:"إجراء معالجة الحوادث التقنية", purpose:"سرعة معالجة الحوادث وتقليل أثرها.", steps:[
      ["تسجيل الحادثة وتصنيفها","موظف الدعم الفني",null,"بلاغ المستخدم","حادثة مصنفة","ساعة"],
      ["المعالجة والاحتواء","فريق الدعم",null,"الحادثة","حل أو حل مؤقت","حسب التصنيف"],
      ["إبلاغ الإدارة العليا بالحوادث الجوهرية","مدير تقنية المعلومات","risk","تقرير الحادثة","إشعار موثق","4 ساعات"] ] } ],
  audit: [
    { title:"إجراء تنفيذ مهمة المراجعة", purpose:"تنفيذ مهام المراجعة وفق الخطة المعتمدة من لجنة المراجعة.", steps:[
      ["إعداد نطاق المهمة وإشعار الإدارة المعنية","مراجع داخلي",null,"خطة المراجعة السنوية","خطاب بدء مهمة","أسبوع"],
      ["جمع الأدلة واختبار الضوابط","مراجع داخلي",null,"سجلات وبيانات الإدارة","نتائج الفحص","2-3 أسابيع"],
      ["إصدار التقرير ومناقشة الملاحظات","مدير المراجعة الداخلية","gov","نتائج الفحص","تقرير معتمد","أسبوع"],
      ["متابعة الإجراءات التصحيحية","مراجع داخلي",null,"خطة المعالجة من الإدارة","حالة إغلاق الملاحظات","ربع سنوي"] ] } ],
  gov: [
    { title:"إجراء اعتماد وتحديث السياسات", purpose:"ضمان اعتماد السياسات وفق دورة معتمدة وتحديثها دوريًا.", steps:[
      ["استلام مقترح السياسة من الإدارة المعنية","مسؤول الحوكمة",null,"مسودة السياسة","مسودة مسجلة","يوم"],
      ["المراجعة الشكلية والتوافق مع الأنظمة","مسؤول الحوكمة","legal","المسودة","ملاحظات توافق","3 أيام"],
      ["عرض السياسة على جهة الاعتماد","مدير الحوكمة",null,"المسودة المراجعة","قرار الاعتماد","حسب جدول الاجتماعات"],
      ["نشر السياسة والتعميم","مسؤول الحوكمة",null,"السياسة المعتمدة","تعميم ونسخة معتمدة","يومان"] ] } ],
  risk: [
    { title:"إجراء تقييم ومعالجة المخاطر", purpose:"حصر المخاطر وتقييمها ومتابعة معالجتها.", steps:[
      ["حصر المخاطر مع الإدارات","مسؤول المخاطر",null,"ورش عمل الإدارات","سجل المخاطر","شهر"],
      ["تقييم الاحتمال والأثر","مسؤول المخاطر",null,"سجل المخاطر","تصنيف المخاطر","أسبوع"],
      ["اعتماد خطط المعالجة","مدير المخاطر","gov","خطط المعالجة","خطط معتمدة","أسبوع"],
      ["متابعة التنفيذ ورفع التقرير","مسؤول المخاطر","audit","خطط المعالجة","تقرير مخاطر دوري","ربع سنوي"] ] } ],
  quality: [
    { title:"إجراء الإجراءات التصحيحية والوقائية", purpose:"معالجة عدم المطابقة ومنع تكراره.", steps:[
      ["تسجيل عدم المطابقة","مسؤول الجودة",null,"ملاحظة أو شكوى","سجل عدم مطابقة","يوم"],
      ["تحليل السبب الجذري","مسؤول الجودة","ops","السجل","تقرير السبب","3 أيام"],
      ["اعتماد الإجراء التصحيحي ومتابعته","مدير الجودة",null,"تقرير السبب","إجراء معتمد ومغلق","حسب الخطورة"] ] } ],
  ops: [
    { title:"إجراء تنفيذ الطلبات التشغيلية", purpose:"تنفيذ الطلبات بجودة ووقت مناسبين.", steps:[
      ["استلام الطلب ومراجعة الجاهزية","مشرف العمليات","sales","طلب معتمد","أمر تشغيل","يوم"],
      ["التخطيط وتوفير الموارد","مشرف العمليات","proc","أمر التشغيل","خطة تنفيذ","يومان"],
      ["التنفيذ والمتابعة","فريق العمليات",null,"خطة التنفيذ","مخرج منجز","حسب الطلب"],
      ["فحص الجودة والتسليم","مسؤول الجودة","quality","المخرج المنجز","تقرير فحص وتسليم","يوم"] ] } ],
  projects: [
    { title:"إجراء إدارة المشروع", purpose:"تنفيذ المشاريع ضمن النطاق والجدول والتكلفة.", steps:[
      ["اعتماد وثيقة المشروع والموازنة","مدير المشروع","finance","وثيقة المشروع","موافقة بدء","أسبوع"],
      ["التخطيط وتوزيع المهام","مدير المشروع",null,"الوثيقة المعتمدة","خطة وجدول","أسبوع"],
      ["المتابعة ورفع تقارير التقدم","مدير المشروع",null,"بيانات التنفيذ","تقرير دوري","أسبوعي"],
      ["الإقفال وتسليم المشروع","مدير المشروع","ops","مخرجات المشروع","محضر تسليم ودروس مستفادة","أسبوع"] ] } ],
  cs: [
    { title:"إجراء معالجة شكاوى العملاء", purpose:"الاستجابة لشكاوى العملاء وإغلاقها بجودة وفي وقتها.", steps:[
      ["استلام الشكوى وتسجيلها","موظف خدمة العملاء",null,"شكوى العميل","شكوى مسجلة","ساعة"],
      ["تحويل الشكوى للإدارة المختصة","موظف خدمة العملاء","ops","الشكوى","إحالة مسجلة","ساعتان"],
      ["المعالجة والرد على العميل","موظف خدمة العملاء",null,"نتيجة المعالجة","رد مسجل","3 أيام"],
      ["قياس رضا العميل وإغلاق الشكوى","موظف خدمة العملاء",null,"رد العميل","شكوى مغلقة","يومان"] ] } ]
};

/* ══════════ PROCEDURES ══════════ */
let procState = { tab:"list", org:[], procs:[], steps:{}, gates:null, depts:[], map:null };
const PROC_STATUS_STYLE = { "مسودة":["#EEF1F5","#5b6678"], "قيد الاعتماد":["#FEF3E2","#9C7A2E"], "معتمد":["#E8F8EF","#1B7F4B"], "تحتاج مراجعة":["#FDE8E8","#C0392B"] };

function procHash(s){ let h = 5381; for(let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(h); }
function procStructureHash(org){
  return procHash((org || []).filter(r => !r.is_body).map(r => `${r.position_title}|${r.parent_position || ""}|${r.level ?? ""}`).sort().join("\n"));
}
async function procMatrixHash(){
  try{
    const [h, it] = await Promise.all([
      sb.from("permission_holders").select("id,name").eq("company_id", currentCompanyId),
      sb.from("permission_items").select("id,item_name").eq("company_id", currentCompanyId)
    ]);
    const items = Array.isArray(it.data) ? it.data : [], holders = Array.isArray(h.data) ? h.data : [];
    if(!items.length) return procHash("");
    const c = await sb.from("permission_cells").select("item_id,holder_id,code").in("item_id", items.map(x => x.id));
    const iN = {}, hN = {}; items.forEach(x => iN[x.id] = x.item_name); holders.forEach(x => hN[x.id] = x.name);
    return procHash((Array.isArray(c.data) ? c.data : []).filter(x => x.code).map(x => `${iN[x.item_id]}|${hN[x.holder_id]}|${x.code}`).sort().join("\n"));
  }catch(e){ return procHash(""); }
}
function procDepartments(org){
  const bad = /^(نائب|رئيس|الرئيس|المدير العام|مدير عام|المدير التنفيذي|المالك)/;
  return (org || []).filter(r => !r.is_body && !bad.test(r.position_title || "") &&
    ((r.level ?? 0) === 6 || ((r.level ?? 0) === 5 && procKindOf(r.position_title)))).map(r => r.position_title);
}
async function procGatesCheck(){
  const g = { structure:{ ok:false }, matrix:{ ok:false }, policies:{ ok:false, count:0 } };
  try{
    const s = await sb.from("approval_requests").select("status,approved_at").eq("company_id", currentCompanyId).eq("request_type","structure").eq("status","معتمد").order("created_at",{ascending:false}).limit(1);
    if(Array.isArray(s.data) && s.data.length){ g.structure = { ok:true, at:s.data[0].approved_at }; }
  }catch(e){}
  try{
    const m = await sb.from("governance_approvals").select("status,created_at").eq("company_id", currentCompanyId).eq("document_type","matrix").eq("status","مكتملة").order("created_at",{ascending:false}).limit(1);
    if(Array.isArray(m.data) && m.data.length){ g.matrix = { ok:true, at:m.data[0].created_at }; }
  }catch(e){}
  try{
    const p = await sb.from("policies").select("id").eq("company_id", currentCompanyId).eq("status","معتمدة نهائيًا");
    const n = Array.isArray(p.data) ? p.data.length : 0; g.policies = { ok:n > 0, count:n };
  }catch(e){}
  g.all = g.structure.ok && g.matrix.ok && g.policies.ok;
  return g;
}
function procFmt(d){ try{ return new Date(d).toLocaleDateString("ar-SA-u-ca-gregory"); }catch(e){ return "—"; } }

async function loadProcedures(){
  const body = document.getElementById("procBody"); if(!body) return;
  try{ await loadProceduresInner(); }
  catch(e){ body.innerHTML = '<div style="color:var(--red);font-size:12px;padding:14px">تعذّر تحميل الإجراءات الآن، تحقق من الاتصال وأعد المحاولة.</div>'; }
}
async function loadProceduresInner(){
  const body = document.getElementById("procBody"); if(!body) return;
  const [orgR, pR, sR, gates, mh] = await Promise.all([
    sb.from("org_structure").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true}),
    sb.from("procedures").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true}),
    sb.from("procedure_steps").select("*").eq("company_id", currentCompanyId).order("step_no",{ascending:true}),
    procGatesCheck(), procMatrixHash()
  ]);
  if(pR.error){ body.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${orgEsc(pR.error.message)} — تأكد من تنفيذ ملف قاعدة بيانات الإجراءات.</div>`; return; }
  procState.org = Array.isArray(orgR.data) ? orgR.data : [];
  procState.procs = Array.isArray(pR.data) ? pR.data : [];
  procState.steps = {}; (Array.isArray(sR.data) ? sR.data : []).forEach(s => { (procState.steps[s.procedure_id] = procState.steps[s.procedure_id] || []).push(s); });
  procState.gates = gates; procState.depts = procDepartments(procState.org);
  procState.sh = procStructureHash(procState.org); procState.mh = mh;

  // Anything built on an older structure / matrix needs a review — flag it (the work is kept, only the status changes).
  const stale = procState.procs.filter(p => p.based_on && (p.based_on.structure_hash !== procState.sh || p.based_on.matrix_hash !== procState.mh) && p.status !== "تحتاج مراجعة");
  if(stale.length){
    await sb.from("procedures").update({ status:"تحتاج مراجعة", updated_at:new Date().toISOString() }).in("id", stale.map(p => p.id));
    stale.forEach(p => { p.status = "تحتاج مراجعة"; });
  }
  const needs = procState.procs.filter(p => p.status === "تحتاج مراجعة");
  const banner = document.getElementById("procStaleBanner");
  banner.style.display = needs.length ? "block" : "none";
  banner.textContent = needs.length ? `⚠️ تغيّر الهيكل أو المصفوفة بعد بناء ${needs.length} إجراء. راجع كل إجراء واضغط "تعديل" ثم "حفظ" لتأكيد صلاحيته، ثم اطلب اعتماده من جديد.` : "";
  procRenderGates(); procRender();
}
function procRenderGates(){
  const g = procState.gates, el = document.getElementById("procGates"); if(!el || !g) return;
  const row = (ok, t, extra) => `<div>${ok ? "✅" : "⬜"} ${t}${extra ? ` <span style="color:var(--gray3);font-size:11.5px">— ${extra}</span>` : ""}</div>`;
  el.innerHTML = row(g.structure.ok, "اعتماد الهيكل التنظيمي", g.structure.ok ? "بتاريخ " + procFmt(g.structure.at) : "من صفحة الهيكل التنظيمي")
    + row(g.matrix.ok, "اعتماد مصفوفة الصلاحيات", g.matrix.ok ? "اكتملت دورة الاعتماد" : "من صفحة مصفوفة الصلاحيات")
    + row(g.policies.ok, "اعتماد السياسات", g.policies.ok ? g.policies.count + " سياسة معتمدة نهائيًا" : "من صفحة السياسات والحوكمة")
    + `<div style="margin-top:6px;font-size:11.5px;color:var(--gray3)">لا يُسمح بتوليد الإجراءات إلا بعد اكتمال الثلاثة، حتى لا تُبنى على هيكل أو مصفوفة قد تتغير.</div>`;
  const btn = document.getElementById("procGenBtn"); if(btn) btn.style.opacity = g.all ? "1" : ".55";
}
function procSwitchTab(t){ procState.tab = t; procRender(); }
function procRender(){
  const body = document.getElementById("procBody"); if(!body) return;
  ["List","Map"].forEach(k => { const b = document.getElementById("procTab" + k); if(b) b.classList.toggle("primary", procState.tab === k.toLowerCase()); });
  if(procState.tab === "map"){ body.innerHTML = procMapHTML(); return; }
  if(!procState.procs.length){ body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12.5px;padding:26px">لا توجد إجراءات بعد. بعد اكتمال شروط الاعتماد أعلاه اضغط "توليد الإجراءات"، أو أضف إجراءً يدويًا.</div>'; return; }
  const by = {}; procState.procs.forEach(p => { (by[p.department] = by[p.department] || []).push(p); });
  body.innerHTML = Object.keys(by).map(d => `<div style="margin-bottom:18px"><div style="font-weight:800;color:var(--primary);font-size:13px;border-right:4px solid var(--gold);padding-right:10px;margin-bottom:8px">${orgEsc(d)}</div>
    ${by[d].map(p => { const st = PROC_STATUS_STYLE[p.status] || PROC_STATUS_STYLE["مسودة"]; const n = (procState.steps[p.id] || []).length;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:var(--offwhite);border-radius:10px;padding:10px 14px;margin-bottom:6px">
        <div style="flex:1;min-width:220px"><b style="font-size:12.5px">${orgEsc(p.title)}</b>
          <span style="background:${st[0]};color:${st[1]};border-radius:10px;padding:1px 10px;font-size:10.5px;font-weight:800;margin-inline-start:8px">${orgEsc(p.status)}</span>
          <div style="font-size:11px;color:var(--gray3)">النسخة ${p.version}.0 · ${n} خطوات · المصدر: ${orgEsc(p.source)}${p.status === "معتمد" && p.approved_at ? " · اعتُمد " + procFmt(p.approved_at) : ""}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-xs primary" onclick="openProcedure(${p.id})">تعديل / عرض</button>
          <button class="btn-xs" onclick="procOpenApproval(${p.id})">${p.status === "مسودة" ? "طلب اعتماد" : "مسار الاعتماد"}</button>
          <button class="btn-xs" onclick="procExportPDF(${p.id})">PDF</button>
          <button class="btn-xs" onclick="procPrint(${p.id})" title="ملف نصي قابل للبحث والتحديد">طباعة / PDF نصي</button>
          <button class="btn-xs" style="color:var(--red)" onclick="procDelete(${p.id})">حذف</button>
        </div></div>`; }).join("")}</div>`).join("");
}

/* ── generation ── */
async function generateProcedures(){
  const g = await procGatesCheck(); procState.gates = g; procRenderGates();
  if(!g.all){
    const miss = [!g.structure.ok && "الهيكل التنظيمي", !g.matrix.ok && "مصفوفة الصلاحيات", !g.policies.ok && "السياسات"].filter(Boolean).join("، ");
    alert("لا يمكن توليد الإجراءات الآن. لم يكتمل اعتماد: " + miss + ".\nبعد اعتمادها جميعًا يمكنك التوليد، حتى لا تُبنى الإجراءات على نسخة قد تتغير.");
    return;
  }
  const org = procState.org, depts = procState.depts;
  if(!depts.length){ alert("لم أجد إدارات في الهيكل التنظيمي. أضف الإدارات (المستوى 6) أولًا."); return; }
  const kindDept = {}; depts.forEach(d => { const k = procKindOf(d); if(k && !kindDept[k]) kindDept[k] = d; });
  const plan = [];
  depts.forEach(d => { const k = procKindOf(d); (PROC_TEMPLATES[k] || []).forEach(t => { if(!procState.procs.some(p => p.department === d && p.title === t.title)) plan.push({ d, t }); }); });
  if(!plan.length){ alert("لا توجد قوالب جديدة لتوليدها (إما مولّدة سابقًا أو لا يوجد قالب يناسب مسميات الإدارات)."); return; }
  if(!await uiConfirm(`سيتم توليد ${plan.length} إجراء من القوالب الجاهزة لإدارات الشركة، كمسودات تراجعها وتعدّلها ثم تطلب اعتمادها. متابعة؟`)) return;
  const based = { structure_hash: procState.sh, matrix_hash: procState.mh, structure_approved_at: g.structure.at || null };
  let made = 0;
  for(const { d, t } of plan){
    const ins = await sb.from("procedures").insert([{ company_id: currentCompanyId, department: d, title: t.title, purpose: t.purpose, status:"مسودة", version:1, source:"قالب", based_on: based, created_by: currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "" }]).select().single();
    if(ins.error || !ins.data){ alert("تعذّر إنشاء إجراء: " + (ins.error ? ins.error.message : "")); break; }
    const rows = t.steps.map((s, i) => ({ procedure_id: ins.data.id, company_id: currentCompanyId, step_no: i + 1, title: s[0], responsible: s[1], from_department: d, to_department: s[2] ? (kindDept[s[2]] && kindDept[s[2]] !== d ? kindDept[s[2]] : "") : "", inputs: s[3], outputs: s[4], duration: s[5], related_docs:"" }));
    const si = await sb.from("procedure_steps").insert(rows);
    if(si.error){ alert("تعذّر حفظ خطوات إجراء: " + si.error.message); break; }
    made++;
  }
  logActivity("إنشاء", "إجراءات", "توليد من قوالب", `${made} إجراء`);
  await loadProcedures();
}

/* ── edit ── */
function procStepRowHTML(s, i, depts){
  const opt = v => `<option value=""${!v ? " selected" : ""}>—</option>` + depts.map(d => `<option${d === v ? " selected" : ""}>${orgEsc(d)}</option>`).join("") + (v && !depts.includes(v) ? `<option selected>${orgEsc(v)}</option>` : "");
  const inp = (k, v, w) => `<input class="fi" data-k="${k}" value="${orgEsc(v || "")}" style="margin:0;font-size:11.5px;padding:6px 8px;${w ? "width:" + w : ""}">`;
  return `<div class="proc-step" style="display:grid;grid-template-columns:28px 1.6fr 1fr 1fr 1fr 1.2fr 1.2fr 70px 28px;gap:6px;align-items:center;margin-bottom:6px">
    <span style="font-weight:800;color:var(--gray3);text-align:center" class="proc-no">${i + 1}</span>
    ${inp("title", s.title)}${inp("responsible", s.responsible)}
    <select class="fs" data-k="from_department" style="margin:0;font-size:11px;padding:6px">${opt(s.from_department)}</select>
    <select class="fs" data-k="to_department" style="margin:0;font-size:11px;padding:6px">${opt(s.to_department)}</select>
    ${inp("inputs", s.inputs)}${inp("outputs", s.outputs)}${inp("duration", s.duration)}
    <button type="button" class="btn-xs" style="color:var(--red);padding:2px 6px" onclick="this.closest('.proc-step').remove();procRenumber()">✕</button></div>`;
}
function procRenumber(){ document.querySelectorAll("#mproc-steps .proc-step .proc-no").forEach((e, i) => e.textContent = i + 1); }
function procStepsHead(){ return `<div style="display:grid;grid-template-columns:28px 1.6fr 1fr 1fr 1fr 1.2fr 1.2fr 70px 28px;gap:6px;font-size:10.5px;font-weight:800;color:var(--gray3);margin-bottom:4px"><span>#</span><span>الخطوة</span><span>المسؤول</span><span>من إدارة (يسلّم)</span><span>إلى إدارة (يستلم)</span><span>المدخلات</span><span>المخرجات</span><span>الزمن</span><span></span></div>`; }
function procAddStepRow(s){
  const box = document.getElementById("mproc-steps"); if(!box.querySelector(".proc-head")){ box.insertAdjacentHTML("afterbegin", `<div class="proc-head">${procStepsHead()}</div>`); }
  const dept = document.getElementById("mproc-dept").value;
  box.insertAdjacentHTML("beforeend", procStepRowHTML(s || { from_department: dept }, box.querySelectorAll(".proc-step").length, procState.depts));
}
function procCollectSteps(){
  return [...document.querySelectorAll("#mproc-steps .proc-step")].map((row, i) => {
    const o = { step_no: i + 1 }; row.querySelectorAll("[data-k]").forEach(e => { o[e.dataset.k] = e.value.trim(); }); return o;
  }).filter(o => o.title);
}
function openProcedure(id){
  const p = id ? procState.procs.find(x => x.id === id) : null;
  document.getElementById("mproc-id").value = id || "";
  document.getElementById("mproc-title").innerHTML = '<span class="ico-i ico-edit"></span>' + (p ? "تعديل إجراء" : "إجراء جديد");
  document.getElementById("mproc-name").value = p ? p.title : "";
  document.getElementById("mproc-purpose").value = p ? (p.purpose || "") : "";
  const sel = document.getElementById("mproc-dept");
  const deps = procState.depts.slice(); if(p && !deps.includes(p.department)) deps.push(p.department);
  sel.innerHTML = deps.map(d => `<option${p && p.department === d ? " selected" : ""}>${orgEsc(d)}</option>`).join("");
  const box = document.getElementById("mproc-steps"); box.innerHTML = "";
  (p ? (procState.steps[p.id] || []) : []).forEach(s => procAddStepRow(s));
  if(!p) procAddStepRow();
  document.getElementById("mproc-note").textContent = p && (p.status === "معتمد" || p.status === "قيد الاعتماد")
    ? "تنبيه: حفظ أي تعديل يعيد الإجراء إلى مسودة برقم نسخة جديد، ويلزم طلب اعتماده من جديد." : "";
  openM("m-procedure");
}
async function saveProcedure(){
  const id = document.getElementById("mproc-id").value ? Number(document.getElementById("mproc-id").value) : null;
  const title = document.getElementById("mproc-name").value.trim();
  const department = document.getElementById("mproc-dept").value;
  if(!title || !department){ alert("اسم الإجراء والإدارة المالكة مطلوبان."); return; }
  const steps = procCollectSteps(); if(!steps.length){ alert("أضف خطوة واحدة على الأقل."); return; }
  const based = { structure_hash: procState.sh, matrix_hash: procState.mh };
  let pid = id;
  if(id){
    const old = procState.procs.find(x => x.id === id);
    const changedAfterApproval = old && (old.status === "معتمد" || old.status === "قيد الاعتماد");
    const upd = { title, department, purpose: document.getElementById("mproc-purpose").value.trim(), status:"مسودة", based_on: based, updated_at: new Date().toISOString(), version: changedAfterApproval ? (old.version || 1) + 1 : (old.version || 1), approved_at: null };
    const r = await sb.from("procedures").update(upd).eq("id", id);
    if(r.error){ alert("تعذّر الحفظ: " + r.error.message); return; }
    await sb.from("procedure_steps").delete().eq("procedure_id", id);
  } else {
    const r = await sb.from("procedures").insert([{ company_id: currentCompanyId, department, title, purpose: document.getElementById("mproc-purpose").value.trim(), status:"مسودة", version:1, source:"يدوي", based_on: based, created_by: currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "" }]).select().single();
    if(r.error || !r.data){ alert("تعذّر الحفظ: " + (r.error ? r.error.message : "")); return; }
    pid = r.data.id;
  }
  const rows = steps.map((s, i) => ({ procedure_id: pid, company_id: currentCompanyId, step_no: i + 1, title: s.title, responsible: s.responsible || "", from_department: s.from_department || "", to_department: s.to_department || "", inputs: s.inputs || "", outputs: s.outputs || "", duration: s.duration || "", related_docs: "" }));
  const si = await sb.from("procedure_steps").insert(rows);
  if(si.error){ alert("تعذّر حفظ الخطوات: " + si.error.message); return; }
  logActivity(id ? "تعديل" : "إنشاء", "إجراء", title, department);
  closeM("m-procedure"); await loadProcedures();
}
async function procDelete(id){
  const p = procState.procs.find(x => x.id === id); if(!p) return;
  if(!await uiConfirm(`حذف الإجراء "${p.title}" نهائيًا؟`)) return;
  const r = await sb.from("procedures").delete().eq("id", id);
  if(r.error){ alert("تعذّر الحذف: " + r.error.message); return; }
  logActivity("حذف", "إجراء", p.title, p.department); await loadProcedures();
}

/* ── AI improvement (names never leave the platform: only the department name, procedure name and step text) ── */
async function procImproveAI(){
  const title = document.getElementById("mproc-name").value.trim(), department = document.getElementById("mproc-dept").value;
  const steps = procCollectSteps(); if(!title){ alert("اكتب اسم الإجراء أولًا."); return; }
  if(!await uiConfirm("سيُرسل اسم الإجراء واسم الإدارة ونص الخطوات الحالية فقط (دون أي أسماء أشخاص) إلى خدمة ذكاء اصطناعي لتحسينها، وسيستبدل الاقتراح الخطوات الحالية في الشاشة. متابعة؟")) return;
  const btn = document.getElementById("mproc-ai-btn"), old = btn.textContent; btn.disabled = true; btn.textContent = "جارٍ التحسين…";
  try{
    const { data: sd } = await sb.auth.getSession(); const token = sd?.session?.access_token;
    if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخولك من جديد."); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/improve-procedure`, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
      body: JSON.stringify({ company_id: currentCompanyId, department, title, departments: procState.depts, steps: steps.map(s => ({ title:s.title, responsible:s.responsible, from_department:s.from_department, to_department:s.to_department, inputs:s.inputs, outputs:s.outputs, duration:s.duration })) }) });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ alert(data.error || "تعذّر التحسين الآن. أكمل التعديل يدويًا."); return; }
    const box = document.getElementById("mproc-steps"); box.innerHTML = "";
    (data.steps || []).forEach(s => procAddStepRow(Object.assign({ from_department: department }, s)));
    document.getElementById("mproc-note").textContent = "⚠️ الخطوات معدّلة آليًا بالذكاء الاصطناعي ولم تُراجَع بعد. راجعها قبل الحفظ.";
  }catch(e){ alert("تعذّر الاتصال بالخدمة: " + e.message); }
  finally{ btn.disabled = false; btn.textContent = old; }
}

/* ── approval chain: department manager → governance manager → CEO ── */
function procBuildChain(dept){
  const org = procState.org, holder = r => (r && r.holder_name) ? r.holder_name : "";
  const d = org.find(r => r.position_title === dept);
  const gov = org.find(r => !r.is_body && /الحوكمة|الامتثال/.test(r.position_title || ""));
  const ceo = org.find(r => !r.is_body && r.level === 4);
  return [
    { label: "مدير الإدارة المعنية — " + dept, person: holder(d) },
    { label: "مدير الحوكمة" + (gov ? " — " + gov.position_title : ""), person: holder(gov) },
    { label: "المدير العام / الرئيس التنفيذي", person: holder(ceo) }
  ].map(s => Object.assign(s, { signed_by: null, signed_at: null }));
}
function procNorm(s){ return String(s || "").replace(/\s+/g, " ").trim(); }
function procCanSign(step){
  const me = currentUserProfile ? procNorm(currentUserProfile.full_name) : "";
  const isOver = getCurrentRole() === "مدير النظام"; // also covers مالك / ممثل المالك
  return isOver || (!!step.person && me && procNorm(step.person) === me);
}
async function procOpenApproval(id){
  const p = procState.procs.find(x => x.id === id); if(!p) return;
  if(p.status === "تحتاج مراجعة"){ alert("تغيّر الهيكل أو المصفوفة بعد بناء هذا الإجراء. افتحه من \"تعديل / عرض\" وراجعه واحفظه أولًا."); return; }
  if(p.status === "مسودة"){
    const g = await procGatesCheck(); if(!g.all){ alert("لا يمكن طلب الاعتماد قبل اكتمال اعتماد الهيكل والمصفوفة والسياسات."); return; }
    if(!(procState.steps[id] || []).length){ alert("أضف خطوات للإجراء أولًا."); return; }
    if(!await uiConfirm("سيبدأ مسار اعتماد بالتسلسل: مدير الإدارة المعنية ثم مدير الحوكمة ثم المدير العام. متابعة؟")) return;
    const chain = procBuildChain(p.department);
    const r = await sb.from("procedures").update({ status:"قيد الاعتماد", based_on: Object.assign({}, p.based_on || {}, { chain }), updated_at:new Date().toISOString() }).eq("id", id);
    if(r.error){ alert("تعذّر بدء الاعتماد: " + r.error.message); return; }
    logActivity("اعتماد", "إجراء", p.title, "بدء مسار الاعتماد"); await loadProcedures();
    return procOpenApproval(id);
  }
  const chain = (p.based_on && p.based_on.chain) || [];
  const next = chain.findIndex(s => !s.signed_at);
  const rows = chain.map((s, i) => {
    const done = !!s.signed_at, cur = i === next;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:${cur ? "#FEF3E2" : "var(--offwhite)"};border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:12.5px">
      <div><b>${i + 1}. ${orgEsc(s.label)}</b><div style="font-size:11px;color:var(--gray3)">${s.person ? "المسؤول: " + orgEsc(s.person) : "لم يُحدَّد اسم صاحب المنصب بالهيكل — يعتمد مدير النظام / المالك نيابةً"}</div></div>
      <div>${done ? `<span style="color:var(--green);font-weight:800">✅ ${orgEsc(s.signed_by)} — ${procFmt(s.signed_at)}</span>`
        : (cur && p.status === "قيد الاعتماد" ? (procCanSign(s) ? `<button class="btn-xs primary" onclick="procSign(${id},${i})">اعتماد</button> <button class="btn-xs" style="color:var(--red)" onclick="procReject(${id})">إعادة للتعديل</button>` : '<span style="color:var(--gold)">⏳ دوره الآن</span>') : '<span style="color:var(--gray3)">بانتظار الدور</span>')}</div></div>`; }).join("");
  const last = p.based_on && p.based_on.last_rejection ? `<div style="font-size:11.5px;color:var(--red);margin-top:8px">آخر إعادة للتعديل: ${orgEsc(p.based_on.last_rejection.by)} — ${orgEsc(p.based_on.last_rejection.reason)}</div>` : "";
  const m = document.getElementById("m-proc-approval");
  document.getElementById("mpa-body").innerHTML = `<div style="font-weight:800;margin-bottom:8px">${orgEsc(p.title)} — <span style="color:var(--gray3)">${orgEsc(p.department)}</span></div>
    <div style="font-size:11.5px;margin-bottom:10px">الحالة: <b>${orgEsc(p.status)}</b> · النسخة ${p.version}.0</div>${rows}${last}`;
  openM("m-proc-approval");
}
async function procSign(id, i){
  const p = procState.procs.find(x => x.id === id); if(!p) return;
  const chain = JSON.parse(JSON.stringify((p.based_on && p.based_on.chain) || []));
  if(!chain[i] || chain[i].signed_at || chain.findIndex(s => !s.signed_at) !== i){ alert("ليس هذا دور الاعتماد الآن."); return; }
  if(!procCanSign(chain[i])){ alert("هذه الخطوة لصاحب المنصب المحدد فقط."); return; }
  if(!await uiConfirm("تأكيد اعتمادك لهذا الإجراء بصفتك: " + chain[i].label + "؟")) return;
  chain[i].signed_by = currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "—"; chain[i].signed_at = new Date().toISOString();
  const done = chain.every(s => s.signed_at);
  const upd = { based_on: Object.assign({}, p.based_on, { chain }), updated_at: new Date().toISOString() };
  if(done){ upd.status = "معتمد"; upd.approved_at = new Date().toISOString(); }
  const r = await sb.from("procedures").update(upd).eq("id", id);
  if(r.error){ alert("تعذّر الحفظ: " + r.error.message); return; }
  logActivity("اعتماد", "إجراء", p.title, done ? "اكتمل الاعتماد" : "اعتماد: " + chain[i].label);
  await loadProcedures(); procOpenApproval(id);
}
async function procReject(id){
  const reason = await uiPrompt("سبب إعادة الإجراء للتعديل:"); if(reason === null) return;
  const p = procState.procs.find(x => x.id === id); if(!p) return;
  const r = await sb.from("procedures").update({ status:"مسودة", approved_at:null, based_on: Object.assign({}, p.based_on, { chain: [], last_rejection: { by: currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "—", reason: reason.trim() || "—", at: new Date().toISOString() } }), updated_at:new Date().toISOString() }).eq("id", id);
  if(r.error){ alert("تعذّر التنفيذ: " + r.error.message); return; }
  closeM("m-proc-approval"); await loadProcedures();
}

/* ── interdepartmental map ── */
function procEdges(){
  const e = {};
  procState.procs.forEach(p => (procState.steps[p.id] || []).forEach(s => { if(s.from_department && s.to_department && s.from_department !== s.to_department){ const k = s.from_department + "→" + s.to_department; (e[k] = e[k] || { from:s.from_department, to:s.to_department, n:0, procs:new Set() }).n++; e[k].procs.add(p.title); } }));
  return Object.values(e);
}
function procMapHTML(){
  const edges = procEdges();
  if(!edges.length) return '<div style="text-align:center;color:var(--gray3);font-size:12.5px;padding:26px">لا توجد روابط بين الإدارات بعد. تظهر الخريطة عندما تحدد في الخطوات "من إدارة" و"إلى إدارة".</div>';
  const nodes = [...new Set(edges.flatMap(e => [e.from, e.to]))];
  const W = 760, H = 520, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
  const pos = {}; nodes.forEach((n, i) => { const a = (2 * Math.PI * i / nodes.length) - Math.PI / 2; pos[n] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  const lines = edges.map(e => { const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to]; const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
    const sx = x1 + ux * 44, sy = y1 + uy * 20, ex = x2 - ux * 48, ey = y2 - uy * 24; const mx = (sx + ex) / 2 - uy * 14, my = (sy + ey) / 2 + ux * 14;
    return `<path d="M${sx},${sy} Q${mx},${my} ${ex},${ey}" fill="none" stroke="#9C7A2E" stroke-width="${Math.min(4, 1 + e.n * .6)}" marker-end="url(#procArrow)" opacity=".75"><title>${orgEsc(e.from)} ← ${orgEsc(e.to)} (${e.n})</title></path>`; }).join("");
  const boxes = nodes.map(n => { const [x, y] = pos[n]; const k = procKindOf(n); return `<g><rect x="${x - 46}" y="${y - 20}" width="92" height="40" rx="8" fill="#0F2138"/><text x="${x}" y="${y + 4}" fill="#fff" font-size="10.5" font-weight="700" text-anchor="middle" font-family="Tajawal,Arial">${orgEsc(n.length > 18 ? n.slice(0, 17) + "…" : n)}</text></g>`; }).join("");
  const rows = edges.sort((a, b) => b.n - a.n).map(e => `<tr><td>${orgEsc(e.from)}</td><td style="text-align:center">←</td><td>${orgEsc(e.to)}</td><td style="text-align:center">${e.n}</td><td style="font-size:11px;color:var(--gray3)">${orgEsc([...e.procs].join("، "))}</td></tr>`).join("");
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:560px;max-width:${W}px;display:block;margin:0 auto"><defs><marker id="procArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9C7A2E"/></marker></defs>${lines}${boxes}</svg></div>
    <div style="font-size:11.5px;color:var(--gray3);margin:6px 0 10px;text-align:center">السهم يخرج من الإدارة المسلِّمة إلى الإدارة المستلمة، وسُمكه يعكس عدد الخطوات المشتركة.</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>تسلّم</th><th></th><th>إلى</th><th>عدد الخطوات</th><th>الإجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ── PDF ── */
async function procCompanyName(){
  try{ const { data } = await sb.from("companies").select("name").eq("id", currentCompanyId).single(); if(data && typeof data.name === "string" && data.name) return data.name; }catch(e){}
  return (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
}
function procPdfHTML(p, company){
  const steps = procState.steps[p.id] || [], chain = (p.based_on && p.based_on.chain) || [];
  const ok = p.status === "معتمد"; const col = ok ? "#1B7F4B" : "#9C7A2E";
  const th = "border:1px solid #cfd6e0;padding:6px 7px;background:#1A3A6B;color:#fff;font-size:11px;text-align:right", td = "border:1px solid #cfd6e0;padding:6px 7px;font-size:11px;text-align:right;vertical-align:top";
  return `<div style="page-break-after:always;padding-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:12px">
      <div><div style="font-size:19px;font-weight:800;color:#1A3A6B">${orgEsc(p.title)}</div><div style="font-size:12px;color:#5b6678">${orgEsc(company)} — ${orgEsc(p.department)}</div></div>
      <div style="font-size:12px;color:#5b6678;line-height:1.8"><div><b style="color:${col}">الحالة: ${ok ? "معتمد" : orgEsc(p.status === "قيد الاعتماد" ? "قيد الاعتماد" : "مسودة (غير معتمدة)")}</b></div><div>رقم النسخة: ${p.version}.0</div>
      <div>${ok ? "تاريخ الاعتماد: " + procFmt(p.approved_at) : "تاريخ التصدير: " + procFmt(new Date())}</div>${ok && chain.length ? `<div>اعتمده: ${chain.map(c => orgEsc(c.signed_by || "")).filter(Boolean).join("، ")}</div>` : ""}</div></div>
    ${p.purpose ? `<div style="font-size:12px;margin-bottom:10px"><b>الغرض:</b> ${orgEsc(p.purpose)}</div>` : ""}
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th};width:26px">#</th><th style="${th}">الخطوة</th><th style="${th}">المسؤول</th><th style="${th}">يسلّم</th><th style="${th}">يستلم</th><th style="${th}">المدخلات</th><th style="${th}">المخرجات</th><th style="${th}">الزمن</th></tr></thead>
    <tbody>${steps.map((s, i) => `<tr style="page-break-inside:avoid"><td style="${td}">${i + 1}</td><td style="${td};font-weight:700">${orgEsc(s.title)}</td><td style="${td}">${orgEsc(s.responsible)}</td><td style="${td}">${orgEsc(s.from_department)}</td><td style="${td}">${orgEsc(s.to_department)}</td><td style="${td}">${orgEsc(s.inputs)}</td><td style="${td}">${orgEsc(s.outputs)}</td><td style="${td}">${orgEsc(s.duration)}</td></tr>`).join("")}</tbody></table></div>`;
}
async function procRunPDF(list, filename){
  if(typeof html2pdf === "undefined"){ alert("تعذّر تحميل أداة إنشاء PDF — تحقق من الاتصال بالإنترنت ثم أعد المحاولة."); return; }
  if(!list.length){ alert("لا توجد إجراءات لتصديرها."); return; }
  const company = await procCompanyName();
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "width:1040px;direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;color:#0D2447;background:#fff";
  wrapper.innerHTML = list.map(p => procPdfHTML(p, company)).join("");
  const holder = document.createElement("div"); holder.style.cssText = "position:absolute;top:0;left:-20000px;width:1040px;pointer-events:none";
  holder.appendChild(wrapper); document.body.appendChild(holder);
  try{
    await html2pdf().from(wrapper).set({ margin:10, filename: (filename + ".pdf").replace(/[\\/:*?"<>|]/g, "-"), image:{ type:"jpeg", quality:.98 }, html2canvas:{ scale:2, useCORS:true, backgroundColor:"#ffffff", scrollX:0, scrollY:0 }, jsPDF:{ unit:"mm", format:"a4", orientation:"landscape" }, pagebreak:{ mode:["css","legacy"], avoid:["tr"] } }).save();
  }catch(e){ alert("تعذّر توليد ملف PDF: " + (e && e.message ? e.message : e)); }
  finally{ if(holder.parentNode) holder.parentNode.removeChild(holder); }
}
function procExportPDF(id){ const p = procState.procs.find(x => x.id === id); if(p) procRunPDF([p], "إجراء-" + p.title); }
function procExportAllPDF(){ procRunPDF(procState.procs, "إجراءات-العمل"); }
async function procPrint(id){
  const list = id ? procState.procs.filter(x => x.id === id) : procState.procs;
  if(!list.length){ alert("لا توجد إجراءات للطباعة."); return; }
  const company = await procCompanyName();
  printDocument(id ? list[0].title : "إجراءات العمل", list.map(p => procPdfHTML(p, company)).join(""), true);
}

/* ══════════ POLICY COMMENTS ══════════ */
let polState = { pid:null, comments:[], versions:[] };
function polMyRole(){ return (typeof getRawRole === "function" ? getRawRole() : "") || getCurrentRole() || ""; }
function polMyName(){ return currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email || "—") : "—"; }
function polIsGov(){ const r = polMyRole(); return getCurrentRole() === "مدير النظام" || /حوكمة|الحوكمة/.test(r); }
function polDur(ms){
  if(!(ms >= 0)) return "—";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if(d >= 1) return d + " يوم" + (h % 24 ? " و" + (h % 24) + " ساعة" : "");
  if(h >= 1) return h + " ساعة" + (m % 60 ? " و" + (m % 60) + " دقيقة" : "");
  return Math.max(m, 1) + " دقيقة";
}
function polCurVersion(versions, policy){ return versions.length ? Math.max(...versions.map(v => v.version_no)) : (policy && policy.file_url ? 1 : 1); }
async function polOpenCount(pid){
  try{ const r = await sb.from("policy_comments").select("id", { count:"exact", head:true }).eq("policy_id", pid).eq("status","مفتوحة"); return r.count || 0; }catch(e){ return 0; }
}
async function polBlockIfOpen(pid){
  const n = await polOpenCount(pid);
  if(n > 0){ alert(`لا يمكن المتابعة: توجد ${n} ملاحظة مفتوحة على هذه السياسة.\nأغلقها بالمعالجة (بعد رفع نسخة معدّلة) أو بالرفض مع كتابة السبب، ثم أعد المحاولة.`); return true; }
  return false;
}
async function polLoadBadges(list){
  try{
    const r = await sb.from("policy_comments").select("policy_id").eq("company_id", currentCompanyId).eq("status","مفتوحة");
    const c = {}; (Array.isArray(r.data) ? r.data : []).forEach(x => { c[x.policy_id] = (c[x.policy_id] || 0) + 1; });
    let total = 0;
    list.forEach(p => { const el = document.getElementById("polcom-n-" + p.id); const n = c[p.id] || 0; total += n; if(el){ el.textContent = n ? "(" + n + " مفتوحة)" : ""; el.style.color = n ? "var(--red)" : ""; } });
  }catch(e){}
}
async function polRegisterVersion(policyId, newUrl, prevUrl){
  const ex = await sb.from("policy_file_versions").select("version_no").eq("policy_id", policyId);
  let max = Array.isArray(ex.data) && ex.data.length ? Math.max(...ex.data.map(x => x.version_no)) : 0;
  const by = polMyName(), role = polMyRole();
  if(max === 0 && prevUrl){ await sb.from("policy_file_versions").insert([{ company_id: currentCompanyId, policy_id: policyId, version_no: 1, file_url: prevUrl, uploaded_by: "—", uploaded_role: "" }]); max = 1; }
  await sb.from("policy_file_versions").insert([{ company_id: currentCompanyId, policy_id: policyId, version_no: max + 1, file_url: newUrl, uploaded_by: by, uploaded_role: role }]);
  try{
    const oc = await sb.from("policy_comments").select("author_email").eq("policy_id", policyId).eq("status", "مفتوحة");
    const pn = (policiesCache.find(x => x.id === policyId) || {}).policy_name || "";
    polNotify(new Set((Array.isArray(oc.data) ? oc.data : []).map(x => x.author_email).filter(Boolean)), "نسخة معدّلة من سياسة: " + pn,
      ["رُفعت النسخة " + (max + 1) + " بواسطة <b>" + orgEsc(by) + "</b> (" + orgEsc(role) + ").", "لديك ملاحظات مفتوحة على هذه السياسة، سيراجعها موظف الحوكمة ويغلقها."]);
  }catch(e){}
}
/* ── email notifications for policy comments (failures never block saving) ── */
async function polGovRecipients(){
  const set = new Set();
  try{ const a = await sb.from("user_profiles").select("email").eq("is_platform_admin", true); (Array.isArray(a.data) ? a.data : []).forEach(x => x.email && set.add(x.email.toLowerCase())); }catch(e){}
  try{ const g = await sb.from("user_company_memberships").select("email").eq("company_id", currentCompanyId).ilike("role", "%حوكمة%"); (Array.isArray(g.data) ? g.data : []).forEach(x => x.email && set.add(x.email.toLowerCase())); }catch(e){}
  return set;
}
async function polNotify(recipients, subject, lines){
  try{
    const me = (currentUserProfile && currentUserProfile.email ? currentUserProfile.email : "").toLowerCase();
    const to = [...recipients].filter(e => e && e.toLowerCase() !== me);
    if(!to.length) return;
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.9;color:#0D2447"><h3 style="color:#1A3A6B;margin:0 0 8px">${orgEsc(subject)}</h3>${lines.filter(Boolean).map(l => `<div>${l}</div>`).join("")}<hr style="border:none;border-top:1px solid #e3e8ef;margin:14px 0"><div style="font-size:12px;color:#5b6678">رسالة آلية من منصة حوكم.</div></div>`;
    for(const t of to){ await sendNotificationEmail(t, subject, html); }
  }catch(e){}
}
async function openPolComments(pid){
  polState.pid = pid; openM("m-polcom");
  document.getElementById("polcom-gov").style.display = polIsGov() ? "block" : "none";
  await polRefresh();
}
async function polRefresh(){
  try{ await polRefreshInner(); }
  catch(e){ const l = document.getElementById("polcom-list"); if(l) l.innerHTML = '<div style="color:var(--red);font-size:12px;padding:14px">تعذّر تحميل الملاحظات الآن، أعد المحاولة.</div>'; }
}
async function polRefreshInner(){
  const pid = polState.pid, p = policiesCache.find(x => x.id === pid) || {};
  document.getElementById("polcom-title").textContent = "ملاحظات: " + (p.policy_name || "");
  const [c, v] = await Promise.all([
    sb.from("policy_comments").select("*").eq("policy_id", pid).order("created_at",{ascending:false}),
    sb.from("policy_file_versions").select("*").eq("policy_id", pid).order("version_no",{ascending:true})
  ]);
  if(c.error){ document.getElementById("polcom-list").innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${orgEsc(c.error.message)}</div>`; return; }
  polState.comments = Array.isArray(c.data) ? c.data : []; polState.versions = Array.isArray(v.data) ? v.data : [];
  const cur = polCurVersion(polState.versions, p), list = polState.comments;
  const open = list.filter(x => x.status === "مفتوحة");
  const done = list.filter(x => x.status === "تمت المعالجة" && x.resolved_at);
  const avg = done.length ? done.reduce((s, x) => s + (new Date(x.resolved_at) - new Date(x.created_at)), 0) / done.length : null;
  const hot = {}; list.forEach(x => { const k = x.clause_no || (x.page_no ? "صفحة " + x.page_no : ""); if(k) hot[k] = (hot[k] || 0) + 1; });
  const top = Object.entries(hot).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 1).slice(0, 3).map(e => `${orgEsc(e[0])} (${e[1]})`).join("، ");
  document.getElementById("polcom-stats").innerHTML = `النسخة الحالية: <b>${cur}</b> · مفتوحة: <b style="color:${open.length ? "var(--red)" : "var(--green)"}">${open.length}</b> · معالجة: <b>${done.length}</b>${avg != null ? " · متوسط زمن المعالجة: <b>" + polDur(avg) + "</b>" : ""}${top ? "<br>أكثر المواضع تكرارًا في الملاحظات: " + top : ""}`;
  document.getElementById("polcom-versions").innerHTML = polState.versions.length ? "النسخ: " + polState.versions.map(x => `<a href="${orgEsc(x.file_url)}" target="_blank" rel="noopener">النسخة ${x.version_no}</a> (${procFmt(x.uploaded_at)}${x.uploaded_by && x.uploaded_by !== "—" ? " — " + orgEsc(x.uploaded_by) : ""})`).join(" · ") : "لا توجد نسخ مسجّلة بعد؛ يُعدّ الملف الحالي النسخة 1.";
  const now = Date.now(), gov = polIsGov();
  const ST = { "مفتوحة":["#FEF3E2","#9C7A2E"], "تمت المعالجة":["#E8F8EF","#1B7F4B"], "مرفوضة":["#FDE8E8","#C0392B"] };
  document.getElementById("polcom-list").innerHTML = list.length ? list.map(x => {
    const st = ST[x.status] || ST["مفتوحة"];
    let timing = "";
    if(x.status === "مفتوحة") timing = `مفتوحة منذ <b>${polDur(now - new Date(x.created_at))}</b>`;
    else if(x.resolved_at) timing = `${x.status === "تمت المعالجة" ? "عولجت" : "رُفضت"} بعد <b>${polDur(new Date(x.resolved_at) - new Date(x.created_at))}</b>${x.resolved_in_version ? " في النسخة " + x.resolved_in_version : ""} — ${orgEsc(x.resolved_by || "")}${x.resolved_role ? " (" + orgEsc(x.resolved_role) + ")" : ""}`;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11.5px">
        <div><span style="background:${st[0]};color:${st[1]};border-radius:10px;padding:1px 10px;font-weight:800">${orgEsc(x.status)}</span>
        <span style="background:#EEF1F5;border-radius:10px;padding:1px 10px;margin-inline-start:4px">${orgEsc(x.category)}</span>
        ${x.page_no ? ` · صفحة ${orgEsc(x.page_no)}` : ""}${x.clause_no ? ` · ${orgEsc(x.clause_no)}` : ""} · على النسخة ${x.file_version_no}</div>
        <div style="color:var(--gray3)">${orgEsc(x.author_name || "—")}${x.author_role ? " — <b>" + orgEsc(x.author_role) + "</b>" : ""} · ${procFmt(x.created_at)}</div></div>
      <div style="font-size:12.5px;margin:6px 0;white-space:pre-wrap">${orgEsc(x.body)}</div>
      ${x.suggested_text ? `<div style="background:var(--offwhite);border-radius:8px;padding:6px 10px;font-size:12px"><b>الصياغة المقترحة:</b> <span id="polsug-${x.id}">${orgEsc(x.suggested_text)}</span> <button class="btn-xs" onclick="polCopy(${x.id})">نسخ</button></div>` : ""}
      <div style="font-size:11px;color:var(--gray3);margin-top:6px">${timing}</div>
      ${x.resolution_note ? `<div style="font-size:11.5px;margin-top:4px"><b>ملاحظة المعالجة:</b> ${orgEsc(x.resolution_note)}</div>` : ""}
      ${x.status === "مفتوحة" && gov ? `<div style="margin-top:8px;display:flex;gap:6px"><button class="btn-xs primary" onclick="polResolve(${x.id})">تمت المعالجة</button><button class="btn-xs" style="color:var(--red)" onclick="polRejectC(${x.id})">رفض مع السبب</button></div>` : ""}
    </div>`; }).join("") : '<div style="text-align:center;color:var(--gray3);font-size:12.5px;padding:18px">لا توجد ملاحظات على هذه السياسة.</div>';
}
function polCopy(id){ const el = document.getElementById("polsug-" + id); if(el && navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(() => alert("تم النسخ")); }
async function polAddComment(){
  const body = document.getElementById("polcom-body").value.trim();
  if(!body){ alert("اكتب نص الملاحظة."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const { data: u } = await sb.auth.getUser();
  const r = await sb.from("policy_comments").insert([{ company_id: currentCompanyId, policy_id: polState.pid, file_version_no: polCurVersion(polState.versions, p),
    page_no: document.getElementById("polcom-page").value.trim() || null, clause_no: document.getElementById("polcom-clause").value.trim() || null,
    category: document.getElementById("polcom-cat").value, body, suggested_text: document.getElementById("polcom-sugg").value.trim() || null,
    author_name: polMyName(), author_email: u && u.user ? u.user.email : null, author_role: polMyRole() }]);
  if(r.error){ alert("تعذّر الحفظ: " + r.error.message); return; }
  const nPage = document.getElementById("polcom-page").value.trim(), nClause = document.getElementById("polcom-clause").value.trim(), nCat = document.getElementById("polcom-cat").value;
  ["page","clause","body","sugg"].forEach(k => { document.getElementById("polcom-" + k).value = ""; });
  logActivity("إنشاء", "ملاحظة سياسة", p.policy_name || "", nCat);
  polNotify(await polGovRecipients(), "ملاحظة جديدة على سياسة: " + (p.policy_name || ""), [
    "كاتب الملاحظة: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ")",
    "التصنيف: " + orgEsc(nCat) + (nPage ? " — صفحة " + orgEsc(nPage) : "") + (nClause ? " — " + orgEsc(nClause) : ""),
    "<b>الملاحظة:</b> " + orgEsc(body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
async function polUploadVersion(){
  if(!polIsGov()){ alert("رفع النسخ لموظف الحوكمة أو مدير النظام."); return; }
  const inp = document.getElementById("polcom-file"); if(!inp.files || !inp.files[0]){ alert("اختر ملف PDF أولًا."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const url = await uploadFile(inp, "policies"); if(!url) return;
  const up = await sb.from("policies").update({ file_url: url }).eq("id", polState.pid);
  if(up.error){ alert("تعذّر تحديث الملف: " + up.error.message); return; }
  await polRegisterVersion(polState.pid, url, p.file_url); p.file_url = url; inp.value = "";
  await polRefresh();
}
async function polResolve(id){
  const c = polState.comments.find(x => x.id === id); if(!c) return;
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const cur = polCurVersion(polState.versions, p);
  if(cur <= c.file_version_no){ alert("لا يمكن اعتبارها معالجة قبل رفع نسخة معدّلة من الملف.\nارفع النسخة الجديدة أعلاه ثم أعد المحاولة."); return; }
  const note = await uiPrompt("ملاحظة المعالجة (اختياري):"); if(note === null) return;
  const v = polState.versions.find(x => x.version_no === cur);
  const r = await sb.from("policy_comments").update({ status:"تمت المعالجة", resolution_note: note.trim() || null, resolved_in_version: cur, resolved_by: polMyName(), resolved_role: polMyRole(), resolved_at: v ? v.uploaded_at : new Date().toISOString() }).eq("id", id);
  if(r.error){ alert("تعذّر التنفيذ: " + r.error.message); return; }
  polNotify([c.author_email], "تمت معالجة ملاحظتك على سياسة: " + (p.policy_name || ""), ["عالجها: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ") في النسخة " + cur + " بعد " + polDur((v ? new Date(v.uploaded_at) : new Date()) - new Date(c.created_at)), note.trim() ? "ملاحظة المعالجة: " + orgEsc(note.trim()) : "", "ملاحظتك: " + orgEsc(c.body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
async function polRejectC(id){
  const reason = await uiPrompt("سبب رفض الملاحظة (مطلوب):"); if(reason === null) return;
  if(!reason.trim()){ alert("السبب مطلوب."); return; }
  const r = await sb.from("policy_comments").update({ status:"مرفوضة", resolution_note: reason.trim(), resolved_by: polMyName(), resolved_role: polMyRole(), resolved_at: new Date().toISOString() }).eq("id", id);
  if(r.error){ alert("تعذّر التنفيذ: " + r.error.message); return; }
  const cc = polState.comments.find(x => x.id === id), pp = policiesCache.find(x => x.id === polState.pid) || {};
  if(cc) polNotify([cc.author_email], "رُفضت ملاحظتك على سياسة: " + (pp.policy_name || ""), ["رفضها: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ")", "السبب: " + orgEsc(reason.trim()), "ملاحظتك: " + orgEsc(cc.body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
function polLogHTML(p, company, list){
  const td = "border:1px solid #cfd6e0;padding:5px 6px;font-size:10.5px;text-align:right;vertical-align:top", th = td + ";background:#1A3A6B;color:#fff";
  return `<div style="border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:10px"><div style="font-size:17px;font-weight:800;color:#1A3A6B">سجل ملاحظات: ${orgEsc(p.policy_name)}</div><div style="font-size:11.5px;color:#5b6678">${orgEsc(company)} · النسخة الحالية ${polCurVersion(polState.versions, p)} · تاريخ التصدير ${procFmt(new Date())}</div></div>
   <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">#</th><th style="${th}">الموضع</th><th style="${th}">الملاحظة</th><th style="${th}">صاحبها / دوره</th><th style="${th}">الحالة والمعالجة</th><th style="${th}">الزمن</th></tr></thead><tbody>
   ${list.map((x, i) => `<tr style="page-break-inside:avoid"><td style="${td}">${i + 1}</td><td style="${td}">${orgEsc([x.page_no && "ص " + x.page_no, x.clause_no].filter(Boolean).join(" / ") || "—")}<br>${orgEsc(x.category)}</td><td style="${td}">${orgEsc(x.body)}${x.suggested_text ? "<br><b>مقترح:</b> " + orgEsc(x.suggested_text) : ""}</td><td style="${td}">${orgEsc(x.author_name || "—")}<br>${orgEsc(x.author_role || "")}<br>${procFmt(x.created_at)}</td><td style="${td}">${orgEsc(x.status)}${x.resolved_by ? "<br>" + orgEsc(x.resolved_by) + (x.resolved_role ? " (" + orgEsc(x.resolved_role) + ")" : "") : ""}${x.resolution_note ? "<br>" + orgEsc(x.resolution_note) : ""}</td><td style="${td}">${x.resolved_at ? polDur(new Date(x.resolved_at) - new Date(x.created_at)) : "مفتوحة منذ " + polDur(Date.now() - new Date(x.created_at))}</td></tr>`).join("")}</tbody></table>`;
}
async function polPrint(){
  const p = policiesCache.find(x => x.id === polState.pid) || {}, list = polState.comments.slice().reverse();
  if(!list.length){ alert("لا توجد ملاحظات."); return; }
  printDocument("ملاحظات-" + (p.policy_name || "سياسة"), polLogHTML(p, await procCompanyName(), list), false);
}
async function polExportPDF(){
  if(typeof html2pdf === "undefined"){ alert("تعذّر تحميل أداة PDF — تحقق من الاتصال."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {}, list = polState.comments.slice().reverse();
  if(!list.length){ alert("لا توجد ملاحظات."); return; }
  const company = await procCompanyName();
  const w = document.createElement("div"); w.style.cssText = "width:720px;direction:rtl;font-family:Tajawal,Arial,sans-serif;color:#0D2447;background:#fff";
  w.innerHTML = polLogHTML(p, company, list);
  const holder = document.createElement("div"); holder.style.cssText = "position:absolute;top:0;left:-20000px;width:720px;pointer-events:none"; holder.appendChild(w); document.body.appendChild(holder);
  try{ await html2pdf().from(w).set({ margin:10, filename:("ملاحظات-" + (p.policy_name || "سياسة") + ".pdf").replace(/[\\/:*?"<>|]/g, "-"), image:{type:"jpeg",quality:.98}, html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff",scrollX:0,scrollY:0}, jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}, pagebreak:{mode:["css","legacy"],avoid:["tr"]} }).save(); }
  catch(e){ alert("تعذّر إنشاء PDF: " + (e && e.message ? e.message : e)); }
  finally{ if(holder.parentNode) holder.parentNode.removeChild(holder); }
}

/* Print/PDF windows are opened from this page, so they share its origin: anything unescaped that reaches
   document.write could run with the user's session. printSafe strips scripts (except our own print trigger)
   and inline event handlers from whatever is written — a second line of defence beside escaping. */
function printSafe(html){
  return String(html == null ? "" : html)
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => /^\s*window\.onload=function\(\)\{setTimeout\(function\(\)\{window\.print\(\)\}/.test(body) ? m : "")
    .replace(/<(iframe|object|embed|link)\b[^>]*>/gi, "")
    .replace(/(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}
function openPrintWindow(){
  const w = window.open("", "_blank"); if(!w) return null;
  try{
    const d = w.document, ow = d.write.bind(d);
    // A visible "save as PDF / print" button (hidden when printing) — on phones the automatic print prompt is often blocked.
    const banner = '<style>@media print{.np-bar{display:none!important}}</style><div class="np-bar" style="position:sticky;top:0;z-index:9;background:#0D2447;padding:8px 12px;text-align:center;direction:rtl"><button onclick="window.print()" style="background:#D4AF37;color:#0D2447;border:none;border-radius:8px;padding:9px 22px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">حفظ كملف PDF / طباعة</button></div>';
    d.write = html => ow(printSafe(html).replace(/(<body[^>]*>)/i, "$1" + banner));
  }catch(e){}
  return w;
}
/* Text-based (searchable, light) PDF path: opens a clean print view; "Save as PDF" in the print dialog gives a vector file. */
function printDocument(title, innerHtml, landscape){
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة."); return; }
  w.document.open();
  w.document.write('<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + orgEsc(title) + '</title><style>@page{size:A4 ' + (landscape ? "landscape" : "portrait") + ';margin:10mm}body{font-family:Tajawal,Arial,sans-serif;color:#0D2447;margin:0;padding:12px}table{border-collapse:collapse;width:100%}tr{page-break-inside:avoid}</style></head><body>' + innerHtml + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
  w.document.close();
}
/* Off-screen host for html2pdf sources: fixed A4 width so the PDF looks the same on phones and desktops,
   and nothing flashes on the visible page while it renders. */
function pdfHostAdd(el, widthPx){
  const h = document.createElement("div"); h.setAttribute("data-pdf-host","1");
  h.style.cssText = "position:absolute;top:0;left:-20000px;width:" + widthPx + "px;pointer-events:none";
  el.style.width = widthPx + "px"; h.appendChild(el); document.body.appendChild(h);
}
function pdfHostRemove(el){ const h = el && el.parentNode; if(h && h.getAttribute && h.getAttribute("data-pdf-host") && h.parentNode) h.parentNode.removeChild(h); else if(el && el.parentNode) el.parentNode.removeChild(el); }
/* ══════════ Friendly dialogs: toasts instead of alert(), real dialogs instead of confirm()/prompt() ══════════ */
(function(){
  let css = document.createElement("style");
  css.textContent = `
  #uiToastHost{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100vw - 24px));pointer-events:none}
  .ui-toast{pointer-events:auto;display:flex;gap:10px;align-items:flex-start;background:#fff;color:#0D2447;border-radius:12px;box-shadow:0 8px 28px rgba(13,36,71,.22);border-inline-start:5px solid #1A3A6B;padding:11px 14px;font-size:13px;line-height:1.8;white-space:pre-line;direction:rtl;text-align:right;animation:uiIn .18s ease-out}
  .ui-toast.err{border-inline-start-color:#C0392B;background:#FFF6F5}.ui-toast.ok{border-inline-start-color:#1B7F4B;background:#F3FBF6}
  .ui-toast .tx{flex:1;word-break:break-word}.ui-toast button{background:none;border:none;font-size:18px;line-height:1;cursor:pointer;color:#5b6678;padding:0 2px}
  @keyframes uiIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
  #uiDlgBg{position:fixed;inset:0;background:rgba(13,36,71,.55);z-index:100002;display:flex;align-items:center;justify-content:center;padding:16px}
  #uiDlg{background:#fff;border-radius:14px;max-width:460px;width:100%;padding:20px 20px 16px;box-shadow:0 18px 50px rgba(0,0,0,.3);direction:rtl;text-align:right;font-family:inherit}
  #uiDlg .msg{font-size:13.5px;line-height:1.9;color:#0D2447;white-space:pre-line;word-break:break-word;margin-bottom:12px}
  #uiDlg textarea,#uiDlg input{width:100%;box-sizing:border-box;border:1.5px solid #cfd6e0;border-radius:8px;padding:9px 10px;font-family:inherit;font-size:13px;margin-bottom:12px;direction:rtl}
  #uiDlg .row{display:flex;gap:8px;justify-content:flex-start}
  #uiDlg button{border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  #uiDlg .okb{background:#1A3A6B;color:#fff}#uiDlg .okb.danger{background:#C0392B}#uiDlg .cb{background:#EEF1F5;color:#0D2447}`;
  document.head.appendChild(css);
  const en = () => (typeof currentLang !== "undefined" && currentLang === "en");
  function host(){ let h = document.getElementById("uiToastHost"); if(!h){ h = document.createElement("div"); h.id = "uiToastHost"; h.setAttribute("role","status"); h.setAttribute("aria-live","polite"); document.body.appendChild(h); } return h; }
  window.uiToast = function(message){
    const text = String(message == null ? "" : message);
    const err = /تعذّر|تعذر|خطأ|فشل|لا يمكن|غير مسموح|error|failed/i.test(text);
    const ok = !err && (/^\s*(✅|تم)|🎉/.test(text));
    const t = document.createElement("div"); t.className = "ui-toast" + (err ? " err" : ok ? " ok" : "");
    const tx = document.createElement("div"); tx.className = "tx"; tx.textContent = text;
    const x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label","close"); x.textContent = "×";
    t.appendChild(tx); t.appendChild(x);
    const h = host(); h.appendChild(t); while(h.children.length > 4) h.removeChild(h.firstChild);
    let timer; const close = () => { clearTimeout(timer); if(t.parentNode) t.parentNode.removeChild(t); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, Math.min(22000, (err ? 7000 : 4000) + text.length * 55)); };
    x.onclick = close; t.onmouseenter = () => clearTimeout(timer); t.onmouseleave = arm; arm();
  };
  window.__uiAlert = window.uiToast;
  function dialog(message, opts){
    return new Promise(resolve => {
      const prev = document.activeElement;
      const bg = document.createElement("div"); bg.id = "uiDlgBg";
      const d = document.createElement("div"); d.id = "uiDlg"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true");
      const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = (en() && typeof translateText === "function") ? translateText(String(message == null ? "" : message)) : String(message == null ? "" : message); d.appendChild(msg);
      let field = null;
      if(opts.prompt){ const long = String(message).length > 60 || /\n/.test(String(message)); field = document.createElement(long ? "textarea" : "input"); if(long) field.rows = 3; field.value = opts.def == null ? "" : String(opts.def); d.appendChild(field); }
      const row = document.createElement("div"); row.className = "row";
      const ok = document.createElement("button"); ok.type = "button"; ok.className = "okb" + (!opts.prompt && /حذف|إلغاء الاشتراك|نهائيًا|نهائيا|إزالة|رفض|delete|remove/i.test(String(message)) ? " danger" : ""); ok.textContent = en() ? "Confirm" : "تأكيد";
      const cn = document.createElement("button"); cn.type = "button"; cn.className = "cb"; cn.textContent = en() ? "Cancel" : "إلغاء";
      row.appendChild(ok); row.appendChild(cn); d.appendChild(row); bg.appendChild(d); document.body.appendChild(bg);
      const done = v => { document.removeEventListener("keydown", key, true); if(bg.parentNode) bg.parentNode.removeChild(bg); try{ prev && prev.focus && prev.focus(); }catch(e){} resolve(v); };
      const key = e => { if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); done(opts.prompt ? null : false); } else if(e.key === "Enter" && !(field && field.tagName === "TEXTAREA")){ e.preventDefault(); e.stopPropagation(); ok.click(); } };
      document.addEventListener("keydown", key, true);
      ok.onclick = () => done(opts.prompt ? field.value : true); cn.onclick = () => done(opts.prompt ? null : false);
      bg.addEventListener("mousedown", e => { if(e.target === bg) cn.click(); });
      setTimeout(() => (field || ok).focus(), 30);
    });
  }
  window.uiConfirm = m => dialog(m, {});
  window.uiPrompt = (m, def) => dialog(m, { prompt:true, def });
})();

/* Auto-refresh: re-load the page you are looking at every 40 seconds (and when you return to the tab),
   unless you are typing, a window is open, or the page is an editor — so changes by others appear without F5. */
const AUTO_REFRESH_SKIP_PAGES = ['govassess','reports','procedures'];
let __lastAutoRefresh = Date.now();
function autoRefreshTick(force){
  try{
    if(document.visibilityState !== 'visible' || !currentCompanyId) return;
    if(!force && Date.now() - __lastAutoRefresh < 35000) return;
    if(document.querySelector('.modal-bg.open')) return;
    const ae = document.activeElement;
    if(ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
    if(AUTO_REFRESH_SKIP_PAGES.includes(currentPageId)) return;
    __lastAutoRefresh = Date.now();
    reloadCurrentPageData();
  }catch(e){}
}
setInterval(() => autoRefreshTick(false), 40000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') autoRefreshTick(false); });

async function go(id, el){
  currentPageId = id;
  if(companyTypeReadyPromise){ try{ await companyTypeReadyPromise; }catch(e){} }
  const role = currentUserProfile ? getCurrentRole() : null;
  const blocked = role && !isPageAllowed(id, role);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(blocked){
    const rp = document.getElementById('p-restricted');
    if(rp) rp.classList.add('active');
    const t0 = titles[id] ? titles[id][0] : id;
    document.getElementById('restrictedTitle').textContent = t0 + ' — غير متاح';
    document.getElementById('restrictedRole').textContent = role;

    // Distinguish "not in your package" from an actual role restriction — only the former
    // gets the upsell treatment; a real permission wall still shows the plain message.
    const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
    const moduleKey = MODULE_PAGE_MAP[id];
    const isModuleBlock = moduleKey && !currentCompanyModules[moduleKey] && !isPlatformAdmin;
    document.getElementById('restrictedGenericIcon').style.display = isModuleBlock ? 'none' : 'block';
    document.getElementById('restrictedGenericBody').style.display = isModuleBlock ? 'none' : 'block';
    document.getElementById('restrictedUpgradeBlock').style.display = isModuleBlock ? 'block' : 'none';
    if(isModuleBlock){
      pendingUpgradeModuleKey = moduleKey;
      const pkgInfo = { risk_management: { name: (currentLang==='en'?'Partner':'شريك'), desc: 'إدارة المخاطر المؤسسية بشكل رقمي كامل — سجل حي، متابعة خطط المعالجة، وتنبيهات استباقية.' },
                        internal_audit: { name: (currentLang==='en'?'Partner':'شريك'), desc: 'إدارة كاملة لخطة التدقيق الداخلي وتنفيذها ومتابعتها رقميًا، بدل ملفات إكسل متناثرة.' } }[moduleKey];
      document.getElementById('restrictedPkgName').textContent = pkgInfo?.name || 'أعلى';
      document.getElementById('restrictedUpgradeDesc').textContent = pkgInfo?.desc || '';
    }
  } else {
    const pg=document.getElementById('p-'+id);
    if(pg) pg.classList.add('active');
  }
  if(el) el.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.getAttribute('onclick')&&n.getAttribute('onclick').includes("'"+id+"'")) n.classList.add('active');
  });
  const t=titles[id]||[id,''];
  document.getElementById('ptitle').textContent=t[0];
  document.getElementById('psub').textContent=t[1];
  closeSidebar();
  if(blocked) return;
  if(id==='dashboard') loadDashboard();
  if(id==='companyrequest') loadCompanyRequestPage();
  if(id==='companyrequests') loadCompanyRequestsReview();
  if(id==='activitylog') loadActivityLog();
  if(id==='shareholders') loadShareholders();
  if(id==='indicators') loadIndicatorsReport();
  if(id==='adminrequests'){ switchAdminRequestsTab('companyrequests'); loadCompanyRequestsReview(); loadManageCompanies(); loadAuditAdmin(); loadRiskAdmin(); }
  if(id==='platformdashboard') loadPlatformDashboard();
  if(id==='platformusers') loadPlatformUsers();
  if(id==='platformactivity') loadPlatformActivity();
  if(id==='members') loadMembers();
  if(id==='governance') loadPolicies();
  if(id==='announcements') loadAnnouncementsPageList();
  if(id==='meetings' || id==='committees' || id==='agm') loadMeetingsAll();
  if(id==='risks') loadRisks();
  if(id==='compliance') loadCompliance();
  if(id==='signing') loadSigning();
  if(id==='committees') loadCommittees();
  if(id==='procedures'){ loadProcedures(); }
  if(id==='structure'){ loadStructure(); renderApprovalStatus('structure','structureApprovalStatus'); }
  if(id==='permissions'){ loadPermissionsMatrix(); loadMatrixApprovalStatus(); }
  if(id==='voting') loadVotingPage();
  if(id==='audit') loadAudit();
  if(id==='govassess'){ document.getElementById('govassessListView').style.display='block'; document.getElementById('govassessFormView').style.display='none'; loadGovAssessments(); }
  if(id==='consultants') loadConsultantsPage();
  if(id==='perf') loadPerf();
  if(id==='decisiontracking') loadDecisionTracking();
  if(id==='managerdecisions') loadSimpleDecisions('manager');
  if(id==='ownerdecisions') loadSimpleDecisions('owner');
  if(id==='appoint'){ loadAppointRequests(); loadReviewSection(); }
  if(id==='reports') loadReportsPage();
  if(id==='archive') loadArchive();
  if(id==='users') loadUsers();
}
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');}
function switchAGMTab(name){
  document.querySelectorAll('#m-agm-view [data-agmtab]').forEach(t=>t.classList.toggle('active', t.dataset.agmtab===name));
  document.querySelectorAll('#m-agm-view [data-agmpane]').forEach(p=>p.classList.toggle('active', p.dataset.agmpane===name));
  const body = document.querySelector('#m-agm-view .fp-body');
  if(body) body.scrollTop = 0;
}
function switchMeetingDetailTab(name){
  document.querySelectorAll('#m-meeting-view [data-mdtab]').forEach(t=>t.classList.toggle('active', t.dataset.mdtab===name));
  document.querySelectorAll('#m-meeting-view [data-mdpane]').forEach(p=>p.classList.toggle('active', p.dataset.mdpane===name));
  const body = document.querySelector('#m-meeting-view .fp-body');
  if(body) body.scrollTop = 0;
}
document.querySelectorAll('.modal-bg').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});
/* Collapsible nav sections — works for both the top-level group headers and the nested
   sub-group headers (اجتماعات المجلس / الجمعية العامة) with the same function, since both
   follow the identical header+children pairing convention (id="grp-X" / id="grp-X-children"). */
function toggleNavGroup(id){
  const header = document.getElementById('grp-'+id);
  const children = document.getElementById('grp-'+id+'-children');
  if(!header || !children) return;
  header.classList.toggle('collapsed');
  children.classList.toggle('collapsed');
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}
async function submitRequest(){
  const candidate_name = document.getElementById("apr-name").value.trim();
  if(!candidate_name){ alert("الرجاء إدخال اسم المرشح"); return; }
  const request_type = document.getElementById("apr-type").value;
  const proposed_position = document.getElementById("apr-position").value;
  const id_number = document.getElementById("apr-idnumber").value.trim();
  const qualification = document.getElementById("apr-qualification").value.trim();
  const experience = document.getElementById("apr-experience").value;
  const specialization = document.getElementById("apr-specialization").value;
  const justification = document.getElementById("apr-justification").value.trim();

  const { error } = await sb.from("appoint_requests").insert([{
    candidate_name, request_type, proposed_position, id_number, qualification, experience, specialization, justification, status: "جديد", company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  document.getElementById("apr-name").value = "";
  document.getElementById("apr-idnumber").value = "";
  document.getElementById("apr-qualification").value = "";
  document.getElementById("apr-justification").value = "";

  const msg=document.getElementById("req-msg");
  msg.style.display="block";
  setTimeout(()=>{msg.style.display="none";},4000);
  loadAppointRequests();
}

const APPOINT_TYPE_ICONS = {
  "تعيين عضو مجلس إدارة جديد": "🧑‍💼",
  "تعيين عضو لجنة متخصصة": "👥",
  "تجديد عضوية عضو حالي": "🔁",
  "إحلال عضو بديل": "🔄"
};
const APPOINT_STATUS_STYLE = {
  "جديد": { bg: "var(--offwhite)", color: "var(--gray3)", border: "var(--gray1)" },
  "محال إلى مجلس الإدارة": { bg: "#EAF0F8", color: "var(--primary)", border: "#C9D9EE" },
  "معتمد": { bg: "#E8F8EF", color: "var(--green)", border: "#BFEBD1" },
  "مرفوض": { bg: "#FDE8E8", color: "var(--red)", border: "#F5C6C6" }
};

async function loadAppointRequests(){
  const thead = document.getElementById("appointRequestsThead");
  const tbody = document.getElementById("appointRequestsTbody");
  if(!tbody) return;
  if(thead){
    thead.innerHTML = '<tr>' +
      ['المرشح','نوع الطلب','المنصب المقترح','التخصص','التاريخ','الحالة'].map(h =>
        `<th style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;padding:12px 14px;font-size:11.5px">${h}</th>`
      ).join('') + '</tr>';
  }

  const { data, error } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  if(!data || data.length===0){ tbody.innerHTML = emptyRowHTML(6, "لا توجد طلبات مقدَّمة بعد."); return; }

  // Group requests by type (عضو مجلس / عضو لجنة ...) so each category's requests sit together
  const groups = {};
  data.forEach(r => {
    const cat = r.request_type || "أخرى";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  });

  let rows = "";
  Object.keys(groups).forEach(cat => {
    const icon = APPOINT_TYPE_ICONS[cat] || "📋";
    rows += `<tr><td colspan="6" style="background:var(--offwhite);border-right:4px solid var(--gold);font-weight:800;color:var(--primary);font-size:12px;padding:10px 16px">${icon} ${cat}</td></tr>`;
    groups[cat].forEach(r => {
      const initial = (r.candidate_name||"؟").trim().charAt(0);
      const st = APPOINT_STATUS_STYLE[r.status] || APPOINT_STATUS_STYLE["جديد"];
      rows += `<tr>
        <td style="padding:12px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${initial}</div>
            <span style="font-weight:700;color:var(--dark)">${orgEsc(r.candidate_name||"")}</span>
          </div>
        </td>
        <td style="font-size:12px;color:var(--gray3)">${r.request_type||"—"}</td>
        <td style="font-size:12.5px;font-weight:600">${r.proposed_position||"—"}</td>
        <td style="font-size:12px;color:var(--gray3)">${r.specialization||"—"}</td>
        <td style="font-size:12px;color:var(--gray3)">${r.created_at ? new Date(r.created_at).toLocaleDateString("ar-SA-u-ca-gregory") : "—"}</td>
        <td>
          <select onchange="updateRequestStatus(${r.id}, this.value)" style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:8px;cursor:pointer;background:${st.bg};color:${st.color};border:1.5px solid ${st.border}">
            <option ${r.status==="جديد"?"selected":""}>جديد</option>
            <option ${r.status==="محال إلى مجلس الإدارة"?"selected":""}>محال إلى مجلس الإدارة</option>
            <option ${r.status==="معتمد"?"selected":""}>معتمد</option>
            <option ${r.status==="مرفوض"?"selected":""}>مرفوض</option>
          </select>
        </td>
      </tr>`;
    });
  });
  tbody.innerHTML = rows;
}

async function updateRequestStatus(id, status){
  const { error } = await sb.from("appoint_requests").update({ status }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  loadAppointRequests();
}

