/* ══════════ CMA BOARD MEMBER DISCLOSURE FORM ══════════
   The 22 compliance survey questions are near-identical in structure (yes/no + a conditional
   details table when "yes") — defined as data and rendered/parsed in a loop instead of writing
   22 nearly-duplicate blocks by hand, which is what makes a form this size manageable. */
const DISCLOSURE_SURVEY_QUESTIONS = [
  { key:"a", label:"أ- هل تملك أو يملك أحد أقاربك ما نسبته خمسة في المئة أو أكثر من أسهم الشركة أو أي شركة من مجموعتها؟", cols:["اسم الشركة","نسبة الملكية"] },
  { key:"b", label:"ب- هل أنت من كبار التنفيذيين خلال العامين الماضيين في الشركة أو في أي شركة من مجموعتها؟", cols:["اسم الشركة","المنصب التنفيذي"] },
  { key:"c", label:"ج- هل توجد لك صلة قرابة بأي من أعضاء مجلس الإدارة أو كبار التنفيذيين في الشركة أو في أي شركة من مجموعتها؟", cols:["اسم القريب ومنصبه","اسم الشركة"] },
  { key:"d", label:"د- هل أنت عضو في مجلس إدارة أو مجلس مديري أي شركة من ضمن مجموعة الشركة؟", cols:["اسم الشركة والتفاصيل"] },
  { key:"e", label:"هـ- هل كنت موظفًا خلال العامين الماضيين لدى الشركة أو شركة أخرى من مجموعتها أو مالكًا لحصص سيطرة أو طرفًا متعاملًا معها؟", cols:["اسم الشركة","اسم الطرف المرتبط","نوع الوظيفة","نسبة الملكية"] },
  { key:"f", label:"و- هل تتقاضى مبالغ مالية من الشركة علاوة على مكافأة العضوية تزيد عن (200,000) ريال أو 50% من مكافأة العام السابق؟", cols:[] },
  { key:"g", label:"ز- هل يوجد لك أي مصلحة مباشرة أو غير مباشرة في الأعمال والعقود التي تتم لحساب الشركة؟", cols:["طبيعة الأعمال والعقود","تاريخ البداية والمدة","القيمة"] },
  { key:"h", label:"ح- هل أنت أو أي من أقاربك عضو في مجلس إدارة أو من كبار تنفيذيي شركة لديها أعمال أو عقود مع الشركة؟", cols:["اسم الشركة","طبيعة الأعمال والعقود","المدة","القيمة"] },
  { key:"i", label:"ط- هل تملك أو تدير أو تشارك في ملكية أو إدارة منشأة لديها أعمال أو عقود مع الشركة؟", cols:["اسم المنشأة","طبيعة الأعمال والعقود","المدة","القيمة"] },
  { key:"j", label:"ي- هل تشارك في أي عمل من شأنه منافسة الشركة أو أي شركة من مجموعتها؟", cols:["اسم الشركة","طبيعة النشاط المنافس"] },
  { key:"k", label:"ك- هل أنت عضو في مجلس إدارة أو من كبار تنفيذيي شركة تشارك في عمل ينافس الشركة؟", cols:["اسم الشركة/المنشأة","طبيعة النشاط المنافس"] },
  { key:"l", label:"ل- هل تملك أو تشارك في ملكية منشأة تشارك في عمل ينافس الشركة؟", cols:["اسم المنشأة","طبيعة النشاط المنافس"] },
  { key:"m", label:"م- هل يوجد أي دعاوى مسؤولية في مواجهتك مرفوعة من قبل الشركة أو أي شركة من مجموعتها؟", cols:["التفاصيل"] },
  { key:"n", label:"ن- هل يوجد أي دعاوى أو شكاوى مرفوعة من قبلك على الشركة أو أي شركة من مجموعتها؟", cols:["التفاصيل"] },
  { key:"o", label:"س- هل هناك أي أحكام غير منفذة صادرة بحقك تكون الشركة طرفًا فيها؟", cols:["التفاصيل"] },
  { key:"p", label:"ع- هل أنت على علم بأي دعاوى أو تحقيق أو إجراء رسمي موجه ضدك؟", cols:["التفاصيل"] },
  { key:"q", label:"ف- هل سبق أن أُشهر إفلاسك في أي وقت داخل أو خارج المملكة؟", cols:["التفاصيل"] },
  { key:"r", label:"ص- هل سبق أن تمت التصفية الإجبارية لأي شركة كنت في مجلس إدارتها؟", cols:["التفاصيل"] },
  { key:"s", label:"ق- هل سبق أن تم منعك من العمل في أي شركة مساهمة بقرار من جهة قضائية؟", cols:["التفاصيل"] },
  { key:"t", label:"ر- هل سبق أن تم عزلك من عضوية مجلس إدارة أو لجنة أي شركة؟", cols:["التفاصيل"] },
  { key:"u", label:"ش- هل سبق وأن تمت إدانتك بسبب الاحتيال أو خيانة الأمانة أو غسل الأموال؟", cols:["التفاصيل"] },
  { key:"v", label:"ت- هل سبق لأي جهة قضائية إصدار حكم بعدم أهليتك لعضوية مجلس إدارة شركة؟", cols:["التفاصيل"] },
];

