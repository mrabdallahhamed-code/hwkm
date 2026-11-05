/* ══════════ BOARD ELECTION — cumulative or regular voting, per company bylaws ══════════
   The method (تراكمي/عادي) is a company-wide setting (per its Articles of Association),
   editable right here; changing it doesn't touch votes already cast, only how future ones
   and the live tally are interpreted. Cumulative: each shareholder gets (shares × seats)
   votes total, freely allocated across candidates. Regular: a plain موافق/معارض/ممتنع per
   candidate, weighted by shares like every other AGM vote. */
let currentElectionCandidates = [];
const ELECTION_METHOD_HINTS = {
  "تراكمي": "تراكمي: كل مساهم يملك (أسهمه × عدد المقاعد) صوتًا، يوزّعها على المرشحين كيف يحب.",
  "عادي": "عادي: يصوّت المساهم موافق/معارض/ممتنع على كل مرشح لحاله."
};

async function loadElectionSection(meetingId){
  const methodSel = document.getElementById("agmView-election-method");
  const seatsInput = document.getElementById("agmView-election-seats");
  const hint = document.getElementById("agmView-electionMethodHint");
  if(!methodSel) return;

  const { data: company } = await sb.from("companies").select("board_election_method").eq("id", currentCompanyId).single();
  const method = company?.board_election_method || "عادي";
  methodSel.value = method;
  if(hint) hint.textContent = ELECTION_METHOD_HINTS[method];

  const { data: candidates } = await sb.from("board_election_candidates").select("*").eq("meeting_id", meetingId).order("id",{ascending:true});
  currentElectionCandidates = candidates || [];
  if(currentElectionCandidates.length && seatsInput) seatsInput.value = currentElectionCandidates[0].seats_available || 1;

  renderElectionCandidatesList();
  renderElectionResults(meetingId, method);
}

function renderElectionCandidatesList(){
  const box = document.getElementById("agmView-candidates");
  if(!box) return;
  box.innerHTML = currentElectionCandidates.length
    ? currentElectionCandidates.map((c,i) => `<div class="topic-row">
        <div class="topic-num">${i+1}</div>
        <div class="topic-text">${orgEsc(c.name)}</div>
        <button class="topic-del" onclick="deleteElectionCandidate(${c.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
      </div>`).join("")
    : '<div style="font-size:11px;color:var(--gray3);padding:6px 0">لا يوجد مرشحون مضافون بعد.</div>';
}

async function saveElectionMethod(){
  const method = document.getElementById("agmView-election-method").value;
  await sb.from("companies").update({ board_election_method: method }).eq("id", currentCompanyId);
  const hint = document.getElementById("agmView-electionMethodHint");
  if(hint) hint.textContent = ELECTION_METHOD_HINTS[method];
  if(currentAGMModalMeetingId) renderElectionResults(currentAGMModalMeetingId, method);
}

async function saveElectionSeats(){
  if(!currentAGMModalMeetingId) return;
  const seats = Number(document.getElementById("agmView-election-seats").value) || 1;
  await sb.from("board_election_candidates").update({ seats_available: seats }).eq("meeting_id", currentAGMModalMeetingId);
  loadElectionSection(currentAGMModalMeetingId);
}

