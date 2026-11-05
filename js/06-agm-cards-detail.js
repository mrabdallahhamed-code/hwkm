/* ══════════ AGM (الجمعية العامة) — cards, detail modal, per-meeting voting topics ══════════ */
let agmMeetingsCache = [];
let currentAGMModalMeetingId = null;
let currentVotingMeetingId = null;

function renderAGMSection(agmMeetings){
  agmMeetingsCache = agmMeetings;

  const isShareholder = getCurrentRole() === 'مساهم';
  const adminBlock = document.getElementById("agmAdminBlock");
  const shBlock = document.getElementById("agmShareholderBlock");
  if(adminBlock) adminBlock.style.display = isShareholder ? "none" : "block";
  if(shBlock) shBlock.style.display = isShareholder ? "block" : "none";
  if(isShareholder){
    loadShareholderAGMView(agmMeetings);
    return;
  }

  loadDocumentTemplates();
  const todayStr = new Date().toISOString().slice(0,10);
  const currentYear = new Date().getFullYear();

  const upcoming = agmMeetings
    .filter(m => m.meeting_date && m.meeting_date >= todayStr && new Date(m.meeting_date).getFullYear() === currentYear)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""));
  const past = agmMeetings
    .filter(m => !m.meeting_date || m.meeting_date < todayStr)
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""));

  renderUpcomingAGMCards(upcoming);
  renderPastAGMTable(past);
}

/* ── Shareholder-facing AGM view ──────────────────────────────────────────
   Deliberately minimal: only the CURRENT assembly's signed invitation and
   supporting attachments, plus plain read-only lists of what's upcoming and
   what's already happened. No admin tools (create/edit/upload/tadawul/etc.)
   are ever built into this branch. */
async function loadShareholderAGMView(agmMeetings){
  const todayStr = new Date().toISOString().slice(0,10);
  const currentYear = new Date().getFullYear();

  const upcoming = (agmMeetings||[])
    .filter(m => m.meeting_date && m.meeting_date >= todayStr && new Date(m.meeting_date).getFullYear() === currentYear)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""));
  const past = (agmMeetings||[])
    .filter(m => !m.meeting_date || m.meeting_date < todayStr)
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""));

  const current = upcoming[0] || null;
  const others = upcoming.slice(1);

  const curBox = document.getElementById("shCurrentAGM");
  if(curBox){
    curBox.innerHTML = current
      ? `<div class="mc q1" style="cursor:pointer" onclick="openShareholderAGMPopup(${current.id})">
          <div class="mc-bar"></div>
          <div class="mc-type">جمعية عامة ${current.agm_type||"عادية"} · الحالية</div>
          <div class="mc-title">${orgEsc(current.title||"الجمعية العامة")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${current.meeting_date||"—"}${current.meeting_time?(" — الساعة "+current.meeting_time):""}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${current.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openShareholderAGMPopup(${current.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`
      : '<div class="sh-empty" style="grid-column:1/-1"><div class="sh-empty-icon"><span class="ico ico-handshake" style="width:16px;height:16px"></span></div><div class="sh-empty-text">لا توجد جمعية عامة قادمة حاليًا.</div></div>';
  }

  const upBox = document.getElementById("shUpcomingAGMCards");
  if(upBox){
    upBox.innerHTML = others.length === 0
      ? '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px;grid-column:1/-1">لا توجد جمعيات عامة أخرى قادمة حاليًا.</div>'
      : others.map(m => `<div class="mc q1" style="cursor:pointer" onclick="openShareholderAGMPopup(${m.id})">
          <div class="mc-bar"></div>
          <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"}</div>
          <div class="mc-title">${orgEsc(m.title||"")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}${m.meeting_time?(" — الساعة "+m.meeting_time):""}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openShareholderAGMPopup(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`).join("");
  }

  const pastBox = document.getElementById("shPastAGMList");
  if(pastBox){
    pastBox.innerHTML = past.length === 0
      ? '<div class="sh-empty" style="grid-column:1/-1"><div class="sh-empty-icon"><span class="ico ico-archive" style="width:16px;height:16px"></span></div><div class="sh-empty-text">لا يوجد سجل جمعيات سابقة بعد.</div></div>'
      : past.map(m => `<div class="mc" style="cursor:pointer" onclick="openShareholderAGMPopup(${m.id})">
          <div class="mc-bar" style="background:linear-gradient(90deg,var(--gray2),var(--gray3))"></div>
          <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"} · منتهية</div>
          <div class="mc-title">${orgEsc(m.title||"الجمعية العامة")}</div>
          <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}</div>
          <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
          <div class="mc-actions">
            <button class="btn-xs" style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="event.stopPropagation();openShareholderAGMPopup(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل</button>
          </div>
        </div>`).join("");
  }
}

