/* ══════════ COMMITTEES ══════════ */
let committeesCache = [];
async function loadCommittees(){
  const wrap = document.getElementById("committeesCards");
  if(!wrap) return;
  const { data, error } = await sb.from("committees").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ wrap.innerHTML = `<div style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</div>`; return; }
  committeesCache = data || [];
  if(committeesCache.length===0){ wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد بيانات بعد. اضغط "+ إضافة لجنة" للبدء.</div>'; return; }

  const ids = committeesCache.map(c=>c.id);
  const { data: allLinks } = ids.length ? await sb.from("committee_members").select("*").in("committee_id", ids) : { data: [] };
  const countByCommittee = {};
  (allLinks||[]).forEach(l => { countByCommittee[l.committee_id] = (countByCommittee[l.committee_id]||0) + 1; });

  const catColors = { "لجنة رئيسية": "var(--primary)", "لجنة متخصصة": "#8B2FC9" };
  wrap.innerHTML = committeesCache.map(c => {
    const color = catColors[c.category] || "var(--gray3)";
    const memberCount = countByCommittee[c.id] || 0;
    const hasCharter = !!(c.charter_purpose || c.charter_authorities || c.charter_composition);
    return `<div class="card" style="margin:0;border-right:4px solid ${color};display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="font-size:11px;font-weight:800;color:${color};margin-bottom:4px">${orgEsc(c.category||"لجنة")}</div>
          <div style="display:flex;gap:6px">
            <button class="btn-xs primary" onclick="editCommittee(${c.id})"><span class="ico-i ico-edit"></span>تعديل</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteCommittee(${c.id})"><span class="ico-i ico-trash"></span>حذف</button>
          </div>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--dark);margin-bottom:8px">${orgEsc(c.committee_name||"")}</div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-user"></span>رئيس اللجنة: <b style="color:var(--dark)">${orgEsc(c.chairman_name||"—")}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-users"></span>عدد الأعضاء المحددين: <b style="color:var(--dark)">${memberCount}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-calendar"></span>تاريخ التعيين: ${c.appointment_date||"—"}</div>
        ${c.scope ? `<div style="font-size:11.5px;color:var(--gray3);background:var(--offwhite);border-radius:8px;padding:8px;margin-bottom:8px">${c.scope}</div>` : ""}
        <button class="btn-xs" style="width:100%;margin-top:auto;background:${hasCharter?'#E8F8EF':'var(--offwhite)'};color:${hasCharter?'var(--green)':'var(--dark)'};border:1px solid ${hasCharter?'transparent':'var(--gray1)'};border-radius:6px;padding:6px;font-size:11px;cursor:pointer" onclick="openCharterModal(${c.id})"><span class="ico-i ico-scroll"></span>${hasCharter?'عرض/تعديل الميثاق ✅':'إعداد ميثاق اللجنة'}</button>
      </div>
    </div>`;
  }).join("");
}
function openCharterModal(committeeId){
  const c = committeesCache.find(x => x.id === committeeId);
  if(!c) return;
  document.getElementById("mch-committee-id").value = committeeId;
  document.getElementById("mch-title-h").textContent = "📜 ميثاق — " + (c.committee_name||"");
  document.getElementById("mch-purpose").value = c.charter_purpose || "";
  document.getElementById("mch-authorities").value = c.charter_authorities || "";
  document.getElementById("mch-composition").value = c.charter_composition || "";
  document.getElementById("mch-meetings-rules").value = c.charter_meetings_rules || "";
  document.getElementById("mch-reporting").value = c.charter_reporting || "";
  document.getElementById("mch-approved-date").value = c.charter_approved_date || "";
  document.getElementById("mch-file").value = "";
  openM("m-charter");
  renderCharterApprovalStatus(committeeId);
}

