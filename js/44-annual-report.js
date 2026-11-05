const REPORT_MANUAL_FIELDS = [
  { key:'compliance_statement', label:'', placeholder:'اذكر ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسباب ذلك...', default:'طبّقت الشركة كافة الأحكام الواردة في لائحة حوكمة الشركات الصادرة عن هيئة السوق المالية.' },
  { key:'other_directorships', placeholder:'أسماء الشركات (داخل المملكة أو خارجها) التي يكون أي من أعضاء الإدارة العليا عضوًا في مجالس إدارتها الحالية أو السابقة...' },
  { key:'remuneration', placeholder:'إفصاح عن مكافآت أعضاء مجلس الإدارة والإدارة التنفيذية، وسياسة تحديدها، والعلاقة بين المكافآت الممنوحة وسياسة المكافآت المعمول بها...' },
  { key:'penalties', placeholder:'أي عقوبة أو جزاء أو تدبير احترازي مفروض على الشركة من الهيئة أو أي جهة تنظيمية، مع بيان الأسباب وسبل العلاج...', default:'لم تتعرض الشركة خلال هذا العام لأي عقوبات أو جزاءات من الجهات التنظيمية.' },
  { key:'internal_control', placeholder:'نتائج المراجعة السنوية لفعالية إجراءات الرقابة الداخلية، ورأي لجنة المراجعة في مدى كفايتها...' },
  { key:'risk_policy', placeholder:'سياسة إدارة المخاطر المذكورة أعلاه وآلية مراقبتها...' },
  { key:'material_variances', placeholder:'أي فروقات جوهرية (10% فأكثر) في النتائج التشغيلية عن السنة السابقة أو عن أي توقعات أعلنتها الشركة...', default:'لا توجد فروقات جوهرية تستدعي الإفصاح عنها.' },
  { key:'subsidiaries', placeholder:'اسم كل شركة تابعة، ورأس مالها، ونسبة ملكية الشركة فيها، ونشاطها الرئيسي، ودولة التأسيس...', default:'لا توجد شركات تابعة.' },
  { key:'loans', placeholder:'معلومات عن أي قروض على الشركة (المبلغ، الجهة المانحة، المدة، الرصيد المتبقي)...', default:'لا توجد قروض على الشركة.' },
  { key:'share_registry_requests', placeholder:'عدد طلبات الشركة لسجل المساهمين وتواريخها وأسبابها...' },
  { key:'related_party_contracts', placeholder:'أي أعمال أو عقود تكون الشركة طرفًا فيها ولأحد أصحاب القرار أو كبار التنفيذيين مصلحة فيها...', default:'لا توجد أعمال أو عقود من هذا القبيل.' },
  { key:'dividends', placeholder:'نسب الأرباح الموزعة على المساهمين خلال العام، والمقترح توزيعه في نهاية السنة المالية...' },
  { key:'declarations', placeholder:'إقرارات مجلس الإدارة...', default:'يقر مجلس الإدارة بأن سجلات الحسابات أُعدت بالشكل الصحيح، وأن نظام الرقابة الداخلية أُعد على أسس سليمة ونُفذ بفاعلية، وأنه لا يوجد أي شك يُذكر في قدرة الشركة على مواصلة نشاطها.' }
];

// For a single-owner LLC there is no board — a few fields' placeholder/default text hard-codes
// "مجلس الإدارة" language that would otherwise get saved verbatim into the report unedited
// (declarations especially: its default is a full sentence someone could submit as-is,
// literally attributing a declaration to a board that doesn't exist).
function getReportFieldTextForEntity(f){
  if(currentCompanyType === "ذات مسؤولية محدودة" && currentCompanyLLCSingleOwner){
    const overrides = {
      remuneration: { placeholder: 'إفصاح عن مكافآت الإدارة التنفيذية، وسياسة تحديدها...' },
      internal_control: { placeholder: 'نتائج المراجعة السنوية لفعالية إجراءات الرقابة الداخلية...' },
      declarations: { placeholder: 'إقرارات المالك...', default: 'يقر المالك بأن سجلات الحسابات أُعدت بالشكل الصحيح، وأن نظام الرقابة الداخلية أُعد على أسس سليمة ونُفذ بفاعلية، وأنه لا يوجد أي شك يُذكر في قدرة الشركة على مواصلة نشاطها.' },
    };
    if(overrides[f.key]) return { ...f, ...overrides[f.key] };
  }
  return f;
}

