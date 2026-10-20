/* ══════════ GENERIC ANNOUNCEMENT ENGINE — renders any ANNOUNCEMENT_TYPES entry ══════════ */
let currentAnnouncementTypeKey = null;

function renderAnnouncementTypeList(){
  const search = document.getElementById("annTypeSearch").value.trim();
  const box = document.getElementById("annTypeList");
  const agmTypes = [
    { key:"__agm_دعوة", label:"📨 دعوة لجمعية عامة", category:"الجمعيات العامة" },
    { key:"__agm_نتائج", label:"📊 نتائج جمعية عامة", category:"الجمعيات العامة" },
    { key:"__agm_عدم انعقاد", label:"🚫 عدم انعقاد جمعية", category:"الجمعيات العامة" },
  ];
  const registryTypes = Object.entries(ANNOUNCEMENT_TYPES).map(([key, def]) => ({ key, label: key, category: def.category }));
  const all = [...agmTypes, ...registryTypes].filter(t => !search || t.label.includes(search) || t.category.includes(search));

  const byCategory = {};
  all.forEach(t => { (byCategory[t.category] = byCategory[t.category]||[]).push(t); });

  box.innerHTML = Object.entries(byCategory).map(([cat, items]) => `
    <div style="font-size:10.5px;font-weight:800;color:var(--gray3);margin:10px 0 4px">${cat}</div>
    ${items.map(t => `<button class="btn-xs" style="width:100%;text-align:right;padding:9px 10px;background:var(--offwhite);border:none;border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:12px" onclick="selectAnnouncementType('${t.key}')">${t.label}</button>`).join("")}
  `).join("") || '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا نتائج مطابقة</div>';
}

function selectAnnouncementType(key){
  closeM("m-announcement-type-picker");
  if(key.startsWith("__agm_")){
    pickAgmAnnouncementType(key.replace("__agm_",""));
    return;
  }
  currentAnnouncementTypeKey = key;
  const def = ANNOUNCEMENT_TYPES[key];
  document.getElementById("genAnnTitle").textContent = `📢 ${key}`;
  document.getElementById("genAnnFields").innerHTML = def.fields.map(f => {
    if(f.type === "textarea") return `<div class="fg"><label>${f.label}</label><textarea class="fta" id="genf-${f.key}" rows="2"></textarea></div>`;
    if(f.type === "date") return `<div class="fg"><label>${f.label}</label><input type="date" class="fi" id="genf-${f.key}"/></div>`;
    return `<div class="fg"><label>${f.label}</label><input class="fi" id="genf-${f.key}"/></div>`;
  }).join("") + (def.fixedNote ? `<div style="background:#FEF3E2;border-radius:8px;padding:10px;font-size:11px;color:#8A6D1F;margin-top:6px">ℹ️ ${def.fixedNote}</div>` : "");
  openM("m-generic-announcement");
}

async function generateGenericAnnouncement(){
  const def = ANNOUNCEMENT_TYPES[currentAnnouncementTypeKey];
  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const companyName = company?.name || "الشركة";

  const extra = {};
  def.fields.forEach(f => { extra[f.key] = document.getElementById(`genf-${f.key}`).value.trim(); });

  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw(def.title(companyName, extra), { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:22*b.scale });
  b.spacer(20);
  def.fields.forEach(f => {
    b.wrapAndDraw(`${f.label}: ${extra[f.key]||"—"}`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  });
  if(def.fixedNote){
    b.spacer(10);
    b.wrapAndDraw(def.fixedNote, { font:`${10*b.scale}px Tajawal, Arial`, color:"#8A6D1F", lineHeight:18*b.scale });
  }

  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "tadawul-announcements", `اعلان-${currentAnnouncementTypeKey}-${companyName}-${Date.now()}.pdf`);
  if(!file_url) return;

  await sb.from("tadawul_announcements").insert([{
    company_id: currentCompanyId, meeting_id: null, announcement_type: currentAnnouncementTypeKey, extra_data: extra, file_url
  }]);
  alert("تم توليد مسودة الإعلان ✅");
  closeM("m-generic-announcement");
  loadAnnouncementsPageList();
}

function openTadawulAnnouncementForm(type){
  document.getElementById("tdwAnn-type").value = type;
  document.getElementById("tdwAnn-title").textContent =
    type === "دعوة" ? "📨 توليد إعلان الدعوة للجمعية" :
    type === "نتائج" ? "📊 توليد إعلان نتائج الجمعية" :
    "🚫 توليد إعلان عدم انعقاد الجمعية";

  document.getElementById("tdwAnn-inviteFields").style.display = type === "دعوة" ? "block" : "none";
  document.getElementById("tdwAnn-resultsFields").style.display = type === "نتائج" ? "block" : "none";
  document.getElementById("tdwAnn-nonOccurFields").style.display = type === "عدم انعقاد" ? "block" : "none";
  openM("m-tadawul-announcement");
}

async function generateTadawulAnnouncement(){
  const type = document.getElementById("tdwAnn-type").value;
  const meetingId = currentAGMModalMeetingId;
  const m = agmMeetingsCache.find(x => x.id === meetingId);
  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const companyName = company?.name || "الشركة";

  let extra_data = {};
  if(type === "دعوة"){
    extra_data = {
      mapsLink: document.getElementById("tdwAnn-mapsLink").value.trim(),
      attendMethod: document.getElementById("tdwAnn-attendMethod").value,
      requestedBy: document.getElementById("tdwAnn-requestedBy").value,
      buyback: document.getElementById("tdwAnn-buyback").value.trim(),
      capitalChange: document.getElementById("tdwAnn-capitalChange").value.trim(),
      irPhone: document.getElementById("tdwAnn-irPhone").value.trim(),
      irEmail: document.getElementById("tdwAnn-irEmail").value.trim()
    };
  } else if(type === "نتائج"){
    extra_data = {
      boardPresent: document.getElementById("tdwAnn-boardPresent").value.trim(),
      boardAbsent: document.getElementById("tdwAnn-boardAbsent").value.trim(),
      committeeChairs: document.getElementById("tdwAnn-committeeChairs").value.trim(),
      dividends: document.getElementById("tdwAnn-dividends").value.trim(),
      elected: document.getElementById("tdwAnn-elected").value.trim(),
      auditor: document.getElementById("tdwAnn-auditor").value.trim()
    };
  } else {
    extra_data = {
      reason: document.getElementById("tdwAnn-nonOccurReason").value.trim(),
      attendancePct: document.getElementById("tdwAnn-nonOccurPct").value,
      impact: document.getElementById("tdwAnn-nonOccurImpact").value.trim()
    };
  }

  const b = await buildTadawulAnnouncementPDF(type, m, company, extra_data);
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "tadawul-announcements", `اعلان-${type}-${companyName}-${Date.now()}.pdf`);
  if(!file_url) return;

  await sb.from("tadawul_announcements").insert([{
    company_id: currentCompanyId, meeting_id: meetingId, announcement_type: type, extra_data, file_url
  }]);
  alert("تم توليد مسودة الإعلان ✅ — حمّلها وأرسلها لموظف تداول المختص لاعتمادها ونشرها.");
  closeM("m-tadawul-announcement");
  loadTadawulAnnouncementsList(meetingId);
}

async function buildTadawulAnnouncementPDF(type, m, company, extra){
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  const companyName = company?.name || "الشركة";
  const agmTypeLabel = m?.agm_type === "غير عادية" ? "غير العادية" : "العادية";
  const callLabels = {1:"الأول", 2:"الثاني", 3:"الثالث"};
  const callLabel = callLabels[m?.call_number] || "الأول";

  if(type === "دعوة"){
    const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", m.id).order("id",{ascending:true});
    const agendaText = (topics && topics.length) ? topics.map((t,i)=>`(${i+1}) ${t.topic_text||t.topic}`).join(" — ") : "مرفق أدناه";
    b.wrapAndDraw(`يدعو مجلس إدارة شركة ${companyName} مساهميها إلى حضور اجتماع الجمعية العامة (${agmTypeLabel}) (الاجتماع ${callLabel})`,
      { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:22*b.scale });
    b.spacer(20);
    const lines = [
      `١. جدول أعمال الجمعية: ${agendaText}`,
      `٢. يوم وتاريخ الانعقاد: ${arabicDayName(m?.meeting_date)} الموافق ${m?.meeting_date||"—"} — الساعة ${m?.meeting_time||"—"}`,
      `٣. مكان الانعقاد: ${m?.method||"—"}${extra.mapsLink?` — رابط الموقع: ${extra.mapsLink}`:""}`,
      `٤. طريقة الانعقاد: ${extra.attendMethod||"—"}`,
      `٥. المستندات المؤيدة لكل بند مرفقة وفق الجدول النظامي المعتمد.`,
      `٦. يحق حضور الجمعية للمساهمين المقيدين بسجل مساهمي الشركة لدى مركز الإيداع بنهاية جلسة التداول التي تسبق الاجتماع، ولهم حق إنابة من يختارونه من غير أعضاء مجلس الإدارة.`,
      `٧. للمساهم الحق في مناقشة بنود الجدول وتوجيه الأسئلة والتصويت عليها.`,
      `٨. النصاب اللازم للانعقاد وفق النظام الأساس للشركة ونظام الشركات.`,
      extra.requestedBy ? `٩. هذه الدعوة مقدَّمة بطلب من: ${extra.requestedBy}.` : null,
      `١٠. يتوفر التصويت الإلكتروني على بنود الجمعية${m?.voting_start?` — يبدأ بتاريخ ${new Date(m.voting_start).toLocaleString('ar-SA-u-ca-gregory')}`:" — سيُعلَن عن موعده لاحقًا"}.`,
      `١١. تنتهي أحقية تسجيل الحضور وقت انعقاد الجمعية، وتنتهي أحقية التصويت عند انتهاء لجنة الفرز من فرز الأصوات.`,
      extra.buyback ? `١٢. بخصوص شراء الشركة أسهمها: ${extra.buyback}` : null,
      extra.capitalChange ? `١٣. بخصوص تغيير رأس المال: ${extra.capitalChange}` : null,
      (extra.irPhone||extra.irEmail) ? `١٤. للاستفسارات، التواصل مع إدارة علاقات المساهمين — هاتف: ${extra.irPhone||"—"} — بريد: ${extra.irEmail||"—"}` : null,
    ].filter(Boolean);
    lines.forEach(line => b.wrapAndDraw(line, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale }));

  } else if(type === "نتائج"){
    b.wrapAndDraw(`تعلن شركة ${companyName} عن نتائج اجتماع الجمعية العامة (${agmTypeLabel}) (الاجتماع ${callLabel})`,
      { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:22*b.scale });
    b.spacer(20);
    const lines = [
      `١. مكان وتاريخ ووقت الانعقاد: ${m?.method||"—"} — ${m?.meeting_date||"—"} — الساعة ${m?.meeting_time||"—"}`,
      `٢. نسبة الحضور: ${m?.manual_attendee_count!=null ? "حسب سجل تداول" : "—"}`,
      extra.boardPresent ? `٣. أعضاء المجلس الحاضرون: ${extra.boardPresent.replace(/\n/g,", ")}` : null,
      extra.boardAbsent ? `٤. أعضاء المجلس المتغيبون: ${extra.boardAbsent.replace(/\n/g,", ")}` : null,
      extra.committeeChairs ? `٥. رؤساء اللجان الحاضرون: ${extra.committeeChairs.replace(/\n/g,", ")}` : null,
      `٦. نتائج التصويت على بنود الجدول: مرفقة أدناه.`,
      extra.dividends ? `٧. توزيع الأرباح: ${extra.dividends}` : null,
      extra.elected ? `٨. الأعضاء المنتخبون/المعينون: ${extra.elected}` : null,
      extra.auditor ? `٩. تعيين مراجع الحسابات: ${extra.auditor}` : null,
    ].filter(Boolean);
    lines.forEach(line => b.wrapAndDraw(line, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale }));

    b.spacer(16);
    const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", m.id).order("id",{ascending:true});
    (topics||[]).forEach((t,i) => {
      const yes = t.manual_yes_pct ?? 0, no = t.manual_no_pct ?? 0, abs = t.manual_abs_pct ?? 0;
      b.wrapAndDraw(`${i+1}. ${t.topic_text||t.topic} — موافق ${yes}% / معارض ${no}% / ممتنع ${abs}%`, { font:`${10*b.scale}px Tajawal, Arial`, lineHeight:18*b.scale });
    });

  } else {
    b.wrapAndDraw(`تعلن شركة ${companyName} عن عدم انعقاد الجمعية العامة (${agmTypeLabel}) للشركة (الاجتماع ${callLabel})`,
      { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:22*b.scale });
    b.spacer(20);
    [
      `١. تاريخ الجمعية التي لم تنعقد: ${m?.meeting_date||"—"}`,
      `٢. سبب عدم الانعقاد: ${extra.reason||"—"}`,
      `٣. نسبة الحضور: ${extra.attendancePct||"—"}%`,
      `٤. الأثر: ${extra.impact||"لا يوجد أثر إضافي يُذكر."}`
    ].forEach(line => b.wrapAndDraw(line, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale }));
  }

  return b;
}

