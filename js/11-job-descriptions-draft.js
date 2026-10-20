/* ══════════ JOB DESCRIPTIONS — draft → edit → final document → e-signature ══════════
   Generic by design: pulls the company's own name, legal entity type (to word the approval
   line correctly — مجلس الإدارة for a joint-stock company, الشركاء for an LLC...), and
   registered activity, so the same tool works for any company instead of being written for
   one specific industry. Content sections start with light, general-purpose seed bullets the
   admin edits per role — no fabricated industry-specific claims. */
let currentJobDescription = null;

const GENERIC_JD_SEEDS = {
  purpose: ["تحقيق أهداف الإدارة ضمن الخطة العامة للشركة.", "الإشراف على تنفيذ المهام المنوطة بالوظيفة بكفاءة وجودة عالية."],
  tasks: ["تنفيذ المهام اليومية المرتبطة بالوظيفة وفق السياسات المعتمدة.", "إعداد التقارير الدورية ورفعها للمدير المباشر.", "التنسيق مع الإدارات الأخرى لإنجاز الأعمال المشتركة.", "الالتزام بإجراءات وسياسات الشركة المعتمدة."],
  authorities: ["اتخاذ القرارات التشغيلية اليومية ضمن نطاق الوظيفة."],
  qualifications: ["المؤهل العلمي المناسب لطبيعة الوظيفة.", "الخبرة العملية المناسبة لمستوى الوظيفة."],
  skills: ["مهارات التواصل والعمل ضمن فريق.", "القدرة على التخطيط وتنظيم الوقت."]
};

function approvalAuthorityLabel(companyType){
  if(companyType === "مساهمة مدرجة" || companyType === "مساهمة غير مدرجة") return "مجلس الإدارة";
  if(companyType === "ذات مسؤولية محدودة") return "الشركاء";
  return "الإدارة العليا";
}

function autoJobCode(title){
  if(!title) return "JOB-" + Math.floor(Math.random()*900+100);
  const words = title.trim().split(/\s+/).filter(w => !["إدارة","الإدارة","مدير","نائب","رئيس","لـ"].includes(w));
  const initials = (words.slice(0,2).map(w=>w[0]).join("") || title[0]).toUpperCase();
  return `${initials}-${Math.floor(Math.random()*900+100)}`;
}

