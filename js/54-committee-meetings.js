/* ══════════ COMMITTEE MEETINGS (same card + detail pattern as board meetings) ══════════ */
// Every board/committee meeting agenda automatically opens and closes with these two fixed
// items — only the middle is company-specific. Applies to اجتماع مجلس الإدارة الدوري, اجتماع
// طارئ, and اجتماع لجنة alike; NOT to الجمعية العامة, which has its own separate agenda flow.
const AGENDA_OPENING_ITEM = "ترحيب رئيس مجلس الإدارة بالأعضاء الحاضرين";
const AGENDA_CLOSING_ITEM = "شكر رئيس مجلس الإدارة للأعضاء على الحضور، وإنهاء الاجتماع";
const BOARD_COMMITTEE_MEETING_TYPES = ["اجتماع مجلس الإدارة الدوري", "اجتماع طارئ", "اجتماع لجنة"];
function withAgendaBookends(customTopics){
  return [AGENDA_OPENING_ITEM, ...customTopics, AGENDA_CLOSING_ITEM];
}

/* Auto-generates and uploads a simple invitation document for a board/committee meeting —
   agenda (with the fixed opening/closing items already baked in via vote_topics), date/time
   range, method, and join link if any — then attaches it as the meeting's invitation_file_url.
   No e-signature step here (unlike the AGM invitation, which legally needs board sign-off);
   this is a routine internal notice, generated the moment the meeting is confirmed. */
/* Always shows the real, current agenda straight from vote_topics — nothing to upload,
   nothing that can be accidentally deleted and leave the meeting without an agenda. */
async function viewMeetingAgenda(meetingId){
  const { data: m } = await sb.from("meetings").select("*").eq("id", meetingId).single();
  if(!m) return;
  const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", meetingId)
    .order("sort_order",{ascending:true}).order("id",{ascending:true});
  const companyName = document.getElementById("reportCompanyName1")?.textContent
    || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const timeRange = m.meeting_time ? (m.meeting_time + (m.time_end ? (" إلى " + m.time_end) : "")) : "—";
  const html = `<html><head><meta charset="UTF-8"><title>جدول الأعمال</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:30px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;border-bottom:2px solid #D4AF37;padding-bottom:10px}
      ol{padding-right:20px;font-size:14px;line-height:2}
    </style></head><body>
      <h1>جدول الأعمال</h1>
      <p><b>الشركة:</b> ${companyName}</p>
      <p><b>عنوان الاجتماع:</b> ${orgEsc(m.title||"—")}</p>
      <p><b>التاريخ:</b> ${m.meeting_date||"—"} &nbsp; <b>الوقت:</b> ${timeRange}</p>
      ${(topics && topics.length) ? `<ol>${topics.map(t=>`<li>${orgEsc(t.topic_text)}</li>`).join("")}</ol>` : "<p>لم تُحدَّد بنود بعد.</p>"}
    </body></html>`;
  const w = openPrintWindow();
  w.document.write(html);
  w.document.close();
}

async function generateAndUploadMeetingInvitation(meetingId){
  const { data: m } = await sb.from("meetings").select("*").eq("id", meetingId).single();
  if(!m) return null;
  const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", meetingId)
    .order("sort_order",{ascending:true}).order("id",{ascending:true});

  let scopeLabel = "مجلس الإدارة";
  if(m.committee_id){
    const { data: committee } = await sb.from("committees").select("committee_name").eq("id", m.committee_id).maybeSingle();
    scopeLabel = committee ? committee.committee_name : "اللجنة";
  }
  const companyName = document.getElementById("reportCompanyName1")?.textContent
    || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const timeRange = m.meeting_time ? (m.meeting_time + (m.time_end ? (" إلى " + m.time_end) : "")) : "—";

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><title>دعوة اجتماع</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;direction:rtl;text-align:right;line-height:1.9;font-size:13px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;font-size:19px;border-bottom:2px solid #D4AF37;padding-bottom:8px}
      h2{color:#1A3A6B;font-size:15px;margin-top:20px}
      ol{padding-right:20px}
    </style></head>
    <body>
      <h1>دعوة اجتماع ${scopeLabel}</h1>
      <p><b>الشركة:</b> ${companyName}</p>
      <p><b>عنوان الاجتماع:</b> ${orgEsc(m.title||"—")}</p>
      <p><b>النوع:</b> ${m.meeting_type||"—"}</p>
      <p><b>التاريخ:</b> ${m.meeting_date||"—"}</p>
      <p><b>الوقت:</b> ${timeRange}</p>
      <p><b>طريقة الانعقاد:</b> ${m.method||"—"}</p>
      ${m.meeting_link ? `<p><b>رابط الانضمام:</b> ${m.meeting_link}</p>` : ""}
      <h2>جدول الأعمال</h2>
      ${(topics && topics.length) ? `<ol>${topics.map(t=>`<li>${orgEsc(t.topic_text)}</li>`).join("")}</ol>` : "<p>سيُحدَّد جدول الأعمال لاحقًا.</p>"}
    </body>
    </html>
  `;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const file_url = await uploadBlobToStorage(blob, "meeting-invitations", `دعوة-${orgEsc(m.title||'اجتماع')}-${Date.now()}.doc`);
  if(!file_url) return null;
  await sb.from("meetings").update({ invitation_file_url: file_url }).eq("id", meetingId);
  return file_url;
}

let newMeetingTopics = [];
function addNewMeetingTopic(){
  const input = document.getElementById("mt-new-topic");
  const text = input.value.trim();
  if(!text) return;
  newMeetingTopics.push(text);
  input.value = "";
  renderNewMeetingTopics();
}
function removeNewMeetingTopic(i){
  newMeetingTopics.splice(i,1);
  renderNewMeetingTopics();
}
function renderNewMeetingTopics(){
  const box = document.getElementById("mt-topics-list");
  if(!box) return;
  if(newMeetingTopics.length === 0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد بنود بعد.</div>'; return; }
  box.innerHTML = newMeetingTopics.map((t,i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;border-bottom:1px solid var(--gray1)">
    <span>${i+1}. ${t}</span>
    <button type="button" onclick="removeNewMeetingTopic(${i})" style="background:none;border:none;color:var(--gray3);cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
  </div>`).join("");
}

