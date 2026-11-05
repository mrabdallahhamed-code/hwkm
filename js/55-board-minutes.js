/* ══════════ BOARD MINUTES (signed via e-signature) ══════════ */
async function loadMinutesTable(meetings, tbodyId, emptyText){
  const tbody = document.getElementById(tbodyId);
  if(!tbody) return;
  if(!meetings || meetings.length===0){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${emptyText}</td></tr>`;
    return;
  }

  const signingIds = meetings.map(m=>m.signing_doc_id).filter(Boolean);
  let signingById = {};
  if(signingIds.length){
    const { data: docs } = await sb.from("signing_documents").select("*").in("id", signingIds);
    (docs||[]).forEach(d => { signingById[d.id] = d; });
  }

  tbody.innerHTML = meetings
    .sort((a,b) => (b.meeting_date||"").localeCompare(a.meeting_date||""))
    .map(m => {
      const doc = m.signing_doc_id ? signingById[m.signing_doc_id] : null;
      let statusBadge, actionBtn;
      if(!doc){
        statusBadge = '<span class="badge pending">لم يُربط بعد بمستند توقيع</span>';
        actionBtn = `<button class="btn-xs primary" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>ربط بمحضر توقيع</button>`;
      } else if((doc.signers_done||0) >= (doc.signers_total||1) && doc.signers_total){
        statusBadge = `<span class="badge done">موقّع بالكامل ✍️ (${doc.signers_done}/${doc.signers_total})</span>`;
        actionBtn = `<button class="btn-xs gold" onclick="generateSignedMinutesPDF(${m.id})"><span class="ico-i ico-scroll"></span>عرض المحضر</button>`;
      } else {
        statusBadge = `<span class="badge info">قيد التوقيع (${doc.signers_done||0}/${doc.signers_total||'?'})</span>`;
        actionBtn = `<button class="btn-xs" style="background:var(--offwhite);color:var(--gray3);border:1px solid var(--gray1);border-radius:6px;padding:5px 10px;font-size:11px;cursor:not-allowed" disabled title="ينتظر اكتمال توقيع كل الأعضاء"><span class="ico-i ico-scroll"></span>عرض المحضر</button>
          <button class="btn-xs" style="background:none;border:none;color:var(--gray3);font-size:10px;cursor:pointer" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>تغيير الربط</button>`;
      }
      return `<tr>
        <td>${orgEsc(m.title||"")}</td><td>${m.meeting_type||"—"}</td><td>${m.meeting_date||"—"}</td><td>${m.meeting_time||"—"}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>`;
    }).join("");
}
async function loadBoardMinutes(boardMeetings){
  loadMinutesTable(boardMeetings, "boardMinutesTbody", "لا توجد اجتماعات مجلس بعد");
}
async function loadCommitteeMinutes(committeeMeetings){
  loadMinutesTable(committeeMeetings, "committeeMinutesTbody", "لا توجد اجتماعات لجان بعد");
}

async function linkMeetingToSigningDoc(meetingId){
  const { data: docs, error } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ alert("تعذّر تحميل مستندات التوقيع: " + error.message); return; }
  if(!docs || docs.length===0){ alert('لا توجد مستندات بصفحة "التوقيع الإلكتروني" بعد. ارفع محضر الاجتماع هناك أولًا كمستند للتوقيع.'); return; }

  const options = docs.map((d,i) => `${i+1}. ${orgEsc(d.document_name)} (${d.signers_done||0}/${d.signers_total||'?'} موقّعين)`).join("\n");
  const choice = await uiPrompt("اختر رقم مستند التوقيع المطابق لمحضر هذا الاجتماع:\n\n" + options);
  const idx = Number(choice) - 1;
  if(!choice || isNaN(idx) || idx < 0 || idx >= docs.length) return;

  const { error: updErr } = await sb.from("meetings").update({ signing_doc_id: docs[idx].id }).eq("id", meetingId);
  if(updErr){ alert("تعذّر الربط: " + updErr.message); return; }
  loadMeetingsAll();
}

async function generateSignedMinutesPDF(meetingId){
  const { data: m, error } = await sb.from("meetings").select("*").eq("id", meetingId).single();
  if(error || !m){ alert("تعذّر تحميل بيانات الاجتماع"); return; }
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", m.signing_doc_id).single();

  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مرة أخرى."); return; }
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>محضر موقّع — ${orgEsc(m.title||"")}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:40px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      .meta{font-size:13px;margin:6px 0}
      .stamp{margin-top:30px;padding:16px;background:#EAF8F0;border:2px solid #1E8E5A;border-radius:10px;color:#166A43;font-weight:800;text-align:center}
      .files a{color:#1A3A6B}
    </style></head><body>
    <h1><span class="ico-i ico-scroll"></span>محضر اجتماع موقّع إلكترونيًا</h1>
    <p class="meta"><b>عنوان الاجتماع:</b> ${orgEsc(m.title||"—")}</p>
    <p class="meta"><b>النوع:</b> ${m.meeting_type||"—"}</p>
    <p class="meta"><b>التاريخ:</b> ${m.meeting_date||"—"} ${m.meeting_time?(' — الساعة '+m.meeting_time):''}</p>
    <p class="meta"><b>طريقة الانعقاد:</b> ${m.method||"—"}</p>
    ${m.notes ? `<p class="meta"><b>ملاحظات:</b> ${orgEsc(m.notes)}</p>` : ""}
    <div class="stamp"><span class="ico-i ico-check"></span>تم توقيع هذا المحضر إلكترونيًا من ${doc?.signers_done||0} من ${doc?.signers_total||'?'} من الأعضاء المخوّلين، بتاريخ ${dateNow}.</div>
    ${m.minutes_file_url ? `<p class="files" style="margin-top:20px"><span class="ico-i ico-paperclip"></span><a href="${m.minutes_file_url}" target="_blank">فتح ملف المحضر الأصلي</a></p>` : ""}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}

/* Board-only cards: shows meetings from this calendar year that haven't happened yet
   (today or later), sorted soonest-first. Committee/AGM meetings are intentionally
   excluded here — they have their own dedicated pages. */
/* Labeled version for the card view: shows a title above the buttons, and keeps a
   dedicated download button visible alongside upload/replace once a file exists. */
function fileCellCard(id, field, url, label){
  return `<div style="text-align:center;flex:1">
    <div style="font-size:9.5px;color:var(--gray3);margin-bottom:4px;font-weight:700">${label}</div>
    <div style="display:flex;gap:4px;justify-content:center">
      ${url ? `<a class="btn-xs primary" href="${url}" target="_blank" rel="noopener" title="تحميل"><span class="ico-i ico-inbox"></span>تحميل</a>` : ""}
      <label class="btn-xs" style="cursor:pointer;display:inline-block;${url ? 'background:var(--offwhite);color:var(--dark)' : 'background:var(--primary);color:#fff'}"><span class="ico-i ico-paperclip"></span>${url?'استبدال':'رفع'}<input type="file" style="display:none" onchange="uploadMeetingFile(${id},'${field}',this)"></label>
      ${url ? `<button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 6px;font-size:11px;cursor:pointer" title="حذف الملف" onclick="deleteMeetingFile(${id},'${field}')"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>` : ""}
    </div>
  </div>`;
}

let upcomingMeetingsCache = [];
let allMeetingsCache = [];

/* Spacious, single-column version used inside the detail modal (roomy, not cramped) */
function fileRowWide(id, field, url, label, accept, reloadFn){
  const acceptAttr = accept ? ` accept="${accept}"` : "";
  const reload = reloadFn || "openMeetingDetailModal";
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--gray1)">
    <div style="font-size:13px;font-weight:800;color:var(--dark)">${label}</div>
    <div style="display:flex;gap:8px">
      ${url ? `<a class="btn btn-outline" style="font-size:11px;padding:6px 14px" href="${url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>` : ""}
      <label class="btn ${url?'btn-ghost':'btn-gold'}" style="font-size:11px;padding:6px 14px;cursor:pointer"><span class="ico-i ico-paperclip"></span>${url?'استبدال':'رفع ملف'}<input type="file"${acceptAttr} style="display:none" onchange="uploadMeetingFile(${id},'${field}',this);setTimeout(()=>${reload}(${id}),400)"></label>
      ${url ? `<button class="btn btn-ghost" style="font-size:11px;padding:6px 14px;color:var(--red)" onclick="deleteMeetingFile(${id},'${field}');setTimeout(()=>${reload}(${id}),400)"><span class="ico-i ico-trash"></span>حذف</button>` : ""}
    </div>
  </div>`;
}

let currentAttendanceMeetingId = null;
async function openMeetingDetailModal(id){
  const m = allMeetingsCache.find(x => x.id === id);
  if(!m) return;
  currentAttendanceMeetingId = id;

  document.getElementById("mdView-title").textContent = m.title||"";
  document.getElementById("mdView-headerIcon").textContent = m.committee_id ? "🧩" : (m.meeting_type==="اجتماع طارئ" ? "🔴" : "🤝");
  const timeRange = m.meeting_time ? (" — من الساعة "+m.meeting_time+(m.time_end?(" إلى "+m.time_end):"")) : "";
  document.getElementById("mdView-meta").innerHTML =
    `📅 ${m.meeting_date||"—"}${timeRange} &nbsp;·&nbsp; 📍 ${m.method||"—"}` +
    (m.notes ? `<br><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}` : "");

  startMeetingCountdown(m, "mdView-countdown");
  const linkBox = document.getElementById("mdView-linkBtn");
  if(m.meeting_link){
    linkBox.style.display = "block";
    linkBox.innerHTML = `<a href="${m.meeting_link}" target="_blank" rel="noopener" class="btn btn-gold" style="width:100%;text-align:center;display:block;text-decoration:none"><span class="ico-i ico-link"></span>انضم للاجتماع الآن</a>`;
  } else {
    linkBox.style.display = "none";
  }

  // Tab 2a: agenda + invitation — the agenda is always generated live from the actual agenda
  // items (vote_topics), never a separately-uploaded file that could go missing or get out of
  // sync if someone deletes it; "عرض" always reflects the current, real agenda.
  document.getElementById("mdView-agendaInviteFiles").innerHTML =
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:13px;font-weight:800;color:var(--dark)"><span class="ico-i ico-document"></span>جدول الأعمال</div>
      <button class="btn-xs primary" onclick="viewMeetingAgenda(${m.id})"><span class="ico-i ico-eye"></span>عرض</button>
    </div>` +
    fileRowWide(m.id,'invitation_file_url',m.invitation_file_url,'📨 الدعوة');

  // Tab 2b: minutes — shown as "المحضر النهائي" only once fully signed via the same
  // signing_documents workflow used across the platform; otherwise shows exactly where
  // it stands (not linked yet / awaiting signatures), never a bare unsigned file.
  await renderFinalMinutesBox(m);

  // Tab 2c: reminders, calendar, sharing
  document.getElementById("mdView-utilityActions").innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)"><span class="ico-i ico-mail"></span>إرسال تذكير بريدي لفريق الشركة</div>
      <button class="btn" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);font-size:11px;padding:6px 14px" onclick="sendMeetingReminderEmails(${m.id})"><span class="ico-i ico-mail"></span>إرسال</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)">📆 إضافة للتقويم الشخصي</div>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'google',false)">Google</button>
        <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'outlook',false)">Outlook</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)"><span class="ico-i ico-phone"></span>مشاركة عبر واتساب</div>
      <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="shareMeetingViaWhatsApp(${m.id},false)"><span class="ico-i ico-phone"></span>مشاركة</button>
    </div>`;

  loadMeetingSupportingDocs(id);
  loadMeetingAttendanceSection(id);
  loadMeetingTopics(id);
  loadMeetingDecisionsGrid(id);
  switchMeetingDetailTab('support');
  openM("m-meeting-view");

  autoGenerateMinutesIfDue(id).then(generated => {
    // Only refresh the modal if minutes were actually just created — never loop otherwise.
    if(generated && currentAttendanceMeetingId === id) openMeetingDetailModal(id);
  });
}

/* "المحضر النهائي" — reuses the exact same signing_documents mechanism the rest of the
   platform already uses (link a meeting to a signing document, collect every signature,
   only then is it final). Nothing calling itself "final" here is ever an unsigned draft. */
async function renderFinalMinutesBox(m){
  const box = document.getElementById("mdView-minutesFile");
  if(!box) return;
  if(!m.signing_doc_id){
    box.innerHTML = `<p class="modal-section-hint" style="margin-bottom:10px">المحضر يتولّد تلقائيًا بعد انتهاء الاجتماع، أو ولّده يدويًا الآن.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="generateMeetingMinutesDoc(${m.id})"><span class="ico-i ico-edit"></span>تحميل مسودة الآن</button>
        <button class="btn btn-outline" style="font-size:11px;padding:8px 16px" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>ربط بمستند توقيع آخر يدويًا</button>
      </div>`;
    return;
  }
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", m.signing_doc_id).single();
  if(!doc){ box.innerHTML = `<p class="modal-section-hint">تعذّر تحميل مستند التوقيع المرتبط.</p>`; return; }
  const fullySigned = (doc.signers_done||0) >= (doc.signers_total||1) && doc.signers_total;
  if(fullySigned){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-weight:800;color:var(--green);font-size:12.5px"><span class="ico-i ico-check"></span>المحضر النهائي — موقّع بالكامل (${doc.signers_done}/${doc.signers_total})</div></div>
        <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="generateSignedMinutesPDF(${m.id})"><span class="ico-i ico-scroll"></span>عرض المحضر النهائي</button>
      </div>`;
  } else {
    box.innerHTML = `<div style="background:var(--offwhite);border-radius:10px;padding:12px">
        <div style="font-weight:700;color:var(--dark);font-size:12px;margin-bottom:8px">⏳ قيد التوقيع (${doc.signers_done||0}/${doc.signers_total||'?'}) — لن يظهر كمحضر نهائي إلا بعد اكتمال كل التوقيعات.</div>
        <button class="btn-xs" style="background:none;border:none;color:var(--primary);font-size:11px;cursor:pointer;text-decoration:underline" onclick="linkMeetingToSigningDoc(${m.id})"><span class="ico-i ico-link"></span>تغيير الربط</button>
      </div>`;
  }
}

