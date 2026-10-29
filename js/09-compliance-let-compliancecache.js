/* ══════════ COMPLIANCE ══════════ */
let complianceCache = [];
/* ══════════ COMPLIANCE (الالتزام والامتثال) ══════════
   Built like the governance-effectiveness assessment on purpose: a history of dated assessments,
   a form where each axis lists its criteria and every criterion gets a 1-5 score, notes and a
   corrective action that can be tracked to closure, then a results summary.
   - Axes: one automatic axis (internal compliance, computed from platform data, scores are not
     editable) followed by one axis per regulating authority, built from the company's own list of
     obligations (compliance_items).
   - An assessment stores a snapshot of its axes and criteria, so changing the obligations list or the
     library later never rewrites an earlier assessment.
   - Corrective/preventive actions live in governance_actions (same executor / monitor / approver
     workflow) under axis_key 'compliance'.
   - The obligations come from a master list (compliance_library) the platform owner keeps per entity
     type, copied into each company. A copied obligation can be marked "not applicable" but not
     deleted, so the next sync does not bring it back. */
const CMP_ENTITIES = ["مساهمة مدرجة","مساهمة غير مدرجة","ذات مسؤولية محدودة","مؤسسة فردية"];
const CMP_FREQS = ["سنوي","نصف سنوي","ربع سنوي","شهري","مرة واحدة","عند الحدوث"];
const CMP_STATUSES = ["ملتزم","جارٍ","مجدول","غير ملتزم","غير منطبق"];
const CMP_STATUS_STYLE = {
  "ملتزم":["#E8F8EF","var(--green)"], "جارٍ":["#FEF3E2","var(--gold)"], "مجدول":["#F1F1F1","var(--gray3)"],
  "متأخر":["#FBEAEA","var(--red)"], "غير ملتزم":["#FBEAEA","var(--red)"], "غير منطبق":["#F1F1F1","var(--gray3)"]
};
const CMP_SCORES = { 5:"ملتزم بالكامل وبدليل", 4:"ملتزم مع ملاحظات بسيطة", 3:"التزام جزئي", 2:"التزام ضعيف", 1:"غير ملتزم" };
const CMP_SCORE_COLORS = { 1:"var(--red)", 2:"#E67E22", 3:"var(--gold)", 4:"var(--teal)", 5:"var(--green)" };
const CMP_AUTHORITIES = [
  "وزارة التجارة", "هيئة الزكاة والضريبة والجمارك", "المؤسسة العامة للتأمينات الاجتماعية",
  "وزارة الموارد البشرية والتنمية الاجتماعية", "هيئة السوق المالية", "شركة السوق المالية السعودية (تداول)",
  "الهيئة السعودية للبيانات والذكاء الاصطناعي", "الهيئة السعودية للمراجعين والمحاسبين", "الهيئة العامة للمنافسة",
  "وزارة الشؤون البلدية والقروية والإسكان", "المديرية العامة للدفاع المدني", "الغرفة التجارية", "وزارة الداخلية", "البنك المركزي السعودي"
];
let cmpMembersCache = [];
let cmpLibraryCache = [];
let cmpLibFlags = {};   // library id -> { verified, description }
let currentCmpAxes = [];