async function saveMeeting(){
  const title = document.getElementById("mt-title").value.trim();
  const meeting_type = document.getElementById("mt-type").value;
  const meeting_date = document.getElementById("mt-date").value || null;
  const meeting_time = document.getElementById("mt-time").value || null;
  const time_end = document.getElementById("mt-time-end").value || null;
  const method = document.getElementById("mt-method").value;
  const meeting_link = document.getElementById("mt-link").value.trim();
  const notes = document.getElementById("mt-notes").value.trim();
  if(!title){ alert("الرجاء إدخال عنوان الاجتماع"); return; }

  const votingStartRaw = document.getElementById("mt-voting-start").value;
  const votingEndRaw = document.getElementById("mt-voting-end").value;
  const voting_start = votingStartRaw ? new Date(votingStartRaw).toISOString() : null;
  const voting_end = votingEndRaw ? new Date(votingEndRaw).toISOString() : null;
  const agm_type = document.getElementById("mt-agm-type").value;
  const call_number = Number(document.getElementById("mt-call-number").value);
  const committee_id = document.getElementById("mt-committee-id").value ? Number(document.getElementById("mt-committee-id").value) : null;
  const is_listed_agm = document.getElementById("mt-is-listed-agm").checked;

  const fileInput = document.getElementById("mt-file");
  const file_url = await uploadFile(fileInput, "meetings");

  const { data: newMeeting, error } = await sb.from("meetings").insert([{ title, meeting_type, meeting_date, meeting_time, time_end, method, meeting_link, notes, file_url, voting_start: is_listed_agm?null:voting_start, voting_end: is_listed_agm?null:voting_end, agm_type, call_number, committee_id, is_listed_agm, company_id: currentCompanyId }]).select().single();
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }

  const isBoardOrCommittee = BOARD_COMMITTEE_MEETING_TYPES.includes(meeting_type);
  const finalTopics = isBoardOrCommittee ? withAgendaBookends(newMeetingTopics) : newMeetingTopics;
  if(finalTopics.length){
    const topicRows = finalTopics.map((topic_text, i) => ({ meeting_id: newMeeting.id, topic_text, sort_order: i, company_id: currentCompanyId }));
    await sb.from("vote_topics").insert(topicRows);
  }
  // Every real agenda item (not the two fixed opening/closing ones) becomes a votable
  // decision automatically, same as adding a topic later from the meeting's own page.
  if(isBoardOrCommittee && newMeetingTopics.length){
    const decisionRows = newMeetingTopics.map(topic_text => ({ meeting_id: newMeeting.id, decision_text: topic_text, company_id: currentCompanyId }));
    await sb.from("board_decisions").insert(decisionRows);
  }

  document.getElementById("mt-title").value = "";
  document.getElementById("mt-link").value = "";
  document.getElementById("mt-notes").value = "";
  document.getElementById("mt-voting-start").value = "";
  document.getElementById("mt-voting-end").value = "";
  document.getElementById("mt-time-end").value = "";
  fileInput.value = "";
  newMeetingTopics = [];
  renderNewMeetingTopics();
  closeM("m-meeting");

  if(convertingPlanItemId){
    await sb.from("meeting_plan_items").update({ status:"تحوّل لاجتماع", linked_meeting_id: newMeeting.id }).eq("id", convertingPlanItemId);
    convertingPlanItemId = null;
  }
  loadMeetingsAll();

  if(meeting_type === "الجمعية العامة"){
    alert("تم حفظ الجمعية العامة ✅ — سنولّد دعوتها الرسمية الآن (سيُطلب منك اسم رئيس مجلس الإدارة للتوقيع).");
    await generateOfficialDoc("دعوة جمعية عامة", newMeeting.id);
  } else if(isBoardOrCommittee){
    await generateAndUploadMeetingInvitation(newMeeting.id);
    alert("تم حفظ الاجتماع بنجاح ✅ — وتولّدت دعوته تلقائيًا بجدول الأعمال. ستجده في صفحته المخصصة حسب النوع.");
  } else {
    alert("تم حفظ الاجتماع بنجاح ✅ — ستجده في صفحته المخصصة حسب النوع");
  }
}
