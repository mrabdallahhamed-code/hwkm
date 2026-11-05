/* ══════════ BOARD MEMBERS ══════════ */
let membersCache = [];
let disclosuresCache = [];
const memberColors = [
  "linear-gradient(135deg,var(--primary),var(--accent))",
  "linear-gradient(135deg,#8B2FC9,#B56AE8)",
  "linear-gradient(135deg,var(--teal),#29B8A8)",
  "linear-gradient(135deg,#C0392B,#E85D50)",
  "linear-gradient(135deg,var(--gold),var(--gold3))"
];

/* ══════════ BOARD TERM RENEWAL — full-board transition tied to an AGM election ══════════
   Ends the sitting term for anyone who doesn't continue, keeps continuing members linked to
   the new term, adds the freshly-elected members, and (since new members always need a CMA
   disclosure) opens one prefilled "تعيين عضو مجلس إدارة جديد" announcement draft per new
   member for review — reusing the existing 86-type announcement engine rather than inventing
   a separate bulk-announcement type that doesn't match real Tadawul practice. */
let newTermMemberRows = 0;

async function openNewBoardTermModal(){
  if(!meetingPlanRoleGuard()) return;
  const agmSel = document.getElementById("bt-agm-select");
  agmSel.innerHTML = '<option value="">جارِ التحميل...</option>';
  const membersBox = document.getElementById("bt-current-members");
  membersBox.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  document.getElementById("bt-new-members").innerHTML = "";
  newTermMemberRows = 0;
  document.getElementById("bt-term-start").value = "";
  openM("m-board-term");

  const { data: agms } = await sb.from("meetings").select("id,title,meeting_date")
    .eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").order("meeting_date",{ascending:false});
  agmSel.innerHTML = '<option value="">— اختر —</option>' +
    (agms||[]).map(a => `<option value="${a.id}" data-date="${a.meeting_date||''}">${orgEsc(a.title||'')} — ${a.meeting_date||'—'}</option>`).join("");
  agmSel.onchange = () => {
    const opt = agmSel.selectedOptions[0];
    if(opt && opt.dataset.date) document.getElementById("bt-term-start").value = opt.dataset.date;
  };

  const { data: members } = await sb.from("board_members").select("*")
    .eq("company_id", currentCompanyId).eq("status","نشط").order("id",{ascending:true});
  membersBox.innerHTML = (members && members.length)
    ? members.map(m => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--offwhite);border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" data-bt-member-id="${m.id}" data-bt-member-name="${orgEsc((m.name||'').replace(/"/g,''))}" checked style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0"/>
        <span>${orgEsc(m.name||"")} <span style="color:var(--gray3);font-size:10.5px">— ${orgEsc(m.position||"")}</span></span>
      </label>`).join("")
    : '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء حاليون مسجّلون.</div>';
}

function addNewTermMemberRow(){
  newTermMemberRows++;
  const idx = newTermMemberRows;
  const box = document.getElementById("bt-new-members");
  const row = document.createElement("div");
  row.id = `bt-new-row-${idx}`;
  row.style.cssText = "background:var(--offwhite);border-radius:10px;padding:10px;margin-bottom:8px";
  row.innerHTML = `
    <div class="row2">
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-name-${idx}" placeholder="اسم العضو الجديد" style="margin:0"/></div>
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-position-${idx}" placeholder="المنصب (مثال: عضو مستقل)" style="margin:0"/></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="fs" id="bt-new-exec-${idx}" style="flex:1;margin:0"><option>غير تنفيذي</option><option>تنفيذي</option><option>مستقل</option></select>
      <button type="button" onclick="document.getElementById('bt-new-row-${idx}').remove()" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  box.appendChild(row);
}

async function saveBoardTerm(){
  if(!meetingPlanRoleGuard()) return;
  const agm_meeting_id = document.getElementById("bt-agm-select").value;
  const term_start = document.getElementById("bt-term-start").value;
  if(!agm_meeting_id){ alert("الرجاء اختيار الجمعية العامة اللي تم فيها الانتخاب"); return; }
  if(!term_start){ alert("الرجاء تحديد تاريخ بداية الدورة الجديدة"); return; }

  const { data: term, error: termErr } = await sb.from("board_terms")
    .insert([{ company_id: currentCompanyId, agm_meeting_id: Number(agm_meeting_id), term_start, status:"نشطة" }])
    .select().single();
  if(termErr){ alert("تعذّر إنشاء الدورة: " + termErr.message); return; }

  const checkboxes = [...document.querySelectorAll("#bt-current-members [data-bt-member-id]")];
  const continuingNames = [];
  for(const cb of checkboxes){
    const memberId = Number(cb.dataset.btMemberId);
    if(cb.checked){
      await sb.from("board_members").update({ term_id: term.id }).eq("id", memberId);
      continuingNames.push(cb.dataset.btMemberName || "");
    } else {
      await sb.from("board_members").update({ status:"منتهي العضوية", term_end_date: term_start }).eq("id", memberId);
    }
  }

  const newRows = [...document.querySelectorAll("#bt-new-members [id^='bt-new-row-']")];
  const newMembersAdded = [];
  for(const row of newRows){
    const idx = row.id.replace("bt-new-row-","");
    const name = document.getElementById(`bt-new-name-${idx}`).value.trim();
    if(!name) continue;
    const position = document.getElementById(`bt-new-position-${idx}`).value.trim();
    const is_executive = document.getElementById(`bt-new-exec-${idx}`).value;
    await sb.from("board_members").insert([{
      name, position, position_level:"عضو", is_executive, committee_member:"لا",
      join_date: term_start, status:"نشط", term_id: term.id, company_id: currentCompanyId
    }]);
    newMembersAdded.push(name);
  }

  closeM("m-board-term");
  loadMembers();

  const allTermMembers = [...continuingNames, ...newMembersAdded].filter(Boolean);
  if(allTermMembers.length){
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅ — جهّزنا لك الآن مسودة «إعلان نتائج الجمعية» معبّاة بأعضاء المجلس الجدد كاملين، للمراجعة والتوليد.");
    await prefillAgmResultsWithElectedBoard(Number(agm_meeting_id), allTermMembers, term_start);
  } else {
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅");
  }
}

/* Discloses the WHOLE elected/renewed board in one shot, inside the AGM's own "نتائج
   الجمعية" announcement (the "أعضاء مجلس تم انتخابهم/تعيينهم" field) — matching real Tadawul
   practice for a board elected at a general assembly, instead of one appointment
   announcement per member (that's only for a single seat changing between assemblies). */
async function prefillAgmResultsWithElectedBoard(agmMeetingId, memberNames, termStart){
  const { data: agmRow } = await sb.from("meetings").select("*").eq("id", agmMeetingId).single();
  if(agmRow && !agmMeetingsCache.some(x => x.id === agmMeetingId)) agmMeetingsCache.push(agmRow);
  currentAGMModalMeetingId = agmMeetingId;
  openTadawulAnnouncementForm("نتائج");
  setTimeout(() => {
    const el = document.getElementById("tdwAnn-elected");
    if(el) el.value = memberNames.map(n => `${n} — بداية الدورة: ${termStart}`).join("\n");
  }, 50);
}

/* Opens the existing generic (86-type) announcement form pre-filled for a specific new
   board member — kept available for a single mid-term seat change (not a full AGM renewal),
   still reachable manually from "الإعلانات" → "تعيين عضو مجلس إدارة جديد". */
function prefillAppointmentAnnouncement(memberName, meetingDate){
  selectAnnouncementType("تعيين عضو مجلس إدارة جديد");
  setTimeout(() => {
    const nameField = document.getElementById("genf-member_name");
    const dateField = document.getElementById("genf-meeting_date");
    const startField = document.getElementById("genf-start_date");
    if(nameField) nameField.value = memberName;
    if(dateField) dateField.value = meetingDate || "";
    if(startField) startField.value = meetingDate || "";
  }, 50);
}

async function loadMembers(){
  const grid = document.getElementById("membersGrid");
  const [{ data, error }, { data: disclosureForms }] = await Promise.all([
    sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("board_disclosure_forms").select("member_email,status").eq("company_id", currentCompanyId)
  ]);
  if(error){
    grid.innerHTML = '<div style="font-size:12px;color:var(--red);padding:12px">تعذّر تحميل الأعضاء: '+error.message+'</div>';
    return;
  }
  if(!data || data.length === 0){
    grid.innerHTML = '<div style="font-size:12px;color:var(--gray3);padding:12px">لا يوجد أعضاء بعد. اضغط "+ إضافة عضو" للبدء.</div>';
    return;
  }
  membersCache = data;
  disclosuresCache = disclosureForms || [];
  grid.innerHTML = data.map((m, i) => {
    const initial = (m.name || "?").trim().charAt(0);
    const bg = memberColors[i % memberColors.length];
    const status = m.status || "—";
    const execBadge = m.is_executive === "تنفيذي" ? '<span class="badge pending">تنفيذي</span>' : '<span class="badge info">غير تنفيذي</span>';
    const committeeBadge = m.committee_member === "نعم" ? '<span class="badge done">عضو لجنة</span>' : "";
    const memberDisclosure = m.claimed_by_email ? disclosuresCache.find(d => d.member_email === m.claimed_by_email) : null;
    const disclosureBadge = memberDisclosure && memberDisclosure.status === "موقّع" ? '<span class="badge done"><span class="ico-i ico-check"></span>أُفصح</span>' : '<span class="badge urgent"><span class="ico-i ico-warning"></span>لم يُفصح</span>';
    const claimBadge = m.claimed_by_email
      ? `<span class="badge done" title="${orgEsc(m.claimed_by_email)}"><span class="ico-i ico-link"></span>مرتبط بحساب دخول</span>`
      : '<span class="badge urgent"><span class="ico-i ico-warning"></span>غير مرتبط — لا يقدر يصوّت</span>';
    return `<div class="memcard">
      <div class="mem-av" style="background:${bg}">${initial}</div>
      <div class="mem-name">${orgEsc(m.name || "")}</div><div class="mem-role">${m.position_level || "عضو"} — ${orgEsc(m.position || "")}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin:4px 0">
        <span class="badge info">${status}</span>${execBadge}${committeeBadge}
      </div>
      <div style="display:flex;justify-content:center;margin:2px 0">${disclosureBadge}</div>
      <div style="display:flex;justify-content:center;margin:2px 0">${claimBadge}</div>
      <div class="mem-stats"><div><div class="ms-v">${m.join_date || "—"}</div><div class="ms-l">الانضمام</div></div></div>
      <div style="display:flex;gap:6px;margin-top:8px;width:100%">
        <button class="btn-xs primary" style="flex:1" onclick="editMember(${m.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        ${m.claimed_by_email ? "" : `<button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="openClaimMemberModal(${m.id})"><span class="ico-i ico-link"></span>ربط بحساب</button>`}
      </div>
    </div>`;
  }).join("");
}

/* Linking a formal board_members row to an actual login (claimed_by_email) is what makes
   that person count for quorum, attendance, and decision voting — being invited to the
   platform with role "عضو مجلس" is NOT enough by itself, since board_members is a separate
   roster from user_company_memberships. This is normally set automatically when someone signs
   up with a matching national ID; this modal covers everyone else (e.g. invited by link). */
async function openClaimMemberModal(memberId){
  const m = membersCache.find(x => x.id === memberId);
  if(!m) return;
  document.getElementById("cm-member-id").value = memberId;
  document.getElementById("cm-member-name").textContent = m.name || "";
  const sel = document.getElementById("cm-email-select");
  sel.innerHTML = '<option value="">جارِ التحميل...</option>';
  openM("m-claim-member");

  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  const emails = (memberships||[]).map(x=>x.email);
  const { data: profiles } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameByEmail = {};
  (profiles||[]).forEach(p => { nameByEmail[p.email] = p.full_name; });

  if(!memberships || memberships.length === 0){
    sel.innerHTML = '<option value="">لا يوجد أعضاء بالفريق بعد</option>';
    return;
  }
  sel.innerHTML = '<option value="">— اختر حساب الدخول —</option>' +
    memberships.map(x => `<option value="${orgEsc(x.email)}">${orgEsc(nameByEmail[x.email]||x.email)} (${orgEsc(x.role)}) — ${orgEsc(x.email)}</option>`).join("");
}

async function confirmClaimMember(){
  const memberId = document.getElementById("cm-member-id").value;
  const email = document.getElementById("cm-email-select").value;
  if(!email){ alert("الرجاء اختيار حساب الدخول اللي تبي تربطه بهذا العضو"); return; }
  const { error } = await sb.from("board_members").update({ claimed_by_email: email }).eq("id", memberId);
  if(error){ alert("تعذّر الربط: " + error.message); return; }
  closeM("m-claim-member");
  alert("تم الربط بنجاح ✅ — هذا العضو الآن يقدر يصوّت على قرارات المجلس/اللجان، ويُحسب ضمن الحضور والنصاب.");
  loadMembers();
}

function editMember(id){
  const m = membersCache.find(x => x.id === id);
  if(!m) return;
  document.getElementById("mm-id").value = m.id;
  document.getElementById("mm-title").textContent = "✏️ تعديل عضو مجلس إدارة";
  document.getElementById("mm-source").value = "manual";
  document.getElementById("mm-shareholder-picker-wrap").style.display = "none";
  document.getElementById("mm-name").disabled = false; document.getElementById("mm-name").style.background = "";
  document.getElementById("mm-national-id").disabled = false; document.getElementById("mm-national-id").style.background = "";
  document.getElementById("mm-name").value = m.name || "";
  document.getElementById("mm-position").value = m.position || "";
  document.getElementById("mm-position-level").value = m.position_level || "عضو";
  document.getElementById("mm-executive").value = m.is_executive || "غير تنفيذي";
  document.getElementById("mm-committee").value = m.committee_member || "لا";
  document.getElementById("mm-joindate").value = m.join_date || "";
  document.getElementById("mm-status").value = m.status || "نشط";
  document.getElementById("mm-national-id").value = m.national_id || "";
  openM("m-member");
}

async function toggleMemberSource(){
  const source = document.getElementById("mm-source").value;
  const wrap = document.getElementById("mm-shareholder-picker-wrap");
  const nameField = document.getElementById("mm-name");
  const nationalIdField = document.getElementById("mm-national-id");
  if(source === "shareholder"){
    wrap.style.display = "block";
    nameField.disabled = true; nameField.style.background = "var(--gray1)";
    nationalIdField.disabled = true; nationalIdField.style.background = "var(--gray1)";
    const picker = document.getElementById("mm-shareholder-picker");
    const { data, error } = await sb.from("shareholders").select("id,name,national_id").eq("company_id", currentCompanyId).order("name",{ascending:true});
    if(error){ picker.innerHTML = '<option value="">تعذّر التحميل</option>'; return; }
    picker.innerHTML = '<option value="">— اختر —</option>' + (data||[]).map(s => `<option value="${s.id}" data-name="${orgEsc(s.name||'')}" data-national-id="${orgEsc(s.national_id||'')}">${orgEsc(s.name||'—')}</option>`).join("");
  } else {
    wrap.style.display = "none";
    nameField.disabled = false; nameField.style.background = "";
    nationalIdField.disabled = false; nationalIdField.style.background = "";
    nameField.value = ""; nationalIdField.value = "";
  }
}

function fillMemberFromShareholder(){
  const picker = document.getElementById("mm-shareholder-picker");
  const opt = picker.selectedOptions[0];
  if(!opt || !opt.value) return;
  document.getElementById("mm-name").value = opt.dataset.name || "";
  document.getElementById("mm-national-id").value = opt.dataset.nationalId || "";
}

async function saveMember(){
  const id = document.getElementById("mm-id").value;
  const name = document.getElementById("mm-name").value.trim();
  const position = document.getElementById("mm-position").value.trim();
  const position_level = document.getElementById("mm-position-level").value;
  const is_executive = document.getElementById("mm-executive").value;
  const committee_member = document.getElementById("mm-committee").value;
  const join_date = document.getElementById("mm-joindate").value || null;
  const status = document.getElementById("mm-status").value;
  const national_id = document.getElementById("mm-national-id").value.trim();
  if(!name){ alert("الرجاء إدخال اسم العضو"); return; }

  const payload = { name, position, position_level, is_executive, committee_member, join_date, status, national_id, company_id: currentCompanyId };
  const { error } = id
    ? await sb.from("board_members").update(payload).eq("id", id)
    : await sb.from("board_members").insert([payload]);
  if(error){
    const rls = /row-level security|permission denied/i.test(error.message||"");
    alert(rls ? "ليست لديك صلاحية تعديل أعضاء المجلس بهذا الحساب.\nصلاحيتك هنا «عرض فقط». اطلب من مدير النظام منحك صلاحية «تعديل» على صفحة الأعضاء." : "خطأ أثناء الحفظ: " + error.message);
    return;
  }

  document.getElementById("mm-id").value = "";
  document.getElementById("mm-title").textContent = "👤 إضافة عضو مجلس إدارة";
  document.getElementById("mm-name").value = "";
  document.getElementById("mm-position").value = "";
  document.getElementById("mm-joindate").value = "";
  document.getElementById("mm-national-id").value = "";
  closeM("m-member");
  loadMembers();
}
