/* ══════════ PERFORMANCE EVALUATIONS ══════════ */
let perfCache = [];
const PERF_SCORE_LABELS = {1:"ضعيف",2:"مقبول",3:"جيد",4:"جيد جدًا",5:"ممتاز"};

const PERF_AUTO_CRITERIA = ["الانضباط والالتزام (آلي)", "نسبة الحضور الفعلية (آلي)", "نسبة المشاركة بالتصويت (آلي)", "نسبة إنجاز القرارات الموكلة (آلي)", "الانضباط بمواعيد التقارير (آلي)"];

/* Board members eligible for evaluation — everyone with a linked account except executives
   (they get their own section, sourced from the org structure instead — see below). */
async function getEvaluableBoardMembers(){
  const people = await getPerfEligiblePeople();
  return people.filter(p => p.role !== "تنفيذي");
}

/* Senior executive management is tied to the actual org chart, not a flag on a board row:
   الرئيس التنفيذي، نواب الرئيس (إن وُجدوا), المدير المالي. Two independent signals, either one
   is enough: (1) the org-chart holder's name matches a real linked account, or (2) the account
   itself carries a membership role whose text already says "رئيس تنفيذي" / "نائب الرئيس" /
   "مدير مالي" (e.g. a custom role set from إدارة الفريق). Filtering happens in plain JS rather
   than a server-side OR-filter string, so a mismatched pattern can never silently take down the
   whole query — worst case one signal contributes nothing, it never throws. */
async function getEvaluableExecutives(){
  const EXEC_PATTERNS = ["تنفيذي","نائب الرئيس","نائب رئيس","مدير مالي","المدير المالي"];
  const results = new Map(); // keyed by email — de-dupes if both signals agree on the same person

  try {
    const { data: allMemberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
    const roleMatches = (allMemberships||[]).filter(m => EXEC_PATTERNS.some(p => (m.role||"").includes(p)));
    for(const m of roleMatches){
      const { data: profile } = await sb.from("user_profiles").select("full_name").eq("email", m.email).maybeSingle();
      results.set(m.email, { name: profile?.full_name || m.email, email: m.email, role: "تنفيذي", position: m.role });
    }
  } catch(e){ console.error("exec role-signal failed", e); }

  try {
    const { data: positions } = await sb.from("org_structure").select("position_title,holder_name").eq("company_id", currentCompanyId);
    const execPositions = (positions||[]).filter(p => p.holder_name && EXEC_PATTERNS.some(pat => (p.position_title||"").includes(pat)));
    for(const pos of execPositions){
      const holderName = pos.holder_name.trim();
      const { data: profile } = await sb.from("user_profiles").select("email").ilike("full_name", holderName).maybeSingle();
      if(!profile || !profile.email) continue;
      if(results.has(profile.email)) continue;
      const { data: membership } = await sb.from("user_company_memberships").select("email").eq("company_id", currentCompanyId).eq("email", profile.email).maybeSingle();
      if(!membership) continue;
      results.set(profile.email, { name: holderName, email: profile.email, role: "تنفيذي", position: pos.position_title });
    }
  } catch(e){ console.error("exec org-structure-signal failed", e); }

  return Array.from(results.values());
}

/* Who reviews an executive: every linked board member (voting members) — executives don't
   review each other or themselves. */
async function getExecReviewerAudience(){
  const boardPeople = await getEvaluableBoardMembers();
  return boardPeople.map(p => p.email);
}

/* Opening a new evaluation cycle is an operational task (مدير النظام runs the platform), kept
   separate from *seeing results* (a confidentiality-restricted set) — someone can administer
   the cycle without being entitled to read peers' scores themselves. */
async function canManagePerfCycles(){
  if(currentUserProfile && currentUserProfile.is_platform_admin === true) return true;
  if(getCurrentRole() === "مدير النظام") return true;
  return await canSeePerfResults();
}

/* ══ AUTOMATIC CYCLE ══ When a manager opens the page: (1) open this year's evaluation for everyone eligible who
   has none yet, with their system-computed scores; (2) refresh the system scores of evaluations still open;
   (3) close an evaluation automatically once every assigned reviewer has submitted. Nothing here replaces what
   reviewers score — it only removes the clicking around it. */
let _perfAutoRunning = false;
async function perfAutoCycle(boardPeople, execPeople){
  if(_perfAutoRunning) return false; _perfAutoRunning = true;
  let changed = false;
  try {
    const period = String(new Date().getFullYear());
    const { data: evs } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId);
    const all = evs || [];
    const people = [...(boardPeople||[]).map(p => ({ ...p, isExec:false })), ...(execPeople||[]).map(p => ({ ...p, isExec:true }))];
    for(const p of people){
      const mine = all.filter(e => e.evaluated_email === p.email);
      const role = p.isExec ? "تنفيذي" : (p.role || "عضو مجلس");
      if(!mine.some(e => String(e.period) === period)){
        const auto = await perfComputeAuto(p.email, role);
        const { data: ne, error } = await sb.from("performance_evaluations").insert([{
          entity_name: p.name || p.email, entity_type: role === "تنفيذي" ? "تنفيذي" : "عضو مجلس", evaluated_email: p.email,
          period, status: "مفتوح للتقييم", company_id: currentCompanyId, ...auto.payload }]).select().single();
        if(!error && ne){ await perfWriteAuto(ne.id, auto.autoScores); changed = true; }
      } else {
        const open = mine.find(e => String(e.period) === period && e.status !== "مكتمل");
        if(open){ const auto = await perfComputeAuto(p.email, role); await perfWriteAuto(open.id, auto.autoScores); }
      }
    }
  } catch(e){ console.error("auto cycle failed", e); }
  _perfAutoRunning = false;
  return changed;
}