function cmpScoreColor(score){ return score == null ? "var(--gray3)" : (CMP_SCORE_COLORS[Math.round(score)] || "var(--gray3)"); }
function cmpToday(){ const t = new Date(); const p = n => String(n).padStart(2,"0"); return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`; }
function cmpIsRecurring(f){ return !!f && !["مرة واحدة","عند الحدوث"].includes(f); }
function cmpMonths(f){ return ({"سنوي":12,"نصف سنوي":6,"ربع سنوي":3,"شهري":1})[f] || 0; }
function cmpAddMonths(dateStr, add){
  let y, m, d;
  if(dateStr){ [y,m,d] = dateStr.split("-").map(Number); } else { const t = new Date(); y = t.getFullYear(); m = t.getMonth()+1; d = t.getDate(); }
  const target = new Date(Date.UTC(y, m-1+add, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0,10);
}

/* A past deadline means late — except a legacy one-off item already marked complied, whose date is
   just the day it was done. Recurring items roll their date forward when confirmed, so a past date
   on one of those really is an unconfirmed cycle. */
function complianceDerivedStatus(i){
  if(i.status === "غير منطبق") return "غير منطبق";
  if(i.due_date && i.due_date < cmpToday() && (cmpIsRecurring(i.frequency) || i.status !== "ملتزم")) return "متأخر";
  return i.status || "مجدول";
}
function complianceApplicable(items){ return (items||[]).filter(i => i.status !== "غير منطبق"); }
function complianceIsOk(i){ return complianceDerivedStatus(i) === "ملتزم"; }

function cmpAssessmentScores(a){
  const axes = (a && a.data && a.data.axes) ? a.data.axes : [];
  let all = [];
  const axisScores = axes.map(ax => {
    const sc = (ax.criteria||[]).map(c => c.score).filter(s => Number.isFinite(s));
    all = all.concat(sc);
    return { title: ax.title, icon: ax.icon, score: sc.length ? sc.reduce((x,y) => x+y, 0) / sc.length : null, scored: sc.length, total: (ax.criteria||[]).length };
  });
  return { axisScores, finalScore: all.length ? all.reduce((x,y) => x+y, 0) / all.length : null };
}
function cmpInterpretation(score){
  if(score < 2) return { label: "التزام ضعيف جداً – قصور جوهري يحتاج معالجة فورية", color: "var(--red)" };
  if(score < 3) return { label: "التزام ضعيف – يحتاج معالجة عاجلة", color: "#E67E22" };
  if(score < 4) return { label: "التزام مقبول – ملاحظات تحتاج تصحيحاً", color: "var(--gold)" };
  if(score < 4.5) return { label: "التزام جيد – ملاحظات بسيطة", color: "var(--teal)" };
  return { label: "التزام عالٍ – متميز", color: "var(--green)" };
}
async function cmpLatestAssessment(){
  try {
    const { data, error } = await sb.from("compliance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1);
    if(error) return null;
    return (data && data[0]) || null;
  } catch(e){ return null; }
}

/* The one definition of "how compliant are we" used by the dashboard and the governance reports:
   the latest assessment's overall score when there is one, otherwise the share of listed
   obligations marked as complied, so a company that has not assessed yet still shows something. */
function complianceSummary(items, assessment){
  if(assessment){
    const { finalScore } = cmpAssessmentScores(assessment);
    if(finalScore != null) return { pct: Math.round(finalScore/5*100), text: `آخر تقييم${assessment.period ? " (" + assessment.period + ")" : ""}: ${finalScore.toFixed(1)} من 5`, basis: "assessment", avg: finalScore };
  }
  const live = complianceApplicable(items);
  if(!live.length) return { pct: null, text: "لا توجد بيانات بعد", basis: "none", avg: null };
  const ok = live.filter(complianceIsOk).length;
  return { pct: Math.round(ok/live.length*100), text: `${ok} من ${live.length} بندًا ملتزم (لم يُجرَ تقييم بعد)`, basis: "status", avg: null };
}

async function cmpLoadMembers(){
  const { data: ms } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  const rows = (ms||[]).filter(m => m.role !== "مساهم");
  const emails = rows.map(r => r.email);
  const { data: profs } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameBy = {}; (profs||[]).forEach(p => { nameBy[p.email] = p.full_name; });
  cmpMembersCache = rows.map(r => ({ email: r.email, role: r.role, name: nameBy[r.email] || r.email }));
}
function cmpOwnerName(email){ if(!email) return "—"; const m = cmpMembersCache.find(x => x.email === email); return m ? m.name : email; }

/* Copies library entries this company doesn't have yet. Safe to run on every visit: it only adds
   what is missing, and a unique index on (company_id, library_id) makes a simultaneous second run
   fail harmlessly instead of duplicating. */
async function cmpSyncFromLibrary(){
  if(!currentCompanyId || !currentCompanyType) return { added: 0, first: false, missingTables: false };
  const [libRes, haveRes] = await Promise.all([
    sb.from("compliance_library").select("*").eq("is_active", true).order("sort_order",{ascending:true}).order("id",{ascending:true}),
    sb.from("compliance_items").select("library_id").eq("company_id", currentCompanyId).not("library_id","is",null)
  ]);
  if(libRes.error || haveRes.error){ console.warn("compliance sync skipped", libRes.error || haveRes.error); return { added: 0, first: false, missingTables: true }; }
  cmpLibFlags = {};
  (libRes.data||[]).forEach(l => { cmpLibFlags[l.id] = { verified: !!l.verified, description: l.description }; });
  const haveIds = new Set((haveRes.data||[]).map(x => x.library_id));
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const toAdd = (libRes.data||[]).filter(l => (l.entity_types||[]).includes(currentCompanyType) && !(l.board_only && noBoard) && !haveIds.has(l.id));
  if(!toAdd.length) return { added: 0, first: false, missingTables: false };
  const rows = toAdd.map(l => ({
    company_id: currentCompanyId, item_name: l.title, authority: l.authority, regulation_ref: l.regulation_ref,
    frequency: l.frequency, due_hint: l.due_hint, source: "library", library_id: l.id, status: "مجدول"
  }));
  const { error } = await sb.from("compliance_items").insert(rows);
  if(error){ if(error.code !== "23505") console.warn("compliance sync insert failed", error); return { added: 0, first: false, missingTables: false }; }
  return { added: rows.length, first: haveIds.size === 0, missingTables: false };
}

function cmpFillAuthorityList(){
  const dl = document.getElementById("cmp-authorities");
  if(dl) dl.innerHTML = CMP_AUTHORITIES.map(a => `<option value="${gaEsc(a)}"></option>`).join("");
}

/* ── The page: history list + action tracker ── */
function cmpShowList(){
  const f = document.getElementById("cmpFormView"), l = document.getElementById("cmpListView");
  if(f) f.style.display = "none";
  if(l) l.style.display = "block";
}

async function loadCompliance(){
  const isOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const libBtn = document.getElementById("complianceLibraryBtn");
  if(libBtn) libBtn.style.display = isOwner ? "inline-flex" : "none";
  cmpFillAuthorityList();
  cmpShowList();

  const sync = await cmpSyncFromLibrary();
  const note = document.getElementById("complianceSyncNote");
  if(note){
    if(sync.added){
      note.style.display = "block";
      note.textContent = sync.first
        ? `جُهّزت قائمة التزامات أولية (${sync.added} بنداً) حسب نوع كيان شركتكم. راجعوها من «قائمة الالتزامات» وحدّدوا المواعيد والمسؤولين، ثم ابدؤوا أول تقييم.`
        : `أُضيف ${sync.added} التزام جديد من مكتبة المنصة حسب نوع كيان شركتكم.`;
    } else if(sync.missingTables && isOwner){
      note.style.display = "block";
      note.textContent = "جداول نظام الالتزام غير مُنشأة بعد. شغّل ملف SQL الخاص بها بلوحة Supabase.";
    } else { note.style.display = "none"; }
  }

  await gaLoadAll();
  renderCmpTracker();
  await loadCmpHistory();
}

async function loadCmpHistory(){
  const tbody = document.getElementById("cmpHistoryTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("compliance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${gaEsc(error.message)}</td></tr>`; return; }
  if(!data || data.length === 0){ tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد تقييمات بعد. اضغط «+ تقييم جديد» للبدء.</td></tr>'; return; }
  tbody.innerHTML = data.map(a => {
    const { finalScore } = cmpAssessmentScores(a);
    const interp = finalScore != null ? cmpInterpretation(finalScore) : null;
    return `<tr>
      <td>${gaEsc(a.period||"—")}</td><td>${gaEsc(a.assessed_by_type||"—")}</td><td>${gaEsc(a.assessment_date||"—")}</td>
      <td>${finalScore != null ? finalScore.toFixed(1) + "/5" : "—"}</td>
      <td>${interp ? `<span style="color:${interp.color};font-weight:700;font-size:11px">${interp.label}</span>` : "—"}</td>
      <td><button class="btn-xs primary" onclick="viewCmpAssessment(${a.id})">عرض/تعديل</button></td>
    </tr>`;
  }).join("");
}

function cmpMyPending(a){ return gaMyPending(a); }

function renderCmpTracker(){
  const statsBox = document.getElementById("cmpStats"), list = document.getElementById("cmpList");
  if(!statsBox || !list) return;
  const all = (gaActionsCache||[]).filter(a => a.axis_key === "compliance");
  const closed = all.filter(a => a.status === "مغلق").length;
  const overdue = all.filter(gaIsOverdue).length;
  const mine = all.filter(a => a.status !== "مغلق" && cmpMyPending(a)).length;
  const rate = all.length ? Math.round(closed/all.length*100) : 0;
  statsBox.innerHTML = `
    <div class="kpi blue"><div class="kpi-label">إجمالي الإجراءات</div><div class="kpi-val">${all.length}</div></div>
    <div class="kpi gold"><div class="kpi-label">المطلوب مني</div><div class="kpi-val">${mine}</div></div>
    <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
    <div class="kpi green"><div class="kpi-label">نسبة الإغلاق</div><div class="kpi-val">${rate}%</div></div>`;

  const f = document.getElementById("cmp-act-filter").value;
  const rows = all.filter(a => {
    if(f === "mine") return a.status !== "مغلق" && cmpMyPending(a);
    if(f === "open") return a.status !== "مغلق";
    if(f === "overdue") return gaIsOverdue(a);
    if(f === "closed") return a.status === "مغلق";
    return true;
  });
  if(!rows.length){
    list.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${all.length ? "لا توجد إجراءات مطابقة." : "لا توجد إجراءات متابَعة بعد. من داخل أي تقييم اضغط «تتبّع كإجراء متابَع» بجانب الإجراء التصحيحي."}</div>`;
    return;
  }
  list.innerHTML = rows.map(a => {
    const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark);flex:1">${a.action_kind ? `<span style="font-size:10px;background:#E6EEF8;color:var(--primary);border-radius:10px;padding:1px 8px;margin-left:6px">${gaEsc(a.action_kind)}</span>` : ""}${gaEsc(a.action_text)}</div>
        <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(a.status)}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">الالتزام: ${gaEsc(String(a.criterion_label||a.criterion_key).replace(/^التزام:\s*/,""))}</div>
      <div style="font-size:11px;color:var(--gray3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
        <span>المنفّذ: ${gaEsc(gaName(a.executor_email))}</span><span>المراقب: ${gaEsc(gaName(a.monitor_email))}</span><span>المعتمِد: ${gaEsc(gaName(a.approver_email))}</span>
        <span>الموعد: ${a.target_date||"غير محدَّد"}</span>${gaIsOverdue(a) ? '<span style="color:var(--red);font-weight:800">متأخر</span>' : ""}
      </div>
      <button class="btn-xs ${a.status!=='مغلق' && cmpMyPending(a) ? 'gold' : 'primary'}" onclick="gaOpen(${a.id})">${a.status!=='مغلق' && cmpMyPending(a) ? 'مطلوب منك' : 'فتح'}</button>
    </div>`;
  }).join("");
}

