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
  const isOver = r.response_deadline ? (new Date(r.response_deadline) < new Date()) : false;
  let deadlineDetail = "";
  if(r.response_deadline && !isOver){
    deadlineDetail = `<div class="mc-detail" style="color:var(--gold);font-weight:700"><span class="ico-i ico-calendar"></span>آخر موعد للرد: ${new Date(r.response_deadline).toLocaleDateString('ar-SA-u-ca-gregory')}</div>`;
  }
  return `<div class="mc pending" onclick="openMeetingRequestPopup(${r.id})">
    <span class="mc-pill${isOver?' over':''}">${isOver ? 'انتهت مهلة الرد' : 'بانتظار موافقة الأعضاء'}</span>
    <div class="mc-title">${orgEsc(r.title||"")}</div>
    <div class="mc-detail"><span class="ico-i ico-calendar"></span>${r.proposed_date||"—"}${r.proposed_time ? (" — من "+r.proposed_time+(r.proposed_time_end?(" إلى "+r.proposed_time_end):"")) : ""}</div>
    <div class="mc-detail"><span class="ico-i ico-pin"></span>${r.method||"—"}</div>
    ${deadlineDetail}
    <div class="mc-actions">
      ${isOver
        ? `<button class="btn-xs" style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="event.stopPropagation();openMeetingRequestPopup(${r.id})"><span class="ico-i ico-folder"></span>عرض الطلب</button>`
        : `<button class="btn-xs gold" style="width:100%" onclick="event.stopPropagation();openMeetingRequestPopup(${r.id})"><span class="ico-i ico-ballot"></span>الرد على الطلب</button>`}
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
