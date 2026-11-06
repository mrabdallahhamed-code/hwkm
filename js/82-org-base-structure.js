async function generateBaseStructure(){
  const { data: company } = await sb.from("companies").select("company_type,llc_single_manager,llc_single_owner").eq("id", currentCompanyId).single();
  const type = company ? company.company_type : "مساهمة غير مدرجة";
  const isLLCSingleOwner = type === "ذات مسؤولية محدودة" && !!company?.llc_single_owner;

  let rows = [];
  if(type === "مؤسسة فردية"){
    if(!await uiConfirm('سيُضاف: المالك ← المدير العام ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير العام / التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(isLLCSingleOwner){
    // A single-person LLC has no partners' assembly and no council of managers to route through
    // — it's structurally the same shape as a sole proprietorship (owner, then CEO, then
    // departments), just under a different legal form.
    if(!await uiConfirm('سيُضاف: المالك ← المدير التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(type === "ذات مسؤولية محدودة"){
    if(!await uiConfirm('سيُضاف: جمعية الشركاء ← مجلس المديرين ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "جمعية الشركاء", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس المديرين", parent_position: "جمعية الشركاء", level: 2, is_body: true },
      { position_title: "الرئيس التنفيذي", parent_position: "مجلس المديرين", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else {
    // مساهمة مدرجة / مساهمة غير مدرجة (default)
    if(!await uiConfirm('سيُضاف: الجمعية العامة ← مجلس الإدارة ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "الجمعية العامة", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس الإدارة", parent_position: "الجمعية العامة", level: 2, is_body: true },
      // Insertion order matters here: in this RTL layout the first child of "مجلس الإدارة"
      // renders on the right, the last on the left — so اللجان المنبثقة (right), رئيس مجلس
      // الإدارة (center, with الرئيس التنفيذي nested directly beneath it — giving the
      // "stacked in one line" look requested), then أمين سر المجلس (left).
      { position_title: "اللجان المنبثقة", parent_position: "مجلس الإدارة", level: 2, is_body: true },
      { position_title: "رئيس مجلس الإدارة", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الرئيس التنفيذي", parent_position: "رئيس مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "أمين سر المجلس", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التسويق وخدمة العملاء", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "الإدارة القانونية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  }

  // Replace-by-name: remove any existing position/body with the exact same title first, so
  // regenerating doesn't create duplicates or leave a mis-wired older copy behind — while
  // any custom positions the company added themselves (different titles) stay untouched.
  const titles = rows.map(r => r.position_title);
  await sb.from("org_structure").delete().eq("company_id", currentCompanyId).in("position_title", titles);

  const payload = rows.map(r => ({ ...r, company_id: currentCompanyId }));
  const { error } = await sb.from("org_structure").insert(payload);
  if(error){ alert("تعذّر إنشاء الهيكل: " + error.message); return; }
  alert("تم إنشاء الهيكل ✅ — أضف بقية المناصب وتأكد كل واحد يتبع للجهة الصحيحة.");
  loadStructure();
}

async function deletePosition(id){
  if(!await uiConfirm("حذف هذا المنصب سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadStructure();
}
