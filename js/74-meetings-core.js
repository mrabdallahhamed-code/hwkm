/* ══════════ MEETINGS (routed by type) ══════════ */
const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fileCell(id, field, url){
  if(url){
    return `<div style="display:flex;gap:4px;align-items:center;justify-content:center">
      <a class="btn-xs primary" href="${url}" target="_blank" rel="noopener" title="تحميل"><span class="ico ico-inbox" style="width:16px;height:16px"></span></a>
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 6px;font-size:11px;cursor:pointer" title="حذف الملف" onclick="deleteMeetingFile(${id},'${field}')"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  }
  return `<label class="btn-xs primary" style="cursor:pointer;display:inline-block"><span class="ico-i ico-paperclip"></span>رفع<input type="file" style="display:none" onchange="uploadMeetingFile(${id},'${field}',this)"></label>`;
}

function renderMeetingRow(m){
  return `<tr>
    <td>${orgEsc(m.title || "")}</td>
    <td>${m.meeting_type || "—"}</td>
    <td>${m.meeting_date || "—"}</td>
    <td>${m.meeting_time || "—"}</td>
    <td>${m.method || "—"}</td>
    <td>${orgEsc(m.notes || "—")}</td>
    <td>${fileCell(m.id,'agenda_file_url',m.agenda_file_url)}</td>
    <td>${fileCell(m.id,'minutes_file_url',m.minutes_file_url)}</td>
    <td>${fileCell(m.id,'invitation_file_url',m.invitation_file_url)}</td>
    <td><button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteMeeting(${m.id})"><span class="ico-i ico-trash"></span>حذف</button></td>
  </tr>`;
}

async function uploadMeetingFile(id, field, inputEl){
  const url = await uploadFile(inputEl, "meetings");
  if(!url) return;
  const payload = {}; payload[field] = url;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeetingFile(id, field){
  if(!await uiConfirm("هل تريد حذف هذا الملف؟")) return;
  const payload = {}; payload[field] = null;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeeting(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذا الاجتماع بالكامل؟")) return;
  const { error } = await sb.from("meetings").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}

/* ══════════ DASHBOARD (real data pulled from every page) ══════════ */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/* ══════════ NOTIFICATIONS (live-computed, no stored table — always fresh) ══════════ */
/* Generic "pick one" dropdown — reused for every consolidated export/edit button across the
   platform instead of one page having its own bespoke toggle logic. Closes on outside click. */
function toggleDD(id){
  document.querySelectorAll('.dd-menu.open').forEach(m => { if(m.id !== id) m.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.dd-wrap')) document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
});

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

async function loadMeetingsAll(){
  const { data, error } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId).order("id", { ascending: false });
  if(error){
    return;
  }
  allMeetingsCache = data || [];

  const board = (data || []).filter(m => m.meeting_type === "اجتماع مجلس الإدارة الدوري" || m.meeting_type === "اجتماع طارئ");
  const committee = (data || []).filter(m => m.meeting_type === "اجتماع لجنة");
  const agm = (data || []).filter(m => m.meeting_type === "الجمعية العامة");

  renderMeetingCardsGroup(board, "board");
  renderMeetingCardsGroup(committee, "committee");
  renderAGMSection(agm);
  loadMeetingPlans();
}