/* The shared action workflow calls this after any change so the tracker and the per-row action
   marks here stay current when an action is advanced from the dialog it opens. */
function cmpRefreshActionsCard(){
  if(document.getElementById("cmpList")) renderCmpTracker();
  const form = document.getElementById("cmpFormView");
  if(form && form.style.display !== "none") cmpRefreshSlots();
}

/* ── Internal compliance (automatic): derived from what the platform already tracks ── */
async function cmpInternalChecks(){
  const cid = currentCompanyId, today = cmpToday();
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const fortnightAgo = new Date(Date.now() - 14*86400000).toISOString();
  const [pol, sign, assess, acts, bdec, mdec] = await Promise.all([
    sb.from("policies").select("id,review_date,status").eq("company_id", cid),
    sb.from("signing_documents").select("id,status,created_at").eq("company_id", cid),
    sb.from("governance_assessments").select("id,created_at").eq("company_id", cid).order("created_at",{ascending:false}).limit(1),
    sb.from("governance_actions").select("id,target_date,status").eq("company_id", cid).not("status","eq","مغلق").not("target_date","is",null),
    noBoard ? Promise.resolve({data:[]}) : sb.from("board_decisions").select("id,target_date,status").eq("company_id", cid).not("status","eq","منجز").not("target_date","is",null),
    currentCompanyLLCSingleManager ? sb.from("simple_decisions").select("id,target_date,status").eq("company_id", cid).eq("context","manager").not("status","eq","منجز").not("target_date","is",null) : Promise.resolve({data:[]})
  ]);
  const checks = [];
  const lateP = (pol.data||[]).filter(p => p.status === "تجديد مطلوب" || (p.review_date && p.review_date < today)).length;
  checks.push({ id: "policies", label: "مراجعة السياسات في موعدها", ok: lateP === 0, detail: lateP ? `${lateP} سياسة تجاوزت موعد مراجعتها` : "لا سياسات متأخرة المراجعة" });
  const stuck = (sign.data||[]).filter(d => d.status !== "مكتمل" && d.created_at && d.created_at < fortnightAgo).length;
  checks.push({ id: "signatures", label: "اكتمال التوقيعات", ok: stuck === 0, detail: stuck ? `${stuck} وثيقة بلا اكتمال توقيع لأكثر من 14 يوماً` : "لا وثائق معلّقة طويلاً" });
  const lateA = (acts.data||[]).filter(a => a.target_date < today).length;
  checks.push({ id: "actions", label: "الإجراءات التصحيحية", ok: lateA === 0, detail: lateA ? `${lateA} إجراء متأخر` : "لا إجراءات متأخرة" });
  if(!noBoard){
    const lateD = (bdec.data||[]).filter(d => d.target_date < today).length;
    checks.push({ id: "board_decisions", label: "تنفيذ قرارات المجلس", ok: lateD === 0, detail: lateD ? `${lateD} قرار متأخر عن موعده` : "لا قرارات متأخرة" });
  }
  if(currentCompanyLLCSingleManager){
    const lateM = (mdec.data||[]).filter(d => d.target_date < today).length;
    checks.push({ id: "manager_decisions", label: "تنفيذ قرارات المدير", ok: lateM === 0, detail: lateM ? `${lateM} قرار متأخر عن موعده` : "لا قرارات متأخرة" });
  }
  const last = (assess.data||[])[0];
  const yearAgo = new Date(Date.now() - 365*86400000).toISOString();
  const fresh = !!(last && last.created_at >= yearAgo);
  checks.push({ id: "governance_assessment", label: "تقييم فعالية الحوكمة السنوي", ok: fresh, detail: fresh ? "أُجري خلال آخر 12 شهراً" : (last ? "آخر تقييم مضى عليه أكثر من 12 شهراً" : "لم يُجرَ تقييم بعد") });
  return checks;
}