async function perfMaybeAutoClose(evaluationId){
  try {
    const { data: ev } = await sb.from("performance_evaluations").select("*").eq("id", evaluationId).single();
    if(!ev || ev.status === "مكتمل" || !ev.evaluated_email) return false;
    const audience = ev.entity_type === "تنفيذي" ? await getExecReviewerAudience() : await getPerfReviewerAudience(ev.evaluated_email);
    if(!audience.length) return false;
    const { data: revs } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", evaluationId);
    const done = new Set((revs||[]).filter(r => r.reviewer_email !== "system@hwkm.internal").map(r => r.reviewer_email));
    if(!audience.every(a => done.has(a))) return false;
    const avg = (revs||[]).reduce((x,r) => x + (r.score||0), 0) / (revs||[]).length;
    const { error } = await sb.from("performance_evaluations").update({ score: avg, status: "مكتمل" }).eq("id", evaluationId);
    if(error) return false;
    logActivity("اعتماد", "تقييم أداء", ev.entity_name || "", `اعتُمدت النتيجة تلقائياً بعد اكتمال كل المقيّمين: ${avg.toFixed(1)}/5`);
    return true;
  } catch(e){ return false; }
}

async function loadPerf(){
  const isAdmin = await canSeePerfResults();
  const canManage = await canManagePerfCycles();
  await loadPerfCriteriaCache();
  const manageCriteriaBtn = document.getElementById("btnManagePerfCriteria");
  if(manageCriteriaBtn) manageCriteriaBtn.style.display = canManage ? "inline-block" : "none";
  const [boardResult, execResult] = await Promise.allSettled([getEvaluableBoardMembers(), getEvaluableExecutives()]);
  const boardPeople = boardResult.status === "fulfilled" ? boardResult.value : [];
  const execPeople = execResult.status === "fulfilled" ? execResult.value : [];
  if(boardResult.status === "rejected") console.error("board list failed", boardResult.reason);
  if(execResult.status === "rejected") console.error("exec list failed", execResult.reason);

  if(canManage && !(currentCompanyType === "مؤسسة فردية")) await perfAutoCycle(boardPeople, execPeople);
  const { data: allEvals } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  perfCache = allEvals || [];
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  // Sole proprietorships and single-manager LLCs have no board at all — only the executive
  // section applies, and its heading needn't say "مجلس" for a structure that has none.
  // Everyone else gets the company-appropriate body name instead of a hardcoded label.
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const hideBoardEval = isSoleProp || currentCompanyLLCSingleManager;
  const manualBtn = document.getElementById("btnManualPerfAdd");
  if(manualBtn) manualBtn.style.display = canManage ? "inline-block" : "none";
  const boardSectionTitle = document.getElementById("perfBoardSectionTitle");
  const boardSection = document.getElementById("perfBoardSection");
  if(boardSection) boardSection.style.display = hideBoardEval ? "none" : "block";
  if(boardSectionTitle) boardSectionTitle.textContent = `تقييمات ${getGovernanceBodyLabel()}`;

  const latestEvalFor = (email) => (perfCache).find(e => e.evaluated_email === email);

  async function renderCard(person, isExec){
    const ev = latestEvalFor(person.email);
    let statusHTML, actionHTML = "";
    if(!ev){

      statusHTML = `<span style="font-size:11px;color:var(--gray3)">لا يوجد تقييم مفتوح حاليًا</span>`;
      if(canManage) actionHTML = `<button class="btn-xs gold" style="width:100%;margin-top:10px" onclick="openNewPerfEvaluation('${orgEsc(person.email)}')"><span class="ico-i ico-add"></span>فتح تقييم جديد</button>`;
    } else if(ev.status === "مكتمل"){
      const scoreLabel = ev.score!=null ? (Number(ev.score).toFixed(1)+"/5 — "+(PERF_SCORE_LABELS[Math.round(ev.score)]||"")) : "—";
      statusHTML = isAdmin
        ? `<div style="font-size:22px;font-weight:900;color:var(--primary);margin-top:4px">${scoreLabel}</div>`
        : `<span class="badge done">التقييم مكتمل</span>`;
      actionHTML = `<button class="btn-xs primary" style="width:100%;margin-top:10px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-search"></span>التفاصيل</button>`;
    } else {
      const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
      const iAmReviewer = !isPlatformOwner && myEmail && myEmail !== person.email;
      const { data: mySubmitted } = await sb.from("performance_evaluation_reviews").select("id").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"").limit(1);
      const alreadyDone = mySubmitted && mySubmitted.length > 0;
      statusHTML = `<span class="badge pending">مفتوح للتقييم</span>`;
      if(isAdmin) actionHTML += `<button class="btn-xs primary" style="width:100%;margin-top:8px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-search"></span>متابعة النتائج</button>`;
      if(iAmReviewer){
        actionHTML += alreadyDone
          ? `<div style="text-align:center;color:var(--green);font-size:11px;margin-top:8px"><span class="ico-i ico-check"></span>أرسلت تقييمك</div>`
          : `<button class="btn-xs gold" style="width:100%;margin-top:8px" onclick="openPerfDetail('${orgEsc(person.email)}',${isExec})"><span class="ico-i ico-signature"></span>ابدأ التقييم</button>`;
      }
    }
    return `<div class="card" style="margin:0">
      <div class="card-body" style="text-align:center">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;margin:0 auto 8px">${(person.name||"?").charAt(0)}</div>
        <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(person.name||"")}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">${orgEsc(person.position || person.role || "")}</div>
        ${statusHTML}
        ${actionHTML}
      </div>
    </div>`;
  }

  const boardBox = document.getElementById("perfBoardCards");
  if(boardBox){
    boardBox.innerHTML = boardPeople.length ? (await Promise.all(boardPeople.map(p=>renderCard(p,false)))).join("")
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;grid-column:1/-1">لا يوجد أعضاء مرتبطين بحسابات بعد.</div>';
  }
  const execBox = document.getElementById("perfExecCards");
  if(execBox){
    execBox.innerHTML = execPeople.length ? (await Promise.all(execPeople.map(p=>renderCard(p,true)))).join("")
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;grid-column:1/-1">لا يوجد شاغلو مناصب تنفيذية عليا مرتبطين بحسابات بعد (الرئيس التنفيذي / نواب الرئيس / المدير المالي بالهيكل التنظيمي).</div>';
  }
}

