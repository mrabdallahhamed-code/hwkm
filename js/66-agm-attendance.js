/* ══════════ VOTE PDF REPORT (per AGM meeting) ══════════ */
/* Shared helper: distinct attendees (shareholders who cast at least one vote) for a given meeting */
/* ══════════ AGM ATTENDANCE CHECK-IN (separate from voting — captures everyone who
   physically/virtually attended, whether or not they end up voting on any topic) ══════════ */
let checkinShareholdersCache = [];

async function loadCheckinShareholdersDropdown(){
  const { data } = await sb.from("shareholders").select("*").eq("company_id", currentCompanyId).order("name");
  checkinShareholdersCache = data || [];
  const sel = document.getElementById("agmCheckin-shareholder");
  if(!sel) return;
  sel.innerHTML = '<option value="">— اختر —</option>' + checkinShareholdersCache.map(s => `<option value="${s.id}">${orgEsc(s.name)} (${(Number(s.shares_count)||0).toLocaleString('ar-SA-u-ca-gregory')} سهم)</option>`).join("");
}

function onCheckinShareholderPick(){
  const sel = document.getElementById("agmCheckin-shareholder");
  const s = checkinShareholdersCache.find(x => String(x.id) === sel.value);
  document.getElementById("agmCheckin-name").value = s ? s.name : "";
  if(s) document.getElementById("agmCheckin-asalah").value = s.shares_count || 0;
}

async function checkInAttendee(){
  const meetingId = Number(document.getElementById("agmCheckin-shareholder").dataset.meetingId);
  const shareholderSel = document.getElementById("agmCheckin-shareholder").value;
  const shareholder_id = shareholderSel ? Number(shareholderSel) : null;
  const s = shareholder_id ? checkinShareholdersCache.find(x => x.id === shareholder_id) : null;
  const shareholder_name = (s ? s.name : document.getElementById("agmCheckin-name").value.trim());
  if(!shareholder_name){ alert("الرجاء اختيار مساهم من القائمة أو كتابة اسمه"); return; }
  const shares_asalah = Number(document.getElementById("agmCheckin-asalah").value) || 0;
  const shares_wakala = Number(document.getElementById("agmCheckin-wakala").value) || 0;
  const card_no = document.getElementById("agmCheckin-card").value.trim();

  const { error } = await sb.from("agm_attendance").insert([{
    company_id: currentCompanyId, meeting_id: meetingId, shareholder_id, shareholder_name,
    shares_asalah, shares_wakala, card_no
  }]);
  if(error){ alert("تعذّر تسجيل الحضور: " + error.message); return; }
  logActivity("إنشاء", "تسجيل حضور جمعية", shareholder_name, "");
  document.getElementById("agmCheckin-shareholder").value = "";
  document.getElementById("agmCheckin-name").value = "";
  document.getElementById("agmCheckin-asalah").value = "0";
  document.getElementById("agmCheckin-wakala").value = "0";
  document.getElementById("agmCheckin-card").value = "";
  loadCheckinList(meetingId);
  renderAGMQuorumWidget(meetingId);
}

async function loadCheckinList(meetingId){
  const box = document.getElementById("agmCheckin-list");
  if(!box) return;
  const { data } = await sb.from("agm_attendance").select("*").eq("meeting_id", meetingId).order("checked_in_at",{ascending:true});
  const rows = data || [];
  if(rows.length === 0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11px;padding:8px">لا يوجد حضور مسجّل بعد.</div>'; return; }
  box.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--gray3);margin-bottom:6px">قائمة الحاضرين (${rows.length})</div>` +
    rows.map(r => `<div class="attendee-row">
      <span>${orgEsc(r.shareholder_name)}</span>
      <span class="attendee-shares">${((Number(r.shares_asalah)||0)+(Number(r.shares_wakala)||0)).toLocaleString('ar-SA-u-ca-gregory')} سهم</span>
      <button class="attendee-del" onclick="deleteCheckin(${r.id},${meetingId})"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
    </div>`).join("");
}

async function deleteCheckin(id, meetingId){
  if(!await uiConfirm("حذف تسجيل الحضور هذا؟")) return;
  await sb.from("agm_attendance").delete().eq("id", id);
  loadCheckinList(meetingId);
  renderAGMQuorumWidget(meetingId);
}

/* Attendee list for documents now comes from the real check-in log, not from who happened to
   vote — so anyone who attended but abstained from every topic still appears on the roster
   and vote-count minutes; a merge with `votes` only fills in each person's card/shareholder
   numbers when a matching check-in record isn't found (older meetings before check-in existed). */
async function getAttendeesList(meetingId){
  const { data: checkins, error } = await sb.from("agm_attendance").select("*").eq("meeting_id", meetingId).order("checked_in_at",{ascending:true});
  if(error) return { error, list: [] };
  const rows = checkins || [];
  if(rows.length > 0){
    const list = rows.map((r,i) => ({
      name: r.shareholder_name,
      shares: (Number(r.shares_asalah)||0) + (Number(r.shares_wakala)||0),
      sharesAsalah: Number(r.shares_asalah)||0,
      sharesWakala: Number(r.shares_wakala)||0,
      shareholderNo: r.shareholder_id || (i+1),
      cardNo: r.card_no || ("V-" + String(i+1).padStart(3,"0"))
    }));
    return { error: null, list };
  }
  // Fallback for meetings recorded before the check-in feature existed: infer from votes.
  const { data, error: vErr } = await sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", meetingId).not("shareholder_name","is",null);
  if(vErr) return { error: vErr, list: [] };
  const byShareholder = {};
  (data||[]).forEach(v => {
    const key = v.shareholder_name || "—";
    if(!byShareholder[key]) byShareholder[key] = { name:key, shares:Number(v.shares_count)||0, lastId:v.id };
    if(v.id >= byShareholder[key].lastId){
      byShareholder[key].shares = Number(v.shares_count)||0;
      byShareholder[key].lastId = v.id;
    }
  });
  const list = Object.values(byShareholder).sort((a,b)=> a.name.localeCompare(b.name,'ar'));
  list.forEach((s,i)=>{ s.shareholderNo = i+1; s.cardNo = "V-" + String(i+1).padStart(3,"0"); s.sharesAsalah = s.shares; s.sharesWakala = 0; });
  return { error:null, list };
}

/* PDF 1: Attendance sheet (كشف الحضور). meetingId is optional — defaults to the meeting
   currently open on the voting page; the AGM detail modal passes it explicitly. */