function renderReportManualFields(year, savedValues){
  REPORT_MANUAL_FIELDS.forEach(f0 => {
    const f = getReportFieldTextForEntity(f0);
    const box = document.getElementById("field-"+f.key);
    if(!box) return;
    const val = savedValues[f.key] != null ? savedValues[f.key] : (f.default || "");
    box.innerHTML = `
      <textarea class="rep-field-textarea" id="repfield-${f.key}" rows="2" placeholder="${f.placeholder}">${val}</textarea>
      <button class="btn-xs primary" onclick="saveReportField('${f.key}',${year})"><span class="ico-i ico-save"></span>حفظ</button>
    `;
  });
}

async function saveReportField(key, year){
  const el = document.getElementById("repfield-"+key);
  if(!el) return;
  const field_value = el.value;
  const { error } = await sb.from("board_report_fields")
    .upsert([{ company_id: currentCompanyId, year, field_key: key, field_value }], { onConflict: 'company_id,year,field_key' });
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم الحفظ ✅");
}

function boardMemberClassification(m){
  if(m.is_executive === "تنفيذي") return "تنفيذي";
  if(m.status === "مستقل") return "مستقل";
  return "غير تنفيذي";
}

function applyReportTypeAdaptation(){
  const type = currentCompanyType;
  const isSoleProp = type === "مؤسسة فردية";
  const isLLC = type === "ذات مسؤولية محدودة";
  const isLLCSingleManager = isLLC && currentCompanyLLCSingleManager;
  const isLLCSingleOwner = isLLC && currentCompanyLLCSingleOwner;
  const noBoard = isSoleProp || isLLCSingleManager || isLLCSingleOwner; // no board / council of managers to report on at all

  let pageTitle, subTitle, boardWord;
  if(isSoleProp || isLLCSingleOwner){
    // A single-owner LLC is, for reporting purposes, exactly the sole-proprietorship case —
    // one annual company report, no board-of-managers framing to keep up.
    pageTitle = "📈 التقرير السنوي"; subTitle = "التقرير السنوي"; boardWord = "المالك";
  }
  else if(isLLCSingleManager){ pageTitle = "📈 تقرير المدير السنوي"; subTitle = "تقرير المدير السنوي"; boardWord = "المدير"; }
  else if(isLLC){ pageTitle = "📈 تقرير مجلس المديرين السنوي"; subTitle = "تقرير مجلس المديرين السنوي"; boardWord = "مجلس المديرين"; }
  else { pageTitle = "📈 تقرير مجلس الإدارة السنوي (حسب المادة 90 من لائحة حوكمة الشركات)"; subTitle = "تقرير مجلس الإدارة السنوي"; boardWord = "مجلس الإدارة"; }

  setText("reportsPageTitle", pageTitle);
  setText("reportSubTitle", subTitle);

  // CMA-specific sections — never applicable outside joint-stock companies (unchanged from
  // before). Board/council-specific sections — hidden wherever there is genuinely no such body
  // (sole prop, single-manager LLC, single-owner LLC), not just for sole proprietorships alone.
  ["sec-compliance", "sec-share-registry"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = (isSoleProp || isLLC) ? "none" : "";
  });
  ["sec-board-composition", "sec-other-directorships", "sec-committees", "sec-related-party"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = noBoard ? "none" : "";
  });
  // Internal control and declarations always stay VISIBLE (never hidden) — every entity, board
  // or not, still has internal controls worth reporting on and still makes a formal declaration;
  // only the wording of who is making it changes below.

  if(noBoard){
    setText("rep-title-1", "أولاً: تأسيس الشركة");
    setText("rep-title-5", "أولاً: مكافآت الإدارة التنفيذية");
    setText("rep-title-7", "أولاً: نتائج المراجعة السنوية للرقابة الداخلية");
    setText("rep-title-11", "أولاً: الأعمال والعقود مع أطراف ذات علاقة");
    setText("rep-title-15", `أولاً: إقرارات ${boardWord}`);
  } else {
    setText("rep-title-1", "أولاً: ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسبابه");
    setText("rep-title-5", `أولاً: مكافآت أعضاء ${boardWord} والإدارة التنفيذية`);
    setText("rep-title-7", "أولاً: نتائج المراجعة السنوية للرقابة الداخلية ورأي لجنة المراجعة");
    setText("rep-title-11", "أولاً: القروض على الشركة");
    setText("rep-title-15", `أولاً: إقرارات ${boardWord}`);
  }
  renumberVisibleReportSections();
}