async function loadTadawulAnnouncementsList(meetingId){
  const box = document.getElementById("agmView-announcementsList");
  if(!box) return;
  const { data } = await sb.from("tadawul_announcements").select("*").eq("meeting_id", meetingId).order("created_at",{ascending:false});
  if(!data || data.length===0){ box.innerHTML = ""; return; }
  box.innerHTML = data.map(a => `<div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border-radius:8px;padding:8px;margin-top:6px">
    <div style="font-size:11px">
      <b>${a.announcement_type}</b> — ${new Date(a.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}
      ${a.confirmed_on_tadawul ? '<span style="color:var(--green)"><span class="ico-i ico-check"></span>مؤكَّد بتداول</span>' : '<span style="color:var(--gray3)">⏳ بانتظار التأكيد</span>'}
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <a href="${a.file_url}" target="_blank" class="btn-xs primary"><span class="ico-i ico-inbox"></span>عرض</a>
      ${!a.confirmed_on_tadawul ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer" onclick="confirmTadawulAnnouncement(${a.id})"><span class="ico-i ico-check"></span>تأكيد النشر بتداول</button>` : ""}
      ${a.confirmed_on_tadawul ? `<label style="font-size:10px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${a.show_on_public_site?'checked':''} onchange="toggleAnnouncementPublicSite(${a.id},this.checked)"/> 🌐 موقعنا العام</label>` : ""}
    </div>
  </div>`).join("");
}

async function confirmTadawulAnnouncement(id){
  if(!await uiConfirm("تأكيد إن هذا الإعلان نُشر فعليًا على تداول؟")) return;
  await sb.from("tadawul_announcements").update({ confirmed_on_tadawul: true }).eq("id", id);
  loadTadawulAnnouncementsList(currentAGMModalMeetingId);
}

async function toggleAnnouncementPublicSite(id, checked){
  await sb.from("tadawul_announcements").update({ show_on_public_site: checked }).eq("id", id);
}

async function openAGMDetailModal(id){
  const m = agmMeetingsCache.find(x => x.id === id);
  if(!m) return;
  currentAGMModalMeetingId = id;
  document.getElementById("agmView-title").textContent = m.title||"";
  document.getElementById("agmView-meta").innerHTML =
    `📅 ${m.meeting_date||"—"}${m.meeting_time?(" — الساعة "+m.meeting_time):""} &nbsp;·&nbsp; 📍 ${m.method||"—"}` +
    (m.notes ? `<br><span class="ico-i ico-edit"></span>${orgEsc(m.notes)}` : "");

  startMeetingCountdown(m, "agmView-countdown");

  const linkBox = document.getElementById("agmView-linkBtn");
  if(m.meeting_link){
    linkBox.style.display = "block";
    linkBox.innerHTML = `<a href="${m.meeting_link}" target="_blank" rel="noopener" class="btn btn-gold" style="width:100%;text-align:center;display:block;text-decoration:none"><span class="ico-i ico-link"></span>انضم للاجتماع الآن</a>`;
  } else {
    linkBox.style.display = "none";
  }

  const votingDatesSection = document.getElementById("agmView-votingDatesSection");
  const tadawulSection = document.getElementById("agmView-tadawulSection");
  const announcementsSection = document.getElementById("agmView-announcementsSection");
  const tadawulEmpty = document.getElementById("agmView-tadawulEmpty");
  if(m.is_listed_agm){
    if(votingDatesSection) votingDatesSection.style.display = "none";
    if(tadawulSection){ tadawulSection.style.display = "block"; await loadTadawulResultsForm(id); }
    if(announcementsSection) announcementsSection.style.display = "block";
    if(tadawulEmpty) tadawulEmpty.style.display = "none";
    loadTadawulAnnouncementsList(id);
  } else {
    if(announcementsSection) announcementsSection.style.display = "none";
    if(votingDatesSection) votingDatesSection.style.display = "block";
    if(tadawulSection) tadawulSection.style.display = "none";
    if(tadawulEmpty) tadawulEmpty.style.display = "block";
  }
  switchAGMTab('files');

  document.getElementById("agmView-voting-start").value = isoToDatetimeLocal(m.voting_start);
  document.getElementById("agmView-voting-end").value = isoToDatetimeLocal(m.voting_end);
  document.getElementById("agmView-agm-type").value = m.agm_type || "عادية";
  document.getElementById("agmView-call-number").value = String(m.call_number || 1);
  renderAGMQuorumWidget(id);

  const { data: existingInvitationDocs } = await sb.from("signing_documents").select("id,file_url,signers_total")
    .eq("related_meeting_id", m.id).eq("doc_type","دعوة جمعية عامة").order("id",{ascending:false}).limit(1);
  const invitationDoc = (existingInvitationDocs||[])[0];
  const { data: invSigs } = invitationDoc ? await sb.from("official_doc_signatures").select("id").eq("document_id", invitationDoc.id) : { data: [] };
  const invitationFullySigned = invitationDoc && (invSigs||[]).length >= (invitationDoc.signers_total||1);

  const agmFileCards = [
    {
      icon:"📨", title:"دعوة الجمعية",
      status: invitationDoc
        ? (invitationFullySigned ? (m.invitation_published_at ? '<span class="file-card-status ok"><span class="ico-i ico-check"></span>موقّعة ومنشورة للمساهمين</span>' : '<span class="file-card-status ok"><span class="ico-i ico-check"></span>موقّعة — لم تُنشر للمساهمين بعد (اضغط «إرسال الدعوة»)</span>') : '<span class="file-card-status pending"><span class="ico-i ico-dot"></span>بانتظار اكتمال التوقيع</span>')
        : '<span class="file-card-status muted">لم تُولَّد بعد</span>',
      actions: invitationDoc
        ? `<a class="btn btn-outline" style="font-size:11px;padding:6px 14px" href="${invitationDoc.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>عرض/تحميل</a>`
          + (invitationFullySigned
              ? `<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="sendInvitationToShareholders(${m.id})"><span class="ico-i ico-send"></span>${m.invitation_published_at ? 'إعادة إرسال الدعوة للمساهمين' : 'نشر وإرسال الدعوة للمساهمين'}</button>`
              : `<span style="font-size:11px;color:var(--gray3);align-self:center">يُفعَّل زر الإرسال بعد اكتمال التوقيعات</span>`)
        : `<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="generateAGMInvitationDoc(${m.id})"><span class="ico-i ico-edit"></span>توليد</button>`
    },
    {
      icon:"📋", title:"محضر الجمعية (رفع يدوي، PDF فقط)",
      status: m.minutes_file_url ? '<span class="file-card-status ok"><span class="ico-i ico-check"></span>مرفوع</span>' : '<span class="file-card-status muted">لم يُرفع بعد</span>',
      actions: (m.minutes_file_url ? `<a class="btn btn-outline" style="font-size:11px;padding:6px 14px" href="${m.minutes_file_url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>` : "")
        + `<label class="btn ${m.minutes_file_url?'btn-ghost':'btn-gold'}" style="font-size:11px;padding:6px 14px;cursor:pointer"><span class="ico-i ico-paperclip"></span>${m.minutes_file_url?'استبدال':'رفع ملف'}<input type="file" accept=".pdf" style="display:none" onchange="uploadMeetingFile(${m.id},'minutes_file_url',this);setTimeout(()=>openAGMDetailModal(${m.id}),400)"></label>`
        + (m.minutes_file_url ? `<button class="btn btn-ghost" style="font-size:11px;padding:6px 14px;color:var(--red)" onclick="deleteMeetingFile(${m.id},'minutes_file_url');setTimeout(()=>openAGMDetailModal(${m.id}),400)"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>` : "")
    },
    { icon:"📝", title:"توليد محضر تلقائي (PDF جاهز للتوقيع، بدون تعديل)", status:"",
      actions:`<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="generateAGMMinutesDoc(${m.id})"><span class="ico-i ico-print"></span>توليد PDF</button>` },
    { icon:"📝", title:"توليد محضر Word (مسودة قابلة للتعديل)", status:"",
      actions:`<button class="btn" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);font-size:11px;padding:6px 14px" onclick="generateAGMMinutesWordDraft(${m.id})"><span class="ico-i ico-edit"></span>توليد Word</button>` },
    { icon:"🧾", title:"محضر كشف الحضور (تلقائي من التصويت)", status:"",
      actions:`<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="generateAttendanceSheet(${m.id})"><span class="ico-i ico-print"></span>توليد</button>` },
    { icon:"🗳️", title:"محضر فرز الأصوات (تلقائي من التصويت)", status:"",
      actions:`<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="generateVoteMinutesPDF(${m.id})"><span class="ico-i ico-print"></span>توليد PDF</button>` },
    { icon:"📨", title:"إرسال الدعوة لكل المساهمين (سجل المساهمين)", status:"",
      actions:`<button class="btn btn-gold" style="font-size:11px;padding:6px 14px" onclick="sendInvitationToShareholders(${m.id})"><span class="ico-i ico-send"></span>إرسال</button>` },
    { icon:"📧", title:"إرسال تذكير بريدي لفريق الشركة", status:"",
      actions:`<button class="btn" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);font-size:11px;padding:6px 14px" onclick="sendMeetingReminderEmails(${m.id})"><span class="ico-i ico-mail"></span>إرسال</button>` },
    { icon:"📆", title:"إضافة للتقويم الشخصي", status:"",
      actions:`<button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'google',true)">Google</button>`
        + `<button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="addToCalendar(${m.id},'outlook',true)">Outlook</button>` },
    { icon:"📱", title:"مشاركة عبر واتساب", status:"",
      actions:`<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer" onclick="shareMeetingViaWhatsApp(${m.id},true)"><span class="ico-i ico-phone"></span>مشاركة</button>` },
  ];

  const agmFileCardsHTML = agmFileCards.map(c => `<div class="file-card">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="file-card-icon">${c.icon}</div>
        <div class="file-card-title">${orgEsc(c.title)}</div>
      </div>
      ${c.status ? `<div>${c.status}</div>` : ""}
      <div class="file-card-actions">${c.actions}</div>
    </div>`).join("");

  document.getElementById("agmView-files").innerHTML =
    `<div class="file-card-grid">${agmFileCardsHTML}</div>
    <div class="modal-section accent-plain" style="margin-top:16px">
      <div class="modal-section-head"><span class="ico-i ico-paperclip"></span>الوثائق الداعمة</div>
      <div class="modal-section-body">
        <div id="agmView-supdocs"></div>
        <label class="btn btn-ghost" style="font-size:11px;padding:6px 14px;cursor:pointer;margin-top:6px;display:inline-block">+ إضافة وثيقة<input type="file" style="display:none" onchange="uploadAGMSupportingDoc(${m.id},this)"></label>
      </div>
    </div>`;

  renderAGMVotingRateWidget(m.id);

  await loadAGMSupportingDocs(m.id);
  await loadAGMTopicsForModal(m.id);
  await loadElectionSection(m.id);
  await loadCheckinShareholdersDropdown();
  await loadCheckinList(m.id);
  document.getElementById("agmCheckin-shareholder").dataset.meetingId = m.id;
  openM("m-agm-view");
}

