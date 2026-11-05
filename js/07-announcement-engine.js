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
