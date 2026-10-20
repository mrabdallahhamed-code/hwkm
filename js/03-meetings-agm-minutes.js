/* ══════════ ANNUAL MEETING PLAN (non-binding scheduling — no consensus required) ══════════
   One active plan per company: a frequency (سنوية/نصف سنوية/ربع سنوية) + a year, made up of
   numbered items ("الاجتماع الأول", "الثاني"...) each with a rough, non-binding planned
   period. Sits between "الاجتماع الحالي" and "الاجتماعات المجدولة القادمة". Purely a planning
   aid for السكرتير/مدير النظام — doesn't create a real meeting or need anyone's approval. */
const PLAN_FREQ_MIN = { "سنوية":4, "نصف سنوية":2, "ربع سنوية":1 };
const PLAN_ORDINALS = ["الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر","الحادي عشر","الثاني عشر"];
function planItemLabel(seq){ return "الاجتماع " + (PLAN_ORDINALS[seq-1] || ("رقم "+seq)); }

let currentMeetingPlan = null;
let currentMeetingPlanItems = [];

function meetingPlanRoleGuard(){
  const role = getCurrentRole();
  if(role !== "سكرتير المجلس" && role !== "مدير النظام"){
    alert("إدارة الخطة السنوية مقصورة على سكرتير المجلس أو مدير النظام.");
    return false;
  }
  return true;
}

async function loadMeetingPlans(){
  const box = document.getElementById("meetingPlansStrip");
  const headerActions = document.getElementById("meetingPlanHeaderActions");
  if(!box) return;

  const { data: plan, error } = await sb.from("meeting_plans").select("*")
    .eq("company_id", currentCompanyId).order("id",{ascending:false}).limit(1).maybeSingle();
  if(error){ box.innerHTML = `<div class="plan-empty">تعذّر تحميل الخطة (${error.message})</div>`; return; }
  currentMeetingPlan = plan || null;

  if(!currentMeetingPlan){
    currentMeetingPlanItems = [];
    if(headerActions) headerActions.innerHTML = `<button class="btn btn-ghost" style="font-size:11px;padding:6px 14px" onclick="openMeetingPlanSetupModal()">+ إعداد الخطة</button>`;
    box.innerHTML = '<div class="plan-empty">لا توجد خطة معدّة بعد — اضغط "+ إعداد الخطة" لتبدأ التخطيط السنوي.</div>';
    return;
  }

  if(headerActions) headerActions.innerHTML = `
    <button class="btn btn-ghost" style="font-size:11px;padding:6px 14px" onclick="addPlanItemToExistingPlan()">+ إضافة اجتماع</button>
    <button class="btn btn-ghost" style="font-size:11px;padding:6px 14px" onclick="downloadMeetingPlanPDF()"><span class="ico-i ico-document"></span>تحميل PDF</button>
    <button class="btn" style="font-size:11px;padding:6px 14px;background:#FDE8E8;color:var(--red);border:none" onclick="deleteMeetingPlan()"><span class="ico-i ico-trash"></span>حذف الخطة</button>`;

  const { data: items } = await sb.from("meeting_plan_items").select("*")
    .eq("plan_id", currentMeetingPlan.id).order("seq_number",{ascending:true});
  currentMeetingPlanItems = items || [];

  if(currentMeetingPlanItems.length === 0){
    box.innerHTML = '<div class="plan-empty">الخطة معدّة (' + currentMeetingPlan.frequency + ' ' + (currentMeetingPlan.year||'') + ') بدون اجتماعات بعد — اضغط "+ إضافة اجتماع".</div>';
    return;
  }

  box.innerHTML = currentMeetingPlanItems.map(it => {
    const converted = it.status === "تحوّل لاجتماع";
    return `<div class="plan-card">
      <div class="plan-pin"><span class="ico ico-pin" style="width:16px;height:16px"></span></div>
      <div class="plan-badge">${converted ? "✅ تحوّل لاجتماع" : "مخطط له"}</div>
      <div class="plan-title">${planItemLabel(it.seq_number)}</div>
      <div class="plan-period"><span class="ico-i ico-calendar"></span>${it.planned_period||"— لم يُحدَّد بعد"}</div>
      <div class="plan-type">${currentMeetingPlan.frequency} · ${currentMeetingPlan.year||""}</div>
      <div class="plan-actions">
        ${converted
          ? `<button class="plan-edit" style="flex:1" onclick="openMeetingDetailModal(${it.linked_meeting_id})"><span class="ico-i ico-folder"></span>عرض الاجتماع</button>`
          : `<button class="plan-convert" onclick="convertPlanItemToMeeting(${it.id})"><span class="ico-i ico-refresh"></span>تحويل</button>
             <button class="plan-edit" onclick="openEditPlanItemModal(${it.id})"><span class="ico ico-edit" style="width:16px;height:16px"></span></button>
             <button class="plan-del" onclick="deletePlanItem(${it.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>`}
      </div>
    </div>`;
  }).join("");
}

/* ── Plan setup modal: choose frequency + year, then fill in each item's rough date ── */
function openMeetingPlanSetupModal(){
  if(!meetingPlanRoleGuard()) return;
  document.getElementById("mplan-frequency").value = currentMeetingPlan ? currentMeetingPlan.frequency : "سنوية";
  document.getElementById("mplan-year").value = currentMeetingPlan ? (currentMeetingPlan.year||"") : "";
  rebuildPlanItemRows();
  openM("m-meeting-plan");
}

function rebuildPlanItemRows(){
  const freq = document.getElementById("mplan-frequency").value;
  const min = PLAN_FREQ_MIN[freq] || 1;
  const list = document.getElementById("mplan-items-list");
  const existingPeriods = currentMeetingPlanItems.map(it => it.planned_period || "");
  const count = Math.max(min, existingPeriods.length);
  let rows = "";
  for(let i=1; i<=count; i++){
    rows += `<div class="fg"><label>${planItemLabel(i)} — تاريخ تقريبي</label>
      <input class="fi" data-plan-seq="${i}" value="${existingPeriods[i-1]||""}" placeholder="مثال: مارس 2027"/></div>`;
  }
  list.innerHTML = rows;
}

function addPlanItemRow(){
  const list = document.getElementById("mplan-items-list");
  const nextSeq = list.querySelectorAll("[data-plan-seq]").length + 1;
  const row = document.createElement("div");
  row.className = "fg";
  row.innerHTML = `<label>${planItemLabel(nextSeq)} — تاريخ تقريبي</label><input class="fi" data-plan-seq="${nextSeq}" placeholder="مثال: مارس 2027"/>`;
  list.appendChild(row);
}

async function saveMeetingPlan(){
  if(!meetingPlanRoleGuard()) return;
  const frequency = document.getElementById("mplan-frequency").value;
  const year = document.getElementById("mplan-year").value.trim();
  const periods = [...document.querySelectorAll("#mplan-items-list [data-plan-seq]")].map(inp => inp.value.trim());
  if(periods.length === 0){ alert("أضف اجتماعًا واحدًا على الأقل"); return; }

  let planId = currentMeetingPlan ? currentMeetingPlan.id : null;
  if(planId){
    await sb.from("meeting_plans").update({ frequency, year }).eq("id", planId);
    await sb.from("meeting_plan_items").delete().eq("plan_id", planId).eq("status","مخطط له");
  } else {
    const { data: newPlan, error } = await sb.from("meeting_plans")
      .insert([{ frequency, year, company_id: currentCompanyId }]).select().single();
    if(error){ alert("تعذّر حفظ الخطة: " + error.message); return; }
    planId = newPlan.id;
  }

  const existingConverted = currentMeetingPlanItems.filter(it => it.status === "تحوّل لاجتماع");
  const convertedSeqs = new Set(existingConverted.map(it => it.seq_number));
  const rows = periods.map((planned_period, i) => ({
    plan_id: planId, seq_number: i+1, planned_period, status: "مخطط له", company_id: currentCompanyId
  })).filter(r => !convertedSeqs.has(r.seq_number));
  if(rows.length) await sb.from("meeting_plan_items").insert(rows);

  closeM("m-meeting-plan");
  loadMeetingPlans();
}

function addPlanItemToExistingPlan(){
  if(!meetingPlanRoleGuard() || !currentMeetingPlan) return;
  const nextSeq = currentMeetingPlanItems.length + 1;
  sb.from("meeting_plan_items").insert([{
    plan_id: currentMeetingPlan.id, seq_number: nextSeq, planned_period: "", status:"مخطط له", company_id: currentCompanyId
  }]).then(() => loadMeetingPlans());
}

function openEditPlanItemModal(itemId){
  if(!meetingPlanRoleGuard()) return;
  const it = currentMeetingPlanItems.find(x=>x.id===itemId);
  if(!it) return;
  document.getElementById("mpi-id").value = itemId;
  document.getElementById("mpi-label").textContent = planItemLabel(it.seq_number) + " — تاريخ تقريبي";
  document.getElementById("mpi-period").value = it.planned_period||"";
  openM("m-meeting-plan-item");
}

async function savePlanItemDate(){
  const id = document.getElementById("mpi-id").value;
  const planned_period = document.getElementById("mpi-period").value.trim();
  await sb.from("meeting_plan_items").update({ planned_period }).eq("id", id);
  closeM("m-meeting-plan-item");
  loadMeetingPlans();
}

async function deletePlanItem(itemId){
  if(!meetingPlanRoleGuard()) return;
  if(!await uiConfirm("حذف هذا الاجتماع من الخطة؟")) return;
  await sb.from("meeting_plan_items").delete().eq("id", itemId);
  loadMeetingPlans();
}

async function deleteMeetingPlan(){
  if(!meetingPlanRoleGuard() || !currentMeetingPlan) return;
  if(!await uiConfirm("حذف الخطة السنوية كاملة بكل اجتماعاتها؟")) return;
  await sb.from("meeting_plans").delete().eq("id", currentMeetingPlan.id);
  loadMeetingPlans();
}

let convertingPlanItemId = null;
function convertPlanItemToMeeting(itemId){
  if(!meetingPlanRoleGuard()) return;
  const it = currentMeetingPlanItems.find(x=>x.id===itemId);
  if(!it) return;
  document.getElementById("mt-title").value = planItemLabel(it.seq_number) + " — " + (currentMeetingPlan.frequency) + " " + (currentMeetingPlan.year||"");
  document.getElementById("mt-type").value = "اجتماع مجلس الإدارة الدوري";
  toggleVotingDatesFields();
  newMeetingTopics = [];
  renderNewMeetingTopics();
  convertingPlanItemId = itemId;
  openM("m-meeting");
  alert(`جهّزنا نموذج الاجتماع مسبقًا — حدّد التاريخ والوقت الفعلي بالأسفل ثم احفظ.`);
}

/* Prints a clean PDF-ready page of the whole plan — so a board member can see the full year's
   schedule without opening the app and clicking into every single meeting. */
function downloadMeetingPlanPDF(){
  if(!currentMeetingPlan) return;
  const companyName = document.getElementById("reportCompanyName1")?.textContent
    || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const rows = currentMeetingPlanItems.map(it => `
    <tr><td>${planItemLabel(it.seq_number)}</td><td>${it.planned_period||"—"}</td><td>${it.status||"مخطط له"}</td></tr>
  `).join("");
  const html = `<html><head><meta charset="UTF-8"><title>الخطة السنوية للاجتماعات</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:30px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;border-bottom:2px solid #D4AF37;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #999;padding:10px;font-size:13px}
      th{background:#EAF0F8}
    </style></head><body>
      <h1>الخطة السنوية للاجتماعات</h1>
      <p><b>الشركة:</b> ${companyName}</p>
      <p><b>الدورية:</b> ${currentMeetingPlan.frequency} &nbsp; <b>السنة:</b> ${currentMeetingPlan.year||"—"}</p>
      <table><thead><tr><th>الاجتماع</th><th>الموعد التقريبي</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
  const w = openPrintWindow();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

/* ══════════ BOARD MINUTES (signed via e-signature) ══════════ */
async function loadMinutesTable(meetings, tbodyId, emptyText){
  const tbody = document.getElementById(tbodyId);
  if(!tbody) return;
  if(!meetings || meetings.length===0){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${emptyText}</td></tr>`;
    return;
  }

  const signingIds = meetings.map(m=>m.signing_doc_id).filter(Boolean);
  let signingById = {};
  if(signingIds.length){
    const { data: docs } = await sb.from("signing_documents").select("*").in("id", signingIds);
    (docs||[]).forEach(d => { signingById[d.id] = d; });
  }

  tbody.innerHTML = meetings
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""))
    .map(m => {
      const doc = m.signing_doc_id ? signingById[m.signing_doc_id] : null;
      let statusBadge, actionBtn;
      if(!doc){
        statusBadge = '<span class="badge pending">لم يُربط بعد بمستند توقيع</span>';
        actionBtn = `<button class="btn-xs primary" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>ربط بمحضر توقيع</button>`;
      } else if((doc.signers_done||0) >= (doc.signers_total||1) && doc.signers_total){
        statusBadge = `<span class="badge done">موقّع بالكامل ✍️ (${doc.signers_done}/${doc.signers_total})</span>`;
        actionBtn = `<button class="btn-xs gold" onclick="generateSignedMinutesPDF(${m.id})"><span class="ico-i ico-scroll"></span>عرض المحضر</button>`;
      } else {
        statusBadge = `<span class="badge info">قيد التوقيع (${doc.signers_done||0}/${doc.signers_total||'?'})</span>`;
        actionBtn = `<button class="btn-xs" style="background:var(--offwhite);color:var(--gray3);border:1px solid var(--gray1);border-radius:6px;padding:5px 10px;font-size:11px;cursor:not-allowed" disabled title="ينتظر اكتمال توقيع كل الأعضاء"><span class="ico-i ico-scroll"></span>عرض المحضر</button>
          <button class="btn-xs" style="background:none;border:none;color:var(--gray3);font-size:10px;cursor:pointer" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>تغيير الربط</button>`;
      }
      return `<tr>
        <td>${orgEsc(m.title||"")}</td><td>${m.meeting_type||"—"}</td><td>${m.meeting_date||"—"}</td><td>${m.meeting_time||"—"}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>`;
    }).join("");
}
async function loadBoardMinutes(boardMeetings){
  loadMinutesTable(boardMeetings, "boardMinutesTbody", "لا توجد اجتماعات مجلس بعد");
}
async function loadCommitteeMinutes(committeeMeetings){
  loadMinutesTable(committeeMeetings, "committeeMinutesTbody", "لا توجد اجتماعات لجان بعد");
}

async function linkMeetingToSigningDoc(meetingId){
  const { data: docs, error } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ alert("تعذّر تحميل مستندات التوقيع: " + error.message); return; }
  if(!docs || docs.length===0){ alert('لا توجد مستندات بصفحة "التوقيع الإلكتروني" بعد. ارفع محضر الاجتماع هناك أولًا كمستند للتوقيع.'); return; }

  const options = docs.map((d,i) => `${i+1}. ${orgEsc(d.document_name)} (${d.signers_done||0}/${d.signers_total||'?'} موقّعين)`).join("\n");
  const choice = await uiPrompt("اختر رقم مستند التوقيع المطابق لمحضر هذا الاجتماع:\n\n" + options);
  const idx = Number(choice) - 1;
  if(!choice || isNaN(idx) || idx < 0 || idx >= docs.length) return;

  const { error: updErr } = await sb.from("meetings").update({ signing_doc_id: docs[idx].id }).eq("id", meetingId);
  if(updErr){ alert("تعذّر الربط: " + updErr.message); return; }
  loadMeetingsAll();
}

async function generateSignedMinutesPDF(meetingId){
  const { data: m, error } = await sb.from("meetings").select("*").eq("id", meetingId).single();
  if(error || !m){ alert("تعذّر تحميل بيانات الاجتماع"); return; }
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", m.signing_doc_id).single();

  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مرة أخرى."); return; }
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>محضر موقّع — ${orgEsc(m.title||"")}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:40px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      .meta{font-size:13px;margin:6px 0}
      .stamp{margin-top:30px;padding:16px;background:#EAF8F0;border:2px solid #1E8E5A;border-radius:10px;color:#166A43;font-weight:800;text-align:center}
      .files a{color:#1A3A6B}
    </style></head><body>
    <h1><span class="ico-i ico-scroll"></span>محضر اجتماع موقّع إلكترونيًا</h1>
    <p class="meta"><b>عنوان الاجتماع:</b> ${orgEsc(m.title||"—")}</p>
    <p class="meta"><b>النوع:</b> ${m.meeting_type||"—"}</p>
    <p class="meta"><b>التاريخ:</b> ${m.meeting_date||"—"} ${m.meeting_time?(' — الساعة '+m.meeting_time):''}</p>
    <p class="meta"><b>طريقة الانعقاد:</b> ${m.method||"—"}</p>
    ${m.notes ? `<p class="meta"><b>ملاحظات:</b> ${orgEsc(m.notes)}</p>` : ""}
    <div class="stamp"><span class="ico-i ico-check"></span>تم توقيع هذا المحضر إلكترونيًا من ${doc?.signers_done||0} من ${doc?.signers_total||'?'} من الأعضاء المخوّلين، بتاريخ ${dateNow}.</div>
    ${m.minutes_file_url ? `<p class="files" style="margin-top:20px"><span class="ico-i ico-paperclip"></span><a href="${m.minutes_file_url}" target="_blank">فتح ملف المحضر الأصلي</a></p>` : ""}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}

/* Board-only cards: shows meetings from this calendar year that haven't happened yet
   (today or later), sorted soonest-first. Committee/AGM meetings are intentionally
   excluded here — they have their own dedicated pages. */
/* Labeled version for the card view: shows a title above the buttons, and keeps a
   dedicated download button visible alongside upload/replace once a file exists. */
function fileCellCard(id, field, url, label){
  return `<div style="text-align:center;flex:1">
    <div style="font-size:9.5px;color:var(--gray3);margin-bottom:4px;font-weight:700">${label}</div>
    <div style="display:flex;gap:4px;justify-content:center">
      ${url ? `<a class="btn-xs primary" href="${url}" target="_blank" rel="noopener" title="تحميل"><span class="ico-i ico-inbox"></span>تحميل</a>` : ""}
      <label class="btn-xs" style="cursor:pointer;display:inline-block;${url ? 'background:var(--offwhite);color:var(--dark)' : 'background:var(--primary);color:#fff'}"><span class="ico-i ico-paperclip"></span>${url?'استبدال':'رفع'}<input type="file" style="display:none" onchange="uploadMeetingFile(${id},'${field}',this)"></label>
      ${url ? `<button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 6px;font-size:11px;cursor:pointer" title="حذف الملف" onclick="deleteMeetingFile(${id},'${field}')"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>` : ""}
    </div>
  </div>`;
}

let upcomingMeetingsCache = [];
let allMeetingsCache = [];

/* Spacious, single-column version used inside the detail modal (roomy, not cramped) */
function fileRowWide(id, field, url, label, accept, reloadFn){
  const acceptAttr = accept ? ` accept="${accept}"` : "";
  const reload = reloadFn || "openMeetingDetailModal";
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--gray1)">
    <div style="font-size:13px;font-weight:800;color:var(--dark)">${label}</div>
    <div style="display:flex;gap:8px">
      ${url ? `<a class="btn btn-outline" style="font-size:11px;padding:6px 14px" href="${url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>` : ""}
      <label class="btn ${url?'btn-ghost':'btn-gold'}" style="font-size:11px;padding:6px 14px;cursor:pointer"><span class="ico-i ico-paperclip"></span>${url?'استبدال':'رفع ملف'}<input type="file"${acceptAttr} style="display:none" onchange="uploadMeetingFile(${id},'${field}',this);setTimeout(()=>${reload}(${id}),400)"></label>
      ${url ? `<button class="btn btn-ghost" style="font-size:11px;padding:6px 14px;color:var(--red)" onclick="deleteMeetingFile(${id},'${field}');setTimeout(()=>${reload}(${id}),400)"><span class="ico-i ico-trash"></span>حذف</button>` : ""}
    </div>
  </div>`;
}

let currentAttendanceMeetingId = null;
async function openMeetingDetailModal(id){
  const m = allMeetingsCache.find(x => x.id === id);
  if(!m) return;
  currentAttendanceMeetingId = id;

  document.getElementById("mdView-title").textContent = m.title||"";
  document.getElementById("mdView-headerIcon").textContent = m.committee_id ? "🧩" : (m.meeting_type==="اجتماع طارئ" ? "🔴" : "🤝");
  const timeRange = m.meeting_time ? (" — من الساعة "+m.meeting_time+(m.time_end?(" إلى "+m.time_end):"")) : "";
  document.getElementById("mdView-meta").innerHTML =
    `📅 ${m.meeting_date||"—"}${timeRange} &nbsp;·&nbsp; 📍 ${m.method||"—"}` +
    (m.notes ? `<br><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}` : "");

  startMeetingCountdown(m, "mdView-countdown");
  const linkBox = document.getElementById("mdView-linkBtn");
  if(m.meeting_link){
    linkBox.style.display = "block";
    linkBox.innerHTML = `<a href="${m.meeting_link}" target="_blank" rel="noopener" class="btn btn-gold" style="width:100%;text-align:center;display:block;text-decoration:none"><span class="ico-i ico-link"></span>انضم للاجتماع الآن</a>`;
  } else {
    linkBox.style.display = "none";
  }

  // Tab 2a: agenda + invitation — the agenda is always generated live from the actual agenda
  // items (vote_topics), never a separately-uploaded file that could go missing or get out of
  // sync if someone deletes it; "عرض" always reflects the current, real agenda.
  document.getElementById("mdView-agendaInviteFiles").innerHTML =
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:13px;font-weight:800;color:var(--dark)"><span class="ico-i ico-document"></span>جدول الأعمال</div>
      <button class="btn-xs primary" onclick="viewMeetingAgenda(${m.id})"><span class="ico-i ico-eye"></span>عرض</button>
    </div>` +
    fileRowWide(m.id,'invitation_file_url',m.invitation_file_url,'📨 الدعوة');

  // Tab 2b: minutes — shown as "المحضر النهائي" only once fully signed via the same
  // signing_documents workflow used across the platform; otherwise shows exactly where
  // it stands (not linked yet / awaiting signatures), never a bare unsigned file.
  await renderFinalMinutesBox(m);

  // Tab 2c: reminders, calendar, sharing
  document.getElementById("mdView-utilityActions").innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)"><span class="ico-i ico-mail"></span>إرسال تذكير بريدي لفريق الشركة</div>
      <button class="btn" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);font-size:11px;padding:6px 14px" onclick="sendMeetingReminderEmails(${m.id})"><span class="ico-i ico-mail"></span>إرسال</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)">📆 إضافة للتقويم الشخصي</div>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'google',false)">Google</button>
        <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'outlook',false)">Outlook</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)"><span class="ico-i ico-phone"></span>مشاركة عبر واتساب</div>
      <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="shareMeetingViaWhatsApp(${m.id},false)"><span class="ico-i ico-phone"></span>مشاركة</button>
    </div>`;

  loadMeetingSupportingDocs(id);
  loadMeetingAttendanceSection(id);
  loadMeetingTopics(id);
  loadMeetingDecisionsGrid(id);
  switchMeetingDetailTab('support');
  openM("m-meeting-view");

  autoGenerateMinutesIfDue(id).then(generated => {
    // Only refresh the modal if minutes were actually just created — never loop otherwise.
    if(generated && currentAttendanceMeetingId === id) openMeetingDetailModal(id);
  });
}

/* "المحضر النهائي" — reuses the exact same signing_documents mechanism the rest of the
   platform already uses (link a meeting to a signing document, collect every signature,
   only then is it final). Nothing calling itself "final" here is ever an unsigned draft. */
async function renderFinalMinutesBox(m){
  const box = document.getElementById("mdView-minutesFile");
  if(!box) return;
  if(!m.signing_doc_id){
    box.innerHTML = `<p class="modal-section-hint" style="margin-bottom:10px">المحضر يتولّد تلقائيًا بعد انتهاء الاجتماع، أو ولّده يدويًا الآن.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="generateMeetingMinutesDoc(${m.id})"><span class="ico-i ico-edit"></span>تحميل مسودة الآن</button>
        <button class="btn btn-outline" style="font-size:11px;padding:8px 16px" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>ربط بمستند توقيع آخر يدويًا</button>
      </div>`;
    return;
  }
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", m.signing_doc_id).single();
  if(!doc){ box.innerHTML = `<p class="modal-section-hint">تعذّر تحميل مستند التوقيع المرتبط.</p>`; return; }
  const fullySigned = (doc.signers_done||0) >= (doc.signers_total||1) && doc.signers_total;
  if(fullySigned){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-weight:800;color:var(--green);font-size:12.5px"><span class="ico-i ico-check"></span>المحضر النهائي — موقّع بالكامل (${doc.signers_done}/${doc.signers_total})</div></div>
        <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="generateSignedMinutesPDF(${m.id})"><span class="ico-i ico-scroll"></span>عرض المحضر النهائي</button>
      </div>`;
  } else {
    box.innerHTML = `<div style="background:var(--offwhite);border-radius:10px;padding:12px">
        <div style="font-weight:700;color:var(--dark);font-size:12px;margin-bottom:8px">⏳ قيد التوقيع (${doc.signers_done||0}/${doc.signers_total||'?'}) — لن يظهر كمحضر نهائي إلا بعد اكتمال كل التوقيعات.</div>
        <button class="btn-xs" style="background:none;border:none;color:var(--primary);font-size:11px;cursor:pointer;text-decoration:underline" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>تغيير الربط</button>
      </div>`;
  }
}