/* Resolves an EXISTING evaluation's real role for question-bank purposes. Trusts the stored
   entity_type first for "تنفيذي" specifically — the one classification a manual add can set
   that fresh auto-detection might not reproduce (that mismatch is exactly why manual add
   exists) — and only calls live auto-detection to distinguish رئيس مجلس from عضو مجلس. */
async function resolveEvalRole(ev){
  if(ev.entity_type === "تنفيذي") return "تنفيذي";
  return ev.evaluated_email ? await getEvaluatedPersonRole(ev.evaluated_email) : null;
}

async function openNewPerfEvaluation(evaluated_email){
  await savePerfFor(evaluated_email);
}

/* Manual fallback — lists literally everyone with an account on this company, regardless of
   role, for when automatic matching (org chart / role-text) doesn't surface someone who should
   be evaluable. The admin explicitly picks their evaluation role here instead. */
async function openManualPerfPicker(){
  const sel = document.getElementById("pm-person");
  sel.innerHTML = '<option value="">جارِ التحميل...</option>';
  openM("m-perf-manual");

  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  if(!memberships || memberships.length===0){ sel.innerHTML = '<option value="">لا يوجد أعضاء بهذه الشركة</option>'; return; }
  const emails = memberships.map(m=>m.email);
  const { data: profiles } = await sb.from("user_profiles").select("email,full_name").in("email", emails);
  const nameByEmail = {}; (profiles||[]).forEach(p=>{ nameByEmail[p.email]=p.full_name; });
  sel.innerHTML = memberships.map(m => `<option value="${orgEsc(m.email)}">${orgEsc(nameByEmail[m.email]||m.email)} — ${orgEsc(m.role)}</option>`).join("");
}

async function confirmManualPerfAdd(){
  const email = document.getElementById("pm-person").value;
  const role = document.getElementById("pm-role").value;
  if(!email){ alert("الرجاء اختيار شخص"); return; }
  closeM("m-perf-manual");
  await savePerfFor(email, role);
}

/* Computes every score the system can derive on its own from real records. Used when a cycle opens AND
   every time the open evaluation is refreshed, so the automatic part never goes stale. */
async function perfComputeAuto(evaluated_email, evaluated_role){
  const payload = {};
  if(evaluated_role === "تنفيذي"){
    const { data: reports } = await sb.from("ceo_monthly_reports").select("period_label,timeliness_score,submitted_day_of_month")
      .eq("company_id", currentCompanyId).not("timeliness_score","is",null).order("created_at",{ascending:false}).limit(6);
    if(reports && reports.length){
      const avg = reports.reduce((s,x)=>s+x.timeliness_score,0) / reports.length;
      let interpretation;
      if(avg >= 90) interpretation = "التزام ممتاز بمواعيد رفع التقرير المالي والتشغيلي — مؤشر إيجابي على السيطرة الإدارية والإلمام بتفاصيل الشركة أولًا بأول.";
      else if(avg >= 75) interpretation = "التزام جيد بمواعيد رفع التقرير مع بعض التأخير غير المتكرر.";
      else if(avg >= 50) interpretation = "تأخر ملحوظ ومتكرر برفع التقرير المالي والتشغيلي — قد يشير إلى ضعف بالسيطرة على الإدارات أو عدم إلمام كافٍ بتفاصيل الشركة أولًا بأول.";
      else interpretation = "تأخر كبير ومتكرر برفع التقرير المالي والتشغيلي — مؤشر مقلق على ضعف السيطرة الإدارية.";
      payload.auto_context_note = `متوسط درجة الانضباط بمواعيد رفع التقرير (آخر ${reports.length} تقارير): ${avg.toFixed(0)}%\n${interpretation}`;
    }
  }


  const autoScores = [];
  if(evaluated_role === "عضو مجلس" || evaluated_role === "رئيس مجلس"){
    const { data: member } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).eq("claimed_by_email", evaluated_email).maybeSingle();
    if(member){
      const email = evaluated_email;
      const { data: allRequests } = await sb.from("meeting_requests").select("id,response_deadline").eq("company_id", currentCompanyId).not("response_deadline","is",null);
      const reqIds = (allRequests||[]).map(r=>r.id);
      const { data: myResponses } = reqIds.length
        ? await sb.from("meeting_request_responses").select("request_id,created_at").in("request_id", reqIds).eq("reviewer_email", email)
        : { data: [] };
      const respTimeByReq = {};
      (myResponses||[]).forEach(r => { respTimeByReq[r.request_id] = r.created_at; });
      const totalReq = (allRequests||[]).length;
      let onTimeCount = 0;
      (allRequests||[]).forEach(r => { const t = respTimeByReq[r.id]; if(t && new Date(t) <= new Date(r.response_deadline)) onTimeCount++; });

      const { data: myVotes } = await sb.from("board_decision_votes").select("vote,justification").eq("voter_email", email);
      const totalVotes = (myVotes||[]).length;
      const unjustifiedAbstentions = (myVotes||[]).filter(v => v.vote === "ممتنع" && (!v.justification || !v.justification.trim())).length;

      if(totalReq > 0 || totalVotes > 0){
        let score = 5;
        if(totalReq > 0) score -= (1 - onTimeCount/totalReq) * 2;
        if(totalVotes > 0) score -= (unjustifiedAbstentions/totalVotes) * 2;
        score = Math.max(1, Math.min(5, score));
        autoScores.push({ criterion: "الانضباط والالتزام (آلي)", score,
          note: `استجاب لـ${onTimeCount} من ${totalReq} طلبات اجتماع خلال المهلة المحددة. امتنع بدون مبرر واضح في ${unjustifiedAbstentions} من ${totalVotes} تصويتات.` });
      }

      const attendanceStats = await computeAttendancePercentages();
      const myAttendanceStat = attendanceStats.find(a => a.name === member.name && a.pct !== null);
      if(myAttendanceStat){
        const rate = myAttendanceStat.pct / 100;
        autoScores.push({ criterion: "نسبة الحضور الفعلية (آلي)", score: 1 + rate*4,
          note: `نسبة الحضور الفعلية: ${myAttendanceStat.pct}% (${myAttendanceStat.present} من ${myAttendanceStat.total} اجتماعًا).` });
      }

      const { data: allDecisions } = await sb.from("board_decisions").select("id").eq("company_id", currentCompanyId);
      if(allDecisions && allDecisions.length > 0){
        const participationRate = totalVotes / allDecisions.length;
        autoScores.push({ criterion: "نسبة المشاركة بالتصويت (آلي)", score: 1 + Math.min(1,participationRate)*4,
          note: `شارك بالتصويت على ${totalVotes} من ${allDecisions.length} قرارًا مطروحًا.` });
      }

      // New: real execution rate for decisions this person was assigned as responsible for —
      // an entirely automatic input, matching the same "system decides, no human vote" rule
      // applied to attendance and voting participation above.
      const { data: assignedDecisions } = await sb.from("board_decisions").select("status,target_date").eq("company_id", currentCompanyId).eq("responsible_email", email);
      if(assignedDecisions && assignedDecisions.length > 0){
        const doneOnTime = assignedDecisions.filter(d => d.status === "منجز").length;
        const completionRate = doneOnTime / assignedDecisions.length;
        autoScores.push({ criterion: "نسبة إنجاز القرارات الموكلة (آلي)", score: 1 + completionRate*4,
          note: `أنجز ${doneOnTime} من ${assignedDecisions.length} قرارًا مُوكَلًا إليه.` });
      }
    }
  }


  if(evaluated_role === "تنفيذي"){
    const { data: reps } = await sb.from("ceo_monthly_reports").select("timeliness_score").eq("company_id", currentCompanyId).not("timeliness_score","is",null).order("created_at",{ascending:false}).limit(6);
    if(reps && reps.length){
      const avg = reps.reduce((x,y) => x + y.timeliness_score, 0) / reps.length;
      autoScores.push({ criterion: "الانضباط بمواعيد التقارير (آلي)", score: 1 + (avg/100)*4, note: `متوسط الالتزام بمواعيد رفع التقرير الشهري (آخر ${reps.length} تقارير): ${avg.toFixed(0)}%.` });
    }
    const { data: asg } = await sb.from("board_decisions").select("status").eq("company_id", currentCompanyId).eq("responsible_email", evaluated_email);
    if(asg && asg.length){
      const done = asg.filter(d => d.status === "منجز").length;
      autoScores.push({ criterion: "نسبة إنجاز القرارات الموكلة (آلي)", score: 1 + (done/asg.length)*4, note: `أنجز ${done} من ${asg.length} قرارًا مُوكَلًا إليه.` });
    }
  }
  return { payload, autoScores };
}

