/* ══════════ POLICIES (governance) ══════════ */
let policiesCache = [];
const POLICY_STAGES = ["مسودة", "معتمدة من لجنة الحوكمة", "مرفوعة لمجلس الإدارة", "مرفوعة للجمعية العامة", "معتمدة نهائيًا"];

/* The stage sequence isn't one-size-fits-all: a company with no governance committee can't
   realistically pass through "معتمدة من لجنة الحوكمة", and a policy that only needs board
   sign-off shouldn't be stuck waiting on an AGM step it was never marked as needing. Both
   checks are cached per page-load in policyStageContext to avoid refetching committees on
   every single card render. */
let policyStageContext = { hasGovernanceCommittee: false, loaded: false };

async function loadPolicyStageContext(){
  const { data } = await sb.from("committees").select("committee_name,category").eq("company_id", currentCompanyId);
  policyStageContext.hasGovernanceCommittee = (data||[]).some(c => (c.committee_name||"").includes("حوكمة") || (c.category||"").includes("حوكمة"));
  policyStageContext.loaded = true;
}

function getPolicyStageSequence(policy){
  return POLICY_STAGES.filter(s => {
    if(s === "معتمدة من لجنة الحوكمة" && !policyStageContext.hasGovernanceCommittee) return false;
    if(s === "مرفوعة للجمعية العامة" && policy.approval_level !== "جمعية عامة") return false;
    return true;
  });
}

const POLICY_CATEGORY_ICONS = {
  "سياسات الجمعية العامة": "🤝",
  "سياسات ولوائح المجلس": "🏛️",
  "سياسات ولوائح اللجان": "👥",
  "سياسات الموارد البشرية": "🧑‍💼",
  "السياسات المالية": "💰",
  "سياسة المشتريات": "🛒",
  "سياسة المبيعات وخدمة العملاء": "🤝",
  "لوائح داخلية": "🗂️",
  // Categories for limited-liability companies and sole proprietorships
  "سياسات الحوكمة والصلاحيات": "🏛️",
  "السياسات التجارية والتعاقدات": "📑",
  "سياسات المشتريات": "🛒",
  "سياسات التشغيل والجودة والسلامة": "🏭",
  "السياسات المالية والمحاسبية": "💰",
  "سياسات الموارد البشرية وشؤون الموظفين": "🧑‍💼",
  "سياسات أمن المعلومات وحماية البيانات": "🔐"
};
// One shared list for limited-liability companies and sole proprietorships.
const SME_POLICY_CATEGORIES = [
  "سياسات الحوكمة والصلاحيات",
  "السياسات التجارية والتعاقدات",
  "سياسات المشتريات",
  "سياسات التشغيل والجودة والسلامة",
  "السياسات المالية والمحاسبية",
  "سياسات الموارد البشرية وشؤون الموظفين",
  "سياسات أمن المعلومات وحماية البيانات"
];
// The 4 operational categories are visually grouped under one "سياسات تشغيلية" section header
// wherever policies are displayed — they remain individually selectable leaf categories on each
// policy itself (so filtering/workflow-routing per category still works exactly as before).
const OPERATIONAL_POLICY_CATEGORIES = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];