let disclosureDraft = { qualifications:[], experience:[], other_memberships:[], survey_answers:{} };

function addDisclosureRow(section){
  const templates = {
    qualifications: { degree:"", major:"", date:"", institution:"" },
    experience: { period:"", field:"" },
    other_memberships: { company_name:"", activity:"", capacity:"", appointment_method:"", committee:"", legal_form:"" }
  };
  disclosureDraft[section].push({ ...templates[section] });
  renderDisclosureTable(section);
}

function removeDisclosureRow(section, idx){
  disclosureDraft[section].splice(idx,1);
  renderDisclosureTable(section);
}

const DISCLOSURE_TABLE_FIELDS = {
  qualifications: [["degree","المؤهل"],["major","التخصص"],["date","تاريخ الحصول",'date'],["institution","الجهة المانحة"]],
  experience: [["period","الفترة"],["field","مجالات الخبرة"]],
  other_memberships: [["company_name","اسم الشركة"],["activity","النشاط الرئيس"],["capacity","صفة العضوية"],["appointment_method","طريقة التعيين"],["committee","اللجنة"],["legal_form","الشكل القانوني"]]
};

function renderDisclosureTable(section){
  const box = document.getElementById(`df-${section === 'other_memberships' ? 'memberships' : section}-list`);
  const fields = DISCLOSURE_TABLE_FIELDS[section];
  box.innerHTML = disclosureDraft[section].map((row, i) => `<div style="background:var(--offwhite);border-radius:8px;padding:8px;margin-bottom:6px">
    <div style="display:grid;grid-template-columns:repeat(${fields.length},1fr);gap:6px">
      ${fields.map(([key,label,type]) => `<input class="fi" style="margin:0;font-size:11px" type="${type||'text'}" placeholder="${label}" value="${row[key]||''}" onchange="disclosureDraft['${section}'][${i}]['${key}']=this.value"/>`).join("")}
    </div>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;margin-top:6px" onclick="removeDisclosureRow('${section}',${i})">حذف</button>
  </div>`).join("");
}

function toggleDisclosureNominator(){
  const isNominated = document.getElementById("df-appointment-nature").value === "معين من قبل مساهم";
  document.getElementById("df-nominator-field").style.display = isNominated ? "block" : "none";
}

function renderDisclosureSurvey(){
  const box = document.getElementById("df-survey-list");
  box.innerHTML = DISCLOSURE_SURVEY_QUESTIONS.map((q, qi) => {
    const ans = disclosureDraft.survey_answers[q.key]; // undefined = not yet answered, on purpose
    const isAnswered = ans !== undefined;
    const isYes = isAnswered && ans.answer === true;
    const isNo = isAnswered && ans.answer === false;
    return `<div style="background:#fff;border:1.5px solid ${isAnswered?'var(--gray1)':'var(--red)'};border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px">
        <span style="background:var(--primary);color:#fff;font-weight:800;font-size:10.5px;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${qi+1}</span>
        <span style="font-size:12px;font-weight:700;line-height:1.6">${q.label}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding-right:30px">
        <span style="font-size:11px;color:var(--gray3);font-weight:700">الإجابة:</span>
        <button type="button" onclick="setDisclosureAnswer('${q.key}',true)" style="flex:0 0 auto;padding:6px 20px;border-radius:8px;border:2px solid ${isYes?'var(--green)':'var(--gray1)'};background:${isYes?'#E8F8EF':'#fff'};color:${isYes?'var(--green)':'var(--gray3)'};font-weight:800;font-size:12px;cursor:pointer">نعم</button>
        <button type="button" onclick="setDisclosureAnswer('${q.key}',false)" style="flex:0 0 auto;padding:6px 20px;border-radius:8px;border:2px solid ${isNo?'var(--red)':'var(--gray1)'};background:${isNo?'#FDE8E8':'#fff'};color:${isNo?'var(--red)':'var(--gray3)'};font-weight:800;font-size:12px;cursor:pointer">لا</button>
        ${!isAnswered ? '<span style="font-size:10.5px;color:var(--red);font-weight:700"><span class="ico-i ico-warning"></span>لم تتم الإجابة بعد</span>' : ''}
      </div>
      <div id="df-survey-details-${q.key}" style="margin-top:8px;padding-right:30px;display:${isYes&&q.cols.length?'block':'none'}">
        <div style="font-size:10.5px;color:var(--gray3);font-weight:700;margin-bottom:4px">توضيح الإجابة:</div>
        ${q.cols.length ? renderSurveyDetailRows(q.key, q.cols) : ""}
      </div>
    </div>`;
  }).join("");
}

