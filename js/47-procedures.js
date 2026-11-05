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
  const row = (ok, t, extra) => `<div class="gate-row"><span class="gate-ic ${ok?'ok':''}">${ok ? "✓" : ""}</span> ${t}${extra ? ` <span style="color:var(--gray3);font-size:11.5px">— ${extra}</span>` : ""}</div>`;
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
          <div class="glinks" id="glk-procedure-${p.id}" data-glinks="procedure:${p.id}" style="margin:4px 0"></div>
          <div style="font-size:11px;color:var(--gray3)">النسخة ${p.version}.0 · ${n} خطوات · المصدر: ${orgEsc(p.source)}${p.status === "معتمد" && p.approved_at ? " · اعتُمد " + procFmt(p.approved_at) : ""}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-xs primary" onclick="openProcedure(${p.id})">تعديل / عرض</button>
          <button class="btn-xs" onclick="openGovLinkPicker('procedure',${p.id})">🔗 ربط</button>
          <button class="btn-xs" onclick="procOpenApproval(${p.id})">${p.status === "مسودة" ? "طلب اعتماد" : "مسار الاعتماد"}</button>
          <button class="btn-xs" onclick="procExportPDF(${p.id})">PDF</button>
          <button class="btn-xs" onclick="procPrint(${p.id})" title="ملف نصي قابل للبحث والتحديد">طباعة / PDF نصي</button>
          <button class="btn-xs" style="color:var(--red)" onclick="procDelete(${p.id})">حذف</button>
        </div></div>`; }).join("")}</div>`).join("");
  procState.procs.forEach(p => { if(typeof renderGovLinks === "function") renderGovLinks(`glk-procedure-${p.id}`, "procedure", p.id); });
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