/* ── Supporting documents tab (same pattern/table already used for AGM, own container id) ── */
async function loadMeetingSupportingDocs(meetingId){
  const box = document.getElementById("mdView-supdocs");
  if(!box) return;
  const { data, error } = await sb.from("meeting_supporting_docs").select("*").eq("meeting_id", meetingId).order("id",{ascending:false});
  if(error){ box.innerHTML = '<div style="font-size:11px;color:var(--red)">تعذّر التحميل</div>'; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد وثائق داعمة مرفوعة بعد.</div>'; return; }
  box.innerHTML = data.map(d => `<div class="sh-doc-row">
      <div class="sh-doc-name"><span class="ico-i ico-paperclip"></span>${orgEsc(d.document_name||"وثيقة")}</div>
      <div style="display:flex;gap:6px">
        <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
        <a class="btn-xs primary" href="${d.file_url}" download><span class="ico-i ico-inbox"></span>تحميل</a>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none" onclick="deleteMeetingSupportingDoc(${d.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
      </div>
    </div>`).join("");
}
async function uploadMeetingSupportingDoc(inputEl){
  const meetingId = currentAttendanceMeetingId;
  if(!meetingId || !inputEl.files || !inputEl.files[0]) return;
  const file_url = await uploadFile(inputEl, "meeting-docs");
  if(!file_url) return;
  const document_name = inputEl.files[0].name;
  const { error } = await sb.from("meeting_supporting_docs").insert([{ meeting_id: meetingId, document_name, file_url, company_id: currentCompanyId }]);
  if(error){ alert("تعذّر رفع الوثيقة: " + error.message); return; }
  inputEl.value = "";
  loadMeetingSupportingDocs(meetingId);
}
async function deleteMeetingSupportingDoc(docId, meetingId){
  if(!await uiConfirm("حذف هذه الوثيقة؟")) return;
  await sb.from("meeting_supporting_docs").delete().eq("id", docId);
  loadMeetingSupportingDocs(meetingId);
}

/* Agenda items (بنود جدول الأعمال) for board/committee meetings — the same vote_topics
   table AGM meetings already use, and the exact table generateMeetingMinutesDoc() already
   reads from. Without this section the minutes generator always fell back to the free-text
   "notes" field because nothing ever populated vote_topics for non-AGM meetings. Writing
   agenda items is limited to سكرتير المجلس / مدير النظام, same as decisions. */
async function loadMeetingTopics(meetingId){
  const wrap = document.getElementById("mdView-topicsWrap");
  const box = document.getElementById("mdView-topics");
  const addRow = document.getElementById("mdView-topicsAddRow");
  if(!box) return;

  const { data: meetingRow } = await sb.from("meetings").select("committee_id").eq("id", meetingId).single();
  const committeeId = meetingRow ? meetingRow.committee_id : null;
  const role = getCurrentRole();
  const isFullAccess = isFullAccessRole(role);
  if(committeeId && !isFullAccess){
    const eligibleVoters = await getEligibleDecisionVoters(meetingId);
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData?.user?.email;
    const iAmEligible = eligibleVoters.some(v => v.claimed_by_email === myEmail);
    if(!iAmEligible){ if(wrap) wrap.style.display = "none"; return; }
  }
  if(wrap) wrap.style.display = "block";

  const canWrite = role === "سكرتير المجلس" || role === "مدير النظام";
  if(addRow) addRow.style.display = canWrite ? "flex" : "none";

  const { data, error } = await sb.from("vote_topics").select("*").eq("meeting_id", meetingId)
    .order("sort_order",{ascending:true}).order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:11px">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length === 0){
    box.innerHTML = '<div style="font-size:11px;color:var(--gray3);padding:6px 0">لا توجد بنود مضافة بعد.</div>';
    return;
  }
  box.innerHTML = data.map((t,i) => `<div class="topic-row">
      <div class="topic-num">${i+1}</div>
      <div class="topic-text">${orgEsc(t.topic_text)}</div>
      ${canWrite ? `<button class="topic-del" onclick="deleteMeetingTopic(${t.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>` : ""}
    </div>`).join("");
}

async function addMeetingTopic(){
  const role = getCurrentRole();
  if(role !== "سكرتير المجلس" && role !== "مدير النظام"){
    alert("إضافة بنود جدول الأعمال مقصورة على سكرتير المجلس أو مدير النظام.");
    return;
  }
  const input = document.getElementById("mdView-newtopic");
  const topic_text = input.value.trim();
  if(!topic_text || !currentAttendanceMeetingId) return;
  const { data: existing } = await sb.from("vote_topics").select("id").eq("meeting_id", currentAttendanceMeetingId);
  const { error } = await sb.from("vote_topics").insert([{
    meeting_id: currentAttendanceMeetingId, topic_text, sort_order: (existing||[]).length, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إضافة البند: " + error.message); return; }
  // Every real agenda item automatically becomes a decision members can vote on — no
  // separate re-typing step needed. (The two fixed opening/closing items never go through
  // this function, so they're never mistakenly turned into votable "decisions".)
  await sb.from("board_decisions").insert([{ meeting_id: currentAttendanceMeetingId, decision_text: topic_text, company_id: currentCompanyId }]);
  input.value = "";
  loadMeetingTopics(currentAttendanceMeetingId);
  loadMeetingDecisionsGrid(currentAttendanceMeetingId);
}

async function deleteMeetingTopic(topicId, meetingId){
  if(!await uiConfirm("حذف هذا البند نهائيًا؟")) return;
  const { error } = await sb.from("vote_topics").delete().eq("id", topicId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingTopics(meetingId);
}

/* ══════════ BOARD/COMMITTEE DECISION VOTING ══════════
   Board members vote on board-meeting decisions; committee meetings restrict voters to that
   committee's own members — the same eligible-voter logic already used for attendance/quorum,
   reused here so a board member can't accidentally vote on a committee decision they're not on. */
async function getEligibleDecisionVoters(meetingId){
  const { data: meetingRow } = await sb.from("meetings").select("committee_id").eq("id", meetingId).single();
  const committeeId = meetingRow ? meetingRow.committee_id : null;
  if(committeeId){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", committeeId);
    const memberIds = (links||[]).map(l => l.member_id);
    const { data } = memberIds.length ? await sb.from("board_members").select("*").in("id", memberIds) : { data: [] };
    return data || [];
  }
  const { data } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId);
  return data || [];
}

/* ══════════ DECISIONS & VOTING — compact grid, scoped to ONE meeting at a time ══════════
   Lives inside "🗳️ قرارات والتصويت" tab of that meeting's own detail page. Committee
   decisions stay private to that committee's own members (plus مدير النظام / رئيس مجلس /
   سكرتير المجلس, who see everything). Writing new decisions is limited to سكرتير المجلس /
   مدير النظام, same as always — everyone eligible can still vote once one is posted. */
async function loadMeetingDecisionsGrid(meetingId){
  const wrap = document.getElementById("mdView-decisionsWrap");
  const grid = document.getElementById("mdView-decisionsGrid");
  const addBtn = document.getElementById("mdView-addDecisionBtn");
  if(!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--gray3);font-size:11px;padding:10px">جارِ التحميل...</div>';

  const { data: meetingRow } = await sb.from("meetings").select("committee_id").eq("id", meetingId).single();
  const committeeId = meetingRow ? meetingRow.committee_id : null;
  const role = getCurrentRole();
  const isFullAccess = isFullAccessRole(role);
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;

  const eligibleVoters = await getEligibleDecisionVoters(meetingId);
  const iAmEligible = eligibleVoters.some(v => v.claimed_by_email === myEmail);

  if(committeeId && !isFullAccess && !iAmEligible){
    if(wrap) wrap.style.display = "none";
    return;
  }
  if(wrap) wrap.style.display = "block";

  const canWrite = role === "سكرتير المجلس" || role === "مدير النظام";
  if(addBtn) addBtn.style.display = canWrite ? "inline-block" : "none";
  const syncBtn = document.getElementById("mdView-syncDecisionsBtn");
  if(syncBtn) syncBtn.style.display = canWrite ? "inline-block" : "none";
  const planBtn = document.getElementById("mdView-addPlanDiscussionBtn");
  if(planBtn) planBtn.style.display = (canWrite && !committeeId && currentMeetingPlan) ? "inline-block" : "none";

  const { data: decisions } = await sb.from("board_decisions").select("*").eq("meeting_id", meetingId).order("id",{ascending:true});
  if(!decisions || decisions.length === 0){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--gray3);font-size:11.5px;padding:14px">لا توجد قرارات مطروحة بعد.</div>';
    return;
  }

  const decisionIds = decisions.map(d=>d.id);
  const { data: allVotes } = await sb.from("board_decision_votes").select("*").in("decision_id", decisionIds);

  grid.innerHTML = decisions.map(d => {
    const votes = (allVotes||[]).filter(v=>v.decision_id===d.id);
    const yes = votes.filter(v=>v.vote==="موافق").length, no = votes.filter(v=>v.vote==="معارض").length, abs = votes.filter(v=>v.vote==="ممتنع").length;
    const myVote = votes.find(v=>v.voter_email===myEmail);
    return `<div class="decision-card">
      <div class="decision-text">${orgEsc(d.decision_text)}</div>
      <div class="decision-tally"><span class="yes"><span class="ico-i ico-check"></span>${yes}</span><span class="no"><span class="ico-i ico-xcircle"></span>${no}</span><span class="abs">➖ ${abs}</span></div>
      ${myVote
        ? `<div class="decision-myvote">صوّتك: ${myVote.vote} <button onclick="changeMeetingDecisionVote(${d.id})" style="background:none;border:none;color:var(--primary);text-decoration:underline;cursor:pointer;font-size:10px;margin-right:4px">تغيير</button></div>`
        : iAmEligible
          ? `<div class="decision-actions">
              <button style="background:#E8F8EF;color:var(--green)" onclick="castMeetingDecisionVote(${d.id},'موافق')">موافق</button>
              <button style="background:#FDE8E8;color:var(--red)" onclick="castMeetingDecisionVote(${d.id},'معارض')">معارض</button>
              <button style="background:#FEF3E2;color:var(--orange)" onclick="castMeetingDecisionVote(${d.id},'ممتنع')">ممتنع</button>
            </div>`
          : '<div class="decision-ineligible">التصويت مقصور على الأعضاء المؤهّلين. لو تعتقد إنك مؤهّل، تأكد إن حسابك مربوط بسجل "أعضاء مجلس الإدارة".</div>'
      }
    </div>`;
  }).join("");
}

/* Backfills decisions for meetings created before agenda items started auto-converting into
   votable decisions — matches each topic's exact text against existing decision_text values
   and only inserts the ones missing, so it's always safe to click more than once. */
async function syncTopicsToDecisions(){
  const meetingId = currentAttendanceMeetingId;
  if(!meetingId) return;
  const role = getCurrentRole();
  if(role !== "سكرتير المجلس" && role !== "مدير النظام"){
    alert("هذا الإجراء مقصور على سكرتير المجلس أو مدير النظام.");
    return;
  }
  const [{ data: topics }, { data: decisions }] = await Promise.all([
    sb.from("vote_topics").select("topic_text").eq("meeting_id", meetingId),
    sb.from("board_decisions").select("decision_text").eq("meeting_id", meetingId)
  ]);
  const existingTexts = new Set((decisions||[]).map(d => d.decision_text));
  const missing = (topics||[])
    .map(t => t.topic_text)
    .filter(text => text !== AGENDA_OPENING_ITEM && text !== AGENDA_CLOSING_ITEM)
    .filter(text => !existingTexts.has(text));
  if(missing.length === 0){
    alert("كل البنود مطابقة لقرارات موجودة بالفعل — ما فيه شيء ناقص.");
    return;
  }
  const rows = missing.map(decision_text => ({ meeting_id: meetingId, decision_text, company_id: currentCompanyId }));
  const { error } = await sb.from("board_decisions").insert(rows);
  if(error){ alert("تعذّرت المزامنة: " + error.message); return; }
  alert(`تمت إضافة ${missing.length} قرار من البنود الناقصة ✅`);
  loadMeetingDecisionsGrid(meetingId);
}

async function changeMeetingDecisionVote(decisionId){
  if(!await uiConfirm("حذف تصويتك الحالي على هذا القرار عشان تصوّت من جديد؟")) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;
  await sb.from("board_decision_votes").delete().eq("decision_id", decisionId).eq("voter_email", myEmail);
  loadMeetingDecisionsGrid(currentAttendanceMeetingId);
}

async function castMeetingDecisionVote(decisionId, vote){
  let justification = null;
  if(vote === "ممتنع"){
    justification = await uiPrompt("أنت تختار «ممتنع» — الرجاء كتابة سبب الامتناع (يُسجَّل بسجلك، ويُحتسب «امتناع بدون مبرر» إذا تُرك فارغًا):");
    if(justification === null) return; // cancelled
    justification = justification.trim() || null;
  }
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;
  const { error } = await sb.from("board_decision_votes").insert([{
    decision_id: decisionId, voter_email: myEmail, voter_name: currentUserProfile?currentUserProfile.full_name:myEmail, vote, justification
  }]);
  if(error){ alert("تعذّر تسجيل صوتك: " + error.message); return; }
  loadMeetingDecisionsGrid(currentAttendanceMeetingId);
}

/* One click adds "مناقشة واعتماد الخطة السنوية للاجتماعات" as a votable decision, tagged
   with related_plan_id so it's traceable back to the active plan — instead of the secretary
   having to type this out by hand every time it comes up on a board agenda. */
async function addPlanDiscussionDecision(){
  if(!meetingPlanRoleGuard() || !currentAttendanceMeetingId || !currentMeetingPlan) return;
  const decision_text = `مناقشة واعتماد الخطة السنوية للاجتماعات (${currentMeetingPlan.frequency} — ${currentMeetingPlan.year||""})`;
  const { error } = await sb.from("board_decisions").insert([{
    meeting_id: currentAttendanceMeetingId, decision_text, related_plan_id: currentMeetingPlan.id, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  loadMeetingDecisionsGrid(currentAttendanceMeetingId);
}

function openAddDecisionInline(){
  const role = getCurrentRole();
  if(role !== "سكرتير المجلس" && role !== "مدير النظام"){
    alert("كتابة قرارات جديدة مقصورة على سكرتير المجلس أو مدير النظام.");
    return;
  }
  const form = document.getElementById("mdView-decisionAddForm");
  if(form) form.style.display = form.style.display === "none" ? "block" : "none";
}

async function submitInlineDecision(){
  const meetingId = currentAttendanceMeetingId;
  const text = document.getElementById("mdView-newdecision-text").value.trim();
  if(!meetingId){ return; }
  if(!text){ alert("الرجاء كتابة نص القرار"); return; }
  const { error } = await sb.from("board_decisions").insert([{ meeting_id: meetingId, decision_text: text, company_id: currentCompanyId }]);
  if(error){ alert("تعذّر إضافة القرار: " + error.message); return; }
  document.getElementById("mdView-newdecision-text").value = "";
  document.getElementById("mdView-decisionAddForm").style.display = "none";
  loadMeetingDecisionsGrid(meetingId);
}

const ATTEND_STATUSES = ["حاضر","غائب","اعتذر"];
async function loadMeetingAttendanceSection(meetingId){
  const box = document.getElementById("mdView-attendance");
  if(!box) return;
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11px;padding:8px">جارِ التحميل...</div>';

  const { data: meetingRow } = await sb.from("meetings").select("committee_id").eq("id", meetingId).single();
  const committeeId = meetingRow ? meetingRow.committee_id : null;

  let members;
  if(committeeId){
    // Committee meeting: quorum only counts that specific committee's own members
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", committeeId);
    const memberIds = (links||[]).map(l => l.member_id);
    if(memberIds.length===0){
      box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11px;padding:8px">هذه اللجنة ما لها أعضاء محددون بعد. حدّدهم من صفحة "اللجان المتخصصة" أولًا.</div>';
      return;
    }
    const { data } = await sb.from("board_members").select("*").in("id", memberIds).order("id",{ascending:true});
    members = data;
  } else {
    const { data } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
    members = data;
  }

  const { data: existing } = await sb.from("meeting_attendance").select("*").eq("meeting_id", meetingId);
  if(!members || members.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11px;padding:8px">لا يوجد أعضاء مسجّلون بصفحة "أعضاء مجلس الإدارة" بعد.</div>';
    return;
  }
  const byMember = {};
  (existing||[]).forEach(a => { byMember[a.member_id] = a.status; });

  box.innerHTML = members.map(m => {
    const current = byMember[m.id] || "";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray1)">
      <span style="font-size:12px;font-weight:600">${orgEsc(m.name||"")}</span>
      <select id="att-${m.id}" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--gray1)">
        <option value="" ${!current?"selected":""}>—</option>
        ${ATTEND_STATUSES.map(s => `<option value="${s}" ${current===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>`;
  }).join("");

  renderBoardQuorumWidget(members, existing||[]);
}

/* Board meeting quorum is headcount-based (present members ÷ total members), unlike AGM
   quorum which is share-based — per the majority rule in the Companies Law / bylaws. */
async function renderBoardQuorumWidget(members, attendanceRecords){
  const box = document.getElementById("mdView-quorum");
  if(!box) return;

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const threshold = Number(company?.board_quorum_percentage ?? 50);
  const presentCount = (attendanceRecords||[]).filter(a => a.status === "حاضر").length;
  const totalCount = members.length;
  const pctPresent = totalCount ? (presentCount/totalCount)*100 : 0;
  const met = pctPresent >= threshold;
  const anyRecorded = attendanceRecords && attendanceRecords.length > 0;

  box.innerHTML = `<div style="padding:10px;border-radius:8px;background:${anyRecorded ? (met?'#E8F8EF':'#FDE8E8') : 'var(--offwhite)'};font-size:12px;font-weight:700;color:${anyRecorded ? (met?'var(--green)':'var(--red)') : 'var(--gray3)'}">
    ${anyRecorded ? (met ? '✅' : '❌') : '⏳'} إجمالي الحضور: ${presentCount} من ${totalCount} عضوًا (${pctPresent.toFixed(0)}%) — النصاب المطلوب: ${threshold}% (${Math.ceil(totalCount*threshold/100)} من ${totalCount}) ${anyRecorded ? (met ? '— تحقق النصاب' : '— لم يتحقق النصاب') : '— لسا ما تسجّل حضور'}
  </div>`;
}

async function saveMeetingAttendance(){
  const meetingId = currentAttendanceMeetingId;
  if(!meetingId) return;
  const { data: members } = await sb.from("board_members").select("id").eq("company_id", currentCompanyId);
  if(!members) return;

  for(const m of members){
    const sel = document.getElementById("att-"+m.id);
    if(!sel || !sel.value) continue;
    await sb.from("meeting_attendance").delete().eq("meeting_id", meetingId).eq("member_id", m.id);
    await sb.from("meeting_attendance").insert([{ meeting_id: meetingId, member_id: m.id, status: sel.value, company_id: currentCompanyId }]);
  }
  alert("تم حفظ الحضور ✅");
  loadMeetingAttendanceSection(meetingId);
}

/* Real per-member attendance % — reused by both performance evaluation and governance reports */
async function computeAttendancePercentages(){
  const [{ data: members }, { data: attendance }] = await Promise.all([
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("meeting_attendance").select("*").eq("company_id", currentCompanyId)
  ]);
  const byMember = {};
  (members||[]).forEach(m => { byMember[m.id] = { name: m.name, position: m.position, total: 0, present: 0 }; });
  (attendance||[]).forEach(a => {
    if(!byMember[a.member_id]) return;
    byMember[a.member_id].total += 1;
    if(a.status === "حاضر") byMember[a.member_id].present += 1;
  });
  return Object.values(byMember).map(m => ({
    ...m,
    pct: m.total ? Math.round((m.present/m.total)*100) : null
  }));
}

/* ══════════ UNIFIED BOARD/COMMITTEE MEETING CARDS: current / upcoming / past ══════════
   Same rendering used for both صفحة المجلس and صفحة اللجان (scope='board'|'committee').
   Pending meeting_requests (not yet confirmed) are folded directly into the "upcoming" grid
   as a visually distinct card — no separate "طلبات تحتاج رأيك" section anymore. */
function meetingCardHTML(m){
  const isEmergency = m.meeting_type === "اجتماع طارئ";
  const cls = m.committee_id ? "q2" : (isEmergency ? "em" : "q1");
  const typeLabel = isEmergency ? "🔴 طارئ · عاجل" : (m.meeting_type||"");
  return `<div class="mc ${cls}" style="cursor:pointer" onclick="openMeetingDetailModal(${m.id})">
    <div class="mc-bar"></div>
    <div class="mc-type">${typeLabel}</div>
    <div class="mc-title">${orgEsc(m.title||"")}</div>
    <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}${m.meeting_time ? (" — من "+m.meeting_time+(m.time_end?(" إلى "+m.time_end):"")) : ""}</div>
    <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
    ${m.notes ? `<div class="mc-detail"><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}</div>` : ""}
    <div class="mc-actions">
      <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openMeetingDetailModal(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
    </div>
  </div>`;
}

function meetingRequestCardHTML(r){
  let deadlineDetail = "";
  if(r.response_deadline){
    const isOver = new Date(r.response_deadline) < new Date();
    deadlineDetail = `<div class="mc-detail" style="color:${isOver?'var(--red)':'var(--gold)'};font-weight:700">${isOver ? '⌛ انتهت مهلة الرد' : '⏰ آخر موعد للرد: '+new Date(r.response_deadline).toLocaleDateString('ar-SA-u-ca-gregory')}</div>`;
  }
  return `<div class="mc" style="cursor:pointer;border:1.5px dashed var(--gold2);background:linear-gradient(145deg,#FFFBF0,#FFF6E0)" onclick="openMeetingRequestPopup(${r.id})">
    <div class="mc-bar" style="background:linear-gradient(90deg,var(--gold2),var(--gold3))"></div>
    <div class="mc-type" style="color:var(--gold)">⏳ بانتظار موافقة الأعضاء</div>
    <div class="mc-title">${orgEsc(r.title||"")}</div>
    <div class="mc-detail"><span class="ico-i ico-calendar"></span>${r.proposed_date||"—"}${r.proposed_time ? (" — من "+r.proposed_time+(r.proposed_time_end?(" إلى "+r.proposed_time_end):"")) : ""}</div>
    <div class="mc-detail"><span class="ico-i ico-pin"></span>${r.method||"—"}</div>
    ${deadlineDetail}
    <div class="mc-actions">
      <button class="btn-xs gold" style="width:100%" onclick="event.stopPropagation();openMeetingRequestPopup(${r.id})"><span class="ico-i ico-ballot"></span>الرد على الطلب</button>
    </div>
  </div>`;
}

function pastMeetingCardHTML(m){
  return `<div class="mc" style="cursor:pointer" onclick="openMeetingDetailModal(${m.id})">
    <div class="mc-bar" style="background:linear-gradient(90deg,var(--gray2),var(--gray3))"></div>
    <div class="mc-type">${m.meeting_type||""} · منتهٍ</div>
    <div class="mc-title">${orgEsc(m.title||"")}</div>
    <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}</div>
    <div class="mc-actions">
      <button class="btn-xs" style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="event.stopPropagation();openMeetingDetailModal(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
    </div>
  </div>`;
}

async function renderMeetingCardsGroup(meetings, scope){
  const currentBoxId = scope === "committee" ? "currentCommitteeMeetCard" : "currentMeetCard";
  const upcomingBoxId = scope === "committee" ? "upcomingCommitteeCards" : "upcomingMeetCards";
  const pastBoxId = scope === "committee" ? "pastCommitteeMeetCards" : "pastMeetCards";
  const currentBox = document.getElementById(currentBoxId);
  const upcomingBox = document.getElementById(upcomingBoxId);
  const pastBox = document.getElementById(pastBoxId);
  const noun = scope === "committee" ? "لجان" : "مجلس";

  const todayStr = new Date().toISOString().slice(0,10);
  const upcoming = meetings.filter(m => m.meeting_date && m.meeting_date >= todayStr)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""));
  const past = meetings.filter(m => !m.meeting_date || m.meeting_date < todayStr)
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""));

  const current = upcoming[0] || null;
  const others = upcoming.slice(1);
  upcomingMeetingsCache = upcoming;

  let requestCards = [];
  if(scope === "board"){
    const { data: reqs } = await sb.from("meeting_requests").select("*")
      .eq("company_id", currentCompanyId).eq("status","قيد الموافقة").order("id",{ascending:false});
    requestCards = reqs || [];
  }

  if(currentBox){
    currentBox.innerHTML = current
      ? meetingCardHTML(current)
      : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px;grid-column:1/-1">لا يوجد اجتماع ${noun} قادم مؤكد حاليًا${requestCards.length?' — تحقق من الطلبات بانتظار الموافقة أدناه.':'.'}</div>`;
  }

  if(upcomingBox){
    const cards = [...others.map(meetingCardHTML), ...requestCards.map(meetingRequestCardHTML)];
    upcomingBox.innerHTML = cards.length
      ? cards.join("")
      : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px;grid-column:1/-1">لا توجد اجتماعات ${noun} مجدولة أخرى حاليًا.</div>`;
  }

  if(pastBox){
    pastBox.innerHTML = past.length
      ? past.map(pastMeetingCardHTML).join("")
      : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px;grid-column:1/-1">لا يوجد سجل اجتماعات ${noun} سابقة بعد.</div>`;
  }
}