// Section numbers (أولاً، ثانياً...) are baked into each title's text, but whole sections get
// hidden depending on company type — walk the ones still visible, in document order, and
// re-stamp each with the correct sequential ordinal instead of leaving gaps like "خامساً"
// showing up as the first visible section.
const REPORT_ORDINALS = ["أولاً","ثانياً","ثالثاً","رابعاً","خامساً","سادساً","سابعاً","ثامناً","تاسعاً","عاشراً","حادي عشر","ثاني عشر","ثالث عشر","رابع عشر","خامس عشر"];
function renumberVisibleReportSections(){
  const body = document.getElementById("reportBody");
  if(!body) return;
  const titles = body.querySelectorAll(".rep-sec-title");
  let idx = 0;
  titles.forEach(el => {
    const isHidden = el.offsetParent === null;
    if(isHidden) return;
    const match = el.textContent.match(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر):\s*(.*)$/);
    if(!match) return; // titles with no ordinal (e.g. "أبرز القرارات") are left as-is
    el.textContent = `${REPORT_ORDINALS[idx]}: ${match[2]}`;
    idx++;
  });
}

async function loadReportsPage(){
  applyReportTypeAdaptation();
  const list = document.getElementById("companySwitcher");
  const name = list && list.selectedOptions.length ? list.selectedOptions[0].textContent : "الشركة";
  setText("reportCompanyName1", name);

  const yearSelect = document.getElementById("reportYearSelect");
  const nowYear = new Date().getFullYear();
  if(yearSelect && yearSelect.options.length === 0){
    for(let y = nowYear; y >= nowYear-4; y--){
      const opt = document.createElement("option");
      opt.value = y; opt.textContent = y;
      yearSelect.appendChild(opt);
    }
  }
  const currentYear = yearSelect ? Number(yearSelect.value) : nowYear;
  setText("reportPeriodLine", `للسنة المالية المنتهية في 31 ديسمبر ${currentYear}`);
  setText("reportGenDate", new Date().toLocaleDateString("ar-SA-u-ca-gregory"));

  const [meetingsRes, signingRes, complianceRes, committeesRes, membersRes, risksRes, perfRes, fieldsRes, attendanceRes, committeeMembersRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    fetchCompanyRisks().then(d => ({ data: d })),
    sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId),
    sb.from("board_report_fields").select("*").eq("company_id", currentCompanyId).eq("year", currentYear),
    sb.from("meeting_attendance").select("*").eq("company_id", currentCompanyId),
    sb.from("committee_members").select("*").eq("company_id", currentCompanyId)
  ]);
  const meetings = meetingsRes.data || [];
  const signingDocs = signingRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const committeesData = committeesRes.data || [];
  const members = membersRes.data || [];
  const risks = risksRes.data || [];
  const perfEvals = perfRes.data || [];
  const attendance = attendanceRes.data || [];
  const committeeLinks = committeeMembersRes.data || [];

  const savedFields = {};
  (fieldsRes.data||[]).forEach(f => { savedFields[f.field_key] = f.field_value; });
  renderReportManualFields(currentYear, savedFields);

  const boardMeetingsThisYear = meetings.filter(m => (m.meeting_type==="اجتماع مجلس الإدارة الدوري"||m.meeting_type==="اجتماع طارئ") && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
  const decisionsThisYear = signingDocs.filter(d => d.status==="مكتمل" && d.created_at && new Date(d.created_at).getFullYear()===currentYear);
  const cmpAssess = await cmpLatestAssessment();
  const compliancePct = complianceSummary(compliance, cmpAssess).pct;

  setText("rep-kpi-meetings", boardMeetingsThisYear.length);
  setText("rep-kpi-decisions", decisionsThisYear.length);
  setText("rep-kpi-compliance", compliancePct!=null ? compliancePct+"%" : "—");
  setText("rep-kpi-committees", committeesData.length);

  // ── Section 2: Board composition & classification (real) ──
  const compBox = document.getElementById("rep-board-composition");
  if(compBox){
    compBox.innerHTML = members.length ? `<table class="tbl"><thead><tr><th>الاسم</th><th>المنصب</th><th>التصنيف</th></tr></thead><tbody>
      ${members.map(m => `<tr><td>${orgEsc(m.name||"")}</td><td>${orgEsc(m.position||"—")}</td><td>${boardMemberClassification(m)}</td></tr>`).join("")}
    </tbody></table>` : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا يوجد أعضاء مسجّلون بعد.</div>';
  }

  // ── Section 4: Committees detail — members, meeting count, attendance (real) ──
  const commBox = document.getElementById("rep-committees-detail");
  if(commBox){
    if(committeesData.length===0){
      commBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد لجان مسجّلة بعد.</div>';
    } else {
      commBox.innerHTML = `<table class="tbl"><thead><tr><th>اللجنة</th><th>الرئيس</th><th>عدد الأعضاء</th><th>اجتماعاتها هذا العام</th><th>متوسط نسبة الحضور</th></tr></thead><tbody>
        ${committeesData.map(c => {
          const memberIds = committeeLinks.filter(l=>l.committee_id===c.id).map(l=>l.member_id);
          const cMeetings = meetings.filter(m => m.committee_id===c.id && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
          const cMeetingIds = cMeetings.map(m=>m.id);
          const cAttendance = attendance.filter(a => cMeetingIds.includes(a.meeting_id) && memberIds.includes(a.member_id));
          const present = cAttendance.filter(a=>a.status==="حاضر").length;
          const avgPct = cAttendance.length ? Math.round((present/cAttendance.length)*100) : null;
          return `<tr><td>${orgEsc(c.committee_name||"")}</td><td>${orgEsc(c.chairman_name||"—")}</td><td>${memberIds.length}</td><td>${cMeetings.length}</td><td>${avgPct!=null?avgPct+'%':'—'}</td></tr>`;
        }).join("")}
      </tbody></table>`;
    }
  }

  // ── Section 8: Risks list (real) ──
  const riskBox = document.getElementById("rep-risks-list");
  if(riskBox){
    riskBox.innerHTML = risks.length ? `<table class="tbl"><thead><tr><th>الخطر</th><th>الفئة</th><th>التأثير</th><th>الاحتمالية</th><th>الحالة</th></tr></thead><tbody>
      ${risks.map(r => `<tr><td>${orgEsc(r.risk_name||"")}</td><td>${orgEsc(r.category||"—")}</td><td>${r.impact||"—"}</td><td>${r.probability!=null?r.probability+'%':'—'}</td><td>${r.status||"—"}</td></tr>`).join("")}
    </tbody></table>` : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد مخاطر مسجّلة بعد.</div>';
  }

  // Decisions list
  const decBox = document.getElementById("rep-decisions-list");
  if(decBox){
    const topDecisions = decisionsThisYear.sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
    decBox.innerHTML = topDecisions.length
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        topDecisions.map(d => `<div style="background:#E8F8EF;border-radius:8px;padding:10px 14px;font-size:12px;color:var(--green);font-weight:600"><span class="ico-i ico-check"></span>${orgEsc(d.document_name)}</div>`).join("") +
        '</div>'
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد قرارات موقّعة مكتملة هذا العام بعد.</div>';
  }

  // Other governance reports — live summaries linking to real pages
  const otherBox = document.getElementById("rep-other-tbody");
  if(otherBox){
    const completedPerf = perfEvals.filter(p=>p.status==="مكتمل").length;
    const openRisks = risks.filter(r=>r.status==="مراقبة"||r.status==="متابعة").length;
    const agmCount = meetings.filter(m=>m.meeting_type==="الجمعية العامة").length;
    const rows = [
      { title:"تقرير الامتثال التنظيمي", type:"امتثال", summary: complianceSummary(compliance, cmpAssess).text, ok: compliancePct===100, page:"compliance" },
      { title:"تقرير تقييم أداء المجلس", type:"تقييم", summary: perfEvals.length ? `${completedPerf} تقييم مكتمل من ${perfEvals.length}` : "لا توجد بيانات", ok: perfEvals.length>0 && completedPerf===perfEvals.length, page:"perf" },
      { title:"تقرير إدارة المخاطر", type:"مخاطر", summary: risks.length ? `${openRisks} خطر مفتوح من ${risks.length}` : "لا توجد بيانات", ok: openRisks===0, page:"risks" },
      { title:"تقرير الحوكمة للجمعية العامة", type:"جمعية", summary: agmCount ? `${agmCount} جمعية مسجّلة` : "لا توجد بيانات", ok: agmCount>0, page:"agm" },
      { title:"تقرير السياسات والحوكمة", type:"سياسات", summary: "عرض كل السياسات ومراحل اعتمادها", ok: null, page:"governance" }
    ];
    otherBox.innerHTML = rows.map(r => {
      const badge = r.ok===null ? '<span class="badge info">مرجع</span>' : (r.ok ? '<span class="badge done">جيد ✅</span>' : '<span class="badge pending">يحتاج متابعة</span>');
      return `<tr>
        <td>${orgEsc(r.title)}</td><td>${r.type}</td><td style="font-size:12px;color:var(--gray3)">${r.summary}</td>
        <td>${badge}</td>
        <td><button class="btn-xs primary" onclick="go('${r.page}',null)"><span class="ico-i ico-document"></span>عرض التفاصيل</button></td>
      </tr>`;
    }).join("");
  }
}