/* Full detail view for one AGM, opened in the "m-sh-agm-view" popup — used for the current,
   other-upcoming, and past meetings alike, so a shareholder always gets the exact same
   complete picture: type, date/time, status, meeting link (if live), calendar buttons, the
   signed invitation, and every supporting document — each offered as either VIEW (opens in
   a new tab, no forced download) or DOWNLOAD (saves the file), never just one or the other. */
async function shareholderAGMDetailHTML(m){
  const { invitationDoc, invitationFullySigned, invitationProgress, invitationUnpublished, supDocs } = await fetchShareholderAGMDocs(m.id);

  const todayStr = new Date().toISOString().slice(0,10);
  let statusBadge;
  if(!m.meeting_date || m.meeting_date < todayStr) statusBadge = '<span class="badge done">منتهية</span>';
  else if(m.meeting_date === todayStr) statusBadge = '<span class="badge info">جارية اليوم</span>';
  else statusBadge = '<span class="badge pending">قادمة</span>';

  const linkHTML = (m.meeting_link && m.meeting_date >= todayStr)
    ? `<a href="${m.meeting_link}" target="_blank" rel="noopener" class="btn btn-gold" style="width:100%;text-align:center;display:block;text-decoration:none;margin-bottom:14px"><span class="ico-i ico-link"></span>انضم للاجتماع الآن</a>`
    : "";

  const calendarHTML = m.meeting_date ? `<div style="display:flex;gap:6px;margin-bottom:16px">
      <button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'google',true)"><span class="ico-i ico-calendar"></span>Google Calendar</button>
      <button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'outlook',true)"><span class="ico-i ico-calendar"></span>Outlook</button>
    </div>` : "";

  const invitationHTML = (invitationDoc && invitationFullySigned)
    ? `<div class="sh-doc-row">
        <div class="sh-doc-name"><span class="ico-i ico-send"></span>دعوة الجمعية (موقّعة)</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none;border-radius:6px;padding:5px 12px;font-size:10.5px;cursor:pointer" href="${invitationDoc.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
          <a class="btn-xs primary" href="${invitationDoc.file_url}" download style="border-radius:6px;padding:5px 12px;font-size:10.5px"><span class="ico-i ico-inbox"></span>تحميل</a>
        </div>
      </div>`
    : `<div style="font-size:12px;color:var(--gray3);background:var(--offwhite);border-radius:8px;padding:10px 12px"><span class="ico-i ico-send"></span>دعوة الجمعية لم تُنشر بعد — ${invitationUnpublished ? 'ستظهر هنا فور إرسالها من إدارة الشركة.' : (invitationProgress ? `وُقّع ${invitationProgress.signed} من ${invitationProgress.total} توقيعات مطلوبة.` : 'لم تُنشأ الدعوة بعد.')} تابعونا قريبًا.</div>`;

  const supHTML = (supDocs && supDocs.length)
    ? supDocs.map(d => `<div class="sh-doc-row">
        <div class="sh-doc-name"><span class="ico-i ico-paperclip"></span>${orgEsc(d.document_name||"وثيقة")}</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none;border-radius:6px;padding:5px 12px;font-size:10.5px;cursor:pointer" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
          <a class="btn-xs primary" href="${d.file_url}" download style="border-radius:6px;padding:5px 12px;font-size:10.5px"><span class="ico-i ico-inbox"></span>تحميل</a>
        </div>
      </div>`).join("")
    : '<div style="font-size:11.5px;color:var(--gray3);padding:6px 0">لا توجد مرفقات داعمة حتى الآن.</div>';

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div style="font-size:14.5px;font-weight:800;color:var(--dark)">${orgEsc(m.title||"الجمعية العامة")}</div>
      ${statusBadge}
    </div>
    <div style="font-size:11.5px;color:var(--gray3);margin-bottom:16px">
      🏷️ جمعية ${m.agm_type||"عادية"} &nbsp; · &nbsp; 📅 ${m.meeting_date||"—"}${m.meeting_time?(" — الساعة "+m.meeting_time):""} &nbsp; · &nbsp; 📍 ${m.method||"—"}
    </div>
    ${linkHTML}
    ${calendarHTML}
    <div class="sh-docs-label"><span class="ico-i ico-send"></span>الدعوة</div>
    <div style="margin-bottom:16px">${invitationHTML}</div>
    <div class="sh-docs-label"><span class="ico-i ico-paperclip"></span>المرفقات الداعمة</div>
    ${supHTML}
  `;
}

async function fetchShareholderAGMDocs(meetingId){
  // الطريق الأول: دوال آمنة في قاعدة البيانات (تتجاوز قيود القراءة على جداول التوقيع للمساهم المعتمد فقط)
  try{
    const { data: inv, error: e1 } = await sb.rpc("get_agm_invitation", { p_meeting_id: meetingId });
    const { data: sup, error: e2 } = await sb.rpc("get_agm_supporting_docs", { p_meeting_id: meetingId });
    if(!e1 && !e2){
      const invitationDoc = inv && inv.id ? { id: inv.id, file_url: inv.file_url, signers_total: inv.signers_total } : null;
      const total = inv && inv.signers_total ? inv.signers_total : 1;
      const signedCount = inv ? (inv.signed_count || 0) : 0;
      // الدعوة تظهر للمساهم فقط بعد أن ينشرها المسؤول بزر «إرسال الدعوة»
      const visible = !!(invitationDoc && invitationDoc.file_url);
      return { invitationDoc: visible ? invitationDoc : null, invitationFullySigned: visible && signedCount >= total,
        invitationProgress: invitationDoc ? { signed: signedCount, total } : null,
        invitationUnpublished: !!(invitationDoc && !visible), supDocs: Array.isArray(sup) ? sup : [] };
    }
  }catch(e){}
  // الطريق الاحتياطي (قبل تنفيذ SQL): القراءة المباشرة كما كانت
  const { data: invDocs } = await sb.from("signing_documents").select("id,file_url,signers_total")
    .eq("related_meeting_id", meetingId).eq("doc_type","دعوة جمعية عامة").order("id",{ascending:false}).limit(1);
  const invitationDoc = (invDocs||[])[0];
  let invitationFullySigned = false, invitationProgress = null;
  if(invitationDoc){
    const { data: sigs } = await sb.from("official_doc_signatures").select("id").eq("document_id", invitationDoc.id);
    const total = invitationDoc.signers_total||1;
    invitationFullySigned = (sigs||[]).length >= total;
    invitationProgress = { signed: (sigs||[]).length, total };
  }
  const { data: supDocs } = await sb.from("meeting_supporting_docs").select("*").eq("meeting_id", meetingId).order("id",{ascending:false});
  return { invitationDoc, invitationFullySigned, invitationProgress, supDocs };
}

async function openShareholderAGMPopup(meetingId){
  const m = (agmMeetingsCache||[]).find(x => x.id === meetingId);
  if(!m) return;
  document.getElementById("shAGMModalBody").innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-sh-agm-view");
  document.getElementById("shAGMModalBody").innerHTML = await shareholderAGMDetailHTML(m);
}

function renderUpcomingAGMCards(upcoming){
  const wrap = document.getElementById("upcomingAGMCards");
  if(!wrap) return;
  if(upcoming.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد جمعيات عامة قادمة هذا العام حاليًا.</div>';
    return;
  }
  wrap.innerHTML = upcoming.map(m => {
    const fileCount = [m.agenda_file_url,m.invitation_file_url,m.minutes_file_url].filter(Boolean).length;
    return `<div class="mc q1" style="cursor:pointer" onclick="openAGMDetailModal(${m.id})">
      <div class="mc-bar"></div>
      <div class="mc-type">جمعية عامة ${m.agm_type||"عادية"}</div>
      <div class="mc-title">${orgEsc(m.title||"")}</div>
      <div class="mc-detail"><span class="ico-i ico-calendar"></span>${m.meeting_date||"—"}${m.meeting_time ? (" — الساعة "+m.meeting_time) : ""}</div>
      <div class="mc-detail"><span class="ico-i ico-pin"></span>${m.method||"—"}</div>
      ${m.notes ? `<div class="mc-detail"><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}</div>` : ""}
      <div class="mc-actions">
        <button class="btn-xs primary" style="width:100%" onclick="event.stopPropagation();openAGMDetailModal(${m.id})"><span class="ico-i ico-folder"></span>عرض التفاصيل والملفات ${fileCount ? `(${fileCount})` : ''}</button>
      </div>
      <label class="mc-public-toggle" onclick="event.stopPropagation()">
        <input type="checkbox" ${m.show_on_public_site?'checked':''} onchange="toggleMeetingPublicSite(${m.id},this.checked)"/>
        <span>🌐 عرض على الموقع العام لحوكم</span>
      </label>
    </div>`;
  }).join("");
}

async function toggleMeetingPublicSite(id, checked){
  const { error } = await sb.from("meetings").update({ show_on_public_site: checked }).eq("id", id);
  if(error){ alert("تعذّر تحديث حالة العرض العام: " + error.message); }
}

async function renderPastAGMTable(past){
  const tbody = document.getElementById("pastAGMTbody");
  if(!tbody) return;
  if(past.length === 0){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا يوجد سجل جمعيات سابقة بعد</td></tr>';
    return;
  }
  const ids = past.map(m=>m.id);
  const { data: votes } = await sb.from("votes").select("*").in("meeting_id", ids);
  const votesByMeeting = {};
  (votes||[]).forEach(v => { if(!votesByMeeting[v.meeting_id]) votesByMeeting[v.meeting_id]=[]; votesByMeeting[v.meeting_id].push(v); });
  const totalShares = Number(companySettings.total_shares) || 0;

  tbody.innerHTML = past.map(m => {
    const vs = votesByMeeting[m.id] || [];
    const shareholders = {};
    vs.forEach(v => { if(v.shareholder_name) shareholders[v.shareholder_name] = Number(v.shares_count)||0; });
    const votedShares = Object.values(shareholders).reduce((a,b)=>a+b,0);
    const participation = totalShares ? pct(votedShares, totalShares) : "—";
    return `<tr style="cursor:pointer" onclick="openAGMDetailModal(${m.id})">
      <td>${orgEsc(m.title||"")}</td><td>${m.meeting_date||"—"}</td><td>${m.agm_type||"عادية"}</td>
      <td>${participation}</td>
      <td><span class="badge done">مكتملة</span></td>
      <td><button class="btn-xs primary" onclick="event.stopPropagation();openAGMDetailModal(${m.id})"><span class="ico-i ico-folder"></span>التفاصيل</button></td>
    </tr>`;
  }).join("");
}

// "Word to edit" option for the minutes specifically — the company can tweak wording, then
// come back and upload the FINAL PDF (see the restricted-to-PDF upload row below) for signing.
async function generateAGMMinutesWordDraft(meetingId){
  await loadDocumentTemplates();
  const template = docTemplatesCache["agm_minutes"];
  if(!template || !template.file_url){
    alert('لا يوجد قالب Word مرفوع لمحضر الجمعية العامة — ارفعه أولًا من قسم "قوالب المستندات (Word)" أسفل هذي الصفحة (المفتاح: محضر الجمعية العامة).');
    return;
  }
  const config = OFFICIAL_DOC_TYPES["محضر جمعية عامة"];
  const chairman_name = await uiPrompt("اسم رئيس الجمعية (للمسودة):", "") || "";
  const secretary_name = await uiPrompt("اسم أمين سر الجمعية (للمسودة):", "") || "";
  const data = await config.prepareData(meetingId);
  const { m, company, topics, votes, attendees } = data;
  const companyName = company?.name || "الشركة";
  const companyTotalShares = Number(company?.total_shares)||0;
  const attendee_count = attendees.length;
  const attendee_shares = attendees.reduce((s,a)=>s+(Number(a.shares)||0),0);
  const attendance_pct = companyTotalShares ? Math.round(attendee_shares/companyTotalShares*100) : 0;
  const topicResults = topics.map(t => {
    const topicText = t.topic_text || t.topic || "";
    const relevant = votes.filter(v => v.topic === topicText);
    const totalVotes = relevant.length || 1;
    const yes = relevant.filter(v=>v.result==="موافق").length;
    const no = relevant.filter(v=>v.result==="معارض").length;
    const abs = relevant.filter(v=>v.result==="ممتنع").length;
    const yes_pct = Math.round(yes/totalVotes*100), no_pct = Math.round(no/totalVotes*100), abs_pct = Math.round(abs/totalVotes*100);
    return { topic_text: topicText, yes_pct, no_pct, abs_pct, decision: yes_pct>=50 ? "تمت الموافقة" : "لم تتم الموافقة" };
  });

  await fillDocxTemplate(template.file_url, {
    company_name: companyName, meeting_title: m.title||"", meeting_date: m.meeting_date||"",
    attendee_shares, attendee_count, attendance_pct, quorum_status: attendance_pct>=50?"مكتمل النصاب":"غير مكتمل النصاب",
    quorum_threshold: 50, chairman_name, secretary_name, topics: topicResults
  }, `محضر-الجمعية-مسودة-${m.title||''}.docx`);
}

let meetingCountdownInterval = null;
function startMeetingCountdown(m, elId){
  const box = document.getElementById(elId);
  if(meetingCountdownInterval) clearInterval(meetingCountdownInterval);
  if(!box || !m.meeting_date){ if(box) box.style.display = "none"; return; }
  const target = new Date(`${m.meeting_date}T${m.meeting_time || "00:00:00"}`);
  const tick = () => {
    const diff = target - new Date();
    if(diff <= 0){
      box.innerHTML = `<div style="color:#fff;font-weight:800;font-size:13px">🔴 الاجتماع جارٍ الآن أو انتهى</div>`;
      clearInterval(meetingCountdownInterval);
      return;
    }
    const days = Math.floor(diff/86400000), hours = Math.floor(diff%86400000/3600000), mins = Math.floor(diff%3600000/60000), secs = Math.floor(diff%60000/1000);
    box.style.display = "block";
    box.innerHTML = `
      <div style="color:rgba(255,255,255,0.85);font-size:11px;font-weight:700;margin-bottom:6px">⏳ الوقت المتبقي للاجتماع</div>
      <div style="display:flex;justify-content:center;gap:14px">
        ${[[days,'يوم'],[hours,'ساعة'],[mins,'دقيقة'],[secs,'ثانية']].map(([v,l]) =>
          `<div><div style="color:#fff;font-weight:900;font-size:20px">${v}</div><div style="color:rgba(255,255,255,0.75);font-size:10px">${l}</div></div>`
        ).join("")}
      </div>`;
  };
  tick();
  meetingCountdownInterval = setInterval(tick, 1000);
}

async function loadTadawulResultsForm(meetingId){
  const [{ data: m }, { data: topics }] = await Promise.all([
    sb.from("meetings").select("manual_attendee_count,manual_attendee_shares").eq("id", meetingId).single(),
    sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("id",{ascending:true})
  ]);
  document.getElementById("agmView-tadawul-count").value = m?.manual_attendee_count ?? "";
  document.getElementById("agmView-tadawul-shares").value = m?.manual_attendee_shares ?? "";
  const box = document.getElementById("agmView-tadawulTopics");
  box.innerHTML = (topics||[]).map(t => `<div style="background:#fff;border-radius:8px;padding:8px;margin-bottom:6px">
    <div style="font-size:11.5px;font-weight:700;margin-bottom:6px">${t.topic_text||t.topic||""}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
      <div><label style="font-size:10px;color:var(--green)">% موافق</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-yes-${t.id}" value="${t.manual_yes_pct ?? ''}"/></div>
      <div><label style="font-size:10px;color:var(--red)">% معارض</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-no-${t.id}" value="${t.manual_no_pct ?? ''}"/></div>
      <div><label style="font-size:10px;color:var(--orange)">% ممتنع</label><input type="number" min="0" max="100" class="fi" style="margin:0" id="tdw-abs-${t.id}" value="${t.manual_abs_pct ?? ''}"/></div>
    </div>
  </div>`).join("") || '<div style="font-size:11px;color:var(--gray3)">أضف بنود جدول الأعمال أولًا من الأسفل.</div>';
}

async function saveTadawulResults(){
  const meetingId = currentAGMModalMeetingId;
  const manual_attendee_count = document.getElementById("agmView-tadawul-count").value || null;
  const manual_attendee_shares = document.getElementById("agmView-tadawul-shares").value || null;
  await sb.from("meetings").update({ manual_attendee_count, manual_attendee_shares }).eq("id", meetingId);

  const { data: topics } = await sb.from("vote_topics").select("id").eq("meeting_id", meetingId);
  for(const t of (topics||[])){
    const yesEl = document.getElementById(`tdw-yes-${t.id}`);
    if(!yesEl) continue;
    await sb.from("vote_topics").update({
      manual_yes_pct: document.getElementById(`tdw-yes-${t.id}`).value || null,
      manual_no_pct: document.getElementById(`tdw-no-${t.id}`).value || null,
      manual_abs_pct: document.getElementById(`tdw-abs-${t.id}`).value || null
    }).eq("id", t.id);
  }
  alert("تم حفظ نتائج تداول ✅ — جاهزة الآن لتوليد محضر الجمعية.");
}
