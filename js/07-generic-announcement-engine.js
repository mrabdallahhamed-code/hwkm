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

