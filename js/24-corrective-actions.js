/* ══════════ CORRECTIVE ACTION TRACKING (متابعة الإجراءات التصحيحية) ══════════
   An assessment's corrective action used to be free text inside each criterion — nobody owned it,
   nothing had a date, nothing could be closed. Here each one can become its own record with three
   distinct roles (executor / monitor / approver) and a status that only moves in one direction
   except when it is sent back. The checks below run in the app code; the database policy only
   scopes rows to the company, it does not know about these roles. */
const GA_STATUS_STYLE = {
  "لم يبدأ": ["#F1F1F1","var(--gray3)"], "قيد التنفيذ": ["#FEF3E2","var(--gold)"],
  "بانتظار المراجعة": ["#E6EEF8","var(--primary)"], "بانتظار الاعتماد": ["#EFE6F8","#6B3FA0"], "مغلق": ["#E8F8EF","var(--green)"]
};
const GA_TRANSITIONS = {
  "لم يبدأ": [{ to:"قيد التنفيذ", actor:"executor", label:"بدء التنفيذ" }],
  "قيد التنفيذ": [{ to:"بانتظار المراجعة", actor:"executor", label:"إرسال للمراجعة", needNote:true, noteLabel:"ما تم تنفيذه والدليل عليه" }],
  "بانتظار المراجعة": [
    { to:"بانتظار الاعتماد", actor:"monitor", label:"قبول وإحالة للاعتماد" },
    { to:"قيد التنفيذ", actor:"monitor", label:"إعادة للمنفّذ", needNote:true, noteLabel:"سبب الإعادة", ret:true }
  ],
  "بانتظار الاعتماد": [
    { to:"مغلق", actor:"approver", label:"اعتماد وإغلاق" },
    { to:"قيد التنفيذ", actor:"approver", label:"رفض وإعادة للمنفّذ", needNote:true, noteLabel:"سبب الرفض", ret:true }
  ]
};
const GA_ACTOR_LABEL = { executor:"المنفّذ", monitor:"المراقب", approver:"المعتمِد" };
let gaActionsCache = [];
let gaMembersCache = [];

function gaEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function gaMyEmail(){ return currentUserProfile ? currentUserProfile.email : null; }
function gaIsPlatformOwner(){ return !!(currentUserProfile && currentUserProfile.is_platform_admin === true); }
function gaCanManage(){ return gaIsPlatformOwner() || ["مدير النظام","رئيس مجلس","سكرتير المجلس"].includes(getCurrentRole()); }
function gaNoBoard(){ return currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner; }
function gaName(email){ if(!email) return "غير محدَّد"; const m = gaMembersCache.find(x => x.email === email); return m ? m.name : email; }
function gaIsOverdue(a){ return a.status !== "مغلق" && !!a.target_date && new Date(a.target_date) < new Date(new Date().toDateString()); }
function gaCompanyName(){ return document.getElementById("companySwitcher")?.selectedOptions?.[0]?.textContent?.trim() || ""; }

async function gaLoadAll(){
  const [{ data: acts }, { data: ms }] = await Promise.all([
    sb.from("governance_actions").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId)
  ]);
  gaActionsCache = acts || [];
  const rows = (ms||[]).filter(m => m.role !== "مساهم");
  const emails = rows.map(r => r.email);
  const { data: profs } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameBy = {}; (profs||[]).forEach(p => { nameBy[p.email] = p.full_name; });
  gaMembersCache = rows.map(r => ({ email: r.email, role: r.role, name: nameBy[r.email] || r.email }));
}

/* Defaults by entity: with a board the approver is its chair and the monitor is the audit
   committee chair (or the board secretary); with no board it collapses to the system admin.
   Executor is the chief executive. If the executor would also be the approver, the approver
   is left empty rather than silently assigning someone to approve their own work. */
