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