/* Ready-made starting points by job title. A suggestion only — everything stays editable before approval. */
const JD_TEMPLATES = [
  { re:/مالي|محاسب|خزينة|ميزانية|زكاة|ضريب/, t:{
    purpose:["إدارة الشؤون المالية والمحاسبية للشركة بدقة وشفافية، وضمان سلامة التقارير المالية والتزامها بالأنظمة."],
    tasks:["إعداد الموازنة التقديرية ومتابعة تنفيذها.","إعداد القوائم والتقارير المالية الدورية.","الإشراف على الحسابات والقيود والإقفالات الشهرية والسنوية.","إدارة التدفقات النقدية والسيولة.","متابعة الالتزامات الزكوية والضريبية.","التنسيق مع المراجع الخارجي وتزويده بالمعلومات."],
    authorities:["اعتماد القيود والتسويات ضمن حدود الصلاحيات المعتمدة.","اقتراح السياسات المالية ورفعها للاعتماد."],
    qualifications:["بكالوريوس في المحاسبة أو المالية.","خبرة عملية في المجال المالي مناسبة لمستوى الوظيفة.","يفضّل شهادة مهنية (SOCPA / CPA / CMA)."],
    skills:["التحليل المالي.","إتقان الأنظمة المحاسبية وإكسل.","الدقة والالتزام بالمواعيد.","إعداد التقارير."] } },
  { re:/موارد بشرية|الموارد البشرية|شؤون الموظفين|شئون الموظفين|توظيف/, t:{
    purpose:["إدارة رأس المال البشري للشركة من استقطاب وتطوير وتنظيم علاقات العمل بما يحقق أهدافها ويلتزم بنظام العمل."],
    tasks:["تخطيط الاحتياج الوظيفي والإشراف على الاستقطاب والتعيين.","إعداد وتحديث الهيكل التنظيمي والأوصاف الوظيفية.","إدارة شؤون الموظفين والإجازات والحضور والرواتب بالتنسيق مع المالية.","إدارة تقييم الأداء وخطط التطوير والتدريب.","ضمان الالتزام بنظام العمل ولوائح الشركة.","متابعة العقود والتأمينات والتقارير الدورية."],
    authorities:["اعتماد إجراءات الموارد البشرية ضمن السياسات المعتمدة.","رفع التوصيات بالتعيين والترقية والنقل."],
    qualifications:["بكالوريوس في الموارد البشرية أو الإدارة.","خبرة عملية في الموارد البشرية.","معرفة بنظام العمل السعودي."],
    skills:["التواصل وحل النزاعات.","السرية والنزاهة.","التخطيط والتنظيم.","إتقان أنظمة الموارد البشرية."] } },
  { re:/مشتريات|مشتري|عقود ومشتريات|إمداد|امداد|توريد/, t:{
    purpose:["تأمين احتياجات الشركة من السلع والخدمات بالجودة والتكلفة والوقت المناسبين وفق سياسات الشراء المعتمدة."],
    tasks:["استلام طلبات الشراء ومراجعة مواصفاتها.","طلب عروض الأسعار والمقارنة بينها وإعداد التوصيات.","إعداد أوامر الشراء ومتابعة التوريد والاستلام.","تقييم الموردين والحفاظ على سجل الموردين المعتمدين.","التفاوض على الأسعار والشروط التعاقدية.","التنسيق مع المالية والمخازن في الفواتير والمدفوعات."],
    authorities:["اعتماد أوامر الشراء ضمن سقف الصلاحية المعتمد.","استبعاد مورد مخالف بعد الرجوع للإدارة العليا."],
    qualifications:["بكالوريوس في إدارة الأعمال أو سلاسل الإمداد أو ما يعادلها.","خبرة عملية في المشتريات."],
    skills:["التفاوض.","تحليل العروض.","النزاهة وتجنب تعارض المصالح.","إدارة العلاقة مع الموردين."] } },
  { re:/مبيعات|بيع|تجاري|التجارية|أعمال العملاء|تطوير الأعمال/, t:{
    purpose:["تحقيق أهداف الإيرادات والنمو عبر إدارة المبيعات وبناء علاقات مستدامة مع العملاء."],
    tasks:["وضع خطط وأهداف المبيعات ومتابعة تحقيقها.","إدارة فريق المبيعات وقنوات البيع.","بناء علاقات مع العملاء الحاليين والمحتملين.","إعداد العروض والعقود بالتنسيق مع القانونية والمالية.","تحليل السوق والمنافسين ورفع التقارير الدورية.","متابعة التحصيل بالتنسيق مع المالية."],
    authorities:["منح الخصومات ضمن الحدود المعتمدة.","التفاوض وتوقيع العروض ضمن الصلاحيات."],
    qualifications:["بكالوريوس في إدارة الأعمال أو التسويق أو ما يعادلها.","خبرة عملية في المبيعات."],
    skills:["الإقناع والتفاوض.","التخطيط وتحقيق الأهداف.","العرض والتواصل.","استخدام أنظمة إدارة العملاء."] } },
  { re:/تسويق|علامة تجارية|اتصال مؤسسي|علاقات عامة/, t:{
    purpose:["بناء حضور العلامة التجارية للشركة ودعم أهداف المبيعات والنمو عبر الخطط التسويقية والاتصال المؤسسي."],
    tasks:["إعداد الخطة والموازنة التسويقية السنوية.","إدارة الحملات والمحتوى والقنوات الرقمية.","قياس الأداء التسويقي وتحليل النتائج.","الحفاظ على هوية العلامة وتوحيد الرسائل.","التنسيق مع المبيعات وخدمة العملاء."],
    authorities:["اعتماد المحتوى التسويقي ضمن الموازنة المعتمدة."],
    qualifications:["بكالوريوس في التسويق أو الإعلام أو ما يعادله.","خبرة عملية في التسويق."],
    skills:["الإبداع وصناعة المحتوى.","التحليل الرقمي.","إدارة المشاريع.","التواصل."] } },
  { re:/قانون|شؤون قانونية|شئون قانونية|عقود/, t:{
    purpose:["حماية مصالح الشركة القانونية وضمان التزام أعمالها بالأنظمة واللوائح والعقود."],
    tasks:["مراجعة وصياغة العقود والاتفاقيات.","تقديم الرأي القانوني للإدارات.","متابعة القضايا والمطالبات مع الجهات والمحامين الخارجيين.","متابعة التزام الشركة بالتراخيص والأنظمة.","دعم مجلس الإدارة والجمعيات بالجوانب النظامية."],
    authorities:["إبداء الرأي القانوني الملزم إجرائيًا قبل توقيع العقود الجوهرية."],
    qualifications:["بكالوريوس في القانون أو الشريعة والأنظمة.","خبرة عملية قانونية، ويفضّل رخصة محاماة."],
    skills:["الصياغة القانونية.","التحليل والبحث النظامي.","السرية.","التفاوض."] } },
  { re:/تقنية|معلومات|نظم|تكنولوجيا|IT|برمج|أمن سيبراني|الأمن السيبراني/i, t:{
    purpose:["توفير بنية تقنية آمنة وموثوقة تدعم أعمال الشركة وتحمي معلوماتها."],
    tasks:["إدارة الأنظمة والشبكات والبنية التحتية.","ضمان أمن المعلومات وحماية البيانات والنسخ الاحتياطي.","تقديم الدعم الفني للمستخدمين.","إدارة عقود ومزودي الخدمات التقنية.","تنفيذ مشاريع التحول الرقمي بالتنسيق مع الإدارات.","رفع تقارير الجاهزية والحوادث."],
    authorities:["إدارة صلاحيات الدخول للأنظمة وفق السياسات المعتمدة.","إيقاف الوصول عند الاشتباه بخطر أمني."],
    qualifications:["بكالوريوس في علوم الحاسب أو تقنية المعلومات.","خبرة عملية، ويفضّل شهادات مهنية (ITIL / CISSP)."],
    skills:["الأمن السيبراني.","حل المشكلات.","إدارة المشاريع التقنية.","التوثيق."] } },
  { re:/مراجعة داخلية|تدقيق داخلي|المراجعة الداخلية/, t:{
    purpose:["تقديم تأكيد مستقل وموضوعي لمجلس الإدارة ولجنة المراجعة عن كفاية الرقابة الداخلية والحوكمة وإدارة المخاطر."],
    tasks:["إعداد خطة المراجعة السنوية المبنية على المخاطر.","تنفيذ مهام المراجعة وفحص الضوابط.","رفع التقارير والتوصيات للجنة المراجعة.","متابعة تنفيذ الإجراءات التصحيحية.","التنسيق مع المراجع الخارجي والجهات الرقابية."],
    authorities:["الاطلاع على السجلات والمعلومات اللازمة للمراجعة دون قيود.","الرفع المباشر للجنة المراجعة ومجلس الإدارة."],
    qualifications:["بكالوريوس في المحاسبة أو المراجعة أو ما يعادله.","خبرة في المراجعة، ويفضّل CIA أو CPA."],
    skills:["الاستقلالية والموضوعية.","التحليل والتدقيق.","كتابة التقارير.","معرفة بمعايير المراجعة الداخلية."] } },
  { re:/حوكمة|امتثال|التزام|مطابقة/, t:{
    purpose:["ضمان التزام الشركة بنظام الحوكمة والأنظمة واللوائح، ودعم المجلس واللجان بالمنظومة الحوكمية."],
    tasks:["متابعة تطبيق السياسات والمصفوفات والهيكل المعتمد.","إعداد تقارير الامتثال والفجوات وخطط المعالجة.","دعم أعمال المجلس واللجان وتوثيق القرارات.","رصد التغييرات النظامية وتحديث السياسات.","نشر الوعي بالحوكمة داخل الشركة."],
    authorities:["طلب المعلومات من الإدارات لأغراض الامتثال.","رفع حالات عدم الالتزام للإدارة العليا."],
    qualifications:["بكالوريوس في القانون أو الإدارة أو ما يعادلها.","خبرة في الحوكمة والامتثال، ويفضّل شهادة مهنية."],
    skills:["معرفة بأنظمة الحوكمة.","التحليل.","الصياغة والتوثيق.","التواصل مع المجلس."] } },
  { re:/مخاطر/, t:{
    purpose:["بناء وتشغيل منظومة إدارة المخاطر بما يحمي أهداف الشركة ويدعم قرارات المجلس."],
    tasks:["تحديد المخاطر وتقييمها وتحديث سجل المخاطر.","اقتراح خطط المعالجة ومتابعة تنفيذها.","إعداد تقارير المخاطر الدورية.","نشر ثقافة المخاطر بين الإدارات.","التنسيق مع المراجعة الداخلية والامتثال."],
    authorities:["طلب المعلومات من الإدارات لتقييم المخاطر.","رفع المخاطر الجوهرية للإدارة العليا ومجلس الإدارة."],
    qualifications:["بكالوريوس في الإدارة أو المالية أو ما يعادلها.","خبرة في إدارة المخاطر، ويفضّل شهادة مهنية."],
    skills:["التحليل الكمي والنوعي.","التفكير الاستراتيجي.","إعداد التقارير.","التواصل."] } },
  { re:/جودة|سلامة/, t:{
    purpose:["ضمان جودة العمليات والمنتجات والخدمات وسلامة بيئة العمل وفق المعايير المعتمدة."],
    tasks:["إعداد وتحديث نظام الجودة والإجراءات.","تنفيذ المراجعات الداخلية ومتابعة الملاحظات.","قياس مؤشرات الأداء وتحليل أسباب الانحرافات.","إدارة شكاوى الجودة والإجراءات التصحيحية.","الإشراف على متطلبات السلامة والصحة المهنية."],
    authorities:["إيقاف العملية عند وجود خطر على السلامة أو الجودة."],
    qualifications:["بكالوريوس في الهندسة أو الإدارة أو ما يعادله.","خبرة في الجودة، ويفضّل شهادات (ISO / Six Sigma)."],
    skills:["التفكير التحليلي.","معرفة بالمعايير الدولية.","التدريب والتوعية.","الدقة."] } },
  { re:/تشغيل|عمليات|إنتاج|انتاج|لوجست|مستودع|مخازن/, t:{
    purpose:["إدارة العمليات التشغيلية اليومية بكفاءة وجودة وفي حدود الموازنة والمعايير المعتمدة."],
    tasks:["تخطيط وجدولة العمليات والموارد.","متابعة مؤشرات الأداء التشغيلي ورفع التقارير.","تحسين الإجراءات ورفع الكفاءة وتقليل الهدر.","التنسيق مع المشتريات والمخازن والجودة.","الإشراف على فرق العمل وتنظيم مهامها."],
    authorities:["اتخاذ القرارات التشغيلية اليومية ضمن الصلاحيات."],
    qualifications:["بكالوريوس في الهندسة أو إدارة العمليات أو ما يعادله.","خبرة تشغيلية مناسبة."],
    skills:["التخطيط والتنظيم.","حل المشكلات.","القيادة.","التحليل."] } },
  { re:/مشاريع|مشروع|تطوير/, t:{
    purpose:["تخطيط وتنفيذ المشاريع وفق النطاق والجدول والتكلفة والجودة المعتمدة."],
    tasks:["إعداد خطط المشاريع والجداول والموازنات.","إدارة الفريق والموردين ومتابعة التنفيذ.","إدارة المخاطر والتغييرات في المشروع.","رفع تقارير التقدم لأصحاب المصلحة.","إقفال المشاريع وتوثيق الدروس المستفادة."],
    authorities:["اعتماد التغييرات الصغيرة ضمن حدود المشروع.","رفع طلبات التغيير الجوهرية للجهة المعتمدة."],
    qualifications:["بكالوريوس في الهندسة أو الإدارة أو ما يعادله.","خبرة في إدارة المشاريع، ويفضّل PMP."],
    skills:["إدارة المشاريع.","التواصل مع أصحاب المصلحة.","إدارة الوقت.","حل المشكلات."] } },
  { re:/عملاء|خدمة العملاء|دعم العملاء/, t:{
    purpose:["تقديم تجربة عملاء متميزة والاستجابة لطلباتهم وشكاواهم بسرعة وجودة."],
    tasks:["استقبال طلبات العملاء وشكاواهم ومتابعتها حتى الإغلاق.","قياس رضا العملاء ورفع التقارير.","التنسيق مع الإدارات لمعالجة الطلبات.","تحديث قاعدة المعرفة وإجابات الأسئلة الشائعة."],
    authorities:["معالجة الحالات ضمن حدود الصلاحية المعتمدة."],
    qualifications:["دبلوم أو بكالوريوس مناسب.","خبرة في خدمة العملاء."],
    skills:["التواصل.","الصبر وحل المشكلات.","سرعة الاستجابة.","استخدام أنظمة الدعم."] } },
  { re:/رئيس تنفيذي|المدير العام|مدير عام|الرئيس التنفيذي|المدير التنفيذي/, t:{
    purpose:["قيادة الشركة وتنفيذ استراتيجيتها وقرارات مجلس الإدارة (أو المالك) وتحقيق نتائج الأداء المستهدفة."],
    tasks:["تنفيذ الاستراتيجية والخطة السنوية والموازنة.","الإشراف على الإدارات ومتابعة أدائها.","رفع التقارير الدورية لمجلس الإدارة أو المالك.","تمثيل الشركة أمام الجهات الخارجية ضمن الصلاحيات.","ضمان الالتزام بالحوكمة والأنظمة.","إدارة المخاطر الرئيسية ورفع المستجدات الجوهرية."],
    authorities:["الصلاحيات الممنوحة بقرار مجلس الإدارة أو المالك ومصفوفة الصلاحيات."],
    qualifications:["بكالوريوس على الأقل، ويفضّل ماجستير في الإدارة.","خبرة قيادية طويلة في القطاع."],
    skills:["القيادة والتفكير الاستراتيجي.","اتخاذ القرار.","التواصل والتفاوض.","الإدارة المالية."] } },
  { re:/سكرتير|أمين سر|امين سر/, t:{
    purpose:["تنظيم أعمال مجلس الإدارة واجتماعاته وتوثيق قراراته ومتابعة تنفيذها."],
    tasks:["إعداد جدول الأعمال ودعوات الاجتماعات.","تدوين المحاضر وصياغتها واعتمادها.","متابعة تنفيذ القرارات.","حفظ وثائق المجلس وسجلاته.","التنسيق بين المجلس والإدارة التنفيذية."],
    authorities:["الاطلاع على وثائق المجلس وتوثيقها وفق السياسات."],
    qualifications:["بكالوريوس في الإدارة أو القانون أو ما يعادله.","خبرة في أعمال المجالس والحوكمة."],
    skills:["الصياغة والتوثيق.","السرية.","التنظيم.","التواصل."] } }
];
function jdTemplateFor(title){
  const t = String(title || "");
  const hit = JD_TEMPLATES.find(x => x.re.test(t));
  return hit ? hit.t : null;
}
function jdFillFields(c){
  const bullets = a => (a || []).map(x => "• " + x).join("\n");
  document.getElementById("jd-purpose").value = bullets(c.purpose);
  document.getElementById("jd-tasks").value = bullets(c.tasks);
  document.getElementById("jd-authorities").value = bullets(c.authorities);
  document.getElementById("jd-qualifications").value = bullets(c.qualifications);
  document.getElementById("jd-skills").value = bullets(c.skills);
}
function jdSetNote(kind){
  const el = document.getElementById("jd-source-note");
  if(!el) return;
  el.textContent = kind === "template" ? "تم تجهيز البنود من قالب جاهز يناسب مسمى الوظيفة. راجعها وعدّلها قبل الاعتماد."
    : kind === "ai" ? "⚠️ البنود مقترحة آليًا بالذكاء الاصطناعي ولم تُراجَع بعد. راجعها وعدّلها قبل الحفظ والاعتماد."
    : kind === "saved" ? "بنود محفوظة سابقًا لهذه الوظيفة. يمكنك طلب اقتراح جديد بالذكاء الاصطناعي."
    : "بنود عامة لأن لا يوجد قالب جاهز لهذا المسمى. يمكنك طلب اقتراح بالذكاء الاصطناعي.";
}
async function suggestJobDescriptionAI(){
  const title = document.getElementById("jd-department").value.trim() || document.getElementById("jd-position-title").textContent.trim();
  if(!title){ alert("اكتب المسمى الوظيفي أولًا."); return; }
  if(!await uiConfirm('سيُرسل المسمى الوظيفي "' + title + '" وقطاع الشركة فقط (دون أي أسماء أو بيانات أشخاص) إلى خدمة ذكاء اصطناعي لاقتراح الوصف، وسيستبدل الاقتراح البنود الحالية في الشاشة. متابعة؟')) return;
  const btn = document.getElementById("jd-ai-btn");
  const old = btn.textContent; btn.disabled = true; btn.textContent = "جارٍ الاقتراح…";
  try{
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخولك من جديد."); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-job-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ company_id: currentCompanyId, title, sector: document.getElementById("jd-sector").value.trim(), entity_type: currentCompanyType || "" })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ alert(data.error || "تعذّر الاقتراح الآن. استخدم القالب الجاهز أو اكتب البنود يدويًا."); return; }
    jdFillFields(data.content);
    jdSetNote("ai");
  }catch(e){
    alert("تعذّر الاتصال بالخدمة: " + e.message);
  }finally{
    btn.disabled = false; btn.textContent = old;
  }
}

