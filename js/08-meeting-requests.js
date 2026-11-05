/* ══════════ MEETING REQUESTS (board approves the proposed date) ══════════ */
let newRequestTopics = [];
function addNewRequestTopic(){
  const input = document.getElementById("mtr-new-topic");
  const text = input.value.trim();
  if(!text) return;
  newRequestTopics.push(text);
  input.value = "";
  renderNewRequestTopics();
}
function removeNewRequestTopic(i){
  newRequestTopics.splice(i,1);
  renderNewRequestTopics();
}
function renderNewRequestTopics(){
  const box = document.getElementById("mtr-topics-list");
  if(!box) return;
  if(newRequestTopics.length === 0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد بنود إضافية بعد.</div>'; return; }
  box.innerHTML = newRequestTopics.map((t,i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;border-bottom:1px solid var(--gray1)">
    <span>${i+1}. ${t}</span>
    <button type="button" onclick="removeNewRequestTopic(${i})" style="background:none;border:none;color:var(--gray3);cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
  </div>`).join("");
}

async function submitMeetingRequest(){
  const title = document.getElementById("mtr-title").value.trim();
  if(!title){ alert("الرجاء إدخال عنوان الاجتماع"); return; }
  const meeting_type = document.getElementById("mtr-type").value;
  const proposed_date = document.getElementById("mtr-date").value || null;
  const proposed_time = document.getElementById("mtr-time").value || null;
  const proposed_time_end = document.getElementById("mtr-time-end").value || null;
  const method = document.getElementById("mtr-method").value;
  const meeting_link = document.getElementById("mtr-link").value.trim() || null;
  const notes = document.getElementById("mtr-notes").value.trim();
  const committee_id = (meeting_type === "اجتماع لجنة" && document.getElementById("mtr-committee-id").value)
    ? Number(document.getElementById("mtr-committee-id").value) : null;
  if(!proposed_date){ alert("الرجاء تحديد الموعد المقترح"); return; }
  if(meeting_type === "اجتماع لجنة" && !committee_id){ alert("الرجاء اختيار اللجنة"); return; }

  const responseDays = Number(document.getElementById("mtr-response-days").value) || 2;
  const response_deadline = new Date(Date.now() + responseDays*24*60*60*1000).toISOString();

  const { data: newReq, error } = await sb.from("meeting_requests").insert([{
    title, meeting_type, proposed_date, proposed_time, proposed_time_end, method, meeting_link, notes,
    committee_id, proposed_topics: newRequestTopics, status: "قيد الموافقة", response_deadline, company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  document.getElementById("mtr-title").value = "";
  document.getElementById("mtr-notes").value = "";
  document.getElementById("mtr-time-end").value = "";
  document.getElementById("mtr-link").value = "";
  document.getElementById("mtr-committee-field").style.display = "none";
  newRequestTopics = [];
  renderNewRequestTopics();
  closeM("m-meeting-request");
  loadMeetingsAll();
  alert("تم إرسال طلب الاجتماع " + (committee_id ? "لأعضاء اللجنة" : "لأعضاء المجلس") + " للموافقة على الموعد ✅");

  notifyBoardOfMeetingRequest(newReq);
}

/* Auto-emails every board member who's linked to a login (the only ones who can actually
   respond) the moment a meeting request is submitted — so the requester never has to go
   message each member individually just to ask them to log in and approve. */
async function notifyBoardOfMeetingRequest(req){
  let members;
  if(req.committee_id){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", req.committee_id);
    const memberIds = (links||[]).map(l => l.member_id);
    const { data } = memberIds.length
      ? await sb.from("board_members").select("name,claimed_by_email").in("id", memberIds).not("claimed_by_email","is",null)
      : { data: [] };
    members = data;
  } else {
    const { data } = await sb.from("board_members").select("name,claimed_by_email")
      .eq("company_id", currentCompanyId).not("claimed_by_email", "is", null);
    members = data;
  }
  const emails = [...new Set((members||[]).map(m => m.claimed_by_email))];
  if(emails.length === 0) return;

  const { data: profiles } = await sb.from("user_profiles").select("email,full_name").in("email", emails);
  const nameByEmail = {};
  (profiles||[]).forEach(p => { nameByEmail[p.email] = p.full_name; });

  const { data: company } = await sb.from("companies").select("name").eq("id", currentCompanyId).single();
  const requesterName = currentUserProfile ? (currentUserProfile.full_name || "") : "";
  const appLink = `${window.location.origin}${window.location.pathname}`;
  const timeRange = req.proposed_time ? (`من الساعة ${req.proposed_time}` + (req.proposed_time_end ? ` إلى ${req.proposed_time_end}` : "")) : "";

  const subject = `🗳️ طلب اجتماع جديد يحتاج موافقتك — ${req.title||""}`;
  for(const email of emails){
    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B"><span class="ico-i ico-ballot"></span>طلب اجتماع جديد يحتاج رأيك</h2>
        <p>مرحبًا ${orgEsc(nameByEmail[email]||"")}،</p>
        <p>${requesterName ? `طلب ${requesterName}` : "تم تقديم طلب"} عقد اجتماع بشركة ${orgEsc(company?.name||"")}، ويحتاج موافقتك على الموعد المقترح:</p>
        <p><b>العنوان:</b> ${orgEsc(req.title||"")}<br/>
           <b>النوع:</b> ${req.meeting_type||""}<br/>
           <b>الموعد المقترح:</b> ${req.proposed_date||""} ${timeRange}<br/>
           <b>طريقة الانعقاد:</b> ${req.method||""}</p>
        ${req.notes ? `<p><b>ملاحظات:</b> ${orgEsc(req.notes)}</p>` : ""}
        <p><a href="${appLink}" target="_blank" style="background:#B8972A;color:#0D2447;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">افتح المنصة للرد على الطلب</a></p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await sendNotificationEmail(email, subject, html);
  }
}

async function openMeetingRequestPopup(requestId){
  const body = document.getElementById("mrqModalBody");
  if(!body) return;
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-meeting-request-view");

  const { data: req, error } = await sb.from("meeting_requests").select("*").eq("id", requestId).single();
  if(error || !req){ body.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const { data: responses } = await sb.from("meeting_request_responses").select("*").eq("request_id", requestId);
  const revs = responses || [];
  const mine = myEmail ? revs.find(r=>r.reviewer_email===myEmail) : null;
  const approvedCount = revs.filter(r=>r.response==="موافقة").length;
  const altCount = revs.filter(r=>r.response==="تعديل الموعد").length;
  const altList = revs.filter(r=>r.response==="تعديل الموعد").map(r=>
    `<div style="font-size:10.5px;color:var(--gray3)">↳ ${orgEsc(r.reviewer_name||r.reviewer_email)}: يقترح ${r.alt_date||"—"}${r.alt_time?(' — '+r.alt_time):''}${r.notes?(' ('+r.notes+')'):''}</div>`
  ).join("");
  const timeRange = req.proposed_time ? (' — من '+req.proposed_time+(req.proposed_time_end?(' إلى '+req.proposed_time_end):'')) : '';
  let deadlineHTML = "";
  if(req.response_deadline){
    const isOver = new Date(req.response_deadline) < new Date();
    const deadlineStr = new Date(req.response_deadline).toLocaleString('ar-SA-u-ca-gregory', {dateStyle:'medium', timeStyle:'short'});
    deadlineHTML = `<div style="font-size:11px;font-weight:800;padding:6px 10px;border-radius:6px;margin-bottom:8px;background:${isOver?'#FDE8E8':'#FDF5DC'};color:${isOver?'var(--red)':'var(--gold)'}">
      ${isOver ? '⌛ انتهت مهلة الرد المحددة' : '⏰ آخر موعد للرد: '+deadlineStr}
    </div>`;
  }

  body.innerHTML = `
    <div style="font-weight:800;font-size:15px;color:var(--dark)">${orgEsc(req.title||"")}</div>
    <div style="font-size:11px;color:var(--gray3);font-weight:600;margin-bottom:10px">${req.meeting_type||""}</div>
    ${deadlineHTML}
    <div style="font-size:13px;color:var(--dark);margin:6px 0"><span class="ico-i ico-calendar"></span>الموعد المقترح: <b>${req.proposed_date||"—"}</b>${timeRange} &nbsp;·&nbsp; 📍 ${req.method||"—"}</div>
    ${req.notes ? `<div style="font-size:12px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-edit"></span>${orgEsc(req.notes)}</div>` : ""}
    <div style="font-size:11.5px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-check"></span>موافقون: ${approvedCount} &nbsp;·&nbsp; 🔁 مقترحون موعدًا آخر: ${altCount}</div>
    ${altList}
    <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
      <button class="btn-xs" style="background:${mine&&mine.response==='موافقة'?'linear-gradient(135deg,var(--primary),var(--accent))':'#E8F8EF'};color:${mine&&mine.response==='موافقة'?'#fff':'var(--green)'};border:none;border-radius:6px;padding:7px 14px;font-size:11.5px;cursor:pointer" onclick="respondMeetingRequest(${req.id},'موافقة')"><span class="ico-i ico-check"></span>موافقة على الموعد</button>
      <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px 14px;font-size:11.5px;cursor:pointer" onclick="toggleAltDateForm(${req.id})"><span class="ico-i ico-refresh"></span>اقتراح موعد بديل</button>
    </div>
    <div id="alt-form-${req.id}" style="display:none;margin-top:10px;padding:10px;background:var(--offwhite);border-radius:8px">
      <div class="row2">
        <div class="fg"><label style="font-size:11px">الموعد البديل</label><input type="date" class="fi" id="alt-date-${req.id}"/></div>
        <div class="fg"><label style="font-size:11px">الوقت البديل</label><input type="time" class="fi" id="alt-time-${req.id}"/></div>
      </div>
      <textarea id="alt-notes-${req.id}" placeholder="سبب التعديل (اختياري)" rows="2" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-top:6px"></textarea>
      <button class="btn-xs primary" style="margin-top:8px" onclick="respondMeetingRequest(${req.id},'تعديل الموعد')"><span class="ico-i ico-send"></span>إرسال الاقتراح</button>
    </div>
  `;
}

function toggleAltDateForm(requestId){
  const el = document.getElementById("alt-form-"+requestId);
  if(el) el.style.display = el.style.display === "none" ? "block" : "none";
}

async function respondMeetingRequest(requestId, response){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  let alt_date = null, alt_time = null, notes = null;
  if(response === "تعديل الموعد"){
    alt_date = document.getElementById("alt-date-"+requestId).value || null;
    if(!alt_date){ alert("الرجاء تحديد الموعد البديل"); return; }
    alt_time = document.getElementById("alt-time-"+requestId).value || null;
    notes = document.getElementById("alt-notes-"+requestId).value.trim();
  }

  await sb.from("meeting_request_responses").delete().eq("request_id", requestId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("meeting_request_responses").insert([{
    request_id: requestId, reviewer_email: myEmail, reviewer_name, response, alt_date, alt_time, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ ردّك: " + error.message); return; }

  await recomputeMeetingRequestStatus(requestId);
  closeM("m-meeting-request-view");
  loadMeetingsAll();
}

/* Only becomes a confirmed real meeting once every board member who responded approved
   unanimously (no one proposed an alternate date), and all board members have responded. */
async function recomputeMeetingRequestStatus(requestId){
  const { data: revs, error } = await sb.from("meeting_request_responses").select("*").eq("request_id", requestId);
  if(error || !revs || revs.length===0) return;
  const anyAlt = revs.some(r => r.response === "تعديل الموعد");
  if(anyAlt) return; // stays pending — needs discussion/a new proposed date

  const { data: req } = await sb.from("meeting_requests").select("*").eq("id", requestId).single();
  if(!req) return;

  // Only members actually linked to a login account (claimed_by_email) can ever respond to a
  // request through the platform — counting unlinked roster entries here would make consensus
  // permanently impossible to reach whenever even one member hasn't been "🔗 ربط بحساب" yet.
  // A committee-scoped request only needs that committee's own members to agree, not the
  // whole board — same eligibility rule used for committee decision voting.
  let totalMembers;
  if(req.committee_id){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", req.committee_id);
    const memberIds = (links||[]).map(l => l.member_id);
    const { count } = memberIds.length
      ? await sb.from("board_members").select("*", { count:'exact', head:true }).in("id", memberIds).not("claimed_by_email","is",null)
      : { count: 0 };
    totalMembers = count || 0;
  } else {
    const { count } = await sb.from("board_members").select("*", { count: 'exact', head: true })
      .eq("company_id", currentCompanyId).not("claimed_by_email", "is", null);
    totalMembers = count || 0;
  }
  const approvedEmails = new Set(revs.filter(r=>r.response==="موافقة").map(r=>r.reviewer_email));
  if(totalMembers > 0 && approvedEmails.size < totalMembers) return; // not everyone linked has responded yet

  const { data: newMeeting, error: insErr } = await sb.from("meetings").insert([{
    title: req.title, meeting_type: req.meeting_type, meeting_date: req.proposed_date,
    meeting_time: req.proposed_time, time_end: req.proposed_time_end, method: req.method,
    meeting_link: req.meeting_link, committee_id: req.committee_id, notes: req.notes, company_id: currentCompanyId
  }]).select().single();
  if(insErr) return;

  // Agenda: fixed opening + whatever the requester listed + fixed closing — same rule as
  // meetings created directly, so a request-approved meeting is never missing its agenda.
  const customTopics = Array.isArray(req.proposed_topics) ? req.proposed_topics : [];
  const finalTopics = withAgendaBookends(customTopics);
  const topicRows = finalTopics.map((topic_text, i) => ({ meeting_id: newMeeting.id, topic_text, sort_order: i, company_id: currentCompanyId }));
  await sb.from("vote_topics").insert(topicRows);
  // Same automatic conversion: every real agenda item becomes a votable decision.
  if(customTopics.length){
    const decisionRows = customTopics.map(topic_text => ({ meeting_id: newMeeting.id, decision_text: topic_text, company_id: currentCompanyId }));
    await sb.from("board_decisions").insert(decisionRows);
  }

  await sb.from("meeting_requests").update({ status: "معتمد" }).eq("id", requestId);
  await generateAndUploadMeetingInvitation(newMeeting.id);
}
