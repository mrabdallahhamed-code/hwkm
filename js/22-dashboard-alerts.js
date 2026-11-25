/* ══ لائحة حوكمة الشركات (هيئة السوق المالية): إلزامية للمدرجة في السوق الرئيسية (م2/ب)، وفي الموازية مواد محددة فقط، واسترشادية لغير المدرجة ══ */
async function govRegLevel(){
  if(currentCompanyType !== "مساهمة مدرجة") return "advisory";
  try { const { data } = await sb.from("companies").select("*").eq("id", currentCompanyId).single(); if(data && data.listing_market === "موازية") return "parallel"; } catch(e){}
  return "main";
}
function govRegAlert(level, o){
  /* o: { art, text, cta, page, parallelMandatory } */
  const binding = level === "main" || (level === "parallel" && o.parallelMandatory);
  return { severity: binding ? "high" : "medium", cta: o.cta, page: o.page, text: (binding ? "مخالفة محتملة — " : "توصية — ") + o.text + ` (لائحة حوكمة الشركات ${o.art})` };
}
/* ══════════ لوحة التحكم والإشعارات والتنبيهات (منقول من ملف 04 دون تغيير سلوك) ══════════ */
function toggleNotifPanel(){
  const panel = document.getElementById("notifPanel");
  if(!panel) return;
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "block" : "none";
  if(opening) loadNotifications();
}
document.addEventListener('click', function(e){
  const panel = document.getElementById("notifPanel");
  if(!panel || panel.style.display === "none") return;
  if(!panel.contains(e.target) && !e.target.closest('.notif-btn')) panel.style.display = "none";
});

async function loadNotifications(){
  const list = document.getElementById("notifList");
  const dot = document.getElementById("notifDot");
  if(!list || !currentUserProfile) return;

  const role = getCurrentRole();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const __blocks = [];

  __blocks.push(async () => { const items = [];
  // 0) Platform admin: new company registration requests awaiting review — this is a
  // platform-wide event, not scoped to whichever company is currently selected.
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(isPlatformAdmin){
    const { data: reqs } = await sb.from("company_requests").select("*").eq("status", "قيد المراجعة");
    (reqs||[]).forEach(r => { items.push({ icon:"🏢", text:`طلب إدراج شركة جديد: "${r.company_name}" ينتظر مراجعتك`, page:"companyrequests" }); });
  }

    return items; });

  __blocks.push(async () => { const items = [];
  // 1) Consultation requests needing your action
  if(role === 'مدير النظام' || role === 'رئيس مجلس'){
    const { data: cr } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId);
    (cr||[]).forEach(r => {
      if(role==='مدير النظام' && r.status==='جديد') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر عرض سعر منك`, page:"consultants" });
      if(role==='رئيس مجلس' && r.status==='عرض سعر مقدم') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر قرارك`, page:"consultants" });
    });
  }

    return items; });

  __blocks.push(async () => { const items = [];
    if(role === 'مساهم') return items;
    // 2) Meeting requests needing your response
    const { data: mr } = await sb.from("meeting_requests").select("*").eq("company_id", currentCompanyId).eq("status","قيد الموافقة");
    if(mr && mr.length){
      const ids = mr.map(r=>r.id);
      const { data: myResponses } = await sb.from("meeting_request_responses").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const respondedIds = new Set((myResponses||[]).map(r=>r.request_id));
      mr.forEach(r => { if(!respondedIds.has(r.id)) items.push({ icon:"🗳️", text:`طلب اجتماع "${r.title}" ينتظر موافقتك على الموعد`, page:"meetings" }); });
    }

    return items; });

  __blocks.push(async () => { const items = [];
    if(role === 'مساهم') return items;
    // 3) Policy reviews needing your response
    const { data: pol } = await sb.from("policies").select("*").eq("company_id", currentCompanyId).eq("status","مرفوعة لمجلس الإدارة");
    if(pol && pol.length){
      const ids = pol.map(p=>p.id);
      const { data: myPolReviews } = await sb.from("policy_reviews").select("policy_id").in("policy_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPolReviews||[]).map(r=>r.policy_id));
      pol.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📜", text:`سياسة "${p.policy_name}" تنتظر رأيك`, page:"governance" }); });
    }

    return items; });

  __blocks.push(async () => { const items = [];
    if(role === 'مساهم') return items;
    // 4) Appointment requests needing your review
    const { data: ap } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).eq("status","محال إلى مجلس الإدارة");
    if(ap && ap.length){
      const ids = ap.map(a=>a.id);
      const { data: myApReviews } = await sb.from("appoint_request_reviews").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myApReviews||[]).map(r=>r.request_id));
      ap.forEach(a => { if(!reviewedIds.has(a.id)) items.push({ icon:"👤", text:`طلب تعيين "${a.candidate_name}" ينتظر رأيك`, page:"appoint" }); });
    }

    return items; });

  __blocks.push(async () => { const items = [];
    if(role === 'مساهم') return items;
    // 5) Performance evaluations needing your input
    const { data: pe } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).eq("status","مفتوح للتقييم");
    if(pe && pe.length){
      const ids = pe.map(p=>p.id);
      const { data: myPeReviews } = await sb.from("performance_evaluation_reviews").select("evaluation_id").in("evaluation_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPeReviews||[]).map(r=>r.evaluation_id));
      pe.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📐", text:`تقييم أداء "${p.entity_name}" ينتظر تقييمك`, page:"perf" }); });
    }

    return items; });

  __blocks.push(async () => { const items = [];
    if(role === 'مساهم') return items;
    // 6) Documents needing your signature
    const { data: docs } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).neq("status","مكتمل");
    if(docs && docs.length){
      const ids = docs.map(d=>d.id);
      const { data: mySigs } = await sb.from("document_signatures").select("document_id").in("document_id", ids).eq("signer_email", myEmail||"");
      const signedIds = new Set((mySigs||[]).map(s=>s.document_id));
      docs.forEach(d => { if(!signedIds.has(d.id)) items.push({ icon:"✍️", text:`وثيقة "${d.document_name}" تنتظر توقيعك`, page:"signing" }); });
    }
    return items; });

  __blocks.push(async () => { const items = [];
  // 7) Upcoming meetings within 3 days (everyone with page access)
  const { data: meetings } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId);
  const now = new Date();
  (meetings||[]).forEach(m => {
    if(!m.meeting_date) return;
    const days = Math.ceil((new Date(m.meeting_date) - now) / 86400000);
    if(days >= 0 && days <= 3){
      items.push({ icon:"📅", text:`${m.title||"اجتماع"} خلال ${days===0?'اليوم':(days+' يوم')}`, page: m.meeting_type==="الجمعية العامة"?"agm":(m.meeting_type==="اجتماع لجنة"?"committees":"meetings") });
    }
  });

    return items; });

  const __res = await Promise.all(__blocks.map(f => f().catch(e => { console.error('notif block failed', e); return []; })));
  const items = [].concat(...__res);

  if(dot) dot.style.display = items.length ? "block" : "none";
  if(items.length===0){
    list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">لا توجد تنبيهات حاليًا ✅</div>';
    return;
  }
  list.innerHTML = items.map(it => `
    <div onclick="document.getElementById('notifPanel').style.display='none';go('${it.page}',null)" style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" onmouseover="this.style.background='var(--offwhite)'" onmouseout="this.style.background='transparent'">
      <span style="font-size:15px">${it.icon}</span>
      <span style="font-size:12px;color:var(--dark);line-height:1.6">${it.text}</span>
    </div>`).join("");
}

function renderDashTopRisks(risks){
  const box = document.getElementById("dashTopRisks");
  if(!box) return;
  if(risks.length===0){ box.innerHTML = '<div class="cd-empty"><div class="cd-empty-ico">🛡️</div><div class="cd-empty-t">لا مخاطر مسجّلة بعد</div><div class="cd-empty-s">تظهر هنا أعلى المخاطر بعد اعتماد تقرير تقييم المخاطر.</div><button class="btn-xs primary" onclick="go(\'risks\',null)">سجّل أول خطر</button></div>'; return; }
  const severity = r => (r.impact==="عالٍ"?2:r.impact==="متوسط"?1:0) * 100 + (r.probability||0);
  const top = [...risks].sort((a,b)=>severity(b)-severity(a)).slice(0,5);
  box.innerHTML = top.map(r => {
    const color = riskSeverityColor(r.impact, r.probability);
    return `<div class="cd-risk" onclick="go('risks',null)" style="--rc:${color}">
      <span class="cd-risk-dot"></span>
      <span class="cd-risk-name">${orgEsc(r.risk_name||"")}</span>
      <span class="cd-risk-tag">${r.impact||"—"}</span>
      <span class="cd-risk-p">${r.probability!=null?r.probability+'%':'—'}</span>
    </div>`;
  }).join("");
}