function renderSurveyDetailRows(key, cols){
  const ans = disclosureDraft.survey_answers[key] || { answer:false, details:[] };
  const rows = ans.details && ans.details.length ? ans.details : [cols.map(()=>"")];
  return rows.map((row,i) => `<div style="display:grid;grid-template-columns:repeat(${cols.length},1fr);gap:6px;margin-bottom:4px">
    ${cols.map((c,ci) => `<input class="fi" style="margin:0;font-size:10.5px" placeholder="${c}" value="${row[ci]||''}" onchange="updateSurveyDetail('${key}',${i},${ci},this.value)"/>`).join("")}
  </div>`).join("") + `<button class="btn-xs primary" style="margin-top:2px" onclick="addSurveyDetailRow('${key}',${cols.length})">+ إضافة سطر</button>`;
}

function setDisclosureAnswer(key, isYes){
  const existing = disclosureDraft.survey_answers[key];
  disclosureDraft.survey_answers[key] = { answer: isYes, details: (existing && existing.details) || [] };
  renderDisclosureSurvey();
}
function addSurveyDetailRow(key, numCols){
  disclosureDraft.survey_answers[key].details.push(new Array(numCols).fill(""));
  renderDisclosureSurvey();
}
function updateSurveyDetail(key, rowIdx, colIdx, val){
  disclosureDraft.survey_answers[key].details[rowIdx][colIdx] = val;
}

async function openDisclosureForm(){
  disclosureDraft = { qualifications:[], experience:[], other_memberships:[], survey_answers:{} };
  document.getElementById("df-nominator-field").style.display = "none";
  ['df-fullname','df-nid','df-address','df-employer','df-jobtitle','df-email','df-mobile','df-nominator-name'].forEach(id => document.getElementById(id).value = "");
  ['df-birthdate','df-term-start','df-term-end'].forEach(id => document.getElementById(id).value = "");

  // If this person already has a disclosure on file, load it as the starting point — editing
  // and resubmitting always creates a NEW version rather than mutating a signed record, so the
  // old signed disclosure stays intact as a historical entry while a fresh cycle begins.
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;
  let previous = null;
  if(myEmail && currentCompanyId){
    const { data } = await sb.from("board_disclosure_forms").select("*")
      .eq("company_id", currentCompanyId).eq("member_email", myEmail).order("created_at",{ascending:false}).limit(1);
    previous = (data||[])[0] || null;
  }

  const banner = document.querySelector("#m-disclosure-form p");
  if(previous){
    banner.innerHTML = `📝 لديك إفصاح سابق بتاريخ ${new Date(previous.created_at).toLocaleDateString('ar-SA-u-ca-gregory')} — الحالة: <b>${previous.status}</b>. عدّل ما يلزم أدناه ثم أرسل — سيُنشأ إفصاح جديد يحل محله للتوقيع، والسابق يبقى بالسجل.`;
    document.getElementById("df-capacity").value = previous.membership_capacity || "عضو تنفيذي";
    document.getElementById("df-appointment-nature").value = previous.appointment_nature || "مرشح بصفته مساهماً";
    document.getElementById("df-nominator-name").value = previous.nominating_shareholder_name || "";
    document.getElementById("df-term-start").value = previous.term_start || "";
    document.getElementById("df-term-end").value = previous.term_end || "";
    document.getElementById("df-fullname").value = previous.full_name || "";
    document.getElementById("df-nid").value = previous.national_id || "";
    document.getElementById("df-nationality").value = previous.nationality || "سعودي";
    document.getElementById("df-birthdate").value = previous.birth_date || "";
    document.getElementById("df-gender").value = previous.gender || "ذكر";
    document.getElementById("df-address").value = previous.national_address || "";
    document.getElementById("df-employer").value = previous.current_employer || "";
    document.getElementById("df-jobtitle").value = previous.job_title || "";
    document.getElementById("df-email").value = previous.personal_email || "";
    document.getElementById("df-mobile").value = previous.mobile || "";
    document.getElementById("df-is-shareholder").value = previous.is_shareholder ? "نعم" : "لا";
    disclosureDraft.qualifications = previous.qualifications || [];
    disclosureDraft.experience = previous.experience || [];
    disclosureDraft.other_memberships = previous.other_memberships || [];
    disclosureDraft.survey_answers = previous.survey_answers || {};
    toggleDisclosureNominator();
  } else {
    banner.textContent = 'يُملأ من العضو المرشّح، ويُرفع قبل ٣ أيام عمل من الجمعية العامة.';
    if(currentUserProfile){
      document.getElementById("df-fullname").value = currentUserProfile.full_name || "";
      document.getElementById("df-nid").value = currentUserProfile.national_id || "";
      document.getElementById("df-email").value = currentUserProfile.email || "";
      document.getElementById("df-mobile").value = currentUserProfile.phone_number || "";
    }
  }

  renderDisclosureTable('qualifications');
  renderDisclosureTable('experience');
  renderDisclosureTable('other_memberships');
  renderDisclosureSurvey();
  openM("m-disclosure-form");
}