function policyStageStepper(status, policy){
  const stages = policy ? getPolicyStageSequence(policy) : POLICY_STAGES;
  const idx = stages.indexOf(status);
  const currentIdx = idx === -1 ? 0 : idx;
  return `<div style="display:flex;align-items:center;margin:10px 0">
    ${stages.map((stage, i) => {
      const done = i < currentIdx;
      const active = i === currentIdx;
      const dotColor = done ? "var(--green)" : active ? "var(--primary)" : "var(--gray1)";
      const lineColor = i < currentIdx ? "var(--green)" : "var(--gray1)";
      return `<div style="display:flex;align-items:center;flex:${i<stages.length-1?'1':'0'}">
        <div title="${displayStageLabel(stage)}" style="width:${active?'14px':'10px'};height:${active?'14px':'10px'};border-radius:50%;background:${dotColor};${active?'box-shadow:0 0 0 4px rgba(15,33,56,0.15)':''};flex-shrink:0"></div>
        ${i<stages.length-1 ? `<div style="flex:1;height:3px;background:${lineColor};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div>
  <div style="font-size:10px;color:var(--gray3);text-align:center;font-weight:700">${displayStageLabel(status||"مسودة")}</div>`;
}

let policyActiveCategory = "الكل";
let currentCompanyPolicyDeadlineDays = 14;
async function loadPolicies(){
  const wrap = document.getElementById("policiesCards");
  const [{ data, error }, { data: companyRow }] = await Promise.all([
    sb.from("policies").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("companies").select("policy_stage_deadline_days").eq("id", currentCompanyId).single()
  ]);
  if(error){
    wrap.innerHTML = '<div style="text-align:center;color:var(--red);font-size:12px;padding:14px">تعذّر تحميل السياسات: '+error.message+'</div>';
    return;
  }
  currentCompanyPolicyDeadlineDays = companyRow?.policy_stage_deadline_days ?? 14;
  await loadPolicyStageContext();
  policiesCache = data || [];

  // Position-based visibility: مدير المشتريات only sees سياسة المشتريات, etc. Full-access
  // roles (مدير النظام / رئيس مجلس / سكرتير المجلس) and anyone with no restriction configured
  // still see everything — the restriction only kicks in once an admin has actually set it.
  const myRole = getCurrentRole();
  if(!isFullAccessRole(myRole)){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData?.user?.email;
    const { data: membership } = await sb.from("user_company_memberships").select("allowed_policy_categories")
      .eq("company_id", currentCompanyId).eq("email", myEmail).maybeSingle();
    const allowed = membership?.allowed_policy_categories;
    if(Array.isArray(allowed) && allowed.length > 0){
      policiesCache = policiesCache.filter(p => allowed.includes(p.category));
    }
  }

  renderPolicyPills();
  renderPoliciesFiltered();
}

/* Policy categories aren't one-size-fits-all: every company (regardless of type) runs HR,
   finance, procurement, and sales/customer operations, so those stay universal. Governance-
   specific categories (board/AGM/committee policies) only make sense — and only get added —
   for company types that actually have those bodies. */
function getPolicyCategoriesForCompany(){
  const operational = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];
  // Sole proprietorships and limited-liability companies (single or multiple owners/managers)
  // share one practical category list covering governance, commercial, procurement,
  // operations, finance, HR and information security.
  if(currentCompanyType === "مؤسسة فردية" || currentCompanyType === "ذات مسؤولية محدودة") return [...SME_POLICY_CATEGORIES];

  return ["سياسات الجمعية العامة", "سياسات ولوائح المجلس", "سياسات ولوائح اللجان", ...operational, "لوائح داخلية"];
}

function renderPolicyPills(){
  const box = document.getElementById("policyCategoryPills");
  if(!box) return;
  const categoryOrder = getPolicyCategoriesForCompany();
  const present = [...new Set(policiesCache.map(p => p.category || "لوائح داخلية"))];
  const cats = categoryOrder.filter(c => present.includes(c)).concat(present.filter(c => !categoryOrder.includes(c)));

  const pill = (label, key, count, icon) => {
    const active = policyActiveCategory === key;
    return `<button onclick="setPolicyCategory('${key}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'};transition:.15s">${icon?icon+' ':''}${label}${count!=null?` <span style="opacity:.75">(${count})</span>`:''}</button>`;
  };

  let html = pill("الكل", "الكل", policiesCache.length, "📚");
  cats.forEach(c => {
    const count = policiesCache.filter(p => (p.category||"لوائح داخلية")===c).length;
    html += pill(c, c, count, POLICY_CATEGORY_ICONS[c] || "📁");
  });
  box.innerHTML = html;
}

function setPolicyCategory(cat){
  policyActiveCategory = cat;
  renderPolicyPills();
  renderPoliciesFiltered();
}