/* ══════════ AGM (الجمعية العامة) — cards, detail modal, per-meeting voting topics ══════════ */
let agmMeetingsCache = [];
let currentAGMModalMeetingId = null;
let currentVotingMeetingId = null;

function renderAGMSection(agmMeetings){
  agmMeetingsCache = agmMeetings;

  const isShareholder = getCurrentRole() === 'مساهم';
  const adminBlock = document.getElementById("agmAdminBlock");
  const shBlock = document.getElementById("agmShareholderBlock");
  if(adminBlock) adminBlock.style.display = isShareholder ? "none" : "block";
  if(shBlock) shBlock.style.display = isShareholder ? "block" : "none";
  if(isShareholder){
    loadShareholderAGMView(agmMeetings);
    return;
  }

  loadDocumentTemplates();
  const todayStr = new Date().toISOString().slice(0,10);
  const currentYear = new Date().getFullYear();

  const upcoming = agmMeetings
    .filter(m => m.meeting_date && m.meeting_date >= todayStr && new Date(m.meeting_date).getFullYear() === currentYear)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""));
  const past = agmMeetings
    .filter(m => !m.meeting_date || m.meeting_date < todayStr)
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""));

  renderUpcomingAGMCards(upcoming);
  renderPastAGMTable(past);
}

/* ── Shareholder-facing AGM view ──────────────────────────────────────────
   Deliberately minimal: only the CURRENT assembly's signed invitation and
   supporting attachments, plus plain read-only lists of what's upcoming and
   what's already happened. No admin tools (create/edit/upload/tadawul/etc.)
   are ever built into this branch. */
async function loadShareholderAGMView(agmMeetings){
  const todayStr = new Date().toISOString().slice(0,10);
  const currentYear = new Date().getFullYear();

  const upcoming = (agmMeetings||[])
    .filter(m => m.meeting_date && m.meeting_date >= todayStr && new Date(m.meeting_date).getFullYear() === currentYear)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""));
  const past = (agmMeetings||[])
    .filter(m => !m.meeting_date || m.meeting_date < todayStr)
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""));

  const current = upcoming[0] || null;
  const others = upcoming.slice(1);

  const curBox = document.getElementById("shCurrentAGM");
  if(curBox){
    curBox.innerHTML = current
      ? `<div class="mc q1" style="cursor:pointer" onclick="openShareholderAGMPopup(${current.id})">
          <div class="mc-bar"></div>
          <div class="mc-type">جمعية عامة ${current.agm_type||"عادية"} · الحالية</div>
          <div class="mc-title">${orgEsc(current.title||"الجمعية العامة")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${current.meeting_date||"—"}${current.meeting_time?(" — الساعة "+current.meeting_time):""}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${current.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openShareholderAGMPopup(${current.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`
      : '<div class="sh-empty" style="grid-column:1/-1"><div class="sh-empty-icon"><span class="ico ico-handshake" style="width:16px;height:16px"></span></div><div class="sh-empty-text">لا توجد جمعية عامة قادمة حاليًا.</div></div>';
  }

  const upBox = document.getElementById("shUpcomingAGMCards");
  if(upBox){
    upBox.innerHTML = others.length === 0
      ? '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px;grid-column:1/-1">لا توجد جمعيات عامة أخرى قادمة حاليًا.</div>'
      : others.map(m => `<div class="mc q1" style="cursor:pointer" onclick="openShareholderAGMPopup(${m.id})">
          <div class="mc-bar"></div>
          <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"}</div>
          <div class="mc-title">${orgEsc(m.title||"")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}${m.meeting_time?(" — الساعة "+m.meeting_time):""}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openShareholderAGMPopup(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`).join("");
  }

  const pastBox = document.getElementById("shPastAGMList");
  if(pastBox){
    pastBox.innerHTML = past.length === 0
      ? '<div class="sh-empty" style="grid-column:1/-1"><div class="sh-empty-icon"><span class="ico ico-archive" style="width:16px;height:16px"></span></div><div class="sh-empty-text">لا يوجد سجل جمعيات سابقة بعد.</div></div>'
      : past.map(m => `<div class="mc" style="cursor:pointer" onclick="openShareholderAGMPopup(${m.id})">
          <div class="mc-bar" style="background:linear-gradient(90deg,var(--gray2),var(--gray3))"></div>
          <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"} · منتهية</div>
          <div class="mc-title">${orgEsc(m.title||"الجمعية العامة")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs" style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="event.stopPropagation();openShareholderAGMPopup(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`).join("");
  }
}

