/* ══════════ PERFORMANCE EVALUATIONS ══════════ */
let perfCache = [];
const PERF_SCORE_LABELS = {1:"ضعيف",2:"مقبول",3:"جيد",4:"جيد جدًا",5:"ممتاز"};

const PERF_AUTO_CRITERIA = ["الانضباط والالتزام (آلي)", "نسبة الحضور الفعلية (آلي)", "نسبة المشاركة بالتصويت (آلي)", "نسبة إنجاز القرارات الموكلة (آلي)"];

/* Board members eligible for evaluation — everyone with a linked account except executives
   (they get their own section, sourced from the org structure instead — see below). */
async function getEvaluableBoardMembers(){
  const people = await getPerfEligiblePeople();
  return people.filter(p => p.role !== "تنفيذي");
}

/* Senior executive management is tied to the actual org chart, not a flag on a board row:
   الرئيس التنفيذي، نواب الرئيس (إن وُجدوا), المدير المالي. Two independent signals, either one
   is enough: (1) the org-chart holder's name matches a real linked account, or (2) the account
   itself carries a membership role whose text already says "رئيس تنفيذي" / "نائب الرئيس" /
   "مدير مالي" (e.g. a custom role set from إدارة الفريق). Filtering happens in plain JS rather
   than a server-side OR-filter string, so a mismatched pattern can never silently take down the
   whole query — worst case one signal contributes nothing, it never throws. */