async function perfWriteAuto(evaluationId, autoScores){
  if(!autoScores.length) return;
  // update existing system rows in place (never delete, never duplicate); insert only criteria not yet present
  const { data: have } = await sb.from("performance_evaluation_reviews").select("id,criterion").eq("evaluation_id", evaluationId).eq("reviewer_email", "system@hwkm.internal");
  const byCrit = {}; (have||[]).forEach(r => { byCrit[r.criterion] = r.id; });
  const toInsert = [];
  for(const a of autoScores){
    const row = { score: Math.max(1, Math.min(5, Math.round(a.score))), notes: a.note };
    if(byCrit[a.criterion]) await sb.from("performance_evaluation_reviews").update(row).eq("id", byCrit[a.criterion]);
    else toInsert.push({ evaluation_id: evaluationId, reviewer_email: "system@hwkm.internal", reviewer_name: "النظام (تلقائي)", criterion: a.criterion, company_id: currentCompanyId, ...row });
  }
  if(toInsert.length) await sb.from("performance_evaluation_reviews").insert(toInsert);
  const summary = autoScores.map(a => `${a.criterion.replace(" (آلي)","")}: ${a.note}`).join("\n");
  await sb.from("performance_evaluations").update({ auto_context_note: summary }).eq("id", evaluationId);
}

async function savePerfFor(evaluated_email, manualRole){
  const { data: person } = await sb.from("board_members").select("name").eq("company_id", currentCompanyId).eq("claimed_by_email", evaluated_email).maybeSingle();
  const { data: profile } = await sb.from("user_profiles").select("full_name").eq("email", evaluated_email).maybeSingle();
  const evaluated_role = manualRole || await getEvaluatedPersonRole(evaluated_email);
  const entity_type = evaluated_role === "تنفيذي" ? "تنفيذي" : "عضو مجلس";
  const period = String(new Date().getFullYear());
  const entity_name = person?.name || profile?.full_name || evaluated_email;

  if(!await uiConfirm(`فتح تقييم أداء جديد لـ"${entity_name}" لعام ${period}؟`)) return;

  const payload = { entity_name, entity_type, evaluated_email, period, status: "مفتوح للتقييم", company_id: currentCompanyId };

  const auto0 = await perfComputeAuto(evaluated_email, evaluated_role);
  Object.assign(payload, auto0.payload);
  const autoScores = auto0.autoScores;

  const { data: newEval, error } = await sb.from("performance_evaluations").insert([payload]).select().single();
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }

  await perfWriteAuto(newEval.id, autoScores);

  loadPerf();
}

/* ══════════ DETAIL VIEW — swaps in for the whole card list while open ══════════ */
let perfDetailContext = null; // { evaluatedEmail, isExec, evaluationId }