/* Full detail view for one AGM, opened in the "m-sh-agm-view" popup — used for the current,
   other-upcoming, and past meetings alike, so a shareholder always gets the exact same
   complete picture: type, date/time, status, meeting link (if live), calendar buttons, the
   signed invitation, and every supporting document — each offered as either VIEW (opens in
   a new tab, no forced download) or DOWNLOAD (saves the file), never just one or the other. */
async function shareholderAGMDetailHTML(m){
  const { invitationDoc, invitationFullySigned, invitationProgress, invitationUnpublished, supDocs } = await fetchShareholderAGMDocs(m.id);

  const todayStr = new Date().toISOString().slice(0,10);
  let statusBadge;
  if(!m.meeting_date || m.meeting_date < todayStr) statusBadge = '<span class="badge done">منتهية</span>';
  else if(m.meeting_date === todayStr) statusBadge = '<span class="badge info">جارية اليوم</span>';
  else statusBadge = '<span class="badge pending">قادمة</span>';

  const linkHTML = (m.meeting_link && m.meeting_date >= todayStr)
    ? `<a href="${m.meeting_link}" target="_blank" rel="noopener" class="btn btn-gold" style="width:100%;text-align:center;display:block;text-decoration:none;margin-bottom:14px"><span class="ico-i ico-link"></span>انضم للاجتماع الآن</a>`
    : "";

  const calendarHTML = m.meeting_date ? `<div style="display:flex;gap:6px;margin-bottom:16px">
      <button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'google',true)"><span class="ico-i ico-calendar"></span>Google Calendar</button>
      <button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'outlook',true)"><span class="ico-i ico-calendar"></span>Outlook</button>
    </div>` : "";

  const invitationHTML = (invitationDoc && invitationFullySigned)
    ? `<div class="sh-doc-row">
        <div class="sh-doc-name"><span class="ico-i ico-send"></span>دعوة الجمعية (موقّعة)</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none;border-radius:6px;padding:5px 12px;font-size:10.5px;cursor:pointer" href="${invitationDoc.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
          <a class="btn-xs primary" href="${invitationDoc.file_url}" download style="border-radius:6px;padding:5px 12px;font-size:10.5px"><span class="ico-i ico-inbox"></span>تحميل</a>
        </div>
      </div>`
    : `<div style="font-size:12px;color:var(--gray3);background:var(--offwhite);border-radius:8px;padding:10px 12px"><span class="ico-i ico-send"></span>دعوة الجمعية لم تُنشر بعد — ${invitationUnpublished ? 'ستظهر هنا فور إرسالها من إدارة الشركة.' : (invitationProgress ? `وُقّع ${invitationProgress.signed} من ${invitationProgress.total} توقيعات مطلوبة.` : 'لم تُنشأ الدعوة بعد.')} تابعونا قريبًا.</div>`;

  const supHTML = (supDocs && supDocs.length)
    ? supDocs.map(d => `<div class="sh-doc-row">
        <div class="sh-doc-name"><span class="ico-i ico-paperclip"></span>${orgEsc(d.document_name||"وثيقة")}</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none;border-radius:6px;padding:5px 12px;font-size:10.5px;cursor:pointer" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
          <a class="btn-xs primary" href="${d.file_url}" download style="border-radius:6px;padding:5px 12px;font-size:10.5px"><span class="ico-i ico-inbox"></span>تحميل</a>
        </div>
      </div>`).join("")
    : '<div style="font-size:11.5px;color:var(--gray3);padding:6px 0">لا توجد مرفقات داعمة حتى الآن.</div>';

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div style="font-size:14.5px;font-weight:800;color:var(--dark)">${orgEsc(m.title||"الجمعية العامة")}</div>
      ${statusBadge}
    </div>
    <div style="font-size:11.5px;color:var(--gray3);margin-bottom:16px">
      🏷️ جمعية ${m.agm_type||"عادية"} &nbsp; · &nbsp; 📅 ${m.meeting_date||"—"}${m.meeting_time?(" — الساعة "+m.meeting_time):""} &nbsp; · &nbsp; 📍 ${m.method||"—"}
    </div>
    ${linkHTML}
    ${calendarHTML}
    <div class="sh-docs-label"><span class="ico-i ico-send"></span>الدعوة</div>
    <div style="margin-bottom:16px">${invitationHTML}</div>
    <div class="sh-docs-label"><span class="ico-i ico-paperclip"></span>المرفقات الداعمة</div>
    ${supHTML}
  `;
}

async function fetchShareholderAGMDocs(meetingId){
  // الطريق الأول: دوال آمنة في قاعدة البيانات (تتجاوز قيود القراءة على جداول التوقيع للمساهم المعتمد فقط)
  try{
    const { data: inv, error: e1 } = await sb.rpc("get_agm_invitation", { p_meeting_id: meetingId });
    const { data: sup, error: e2 } = await sb.rpc("get_agm_supporting_docs", { p_meeting_id: meetingId });
    if(!e1 && !e2){
      const invitationDoc = inv && inv.id ? { id: inv.id, file_url: inv.file_url, signers_total: inv.signers_total } : null;
      const total = inv && inv.signers_total ? inv.signers_total : 1;
      const signedCount = inv ? (inv.signed_count || 0) : 0;
      // الدعوة تظهر للمساهم فقط بعد أن ينشرها المسؤول بزر «إرسال الدعوة»
      const visible = !!(invitationDoc && invitationDoc.file_url);
      return { invitationDoc: visible ? invitationDoc : null, invitationFullySigned: visible && signedCount >= total,
        invitationProgress: invitationDoc ? { signed: signedCount, total } : null,
        invitationUnpublished: !!(invitationDoc && !visible), supDocs: Array.isArray(sup) ? sup : [] };
    }
  }catch(e){}
  // الطريق الاحتياطي (قبل تنفيذ SQL): القراءة المباشرة كما كانت
  const { data: invDocs } = await sb.from("signing_documents").select("id,file_url,signers_total")
    .eq("related_meeting_id", meetingId).eq("doc_type","دعوة جمعية عامة").order("id",{ascending:false}).limit(1);
  const invitationDoc = (invDocs||[])[0];
  let invitationFullySigned = false, invitationProgress = null;
  if(invitationDoc){
    const { data: sigs } = await sb.from("official_doc_signatures").select("id").eq("document_id", invitationDoc.id);
    const total = invitationDoc.signers_total||1;
    invitationFullySigned = (sigs||[]).length >= total;
    invitationProgress = { signed: (sigs||[]).length, total };
  }
  const { data: supDocs } = await sb.from("meeting_supporting_docs").select("*").eq("meeting_id", meetingId).order("id",{ascending:false});
  return { invitationDoc, invitationFullySigned, invitationProgress, supDocs };
}

async function openShareholderAGMPopup(meetingId){
  const m = (agmMeetingsCache||[]).find(x => x.id === meetingId);
  if(!m) return;
  document.getElementById("shAGMModalBody").innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-sh-agm-view");
  document.getElementById("shAGMModalBody").innerHTML = await shareholderAGMDetailHTML(m);
}

function renderUpcomingAGMCards(upcoming){
  const wrap = document.getElementById("upcomingAGMCards");
  if(!wrap) return;
  if(upcoming.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد جمعيات عامة قادمة هذا العام حاليًا.</div>';
    return;
  }
  wrap.innerHTML = upcoming.map(m => {
    const fileCount = [m.agenda_file_url,m.invitation_file_url,m.minutes_file_url].filter(Boolean).length;
    return `<div class="mc q1" style="cursor:pointer" onclick="openAGMDetailModal(${m.id})">
      <div class="mc-bar"></div>
      <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"}</div>
      <div class="mc-title">${orgEsc(m.title||"")}</div>
      <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}${m.meeting_time ? (" — الساعة "+m.meeting_time) : ""}</div>
      <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
      ${m.notes ? `<div class="mc-detail"><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}</div>` : ""}
      <div class="mc-actions">
        <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openAGMDetailModal(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل والملفات ${fileCount ? `(${fileCount})` : ''}</button>
      </div>
      <label class="mc-public-toggle" onclick="event.stopPropagation()">
        <input type="checkbox" ${m.show_on_public_site?'checked':''} onchange="toggleMeetingPublicSite(${m.id},this.checked)"/>
        <span>🌐 عرض على الموقع العام لحوكم</span>
      </label>
    </div>`;
  }).join("");
}

async function toggleMeetingPublicSite(id, checked){
  const { error } = await sb.from("meetings").update({ show_on_public_site: checked }).eq("id", id);
  if(error){ alert("تعذّر تحديث حالة العرض العام: " + error.message); }
}

async function renderPastAGMTable(past){
  const tbody = document.getElementById("pastAGMTbody");
  if(!tbody) return;
  if(past.length === 0){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا يوجد سجل جمعيات سابقة بعد</td></tr>';
    return;
  }
  const ids = past.map(m=>m.id);
  const { data: votes } = await sb.from("votes").select("*").in("meeting_id", ids);
  const votesByMeeting = {};
  (votes||[]).forEach(v => { if(!votesByMeeting[v.meeting_id]) votesByMeeting[v.meeting_id]=[]; votesByMeeting[v.meeting_id].push(v); });
  const totalShares = Number(companySettings.total_shares) || 0;

  tbody.innerHTML = past.map(m => {
    const vs = votesByMeeting[m.id] || [];
    const shareholders = {};
    vs.forEach(v => { if(v.shareholder_name) shareholders[v.shareholder_name] = Number(v.shares_count)||0; });
    const votedShares = Object.values(shareholders).reduce((a,b)=>a+b,0);
    const participation = totalShares ? pct(votedShares, totalShares) : "—";
    return `<tr style="cursor:pointer" onclick="openAGMDetailModal(${m.id})">
      <td>${orgEsc(m.title||"")}</td><td>${m.meeting_date||"—"}</td><td>${m.agm_type||"عادية"}</td>
      <td>${participation}</td>
      <td><span class="badge done">مكتملة</span></td>
      <td><button class="btn-xs primary" onclick="event.stopPropagation();openAGMDetailModal(${m.id})"><span class="ico-i ico-folder"></span>التفاصيل</button></td>
    </tr>`;
  }).join("");
}

// "Word to edit" option for the minutes specifically — the company can tweak wording, then
// come back and upload the FINAL PDF (see the restricted-to-PDF upload row below) for signing.
async function generateAGMMinutesWordDraft(meetingId){
  await loadDocumentTemplates();
  const template = docTemplatesCache["agm_minutes"];
  if(!template || !template.file_url){
    alert('لا يوجد قالب Word مرفوع لمحضر الجمعية العامة — ارفعه أولًا من قسم "قوالب المستندات (Word)" أسفل هذي الصفحة (المفتاح: محضر الجمعية العامة).');
    return;
  }
  const config = OFFICIAL_DOC_TYPES["محضر جمعية عامة"];
  const chairman_name = await uiPrompt("اسم رئيس الجمعية (للمسودة):", "") || "";
  const secretary_name = await uiPrompt("اسم أمين سر الجمعية (للمسودة):", "") || "";
  const data = await config.prepareData(meetingId);
  const { m, company, topics, votes, attendees } = data;
  const companyName = company?.name || "الشركة";
  const companyTotalShares = Number(company?.total_shares)||0;
  const attendee_count = attendees.length;
  const attendee_shares = attendees.reduce((s,a)=>s+(Number(a.shares)||0),0);
  const attendance_pct = companyTotalShares ? Math.round(attendee_shares/companyTotalShares*100) : 0;
  const topicResults = topics.map(t => {
    const topicText = t.topic_text || t.topic || "";
    const relevant = votes.filter(v => v.topic === topicText);
    const totalVotes = relevant.length || 1;
    const yes = relevant.filter(v=>v.result==="موافق").length;
    const no = relevant.filter(v=>v.result==="معارض").length;
    const abs = relevant.filter(v=>v.result==="ممتنع").length;
    const yes_pct = Math.round(yes/totalVotes*100), no_pct = Math.round(no/totalVotes*100), abs_pct = Math.round(abs/totalVotes*100);
    return { topic_text: topicText, yes_pct, no_pct, abs_pct, decision: yes_pct>=50 ? "تمت الموافقة" : "لم تتم الموافقة" };
  });

  await fillDocxTemplate(template.file_url, {
    company_name: companyName, meeting_title: m.title||"", meeting_date: m.meeting_date||"",
    attendee_shares, attendee_count, attendance_pct, quorum_status: attendance_pct>=50?"مكتمل النصاب":"غير مكتمل النصاب",
    quorum_threshold: 50, chairman_name, secretary_name, topics: topicResults
  }, `محضر-الجمعية-مسودة-${m.title||''}.docx`);
}

let meetingCountdownInterval = null;
function startMeetingCountdown(m, elId){
  const box = document.getElementById(elId);
  if(meetingCountdownInterval) clearInterval(meetingCountdownInterval);
  if(!box || !m.meeting_date){ if(box) box.style.display = "none"; return; }
  const target = new Date(`${m.meeting_date}T${m.meeting_time || "00:00:00"}`);
  const tick = () => {
    const diff = target - new Date();
    if(diff <= 0){
      box.innerHTML = `<div style="color:#fff;font-weight:800;font-size:13px">🔴 الاجتماع جارٍ الآن أو انتهى</div>`;
      clearInterval(meetingCountdownInterval);
      return;
    }
    const days = Math.floor(diff/86400000), hours = Math.floor(diff%86400000/3600000), mins = Math.floor(diff%3600000/60000), secs = Math.floor(diff%60000/1000);
    box.style.display = "block";
    box.innerHTML = `
      <div style="color:rgba(255,255,255,0.85);font-size:11px;font-weight:700;margin-bottom:6px">⏳ الوقت المتبقي للاجتماع</div>
      <div style="display:flex;justify-content:center;gap:14px">
        ${[[days,'يوم'],[hours,'ساعة'],[mins,'دقيقة'],[secs,'ثانية']].map(([v,l]) =>
          `<div><div style="color:#fff;font-weight:900;font-size:20px">${v}</div><div style="color:rgba(255,255,255,0.75);font-size:10px">${l}</div></div>`
        ).join("")}
      </div>`;
  };
  tick();
  meetingCountdownInterval = setInterval(tick, 1000);
}

async function loadTadawulResultsForm(meetingId){
  const [{ data: m }, { data: topics }] = await Promise.all([
    sb.from("meetings").select("manual_attendee_count,manual_attendee_shares").eq("id", meetingId).single(),
    sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("id",{ascending:true})
  ]);
  document.getElementById("agmView-tadawul-count").value = m?.manual_attendee_count ?? "";
  document.getElementById("agmView-tadawul-shares").value = m?.manual_attendee_shares ?? "";
  const box = document.getElementById("agmView-tadawulTopics");
  box.innerHTML = (topics||[]).map(t => `<div style="background:#fff;border-radius:8px;padding:8px;margin-bottom:6px">
    <div style="font-size:11.5px;font-weight:700;margin-bottom:6px">${t.topic_text||t.topic||""}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
      <div><label style="font-size:10px;color:var(--green)">% موافق</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-yes-${t.id}" value="${t.manual_yes_pct ?? ''}"/></div>
      <div><label style="font-size:10px;color:var(--red)">% معارض</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-no-${t.id}" value="${t.manual_no_pct ?? ''}"/></div>
      <div><label style="font-size:10px;color:var(--orange)">% ممتنع</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-abs-${t.id}" value="${t.manual_abs_pct ?? ''}"/></div>
    </div>
  </div>`).join("") || '<div style="font-size:11px;color:var(--gray3)">أضف بنود جدول الأعمال أولًا من الأسفل.</div>';
}

async function saveTadawulResults(){
  const meetingId = currentAGMModalMeetingId;
  const manual_attendee_count = document.getElementById("agmView-tadawul-count").value || null;
  const manual_attendee_shares = document.getElementById("agmView-tadawul-shares").value || null;
  await sb.from("meetings").update({ manual_attendee_count, manual_attendee_shares }).eq("id", meetingId);

  const { data: topics } = await sb.from("vote_topics").select("id").eq("meeting_id", meetingId);
  for(const t of (topics||[])){
    const yesEl = document.getElementById(`tdw-yes-${t.id}`);
    if(!yesEl) continue;
    await sb.from("vote_topics").update({
      manual_yes_pct: document.getElementById(`tdw-yes-${t.id}`).value || null,
      manual_no_pct: document.getElementById(`tdw-no-${t.id}`).value || null,
      manual_abs_pct: document.getElementById(`tdw-abs-${t.id}`).value || null
    }).eq("id", t.id);
  }
  alert("تم حفظ نتائج تداول ✅ — جاهزة الآن لتوليد محضر الجمعية.");
}

/* ══════════ CMA/TADAWUL ANNOUNCEMENT GENERATOR ══════════
   Drafts announcements matching the exact title wording and required elements from the
   official "التعليمات الخاصة بإعلانات الشركات" — the company still submits through their own
   Tadawul channel (no direct technical integration exists), this just prepares a compliant
   draft so they aren't starting from a blank page each time. */
/* ══════════ STANDALONE ANNOUNCEMENTS PAGE (not tied to any one meeting) ══════════ */
let pendingAnnouncementType = null;

/* ══════════ CMA ANNOUNCEMENT TYPE REGISTRY (data-driven engine) ══════════
   Each entry defines: category (for grouping in the picker), a title-template function
   (matching the CMA's exact required wording), and a fields list the generic modal renders
   automatically and the generic PDF generator prints line by line. Adding a new type from the
   remaining ~18 (financial results, capital-increase sequences, acquisitions) is just adding
   one more entry here — no new modal or PDF code needed. */
const ANNOUNCEMENT_TYPES = {
  "فتح باب الترشّح لعضوية مجلس الإدارة": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن فتح باب الترشّح لعضوية مجلس إدارة الشركة للدورة القادمة`,
    fields: [
      {key:"term_start", label:"تاريخ بداية الدورة", type:"date"},
      {key:"term_end", label:"تاريخ انتهاء الدورة", type:"date"},
      {key:"nom_open", label:"موعد فتح باب الترشيح", type:"date"},
      {key:"nom_close", label:"موعد انتهاء الترشيح", type:"date"},
      {key:"submit_method", label:"طريقة تسلّم طلبات الترشّح", type:"textarea"},
      {key:"criteria", label:"سياسة ومعايير الترشّح المعتمدة من الجمعية العامة", type:"textarea"},
    ]
  },
  "استقالة عضو مجلس إدارة": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن استقالة عضو من مجلس إدارتها`,
    fields: [
      {key:"member_name", label:"اسم العضو المستقيل", type:"text"},
      {key:"capacity", label:"صفة عضويته (تنفيذي/غير تنفيذي/مستقل)", type:"text"},
      {key:"submit_date", label:"تاريخ تقديم الاستقالة", type:"date"},
      {key:"effective_date", label:"تاريخ سريانها", type:"date"},
      {key:"reason", label:"أسباب الاستقالة", type:"textarea"},
      {key:"start_date", label:"تاريخ بداية عضويته الأصلية", type:"date"},
    ]
  },
  "تعيين عضو مجلس إدارة جديد": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن تعيين عضو في المقعد الشاغر بمجلس إدارتها`,
    fields: [
      {key:"member_name", label:"اسم العضو المعيَّن", type:"text"},
      {key:"capacity", label:"صفة عضويته", type:"text"},
      {key:"meeting_date", label:"تاريخ اجتماع المجلس الذي تم فيه التعيين", type:"date"},
      {key:"noc_date", label:"تاريخ عدم ممانعة الجهات الرسمية (إن وجدت)", type:"date"},
      {key:"start_date", label:"تاريخ بداية العضوية", type:"date"},
      {key:"bio", label:"نبذة مختصرة عن السيرة الذاتية", type:"textarea"},
    ],
    fixedNote: "موافقة مجلس الإدارة لا تُعدّ نهائية، وسوف يُعرض هذا التعيين على أول اجتماع للجمعية العامة لإقراره."
  },
  "استقالة عضو مجلس إدارة وتعيين عضو جديد": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن استقالة عضو من مجلس إدارتها وتعيين عضو جديد`,
    fields: [
      {key:"resigning_name", label:"اسم العضو المستقيل", type:"text"},
      {key:"resign_submit_date", label:"تاريخ تقديم الاستقالة", type:"date"},
      {key:"resign_effective_date", label:"تاريخ سريانها", type:"date"},
      {key:"resign_reason", label:"أسباب الاستقالة", type:"textarea"},
      {key:"resign_start_date", label:"تاريخ بداية عضوية المستقيل", type:"date"},
      {key:"appointed_name", label:"اسم العضو المعيَّن", type:"text"},
      {key:"meeting_date", label:"تاريخ اجتماع المجلس", type:"date"},
      {key:"appoint_start_date", label:"تاريخ بداية عضوية المعيَّن", type:"date"},
      {key:"bio", label:"نبذة عن السيرة الذاتية للمعيَّن", type:"textarea"},
    ],
    fixedNote: "موافقة مجلس الإدارة لا تُعدّ نهائية، وسوف يُعرض هذا التعيين على أول اجتماع للجمعية العامة لإقراره."
  },
  "استقالة الرئيس التنفيذي": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن استقالة الرئيس التنفيذي للشركة`,
    fields: [
      {key:"name", label:"اسم الشخص المستقيل", type:"text"},
      {key:"accept_date", label:"تاريخ قبول الاستقالة", type:"date"},
      {key:"effective_date", label:"تاريخ سريانها", type:"date"},
      {key:"reason", label:"أسباب الاستقالة", type:"textarea"},
    ]
  },
  "تعيين رئيس تنفيذي": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن تعيين رئيس تنفيذي للشركة`,
    fields: [
      {key:"name", label:"اسم الشخص المعيَّن", type:"text"},
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
      {key:"start_date", label:"تاريخ مباشرته العمل", type:"date"},
      {key:"bio", label:"نبذة مختصرة عن السيرة الذاتية", type:"textarea"},
    ]
  },
  "استقالة وتعيين رئيس تنفيذي": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن استقالة الرئيس التنفيذي وتعيين/تكليف رئيس تنفيذي جديد`,
    fields: [
      {key:"resigning_name", label:"اسم الشخص المستقيل", type:"text"},
      {key:"accept_date", label:"تاريخ قبول الاستقالة", type:"date"},
      {key:"effective_date", label:"تاريخ سريانها", type:"date"},
      {key:"reason", label:"أسباب الاستقالة", type:"textarea"},
      {key:"acting_name", label:"اسم المكلَّف مؤقتًا (إن وجد)", type:"text"},
      {key:"appointed_name", label:"اسم المعيَّن (إن وجد)", type:"text"},
      {key:"start_date", label:"تاريخ بداية التكليف/التعيين", type:"date"},
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
      {key:"bio", label:"نبذة عن السيرة الذاتية", type:"textarea"},
    ]
  },
  "استقالة عضو لجنة المراجعة": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن استقالة عضو من لجنة المراجعة`,
    fields: [
      {key:"member_name", label:"اسم العضو المستقيل", type:"text"},
      {key:"submit_date", label:"تاريخ تقديم الاستقالة", type:"date"},
      {key:"effective_date", label:"تاريخ سريانها", type:"date"},
      {key:"reason", label:"أسباب الاستقالة", type:"textarea"},
      {key:"start_date", label:"تاريخ بداية عضويته", type:"date"},
    ]
  },
  "تعيين عضو لجنة المراجعة": {
    category: "التغييرات الإدارية",
    title: (co) => `تعلن شركة ${co} عن تعيين عضو في لجنة المراجعة`,
    fields: [
      {key:"member_name", label:"اسم العضو المعيَّن", type:"text"},
      {key:"meeting_date", label:"تاريخ اجتماع المجلس الذي تم فيه التعيين", type:"date"},
      {key:"noc_date", label:"تاريخ عدم ممانعة الجهات الرسمية (إن وجدت)", type:"date"},
      {key:"start_date", label:"تاريخ بداية العضوية", type:"date"},
      {key:"bio", label:"نبذة عن السيرة الذاتية", type:"textarea"},
    ]
  },

  "توصية بتوزيع أرباح نقدية": {
    category: "الأرباح النقدية",
    title: (co) => `تعلن شركة ${co} عن توصية/قرار مجلس إدارة الشركة بتوزيع أرباح نقدية على المساهمين`,
    fields: [
      {key:"decision_date", label:"تاريخ التوصية أو القرار", type:"date"},
      {key:"period", label:"فترة التوزيع", type:"text"},
      {key:"total_amount", label:"إجمالي المبلغ الموزَّع (ريال)", type:"text"},
      {key:"eligible_shares", label:"عدد الأسهم المستحقة للأرباح", type:"text"},
      {key:"per_share", label:"حصة السهم من التوزيع", type:"text"},
      {key:"pct_of_nominal", label:"نسبة التوزيع لقيمة السهم الاسمية", type:"text"},
      {key:"entitlement_date", label:"تاريخ الأحقية", type:"date"},
      {key:"distribution_date", label:"تاريخ التوزيع (أو اكتب: سيُعلَن لاحقًا)", type:"text"},
    ]
  },
  "عدم توزيع أرباح نقدية": {
    category: "الأرباح النقدية",
    title: (co) => `تعلن شركة ${co} عن قرار مجلس إدارة الشركة بعدم توزيع أرباح نقدية على المساهمين`,
    fields: [
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
      {key:"period", label:"فترة التوزيع ذات العلاقة", type:"text"},
      {key:"reason", label:"سبب التوصية بعدم التوزيع", type:"textarea"},
    ]
  },

  "ترسية عقد أو مشروع": {
    category: "العقود",
    title: (co, extra) => `تعلن شركة ${co} عن ترسية (عقد/مشروع) مع ${extra.other_party||"...."}`,
    fields: [
      {key:"other_party", label:"الطرف الآخر", type:"text"},
      {key:"award_date", label:"تاريخ الترسية", type:"date"},
      {key:"value", label:"قيمة العقد أو المشروع", type:"text"},
      {key:"expected_sign_date", label:"التاريخ المتوقَّع لتوقيع العقد (إن وجد)", type:"date"},
      {key:"details", label:"تفاصيل العقد أو المشروع", type:"textarea"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
    ]
  },
  "توقيع عقد أو مشروع": {
    category: "العقود",
    title: (co, extra) => `تعلن شركة ${co} عن توقيع (عقد/مشروع) مع ${extra.other_party||"...."} لغرض ${extra.purpose||"...."}`,
    fields: [
      {key:"other_party", label:"الجهة الموقَّع معها", type:"text"},
      {key:"purpose", label:"الغرض من العقد/المشروع", type:"text"},
      {key:"sign_date", label:"تاريخ التوقيع", type:"date"},
      {key:"value", label:"قيمة العقد أو المشروع", type:"text"},
      {key:"duration", label:"تفاصيل العقد ومدته", type:"textarea"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي والفترة التي ينعكس عليها", type:"textarea"},
    ]
  },

  "إعلان إلحاقي": {
    category: "الإلحاقية والتصحيحية",
    title: (co, extra) => `إعلان إلحاقي من شركة ${co} بخصوص ${extra.subject||"...."}`,
    fields: [
      {key:"subject", label:"موضوع الإعلان", type:"text"},
      {key:"previous_date", label:"تاريخ الإعلان السابق للتطور", type:"date"},
      {key:"change", label:"التغيّر الحاصل على التطور (المعلومة الإضافية)", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي للتغيّر (إن وجد)", type:"textarea"},
    ]
  },
  "إعلان تصحيحي": {
    category: "الإلحاقية والتصحيحية",
    title: (co, extra) => `إعلان تصحيحي من شركة ${co} بخصوص ${extra.subject||"...."}`,
    fields: [
      {key:"subject", label:"موضوع الإعلان", type:"text"},
      {key:"previous_date", label:"تاريخ الإعلان السابق للتطور", type:"date"},
      {key:"wrong_statement", label:"البيان الخاطئ بالإعلان السابق", type:"textarea"},
      {key:"correction", label:"التصحيح", type:"textarea"},
    ]
  },

  "توقيع مذكرة تفاهم": {
    category: "مذكرات التفاهم",
    title: (co, extra) => `تعلن شركة ${co} عن توقيع مذكرة تفاهم مع ${extra.other_party||"...."}`,
    fields: [
      {key:"other_party", label:"الجهة الموقَّع معها", type:"text"},
      {key:"sign_date", label:"تاريخ التوقيع", type:"date"},
      {key:"subject", label:"موضوع المذكرة", type:"text"},
      {key:"duration", label:"مدة المذكرة", type:"text"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي (إن وجد)", type:"textarea"},
    ]
  },

  "إعلان عن مشروع": {
    category: "المشاريع",
    title: (co, extra) => `تعلن شركة ${co} عن ${extra.project_name||"...."}`,
    fields: [
      {key:"project_name", label:"اسم المشروع", type:"text"},
      {key:"decision_date", label:"تاريخ قرار المجلس بخصوص المشروع (إن وجد)", type:"date"},
      {key:"start_date", label:"تاريخ البدء بالإنشاء", type:"date"},
      {key:"cost", label:"تكلفة المشروع", type:"text"},
      {key:"funding_method", label:"طريقة التمويل", type:"text"},
      {key:"expected_completion", label:"التاريخ المتوقَّع للانتهاء من الإنشاء", type:"date"},
      {key:"financial_impact", label:"الأثر المالي المتوقَّع بالقوائم المالية", type:"textarea"},
      {key:"expected_production", label:"التاريخ المتوقَّع للإنتاج التجاري", type:"date"},
      {key:"executing_party", label:"الجهة المنفِّذة أو الطرف الآخر بالعقد", type:"text"},
    ]
  },

  "صفقة أصل (شراء/بيع/رهن/تأجير)": {
    category: "الصفقات",
    title: (co, extra) => `تعلن شركة ${co} عن (${extra.deal_type||"شراء/بيع/رهن/تأجير"}) ${extra.asset||"...."} بقيمة ${extra.value||"...."}`,
    fields: [
      {key:"deal_type", label:"نوع الصفقة (شراء/بيع/رهن/تأجير)", type:"text"},
      {key:"asset", label:"وصف الأصل موضوع الصفقة", type:"text"},
      {key:"value", label:"قيمة الصفقة وشروطها وأطرافها وطريقة تمويلها", type:"textarea"},
      {key:"deal_date", label:"تاريخ إبرام الصفقة", type:"date"},
      {key:"book_value", label:"القيمة الدفترية للأصل (في حال البيع)", type:"text"},
      {key:"reasons", label:"أسباب الصفقة وآثارها المتوقَّعة", type:"textarea"},
      {key:"proceeds_use", label:"بيان استخدام المتحصلات (في حال البيع)", type:"textarea"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
    ]
  },

  "الحصول على تمويل": {
    category: "التمويل",
    title: (co, extra) => `تعلن شركة ${co} عن حصولها على ${extra.financing_type||"...."}`,
    fields: [
      {key:"financing_type", label:"نوع التمويل", type:"text"},
      {key:"date", label:"تاريخ الحصول على التمويل", type:"date"},
      {key:"funder", label:"الجهة المموِّلة", type:"text"},
      {key:"value", label:"قيمة التمويل", type:"text"},
      {key:"duration", label:"مدة التمويل", type:"text"},
      {key:"guarantees", label:"أي ضمانات مقدَّمة", type:"textarea"},
      {key:"purpose", label:"الهدف من التمويل", type:"text"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
    ]
  },
  "تعذّر سداد التمويل": {
    category: "التمويل",
    title: (co, extra) => `تعلن شركة ${co} عن تعذّر سداد التمويل المقدَّم من ${extra.funder||"...."}`,
    fields: [
      {key:"funder", label:"الجهة المموِّلة", type:"text"},
      {key:"financing_date", label:"تاريخ الحصول على التمويل", type:"date"},
      {key:"due_date", label:"تاريخ السداد المستحق", type:"date"},
      {key:"value", label:"قيمة التمويل", type:"text"},
      {key:"reasons", label:"أسباب عدم القدرة على السداد", type:"textarea"},
      {key:"plan", label:"خطة الشركة لمواجهة تعذّر السداد", type:"textarea"},
      {key:"risks", label:"الآثار والتكاليف والمخاطر المحتملة", type:"textarea"},
    ]
  },
  "إعادة جدولة التمويل": {
    category: "التمويل",
    title: (co, extra) => `تعلن شركة ${co} عن إعادة جدولة ${extra.financing_type||"التمويل"} المقدَّم من ${extra.funder||"...."}`,
    fields: [
      {key:"financing_type", label:"نوع التمويل", type:"text"},
      {key:"funder", label:"الجهة المموِّلة", type:"text"},
      {key:"reschedule_date", label:"تاريخ توقيع إعادة الجدولة", type:"date"},
      {key:"reasons", label:"أسباب إعادة الجدولة", type:"textarea"},
      {key:"value_and_rescheduled_part", label:"قيمة التمويل والجزء المعاد جدولته", type:"text"},
      {key:"duration_before_after", label:"مدة التمويل قبل الجدولة وبعدها", type:"text"},
      {key:"guarantees", label:"الضمانات المقدَّمة", type:"textarea"},
    ]
  },

  "العزم على إصدار أدوات دين": {
    category: "أدوات الدين",
    title: (co, extra) => `تعلن شركة ${co} عن عزمها إصدار (${extra.instrument_type||"صكوك/سندات"})`,
    fields: [
      {key:"instrument_type", label:"نوع الأداة (صكوك/سندات)", type:"text"},
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
      {key:"value", label:"قيمة الطرح", type:"text"},
      {key:"purpose", label:"الهدف من الطرح", type:"textarea"},
    ]
  },
  "بدء طرح أدوات دين": {
    category: "أدوات الدين",
    title: (co, extra) => `تعلن شركة ${co} عن بدء طرح إصدار (${extra.instrument_type||"صكوك/سندات"})`,
    fields: [
      {key:"instrument_type", label:"نوع الأداة", type:"text"},
      {key:"value", label:"قيمة الطرح", type:"text"},
      {key:"start_date", label:"تاريخ بداية الطرح", type:"date"},
      {key:"end_date", label:"تاريخ نهاية الطرح", type:"date"},
      {key:"target", label:"الفئة المستهدفة من الإصدار", type:"text"},
      {key:"manager", label:"الجهة المسؤولة عن إدارة الإصدار", type:"text"},
      {key:"min_subscription", label:"الحد الأدنى للاكتتاب (إن وجد)", type:"text"},
      {key:"price", label:"سعر الطرح والقيمة الاسمية", type:"text"},
      {key:"yield", label:"العائد", type:"text"},
      {key:"maturity", label:"مدة الاستحقاق", type:"text"},
    ]
  },
  "انتهاء طرح أدوات دين": {
    category: "أدوات الدين",
    title: (co, extra) => `تعلن شركة ${co} عن انتهاء طرح إصدار (${extra.instrument_type||"صكوك/سندات"})`,
    fields: [
      {key:"instrument_type", label:"نوع الأداة", type:"text"},
      {key:"value", label:"قيمة الطرح", type:"text"},
      {key:"total_count", label:"العدد الإجمالي", type:"text"},
      {key:"nominal_value", label:"القيمة الاسمية", type:"text"},
      {key:"yield", label:"العائد", type:"text"},
      {key:"maturity", label:"مدة الاستحقاق", type:"text"},
    ]
  },
  "استرداد أدوات دين مصدرة": {
    category: "أدوات الدين",
    title: (co, extra) => `تعلن شركة ${co} عن عزمها استرداد (${extra.instrument_type||"الصكوك/السندات"}) المصدرة`,
    fields: [
      {key:"instrument_type", label:"نوع الأداة", type:"text"},
      {key:"redeemed_value", label:"قيمة المسترَد ونسبته من الإصدار الكلي", type:"text"},
      {key:"redeemed_count", label:"العدد الإجمالي المسترَد", type:"text"},
      {key:"issue_date", label:"تاريخ الإصدار", type:"date"},
      {key:"trading_stop_date", label:"تاريخ توقف التداول", type:"date"},
      {key:"nominal_at_redemption", label:"القيمة الاسمية عند الاسترداد", type:"text"},
      {key:"remaining_issue_value", label:"قيمة الإصدار الإجمالية بعد الاسترداد", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع المبالغ لحاملي الأداة", type:"date"},
    ]
  },

  "توصية بشراء الشركة أسهمها": {
    category: "شراء وبيع الشركة لأسهمها",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بشراء أسهمها`,
    fields: [
      {key:"decision_date", label:"تاريخ توصية المجلس", type:"date"},
      {key:"purpose", label:"الهدف من الشراء", type:"textarea"},
      {key:"treasury_purpose", label:"الغرض (إن كان الهدف الاحتفاظ بها كأسهم خزينة)", type:"text"},
      {key:"shares_count", label:"عدد الأسهم المقرَّر شراؤها ونوعها وفئتها", type:"text"},
      {key:"funding_method", label:"طريقة تمويل عملية الشراء", type:"text"},
      {key:"current_treasury_pct", label:"نسبة أسهم الخزينة الحالية (إن وجدت)", type:"text"},
    ]
  },
  "عزم بيع أسهم الشركة": {
    category: "شراء وبيع الشركة لأسهمها",
    title: (co) => `تعلن شركة ${co} عن عزمها بيع أسهمها`,
    fields: [
      {key:"approval_date", label:"تاريخ موافقة مجلس الإدارة", type:"date"},
      {key:"shares_count", label:"عدد الأسهم المقرَّر بيعها ونسبتها من أسهم الخزينة", type:"text"},
      {key:"purpose", label:"الهدف من البيع", type:"textarea"},
    ]
  },

  "توصية برهن أسهم الشركة": {
    category: "رهن الشركة لأسهمها",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة برهن أسهمها`,
    fields: [
      {key:"decision_date", label:"تاريخ توصية المجلس", type:"date"},
      {key:"reasons", label:"أسباب الرهن والمقابل المالي أو التجاري", type:"textarea"},
      {key:"shares_count", label:"عدد الأسهم المراد رهنها", type:"text"},
      {key:"pledge_date_duration", label:"تاريخ الرهن ومدته", type:"text"},
      {key:"pledgee", label:"الجهة المرتهنة", type:"text"},
    ]
  },
  "فك رهن أسهم الشركة": {
    category: "رهن الشركة لأسهمها",
    title: (co) => `تعلن شركة ${co} عن فك رهن أسهمها`,
    fields: [
      {key:"release_date", label:"تاريخ فك الرهن", type:"date"},
      {key:"shares_count", label:"عدد الأسهم المرهونة", type:"text"},
      {key:"funding_source", label:"مصدر التمويل المستخدَم بفك الرهن", type:"text"},
      {key:"reasons", label:"أسباب انقضاء الرهن", type:"textarea"},
    ]
  },

  "دعوى قضائية": {
    category: "الدعاوى القضائية",
    title: (co, extra) => `تعلن شركة ${co} عن ${extra.case_type||"...."} مع ${extra.other_party||"...."}`,
    fields: [
      {key:"case_type", label:"نوع الدعوى", type:"text"},
      {key:"other_party", label:"الطرف الآخر (ومن رفع الدعوى)", type:"text"},
      {key:"court", label:"الجهة القضائية ذات الاختصاص", type:"text"},
      {key:"date", label:"تاريخ الدعوى", type:"date"},
      {key:"summary", label:"نبذة عن القضية وأسباب رفعها", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي المتوقَّع (المبلغ المطالَب به)", type:"text"},
      {key:"risks", label:"التبعات أو المخاطر الجوهرية المحتملة", type:"textarea"},
      {key:"actions_taken", label:"الإجراءات المتخذة من الشركة", type:"textarea"},
    ]
  },

  "تطورات معلَنة سابقًا": {
    category: "تطورات معلَنة سابقًا",
    title: (co, extra) => `تعلن شركة ${co} عن آخر التطورات لـ${extra.event||"...."}`,
    fields: [
      {key:"event", label:"الحدث الذي سبق إعلانه", type:"text"},
      {key:"previous_date", label:"تاريخ الإعلان السابق", type:"date"},
      {key:"latest_developments", label:"آخر تطورات الحدث", type:"textarea"},
      {key:"delay_reasons", label:"أسباب التأخر عن التاريخ المعلَن سابقًا (إن وجد)", type:"textarea"},
      {key:"costs", label:"التكاليف المرتبطة بالحدث (إن وجدت)", type:"text"},
    ]
  },

  "بلوغ خسائر متراكمة 20% فأكثر وأقل من 35%": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن بلوغ خسائرها المتراكمة ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"نسبة الخسائر المتراكمة من رأس المال", type:"text"},
      {key:"date", label:"تاريخ بلوغ الخسائر", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"reasons", label:"الأسباب الرئيسة لبلوغ هذه الخسائر", type:"textarea"},
    ]
  },
  "انخفاض الخسائر المتراكمة عن 20%": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن انخفاض خسائرها المتراكمة إلى ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"النسبة الجديدة", type:"text"},
      {key:"date", label:"تاريخ الانخفاض", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"actions_taken", label:"الإجراءات المتخذة لتخفيض الخسائر", type:"textarea"},
    ]
  },
  "بلوغ خسائر متراكمة 35% فأكثر وأقل من 50%": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن بلوغ خسائرها المتراكمة ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"نسبة الخسائر المتراكمة من رأس المال", type:"text"},
      {key:"date", label:"تاريخ بلوغ الخسائر", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"reasons", label:"الأسباب الرئيسة", type:"textarea"},
      {key:"actions", label:"الإجراءات التي ستتخذها الشركة", type:"textarea"},
    ]
  },
  "انخفاض الخسائر المتراكمة عن 35%": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن انخفاض خسائرها المتراكمة إلى ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"النسبة الجديدة", type:"text"},
      {key:"date", label:"تاريخ الانخفاض", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"actions_taken", label:"الإجراءات المتخذة لتخفيض الخسائر", type:"textarea"},
    ]
  },
  "بلوغ خسائر متراكمة 50% فأكثر": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن بلوغ خسائرها المتراكمة ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"نسبة الخسائر المتراكمة من رأس المال", type:"text"},
      {key:"date", label:"تاريخ بلوغ الخسائر", type:"date"},
      {key:"board_notice_date", label:"تاريخ تبلّغ المجلس بذلك", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"reasons", label:"الأسباب الرئيسة", type:"textarea"},
      {key:"disclosure_deadline", label:"آخر يوم للإفصاح عن توصيات المجلس بشأن الخسائر", type:"date"},
      {key:"egm_deadline", label:"آخر يوم لدعوة الجمعية العامة غير العادية", type:"date"},
    ]
  },
  "انخفاض الخسائر المتراكمة عن 50%": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن انخفاض خسائرها المتراكمة إلى ${extra.pct||"..."}% من رأس المال`,
    fields: [
      {key:"pct", label:"النسبة الجديدة", type:"text"},
      {key:"date", label:"تاريخ الانخفاض", type:"date"},
      {key:"amount", label:"مقدار الخسائر المتراكمة", type:"text"},
      {key:"actions_taken", label:"الإجراءات المتخذة لتخفيض الخسائر", type:"textarea"},
    ]
  },
  "توصية الجمعية غير العادية حيال خسائر 50%+": {
    category: "الخسائر المتراكمة",
    title: (co, extra) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة للجمعية العامة غير العادية بـ${extra.recommendation||"...."} بسبب الخسائر المتراكمة`,
    fields: [
      {key:"recommendation", label:"نص التوصية (مثل: حل الشركة / الاستمرار مع معالجة الخسائر)", type:"text"},
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"details", label:"تفاصيل التوصية", type:"textarea"},
    ]
  },

  "تأثير أحداث طارئة في أعمال الشركة": {
    category: "الأحداث الطارئة",
    title: (co, extra) => `تعلن شركة ${co} عن أثر ${extra.event||"...."} في أعمالها`,
    fields: [
      {key:"event", label:"تحديد الحدث (حريق/زلزال/مرض وبائي/إلخ)", type:"text"},
      {key:"reasons", label:"الأسباب التي أدت إلى تأثر الشركة", type:"textarea"},
      {key:"affected_operations", label:"الأعمال المتأثرة (إن وجدت)", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي المتوقَّع والفترة المتأثرة", type:"textarea"},
      {key:"actions", label:"الإجراءات المتخذة أو المزمعة لمعالجة الأثر", type:"textarea"},
      {key:"expected_duration", label:"المدة المتوقَّعة للحدث (إن أمكن)", type:"text"},
    ]
  },

  "الانتقال من السوق الموازية إلى الرئيسية": {
    category: "الانتقال بين الأسواق",
    title: (co) => `تعلن شركة ${co} عن قرار مجلس إدارة الشركة بالانتقال من السوق الموازية إلى السوق الرئيسية`,
    fields: [
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
    ],
    fixedNote: "الانتقال خاضع لموافقة السوق، ومشروط باستيفاء جميع المتطلبات المفروضة من قِبل السوق، وسيتم الإعلان عن أي تطورات جوهرية فور وقوعها."
  },
  "النتائج المالية السنوية (عدا البنوك والتأمين)": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن النتائج المالية السنوية المنتهية في ${extra.period_end||"XXXX/XX/XX"}`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"revenue", label:"المبيعات/الإيرادات: الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"gross_profit", label:"إجمالي الربح (الخسارة): الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"operating_profit", label:"الربح (الخسارة) التشغيلي: الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"net_profit", label:"صافي الربح (الخسارة): الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"comprehensive_income", label:"إجمالي الدخل الشامل: الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"eps", label:"ربحية (خسارة) السهم: الحالي مقابل السابق", type:"text"},
      {key:"equity", label:"إجمالي حقوق الملكية (بعد استبعاد الحصص غير المسيطرة): الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية العام ونسبتها من رأس المال (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية ونسبتها (إن ينطبق)", type:"text"},
      {key:"revenue_reason", label:"سبب الارتفاع (الانخفاض) في المبيعات/الإيرادات", type:"textarea"},
      {key:"profit_reason", label:"سبب الارتفاع (الانخفاض) في صافي الربح (الخسارة)", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات (رأي غير معدَل/تحفظ/لفت انتباه/أمر آخر/امتناع/رأي معارض)", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى ترغب الشركة بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية الأولية (عدا البنوك والتأمين)": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن النتائج المالية الأولية للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"} (${extra.period_months||"ثلاثة/ستة/تسعة/اثني عشر"} شهرًا)`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"period_months", label:"مدة الفترة (ثلاثة/ستة/تسعة/اثني عشر شهرًا)", type:"text"},
      {key:"revenue_q", label:"المبيعات/الإيرادات خلال الربع الحالي: مقابل الربع المماثل والربع السابق ونسب التغير", type:"textarea"},
      {key:"gross_profit_q", label:"إجمالي الربح (الخسارة) خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"operating_profit_q", label:"الربح (الخسارة) التشغيلي خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"net_profit_q", label:"صافي الربح (الخسارة) خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"comprehensive_income_q", label:"إجمالي الدخل الشامل خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"revenue_period", label:"المبيعات/الإيرادات خلال الفترة الحالية مقابل الفترة المماثلة ونسبة التغير", type:"text"},
      {key:"gross_profit_period", label:"إجمالي الربح (الخسارة) خلال الفترة الحالية: نفس المقارنة", type:"text"},
      {key:"operating_profit_period", label:"الربح (الخسارة) التشغيلي خلال الفترة الحالية: نفس المقارنة", type:"text"},
      {key:"net_profit_period", label:"صافي الربح (الخسارة) خلال الفترة الحالية: نفس المقارنة", type:"text"},
      {key:"comprehensive_income_period", label:"إجمالي الدخل الشامل خلال الفترة الحالية: نفس المقارنة", type:"text"},
      {key:"eps_period", label:"ربحية (خسارة) السهم خلال الفترة الحالية مقابل المماثلة", type:"text"},
      {key:"equity_period", label:"إجمالي حقوق الملكية خلال الفترة الحالية مقابل المماثلة ونسبة التغير", type:"text"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية الفترة ونسبتها من رأس المال (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"revenue_reason_q", label:"سبب الارتفاع (الانخفاض) بالمبيعات — الربع الحالي مقابل المماثل ومقابل السابق", type:"textarea"},
      {key:"profit_reason_q", label:"سبب الارتفاع (الانخفاض) بصافي الربح — الربع الحالي مقابل المماثل ومقابل السابق", type:"textarea"},
      {key:"revenue_reason_period", label:"سبب الارتفاع (الانخفاض) بالمبيعات — الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"profit_reason_period", label:"سبب الارتفاع (الانخفاض) بصافي الربح — الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات (فحص استنتاج: غير معدَل/تحفظ/لفت انتباه/أمر آخر/امتناع/استنتاج معارض)", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى ترغب الشركة بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية السنوية للبنوك": {
    category: "النتائج المالية",
    title: (co, extra) => `يعلن بنك/مصرف ${co} عن النتائج المالية السنوية المنتهية في ${extra.period_end||"XXXX/XX/XX"}`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"commission_financing_income", label:"إجمالي دخل العمولات الخاصة من التمويل: الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"commission_investment_income", label:"إجمالي دخل العمولات الخاصة من الاستثمارات: نفس المقارنة", type:"text"},
      {key:"net_commission_financing", label:"صافي دخل العمولات الخاصة من التمويل: نفس المقارنة", type:"text"},
      {key:"net_commission_investment", label:"صافي دخل العمولات الخاصة من الاستثمارات: نفس المقارنة", type:"text"},
      {key:"operations_profit", label:"إجمالي ربح (خسارة) العمليات: نفس المقارنة", type:"text"},
      {key:"net_profit", label:"صافي الربح (الخسارة): نفس المقارنة", type:"text"},
      {key:"comprehensive_income", label:"إجمالي الدخل الشامل: نفس المقارنة", type:"text"},
      {key:"credit_loss_provision", label:"إجمالي مخصص (عكس قيد) خسائر الائتمان المتوقعة والخسائر الأخرى صافي: نفس المقارنة", type:"text"},
      {key:"eps", label:"ربحية (خسارة) السهم: الحالي مقابل السابق", type:"text"},
      {key:"equity", label:"إجمالي حقوق الملكية: نفس المقارنة", type:"text"},
      {key:"balance_sheet_items", label:"الموجودات، الاستثمارات، محفظة القروض والسلف، ودائع العملاء: كل بند مقابل السابق ونسبة التغير", type:"textarea"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية العام (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"commission_reason", label:"سبب الارتفاع (الانخفاض) بدخل العمولات الخاصة", type:"textarea"},
      {key:"profit_reason", label:"سبب الارتفاع (الانخفاض) بصافي الربح", type:"textarea"},
      {key:"provision_reason", label:"سبب الارتفاع (الانخفاض) بمخصص خسائر الائتمان المتوقعة", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى يرغب البنك بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية الأولية للبنوك": {
    category: "النتائج المالية",
    title: (co, extra) => `يعلن بنك/مصرف ${co} عن النتائج المالية الأولية للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"} (${extra.period_months||"ثلاثة/ستة/تسعة/اثني عشر"} شهرًا)`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"period_months", label:"مدة الفترة", type:"text"},
      {key:"commission_income_q", label:"دخل العمولات الخاصة (تمويل واستثمار) خلال الربع الحالي: مقابل المماثل والسابق ونسب التغير", type:"textarea"},
      {key:"net_commission_q", label:"صافي دخل العمولات الخاصة خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"operations_profit_q", label:"إجمالي ربح (خسارة) العمليات خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"net_profit_q", label:"صافي الربح (الخسارة) خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"comprehensive_income_q", label:"إجمالي الدخل الشامل خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"credit_provision_q", label:"مخصص خسائر الائتمان المتوقعة خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"period_metrics", label:"دخل العمولات، صافي دخل العمولات، ربح العمليات، صافي الربح، الدخل الشامل، مخصص الائتمان — خلال الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"eps_period", label:"ربحية (خسارة) السهم خلال الفترة الحالية مقابل المماثلة", type:"text"},
      {key:"equity_period", label:"إجمالي حقوق الملكية خلال الفترة الحالية مقابل المماثلة ونسبة التغير", type:"text"},
      {key:"balance_sheet_items", label:"الموجودات، الاستثمارات، محفظة القروض والسلف، ودائع العملاء بنهاية الفترة: مقابل المماثلة ونسب التغير", type:"textarea"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية الفترة (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"reasons_q", label:"أسباب الارتفاع (الانخفاض) بدخل العمولات، صافي الربح، ومخصص الائتمان — الربع الحالي مقابل المماثل ومقابل السابق", type:"textarea"},
      {key:"reasons_period", label:"أسباب الارتفاع (الانخفاض) بدخل العمولات، صافي الربح، ومخصص الائتمان — الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات (فحص استنتاج)", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى يرغب البنك بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية السنوية لشركات التأمين": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن النتائج المالية السنوية المنتهية في ${extra.period_end||"XXXX/XX/XX"}`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"insurance_revenue", label:"إيراد التأمين: الحالي مقابل السابق ونسبة التغير", type:"text"},
      {key:"insurance_service_result", label:"نتيجة خدمات التأمين: نفس المقارنة", type:"text"},
      {key:"insurance_results_profit", label:"صافي أرباح (خسائر) نتائج التأمين: نفس المقارنة", type:"text"},
      {key:"investment_results_profit", label:"صافي أرباح (خسائر) نتائج الاستثمار: نفس المقارنة", type:"text"},
      {key:"insurance_finance_expense", label:"صافي مصاريف تمويل التأمين (إن وجد): نفس المقارنة", type:"text"},
      {key:"net_profit_zakat", label:"صافي الربح (الخسارة) بعد الزكاة العائد للمساهمين: نفس المقارنة", type:"text"},
      {key:"comprehensive_income", label:"إجمالي الدخل الشامل: نفس المقارنة", type:"text"},
      {key:"eps", label:"ربحية (خسارة) السهم: الحالي مقابل السابق", type:"text"},
      {key:"equity", label:"إجمالي حقوق الملكية: نفس المقارنة", type:"text"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية العام (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"revenue_reason", label:"سبب الارتفاع (الانخفاض) بالإيرادات", type:"textarea"},
      {key:"profit_reason", label:"سبب الارتفاع (الانخفاض) بصافي الربح", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى ترغب الشركة بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية الأولية لشركات التأمين": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن النتائج المالية الأولية للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"} (${extra.period_months||"ثلاثة/ستة/تسعة/اثني عشر"} شهرًا)`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"period_months", label:"مدة الفترة", type:"text"},
      {key:"insurance_revenue_q", label:"إيراد التأمين خلال الربع الحالي: مقابل المماثل والسابق ونسب التغير", type:"textarea"},
      {key:"insurance_service_result_q", label:"نتيجة خدمات التأمين خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"insurance_results_profit_q", label:"صافي أرباح (خسائر) نتائج التأمين خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"investment_results_profit_q", label:"صافي أرباح (خسائر) نتائج الاستثمار خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"insurance_finance_expense_q", label:"صافي مصاريف تمويل التأمين خلال الربع الحالي (إن وجد): نفس المقارنات", type:"textarea"},
      {key:"net_profit_q", label:"صافي الربح (الخسارة) بعد الزكاة خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"comprehensive_income_q", label:"إجمالي الدخل الشامل خلال الربع الحالي: نفس المقارنات", type:"textarea"},
      {key:"period_metrics", label:"إيراد التأمين، نتيجة الخدمات، أرباح التأمين والاستثمار، صافي الربح — خلال الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"eps_period", label:"ربحية (خسارة) السهم خلال الفترة الحالية مقابل المماثلة", type:"text"},
      {key:"equity_period", label:"إجمالي حقوق الملكية خلال الفترة الحالية مقابل المماثلة", type:"text"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية الفترة (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"reasons_q", label:"أسباب الارتفاع (الانخفاض) بالإيرادات وصافي الربح — الربع الحالي مقابل المماثل ومقابل السابق", type:"textarea"},
      {key:"reasons_period", label:"أسباب الارتفاع (الانخفاض) بالإيرادات وصافي الربح — الفترة الحالية مقابل المماثلة", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات (فحص استنتاج)", type:"text"},
      {key:"auditor_note", label:"أي ملاحظة وردت بتقرير مراجع الحسابات (إن وجدت)", type:"textarea"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى ترغب الشركة بإضافتها", type:"textarea"},
    ]
  },
  "النتائج المالية نصف السنوية (السوق الموازية)": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن النتائج المالية الأولية للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"} (ستة أشهر)`,
    fields: [
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"revenue", label:"المبيعات/الإيرادات خلال الفترة الحالية مقابل المماثلة ونسبة التغير", type:"text"},
      {key:"net_profit", label:"صافي الربح (الخسارة) خلال الفترة الحالية: نفس المقارنة", type:"text"},
      {key:"eps", label:"ربحية (خسارة) السهم خلال الفترة الحالية مقابل المماثلة", type:"text"},
      {key:"equity", label:"إجمالي حقوق الملكية خلال الفترة الحالية مقابل المماثلة ونسبة التغير", type:"text"},
      {key:"accumulated_losses", label:"الخسائر المتراكمة بنهاية الفترة (إن وجدت)", type:"text"},
      {key:"fair_value_gains", label:"مكاسب (خسائر) التغير بالقيمة العادلة للعقارات الاستثمارية (إن ينطبق)", type:"text"},
      {key:"revenue_reason", label:"سبب الارتفاع (الانخفاض) بالمبيعات/الإيرادات", type:"textarea"},
      {key:"profit_reason", label:"سبب الارتفاع (الانخفاض) بصافي الربح", type:"textarea"},
      {key:"auditor_report_type", label:"نوع تقرير مراجع الحسابات (فحص استنتاج)", type:"text"},
      {key:"reclassification", label:"في حال إعادة تبويب أرقام المقارنة، يُذكر ذلك هنا", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى ترغب الشركة بإضافتها", type:"textarea"},
    ]
  },
  "تحديث مستند القوائم المالية بموقع تداول": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن تحديث مستند القوائم المالية في موقع تداول (${extra.period_type||"السنوية/الأولية"}) للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"}`,
    fields: [
      {key:"period_type", label:"نوع الفترة (السنوية/الأولية) ومدتها إن أولية", type:"text"},
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"reason", label:"سبب تحديث القوائم المالية", type:"textarea"},
      {key:"change", label:"التغيير الحاصل بالقوائم المالية", type:"textarea"},
      {key:"link", label:"رابط القوائم المالية بصفحة الشركة على موقع تداول", type:"text"},
    ]
  },
  "عدم التمكن من نشر النتائج المالية": {
    category: "النتائج المالية",
    title: (co, extra) => `تعلن شركة ${co} عن عدم تمكنها من نشر النتائج المالية (${extra.period_type||"الأولية/السنوية"}) للفترة المنتهية في ${extra.period_end||"XXXX/XX/XX"}`,
    fields: [
      {key:"period_type", label:"نوع الفترة (السنوية/الأولية) ومدتها إن أولية", type:"text"},
      {key:"period_end", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"reasons", label:"أسباب ومعوقات عدم التمكن من النشر خلال المدة النظامية", type:"textarea"},
      {key:"timeline", label:"جدول زمني للإجراءات المتخذة أو التي ستُتخذ لنشر النتائج", type:"textarea"},
      {key:"expected_date", label:"التاريخ المتوقَّع لنشر النتائج المالية", type:"date"},
      {key:"suspension_date", label:"تاريخ تعليق تداول الأوراق المالية المدرجة", type:"date"},
    ],
    fixedNote: "ستُطبَّق على الشركة إجراءات تعليق تداول الأوراق المالية المدرجة وفقًا لقواعد الإدراج، وستُعلن الشركة عن تطورات عدم التمكن من نشر النتائج المالية شهريًا، مع الالتزام بالإعلان دون تأخير حال وجود أي تطورات جوهرية."
  },
  "توصية بزيادة رأس المال عبر حقوق أولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بزيادة رأس مال الشركة عن طريق طرح أسهم حقوق أولوية`,
    fields: [
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"total_amount", label:"المبلغ الإجمالي المراد جمعه (دون ذكر عدد/قيمة الأسهم أو نسبتها)", type:"text"},
      {key:"reasons", label:"أسباب الزيادة في رأس المال", type:"textarea"},
      {key:"eligibility_date", label:"تاريخ الأحقية (يوم انعقاد الجمعية العامة غير العادية)", type:"date"},
    ],
    fixedNote: "سيتم الإعلان عند تعيين مستشار مالي للطرح، وكذلك عند تقديم ملف طلب زيادة رأس المال إلى هيئة السوق المالية لأخذ موافقتها."
  },
  "تعيين مستشار مالي — حقوق أولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن تعيين مستشار مالي لإدارة الاكتتاب في أسهم حقوق الأولوية`,
    fields: [
      {key:"advisor_name", label:"اسم المستشار المالي", type:"text"},
      {key:"appoint_date", label:"تاريخ تعيين المستشار المالي", type:"date"},
      {key:"change_note", label:"في حال تغيير المستشار الحالي: الاسم الجديد وسبب التغيير", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى", type:"textarea"},
    ]
  },
  "تقديم ملف طلب زيادة رأس المال للهيئة — حقوق أولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن تقديم ملف طلب زيادة رأس مالها عن طريق طرح أسهم حقوق أولوية إلى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم ملف الطلب للهيئة", type:"date"},
    ],
    fixedNote: "إشارة إلى موضوع الطلب، وإلى الإعلان السابق عن توصية مجلس الإدارة بزيادة رأس المال عن طريق طرح أسهم حقوق أولوية."
  },
  "التطورات الجوهرية لطلب زيادة رأس المال — حقوق أولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن التطورات في ملف زيادة رأس مالها عن طريق طرح أسهم حقوق أولوية لدى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم الملف للهيئة", type:"date"},
      {key:"status", label:"حالة الطلب لدى الهيئة (استيفاء المتطلبات / تحت الدراسة / إلخ)", type:"textarea"},
      {key:"developments", label:"أي تطورات جوهرية أخرى (سحب الملف، رفضه، تعليقه، مع الأسباب)", type:"textarea"},
    ]
  },
  "تحديد فترة تداول حقوق الأولوية والاكتتاب": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن تحديد فترة تداول حقوق الأولوية والاكتتاب في الأسهم الجديدة`,
    fields: [
      {key:"start_date", label:"تاريخ بداية فترة تداول حقوق الأولوية والاكتتاب", type:"date"},
      {key:"end_date", label:"تاريخ نهاية الفترة", type:"date"},
      {key:"remaining_offer_details", label:"تفاصيل الطرح المتبقي (كسور الأسهم للمستثمرين المؤسسيين)", type:"textarea"},
      {key:"non_participants_note", label:"تنبيه للمستثمرين غير الراغبين بالاكتتاب لبيع حقوقهم أثناء الفترة", type:"textarea"},
      {key:"tadawul_link", label:"روابط تداول (تذبذب الأسعار، القيمة الإرشادية، آلية التداول)", type:"textarea"},
      {key:"prospectus_link", label:"رابط نشرة الإصدار", type:"text"},
    ]
  },
  "إعلان تذكيري ببدء فترة تداول حقوق الأولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `إعلان تذكيري من شركة ${co} عن بدء فترة تداول حقوق الأولوية والاكتتاب في الأسهم الجديدة`,
    fields: [
      {key:"start_date", label:"تاريخ بدء فترة التداول والاكتتاب", type:"date"},
      {key:"trading_end_date", label:"تاريخ نهاية فترة تداول حقوق الأولوية", type:"date"},
      {key:"subscription_end_date", label:"تاريخ نهاية فترة الاكتتاب بالأسهم الجديدة", type:"date"},
    ]
  },
  "إعلان تذكيري بآخر يوم لتداول حقوق الأولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `إعلان تذكيري من شركة ${co} عن آخر يوم لتداول حقوق الأولوية وآخر يوم للاكتتاب في الأسهم الجديدة`,
    fields: [
      {key:"trading_end_date", label:"تاريخ نهاية فترة تداول حقوق الأولوية", type:"date"},
      {key:"subscription_end_date", label:"تاريخ نهاية فترة الاكتتاب بالأسهم الجديدة", type:"date"},
    ]
  },
  "نتائج تداول حقوق الأولوية وتفاصيل بيع الأسهم المتبقية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن نتائج تداول حقوق الأولوية والاكتتاب في الأسهم الجديدة وتفاصيل عملية بيع الأسهم التي لم يُكتتب فيها`,
    fields: [
      {key:"subscribed_shares", label:"عدد الأسهم المكتتب بها وقيمتها ونسبة التغطية", type:"text"},
      {key:"remaining_offer_mechanism", label:"تفاصيل آلية الطرح المتبقي وتاريخ بدايته ونهايته", type:"textarea"},
      {key:"remaining_offer_hours", label:"ساعات فترة الطرح المتبقي", type:"text"},
    ]
  },
  "نتائج الطرح المتبقي وتخصيص أسهم حقوق الأولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن نتائج الطرح المتبقي وتخصيص أسهم حقوق الأولوية`,
    fields: [
      {key:"sold_shares", label:"عدد الأسهم المباعة", type:"text"},
      {key:"total_proceeds", label:"إجمالي المبلغ العائد من بيع الأسهم غير المكتتبة وكسور الأسهم (إن وجدت)", type:"text"},
      {key:"avg_price", label:"متوسط سعر البيع للأسهم المباعة", type:"text"},
      {key:"compensation_net", label:"صافي مبلغ التعويضات العائد لملاك حقوق الأولوية وكسور الأسهم", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع الأسهم بحسابات المساهمين", type:"date"},
    ]
  },
  "توزيع مبالغ التعويض لحملة حقوق الأولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن توزيع مبالغ التعويض لحملة حقوق الأولوية الذين لم يمارسوا حقهم في الاكتتاب`,
    fields: [
      {key:"distribution_date", label:"تاريخ توزيع التعويض", type:"date"},
      {key:"total_amount", label:"إجمالي المبلغ الذي سيُوزَّع", type:"text"},
      {key:"delivery_method", label:"طريقة تسليم التعويض", type:"textarea"},
      {key:"deposit_party", label:"اسم وطريقة الاتصال بالجهة المسؤولة عن الإيداع", type:"text"},
    ]
  },
  "اختلاف استخدام متحصلات إصدار حقوق الأولوية": {
    category: "زيادة رأس المال — حقوق أولوية",
    title: (co) => `تعلن شركة ${co} عن تطورات استخدام المتحصلات من إصدار أسهم حقوق الأولوية`,
    fields: [
      {key:"differences", label:"الاختلافات (5% فأكثر) بين الاستخدام الفعلي والمُفصَح عنه بنشرة الإصدار وأسبابها", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى مهمة", type:"textarea"},
    ]
  },

  "توصية بزيادة رأس المال مع وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بزيادة رأس مالها عن طريق طرح أسهم مع وقف العمل بحق الأولوية`,
    fields: [
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"total_amount", label:"المبلغ الإجمالي المراد جمعه (دون ذكر عدد/قيمة الأسهم)", type:"text"},
      {key:"reasons", label:"أسباب الزيادة في رأس المال", type:"textarea"},
      {key:"eligibility_date", label:"تاريخ الأحقية بالتصويت (يقتصر على العملاء المؤهلين والمؤسسيين)", type:"date"},
    ],
    fixedNote: "سيتم الإعلان عند تعيين مستشار مالي للطرح، وكذلك عند تقديم ملف طلب زيادة رأس المال إلى هيئة السوق المالية لأخذ موافقتها."
  },
  "تعيين مستشار مالي — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن تعيين مستشار مالي لإدارة الاكتتاب في أسهم مع وقف العمل بحق الأولوية`,
    fields: [
      {key:"advisor_name", label:"اسم المستشار المالي", type:"text"},
      {key:"appoint_date", label:"تاريخ تعيين المستشار المالي", type:"date"},
      {key:"change_note", label:"في حال تغيير المستشار الحالي: الاسم الجديد وسبب التغيير", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى", type:"textarea"},
    ]
  },
  "تقديم ملف طلب زيادة رأس المال للهيئة — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن تقديم ملف طلب زيادة رأس مال الشركة عن طريق طرح أسهم مع وقف العمل بحق الأولوية إلى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم ملف الطلب للهيئة", type:"date"},
    ],
    fixedNote: "إشارة إلى موضوع الطلب، وإلى الإعلان السابق عن توصية مجلس الإدارة بزيادة رأس المال عن طريق طرح أسهم مع وقف العمل بحق الأولوية."
  },
  "التطورات الجوهرية لطلب زيادة رأس المال — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن التطورات في ملف زيادة رأس مال الشركة عن طريق طرح أسهم مع وقف العمل بحق الأولوية لدى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم الملف للهيئة", type:"date"},
      {key:"status", label:"حالة الطلب لدى الهيئة", type:"textarea"},
      {key:"developments", label:"أي تطورات جوهرية أخرى (سحب/رفض/تعليق مع الأسباب)", type:"textarea"},
    ]
  },
  "تحديد فترة الاكتتاب — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن تحديد فترة الاكتتاب في الأسهم الجديدة لزيادة رأس المال مع وقف العمل بحق الأولوية`,
    fields: [
      {key:"start_date", label:"تاريخ بداية فترة الاكتتاب (يقتصر على العملاء المؤهلين والمؤسسيين)", type:"date"},
      {key:"end_date", label:"تاريخ نهاية فترة الاكتتاب", type:"date"},
      {key:"extension_note", label:"إمكانية تمديد فترة الطرح وحق التعديل/الإلغاء للمكتتبين قبل التمديد", type:"textarea"},
      {key:"prospectus_link", label:"رابط نشرة الإصدار", type:"text"},
    ]
  },
  "نتائج اكتتاب الأسهم الجديدة — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن نتائج عملية الاكتتاب في الأسهم الجديدة من خلال زيادة رأس المال مع وقف العمل بحق الأولوية`,
    fields: [
      {key:"subscribed_shares", label:"عدد الأسهم المكتتب بها وقيمتها ونسبة التغطية وإجمالي المبلغ العائد", type:"textarea"},
      {key:"offer_price", label:"سعر الطرح", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع الأسهم الجديدة بحسابات المكتتبين", type:"date"},
      {key:"extension_details", label:"تفاصيل قرار تمديد فترة الطرح إن وجد وحق الإلغاء/التعديل للمكتتبين قبله", type:"textarea"},
    ],
    fixedNote: "يجب على المستثمرين الذين امتلكوا أسهم زيادة رأس المال مع وقف العمل بحق الأولوية عدم التصرف في تلك الأسهم خلال الأشهر الستة التالية لتاريخ إدراجها."
  },
  "نتائج الاكتتاب بعد تمديد فترة الطرح — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن نتائج الاكتتاب في الأسهم الجديدة بعد تمديد فترة الطرح`,
    fields: [
      {key:"sold_after_extension", label:"عدد الأسهم المباعة بعد التمديد وإجمالي قيمتها ونسبة التغطية", type:"textarea"},
      {key:"total_subscribed", label:"إجمالي عدد وقيمة الأسهم المكتتب فيها ونسبة التغطية والمبلغ الإجمالي", type:"textarea"},
      {key:"sale_price", label:"سعر البيع للأسهم المباعة", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع الأسهم الجديدة بحسابات المكتتبين", type:"date"},
    ]
  },
  "اختلاف استخدام متحصلات إصدار — وقف حق الأولوية": {
    category: "زيادة رأس المال — وقف حق الأولوية",
    title: (co) => `تعلن شركة ${co} عن تطورات استخدام المتحصلات من إصدار أسهم مع وقف العمل بحق الأولوية`,
    fields: [
      {key:"differences", label:"الاختلافات (5% فأكثر) بين الاستخدام الفعلي والمُفصَح عنه بنشرة الإصدار وأسبابها", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى مهمة", type:"textarea"},
    ]
  },

  "توصية بزيادة رأس المال عبر أسهم منحة": {
    category: "أسهم منحة",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بزيادة رأس مال الشركة عن طريق منح أسهم`,
    fields: [
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"capital_before_after", label:"رأس مال الشركة قبل الزيادة وبعدها", type:"text"},
      {key:"increase_pct", label:"نسبة الزيادة في رأس المال", type:"text"},
      {key:"shares_before_after", label:"عدد الأسهم قبل الزيادة وبعدها", type:"text"},
      {key:"reasons", label:"أسباب الزيادة في رأس المال", type:"textarea"},
      {key:"shares_per_share", label:"عدد الأسهم الممنوحة لكل سهم", type:"text"},
      {key:"reserves", label:"طبيعة وقيمة الاحتياطيات المستخدَمة بإصدار الرسملة", type:"textarea"},
      {key:"eligibility_date", label:"تاريخ الأحقية (يوم الاستحقاق)", type:"date"},
    ],
    fixedNote: "في حال وجود كسور أسهم: ستُجمع بمحفظة واحدة لجميع حملة الأسهم وتُباع بسعر السوق، ثم تُوزَّع قيمتها على حملة الأسهم المستحقين للمنحة كل بحسب حصته. تخضع الزيادة وعدد الأسهم الممنوحة لموافقة الجهات الرسمية والجمعية العامة غير العادية."
  },
  "انتهاء بيع كسور الأسهم (منحة)": {
    category: "أسهم منحة",
    title: (co) => `تعلن شركة ${co} عن إيداع المبالغ العائدة من بيع كسور الأسهم الناتجة عن زيادة رأس المال في حسابات المساهمين المستحقين`,
    fields: [
      {key:"completion_date", label:"تاريخ الانتهاء من عملية بيع كسور الأسهم", type:"date"},
      {key:"sold_shares", label:"عدد الأسهم المباعة", type:"text"},
      {key:"proceeds", label:"المبلغ العائد من بيع كسور الأسهم", type:"text"},
      {key:"avg_price", label:"متوسط سعر البيع لكل سهم", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع المبالغ بحسابات المساهمين المستحقين", type:"date"},
      {key:"deposit_party", label:"اسم وطريقة الاتصال بالجهة المسؤولة عن التوزيع", type:"text"},
    ]
  },
  "عدم انتهاء بيع كسور الأسهم (منحة)": {
    category: "أسهم منحة",
    title: (co) => `تعلن شركة ${co} عن عدم الانتهاء من عملية بيع كسور الأسهم الناتجة عن زيادة رأس المال خلال المدة المحددة نظامًا`,
    fields: [
      {key:"reason", label:"سبب عدم تمكن الشركة من إتمام العملية خلال المدة النظامية", type:"textarea"},
      {key:"expected_date", label:"التاريخ المتوقَّع للانتهاء والتوزيع", type:"date"},
    ]
  },

  "توصية بتخفيض رأس المال": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بتخفيض رأس مال الشركة`,
    fields: [
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"capital_before_after", label:"رأس مال الشركة قبل التخفيض وبعده", type:"text"},
      {key:"reduction_pct", label:"نسبة التخفيض في رأس المال", type:"text"},
      {key:"shares_before_after", label:"عدد الأسهم قبل التخفيض وبعده", type:"text"},
      {key:"reason_method", label:"سبب وطريقة تخفيض رأس المال", type:"textarea"},
      {key:"impact", label:"أثر جوهري للتخفيض في الالتزامات أو العمليات أو الأداء المالي/التشغيلي/التنظيمي", type:"textarea"},
    ],
    fixedNote: "تاريخ التخفيض هو نهاية ثاني يوم تداول يلي انعقاد الجمعية العامة غير العادية التي يتقرر فيها التخفيض. يخضع لموافقة الجهات الرسمية والجمعية العامة، وسيتم الإعلان عند تعيين مستشار مالي وعند تقديم طلب التخفيض للهيئة."
  },
  "تعيين مستشار مالي لتخفيض رأس المال": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن تعيين مستشار مالي لتخفيض رأس المال`,
    fields: [
      {key:"advisor_name", label:"اسم المستشار المالي", type:"text"},
      {key:"appoint_date", label:"تاريخ تعيين المستشار المالي", type:"date"},
      {key:"change_note", label:"في حال تغيير المستشار الحالي: الاسم الجديد وسبب التغيير", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى", type:"textarea"},
    ]
  },
  "تقديم ملف طلب تخفيض رأس المال للهيئة": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن تقديم ملف طلب تخفيض رأس مال الشركة إلى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم ملف الطلب للهيئة", type:"date"},
    ],
    fixedNote: "إشارة إلى موضوع الطلب، وإلى الإعلان السابق عن توصية مجلس الإدارة بتخفيض رأس المال."
  },
  "التطورات الجوهرية لملف طلب تخفيض رأس المال": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن التطورات في ملف طلب تخفيض رأس المال لدى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم الملف للهيئة", type:"date"},
      {key:"status", label:"حالة الطلب لدى الهيئة", type:"textarea"},
      {key:"developments", label:"أي تطورات جوهرية أخرى (سحب/رفض/تعليق مع الأسباب)", type:"textarea"},
    ]
  },
  "انتهاء بيع كسور الأسهم (تخفيض)": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن إيداع المبالغ العائدة من بيع كسور الأسهم الناتجة عن تخفيض رأس مال الشركة في حسابات المساهمين المستحقين`,
    fields: [
      {key:"completion_date", label:"تاريخ الانتهاء من عملية بيع كسور الأسهم", type:"date"},
      {key:"sold_shares", label:"عدد الأسهم المباعة", type:"text"},
      {key:"proceeds", label:"المبلغ العائد من بيع كسور الأسهم", type:"text"},
      {key:"avg_price", label:"متوسط سعر البيع لكل سهم", type:"text"},
      {key:"deposit_date", label:"تاريخ إيداع المبالغ بحسابات المساهمين المستحقين", type:"date"},
      {key:"deposit_party", label:"اسم وطريقة الاتصال بالجهة المسؤولة عن التوزيع", type:"text"},
    ]
  },
  "عدم انتهاء بيع كسور الأسهم (تخفيض)": {
    category: "تخفيض رأس المال",
    title: (co) => `تعلن شركة ${co} عن عدم الانتهاء من عملية بيع كسور الأسهم الناتجة عن تخفيض رأس مال الشركة خلال المدة المذكورة بتعميم المساهمين`,
    fields: [
      {key:"reason", label:"سبب عدم تمكن الشركة من إتمام العملية", type:"textarea"},
      {key:"expected_date", label:"التاريخ المتوقَّع للانتهاء والتوزيع", type:"date"},
    ]
  },

  "توصية بزيادة رأس المال عبر تحويل الديون": {
    category: "زيادة رأس المال — تحويل الديون",
    title: (co) => `تعلن شركة ${co} عن توصية مجلس إدارة الشركة بزيادة رأس مال الشركة عن طريق تحويل الديون`,
    fields: [
      {key:"meeting_date", label:"تاريخ اجتماع مجلس الإدارة", type:"date"},
      {key:"total_debt", label:"المبلغ الإجمالي للديون المراد تحويلها (دون ذكر عدد/قيمة الأسهم)", type:"text"},
      {key:"reasons", label:"أسباب الزيادة في رأس المال", type:"textarea"},
    ],
    fixedNote: "تخضع الزيادة لموافقة الجهات الرسمية والجمعية العامة غير العادية، وسيتم الإعلان عند تعيين مستشار مالي للطرح وعند تقديم طلب الزيادة للهيئة."
  },
  "تعيين مستشار مالي — تحويل الديون": {
    category: "زيادة رأس المال — تحويل الديون",
    title: (co) => `تعلن شركة ${co} عن تعيين مستشار مالي لإدارة ملف طلب زيادة رأس مال الشركة عن طريق تحويل الديون`,
    fields: [
      {key:"advisor_name", label:"اسم المستشار المالي", type:"text"},
      {key:"appoint_date", label:"تاريخ تعيين المستشار المالي", type:"date"},
      {key:"change_note", label:"في حال تغيير المستشار الحالي: الاسم الجديد وسبب التغيير", type:"textarea"},
      {key:"other_info", label:"أي معلومات أخرى", type:"textarea"},
    ]
  },
  "تقديم ملف طلب زيادة رأس المال للهيئة — تحويل الديون": {
    category: "زيادة رأس المال — تحويل الديون",
    title: (co) => `تعلن شركة ${co} عن تقديم ملف طلب زيادة رأس مال الشركة عن طريق تحويل الديون إلى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم ملف الطلب للهيئة", type:"date"},
    ],
    fixedNote: "إشارة إلى موضوع الطلب، وإلى الإعلان السابق عن توصية مجلس الإدارة بزيادة رأس المال عن طريق تحويل الديون."
  },
  "التطورات الجوهرية لطلب زيادة رأس المال — تحويل الديون": {
    category: "زيادة رأس المال — تحويل الديون",
    title: (co) => `تعلن شركة ${co} عن التطورات في ملف زيادة رأس مال الشركة عن طريق تحويل الديون لدى هيئة السوق المالية`,
    fields: [
      {key:"submit_date", label:"تاريخ تقديم الملف للهيئة", type:"date"},
      {key:"status", label:"حالة الطلب لدى الهيئة", type:"textarea"},
      {key:"developments", label:"أي تطورات جوهرية أخرى (سحب/رفض/تعليق مع الأسباب)", type:"textarea"},
    ]
  },

  "استحواذ — المرحلة الأولى: مذكرة تفاهم": {
    category: "الاستحواذ عبر زيادة رأس المال",
    title: (co, extra) => `تعلن شركة ${co} عن توقيعها مذكرة تفاهم مع ${extra.other_party||"...."} للاستحواذ على/شراء ${extra.target||"...."}`,
    fields: [
      {key:"other_party", label:"اسم الطرف الآخر", type:"text"},
      {key:"target", label:"الشركة/الأصل محل الاستحواذ", type:"text"},
      {key:"sign_date", label:"تاريخ توقيع مذكرة التفاهم", type:"date"},
      {key:"duration", label:"مدة المذكرة", type:"text"},
      {key:"advisors", label:"المستشار المالي لكل طرف", type:"text"},
      {key:"key_terms", label:"أهم شروط المذكرة", type:"textarea"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
      {key:"planned_actions", label:"الإجراءات التي ستتخذها الشركة خلال مدة الاتفاقية", type:"textarea"},
    ],
    fixedNote: "تخضع زيادة رأس المال بغرض الاستحواذ/الشراء لموافقة الجهات الرسمية والجمعية العامة غير العادية."
  },
  "استحواذ — المرحلة الثانية: توقيع الاتفاقية": {
    category: "الاستحواذ عبر زيادة رأس المال",
    title: (co, extra) => `تعلن شركة ${co} عن توقيعها اتفاقية استحواذ على ${extra.target||"...."} عن طريق زيادة رأس مال الشركة من خلال إصدار أسهم لملاك ${extra.target||"...."}`,
    fields: [
      {key:"target", label:"اسم الشركة محل الاستحواذ / الأصل محل الشراء", type:"text"},
      {key:"capital_increase", label:"حجم ونسبة زيادة رأس المال وعدد الأسهم قبلها وبعدها", type:"textarea"},
      {key:"target_value", label:"قيمة الشركة محل الاستحواذ / الأصل", type:"text"},
      {key:"listed_company_value", label:"قيمة الشركة المدرجة", type:"text"},
      {key:"exchange_ratio", label:"معادلة (نسبة) مبادلة الأسهم والتأثيرات/المخاطر المحتملة", type:"textarea"},
      {key:"ownership_after", label:"نسبة ملكية الشركة المدرجة بالمستحوَذ عليها بعد الإصدار", type:"text"},
      {key:"new_owners_pct", label:"نسبة ملكية الشركاء الذين ستصدر لهم أسهم جديدة", type:"text"},
      {key:"sign_date", label:"تاريخ توقيع اتفاقية الاستحواذ", type:"date"},
      {key:"material_terms", label:"أي معلومات أو شروط جوهرية تؤثر بسعر السهم", type:"textarea"},
      {key:"related_party", label:"أطراف ذات علاقة (إن وجدت)", type:"textarea"},
      {key:"end_date_terms", label:"تاريخ انتهاء الاتفاقية وشروط فسخها", type:"text"},
    ],
    fixedNote: "إذا كانت الشركة محل الاستحواذ شركة مدرجة، يجب التقيد بأحكام لائحة الاندماج والاستحواذ. تخضع زيادة رأس المال لموافقة الجهات الرسمية والجمعية العامة غير العادية."
  },
  "استحواذ — المرحلة الثالثة: انتهاء الإجراءات": {
    category: "الاستحواذ عبر زيادة رأس المال",
    title: (co, extra) => `تعلن شركة ${co} عن انتهائها من إجراءات الاستحواذ على/شراء ${extra.target||"...."}`,
    fields: [
      {key:"target", label:"الشركة/الأصل محل الاستحواذ", type:"text"},
      {key:"completion_date", label:"تاريخ انتهاء إجراءات الاستحواذ", type:"date"},
      {key:"summary", label:"ملخّص عن الاستحواذ/الشراء", type:"textarea"},
      {key:"related_party", label:"الأطراف ذات العلاقة", type:"textarea"},
      {key:"financial_impact", label:"الأثر المالي", type:"textarea"},
      {key:"ownership_transfer_date", label:"تاريخ انتهاء نقل الملكية والمستندات المعدَّلة (أو الإشارة لإعلان لاحق)", type:"text"},
    ]
  },
  "الاتفاق على الاستحواذ العكسي": {
    category: "الاستحواذ العكسي",
    title: (co, extra) => `تعلن شركة ${co} عن الاتفاق على شروط الاستحواذ العكسي مع ${extra.other_party||"...."} للاستحواذ على ${extra.target||"...."}`,
    fields: [
      {key:"other_party", label:"اسم الطرف الآخر", type:"text"},
      {key:"deal_details", label:"تفاصيل الصفقة", type:"textarea"},
      {key:"target_business", label:"نبذة عن أعمال الشركة أو الأصل محل الصفقة", type:"textarea"},
      {key:"consideration", label:"العِوَض ومدى استيفائه شروط الاستحواذ العكسي (بما فيها تأجيل العِوَض)", type:"textarea"},
      {key:"total_assets_value", label:"قيمة إجمالي الأصول محل الصفقة", type:"text"},
      {key:"related_profits", label:"الأرباح المتعلقة بالأصول محل الصفقة", type:"text"},
      {key:"impact_on_listed_co", label:"أثر الصفقة في الشركة المدرجة والمنافع المتوقعة", type:"textarea"},
      {key:"service_contracts", label:"تفاصيل عقود الخدمات لأعضاء مجلس الإدارة المقترحين", type:"textarea"},
    ],
    fixedNote: "يخضع الاستحواذ العكسي لموافقة الجهات الرسمية والجمعية العامة غير العادية."
  },

  "التحول لنموذج القيمة العادلة للعقارات": {
    category: "القيمة العادلة للعقارات",
    title: (co) => `تعلن شركة ${co} عن صدور قرار مجلس إدارة الشركة باستخدام نموذج القيمة العادلة أو إعادة التقييم لقياس العقارات والعقارات الاستثمارية`,
    fields: [
      {key:"decision_date", label:"تاريخ قرار مجلس الإدارة", type:"date"},
      {key:"net_asset_impact", label:"الأثر المالي المتوقَّع بصافي الأصول", type:"text"},
      {key:"start_date", label:"تاريخ بداية الأثر المالي المتوقَّع", type:"date"},
    ],
    fixedNote: "الإشارة إلى أن استخدام السياسة المحاسبية الجديدة لا ينتج عنه تدفق نقدي داخل الشركة."
  },
};

const ANNOUNCEMENT_CATEGORIES = [...new Set(Object.values(ANNOUNCEMENT_TYPES).map(t => t.category))];

function openStandaloneAnnouncementForm(){
  document.getElementById("annTypeSearch").value = "";
  renderAnnouncementTypeList();
  openM("m-announcement-type-picker");
}

async function pickAgmAnnouncementType(type){
  pendingAnnouncementType = type;
  closeM("m-announcement-type-picker");
  const { data: meetings } = await sb.from("meetings").select("id,title,meeting_date")
    .eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").eq("is_listed_agm", true)
    .order("meeting_date",{ascending:false});
  const sel = document.getElementById("agmPickerSelect");
  if(!meetings || meetings.length===0){
    sel.innerHTML = '<option value="">لا توجد جمعيات مدرجة بعد — أنشئ جمعية أولًا من صفحة "الجمعية العامة"</option>';
  } else {
    sel.innerHTML = meetings.map(m => `<option value="${m.id}">${orgEsc(m.title||"جمعية")} — ${m.meeting_date||""}</option>`).join("");
  }
  document.getElementById("agmPickerTitle").textContent =
    `اختر الجمعية العامة — إعلان ${type}`;
  openM("m-agm-picker-for-announcement");
}

function confirmAgmPickerForAnnouncement(){
  const meetingId = Number(document.getElementById("agmPickerSelect").value);
  if(!meetingId){ alert("اختر جمعية أولًا"); return; }
  currentAGMModalMeetingId = meetingId;
  closeM("m-agm-picker-for-announcement");
  openTadawulAnnouncementForm(pendingAnnouncementType);
}

async function loadAnnouncementsPageList(){
  const box = document.getElementById("announcementsPageList");
  const intro = document.getElementById("announcementsPageIntro");
  if(intro){
    intro.textContent = currentCompanyType === "مساهمة مدرجة"
      ? 'تولّد مسودة PDF بالصياغة الرسمية المطلوبة — ترسلها لموظف تداول المختص لاعتمادها ونشرها؛ منصتنا لا تنشر مباشرة على تداول.'
      : 'مستندات رسمية احترافية بصياغة معتمدة — تُستخدم للتواصل مع مساهميك ومستثمريك، أو كأرشيف رسمي داخلي، حتى لو شركتك غير مدرجة حاليًا.';
  }
  const { data, error } = await sb.from("tadawul_announcements").select("*, meetings(title,meeting_date)")
    .eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد إعلانات مولَّدة بعد.</div>'; return; }
  box.innerHTML = data.map(a => {
    const isListedCo = currentCompanyType === "مساهمة مدرجة";
    const needsTadawulConfirm = isListedCo && !a.confirmed_on_tadawul;
    return `<div class="card" style="margin-bottom:10px">
    <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:800;font-size:12.5px">${a.announcement_type}${a.meetings?` — ${a.meetings.title||''}`:''}</div>
        <div style="font-size:11px;color:var(--gray3)">${new Date(a.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}
          ${isListedCo ? (a.confirmed_on_tadawul ? '<span style="color:var(--green)"> · ✅ مؤكَّد بتداول</span>' : '<span style="color:var(--gray3)"> · ⏳ بانتظار التأكيد</span>') : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <a href="${a.file_url}" target="_blank" class="btn-xs primary"><span class="ico-i ico-inbox"></span>عرض</a>
        ${needsTadawulConfirm ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 10px;font-size:10.5px;cursor:pointer" onclick="confirmTadawulAnnouncement(${a.id});setTimeout(loadAnnouncementsPageList,400)"><span class="ico-i ico-check"></span>تأكيد النشر</button>` : `<label style="font-size:10.5px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${a.show_on_public_site?'checked':''} onchange="toggleAnnouncementPublicSite(${a.id},this.checked)"/> 🌐 عام</label>`}
      </div>
    </div>
  </div>`;
  }).join("");
}