async function getEvaluableExecutives(){
  const EXEC_PATTERNS = ["تنفيذي","نائب الرئيس","نائب رئيس","مدير مالي","المدير المالي"];
  const results = new Map(); // keyed by email — de-dupes if both signals agree on the same person

  try {
    const { data: allMemberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
    const roleMatches = (allMemberships||[]).filter(m => EXEC_PATTERNS.some(p => (m.role||"").includes(p)));
    for(const m of roleMatches){
      const { data: profile } = await sb.from("user_profiles").select("full_name").eq("email", m.email).maybeSingle();
      results.set(m.email, { name: profile?.full_name || m.email, email: m.email, role: "تنفيذي", position: m.role });
    }
  } catch(e){ console.error("exec role-signal failed", e); }

  try {
    const { data: positions } = await sb.from("org_structure").select("position_title,holder_name").eq("company_id", currentCompanyId);
    const execPositions = (positions||[]).filter(p => p.holder_name && EXEC_PATTERNS.some(pat => (p.position_title||"").includes(pat)));
    for(const pos of execPositions){
      const holderName = pos.holder_name.trim();
      const { data: profile } = await sb.from("user_profiles").select("email").ilike("full_name", holderName).maybeSingle();
      if(!profile || !profile.email) continue;
      if(results.has(profile.email)) continue;
      const { data: membership } = await sb.from("user_company_memberships").select("email").eq("company_id", currentCompanyId).eq("email", profile.email).maybeSingle();
      if(!membership) continue;
      results.set(profile.email, { name: holderName, email: profile.email, role: "تنفيذي", position: pos.position_title });
    }
  } catch(e){ console.error("exec org-structure-signal failed", e); }

  return Array.from(results.values());
}

/* Who reviews an executive: every linked board member (voting members) — executives don't
   review each other or themselves. */
async function getExecReviewerAudience(){
  const boardPeople = await getEvaluableBoardMembers();
  return boardPeople.map(p => p.email);
}

/* Opening a new evaluation cycle is an operational task (مدير النظام runs the platform), kept
   separate from *seeing results* (a confidentiality-restricted set) — someone can administer
   the cycle without being entitled to read peers' scores themselves. */
async function canManagePerfCycles(){
  if(currentUserProfile && currentUserProfile.is_platform_admin === true) return true;
  if(getCurrentRole() === "مدير النظام") return true;
  return await canSeePerfResults();
}

/* ══════════ DECISION TRACKING (متابعة القرارات) ══════════
   Decisions themselves are still recorded exactly as before, inside each meeting — this page
   never creates a decision, it only adds accountability on top of ones that already exist:
   who owns getting it done, by when, and whether that's actually happening. Overdue ones feed
   the dashboard's proactive alerts, and completion becomes one more automatic input to
   performance evaluation — nobody has to remember to chase this by hand. */
let decisionTrackingCache = [];
let decisionTrackingPeople = [];

function canManageDecisions(){
  const role = getCurrentRole();
  return role === "مدير النظام" || role === "سكرتير المجلس";
}

function computeDecisionStatus(d){
  if(d.status === "منجز") return "منجز";
  if(d.target_date && new Date(d.target_date) < new Date(new Date().toDateString())) return "متأخر";
  return d.status || "لم يبدأ";
}

/* ══════════ SIMPLE DECISIONS (single-manager / single-owner LLC) ══════════
   Deliberately minimal: a decision is text + a date + an optional signature, with none of the
   meeting/quorum/voting machinery — because for exactly one decision-maker, that machinery has
   no one to coordinate with in the first place. */
let simpleDecisionsCache = { manager: [], owner: [] };

async function loadSimpleDecisions(context){
  const { data } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context", context).order("decision_date",{ascending:false});
  simpleDecisionsCache[context] = data || [];
  if(context === "manager"){
    const list = simpleDecisionsCache.manager;
    const statsBox = document.getElementById("managerDecisionsStats");
    if(statsBox){
      const total = list.length;
      const done = list.filter(d => computeSimpleDecisionStatus(d) === "منجز").length;
      const overdue = list.filter(d => computeSimpleDecisionStatus(d) === "متأخر").length;
      statsBox.innerHTML = `
        <div class="kpi blue"><div class="kpi-label">إجمالي القرارات</div><div class="kpi-val">${total}</div></div>
        <div class="kpi green"><div class="kpi-label">منجزة</div><div class="kpi-val">${done}</div></div>
        <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>`;
    }
  }
  renderSimpleDecisionsList(context);
}

function computeSimpleDecisionStatus(d){
  if(d.status === "منجز") return "منجز";
  if(d.target_date && new Date(d.target_date) < new Date(new Date().toDateString())) return "متأخر";
  return d.status || "لم يبدأ";
}

function renderSimpleDecisionsList(context){
  const box = document.getElementById(context === "manager" ? "managerDecisionsList" : "ownerDecisionsList");
  if(!box) return;
  const list = simpleDecisionsCache[context];
  if(!list.length){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد قرارات موثَّقة بعد.</div>'; return; }

  const statusColors = { "لم يبدأ": ["#F1F1F1","var(--gray3)"], "قيد التنفيذ": ["#FEF3E2","var(--gold)"], "منجز": ["#E8F8EF","var(--green)"], "متأخر": ["#FBEAEA","var(--red)"] };

  box.innerHTML = list.map(d => {
    const showTracking = context === "manager";
    const actualStatus = showTracking ? computeSimpleDecisionStatus(d) : null;
    const [bg,fg] = actualStatus ? (statusColors[actualStatus]||statusColors["لم يبدأ"]) : [null,null];
    const stCls = {"لم يبدأ":"st-new","قيد التنفيذ":"st-prog","منجز":"st-done","متأخر":"st-late"}[actualStatus]||"st-new";
    return `<div class="card dcard">
      <div class="dcard-top">
        <div class="dcard-title">${orgEsc(d.decision_text)}</div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
          ${showTracking ? `<span class="dpill ${stCls}">${actualStatus}</span>` : ""}
          ${d.signed_at ? '<span class="dpill st-done"><span class="ico-i ico-check"></span>موقَّع</span>' : '<span class="dpill st-new">غير موقَّع</span>'}
        </div>
      </div>
      <div class="dcard-meta">
        <span><span class="ico-i ico-calendar"></span><small>التاريخ</small> <b>${d.decision_date}</b></span>
        ${showTracking && d.target_date ? `<span><span class="ico-i ico-clock"></span><small>الموعد المستهدف</small> <b>${d.target_date}</b></span>` : ""}
        ${d.signed_at ? `<span><span class="ico-i ico-user"></span><small>وقّعه</small> <b>${orgEsc(d.signed_by_name||'')}</b> — ${new Date(d.signed_at).toLocaleDateString('ar-SA-u-ca-gregory')}</span>` : ""}
      </div>
      ${d.signed_at && d.signature_image ? `<img src="${d.signature_image}" style="height:44px;align-self:flex-start"/>` : ""}
      <div class="dcard-actions">
        ${d.signed_at ? "" : `<button class="btn-xs gold" onclick="openSimpleDecisionSignModal(${d.id})"><span class="ico-i ico-signature"></span>توقيع القرار</button>`}
        ${showTracking && actualStatus !== "منجز" ? `
          <button class="btn-xs sec" onclick="updateSimpleDecisionStatus(${d.id},'قيد التنفيذ')">قيد التنفيذ</button>
          <button class="btn-xs sec dok" onclick="updateSimpleDecisionStatus(${d.id},'منجز')"><span class="ico-i ico-check"></span>تحديد كمنجز</button>` : ""}
      </div>
  </div>`;
  }).join("");
}

async function updateSimpleDecisionStatus(id, newStatus){
  const { error } = await sb.from("simple_decisions").update({ status: newStatus }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  loadSimpleDecisions("manager");
}

function openSimpleDecisionModal(context){
  document.getElementById("sd-context").value = context;
  document.getElementById("sd-text").value = "";
  document.getElementById("sd-date").value = new Date().toISOString().slice(0,10);
  document.getElementById("sd-target-date").value = "";
  document.getElementById("sd-target-date-row").style.display = context === "manager" ? "block" : "none";
  document.getElementById("sd-title").innerHTML = `<span class="ico-i ico-signature"></span>توثيق قرار ${context==='manager'?'مدير':'مالك'} جديد`;
  openM("m-simple-decision");
}

async function saveSimpleDecision(){
  const context = document.getElementById("sd-context").value;
  const decision_text = document.getElementById("sd-text").value.trim();
  const decision_date = document.getElementById("sd-date").value;
  const target_date = context === "manager" ? (document.getElementById("sd-target-date").value || null) : null;
  if(!decision_text){ alert("الرجاء كتابة نص القرار"); return; }
  const payload = { company_id: currentCompanyId, context, decision_text, decision_date };
  if(context === "manager"){ payload.target_date = target_date; payload.status = "لم يبدأ"; }
  const { error } = await sb.from("simple_decisions").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-simple-decision");
  loadSimpleDecisions(context);
}

let simpleDecisionSigContext = null, simpleDecisionSigCtx = null, simpleDecisionSigDrawing = false;

function openSimpleDecisionSignModal(decisionId){
  const context = document.getElementById("p-managerdecisions").classList.contains("active") ? "manager" : "owner";
  simpleDecisionSigContext = context;
  const d = simpleDecisionsCache[context].find(x => x.id === decisionId);
  if(!d) return;
  document.getElementById("sds-decision-id").value = decisionId;
  document.getElementById("sds-decision-text").textContent = d.decision_text;
  document.getElementById("sds-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  openM("m-simple-decision-sign");
  setTimeout(initSimpleDecisionSigPad, 50);
}

function initSimpleDecisionSigPad(){
  const canvas = document.getElementById("simpleDecisionSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  simpleDecisionSigCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); simpleDecisionSigDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!simpleDecisionSigDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { simpleDecisionSigDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("simpleDecisionSigCanvas");
}

function clearSimpleDecisionSigPad(){
  if(!simpleDecisionSigCtx) return;
  const canvas = document.getElementById("simpleDecisionSigCanvas");
  simpleDecisionSigCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isSimpleDecisionSigPadEmpty(){
  const canvas = document.getElementById("simpleDecisionSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

async function confirmSimpleDecisionSignature(){
  if(isSimpleDecisionSigPadEmpty()){ alert("الرجاء رسم التوقيع أولًا"); return; }
  const id = Number(document.getElementById("sds-decision-id").value);
  const signed_by_name = document.getElementById("sds-name").value.trim();
  if(!signed_by_name){ alert("الرجاء إدخال الاسم"); return; }
  if(!(await lockFirstSignature("simpleDecisionSigCanvas"))) return;
  const canvas = document.getElementById("simpleDecisionSigCanvas");
  const signature_image = canvas.toDataURL("image/png");
  const { error } = await sb.from("simple_decisions").update({ signed_by_name, signature_image, signed_at: new Date().toISOString() }).eq("id", id);
  if(error){ alert("تعذّر حفظ التوقيع: " + error.message); return; }
  closeM("m-simple-decision-sign");
  loadSimpleDecisions(simpleDecisionSigContext);
}

async function loadDecisionTracking(){
  const [{ data: decisions }, { data: meetings }, people] = await Promise.all([
    sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("meetings").select("id,meeting_date,meeting_type").eq("company_id", currentCompanyId),
    getEvaluableBoardMembers()
  ]);
  decisionTrackingPeople = people;
  const meetingById = {}; (meetings||[]).forEach(m => { meetingById[m.id] = m; });
  decisionTrackingCache = (decisions||[]).map(d => ({ ...d, _meeting: meetingById[d.meeting_id] }));

  const respFilter = document.getElementById("dt-responsible-filter");
  if(respFilter){
    const current = respFilter.value;
    respFilter.innerHTML = '<option value="">كل المسؤولين</option>' + people.map(p => `<option value="${orgEsc(p.email)}">${orgEsc(p.name)}</option>`).join("");
    respFilter.value = current;
  }

  const total = decisionTrackingCache.length;
  const completed = decisionTrackingCache.filter(d => computeDecisionStatus(d) === "منجز").length;
  const overdue = decisionTrackingCache.filter(d => computeDecisionStatus(d) === "متأخر").length;
  const rate = total ? Math.round(completed/total*100) : 0;
  const statsGrid = document.getElementById("dtStatsGrid");
  if(statsGrid){
    statsGrid.innerHTML = `
      <div class="kpi blue"><div class="kpi-label">إجمالي القرارات</div><div class="kpi-val">${total}</div></div>
      <div class="kpi green"><div class="kpi-label">منجزة</div><div class="kpi-val">${completed}</div></div>
      <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
      <div class="kpi gold"><div class="kpi-label">نسبة الإنجاز</div><div class="kpi-val">${rate}%</div></div>`;
  }

  const navBadge = document.getElementById("decisionOverdueBadge");
  if(navBadge){ navBadge.style.display = overdue > 0 ? "inline-flex" : "none"; navBadge.textContent = overdue; }

  renderDecisionTrackingList();
}

function renderDecisionTrackingList(){
  const box = document.getElementById("decisionTrackingList");
  if(!box) return;
  const statusFilter = document.getElementById("dt-status-filter")?.value || "";
  const respFilterVal = document.getElementById("dt-responsible-filter")?.value || "";

  const filtered = decisionTrackingCache.filter(d => {
    const actualStatus = computeDecisionStatus(d);
    if(statusFilter && actualStatus !== statusFilter) return false;
    if(respFilterVal && d.responsible_email !== respFilterVal) return false;
    return true;
  });

  if(filtered.length === 0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد قرارات مطابقة.</div>';
    return;
  }

  const canManage = canManageDecisions();
  box.innerHTML = filtered.map(d => {
    const actualStatus = computeDecisionStatus(d);
    const statusColors = { "لم يبدأ": ["#F1F1F1","var(--gray3)"], "قيد التنفيذ": ["#FEF3E2","var(--gold)"], "منجز": ["#E8F8EF","var(--green)"], "متأخر": ["#FBEAEA","var(--red)"] };
    const [bg,fg] = statusColors[actualStatus] || statusColors["لم يبدأ"];
    const meetingLabel = d._meeting ? `${d._meeting.meeting_type||"اجتماع"} — ${d._meeting.meeting_date||""}` : "—";
    const isResponsible = currentUserProfile && d.responsible_email === currentUserProfile.email;

    const stCls = {"لم يبدأ":"st-new","قيد التنفيذ":"st-prog","منجز":"st-done","متأخر":"st-late"}[actualStatus]||"st-new";
    const who = orgEsc(d.responsible_email ? (decisionTrackingPeople.find(p=>p.email===d.responsible_email)?.name || d.responsible_email) : "غير محدَّد");
    return `<div class="card dcard">
        <div class="dcard-top">
          <div class="dcard-title">${orgEsc(d.decision_text||"")}</div>
          <span class="dpill ${stCls}">${actualStatus}</span>
        </div>
        <div class="dcard-src">من: ${meetingLabel}</div>
        <div class="dcard-meta">
          <span><span class="ico-i ico-user"></span><small>المسؤول</small> <b>${who}</b></span>
          <span><span class="ico-i ico-calendar"></span><small>الموعد</small> <b>${d.target_date || "غير محدَّد"}</b></span>
        </div>
        <div class="dcard-actions">
          ${canManage ? `<button class="btn-xs sec" onclick="openDecisionAssignModal(${d.id})"><span class="ico-i ico-edit"></span>تحديد المسؤول/الموعد</button>` : ""}
          ${(canManage || isResponsible) && actualStatus !== "منجز" ? `
            <button class="btn-xs sec" onclick="updateDecisionStatus(${d.id},'قيد التنفيذ')">قيد التنفيذ</button>
            <button class="btn-xs sec dok" onclick="updateDecisionStatus(${d.id},'منجز')"><span class="ico-i ico-check"></span>تحديد كمنجز</button>
          ` : ""}
          <button class="btn-xs sec" onclick="openGovLinkPicker('decision',${d.id})">🔗 ربط</button>
        </div>
        <div class="glinks" id="glk-decision-${d.id}" data-glinks="decision:${d.id}"></div>
    </div>`;
  }).join("");
  filtered.forEach(d => renderGovLinks(`glk-decision-${d.id}`, "decision", d.id));
}

async function openDecisionAssignModal(decisionId){
  const d = decisionTrackingCache.find(x => x.id === decisionId);
  if(!d) return;
  document.getElementById("da-decision-id").value = decisionId;
  document.getElementById("da-decision-text").textContent = d.decision_text||"";
  document.getElementById("da-target-date").value = d.target_date||"";

  const people = await getEvaluableBoardMembers();
  const sel = document.getElementById("da-responsible");
  sel.innerHTML = '<option value="">— اختر —</option>' + people.map(p => `<option value="${orgEsc(p.email)}" ${p.email===d.responsible_email?'selected':''}>${orgEsc(p.name)}</option>`).join("");
  openM("m-decision-assign");
}

async function saveDecisionAssignment(){
  const id = Number(document.getElementById("da-decision-id").value);
  const responsible_email = document.getElementById("da-responsible").value || null;
  const target_date = document.getElementById("da-target-date").value || null;
  const { error } = await sb.from("board_decisions").update({ responsible_email, target_date }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-decision-assign");
  loadDecisionTracking();
}

async function updateDecisionStatus(id, newStatus){
  const payload = { status: newStatus };
  if(newStatus === "منجز") payload.completed_at = new Date().toISOString();
  const { error } = await sb.from("board_decisions").update(payload).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  loadDecisionTracking();
}

async function loadPerf(){
  const isAdmin = await canSeePerfResults();
  const canManage = await canManagePerfCycles();
  await loadPerfCriteriaCache();
  const manageCriteriaBtn = document.getElementById("btnManagePerfCriteria");
  if(manageCriteriaBtn) manageCriteriaBtn.style.display = canManage ? "inline-block" : "none";
  const [boardResult, execResult] = await Promise.allSettled([getEvaluableBoardMembers(), getEvaluableExecutives()]);
  const boardPeople = boardResult.status === "fulfilled" ? boardResult.value : [];
  const execPeople = execResult.status === "fulfilled" ? execResult.value : [];
  if(boardResult.status === "rejected") console.error("board list failed", boardResult.reason);
  if(execResult.status === "rejected") console.error("exec list failed", execResult.reason);

  const { data: allEvals } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  perfCache = allEvals || [];
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  // Sole proprietorships and single-manager LLCs have no board at all — only the executive
  // section applies, and its heading needn't say "مجلس" for a structure that has none.
  // Everyone else gets the company-appropriate body name instead of a hardcoded label.
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const hideBoardEval = isSoleProp || currentCompanyLLCSingleManager;
  const manualBtn = document.getElementById("btnManualPerfAdd");
  if(manualBtn) manualBtn.style.display = canManage ? "inline-block" : "none";
  const boardSectionTitle = document.getElementById("perfBoardSectionTitle");
  const boardSection = document.getElementById("perfBoardSection");
  if(boardSection) boardSection.style.display = hideBoardEval ? "none" : "block";
  if(boardSectionTitle) boardSectionTitle.textContent = `تقييمات ${getGovernanceBodyLabel()}`;

  const latestEvalFor = (email) => (perfCache).find(e => e.evaluated_email === email);

  async function renderCard(person, isExec){
    const ev = latestEvalFor(person.email);
    let statusHTML, actionHTML = "";
    if(!ev){

      statusHTML = `<span style="font-size:11px;color:var(--gray3)">لا يوجد تقييم مفتوح حاليًا</span>`;
      if(canManage) actionHTML = `<button class="btn-xs gold" style="width:100%;margin-top:10px" onclick="openNewPerfEvaluation('${orgEsc(person.email)}')"><span class="ico-i ico-add"></span>فتح تقييم جديد</button>`;
    } else if(ev.status === "مكتمل"){
      const scoreLabel = ev.score!=null ? (Number(ev.score).toFixed(1)+"/5 — "+(PERF_SCORE_LABELS[Math.round(ev.score)]||"")) : "—";
      statusHTML = isAdmin
        ? `<div style="font-size:22px;font-weight:900;color:var(--primary);margin-top:4px">${scoreLabel}</div>`
        : `<span class="badge done">التقييم مكتمل</span>`;
      actionHTML = `<button class="btn-xs primary" style="width:100%;margin-top:10px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-search"></span>التفاصيل</button>`;
    } else {
      const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
      const iAmReviewer = !isPlatformOwner && myEmail && myEmail !== person.email;
      const { data: mySubmitted } = await sb.from("performance_evaluation_reviews").select("id").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"").limit(1);
      const alreadyDone = mySubmitted && mySubmitted.length > 0;
      statusHTML = `<span class="badge pending">مفتوح للتقييم</span>`;
      if(isAdmin) actionHTML += `<button class="btn-xs primary" style="width:100%;margin-top:8px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-search"></span>متابعة النتائج</button>`;
      if(iAmReviewer){
        actionHTML += alreadyDone
          ? `<div style="text-align:center;color:var(--green);font-size:11px;margin-top:8px"><span class="ico-i ico-check"></span>أرسلت تقييمك</div>`
          : `<button class="btn-xs gold" style="width:100%;margin-top:8px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-signature"></span>ابدأ التقييم</button>`;
      }
    }
    return `<div class="card" style="margin:0">
      <div class="card-body" style="text-align:center">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;margin:0 auto 8px">${(person.name||"?").charAt(0)}</div>
        <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(person.name||"")}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">${orgEsc(person.position || person.role || "")}</div>
        ${statusHTML}
        ${actionHTML}
      </div>
    </div>`;
  }

  const boardBox = document.getElementById("perfBoardCards");
  if(boardBox){
    boardBox.innerHTML = boardPeople.length ? (await Promise.all(boardPeople.map(p=>renderCard(p,false)))).join("")
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;grid-column:1/-1">لا يوجد أعضاء مرتبطين بحسابات بعد.</div>';
  }
  const execBox = document.getElementById("perfExecCards");
  if(execBox){
    execBox.innerHTML = execPeople.length ? (await Promise.all(execPeople.map(p=>renderCard(p,true)))).join("")
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;grid-column:1/-1">لا يوجد شاغلو مناصب تنفيذية عليا مرتبطين بحسابات بعد (الرئيس التنفيذي / نواب الرئيس / المدير المالي بالهيكل التنظيمي).</div>';
  }
}

/* Resolves an EXISTING evaluation's real role for question-bank purposes. Trusts the stored
   entity_type first for "تنفيذي" specifically — the one classification a manual add can set
   that fresh auto-detection might not reproduce (that mismatch is exactly why manual add
   exists) — and only calls live auto-detection to distinguish رئيس مجلس from عضو مجلس. */
async function resolveEvalRole(ev){
  if(ev.entity_type === "تنفيذي") return "تنفيذي";
  return ev.evaluated_email ? await getEvaluatedPersonRole(ev.evaluated_email) : null;
}

async function openNewPerfEvaluation(evaluated_email){
  await savePerfFor(evaluated_email);
}

/* Manual fallback — lists literally everyone with an account on this company, regardless of
   role, for when automatic matching (org chart / role-text) doesn't surface someone who should
   be evaluable. The admin explicitly picks their evaluation role here instead. */
async function openManualPerfPicker(){
  const sel = document.getElementById("pm-person");
  sel.innerHTML = '<option value="">جارِ التحميل...</option>';
  openM("m-perf-manual");

  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  if(!memberships || memberships.length===0){ sel.innerHTML = '<option value="">لا يوجد أعضاء بهذه الشركة</option>'; return; }
  const emails = memberships.map(m=>m.email);
  const { data: profiles } = await sb.from("user_profiles").select("email,full_name").in("email", emails);
  const nameByEmail = {}; (profiles||[]).forEach(p=>{ nameByEmail[p.email]=p.full_name; });
  sel.innerHTML = memberships.map(m => `<option value="${orgEsc(m.email)}">${orgEsc(nameByEmail[m.email]||m.email)} — ${orgEsc(m.role)}</option>`).join("");
}

async function confirmManualPerfAdd(){
  const email = document.getElementById("pm-person").value;
  const role = document.getElementById("pm-role").value;
  if(!email){ alert("الرجاء اختيار شخص"); return; }
  closeM("m-perf-manual");
  await savePerfFor(email, role);
}

async function savePerfFor(evaluated_email, manualRole){
  const { data: person } = await sb.from("board_members").select("name").eq("company_id", currentCompanyId).eq("claimed_by_email", evaluated_email).maybeSingle();
  const { data: profile } = await sb.from("user_profiles").select("full_name").eq("email", evaluated_email).maybeSingle();
  const evaluated_role = manualRole || await getEvaluatedPersonRole(evaluated_email);
  const entity_type = evaluated_role === "تنفيذي" ? "تنفيذي" : "عضو مجلس";
  const period = String(new Date().getFullYear());
  const entity_name = person?.name || profile?.full_name || evaluated_email;

  if(!await uiConfirm(`فتح تقييم أداء جديد لـ"${entity_name}" لعام ${period}؟`)) return;

  const payload = { entity_name, entity_type, evaluated_email, period, status: "مفتوح للتقييم", company_id: currentCompanyId };

  if(evaluated_role === "تنفيذي"){
    const { data: reports } = await sb.from("ceo_monthly_reports").select("period_label,timeliness_score,submitted_day_of_month")
      .eq("company_id", currentCompanyId).not("timeliness_score","is",null).order("created_at",{ascending:false}).limit(6);
    if(reports && reports.length){
      const avg = reports.reduce((s,x)=>s+x.timeliness_score,0) / reports.length;
      let interpretation;
      if(avg >= 90) interpretation = "التزام ممتاز بمواعيد رفع التقرير المالي والتشغيلي — مؤشر إيجابي على السيطرة الإدارية والإلمام بتفاصيل الشركة أولًا بأول.";
      else if(avg >= 75) interpretation = "التزام جيد بمواعيد رفع التقرير مع بعض التأخير غير المتكرر.";
      else if(avg >= 50) interpretation = "تأخر ملحوظ ومتكرر برفع التقرير المالي والتشغيلي — قد يشير إلى ضعف بالسيطرة على الإدارات أو عدم إلمام كافٍ بتفاصيل الشركة أولًا بأول.";
      else interpretation = "تأخر كبير ومتكرر برفع التقرير المالي والتشغيلي — مؤشر مقلق على ضعف السيطرة الإدارية.";
      payload.auto_context_note = `متوسط درجة الانضباط بمواعيد رفع التقرير (آخر ${reports.length} تقارير): ${avg.toFixed(0)}%\n${interpretation}`;
    }
  }

  const autoScores = [];
  if(evaluated_role === "عضو مجلس" || evaluated_role === "رئيس مجلس"){
    const { data: member } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).eq("claimed_by_email", evaluated_email).maybeSingle();
    if(member){
      const email = evaluated_email;
      const { data: allRequests } = await sb.from("meeting_requests").select("id,response_deadline").eq("company_id", currentCompanyId).not("response_deadline","is",null);
      const reqIds = (allRequests||[]).map(r=>r.id);
      const { data: myResponses } = reqIds.length
        ? await sb.from("meeting_request_responses").select("request_id,created_at").in("request_id", reqIds).eq("reviewer_email", email)
        : { data: [] };
      const respTimeByReq = {};
      (myResponses||[]).forEach(r => { respTimeByReq[r.request_id] = r.created_at; });
      const totalReq = (allRequests||[]).length;
      let onTimeCount = 0;
      (allRequests||[]).forEach(r => { const t = respTimeByReq[r.id]; if(t && new Date(t) <= new Date(r.response_deadline)) onTimeCount++; });

      const { data: myVotes } = await sb.from("board_decision_votes").select("vote,justification").eq("voter_email", email);
      const totalVotes = (myVotes||[]).length;
      const unjustifiedAbstentions = (myVotes||[]).filter(v => v.vote === "ممتنع" && (!v.justification || !v.justification.trim())).length;

      if(totalReq > 0 || totalVotes > 0){
        let score = 5;
        if(totalReq > 0) score -= (1 - onTimeCount/totalReq) * 2;
        if(totalVotes > 0) score -= (unjustifiedAbstentions/totalVotes) * 2;
        score = Math.max(1, Math.min(5, score));
        autoScores.push({ criterion: "الانضباط والالتزام (آلي)", score,
          note: `استجاب لـ${onTimeCount} من ${totalReq} طلبات اجتماع خلال المهلة المحددة. امتنع بدون مبرر واضح في ${unjustifiedAbstentions} من ${totalVotes} تصويتات.` });
      }

      const attendanceStats = await computeAttendancePercentages();
      const myAttendanceStat = attendanceStats.find(a => a.name === member.name && a.pct !== null);
      if(myAttendanceStat){
        const rate = myAttendanceStat.pct / 100;
        autoScores.push({ criterion: "نسبة الحضور الفعلية (آلي)", score: 1 + rate*4,
          note: `نسبة الحضور الفعلية: ${myAttendanceStat.pct}% (${myAttendanceStat.present} من ${myAttendanceStat.total} اجتماعًا).` });
      }

      const { data: allDecisions } = await sb.from("board_decisions").select("id").eq("company_id", currentCompanyId);
      if(allDecisions && allDecisions.length > 0){
        const participationRate = totalVotes / allDecisions.length;
        autoScores.push({ criterion: "نسبة المشاركة بالتصويت (آلي)", score: 1 + Math.min(1,participationRate)*4,
          note: `شارك بالتصويت على ${totalVotes} من ${allDecisions.length} قرارًا مطروحًا.` });
      }

      // New: real execution rate for decisions this person was assigned as responsible for —
      // an entirely automatic input, matching the same "system decides, no human vote" rule
      // applied to attendance and voting participation above.
      const { data: assignedDecisions } = await sb.from("board_decisions").select("status,target_date").eq("company_id", currentCompanyId).eq("responsible_email", email);
      if(assignedDecisions && assignedDecisions.length > 0){
        const doneOnTime = assignedDecisions.filter(d => d.status === "منجز").length;
        const completionRate = doneOnTime / assignedDecisions.length;
        autoScores.push({ criterion: "نسبة إنجاز القرارات الموكلة (آلي)", score: 1 + completionRate*4,
          note: `أنجز ${doneOnTime} من ${assignedDecisions.length} قرارًا مُوكَلًا إليه.` });
      }
    }
  }

  const { data: newEval, error } = await sb.from("performance_evaluations").insert([payload]).select().single();
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }

  if(autoScores.length){
    await sb.from("performance_evaluation_reviews").insert(autoScores.map(a => ({
      evaluation_id: newEval.id, reviewer_email: "system@hwkm.internal", reviewer_name: "النظام (تلقائي)",
      criterion: a.criterion, score: Math.round(a.score), notes: a.note, company_id: currentCompanyId
    })));
    const summary = autoScores.map(a => `${a.criterion.replace(" (آلي)","")}: ${a.note}`).join("\n");
    await sb.from("performance_evaluations").update({ auto_context_note: summary }).eq("id", newEval.id);
  }

  loadPerf();
}

/* ══════════ DETAIL VIEW — swaps in for the whole card list while open ══════════ */
let perfDetailContext = null; // { evaluatedEmail, isExec, evaluationId }

async function openPerfDetail(evaluatedEmail, isExec){
  document.getElementById("perfListView").style.display = "none";
  document.getElementById("perfDetailView").style.display = "block";
  const body = document.getElementById("perfDetailBody");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">جارِ التحميل...</div>';

  const ev = perfCache.find(e => e.evaluated_email === evaluatedEmail);
  if(!ev){ body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لا يوجد تقييم.</div>'; return; }
  perfDetailContext = { evaluatedEmail, isExec, evaluationId: ev.id };

  const isAdmin = await canSeePerfResults();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  // HWKM's own platform owner is never a genuine peer reviewer — they should always land on
  // the results view, complete or not, and never get funneled into a scoring form they were
  // never meant to fill out (they're not in anyone's reviewer audience to begin with).
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isReviewer = !isPlatformOwner && myEmail && myEmail !== evaluatedEmail;

  if(ev.status === "مكتمل" || isPlatformOwner || (isAdmin && !isReviewer)){
    await renderPerfResultsDetail(ev, isAdmin);
  } else if(isReviewer){
    await renderPerfReviewForm(ev);
  } else {
    body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">ما عندك صلاحية تشوف أو تقيّم هذا الشخص.</div>';
  }
}

function closePerfDetail(){
  document.getElementById("perfDetailView").style.display = "none";
  document.getElementById("perfListView").style.display = "block";
  perfDetailContext = null;
  loadPerf();
}

/* Reviewer's own scoring form for one person — full questionnaire, locked forever once sent. */
async function renderPerfReviewForm(ev){
  const body = document.getElementById("perfDetailBody");
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  const audience = ev.evaluated_email
    ? (perfDetailContext.isExec ? await getExecReviewerAudience() : await getPerfReviewerAudience(ev.evaluated_email))
    : [];
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  // HWKM's own platform owner isn't excluded here the way a random outsider would be — full
  // access means full access, including trying the reviewer flow itself when they choose to.
  if(ev.evaluated_email && !isPlatformOwner && !audience.includes(myEmail)){
    body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">ما أنت من ضمن المقيّمين المخصَّصين لهذا الشخص.</div>';
    return;
  }

  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const { data: myReviews } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"");
  const mineByCriterion = {};
  (myReviews||[]).forEach(r => { mineByCriterion[r.criterion] = r; });
  const alreadySubmitted = criteria.every(c => mineByCriterion[c]);
  const savedNotes = criteria.map(c => mineByCriterion[c]).find(r=>r&&r.notes)?.notes || "";

  body.innerHTML = `<div style="border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(10,22,40,0.08);border:1px solid var(--gray1);max-width:640px">
    <div style="background:linear-gradient(135deg,var(--primary),var(--accent));padding:16px;color:#fff">
      <div style="font-weight:900;font-size:15px">${orgEsc(ev.entity_name||"")}</div>
      <div style="font-size:11px;opacity:0.85;margin-top:2px">${evaluated_role||ev.entity_type||""} · الفترة: ${ev.period||""}</div>
    </div>
    <div style="padding:16px;background:#fff">
      ${ev.auto_context_note ? `<div style="background:#FEF3E2;border-right:3px solid var(--gold);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:11.5px;color:var(--dark);white-space:pre-line;line-height:1.7"><b>مؤشرات آلية من النظام (لا تُصوَّت عليها):</b>\n${ev.auto_context_note}</div>` : ""}
      ${alreadySubmitted ? `<div style="background:#E8F8EF;border-radius:8px;padding:12px;text-align:center;color:var(--green);font-weight:700;font-size:12.5px;margin-bottom:14px"><span class="ico-i ico-check"></span>تم إرسال تقييمك — غير قابل للتعديل.</div>` : ""}
      ${criteria.map((crit,idx) => {
        const mine = mineByCriterion[crit];
        return `<div class="perf-crit-row" data-eval="${ev.id}" data-criterion="${crit.replace(/"/g,'&quot;')}" data-selected="${mine?mine.score:''}" style="margin-bottom:${idx<criteria.length-1?'16px':'4px'};opacity:${alreadySubmitted?'0.6':'1'}">
          <div style="font-size:12.5px;font-weight:800;color:var(--dark);margin-bottom:7px">${crit}</div>
          <div style="display:flex;gap:0;border-radius:10px;overflow:hidden;border:1.5px solid var(--gray1)">
            ${[1,2,3,4,5].map((s,i) => `<button type="button" ${alreadySubmitted?'disabled':''} class="perf-crit-btn" data-val="${s}" style="flex:1;background:${mine&&mine.score===s?'linear-gradient(135deg,var(--primary),var(--accent))':'#fff'};color:${mine&&mine.score===s?'#fff':'var(--dark)'};border:none;${i>0?'border-right:1px solid var(--gray1)':''};padding:9px 4px;font-size:11px;font-weight:700;cursor:${alreadySubmitted?'default':'pointer'};transition:all .15s" onclick="selectPerfCriterionScore(this,${s})">${s}<br><span style="font-size:9px;font-weight:600;opacity:0.9">${PERF_SCORE_LABELS[s]}</span></button>`).join('')}
          </div>
        </div>`;
      }).join("")}
      <textarea id="perf-review-notes-${ev.id}" ${alreadySubmitted?'disabled':''} placeholder="ملاحظاتك العامة (اختياري)" style="width:100%;border:1.5px solid var(--gray1);border-radius:10px;padding:10px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-top:10px;background:var(--offwhite)" rows="2">${savedNotes}</textarea>
      ${alreadySubmitted
        ? `<button class="btn btn-gold" style="width:100%;margin-top:12px" onclick="openPerfSignModal()"><span class="ico-i ico-signature"></span>توقيع نسختي وتنزيلها PDF</button>`
        : `<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn-xs primary" onclick="submitPerfReview(${ev.id})"><span class="ico-i ico-save"></span>إرسال تقييمي لكل البنود (نهائي)</button></div>`}
    </div>
  </div>`;
}

/* Authorized-viewer results breakdown — human criteria, auto criteria, final average, and
   (once every reviewer is in) the ability to close/certify the final score. */
async function renderPerfResultsDetail(ev, isAdmin){
  const body = document.getElementById("perfDetailBody");
  const { data: revs } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id);
  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const uniqueReviewers = new Set((revs||[]).filter(r=>r.reviewer_email!=="system@hwkm.internal").map(r=>r.reviewer_email)).size;

  const byCrit = {};
  (revs||[]).forEach(r => { const c = r.criterion||"عام"; if(!byCrit[c]) byCrit[c]=[]; byCrit[c].push(r.score||0); });

  const bars = criteria.filter(c=>byCrit[c]).map(c => {
    const avg = byCrit[c].reduce((a,b)=>a+b,0)/byCrit[c].length;
    const pct = Math.round((avg/5)*100);
    return `<div class="comp-item"><div class="comp-head"><span class="comp-name">${c}</span><span class="comp-pct">${pct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${pct}%"></div></div></div>`;
  }).join("");
  const autoBars = PERF_AUTO_CRITERIA.filter(c=>byCrit[c]).map(c => {
    const avg = byCrit[c].reduce((a,b)=>a+b,0)/byCrit[c].length;
    const pct = Math.round((avg/5)*100);
    return `<div class="comp-item"><div class="comp-head"><span class="comp-name"><span class="ico ico-bolt" style="width:12px;height:12px;color:var(--gold)"></span> ${c}</span><span class="comp-pct">${pct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${pct}%;background:var(--gold)"></div></div></div>`;
  }).join("");

  const closeBtn = isAdmin && ev.status !== "مكتمل" && revs && revs.length
    ? `<button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="closePerfEvaluation(${ev.id})"><span class="ico-i ico-shield"></span>إغلاق واعتماد النتيجة النهائية</button>`
    : "";

  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const joinAsReviewerBtn = isPlatformOwner && ev.status !== "مكتمل"
    ? `<button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="renderPerfReviewForm(perfCache.find(e=>e.id===${ev.id}))"><span class="ico-i ico-signature"></span>أضف تقييمك أيضًا</button>`
    : "";

  body.innerHTML = `<div class="card" style="max-width:640px">
    <div class="card-head"><span class="card-title">${orgEsc(ev.entity_name||"")} <span style="font-size:11px;color:var(--gray3);font-weight:600">— ${ev.period||""}</span></span>${ev.status==="مكتمل"?'<span class="badge done">مكتمل</span>':'<span class="badge pending">مفتوح للتقييم</span>'}</div>
    <div class="card-body">
      ${bars || '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد تقييمات مسجّلة من الأعضاء بعد.</div>'}
      ${autoBars ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--gray1)">
        <div style="font-size:10px;font-weight:700;color:var(--gray3);margin-bottom:6px">مؤشرات محسوبة تلقائيًا من بيانات النظام الفعلية</div>
        ${autoBars}
      </div>` : ""}
      <div style="font-size:11.5px;color:var(--gray3);margin-top:12px"><span class="ico-i ico-users"></span>عدد المقيّمين: ${uniqueReviewers}${ev.score!=null ? " · الدرجة النهائية: "+Number(ev.score).toFixed(1)+"/5 — "+(PERF_SCORE_LABELS[Math.round(ev.score)]||"") : ""}</div>
      ${joinAsReviewerBtn}
      ${closeBtn}
    </div>
  </div>`;
}



async function closePerfEvaluation(id){
  const { data: revs, error } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", id);
  if(error){ alert("تعذّر الحساب: " + error.message); return; }
  if(!revs || revs.length===0){ alert("لا توجد تقييمات مسجّلة بعد من الأعضاء لهذا العنصر."); return; }
  const avg = revs.reduce((s,r)=>s+(r.score||0),0)/revs.length;
  if(!await uiConfirm("سيتم اعتماد النتيجة النهائية ("+avg.toFixed(1)+"/5) وإغلاق هذا التقييم. متابعة؟")) return;
  const { error: updErr } = await sb.from("performance_evaluations").update({ score: avg, status: "مكتمل" }).eq("id", id);
  if(updErr){ alert("تعذّر الإغلاق: " + updErr.message); return; }
  alert("تم اعتماد النتيجة النهائية ✅");
  closePerfDetail();
}

/* ══════════ Reviewer's signed copy of their own submitted scores ══════════ */
let perfSigPadCtx = null, perfSigPadDrawing = false;

function openPerfSignModal(){
  openM("m-perf-sign");
  setTimeout(initPerfSignaturePad, 50);
}

function initPerfSignaturePad(){
  const canvas = document.getElementById("perfSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  perfSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); perfSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!perfSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { perfSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("perfSigCanvas");
}

function clearPerfSigPad(){
  if(!perfSigPadCtx) return;
  const canvas = document.getElementById("perfSigCanvas");
  perfSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isPerfSigPadEmpty(){
  const canvas = document.getElementById("perfSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

/* Wraps Arabic (RTL) text within maxWidth, returning the number of lines drawn — used so the
   criterion label never overruns into the score column on longer questionnaire items. */
function wrapRTLText(ctx, text, x, y, maxWidth, lineHeight){
  const words = text.split(" ");
  let line = "", lines = [];
  for(const w of words){
    const test = line ? line + " " + w : w;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
    else line = test;
  }
  if(line) lines.push(line);
  lines.forEach((l,i) => ctx.fillText(l, x, y + i*lineHeight));
  return lines.length;
}

async function confirmPerfReviewSignature(){
  if(isPerfSigPadEmpty()){ alert("الرجاء رسم توقيعك أولًا قبل التأكيد"); return; }
  if(!perfDetailContext){ alert("تعذّر تحميل بيانات التقييم"); return; }
  if(!(await lockFirstSignature("perfSigCanvas"))) return;

  const ev = perfCache.find(e => e.id === perfDetailContext.evaluationId);
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const { data: myReviews } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"");
  const byCriterion = {};
  (myReviews||[]).forEach(r => { byCriterion[r.criterion] = r; });

  const scale = 2;
  const W = 595 * scale, H = 842 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
  ctx.direction = "rtl"; ctx.textAlign = "center";
  const CX = W/2, RM = W - 45*scale, LM = 45*scale;

  ctx.font = `bold ${18*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("تقييم أداء — نسخة الموقّع", CX, 50*scale);

  ctx.textAlign = "right"; ctx.font = `bold ${13*scale}px Tajawal, Arial`;
  let y = 90*scale;
  ctx.fillText(`الشخص المُقيَّم: ${ev.entity_name||""}`, RM, y); y += 24*scale;
  ctx.font = `${11.5*scale}px Tajawal, Arial`;
  ctx.fillText(`الفترة: ${ev.period||""}`, RM, y); y += 20*scale;
  ctx.fillText(`المقيِّم: ${reviewer_name}`, RM, y); y += 34*scale;

  ctx.font = `bold ${11.5*scale}px Tajawal, Arial`;
  for(const crit of criteria){
    const r = byCriterion[crit];
    if(!r) continue;
    if(y > H - 140*scale){ break; } // keep room for signature block; overflow criteria simply omitted from the printed page
    ctx.fillStyle = "#0D2447";
    ctx.font = `${11*scale}px Tajawal, Arial`;
    wrapRTLText(ctx, crit, RM, y, RM-LM, 15*scale);
    const lines = Math.ceil(ctx.measureText(crit).width / (RM-LM)) || 1;
    ctx.textAlign = "left"; ctx.font = `bold ${12*scale}px Tajawal, Arial`; ctx.fillStyle = "#B8972A";
    ctx.fillText(`${r.score}/5 — ${PERF_SCORE_LABELS[r.score]||""}`, LM, y);
    ctx.textAlign = "right";
    y += 22*scale;
  }

  y += 20*scale;
  ctx.textAlign = "right"; ctx.font = `bold ${12*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("توقيع المقيّم:", RM, y);
  const sigCanvas = document.getElementById("perfSigCanvas");
  ctx.drawImage(sigCanvas, LM, y - 10*scale, 180*scale, 60*scale);

  const pngData = canvas.toDataURL("image/png");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await (await fetch(pngData)).arrayBuffer();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([595, 842]);
  page.drawImage(pngImage, { x: 0, y: 0, width: 595, height: 842 });
  const finalBytes = await pdfDoc.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });

  const safeName = (ev.entity_name||"تقييم").replace(/[\\/:*?"<>|]/g,"_");
  await uploadBlobToStorage(blob, "perf-review-signatures", `تقييم-${safeName}-${reviewer_name}-${Date.now()}.pdf`);

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `تقييم-موقّع-${safeName}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);

  closeM("m-perf-sign");
  alert("تم تنزيل نسختك الموقّعة بنجاح ✅");
}


/* Determines a person's actual evaluation role from real data — chairman via their
   user_company_memberships role, executive via a match against the org chart's senior
   positions (see getEvaluableExecutives), else a regular member. This is what actually picks
   the question bank and the auto-assigned reviewer audience; it is never typed by hand. */
async function getEvaluatedPersonRole(email){
  if(!email) return "عضو مجلس";
  const { data: membership } = await sb.from("user_company_memberships").select("role").eq("company_id", currentCompanyId).eq("email", email).maybeSingle();
  if(membership && membership.role === "رئيس مجلس") return "رئيس مجلس";
  const execs = await getEvaluableExecutives();
  if(execs.some(e => e.email === email)) return "تنفيذي";
  return "عضو مجلس";
}

/* Everyone eligible to be evaluated as a board-level person: sourced from
   user_company_memberships directly — the authoritative record of "has a real account with
   a governance role" — not from board_members.claimed_by_email, which is a separate optional
   identity-claim step someone can skip entirely while still having a perfectly working
   account. board_members is only consulted afterward, purely to get a nicer display name. */
async function getPerfEligiblePeople(){
  const boardRoles = ["رئيس مجلس","سكرتير مجلس","سكرتير المجلس","عضو مجلس","عضو مجلس وعضو مساهم"];
  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId).in("role", boardRoles);
  if(!memberships || memberships.length===0) return [];

  const emails = memberships.map(m=>m.email);
  const [{ data: profiles }, { data: bmRows }] = await Promise.all([
    sb.from("user_profiles").select("email,full_name").in("email", emails),
    sb.from("board_members").select("name,claimed_by_email").eq("company_id", currentCompanyId).in("claimed_by_email", emails)
  ]);
  const nameByEmail = {};
  (bmRows||[]).forEach(b => { nameByEmail[b.claimed_by_email] = b.name; });
  (profiles||[]).forEach(p => { if(!nameByEmail[p.email]) nameByEmail[p.email] = p.full_name; });

  return memberships.map(m => ({
    email: m.email,
    name: nameByEmail[m.email] || m.email,
    role: m.role === "رئيس مجلس" ? "رئيس مجلس" : "عضو مجلس",
  }));
}

/* Who should automatically evaluate this person — every other linked board member (never
   themselves), regardless of whether they're being evaluated as chairman, member, or exec. */
async function getPerfReviewerAudience(evaluatedEmail){
  const people = await getPerfEligiblePeople();
  return people.filter(p => p.email !== evaluatedEmail).map(p => p.email);
}

/* Results visibility: HWKM's own platform owner always sees everything (support/oversight
   across every client company). Otherwise: nomination-committee members if that committee
   actually has anyone in it, else the board chairman only — never a broader "any governance
   admin" set. Sole proprietorships have no board, so it collapses to "the owner" by definition. */
async function canSeePerfResults(){
  if(currentUserProfile && currentUserProfile.is_platform_admin === true) return true;
  const role = getCurrentRole();
  if(currentCompanyType === "مؤسسة فردية") return role === "مدير النظام";
  const { data: nomCommittee } = await sb.from("user_company_memberships").select("role").eq("company_id", currentCompanyId).in("role",["رئيس لجنة الترشيحات","عضو لجنة الترشيحات"]);
  if(nomCommittee && nomCommittee.length > 0) return ["رئيس لجنة الترشيحات","عضو لجنة الترشيحات"].includes(role);
  return role === "رئيس مجلس";
}

/* Opening a new evaluation cycle is an administrative action (deciding WHEN to run a review),
   separate from SEEING confidential peer results — مدير النظام runs the platform day-to-day
   and should be able to kick off a cycle even on a company where they're not on the
   nominations committee and won't see the outcome themselves. */
async function canManagePerfEvaluations(){
  if(getCurrentRole() === "مدير النظام") return true;
  return canSeePerfResults();
}

const PERF_CRITERIA_MEMBER = [
  "يشارك بالمعلومات أو الأفكار",
  "يحضر اجتماعات مجلس الإدارة بانتظام وفي الوقت المحدد",
  "يشارك بنشاط في أنشطة مجلس الإدارة، ويعمل بشكل بناء مع زملائه في المجلس",
  "يتخذ مواقف بناءة وفعالة في اجتماعات مجلس الإدارة أو اللجان، عند الحاجة إلى ذلك",
  "يتقبل ردود فعل وإبداء ملاحظات مجلس الإدارة",
  "يحرص على التزام الاجتماعات بجدول الأعمال",
  "يساهم بشكل فعال في التصدي للخلافات وإيجاد الحلول",
  "يقدم رأيه بصدق في القضايا المطروحة",
  "يقدم آراء متميزة في القضايا المطروحة ولديه المهارات",
  "قادر على ترتيب الأولويات والتركيز على تحقيق الأهداف",
  "يحفز الآخرين من أجل تحقيق الإنجازات",
  "يقدم المشورة البناءة في مناقشات ومداولات المجلس",
  "يمتلك مهارات تحليلية تساهم في عملية صنع القرار",
  "يتجنب الاصطدام بالآخرين",
  "يساهم بإضافات جديدة في اجتماعات مجلس الإدارة ويحضر الاجتماعات ويُعدّ لها إعدادًا جيدًا",
  "يبادر في طلب المعلومات لاكتساب المعرفة",
  "يحفز الأعضاء على المشاركة بفعالية في المواضيع المطروحة",
  "يركز على تحقيق الأهداف",
  "يعمل على ربط الأهداف باستراتيجيات الشركة",
  "يعمل على الاستغلال الأمثل للموارد البشرية والمالية لتخطيط الخطط الاستراتيجية للشركة",
];
const PERF_CRITERIA_CHAIRMAN = [
  ...PERF_CRITERIA_MEMBER,
  "قادر على قيادة المجلس بشكل فعال ويشجع على مشاركة جميع الأعضاء",
  "علاقة العمل بينه وبين الرئيس التنفيذي جيدة وبنّاءة",
  "يعي هو والرئيس التنفيذي المهام الموكلة لكل منهما بوضوح",
];
const PERF_CRITERIA_EXEC = [
  "يحضر اجتماعات مجلس الإدارة بانتظام ويقدّم التقارير المطلوبة في وقتها",
  "ينفّذ قرارات مجلس الإدارة بفعالية والتزام",
  "يوفّر معلومات دقيقة وشفافة وفي وقتها المناسب للمجلس",
  "يمتلك رؤية واضحة لاستراتيجية الشركة وأهدافها طويلة المدى",
  "يدير الموارد البشرية والمالية بكفاءة تخدم الخطة الاستراتيجية",
  "يبني علاقة عمل بنّاءة وشفافة مع رئيس مجلس الإدارة وأعضائه",
  "يتحمّل المسؤولية عن نتائج الأداء التشغيلي والمالي للشركة",
  "يبادر بطرح المخاطر والتحديات على المجلس قبل تفاقمها",
  "يحرص على الامتثال للأنظمة واللوائح ومعايير الحوكمة",
  "يقود فريق الإدارة التنفيذية بفعالية ويحقق نتائج ملموسة",
];
// Which bank applies depends on the person's actual role, not a free-typed "type" — see
// getEvaluatedPersonRole(). entityType is kept only as a fallback for legacy rows saved before
// this change (their evaluated_email is null, so we can't re-derive the role from data).
//
// Companies can add/remove items themselves (see openPerfCriteriaManager) without any code
// change on our side — perfCriteriaCache holds whatever they've customized, loaded once per
// visit to the page; getPerfCriteria() only falls back to these hardcoded defaults for a role
// a company has never touched, so every existing evaluation keeps working unchanged.
let perfCriteriaCache = null; // { 'رئيس مجلس': [...] | null, 'عضو مجلس': [...] | null, 'تنفيذي': [...] | null }

async function loadPerfCriteriaCache(){
  const { data } = await sb.from("performance_criteria").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true});
  perfCriteriaCache = { "رئيس مجلس": null, "عضو مجلس": null, "تنفيذي": null };
  (data||[]).forEach(row => {
    if(!(row.role_type in perfCriteriaCache)) return;
    if(!perfCriteriaCache[row.role_type]) perfCriteriaCache[row.role_type] = [];
    perfCriteriaCache[row.role_type].push(row.criterion_text);
  });
}