async function openPerfDetail(evaluatedEmail, isExec){
  document.getElementById("perfListView").style.display = "none";
  document.getElementById("perfDetailView").style.display = "block";
  const body = document.getElementById("perfDetailBody");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">جارِ التحميل...</div>';

  const ev = perfCache.find(e => e.evaluated_email === evaluatedEmail);
  if(!ev){ body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لا يوجد تقييم.</div>'; return; }
  perfDetailContext = { evaluatedEmail, isExec, evaluationId: ev.id };

  const isAdmin = await canSeePerfResults();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  // HWKM's own platform owner is never a genuine peer reviewer — they should always land on
  // the results view, complete or not, and never get funneled into a scoring form they were
  // never meant to fill out (they're not in anyone's reviewer audience to begin with).
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isReviewer = !isPlatformOwner && myEmail && myEmail !== evaluatedEmail;

  if(ev.status === "مكتمل" || isPlatformOwner || (isAdmin && !isReviewer)){
    await renderPerfResultsDetail(ev, isAdmin);
  } else if(isReviewer){
    await renderPerfReviewForm(ev);
  } else {
    body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">ما عندك صلاحية تشوف أو تقيّم هذا الشخص.</div>';
  }
}

function closePerfDetail(){
  document.getElementById("perfDetailView").style.display = "none";
  document.getElementById("perfListView").style.display = "block";
  perfDetailContext = null;
  loadPerf();
}

/* Reviewer's own scoring form for one person — full questionnaire, locked forever once sent. */
async function renderPerfReviewForm(ev){
  const body = document.getElementById("perfDetailBody");
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  const audience = ev.evaluated_email
    ? (perfDetailContext.isExec ? await getExecReviewerAudience() : await getPerfReviewerAudience(ev.evaluated_email))
    : [];
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  // HWKM's own platform owner isn't excluded here the way a random outsider would be — full
  // access means full access, including trying the reviewer flow itself when they choose to.
  if(ev.evaluated_email && !isPlatformOwner && !audience.includes(myEmail)){
    body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">ما أنت من ضمن المقيّمين المخصَّصين لهذا الشخص.</div>';
    return;
  }

  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const { data: myReviews } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"");
  const mineByCriterion = {};
  (myReviews||[]).forEach(r => { mineByCriterion[r.criterion] = r; });
  const alreadySubmitted = criteria.every(c => mineByCriterion[c]);
  const savedNotes = criteria.map(c => mineByCriterion[c]).find(r=>r&&r.notes)?.notes || "";

  body.innerHTML = `<div style="border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(10,22,40,0.08);border:1px solid var(--gray1);max-width:640px">
    <div style="background:linear-gradient(135deg,var(--primary),var(--accent));padding:16px;color:#fff">
      <div style="font-weight:900;font-size:15px">${orgEsc(ev.entity_name||"")}</div>
      <div style="font-size:11px;opacity:0.85;margin-top:2px">${evaluated_role||ev.entity_type||""} · الفترة: ${ev.period||""}</div>
    </div>
    <div style="padding:16px;background:#fff">
      ${ev.auto_context_note ? `<div style="background:#FEF3E2;border-right:3px solid var(--gold);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:11.5px;color:var(--dark);white-space:pre-line;line-height:1.7"><b>مؤشرات آلية من النظام (لا تُصوَّت عليها):</b>\n${ev.auto_context_note}</div>` : ""}
      ${alreadySubmitted ? `<div style="background:#E8F8EF;border-radius:8px;padding:12px;text-align:center;color:var(--green);font-weight:700;font-size:12.5px;margin-bottom:14px"><span class="ico-i ico-check"></span>تم إرسال تقييمك — غير قابل للتعديل.</div>` : ""}
      ${criteria.map((crit,idx) => {
        const mine = mineByCriterion[crit];
        return `<div class="perf-crit-row" data-eval="${ev.id}" data-criterion="${crit.replace(/"/g,'&quot;')}" data-selected="${mine?mine.score:''}" style="margin-bottom:${idx<criteria.length-1?'16px':'4px'};opacity:${alreadySubmitted?'0.6':'1'}">
          <div style="font-size:12.5px;font-weight:800;color:var(--dark);margin-bottom:7px">${crit}</div>
          <div style="display:flex;gap:0;border-radius:10px;overflow:hidden;border:1.5px solid var(--gray1)">
            ${[1,2,3,4,5].map((s,i) => `<button type="button" ${alreadySubmitted?'disabled':''} class="perf-crit-btn" data-val="${s}" style="flex:1;background:${mine&&mine.score===s?'linear-gradient(135deg,var(--primary),var(--accent))':'#fff'};color:${mine&&mine.score===s?'#fff':'var(--dark)'};border:none;${i>0?'border-right:1px solid var(--gray1)':''};padding:9px 4px;font-size:11px;font-weight:700;cursor:${alreadySubmitted?'default':'pointer'};transition:all .15s" onclick="selectPerfCriterionScore(this,${s})">${s}<br><span style="font-size:9px;font-weight:600;opacity:0.9">${PERF_SCORE_LABELS[s]}</span></button>`).join('')}
          </div>
        </div>`;
      }).join("")}
      <textarea id="perf-review-notes-${ev.id}" ${alreadySubmitted?'disabled':''} placeholder="ملاحظاتك العامة (اختياري)" style="width:100%;border:1.5px solid var(--gray1);border-radius:10px;padding:10px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-top:10px;background:var(--offwhite)" rows="2">${savedNotes}</textarea>
      ${alreadySubmitted
        ? `<button class="btn btn-gold" style="width:100%;margin-top:12px" onclick="openPerfSignModal()"><span class="ico-i ico-signature"></span>توقيع نسختي وتنزيلها PDF</button>`
        : `<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn-xs primary" onclick="submitPerfReview(${ev.id})"><span class="ico-i ico-save"></span>إرسال تقييمي لكل البنود (نهائي)</button></div>`}
    </div>
  </div>`;
}

/* Authorized-viewer results breakdown — human criteria, auto criteria, final average, and
   (once every reviewer is in) the ability to close/certify the final score. */
async function renderPerfResultsDetail(ev, isAdmin){
  const body = document.getElementById("perfDetailBody");
  const { data: revs } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id);
  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const uniqueReviewers = new Set((revs||[]).filter(r=>r.reviewer_email!=="system@hwkm.internal").map(r=>r.reviewer_email)).size;

  const byCrit = {};
  (revs||[]).forEach(r => { const c = r.criterion||"عام"; if(!byCrit[c]) byCrit[c]=[]; byCrit[c].push(r.score||0); });

  const bars = criteria.filter(c=>byCrit[c]).map(c => {
    const avg = byCrit[c].reduce((a,b)=>a+b,0)/byCrit[c].length;
    const pct = Math.round((avg/5)*100);
    return `<div class="comp-item"><div class="comp-head"><span class="comp-name">${c}</span><span class="comp-pct">${pct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${pct}%"></div></div></div>`;
  }).join("");
  const autoBars = PERF_AUTO_CRITERIA.filter(c=>byCrit[c]).map(c => {
    const avg = byCrit[c].reduce((a,b)=>a+b,0)/byCrit[c].length;
    const pct = Math.round((avg/5)*100);
    return `<div class="comp-item"><div class="comp-head"><span class="comp-name"><span class="ico ico-bolt" style="width:12px;height:12px;color:var(--gold)"></span> ${c}</span><span class="comp-pct">${pct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${pct}%;background:var(--gold)"></div></div></div>`;
  }).join("");

  const closeBtn = isAdmin && ev.status !== "مكتمل" && revs && revs.length
    ? `<button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="closePerfEvaluation(${ev.id})"><span class="ico-i ico-shield"></span>إغلاق واعتماد النتيجة النهائية</button>`
    : "";

  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const joinAsReviewerBtn = isPlatformOwner && ev.status !== "مكتمل"
    ? `<button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="renderPerfReviewForm(perfCache.find(e=>e.id===${ev.id}))"><span class="ico-i ico-signature"></span>أضف تقييمك أيضًا</button>`
    : "";

  body.innerHTML = `<div class="card" style="max-width:640px">
    <div class="card-head"><span class="card-title">${orgEsc(ev.entity_name||"")} <span style="font-size:11px;color:var(--gray3);font-weight:600">— ${ev.period||""}</span></span>${ev.status==="مكتمل"?'<span class="badge done">مكتمل</span>':'<span class="badge pending">مفتوح للتقييم</span>'}</div>
    <div class="card-body">
      ${bars || '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد تقييمات مسجّلة من الأعضاء بعد.</div>'}
      ${autoBars ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--gray1)">
        <div style="font-size:10px;font-weight:700;color:var(--gray3);margin-bottom:6px">مؤشرات محسوبة تلقائيًا من بيانات النظام الفعلية</div>
        ${autoBars}
      </div>` : ""}
      <div style="font-size:11.5px;color:var(--gray3);margin-top:12px"><span class="ico-i ico-users"></span>عدد المقيّمين: ${uniqueReviewers}${ev.score!=null ? " · الدرجة النهائية: "+Number(ev.score).toFixed(1)+"/5 — "+(PERF_SCORE_LABELS[Math.round(ev.score)]||"") : ""}</div>
      ${joinAsReviewerBtn}
      ${closeBtn}
    </div>
  </div>`;
}



async function closePerfEvaluation(id){
  const { data: revs, error } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", id);
  if(error){ alert("تعذّر الحساب: " + error.message); return; }
  if(!revs || revs.length===0){ alert("لا توجد تقييمات مسجّلة بعد من الأعضاء لهذا العنصر."); return; }
  const avg = revs.reduce((s,r)=>s+(r.score||0),0)/revs.length;
  if(!await uiConfirm("سيتم اعتماد النتيجة النهائية ("+avg.toFixed(1)+"/5) وإغلاق هذا التقييم. متابعة؟")) return;
  const { error: updErr } = await sb.from("performance_evaluations").update({ score: avg, status: "مكتمل" }).eq("id", id);
  if(updErr){ alert("تعذّر الإغلاق: " + updErr.message); return; }
  alert("تم اعتماد النتيجة النهائية ✅");
  closePerfDetail();
}

/* ══════════ Reviewer's signed copy of their own submitted scores ══════════ */
let perfSigPadCtx = null, perfSigPadDrawing = false;

function openPerfSignModal(){
  openM("m-perf-sign");
  setTimeout(initPerfSignaturePad, 50);
}

function initPerfSignaturePad(){
  const canvas = document.getElementById("perfSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  perfSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); perfSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!perfSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { perfSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("perfSigCanvas");
}

function clearPerfSigPad(){
  if(!perfSigPadCtx) return;
  const canvas = document.getElementById("perfSigCanvas");
  perfSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isPerfSigPadEmpty(){
  const canvas = document.getElementById("perfSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

/* Wraps Arabic (RTL) text within maxWidth, returning the number of lines drawn — used so the
   criterion label never overruns into the score column on longer questionnaire items. */
function wrapRTLText(ctx, text, x, y, maxWidth, lineHeight){
  const words = text.split(" ");
  let line = "", lines = [];
  for(const w of words){
    const test = line ? line + " " + w : w;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
    else line = test;
  }
  if(line) lines.push(line);
  lines.forEach((l,i) => ctx.fillText(l, x, y + i*lineHeight));
  return lines.length;
}

async function confirmPerfReviewSignature(){
  if(isPerfSigPadEmpty()){ alert("الرجاء رسم توقيعك أولًا قبل التأكيد"); return; }
  if(!perfDetailContext){ alert("تعذّر تحميل بيانات التقييم"); return; }
  if(!(await lockFirstSignature("perfSigCanvas"))) return;

  const ev = perfCache.find(e => e.id === perfDetailContext.evaluationId);
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const evaluated_role = await resolveEvalRole(ev);
  const criteria = getPerfCriteria(ev.entity_type, evaluated_role);
  const { data: myReviews } = await sb.from("performance_evaluation_reviews").select("*").eq("evaluation_id", ev.id).eq("reviewer_email", myEmail||"");
  const byCriterion = {};
  (myReviews||[]).forEach(r => { byCriterion[r.criterion] = r; });

  const scale = 2;
  const W = 595 * scale, H = 842 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
  ctx.direction = "rtl"; ctx.textAlign = "center";
  const CX = W/2, RM = W - 45*scale, LM = 45*scale;

  ctx.font = `bold ${18*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("تقييم أداء — نسخة الموقّع", CX, 50*scale);

  ctx.textAlign = "right"; ctx.font = `bold ${13*scale}px Tajawal, Arial`;
  let y = 90*scale;
  ctx.fillText(`الشخص المُقيَّم: ${ev.entity_name||""}`, RM, y); y += 24*scale;
  ctx.font = `${11.5*scale}px Tajawal, Arial`;
  ctx.fillText(`الفترة: ${ev.period||""}`, RM, y); y += 20*scale;
  ctx.fillText(`المقيِّم: ${reviewer_name}`, RM, y); y += 34*scale;

  ctx.font = `bold ${11.5*scale}px Tajawal, Arial`;
  for(const crit of criteria){
    const r = byCriterion[crit];
    if(!r) continue;
    if(y > H - 140*scale){ break; } // keep room for signature block; overflow criteria simply omitted from the printed page
    ctx.fillStyle = "#0D2447";
    ctx.font = `${11*scale}px Tajawal, Arial`;
    wrapRTLText(ctx, crit, RM, y, RM-LM, 15*scale);
    const lines = Math.ceil(ctx.measureText(crit).width / (RM-LM)) || 1;
    ctx.textAlign = "left"; ctx.font = `bold ${12*scale}px Tajawal, Arial`; ctx.fillStyle = "#B8972A";
    ctx.fillText(`${r.score}/5 — ${PERF_SCORE_LABELS[r.score]||""}`, LM, y);
    ctx.textAlign = "right";
    y += 22*scale;
  }

  y += 20*scale;
  ctx.textAlign = "right"; ctx.font = `bold ${12*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("توقيع المقيّم:", RM, y);
  const sigCanvas = document.getElementById("perfSigCanvas");
  ctx.drawImage(sigCanvas, LM, y - 10*scale, 180*scale, 60*scale);

  const pngData = canvas.toDataURL("image/png");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await (await fetch(pngData)).arrayBuffer();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([595, 842]);
  page.drawImage(pngImage, { x: 0, y: 0, width: 595, height: 842 });
  const finalBytes = await pdfDoc.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });

  const safeName = (ev.entity_name||"تقييم").replace(/[\\/:*?"<>|]/g,"_");
  await uploadBlobToStorage(blob, "perf-review-signatures", `تقييم-${safeName}-${reviewer_name}-${Date.now()}.pdf`);

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `تقييم-موقّع-${safeName}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);

  closeM("m-perf-sign");
  alert("تم تنزيل نسختك الموقّعة بنجاح ✅");
}