async function saveCharter(){
  const committeeId = Number(document.getElementById("mch-committee-id").value);
  const fileInput = document.getElementById("mch-file");
  const file_url = await uploadFile(fileInput, "charters");
  const payload = {
    charter_purpose: document.getElementById("mch-purpose").value.trim(),
    charter_authorities: document.getElementById("mch-authorities").value.trim(),
    charter_composition: document.getElementById("mch-composition").value.trim(),
    charter_meetings_rules: document.getElementById("mch-meetings-rules").value.trim(),
    charter_reporting: document.getElementById("mch-reporting").value.trim(),
    charter_approved_date: document.getElementById("mch-approved-date").value || null
  };
  if(file_url) payload.charter_file_url = file_url;
  const { error } = await sb.from("committees").update(payload).eq("id", committeeId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  const c = committeesCache.find(x => x.id === committeeId);
  logActivity("تعديل", "ميثاق لجنة", c?c.committee_name:"", "");
  closeM("m-charter");
  loadCommittees();
}

function editCommittee(id){
  const c = committeesCache.find(x => x.id === id);
  if(!c) return;
  document.getElementById("mcm-id").value = c.id;
  document.getElementById("mcm-title-h").textContent = "✏️ تعديل لجنة";
  document.getElementById("mcm-name").value = c.committee_name || "";
  document.getElementById("mcm-chairman").value = c.chairman_name || "";
  document.getElementById("mcm-appointment-date").value = c.appointment_date || "";
  document.getElementById("mcm-category").value = c.category || "لجنة رئيسية";
  document.getElementById("mcm-scope").value = c.scope || "";
  renderCommitteeMembersCheckboxes(id);
  openM("m-committee");
}

async function openNewCommitteeModal(){
  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value = "";
  document.getElementById("mcm-chairman").value = "";
  document.getElementById("mcm-appointment-date").value = "";
  document.getElementById("mcm-scope").value = "";
  await renderCommitteeMembersCheckboxes(null);
  openM("m-committee");
}

async function renderCommitteeMembersCheckboxes(committeeId){
  const box = document.getElementById("mcm-members-list");
  if(!box) return;
  box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  const { data: allMembers } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  let selectedIds = [];
  if(committeeId){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", committeeId);
    selectedIds = (links||[]).map(l => l.member_id);
  }
  if(!allMembers || allMembers.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء مسجّلون بصفحة "أعضاء مجلس الإدارة" بعد.</div>'; return; }
  box.innerHTML = allMembers.map(m => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;cursor:pointer">
      <input type="checkbox" class="mcm-member-cb" value="${m.id}" ${selectedIds.includes(m.id)?"checked":""}>
      ${orgEsc(m.name||"")}
    </label>`).join("");
}

async function deleteCommittee(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه اللجنة نهائيًا؟")) return;
  const { error } = await sb.from("committees").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadCommittees();
}
async function saveCommittee(){
  const id = document.getElementById("mcm-id").value;
  const committee_name = document.getElementById("mcm-name").value.trim();
  if(!committee_name){ alert("الرجاء إدخال اسم اللجنة"); return; }
  const chairman_name = document.getElementById("mcm-chairman").value.trim();
  const appointment_date = document.getElementById("mcm-appointment-date").value || null;
  const category = document.getElementById("mcm-category").value;
  const scope = document.getElementById("mcm-scope").value.trim();
  const payload = { committee_name, chairman_name, appointment_date, category, scope, company_id: currentCompanyId };

  let committeeId = id;
  if(id){
    const { error } = await sb.from("committees").update(payload).eq("id", id);
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("committees").insert([payload]).select().single();
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
    committeeId = data.id;
  }

  // Sync selected members: clear old links then insert the currently-checked ones
  const checkedIds = Array.from(document.querySelectorAll(".mcm-member-cb:checked")).map(cb => Number(cb.value));
  await sb.from("committee_members").delete().eq("committee_id", committeeId);
  if(checkedIds.length){
    await sb.from("committee_members").insert(checkedIds.map(mid => ({ committee_id: committeeId, member_id: mid, company_id: currentCompanyId })));
  }

  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value=""; document.getElementById("mcm-chairman").value=""; document.getElementById("mcm-appointment-date").value=""; document.getElementById("mcm-scope").value="";
  closeM("m-committee"); loadCommittees();
}