async function submitDisclosureForm(){
  const { data: userData } = await sb.auth.getUser();
  const member_email = userData?.user?.email;
  const payload = {
    company_id: currentCompanyId, member_email,
    membership_capacity: document.getElementById("df-capacity").value,
    appointment_nature: document.getElementById("df-appointment-nature").value,
    nominating_shareholder_name: document.getElementById("df-nominator-name").value,
    term_start: document.getElementById("df-term-start").value || null,
    term_end: document.getElementById("df-term-end").value || null,
    full_name: document.getElementById("df-fullname").value,
    national_id: document.getElementById("df-nid").value,
    nationality: document.getElementById("df-nationality").value,
    birth_date: document.getElementById("df-birthdate").value || null,
    national_address: document.getElementById("df-address").value,
    current_employer: document.getElementById("df-employer").value,
    job_title: document.getElementById("df-jobtitle").value,
    gender: document.getElementById("df-gender").value,
    personal_email: document.getElementById("df-email").value,
    mobile: document.getElementById("df-mobile").value,
    is_shareholder: document.getElementById("df-is-shareholder").value === "نعم",
    qualifications: disclosureDraft.qualifications,
    experience: disclosureDraft.experience,
    other_memberships: disclosureDraft.other_memberships,
    survey_answers: disclosureDraft.survey_answers,
    status: "مسودة"
  };
  if(!payload.full_name){ alert("الرجاء إدخال الاسم الرباعي على الأقل"); return; }

  // Every question is mandatory per CMA form requirements — block submission (not just warn)
  // until each one has an explicit answer, rather than silently defaulting unanswered ones.
  const unanswered = DISCLOSURE_SURVEY_QUESTIONS.filter(q => disclosureDraft.survey_answers[q.key] === undefined);
  if(unanswered.length){
    alert(`الرجاء الإجابة على كل الأسئلة الاستقصائية قبل الإرسال — تبقّى ${unanswered.length} سؤال بدون إجابة (السؤال رقم ${DISCLOSURE_SURVEY_QUESTIONS.indexOf(unanswered[0])+1} وما بعده). مرّر لأسفل النموذج للوصول لها.`);
    return;
  }

  const { data: saved, error } = await sb.from("board_disclosure_forms").insert([payload]).select().single();
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }

  const b = await buildDisclosureFormCanvasPages(saved, {}, ["العضو المرشح/المعين"]);
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "official-documents", `نموذج-إفصاح-${payload.full_name}-${Date.now()}.pdf`);
  if(!file_url) return;

  await sb.from("signing_documents").insert([{
    company_id: currentCompanyId, document_name: `نموذج الإفصاح — ${payload.full_name}`, doc_type: "نموذج إفصاح عضوية مجلس",
    file_url, signers_total: 1, related_disclosure_form_id: saved.id,
    signer_roles: [{ role: "العضو المرشح/المعين", name: payload.full_name }]
  }]);

  await sb.from("board_disclosure_forms").update({ status: "بانتظار التوقيع" }).eq("id", saved.id);
  alert("تم حفظ النموذج ✅ — أكمل التوقيع من صفحة \"التوقيع الإلكتروني\".");
  closeM("m-disclosure-form");
}