/* Determines a person's actual evaluation role from real data — chairman via their
   user_company_memberships role, executive via a match against the org chart's senior
   positions (see getEvaluableExecutives), else a regular member. This is what actually picks
   the question bank and the auto-assigned reviewer audience; it is never typed by hand. */
async function getEvaluatedPersonRole(email){
  if(!email) return "عضو مجلس";
  const { data: membership } = await sb.from("user_company_memberships").select("role").eq("company_id", currentCompanyId).eq("email", email).maybeSingle();
  if(membership && membership.role === "رئيس مجلس") return "رئيس مجلس";
  const execs = await getEvaluableExecutives();
  if(execs.some(e => e.email === email)) return "تنفيذي";
  return "عضو مجلس";
}

/* Everyone eligible to be evaluated as a board-level person: sourced from
   user_company_memberships directly — the authoritative record of "has a real account with
   a governance role" — not from board_members.claimed_by_email, which is a separate optional
   identity-claim step someone can skip entirely while still having a perfectly working
   account. board_members is only consulted afterward, purely to get a nicer display name. */
async function getPerfEligiblePeople(){
  const boardRoles = ["رئيس مجلس","سكرتير مجلس","سكرتير المجلس","عضو مجلس","عضو مجلس وعضو مساهم"];
  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId).in("role", boardRoles);
  if(!memberships || memberships.length===0) return [];

  const emails = memberships.map(m=>m.email);
  const [{ data: profiles }, { data: bmRows }] = await Promise.all([
    sb.from("user_profiles").select("email,full_name").in("email", emails),
    sb.from("board_members").select("name,claimed_by_email").eq("company_id", currentCompanyId).in("claimed_by_email", emails)
  ]);
  const nameByEmail = {};
  (bmRows||[]).forEach(b => { nameByEmail[b.claimed_by_email] = b.name; });
  (profiles||[]).forEach(p => { if(!nameByEmail[p.email]) nameByEmail[p.email] = p.full_name; });

  return memberships.map(m => ({
    email: m.email,
    name: nameByEmail[m.email] || m.email,
    role: m.role === "رئيس مجلس" ? "رئيس مجلس" : "عضو مجلس",
  }));
}