function renderDashAuditStatus(items){
  const box = document.getElementById("dashAuditStatus");
  if(!box) return;
  if(items.length===0){ box.innerHTML = '<div class="cd-empty"><div class="cd-empty-ico">🔍</div><div class="cd-empty-t">لا بنود تدقيق مسجّلة بعد</div><div class="cd-empty-s">تظهر هنا حالة بنود المراجعة الداخلية وما يزال مفتوحًا منها.</div><button class="btn-xs primary" onclick="go(\'audit\',null)">أضف بند تدقيق</button></div>'; return; }
  const open = items.filter(i=>i.status==="مفتوحة").length;
  const inProgress = items.filter(i=>i.status==="قيد المتابعة").length;
  const closed = items.filter(i=>i.status==="مغلقة").length;
  const total = items.length;
  const pct = total ? Math.round((closed/total)*100) : 0;
  const openItems = items.filter(i=>i.status!=="مغلقة").slice(0,3);
  box.innerHTML = `
    <div class="cd-aud-top"><div class="cd-aud-pct">${pct}%</div><div class="cd-aud-bar"><i style="width:${Math.max(3,pct)}%"></i></div></div>
    <div class="cd-aud-chips"><span class="cd-chip ok"><b>${closed}</b> مغلقة</span><span class="cd-chip mid"><b>${inProgress}</b> قيد المتابعة</span><span class="cd-chip warn"><b>${open}</b> مفتوحة</span></div>
    ${openItems.map(i => `<div onclick="go('audit',null)" class="cd-aud-item">🔸 ${orgEsc(i.item||"")}</div>`).join("")}
  `;
}

/* ══════════ PROACTIVE GOVERNANCE ALERTS ══════════
   Everything here is already tracked somewhere in the platform — this doesn't compute anything
   new, it just refuses to leave it as passive data someone has to remember to go dig for.
   Performance/attendance items are only ever included for viewers who canSeePerfResults() —
   the panel is shared infrastructure, but it never leaks a confidentiality-restricted signal
   to someone who wouldn't otherwise be allowed to see it. */
/* The company's risk register = the assessment items delivered through its risk-service requests
   (risk_items). The old `risks` table has no entry screen anywhere, so the dashboard and alerts read this
   instead, mapped to the shape they already expect. */