function getPerfDefaultCriteria(roleKey){
  if(roleKey === "رئيس مجلس") return PERF_CRITERIA_CHAIRMAN;
  if(roleKey === "تنفيذي") return PERF_CRITERIA_EXEC;
  return PERF_CRITERIA_MEMBER;
}

function getPerfCriteria(entityType, personRole){
  const roleKey = ["رئيس مجلس","تنفيذي","عضو مجلس"].includes(personRole) ? personRole : (entityType === "تنفيذي" ? "تنفيذي" : "عضو مجلس");
  if(perfCriteriaCache && perfCriteriaCache[roleKey] && perfCriteriaCache[roleKey].length) return perfCriteriaCache[roleKey];
  return getPerfDefaultCriteria(roleKey);
}


/* ══════════ GOVERNANCE LINKS — risk ↔ policy ↔ decision ══════════
   One generic table (governance_links). A link is stored once, from whichever side it was made, and
   shown on both sides. Same-type links are not offered. */
const GOV_LINK_META = { policy:{ label:"سياسة", icon:"📜" }, procedure:{ label:"إجراء", icon:"📋" }, authority:{ label:"صلاحية", icon:"🔑" }, risk:{ label:"خطر", icon:"⚠️" }, decision:{ label:"قرار", icon:"✅" } };

