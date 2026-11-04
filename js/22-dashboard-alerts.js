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
  const items = [];

  // 0) Platform admin: new company registration requests awaiting review — this is a
  // platform-wide event, not scoped to whichever company is currently selected.
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(isPlatformAdmin){
    const { data: reqs } = await sb.from("company_requests").select("*").eq("status", "قيد المراجعة");
    (reqs||[]).forEach(r => { items.push({ icon:"🏢", text:`طلب إدراج شركة جديد: "${r.company_name}" ينتظر مراجعتك`, page:"companyrequests" }); });
  }

  // 1) Consultation requests needing your action
  if(role === 'مدير النظام' || role === 'رئيس مجلس'){
    const { data: cr } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId);
    (cr||[]).forEach(r => {
      if(role==='مدير النظام' && r.status==='جديد') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر عرض سعر منك`, page:"consultants" });
      if(role==='رئيس مجلس' && r.status==='عرض سعر مقدم') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر قرارك`, page:"consultants" });
    });
  }

  if(role !== 'مساهم'){
    // 2) Meeting requests needing your response
    const { data: mr } = await sb.from("meeting_requests").select("*").eq("company_id", currentCompanyId).eq("status","قيد الموافقة");
    if(mr && mr.length){
      const ids = mr.map(r=>r.id);
      const { data: myResponses } = await sb.from("meeting_request_responses").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const respondedIds = new Set((myResponses||[]).map(r=>r.request_id));
      mr.forEach(r => { if(!respondedIds.has(r.id)) items.push({ icon:"🗳️", text:`طلب اجتماع "${r.title}" ينتظر موافقتك على الموعد`, page:"meetings" }); });
    }

    // 3) Policy reviews needing your response
    const { data: pol } = await sb.from("policies").select("*").eq("company_id", currentCompanyId).eq("status","مرفوعة لمجلس الإدارة");
    if(pol && pol.length){
      const ids = pol.map(p=>p.id);
      const { data: myPolReviews } = await sb.from("policy_reviews").select("policy_id").in("policy_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPolReviews||[]).map(r=>r.policy_id));
      pol.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📜", text:`سياسة "${p.policy_name}" تنتظر رأيك`, page:"governance" }); });
    }

    // 4) Appointment requests needing your review
    const { data: ap } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).eq("status","محال إلى مجلس الإدارة");
    if(ap && ap.length){
      const ids = ap.map(a=>a.id);
      const { data: myApReviews } = await sb.from("appoint_request_reviews").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myApReviews||[]).map(r=>r.request_id));
      ap.forEach(a => { if(!reviewedIds.has(a.id)) items.push({ icon:"👤", text:`طلب تعيين "${a.candidate_name}" ينتظر رأيك`, page:"appoint" }); });
    }

    // 5) Performance evaluations needing your input
    const { data: pe } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).eq("status","مفتوح للتقييم");
    if(pe && pe.length){
      const ids = pe.map(p=>p.id);
      const { data: myPeReviews } = await sb.from("performance_evaluation_reviews").select("evaluation_id").in("evaluation_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPeReviews||[]).map(r=>r.evaluation_id));
      pe.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📐", text:`تقييم أداء "${p.entity_name}" ينتظر تقييمك`, page:"perf" }); });
    }

    // 6) Documents needing your signature
    const { data: docs } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).neq("status","مكتمل");
    if(docs && docs.length){
      const ids = docs.map(d=>d.id);
      const { data: mySigs } = await sb.from("document_signatures").select("document_id").in("document_id", ids).eq("signer_email", myEmail||"");
      const signedIds = new Set((mySigs||[]).map(s=>s.document_id));
      docs.forEach(d => { if(!signedIds.has(d.id)) items.push({ icon:"✍️", text:`وثيقة "${d.document_name}" تنتظر توقيعك`, page:"signing" }); });
    }
  }

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
  } catch(e){ console.error("risk alert check failed", e); }

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

  // 5) Board decisions past their target date with no completion yet
  try {
    const { data: decisions } = await sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).not("target_date","is",null).not("status","eq","منجز");
    const overdue = (decisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
    if(overdue.length){
      alerts.push({ severity: "high", text: `${overdue.length} ${overdue.length===1?'قرار مجلس متأخر':'قرارات مجلس متأخرة'} عن موعد التنفيذ المستهدف.`, page: "decisiontracking" });
    }
  } catch(e){ console.error("decision tracking alert check failed", e); }

  // 7) Corrective actions from governance assessments past their target date, not yet closed
  try {
    const { data: gaOpenActs } = await sb.from("governance_actions").select("id,target_date,status").eq("company_id", currentCompanyId).not("status","eq","مغلق").not("target_date","is",null);
    const gaLate = (gaOpenActs||[]).filter(x => new Date(x.target_date) < new Date(new Date().toDateString()));
    if(gaLate.length){
      alerts.push({ severity: "high", text: `${gaLate.length} ${gaLate.length===1?'إجراء تصحيحي متأخر':'إجراءات تصحيحية متأخرة'} عن موعدها من تقييم فعالية الحوكمة.`, page: "govassess" });
    }
  } catch(e){ console.error("corrective action alert check failed", e); }

  // 9) Join requests waiting for this company's approver
  if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){
    try {
      const { data: jr } = await sb.from("company_join_requests").select("id").eq("company_id", currentCompanyId).eq("status","قيد المراجعة");
      if(jr && jr.length) alerts.push({ severity: "high", text: `${jr.length} ${jr.length===1?'طلب انضمام ينتظر':'طلبات انضمام تنتظر'} موافقتك.`, page: "users" });
    } catch(e){ console.error("join request alert check failed", e); }
  }

  // 8) External compliance items past their deadline (a recurring one with a past date is unconfirmed)
  try {
    const { data: cmpRows } = await sb.from("compliance_items").select("id,status,due_date,frequency").eq("company_id", currentCompanyId);
    const cmpLate = (cmpRows||[]).filter(i => complianceDerivedStatus(i) === "متأخر").length;
    if(cmpLate){
      alerts.push({ severity: "high", text: `${cmpLate} ${cmpLate===1?'التزام نظامي متأخر':'التزامات نظامية متأخرة'} عن موعدها.`, page: "compliance" });
    }
  } catch(e){ console.error("compliance alert check failed", e); }

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
  const LIMIT = 4;
  const card = a => `<div class="gal-row ${a.severity==='high'?'gal-high':'gal-med'}" onclick="go('${a.page}',null)">
      <div class="gal-text">${a.text}</div>
      <span class="gal-cta">${a.cta||"افتح"} ‹</span>
    </div>`;
  const group = (id, title, list) => !list.length ? "" : `<div class="gal-sec">${title} <span class="gal-count">${list.length}</span></div>
    <div class="gal-grid">${list.slice(0, LIMIT).map(card).join("")}</div>
    ${list.length > LIMIT ? `<div class="gal-grid gal-more" id="${id}" style="display:none">${list.slice(LIMIT).map(card).join("")}</div>
    <button class="gal-toggle" onclick="const m=document.getElementById('${id}');const o=m.style.display==='none';m.style.display=o?'grid':'none';this.textContent=o?'إخفاء':'عرض ${list.length - LIMIT} تنبيهات أخرى';">عرض ${list.length - LIMIT} ${list.length - LIMIT === 1 ? "تنبيه آخر" : "تنبيهات أخرى"}</button>` : ""}`;
  panel.style.display = "block";
  panel.innerHTML = `<div class="card gal-card">
    <div class="gal-head">
      <span class="ico ico-bolt" style="width:18px;height:18px"></span>
      <span class="gal-title">تنبيهات الحوكمة</span>
      ${high.length ? `<span class="gal-chip gal-chip-high">${high.length} تحتاج تصرفاً الآن</span>` : ""}
      ${med.length ? `<span class="gal-chip">${med.length} للعلم</span>` : ""}
    </div>
    ${group("galMoreHigh", "تحتاج تصرفاً الآن", high)}
    ${group("galMoreMed", "للعلم والمتابعة", med)}
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
  if(!noBoard){
    if(title) title.innerHTML = '<span class="ico-i ico-calendar"></span>الاجتماعات القادمة';
    if(btn){ btn.setAttribute("onclick","go('meetings',null)"); btn.textContent = "عرض الكل"; btn.style.display = ""; }
    return;
  }
  const context = currentCompanyLLCSingleManager ? "manager" : "owner";
  const page = context === "manager" ? "managerdecisions" : "ownerdecisions";
  if(title) title.innerHTML = `<span class="ico-i ico-signature"></span>آخر قرارات ${context === "manager" ? "المدير" : "المالك"}`;
  if(btn){ btn.setAttribute("onclick", `go('${page}',null)`); btn.textContent = "عرض الكل"; btn.style.display = ""; }
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
  enhanceDashboardKpis({ quarterMeetings: quarterMeetings.length, completedQ, upcomingQ, pendingSigns: signingDocs.filter(d => d.status !== "مكتمل").length, approvedThisMonth, cmpSum, risksTotal: risks.length, openRisks: openRisks.length, highOpenRisks, highNoPlan: openRisks.filter(r => r.impact === "عالٍ" && !(r.treatment_plan||"").trim()).length });
  applyDashboardEntityAdaptation();
  if(typeof renderGovNetworkCard === "function") renderGovNetworkCard();
}

/* Dashboard KPI interpretation: every figure gets a plain status, the reason behind it and the next step,
   so an executive can decide from the card itself instead of guessing what "0%" or "—" means. */
function enhanceDashboardKpis(c){
  const put = (valId, st, why, act, valText) => {
    const v = document.getElementById(valId); const k = v ? v.closest(".kpi") : null; if(!k) return;
    if(valText !== undefined){ v.textContent = valText; v.classList.toggle("kpi-val-na", valText === "غير مقيَّم" || valText === "لا بيانات"); }
    else v.classList.remove("kpi-val-na");
    const foot = k.querySelector(".kpi-foot"); if(foot) foot.style.display = "none";
    let ins = k.querySelector(".kpi-ins"); if(!ins){ ins = document.createElement("div"); ins.className = "kpi-ins"; k.appendChild(ins); }
    const lbl = {good:"جيد", watch:"يحتاج متابعة", crit:"حرج", na:"غير مقيَّم"}[st];
    ins.innerHTML = `<span class="kst kst-${st}">${lbl}</span><div class="kpi-why">${why}</div>${act ? `<div class="kpi-act">${act} ‹</div>` : ""}`;
  };
  // meetings
  put("kpi-meetings-q", c.quarterMeetings ? "good" : "watch",
    c.quarterMeetings ? `${c.completedQ} منعقدة و${c.upcomingQ} قادمة هذا الربع` : "لا توجد اجتماعات مجدولة لهذا الربع",
    c.quarterMeetings ? "" : "جدولة اجتماع");
  // minutes / signed documents
  put("kpi-minutes", c.pendingSigns ? "watch" : "good",
    c.pendingSigns ? `${c.pendingSigns} ${c.pendingSigns===1?'وثيقة تنتظر':'وثائق تنتظر'} توقيعاً · ${c.approvedThisMonth} اعتُمدت هذا الشهر` : `كل الوثائق موقّعة · ${c.approvedThisMonth} هذا الشهر`,
    c.pendingSigns ? "افتح التوقيعات" : "");
  // compliance
  const unassessed = c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||"");
  if(c.cmpSum.pct == null) put("kpi-compliance","na","لا توجد بنود امتثال مسجّلة بعد","ابدأ بإضافة البنود","لا بيانات");
  else if(unassessed) put("kpi-compliance","na",`${c.cmpSum.text.replace(" (لم يُجرَ تقييم بعد)","")} — بلا تقييم رسمي حتى الآن`,"ابدأ التقييم","غير مقيَّم");
  else { const p=c.cmpSum.pct; put("kpi-compliance", p<50?"crit":p<80?"watch":"good", c.cmpSum.text, p<80?"راجع البنود غير المكتملة":"", p+"%"); }
  // risks
  if(!c.risksTotal) put("kpi-risks","na","لم تُسجَّل مخاطر بعد","سجّل أول خطر","لا بيانات");
  else if(c.highNoPlan) put("kpi-risks","crit",`${c.highNoPlan} عالية التأثير بلا خطة معالجة`,"راجع المخاطر");
  else if(c.highOpenRisks) put("kpi-risks","watch",`${c.highOpenRisks} عالية التأثير ولها خطة معالجة قيد المتابعة`,"راجع المخاطر");
  else if(c.openRisks) put("kpi-risks","watch",`${c.openRisks} ${c.openRisks===1?'خطر مفتوح':'مخاطر مفتوحة'} متوسطة أو منخفضة التأثير`,"راجع المخاطر");
  else put("kpi-risks","good","لا مخاطر مفتوحة حالياً","");
  // governance effectiveness
  const g = document.getElementById("kpi-govassess");
  if(g){
    const m = (g.textContent||"").match(/(\d+)%/);
    if(!m) put("kpi-govassess","na","لم يُجرَ تقييم لفعالية الحوكمة بعد","ابدأ التقييم","غير مقيَّم");
    else { const p=+m[1]; const f=document.getElementById("kpi-govassess-foot"); const why=f&&f.textContent?f.textContent:"نتيجة آخر تقييم"; put("kpi-govassess", p<50?"crit":p<75?"watch":"good", why, p<75?"اطّلع على الإجراءات التصحيحية":""); }
  }
  // stats bar: pending signatures becomes an actionable item
  const sc = document.getElementById("stat-compliance2"); if(sc && (c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||""))) sc.textContent = "غير مقيَّم";
  const ps = document.getElementById("stat-pending-signs"); const psb = ps ? ps.closest(".sb-item") : null;
  if(psb){ psb.style.cursor="pointer"; psb.onclick = () => go("signing", null); psb.classList.toggle("sb-alert", c.pendingSigns > 0); }
}