function renderPoliciesFiltered(){
  loadPolicyReviewSection();
  const wrap = document.getElementById("policiesCards");
  if(!wrap) return;
  const searchEl = document.getElementById("policySearchInput");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";

  let list = policiesCache;
  if(policyActiveCategory !== "الكل") list = list.filter(p => (p.category||"لوائح داخلية") === policyActiveCategory);
  if(search) list = list.filter(p => (p.policy_name||"").toLowerCase().includes(search));

  if(policiesCache.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بعد. اضغط "+ إضافة سياسة" للبدء.</div>';
    return;
  }
  if(list.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات مطابقة لبحثك.</div>';
    return;
  }

  const statusBadge = (s) => {
    if(s === "معتمدة نهائيًا") return '<span class="badge done">معتمدة نهائيًا ✅</span>';
    if(s === "تجديد مطلوب") return '<span class="badge urgent">تجديد مطلوب</span>';
    if(s === "مسودة") return '<span class="badge pending">مسودة</span>';
    return '<span class="badge info">'+ displayStageLabel(s || "مسودة") +'</span>';
  };
  // Group the filtered policies by category so cards of the same category sit together
  const categoryOrder = getPolicyCategoriesForCompany();
  const groups = {};
  list.forEach(p => {
    const cat = p.category || "لوائح داخلية";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  const allCats = Object.keys(groups).sort((a,b)=>{
    const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b,'ar');
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });

  let html = "";
  let operationalHeaderShown = false;
  allCats.forEach(cat => {
    // Show one shared "سياسات تشغيلية" header right before the first operational sub-category
    // encountered — only makes sense when browsing everything together, not while a single
    // category pill is already selected (the category's own header covers that case).
    if(policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat) && !operationalHeaderShown){
      operationalHeaderShown = true;
      html += `<div style="display:flex;align-items:center;gap:8px;margin:30px 0 4px">
        <span style="font-size:17px">🏭</span>
        <span style="font-weight:900;font-size:15px;color:var(--dark)">سياسات تشغيلية</span>
        <span style="flex:1;height:2px;background:var(--primary);opacity:0.15"></span>
      </div>`;
    }
    const icon = POLICY_CATEGORY_ICONS[cat] || "📁";
    const indent = (policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat)) ? "padding-right:16px" : "";
    html += `<div style="display:flex;align-items:center;gap:8px;margin:22px 0 12px;${indent}">
      <span style="font-size:16px">${icon}</span>
      <span style="font-weight:900;font-size:14px;color:var(--primary)">${cat}</span>
      <span style="flex:1;height:1px;background:var(--gray1)"></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:stretch;${indent}">`;

    groups[cat].forEach(p => {
      html += `<div class="card pcard">
        <div class="pcard-top">
          <div class="pcard-title">${orgEsc(p.policy_name||"")}</div>
          <div class="pcard-badge">${statusBadge(p.status)}</div>
        </div>
        <div class="pcard-type">${orgEsc(p.policy_type||"—")}${p.approval_level === "جمعية عامة" ? ' · <span style="color:var(--gold)">تحتاج الجمعية العامة</span>' : p.approval_level === "داخلية" ? ' · داخلية' : ""}</div>
        <div class="pcard-dates">
          <div><small>رُفعت</small><b>${p.submission_date||"—"}</b></div>
          ${p.approval_date
            ? `<div><small>اعتُمدت</small><b style="color:var(--green)">${p.approval_date}</b></div>`
            : `<div><small>متوقّع</small><b>${p.target_approval_date||"—"}</b></div>`}
          <div><small>المراجعة</small><b>${p.review_date||"—"}</b></div>
        </div>
        <div class="pcard-actions">
          ${downloadBtn(p.file_url)}
          <button class="btn-xs sec" onclick="editPolicy(${p.id})"><span class="ico-i ico-edit"></span>تعديل</button>
          <button class="btn-xs sec" onclick="openPolicyHistoryModal(${p.id})"><span class="ico-i ico-clock"></span>السجل</button>
          <button class="btn-xs sec" onclick="openPolComments(${p.id})">الملاحظات <span id="polcom-n-${p.id}"></span></button>
          <button class="btn-xs sec" onclick="openGovLinkPicker('policy',${p.id})">🔗 ربط</button>
        </div>
        <div class="glinks" id="glk-policy-${p.id}" data-glinks="policy:${p.id}"></div>
        <button class="btn-xs gold pol-cta" onclick="startPolicyGovernanceApproval(${p.id})"><span class="ico-i ico-upload"></span>بدء دورة اعتماد وتوقيع</button>
        <div id="policy-gov-status-${p.id}"></div>
        <button class="pcard-del" onclick="deletePolicy(${p.id})" title="حذف السياسة"><span class="ico-i ico-trash"></span>حذف</button>
      </div>`;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;
  list.forEach(p => { loadPolicyApprovalStatus(p.id, `policy-gov-status-${p.id}`); renderGovLinks(`glk-policy-${p.id}`, 'policy', p.id); });
  polLoadBadges(list);
}