async function govLinkCandidatesRaw(){
  const [pol, dec, risks, proc, auth] = await Promise.all([
    sb.from("policies").select("id,policy_name,category").eq("company_id", currentCompanyId),
    sb.from("board_decisions").select("id,decision_text").eq("company_id", currentCompanyId),
    fetchCompanyRisks(),
    sb.from("procedures").select("id,title,department").eq("company_id", currentCompanyId),
    sb.from("permission_items").select("id,item_name,category").eq("company_id", currentCompanyId)
  ]);
  return {
    policy: (pol.data||[]).map(p => ({ id:p.id, name:p.policy_name||"", cat:p.category||"" })),
    decision: (dec.data||[]).map(d => ({ id:d.id, name:d.decision_text||"", cat:"" })),
    risk: (risks||[]).map(r => ({ id:r.id, name:r.risk_name||"", cat:r.category||"" })),
    procedure: (proc.data||[]).map(p => ({ id:p.id, name:p.title||"", cat:p.department||"" })),
    authority: (auth.data||[]).map(a => ({ id:a.id, name:a.item_name||"", cat:a.category||"" }))
  };
}
let _govCache = { t:0, cand:null, links:null, co:null };
function govCacheClear(){ _govCache = { t:0, cand:null, links:null, co:null }; }
let _govInflight = null;
async function govLoadAll(){
  if(_govCache.cand && _govCache.co === currentCompanyId && Date.now() - _govCache.t < 8000) return _govCache;
  if(_govInflight) return _govInflight;
  _govInflight = (async () => {
    try {
      const [cand, lk] = await Promise.all([ govLinkCandidatesRaw(), sb.from("governance_links").select("*").eq("company_id", currentCompanyId) ]);
      _govCache = { t: Date.now(), cand, links: lk.data || [], co: currentCompanyId };
      govBuildDF(cand);
      return _govCache;
    } finally { _govInflight = null; }
  })();
  return _govInflight;
}
async function govLinkCandidates(){ return (await govLoadAll()).cand; }
/* Arabic-aware keyword overlap used to SUGGEST links (never to create them silently). */
const GOV_STOP = new Set(["سياسه","سياسة","اجراء","إجراء","لائحه","لائحة","نظام","الشركه","الشركة","مع","على","علي","الى","إلى","من","في","عن","هذه","هذا","التي","الذي","او","أو","ثم","كل","بعد","قبل","عند","ذات","ذو","حول","بدون","وفق","حسب"]);
function govTokens(txt){
  return new Set(String(txt||"").replace(/[\u064B-\u0652\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .split(/[^\u0621-\u064Aa-zA-Z0-9]+/).map(w => w.replace(/^(وال|بال|لل|ال|و)(?=.{3,})/,"")).filter(w => w.length >= 3 && !GOV_STOP.has(w)));
}
let _govDF = null;
function govBuildDF(cand){
  const df = {}; let n = 0;
  Object.values(cand).forEach(list => list.forEach(x => { n++; govTokens(x.name + " " + x.cat).forEach(w => { df[w] = (df[w]||0) + 1; }); }));
  _govDF = { df, n };
}
/* Number of RARE shared words (a word is rare if it appears in at most ~8% of all items): common words such as
   "اعتماد" or "الموظف" appear everywhere and would make everything look related. */
function govScore(a, b){
  if(!_govDF) return 0;
  const ta = govTokens(a.name + " " + a.cat), tb = govTokens(b.name + " " + b.cat);
  const maxDf = Math.max(3, Math.round(_govDF.n * 0.08));
  let n = 0; ta.forEach(w => { if(tb.has(w) && (_govDF.df[w]||0) <= maxDf) n++; });
  return n;
}
async function govLinksFor(type, id){
  const { links } = await govLoadAll();
  const out = [];
  links.forEach(l => {
    if(l.source_type === type && String(l.source_id) === String(id)) out.push({ rowId:l.id, type:l.target_type, id:l.target_id });
    else if(l.target_type === type && String(l.target_id) === String(id)) out.push({ rowId:l.id, type:l.source_type, id:l.source_id });
  });
  return out;
}
async function renderGovLinks(boxId, type, id){
  const box = document.getElementById(boxId); if(!box) return;
  const links = await govLinksFor(type, id);
  if(!links.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<span class="glink-chip">…</span>';
  const cand = await govLinkCandidates();
  const groups = {};
  links.forEach(l => {
    const item = (cand[l.type]||[]).find(x => String(x.id) === String(l.id));
    if(item) (groups[l.type] = groups[l.type] || []).push(item);
  });
  const types = Object.keys(groups);
  if(!types.length){ box.innerHTML = ""; return; }
  const total = types.reduce((n,t) => n + groups[t].length, 0);
  const summary = types.map(t => `${GOV_LINK_META[t].icon} ${groups[t].length} ${GOV_LINK_META[t].label}`).join(" · ");
  const detail = types.map(t => groups[t].map(x => `<div class="glink-det">${GOV_LINK_META[t].icon} ${orgEsc(x.name).slice(0,80)}</div>`).join("")).join("");
  box.innerHTML = `<button type="button" class="glink-sum" onclick="this.nextElementSibling.classList.toggle('open')">🔗 مرتبطة بـ ${total}: ${summary} ▾</button><div class="glink-list">${detail}</div>`;
}
async function openGovLinkPicker(type, id){
  let m = document.getElementById("m-govlink");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-govlink";
    m.innerHTML = '<div class="modal"><div class="modal-title">ربط بعناصر أخرى</div><div id="govlink-body"></div><div class="modal-foot"><button class="btn btn-ghost" onclick="closeGovLinkPicker()">إلغاء</button><button class="btn btn-gold" id="govlink-save">تأكيد الربط</button></div></div>';
    document.body.appendChild(m);
  }
  const body = document.getElementById("govlink-body");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  m.classList.add("open");
  const [cand, existing] = await Promise.all([govLinkCandidates(), govLinksFor(type, id)]);
  const have = new Set(existing.map(l => l.type + ":" + l.id));
  if(!Object.values(cand).some(l => l.length)){ body.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--gray3)">لا توجد عناصر للربط بعد: أضف سياسة أو قراراً أو اطلب تقييم مخاطر أولاً.</div>'; return; }
  const types = Object.keys(GOV_LINK_META).filter(t => t !== type);
  const me = (cand[type]||[]).find(x => String(x.id) === String(id)) || { name:"", cat:"" };
  body.innerHTML = '<input class="fi" id="glink-search" placeholder="ابحث للعثور على عنصر..." style="margin-bottom:6px"><div style="display:flex;gap:8px;margin-bottom:4px"><button class="btn-xs sec" id="glink-pick-sug" type="button">تحديد كل المقترحات</button><span id="glink-hint" style="font-size:12px;color:var(--gray3);align-self:center"></span></div>' + types.map(t => {
    const list = (cand[t] || []).map(x => ({ ...x, _s: govScore(me, x) })).sort((a,b) => b._s - a._s);
    return `<div class="sec-title" style="font-size:13px;margin-top:10px">${GOV_LINK_META[t].icon} ${GOV_LINK_META[t].label}</div>` +
      (list.length ? list.map(x => `<label class="glink-row" data-sug="${x._s>0||have.has(t+":"+x.id)?1:0}" data-txt="${orgEsc(x.name).toLowerCase()}"><input type="checkbox" class="glink-chk" data-type="${t}" data-id="${x.id}" ${have.has(t+":"+x.id)?"checked":""}> <span>${orgEsc(x.name).slice(0,90)}${x._s>0 && !have.has(t+":"+x.id) ? ' <em class="glink-sug">مقترح</em>' : ""}</span></label>`).join("")
                   : `<div style="font-size:12px;color:var(--gray3);padding:6px 0">${t==="risk"?"لا توجد مخاطر بعد — تظهر هنا المخاطر المسجّلة في طلبات تقييم المخاطر.":t==="decision"?"لا توجد قرارات بعد — تظهر هنا القرارات المسجّلة من محاضر الاجتماعات (متابعة القرارات).":t==="procedure"?"لا توجد إجراءات بعد — تُولَّد من صفحة الإجراءات.":t==="authority"?"لا توجد بنود في مصفوفة الصلاحيات بعد.":"لا توجد سياسات."}</div>`);
  }).join("");
  const applyFilter = () => {
    const q = (document.getElementById("glink-search").value||"").trim().toLowerCase();
    let shown = 0, sug = 0;
    body.querySelectorAll(".glink-row").forEach(r => {
      const isSug = r.dataset.sug === "1"; if(isSug) sug++;
      const ok = q ? r.dataset.txt.includes(q) : isSug;
      r.classList.toggle("glink-hide", !ok); if(ok) shown++;
    });
    document.getElementById("glink-hint").textContent = q ? `${shown} نتيجة` : (sug ? `${sug} مقترح — استخدم البحث لعرض غيرها` : "لا توجد مقترحات — استخدم البحث");
  };
  document.getElementById("glink-search").oninput = applyFilter;
  document.getElementById("glink-pick-sug").onclick = () => body.querySelectorAll('.glink-row[data-sug="1"] input').forEach(c => { c.checked = true; });
  applyFilter();
  document.getElementById("govlink-save").onclick = () => saveGovLinks(type, id, existing);
}
function closeGovLinkPicker(){ const m = document.getElementById("m-govlink"); if(m) m.classList.remove("open"); }
async function saveGovLinks(type, id, existing){
  govCacheClear();
  const chosen = [...document.querySelectorAll(".glink-chk:checked")].map(c => ({ type:c.dataset.type, id:Number(c.dataset.id) }));
  const key = x => x.type + ":" + x.id;
  const chosenKeys = new Set(chosen.map(key));
  const toAdd = chosen.filter(c => !existing.some(e => key(e) === key(c)));
  const toRemove = existing.filter(e => !chosenKeys.has(key(e)));
  const { data: u } = await sb.auth.getUser();
  const email = u && u.user ? u.user.email : null;
  if(toAdd.length){
    const { error } = await sb.from("governance_links").insert(toAdd.map(c => ({ company_id: currentCompanyId, source_type:type, source_id:id, target_type:c.type, target_id:c.id, created_by: email })));
    if(error){ alert("تعذّر حفظ الروابط: " + error.message); return; }
  }
  for(const r of toRemove){ await sb.from("governance_links").delete().eq("id", r.rowId); }
  logActivity("تعديل", "روابط الحوكمة", `${GOV_LINK_META[type].label} ${id}`, "");
  govCacheClear();
  closeGovLinkPicker();
  alert(chosen.length ? `تم حفظ الروابط ✅ (${chosen.length})` : "تم إزالة الروابط ✅");
  document.querySelectorAll(`[data-glinks="${type}:${id}"]`).forEach(b => renderGovLinks(b.id, type, id));
}

/* ══════════ GOVERNANCE NETWORK: coverage + auto-suggest wizard ══════════
   Coverage = how well the policy base is actually wired into how the company works:
   a policy with no procedure and no authority item is "inactive on paper"; a procedure or an
   authority item with no policy has no stated basis. The wizard proposes links from keyword
   overlap and applies only what the user confirms. */
async function govNetworkState(){
  govCacheClear();
  const { cand, links } = await govLoadAll();
  const has = (type, id, otherType) => links.some(l =>
    (l.source_type===type && String(l.source_id)===String(id) && l.target_type===otherType) ||
    (l.target_type===type && String(l.target_id)===String(id) && l.source_type===otherType));
  const policiesNoImpl = cand.policy.filter(p => !has("policy", p.id, "procedure") && !has("policy", p.id, "authority"));
  const procNoPolicy = cand.procedure.filter(p => !has("procedure", p.id, "policy"));
  const authNoPolicy = cand.authority.filter(a => !has("authority", a.id, "policy"));
  const total = cand.policy.length + cand.procedure.length + cand.authority.length;
  const bad = policiesNoImpl.length + procNoPolicy.length + authNoPolicy.length;
  return { cand, links, policiesNoImpl, procNoPolicy, authNoPolicy, total, pct: total ? Math.round((total - bad) / total * 100) : null };
}
async function renderGovNetworkCard(){
  const box = document.getElementById("dashGovNetwork"); if(!box) return;
  let st; try { st = await govNetworkState(); } catch(e){ box.innerHTML = ""; return; }
  if(!st.total){ box.innerHTML = '<div class="dash-empty"><span>أضف سياسات وإجراءات وبنود صلاحيات ليبدأ قياس الترابط.</span></div>'; return; }
  const row = (n, text) => n ? `<div class="gn-row"><b>${n}</b> ${text}</div>` : "";
  box.innerHTML = `<div class="gn-top"><div class="gn-pct ${st.pct>=80?"pg-good":st.pct>=50?"pg-mid":"pg-low"}-t">${st.pct}%</div><div class="gn-lbl">من عناصر الحوكمة مرتبطة بسند أو تطبيق</div></div>
    ${row(st.policiesNoImpl.length, "سياسة بلا إجراء أو صلاحية تطبّقها (غير مفعّلة)")}
    ${row(st.procNoPolicy.length, "إجراء بلا سياسة كمرجع")}
    ${row(st.authNoPolicy.length, "بند صلاحية بلا سياسة كسند")}
    <button class="btn-xs primary" style="margin-top:10px" onclick="openAutoLinkWizard()">✨ اقترح الروابط تلقائياً</button>`;
}
async function openAutoLinkWizard(){
  let m = document.getElementById("m-autolink");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-autolink";
    m.innerHTML = '<div class="modal"><div class="modal-title">روابط مقترحة تلقائياً</div><div id="autolink-body"></div><div class="modal-foot"><button class="btn btn-ghost" onclick="document.getElementById(\'m-autolink\').classList.remove(\'open\')">إغلاق</button><button class="btn btn-gold" id="autolink-save">اعتماد المحدد</button></div></div>';
    document.body.appendChild(m);
  }
  const body = document.getElementById("autolink-body");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ تحليل التطابق...</div>';
  m.classList.add("open");
  const st = await govNetworkState();
  const exists = (a, b) => st.links.some(l => (l.source_type===a.t && String(l.source_id)===String(a.x.id) && l.target_type===b.t && String(l.target_id)===String(b.x.id)) || (l.target_type===a.t && String(l.target_id)===String(a.x.id) && l.source_type===b.t && String(l.source_id)===String(b.x.id)));
  const sug = [];
  const pairs = [["policy","procedure"],["policy","authority"],["policy","risk"]];
  pairs.forEach(([ta, tb]) => st.cand[ta].forEach(a => st.cand[tb].forEach(b => {
    const sc = govScore(a, b);
    if(sc >= 1 && !exists({t:ta,x:a},{t:tb,x:b})) sug.push({ ta, a, tb, b, sc });
  })));
  sug.sort((x,y) => y.sc - x.sc);
  const top = sug.slice(0, 40);
  if(!top.length){ body.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--gray3)">لا توجد اقتراحات جديدة. أضف المزيد من السياسات والإجراءات أو اربط يدوياً من بطاقة كل عنصر.</div>'; document.getElementById("autolink-save").style.display = "none"; return; }
  document.getElementById("autolink-save").style.display = "";
  body.innerHTML = '<div style="font-size:12.5px;color:var(--gray3);margin-bottom:8px">الاقتراح مبني على تشابه الكلمات فقط. راجعه وأشّر على ما تراه صحيحاً.</div>' +
    top.map((x,i) => `<label class="glink-row"><input type="checkbox" class="alink-chk" data-i="${i}" ${x.sc>=2?"checked":""}> <span>${GOV_LINK_META[x.ta].icon} ${orgEsc(x.a.name).slice(0,50)} ⇄ ${GOV_LINK_META[x.tb].icon} ${orgEsc(x.b.name).slice(0,50)}${x.sc>=2?' <em class="glink-sug">تطابق قوي</em>':""}</span></label>`).join("");
  document.getElementById("autolink-save").onclick = async () => {
    const chosen = [...document.querySelectorAll(".alink-chk:checked")].map(c => top[Number(c.dataset.i)]);
    if(!chosen.length){ alert("لم تؤشّر على أي اقتراح"); return; }
    const { data: u } = await sb.auth.getUser();
    const email = u && u.user ? u.user.email : null;
    const { error } = await sb.from("governance_links").insert(chosen.map(x => ({ company_id: currentCompanyId, source_type:x.ta, source_id:x.a.id, target_type:x.tb, target_id:x.b.id, created_by: email })));
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    logActivity("إنشاء", "روابط الحوكمة", `${chosen.length} رابط مقترح`, "");
    govCacheClear();
    alert(`تم ربط ${chosen.length} عنصر ✅`);
    m.classList.remove("open");
    renderGovNetworkCard();
  };
}