async function generateAnnualReportPDF(){
  const w = openPrintWindow();
  if(w){ w.document.write('<html dir="rtl"><body style="font-family:sans-serif;padding:30px">جارِ تجهيز التقرير...</body></html>'); w.document.close(); }

  const yearSelect = document.getElementById("reportYearSelect");
  const currentYear = yearSelect ? Number(yearSelect.value) : new Date().getFullYear();
  const companyName = document.getElementById("reportCompanyName1")?.textContent || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");

  // Pull whatever is currently written in each manual field (including unsaved edits),
  // since generating the PDF is meant to happen right after finishing writing the report.
  const manualValues = {};
  REPORT_MANUAL_FIELDS.forEach(f => {
    const el = document.getElementById("repfield-"+f.key);
    manualValues[f.key] = el ? el.value.trim() : (f.default || "");
  });

  const [meetingsRes, signingRes, complianceRes, committeesRes, membersRes, risksRes, attendanceRes, committeeMembersRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    fetchCompanyRisks().then(d => ({ data: d })),
    sb.from("meeting_attendance").select("*").eq("company_id", currentCompanyId),
    sb.from("committee_members").select("*").eq("company_id", currentCompanyId)
  ]);
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }

  const meetings = meetingsRes.data || [];
  const signingDocs = signingRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const committeesData = committeesRes.data || [];
  const members = membersRes.data || [];
  const risks = risksRes.data || [];
  const attendance = attendanceRes.data || [];
  const committeeLinks = committeeMembersRes.data || [];

  const boardMeetingsThisYear = meetings.filter(m => (m.meeting_type==="اجتماع مجلس الإدارة الدوري"||m.meeting_type==="اجتماع طارئ") && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
  const decisionsThisYear = signingDocs.filter(d => d.status==="مكتمل" && d.created_at && new Date(d.created_at).getFullYear()===currentYear);
  const cmpAssess = await cmpLatestAssessment();
  const compliancePct = complianceSummary(compliance, cmpAssess).pct;

  const composRows = members.map(m => `<tr><td>${orgEsc(m.name||"")}</td><td>${orgEsc(m.position||"—")}</td><td>${boardMemberClassification(m)}</td></tr>`).join("")
    || '<tr><td colspan="3">لا يوجد أعضاء مسجّلون.</td></tr>';

  const commRows = committeesData.map(c => {
    const memberIds = committeeLinks.filter(l=>l.committee_id===c.id).map(l=>l.member_id);
    const cMeetings = meetings.filter(m => m.committee_id===c.id && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
    const cMeetingIds = cMeetings.map(m=>m.id);
    const cAttendance = attendance.filter(a => cMeetingIds.includes(a.meeting_id) && memberIds.includes(a.member_id));
    const present = cAttendance.filter(a=>a.status==="حاضر").length;
    const avgPct = cAttendance.length ? Math.round((present/cAttendance.length)*100) : null;
    return `<tr><td>${orgEsc(c.committee_name||"")}</td><td>${orgEsc(c.chairman_name||"—")}</td><td>${memberIds.length}</td><td>${cMeetings.length}</td><td>${avgPct!=null?avgPct+'%':'—'}</td></tr>`;
  }).join("") || '<tr><td colspan="5">لا توجد لجان مسجّلة.</td></tr>';

  const riskRows = risks.map(r => `<tr><td>${orgEsc(r.risk_name||"")}</td><td>${orgEsc(r.category||"—")}</td><td>${r.impact||"—"}</td><td>${r.probability!=null?r.probability+'%':'—'}</td><td>${r.status||"—"}</td></tr>`).join("")
    || '<tr><td colspan="5">لا توجد مخاطر مسجّلة.</td></tr>';

  const decisionsList = decisionsThisYear.length
    ? '<ul>' + decisionsThisYear.map(d => `<li>${orgEsc(d.document_name)}</li>`).join("") + '</ul>'
    : '<p>لا توجد قرارات موقّعة مكتملة هذا العام بعد.</p>';

  const repIsSoleProp = currentCompanyType === "مؤسسة فردية";
  const repIsLLC = currentCompanyType === "ذات مسؤولية محدودة";
  const repBoardWord = repIsSoleProp ? "المالك" : repIsLLC ? "مجلس المديرين" : "مجلس الإدارة";
  const repTitle = repIsSoleProp ? "التقرير السنوي" : repIsLLC ? "تقرير مجلس المديرين السنوي" : "تقرير مجلس الإدارة السنوي";

  let sections = [
    { key:"compliance", num:"أولاً", title:"ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسبابه", body: `<p>${orgEsc(manualValues.compliance_statement||"—")}</p>` },
    { key:"board", num:"ثانياً", title:`تكوين ${repBoardWord} وتصنيف الأعضاء`, body: `<table><thead><tr><th>الاسم</th><th>المنصب</th><th>التصنيف</th></tr></thead><tbody>${composRows}</tbody></table>` },
    { key:"directorships", num:"ثالثاً", title:"عضوية أعضاء المجلس في مجالس إدارات أخرى", body: `<p>${orgEsc(manualValues.other_directorships||"لا يوجد")}</p>` },
    { key:"committees", num:"رابعاً", title:"اللجان — الأعضاء وعدد الاجتماعات ونسب الحضور", body: `<table><thead><tr><th>اللجنة</th><th>الرئيس</th><th>عدد الأعضاء</th><th>اجتماعاتها هذا العام</th><th>متوسط نسبة الحضور</th></tr></thead><tbody>${commRows}</tbody></table>` },
    { key:"all", num:"خامساً", title:`مكافآت أعضاء ${repBoardWord} والإدارة التنفيذية`, body: `<p>${orgEsc(manualValues.remuneration||"—")}</p>` },
    { key:"all", num:"سادساً", title:"العقوبات والجزاءات المفروضة على الشركة", body: `<p>${orgEsc(manualValues.penalties||"—")}</p>` },
    { key:"internal_control", num:"سابعاً", title:"نتائج المراجعة السنوية للرقابة الداخلية ورأي لجنة المراجعة", body: `<p>${orgEsc(manualValues.internal_control||"—")}</p>` },
    { key:"all", num:"ثامناً", title:"المخاطر التي تواجه الشركة وسياسة إدارتها", body: `<table><thead><tr><th>الخطر</th><th>الفئة</th><th>التأثير</th><th>الاحتمالية</th><th>الحالة</th></tr></thead><tbody>${riskRows}</tbody></table><p style="margin-top:8px">${orgEsc(manualValues.risk_policy||"")}</p>` },
    { key:"all", num:"تاسعاً", title:"الفروقات الجوهرية في النتائج التشغيلية عن السنة السابقة", body: `<p>${orgEsc(manualValues.material_variances||"—")}</p>` },
    { key:"all", num:"عاشراً", title:"الشركات التابعة", body: `<p>${orgEsc(manualValues.subsidiaries||"—")}</p>` },
    { key:"all", num:"حادي عشر", title:"القروض على الشركة", body: `<p>${orgEsc(manualValues.loans||"—")}</p>` },
    { key:"share_registry", num:"ثاني عشر", title:"طلبات الشركة لسجل المساهمين", body: `<p>${orgEsc(manualValues.share_registry_requests||"—")}</p>` },
    { key:"all", num:"ثالث عشر", title:`الأعمال والعقود مع أطراف ذات علاقة بـ${repIsSoleProp?"المالك":"أعضاء "+repBoardWord}`, body: `<p>${orgEsc(manualValues.related_party_contracts||"—")}</p>` },
    { key:"all", num:"رابع عشر", title:"توزيعات الأرباح", body: `<p>${orgEsc(manualValues.dividends||"—")}</p>` },
    { key:"declarations", num:"خامس عشر", title:`إقرارات ${repBoardWord}`, body: `<p>${orgEsc(manualValues.declarations||"—")}</p>` },
    { key:"all", num:"", title:"أبرز القرارات الصادرة هذا العام", body: decisionsList }
  ];
  const hideKeysNonJointStock = ["compliance","share_registry"];
  const hideKeysSoleProp = ["board","directorships","committees","internal_control","declarations"];
  sections = sections.filter(s => {
    if((repIsSoleProp || repIsLLC) && hideKeysNonJointStock.includes(s.key)) return false;
    if(repIsSoleProp && hideKeysSoleProp.includes(s.key)) return false;
    return true;
  });
  const ORDINALS = ["أولاً","ثانياً","ثالثاً","رابعاً","خامساً","سادساً","سابعاً","ثامناً","تاسعاً","عاشراً","حادي عشر","ثاني عشر","ثالث عشر","رابع عشر","خامس عشر"];
  let ordinalIdx = 0;
  sections.forEach(s => { if(s.num !== "") s.num = ORDINALS[ordinalIdx++]; });

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${repTitle} ${currentYear}</title>
    <style>
      @page{ margin:2cm 1.8cm; }
      *{ box-sizing:border-box; }
      body{ font-family:'Tajawal',Arial,sans-serif; color:#0D2447; font-size:12.5px; line-height:1.9; margin:0; }
      .cover{
        background:linear-gradient(135deg,#1A3A6B,#2E5AA8); color:#fff; text-align:center;
        padding:60px 30px; border-radius:0 0 24px 24px; margin-bottom:30px;
      }
      .cover .kingdom{ font-size:11px; letter-spacing:3px; color:rgba(255,255,255,0.65); margin-bottom:14px; }
      .cover .company{ font-size:26px; font-weight:900; color:#D4AF37; margin-bottom:10px; }
      .cover .title{ font-size:18px; font-weight:700; margin-top:14px; }
      .cover .period{ font-size:13px; color:rgba(255,255,255,0.75); margin-top:6px; }
      .kpis{ display:flex; justify-content:center; gap:14px; margin:-40px 30px 30px; flex-wrap:wrap; }
      .kpi-box{ background:#fff; border:1px solid #E4E9F0; border-radius:10px; padding:14px 18px; text-align:center; box-shadow:0 4px 14px rgba(10,22,40,0.08); min-width:110px; }
      .kpi-box .val{ font-size:22px; font-weight:900; color:#1A3A6B; }
      .kpi-box .lbl{ font-size:10px; color:#8B95A5; margin-top:4px; }
      .section{ padding:0 4px; margin-bottom:22px; page-break-inside:avoid; }
      .section h2{ font-size:14.5px; font-weight:800; color:#1A3A6B; border-bottom:2px solid #D4AF37; padding-bottom:8px; margin-bottom:10px; }
      .section h2 .num{ color:#D4AF37; margin-left:6px; }
      .section p{ color:#33475B; margin:0 0 6px; }
      table{ width:100%; border-collapse:collapse; margin-top:6px; font-size:11.5px; }
      th,td{ border:1px solid #D8DEE8; padding:7px 9px; text-align:right; }
      th{ background:#EAF0F8; color:#1A3A6B; font-weight:800; }
      ul{ margin:4px 0; padding-right:20px; color:#33475B; }
      .footer{ margin-top:40px; padding:14px; background:#F5F7FA; border-radius:8px; font-size:10.5px; color:#8B95A5; text-align:center; }
      @media print{ .cover{ border-radius:0; } }
    </style></head>
    <body>
      <div class="cover">
        <div class="kingdom">المملكة العربية السعودية</div>
        <div class="company">${companyName}</div>
        <div class="title">${repTitle}</div>
        <div class="period">للسنة المالية المنتهية في 31 ديسمبر ${currentYear}</div>
      </div>
      <div class="kpis">
        <div class="kpi-box"><div class="val">${boardMeetingsThisYear.length}</div><div class="lbl">اجتماعات المجلس</div></div>
        <div class="kpi-box"><div class="val">${decisionsThisYear.length}</div><div class="lbl">قراراً موقّعًا</div></div>
        <div class="kpi-box"><div class="val">${compliancePct!=null?compliancePct+'%':'—'}</div><div class="lbl">نسبة الامتثال</div></div>
        <div class="kpi-box"><div class="val">${committeesData.length}</div><div class="lbl">لجان نشطة</div></div>
      </div>
      ${sections.map(s => `<div class="section"><h2>${s.num?`<span class="num">${s.num}:</span>`:''}${orgEsc(s.title)}</h2>${s.body}</div>`).join("")}
      <div class="footer">تقرير مبني على بيانات المنصة الحقيقية بتاريخ ${dateNow} — طبقًا للمادة (90) من لائحة حوكمة الشركات الصادرة عن هيئة السوق المالية.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
    </body></html>
  `);
  w.document.close();
}