async function buildDisclosureFormCanvasPages(form, signaturesMap, orderedRoles){
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  const { data: company } = await sb.from("companies").select("name").eq("id", form.company_id).single();

  b.wrapAndDraw("نموذج الإفصاح — عضوية مجلس الإدارة", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(20);
  b.wrapAndDraw(`اسم الشركة: ${company?.name||""}`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.spacer(10);

  b.wrapAndDraw("٢. صفة العضوية وطريقة التعيين", { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
  b.wrapAndDraw(`صفة العضوية: ${form.membership_capacity||"—"}  |  طبيعة العضوية: ${form.appointment_nature||"—"}${form.nominating_shareholder_name?' ('+form.nominating_shareholder_name+')':''}`, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:19*b.scale });
  b.wrapAndDraw(`فترة العضوية: من ${form.term_start||"—"} إلى ${form.term_end||"—"}`, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:19*b.scale });
  b.spacer(10);

  b.wrapAndDraw("٣. البيانات الشخصية", { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
  [
    `الاسم الرباعي: ${form.full_name||"—"}  |  رقم الهوية: ${form.national_id||"—"}`,
    `الجنسية: ${form.nationality||"—"}  |  تاريخ الميلاد: ${form.birth_date||"—"}  |  الجنس: ${form.gender||"—"}`,
    `العنوان الوطني: ${form.national_address||"—"}`,
    `جهة العمل: ${form.current_employer||"—"}  |  المسمى الوظيفي: ${form.job_title||"—"}`,
    `البريد: ${form.personal_email||"—"}  |  الجوال: ${form.mobile||"—"}`,
    `هل هو مساهم بالشركة؟ ${form.is_shareholder?"نعم":"لا"}`
  ].forEach(line => b.wrapAndDraw(line, { font:`${10.5*b.scale}px Tajawal, Arial`, lineHeight:19*b.scale }));
  b.spacer(10);

  const drawSimpleTable = (title, rows, cols) => {
    if(!rows || rows.length === 0) return;
    b.wrapAndDraw(title, { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
    b.spacer(4);
    const tableW = b.W - b.margin*2, colW = tableW/cols.length, RM = b.W - b.margin;
    b.ensureSpace(24*b.scale);
    const headerH = 22*b.scale;
    b.ctx.strokeStyle="#333"; b.ctx.lineWidth=0.6*b.scale; b.ctx.font=`bold ${9*b.scale}px Tajawal, Arial`; b.ctx.textAlign="center";
    cols.forEach((c,i) => { const x = RM - colW*(i+1); b.ctx.strokeRect(x, b.y, colW, headerH); b.ctx.fillText(c, x+colW/2, b.y+15*b.scale); });
    b.y += headerH;
    b.ctx.font=`${9*b.scale}px Tajawal, Arial`;
    rows.forEach(row => {
      b.ensureSpace(22*b.scale);
      const rowH = 22*b.scale;
      cols.forEach((c,i) => {
        const x = RM - colW*(i+1);
        b.ctx.strokeRect(x, b.y, colW, rowH);
        const val = String(row[i]||"");
        b.ctx.fillText(val.length>20?val.slice(0,20)+"…":val, x+colW/2, b.y+rowH/2+3*b.scale);
      });
      b.y += rowH;
    });
    b.spacer(10);
  };

  drawSimpleTable("٤. المؤهلات العلمية", (form.qualifications||[]).map(q=>[q.degree,q.major,q.date,q.institution]), ["المؤهل","التخصص","التاريخ","الجهة المانحة"]);
  drawSimpleTable("٥. الخبرات العملية", (form.experience||[]).map(e=>[e.period,e.field]), ["الفترة","مجالات الخبرة"]);
  drawSimpleTable("٦. العضوية في مجالس أخرى", (form.other_memberships||[]).map(m=>[m.company_name,m.activity,m.capacity,m.legal_form]), ["اسم الشركة","النشاط","الصفة","الشكل القانوني"]);

  b.wrapAndDraw("٧. أسئلة استقصائية", { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
  b.spacer(4);
  DISCLOSURE_SURVEY_QUESTIONS.forEach(q => {
    const rawAns = (form.survey_answers||{})[q.key];
    const answerLabel = rawAns === undefined ? "لم تتم الإجابة" : (rawAns.answer ? "نعم" : "لا");
    b.wrapAndDraw(`${q.label} — ${answerLabel}`, { font:`${9.5*b.scale}px Tajawal, Arial`, lineHeight:17*b.scale, color: rawAns===undefined?"#C0392B":"#0D2447" });
    if(rawAns && rawAns.answer && rawAns.details && rawAns.details.length){
      rawAns.details.forEach(d => b.wrapAndDraw(`   • ${d.filter(Boolean).join(" — ")}`, { font:`${9*b.scale}px Tajawal, Arial`, color:"#8B95A5", lineHeight:16*b.scale }));
    }
  });

  if(orderedRoles && orderedRoles.length){
    b.spacer(30);
    await b.preloadSignatures(signaturesMap);
    orderedRoles.forEach(role => {
      b.ensureSpace(65*b.scale);
      b.drawSigSlot(role, form.full_name||"", b.W/2, b.y, signaturesMap);
      b.spacer(70);
    });
  }
  return b;
}

async function generateOfficialDoc(docTypeKey, meetingId){
  const config = OFFICIAL_DOC_TYPES[docTypeKey];
  if(!config){ alert("نوع مستند غير معروف"); return; }

  // Auto-suggest names from the real board members registry so the person signing/generating
  // doesn't have to retype what's already on file — still editable via the prompt, just no
  // longer starting blank every time.
  const { data: members } = await sb.from("board_members").select("name,position,position_level").eq("company_id", currentCompanyId);
  const chairman = (members||[]).find(m => m.position_level === "رئيس");
  const secretaryMatch = (members||[]).find(m => (m.position||"").includes("أمين") || (m.position||"").includes("سكرتير") || (m.position||"").includes("سر"));
  const otherMembers = (members||[]).filter(m => m.position_level !== "رئيس" && m !== secretaryMatch);

  const suggestFor = (role) => {
    if(role.includes("رئيس")) return chairman?.name || "";
    if(role.includes("سكرتير") || role.includes("أمين")) return secretaryMatch?.name || "";
    if(role === "عضو اللجنة 1") return otherMembers[0]?.name || "";
    if(role === "عضو اللجنة 2") return otherMembers[1]?.name || "";
    return "";
  };

  const roleNames = {};
  for(const role of config.roles){
    const suggested = suggestFor(role);
    const name = await uiPrompt(`اسم ${role}${suggested ? ' (مقترح من سجل أعضاء المجلس، عدّله لو مختلف)' : ''}:`, suggested);
    if(name === null) return;
    roleNames[role] = name;
  }
  let extra = {};
  if(docTypeKey === "محضر جمعية عامة"){
    extra.committee1 = await uiPrompt("اسم عضو لجنة الفرز الأول (اختياري):", otherMembers[0]?.name || "") || "";
    extra.committee2 = await uiPrompt("اسم عضو لجنة الفرز الثاني (اختياري):", otherMembers[1]?.name || "") || "";
    extra.quorum_threshold = Number(await uiPrompt("الحد الأدنى النظامي للنصاب (%):", "50")) || 50;
  }

  const data = await config.prepareData(meetingId);
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  await config.draw(b, data, {}, roleNames, extra);
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const fileName = `${docTypeKey}-${data.m?.title||''}-${Date.now()}.pdf`;
  const file_url = await uploadBlobToStorage(blob, "official-documents", fileName);
  if(!file_url) return;

  const { error } = await sb.from("signing_documents").insert([{
    company_id: currentCompanyId, document_name: `${docTypeKey} — ${data.m?.title||'الجمعية'}`, doc_type: docTypeKey,
    file_url, signers_total: config.roles.length, related_meeting_id: meetingId,
    signer_roles: config.roles.map(r => ({ role: r, name: roleNames[r] })),
    signature_slots: extra
  }]);
  if(error){ alert("تعذّر الإنشاء: " + error.message); return; }
  alert(`تم إنشاء "${docTypeKey}" ✅ — بانتظار توقيع: ${config.roles.join('، ')}. أكمل التوقيع من صفحة "التوقيع الإلكتروني".`);
}

// Re-draws the entire document from scratch with every signature collected so far embedded at
// its correct slot, then replaces the stored file — called after every single new signature.
async function regenerateOfficialDoc(signingDocId){
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", signingDocId).single();
  if(!doc || !doc.doc_type) return null;

  if(doc.doc_type === "نموذج إفصاح عضوية مجلس"){
    if(!doc.related_disclosure_form_id) return null;
    const [{ data: form }, { data: sigs }] = await Promise.all([
      sb.from("board_disclosure_forms").select("*").eq("id", doc.related_disclosure_form_id).single(),
      sb.from("official_doc_signatures").select("*").eq("document_id", signingDocId)
    ]);
    if(!form) return null;
    const signaturesMap = {};
    (sigs||[]).forEach(s => { signaturesMap[s.role] = { name: s.signer_name, image: s.signature_image }; });
    const roles = (doc.signer_roles||[]).map(r => r.role);
    const b = await buildDisclosureFormCanvasPages(form, signaturesMap, roles);
    const bytes = await b.toPDFBytes();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const file_url = await uploadBlobToStorage(blob, "official-documents", `نموذج-إفصاح-${Date.now()}.pdf`);
    if(!file_url) return null;
    const allSigned = roles.every(r => signaturesMap[r]);
    await sb.from("signing_documents").update({ file_url }).eq("id", signingDocId);
    if(allSigned) await sb.from("board_disclosure_forms").update({ status: "موقّع" }).eq("id", doc.related_disclosure_form_id);
    return file_url;
  }

  if(!OFFICIAL_DOC_TYPES[doc.doc_type] || !doc.related_meeting_id) return null;
  const config = OFFICIAL_DOC_TYPES[doc.doc_type];
  const roleNames = {};
  (doc.signer_roles||[]).forEach(r => { roleNames[r.role] = r.name; });

  const [data, { data: sigs }] = await Promise.all([
    config.prepareData(doc.related_meeting_id),
    sb.from("official_doc_signatures").select("*").eq("document_id", signingDocId)
  ]);
  const signaturesMap = {};
  (sigs||[]).forEach(s => { signaturesMap[s.role] = { name: s.signer_name, image: s.signature_image }; });

  const b = await CanvasPDFBuilder.create(currentCompanyId);
  await config.draw(b, data, signaturesMap, roleNames, doc.signature_slots||{});
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "official-documents", `${doc.doc_type}-${Date.now()}.pdf`);
  if(!file_url) return null;
  await sb.from("signing_documents").update({ file_url }).eq("id", signingDocId);
  return file_url;
}

/* Convenience wrappers matching the button labels already wired in the AGM detail view */
async function generateAGMInvitationDoc(meetingId){ return generateOfficialDoc("دعوة جمعية عامة", meetingId); }
async function generateAGMMinutesDoc(meetingId){ return generateOfficialDoc("محضر جمعية عامة", meetingId); }
async function generateVoteMinutesPDF(meetingId){ return generateOfficialDoc("محضر فرز الأصوات", meetingId); }
async function generateAttendanceSheet(meetingId){ return generateOfficialDoc("كشف حضور", meetingId || currentVotingMeetingId); }

async function buildMeetingMinutesHTML(meetingId){
  const { data: m, error: mErr } = await sb.from("meetings").select("*").eq("id", meetingId).single();
  if(mErr || !m) return null;

  const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("sort_order",{ascending:true}).order("id",{ascending:true});
  const { data: decisions } = await sb.from("board_decisions").select("*").eq("meeting_id", meetingId).order("id",{ascending:true});
  const decisionIds = (decisions||[]).map(d=>d.id);
  const { data: decisionVotes } = decisionIds.length ? await sb.from("board_decision_votes").select("*").in("decision_id", decisionIds) : { data: [] };

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  let members, scopeLabel = "مجلس الإدارة";
  if(m.committee_id){
    const { data: committee } = await sb.from("committees").select("*").eq("id", m.committee_id).single();
    scopeLabel = committee ? committee.committee_name : "اللجنة";
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", m.committee_id);
    const memberIds = (links||[]).map(l => l.member_id);
    const { data } = memberIds.length ? await sb.from("board_members").select("*").in("id", memberIds) : { data: [] };
    members = data || [];
  } else {
    const { data } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId);
    members = data || [];
  }

  const { data: attendance } = await sb.from("meeting_attendance").select("*").eq("meeting_id", meetingId);
  const byMember = {};
  (attendance||[]).forEach(a => { byMember[a.member_id] = a.status; });
  const presentCount = (attendance||[]).filter(a => a.status === "حاضر").length;
  const totalCount = members.length;
  const pctPresent = totalCount ? (presentCount/totalCount)*100 : 0;
  const threshold = Number(company?.board_quorum_percentage ?? 50);
  const quorumMet = pctPresent >= threshold;

  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const timeRange = m.meeting_time ? (' — من الساعة '+m.meeting_time+(m.time_end?(' إلى '+m.time_end):'')) : '';

  // The attendee list is built directly from the real attendance record (meeting_attendance),
  // never typed by hand — this is the "يكتب فيه أعضاء المجلس الحاضرين" part done automatically.
  const attendanceRows = members.map((mem,i) => `<tr><td>${i+1}</td><td>${orgEsc(mem.name||"")}</td><td>${orgEsc(mem.position||"—")}</td><td>${byMember[mem.id]||"لم يُسجَّل"}</td></tr>`).join("")
    || '<tr><td colspan="4">لا يوجد أعضاء مسجّلون.</td></tr>';

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><title>محضر اجتماع</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;direction:rtl;text-align:right;line-height:1.9;font-size:13px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;font-size:19px;border-bottom:2px solid #D4AF37;padding-bottom:8px}
      h2{color:#1A3A6B;font-size:15px;margin-top:20px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #999;padding:6px 8px;font-size:12px}
      th{background:#EAF0F8}
      .sig{margin-top:50px}
      .sig table td{border:none;text-align:center;padding-top:40px;border-top:1px solid #333}
    </style></head>
    <body>
      <h1>محضر اجتماع ${scopeLabel}</h1>
      <p><b>الشركة:</b> ${companyName}</p>
      <p><b>عنوان الاجتماع:</b> ${orgEsc(m.title||"—")}</p>
      <p><b>النوع:</b> ${m.meeting_type||"—"}</p>
      <p><b>التاريخ:</b> ${m.meeting_date||"—"}${timeRange}</p>
      <p><b>طريقة الانعقاد:</b> ${m.method||"—"}</p>

      <h2>أولاً: الحضور والنصاب</h2>
      <p>النصاب المطلوب: <b>${threshold}%</b> (${Math.ceil(totalCount*threshold/100)} من ${totalCount}) — الحاضرون فعليًا: <b>${presentCount}/${totalCount}</b> (${pctPresent.toFixed(0)}%)</p>
      <p><b>${quorumMet ? "✅ تحقق النصاب اللازم لصحة انعقاد الاجتماع وصدور قراراته." : "❌ لم يتحقق النصاب اللازم — لا يجوز اتخاذ قرارات ملزمة في هذا الاجتماع."}</b></p>
      <table>
        <thead><tr><th>#</th><th>الاسم</th><th>المنصب</th><th>الحالة</th></tr></thead>
        <tbody>${attendanceRows}</tbody>
      </table>

      <h2>ثانياً: جدول الأعمال والمناقشات</h2>
      ${(topics && topics.length) ? `<ol>${topics.map(t=>`<li>${orgEsc(t.topic_text)}</li>`).join("")}</ol>` : `<p>${orgEsc(m.notes ? m.notes : "لم تُسجَّل ملاحظات أو بنود جدول أعمال لهذا الاجتماع.")}</p>`}

      <h2>ثالثاً: القرارات الصادرة ونتائج التصويت</h2>
      ${(decisions && decisions.length) ? `<table>
        <thead><tr><th>#</th><th>القرار</th><th>موافق</th><th>معارض</th><th>ممتنع</th><th>النتيجة</th></tr></thead>
        <tbody>${decisions.map((d,i) => {
          const votes = (decisionVotes||[]).filter(v => v.decision_id === d.id);
          const yes = votes.filter(v=>v.vote==="موافق").length, no = votes.filter(v=>v.vote==="معارض").length, abs = votes.filter(v=>v.vote==="ممتنع").length;
          const outcome = yes > no ? "معتمد ✅" : "غير معتمد ❌";
          return `<tr><td>${i+1}</td><td>${orgEsc(d.decision_text)}</td><td>${yes}</td><td>${no}</td><td>${abs}</td><td>${outcome}</td></tr>`;
        }).join("")}</tbody>
      </table>` : `<p>لم تُطرح قرارات للتصويت بهذا الاجتماع.</p>`}

      <h2>رابعاً: خاتمة</h2>
      <p>وبعد استكمال بنود جدول الأعمال، اختُتم الاجتماع بتاريخ ${dateNow}.</p>

      <div class="sig">
        <table>
          <tr>
            <td>رئيس الاجتماع</td>
            <td>أمين السر</td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;
  return { html, m, scopeLabel };
}

/* Closes the loop between the generated minutes (which already bakes in real attendance,
   agenda, and decision vote tallies) and the "المحضر النهائي" signing workflow — instead of
   someone manually uploading a separate, disconnected file to sign. If a signing document
   isn't linked yet, one is created automatically requiring every eligible member's signature;
   if one exists but hasn't collected any signatures yet, its file is kept in sync so it
   always reflects the latest votes right up until someone actually starts signing it. */
async function linkGeneratedMinutesForSigning(meetingId, file_url, m){
  if(m.signing_doc_id){
    const { data: existingDoc } = await sb.from("signing_documents").select("*").eq("id", m.signing_doc_id).single();
    if(existingDoc && !(existingDoc.signers_done > 0)){
      await sb.from("signing_documents").update({ file_url }).eq("id", m.signing_doc_id);
    }
    return;
  }
  const eligible = await getEligibleDecisionVoters(meetingId);
  const signers_total = eligible.length || 1;
  const { data: doc, error } = await sb.from("signing_documents").insert([{
    document_name: `محضر اجتماع — ${m.title||""}`, doc_type: m.committee_id ? "محضر اجتماع لجنة" : "محضر اجتماع مجلس",
    signers_total, signers_done: 0, status: "قيد التوقيع", file_url, company_id: currentCompanyId
  }]).select().single();
  if(error || !doc) return;
  await sb.from("meetings").update({ signing_doc_id: doc.id }).eq("id", meetingId);
}

async function generateMeetingMinutesDoc(meetingId){
  const built = await buildMeetingMinutesHTML(meetingId);
  if(!built){ alert("تعذّر تحميل بيانات الاجتماع"); return; }
  const { html, m, scopeLabel } = built;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `محضر ${m.title||scopeLabel}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Auto-generates the minutes the moment someone opens a board/committee meeting whose end
   time has already passed and that doesn't have a minutes file yet — uploaded to storage and
   auto-archived, not just a local download, so it exists as a real record without anyone
   having to remember to click "توليد". The manual "توليد" button above still works too, e.g.
   to regenerate after attendance gets corrected later. */
async function autoGenerateMinutesIfDue(meetingId){
  const { data: m } = await sb.from("meetings").select("*")
    .eq("id", meetingId).single();
  if(!m || m.minutes_file_url) return false;
  if(!BOARD_COMMITTEE_MEETING_TYPES.includes(m.meeting_type)) return false;
  if(!m.meeting_date) return false;
  const endClock = m.time_end || m.meeting_time || "23:59";
  const meetingEndsAt = new Date(`${m.meeting_date}T${endClock}`);
  if(isNaN(meetingEndsAt.getTime()) || meetingEndsAt > new Date()) return false; // meeting hasn't ended yet

  const built = await buildMeetingMinutesHTML(meetingId);
  if(!built) return false;
  const blob = new Blob(['\ufeff', built.html], { type: 'application/msword' });
  const file_url = await uploadBlobToStorage(blob, "meeting-minutes", `محضر-${m.title||built.scopeLabel}-${Date.now()}.doc`);
  if(!file_url) return false;
  await sb.from("meetings").update({ minutes_file_url: file_url }).eq("id", meetingId);
  await autoArchiveDocument(`محضر ${built.scopeLabel} — ${m.title||""}`, "محاضر", file_url);
  await linkGeneratedMinutesForSigning(meetingId, file_url, m);
  return true;
}
