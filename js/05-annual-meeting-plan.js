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

