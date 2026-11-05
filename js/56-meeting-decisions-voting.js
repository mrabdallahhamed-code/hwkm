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