async function addElectionCandidate(){
  const input = document.getElementById("agmView-newcandidate");
  const name = input.value.trim();
  if(!name || !currentAGMModalMeetingId) return;
  const seats = Number(document.getElementById("agmView-election-seats").value) || 1;
  const { error } = await sb.from("board_election_candidates").insert([{
    meeting_id: currentAGMModalMeetingId, name, seats_available: seats, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إضافة المرشح: " + error.message); return; }
  input.value = "";
  loadElectionSection(currentAGMModalMeetingId);
}

async function deleteElectionCandidate(id){
  if(!await uiConfirm("حذف هذا المرشح؟ سيُحذف معه أي أصوات مسجّلة له.")) return;
  await sb.from("board_election_candidates").delete().eq("id", id);
  loadElectionSection(currentAGMModalMeetingId);
}

async function renderElectionResults(meetingId, method){
  const box = document.getElementById("agmView-electionResults");
  if(!box) return;
  if(!currentElectionCandidates || currentElectionCandidates.length === 0){ box.innerHTML = ""; return; }
  method = method || document.getElementById("agmView-election-method")?.value || "عادي";
  const seats = currentElectionCandidates[0]?.seats_available || 1;

  const candidateIds = currentElectionCandidates.map(c=>c.id);
  const { data: allVotes } = await sb.from("board_election_votes").select("*").in("candidate_id", candidateIds);

  const tallies = currentElectionCandidates.map(c => {
    const votes = (allVotes||[]).filter(v=>v.candidate_id===c.id);
    let score;
    if(method === "تراكمي"){
      score = votes.reduce((s,v)=> s + (Number(v.votes_allocated)||0), 0);
    } else {
      const yesShares = votes.filter(v=>v.vote==="موافق").reduce((s,v)=>s+(Number(v.shares_count)||0),0);
      const noShares = votes.filter(v=>v.vote==="معارض").reduce((s,v)=>s+(Number(v.shares_count)||0),0);
      score = yesShares - noShares;
    }
    return { ...c, score, voterCount: votes.length };
  }).sort((a,b) => b.score - a.score);

  box.innerHTML = `<div style="font-size:11.5px;font-weight:800;color:var(--dark);margin-bottom:8px"><span class="ico-i ico-dashboard"></span>النتائج الحية (أعلى ${seats} يفوزون)</div>` +
    tallies.map((c,i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:${i<seats?'#E8F8EF':'var(--offwhite)'};border-radius:8px;margin-bottom:6px">
      <span style="font-size:12px;font-weight:700;color:var(--dark)">${i+1}. ${orgEsc(c.name)} ${i<seats?'<span style="color:var(--green);font-weight:800"><span class="ico-i ico-check"></span>منتخب</span>':''}</span>
      <span style="font-size:11.5px;color:var(--gray3)">${method==="تراكمي" ? c.score.toLocaleString('ar-SA-u-ca-gregory')+" صوت" : c.score.toLocaleString('ar-SA-u-ca-gregory')+" صافي"} (${c.voterCount} صوّت)</span>
    </div>`).join("");
}

function isoToDatetimeLocal(iso){
  if(!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveAGMVotingDates(){
  if(!currentAGMModalMeetingId) return;
  const startRaw = document.getElementById("agmView-voting-start").value;
  const endRaw = document.getElementById("agmView-voting-end").value;
  const voting_start = startRaw ? new Date(startRaw).toISOString() : null;
  const voting_end = endRaw ? new Date(endRaw).toISOString() : null;
  const agm_type = document.getElementById("agmView-agm-type").value;
  const call_number = Number(document.getElementById("agmView-call-number").value);
  const { error } = await sb.from("meetings").update({ voting_start, voting_end, agm_type, call_number }).eq("id", currentAGMModalMeetingId);
  if(error){ alert("تعذّر حفظ المواعيد: " + error.message); return; }
  alert("تم حفظ المواعيد والنوع ✅");
  await loadMeetingsAll();
  renderAGMQuorumWidget(currentAGMModalMeetingId);
}

/* Determines the legally-required quorum % for this specific AGM sitting (ordinary/
   extraordinary × 1st/2nd/3rd call), per the Saudi Companies Law defaults — each
   configurable per company in case the Articles of Association set different thresholds. */
function getAGMQuorumThreshold(company, agmType, callNumber){
  if(agmType === "غير عادية"){
    if(callNumber===1) return Number(company.agm_extraordinary_quorum_1 ?? 50);
    if(callNumber===2) return Number(company.agm_extraordinary_quorum_2 ?? 25);
    return Number(company.agm_extraordinary_quorum_3 ?? 0);
  }
  if(callNumber===1) return Number(company.agm_ordinary_quorum_1 ?? 25);
  return Number(company.agm_ordinary_quorum_2 ?? 0);
}

/* Quorum panel — now driven by real check-in records (agm_attendance), not by who has
   cast a vote, since attendance and voting are two different facts: someone can attend
   and abstain from every topic, and still count toward quorum. */
async function renderAGMQuorumWidget(meetingId){
  const box = document.getElementById("agmView-quorum");
  if(!box) return;
  const [{ data: m }, { data: attendance }, { data: company }] = await Promise.all([
    sb.from("meetings").select("*").eq("id", meetingId).single(),
    sb.from("agm_attendance").select("*").eq("meeting_id", meetingId).order("checked_in_at",{ascending:true}),
    sb.from("companies").select("*").eq("id", currentCompanyId).single()
  ]);
  if(!m || !company){ box.innerHTML = ""; return; }

  const rows = attendance || [];
  const totalShares = Number(company.total_shares) || 0;
  const { data: regRows } = await sb.from("shareholders").select("shares_count").eq("company_id", currentCompanyId);
  const regSum = (regRows || []).reduce((t, r) => t + (Number(r.shares_count) || 0), 0);
  const mismatch = !totalShares ? "⚠️ إجمالي أسهم الشركة غير مُدخل، فلن يُحسب النصاب بشكل صحيح. أدخله من بيانات الشركة."
    : (regSum && regSum !== totalShares ? "⚠️ مجموع أسهم سجل المساهمين (" + regSum.toLocaleString("ar-SA-u-ca-gregory") + ") لا يساوي إجمالي أسهم الشركة (" + totalShares.toLocaleString("ar-SA-u-ca-gregory") + "). راجع أحدهما قبل الاعتماد على النصاب." : "");
  const attendingShares = rows.reduce((s,r) => s + (Number(r.shares_asalah)||0) + (Number(r.shares_wakala)||0), 0);
  const attendancePct = totalShares ? (attendingShares/totalShares)*100 : 0;
  const threshold = getAGMQuorumThreshold(company, m.agm_type||"عادية", m.call_number||1);
  const met = attendancePct >= threshold;

  box.innerHTML = (mismatch ? `<div style="background:#FDE8E8;color:var(--red);border-radius:10px;padding:10px 12px;font-size:12px;font-weight:700;margin-bottom:8px">${mismatch}</div>` : "") + `
    <div class="quorum-banner ${met?'ok':'pending'}">
      ${met?'✅':'⏳'} النصاب المطلوب ${threshold}% — الحضور الحالي ${attendancePct.toFixed(1)}% ${met?'(تحقق النصاب)':'(لم يتحقق بعد)'}
    </div>
    <div class="stat-mini-grid" style="margin-top:10px">
      <div class="stat-mini"><div class="stat-mini-num">${rows.length}</div><div class="stat-mini-label">مساهم حاضر</div></div>
      <div class="stat-mini"><div class="stat-mini-num">${attendingShares.toLocaleString('ar-SA-u-ca-gregory')}</div><div class="stat-mini-label">سهم ممثَّل</div></div>
    </div>`;
}

/* "معدل التصويت حتى الآن" — a live snapshot of how much of the capital has actually cast
   a vote so far, pulled fresh from the votes table every time this page opens (same data
   the voting page itself works from). Distinct from quorum/attendance above on purpose. */
async function renderAGMVotingRateWidget(meetingId){
  const box = document.getElementById("agmView-votingRate");
  if(!box) return;
  const [{ data: votes }, { data: company }] = await Promise.all([
    sb.from("votes").select("shareholder_name,shares_count,id").eq("meeting_id", meetingId).not("shareholder_name","is",null),
    sb.from("companies").select("total_shares").eq("id", currentCompanyId).single()
  ]);
  const totalShares = Number(company?.total_shares) || 0;
  const byShareholder = {};
  (votes||[]).forEach(v => {
    const key = v.shareholder_name;
    if(!byShareholder[key] || v.id >= byShareholder[key].lastId){
      byShareholder[key] = { shares: Number(v.shares_count)||0, lastId: v.id };
    }
  });
  const voterCount = Object.keys(byShareholder).length;
  const votedShares = Object.values(byShareholder).reduce((s,x)=>s+x.shares,0);
  const votedPct = totalShares ? (votedShares/totalShares*100) : 0;

  box.innerHTML = `<div class="stat-mini-grid">
      <div class="stat-mini"><div class="stat-mini-num">${voterCount}</div><div class="stat-mini-label">مساهم صوّت حتى الآن</div></div>
      <div class="stat-mini"><div class="stat-mini-num">${votedPct.toFixed(1)}%</div><div class="stat-mini-label">من رأس المال صوّت</div></div>
    </div>`;
}

function goToAGMVoting(){
  if(!currentAGMModalMeetingId) return;
  currentVotingMeetingId = currentAGMModalMeetingId;
  closeM("m-agm-view");
  go('voting');
}

// Calls the "create-teams-meeting" Edge Function to auto-generate a real Teams join link —
// works the moment that function is deployed with valid Teams credentials, no platform code
// changes needed later. Until then, it fails gracefully with a clear status message.
async function generateTeamsMeetingLink(){
  const title = document.getElementById("mt-title").value.trim() || "اجتماع";
  const dateVal = document.getElementById("mt-date").value;
  const timeVal = document.getElementById("mt-time").value || "12:00";
  if(!dateVal){ alert("حدد تاريخ الاجتماع أولًا قبل توليد الرابط"); return; }

  const start = new Date(`${dateVal}T${timeVal}`);
  const end = new Date(start.getTime() + 60*60*1000); // default 1-hour duration

  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-teams-meeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: title, startTime: start.toISOString(), endTime: end.toISOString() })
    });
    const data = await res.json();
    if(!res.ok || !data.joinUrl){
      alert("⚠️ توليد الرابط التلقائي غير مفعّل بعد — يحتاج ربط حساب Teams أولًا (اضغط 'رابط الانضمام' واكتبه يدويًا مؤقتًا).");
      return;
    }
    document.getElementById("mt-link").value = data.joinUrl;
    alert("تم توليد رابط الاجتماع تلقائيًا ✅");
  }catch(e){
    alert("⚠️ توليد الرابط التلقائي غير مفعّل بعد — يحتاج ربط حساب Teams أولًا (اضغط 'رابط الانضمام' واكتبه يدويًا مؤقتًا).");
  }
}

// Same as generateTeamsMeetingLink() above, but for the "طلب اجتماع" form (mtr-* fields)
// instead of the direct-creation form (mt-* fields) — so a proposed meeting can already
// have a join link ready before it's even confirmed by consensus.
async function generateTeamsMeetingLinkForRequest(){
  const title = document.getElementById("mtr-title").value.trim() || "اجتماع";
  const dateVal = document.getElementById("mtr-date").value;
  const timeVal = document.getElementById("mtr-time").value || "12:00";
  if(!dateVal){ alert("حدد التاريخ المقترح أولًا قبل توليد الرابط"); return; }

  const start = new Date(`${dateVal}T${timeVal}`);
  const end = new Date(start.getTime() + 60*60*1000);

  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-teams-meeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: title, startTime: start.toISOString(), endTime: end.toISOString() })
    });
    const data = await res.json();
    if(!res.ok || !data.joinUrl){
      alert("⚠️ توليد الرابط التلقائي غير مفعّل بعد — يحتاج ربط حساب Teams أولًا (اكتب الرابط يدويًا مؤقتًا).");
      return;
    }
    document.getElementById("mtr-link").value = data.joinUrl;
    alert("تم توليد رابط الاجتماع تلقائيًا ✅");
  }catch(e){
    alert("⚠️ توليد الرابط التلقائي غير مفعّل بعد — يحتاج ربط حساب Teams أولًا (اكتب الرابط يدويًا مؤقتًا).");
  }
}

// Shows the committee picker on the request form when "اجتماع لجنة" is chosen — mirrors
// toggleVotingDatesFields()'s committee-field logic for the direct-creation form.
async function toggleRequestCommitteeField(){
  const type = document.getElementById("mtr-type").value;
  const field = document.getElementById("mtr-committee-field");
  if(!field) return;
  field.style.display = (type === "اجتماع لجنة") ? "block" : "none";
  if(type === "اجتماع لجنة"){
    const sel = document.getElementById("mtr-committee-id");
    const { data } = await sb.from("committees").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
    sel.innerHTML = '<option value="">— اختر اللجنة —</option>' + (data||[]).map(c => `<option value="${c.id}">${orgEsc(c.committee_name)}</option>`).join("");
  }
}

async function toggleVotingDatesFields(){
  const type = document.getElementById("mt-type").value;
  const box = document.getElementById("mt-voting-dates");
  if(box) box.style.display = (type === "الجمعية العامة") ? "block" : "none";
  if(type !== "الجمعية العامة"){
    document.getElementById("mt-is-listed-agm").checked = false;
  }
  toggleListedAgmMode();

  const committeeField = document.getElementById("mt-committee-field");
  if(committeeField){
    committeeField.style.display = (type === "اجتماع لجنة") ? "block" : "none";
    if(type === "اجتماع لجنة"){
      const sel = document.getElementById("mt-committee-id");
      const { data } = await sb.from("committees").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
      sel.innerHTML = '<option value="">— اختر اللجنة —</option>' + (data||[]).map(c => `<option value="${c.id}">${orgEsc(c.committee_name)}</option>`).join("");
    }
  }
}

// A listed company's AGM votes through Tadawul, not our own voting system — hide the internal
// voting-window fields entirely in that case, since opening/closing an internal vote here would
// be meaningless (and potentially confusing) for a meeting whose real vote happens elsewhere.
function toggleListedAgmMode(){
  const isListed = document.getElementById("mt-is-listed-agm").checked;
  const votingStartField = document.getElementById("mt-voting-start").closest(".fg");
  const votingEndField = document.getElementById("mt-voting-end").closest(".fg");
  if(votingStartField) votingStartField.style.display = isListed ? "none" : "block";
  if(votingEndField) votingEndField.style.display = isListed ? "none" : "block";
}
