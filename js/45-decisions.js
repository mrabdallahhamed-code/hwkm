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