async function openJobDescriptionModal(positionId){
  const pos = structureCache.find(s => s.id === positionId);
  if(!pos) return;
  document.getElementById("jd-position-id").value = positionId;
  document.getElementById("jd-position-title").textContent = pos.position_title || "";

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const { data: existing } = await sb.from("job_descriptions").select("*").eq("position_id", positionId).order("id",{ascending:false}).limit(1).maybeSingle();
  currentJobDescription = existing || null;
  document.getElementById("jd-id").value = existing ? existing.id : "";

  let content = {};
  try{ content = existing && existing.draft_content ? JSON.parse(existing.draft_content) : {}; }catch(e){ content = {}; }

  const jdTpl = jdTemplateFor(pos.position_title);
  jdSetNote(content.tasks ? "saved" : (jdTpl ? "template" : "generic"));
  document.getElementById("jd-department").value = content.department || pos.position_title || "";
  document.getElementById("jd-sector").value = content.sector || company?.business_activity || "";
  document.getElementById("jd-code").value = content.code || autoJobCode(pos.position_title);
  document.getElementById("jd-manager").value = content.manager || pos.parent_position || "—";
  document.getElementById("jd-purpose").value = content.purpose || (jdTpl ? jdTpl.purpose : GENERIC_JD_SEEDS.purpose).map(t=>"• "+t).join("\n");
  document.getElementById("jd-tasks").value = content.tasks || (jdTpl ? jdTpl.tasks : GENERIC_JD_SEEDS.tasks).map(t=>"• "+t).join("\n");
  document.getElementById("jd-authorities").value = content.authorities || (jdTpl ? jdTpl.authorities : GENERIC_JD_SEEDS.authorities).map(t=>"• "+t).join("\n");
  document.getElementById("jd-qualifications").value = content.qualifications || (jdTpl ? jdTpl.qualifications : GENERIC_JD_SEEDS.qualifications).map(t=>"• "+t).join("\n");
  document.getElementById("jd-skills").value = content.skills || (jdTpl ? jdTpl.skills : GENERIC_JD_SEEDS.skills).map(t=>"• "+t).join("\n");

  const status = existing?.status || "مسودة";
  document.getElementById("jd-status-badge").innerHTML =
    `<span class="badge ${status==='موقّعة نهائية'?'done':(status==='قيد التوقيع'?'pending':'info')}" style="flex-shrink:0">${status}</span>`;

  renderJobDescriptionFinalSection(existing);
  openM("m-job-desc");
}

function collectJobDescriptionContent(){
  return {
    department: document.getElementById("jd-department").value.trim(),
    sector: document.getElementById("jd-sector").value.trim(),
    code: document.getElementById("jd-code").value.trim(),
    manager: document.getElementById("jd-manager").value.trim(),
    purpose: document.getElementById("jd-purpose").value,
    tasks: document.getElementById("jd-tasks").value,
    authorities: document.getElementById("jd-authorities").value,
    qualifications: document.getElementById("jd-qualifications").value,
    skills: document.getElementById("jd-skills").value
  };
}

async function saveJobDescriptionDraft(){
  const positionId = Number(document.getElementById("jd-position-id").value);
  const id = document.getElementById("jd-id").value;
  const draft_content = JSON.stringify(collectJobDescriptionContent());
  if(id){
    const { error } = await sb.from("job_descriptions").update({ draft_content }).eq("id", id);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("job_descriptions")
      .insert([{ position_id: positionId, company_id: currentCompanyId, draft_content, status:"مسودة" }]).select().single();
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    document.getElementById("jd-id").value = data.id;
    currentJobDescription = data;
  }
  alert("تم حفظ المسودة ✅");
}

function bulletLines(text){
  return (text||"").split("\n").map(l=>l.trim()).filter(Boolean).map(l=>l.replace(/^•\s*/,""));
}

