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