/* ── Supporting documents tab (same pattern/table already used for AGM, own container id) ── */
async function loadMeetingSupportingDocs(meetingId){
  const box = document.getElementById("mdView-supdocs");
  if(!box) return;
  const { data, error } = await sb.from("meeting_supporting_docs").select("*").eq("meeting_id", meetingId).order("id",{ascending:false});
  if(error){ box.innerHTML = '<div style="font-size:11px;color:var(--red)">تعذّر التحميل</div>'; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد وثائق داعمة مرفوعة بعد.</div>'; return; }
  box.innerHTML = data.map(d => `<div class="sh-doc-row">
      <div class="sh-doc-name"><span class="ico-i ico-paperclip"></span>${orgEsc(d.document_name||"وثيقة")}</div>
      <div style="display:flex;gap:6px">
        <a class="btn-xs" style="background:var(--gray1);color:var(--primary);border:none" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض</a>
        <a class="btn-xs primary" href="${d.file_url}" download><span class="ico-i ico-inbox"></span>تحميل</a>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none" onclick="deleteMeetingSupportingDoc(${d.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
      </div>
    </div>`).join("");
}
async function uploadMeetingSupportingDoc(inputEl){
  const meetingId = currentAttendanceMeetingId;
  if(!meetingId || !inputEl.files || !inputEl.files[0]) return;
  const file_url = await uploadFile(inputEl, "meeting-docs");
  if(!file_url) return;
  const document_name = inputEl.files[0].name;
  const { error } = await sb.from("meeting_supporting_docs").insert([{ meeting_id: meetingId, document_name, file_url, company_id: currentCompanyId }]);
  if(error){ alert("تعذّر رفع الوثيقة: " + error.message); return; }
  inputEl.value = "";
  loadMeetingSupportingDocs(meetingId);
}
async function deleteMeetingSupportingDoc(docId, meetingId){
  if(!await uiConfirm("حذف هذه الوثيقة؟")) return;
  await sb.from("meeting_supporting_docs").delete().eq("id", docId);
  loadMeetingSupportingDocs(meetingId);
}

/* Agenda items (بنود جدول الأعمال) for board/committee meetings — the same vote_topics
   table AGM meetings already use, and the exact table generateMeetingMinutesDoc() already
   reads from. Without this section the minutes generator always fell back to the free-text
   "notes" field because nothing ever populated vote_topics for non-AGM meetings. Writing
   agenda items is limited to سكرتير المجلس / مدير النظام, same as decisions. */
async function loadMeetingTopics(meetingId){
  const wrap = document.getElementById("mdView-topicsWrap");
  const box = document.getElementById("mdView-topics");
  const addRow = document.getElementById("mdView-topicsAddRow");
  if(!box) return;

  const { data: meetingRow } = await sb.from("meetings").select("committee_id").eq("id", meetingId).single();
  const committeeId = meetingRow ? meetingRow.committee_id : null;
  const role = getCurrentRole();
  const isFullAccess = isFullAccessRole(role);
  if(committeeId && !isFullAccess){
    const eligibleVoters = await getEligibleDecisionVoters(meetingId);
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData?.user?.email;
    const iAmEligible = eligibleVoters.some(v => v.claimed_by_email === myEmail);
    if(!iAmEligible){ if(wrap) wrap.style.display = "none"; return; }
  }
  if(wrap) wrap.style.display = "block";

  const canWrite = role === "سكرتير المجلس" || role === "مدير النظام";
  if(addRow) addRow.style.display = canWrite ? "flex" : "none";

  const { data, error } = await sb.from("vote_topics").select("*").eq("meeting_id", meetingId)
    .order("sort_order",{ascending:true}).order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:11px">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length === 0){
    box.innerHTML = '<div style="font-size:11px;color:var(--gray3);padding:6px 0">لا توجد بنود مضافة بعد.</div>';
    return;
  }
  box.innerHTML = data.map((t,i) => `<div class="topic-row">
      <div class="topic-num">${i+1}</div>
      <div class="topic-text">${orgEsc(t.topic_text)}</div>
      ${canWrite ? `<button class="topic-del" onclick="deleteMeetingTopic(${t.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>` : ""}
    </div>`).join("");
}

async function addMeetingTopic(){
  const role = getCurrentRole();
  if(role !== "سكرتير المجلس" && role !== "مدير النظام"){
    alert("إضافة بنود جدول الأعمال مقصورة على سكرتير المجلس أو مدير النظام.");
    return;
  }
  const input = document.getElementById("mdView-newtopic");
  const topic_text = input.value.trim();
  if(!topic_text || !currentAttendanceMeetingId) return;
  const { data: existing } = await sb.from("vote_topics").select("id").eq("meeting_id", currentAttendanceMeetingId);
  const { error } = await sb.from("vote_topics").insert([{
    meeting_id: currentAttendanceMeetingId, topic_text, sort_order: (existing||[]).length, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إضافة البند: " + error.message); return; }
  // Every real agenda item automatically becomes a decision members can vote on — no
  // separate re-typing step needed. (The two fixed opening/closing items never go through
  // this function, so they're never mistakenly turned into votable "decisions".)
  await sb.from("board_decisions").insert([{ meeting_id: currentAttendanceMeetingId, decision_text: topic_text, company_id: currentCompanyId }]);
  input.value = "";
  loadMeetingTopics(currentAttendanceMeetingId);
  loadMeetingDecisionsGrid(currentAttendanceMeetingId);
}

async function deleteMeetingTopic(topicId, meetingId){
  if(!await uiConfirm("حذف هذا البند نهائيًا؟")) return;
  const { error } = await sb.from("vote_topics").delete().eq("id", topicId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingTopics(meetingId);
}