async function generateJobDescriptionDoc(){
  await saveJobDescriptionDraft();
  const positionId = Number(document.getElementById("jd-position-id").value);
  const pos = structureCache.find(s => s.id === positionId);
  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const c = collectJobDescriptionContent();
  const approverLabel = approvalAuthorityLabel(company?.company_type);

  const html = `<html><head><meta charset="UTF-8"><title>بطاقة توصيف وظيفي</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:30px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;border-bottom:2px solid #D4AF37;padding-bottom:10px}
      table.meta{width:100%;border-collapse:collapse;margin:16px 0}
      table.meta td{border:1px solid #999;padding:8px 10px;font-size:12.5px}
      table.meta td.label{background:#EAF0F8;font-weight:bold;width:180px}
      h2{color:#1A3A6B;font-size:14px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:4px}
      ul{padding-right:20px;font-size:12.5px;line-height:1.9}
      .sig{margin-top:50px;display:flex;justify-content:space-between;font-size:12px}
      .sig div{width:30%;text-align:center;border-top:1px solid #333;padding-top:6px}
    </style></head><body>
      <h1>بطاقة توصيف وظيفي</h1>
      <table class="meta">
        <tr><td class="label">المسمى الوظيفي</td><td>${orgEsc(pos?.position_title||"")}</td><td class="label">كود الوظيفة</td><td>${c.code}</td></tr>
        <tr><td class="label">الإدارة</td><td>${orgEsc(c.department)}</td><td class="label">القطاع</td><td>${c.sector}</td></tr>
        <tr><td class="label">الشركة</td><td>${orgEsc(company?.name||"")}</td><td class="label">المسمى الوظيفي للمدير المباشر</td><td>${c.manager}</td></tr>
      </table>
      <h2>الهدف من الوظيفة</h2><ul>${bulletLines(c.purpose).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المهام والمسؤوليات الوظيفية</h2><ul>${bulletLines(c.tasks).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>الصلاحيات</h2><ul>${bulletLines(c.authorities).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المؤهلات والخبرات</h2><ul>${bulletLines(c.qualifications).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المهارات والقدرات</h2><ul>${bulletLines(c.skills).map(t=>`<li>${t}</li>`).join("")}</ul>
      <div class="sig"><div>إعداد</div><div>مراجعة</div><div>اعتمدت بواسطة (${approverLabel})</div></div>
      <div class="sig" style="margin-top:40px"><div>اسم شاغل الوظيفة</div><div>توقيع شاغل الوظيفة</div><div>التاريخ</div></div>
    </body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const positionSafe = (pos?.position_title||"وظيفة").replace(/[\/\\]/g,"-");
  const file_url = await uploadBlobToStorage(blob, "job-descriptions", `توصيف-${positionSafe}-${Date.now()}.doc`);
  if(!file_url){ alert("تعذّر رفع المستند"); return; }

  const id = document.getElementById("jd-id").value;
  await sb.from("job_descriptions").update({ final_file_url: file_url }).eq("id", id);
  const { data: refreshed } = await sb.from("job_descriptions").select("*").eq("id", id).single();
  currentJobDescription = refreshed;
  renderJobDescriptionFinalSection(refreshed);
  alert("تم توليد المستند النهائي ✅ راجعه ثم أرسله للتوقيع.");
}

function renderJobDescriptionFinalSection(jd){
  const box = document.getElementById("jd-finalBody");
  if(!box) return;
  if(!jd || !jd.final_file_url){
    box.innerHTML = '<p class="modal-section-hint">ولّد المستند النهائي أولًا (زر "📄 توليد المستند النهائي") قبل إرساله للتوقيع.</p>';
    return;
  }
  if(jd.signing_doc_id){
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <a class="btn btn-outline" style="font-size:11px;padding:8px 16px" href="${jd.final_file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض المستند</a>
      <span style="font-size:11.5px;color:var(--gray3)">حالة التوقيع: ${jd.status}</span>
    </div>`;
  } else {
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-outline" style="font-size:11px;padding:8px 16px" href="${jd.final_file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض المستند</a>
      <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="sendJobDescriptionForSigning()">🔏 إرسال للتوقيع</button>
    </div>`;
  }
}

async function sendJobDescriptionForSigning(){
  const id = document.getElementById("jd-id").value;
  const jd = currentJobDescription;
  if(!jd || !jd.final_file_url){ alert("ولّد المستند النهائي أولًا"); return; }
  const pos = structureCache.find(s => s.id === Number(document.getElementById("jd-position-id").value));

  const signersInput = await uiPrompt("كم عدد الموقّعين المطلوبين (مثال: إعداد + مراجعة + اعتماد + الموظف)؟", "4");
  const signers_total = Number(signersInput) || 4;

  const { data: doc, error } = await sb.from("signing_documents").insert([{
    document_name: `بطاقة توصيف وظيفي — ${pos?.position_title||""}`, doc_type: "بطاقة توصيف وظيفي",
    signers_total, signers_done: 0, status:"قيد التوقيع", file_url: jd.final_file_url, company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر الإرسال للتوقيع: " + error.message); return; }

  await sb.from("job_descriptions").update({ signing_doc_id: doc.id, status:"قيد التوقيع" }).eq("id", id);
  const { data: refreshed } = await sb.from("job_descriptions").select("*").eq("id", id).single();
  currentJobDescription = refreshed;
  renderJobDescriptionFinalSection(refreshed);
  alert("تم إرسال المستند للتوقيع ✅ — تابع حالته من صفحة «التوقيع الإلكتروني».");
}

/* ══════════ SHAREHOLDERS REGISTRY (real ownership + transfer history) ══════════ */
let shareholdersCache = [];

/* ══════════ GLOBAL SEARCH (across all major entities) ══════════ */
let globalSearchDebounce = null;
function handleGlobalSearchInput(val){
  clearTimeout(globalSearchDebounce);
  const box = document.getElementById("globalSearchResults");
  if(!val || val.trim().length < 2){ if(box) box.style.display = "none"; return; }
  globalSearchDebounce = setTimeout(() => runGlobalSearch(val.trim()), 300);
}

/* ══════════ EXCEL EXPORT (generic, works for any table/cache) ══════════ */
function exportToExcel(data, columns, filename){
  if(!data || data.length === 0){ alert("لا توجد بيانات للتصدير."); return; }
  const rows = data.map(row => {
    const out = {};
    columns.forEach(c => { out[c.label] = typeof c.value === "function" ? c.value(row) : (row[c.key] ?? ""); });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportMembers(){
  exportToExcel(membersCache, [
    { label:"الاسم", key:"name" }, { label:"المنصب", key:"position" }, { label:"المستوى", key:"position_level" },
    { label:"الحالة", key:"status" }, { label:"تنفيذي؟", key:"is_executive" }, { label:"تاريخ الانضمام", key:"join_date" }
  ], "أعضاء مجلس الإدارة");
}
function exportMeetingsList(){
  exportToExcel(allMeetingsCache, [
    { label:"العنوان", key:"title" }, { label:"النوع", key:"meeting_type" }, { label:"التاريخ", key:"meeting_date" },
    { label:"الوقت", key:"meeting_time" }, { label:"الطريقة", key:"method" }, { label:"الحالة", key:"status" }
  ], "الاجتماعات");
}
function exportPoliciesList(){
  exportToExcel(policiesCache, [
    { label:"الاسم", key:"policy_name" }, { label:"النوع", key:"policy_type" }, { label:"الفئة", key:"category" },
    { label:"الحالة", key:"status" }, { label:"تاريخ الاعتماد", key:"approval_date" }, { label:"تاريخ المراجعة", key:"review_date" }
  ], "السياسات");
}
function exportRisksList(){
  exportToExcel(risksCache, [
    { label:"الاسم", key:"risk_name" }, { label:"الفئة", key:"category" }, { label:"الاحتمالية", key:"probability" },
    { label:"التأثير", key:"impact" }, { label:"المسؤول", key:"owner" }, { label:"الحالة", key:"status" }
  ], "المخاطر");
}
function exportCommitteesList(){
  exportToExcel(committeesCache, [
    { label:"اسم اللجنة", key:"committee_name" }, { label:"الرئيس", key:"chairman_name" },
    { label:"الفئة", key:"category" }, { label:"النطاق", key:"scope" }
  ], "اللجان");
}
/* ══════════ SHAREHOLDERS EXCEL IMPORT (reliable — we control the exact column layout) ══════════ */
const SHAREHOLDERS_TEMPLATE_COLS = [
  { label: "الاسم", key: "name" },
  { label: "الجنسية", key: "nationality" },
  { label: "محل الإقامة", key: "place_of_residence" },
  { label: "المهنة", key: "profession" },
  { label: "رقم الشهادة", key: "certificate_number" },
  { label: "عدد الأسهم", key: "shares_count", numeric: true },
  { label: "القيمة المدفوعة (ريال)", key: "paid_value", numeric: true },
  { label: "تاريخ انتقال الملكية (YYYY-MM-DD)", key: "ownership_transfer_date" },
  { label: "رقم الهوية", key: "national_id" },
  { label: "رقم الجوال", key: "phone_number" },
  { label: "البريد الإلكتروني", key: "email" }
];

function downloadShareholdersTemplate(){
  const header = SHAREHOLDERS_TEMPLATE_COLS.map(c => c.label);
  const exampleRow = ["عبدالله محمد الحامد", "المملكة العربية السعودية", "الرياض", "رجل أعمال", "61", 10000, 100000, "2025-09-02", "1012345678", "0501234567", "example@email.com"];
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  ws["!cols"] = SHAREHOLDERS_TEMPLATE_COLS.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المساهمون");
  XLSX.writeFile(wb, "قالب-سجل-المساهمين.xlsx");
}

async function handleShareholdersExcelUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("المساهمون") ? "المساهمون" : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    if(!rows || rows.length < 2){ alert("الملف فاضي أو لا يحتوي بيانات."); input.value = ""; return; }

    // Row 0 is the header (labels only, not used for mapping — we rely on fixed column order
    // matching the template exactly); everything from row 1 onward is data, skipping the
    // example row if the person left it as-is.
    const dataRows = rows.slice(1).filter(r => r && r[0] && String(r[0]).trim() && String(r[0]).trim() !== "عبدالله محمد الحامد");

    if(dataRows.length === 0){ alert("لم يتم العثور على أي صفوف بيانات فعلية (تأكد من حذف صف المثال أو تعبئة صفوف جديدة)."); input.value = ""; return; }

    const payload = dataRows.map(r => {
      const obj = { company_id: currentCompanyId };
      SHAREHOLDERS_TEMPLATE_COLS.forEach((c, i) => {
        let v = r[i];
        if(v === undefined || v === "") v = null;
        if(c.numeric && v != null) v = Number(v) || 0;
        obj[c.key] = v;
      });
      return obj;
    });

    if(!await uiConfirm(`سيتم استيراد ${payload.length} مساهم — أي مساهم موجود مسبقًا (بنفس رقم الهوية) يُحدَّث برقم أسهمه الجديد بدون ما يفقد ربطه بحسابه، وأي مساهم جديد يُضاف. متابعة؟`)) { input.value = ""; return; }

    // Existing shareholders (by national_id) get UPDATED in place — this is what makes a
    // periodic re-import safe (e.g. refreshing the list before each new AGM): whoever already
    // claimed their record via signup keeps that link, only their share count/name refreshes.
    const { data: existing } = await sb.from("shareholders").select("id,national_id").eq("company_id", currentCompanyId).not("national_id","is",null);
    const existingByNationalId = {};
    (existing||[]).forEach(s => { if(s.national_id) existingByNationalId[s.national_id] = s.id; });

    const toInsert = [], toUpdate = [];
    payload.forEach(p => {
      const existingId = p.national_id ? existingByNationalId[p.national_id] : null;
      if(existingId) toUpdate.push({ id: existingId, ...p });
      else toInsert.push(p);
    });

    let updatedCount = 0, insertErr = null, updateErr = null;
    if(toInsert.length){
      const { error } = await sb.from("shareholders").insert(toInsert);
      insertErr = error;
    }
    for(const row of toUpdate){
      const { id, ...fields } = row;
      const { error } = await sb.from("shareholders").update(fields).eq("id", id);
      if(error) updateErr = error; else updatedCount++;
    }
    if(insertErr || updateErr){ alert("تعذّر الاستيراد بالكامل: " + (insertErr||updateErr).message); return; }
    logActivity("إنشاء", "استيراد مساهمين", `${toInsert.length} جديد + ${updatedCount} محدَّث`, "استيراد من Excel");
    alert(`تم الاستيراد ✅ — ${toInsert.length} مساهم جديد، و${updatedCount} مساهم محدَّث.`);
    input.value = "";
    loadShareholders();
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه نفس القالب المُحمَّل من المنصة بدون تعديل بترتيب الأعمدة.");
  }
}

function exportShareholdersList(){
  exportToExcel(shareholdersCache, [
    { label:"الاسم", key:"name" }, { label:"الجنسية", key:"nationality" }, { label:"محل الإقامة", key:"place_of_residence" },
    { label:"المهنة", key:"profession" }, { label:"رقم الشهادة", key:"certificate_number" }, { label:"عدد الأسهم", key:"shares_count" },
    { label:"القيمة المدفوعة", key:"paid_value" }, { label:"تاريخ انتقال الملكية", key:"ownership_transfer_date" }
  ], "سجل المساهمين");
}
function exportArchiveList(){
  exportToExcel(archiveDocsCache, [
    { label:"اسم الوثيقة", key:"document_name" }, { label:"الفئة", key:"category" },
    { label:"تاريخ الرفع", key:"created_at", value: r => r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : "" }
  ], "الأرشيف");
}
/* ══════════ FINANCIAL & OPERATIONAL INDICATORS (Excel round-trip) ══════════ */
/* ══════════ CEO MONTHLY REPORT — full replacement of the old financial indicators system ══════════ */

/* ══════════ FINANCIAL & OPERATIONAL REPORT v2 — trimmed to 15 sections per feedback ══════════ */

function downloadIndicatorsTemplate(){
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, colW) => {
    if(name.length > 31){ console.error("Sheet name exceeds 31 chars:", name); alert("خطأ داخلي: اسم ورقة طويل جدًا (\""+name+"\") — تواصل مع الدعم الفني."); throw new Error("sheet name too long"); }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = (colW||[55,30]).map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  try{

  addSheet("١-لوحة المؤشرات", [
    ["الفترة (مثال: يونيو 2026)", "", "", "", ""],
    ["المؤشر", "المستهدف", "الفعلي", "الشهر السابق", "نفس الشهر بالعام السابق"],
    ["الإيرادات", "", "", "", ""],
    ["المبيعات", "", "", "", ""],
    ["إجمالي الربح", "", "", "", ""],
    ["هامش الربح", "", "", "", ""],
    ["صافي الربح", "", "", "", ""],
    ["التدفق النقدي", "", "", "", ""],
    ["النقد المتوفر", "", "", "", ""],
    ["الذمم المدينة", "", "", "", ""],
    ["الذمم الدائنة", "", "", "", ""],
    ["حجم المبيعات المستهدف", "", "", "", ""],
    ["نسبة تحقيق الموازنة", "", "", "", ""],
    ["عدد العملاء", "", "", "", ""],
    ["العملاء الجدد", "", "", "", ""],
    ["نسبة الاحتفاظ بالعملاء", "", "", "", ""],
    ["عدد الموظفين", "", "", "", ""],
    ["معدل دوران الموظفين", "", "", "", ""],
    ["المشاريع الجارية", "", "", "", ""],
    ["نسبة إنجاز المشاريع", "", "", "", ""]
  ], [30,16,16,18,22]);

  addSheet("٢-الأداء المالي", [
    ["الإيرادات (ريال)", ""],
    ["إجمالي الربح (ريال)", ""],
    ["إجمالي المصروفات (ريال)", ""],
    ["المصروفات الإدارية (ريال)", ""],
    ["مصروفات المبيعات والتسويق (ريال)", ""],
    ["الرواتب (ريال)", ""]
  ]);

  addSheet("٣-المبيعات", [
    ["المبيعات الشهرية (ريال)", ""],
    ["المستهدف الشهري (ريال)", ""],
    ["المبيعات منذ بداية السنة (ريال)", ""],
    ["عدد العملاء الجدد", ""],
    ["عدد العملاء المتوقفين عن التعامل", ""],
    ["عدد العقود التي تم تقديمها", ""]
  ]);

  addSheet("٤-التشغيل", [
    ["حجم الأعمال المنفذة", ""],
    ["الأعطال والتوقفات", ""],
    ["الإجراءات التصحيحية", ""],
    ["أهم المشكلات التشغيلية", ""]
  ]);

  addSheet("٥-المشاريع", [
    ["اسم المشروع", "القيمة (ريال)", "العميل", "نسبة الإنجاز (%)", "الحالة (🟢 حسب الخطة / 🟡 تحتاج متابعة / 🔴 تحتاج تدخلًا)", "ملاحظات"],
    ["مشروع 1", "", "", "", "", ""],
    ["مشروع 2", "", "", "", "", ""],
    ["مشروع 3", "", "", "", "", ""],
    ["مشروع 4", "", "", "", "", ""],
    ["مشروع 5", "", "", "", "", ""]
  ], [22,16,20,14,38,30]);

  addSheet("٦-الموارد البشرية", [
    ["إجمالي عدد الموظفين", ""],
    ["عدد الموظفين الجدد", ""],
    ["الاستقالات وحالات إنهاء الخدمة", ""],
    ["معدل دوران الموظفين (%)", ""],
    ["الوظائف الشاغرة والحرجة", ""],
    ["الوظائف المطلوب توظيفها", ""],
    ["التدريب وبرامج تطوير الموظفين", ""],
    ["المشاكل العمالية", ""],
    ["احتياجات الشركة المستقبلية من الموظفين", ""]
  ]);

  addSheet("٧-المشتريات", [
    ["إجمالي المشتريات (ريال)", ""],
    ["المشتريات مقارنة بالموازنة", ""],
    ["الموردون الجدد", ""]
  ]);

  addSheet("٨-العملاء وخدمة العملاء", [
    ["عدد العملاء", ""],
    ["العملاء الجدد والمفقودون", ""],
    ["معدل الاحتفاظ بالعملاء (%)", ""],
    ["مستوى رضا العملاء", ""],
    ["عدد الشكاوى وطبيعتها", ""],
    ["زمن معالجة الشكاوى والشكاوى التي لم تُغلق", ""],
    ["أهم العملاء", ""],
    ["العملاء المعرضون لخطر فقدانهم", ""],
    ["الإجراءات المتخذة لتحسين رضا العملاء", ""]
  ]);

  addSheet("٩-التسويق", [
    ["الحملات التسويقية المنفذة وتكلفتها ونتائجها", ""],
    ["العملاء الناتجون عن الحملات", ""],
    ["أداء الموقع الإلكتروني ووسائل التواصل الاجتماعي", ""],
    ["تقييم أداء الشركة مقارنة بالمنافسين", ""],
    ["الفرص التسويقية الجديدة", ""]
  ]);

  addSheet("١٠-الشؤون القانونية والعقود", [
    ["القضايا القائمة والجديدة والتي أُغلقت", ""],
    ["قيمة المطالبات", ""],
    ["العقود الجديدة والتي تحتاج مراجعة والتي انتهت أو ستنتهي", ""],
    ["النزاعات مع العملاء والموردين", ""],
    ["المخاطر القانونية والالتزامات المحتملة", ""]
  ]);

  addSheet("١١-الشركات التابعة والفروع", [
    ["اسم الشركة/الفرع", "هل التشغيل يسير بشكل سليم؟", "المشاكل إن وجدت"],
    ["شركة/فرع 1", "", ""],
    ["شركة/فرع 2", "", ""],
    ["شركة/فرع 3", "", ""],
    ["شركة/فرع 4", "", ""],
    ["شركة/فرع 5", "", ""]
  ], [30,28,45]);

  addSheet("١٢-الأداء مقابل الموازنة", [
    ["الإيرادات: المخطط مقابل الفعلي", ""],
    ["الأرباح: المخطط مقابل الفعلي", ""],
    ["المصروفات: المخطط مقابل الفعلي", ""],
    ["التدفقات النقدية: المخطط مقابل الفعلي", ""],
    ["المبيعات: المخطط مقابل الفعلي", ""],
    ["عدد العملاء: المخطط مقابل الفعلي", ""],
    ["المشاريع: المخطط مقابل الفعلي", ""],
    ["الاستثمارات: المخطط مقابل الفعلي", ""],
    ["الموارد البشرية: المخطط مقابل الفعلي", ""],
    ["أسباب الانحرافات والإجراءات التصحيحية", ""]
  ]);

  addSheet("١٣-التوقعات حتى نهاية السنة", [
    ["الإيرادات المتوقعة حتى نهاية السنة (ريال)", ""],
    ["الأرباح المتوقعة (ريال)", ""],
    ["التدفقات النقدية المتوقعة (ريال)", ""],
    ["المبيعات المتوقعة (ريال)", ""],
    ["العقود المتوقع توقيعها", ""],
    ["المشاريع المتوقع إنجازها", ""],
    ["المخاطر التي قد تؤثر على النتائج", ""],
    ["هل ستتحقق الموازنة السنوية؟", ""],
    ["هل هناك حاجة لتعديل التوقعات؟", ""]
  ]);

  addSheet("١٤-أهم التحديات", [
    ["التحدي — المشكلة", "الأثر — ما قامت به الإدارة — النتيجة — ما تحتاجه الإدارة"],
    ["تحدٍ 1", ""], ["تحدٍ 2", ""], ["تحدٍ 3", ""], ["تحدٍ 4", ""], ["تحدٍ 5", ""],
    ["تحدٍ 6", ""], ["تحدٍ 7", ""], ["تحدٍ 8", ""]
  ], [35,60]);

  addSheet("١٥-أولويات الشهر القادم", [
    ["الأولوية 1", ""], ["الأولوية 2", ""], ["الأولوية 3", ""], ["الأولوية 4", ""],
    ["الأولوية 5", ""], ["الأولوية 6", ""], ["الأولوية 7", ""], ["الأولوية 8", ""]
  ]);

  XLSX.writeFile(wb, "التقرير-المالي-والتشغيلي.xlsx");
  }catch(e){
    if(e.message !== "sheet name too long"){ alert("تعذّر توليد النموذج: " + e.message); }
  }
}

function numOrNull(v){
  if(v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function textOr(v){ return (v===undefined||v===null) ? "" : String(v).trim(); }

const SEC_KEY_MAPS = {
  financial: ["revenue","gross_profit","total_expenses","admin_expenses","sales_marketing_expenses","salaries"],
  sales: ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"],
  operations: ["work_volume","breakdowns_downtime","corrective_actions","operational_issues"],
  hr: ["total_employees","new_employees","resignations","turnover_rate","vacant_critical_roles","roles_to_hire","training","labor_issues","future_needs"],
  procurement: ["total_purchases","purchases_vs_budget","new_suppliers"],
  customers: ["customer_count","new_lost_customers","retention_rate","satisfaction_level","complaints_count","complaints_resolution","top_customers","at_risk_customers","improvement_actions"],
  marketing: ["campaigns","campaign_customers","digital_performance","vs_competitors","new_opportunities"],
  legal: ["legal_cases","claims_value","contracts_status","disputes","legal_risks"],
  budget: ["revenue_vs_plan","profit_vs_plan","expenses_vs_plan","cashflow_vs_plan","sales_vs_plan","customers_vs_plan","projects_vs_plan","investments_vs_plan","hr_vs_plan","variance_reasons"],
  forecast: ["expected_revenue","expected_profit","expected_cashflow","expected_sales","expected_contracts","expected_projects","risks_affecting_results","budget_achievable","forecast_adjustment_needed"]
};

// Score decays smoothly the later the report lands in the month — used as one input into the
// CEO's performance evaluation (a late/consistently-late report is treated as a governance
// signal, not just an admin nuisance): on time (day ≤5) = 100%, days 6-7 = 85%, then a gradual
// 5-point drop per additional day, floored at 15% so the score never fully bottoms out to zero.
function computeTimelinessScore(dayOfMonth){
  if(dayOfMonth <= 5) return 100;
  if(dayOfMonth <= 7) return 85;
  return Math.max(15, 85 - (dayOfMonth - 7) * 5);
}

async function handleIndicatorsUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = (name) => {
      const ws = wb.Sheets[name];
      return ws ? XLSX.utils.sheet_to_json(ws, { header: 1 }) : null;
    };

    const rows = {
      kpi: sheet("١-لوحة المؤشرات"),
      financial: sheet("٢-الأداء المالي"),
      sales: sheet("٣-المبيعات"),
      operations: sheet("٤-التشغيل"),
      projects: sheet("٥-المشاريع"),
      hr: sheet("٦-الموارد البشرية"),
      procurement: sheet("٧-المشتريات"),
      customers: sheet("٨-العملاء وخدمة العملاء"),
      marketing: sheet("٩-التسويق"),
      legal: sheet("١٠-الشؤون القانونية والعقود"),
      subsidiaries: sheet("١١-الشركات التابعة والفروع"),
      budget: sheet("١٢-الأداء مقابل الموازنة"),
      forecast: sheet("١٣-التوقعات حتى نهاية السنة"),
      challenges: sheet("١٤-أهم التحديات"),
      priorities: sheet("١٥-أولويات الشهر القادم")
    };
    for(const k in rows){ if(!rows[k]){ alert(`الملف لا يطابق شكل القالب المتوقع (ورقة "${k}" غير موجودة) — الرجاء استخدام القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.`); return; } }

    function buildSimple(sheetRows, keyMap, numericKeys){
      const obj = {};
      keyMap.forEach((key, i) => {
        const raw = sheetRows[i] ? sheetRows[i][1] : undefined;
        obj[key] = (numericKeys && numericKeys.includes(key)) ? numOrNull(raw) : textOr(raw);
      });
      return obj;
    }

    const period_label = textOr(rows.kpi[0] ? rows.kpi[0][1] : "");
    const kpiNames = ["revenue","sales","gross_profit","profit_margin","net_profit","cash_flow","available_cash",
      "receivables","payables","sales_target","budget_achievement_pct","customer_count","new_customers",
      "retention_rate","employee_count","turnover_rate","active_projects","project_completion_pct"];
    const kpiDashboard = kpiNames.map((key, i) => {
      const r = rows.kpi[i+2] || []; // row 0 = period, row 1 = header, data starts row 2
      return { key, name: r[0]||"", target: numOrNull(r[1]), actual: numOrNull(r[2]), prev_month: numOrNull(r[3]), prev_year: numOrNull(r[4]) };
    });

    const financialObj = buildSimple(rows.financial, SEC_KEY_MAPS.financial, SEC_KEY_MAPS.financial);
    const salesObj = buildSimple(rows.sales, SEC_KEY_MAPS.sales, ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"]);
    const operationsObj = buildSimple(rows.operations, SEC_KEY_MAPS.operations, []);
    const projectRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.projects[i]?.[0]), value: numOrNull(rows.projects[i]?.[1]), client: textOr(rows.projects[i]?.[2]),
      completion_pct: numOrNull(rows.projects[i]?.[3]), status: textOr(rows.projects[i]?.[4]), notes: textOr(rows.projects[i]?.[5])
    })).filter(p=>p.name);
    const hrObj = buildSimple(rows.hr, SEC_KEY_MAPS.hr, ["total_employees","new_employees","turnover_rate"]);
    const procurementObj = buildSimple(rows.procurement, SEC_KEY_MAPS.procurement, ["total_purchases"]);
    const customersObj = buildSimple(rows.customers, SEC_KEY_MAPS.customers, ["customer_count","complaints_count"]);
    const marketingObj = buildSimple(rows.marketing, SEC_KEY_MAPS.marketing, []);
    const legalObj = buildSimple(rows.legal, SEC_KEY_MAPS.legal, []);
    const subsidiaryRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.subsidiaries[i]?.[0]), ops_ok: textOr(rows.subsidiaries[i]?.[1]), problems: textOr(rows.subsidiaries[i]?.[2])
    })).filter(s=>s.name);
    const budgetObj = buildSimple(rows.budget, SEC_KEY_MAPS.budget, []);
    const forecastObj = buildSimple(rows.forecast, SEC_KEY_MAPS.forecast, ["expected_revenue","expected_profit","expected_cashflow","expected_sales"]);
    const challengeRows = [1,2,3,4,5,6,7,8].map(i => ({ challenge: textOr(rows.challenges[i]?.[0]), details: textOr(rows.challenges[i]?.[1]) })).filter(c=>c.challenge);
    const priorityRows = rows.priorities.map(r => textOr(r[1])).filter(Boolean);

    const fileUrl = await uploadBlobToStorage(file, "ceo-reports", file.name);

    const payload = {
      company_id: currentCompanyId, period_label,
      uploaded_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", source_file_url: fileUrl,
      submitted_day_of_month: new Date().getDate(), timeliness_score: computeTimelinessScore(new Date().getDate()),
      sec_kpi_dashboard: kpiDashboard,
      sec_financial: financialObj,
      sec_sales: salesObj,
      sec_operations: operationsObj,
      sec_projects: projectRows,
      sec_hr: hrObj,
      sec_procurement: procurementObj,
      sec_customers: customersObj,
      sec_marketing: marketingObj,
      sec_legal: legalObj,
      sec_subsidiaries: subsidiaryRows,
      sec_budget: budgetObj,
      sec_forecast: forecastObj,
      sec_challenges: challengeRows,
      sec_priorities: priorityRows
    };

    let error;
    if(period_label){
      const { data: existing } = await sb.from("ceo_monthly_reports").select("id").eq("company_id", currentCompanyId).eq("period_label", period_label).limit(1);
      if(existing && existing.length){
        if(!await uiConfirm(`يوجد تقرير محفوظ مسبقًا لنفس الفترة "${period_label}" — هل تريد استبداله؟`)){ return; }
        ({ error } = await sb.from("ceo_monthly_reports").update(payload).eq("id", existing[0].id));
      } else {
        ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
      }
    } else {
      ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
    }
    if(error){ alert("تعذّر حفظ البيانات: " + error.message); return; }
    logActivity("إنشاء", "تقرير مالي وتشغيلي", period_label || "فترة جديدة", "استيراد من Excel");
    alert("تم رفع التقرير وحفظه بنجاح ✅");
    input.value = "";
    loadIndicatorsReport();
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه نفس القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.");
  }
}

function fmtNum(n){ return n==null ? "—" : Number(n).toLocaleString("ar-SA-u-ca-gregory"); }
function fieldRow(label, val, isCurrency){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val)+" ريال" : val;
  return `<div style="padding:6px 0;border-bottom:1px solid var(--gray1);font-size:12px"><b style="color:var(--gray3)">${label}:</b> <span style="color:var(--dark)">${display}</span></div>`;
}
function sectionCard(title, innerHtml){
  if(!innerHtml || !innerHtml.trim()) return "";
  return `<div class="card" style="margin-bottom:16px"><div class="card-head"><span class="card-title">${title}</span></div><div class="card-body">${innerHtml}</div></div>`;
}
function tableFromRows(rows, cols){
  if(!rows || rows.length===0) return "";
  const head = cols.map(c=>`<th>${c}</th>`).join("");
  const body = rows.map(r => `<tr>${Object.values(r).map(v=>`<td>${(v!=null&&v!=="")?v:"—"}</td>`).join("")}</tr>`).join("");
  return `<table class="tbl" style="margin-top:6px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
// A small colored "KPI-style" tile — reuses the exact card language already used on the
// dashboard (colored stripe, big bold figure, faint icon watermark) so numeric report fields
// read as a proper statistic instead of a plain text line like "إجمالي الربح: 10000000 ريال".
function statCard(icon, label, val, isCurrency, color){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val) : val;
  return `<div class="kpi ${color||'blue'}" style="padding:14px 16px;min-width:0">
    <div class="kpi-stripe"></div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-val" style="font-size:21px;word-break:break-word">${display}${isCurrency?'<span style="font-size:12px;font-weight:700;color:var(--gray3)"> ريال</span>':''}</div>
    <div class="kpi-icon">${icon}</div>
  </div>`;
}
function statGrid(cards){
  const filled = cards.filter(Boolean);
  if(!filled.length) return "";
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${filled.join("")}</div>`;
}
// For narrative/free-text fields — a labeled callout block instead of a bare "label: value" line.
function textBlock(icon, label, text){
  if(!text) return "";
  return `<div style="background:var(--offwhite);border-radius:10px;padding:10px 14px;margin-top:10px">
    <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:4px">${icon} ${label}</div>
    <div style="font-size:12.5px;color:var(--dark);line-height:1.7">${text}</div>
  </div>`;
}
function textBlocks(items){ return items.filter(Boolean).join(""); }

async function loadIndicatorsReport(){
  const box = document.getElementById("indicatorsReport");
  if(!box) return;
  const pdfBtn = document.getElementById("indicatorsPdfBtn");
  if(pdfBtn) pdfBtn.style.display = isFullAccessRole(getCurrentRole()) ? "inline-block" : "none";
  const { data, error } = await sb.from("ceo_monthly_reports").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1);
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا توجد بيانات مستوردة بعد. نزّل النموذج وابدأ.</div>';
    return;
  }
  const r = data[0];
  const F = r.sec_financial||{}, SA = r.sec_sales||{}, OP = r.sec_operations||{},
        HR = r.sec_hr||{}, PR = r.sec_procurement||{}, CU = r.sec_customers||{},
        MK = r.sec_marketing||{}, LG = r.sec_legal||{},
        BU = r.sec_budget||{}, FC = r.sec_forecast||{};
  const kpis = r.sec_kpi_dashboard||[];
  const projects = r.sec_projects||[];
  const subsidiaries = r.sec_subsidiaries||[];
  const challenges = r.sec_challenges||[];
  const priorities = r.sec_priorities||[];

  const netProfit = (F.revenue!=null && F.total_expenses!=null) ? F.revenue - F.total_expenses : null;

  const kpiRows = kpis.filter(k=>k.name).map(k => {
    const variance = (k.target!=null && k.actual!=null && k.target!==0) ? (((k.actual-k.target)/Math.abs(k.target))*100).toFixed(1)+"%" : "—";
    const varColor = (k.target!=null && k.actual!=null) ? (k.actual>=k.target ? "var(--green)" : "var(--red)") : "var(--gray3)";
    return `<tr><td>${orgEsc(k.name)}</td><td>${fmtNum(k.target)}</td><td>${fmtNum(k.actual)}</td><td>${fmtNum(k.prev_month)}</td><td>${fmtNum(k.prev_year)}</td><td style="color:${varColor};font-weight:700">${variance}</td></tr>`;
  }).join("");

  box.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--primary),var(--primary2));border-radius:12px;padding:14px 18px;margin-bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b>التقرير المالي والتشغيلي — ${r.period_label||"—"}</b>${r.submitted_day_of_month ? `<div style="font-size:11px;opacity:0.85;margin-top:2px">رُفع في اليوم ${r.submitted_day_of_month} من الشهر — درجة الانضباط: ${r.timeliness_score}%</div>` : ""}</div>
      ${r.source_file_url ? `<a href="${r.source_file_url}" target="_blank" style="color:#fff;font-size:11px;text-decoration:underline"><span class="ico-i ico-document"></span>الملف الأصلي</a>` : ""}
    </div>

    ${sectionCard("١) لوحة مؤشرات الأداء الرئيسية — المستهدف مقابل الفعلي والانحراف", kpiRows ? `<table class="tbl"><thead><tr><th>المؤشر</th><th>المستهدف</th><th>الفعلي</th><th>الشهر السابق</th><th>نفس الشهر بالعام السابق</th><th>الانحراف</th></tr></thead><tbody>${kpiRows}</tbody></table>` : "")}

    ${sectionCard("٢) الأداء المالي", statGrid([
      statCard("💰","الإيرادات", F.revenue, true, "blue"),
      statCard("📈","إجمالي الربح", F.gross_profit, true, "green"),
      statCard("📉","إجمالي المصروفات", F.total_expenses, true, "red"),
      statCard("💵","صافي الربح", netProfit, true, "gold"),
      statCard("🏢","المصروفات الإدارية", F.admin_expenses, true, "blue"),
      statCard("📣","مصروفات المبيعات والتسويق", F.sales_marketing_expenses, true, "blue"),
      statCard("👥","الرواتب", F.salaries, true, "blue")
    ]))}

    ${sectionCard("٣) المبيعات", statGrid([
      statCard("🧾","المبيعات الشهرية", SA.monthly_sales, true, "blue"),
      statCard("🎯","المستهدف الشهري", SA.monthly_target, true, "gold"),
      statCard("📊","المبيعات منذ بداية السنة", SA.ytd_sales, true, "blue"),
      statCard("🆕","عملاء جدد", SA.new_customers, false, "green"),
      statCard("⚠️","عملاء متوقفون", SA.lost_customers, false, "red"),
      statCard("📄","عقود مُقدَّمة", SA.submitted_contracts_count, false, "blue")
    ]))}

    ${sectionCard("٤) التشغيل", textBlocks([
      textBlock("⚙️","حجم الأعمال المنفذة", OP.work_volume),
      textBlock("🔧","الأعطال والتوقفات", OP.breakdowns_downtime),
      textBlock("✅","الإجراءات التصحيحية", OP.corrective_actions),
      textBlock("❗","أهم المشكلات التشغيلية", OP.operational_issues)
    ]))}

    ${sectionCard("٥) المشاريع", tableFromRows(projects.map(p=>({
      name: p.name, value: p.value!=null?fmtNum(p.value)+" ريال":"—", client: p.client,
      completion: p.completion_pct!=null?p.completion_pct+"%":"—", status: p.status, notes: p.notes
    })), ["المشروع","القيمة","العميل","نسبة الإنجاز","الحالة","ملاحظات"]))}

    ${sectionCard("٦) الموارد البشرية", statGrid([
      statCard("👥","إجمالي الموظفين", HR.total_employees, false, "blue"),
      statCard("🆕","موظفون جدد", HR.new_employees, false, "green"),
      statCard("📉","معدل الدوران", HR.turnover_rate, false, "red")
    ]) + textBlocks([
      textBlock("👋","الاستقالات وإنهاء الخدمة", HR.resignations),
      textBlock("🪑","الوظائف الشاغرة والحرجة", HR.vacant_critical_roles),
      textBlock("📋","الوظائف المطلوب توظيفها", HR.roles_to_hire),
      textBlock("🎓","التدريب والتطوير", HR.training),
      textBlock("⚠️","المشاكل العمالية", HR.labor_issues),
      textBlock("🔮","الاحتياجات المستقبلية", HR.future_needs)
    ]))}

    ${sectionCard("٧) المشتريات", statGrid([
      statCard("📦","إجمالي المشتريات", PR.total_purchases, true, "blue")
    ]) + textBlocks([
      textBlock("📊","المشتريات مقارنة بالموازنة", PR.purchases_vs_budget),
      textBlock("🆕","الموردون الجدد", PR.new_suppliers)
    ]))}

    ${sectionCard("٨) العملاء وخدمة العملاء", statGrid([
      statCard("👤","عدد العملاء", CU.customer_count, false, "blue"),
      statCard("💬","عدد الشكاوى", CU.complaints_count, false, "red")
    ]) + textBlocks([
      textBlock("🔄","عملاء جدد ومفقودون", CU.new_lost_customers),
      textBlock("💚","معدل الاحتفاظ بالعملاء", CU.retention_rate),
      textBlock("😊","مستوى الرضا", CU.satisfaction_level),
      textBlock("⏱️","زمن المعالجة والشكاوى المفتوحة", CU.complaints_resolution),
      textBlock("⭐","أهم العملاء", CU.top_customers),
      textBlock("⚠️","عملاء معرّضون لخطر الفقدان", CU.at_risk_customers),
      textBlock("✅","إجراءات تحسين الرضا", CU.improvement_actions)
    ]))}

    ${sectionCard("٩) التسويق", textBlocks([
      textBlock("📣","الحملات التسويقية", MK.campaigns),
      textBlock("🆕","عملاء ناتجون عن الحملات", MK.campaign_customers),
      textBlock("💻","الأداء الرقمي", MK.digital_performance),
      textBlock("🏁","تقييم الأداء مقارنة بالمنافسين", MK.vs_competitors),
      textBlock("💡","فرص تسويقية جديدة", MK.new_opportunities)
    ]))}

    ${sectionCard("١٠) الشؤون القانونية والعقود", textBlocks([
      textBlock("⚖️","القضايا", LG.legal_cases),
      textBlock("💰","قيمة المطالبات", LG.claims_value),
      textBlock("📄","حالة العقود", LG.contracts_status),
      textBlock("🤝","النزاعات", LG.disputes),
      textBlock("⚠️","المخاطر القانونية", LG.legal_risks)
    ]))}

    ${sectionCard("١١) الشركات التابعة والفروع", tableFromRows(subsidiaries, ["الشركة/الفرع","التشغيل سليم؟","المشاكل"]))}

    ${sectionCard("١٢) الأداء مقابل الموازنة", textBlocks([
      textBlock("💰","الإيرادات", BU.revenue_vs_plan), textBlock("📈","الأرباح", BU.profit_vs_plan), textBlock("📉","المصروفات", BU.expenses_vs_plan),
      textBlock("💵","التدفقات النقدية", BU.cashflow_vs_plan), textBlock("🧾","المبيعات", BU.sales_vs_plan), textBlock("👤","عدد العملاء", BU.customers_vs_plan),
      textBlock("🏗️","المشاريع", BU.projects_vs_plan), textBlock("📊","الاستثمارات", BU.investments_vs_plan), textBlock("👥","الموارد البشرية", BU.hr_vs_plan),
      textBlock("❗","أسباب الانحرافات والإجراءات", BU.variance_reasons)
    ]))}

    ${sectionCard("١٣) التوقعات حتى نهاية السنة", statGrid([
      statCard("💰","الإيرادات المتوقعة", FC.expected_revenue, true, "blue"),
      statCard("📈","الأرباح المتوقعة", FC.expected_profit, true, "green"),
      statCard("💵","التدفقات النقدية المتوقعة", FC.expected_cashflow, true, "gold"),
      statCard("🧾","المبيعات المتوقعة", FC.expected_sales, true, "blue")
    ]) + textBlocks([
      textBlock("📄","العقود المتوقع توقيعها", FC.expected_contracts),
      textBlock("🏗️","المشاريع المتوقع إنجازها", FC.expected_projects),
      textBlock("⚠️","مخاطر مؤثرة على النتائج", FC.risks_affecting_results),
      textBlock("❓","هل ستتحقق الموازنة السنوية؟", FC.budget_achievable),
      textBlock("🔧","حاجة لتعديل التوقعات؟", FC.forecast_adjustment_needed)
    ]))}

    ${sectionCard("١٤) أهم التحديات", tableFromRows(challenges, ["التحدي","التفاصيل"]))}

    ${sectionCard("١٥) أولويات الشهر القادم", priorities.length ? `<ol style="margin:0;padding-inline-start:18px;font-size:12px;line-height:2">${priorities.map(p=>`<li>${p}</li>`).join("")}</ol>` : "")}
  `;
}

function exportIndicatorsPDF(){
  const reportBox = document.getElementById("indicatorsReport");
  if(!reportBox || !reportBox.querySelector(".card")){ alert("لا توجد بيانات مرفوعة بعد لتصديرها."); return; }
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التصدير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التقرير المالي والتشغيلي — ${companyName}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      .card-title,.card-head{font-size:14px;font-weight:800;color:#1A3A6B;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right;font-size:11px}
      th{background:#1A3A6B;color:#fff}
      .card{border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:12px;page-break-inside:avoid}
      a{display:none}
    </style></head><body>
    <h1><span class="ico-i ico-dashboard"></span>التقرير المالي والتشغيلي — ${companyName}</h1>
    <p>تاريخ التصدير: ${dateNow}</p>
    ${reportBox.innerHTML}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
    </body></html>
  `);
  w.document.close();
}


function exportPositionsList(){
  if(!structureCache || structureCache.length===0){ alert("لا توجد بيانات للتصدير."); return; }
  const head = ["#","المنصب / اسم الجهة","الاسم","يتبع لـ","المستوى","تاريخ التعيين","جهة/مجلس؟","بالشجرة؟","خط جانبي؟"];
  const sorted = structureCache.slice().sort((x,y) => (x.level ?? 99) - (y.level ?? 99) || (x.id||0) - (y.id||0));
  const aoa = [head].concat(sorted.map((r,i) => [
    i+1, r.position_title||"", r.holder_name||"", r.parent_position||"", orgLevelLabel(r.level),
    r.appointment_date||"", r.is_body ? "نعم" : "لا", r.is_leadership !== false ? "نعم" : "لا", orgIsSideRaw(r) ? "نعم" : "لا"
  ]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths follow the longest value in each column so names and titles are never cut off.
  ws["!cols"] = head.map((_,c) => ({ wch: Math.min(60, Math.max(8, ...aoa.map(r => String(r[c] ?? "").length)) + 4) }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1, c:head.length-1} }) };
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الهيكل التنظيمي");
  XLSX.writeFile(wb, "دليل المناصب التنظيمية.xlsx");
}

/* PDF header facts: the company's real name, the approval date if the structure was approved (otherwise the export date), and a version number = how many times it was approved. */
async function orgPdfMeta(type){
  type = type || "structure";
  let companyName = "";
  try{ const { data } = await sb.from("companies").select("name").eq("id", currentCompanyId).single(); companyName = (data && typeof data.name === "string") ? data.name : ""; }catch(e){}
  if(!companyName) companyName = (document.getElementById("reportCompanyName1")?.textContent || "").replace(/^—$/, "") || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const fmt = d => new Date(d).toLocaleDateString("ar-SA-u-ca-gregory");
  let dateTitle = "تاريخ التصدير", dateLabel = fmt(new Date()), version = "مسودة", approved = false, approvers = [], count = 0;
  try{
    const { data: reqs } = await sb.from("approval_requests").select("id,status,approved_at,created_at").eq("company_id", currentCompanyId).eq("request_type", type).order("created_at",{ascending:false});
    const ok = Array.isArray(reqs) ? reqs.filter(r => r.status === "معتمد") : [];
    count = ok.length;
    if(ok.length){
      const last = ok.slice().sort((a,b) => new Date(b.approved_at || b.created_at) - new Date(a.approved_at || a.created_at))[0];
      approved = true; dateTitle = "تاريخ الاعتماد"; dateLabel = fmt(last.approved_at || last.created_at); version = ok.length + ".0";
      const { data: votes } = await sb.from("approval_votes").select("reviewer_name,reviewer_email").eq("request_id", last.id);
      if(Array.isArray(votes)) approvers = votes.map(v => v.reviewer_name || v.reviewer_email).filter(Boolean);
    }
  }catch(e){}
  return { companyName, dateTitle, dateLabel, version, approved, approvers, count };
}
/* Header block for governance PDFs: status (draft / approved), version, date and who approved. */
function approvalHeaderHTML(meta, esc, extraLabel){
  const status = meta.approved ? "معتمد" : "مسودة (غير معتمدة)";
  const col = meta.approved ? "#1B7F4B" : "#9C7A2E";
  return `<div style="font-size:12px;color:#5b6678;line-height:1.8"><div><b style="color:${col}">الحالة: ${status}</b></div><div>رقم النسخة: ${esc(extraLabel || meta.version)}</div><div>${esc(meta.dateTitle)}: ${esc(meta.dateLabel)}</div>${meta.approved && meta.approvers.length ? `<div>اعتمده: ${meta.approvers.map(esc).join("، ")}</div>` : ""}</div>`;
}
/* Printable copy of the permissions matrix: every dropdown becomes its letter, read from the LIVE table (a detached clone loses the selected value). */
function permPrintableTable(table){
  const clone = table.cloneNode(true);
  clone.querySelectorAll("button").forEach(b => b.remove());
  const live = table.querySelectorAll("select"), copy = clone.querySelectorAll("select");
  const colors = { "ع":["#1A3A6B","#fff"], "ت":["#0C8B87","#fff"], "م":["#D4AF37","#0D2447"] };
  copy.forEach((sel, k) => {
    const v = (live[k] && live[k].value) || "";
    const span = document.createElement("span");
    span.textContent = v || "—";
    const c = colors[v];
    span.style.cssText = c ? `display:inline-block;min-width:26px;font-weight:900;padding:3px 8px;border-radius:6px;background:${c[0]};color:${c[1]}` : "display:inline-block;color:#9aa4b2";
    sel.parentNode.replaceChild(span, sel);
  });
  clone.querySelectorAll("th").forEach(th => { th.style.background = "#1A3A6B"; th.style.color = "#fff"; });
  return clone;
}
async function exportOrgTreePDF(){
  const treeRows = orgTreeRows(structureCache);
  if(!treeRows.length){ alert("لا توجد شجرة لتصديرها."); return; }
  if(typeof html2pdf === "undefined"){ alert("تعذّر تحميل أداة إنشاء PDF — تحقق من الاتصال بالإنترنت ثم أعد المحاولة."); return; }
  const meta = await orgPdfMeta("structure");
  const companyName = meta.companyName;
  const dateNow = meta.dateLabel;
  const esc = orgEsc;
  const byLevel = (x,y) => (x.level ?? 99) - (y.level ?? 99) || (x.id||0) - (y.id||0);

  // Page 1 = the top of the structure. Joint-stock / LLC: levels 1-5 (assembly, board, committees, CEO, senior management).
  // Sole proprietorship / single-owner LLC: owner, manager and the main departments (levels up to 6).
  const small = orgLevelKind() === "small";
  const cut = small ? 6 : 5;
  let summaryRows = treeRows.filter(r => (r.level ?? 0) <= cut);
  // Side units (e.g. the CEO office, which keeps its own level colour) stay next to the unit they belong to on page 1.
  const summaryTitles = new Set(summaryRows.map(r => r.position_title));
  summaryRows = summaryRows.concat(treeRows.filter(r => (r.level ?? 0) > cut && orgIsSideRaw(r) && summaryTitles.has(r.parent_position)));
  const descendants = root => {
    const out = [root], seen = new Set([root.id]), q = [root];
    while(q.length){ const cur = q.shift(); treeRows.forEach(r => { if(r.parent_position === cur.position_title && !seen.has(r.id)){ seen.add(r.id); out.push(r); q.push(r); } }); }
    return out;
  };
  // One detail page for every senior position that has departments under it (departments side by side,
  // their sections and units hanging below each one). For the small entities there is a single page.
  const isDept = r => (r.level ?? 0) >= 6 && !orgIsSideRaw(r);
  let detailRoots = treeRows.filter(r => (r.level ?? 0) <= 5 && !orgIsSideRaw(r) && treeRows.some(k => k.parent_position === r.position_title && isDept(k))).sort(byLevel);
  if(small) detailRoots = detailRoots.filter(r => descendants(r).some(d => d.parent_position && treeRows.some(t => t.position_title === d.parent_position && isDept(t)) && isDept(d)));
  let detailed = false;
  if(detailRoots.length){
    detailed = await uiConfirm("الصفحة الأولى تعرض أعلى الهيكل.\n\nهل تريد أيضًا صفحات تفصيلية تعرض الإدارات وتحتها الأقسام والوحدات؟\n\nموافق = الصفحة الأولى + التفاصيل، إلغاء = الصفحة الأولى فقط.");
  }

  const others = (structureCache || []).filter(r => r.is_leadership === false).sort(byLevel);
  let includeOthers = false;
  if(others.length){
    includeOthers = await uiConfirm("توجد مناصب وإدارات غير معروضة في الشجرة. هل تريد إضافتها في صفحة مستقلة بآخر ملف PDF؟\n\nموافق = إضافتها، إلغاء = بدونها.");
  }

  const th = "border:1px solid #cfd6e0;padding:7px 8px;background:#1A3A6B;color:#fff;font-size:12px;text-align:right";
  const td = "border:1px solid #cfd6e0;padding:6px 8px;font-size:12px;text-align:right";
  const head = (title, withDate) => `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:14px"><div style="font-size:21px;font-weight:800;color:#1A3A6B">${title}</div>${approvalHeaderHTML(meta, esc)}</div>`;
  const fit = html => `<div class="orgpdf-box" style="margin:0 auto"><div class="orgpdf-inner" style="display:inline-block;transform-origin:top right">${html}</div></div>`;

  let pages = `<div>${head("الهيكل التنظيمي — " + esc(companyName), true)}${fit(renderOrgTree(summaryRows, { static:true }))}</div>`;
  if(detailed){
    detailRoots.forEach(r => {
      const sub = descendants(r);
      pages += `<div style="page-break-before:always">${head("الإدارات التابعة لـ " + esc(r.position_title) + " — " + esc(companyName), false)}${fit(renderOrgTree(sub, { static:true, expandAll:true }))}</div>`;
    });
  }
  if(includeOthers){
    pages += `
    <div style="page-break-before:always;padding-top:4px">
      ${head("ملحق: إدارات ومناصب أخرى غير معروضة في الشجرة — " + esc(companyName), false)}
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <thead><tr><th style="${th};width:40px">#</th><th style="${th}">المنصب</th><th style="${th}">الاسم</th><th style="${th}">يتبع لـ</th><th style="${th}">المستوى</th></tr></thead>
        <tbody>${others.map((r,i) => `<tr style="page-break-inside:avoid"><td style="${td}">${i+1}</td><td style="${td};font-weight:700">${esc(r.position_title)}</td><td style="${td}">${esc(r.holder_name||"—")}</td><td style="${td}">${esc(r.parent_position||"—")}</td><td style="${td}">${esc(orgLevelLabel(r.level))}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "width:1040px;direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;color:#0D2447;background:#fff";
  wrapper.innerHTML = pages;
  // The off-screen offset lives on a holder, not on the wrapper: html2pdf clones the wrapper with its
  // inline styles, and a cloned element still pushed off-screen renders as a blank PDF.
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;top:0;left:-20000px;width:1040px;pointer-events:none";
  holder.appendChild(wrapper);
  document.body.appendChild(holder);
  try{
    // Shrink each drawing so it fits its landscape A4 page (about 1040 x 500 px of usable area).
    wrapper.querySelectorAll(".orgpdf-box").forEach(box => {
      const inner = box.querySelector(".orgpdf-inner");
      const natW = inner.offsetWidth || 1, natH = inner.offsetHeight || 1;
      const scale = Math.max(0.3, Math.min(1, 1040 / natW, 500 / natH));
      inner.style.transform = `scale(${scale})`;
      box.style.width = Math.ceil(natW * scale) + "px";
      box.style.height = Math.ceil(natH * scale) + "px";
    });
    await html2pdf().from(wrapper).set({
      margin: 10,
      filename: `الهيكل-التنظيمي-${companyName}.pdf`.replace(/[\\/:*?"<>|]/g, "-"),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] }
    }).save();
  }catch(e){
    alert("تعذّر توليد ملف PDF: " + (e && e.message ? e.message : e));
  }finally{
    if(holder.parentNode) holder.parentNode.removeChild(holder);
  }
}

async function exportPermissionsMatrix(){
  await loadPermissionsMatrix();
  const table = document.getElementById("permMatrixTable");
  if(!table){ alert("تعذّر تحميل مصفوفة الصلاحيات."); return; }
  const clone = permPrintableTable(table);
  const ws = XLSX.utils.table_to_sheet(clone);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مصفوفة الصلاحيات");
  XLSX.writeFile(wb, "مصفوفة الصلاحيات.xlsx");
}

function exportActivityLogExcel(){
  exportToExcel(activityLogCache, [
    { label:"الوقت", key:"created_at", value: r => r.created_at ? new Date(r.created_at).toLocaleString('ar-SA-u-ca-gregory') : "" },
    { label:"المستخدم", key:"actor_name" }, { label:"نوع الإجراء", key:"action_type" },
    { label:"العنصر", key:"entity_type" }, { label:"اسم العنصر", key:"entity_label" }, { label:"التفاصيل", key:"details" }
  ], "سجل النشاط");
}

function exportActivityLogPDF(){
  if(!activityLogCache || activityLogCache.length === 0){ alert("لا يوجد نشاط لتصديره."); return; }
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التصدير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const rows = activityLogCache.map(a => `<tr>
    <td>${new Date(a.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td><td>${orgEsc(a.actor_name||a.actor_email||"—")}</td>
    <td>${a.action_type||""} ${a.entity_type||""}</td><td>${a.entity_label||"—"}</td><td>${a.details||""}</td>
  </tr>`).join("");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سجل النشاط — ${companyName}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{border:1px solid #ccc;padding:8px;text-align:right;font-size:11px}
      th{background:#1A3A6B;color:#fff}
    </style></head><body>
    <h1><span class="ico-i ico-scroll"></span>سجل النشاط — ${companyName}</h1>
    <p>تاريخ التصدير: ${dateNow}</p>
    <table><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>العنصر</th><th>التفاصيل</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}

async function exportUsersList(){
  const { data } = await sb.from("user_profiles").select("*").eq("company_id", currentCompanyId);
  exportToExcel(data||[], [
    { label:"الاسم", key:"full_name" }, { label:"الإيميل", key:"email" }, { label:"الدور", key:"role" },
    { label:"رقم الهوية", key:"national_id" }, { label:"الجوال", key:"phone_number" }
  ], "فريق حوكمة الشركة");
}