async function gaDefaultRoles(){
  const byRole = r => (gaMembersCache.find(m => m.role === r) || {}).email || null;
  let execs = []; try { execs = await getEvaluableExecutives(); } catch(e){}
  const ceo = execs.find(e => /رئيس تنفيذي|الرئيس التنفيذي|مدير عام|المدير العام|مدير تنفيذي|المدير التنفيذي/.test(e.position||"")) || execs[0] || null;
  let executor = ceo ? ceo.email : null, monitor, approver;
  if(gaNoBoard()){
    const admins = gaMembersCache.filter(m => m.role === "مدير النظام").map(m => m.email);
    approver = admins[0] || null;
    monitor = admins[1] || admins[0] || null;
  } else {
    approver = byRole("رئيس مجلس");
    monitor = byRole("رئيس لجنة مراجعة") || byRole("سكرتير المجلس");
  }
  if(executor && executor === approver) approver = null;
  return { executor, monitor, approver };
}

function gaSlotHTML(assessmentId, axisKey, critKey){
  const own = assessmentId ? gaActionsCache.find(a => String(a.assessment_id) === String(assessmentId) && a.criterion_key === critKey) : null;
  let html = "";
  if(own){
    const [bg,fg] = GA_STATUS_STYLE[own.status] || GA_STATUS_STYLE["لم يبدأ"];
    html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:${bg};color:${fg}">متابَع: ${gaEsc(own.status)}</span>
      <button type="button" class="btn-xs primary" onclick="gaOpen(${own.id})">فتح</button></div>`;
  } else {
    html += `<button type="button" class="btn-xs gold" style="margin-top:6px" onclick="gaCreateFromRow(this)"><span class="ico-i ico-check"></span>تتبّع كإجراء متابَع</button>`;
  }
  const prior = gaActionsCache.filter(a => a.criterion_key === critKey && String(a.assessment_id) !== String(assessmentId||""));
  if(prior.length){
    const open = prior.filter(a => a.status !== "مغلق").length;
    html += `<div style="font-size:10px;margin-top:5px;color:${open?'var(--red)':'var(--green)'}">إجراءات من تقييمات سابقة: ${open} مفتوح · ${prior.length-open} مغلق</div>`;
  }
  return html;
}
function gaRefreshAllSlots(){
  const gid = document.getElementById("ga-id").value;
  document.querySelectorAll(".ga-slot").forEach(el => { el.innerHTML = gaSlotHTML(gid, el.dataset.axis, el.dataset.crit); });
}

async function gaCreateFromRow(btn){
  const gid = document.getElementById("ga-id").value;
  if(!gid){ alert("احفظ التقييم أولاً، ثم حوّل الإجراء إلى متابعة."); return; }
  const tr = btn.closest("tr");
  const text = tr.querySelector(".ga-actions").value.trim();
  if(!text){ alert("اكتب الإجراء التصحيحي أولاً."); return; }
  const axis = tr.dataset.axis, crit = tr.dataset.crit;
  const label = tr.querySelector("b") ? tr.querySelector("b").textContent : crit;
  btn.disabled = true;
  const roles = await gaDefaultRoles();
  const { data, error } = await sb.from("governance_actions").insert([{
    company_id: currentCompanyId, assessment_id: Number(gid), axis_key: axis, criterion_key: crit, criterion_label: label,
    action_text: text, executor_email: roles.executor, monitor_email: roles.monitor, approver_email: roles.approver,
    status: "لم يبدأ", created_by: gaMyEmail()
  }]).select().single();
  btn.disabled = false;
  if(error){ alert("تعذّر إنشاء الإجراء: " + error.message); return; }
  await sb.from("governance_action_log").insert([{ action_id: data.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: null, to_status: "لم يبدأ", note: "إنشاء الإجراء" }]);
  await gaLoadAll();
  gaRefreshAllSlots();
  gaOpen(data.id);
}

/* ── Tracker on the assessment list page ── */
async function loadGaTracker(){ await gaLoadAll(); renderGaTracker(); }

function gaMyPending(a){
  const me = gaMyEmail();
  if(a.status === "لم يبدأ" || a.status === "قيد التنفيذ") return a.executor_email === me;
  if(a.status === "بانتظار المراجعة") return a.monitor_email === me;
  if(a.status === "بانتظار الاعتماد") return a.approver_email === me;
  return false;
}

function renderGaTracker(){
  const statsBox = document.getElementById("gaStats"), list = document.getElementById("gaList");
  if(!statsBox || !list) return;
  const all = gaActionsCache.filter(a => a.axis_key !== "compliance");
  const closed = all.filter(a => a.status === "مغلق").length;
  const overdue = all.filter(gaIsOverdue).length;
  const mine = all.filter(a => a.status !== "مغلق" && gaMyPending(a)).length;
  const rate = all.length ? Math.round(closed/all.length*100) : 0;
  statsBox.innerHTML = `
    <div class="kpi blue"><div class="kpi-label">إجمالي الإجراءات</div><div class="kpi-val">${all.length}</div></div>
    <div class="kpi gold"><div class="kpi-label">المطلوب مني</div><div class="kpi-val">${mine}</div></div>
    <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
    <div class="kpi green"><div class="kpi-label">نسبة الإغلاق</div><div class="kpi-val">${rate}%</div></div>`;

  const f = document.getElementById("ga-filter").value;
  const rows = all.filter(a => {
    if(f === "mine") return a.status !== "مغلق" && gaMyPending(a);
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
        <div style="font-size:12.5px;font-weight:700;color:var(--dark);flex:1">${gaEsc(a.action_text)}</div>
        <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(a.status)}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">المعيار: ${gaEsc(a.criterion_label||a.criterion_key)}</div>
      <div style="font-size:11px;color:var(--gray3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
        <span>المنفّذ: ${gaEsc(gaName(a.executor_email))}</span><span>المراقب: ${gaEsc(gaName(a.monitor_email))}</span><span>المعتمِد: ${gaEsc(gaName(a.approver_email))}</span>
        <span>الموعد: ${a.target_date||"غير محدَّد"}</span>${gaIsOverdue(a) ? '<span style="color:var(--red);font-weight:800">متأخر</span>' : ""}
      </div>
      <button class="btn-xs ${a.status!=='مغلق' && gaMyPending(a) ? 'gold' : 'primary'}" onclick="gaOpen(${a.id})">${a.status!=='مغلق' && gaMyPending(a) ? 'مطلوب منك' : 'فتح'}</button>
    </div>`;
  }).join("");
}