/* ── The assessment form ── */
async function cmpBuildAxes(){
  await cmpSyncFromLibrary();
  const { data } = await sb.from("compliance_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  complianceCache = data || [];
  const byAuth = {};
  complianceApplicable(complianceCache).forEach(i => { const a = i.authority || "غير محدد"; (byAuth[a] = byAuth[a] || []).push(i); });
  const checks = await cmpInternalChecks();
  const axes = [{
    key: "internal", title: "الالتزام الداخلي (آلي)", icon: "🛡️", auto: true,
    criteria: checks.map(ch => ({ key: "int_" + ch.id, label: ch.label, hint: "آلي — " + ch.detail, auto: true, score: ch.ok ? 5 : 2 }))
  }];
  Object.keys(byAuth).sort((a,b) => a.localeCompare(b, "ar")).forEach((a, k) => axes.push({
    key: "auth_" + k, title: a, icon: "🏛️",
    criteria: byAuth[a].map(i => ({ key: "i" + i.id, itemId: i.id, label: i.item_name, hint: [i.regulation_ref, i.frequency].filter(Boolean).join(" · ") }))
  }));
  return axes;
}

function cmpAssessorOptions(selected){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner || currentCompanyLLCSingleManager;
  const body = noBoard ? (currentCompanyLLCSingleManager && !currentCompanyLLCSingleOwner && currentCompanyType !== "مؤسسة فردية" ? "المدير" : "المالك") : getGovernanceBodyLabel();
  const opts = ["المراجعة الداخلية", "طرف خارجي", body];
  if(selected && !opts.includes(selected)) opts.push(selected);
  document.getElementById("cmp-assessor").innerHTML = opts.map(o => `<option>${gaEsc(o)}</option>`).join("");
  document.getElementById("cmp-assessor").value = selected || "المراجعة الداخلية";
}

async function renderCmpAxesForm(saved){
  await gaLoadAll();
  const aid = document.getElementById("cmp-id").value;
  currentCmpAxes = (saved && saved.data && saved.data.axes) ? saved.data.axes : await cmpBuildAxes();
  const box = document.getElementById("cmpAxesContainer");
  const onlyInternal = currentCmpAxes.length <= 1;
  box.innerHTML = (onlyInternal ? '<div style="background:#FEF3E2;color:var(--gold);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;margin-bottom:14px">لا توجد التزامات خارجية بعد. أضفها من «قائمة الالتزامات» ثم ابدأ تقييماً جديداً.</div>' : "") +
    currentCmpAxes.map((axis, ai) => `<div class="card" style="margin-bottom:14px">
      <div class="card-head"><span class="card-title">${axis.icon||""} ${gaEsc(axis.title)}</span></div>
      <div class="card-body">
        <table class="tbl">
          <thead><tr><th style="width:24%">الالتزام</th><th style="width:20%">درجة الالتزام (١-٥)</th><th style="width:28%">الملاحظات</th><th style="width:28%">الإجراءات التصحيحية / الاحترازية</th></tr></thead>
          <tbody>
            ${axis.criteria.map(c => {
              const col = cmpScoreColor(c.score);
              return `<tr data-axis="${ai}" data-crit="${gaEsc(c.key)}">
                <td><b style="font-size:11.5px">${gaEsc(c.label)}</b><div style="font-size:10px;color:var(--gray3);margin-top:2px">${gaEsc(c.hint||"")}</div></td>
                <td><select class="fs cmp-score-select" ${c.auto ? "disabled" : ""} style="font-size:12px;padding:6px;font-weight:700;color:${col};border-color:${col}55" onchange="this.style.color=cmpScoreColor(this.value?Number(this.value):null);this.style.borderColor=cmpScoreColor(this.value?Number(this.value):null)+'55'">
                  <option value="">—</option>
                  ${[5,4,3,2,1].map(n => `<option value="${n}" ${c.score==n ? "selected" : ""}>${n} — ${CMP_SCORES[n]}</option>`).join("")}
                </select>${c.auto ? '<div style="font-size:9.5px;color:var(--gray3);margin-top:3px">تُحتسب تلقائياً</div>' : ""}</td>
                <td><textarea class="fi cmp-notes" rows="2" style="font-size:11.5px;resize:vertical">${gaEsc(c.notes||"")}</textarea></td>
                <td><textarea class="fi cmp-actions" rows="2" style="font-size:11.5px;resize:vertical">${gaEsc(c.actions||"")}</textarea><div class="cmp-slot" data-crit="${gaEsc(c.key)}">${cmpSlotHTML(aid, c.key, c.score)}</div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`).join("");
}

function cmpSlotHTML(assessmentId, critKey, score){
  const ck = "cmp_" + critKey;
  const mine = (gaActionsCache||[]).filter(a => a.axis_key === "compliance" && a.criterion_key === ck);
  const own = assessmentId ? mine.find(a => String(a.assessment_id) === String(assessmentId)) : null;
  let html = "";
  if(own){
    const [bg,fg] = GA_STATUS_STYLE[own.status] || GA_STATUS_STYLE["لم يبدأ"];
    html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:${bg};color:${fg}">${gaEsc(own.action_kind||"متابَع")}: ${gaEsc(own.status)}</span>
      <button type="button" class="btn-xs primary" onclick="gaOpen(${own.id})">فتح</button></div>`;
  } else {
    const corrective = Number.isFinite(score) && score <= 3;
    html += `<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
      <select class="fs cmp-kind" style="margin:0;font-size:11px;padding:4px 6px;width:auto"><option ${corrective ? "selected" : ""}>تصحيحي</option><option ${corrective ? "" : "selected"}>احترازي</option></select>
      <button type="button" class="btn-xs gold" onclick="cmpCreateActionFromRow(this)"><span class="ico-i ico-check"></span>تتبّع كإجراء متابَع</button></div>`;
  }
  const prior = mine.filter(a => String(a.assessment_id) !== String(assessmentId || ""));
  if(prior.length){
    const open = prior.filter(a => a.status !== "مغلق").length;
    html += `<div style="font-size:10px;margin-top:5px;color:${open ? "var(--red)" : "var(--green)"}">إجراءات من تقييمات سابقة: ${open} مفتوح · ${prior.length - open} مغلق</div>`;
  }
  return html;
}
function cmpRefreshSlots(){
  const aid = document.getElementById("cmp-id").value;
  document.querySelectorAll(".cmp-slot").forEach(el => {
    const row = el.closest("tr");
    const v = row ? row.querySelector(".cmp-score-select").value : "";
    el.innerHTML = cmpSlotHTML(aid, el.dataset.crit, v ? Number(v) : null);
  });
}

async function cmpCreateActionFromRow(btn){
  const aid = document.getElementById("cmp-id").value;
  if(!aid){ alert("احفظ التقييم أولاً، ثم حوّل الإجراء إلى متابعة."); return; }
  const tr = btn.closest("tr");
  const text = tr.querySelector(".cmp-actions").value.trim();
  if(!text){ alert("اكتب الإجراء أولاً."); return; }
  const crit = tr.dataset.crit;
  const label = tr.querySelector("b").textContent;
  const kind = tr.querySelector(".cmp-kind").value;
  btn.disabled = true;
  const roles = await gaDefaultRoles();
  const { data, error } = await sb.from("governance_actions").insert([{
    company_id: currentCompanyId, assessment_id: Number(aid), axis_key: "compliance", criterion_key: "cmp_" + crit,
    criterion_label: "التزام: " + label, action_text: text, action_kind: kind,
    executor_email: roles.executor, monitor_email: roles.monitor, approver_email: roles.approver,
    status: "لم يبدأ", created_by: gaMyEmail()
  }]).select().single();
  btn.disabled = false;
  if(error || !data){ alert("تعذّر إنشاء الإجراء: " + (error ? error.message : "")); return; }
  await gaLog(data, null, "لم يبدأ", "إنشاء الإجراء");
  await gaLoadAll();
  cmpRefreshSlots();
  renderCmpTracker();
  gaOpen(data.id);   // open it straight away so executor, monitor, approver and the date can be set
}

function collectCmpAxesData(){
  return currentCmpAxes.map((axis, ai) => ({
    key: axis.key, title: axis.title, icon: axis.icon, auto: !!axis.auto,
    criteria: axis.criteria.map(c => {
      const row = document.querySelector(`tr[data-axis="${ai}"][data-crit="${c.key}"]`);
      const sv = row.querySelector(".cmp-score-select").value;
      return { key: c.key, itemId: c.itemId, label: c.label, hint: c.hint, auto: !!c.auto,
        score: sv ? Number(sv) : null, notes: row.querySelector(".cmp-notes").value.trim(), actions: row.querySelector(".cmp-actions").value.trim() };
    })
  }));
}

function renderCmpResultsSummary(a){
  const { axisScores, finalScore } = cmpAssessmentScores(a);
  const box = document.getElementById("cmpResultsSummary");
  if(finalScore == null){ box.style.display = "none"; return; }
  const interp = cmpInterpretation(finalScore);
  box.style.display = "block";
  box.innerHTML = `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><span class="card-title"><span class="ico-i ico-trending"></span>النتيجة النهائية</span></div>
    <div class="card-body">
      <table class="tbl">
        <thead><tr><th>المحور</th><th>الدرجة / 5</th><th>البنود المقيَّمة</th></tr></thead>
        <tbody>${axisScores.map(ax => `<tr><td>${ax.icon||""} ${gaEsc(ax.title)}</td><td style="color:${cmpScoreColor(ax.score)};font-weight:700">${ax.score != null ? ax.score.toFixed(1) : "—"}</td><td>${ax.scored} من ${ax.total}</td></tr>`).join("")}</tbody>
      </table>
      <div style="margin-top:14px;padding:14px;background:${interp.color}15;border-radius:10px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:${interp.color}">${finalScore.toFixed(1)} / 5</div>
        <div style="font-size:13px;font-weight:700;color:${interp.color};margin-top:4px">${interp.label}</div>
      </div>
    </div>
  </div>`;
}

async function openNewCmpAssessment(){
  document.getElementById("cmp-id").value = "";
  document.getElementById("cmp-period").value = "";
  document.getElementById("cmp-date").value = "";
  cmpAssessorOptions(null);
  document.getElementById("cmpFormTitle").textContent = "تقييم التزام جديد";
  await renderCmpAxesForm(null);
  document.getElementById("cmpResultsSummary").style.display = "none";
  document.getElementById("cmpListView").style.display = "none";
  document.getElementById("cmpFormView").style.display = "block";
}
function closeCmpAssessmentForm(){ cmpShowList(); loadCompliance(); }

async function viewCmpAssessment(id){
  const { data: a, error } = await sb.from("compliance_assessments").select("*").eq("id", id).single();
  if(error || !a){ alert("تعذّر تحميل التقييم"); return; }
  document.getElementById("cmp-id").value = a.id;
  document.getElementById("cmp-period").value = a.period || "";
  document.getElementById("cmp-date").value = a.assessment_date || "";
  cmpAssessorOptions(a.assessed_by_type);
  document.getElementById("cmpFormTitle").textContent = "تعديل تقييم: " + (a.period || "");
  await renderCmpAxesForm(a);
  renderCmpResultsSummary(a);
  document.getElementById("cmpListView").style.display = "none";
  document.getElementById("cmpFormView").style.display = "block";
}

async function saveCmpAssessment(){
  const period = document.getElementById("cmp-period").value.trim();
  if(!period){ alert("الرجاء إدخال الفترة محل التقييم"); return; }
  const assessment_date = document.getElementById("cmp-date").value || null;
  const assessed_by_type = document.getElementById("cmp-assessor").value;
  const axes = collectCmpAxesData();
  const { finalScore } = cmpAssessmentScores({ data: { axes } });
  const payload = { company_id: currentCompanyId, period, assessment_date, assessed_by_type, data: { axes }, final_score: finalScore };
  const id = document.getElementById("cmp-id").value;
  let error;
  if(id){
    ({ error } = await sb.from("compliance_assessments").update(payload).eq("id", id));
  } else {
    const r = await sb.from("compliance_assessments").insert([{ ...payload, created_by: gaMyEmail() }]).select("id").single();
    error = r.error;
    if(!error && r.data) document.getElementById("cmp-id").value = r.data.id;   // keep it: a second Save must update, and actions need a saved assessment
  }
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  cmpRefreshSlots();
  logActivity("إنشاء", "تقييم الالتزام", period, finalScore != null ? `النتيجة النهائية: ${finalScore.toFixed(1)}/5` : "");
  renderCmpResultsSummary({ data: { axes } });
  alert("تم حفظ التقييم بنجاح ✅");
}

/* ── The obligations list (register) ── */
async function cmpReloadRegister(){
  await cmpLoadMembers();
  const { data, error } = await sb.from("compliance_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  const tbody = document.getElementById("complianceTbody");
  if(error){ tbody.innerHTML = errorRowHTML(7, error.message); return; }
  complianceCache = data || [];
  renderComplianceTable();
}
async function openCmpRegister(){
  cmpFillAuthorityList();
  await cmpSyncFromLibrary();
  await cmpReloadRegister();
  openM("m-cmp-register");
}

function renderComplianceTable(){
  const tbody = document.getElementById("complianceTbody");
  if(!tbody) return;
  if(complianceCache.length === 0){ tbody.innerHTML = emptyRowHTML(7, 'لا توجد التزامات بعد. اضغط "+ إضافة بند".'); return; }
  const f = document.getElementById("cmp-filter") ? document.getElementById("cmp-filter").value : "";
  const rows = complianceCache.filter(i => {
    const s = complianceDerivedStatus(i);
    if(f === "late") return s === "متأخر";
    if(f === "open") return ["جارٍ","مجدول","غير ملتزم","متأخر"].includes(s);
    if(f === "ok") return s === "ملتزم";
    if(f === "na") return s === "غير منطبق";
    return true;
  });
  if(!rows.length){ tbody.innerHTML = emptyRowHTML(7, "لا توجد بنود مطابقة."); return; }
  const canManage = gaCanManage();
  tbody.innerHTML = rows.map(i => {
    const s = complianceDerivedStatus(i);
    const [bg, fg] = CMP_STATUS_STYLE[s] || CMP_STATUS_STYLE["مجدول"];
    const fromLib = i.source === "library";
    const prelim = fromLib && cmpLibFlags[i.library_id] && cmpLibFlags[i.library_id].verified === false;
    const na = s === "غير منطبق";
    return `<tr>
      <td><b>${gaEsc(i.item_name)}</b>${prelim ? ' <span title="قائمة أولية لم يراجعها مختص بعد، تحقق من المتطلبات والمهل بالنظام" style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 7px">أولية</span>' : ""}
        ${i.due_hint && !i.due_date ? `<div style="font-size:10.5px;color:var(--gold);margin-top:2px">${gaEsc(i.due_hint)}</div>` : ""}
        ${na && i.na_reason ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px">سبب عدم الانطباق: ${gaEsc(i.na_reason)}</div>` : ""}</td>
      <td>${gaEsc(i.authority||"—")}${i.regulation_ref ? `<div style="font-size:10.5px;color:var(--gray3)">${gaEsc(i.regulation_ref)}</div>` : ""}</td>
      <td style="font-size:11.5px">${gaEsc(i.frequency||"—")}</td>
      <td style="font-size:11.5px;${s==="متأخر" ? "color:var(--red);font-weight:800" : ""}">${i.due_date||'<span style="color:var(--gray3)">غير محدد</span>'}</td>
      <td style="font-size:11.5px">${gaEsc(cmpOwnerName(i.owner_email))}</td>
      <td><span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(s)}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <button class="btn-xs primary" onclick="editCompliance(${i.id})">تعديل</button>
        ${!na ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="cmpMarkDone(${i.id})"><span class="ico-i ico-check"></span>تم</button>` : ""}
        ${canManage ? `<button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer;font-size:11px" onclick="cmpToggleNA(${i.id})">${na ? "إعادة تفعيل" : "لا ينطبق"}</button>` : ""}
        ${canManage && !fromLib ? `<button class="btn-xs" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px" onclick="deleteCompliance(${i.id})">حذف</button>` : ""}
      </div></td></tr>`;
  }).join("");
}

function cmpFillOwnerSelect(selected){
  const sel = document.getElementById("mc-owner");
  sel.innerHTML = '<option value="">— غير محدَّد —</option>' + cmpMembersCache.map(m => `<option value="${gaEsc(m.email)}" ${m.email===selected?"selected":""}>${gaEsc(m.name)}</option>`).join("");
  if(selected && !cmpMembersCache.some(m => m.email === selected)) sel.insertAdjacentHTML("beforeend", `<option value="${gaEsc(selected)}" selected>${gaEsc(selected)}</option>`);
}
function cmpFillStaticSelects(){
  document.getElementById("mc-frequency").innerHTML = '<option value="">— غير محددة —</option>' + CMP_FREQS.map(f => `<option>${f}</option>`).join("");
  document.getElementById("mc-status").innerHTML = CMP_STATUSES.map(s => `<option>${s}</option>`).join("");
}
function cmpLockLibraryFields(locked){
  ["mc-item","mc-authority","mc-ref","mc-frequency"].forEach(id => { document.getElementById(id).disabled = locked; });
  document.getElementById("mc-lib-note").style.display = locked ? "block" : "none";
}

function openNewComplianceItem(){
  cmpFillAuthorityList(); cmpFillStaticSelects();
  document.getElementById("mc-id").value = "";
  document.getElementById("mc-title-h").textContent = "إضافة بند التزام";
  ["mc-item","mc-authority","mc-ref","mc-duedate","mc-evidence"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("mc-frequency").value = "";
  document.getElementById("mc-status").value = "مجدول";
  document.getElementById("mc-hint-row").style.display = "none";
  document.getElementById("mc-desc-row").style.display = "none";
  cmpFillOwnerSelect(null);
  cmpLockLibraryFields(false);
  openM("m-compliance");
}

function editCompliance(id){
  const c = complianceCache.find(x => x.id === id);
  if(!c) return;
  cmpFillAuthorityList(); cmpFillStaticSelects();
  document.getElementById("mc-id").value = c.id;
  document.getElementById("mc-title-h").textContent = "تعديل بند الالتزام";
  document.getElementById("mc-item").value = c.item_name || "";
  document.getElementById("mc-authority").value = c.authority || "";
  document.getElementById("mc-ref").value = c.regulation_ref || "";
  document.getElementById("mc-frequency").value = c.frequency || "";
  document.getElementById("mc-duedate").value = c.due_date || "";
  document.getElementById("mc-status").value = CMP_STATUSES.includes(c.status) ? c.status : "مجدول";
  document.getElementById("mc-evidence").value = c.evidence_note || "";
  document.getElementById("mc-hint-row").style.display = c.due_hint ? "block" : "none";
  document.getElementById("mc-hint").textContent = c.due_hint || "";
  const desc = c.library_id && cmpLibFlags[c.library_id] ? cmpLibFlags[c.library_id].description : null;
  document.getElementById("mc-desc-row").style.display = desc ? "block" : "none";
  document.getElementById("mc-desc").textContent = desc || "";
  cmpFillOwnerSelect(c.owner_email);
  cmpLockLibraryFields(c.source === "library");
  openM("m-compliance");
}

async function saveCompliance(){
  const id = document.getElementById("mc-id").value;
  const existing = id ? complianceCache.find(x => x.id === Number(id)) : null;
  const fromLib = !!(existing && existing.source === "library");
  const item_name = document.getElementById("mc-item").value.trim();
  if(!item_name){ alert("الرجاء إدخال اسم البند"); return; }
  const payload = {
    due_date: document.getElementById("mc-duedate").value || null,
    owner_email: document.getElementById("mc-owner").value || null,
    status: document.getElementById("mc-status").value,
    evidence_note: document.getElementById("mc-evidence").value.trim() || null
  };
  if(!fromLib){
    payload.item_name = item_name;
    payload.authority = document.getElementById("mc-authority").value.trim();
    payload.regulation_ref = document.getElementById("mc-ref").value.trim() || null;
    payload.frequency = document.getElementById("mc-frequency").value || null;
  }
  const { error } = id
    ? await sb.from("compliance_items").update(payload).eq("id", id)
    : await sb.from("compliance_items").insert([{ ...payload, company_id: currentCompanyId, source: "manual" }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-compliance"); cmpReloadRegister();
}

async function cmpMarkDone(id){
  const i = complianceCache.find(x => x.id === id);
  if(!i) return;
  const rec = cmpIsRecurring(i.frequency);
  if(!await uiConfirm(rec ? "تأكيد تنفيذ هذه الدورة؟ سيُرحَّل الموعد تلقائياً للدورة القادمة." : "تأكيد الالتزام بهذا البند؟")) return;
  const today = cmpToday();
  const upd = { status: "ملتزم", last_done_at: today };
  if(rec){
    const step = cmpMonths(i.frequency);
    let next = cmpAddMonths(i.due_date || today, step), guard = 0;
    while(next <= today && guard++ < 60) next = cmpAddMonths(next, step);
    upd.due_date = next;
  } else { upd.due_date = null; }
  const { error } = await sb.from("compliance_items").update(upd).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تأكيد التزام", "التزام", i.item_name, rec ? `الموعد القادم ${upd.due_date}` : "");
  cmpReloadRegister();
}

async function cmpToggleNA(id){
  const i = complianceCache.find(x => x.id === id);
  if(!i || !gaCanManage()) return;
  let upd;
  if(i.status === "غير منطبق"){ upd = { status: "مجدول", na_reason: null }; }
  else {
    const reason = await uiPrompt(`لماذا لا ينطبق "${i.item_name}" على شركتكم؟ (يُحفظ كسبب للمراجعة)`);
    if(reason === null) return;
    if(!reason.trim()){ alert("اكتب سبباً مختصراً."); return; }
    upd = { status: "غير منطبق", na_reason: reason.trim() };
  }
  const { error } = await sb.from("compliance_items").update(upd).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  cmpReloadRegister();
}

async function deleteCompliance(id){
  const i = complianceCache.find(x => x.id === id);
  if(i && i.source === "library"){ alert("هذا البند من مكتبة المنصة ولا يُحذف. استخدم «لا ينطبق» مع ذكر السبب."); return; }
  if(!await uiConfirm("هل أنت متأكد من حذف هذا البند؟")) return;
  const { error } = await sb.from("compliance_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  cmpReloadRegister();
}

/* ── Platform owner: the master library ── */
async function openCmpLibrary(){ cmpFillAuthorityList(); await cmpLoadLibrary(); openM("m-cmplib"); }

async function cmpLoadLibrary(){
  const list = document.getElementById("cmplib-list");
  const { data, error } = await sb.from("compliance_library").select("*").order("sort_order",{ascending:true}).order("id",{ascending:true});
  if(error){ list.innerHTML = '<div style="color:var(--red);font-size:12px">جداول المكتبة غير مُنشأة بعد. شغّل ملفي HWKM-compliance-setup.sql ثم HWKM-compliance-v2.sql ثم أعد المحاولة.</div>'; return; }
  cmpLibraryCache = data || [];
  if(!cmpLibraryCache.length){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">المكتبة فارغة. شغّل ملف HWKM-compliance-v2.sql لإضافة القائمة الأولية، أو أضف التزاماً، أو استورد دفعة.</div>'; return; }
  const unver = cmpLibraryCache.filter(l => !l.verified).length;
  const short = { "مساهمة مدرجة":"مدرجة", "مساهمة غير مدرجة":"غير مدرجة", "ذات مسؤولية محدودة":"ذ.م.م", "مؤسسة فردية":"فردية" };
  list.innerHTML = `<div style="font-size:11.5px;color:var(--gray3);margin-bottom:8px">${cmpLibraryCache.length} التزاماً · <b style="color:${unver ? "var(--gold)" : "var(--green)"}">${unver} غير مراجَع</b></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${CMP_ENTITIES.map(en => { const n = cmpLibraryCache.filter(l => l.is_active && (l.entity_types||[]).includes(en)).length; return `<span style="background:${n ? "#E6EEF8" : "#FBEAEA"};color:${n ? "var(--primary)" : "var(--red)"};border-radius:12px;padding:3px 12px;font-size:11.5px;font-weight:800">${en}: ${n}${n ? "" : " — فارغ!"}</span>`; }).join("")}</div>` +
    cmpLibraryCache.map(l => `<div style="border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:${l.is_active ? "#fff" : "var(--offwhite)"};opacity:${l.is_active ? 1 : 0.7}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark)">${gaEsc(l.title)}</div>
        <div style="font-size:11px;color:var(--gray3);margin-top:2px">${gaEsc(l.authority||"—")}${l.regulation_ref ? " · " + gaEsc(l.regulation_ref) : ""} · ${gaEsc(l.frequency||"")}</div>
        <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${(l.entity_types||[]).map(t => `<span style="font-size:9.5px;background:#E6EEF8;color:var(--primary);border-radius:10px;padding:1px 8px">${gaEsc(short[t]||t)}</span>`).join("")}${l.board_only ? '<span style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 8px">للمجلس فقط</span>' : ""}${l.verified ? '<span style="font-size:9.5px;background:#E8F8EF;color:var(--green);border-radius:10px;padding:1px 8px">مراجَع</span>' : '<span style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 8px">غير مراجَع</span>'}${l.is_active ? "" : '<span style="font-size:9.5px;background:#F1F1F1;color:var(--gray3);border-radius:10px;padding:1px 8px">موقوف</span>'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openCmpLibEdit(${l.id})">تعديل</button>
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="toggleCmpLibVerified(${l.id})">${l.verified ? "إلغاء المراجعة" : "تعليم كمراجَع"}</button>
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="toggleCmpLibActive(${l.id})">${l.is_active ? "إيقاف" : "تفعيل"}</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteCmpLibEntry(${l.id})">حذف</button>
      </div>
    </div></div>`).join("");
}

function openCmpLibEdit(id){
  const l = id ? cmpLibraryCache.find(x => x.id === id) : null;
  document.getElementById("cl-freq").innerHTML = CMP_FREQS.map(f => `<option>${f}</option>`).join("");
  document.getElementById("cl-types").innerHTML = CMP_ENTITIES.map((t,k) => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:12px"><input type="checkbox" id="cl-t-${k}" style="width:14px;height:14px" ${l && (l.entity_types||[]).includes(t) ? "checked" : ""}/>${t}</label>`).join("");
  document.getElementById("cl-id").value = l ? l.id : "";
  document.getElementById("cl-title-h").textContent = l ? "تعديل التزام بالمكتبة" : "إضافة التزام للمكتبة";
  document.getElementById("cl-title").value = l ? l.title : "";
  document.getElementById("cl-authority").value = l ? (l.authority||"") : "";
  document.getElementById("cl-ref").value = l ? (l.regulation_ref||"") : "";
  document.getElementById("cl-freq").value = l ? l.frequency : "سنوي";
  document.getElementById("cl-hint").value = l ? (l.due_hint||"") : "";
  document.getElementById("cl-desc").value = l ? (l.description||"") : "";
  document.getElementById("cl-boardonly").checked = l ? !!l.board_only : false;
  document.getElementById("cl-active").checked = l ? !!l.is_active : true;
  document.getElementById("cl-verified").checked = l ? !!l.verified : false;
  openM("m-cmplib-edit");
}

async function saveCmpLibEntry(){
  const id = document.getElementById("cl-id").value;
  const title = document.getElementById("cl-title").value.trim();
  if(!title){ alert("العنوان مطلوب"); return; }
  const entity_types = CMP_ENTITIES.filter((t,k) => document.getElementById("cl-t-"+k).checked);
  if(!entity_types.length){ alert("اختر نوع كيان واحداً على الأقل"); return; }
  const payload = {
    title, authority: document.getElementById("cl-authority").value.trim() || null, regulation_ref: document.getElementById("cl-ref").value.trim() || null,
    frequency: document.getElementById("cl-freq").value, due_hint: document.getElementById("cl-hint").value.trim() || null,
    description: document.getElementById("cl-desc").value.trim() || null, entity_types,
    board_only: document.getElementById("cl-boardonly").checked, is_active: document.getElementById("cl-active").checked,
    verified: document.getElementById("cl-verified").checked
  };
  const { error } = id ? await sb.from("compliance_library").update(payload).eq("id", id) : await sb.from("compliance_library").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-cmplib-edit"); cmpLoadLibrary();
}

async function toggleCmpLibActive(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l) return;
  const { error } = await sb.from("compliance_library").update({ is_active: !l.is_active }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  cmpLoadLibrary();
}
async function toggleCmpLibVerified(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l) return;
  const { error } = await sb.from("compliance_library").update({ verified: !l.verified }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  cmpLoadLibrary();
}

async function deleteCmpLibEntry(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l || !await uiConfirm(`حذف "${l.title}" من المكتبة؟\nنسخ الشركات التي استلمته تبقى عندها. الأفضل «إيقاف» لو تريد فقط منع وصوله لشركات جديدة.`)) return;
  const { error } = await sb.from("compliance_library").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  cmpLoadLibrary();
}

function toggleCmpImport(){ const b = document.getElementById("cmplib-import"); b.style.display = b.style.display === "none" ? "block" : "none"; }

function cmpNormFreq(s){
  s = (s||"").trim();
  if(s.includes("نصف")) return "نصف سنوي";
  if(s.includes("ربع")) return "ربع سنوي";
  if(s.includes("شهر")) return "شهري";
  if(s.includes("مرة")) return "مرة واحدة";
  if(s.includes("حدوث") || s.includes("عند")) return "عند الحدوث";
  return "سنوي";
}
function cmpParseTypes(s){
  s = (s||"").trim();
  if(!s || s.includes("الكل")) return CMP_ENTITIES.slice();
  const out = new Set();
  s.split(/[،,\/]/).forEach(tok => {
    tok = tok.trim();
    if(!tok) return;
    if(tok.includes("غير") && tok.includes("مدرج")) out.add("مساهمة غير مدرجة");
    else if(tok.includes("مدرج")) out.add("مساهمة مدرجة");
    else if(tok.includes("محدود") || tok.includes("ذات") || tok.includes("ذ.م.م")) out.add("ذات مسؤولية محدودة");
    else if(tok.includes("فردي")) out.add("مؤسسة فردية");
  });
  return Array.from(out);
}
function cmpParseImportText(text){
  const rows = [], bad = [];
  text.split("\n").forEach((line, n) => {
    if(!line.trim()) return;
    const p = line.split("|").map(x => x.trim());
    const types = cmpParseTypes(p[4]);
    if(!p[0] || !types.length){ bad.push(n+1); return; }
    rows.push({ title: p[0], authority: p[1]||null, regulation_ref: p[2]||null, frequency: cmpNormFreq(p[3]), entity_types: types, due_hint: p[5]||null, is_active: true, board_only: false, verified: false });
  });
  return { rows, bad };
}
async function importCmpLibrary(){
  const out = document.getElementById("cmplib-import-result");
  const { rows, bad } = cmpParseImportText(document.getElementById("cmplib-import-text").value);
  if(!rows.length){ out.textContent = "لا أسطر صالحة."; return; }
  const { error } = await sb.from("compliance_library").insert(rows);
  if(error){ out.textContent = "تعذّر الاستيراد: " + error.message; return; }
  out.textContent = `أُضيف ${rows.length}` + (bad.length ? ` — تُجوهلت الأسطر: ${bad.join("، ")}` : "");
  document.getElementById("cmplib-import-text").value = "";
  cmpLoadLibrary();
}
/* ══════════ INTERNAL GOVERNANCE EVALUATION (linked to policies & permissions matrix) ══════════ */
let govEvalCache = [];

function govEvalItemStatus(item, policiesById, permCellsByItemId){
  if(item.linked_policy_id){
    const p = policiesById[item.linked_policy_id];
    if(!p) return "غير مطبّق";
    if(p.status === "معتمدة نهائيًا") return "مطبّق";
    if(p.status === "مسودة") return "غير مطبّق";
    return "قيد التنفيذ";
  }
  if(item.linked_permission_item_id){
    const hasCells = permCellsByItemId[item.linked_permission_item_id];
    return hasCells ? "مطبّق" : "غير مطبّق";
  }
  return item.manual_status || "غير مطبّق";
}

async function loadGovEval(){
  const listBox = document.getElementById("govEvalList");
  const scoreBox = document.getElementById("govEvalScore");
  if(!listBox) return;

  const [{ data: items, error }, { data: policies }, { data: permCells }] = await Promise.all([
    sb.from("governance_evaluation_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("permission_cells").select("*")
  ]);
  if(error){ listBox.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  govEvalCache = items || [];

  const policiesById = {};
  (policies||[]).forEach(p => { policiesById[p.id] = p; });
  const permCellsByItemId = {};
  (permCells||[]).forEach(c => { if(c.code) permCellsByItemId[c.item_id] = true; });

  if(govEvalCache.length === 0){
    listBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد بنود تقييم بعد. اضغط "+ إضافة بند تقييم" للبدء.</div>';
    if(scoreBox) scoreBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لا توجد بيانات بعد.</div>';
    return;
  }

  const withStatus = govEvalCache.map(it => ({ ...it, _status: govEvalItemStatus(it, policiesById, permCellsByItemId) }));
  const appliedCount = withStatus.filter(it => it._status === "مطبّق").length;
  const scorePct = Math.round((appliedCount / withStatus.length) * 100);

  if(scoreBox){
    scoreBox.innerHTML = `<div class="comp-item"><div class="comp-head"><span class="comp-name">نسبة تطبيق بنود الحوكمة الداخلية</span><span class="comp-pct">${scorePct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${scorePct}%"></div></div></div>
      <div style="font-size:11px;color:var(--gray3);margin-top:4px">${appliedCount} من ${withStatus.length} بندًا مطبّق</div>`;
  }

  const statusStyle = { "مطبّق": {bg:"#E8F8EF",color:"var(--green)"}, "قيد التنفيذ": {bg:"#FEF3E2",color:"var(--gold)"}, "غير مطبّق": {bg:"#FDE8E8",color:"var(--red)"} };
  const groups = {};
  withStatus.forEach(it => { const c = it.category||"عام"; if(!groups[c]) groups[c]=[]; groups[c].push(it); });

  listBox.innerHTML = Object.keys(groups).map(cat => {
    const rows = groups[cat].map(it => {
      const st = statusStyle[it._status] || statusStyle["غير مطبّق"];
      const linkNote = it.linked_policy_id ? `🔗 مرتبط بسياسة: ${policiesById[it.linked_policy_id]?.policy_name||""}`
        : (it.linked_permission_item_id ? `🔗 مرتبط ببند صلاحية` : "");
      return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--gray1);gap:8px">
        <div>
          <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${orgEsc(it.item_text||"")}</div>
          ${linkNote ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${linkNote}</div>` : ""}
          ${it.notes ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-edit"></span>${orgEsc(it.notes)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:8px;background:${st.bg};color:${st.color}">${it._status}</span>
          <button class="btn-xs primary" onclick="editGovEvalItem(${it.id})"><span class="ico ico-edit" style="width:16px;height:16px"></span></button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer" onclick="deleteGovEvalItem(${it.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
        </div>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-bottom:14px"><div class="card-head"><span class="card-title">${cat}</span></div><div class="card-body">${rows}</div></div>`;
  }).join("");
}

async function populateGovEvalLinkSelects(){
  const [{ data: policies }, { data: permItems }] = await Promise.all([
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId)
  ]);
  const polSel = document.getElementById("mge-policy");
  polSel.innerHTML = '<option value="">— بدون ربط —</option>' + (policies||[]).map(p => `<option value="${p.id}">${orgEsc(p.policy_name)}</option>`).join("");
  const permSel = document.getElementById("mge-permission");
  permSel.innerHTML = '<option value="">— بدون ربط —</option>' + (permItems||[]).map(p => `<option value="${p.id}">${orgEsc(p.item_name)}</option>`).join("");
}

async function openNewGovEvalModal(){
  document.getElementById("mge-id").value = "";
  document.getElementById("mge-title-h").textContent = "📊 إضافة بند تقييم حوكمة";
  document.getElementById("mge-text").value = "";
  document.getElementById("mge-category").value = "";
  document.getElementById("mge-notes").value = "";
  document.getElementById("mge-manual-status").value = "غير مطبّق";
  await populateGovEvalLinkSelects();
  document.getElementById("mge-policy").value = "";
  document.getElementById("mge-permission").value = "";
  openM("m-gov-eval");
}

async function editGovEvalItem(id){
  const it = govEvalCache.find(x => x.id === id);
  if(!it) return;
  document.getElementById("mge-id").value = it.id;
  document.getElementById("mge-title-h").textContent = "✏️ تعديل بند تقييم حوكمة";
  document.getElementById("mge-text").value = it.item_text || "";
  document.getElementById("mge-category").value = it.category || "";
  document.getElementById("mge-notes").value = it.notes || "";
  document.getElementById("mge-manual-status").value = it.manual_status || "غير مطبّق";
  await populateGovEvalLinkSelects();
  document.getElementById("mge-policy").value = it.linked_policy_id || "";
  document.getElementById("mge-permission").value = it.linked_permission_item_id || "";
  openM("m-gov-eval");
}

async function deleteGovEvalItem(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذا البند؟")) return;
  const { error } = await sb.from("governance_evaluation_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadGovEval();
}

async function saveGovEvalItem(){
  const id = document.getElementById("mge-id").value;
  const item_text = document.getElementById("mge-text").value.trim();
  if(!item_text){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mge-category").value.trim();
  const linked_policy_id = document.getElementById("mge-policy").value ? Number(document.getElementById("mge-policy").value) : null;
  const linked_permission_item_id = document.getElementById("mge-permission").value ? Number(document.getElementById("mge-permission").value) : null;
  const manual_status = document.getElementById("mge-manual-status").value;
  const notes = document.getElementById("mge-notes").value.trim();
  const payload = { item_text, category, linked_policy_id, linked_permission_item_id, manual_status, notes, company_id: currentCompanyId };
  const { error } = id
    ? await sb.from("governance_evaluation_items").update(payload).eq("id", id)
    : await sb.from("governance_evaluation_items").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-gov-eval");
  loadGovEval();
}