async function loadAGMSupportingDocs(meetingId){
  const box = document.getElementById("agmView-supdocs");
  if(!box) return;
  const { data, error } = await sb.from("meeting_supporting_docs").select("*").eq("meeting_id", meetingId).order("id",{ascending:false});
  if(error){ box.innerHTML = '<div style="font-size:11px;color:var(--red)">تعذّر التحميل</div>'; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد وثائق داعمة مرفوعة بعد.</div>'; return; }
  box.innerHTML = data.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px">
    <span>${orgEsc(d.document_name||"وثيقة")}</span>
    <span style="display:flex;gap:6px">
      <a class="btn-xs primary" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico ico-inbox" style="width:16px;height:16px"></span></a>
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer" onclick="deleteAGMSupportingDoc(${d.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </span>
  </div>`).join("");
}

async function uploadAGMSupportingDoc(meetingId, inputEl){
  if(!inputEl.files || !inputEl.files[0]) return;
  const file_url = await uploadFile(inputEl, "meeting-docs");
  if(!file_url) return;
  const document_name = inputEl.files[0].name;
  const { error } = await sb.from("meeting_supporting_docs").insert([{ meeting_id: meetingId, document_name, file_url, company_id: currentCompanyId }]);
  if(error){ alert("تعذّر رفع الوثيقة: " + error.message); return; }
  loadAGMSupportingDocs(meetingId);
}

async function deleteAGMSupportingDoc(docId, meetingId){
  if(!await uiConfirm("حذف هذه الوثيقة؟")) return;
  const { error } = await sb.from("meeting_supporting_docs").delete().eq("id", docId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadAGMSupportingDocs(meetingId);
}

// A general assembly's agenda must be locked once the meeting is close — changing it after
// invitations have effectively gone out undermines the whole point of prior notice. 10 days
// is used as the cutoff; inside that window, adding/removing items is blocked entirely.
function daysUntilMeeting(meetingDateStr){
  if(!meetingDateStr) return Infinity;
  const today = new Date(); today.setHours(0,0,0,0);
  const meetingDate = new Date(meetingDateStr); meetingDate.setHours(0,0,0,0);
  return Math.round((meetingDate - today) / 86400000);
}

async function loadAGMTopicsForModal(meetingId){
  const box = document.getElementById("agmView-topics");
  if(!box) return;
  const [{ data, error }, { data: m }] = await Promise.all([
    sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("sort_order",{ascending:true}).order("id",{ascending:true}),
    sb.from("meetings").select("meeting_date").eq("id", meetingId).single()
  ]);
  if(error){ box.innerHTML = '<div style="font-size:11px;color:var(--red)">تعذّر التحميل</div>'; return; }

  const daysLeft = daysUntilMeeting(m?.meeting_date);
  const locked = daysLeft < 10;
  const addRow = document.getElementById("agmView-newtopic")?.closest("div");
  if(locked){
    box.innerHTML = (data && data.length ? data.map((t,i) => `<div class="topic-row"><div class="topic-num">${i+1}</div><div class="topic-text">${orgEsc(t.topic_text)}</div></div>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد بنود.</div>')
      + `<div style="font-size:10.5px;color:var(--red);margin-top:6px"><span class="ico-i ico-shield"></span>لا يمكن تعديل البنود — تبقّى أقل من ١٠ أيام على الجمعية (${daysLeft>=0?daysLeft:0} يوم).</div>`;
    if(addRow) addRow.style.display = "none";
    return;
  }
  if(addRow) addRow.style.display = "flex";
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3);padding:6px 0">لا توجد بنود بعد — أضف أول بند بالأسفل.</div>'; return; }
  box.innerHTML = data.map((t,i) => `<div class="topic-row">
    <div class="topic-num">${i+1}</div>
    <div class="topic-text">${orgEsc(t.topic_text)}</div>
    <button class="topic-del" onclick="deleteAGMTopic(${t.id},${meetingId})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
  </div>`).join("");
}

async function addAGMTopic(){
  const input = document.getElementById("agmView-newtopic");
  const topic_text = input.value.trim();
  if(!topic_text || !currentAGMModalMeetingId) return;
  const { data: m } = await sb.from("meetings").select("meeting_date").eq("id", currentAGMModalMeetingId).single();
  if(daysUntilMeeting(m?.meeting_date) < 10){ alert("لا يمكن إضافة بنود جديدة — تبقّى أقل من ١٠ أيام على موعد الجمعية."); return; }
  const { data: existing } = await sb.from("vote_topics").select("id").eq("meeting_id", currentAGMModalMeetingId);
  const { error } = await sb.from("vote_topics").insert([{
    meeting_id: currentAGMModalMeetingId, topic_text, sort_order: (existing||[]).length, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إضافة البند: " + error.message); return; }
  input.value = "";
  loadAGMTopicsForModal(currentAGMModalMeetingId);
}

async function deleteAGMTopic(topicId, meetingId){
  const { data: m } = await sb.from("meetings").select("meeting_date").eq("id", meetingId).single();
  if(daysUntilMeeting(m?.meeting_date) < 10){ alert("لا يمكن حذف بنود — تبقّى أقل من ١٠ أيام على موعد الجمعية."); return; }
  if(!await uiConfirm("حذف هذا البند نهائيًا؟ سيُحذف معه أي أصوات مسجّلة عليه.")) return;
  const { error } = await sb.from("vote_topics").delete().eq("id", topicId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadAGMTopicsForModal(meetingId);
}

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

/* ══════════ POLICIES (governance) ══════════ */
let policiesCache = [];
const POLICY_STAGES = ["مسودة", "معتمدة من لجنة الحوكمة", "مرفوعة لمجلس الإدارة", "مرفوعة للجمعية العامة", "معتمدة نهائيًا"];

/* The stage sequence isn't one-size-fits-all: a company with no governance committee can't
   realistically pass through "معتمدة من لجنة الحوكمة", and a policy that only needs board
   sign-off shouldn't be stuck waiting on an AGM step it was never marked as needing. Both
   checks are cached per page-load in policyStageContext to avoid refetching committees on
   every single card render. */
let policyStageContext = { hasGovernanceCommittee: false, loaded: false };

async function loadPolicyStageContext(){
  const { data } = await sb.from("committees").select("committee_name,category").eq("company_id", currentCompanyId);
  policyStageContext.hasGovernanceCommittee = (data||[]).some(c => (c.committee_name||"").includes("حوكمة") || (c.category||"").includes("حوكمة"));
  policyStageContext.loaded = true;
}

function getPolicyStageSequence(policy){
  return POLICY_STAGES.filter(s => {
    if(s === "معتمدة من لجنة الحوكمة" && !policyStageContext.hasGovernanceCommittee) return false;
    if(s === "مرفوعة للجمعية العامة" && policy.approval_level !== "جمعية عامة") return false;
    return true;
  });
}

const POLICY_CATEGORY_ICONS = {
  "سياسات الجمعية العامة": "🤝",
  "سياسات ولوائح المجلس": "🏛️",
  "سياسات ولوائح اللجان": "👥",
  "سياسات الموارد البشرية": "🧑‍💼",
  "السياسات المالية": "💰",
  "سياسة المشتريات": "🛒",
  "سياسة المبيعات وخدمة العملاء": "🤝",
  "لوائح داخلية": "🗂️",
  // Categories for limited-liability companies and sole proprietorships
  "سياسات الحوكمة والصلاحيات": "🏛️",
  "السياسات التجارية والتعاقدات": "📑",
  "سياسات المشتريات": "🛒",
  "سياسات التشغيل والجودة والسلامة": "🏭",
  "السياسات المالية والمحاسبية": "💰",
  "سياسات الموارد البشرية وشؤون الموظفين": "🧑‍💼",
  "سياسات أمن المعلومات وحماية البيانات": "🔐"
};
// One shared list for limited-liability companies and sole proprietorships.
const SME_POLICY_CATEGORIES = [
  "سياسات الحوكمة والصلاحيات",
  "السياسات التجارية والتعاقدات",
  "سياسات المشتريات",
  "سياسات التشغيل والجودة والسلامة",
  "السياسات المالية والمحاسبية",
  "سياسات الموارد البشرية وشؤون الموظفين",
  "سياسات أمن المعلومات وحماية البيانات"
];
// The 4 operational categories are visually grouped under one "سياسات تشغيلية" section header
// wherever policies are displayed — they remain individually selectable leaf categories on each
// policy itself (so filtering/workflow-routing per category still works exactly as before).
const OPERATIONAL_POLICY_CATEGORIES = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];

function policyStageStepper(status, policy){
  const stages = policy ? getPolicyStageSequence(policy) : POLICY_STAGES;
  const idx = stages.indexOf(status);
  const currentIdx = idx === -1 ? 0 : idx;
  return `<div style="display:flex;align-items:center;margin:10px 0">
    ${stages.map((stage, i) => {
      const done = i < currentIdx;
      const active = i === currentIdx;
      const dotColor = done ? "var(--green)" : active ? "var(--primary)" : "var(--gray1)";
      const lineColor = i < currentIdx ? "var(--green)" : "var(--gray1)";
      return `<div style="display:flex;align-items:center;flex:${i<stages.length-1?'1':'0'}">
        <div title="${displayStageLabel(stage)}" style="width:${active?'14px':'10px'};height:${active?'14px':'10px'};border-radius:50%;background:${dotColor};${active?'box-shadow:0 0 0 4px rgba(15,33,56,0.15)':''};flex-shrink:0"></div>
        ${i<stages.length-1 ? `<div style="flex:1;height:3px;background:${lineColor};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div>
  <div style="font-size:10px;color:var(--gray3);text-align:center;font-weight:700">${displayStageLabel(status||"مسودة")}</div>`;
}

let policyActiveCategory = "الكل";
let currentCompanyPolicyDeadlineDays = 14;
async function loadPolicies(){
  const wrap = document.getElementById("policiesCards");
  const [{ data, error }, { data: companyRow }] = await Promise.all([
    sb.from("policies").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("companies").select("policy_stage_deadline_days").eq("id", currentCompanyId).single()
  ]);
  if(error){
    wrap.innerHTML = '<div style="text-align:center;color:var(--red);font-size:12px;padding:14px">تعذّر تحميل السياسات: '+error.message+'</div>';
    return;
  }
  currentCompanyPolicyDeadlineDays = companyRow?.policy_stage_deadline_days ?? 14;
  await loadPolicyStageContext();
  policiesCache = data || [];

  // Position-based visibility: مدير المشتريات only sees سياسة المشتريات, etc. Full-access
  // roles (مدير النظام / رئيس مجلس / سكرتير المجلس) and anyone with no restriction configured
  // still see everything — the restriction only kicks in once an admin has actually set it.
  const myRole = getCurrentRole();
  if(!isFullAccessRole(myRole)){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData?.user?.email;
    const { data: membership } = await sb.from("user_company_memberships").select("allowed_policy_categories")
      .eq("company_id", currentCompanyId).eq("email", myEmail).maybeSingle();
    const allowed = membership?.allowed_policy_categories;
    if(Array.isArray(allowed) && allowed.length > 0){
      policiesCache = policiesCache.filter(p => allowed.includes(p.category));
    }
  }

  renderPolicyPills();
  renderPoliciesFiltered();
}

/* Policy categories aren't one-size-fits-all: every company (regardless of type) runs HR,
   finance, procurement, and sales/customer operations, so those stay universal. Governance-
   specific categories (board/AGM/committee policies) only make sense — and only get added —
   for company types that actually have those bodies. */
function getPolicyCategoriesForCompany(){
  const operational = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];
  // Sole proprietorships and limited-liability companies (single or multiple owners/managers)
  // share one practical category list covering governance, commercial, procurement,
  // operations, finance, HR and information security.
  if(currentCompanyType === "مؤسسة فردية" || currentCompanyType === "ذات مسؤولية محدودة") return [...SME_POLICY_CATEGORIES];

  return ["سياسات الجمعية العامة", "سياسات ولوائح المجلس", "سياسات ولوائح اللجان", ...operational, "لوائح داخلية"];
}

function renderPolicyPills(){
  const box = document.getElementById("policyCategoryPills");
  if(!box) return;
  const categoryOrder = getPolicyCategoriesForCompany();
  const present = [...new Set(policiesCache.map(p => p.category || "لوائح داخلية"))];
  const cats = categoryOrder.filter(c => present.includes(c)).concat(present.filter(c => !categoryOrder.includes(c)));

  const pill = (label, key, count, icon) => {
    const active = policyActiveCategory === key;
    return `<button onclick="setPolicyCategory('${key}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'};transition:.15s">${icon?icon+' ':''}${label}${count!=null?` <span style="opacity:.75">(${count})</span>`:''}</button>`;
  };

  let html = pill("الكل", "الكل", policiesCache.length, "📚");
  cats.forEach(c => {
    const count = policiesCache.filter(p => (p.category||"لوائح داخلية")===c).length;
    html += pill(c, c, count, POLICY_CATEGORY_ICONS[c] || "📁");
  });
  box.innerHTML = html;
}

function setPolicyCategory(cat){
  policyActiveCategory = cat;
  renderPolicyPills();
  renderPoliciesFiltered();
}

function renderPoliciesFiltered(){
  loadPolicyReviewSection();
  const wrap = document.getElementById("policiesCards");
  if(!wrap) return;
  const searchEl = document.getElementById("policySearchInput");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";

  let list = policiesCache;
  if(policyActiveCategory !== "الكل") list = list.filter(p => (p.category||"لوائح داخلية") === policyActiveCategory);
  if(search) list = list.filter(p => (p.policy_name||"").toLowerCase().includes(search));

  if(policiesCache.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بعد. اضغط "+ إضافة سياسة" للبدء.</div>';
    return;
  }
  if(list.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات مطابقة لبحثك.</div>';
    return;
  }

  const statusBadge = (s) => {
    if(s === "معتمدة نهائيًا") return '<span class="badge done">معتمدة نهائيًا ✅</span>';
    if(s === "تجديد مطلوب") return '<span class="badge urgent">تجديد مطلوب</span>';
    if(s === "مسودة") return '<span class="badge pending">مسودة</span>';
    return '<span class="badge info">'+ displayStageLabel(s || "مسودة") +'</span>';
  };
  // Group the filtered policies by category so cards of the same category sit together
  const categoryOrder = getPolicyCategoriesForCompany();
  const groups = {};
  list.forEach(p => {
    const cat = p.category || "لوائح داخلية";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  const allCats = Object.keys(groups).sort((a,b)=>{
    const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b,'ar');
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });

  let html = "";
  let operationalHeaderShown = false;
  allCats.forEach(cat => {
    // Show one shared "سياسات تشغيلية" header right before the first operational sub-category
    // encountered — only makes sense when browsing everything together, not while a single
    // category pill is already selected (the category's own header covers that case).
    if(policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat) && !operationalHeaderShown){
      operationalHeaderShown = true;
      html += `<div style="display:flex;align-items:center;gap:8px;margin:30px 0 4px">
        <span style="font-size:17px">🏭</span>
        <span style="font-weight:900;font-size:15px;color:var(--dark)">سياسات تشغيلية</span>
        <span style="flex:1;height:2px;background:var(--primary);opacity:0.15"></span>
      </div>`;
    }
    const icon = POLICY_CATEGORY_ICONS[cat] || "📁";
    const indent = (policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat)) ? "padding-right:16px" : "";
    html += `<div style="display:flex;align-items:center;gap:8px;margin:22px 0 12px;${indent}">
      <span style="font-size:16px">${icon}</span>
      <span style="font-weight:900;font-size:14px;color:var(--primary)">${cat}</span>
      <span style="flex:1;height:1px;background:var(--gray1)"></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:stretch;${indent}">`;

    groups[cat].forEach(p => {
      html += `<div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-body" style="display:flex;flex-direction:column;flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="min-width:0">
              <div style="font-weight:800;font-size:13.5px;color:var(--dark);word-break:break-word">${orgEsc(p.policy_name||"")}</div>
              <div style="font-size:11px;color:var(--gray3);margin-top:2px">${orgEsc(p.policy_type||"—")}</div>
            </div>
            <div style="flex-shrink:0">${statusBadge(p.status)}</div>
          </div>
          <div style="font-size:11px;color:var(--gray3);display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">
            <span><span class="ico-i ico-upload"></span>رُفعت: ${p.submission_date||"—"}</span>
            ${p.approval_date
              ? `<span style="color:var(--green)"><span class="ico-i ico-check"></span>اعتُمدت: ${p.approval_date}</span>`
              : `<span><span class="ico-i ico-compass"></span>متوقّع: ${p.target_approval_date||"—"}</span>`}
            <span><span class="ico-i ico-refresh"></span>مراجعة: ${p.review_date||"—"}</span>
            ${p.approval_level === "جمعية عامة" ? '<span style="color:var(--gold)"><span class="ico-i ico-columns"></span>تحتاج الجمعية العامة</span>' : p.approval_level === "داخلية" ? '<span style="color:var(--gray3)"><span class="ico-i ico-clipboard"></span>داخلية</span>' : ""}
          </div>
          <div style="margin-top:auto;padding-top:10px">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${downloadBtn(p.file_url)}
              <button class="btn-xs primary" onclick="editPolicy(${p.id})"><span class="ico-i ico-edit"></span>تعديل</button>
              <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openPolicyHistoryModal(${p.id})"><span class="ico-i ico-clock"></span>السجل</button>
              <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openPolComments(${p.id})">الملاحظات <span id="polcom-n-${p.id}"></span></button>
              <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deletePolicy(${p.id})"><span class="ico-i ico-trash"></span>حذف</button>
              <button class="btn-xs gold" onclick="startPolicyGovernanceApproval(${p.id})"><span class="ico-i ico-upload"></span>بدء دورة اعتماد وتوقيع</button>
            </div>
            <div id="policy-gov-status-${p.id}" style="margin-top:6px"></div>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;
  list.forEach(p => loadPolicyApprovalStatus(p.id, `policy-gov-status-${p.id}`));
  polLoadBadges(list);
}


/* ══════════ BOARD MEMBER REVIEW ON POLICIES AT "مرفوعة لمجلس الإدارة" STAGE ══════════ */
async function loadPolicyReviewSection(){
  const card = document.getElementById("policyReviewCard");
  const box = document.getElementById("policyReviewBody");
  if(!box || !card) return;
  const role = getCurrentRole();
  const hasNoBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(role === 'مساهم' || hasNoBoard){ card.style.display = "none"; return; }
  card.style.display = "block";
  const bodyLabel = getGovernanceBodyLabel();
  setText("policyReviewTitle", `سياسات تتطلب اعتماد المجلس`);

  const pending = policiesCache.filter(p => p.status === "مرفوعة لمجلس الإدارة");
  if(pending.length===0){ box.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بانتظار اعتماد المجلس.</div>`; return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const ids = pending.map(p=>p.id);
  const { data: reviews } = await sb.from("policy_reviews").select("*").in("policy_id", ids);
  const reviewsByPolicy = {};
  (reviews||[]).forEach(rv => {
    if(!reviewsByPolicy[rv.policy_id]) reviewsByPolicy[rv.policy_id] = [];
    reviewsByPolicy[rv.policy_id].push(rv);
  });

  box.innerHTML = pending.map(p => {
    const revs = reviewsByPolicy[p.id] || [];
    const yes = revs.filter(v=>v.decision==="موافق").length;
    const no = revs.filter(v=>v.decision==="معارض").length;
    const abst = revs.filter(v=>v.decision==="متحفظ").length;
    const mine = myEmail ? revs.find(v => v.reviewer_email === myEmail) : null;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(p.policy_name||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin:4px 0 8px">${orgEsc(p.category||"")} · ${orgEsc(p.policy_type||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin-bottom:8px">آراء ${getGovernanceMemberLabel()} حتى الآن: <span style="color:var(--green)"><span class="ico-i ico-check"></span>${yes}</span> · <span style="color:var(--red)"><span class="ico-i ico-xcircle"></span>${no}</span> · <span style="color:var(--orange)"><span class="ico-i ico-warning"></span>${abst}</span></div>
      <textarea id="policy-review-notes-${p.id}" placeholder="ملاحظاتك (اختياري)" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-bottom:8px" rows="2">${orgEsc(mine ? (mine.notes||"") : "")}</textarea>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='موافق'?'900':'600'}" onclick="submitPolicyReview(${p.id},'موافق')"><span class="ico-i ico-check"></span>موافقة</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='معارض'?'900':'600'}" onclick="submitPolicyReview(${p.id},'معارض')"><span class="ico-i ico-xcircle"></span>معارض</button>
        <button class="btn-xs" style="background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='متحفظ'?'900':'600'}" onclick="submitPolicyReview(${p.id},'متحفظ')"><span class="ico-i ico-warning"></span>تحفظ</button>
      </div>
      ${mine ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">رأيك المسجّل حاليًا: ${orgEsc(mine.decision)}</div>` : ""}
    </div>`;
  }).join("");
}

async function submitPolicyReview(policyId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("policy-review-notes-"+policyId);
  const notes = notesEl ? notesEl.value.trim() : "";

  await sb.from("policy_reviews").delete().eq("policy_id", policyId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("policy_reviews").insert([{
    policy_id: policyId, reviewer_email: myEmail, reviewer_name, decision, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ رأيك: " + error.message); return; }

  await recomputePolicyStage(policyId);
  loadPolicies();
}

/* If every board member who reviewed approved unanimously, auto-advance the policy to the
   next stage. Any single objection or reservation keeps it pending at the same stage. */
/* Real timeline tracking: every stage transition (auto or manual) is logged with who and when */
async function logPolicyStageChange(policyId, fromStatus, toStatus){
  if(fromStatus === toStatus) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const changed_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : (myEmail || "النظام");
  await sb.from("policy_stage_history").insert([{ policy_id: policyId, from_status: fromStatus, to_status: toStatus, changed_by, company_id: currentCompanyId }]);
}

async function advancePolicyToStatus(policyId, currentStatus, nextStatus, policyRow){
  await sb.from("policies").update({ status: nextStatus, stage_entered_at: new Date().toISOString() }).eq("id", policyId);
  await logPolicyStageChange(policyId, currentStatus, nextStatus);
  if(nextStatus === "معتمدة نهائيًا"){
    const p = policyRow || policiesCache.find(x => x.id === policyId);
    if(p && p.file_url){
      const { data: board } = await sb.from("user_profiles").select("*").eq("company_id", currentCompanyId).or("role.ilike.%مجلس%,role.eq.مدير النظام,role.in.(مالك,ممثل المالك)");
      await sb.from("signing_documents").insert([{
        document_name: `اعتماد نهائي — ${p.policy_name}`, doc_type: "اعتماد سياسة",
        signers_total: (board||[]).length, signers_done: 0, status: "قيد التوقيع", file_url: p.file_url, company_id: currentCompanyId
      }]);
      logActivity("موافقة", "سياسة", p.policy_name, "اعتمدت نهائيًا — انتقلت تلقائيًا للتوقيع الإلكتروني");
    }
  }
}

async function recomputePolicyStage(policyId){
  const { data: revs, error } = await sb.from("policy_reviews").select("*").eq("policy_id", policyId);
  if(error || !revs || revs.length===0) return;
  const allApprove = revs.every(v => v.decision === "موافق");
  if(!allApprove) return; // stays at the current board/committee/AGM stage until unanimous approval
  const p = policiesCache.find(x => x.id === policyId);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(policyId, p.status, nextStatus, p);
}

async function deletePolicy(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه السياسة؟")) return;
  const p = policiesCache.find(x=>x.id===id);
  const { error } = await sb.from("policies").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "سياسة", p?p.policy_name:"", "");
  loadPolicies();
}

async function advancePolicyStage(id){
  if(await polBlockIfOpen(id)) return;
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(id, p.status, nextStatus, p);
  loadPolicies();
}

async function openPolicyHistoryModal(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("ph-title").textContent = "🕒 السجل الزمني — " + (p.policy_name||"");
  const box = document.getElementById("ph-timeline");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">جارِ التحميل...</div>';
  openM("m-policy-history");

  const [{ data: history }, { data: reviews }] = await Promise.all([
    sb.from("policy_stage_history").select("*").eq("policy_id", id).order("created_at",{ascending:true}),
    sb.from("policy_reviews").select("*").eq("policy_id", id).order("created_at",{ascending:true})
  ]);

  const events = [];
  (history||[]).forEach(h => events.push({
    date: h.created_at,
    text: h.from_status ? `انتقلت من "${h.from_status}" إلى "${h.to_status}"` : `أُنشئت بحالة "${h.to_status}"`,
    by: h.changed_by, type: "stage"
  }));
  (reviews||[]).forEach(r => events.push({
    date: r.created_at,
    text: `${r.reviewer_name||r.reviewer_email} — ${r.decision}${r.notes ? (' ("'+r.notes+'")') : ''}`,
    by: null, type: "review"
  }));
  events.sort((a,b) => new Date(a.date) - new Date(b.date));

  if(events.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا يوجد سجل حركة بعد لهذه السياسة.</div>';
    return;
  }
  box.innerHTML = events.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="width:8px;height:8px;border-radius:50%;background:${e.type==='stage'?'var(--primary)':'var(--gold)'};margin-top:5px;flex-shrink:0"></div>
      <div>
        <div style="font-size:12px;color:var(--dark);font-weight:600">${e.text}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${e.by?e.by+' — ':''}${new Date(e.date).toLocaleString('ar-SA-u-ca-gregory')}</div>
      </div>
    </div>`).join("");
}

function populatePolicyCategorySelect(selected){
  const sel = document.getElementById("mp-category");
  if(!sel) return;
  const cats = getPolicyCategoriesForCompany();
  sel.innerHTML = cats.map(c => `<option ${c===selected?"selected":""}>${c}</option>`).join("");
  // A policy might already be filed under a governance category the company no longer has
  // (e.g. after a company-type change) — keep it selectable so editing doesn't silently
  // reassign it to the wrong bucket.
  if(selected && !cats.includes(selected)){
    sel.insertAdjacentHTML("beforeend", `<option selected>${selected}</option>`);
  }
}

// Same principle as the category list: a company with no board and no general assembly has
// nothing for "تحتاج اعتماد مجلس الإدارة" / "تحتاج اعتماد الجمعية العامة" to actually mean —
// offering them anyway invites picking an approval level that maps to nobody real.
function getApprovalLevelsForCompany(){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(noBoard){
    const approverWord = (currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner) ? "المالك" : "المدير";
    return [
      { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
      { value: "مجلس الإدارة", label: `تحتاج اعتماد ${approverWord}` },
    ];
  }
  return [
    { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
    { value: "مجلس الإدارة", label: `تحتاج اعتماد ${getGovernanceBodyLabel()}` },
    { value: "جمعية عامة", label: "تحتاج اعتماد الجمعية العامة" },
  ];
}

function populateApprovalLevelSelect(selected){
  const sel = document.getElementById("mp-approval-level");
  if(!sel) return;
  const levels = getApprovalLevelsForCompany();
  sel.innerHTML = levels.map(l => `<option value="${l.value}" ${l.value===selected?"selected":""}>${l.label}</option>`).join("");
  if(selected && !levels.some(l=>l.value===selected)){
    sel.insertAdjacentHTML("beforeend", `<option value="${selected}" selected>${selected}</option>`);
  }
}

function editPolicy(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("mp-id").value = p.id;
  document.getElementById("mp-title-h").textContent = "✏️ تعديل السياسة";
  document.getElementById("mp-name").value = p.policy_name || "";
  document.getElementById("mp-type").value = p.policy_type || "";
  document.getElementById("mp-submission").value = p.submission_date || "";
  document.getElementById("mp-target-approval").value = p.target_approval_date || "";
  const approvalWrap = document.getElementById("mp-approval-wrap");
  if(p.approval_date){
    approvalWrap.style.display = "block";
    document.getElementById("mp-approval").value = p.approval_date;
  } else {
    approvalWrap.style.display = "none";
  }
  document.getElementById("mp-review").value = p.review_date || "";
  document.getElementById("mp-status").value = p.status || "مسودة";
  populatePolicyCategorySelect(p.category || "لوائح داخلية");
  populateApprovalLevelSelect(p.approval_level || "مجلس الإدارة");
  openM("m-policy");
}

/* ══════════ POLICY GOVERNANCE WORKFLOW (reuses the same sequential-sign engine) ══════════
   Every real policy category (the 8 in POLICY_CATEGORY_ICONS) gets its own fully independent,
   admin-configurable approval sequence — not 4 broad buckets that silently override each
   other. A policy's docType is derived directly from its own category, so what you configure
   for "سياسة المشتريات" only ever applies to سياسة المشتريات policies. */
function openPolicyWorkflowPicker(){
  const box = document.getElementById("policyWorkflowCategoryList");
  box.innerHTML = getPolicyCategoriesForCompany().map(cat => [cat, POLICY_CATEGORY_ICONS[cat] || "📁"]).map(([cat, icon]) =>
    `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px;text-align:right" onclick="closeM('m-policy-workflow-picker');openWorkflowTemplateModal('${policyCategoryToDocType(cat)}')">${icon} ${cat}</button>`
  ).join("");
  openM("m-policy-workflow-picker");
}

function policyCategoryToDocType(category){
  return "policy_" + (category || "بدون فئة");
}

function getPolicyWorkflowType(policy){
  return policyCategoryToDocType(policy.category);
}

const POLICY_WORKFLOW_LABELS = Object.fromEntries(
  Object.keys(POLICY_CATEGORY_ICONS).map(cat => [policyCategoryToDocType(cat), cat])
);

async function buildPolicyCanvasPages(policy, signaturesMap, orderedRoles){
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw(policy.policy_name || "سياسة", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(6);
  b.wrapAndDraw(getMatrixCompanyName(), { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
  b.spacer(20);

  b.wrapAndDraw(`الفئة: ${policy.category||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`النوع: ${policy.policy_type||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`تاريخ الاعتماد: ${policy.approval_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`موعد المراجعة القادمة: ${policy.review_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`مستوى الاعتماد: ${policy.approval_level||"مجلس الإدارة"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.spacer(14);
  if(policy.file_url){
    b.wrapAndDraw("📎 نص السياسة الكامل مرفق كملف منفصل عند تحميلها من المنصة — هذه الوثيقة سجل اعتماد وتوقيع رسمي، وليست بديلاً عن نص السياسة.", { font:`${10.5*b.scale}px Tajawal, Arial`, color:"#8B95A5", lineHeight:18*b.scale });
  }

  if(orderedRoles && orderedRoles.length){
    b.spacer(30);
    b.wrapAndDraw("توقيعات الاعتماد", { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
    b.spacer(16);
    await b.preloadSignatures(signaturesMap);
    orderedRoles.forEach((role) => {
      b.ensureSpace(65*b.scale);
      b.drawSigSlot(role, (signaturesMap[role]&&signaturesMap[role].name)||"", b.W/2, b.y, signaturesMap);
      b.spacer(70);
    });
  }
  return b;
}

async function startPolicyGovernanceApproval(policyId){
  if(await polBlockIfOpen(policyId)) return;
  const policy = policiesCache.find(p => p.id === policyId);
  if(!policy){ alert("تعذّر تحميل السياسة"); return; }
  const docType = getPolicyWorkflowType(policy);
  await startGovernanceApproval(docType, policyId);
}

async function loadPolicyApprovalStatus(policyId, containerId){
  const box = document.getElementById(containerId);
  if(!box) return;
  const { data: approvals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).eq("document_ref_id", policyId).order("created_at",{ascending:false}).limit(1);
  const current = (approvals||[])[0];
  if(!current){ box.innerHTML = ""; return; }
  if(current.status === "مكتملة" || current.status === "مرفوضة"){
    const isDone = current.status === "مكتملة";
    box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:700;padding:6px 12px;border-radius:20px;background:${isDone?'#E8F8EF':'#FBEAEA'};color:${isDone?'var(--green)':'var(--red)'};border:1.5px solid ${isDone?'var(--green)':'var(--red)'}"><span class="ico ico-${isDone?'check':'xcircle'}" style="width:13px;height:13px"></span>${current.status}</span>`;
    return;
  }
  const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
  const daysPassed = Math.floor((Date.now() - new Date(current.created_at).getTime()) / 86400000);
  const daysLeft = deadlineDays - daysPassed;
  const isLate = daysLeft < 0;
  const deadlineNote = isLate
    ? `<span style="font-size:10.5px;color:var(--red);font-weight:800">متأخرة ${Math.abs(daysLeft)} يوم</span>`
    : `<span style="font-size:10.5px;color:var(--gray3)">متبقٍ ${daysLeft} يوم</span>`;
  box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:800;padding:6px 12px;border-radius:20px;background:#FEF3E2;color:var(--gold);border:1.5px solid var(--gold)"><span class="ico ico-dot" style="width:11px;height:11px"></span>${current.status}</span> ${deadlineNote}`;
}

async function savePolicy(){
  const id = document.getElementById("mp-id").value;
  const policy_name = document.getElementById("mp-name").value.trim();
  const policy_type = document.getElementById("mp-type").value.trim();
  const submission_date = document.getElementById("mp-submission").value || new Date().toISOString().slice(0,10);
  const target_approval_date = document.getElementById("mp-target-approval").value || null;
  const approval_date = document.getElementById("mp-approval").value || null; // read-only field; only ever set automatically once the approval cycle completes
  const review_date = document.getElementById("mp-review").value || null;
  const status = document.getElementById("mp-status").value;
  const category = document.getElementById("mp-category").value;
  const approval_level = document.getElementById("mp-approval-level").value;
  if(!policy_name){ alert("الرجاء إدخال اسم السياسة"); return; }

  const previous = id ? policiesCache.find(x => x.id === Number(id)) : null;
  if(id && previous && previous.status !== status && status !== "مسودة" && await polBlockIfOpen(Number(id))) return;
  const fileInput = document.getElementById("mp-file");
  const file_url = await uploadFile(fileInput, "policies");

  const payload = { policy_name, policy_type, submission_date, target_approval_date, approval_date, review_date, status, category, approval_level, company_id: currentCompanyId };
  if(file_url) payload.file_url = file_url;
  if(!id || (previous && previous.status !== status)) payload.stage_entered_at = new Date().toISOString();

  const { error } = id
    ? await sb.from("policies").update(payload).eq("id", id)
    : await sb.from("policies").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  if(id && file_url){ try{ await polRegisterVersion(Number(id), file_url, previous ? previous.file_url : null); }catch(e){} }

  if(id && previous && previous.status !== status){
    await logPolicyStageChange(Number(id), previous.status, status);
  } else if(!id){
    const { data: created } = await sb.from("policies").select("id").eq("company_id", currentCompanyId).eq("policy_name", policy_name).order("id",{ascending:false}).limit(1).single();
    if(created) await logPolicyStageChange(created.id, null, status);
  }

  document.getElementById("mp-id").value = "";
  document.getElementById("mp-title-h").textContent = "🏛️ إضافة سياسة جديدة";
  document.getElementById("mp-name").value = "";
  document.getElementById("mp-type").value = "";
  document.getElementById("mp-submission").value = "";
  document.getElementById("mp-target-approval").value = "";
  document.getElementById("mp-approval").value = "";
  document.getElementById("mp-review").value = "";
  fileInput.value = "";
  closeM("m-policy");
  loadPolicies();
}

/* ══════════ GENERIC HELPERS ══════════ */
function emptyRowHTML(cols, text){
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${text}</td></tr>`;
}
function errorRowHTML(cols, msg){
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${msg}</td></tr>`;
}

/* ══════════ RISKS ══════════ */
let risksCache = [];
const RISK_IMPACT_ROW = { "عالٍ": 0, "متوسط": 1, "منخفض": 2 }; // top to bottom in the grid
function riskProbCol(p){ return p==null ? 1 : (p>=67 ? 2 : (p>=34 ? 1 : 0)); } // left→right: low/med/high (LTR grid)
function riskSeverityColor(impact, probability){
  const highImpact = impact === "عالٍ";
  const highProb = (probability||0) >= 67;
  if(highImpact && highProb) return "var(--primary)";
  if(highImpact || highProb) return "var(--gold)";
  if(impact === "منخفض" && (probability||0) < 34) return "var(--teal)";
  return "#8B6F1F";
}

/* ══════════ RISK SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const RISK_STATUS_ORDER = ["تم الاستلام","قيد التحليل","قيد المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const RISK_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "قيد التحليل":"var(--gold)", "قيد المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };

function riskLevelInfo(likelihood, impact){
  if(likelihood==null || impact==null) return { label:"—", color:"var(--gray3)" };
  const score = likelihood * impact;
  if(score >= 16) return { label:"عالٍ جداً", color:"#C0392B" };
  if(score >= 10) return { label:"عالٍ", color:"#E67E22" };
  if(score >= 5) return { label:"متوسط", color:"#F1C40F" };
  return { label:"منخفض", color:"#27AE60" };
}

async function loadRisks(){
  const grid = document.getElementById("riskServicesGrid");
  const tbody = document.getElementById("riskRequestsTbody");
  if(!grid || !tbody) return;

  const [{ data: services, error: svcErr }, { data: requests, error: reqErr }] = await Promise.all([
    sb.from("risk_service_types").select("*").order("id",{ascending:true}),
    sb.from("risk_requests").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false})
  ]);

  if(svcErr){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${svcErr.message}</div>`; }
  else if(!services || services.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد خدمات متاحة حاليًا.</div>'; }
  else {
    grid.innerHTML = services.map(s => `<div class="card" style="margin:0;display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--gray3);margin-top:6px;line-height:1.6;flex:1">${orgEsc(s.description||"")}</div>
        ${s.duration_estimate ? `<div style="font-size:11px;color:var(--primary);margin-top:8px">⏱️ ${s.duration_estimate}</div>` : ""}
        <button class="btn btn-gold" style="width:100%;margin-top:12px;font-size:11.5px" onclick="openNewRiskRequest(${s.id},'${orgEsc(s.name.replace(/'/g,""))}')">🚀 ابدأ تقييم المخاطر</button>
      </div>
    </div>`).join("");
  }

  if(reqErr){ tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);font-size:12px">${reqErr.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });
  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openRiskRequestDetail(${r.id})">
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${RISK_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openRiskRequestDetail(${r.id})">عرض</button></td>
  </tr>`).join("");
}

function openNewRiskRequest(serviceId, serviceName){
  document.getElementById("rnr-service-id").value = serviceId;
  document.getElementById("rnr-service-name").textContent = serviceName;
  document.getElementById("rnr-client-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  document.getElementById("rnr-sector").value = "";
  document.getElementById("rnr-scope").value = "";
  document.getElementById("rnr-date").value = "";
  document.getElementById("rnr-files").value = "";
  document.querySelectorAll(".rnr-risktype-chk").forEach(c=>{ c.checked = false; });
  openM("m-risk-new-request");
}

async function submitRiskRequest(){
  const service_type_id = Number(document.getElementById("rnr-service-id").value);
  const client_name = document.getElementById("rnr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("rnr-sector").value.trim();
  const scope = document.getElementById("rnr-scope").value.trim();
  const preferred_date = document.getElementById("rnr-date").value || null;
  const risk_types_needed = [...document.querySelectorAll(".rnr-risktype-chk:checked")].map(c=>c.value).join("، ");

  const filesInput = document.getElementById("rnr-files");
  const file_urls = [];
  if(filesInput.files && filesInput.files.length){
    for(const f of filesInput.files){
      const fakeInput = { files: [f] };
      const url = await uploadFile(fakeInput, "risk-requests");
      if(url) file_urls.push({ name: f.name, url });
    }
  }

  const { data: userData } = await sb.auth.getUser();
  const requested_by_email = userData && userData.user ? userData.user.email : null;

  const { error } = await sb.from("risk_requests").insert([{
    company_id: currentCompanyId, service_type_id, requested_by_email, client_name, sector, scope,
    risk_types_needed, file_urls, preferred_date, status: "تم الاستلام"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  logActivity("إنشاء", "طلب تقييم مخاطر", client_name, "");
  alert("تم إرسال طلبك بنجاح ✅ — سيتواصل معك فريق المخاطر قريبًا.");
  closeM("m-risk-new-request");
  loadRisks();
}

// A simple 5×5 likelihood × impact grid — each risk item is plotted as a small numbered marker
// in its cell, colored by severity, with a legend mapping numbers back to the risk description.
function renderRiskHeatMap(items){
  const scored = (items||[]).filter(it => it.likelihood!=null && it.impact!=null);
  if(scored.length === 0) return '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لا توجد مخاطر مقيَّمة بعد لعرضها بالمصفوفة.</div>';

  const cells = {};
  scored.forEach((it, idx) => {
    const key = `${it.likelihood}-${it.impact}`;
    if(!cells[key]) cells[key] = [];
    cells[key].push(idx+1);
  });

  let grid = '<div style="display:grid;grid-template-columns:24px repeat(5,1fr);gap:3px;direction:ltr">';
  grid += '<div></div>';
  for(let impact=1; impact<=5; impact++){ grid += `<div style="text-align:center;font-size:9px;color:var(--gray3)">${impact}</div>`; }
  for(let likelihood=5; likelihood>=1; likelihood--){
    grid += `<div style="display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gray3)">${likelihood}</div>`;
    for(let impact=1; impact<=5; impact++){
      const info = riskLevelInfo(likelihood, impact);
      const key = `${likelihood}-${impact}`;
      const markers = cells[key] || [];
      grid += `<div style="background:${info.color};min-height:40px;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:2px;padding:2px">
        ${markers.map(n=>`<span style="background:#fff;color:${info.color};font-weight:900;font-size:10px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center">${n}</span>`).join("")}
      </div>`;
    }
  }
  grid += '</div><div style="text-align:center;font-size:9px;color:var(--gray3);margin-top:4px">التأثير →</div>';

  const legend = scored.map((it,idx) => `<div style="font-size:10.5px;padding:3px 0;display:flex;gap:6px"><b>${idx+1}.</b><span>${orgEsc(it.description||"—")}</span></div>`).join("");
  return `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:220px">${grid}</div>
    <div style="flex:1;min-width:200px">${legend}</div>
  </div>`;
}

async function openRiskRequestDetail(requestId){
  const box = document.getElementById("rrd-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-risk-request-detail");

  const [{ data: r }, { data: items }, { data: messages }, { data: rating }] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_ratings").select("*").eq("request_id", requestId).limit(1)
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("rrd-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");
  const existingRating = (rating||[])[0];

  const statusIdx = RISK_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${RISK_STATUS_ORDER.slice(0,4).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<3?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?RISK_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<3 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div><div style="text-align:center;font-size:11px;font-weight:700;color:${RISK_STATUS_COLOR[r.status]}">${r.status}</div>`;

  const itemsHtml = (items||[]).length ? items.map(it => {
    const lvl = riskLevelInfo(it.likelihood, it.impact);
    return `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-size:12px;color:var(--dark);font-weight:700">${orgEsc(it.description||"")}</div>
        <span style="background:${lvl.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${lvl.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">الفئة: ${orgEsc(it.category||"—")} · المصدر: ${it.source||"—"} · الاحتمالية: ${it.likelihood??"—"}/5 · التأثير: ${it.impact??"—"}/5</div>
      ${it.treatment_plan ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>خطة المعالجة:</b> ${it.treatment_plan}</div>` : ""}
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">المسؤول: ${it.responsible_person||"—"} · الموعد المستهدف: ${it.target_close_date||"—"} · الحالة: <b style="color:${it.action_status==='مكتمل'?'var(--green)':'var(--gold)'}">${it.action_status}</b></div>
    </div>`;
  }).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد مخاطر مسجَّلة بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--primary)':'var(--offwhite)'};color:${m.sender_email===r.requested_by_email?'#fff':'var(--dark)'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const ratingHtml = (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px">⭐ تقييم الخدمة</div>
    <div class="card"><div class="card-body">
      ${existingRating ? `<div style="text-align:center;font-size:20px;color:var(--gold)">${"⭐".repeat(existingRating.rating)}</div><div style="font-size:11.5px;color:var(--gray3);text-align:center;margin-top:4px">${orgEsc(existingRating.comment||"")}</div>`
        : `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px" id="risk-rating-stars">
             ${[1,2,3,4,5].map(n=>`<span onclick="setRiskRatingValue(${n})" id="risk-star-${n}" style="font-size:24px;cursor:pointer;color:var(--gray1)">⭐</span>`).join("")}
           </div>
           <textarea class="fi" id="risk-rating-comment" rows="2" placeholder="ملاحظاتك على الخدمة (اختياري)"></textarea>
           <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="submitRiskRating(${requestId})">إرسال التقييم</button>`}
    </div></div>` : "";

  box.innerHTML = `
    ${timeline}
    <div class="sec-title" style="font-size:13px">🌡️ المصفوفة الحرارية لهذا الطلب</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>المخاطر المسجَّلة وخطط المعالجة</div>
    ${itemsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع فريق المخاطر</div>
    <div class="card"><div class="card-body">
      <div id="risk-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="risk-chat-input" placeholder="اكتب رسالتك..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendRiskMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
    ${ratingHtml}
  `;
  window.currentRiskRatingValue = 0;
}

async function sendRiskMessage(requestId){
  const input = document.getElementById("risk-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("risk_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:email, message
  }]);
  if(error){ alert("تعذّر إرسال الرسالة: " + error.message); return; }
  input.value = "";
  openRiskRequestDetail(requestId);
}

function setRiskRatingValue(n){
  window.currentRiskRatingValue = n;
  for(let i=1;i<=5;i++){ document.getElementById(`risk-star-${i}`).style.color = i<=n ? "var(--gold)" : "var(--gray1)"; }
}

async function submitRiskRating(requestId){
  const rating = window.currentRiskRatingValue || 0;
  if(!rating){ alert("الرجاء اختيار عدد النجوم"); return; }
  const comment = document.getElementById("risk-rating-comment").value.trim();
  const { error } = await sb.from("risk_ratings").insert([{ request_id: requestId, rating, comment }]);
  if(error){ alert("تعذّر إرسال التقييم: " + error.message); return; }
  alert("شكرًا لتقييمك ✅");
  openRiskRequestDetail(requestId);
}

/* ══════════ COMPLIANCE ══════════ */
let complianceCache = [];
/* ══════════ COMPLIANCE (الالتزام والامتثال) ══════════
   Built like the governance-effectiveness assessment on purpose: a history of dated assessments,
   a form where each axis lists its criteria and every criterion gets a 1-5 score, notes and a
   corrective action that can be tracked to closure, then a results summary.
   - Axes: one automatic axis (internal compliance, computed from platform data, scores are not
     editable) followed by one axis per regulating authority, built from the company's own list of
     obligations (compliance_items).
   - An assessment stores a snapshot of its axes and criteria, so changing the obligations list or the
     library later never rewrites an earlier assessment.
   - Corrective/preventive actions live in governance_actions (same executor / monitor / approver
     workflow) under axis_key 'compliance'.
   - The obligations come from a master list (compliance_library) the platform owner keeps per entity
     type, copied into each company. A copied obligation can be marked "not applicable" but not
     deleted, so the next sync does not bring it back. */
const CMP_ENTITIES = ["مساهمة مدرجة","مساهمة غير مدرجة","ذات مسؤولية محدودة","مؤسسة فردية"];
const CMP_FREQS = ["سنوي","نصف سنوي","ربع سنوي","شهري","مرة واحدة","عند الحدوث"];
const CMP_STATUSES = ["ملتزم","جارٍ","مجدول","غير ملتزم","غير منطبق"];
const CMP_STATUS_STYLE = {
  "ملتزم":["#E8F8EF","var(--green)"], "جارٍ":["#FEF3E2","var(--gold)"], "مجدول":["#F1F1F1","var(--gray3)"],
  "متأخر":["#FBEAEA","var(--red)"], "غير ملتزم":["#FBEAEA","var(--red)"], "غير منطبق":["#F1F1F1","var(--gray3)"]
};
const CMP_SCORES = { 5:"ملتزم بالكامل وبدليل", 4:"ملتزم مع ملاحظات بسيطة", 3:"التزام جزئي", 2:"التزام ضعيف", 1:"غير ملتزم" };
const CMP_SCORE_COLORS = { 1:"var(--red)", 2:"#E67E22", 3:"var(--gold)", 4:"var(--teal)", 5:"var(--green)" };
const CMP_AUTHORITIES = [
  "وزارة التجارة", "هيئة الزكاة والضريبة والجمارك", "المؤسسة العامة للتأمينات الاجتماعية",
  "وزارة الموارد البشرية والتنمية الاجتماعية", "هيئة السوق المالية", "شركة السوق المالية السعودية (تداول)",
  "الهيئة السعودية للبيانات والذكاء الاصطناعي", "الهيئة السعودية للمراجعين والمحاسبين", "الهيئة العامة للمنافسة",
  "وزارة الشؤون البلدية والقروية والإسكان", "المديرية العامة للدفاع المدني", "الغرفة التجارية", "وزارة الداخلية", "البنك المركزي السعودي"
];
let cmpMembersCache = [];
let cmpLibraryCache = [];
let cmpLibFlags = {};   // library id -> { verified, description }
let currentCmpAxes = [];

function cmpScoreColor(score){ return score == null ? "var(--gray3)" : (CMP_SCORE_COLORS[Math.round(score)] || "var(--gray3)"); }
function cmpToday(){ const t = new Date(); const p = n => String(n).padStart(2,"0"); return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`; }
function cmpIsRecurring(f){ return !!f && !["مرة واحدة","عند الحدوث"].includes(f); }
function cmpMonths(f){ return ({"سنوي":12,"نصف سنوي":6,"ربع سنوي":3,"شهري":1})[f] || 0; }
function cmpAddMonths(dateStr, add){
  let y, m, d;
  if(dateStr){ [y,m,d] = dateStr.split("-").map(Number); } else { const t = new Date(); y = t.getFullYear(); m = t.getMonth()+1; d = t.getDate(); }
  const target = new Date(Date.UTC(y, m-1+add, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0,10);
}

/* A past deadline means late — except a legacy one-off item already marked complied, whose date is
   just the day it was done. Recurring items roll their date forward when confirmed, so a past date
   on one of those really is an unconfirmed cycle. */
function complianceDerivedStatus(i){
  if(i.status === "غير منطبق") return "غير منطبق";
  if(i.due_date && i.due_date < cmpToday() && (cmpIsRecurring(i.frequency) || i.status !== "ملتزم")) return "متأخر";
  return i.status || "مجدول";
}
function complianceApplicable(items){ return (items||[]).filter(i => i.status !== "غير منطبق"); }
function complianceIsOk(i){ return complianceDerivedStatus(i) === "ملتزم"; }

function cmpAssessmentScores(a){
  const axes = (a && a.data && a.data.axes) ? a.data.axes : [];
  let all = [];
  const axisScores = axes.map(ax => {
    const sc = (ax.criteria||[]).map(c => c.score).filter(s => Number.isFinite(s));
    all = all.concat(sc);
    return { title: ax.title, icon: ax.icon, score: sc.length ? sc.reduce((x,y) => x+y, 0) / sc.length : null, scored: sc.length, total: (ax.criteria||[]).length };
  });
  return { axisScores, finalScore: all.length ? all.reduce((x,y) => x+y, 0) / all.length : null };
}
function cmpInterpretation(score){
  if(score < 2) return { label: "التزام ضعيف جداً – قصور جوهري يحتاج معالجة فورية", color: "var(--red)" };
  if(score < 3) return { label: "التزام ضعيف – يحتاج معالجة عاجلة", color: "#E67E22" };
  if(score < 4) return { label: "التزام مقبول – ملاحظات تحتاج تصحيحاً", color: "var(--gold)" };
  if(score < 4.5) return { label: "التزام جيد – ملاحظات بسيطة", color: "var(--teal)" };
  return { label: "التزام عالٍ – متميز", color: "var(--green)" };
}
async function cmpLatestAssessment(){
  try {
    const { data, error } = await sb.from("compliance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1);
    if(error) return null;
    return (data && data[0]) || null;
  } catch(e){ return null; }
}

/* The one definition of "how compliant are we" used by the dashboard and the governance reports:
   the latest assessment's overall score when there is one, otherwise the share of listed
   obligations marked as complied, so a company that has not assessed yet still shows something. */
function complianceSummary(items, assessment){
  if(assessment){
    const { finalScore } = cmpAssessmentScores(assessment);
    if(finalScore != null) return { pct: Math.round(finalScore/5*100), text: `آخر تقييم${assessment.period ? " (" + assessment.period + ")" : ""}: ${finalScore.toFixed(1)} من 5`, basis: "assessment", avg: finalScore };
  }
  const live = complianceApplicable(items);
  if(!live.length) return { pct: null, text: "لا توجد بيانات بعد", basis: "none", avg: null };
  const ok = live.filter(complianceIsOk).length;
  return { pct: Math.round(ok/live.length*100), text: `${ok} من ${live.length} بندًا ملتزم (لم يُجرَ تقييم بعد)`, basis: "status", avg: null };
}

async function cmpLoadMembers(){
  const { data: ms } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  const rows = (ms||[]).filter(m => m.role !== "مساهم");
  const emails = rows.map(r => r.email);
  const { data: profs } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameBy = {}; (profs||[]).forEach(p => { nameBy[p.email] = p.full_name; });
  cmpMembersCache = rows.map(r => ({ email: r.email, role: r.role, name: nameBy[r.email] || r.email }));
}
function cmpOwnerName(email){ if(!email) return "—"; const m = cmpMembersCache.find(x => x.email === email); return m ? m.name : email; }

/* Copies library entries this company doesn't have yet. Safe to run on every visit: it only adds
   what is missing, and a unique index on (company_id, library_id) makes a simultaneous second run
   fail harmlessly instead of duplicating. */
async function cmpSyncFromLibrary(){
  if(!currentCompanyId || !currentCompanyType) return { added: 0, first: false, missingTables: false };
  const [libRes, haveRes] = await Promise.all([
    sb.from("compliance_library").select("*").eq("is_active", true).order("sort_order",{ascending:true}).order("id",{ascending:true}),
    sb.from("compliance_items").select("library_id").eq("company_id", currentCompanyId).not("library_id","is",null)
  ]);
  if(libRes.error || haveRes.error){ console.warn("compliance sync skipped", libRes.error || haveRes.error); return { added: 0, first: false, missingTables: true }; }
  cmpLibFlags = {};
  (libRes.data||[]).forEach(l => { cmpLibFlags[l.id] = { verified: !!l.verified, description: l.description }; });
  const haveIds = new Set((haveRes.data||[]).map(x => x.library_id));
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const toAdd = (libRes.data||[]).filter(l => (l.entity_types||[]).includes(currentCompanyType) && !(l.board_only && noBoard) && !haveIds.has(l.id));
  if(!toAdd.length) return { added: 0, first: false, missingTables: false };
  const rows = toAdd.map(l => ({
    company_id: currentCompanyId, item_name: l.title, authority: l.authority, regulation_ref: l.regulation_ref,
    frequency: l.frequency, due_hint: l.due_hint, source: "library", library_id: l.id, status: "مجدول"
  }));
  const { error } = await sb.from("compliance_items").insert(rows);
  if(error){ if(error.code !== "23505") console.warn("compliance sync insert failed", error); return { added: 0, first: false, missingTables: false }; }
  return { added: rows.length, first: haveIds.size === 0, missingTables: false };
}

function cmpFillAuthorityList(){
  const dl = document.getElementById("cmp-authorities");
  if(dl) dl.innerHTML = CMP_AUTHORITIES.map(a => `<option value="${gaEsc(a)}"></option>`).join("");
}

/* ── The page: history list + action tracker ── */
function cmpShowList(){
  const f = document.getElementById("cmpFormView"), l = document.getElementById("cmpListView");
  if(f) f.style.display = "none";
  if(l) l.style.display = "block";
}

async function loadCompliance(){
  const isOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const libBtn = document.getElementById("complianceLibraryBtn");
  if(libBtn) libBtn.style.display = isOwner ? "inline-flex" : "none";
  cmpFillAuthorityList();
  cmpShowList();

  const sync = await cmpSyncFromLibrary();
  const note = document.getElementById("complianceSyncNote");
  if(note){
    if(sync.added){
      note.style.display = "block";
      note.textContent = sync.first
        ? `جُهّزت قائمة التزامات أولية (${sync.added} بنداً) حسب نوع كيان شركتكم. راجعوها من «قائمة الالتزامات» وحدّدوا المواعيد والمسؤولين، ثم ابدؤوا أول تقييم.`
        : `أُضيف ${sync.added} التزام جديد من مكتبة المنصة حسب نوع كيان شركتكم.`;
    } else if(sync.missingTables && isOwner){
      note.style.display = "block";
      note.textContent = "جداول نظام الالتزام غير مُنشأة بعد. شغّل ملف SQL الخاص بها بلوحة Supabase.";
    } else { note.style.display = "none"; }
  }

  await gaLoadAll();
  renderCmpTracker();
  await loadCmpHistory();
}

async function loadCmpHistory(){
  const tbody = document.getElementById("cmpHistoryTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("compliance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${gaEsc(error.message)}</td></tr>`; return; }
  if(!data || data.length === 0){ tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد تقييمات بعد. اضغط «+ تقييم جديد» للبدء.</td></tr>'; return; }
  tbody.innerHTML = data.map(a => {
    const { finalScore } = cmpAssessmentScores(a);
    const interp = finalScore != null ? cmpInterpretation(finalScore) : null;
    return `<tr>
      <td>${gaEsc(a.period||"—")}</td><td>${gaEsc(a.assessed_by_type||"—")}</td><td>${gaEsc(a.assessment_date||"—")}</td>
      <td>${finalScore != null ? finalScore.toFixed(1) + "/5" : "—"}</td>
      <td>${interp ? `<span style="color:${interp.color};font-weight:700;font-size:11px">${interp.label}</span>` : "—"}</td>
      <td><button class="btn-xs primary" onclick="viewCmpAssessment(${a.id})">عرض/تعديل</button></td>
    </tr>`;
  }).join("");
}

function cmpMyPending(a){ return gaMyPending(a); }

function renderCmpTracker(){
  const statsBox = document.getElementById("cmpStats"), list = document.getElementById("cmpList");
  if(!statsBox || !list) return;
  const all = (gaActionsCache||[]).filter(a => a.axis_key === "compliance");
  const closed = all.filter(a => a.status === "مغلق").length;
  const overdue = all.filter(gaIsOverdue).length;
  const mine = all.filter(a => a.status !== "مغلق" && cmpMyPending(a)).length;
  const rate = all.length ? Math.round(closed/all.length*100) : 0;
  statsBox.innerHTML = `
    <div class="kpi blue"><div class="kpi-label">إجمالي الإجراءات</div><div class="kpi-val">${all.length}</div></div>
    <div class="kpi gold"><div class="kpi-label">المطلوب مني</div><div class="kpi-val">${mine}</div></div>
    <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
    <div class="kpi green"><div class="kpi-label">نسبة الإغلاق</div><div class="kpi-val">${rate}%</div></div>`;

  const f = document.getElementById("cmp-act-filter").value;
  const rows = all.filter(a => {
    if(f === "mine") return a.status !== "مغلق" && cmpMyPending(a);
    if(f === "open") return a.status !== "مغلق";
    if(f === "overdue") return gaIsOverdue(a);
    if(f === "closed") return a.status === "مغلق";
    return true;
  });
  if(!rows.length){
    list.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${all.length ? "لا توجد إجراءات مطابقة." : "لا توجد إجراءات متابَعة بعد. من داخل أي تقييم اضغط «تتبّع كإجراء متابَع» بجانب الإجراء التصحيحي."}</div>`;
    return;
  }
  list.innerHTML = rows.map(a => {
    const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark);flex:1">${a.action_kind ? `<span style="font-size:10px;background:#E6EEF8;color:var(--primary);border-radius:10px;padding:1px 8px;margin-left:6px">${gaEsc(a.action_kind)}</span>` : ""}${gaEsc(a.action_text)}</div>
        <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(a.status)}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">الالتزام: ${gaEsc(String(a.criterion_label||a.criterion_key).replace(/^التزام:\s*/,""))}</div>
      <div style="font-size:11px;color:var(--gray3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
        <span>المنفّذ: ${gaEsc(gaName(a.executor_email))}</span><span>المراقب: ${gaEsc(gaName(a.monitor_email))}</span><span>المعتمِد: ${gaEsc(gaName(a.approver_email))}</span>
        <span>الموعد: ${a.target_date||"غير محدَّد"}</span>${gaIsOverdue(a) ? '<span style="color:var(--red);font-weight:800">متأخر</span>' : ""}
      </div>
      <button class="btn-xs ${a.status!=='مغلق' && cmpMyPending(a) ? 'gold' : 'primary'}" onclick="gaOpen(${a.id})">${a.status!=='مغلق' && cmpMyPending(a) ? 'مطلوب منك' : 'فتح'}</button>
    </div>`;
  }).join("");
}

/* The shared action workflow calls this after any change so the tracker and the per-row action
   marks here stay current when an action is advanced from the dialog it opens. */
function cmpRefreshActionsCard(){
  if(document.getElementById("cmpList")) renderCmpTracker();
  const form = document.getElementById("cmpFormView");
  if(form && form.style.display !== "none") cmpRefreshSlots();
}

/* ── Internal compliance (automatic): derived from what the platform already tracks ── */
async function cmpInternalChecks(){
  const cid = currentCompanyId, today = cmpToday();
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const fortnightAgo = new Date(Date.now() - 14*86400000).toISOString();
  const [pol, sign, assess, acts, bdec, mdec] = await Promise.all([
    sb.from("policies").select("id,review_date,status").eq("company_id", cid),
    sb.from("signing_documents").select("id,status,created_at").eq("company_id", cid),
    sb.from("governance_assessments").select("id,created_at").eq("company_id", cid).order("created_at",{ascending:false}).limit(1),
    sb.from("governance_actions").select("id,target_date,status").eq("company_id", cid).not("status","eq","مغلق").not("target_date","is",null),
    noBoard ? Promise.resolve({data:[]}) : sb.from("board_decisions").select("id,target_date,status").eq("company_id", cid).not("status","eq","منجز").not("target_date","is",null),
    currentCompanyLLCSingleManager ? sb.from("simple_decisions").select("id,target_date,status").eq("company_id", cid).eq("context","manager").not("status","eq","منجز").not("target_date","is",null) : Promise.resolve({data:[]})
  ]);
  const checks = [];
  const lateP = (pol.data||[]).filter(p => p.status === "تجديد مطلوب" || (p.review_date && p.review_date < today)).length;
  checks.push({ id: "policies", label: "مراجعة السياسات في موعدها", ok: lateP === 0, detail: lateP ? `${lateP} سياسة تجاوزت موعد مراجعتها` : "لا سياسات متأخرة المراجعة" });
  const stuck = (sign.data||[]).filter(d => d.status !== "مكتمل" && d.created_at && d.created_at < fortnightAgo).length;
  checks.push({ id: "signatures", label: "اكتمال التوقيعات", ok: stuck === 0, detail: stuck ? `${stuck} وثيقة بلا اكتمال توقيع لأكثر من 14 يوماً` : "لا وثائق معلّقة طويلاً" });
  const lateA = (acts.data||[]).filter(a => a.target_date < today).length;
  checks.push({ id: "actions", label: "الإجراءات التصحيحية", ok: lateA === 0, detail: lateA ? `${lateA} إجراء متأخر` : "لا إجراءات متأخرة" });
  if(!noBoard){
    const lateD = (bdec.data||[]).filter(d => d.target_date < today).length;
    checks.push({ id: "board_decisions", label: "تنفيذ قرارات المجلس", ok: lateD === 0, detail: lateD ? `${lateD} قرار متأخر عن موعده` : "لا قرارات متأخرة" });
  }
  if(currentCompanyLLCSingleManager){
    const lateM = (mdec.data||[]).filter(d => d.target_date < today).length;
    checks.push({ id: "manager_decisions", label: "تنفيذ قرارات المدير", ok: lateM === 0, detail: lateM ? `${lateM} قرار متأخر عن موعده` : "لا قرارات متأخرة" });
  }
  const last = (assess.data||[])[0];
  const yearAgo = new Date(Date.now() - 365*86400000).toISOString();
  const fresh = !!(last && last.created_at >= yearAgo);
  checks.push({ id: "governance_assessment", label: "تقييم فعالية الحوكمة السنوي", ok: fresh, detail: fresh ? "أُجري خلال آخر 12 شهراً" : (last ? "آخر تقييم مضى عليه أكثر من 12 شهراً" : "لم يُجرَ تقييم بعد") });
  return checks;
}

/* ── The assessment form ── */
async function cmpBuildAxes(){
  await cmpSyncFromLibrary();
  const { data } = await sb.from("compliance_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  complianceCache = data || [];
  const byAuth = {};
  complianceApplicable(complianceCache).forEach(i => { const a = i.authority || "غير محدد"; (byAuth[a] = byAuth[a] || []).push(i); });
  const checks = await cmpInternalChecks();
  const axes = [{
    key: "internal", title: "الالتزام الداخلي (آلي)", icon: "🛡️", auto: true,
    criteria: checks.map(ch => ({ key: "int_" + ch.id, label: ch.label, hint: "آلي — " + ch.detail, auto: true, score: ch.ok ? 5 : 2 }))
  }];
  Object.keys(byAuth).sort((a,b) => a.localeCompare(b, "ar")).forEach((a, k) => axes.push({
    key: "auth_" + k, title: a, icon: "🏛️",
    criteria: byAuth[a].map(i => ({ key: "i" + i.id, itemId: i.id, label: i.item_name, hint: [i.regulation_ref, i.frequency].filter(Boolean).join(" · ") }))
  }));
  return axes;
}

function cmpAssessorOptions(selected){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner || currentCompanyLLCSingleManager;
  const body = noBoard ? (currentCompanyLLCSingleManager && !currentCompanyLLCSingleOwner && currentCompanyType !== "مؤسسة فردية" ? "المدير" : "المالك") : getGovernanceBodyLabel();
  const opts = ["المراجعة الداخلية", "طرف خارجي", body];
  if(selected && !opts.includes(selected)) opts.push(selected);
  document.getElementById("cmp-assessor").innerHTML = opts.map(o => `<option>${gaEsc(o)}</option>`).join("");
  document.getElementById("cmp-assessor").value = selected || "المراجعة الداخلية";
}

async function renderCmpAxesForm(saved){
  await gaLoadAll();
  const aid = document.getElementById("cmp-id").value;
  currentCmpAxes = (saved && saved.data && saved.data.axes) ? saved.data.axes : await cmpBuildAxes();
  const box = document.getElementById("cmpAxesContainer");
  const onlyInternal = currentCmpAxes.length <= 1;
  box.innerHTML = (onlyInternal ? '<div style="background:#FEF3E2;color:var(--gold);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;margin-bottom:14px">لا توجد التزامات خارجية بعد. أضفها من «قائمة الالتزامات» ثم ابدأ تقييماً جديداً.</div>' : "") +
    currentCmpAxes.map((axis, ai) => `<div class="card" style="margin-bottom:14px">
      <div class="card-head"><span class="card-title">${axis.icon||""} ${gaEsc(axis.title)}</span></div>
      <div class="card-body">
        <table class="tbl">
          <thead><tr><th style="width:24%">الالتزام</th><th style="width:20%">درجة الالتزام (١-٥)</th><th style="width:28%">الملاحظات</th><th style="width:28%">الإجراءات التصحيحية / الاحترازية</th></tr></thead>
          <tbody>
            ${axis.criteria.map(c => {
              const col = cmpScoreColor(c.score);
              return `<tr data-axis="${ai}" data-crit="${gaEsc(c.key)}">
                <td><b style="font-size:11.5px">${gaEsc(c.label)}</b><div style="font-size:10px;color:var(--gray3);margin-top:2px">${gaEsc(c.hint||"")}</div></td>
                <td><select class="fs cmp-score-select" ${c.auto ? "disabled" : ""} style="font-size:12px;padding:6px;font-weight:700;color:${col};border-color:${col}55" onchange="this.style.color=cmpScoreColor(this.value?Number(this.value):null);this.style.borderColor=cmpScoreColor(this.value?Number(this.value):null)+'55'">
                  <option value="">—</option>
                  ${[5,4,3,2,1].map(n => `<option value="${n}" ${c.score==n ? "selected" : ""}>${n} — ${CMP_SCORES[n]}</option>`).join("")}
                </select>${c.auto ? '<div style="font-size:9.5px;color:var(--gray3);margin-top:3px">تُحتسب تلقائياً</div>' : ""}</td>
                <td><textarea class="fi cmp-notes" rows="2" style="font-size:11.5px;resize:vertical">${gaEsc(c.notes||"")}</textarea></td>
                <td><textarea class="fi cmp-actions" rows="2" style="font-size:11.5px;resize:vertical">${gaEsc(c.actions||"")}</textarea><div class="cmp-slot" data-crit="${gaEsc(c.key)}">${cmpSlotHTML(aid, c.key, c.score)}</div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`).join("");
}

function cmpSlotHTML(assessmentId, critKey, score){
  const ck = "cmp_" + critKey;
  const mine = (gaActionsCache||[]).filter(a => a.axis_key === "compliance" && a.criterion_key === ck);
  const own = assessmentId ? mine.find(a => String(a.assessment_id) === String(assessmentId)) : null;
  let html = "";
  if(own){
    const [bg,fg] = GA_STATUS_STYLE[own.status] || GA_STATUS_STYLE["لم يبدأ"];
    html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:${bg};color:${fg}">${gaEsc(own.action_kind||"متابَع")}: ${gaEsc(own.status)}</span>
      <button type="button" class="btn-xs primary" onclick="gaOpen(${own.id})">فتح</button></div>`;
  } else {
    const corrective = Number.isFinite(score) && score <= 3;
    html += `<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
      <select class="fs cmp-kind" style="margin:0;font-size:11px;padding:4px 6px;width:auto"><option ${corrective ? "selected" : ""}>تصحيحي</option><option ${corrective ? "" : "selected"}>احترازي</option></select>
      <button type="button" class="btn-xs gold" onclick="cmpCreateActionFromRow(this)"><span class="ico-i ico-check"></span>تتبّع كإجراء متابَع</button></div>`;
  }
  const prior = mine.filter(a => String(a.assessment_id) !== String(assessmentId || ""));
  if(prior.length){
    const open = prior.filter(a => a.status !== "مغلق").length;
    html += `<div style="font-size:10px;margin-top:5px;color:${open ? "var(--red)" : "var(--green)"}">إجراءات من تقييمات سابقة: ${open} مفتوح · ${prior.length - open} مغلق</div>`;
  }
  return html;
}
function cmpRefreshSlots(){
  const aid = document.getElementById("cmp-id").value;
  document.querySelectorAll(".cmp-slot").forEach(el => {
    const row = el.closest("tr");
    const v = row ? row.querySelector(".cmp-score-select").value : "";
    el.innerHTML = cmpSlotHTML(aid, el.dataset.crit, v ? Number(v) : null);
  });
}

async function cmpCreateActionFromRow(btn){
  const aid = document.getElementById("cmp-id").value;
  if(!aid){ alert("احفظ التقييم أولاً، ثم حوّل الإجراء إلى متابعة."); return; }
  const tr = btn.closest("tr");
  const text = tr.querySelector(".cmp-actions").value.trim();
  if(!text){ alert("اكتب الإجراء أولاً."); return; }
  const crit = tr.dataset.crit;
  const label = tr.querySelector("b").textContent;
  const kind = tr.querySelector(".cmp-kind").value;
  btn.disabled = true;
  const roles = await gaDefaultRoles();
  const { data, error } = await sb.from("governance_actions").insert([{
    company_id: currentCompanyId, assessment_id: Number(aid), axis_key: "compliance", criterion_key: "cmp_" + crit,
    criterion_label: "التزام: " + label, action_text: text, action_kind: kind,
    executor_email: roles.executor, monitor_email: roles.monitor, approver_email: roles.approver,
    status: "لم يبدأ", created_by: gaMyEmail()
  }]).select().single();
  btn.disabled = false;
  if(error || !data){ alert("تعذّر إنشاء الإجراء: " + (error ? error.message : "")); return; }
  await gaLog(data, null, "لم يبدأ", "إنشاء الإجراء");
  await gaLoadAll();
  cmpRefreshSlots();
  renderCmpTracker();
  gaOpen(data.id);   // open it straight away so executor, monitor, approver and the date can be set
}

function collectCmpAxesData(){
  return currentCmpAxes.map((axis, ai) => ({
    key: axis.key, title: axis.title, icon: axis.icon, auto: !!axis.auto,
    criteria: axis.criteria.map(c => {
      const row = document.querySelector(`tr[data-axis="${ai}"][data-crit="${c.key}"]`);
      const sv = row.querySelector(".cmp-score-select").value;
      return { key: c.key, itemId: c.itemId, label: c.label, hint: c.hint, auto: !!c.auto,
        score: sv ? Number(sv) : null, notes: row.querySelector(".cmp-notes").value.trim(), actions: row.querySelector(".cmp-actions").value.trim() };
    })
  }));
}

function renderCmpResultsSummary(a){
  const { axisScores, finalScore } = cmpAssessmentScores(a);
  const box = document.getElementById("cmpResultsSummary");
  if(finalScore == null){ box.style.display = "none"; return; }
  const interp = cmpInterpretation(finalScore);
  box.style.display = "block";
  box.innerHTML = `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><span class="card-title"><span class="ico-i ico-trending"></span>النتيجة النهائية</span></div>
    <div class="card-body">
      <table class="tbl">
        <thead><tr><th>المحور</th><th>الدرجة / 5</th><th>البنود المقيَّمة</th></tr></thead>
        <tbody>${axisScores.map(ax => `<tr><td>${ax.icon||""} ${gaEsc(ax.title)}</td><td style="color:${cmpScoreColor(ax.score)};font-weight:700">${ax.score != null ? ax.score.toFixed(1) : "—"}</td><td>${ax.scored} من ${ax.total}</td></tr>`).join("")}</tbody>
      </table>
      <div style="margin-top:14px;padding:14px;background:${interp.color}15;border-radius:10px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:${interp.color}">${finalScore.toFixed(1)} / 5</div>
        <div style="font-size:13px;font-weight:700;color:${interp.color};margin-top:4px">${interp.label}</div>
      </div>
    </div>
  </div>`;
}

async function openNewCmpAssessment(){
  document.getElementById("cmp-id").value = "";
  document.getElementById("cmp-period").value = "";
  document.getElementById("cmp-date").value = "";
  cmpAssessorOptions(null);
  document.getElementById("cmpFormTitle").textContent = "تقييم التزام جديد";
  await renderCmpAxesForm(null);
  document.getElementById("cmpResultsSummary").style.display = "none";
  document.getElementById("cmpListView").style.display = "none";
  document.getElementById("cmpFormView").style.display = "block";
}
function closeCmpAssessmentForm(){ cmpShowList(); loadCompliance(); }

async function viewCmpAssessment(id){
  const { data: a, error } = await sb.from("compliance_assessments").select("*").eq("id", id).single();
  if(error || !a){ alert("تعذّر تحميل التقييم"); return; }
  document.getElementById("cmp-id").value = a.id;
  document.getElementById("cmp-period").value = a.period || "";
  document.getElementById("cmp-date").value = a.assessment_date || "";
  cmpAssessorOptions(a.assessed_by_type);
  document.getElementById("cmpFormTitle").textContent = "تعديل تقييم: " + (a.period || "");
  await renderCmpAxesForm(a);
  renderCmpResultsSummary(a);
  document.getElementById("cmpListView").style.display = "none";
  document.getElementById("cmpFormView").style.display = "block";
}

async function saveCmpAssessment(){
  const period = document.getElementById("cmp-period").value.trim();
  if(!period){ alert("الرجاء إدخال الفترة محل التقييم"); return; }
  const assessment_date = document.getElementById("cmp-date").value || null;
  const assessed_by_type = document.getElementById("cmp-assessor").value;
  const axes = collectCmpAxesData();
  const { finalScore } = cmpAssessmentScores({ data: { axes } });
  const payload = { company_id: currentCompanyId, period, assessment_date, assessed_by_type, data: { axes }, final_score: finalScore };
  const id = document.getElementById("cmp-id").value;
  let error;
  if(id){
    ({ error } = await sb.from("compliance_assessments").update(payload).eq("id", id));
  } else {
    const r = await sb.from("compliance_assessments").insert([{ ...payload, created_by: gaMyEmail() }]).select("id").single();
    error = r.error;
    if(!error && r.data) document.getElementById("cmp-id").value = r.data.id;   // keep it: a second Save must update, and actions need a saved assessment
  }
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  cmpRefreshSlots();
  logActivity("إنشاء", "تقييم الالتزام", period, finalScore != null ? `النتيجة النهائية: ${finalScore.toFixed(1)}/5` : "");
  renderCmpResultsSummary({ data: { axes } });
  alert("تم حفظ التقييم بنجاح ✅");
}

/* ── The obligations list (register) ── */
async function cmpReloadRegister(){
  await cmpLoadMembers();
  const { data, error } = await sb.from("compliance_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  const tbody = document.getElementById("complianceTbody");
  if(error){ tbody.innerHTML = errorRowHTML(7, error.message); return; }
  complianceCache = data || [];
  renderComplianceTable();
}
async function openCmpRegister(){
  cmpFillAuthorityList();
  await cmpSyncFromLibrary();
  await cmpReloadRegister();
  openM("m-cmp-register");
}

function renderComplianceTable(){
  const tbody = document.getElementById("complianceTbody");
  if(!tbody) return;
  if(complianceCache.length === 0){ tbody.innerHTML = emptyRowHTML(7, 'لا توجد التزامات بعد. اضغط "+ إضافة بند".'); return; }
  const f = document.getElementById("cmp-filter") ? document.getElementById("cmp-filter").value : "";
  const rows = complianceCache.filter(i => {
    const s = complianceDerivedStatus(i);
    if(f === "late") return s === "متأخر";
    if(f === "open") return ["جارٍ","مجدول","غير ملتزم","متأخر"].includes(s);
    if(f === "ok") return s === "ملتزم";
    if(f === "na") return s === "غير منطبق";
    return true;
  });
  if(!rows.length){ tbody.innerHTML = emptyRowHTML(7, "لا توجد بنود مطابقة."); return; }
  const canManage = gaCanManage();
  tbody.innerHTML = rows.map(i => {
    const s = complianceDerivedStatus(i);
    const [bg, fg] = CMP_STATUS_STYLE[s] || CMP_STATUS_STYLE["مجدول"];
    const fromLib = i.source === "library";
    const prelim = fromLib && cmpLibFlags[i.library_id] && cmpLibFlags[i.library_id].verified === false;
    const na = s === "غير منطبق";
    return `<tr>
      <td><b>${gaEsc(i.item_name)}</b>${prelim ? ' <span title="قائمة أولية لم يراجعها مختص بعد، تحقق من المتطلبات والمهل بالنظام" style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 7px">أولية</span>' : ""}
        ${i.due_hint && !i.due_date ? `<div style="font-size:10.5px;color:var(--gold);margin-top:2px">${gaEsc(i.due_hint)}</div>` : ""}
        ${na && i.na_reason ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px">سبب عدم الانطباق: ${gaEsc(i.na_reason)}</div>` : ""}</td>
      <td>${gaEsc(i.authority||"—")}${i.regulation_ref ? `<div style="font-size:10.5px;color:var(--gray3)">${gaEsc(i.regulation_ref)}</div>` : ""}</td>
      <td style="font-size:11.5px">${gaEsc(i.frequency||"—")}</td>
      <td style="font-size:11.5px;${s==="متأخر" ? "color:var(--red);font-weight:800" : ""}">${i.due_date||'<span style="color:var(--gray3)">غير محدد</span>'}</td>
      <td style="font-size:11.5px">${gaEsc(cmpOwnerName(i.owner_email))}</td>
      <td><span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(s)}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <button class="btn-xs primary" onclick="editCompliance(${i.id})">تعديل</button>
        ${!na ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="cmpMarkDone(${i.id})"><span class="ico-i ico-check"></span>تم</button>` : ""}
        ${canManage ? `<button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer;font-size:11px" onclick="cmpToggleNA(${i.id})">${na ? "إعادة تفعيل" : "لا ينطبق"}</button>` : ""}
        ${canManage && !fromLib ? `<button class="btn-xs" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px" onclick="deleteCompliance(${i.id})">حذف</button>` : ""}
      </div></td></tr>`;
  }).join("");
}

function cmpFillOwnerSelect(selected){
  const sel = document.getElementById("mc-owner");
  sel.innerHTML = '<option value="">— غير محدَّد —</option>' + cmpMembersCache.map(m => `<option value="${gaEsc(m.email)}" ${m.email===selected?"selected":""}>${gaEsc(m.name)}</option>`).join("");
  if(selected && !cmpMembersCache.some(m => m.email === selected)) sel.insertAdjacentHTML("beforeend", `<option value="${gaEsc(selected)}" selected>${gaEsc(selected)}</option>`);
}
function cmpFillStaticSelects(){
  document.getElementById("mc-frequency").innerHTML = '<option value="">— غير محددة —</option>' + CMP_FREQS.map(f => `<option>${f}</option>`).join("");
  document.getElementById("mc-status").innerHTML = CMP_STATUSES.map(s => `<option>${s}</option>`).join("");
}
function cmpLockLibraryFields(locked){
  ["mc-item","mc-authority","mc-ref","mc-frequency"].forEach(id => { document.getElementById(id).disabled = locked; });
  document.getElementById("mc-lib-note").style.display = locked ? "block" : "none";
}

function openNewComplianceItem(){
  cmpFillAuthorityList(); cmpFillStaticSelects();
  document.getElementById("mc-id").value = "";
  document.getElementById("mc-title-h").textContent = "إضافة بند التزام";
  ["mc-item","mc-authority","mc-ref","mc-duedate","mc-evidence"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("mc-frequency").value = "";
  document.getElementById("mc-status").value = "مجدول";
  document.getElementById("mc-hint-row").style.display = "none";
  document.getElementById("mc-desc-row").style.display = "none";
  cmpFillOwnerSelect(null);
  cmpLockLibraryFields(false);
  openM("m-compliance");
}

function editCompliance(id){
  const c = complianceCache.find(x => x.id === id);
  if(!c) return;
  cmpFillAuthorityList(); cmpFillStaticSelects();
  document.getElementById("mc-id").value = c.id;
  document.getElementById("mc-title-h").textContent = "تعديل بند الالتزام";
  document.getElementById("mc-item").value = c.item_name || "";
  document.getElementById("mc-authority").value = c.authority || "";
  document.getElementById("mc-ref").value = c.regulation_ref || "";
  document.getElementById("mc-frequency").value = c.frequency || "";
  document.getElementById("mc-duedate").value = c.due_date || "";
  document.getElementById("mc-status").value = CMP_STATUSES.includes(c.status) ? c.status : "مجدول";
  document.getElementById("mc-evidence").value = c.evidence_note || "";
  document.getElementById("mc-hint-row").style.display = c.due_hint ? "block" : "none";
  document.getElementById("mc-hint").textContent = c.due_hint || "";
  const desc = c.library_id && cmpLibFlags[c.library_id] ? cmpLibFlags[c.library_id].description : null;
  document.getElementById("mc-desc-row").style.display = desc ? "block" : "none";
  document.getElementById("mc-desc").textContent = desc || "";
  cmpFillOwnerSelect(c.owner_email);
  cmpLockLibraryFields(c.source === "library");
  openM("m-compliance");
}

async function saveCompliance(){
  const id = document.getElementById("mc-id").value;
  const existing = id ? complianceCache.find(x => x.id === Number(id)) : null;
  const fromLib = !!(existing && existing.source === "library");
  const item_name = document.getElementById("mc-item").value.trim();
  if(!item_name){ alert("الرجاء إدخال اسم البند"); return; }
  const payload = {
    due_date: document.getElementById("mc-duedate").value || null,
    owner_email: document.getElementById("mc-owner").value || null,
    status: document.getElementById("mc-status").value,
    evidence_note: document.getElementById("mc-evidence").value.trim() || null
  };
  if(!fromLib){
    payload.item_name = item_name;
    payload.authority = document.getElementById("mc-authority").value.trim();
    payload.regulation_ref = document.getElementById("mc-ref").value.trim() || null;
    payload.frequency = document.getElementById("mc-frequency").value || null;
  }
  const { error } = id
    ? await sb.from("compliance_items").update(payload).eq("id", id)
    : await sb.from("compliance_items").insert([{ ...payload, company_id: currentCompanyId, source: "manual" }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-compliance"); cmpReloadRegister();
}

async function cmpMarkDone(id){
  const i = complianceCache.find(x => x.id === id);
  if(!i) return;
  const rec = cmpIsRecurring(i.frequency);
  if(!await uiConfirm(rec ? "تأكيد تنفيذ هذه الدورة؟ سيُرحَّل الموعد تلقائياً للدورة القادمة." : "تأكيد الالتزام بهذا البند؟")) return;
  const today = cmpToday();
  const upd = { status: "ملتزم", last_done_at: today };
  if(rec){
    const step = cmpMonths(i.frequency);
    let next = cmpAddMonths(i.due_date || today, step), guard = 0;
    while(next <= today && guard++ < 60) next = cmpAddMonths(next, step);
    upd.due_date = next;
  } else { upd.due_date = null; }
  const { error } = await sb.from("compliance_items").update(upd).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تأكيد التزام", "التزام", i.item_name, rec ? `الموعد القادم ${upd.due_date}` : "");
  cmpReloadRegister();
}

async function cmpToggleNA(id){
  const i = complianceCache.find(x => x.id === id);
  if(!i || !gaCanManage()) return;
  let upd;
  if(i.status === "غير منطبق"){ upd = { status: "مجدول", na_reason: null }; }
  else {
    const reason = await uiPrompt(`لماذا لا ينطبق "${i.item_name}" على شركتكم؟ (يُحفظ كسبب للمراجعة)`);
    if(reason === null) return;
    if(!reason.trim()){ alert("اكتب سبباً مختصراً."); return; }
    upd = { status: "غير منطبق", na_reason: reason.trim() };
  }
  const { error } = await sb.from("compliance_items").update(upd).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  cmpReloadRegister();
}

async function deleteCompliance(id){
  const i = complianceCache.find(x => x.id === id);
  if(i && i.source === "library"){ alert("هذا البند من مكتبة المنصة ولا يُحذف. استخدم «لا ينطبق» مع ذكر السبب."); return; }
  if(!await uiConfirm("هل أنت متأكد من حذف هذا البند؟")) return;
  const { error } = await sb.from("compliance_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  cmpReloadRegister();
}

/* ── Platform owner: the master library ── */
async function openCmpLibrary(){ cmpFillAuthorityList(); await cmpLoadLibrary(); openM("m-cmplib"); }

async function cmpLoadLibrary(){
  const list = document.getElementById("cmplib-list");
  const { data, error } = await sb.from("compliance_library").select("*").order("sort_order",{ascending:true}).order("id",{ascending:true});
  if(error){ list.innerHTML = '<div style="color:var(--red);font-size:12px">جداول المكتبة غير مُنشأة بعد. شغّل ملفي HWKM-compliance-setup.sql ثم HWKM-compliance-v2.sql ثم أعد المحاولة.</div>'; return; }
  cmpLibraryCache = data || [];
  if(!cmpLibraryCache.length){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">المكتبة فارغة. شغّل ملف HWKM-compliance-v2.sql لإضافة القائمة الأولية، أو أضف التزاماً، أو استورد دفعة.</div>'; return; }
  const unver = cmpLibraryCache.filter(l => !l.verified).length;
  const short = { "مساهمة مدرجة":"مدرجة", "مساهمة غير مدرجة":"غير مدرجة", "ذات مسؤولية محدودة":"ذ.م.م", "مؤسسة فردية":"فردية" };
  list.innerHTML = `<div style="font-size:11.5px;color:var(--gray3);margin-bottom:8px">${cmpLibraryCache.length} التزاماً · <b style="color:${unver ? "var(--gold)" : "var(--green)"}">${unver} غير مراجَع</b></div>` +
    cmpLibraryCache.map(l => `<div style="border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:${l.is_active ? "#fff" : "var(--offwhite)"};opacity:${l.is_active ? 1 : 0.7}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark)">${gaEsc(l.title)}</div>
        <div style="font-size:11px;color:var(--gray3);margin-top:2px">${gaEsc(l.authority||"—")}${l.regulation_ref ? " · " + gaEsc(l.regulation_ref) : ""} · ${gaEsc(l.frequency||"")}</div>
        <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${(l.entity_types||[]).map(t => `<span style="font-size:9.5px;background:#E6EEF8;color:var(--primary);border-radius:10px;padding:1px 8px">${gaEsc(short[t]||t)}</span>`).join("")}${l.board_only ? '<span style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 8px">للمجلس فقط</span>' : ""}${l.verified ? '<span style="font-size:9.5px;background:#E8F8EF;color:var(--green);border-radius:10px;padding:1px 8px">مراجَع</span>' : '<span style="font-size:9.5px;background:#FEF3E2;color:var(--gold);border-radius:10px;padding:1px 8px">غير مراجَع</span>'}${l.is_active ? "" : '<span style="font-size:9.5px;background:#F1F1F1;color:var(--gray3);border-radius:10px;padding:1px 8px">موقوف</span>'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openCmpLibEdit(${l.id})">تعديل</button>
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="toggleCmpLibVerified(${l.id})">${l.verified ? "إلغاء المراجعة" : "تعليم كمراجَع"}</button>
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="toggleCmpLibActive(${l.id})">${l.is_active ? "إيقاف" : "تفعيل"}</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteCmpLibEntry(${l.id})">حذف</button>
      </div>
    </div></div>`).join("");
}

function openCmpLibEdit(id){
  const l = id ? cmpLibraryCache.find(x => x.id === id) : null;
  document.getElementById("cl-freq").innerHTML = CMP_FREQS.map(f => `<option>${f}</option>`).join("");
  document.getElementById("cl-types").innerHTML = CMP_ENTITIES.map((t,k) => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:12px"><input type="checkbox" id="cl-t-${k}" style="width:14px;height:14px" ${l && (l.entity_types||[]).includes(t) ? "checked" : ""}/>${t}</label>`).join("");
  document.getElementById("cl-id").value = l ? l.id : "";
  document.getElementById("cl-title-h").textContent = l ? "تعديل التزام بالمكتبة" : "إضافة التزام للمكتبة";
  document.getElementById("cl-title").value = l ? l.title : "";
  document.getElementById("cl-authority").value = l ? (l.authority||"") : "";
  document.getElementById("cl-ref").value = l ? (l.regulation_ref||"") : "";
  document.getElementById("cl-freq").value = l ? l.frequency : "سنوي";
  document.getElementById("cl-hint").value = l ? (l.due_hint||"") : "";
  document.getElementById("cl-desc").value = l ? (l.description||"") : "";
  document.getElementById("cl-boardonly").checked = l ? !!l.board_only : false;
  document.getElementById("cl-active").checked = l ? !!l.is_active : true;
  document.getElementById("cl-verified").checked = l ? !!l.verified : false;
  openM("m-cmplib-edit");
}

async function saveCmpLibEntry(){
  const id = document.getElementById("cl-id").value;
  const title = document.getElementById("cl-title").value.trim();
  if(!title){ alert("العنوان مطلوب"); return; }
  const entity_types = CMP_ENTITIES.filter((t,k) => document.getElementById("cl-t-"+k).checked);
  if(!entity_types.length){ alert("اختر نوع كيان واحداً على الأقل"); return; }
  const payload = {
    title, authority: document.getElementById("cl-authority").value.trim() || null, regulation_ref: document.getElementById("cl-ref").value.trim() || null,
    frequency: document.getElementById("cl-freq").value, due_hint: document.getElementById("cl-hint").value.trim() || null,
    description: document.getElementById("cl-desc").value.trim() || null, entity_types,
    board_only: document.getElementById("cl-boardonly").checked, is_active: document.getElementById("cl-active").checked,
    verified: document.getElementById("cl-verified").checked
  };
  const { error } = id ? await sb.from("compliance_library").update(payload).eq("id", id) : await sb.from("compliance_library").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-cmplib-edit"); cmpLoadLibrary();
}

async function toggleCmpLibActive(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l) return;
  const { error } = await sb.from("compliance_library").update({ is_active: !l.is_active }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  cmpLoadLibrary();
}
async function toggleCmpLibVerified(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l) return;
  const { error } = await sb.from("compliance_library").update({ verified: !l.verified }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  cmpLoadLibrary();
}

async function deleteCmpLibEntry(id){
  const l = cmpLibraryCache.find(x => x.id === id);
  if(!l || !await uiConfirm(`حذف "${l.title}" من المكتبة؟\nنسخ الشركات التي استلمته تبقى عندها. الأفضل «إيقاف» لو تريد فقط منع وصوله لشركات جديدة.`)) return;
  const { error } = await sb.from("compliance_library").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  cmpLoadLibrary();
}

function toggleCmpImport(){ const b = document.getElementById("cmplib-import"); b.style.display = b.style.display === "none" ? "block" : "none"; }

function cmpNormFreq(s){
  s = (s||"").trim();
  if(s.includes("نصف")) return "نصف سنوي";
  if(s.includes("ربع")) return "ربع سنوي";
  if(s.includes("شهر")) return "شهري";
  if(s.includes("مرة")) return "مرة واحدة";
  if(s.includes("حدوث") || s.includes("عند")) return "عند الحدوث";
  return "سنوي";
}
function cmpParseTypes(s){
  s = (s||"").trim();
  if(!s || s.includes("الكل")) return CMP_ENTITIES.slice();
  const out = new Set();
  s.split(/[،,\/]/).forEach(tok => {
    tok = tok.trim();
    if(!tok) return;
    if(tok.includes("غير") && tok.includes("مدرج")) out.add("مساهمة غير مدرجة");
    else if(tok.includes("مدرج")) out.add("مساهمة مدرجة");
    else if(tok.includes("محدود") || tok.includes("ذات") || tok.includes("ذ.م.م")) out.add("ذات مسؤولية محدودة");
    else if(tok.includes("فردي")) out.add("مؤسسة فردية");
  });
  return Array.from(out);
}
function cmpParseImportText(text){
  const rows = [], bad = [];
  text.split("\n").forEach((line, n) => {
    if(!line.trim()) return;
    const p = line.split("|").map(x => x.trim());
    const types = cmpParseTypes(p[4]);
    if(!p[0] || !types.length){ bad.push(n+1); return; }
    rows.push({ title: p[0], authority: p[1]||null, regulation_ref: p[2]||null, frequency: cmpNormFreq(p[3]), entity_types: types, due_hint: p[5]||null, is_active: true, board_only: false, verified: false });
  });
  return { rows, bad };
}
async function importCmpLibrary(){
  const out = document.getElementById("cmplib-import-result");
  const { rows, bad } = cmpParseImportText(document.getElementById("cmplib-import-text").value);
  if(!rows.length){ out.textContent = "لا أسطر صالحة."; return; }
  const { error } = await sb.from("compliance_library").insert(rows);
  if(error){ out.textContent = "تعذّر الاستيراد: " + error.message; return; }
  out.textContent = `أُضيف ${rows.length}` + (bad.length ? ` — تُجوهلت الأسطر: ${bad.join("، ")}` : "");
  document.getElementById("cmplib-import-text").value = "";
  cmpLoadLibrary();
}