/* Who should automatically evaluate this person — every other linked board member (never
   themselves), regardless of whether they're being evaluated as chairman, member, or exec. */
async function getPerfReviewerAudience(evaluatedEmail){
  const people = await getPerfEligiblePeople();
  return people.filter(p => p.email !== evaluatedEmail).map(p => p.email);
}

/* Results visibility: HWKM's own platform owner always sees everything (support/oversight
   across every client company). Otherwise: nomination-committee members if that committee
   actually has anyone in it, else the board chairman only — never a broader "any governance
   admin" set. Sole proprietorships have no board, so it collapses to "the owner" by definition. */
async function canSeePerfResults(){
  if(currentUserProfile && currentUserProfile.is_platform_admin === true) return true;
  const role = getCurrentRole();
  if(currentCompanyType === "مؤسسة فردية") return role === "مدير النظام";
  const { data: nomCommittee } = await sb.from("user_company_memberships").select("role").eq("company_id", currentCompanyId).in("role",["رئيس لجنة الترشيحات","عضو لجنة الترشيحات"]);
  if(nomCommittee && nomCommittee.length > 0) return ["رئيس لجنة الترشيحات","عضو لجنة الترشيحات"].includes(role);
  return role === "رئيس مجلس";
}

/* Opening a new evaluation cycle is an administrative action (deciding WHEN to run a review),
   separate from SEEING confidential peer results — مدير النظام runs the platform day-to-day
   and should be able to kick off a cycle even on a company where they're not on the
   nominations committee and won't see the outcome themselves. */