/* ── Action modal ── */
function gaFillSelect(id, selected){
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">— غير محدَّد —</option>' + gaMembersCache.map(m => `<option value="${gaEsc(m.email)}" ${m.email===selected?"selected":""}>${gaEsc(m.name)} — ${gaEsc(m.role)}</option>`).join("");
  if(selected && !gaMembersCache.some(m => m.email === selected)) sel.insertAdjacentHTML("beforeend", `<option value="${gaEsc(selected)}" selected>${gaEsc(selected)}</option>`);
}

async function gaOpen(id){
  if(!gaMembersCache.length || !gaActionsCache.some(a => a.id === id)) await gaLoadAll();
  const a = gaActionsCache.find(x => x.id === id);
  if(!a){ alert("تعذّر تحميل الإجراء"); return; }
  document.getElementById("gam-id").value = id;
  document.getElementById("gam-context").textContent = `${a.action_kind ? "إجراء " + a.action_kind + " — " : ""}المعيار: ${a.criterion_label||a.criterion_key}`;
  const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
  document.getElementById("gam-status-badge").innerHTML = `<span style="font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;background:${bg};color:${fg}">${gaEsc(a.status)}</span>`;
  document.getElementById("gam-overdue-tag").innerHTML = gaIsOverdue(a) ? '<span style="font-size:11px;font-weight:800;color:var(--red)">متأخر عن الموعد</span>' : "";
  document.getElementById("gam-text").value = a.action_text || "";
  gaFillSelect("gam-executor", a.executor_email); gaFillSelect("gam-monitor", a.monitor_email); gaFillSelect("gam-approver", a.approver_email);
  document.getElementById("gam-target").value = a.target_date || "";

  const canEdit = gaCanManage() && a.status !== "مغلق";
  ["gam-text","gam-executor","gam-monitor","gam-approver","gam-target"].forEach(i => { document.getElementById(i).disabled = !canEdit; });
  document.getElementById("gam-assign-btn").innerHTML = canEdit ? '<button class="btn btn-gold" style="font-size:11.5px" onclick="gaSaveAssignment()"><span class="ico-i ico-save"></span>حفظ التكليف</button>' : "";

  const notes = [];
  if(a.evidence_note) notes.push(`<b>ما تم تنفيذه:</b> ${gaEsc(a.evidence_note)}`);
  if(a.monitor_note) notes.push(`<b>آخر ملاحظة مراجعة:</b> ${gaEsc(a.monitor_note)}`);
  const nb = document.getElementById("gam-notes-box");
  nb.style.display = notes.length ? "block" : "none"; nb.innerHTML = notes.join("<br>");

  const me = gaMyEmail();
  const opts = (GA_TRANSITIONS[a.status] || []).filter(t => gaIsPlatformOwner() || a[t.actor+"_email"] === me);
  const noteWrap = document.getElementById("gam-note-wrap");
  document.getElementById("gam-note").value = "";
  const needsNote = opts.some(t => t.needNote);
  noteWrap.style.display = needsNote ? "block" : "none";
  if(needsNote) document.getElementById("gam-note-label").textContent = opts.find(t => t.needNote).noteLabel;
  const btns = document.getElementById("gam-buttons");
  if(a.status === "مغلق"){ btns.innerHTML = `<span style="font-size:11.5px;color:var(--green);font-weight:700"><span class="ico-i ico-check"></span>أُغلق بتاريخ ${a.closed_at ? new Date(a.closed_at).toLocaleDateString('ar-SA-u-ca-gregory') : ""}</span>`; }
  else if(!opts.length){
    const need = (GA_TRANSITIONS[a.status]||[])[0];
    btns.innerHTML = `<span style="font-size:11px;color:var(--gray3)">الخطوة التالية بيد ${need ? GA_ACTOR_LABEL[need.actor] + ": " + gaEsc(gaName(a[need.actor+"_email"])) : "—"}.</span>`;
  } else {
    btns.innerHTML = opts.map(t => `<button class="btn ${t.ret?'btn-ghost':'btn-gold'}" style="font-size:11.5px" onclick="gaTransition(${a.id},'${t.to}')">${t.label}</button>`).join("");
  }

  const { data: log } = await sb.from("governance_action_log").select("*").eq("action_id", id).order("id",{ascending:false});
  document.getElementById("gam-log").innerHTML = (log||[]).map(l => `<div style="border-right:2px solid var(--gray1);padding-right:8px;margin-bottom:6px">
    <b style="color:var(--dark)">${gaEsc(l.actor_name||l.actor_email||"")}</b> — ${new Date(l.created_at).toLocaleString('ar-SA-u-ca-gregory')}<br>
    ${l.to_status ? `${l.from_status?gaEsc(l.from_status)+" ← ":""}<b>${gaEsc(l.to_status)}</b>` : ""}${l.note ? ` — ${gaEsc(l.note)}` : ""}</div>`).join("") || "لا توجد تحديثات.";
  openM("m-gaction");
}

