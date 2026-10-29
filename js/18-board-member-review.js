/* ══════════ BOARD MEMBER REVIEW ON APPOINTMENT REQUESTS ══════════ */
async function loadReviewSection(){
  const box = document.getElementById("reviewSectionBody");
  if(!box) return;
  const role = getCurrentRole();
  if(role === 'مساهم'){ box.innerHTML = ""; document.getElementById("reviewSectionCard").style.display = "none"; return; }
  document.getElementById("reviewSectionCard").style.display = "block";

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  const { data: requests, error: reqErr } = await sb.from("appoint_requests")
    .select("*").eq("company_id", currentCompanyId)
    .not("status", "in", "(معتمد,مرفوض)")
    .order("id", { ascending: false });
  if(reqErr){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر التحميل: '+reqErr.message+'</div>'; return; }
  if(!requests || requests.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لا توجد طلبات معلّقة تحتاج رأيك حاليًا.</div>'; return; }

  const { data: reviews } = await sb.from("appoint_request_reviews").select("*").eq("company_id", currentCompanyId);
  const reviewsByRequest = {};
  (reviews||[]).forEach(rv => {
    if(!reviewsByRequest[rv.request_id]) reviewsByRequest[rv.request_id] = [];
    reviewsByRequest[rv.request_id].push(rv);
  });

  box.innerHTML = requests.map(r => {
    const revs = reviewsByRequest[r.id] || [];
    const yes = revs.filter(v=>v.decision==="موافق").length;
    const no = revs.filter(v=>v.decision==="معارض").length;
    const abst = revs.filter(v=>v.decision==="متحفظ").length;
    const mine = myEmail ? revs.find(v => v.reviewer_email === myEmail) : null;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(r.candidate_name||"")} — ${r.proposed_position||r.request_type||""}</div>
      <div style="font-size:11px;color:var(--gray3);margin:4px 0 8px">${r.request_type||""} · ${r.justification?('"'+r.justification+'"'):''}</div>
      <div style="font-size:11px;color:var(--gray3);margin-bottom:8px">آراء الأعضاء حتى الآن: <span style="color:var(--green)"><span class="ico-i ico-check"></span>${yes}</span> · <span style="color:var(--red)"><span class="ico-i ico-xcircle"></span>${no}</span> · <span style="color:var(--orange)"><span class="ico-i ico-warning"></span>${abst}</span></div>
      <textarea id="review-notes-${r.id}" placeholder="ملاحظاتك (اختياري)" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-bottom:8px" rows="2">${orgEsc(mine ? (mine.notes||"") : "")}</textarea>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='موافق'?'900':'600'}" onclick="submitReview(${r.id},'موافق')"><span class="ico-i ico-check"></span>موافق</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='معارض'?'900':'600'}" onclick="submitReview(${r.id},'معارض')"><span class="ico-i ico-xcircle"></span>معارض</button>
        <button class="btn-xs" style="background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='متحفظ'?'900':'600'}" onclick="submitReview(${r.id},'متحفظ')"><span class="ico-i ico-warning"></span>متحفظ</button>
      </div>
      ${mine ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">رأيك المسجّل حاليًا: ${orgEsc(mine.decision)}</div>` : ""}
    </div>`;
  }).join("");
}

async function submitReview(requestId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("review-notes-"+requestId);
  const notes = notesEl ? notesEl.value.trim() : "";

  // Replace any previous review by this reviewer on this request
  await sb.from("appoint_request_reviews").delete().eq("request_id", requestId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("appoint_request_reviews").insert([{
    request_id: requestId, reviewer_email: myEmail, reviewer_name, decision, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ رأيك: " + error.message); return; }

  await recomputeRequestStatus(requestId);
  loadReviewSection();
  loadAppointRequests();
}

/* Auto-advance the request's overall status based on all board members' submitted opinions */
async function recomputeRequestStatus(requestId){
  const { data: revs, error } = await sb.from("appoint_request_reviews").select("*").eq("request_id", requestId);
  if(error || !revs || revs.length===0) return;
  const hasReject = revs.some(v => v.decision === "معارض");
  const allApprove = revs.every(v => v.decision === "موافق");
  let newStatus;
  if(hasReject) newStatus = "مرفوض";
  else if(allApprove) newStatus = "معتمد";
  else newStatus = "محال إلى مجلس الإدارة";
  await sb.from("appoint_requests").update({ status: newStatus }).eq("id", requestId);
}
/* قفل التصويت: بعد أن يوقّع المساهم بطاقته ويُحفظ ملفها، لا يستطيع التصويت ولا التعديل */
async function isVoteLockedFor(shareholderName){
  try{
    if(!currentVotingMeetingId || !shareholderName) return false;
    const { data } = await sb.from("agm_vote_locks").select("id")
      .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholderName).limit(1);
    if(data && data.length) return true;
    // الموجود سابقًا: من وقّع بطاقته وحُفظ رابطها يُعتبر مقفولًا حتى لو لم يُسجَّل له قفل
    const { data: att } = await sb.from("agm_attendance").select("signed_vote_card_url")
      .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholderName).maybeSingle();
    return !!(att && att.signed_vote_card_url);
  }catch(e){ return false; }
}
const VOTE_LOCKED_MSG = "تم إغلاق التصويت عليك لأنك وقّعت بطاقتك وحمّلتها. لا يمكن التصويت أو التعديل بعد التوقيع.";

async function voteItem(btn, topic, result){
  await autofillShareholderVoteFields();
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  const shareholder_name = nameEl ? nameEl.value.trim() : "";
  const shares_count = sharesEl && sharesEl.value ? Number(sharesEl.value) : null;
  if(!shareholder_name || !shares_count){
    alert("لا يمكن التصويت: لا يوجد سجل مساهم مرتبط بحسابك. تواصل مع مدير الشركة.");
    return;
  }
  if(await isVoteLockedFor(shareholder_name)){ alert(VOTE_LOCKED_MSG); loadVotingPage(); return; }
  var par=btn.parentElement;
  par.querySelectorAll('button').forEach(function(b){b.style.opacity='0.4';});
  btn.style.opacity='1';btn.style.fontWeight='800';
  var msg=document.getElementById('vote-msg');
  if(msg){
    const labels={"موافق":"✅ تم تسجيل تصويتك: موافق","معارض":"❌ تم تسجيل تصويتك: معارض","ممتنع":"🔵 تم تسجيل تصويتك: ممتنع"};
    msg.textContent=labels[result]||"تم التسجيل";
    msg.style.display="block";
    if(result==="معارض"){msg.style.background="#FDE8E8";msg.style.color="var(--red)";}
    else if(result==="ممتنع"){msg.style.background="#FEF3E2";msg.style.color="var(--orange)";}
    else{msg.style.background="#E8F8EF";msg.style.color="var(--green)";}
  }
  if(topic && result){
    if(!currentVotingMeetingId){ alert("تعذّر تحديد الجمعية الحالية"); return; }
    const vote_date = new Date().toISOString().slice(0,10);
    // Replace any previous vote by this shareholder on the same topic, within this meeting only
    await sb.from("votes").delete().eq("topic", topic).eq("shareholder_name", shareholder_name).eq("meeting_id", currentVotingMeetingId);
    const { error } = await sb.from("votes").insert([{ topic, result, vote_date, shareholder_name, shares_count, meeting_id: currentVotingMeetingId, company_id: currentCompanyId }]);
    if(error){ alert("تعذّر تسجيل التصويت في القاعدة: " + error.message); return; }
    loadVoteResults();
    loadShareholdersSummary();
  }
}

/* ── Shareholder-facing election voting — method (تراكمي/عادي) driven by the company's own
   setting, so the correct UI (allocation inputs vs plain agree/disagree) shows automatically. */
async function loadElectionVotingSection(isOpen){
  const box = document.getElementById("votingElectionContainer");
  if(!box) return;
  if(!isOpen || !currentVotingMeetingId){ box.innerHTML = ""; return; }

  const { data: candidates } = await sb.from("board_election_candidates").select("*").eq("meeting_id", currentVotingMeetingId).order("id",{ascending:true});
  if(!candidates || candidates.length === 0){ box.innerHTML = ""; return; }

  const { data: company } = await sb.from("companies").select("board_election_method").eq("id", currentCompanyId).single();
  const method = company?.board_election_method || "عادي";
  const seats = candidates[0]?.seats_available || 1;

  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  const shareholder_name = nameEl ? nameEl.value.trim() : "";
  const shares_count = sharesEl && sharesEl.value ? Number(sharesEl.value) : 0;

  const candidateIds = candidates.map(c=>c.id);
  let myVotes = [];
  if(shareholder_name){
    const { data } = await sb.from("board_election_votes").select("*").in("candidate_id", candidateIds).eq("shareholder_name", shareholder_name);
    myVotes = data || [];
  }
  const alreadyVoted = myVotes.length > 0;

  if(method === "تراكمي"){
    const maxVotes = shares_count * seats;
    box.innerHTML = `
      <div style="background:var(--offwhite);border-radius:10px;padding:12px;border-right:4px solid var(--gold)">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark);margin-bottom:4px"><span class="ico-i ico-ballot"></span>انتخاب أعضاء مجلس الإدارة (تصويت تراكمي)</div>
        <div style="font-size:11px;color:var(--gray3);margin-bottom:10px">رصيدك: <b>${maxVotes.toLocaleString('ar-SA-u-ca-gregory')}</b> صوت (${shares_count} سهم × ${seats} مقعد) — وزّعها على المرشحين كيف تحب.</div>
        ${alreadyVoted ? '<div style="font-size:11.5px;color:var(--primary);font-weight:700;margin-bottom:8px"><span class="ico-i ico-check"></span>صوّتّ بالفعل على هذا الانتخاب.</div>' : ''}
        <div id="electionAllocRows">
          ${candidates.map(c => {
            const existing = myVotes.find(v=>v.candidate_id===c.id);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray1)">
              <span style="font-size:12px">${orgEsc(c.name)}</span>
              <input type="number" min="0" max="${maxVotes}" class="fi" data-cand-id="${c.id}" value="${existing?existing.votes_allocated:0}" style="width:100px;margin:0;padding:6px 8px" oninput="updateElectionAllocTotal(${maxVotes})" ${alreadyVoted?'disabled':''}/>
            </div>`;
          }).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--gray3)">
          <span>الموزَّع: <b id="electionAllocTotal">0</b> / ${maxVotes}</span>
        </div>
        ${alreadyVoted ? '' : `<button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="submitElectionAllocation(${maxVotes})"><span class="ico-i ico-check"></span>تأكيد توزيع الأصوات</button>`}
      </div>`;
    updateElectionAllocTotal(maxVotes);
  } else {
    box.innerHTML = `
      <div style="background:var(--offwhite);border-radius:10px;padding:12px;border-right:4px solid var(--gold)">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark);margin-bottom:10px"><span class="ico-i ico-ballot"></span>انتخاب أعضاء مجلس الإدارة</div>
        ${candidates.map(c => {
          const existing = myVotes.find(v=>v.candidate_id===c.id);
          return `<div style="margin-bottom:10px">
            <div style="font-size:12.5px;font-weight:700;margin-bottom:6px">${orgEsc(c.name)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary" style="font-size:11px;padding:4px 12px;opacity:${existing&&existing.vote==='موافق'?'1':'0.5'}" onclick="voteCandidate(this,${c.id},'موافق')">موافق</button>
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px;border:1px solid var(--red);color:var(--red);opacity:${existing&&existing.vote==='معارض'?'1':'0.5'}" onclick="voteCandidate(this,${c.id},'معارض')">معارض</button>
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px;opacity:${existing&&existing.vote==='ممتنع'?'1':'0.5'}" onclick="voteCandidate(this,${c.id},'ممتنع')">ممتنع</button>
            </div>
          </div>`;
        }).join("")}
      </div>`;
  }
}

function updateElectionAllocTotal(maxVotes){
  const inputs = [...document.querySelectorAll("#electionAllocRows input[data-cand-id]")];
  const total = inputs.reduce((s,inp)=> s + (Number(inp.value)||0), 0);
  const el = document.getElementById("electionAllocTotal");
  if(el){ el.textContent = total.toLocaleString('ar-SA-u-ca-gregory'); el.style.color = total > maxVotes ? "var(--red)" : "var(--dark)"; }
}

async function submitElectionAllocation(maxVotes){
  await autofillShareholderVoteFields();
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  const shareholder_name = nameEl ? nameEl.value.trim() : "";
  const shares_count = sharesEl && sharesEl.value ? Number(sharesEl.value) : null;
  if(!shareholder_name || !shares_count){ alert("لا يمكن التصويت: لا يوجد سجل مساهم مرتبط بحسابك. تواصل مع مدير الشركة."); return; }
  if(await isVoteLockedFor(shareholder_name)){ alert(VOTE_LOCKED_MSG); loadVotingPage(); return; }

  const inputs = [...document.querySelectorAll("#electionAllocRows input[data-cand-id]")];
  const total = inputs.reduce((s,inp)=> s + (Number(inp.value)||0), 0);
  if(total > maxVotes){ alert(`مجموع الأصوات الموزّعة (${total}) يتجاوز رصيدك (${maxVotes}). عدّل التوزيع.`); return; }
  if(total === 0){ alert("وزّع صوتًا واحدًا على الأقل قبل التأكيد."); return; }
  if(!await uiConfirm("تأكيد توزيع الأصوات؟ ما تقدر تعدّله بعد التأكيد.")) return;

  const { data: userData } = await sb.auth.getUser();
  for(const inp of inputs){
    const candidateId = Number(inp.dataset.candId);
    const votes_allocated = Number(inp.value) || 0;
    if(votes_allocated <= 0) continue;
    await sb.from("board_election_votes").insert([{
      candidate_id: candidateId, shareholder_name, shareholder_email: userData?.user?.email||null,
      votes_allocated, shares_count, company_id: currentCompanyId
    }]);
  }
  alert("تم تسجيل توزيع أصواتك بنجاح ✅");
  loadVotingPage();
}

async function voteCandidate(btn, candidateId, vote){
  await autofillShareholderVoteFields();
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  const shareholder_name = nameEl ? nameEl.value.trim() : "";
  const shares_count = sharesEl && sharesEl.value ? Number(sharesEl.value) : null;
  if(!shareholder_name || !shares_count){ alert("لا يمكن التصويت: لا يوجد سجل مساهم مرتبط بحسابك. تواصل مع مدير الشركة."); return; }
  if(await isVoteLockedFor(shareholder_name)){ alert(VOTE_LOCKED_MSG); loadVotingPage(); return; }

  await sb.from("board_election_votes").delete().eq("candidate_id", candidateId).eq("shareholder_name", shareholder_name);
  const { error } = await sb.from("board_election_votes").insert([{
    candidate_id: candidateId, shareholder_name, vote, shares_count, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر تسجيل التصويت: " + error.message); return; }
  loadVotingPage();
}

/* Personalized PDF for the shareholder currently filling the form */
let voteSigPadCtx = null, voteSigPadDrawing = false;
let voteCardData = null; // cached data between preview and final PDF generation

const ARABIC_DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
function arabicDayName(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if(isNaN(d.getTime())) return "";
  return ARABIC_DAY_NAMES[d.getDay()];
}

/* إدارة حوكم / مدير النظام: إعادة فتح التصويت لمساهم وقّع بطاقته (لتصحيح خطأ) */
async function reopenVoterVoting(shareholderName){
  if(getCurrentRole() !== 'مدير النظام'){ alert("هذا الإجراء لمدير النظام أو إدارة حوكم فقط."); return; }
  if(!currentVotingMeetingId){ alert("تعذّر تحديد الجمعية الحالية"); return; }
  if(!await uiConfirm(`فتح التصويت للتعديل للمساهم "${shareholderName}"؟\nسيستطيع تغيير تصويته ثم يوقّع بطاقته من جديد، وتُسجَّل العملية باسمك.`)) return;
  const reason = await uiPrompt("سبب إعادة الفتح (مثلًا: خطأ في الاختيار):", "");
  if(reason === null) return;
  const { data: row } = await sb.from("agm_attendance").select("signed_vote_card_url")
    .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholderName).maybeSingle();
  const { error: lkDelErr } = await sb.from("agm_vote_locks").delete()
    .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholderName);
  if(lkDelErr){ alert("تعذّر فتح التصويت: " + lkDelErr.message); return; }
  await sb.from("agm_attendance").update({ signed_vote_card_url: null })
    .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholderName);
  await logActivity("إعادة فتح التصويت", "جمعية عمومية", shareholderName, "السبب: " + (reason||"غير مذكور") + " | البطاقة السابقة: " + ((row && row.signed_vote_card_url) || "—"));
  uiToast("تم فتح التصويت للمساهم، ويستطيع الآن التعديل ثم التوقيع من جديد.");
  loadVoteResults();
}

async function openVoterSignedCard(shareholderName, meetingIdArg){
  const mtgId = meetingIdArg || currentVotingMeetingId;
  if(!mtgId){ alert("تعذّر تحديد الجمعية الحالية"); return; }
  const { data: att, error } = await sb.from("agm_attendance").select("signed_vote_card_url")
    .eq("meeting_id", mtgId).eq("shareholder_name", shareholderName).maybeSingle();
  if(error){ alert("تعذّر التحقق: " + error.message); return; }
  let data = att;
  if(!data || !data.signed_vote_card_url){
    try{
      const { data: u } = await sb.rpc("get_vote_card_url", { p_meeting_id: mtgId, p_name: shareholderName });
      if(u) data = { signed_vote_card_url: u };
    }catch(e){}
  }
  if(!data || !data.signed_vote_card_url){
    const { data: lk } = await sb.from("agm_vote_locks").select("card_url")
      .eq("meeting_id", mtgId).eq("shareholder_name", shareholderName).limit(1);
    if(lk && lk[0] && lk[0].card_url) data = { signed_vote_card_url: lk[0].card_url };
  }
  if(!data || !data.signed_vote_card_url){
    const { data: lk2 } = await sb.from("agm_vote_locks").select("id")
      .eq("meeting_id", mtgId).eq("shareholder_name", shareholderName).limit(1);
    if(lk2 && lk2.length){
      alert(`"${shareholderName}" وقّع بطاقته، لكن ملف البطاقة لم يُحفظ في المنصة (وُقّعت قبل الإصلاح أو تعذّر رفعها). افتح له التصويت من زر «فتح التصويت للتعديل» ليعيد التوقيع فيُحفظ الملف.`);
      return;
    }
    alert(`"${shareholderName}" لم يوقّع أو يحمّل بطاقته بعد — بطاقته الموقّعة تُحفظ تلقائيًا بالمنصة بمجرد ما يوقّعها هو بنفسه من حسابه.`);
    return;
  }
  window.open(data.signed_vote_card_url, "_blank");
}

async function generateShareholderVotePDF(overrideName, overrideShares){
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  const shareholder_name = overrideName || (nameEl ? nameEl.value.trim() : "");
  const shares_count = overrideShares != null ? overrideShares : (sharesEl ? sharesEl.value : "");
  if(!shareholder_name){ alert("الرجاء إدخال اسم المساهم أولاً"); return; }
  if(!currentVotingMeetingId){ alert("تعذّر تحديد الجمعية الحالية"); return; }
  if(overrideName && !await uiConfirm(`سيتم فتح نافذة توقيع بطاقة "${overrideName}" — للعرض/التوثيق فقط، مو للتوقيع نيابة عن المساهم. متابعة؟`)) return;

  const [{ data: m }, { data: topics }, { data: votes }, { data: companyRow }] = await Promise.all([
    sb.from("meetings").select("*").eq("id", currentVotingMeetingId).single(),
    sb.from("vote_topics").select("*").eq("meeting_id", currentVotingMeetingId).order("id",{ascending:true}),
    sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholder_name),
    sb.from("companies").select("name").eq("id", currentCompanyId).single()
  ]);
  const companyName = companyRow?.name || "الشركة";

  // Real attendance record (card number + actual in-person/proxy share split), if this
  // shareholder has checked in — falls back to the totals typed in the voting form otherwise.
  const { list: attendees } = await getAttendeesList(currentVotingMeetingId);
  const mine = (attendees||[]).find(a => a.name === shareholder_name);
  const card_number = mine ? mine.shareholderNo : "—";
  const shares_own = mine ? (mine.sharesAsalah ?? mine.shares) : (shares_count || 0);
  const shares_proxy = mine ? (mine.sharesWakala ?? 0) : 0;
  const shares_total = Number(shares_own||0) + Number(shares_proxy||0);

  const resultByTopic = {};
  (votes||[]).forEach(v => { resultByTopic[v.topic] = v.result; });
  const agendaRows = (topics||[]).map(t => ({ topic: t.topic_text || t.topic || "", result: resultByTopic[t.topic_text || t.topic] || null }));

  voteCardData = { shareholder_name, companyName, meeting: m, agendaRows, card_number, shares_own, shares_proxy, shares_total };

  const preview = document.getElementById("voteCardPreview");
  preview.innerHTML = `
    <div style="text-align:center;font-weight:800;font-size:14px;margin-bottom:6px">بطاقة تصويت</div>
    <div><b>الرقم:</b> ${card_number}</div>
    <div><b>الجمعية العامة ${m?.agm_type || "العادية"} لشركة ${companyName}</b></div>
    <div>المنعقدة ${m?.method || "—"} في يوم ${arabicDayName(m?.meeting_date)} الموافق ${m?.meeting_date || "—"} في تمام الساعة (${m?.meeting_time || "—"})</div>
    <div style="margin-top:6px"><b>اسم المساهم:</b> ${shareholder_name}</div>
    <div>عدد الأسهم أصالة (${shares_own}) — عدد الأسهم وكالة (${shares_proxy}) — مجموع الأسهم (${shares_total})</div>
    <div style="margin-top:8px"><b>بنود جدول الأعمال:</b></div>
    ${agendaRows.length ? agendaRows.map((r,i)=>`<div>${i+1}. ${r.topic} — <span style="font-weight:700">${r.result || "لم يُصوَّت بعد"}</span></div>`).join("") : '<div style="color:var(--gray3)">لا توجد بنود مسجَّلة لهذا الاجتماع بعد.</div>'}
  `;

  if(overrideName){
    // Admin/overseer viewing a specific voter's card — this is a reference copy only; it is
    // not their place to draw a signature on the shareholder's behalf, so skip the sig pad
    // entirely and generate an unsigned reference PDF straight away.
    await generateUnsignedVoteCardReference(voteCardData);
    return;
  }
  openM("m-vote-card-sign");
  setTimeout(initVoteSignaturePad, 50);
}

async function generateUnsignedVoteCardReference(data){
  const { shareholder_name, companyName, meeting: m, agendaRows, card_number, shares_own, shares_proxy, shares_total } = data;
  const scale = 2;
  const W = 595 * scale, H = 842 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
  ctx.direction = "rtl"; ctx.textAlign = "center";
  const CX = W/2, RM = W - 45*scale, LM = 45*scale;

  ctx.font = `bold ${18*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("بطاقة تصويت — نسخة مرجعية", CX, 50*scale);
  ctx.textAlign = "right"; ctx.font = `bold ${12.5*scale}px Tajawal, Arial`;
  let y = 85*scale;
  ctx.fillText(`الرقم ${card_number}`, RM, y); y += 28*scale;
  ctx.textAlign = "center"; ctx.font = `bold ${13*scale}px Tajawal, Arial`;
  ctx.fillText(`الجمعية العامة ${m?.agm_type || "العادية"} لشركة ${companyName}`, CX, y); y += 26*scale;
  ctx.font = `${11.5*scale}px Tajawal, Arial`;
  ctx.fillText(`المنعقدة ${m?.method || "—"} في يوم ${arabicDayName(m?.meeting_date)} الموافق ${m?.meeting_date || "—"} في تمام الساعة (${m?.meeting_time || "—"}) مساءً.`, CX, y);
  y += 36*scale;
  ctx.textAlign = "right"; ctx.font = `${12*scale}px Tajawal, Arial`;
  ctx.fillText(`اسم المساهم / ${shareholder_name}`, RM, y); y += 26*scale;
  ctx.fillText(`عدد الأسهم أصالة (${shares_own})     عدد الأسهم وكالة (${shares_proxy})     مجموع الأسهم (${shares_total})`, RM, y);
  y += 40*scale;

  ctx.font = `bold ${11*scale}px Tajawal, Arial`;
  ctx.fillText("بنود جدول الأعمال ونتيجة التصويت:", RM, y); y += 26*scale;
  ctx.font = `${10.5*scale}px Tajawal, Arial`;
  (agendaRows.length?agendaRows:[{topic:"—",result:null}]).forEach((r,i) => {
    ctx.fillText(`${i+1}. ${r.topic} — ${r.result||"لم يُصوَّت بعد"}`, RM, y);
    y += 22*scale;
  });

  y += 30*scale;
  ctx.fillStyle = "#FEF3E2";
  ctx.fillRect(LM, y, RM-LM, 40*scale);
  ctx.strokeStyle = "#C99A2E"; ctx.lineWidth = 1.5*scale;
  ctx.strokeRect(LM, y, RM-LM, 40*scale);
  ctx.font = `bold ${11*scale}px Tajawal, Arial`; ctx.fillStyle = "#8A6D1F"; ctx.textAlign = "center";
  ctx.fillText("⚠️ نسخة مرجعية للاطلاع الإداري — غير موقّعة، لا تعتبر بطاقة تصويت رسمية معتمدة", CX, y + 25*scale);

  const cardPng = canvas.toDataURL("image/png");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await (await fetch(cardPng)).arrayBuffer();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([595, 842]);
  page.drawImage(pngImage, { x: 0, y: 0, width: 595, height: 842 });
  const finalBytes = await pdfDoc.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `بطاقة-تصويت-مرجعية-${shareholder_name.replace(/[\\/:*?"<>|]/g,"_")}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);
}

function initVoteSignaturePad(){
  const canvas = document.getElementById("voteSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  voteSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); voteSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!voteSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { voteSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("voteSigCanvas");
}

function clearVoteSignaturePad(){
  if(!voteSigPadCtx) return;
  const canvas = document.getElementById("voteSigCanvas");
  voteSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isVoteSignaturePadEmpty(){
  const canvas = document.getElementById("voteSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

// Redraws the card matching the official regulatory template layout exactly (title, card
// number, assembly line, meeting line, shareholder/shares line, the م|البند|موافق|غير موافق|
// ممتنع table with a checkmark in the actual result column, and a signature line) — rendered on
// an offscreen canvas so Arabic text shapes correctly, then embedded as a real PDF page via
// pdf-lib so the signature is genuinely part of the file, not a separate image.

function initVoteSignaturePad(){
  const canvas = document.getElementById("voteSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  voteSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); voteSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!voteSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { voteSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("voteSigCanvas");
}

function clearVoteSignaturePad(){
  if(!voteSigPadCtx) return;
  const canvas = document.getElementById("voteSigCanvas");
  voteSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isVoteSignaturePadEmpty(){
  const canvas = document.getElementById("voteSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

// Redraws the card matching the official regulatory template layout exactly (title, card
// number, assembly line, meeting line, shareholder/shares line, the م|البند|موافق|غير موافق|
// ممتنع table with a checkmark in the actual result column, and a signature line) — rendered on
// an offscreen canvas so Arabic text shapes correctly, then embedded as a real PDF page via
// pdf-lib so the signature is genuinely part of the file, not a separate image.
async function confirmVoteCardSignature(){
  if(isVoteSignaturePadEmpty()){ alert("الرجاء رسم توقيعك أولًا قبل التأكيد"); return; }
  if(!voteCardData){ alert("تعذّر تحميل بيانات البطاقة"); return; }
  if(!(await lockFirstSignature("voteSigCanvas"))) return;
  const { shareholder_name, companyName, meeting: m, agendaRows, card_number, shares_own, shares_proxy, shares_total } = voteCardData;

  const scale = 2;
  const W = 595 * scale, H = 842 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
  ctx.direction = "rtl"; ctx.textAlign = "center";
  const CX = W/2, RM = W - 45*scale, LM = 45*scale;

  ctx.font = `bold ${18*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("بطاقة تصويت", CX, 50*scale);

  ctx.textAlign = "right"; ctx.font = `bold ${12.5*scale}px Tajawal, Arial`;
  let y = 85*scale;
  ctx.fillText(`الرقم ${card_number}`, RM, y); y += 28*scale;

  ctx.textAlign = "center"; ctx.font = `bold ${13*scale}px Tajawal, Arial`;
  ctx.fillText(`الجمعية العامة ${m?.agm_type || "العادية"} لشركة ${companyName}`, CX, y); y += 26*scale;

  ctx.font = `${11.5*scale}px Tajawal, Arial`;
  ctx.fillText(`المنعقدة ${m?.method || "—"} في يوم ${arabicDayName(m?.meeting_date)} الموافق ${m?.meeting_date || "—"} في تمام الساعة (${m?.meeting_time || "—"}) مساءً.`, CX, y);
  y += 36*scale;

  ctx.textAlign = "right"; ctx.font = `${12*scale}px Tajawal, Arial`;
  ctx.fillText(`اسم المساهم / ${shareholder_name}`, RM, y); y += 26*scale;
  ctx.fillText(`عدد الأسهم أصالة (${shares_own})     عدد الأسهم وكالة (${shares_proxy})     مجموع الأسهم (${shares_total})`, RM, y);
  y += 34*scale;

  // Table: م | البند | موافق | غير موافق | ممتنع عن التصويت — proper column boundaries with
  // dividing lines (RTL order: م rightmost, البند next, then the 3 result columns going left).
  const tableW = RM - LM;
  const wNo = tableW*0.06, wItem = tableW*0.40, wCol = tableW*0.18; // 3 result columns share the rest
  const xNoStart = RM - wNo;
  const xItemStart = xNoStart - wItem;
  const xAgreeStart = xItemStart - wCol;
  const xDisagreeStart = xAgreeStart - wCol;
  const xAbstainStart = xDisagreeStart - wCol; // should equal LM
  const colBounds = [
    { start: xNoStart, end: RM, label: "م" },
    { start: xItemStart, end: xNoStart, label: "البند" },
    { start: xAgreeStart, end: xItemStart, label: "موافق" },
    { start: xDisagreeStart, end: xAgreeStart, label: "غير موافق" },
    { start: xAbstainStart, end: xDisagreeStart, label: "ممتنع" }
  ];
  const tableTop = y;
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1*scale;
  ctx.font = `bold ${10*scale}px Tajawal, Arial`; ctx.textAlign = "center";
  const headerH = 28*scale;
  ctx.strokeRect(LM, y, RM-LM, headerH);
  colBounds.forEach(c => { ctx.strokeRect(c.start, y, c.end-c.start, headerH); ctx.fillText(c.label, (c.start+c.end)/2, y + 18*scale); });
  y += headerH;

  ctx.font = `${10*scale}px Tajawal, Arial`;
  const rowsToShow = agendaRows.length ? agendaRows : [{ topic: "", result: null }];
  rowsToShow.forEach((r, i) => {
    const rowH = 32*scale;
    colBounds.forEach(c => ctx.strokeRect(c.start, y, c.end-c.start, rowH));
    ctx.textAlign = "center";
    ctx.fillText(String(i+1), (xNoStart+RM)/2, y + rowH/2 + 4*scale);
    ctx.textAlign = "right";
    const itemMaxChars = 26;
    const itemText = r.topic.length > itemMaxChars ? r.topic.slice(0,itemMaxChars)+"…" : r.topic;
    ctx.fillText(itemText, xNoStart - 6*scale, y + rowH/2 + 4*scale);
    ctx.textAlign = "center";
    ctx.font = `bold ${13*scale}px Tajawal, Arial`;
    if(r.result === "موافق") ctx.fillText("✓", (xAgreeStart+xItemStart)/2, y + rowH/2 + 5*scale);
    if(r.result === "معارض") ctx.fillText("✓", (xDisagreeStart+xAgreeStart)/2, y + rowH/2 + 5*scale);
    if(r.result === "ممتنع") ctx.fillText("✓", (xAbstainStart+xDisagreeStart)/2, y + rowH/2 + 5*scale);
    ctx.font = `${10*scale}px Tajawal, Arial`;
    y += rowH;
  });

  y += 34*scale;
  ctx.textAlign = "right"; ctx.font = `${12*scale}px Tajawal, Arial`; ctx.fillStyle = "#0D2447";
  ctx.fillText("التوقيع/", RM, y);
  const sigCanvas = document.getElementById("voteSigCanvas");
  const sigDataUrl = sigCanvas.toDataURL("image/png");
  const sigImg = await new Promise(res => { const img = new Image(); img.onload = () => res(img); img.src = sigDataUrl; });
  const sigW = 150*scale, sigH = Math.min(sigW * (sigImg.height/sigImg.width), 70*scale);
  const sigTop = y + 10*scale;
  ctx.drawImage(sigImg, RM - sigW, sigTop, sigW, sigH);
  ctx.strokeStyle = "#B8C0CC"; ctx.lineWidth = 1*scale;
  ctx.beginPath(); ctx.moveTo(RM - sigW - 10*scale, sigTop + sigH + 4*scale); ctx.lineTo(RM, sigTop + sigH + 4*scale); ctx.stroke();
  ctx.font = `${9.5*scale}px Tajawal, Arial`; ctx.fillStyle = "#8B95A5"; ctx.textAlign = "right";
  ctx.fillText(`تاريخ التوقيع: ${new Date().toLocaleDateString("ar-SA-u-ca-gregory")}`, RM, sigTop + sigH + 24*scale);

  const cardPng = canvas.toDataURL("image/png");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await (await fetch(cardPng)).arrayBuffer();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([595, 842]);
  page.drawImage(pngImage, { x: 0, y: 0, width: 595, height: 842 });
  const finalBytes = await pdfDoc.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });

  // Save a persistent copy the platform (and by extension the company's admin) can retrieve
  // later — without this, the signed card only ever existed on the shareholder's own device,
  // which is useless when the company needs to submit it to the Ministry of Commerce.
  const storedUrl = await uploadBlobToStorage(blob, "signed-vote-cards", `بطاقة-تصويت-${shareholder_name.replace(/[\\/:*?"<>|]/g,"_")}-${Date.now()}.pdf`);
  if(storedUrl && currentVotingMeetingId){
    await sb.from("agm_attendance").update({ signed_vote_card_url: storedUrl })
      .eq("meeting_id", currentVotingMeetingId).eq("shareholder_name", shareholder_name);
  }

  // قفل التصويت + حفظ رابط البطاقة في سجل القفل (لا يعتمد على وجود سجل حضور ولا على نجاح الرفع)
  try{
    const ownEl = document.getElementById('gm-shareholder-name');
    const ownName = ownEl ? ownEl.value.trim() : "";
    const { data: ud } = await sb.auth.getUser();
    const myMail = (ud && ud.user && ud.user.email) || "";
    // البطاقة بطاقتي إذا: الاسم هو اسمي في نموذج التصويت، أو سجل المساهمين مرتبط ببريدي، أو اسمي في الملف الشخصي
    let isMine = !!(ownName && ownName === shareholder_name);
    if(!isMine && myMail){
      const { data: reg } = await sb.from("shareholders").select("id").eq("company_id", currentCompanyId)
        .eq("name", shareholder_name).ilike("claimed_by_email", myMail).limit(1);
      isMine = !!(reg && reg.length);
    }
    if(!isMine && currentUserProfile && currentUserProfile.full_name){
      isMine = String(currentUserProfile.full_name).trim() === String(shareholder_name).trim();
    }
    if(isMine && currentVotingMeetingId){
      let { error: lkErr } = await sb.rpc("register_vote_lock", {
        p_company_id: currentCompanyId, p_meeting_id: currentVotingMeetingId,
        p_name: shareholder_name, p_url: storedUrl || null
      });
      if(lkErr){ // احتياط: إن لم تُنفَّذ دالة v3 بعد نسجّل القفل مباشرة
        const r2 = await sb.from("agm_vote_locks").insert([{
          company_id: currentCompanyId, meeting_id: currentVotingMeetingId,
          shareholder_name, shareholder_email: (ud && ud.user && ud.user.email) || null, card_url: storedUrl || null
        }]);
        lkErr = r2.error;
      }
      if(lkErr && !/duplicate|unique/i.test(lkErr.message||"")){ console.warn("vote lock failed", lkErr.message); alert("تنبيه: تعذّر تسجيل قفل التصويت (" + lkErr.message + "). أبلغ مدير النظام."); }
    }
  }catch(e){ console.warn("vote lock error", e); }


  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `بطاقة-تصويت-موقّعة-${shareholder_name.replace(/[\\/:*?"<>|]/g,"_")}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);

  closeM("m-vote-card-sign");
  alert("تم تحميل بطاقة التصويت موقّعة بنجاح ✅ — ونُسخة محفوظة تلقائيًا بالمنصة. أُغلق التصويت عليك الآن.");
  try{ loadVotingPage(); }catch(e){}
}

function vote(type){const msg=document.getElementById("vote-msg");const labels={"yes":"✅ تم تسجيل تصويتك: موافق","no":"❌ تم تسجيل تصويتك: معارض","abs":"🔵 تم تسجيل تصويتك: ممتنع"};msg.textContent=labels[type]||"تم التسجيل";msg.style.display="block";if(type==="no"){msg.style.background="#FDE8E8";msg.style.color="var(--red)";}else if(type==="abs"){msg.style.background="#FEF3E2";msg.style.color="var(--orange)";}else{msg.style.background="#E8F8EF";msg.style.color="var(--green)";}};
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
/* ══════════ SHARED: multi-page canvas→PDF builder with Arabic text wrapping ══════════
   All 4 official AGM documents (invitation, minutes, vote-count minutes, attendance sheet) are
   long, formally-worded, and need to render correctly regardless of length — so instead of a
   fixed single canvas, this tracks a running Y position across as many pages as needed. */
class CanvasPDFBuilder {
  constructor(){
    this.scale = 2;
    this.W = 595*this.scale; this.H = 842*this.scale;
    this.sigImageCache = {};
    this.margin = 50*this.scale;
    this.pages = [];
    this.letterheadImg = null;
    this.headerHeight = 0;
  }
  // Loads the company's letterhead once (if they've uploaded one) so every page of every
  // document — announcements, minutes, disclosure forms, all of it — gets it automatically,
  // instead of each document generator needing its own letterhead logic.
  static async create(companyId){
    const b = new CanvasPDFBuilder();
    if(companyId){
      try{
        const { data: company } = await sb.from("companies").select("letterhead_url").eq("id", companyId).single();
        if(company && company.letterhead_url){
          const img = await new Promise((resolve) => {
            const im = new Image();
            im.crossOrigin = "anonymous";
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = company.letterhead_url;
          });
          if(img){ b.letterheadImg = img; b.headerHeight = 110*b.scale; }
        }
      }catch(e){ /* no letterhead configured or failed to load — proceed without one */ }
    }
    b.newPage();
    return b;
  }
  newPage(){
    const canvas = document.createElement("canvas");
    canvas.width = this.W; canvas.height = this.H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,this.W,this.H);
    ctx.direction = "rtl";
    this.ctx = ctx; this.canvas = canvas;
    if(this.letterheadImg){
      const headerDrawH = this.headerHeight - 10*this.scale;
      const headerDrawW = headerDrawH * (this.letterheadImg.width/this.letterheadImg.height);
      ctx.drawImage(this.letterheadImg, (this.W-headerDrawW)/2, 8*this.scale, headerDrawW, headerDrawH);
    }
    this.y = this.margin + this.headerHeight;
    this.pages.push(canvas);
  }
  ensureSpace(neededH){
    if(this.y + neededH > this.H - this.margin) this.newPage();
  }
  // Wraps `text` to fit within maxWidth (in scaled px), drawing each line right-aligned,
  // advancing this.y as it goes; returns nothing, just mutates state.
  wrapAndDraw(text, opts={}){
    const { font = `${11*this.scale}px Tajawal, Arial`, color = "#0D2447", lineHeight = 18*this.scale, maxWidth = this.W - this.margin*2, align = "right", x } = opts;
    this.ctx.font = font; this.ctx.fillStyle = color; this.ctx.textAlign = align;
    const drawX = x !== undefined ? x : (align === "right" ? this.W - this.margin : (align === "center" ? this.W/2 : this.margin));
    const words = String(text||"").split(" ");
    let line = "";
    const lines = [];
    for(const w of words){
      const test = line ? line + " " + w : w;
      if(this.ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
      else line = test;
    }
    if(line) lines.push(line);
    lines.forEach(l => {
      this.ensureSpace(lineHeight);
      this.ctx.fillText(l, drawX, this.y + lineHeight*0.7);
      this.y += lineHeight;
    });
  }
  spacer(h){ this.y += h*this.scale; }
  // Preloads every provided signature data-URL into an Image ahead of time (drawImage needs a
  // loaded image, and awaiting mid-draw would complicate the synchronous drawing flow below).
  async preloadSignatures(signaturesMap){
    const entries = Object.entries(signaturesMap||{}).filter(([,v]) => v && v.image);
    await Promise.all(entries.map(([role, v]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.sigImageCache[role] = img; res(); };
      img.onerror = () => res();
      img.src = v.image;
    })));
  }
  // Draws one signature slot: role label above, then either the actual signature image (if
  // this role has signed) or a plain dotted line — plus the expected signer's name either way.
  drawSigSlot(role, expectedName, x, y, signaturesMap){
    const sig = (signaturesMap||{})[role];
    this.ctx.textAlign = "center";
    this.ctx.font = `bold ${11*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#0D2447";
    this.ctx.fillText(role, x, y);
    const img = this.sigImageCache[role];
    if(sig && img){
      const sigW = 120*this.scale, sigH = sigW * (img.height/img.width);
      this.ctx.drawImage(img, x - sigW/2, y + 8*this.scale, sigW, sigH);
      this.ctx.font = `${9*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#8B95A5";
      this.ctx.fillText(sig.name || expectedName || "", x, y + sigH + 22*this.scale);
    } else {
      this.ctx.font = `${11*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#8B95A5";
      this.ctx.fillText(expectedName || "..........................", x, y + 20*this.scale);
    }
  }
  // Stamps the company seal onto a specific page at its configured fixed position — called
  // from the signing UI's "🔖 إضافة الختم" button, separate from the signature-slot drawing
  // since a seal isn't tied to any one signer's role.
  drawSeal(sealImg, position, pageIndex){
    const canvas = this.pages[pageIndex] || this.pages[this.pages.length-1];
    const ctx = canvas.getContext("2d");
    const sealSize = 90*this.scale;
    const positions = {
      "أسفل يمين الصفحة": [this.W - this.margin - sealSize, this.H - this.margin - sealSize],
      "أسفل يسار الصفحة": [this.margin, this.H - this.margin - sealSize],
      "أسفل وسط الصفحة": [(this.W - sealSize)/2, this.H - this.margin - sealSize],
      "بجانب أول توقيع": [this.W/2 - sealSize - 20*this.scale, this.H - this.margin - sealSize*1.6]
    };
    const [x, y] = positions[position] || positions["أسفل يمين الصفحة"];
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sealImg, x, y, sealSize, sealSize);
    ctx.globalAlpha = 1;
  }
  async toPDFBytes(){
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    for(const canvas of this.pages){
      const png = canvas.toDataURL("image/png");
      const bytes = await (await fetch(png)).arrayBuffer();
      const img = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([595, 842]);
      page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    }
    return await pdfDoc.save();
  }
}

// Shared final step for all 4 generators: upload the finished PDF to storage and create a
// signing_documents row with the correct required signer count, plumbing straight into the
// e-signing system already built (and fixed) earlier today — no separate signature system needed.
async function uploadOfficialDocForSigning(pdfBytes, fileName, docName, docType, signersTotal){
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "official-documents", fileName);
  if(!file_url){ alert("تعذّر رفع الملف"); return null; }
  const { data, error } = await sb.from("signing_documents").insert([{
    company_id: currentCompanyId, document_name: docName, doc_type: docType,
    file_url, signers_total: signersTotal, due_date: null
  }]).select().single();
  if(error){ alert("تعذّر إنشاء طلب التوقيع: " + error.message); return null; }
  return data;
}