async function canManagePerfEvaluations(){
  if(getCurrentRole() === "مدير النظام") return true;
  return canSeePerfResults();
}

const PERF_CRITERIA_MEMBER = [
  "يشارك بالمعلومات أو الأفكار",
  "يحضر اجتماعات مجلس الإدارة بانتظام وفي الوقت المحدد",
  "يشارك بنشاط في أنشطة مجلس الإدارة، ويعمل بشكل بناء مع زملائه في المجلس",
  "يتخذ مواقف بناءة وفعالة في اجتماعات مجلس الإدارة أو اللجان، عند الحاجة إلى ذلك",
  "يتقبل ردود فعل وإبداء ملاحظات مجلس الإدارة",
  "يحرص على التزام الاجتماعات بجدول الأعمال",
  "يساهم بشكل فعال في التصدي للخلافات وإيجاد الحلول",
  "يقدم رأيه بصدق في القضايا المطروحة",
  "يقدم آراء متميزة في القضايا المطروحة ولديه المهارات",
  "قادر على ترتيب الأولويات والتركيز على تحقيق الأهداف",
  "يحفز الآخرين من أجل تحقيق الإنجازات",
  "يقدم المشورة البناءة في مناقشات ومداولات المجلس",
  "يمتلك مهارات تحليلية تساهم في عملية صنع القرار",
  "يتجنب الاصطدام بالآخرين",
  "يساهم بإضافات جديدة في اجتماعات مجلس الإدارة ويحضر الاجتماعات ويُعدّ لها إعدادًا جيدًا",
  "يبادر في طلب المعلومات لاكتساب المعرفة",
  "يحفز الأعضاء على المشاركة بفعالية في المواضيع المطروحة",
  "يركز على تحقيق الأهداف",
  "يعمل على ربط الأهداف باستراتيجيات الشركة",
  "يعمل على الاستغلال الأمثل للموارد البشرية والمالية لتخطيط الخطط الاستراتيجية للشركة",
];
const PERF_CRITERIA_CHAIRMAN = [
  ...PERF_CRITERIA_MEMBER,
  "قادر على قيادة المجلس بشكل فعال ويشجع على مشاركة جميع الأعضاء",
  "علاقة العمل بينه وبين الرئيس التنفيذي جيدة وبنّاءة",
  "يعي هو والرئيس التنفيذي المهام الموكلة لكل منهما بوضوح",
];
const PERF_CRITERIA_EXEC = [
  "يحضر اجتماعات مجلس الإدارة بانتظام ويقدّم التقارير المطلوبة في وقتها",
  "ينفّذ قرارات مجلس الإدارة بفعالية والتزام",
  "يوفّر معلومات دقيقة وشفافة وفي وقتها المناسب للمجلس",
  "يمتلك رؤية واضحة لاستراتيجية الشركة وأهدافها طويلة المدى",
  "يدير الموارد البشرية والمالية بكفاءة تخدم الخطة الاستراتيجية",
  "يبني علاقة عمل بنّاءة وشفافة مع رئيس مجلس الإدارة وأعضائه",
  "يتحمّل المسؤولية عن نتائج الأداء التشغيلي والمالي للشركة",
  "يبادر بطرح المخاطر والتحديات على المجلس قبل تفاقمها",
  "يحرص على الامتثال للأنظمة واللوائح ومعايير الحوكمة",
  "يقود فريق الإدارة التنفيذية بفعالية ويحقق نتائج ملموسة",
];
// Which bank applies depends on the person's actual role, not a free-typed "type" — see
// getEvaluatedPersonRole(). entityType is kept only as a fallback for legacy rows saved before
// this change (their evaluated_email is null, so we can't re-derive the role from data).
//
// Companies can add/remove items themselves (see openPerfCriteriaManager) without any code
// change on our side — perfCriteriaCache holds whatever they've customized, loaded once per
// visit to the page; getPerfCriteria() only falls back to these hardcoded defaults for a role
// a company has never touched, so every existing evaluation keeps working unchanged.
let perfCriteriaCache = null; // { 'رئيس مجلس': [...] | null, 'عضو مجلس': [...] | null, 'تنفيذي': [...] | null }

async function loadPerfCriteriaCache(){
  const { data } = await sb.from("performance_criteria").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true});
  perfCriteriaCache = { "رئيس مجلس": null, "عضو مجلس": null, "تنفيذي": null };
  (data||[]).forEach(row => {
    if(!(row.role_type in perfCriteriaCache)) return;
    if(!perfCriteriaCache[row.role_type]) perfCriteriaCache[row.role_type] = [];
    perfCriteriaCache[row.role_type].push(row.criterion_text);
  });
}

function getPerfDefaultCriteria(roleKey){
  if(roleKey === "رئيس مجلس") return PERF_CRITERIA_CHAIRMAN;
  if(roleKey === "تنفيذي") return PERF_CRITERIA_EXEC;
  return PERF_CRITERIA_MEMBER;
}

function getPerfCriteria(entityType, personRole){
  const roleKey = ["رئيس مجلس","تنفيذي","عضو مجلس"].includes(personRole) ? personRole : (entityType === "تنفيذي" ? "تنفيذي" : "عضو مجلس");
  if(perfCriteriaCache && perfCriteriaCache[roleKey] && perfCriteriaCache[roleKey].length) return perfCriteriaCache[roleKey];
  return getPerfDefaultCriteria(roleKey);
}