async function gaLog(a, from, to, note){
  await sb.from("governance_action_log").insert([{ action_id: a.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: from, to_status: to, note: note||null }]);
}
function gaNotify(email, subject, body, a){
  if(!email || email === gaMyEmail()) return;
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h3 style="color:#1A3A6B">${gaEsc(subject)}</h3>
    <p><b>الشركة:</b> ${gaEsc(gaCompanyName())}</p><p><b>الإجراء:</b> ${gaEsc(a.action_text)}</p><p>${gaEsc(body)}</p></div>`;
  sendNotificationEmail(email, subject, html);
}

async function gaSaveAssignment(){
  const id = Number(document.getElementById("gam-id").value);
  const a = gaActionsCache.find(x => x.id === id);
  if(!a || a.status === "مغلق" || !gaCanManage()) return;
  const action_text = document.getElementById("gam-text").value.trim();
  const executor_email = document.getElementById("gam-executor").value || null;
  const monitor_email = document.getElementById("gam-monitor").value || null;
  const approver_email = document.getElementById("gam-approver").value || null;
  const target_date = document.getElementById("gam-target").value || null;
  if(!action_text){ alert("نص الإجراء مطلوب"); return; }

  const clashes = [];
  if(executor_email && executor_email === approver_email) clashes.push("المنفّذ هو نفسه المعتمِد");
  if(executor_email && executor_email === monitor_email) clashes.push("المنفّذ هو نفسه المراقب");
  if(clashes.length){
    if(!gaNoBoard()){ alert("لا يجوز: " + clashes.join(" و") + ". اختر شخصاً مختلفاً لضمان الفصل بين التنفيذ والرقابة والاعتماد."); return; }
    if(!await uiConfirm("تنبيه: " + clashes.join(" و") + ". هذا مقبول فقط لأن الكيان لا مجلس له وعدد الأشخاص محدود. متابعة؟")) return;
  }
  const { error } = await sb.from("governance_actions").update({ action_text, executor_email, monitor_email, approver_email, target_date }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  await gaLog(a, a.status, null, "تعديل التكليف");
  if(executor_email && executor_email !== a.executor_email) gaNotify(executor_email, "إجراء تصحيحي مسند إليك", "أُسند إليك تنفيذ هذا الإجراء" + (target_date ? ` قبل ${target_date}` : "") + ".", a);
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}

async function gaTransition(id, to){
  const a = gaActionsCache.find(x => x.id === id);
  if(!a) return;
  const t = (GA_TRANSITIONS[a.status]||[]).find(x => x.to === to);
  if(!t) return;
  if(!gaIsPlatformOwner() && a[t.actor+"_email"] !== gaMyEmail()){ alert("هذه الخطوة خاصة بـ" + GA_ACTOR_LABEL[t.actor] + " المحدَّد."); return; }
  if(!a.executor_email || !a.monitor_email || !a.approver_email){ alert("حدّد المنفّذ والمراقب والمعتمِد أولاً (حفظ التكليف)."); return; }
  const note = document.getElementById("gam-note").value.trim();
  if(t.needNote && !note){ alert("الرجاء كتابة: " + t.noteLabel); return; }

  const upd = { status: to };
  if(to === "مغلق") upd.closed_at = new Date().toISOString();
  if(to === "بانتظار المراجعة") upd.evidence_note = note;
  if(t.ret) upd.monitor_note = note;
  // Only applies if nobody else moved it meanwhile.
  const { data: done, error } = await sb.from("governance_actions").update(upd).eq("id", id).eq("status", a.status).select();
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  if(!done || !done.length){ alert("تغيّرت حالة الإجراء من مستخدم آخر. حدّث الصفحة وأعد المحاولة."); await gaLoadAll(); renderGaTracker(); gaOpen(id); return; }

  await gaLog(a, a.status, to, note);
  if(to === "بانتظار المراجعة") gaNotify(a.monitor_email, "إجراء تصحيحي بانتظار مراجعتك", "أرسل المنفّذ الإجراء للمراجعة.", a);
  if(to === "بانتظار الاعتماد") gaNotify(a.approver_email, "إجراء تصحيحي بانتظار اعتمادك", "قبل المراقب الإجراء وأحاله للاعتماد.", a);
  if(t.ret) gaNotify(a.executor_email, "أُعيد إليك إجراء تصحيحي", "السبب: " + note, a);
  if(to === "مغلق"){ gaNotify(a.executor_email, "اعتُمد إغلاق الإجراء التصحيحي", "تم اعتماد الإجراء وإغلاقه.", a); logActivity("إغلاق","إجراء تصحيحي",a.criterion_label||a.criterion_key,a.action_text); }
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}