async function fetchCompanyRisks(){
  try {
    // لا تظهر المخاطر في لوحة التحكم والتنبيهات إلا بعد اعتماد التقرير النهائي من إدارة حوكم
    const { data: reqs } = await sb.from("risk_requests").select("id,status,pending_final_approval").eq("company_id", currentCompanyId);
    const ids = (reqs||[]).filter(r => (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") && !r.pending_final_approval).map(r => r.id);
    if(!ids.length) return [];
    const { data: items } = await sb.from("risk_items").select("*").in("request_id", ids);
    return (items||[]).map(it => {
      const score = (it.likelihood||0) * (it.impact||0);
      return {
        id: it.id, request_id: it.request_id, risk_name: it.description, category: it.category,
        impact: score >= 10 ? "عالٍ" : score >= 5 ? "متوسط" : "منخفض",
        probability: it.likelihood != null ? it.likelihood * 20 : null,
        status: it.action_status === "مكتمل" ? "مغلق" : it.action_status === "قيد التنفيذ" ? "متابعة" : "مراقبة",
        owner: it.responsible_person, treatment_plan: it.treatment_plan, target_close_date: it.target_close_date,
        action_status: it.action_status || "معلّق"
      };
    });
  } catch(e){ console.error("fetchCompanyRisks failed", e); return []; }
}

async function computeGovernanceAlerts(){
  const alerts = [];
  const govBodyLabel = getGovernanceBodyLabel();
  // كل كتلة مستقلة وتجلب بياناتها بنفسها: نُشغّلها معًا بدل الانتظار الواحدة تلو الأخرى (كل انتظار ≈ ثلث ثانية)،
  // ثم نجمع نتائجها بترتيبها الأصلي تمامًا. تفشل كل كتلة وحدها بلا تعطيل الباقي.
  const __blocks = [
    async () => { const alerts = [];
    // 1) Performance trending down or stuck low across evaluation cycles
    if(await canSeePerfResults()){
      const { data: completed } = await sb.from("performance_evaluations").select("*")
        .eq("company_id", currentCompanyId).eq("status","مكتمل").not("evaluated_email","is",null).order("period",{ascending:true});
      const byPerson = {};
      (completed||[]).forEach(e => { if(!byPerson[e.evaluated_email]) byPerson[e.evaluated_email]=[]; byPerson[e.evaluated_email].push(e); });
      for(const email in byPerson){
        const evals = byPerson[email];
        if(evals.length < 2) continue;
        const scores = evals.map(e=>Number(e.score)||0);
        const last = scores[scores.length-1];
        const isDeclining = scores.every((s,i) => i===0 || s <= scores[i-1]) && scores[0] > last;
        const isConsistentlyLow = scores.slice(-Math.min(3,scores.length)).every(s => s < 3);
        if(isDeclining || isConsistentlyLow){
          alerts.push({
            severity: "high",
            text: `أداء "${evals[evals.length-1].entity_name}" ${isConsistentlyLow?'منخفض باستمرار':'في تراجع'} عبر ${evals.length} دورات تقييم — يستاهل نقاش لجنة الترشيحات${govBodyLabel==='مجلس الإدارة'?' أو رئيس المجلس':''}.`,
            page: "perf"
          });
        }
      }

      // 2) Real attendance rate below a healthy threshold
      try {
        const attendance = await computeAttendancePercentages();
        attendance.filter(a => a.pct !== null && a.pct < 60).forEach(a => {
          alerts.push({ severity: "medium", text: `نسبة حضور "${a.name}" الفعلية ${a.pct}% فقط — أقل من الحد الصحي المعتاد (60%).`, page: "perf" });
        });
      } catch(e){ console.error("attendance alert check failed", e); }
    }
      return alerts;
    },
    async () => { const alerts = [];
    // 3) Policies stuck in an approval cycle past the company's own configured deadline
    try {
      const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
      const { data: allApprovals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).not("status","eq","مكتملة").not("status","eq","مرفوضة");
      const stuck = (allApprovals||[]).filter(a => (a.document_type||"").startsWith("policy_") && Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000) > deadlineDays);
      if(stuck.length){
        const maxLate = Math.max(...stuck.map(a => Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000) - deadlineDays));
        alerts.push({ severity: "high", cta: "راجع السياسات", text: `${stuck.length} ${stuck.length===1?'سياسة متأخرة':'سياسات متأخرة'} عن مهلة الاعتماد (${deadlineDays} يوم)، وأقدمها تجاوزت المهلة بـ ${maxLate} يوماً — بانتظار توقيع أحد الموقّعين.`, page: "governance" });
      }
    } catch(e){ console.error("policy deadline alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4) High-impact risks that are still open with no treatment plan, and treatments past their target date
    try {
      const risks = await fetchCompanyRisks();
      const open = risks.filter(r => r.status !== "مغلق");
      const noPlan = open.filter(r => r.impact === "عالٍ" && !(r.treatment_plan||"").trim());
      if(noPlan.length){
        alerts.push({ severity: "high", cta: "راجع المخاطر", text: `${noPlan.length} ${noPlan.length===1?'خطر عالي التأثير':'مخاطر عالية التأثير'} بلا خطة معالجة.`, page: "risks" });
      }
      const today = new Date(new Date().toDateString());
      const late = open.filter(r => r.target_close_date && new Date(r.target_close_date) < today);
      if(late.length){
        alerts.push({ severity: "high", cta: "راجع المخاطر", text: `${late.length} ${late.length===1?'خطر تجاوز':'مخاطر تجاوزت'} موعد إغلاقها المستهدف دون إغلاق.`, page: "risks" });
      }
      const soon = open.filter(r => r.action_status !== "مكتمل" && r.target_close_date && new Date(r.target_close_date) >= today && (new Date(r.target_close_date) - today) <= 14*86400000);
      if(soon.length){
        alerts.push({ severity: "medium", cta: "تابع الخطط", text: `${soon.length} ${soon.length===1?'خطة معالجة يحين':'خطط معالجة يحين'} موعدها خلال 14 يومًا`, page: "risks" });
      }
      // سجل المخاطر الذاتي: خطر حرج بلا خطة، مراجعة فائتة، إقفال متأخر
      const own = await rrAlertCounts();
      if(own){
        if(own.criticalNoPlan) alerts.push({ severity: "high", cta: "راجع المخاطر", text: `${own.criticalNoPlan} ${own.criticalNoPlan===1?'خطر حرج في سجل المخاطر':'مخاطر حرجة في سجل المخاطر'} بلا خطة معالجة.`, page: "risks" });
        if(own.reviewLate) alerts.push({ severity: "medium", cta: "راجع المخاطر", text: `${own.reviewLate} ${own.reviewLate===1?'خطر فات':'مخاطر فاتت'} موعد مراجعتها الدورية.`, page: "risks" });
        if(own.closeLate) alerts.push({ severity: "high", cta: "راجع المخاطر", text: `${own.closeLate} ${own.closeLate===1?'خطر تجاوز':'مخاطر تجاوزت'} موعد إقفالها المستهدف في سجل المخاطر.`, page: "risks" });
      }
    } catch(e){ console.error("risk alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4a) Internal-audit findings: corrective actions past / near their target date, not yet closed by the auditor
    try {
      const { data: aReqs } = await sb.from("audit_requests").select("id,status,pending_final_approval").eq("company_id", currentCompanyId);
      const aIds = (aReqs||[]).filter(r => (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") && !r.pending_final_approval).map(r => r.id);
      if(aIds.length){
        const { data: fs } = await sb.from("audit_findings").select("id,status,target_date").in("request_id", aIds).not("target_date","is",null);
        const openF = (fs||[]).filter(f => f.status !== "مغلقة");
        const tdy = new Date(new Date().toDateString());
        const aLate = openF.filter(f => new Date(f.target_date) < tdy);
        const aSoon = openF.filter(f => new Date(f.target_date) >= tdy && (new Date(f.target_date) - tdy) <= 14*86400000);
        if(aLate.length) alerts.push({ severity: "high", cta: "راجع الملاحظات", text: `${aLate.length} ${aLate.length===1?'إجراء تصحيحي من المراجعة الداخلية متأخر':'إجراءات تصحيحية من المراجعة الداخلية متأخرة'} عن موعدها.`, page: "audit" });
        if(aSoon.length) alerts.push({ severity: "medium", cta: "تابع الإجراءات", text: `${aSoon.length} ${aSoon.length===1?'إجراء تصحيحي من المراجعة الداخلية يحين':'إجراءات تصحيحية من المراجعة الداخلية يحين'} موعدها خلال 14 يومًا.`, page: "audit" });
      }
    } catch(e){ console.error("audit finding alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4b) Cross-links: risks whose linked policy/decision is stalled, and high risks nobody has covered
    try {
      const risks2 = (await fetchCompanyRisks()).filter(r => r.status !== "مغلق");
      if(risks2.length){
        const [lk, pol, dec] = await Promise.all([
          sb.from("governance_links").select("*").eq("company_id", currentCompanyId),
          sb.from("policies").select("id,policy_name,approval_date,target_approval_date").eq("company_id", currentCompanyId),
          sb.from("board_decisions").select("id,target_date,status").eq("company_id", currentCompanyId)
        ]);
        const links = lk.data || [];
        const today = new Date(new Date().toDateString());
        const polLate = new Set((pol.data||[]).filter(p => !p.approval_date && p.target_approval_date && new Date(p.target_approval_date) < today).map(p => p.id));
        const decLate = new Set((dec.data||[]).filter(d => d.status !== "منجز" && d.target_date && new Date(d.target_date) < today).map(d => d.id));
        const relatedTo = (riskId) => links.filter(l => (l.source_type==="risk" && l.source_id===riskId) || (l.target_type==="risk" && l.target_id===riskId))
          .map(l => (l.source_type==="risk" && l.source_id===riskId) ? { type:l.target_type, id:l.target_id } : { type:l.source_type, id:l.source_id });
        const withLatePolicy = [], withLateDecision = [], uncovered = [];
        risks2.forEach(r => {
          const rel = relatedTo(r.id);
          if(rel.some(x => x.type==="policy" && polLate.has(x.id))) withLatePolicy.push(r);
          if(rel.some(x => x.type==="decision" && decLate.has(x.id))) withLateDecision.push(r);
          if(r.impact === "عالٍ" && !rel.some(x => x.type==="policy" || x.type==="decision")) uncovered.push(r);
        });
        if(withLatePolicy.length) alerts.push({ severity: "high", cta: "راجع السياسات", text: `${withLatePolicy.length} ${withLatePolicy.length===1?'خطر مفتوح مرتبط':'مخاطر مفتوحة مرتبطة'} بسياسة متأخرة عن الاعتماد — معالجته معلّقة.`, page: "governance" });
        if(withLateDecision.length) alerts.push({ severity: "high", cta: "راجع القرارات", text: `${withLateDecision.length} ${withLateDecision.length===1?'خطر مفتوح مرتبط':'مخاطر مفتوحة مرتبطة'} بقرار متأخر عن موعد تنفيذه.`, page: "decisiontracking" });
        if(uncovered.length) alerts.push({ severity: "medium", cta: "اربطها الآن", text: `${uncovered.length} ${uncovered.length===1?'خطر عالي التأثير غير مرتبط':'مخاطر عالية التأثير غير مرتبطة'} بسياسة أو قرار — لا يوجد ما يعالجها بعد.`, page: "risks" });
      }
    } catch(e){ console.error("cross-link alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4c) Authority matrix vs policy approval level, and policy delay/changes reaching linked items
    try {
      const [lk, pol, it, hd] = await Promise.all([
        sb.from("governance_links").select("*").eq("company_id", currentCompanyId),
        sb.from("policies").select("id,policy_name,approval_level,approval_date,target_approval_date").eq("company_id", currentCompanyId),
        sb.from("permission_items").select("id,item_name").eq("company_id", currentCompanyId),
        sb.from("permission_holders").select("id,name").eq("company_id", currentCompanyId)
      ]);
      const links = (lk.data||[]).filter(l => (l.source_type==="policy" && (l.target_type==="authority"||l.target_type==="procedure")) || (l.target_type==="policy" && (l.source_type==="authority"||l.source_type==="procedure")));
      const items = it.data || [];
      if(links.length && items.length){
        const cells = (await sb.from("permission_cells").select("item_id,holder_id,code").in("item_id", items.map(x=>x.id))).data || [];
        const hName = {}; (hd.data||[]).forEach(h => hName[h.id] = h.name || "");
        const iById = {}; items.forEach(x => iById[x.id] = x);
        // policy late/unapproved → the procedures and authority items built on it need review
        const today2 = new Date(new Date().toDateString());
        const lateIds = new Set((pol.data||[]).filter(p => !p.approval_date && p.target_approval_date && new Date(p.target_approval_date) < today2).map(p => p.id));
        const affected = links.filter(l => lateIds.has(l.source_type==="policy" ? l.source_id : l.target_id));
        if(affected.length) alerts.push({ severity:"medium", cta:"راجع السياسات", page:"governance", text:`${affected.length} إجراء/صلاحية مبنيّة على سياسات متأخرة الاعتماد — تُعدّ بلا أساس معتمد حتى تُعتمد السياسة.` });
      }
    } catch(e){ console.error("matrix/policy alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4d) Members classed as independent who declared an independence obstacle (Art. 19) or have no disclosure form
    try {
      if(typeof govIndependenceCheck === "function"){
        const ind = await govIndependenceCheck();
        const bad = ind.filter(r => r.obstacles.length);
        if(bad.length) alerts.push({ severity: "high", cta: "راجع الأعضاء", page: "members", text: `${bad.length} عضو مصنَّف «مستقلاً» لديه ما يعارض الاستقلال بحسب نموذج الإفصاح: ${bad.slice(0,2).map(r => r.name + " — " + r.obstacles[0]).join("؛ ")}.` });
        const miss = ind.filter(r => !r.hasForm || r.stale);
        if(miss.length) alerts.push({ severity: "medium", cta: "راجع الأعضاء", page: "members", text: `${miss.length} عضو مستقل بلا نموذج إفصاح حديث (يلزم تقييم استقلاله سنوياً).` });
      }
    } catch(e){ console.error("independence check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4e) Companies Law checks for a joint-stock company: board size (م67), board term (م68), 4 meetings a year (م80), registering extraordinary-AGM resolutions within 15 days (م93)
    try {
      if(/مساهمة/.test(currentCompanyType || "")){
        const [bmR, trR, mtR] = await Promise.all([
          sb.from("board_members").select("id,status").eq("company_id", currentCompanyId),
          sb.from("board_terms").select("term_start,status").eq("company_id", currentCompanyId).order("term_start", { ascending: false }),
          sb.from("meetings").select("meeting_type,meeting_date,agm_type,title").eq("company_id", currentCompanyId)
        ]);
        const now = new Date(), today = new Date(now.toDateString());
        const active = (bmR.data || []).filter(m => !/مستقيل|منتهي/.test(m.status || ""));
        if(active.length && active.length < 3) alerts.push({ severity: "high", cta: "راجع الأعضاء", page: "members", text: `عدد أعضاء المجلس ${active.length} فقط، والنظام (م67) يوجب ثلاثة أعضاء على الأقل.` });
        const term = (trR.data || []).find(t => t.status === "نشطة") || (trR.data || [])[0];
        if(term && term.term_start){
          const end = new Date(term.term_start); end.setFullYear(end.getFullYear() + 4);
          const left = Math.ceil((end - today) / 86400000);
          if(left < 0) alerts.push({ severity: "high", cta: "دورة المجلس", page: "members", text: `مضت على دورة المجلس الحالية أكثر من 4 سنوات؛ والنظام (م68) لا يجيز مدة عضوية أطول من أربع سنوات.` });
          else if(left <= 180) alerts.push({ severity: "medium", cta: "دورة المجلس", page: "members", text: `تنتهي أقصى مدة لدورة المجلس (4 سنوات، م68) خلال ${left} يومًا تقريبًا؛ رتّب انتخاب المجلس في الجمعية العامة.` });
        }
        const mts = mtR.data || [], yr = now.getFullYear();
        const boardThisYear = mts.filter(m => (m.meeting_type === "اجتماع مجلس الإدارة الدوري" || m.meeting_type === "اجتماع طارئ") && m.meeting_date && new Date(m.meeting_date).getFullYear() === yr);
        const held = boardThisYear.filter(m => new Date(m.meeting_date) <= today).length;
        if(boardThisYear.length < 4 && now.getMonth() >= 6) alerts.push({ severity: now.getMonth() >= 9 ? "high" : "medium", cta: "جدول اجتماعًا", page: "meetings", text: `اجتماعات المجلس هذه السنة: ${held} منعقدة من ${boardThisYear.length} مسجَّلة، والنظام (م80) يوجب أربعة اجتماعات على الأقل في السنة.` });
        const ext = mts.filter(m => m.meeting_type === "الجمعية العامة" && /غير\s*عادية/.test(m.agm_type || "") && m.meeting_date).map(m => ({ m, d: Math.floor((today - new Date(m.meeting_date)) / 86400000) })).filter(x => x.d >= 0 && x.d <= 15);
        ext.forEach(x => alerts.push({ severity: x.d >= 10 ? "high" : "medium", cta: "الجمعية العامة", page: "agm", text: `انعقدت الجمعية غير العادية «${x.m.title || ""}» قبل ${x.d} يومًا؛ يلزم قيد القرارات التي يوجب النظام قيدها في السجل التجاري خلال 15 يومًا (م93) — متبقٍ ${15 - x.d} يومًا.` }));
      }
    } catch(e){ console.error("companies-law alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 4f) CMA Corporate Governance Regulations: board makeup (م16), quarterly meetings (م30), notifying the CMA (م17/د), and the committees (م51، م57، م61)
    try {
      if(/مساهمة/.test(currentCompanyType || "")){
        const level = await govRegLevel();
        const [bmR, cmR, clR, mtR, trR] = await Promise.all([
          sb.from("board_members").select("*").eq("company_id", currentCompanyId),
          sb.from("committees").select("*").eq("company_id", currentCompanyId),
          sb.from("committee_members").select("committee_id,member_id").eq("company_id", currentCompanyId),
          sb.from("meetings").select("meeting_type,meeting_date,committee_id").eq("company_id", currentCompanyId),
          sb.from("board_terms").select("term_start,status").eq("company_id", currentCompanyId).order("term_start", { ascending: false })
        ]);
        const now = new Date(), today = new Date(now.toDateString()), yr = now.getFullYear();
        const active = (bmR.data || []).filter(m => !/مستقيل|منتهي/.test(m.status || ""));
        const isIndep = m => m.status === "مستقل" || /مستقل/.test(m.position || "");
        const isExec = m => /^\s*تنفيذي/.test(m.is_executive || "");
        const nm = x => String(x || "").replace(/\s+/g, " ").trim();
        // م16: أغلبية غير تنفيذيين، والمستقلون لا يقلون عن عضوين أو ثلث المجلس أيهما أكثر
        if(active.length >= 3){
          const nonExec = active.filter(m => !isExec(m)).length, ind = active.filter(isIndep).length, need = Math.max(2, Math.ceil(active.length / 3));
          if(nonExec * 2 <= active.length) alerts.push(govRegAlert(level, { art: "م16/2", cta: "راجع الأعضاء", page: "members", text: `أعضاء المجلس غير التنفيذيين ${nonExec} من ${active.length}؛ يجب أن تكون أغلبية المجلس من غير التنفيذيين.` }));
          if(ind < need) alerts.push(govRegAlert(level, { art: "م16/3", cta: "راجع الأعضاء", page: "members", text: `المستقلون ${ind} من ${active.length}؛ يجب ألا يقلوا عن عضوين أو ثلث المجلس (${need}).` }));
        }
        // م30/ب: اجتماع واحد على الأقل كل ثلاثة أشهر
        const board = (mtR.data || []).filter(m => (m.meeting_type === "اجتماع مجلس الإدارة الدوري" || m.meeting_type === "اجتماع طارئ") && !m.committee_id && m.meeting_date);
        const emptyQ = [];
        for(let q = 0; q < 4; q++){
          const qEnd = new Date(yr, q * 3 + 3, 0);
          if(qEnd < today && !board.some(m => { const d = new Date(m.meeting_date); return d.getFullYear() === yr && Math.floor(d.getMonth() / 3) === q; })) emptyQ.push(q + 1);
        }
        if(emptyQ.length && active.length) alerts.push(govRegAlert(level, { art: "م30/ب", cta: "جدول اجتماعًا", page: "meetings", text: `لم ينعقد اجتماع للمجلس في الربع ${emptyQ.join(" والربع ")} من هذه السنة؛ يلزم اجتماع واحد على الأقل كل ثلاثة أشهر.` }));
        // م17/د: إشعار الهيئة بأسماء الأعضاء وصفاتهم خلال 5 أيام عمل من بدء الدورة أو التعيين أو أي تغيير (للمدرجة)
        if(currentCompanyType === "مساهمة مدرجة"){
          const recent = d => d && (today - new Date(d)) / 86400000 >= 0 && (today - new Date(d)) / 86400000 <= 10;
          const term = (trR.data || [])[0];
          const newJoin = active.filter(m => recent(m.join_date));
          if((term && recent(term.term_start)) || newJoin.length) alerts.push(govRegAlert("main", { art: "م17/د", cta: "راجع الأعضاء", page: "members", text: "بدأت دورة المجلس أو تغيّر أعضاؤه حديثًا؛ يلزم إشعار هيئة السوق المالية بأسماء الأعضاء وصفاتهم خلال خمسة أيام عمل." }));
        }
        // اللجان: أعضاؤها من المجلس (committee_members) ومن خارجه (committees.external_members)
        const links = clR.data || [], mts = mtR.data || [];
        const byId = {}; (bmR.data || []).forEach(m => byId[m.id] = m);
        const extOf = c => Array.isArray(c.external_members) ? c.external_members : [];
        const effOf = c => links.filter(l => l.committee_id === c.id).map(l => byId[l.member_id]).filter(Boolean).map(m => ({ name: m.name, indep: isIndep(m), exec: isExec(m), ext: false }))
          .concat(extOf(c).filter(e => e.kind === "ext").map(e => ({ name: e.name, indep: !!e.independent, exec: false, ext: true, conflict: !!e.conflict2y })));
        const finOf = c => ((extOf(c).find(e => e.kind === "meta")) || {}).financial_expert || "";
        const meetsOf = c => mts.filter(m => String(m.committee_id) === String(c.id) && m.meeting_date && new Date(m.meeting_date).getFullYear() === yr && new Date(m.meeting_date) <= today).length;
        const kindOf = c => typeof committeeKind === "function" ? committeeKind(c.committee_name) : "other";
        const all = cmR.data || [];
        const audit = all.find(c => kindOf(c) === "audit");
        const remnom = all.find(c => kindOf(c) === "remnom");
        const rem = all.find(c => kindOf(c) === "rem") || remnom, nom = all.find(c => kindOf(c) === "nom") || remnom;
        if(!audit && currentCompanyType === "مساهمة مدرجة") alerts.push(govRegAlert(level, { art: "م51", cta: "اللجان", page: "committees", text: "لا توجد لجنة مراجعة مسجَّلة؛ تشكَّل لجنة المراجعة بقرار من مجلس الإدارة.", parallelMandatory: true }));
        if(level === "main"){
          if(!rem) alerts.push(govRegAlert(level, { art: "م57", cta: "اللجان", page: "committees", text: "لا توجد لجنة مكافآت (أو لجنة مكافآت وترشيحات مدمجة) مسجَّلة." }));
          if(!nom) alerts.push(govRegAlert(level, { art: "م61", cta: "اللجان", page: "committees", text: "لا توجد لجنة ترشيحات (أو لجنة مكافآت وترشيحات مدمجة) مسجَّلة." }));
        }
        // م47/4: عدد أعضاء كل لجنة من ثلاثة إلى خمسة (وللمراجعة م51/أ)
        all.forEach(c => {
          const mem = effOf(c);
          if(mem.length && (mem.length < 3 || mem.length > 5)) alerts.push(govRegAlert(level, { art: kindOf(c) === "audit" ? "م51/أ" : "م47/4", cta: "اللجان", page: "committees", parallelMandatory: kindOf(c) === "audit", text: `أعضاء «${c.committee_name}» المسجَّلون ${mem.length}؛ يجب أن يكونوا من ثلاثة إلى خمسة (أضف الأعضاء من خارج المجلس إن وُجدوا).` }));
        });
        if(audit){
          const mem = effOf(audit);
          if(mem.some(m => m.exec)) alerts.push(govRegAlert(level, { art: "م51/أ", cta: "اللجان", page: "committees", parallelMandatory: true, text: "لجنة المراجعة تضم عضوًا تنفيذيًا من المجلس؛ لا يجوز ذلك." }));
          if(mem.length && !finOf(audit)) alerts.push(govRegAlert(level, { art: "م51/أ", cta: "اللجان", page: "committees", parallelMandatory: true, text: "لم يُحدَّد في لجنة المراجعة العضو المختص بالشؤون المالية والمحاسبية." }));
          if(mem.length && !mem.some(m => m.indep)) alerts.push(govRegAlert(level, { art: "م51/ب", cta: "اللجان", page: "committees", text: "لا يوجد في لجنة المراجعة عضو مستقل؛ يلزم عضو مستقل على الأقل." }));
          if(mem.length && mem.filter(m => m.indep).length * 2 < mem.length) alerts.push(govRegAlert(level, { art: "م51/د", cta: "اللجان", page: "committees", text: "المستقلون أقل من نصف أعضاء لجنة المراجعة." }));
          const chName = nm(audit.chairman_name), ch = chName ? mem.find(m => nm(m.name) === chName) : null;
          if(ch && !ch.indep) alerts.push(govRegAlert(level, { art: "م51/ج", cta: "اللجان", page: "committees", text: "رئيس لجنة المراجعة ليس مستقلًا؛ يجب أن يكون رئيسها مستقلًا." }));
          mem.filter(m => m.conflict).forEach(m => alerts.push(govRegAlert(level, { art: "م51/و", cta: "اللجان", page: "committees", text: `«${m.name}» عمل خلال السنتين الماضيتين في الإدارة التنفيذية أو المالية للشركة أو لدى مراجعها؛ لا يجوز أن يكون عضوًا في لجنة المراجعة.` })));
          if(now.getMonth() >= 6 && meetsOf(audit) < Math.min(4, Math.floor((now.getMonth() + 1) / 3))) alerts.push(govRegAlert(level, { art: "م54/أ", cta: "جدول اجتماعًا", page: "meetings", text: `اجتماعات لجنة المراجعة هذه السنة ${meetsOf(audit)}؛ يلزم أربعة اجتماعات على الأقل في السنة المالية.` }));
        }
        const seenC = new Set();
        [[rem, "م57/أ", "لجنة المكافآت", "م60"], [nom, "م61/أ", "لجنة الترشيحات", "م64"]].forEach(([c, art, label, mArt]) => {
          if(!c) return;
          const mem = effOf(c), combined = kindOf(c) === "remnom", lab = combined ? "لجنة المكافآت والترشيحات" : label;
          if(mem.some(m => m.exec)) alerts.push(govRegAlert(level, { art, cta: "اللجان", page: "committees", text: `${lab} تضم عضوًا تنفيذيًا؛ يجب أن تكون من غير التنفيذيين.` }));
          if(mem.length && !mem.some(m => m.indep)) alerts.push(govRegAlert(level, { art, cta: "اللجان", page: "committees", text: `لا يوجد في ${lab} عضو مستقل؛ يلزم عضو مستقل على الأقل.` }));
          if(seenC.has(c.id)) return; seenC.add(c.id);
          if(combined){ if(now.getMonth() >= 6 && meetsOf(c) < 2 && now.getMonth() >= 6) alerts.push(govRegAlert(level, { art: "م47/7", cta: "جدول اجتماعًا", page: "meetings", text: `لجنة المكافآت والترشيحات اجتمعت ${meetsOf(c)} هذه السنة؛ يلزم اجتماع كل ستة أشهر على الأقل.` })); }
          else if(now.getMonth() >= 8 && meetsOf(c) === 0) alerts.push(govRegAlert(level, { art: mArt, cta: "جدول اجتماعًا", page: "meetings", text: `لم تجتمع ${lab} هذه السنة؛ يلزم اجتماع مرة في السنة على الأقل.` }));
        });
        // م17/ج وم51/ز: عضوية أكثر من خمس شركات مساهمة مدرجة في آن واحد (من نماذج الإفصاح)
        try {
          const { data: dfs } = await sb.from("board_disclosure_forms").select("full_name,member_email,created_at,other_memberships,survey_answers").eq("company_id", currentCompanyId).order("created_at", { ascending: false });
          const latest = {}; (dfs || []).forEach(d => { const k = d.member_email || d.full_name; if(k && !latest[k]) latest[k] = d; });
          const listedRe = x => /مدرجة/.test(x.legal_form || "") && !/غير\s*مدرجة/.test(x.legal_form || "");
          Object.values(latest).forEach(d => {
            const rows = Array.isArray(d.other_memberships) ? d.other_memberships : [];
            const sa = d.survey_answers || {};
            if(["j","k","l"].some(k => sa[k] && sa[k].answer === true)) alerts.push(govRegAlert(level, { art: "م44", cta: "راجع الأعضاء", page: "members", text: `«${d.full_name || "عضو"}» أفصح عن عمل منافس للشركة؛ يلزم إبلاغ المجلس وإثباته في المحضر، وعدم مشاركته في التصويت، وترخيص الجمعية العامة العادية (أو المجلس بتفويض منها).` }));
            const lst = rows.filter(listedRe).length + (currentCompanyType === "مساهمة مدرجة" ? 1 : 0);
            if(lst > 5) alerts.push(govRegAlert("main", { art: "م17/ج", cta: "راجع الأعضاء", page: "members", text: `«${d.full_name || "عضو"}» يشغل عضوية ${lst} شركات مساهمة مدرجة؛ الحد الأقصى خمس شركات في آن واحد.` }));
            const aud = rows.filter(x => listedRe(x) && /مراجعة/.test(x.committee || "")).length + (audit && currentCompanyType === "مساهمة مدرجة" ? 1 : 0);
            if(aud > 5) alerts.push(govRegAlert("main", { art: "م51/ز", cta: "راجع الأعضاء", page: "members", text: `«${d.full_name || "عضو"}» عضو في لجان مراجعة ${aud} شركات مدرجة؛ الحد الأقصى خمس.` }));
          });
        } catch(e){ console.error("listed boards check failed", e); }
      }
    } catch(e){ console.error("CMA regulation alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 5) Board decisions past their target date with no completion yet
    try {
      const { data: decisions } = await sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).not("target_date","is",null).not("status","eq","منجز");
      const overdue = (decisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
      if(overdue.length){
        alerts.push({ severity: "high", text: `${overdue.length} ${overdue.length===1?'قرار مجلس متأخر':'قرارات مجلس متأخرة'} عن موعد التنفيذ المستهدف.`, page: "decisiontracking" });
      }
    } catch(e){ console.error("decision tracking alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 7) Corrective actions from governance assessments past their target date, not yet closed
    try {
      const { data: gaOpenActs } = await sb.from("governance_actions").select("id,target_date,status").eq("company_id", currentCompanyId).not("status","eq","مغلق").not("target_date","is",null);
      const gaLate = (gaOpenActs||[]).filter(x => new Date(x.target_date) < new Date(new Date().toDateString()));
      if(gaLate.length){
        alerts.push({ severity: "high", text: `${gaLate.length} ${gaLate.length===1?'إجراء تصحيحي متأخر':'إجراءات تصحيحية متأخرة'} عن موعدها من تقييم فعالية الحوكمة.`, page: "govassess" });
      }
    } catch(e){ console.error("corrective action alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 9) Join requests waiting for this company's approver
    if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){
      try {
        const { data: jr } = await sb.from("company_join_requests").select("id").eq("company_id", currentCompanyId).eq("status","قيد المراجعة");
        if(jr && jr.length) alerts.push({ severity: "high", text: `${jr.length} ${jr.length===1?'طلب انضمام ينتظر':'طلبات انضمام تنتظر'} موافقتك.`, page: "users" });
      } catch(e){ console.error("join request alert check failed", e); }
    }
      return alerts;
    },
    async () => { const alerts = [];
    // 8) External compliance items past their deadline (a recurring one with a past date is unconfirmed)
    try {
      const { data: cmpRows } = await sb.from("compliance_items").select("id,status,due_date,frequency").eq("company_id", currentCompanyId);
      const cmpLate = (cmpRows||[]).filter(i => complianceDerivedStatus(i) === "متأخر").length;
      if(cmpLate){
        alerts.push({ severity: "high", text: `${cmpLate} ${cmpLate===1?'التزام نظامي متأخر':'التزامات نظامية متأخرة'} عن موعدها.`, page: "compliance" });
      }
    } catch(e){ console.error("compliance alert check failed", e); }
      return alerts;
    },
    async () => { const alerts = [];
    // 6) Manager decisions (single-manager LLC) past their own target date, unfinished
    if(currentCompanyLLCSingleManager){
      try {
        const { data: mgrDecisions } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context","manager").not("target_date","is",null).not("status","eq","منجز");
        const overdueMgr = (mgrDecisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
        if(overdueMgr.length){
          alerts.push({ severity: "high", text: `${overdueMgr.length} ${overdueMgr.length===1?'قرار مدير متأخر':'قرارات مدير متأخرة'} عن موعد التنفيذ المستهدف.`, page: "managerdecisions" });
        }
      } catch(e){ console.error("manager decision alert check failed", e); }
    }
      return alerts;
    },
  ];
  const __res = await Promise.all(__blocks.map(f => f().catch(e => { console.error("alert block failed", e); return []; })));
  __res.forEach(r => alerts.push(...r));
  return alerts;
}

/* بانر لوحة التحكم: اسم الشركة والتاريخ وعدد ما يحتاج تصرفًا — يقرأ مما هو معروض أصلًا ولا يضيف استعلامات */
function updateDashHero(alerts){
  const nameEl = document.getElementById("cdHeroName"); if(!nameEl) return;
  const sw = document.getElementById("companySwitcher");
  const nm = sw && sw.selectedOptions && sw.selectedOptions[0] ? sw.selectedOptions[0].textContent.trim() : "";
  nameEl.textContent = nm || "شركتك";
  const h = new Date().getHours();
  const hi = document.getElementById("cdHeroHi"); if(hi) hi.textContent = h < 12 ? "صباح الخير" : h < 18 ? "مساء الخير" : "مساء الخير";
  const meta = document.getElementById("cdHeroMeta");
  if(meta) meta.textContent = [currentCompanyType, new Date().toLocaleDateString("ar-SA-u-ca-gregory", { weekday:"long", day:"numeric", month:"long", year:"numeric" })].filter(Boolean).join(" · ");
  if(alerts){
    window._cdAlerts = alerts;
  }
  const a = window._cdAlerts;
  const box = document.getElementById("cdHeroPills"); if(!box || !a) return;
  const high = a.filter(x => x.severity === "high").length, med = a.length - high;
  const pill = (n, label, tone) => `<div class="cd-pill ${n ? tone : "ok"}" onclick="var e=document.getElementById('govAlertsPanel'); if(e && e.style.display!=='none') e.scrollIntoView({behavior:'smooth',block:'start'})"><b>${n}</b><span>${label}</span></div>`;
  box.innerHTML = (high + med === 0)
    ? `<div class="cd-pill ok"><b>✓</b><span>لا شيء يحتاج تصرفًا الآن</span></div>`
    : pill(high, "تحتاج تصرفًا الآن", "red") + pill(med, "للعلم والمتابعة", "amber");
}

async function renderGovAlertsPanel(){
  const panel = document.getElementById("govAlertsPanel");
  if(!panel) return;
  const alerts = await computeGovernanceAlerts();
  try{ updateDashHero(alerts); }catch(e){}
  if(alerts.length === 0){ panel.style.display = "none"; return; }

  const high = alerts.filter(a=>a.severity==="high");
  const med = alerts.filter(a=>a.severity!=="high");
  const SHOWN = 3;   // أهم 3 تنبيهات فقط تظهر؛ الباقي خلف زر
  const card = a => `<div class="gal2-item ${a.severity==='high'?'gal2-high':'gal2-med'}" onclick="go('${a.page}',null)">
      <span class="gal2-ico">${a.severity==='high'?'!':'i'}</span>
      <div class="gal2-body">
        <div class="gal2-text">${a.text}</div>
        <span class="gal2-cta">${a.cta||"افتح"} ‹</span>
      </div>
    </div>`;
  const all = [...high, ...med];
  const group = () => `<div class="gal2-grid">${all.slice(0, SHOWN).map(card).join("")}</div>
    ${all.length > SHOWN ? `<div class="gal2-grid" id="galMoreAll" style="display:none">${all.slice(SHOWN).map(card).join("")}</div>
    <button class="gal-toggle" onclick="const m=document.getElementById('galMoreAll');const o=m.style.display==='none';m.style.display=o?'grid':'none';this.textContent=o?'إخفاء':'عرض ${all.length - SHOWN} ${all.length - SHOWN === 1 ? "تنبيه آخر" : "تنبيهات أخرى"}';">عرض ${all.length - SHOWN} ${all.length - SHOWN === 1 ? "تنبيه آخر" : "تنبيهات أخرى"}</button>` : ""}`;
  panel.style.display = "block";
  panel.innerHTML = `<div class="card gal-card">
    <div class="gal-head">
      <span class="ico ico-bolt" style="width:18px;height:18px"></span>
      <span class="gal-title">تنبيهات الحوكمة</span>
      ${high.length ? `<span class="gal-chip gal-chip-high">${high.length} تحتاج تصرفاً الآن</span>` : ""}
      ${med.length ? `<span class="gal-chip">${med.length} للعلم</span>` : ""}
    </div>
    ${group()}
  </div>`;
}

/* Dashboard for entities that have no board: the meeting cards, "board members" and "committees"
   figures and the upcoming-meetings list describe things these companies don't have. Recent
   decisions replaces the meetings list so the card isn't just removed and left as a hole. */
async function applyDashboardEntityAdaptation(){
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const isLLC = currentCompanyType === "ذات مسؤولية محدودة";
  const noBoard = isSoleProp || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const hide = (id, on) => { const el = document.getElementById(id); const box = el ? (el.closest(".kpi") || el.closest(".sb-item")) : null; if(box) box.style.display = on ? "none" : ""; };

  hide("kpi-meetings-q", noBoard);
  hide("stat-members", noBoard);
  hide("stat-committees", noBoard || isLLC);
  const minutesLbl = document.getElementById("kpi-minutes") ? document.getElementById("kpi-minutes").closest(".kpi").querySelector(".kpi-label") : null;
  if(minutesLbl) minutesLbl.textContent = noBoard ? "وثائق موقّعة" : "محاضر معتمدة";
  const membersLbl = document.getElementById("stat-members") ? document.getElementById("stat-members").parentElement.querySelector(".sb-lbl") : null;
  if(membersLbl) membersLbl.textContent = `أعضاء ${getGovernanceBodyLabel()}`;

  const body = document.getElementById("dashUpcomingMeetings");
  const card = body ? body.closest(".card") : null;
  if(!card) return;
  const title = card.querySelector(".card-title");
  const btn = card.querySelector(".card-head button");
  const page = document.getElementById("p-dashboard");
  /* Companies with a board see the next meeting on the meetings KPI card instead, so this card is hidden for them. */
  if(page) page.classList.toggle("no-core", !noBoard);
  card.style.display = noBoard ? "" : "none";
  if(!noBoard){
    if(title) title.innerHTML = '<span class="ico-i ico-calendar"></span>الاجتماعات القادمة';
    if(btn){ btn.setAttribute("onclick","go('meetings',null)"); btn.textContent = "عرض الكل"; btn.style.display = ""; }
    return;
  }
  const context = currentCompanyLLCSingleManager ? "manager" : "owner";
  const decPage = context === "manager" ? "managerdecisions" : "ownerdecisions";
  if(title) title.innerHTML = `<span class="ico-i ico-signature"></span>آخر قرارات ${context === "manager" ? "المدير" : "المالك"}`;
  if(btn){ btn.setAttribute("onclick", `go('${decPage}',null)`); btn.textContent = "عرض الكل"; btn.style.display = ""; }
  const { data } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context", context).order("decision_date",{ascending:false}).limit(4);
  const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  body.innerHTML = (data && data.length)
    ? data.map(d => `<div style="padding:8px 0;border-bottom:1px solid var(--gray1)">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${esc(String(d.decision_text).slice(0,90))}${String(d.decision_text).length>90?"…":""}</div>
        <div style="font-size:11px;color:var(--gray3);margin-top:2px">${esc(d.decision_date)} · ${d.signed_at ? "موقَّع" : "غير موقَّع"}</div></div>`).join("")
    : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد قرارات موثَّقة بعد.<br><button class="btn-xs primary" style="margin-top:8px" onclick="go('${page}',null)">توثيق قرار</button></div>`;
}

async function loadDashboard(){
  try{ updateDashHero(); }catch(e){}
  renderGovAlertsPanel(); // fire independently — a slow/failed alert check must never block the rest of the dashboard
  const [meetingsRes, risksRes, complianceRes, membersRes, committeesRes, signingRes, policiesRes, auditRes, govAssessRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    fetchCompanyRisks().then(d => ({ data: d })),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("audit_items").select("*").eq("company_id", currentCompanyId),
    sb.from("governance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1)
  ]);

  const meetings = meetingsRes.data || [];
  const risks = risksRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const members = membersRes.data || [];
  const committeesData = committeesRes.data || [];
  const signingDocs = signingRes.data || [];
  const policies = policiesRes.data || [];
  const auditItems = auditRes.data || [];
  try{ renderStartHere({ members: members.length, policies: policies.length, meetings: meetings.length, signing: signingDocs.length }); }catch(e){}

  const govassessKpiEl = document.getElementById("kpi-govassess");
  const govassessFootEl = document.getElementById("kpi-govassess-foot");
  const govassessStripeEl = document.getElementById("kpi-govassess-stripe");
  if(govassessKpiEl){
    const latestAssess = (govAssessRes.data||[])[0];
    if(latestAssess){
      const { finalScore } = computeGovScores(latestAssess);
      if(finalScore != null){
        const pct = Math.round((finalScore/5)*100);
        const interp = maturityInterpretation(finalScore);
        govassessKpiEl.textContent = pct + "%";
        govassessKpiEl.style.color = interp.color;
        if(govassessStripeEl) govassessStripeEl.style.background = interp.color;
        if(govassessFootEl) govassessFootEl.textContent = interp.label + " · " + (latestAssess.period||"");
      } else {
        govassessKpiEl.textContent = "—";
        if(govassessFootEl) govassessFootEl.textContent = "لا توجد معايير مُقيَّمة بعد";
      }
    } else {
      govassessKpiEl.textContent = "—";
      if(govassessFootEl) govassessFootEl.textContent = "لم يُجرَ تقييم بعد";
    }
  }
  renderDashTopRisks(risks);
  renderDashAuditStatus(auditItems);

  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);
  const currentQuarter = Math.floor(now.getMonth()/3);
  const currentYear = now.getFullYear();

  // ── KPI: meetings this quarter ──
  const quarterMeetings = meetings.filter(m => {
    if(!m.meeting_date) return false;
    const d = new Date(m.meeting_date);
    return d.getFullYear()===currentYear && Math.floor(d.getMonth()/3)===currentQuarter;
  });
  const completedQ = quarterMeetings.filter(m => m.meeting_date < todayStr).length;
  const upcomingQ = quarterMeetings.filter(m => m.meeting_date >= todayStr).length;
  setText("kpi-meetings-q", quarterMeetings.length);
  setText("kpi-meetings-q-foot", `✅ ${completedQ} مكتملة · ${upcomingQ} قادمة`);

  // ── KPI: approved minutes (fully-signed documents) ──
  const approvedDocs = signingDocs.filter(d => d.status === "مكتمل");
  const approvedThisMonth = approvedDocs.filter(d => d.created_at && new Date(d.created_at).getMonth()===now.getMonth() && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("kpi-minutes", approvedDocs.length);
  setText("kpi-minutes-foot", `↑ ${approvedThisMonth} هذا الشهر`);

  // ── KPI: compliance % ──
  const cmpSum = complianceSummary(compliance, await cmpLatestAssessment());
  setText("kpi-compliance", cmpSum.pct != null ? cmpSum.pct+"%" : "—");
  setText("kpi-compliance-foot", cmpSum.text);
  setText("stat-compliance2", cmpSum.pct != null ? cmpSum.pct+"%" : "—");

  // ── KPI: open risks ──
  const openRisks = risks.filter(r => r.status === "مراقبة" || r.status === "متابعة");
  const highOpenRisks = openRisks.filter(r => r.impact === "عالٍ").length;
  setText("kpi-risks", openRisks.length);
  setText("kpi-risks-foot", highOpenRisks ? `🔴 ${highOpenRisks} عالية الأولوية` : "لا مخاطر عالية حاليًا");

  // ── Stats bar ──
  setText("stat-members", members.length);
  setText("stat-committees", committeesData.length);
  const decisionsThisYear = signingDocs.filter(d => d.created_at && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("stat-decisions", decisionsThisYear);
  setText("stat-pending-signs", signingDocs.filter(d => d.status !== "مكتمل").length);

  // ── Upcoming meetings (next 4, any type) ──
  const upcoming = meetings
    .filter(m => m.meeting_date && m.meeting_date >= todayStr)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""))
    .slice(0,4);
  const upcomingBox = document.getElementById("dashUpcomingMeetings");
  if(upcomingBox){
    if(upcoming.length===0){
      upcomingBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد اجتماعات قادمة حاليًا.</div>';
    } else {
      upcomingBox.innerHTML = upcoming.map(m => {
        const d = new Date(m.meeting_date);
        const isEmergency = m.meeting_type === "اجتماع طارئ";
        const badge = isEmergency ? '<span class="badge urgent">طارئ</span>' : '<span class="badge done">مؤكد</span>';
        return `<div class="meet-item">
          <div class="meet-dt"><div class="meet-day">${d.getDate()}</div><div class="meet-mon">${AR_MONTHS[d.getMonth()]}</div></div>
          <div class="meet-info"><div class="meet-name">${orgEsc(m.title||"")}</div><div class="meet-meta"><span class="ico-i ico-pin"></span>${m.method||"—"}${m.meeting_time?(' · '+m.meeting_time):''} · ${m.meeting_type||""}</div></div>
          ${badge}
        </div>`;
      }).join("");
    }
  }

  // ── Executive alerts, generated from real conditions across the platform ──
  const alerts = [];
  if(upcoming.length){
    const next = upcoming[0];
    const daysAway = Math.ceil((new Date(next.meeting_date) - now) / 86400000);
    if(daysAway <= 7){
      alerts.push({ color:"red", text:`${next.title||"اجتماع"} مقرر خلال ${daysAway} ${daysAway===1?'يوم':'أيام'} — ${next.meeting_date}` });
    }
  }
  if(highOpenRisks){
    alerts.push({ color:"red", text:`يوجد ${highOpenRisks} ${highOpenRisks===1?'خطر مصنّف':'مخاطر مصنّفة'} عالية الأولوية مفتوحة` });
  }
  const pendingSignCount = signingDocs.filter(d => d.status !== "مكتمل").length;
  if(pendingSignCount){
    alerts.push({ color:"gold", text:`${pendingSignCount} ${pendingSignCount===1?'وثيقة تنتظر':'وثائق تنتظر'} التوقيع الإلكتروني` });
  }
  const recentlyApproved = approvedDocs
    .filter(d => d.created_at && (now - new Date(d.created_at)) < 7*86400000)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
  if(recentlyApproved){
    alerts.push({ color:"green", text:`تم اعتماد "${recentlyApproved.document_name}" بالتوقيع الإلكتروني من جميع الأطراف` });
  }
  const soonReview = policies
    .filter(p => p.review_date && (new Date(p.review_date)-now) < 30*86400000 && (new Date(p.review_date)-now) > 0)
    .sort((a,b)=> new Date(a.review_date)-new Date(b.review_date))[0];
  if(soonReview){
    const daysLeft = Math.ceil((new Date(soonReview.review_date)-now)/86400000);
    alerts.push({ color:"gold", text:`موعد مراجعة "${soonReview.policy_name}" خلال ${daysLeft} يومًا` });
  }
  const complianceGaps = compliance.filter(c => !complianceIsOk(c)).length;
  if(complianceGaps){
    alerts.push({ color:"gold", text:`${complianceGaps} ${complianceGaps===1?'بند امتثال':'بنود امتثال'} لم يكتمل بعد` });
  }

  const alertsBox = document.getElementById("dashAlerts");
  if(alertsBox){
    const bar = (label, done, total, goPage) => {
      if(!total) return `<div class="pg-row" onclick="go('${goPage}',null)"><div class="pg-top"><span>${label}</span><small>لا بيانات بعد</small></div><div class="pg-track"></div></div>`;
      const p = Math.round(done/total*100);
      const cls = p>=80?"pg-good":p>=50?"pg-mid":"pg-low";
      return `<div class="pg-row" onclick="go('${goPage}',null)"><div class="pg-top"><span>${label}</span><small><b>${done}</b> من ${total} · ${p}%</small></div><div class="pg-track"><div class="pg-fill ${cls}" style="width:${p}%"></div></div></div>`;
    };
    const pol = policies;
    const polDone = pol.filter(p => p.approval_date).length;
    const signTot = signingDocs.length, signDone = signingDocs.filter(d => d.status === "مكتمل").length;
    const cmpOk = compliance.filter(complianceIsOk).length;
    const auditTot = auditItems.length, auditDone = auditItems.filter(i => i.status === "مغلقة").length;
    let actTot = 0, actDone = 0;
    try {
      const { data: acts } = await sb.from("governance_actions").select("status").eq("company_id", currentCompanyId);
      actTot = (acts||[]).length; actDone = (acts||[]).filter(x => x.status === "مغلق").length;
    } catch(e){}
    alertsBox.innerHTML = `<div class="pg-wrap">
      ${bar("سياسات معتمدة", polDone, pol.length, "governance")}
      ${bar("وثائق موقّعة بالكامل", signDone, signTot, "signing")}
      ${bar("بنود امتثال ملتزمة", cmpOk, compliance.length, "compliance")}
      ${bar("بنود تدقيق مغلقة", auditDone, auditTot, "audit")}
      ${bar("إجراءات تصحيحية مُغلقة", actDone, actTot, "govassess")}
    </div>`;
  }
  enhanceDashboardKpis({ nextMeeting: upcoming[0] || null, quarterMeetings: quarterMeetings.length, completedQ, upcomingQ, pendingSigns: signingDocs.filter(d => d.status !== "مكتمل").length, approvedThisMonth, cmpSum, risksTotal: risks.length, openRisks: openRisks.length, highOpenRisks, highNoPlan: openRisks.filter(r => r.impact === "عالٍ" && !(r.treatment_plan||"").trim()).length });
  applyDashboardEntityAdaptation();
  if(typeof renderGovNetworkCard === "function") renderGovNetworkCard();
}

/* Dashboard KPI interpretation: every figure gets a plain status, the reason behind it and the next step,
   so an executive can decide from the card itself instead of guessing what "0%" or "—" means. */
function enhanceDashboardKpis(c){
  const put = (valId, st, why, act, valText, icon) => {
    const v = document.getElementById(valId); const k = v ? v.closest(".kpi") : null; if(!k) return;
    if(valText !== undefined){ v.textContent = valText; v.classList.toggle("kpi-val-na", valText === "غير مقيَّم" || valText === "لا بيانات"); }
    else v.classList.remove("kpi-val-na");
    const foot = k.querySelector(".kpi-foot"); if(foot) foot.style.display = "none";
    let ins = k.querySelector(".kpi-ins"); if(!ins){ ins = document.createElement("div"); ins.className = "kpi-ins"; k.appendChild(ins); }
    const lbl = {good:"جيد", watch:"يحتاج متابعة", crit:"حرج", na:"غير مقيَّم"}[st];
    ins.innerHTML = `<span class="kst kst-${st}">${lbl}</span><div class="kpi-why">${why}</div>`;
    setGo(k, act, icon);
  };
  /* One action line per card, with an icon: tells the reader where the card leads. */
  const setGo = (k, text, icon) => {
    const foot = k.querySelector(".kpi-foot"); if(foot) foot.style.display = "none";
    let g = k.querySelector(".kpi-go"); if(!g){ g = document.createElement("div"); g.className = "kpi-go"; k.appendChild(g); }
    g.innerHTML = `<span class="ico-i ${icon||"ico-eye"}"></span><span>${text}</span><span class="kpi-go-arr">‹</span>`;
  };
  const nm = c.nextMeeting;
  const nextTxt = nm ? (() => { const d = new Date(nm.meeting_date); return `الاجتماع القادم: ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`; })() : "";
  // meetings
  put("kpi-meetings-q", c.quarterMeetings ? "good" : "watch",
    c.quarterMeetings ? `${c.completedQ} منعقدة و${c.upcomingQ} قادمة هذا الربع` : "لا توجد اجتماعات مجدولة لهذا الربع",
    nextTxt || "جدولة اجتماع جديد", undefined, "ico-calendar");
  // minutes / signed documents
  put("kpi-minutes", c.pendingSigns ? "watch" : "good",
    c.pendingSigns ? `${c.pendingSigns} ${c.pendingSigns===1?'وثيقة تنتظر':'وثائق تنتظر'} توقيعاً · ${c.approvedThisMonth} اعتُمدت هذا الشهر` : `كل الوثائق موقّعة · ${c.approvedThisMonth} هذا الشهر`,
    c.pendingSigns ? "افتح التوقيعات المعلّقة" : "افتح المحاضر المعتمدة", undefined, "ico-document");
  // compliance
  const unassessed = c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||"");
  if(c.cmpSum.pct == null) put("kpi-compliance","na","لا توجد بنود امتثال مسجّلة بعد","أضف بنود الامتثال","لا بيانات","ico-check");
  else if(unassessed) put("kpi-compliance","na",`${c.cmpSum.text.replace(" (لم يُجرَ تقييم بعد)","")} — بلا تقييم رسمي حتى الآن`,"ابدأ تقييم الامتثال","غير مقيَّم","ico-check");
  else { const p=c.cmpSum.pct; put("kpi-compliance", p<50?"crit":p<80?"watch":"good", c.cmpSum.text, p<80?"تابع البنود غير المكتملة":"تابع بنود الامتثال", p+"%", "ico-check"); }
  // risks
  if(!c.risksTotal) put("kpi-risks","na","لم تُسجَّل مخاطر بعد","سجّل أول خطر","لا بيانات","ico-warning");
  else if(c.highNoPlan) put("kpi-risks","crit",`${c.highNoPlan} عالية التأثير بلا خطة معالجة`,"شاهد أعلى المخاطر",undefined,"ico-warning");
  else if(c.highOpenRisks) put("kpi-risks","watch",`${c.highOpenRisks} عالية التأثير ولها خطة معالجة قيد المتابعة`,"شاهد أعلى المخاطر",undefined,"ico-warning");
  else if(c.openRisks) put("kpi-risks","watch",`${c.openRisks} ${c.openRisks===1?'خطر مفتوح':'مخاطر مفتوحة'} متوسطة أو منخفضة التأثير`,"شاهد المخاطر المفتوحة",undefined,"ico-warning");
  else put("kpi-risks","good","لا مخاطر مفتوحة حالياً","افتح سجل المخاطر",undefined,"ico-warning");
  // governance effectiveness
  const g = document.getElementById("kpi-govassess");
  if(g){
    const m = (g.textContent||"").match(/(\d+)%/);
    if(!m) put("kpi-govassess","na","لم يُجرَ تقييم لفعالية الحوكمة بعد","ابدأ تقييم الحوكمة","غير مقيَّم","ico-dashboard");
    else { const p=+m[1]; const f=document.getElementById("kpi-govassess-foot"); const why=f&&f.textContent?f.textContent:"نتيجة آخر تقييم"; put("kpi-govassess", p<50?"crit":p<75?"watch":"good", why, p<75?"اطّلع على الإجراءات التصحيحية":"اطّلع على نتيجة التقييم", undefined, "ico-dashboard"); }
  }
  const dv = document.getElementById("stat-decisions"); const dk = dv ? dv.closest(".kpi") : null;
  if(dk) setGo(dk, "شاهد قرارات هذا العام", "ico-signature");
  // stats bar: pending signatures becomes an actionable item
  const sc = document.getElementById("stat-compliance2"); if(sc && (c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||""))) sc.textContent = "غير مقيَّم";
  const ps = document.getElementById("stat-pending-signs"); const psb = ps ? ps.closest(".sb-item") : null;
  if(psb){ psb.style.cursor="pointer"; psb.onclick = () => go("signing", null); psb.classList.toggle("sb-alert", c.pendingSigns > 0); }
}
