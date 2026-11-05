/* ══════════ FINANCIAL & OPERATIONAL INDICATORS (Excel round-trip) ══════════ */
/* ══════════ CEO MONTHLY REPORT — full replacement of the old financial indicators system ══════════ */

/* ══════════ FINANCIAL & OPERATIONAL REPORT v2 — trimmed to 15 sections per feedback ══════════ */

function downloadIndicatorsTemplate(){
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, colW) => {
    if(name.length > 31){ console.error("Sheet name exceeds 31 chars:", name); alert("خطأ داخلي: اسم ورقة طويل جدًا (\""+name+"\") — تواصل مع الدعم الفني."); throw new Error("sheet name too long"); }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = (colW||[55,30]).map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  try{

  addSheet("١-لوحة المؤشرات", [
    ["الفترة (مثال: يونيو 2026)", "", "", "", ""],
    ["المؤشر", "المستهدف", "الفعلي", "الشهر السابق", "نفس الشهر بالعام السابق"],
    ["الإيرادات", "", "", "", ""],
    ["المبيعات", "", "", "", ""],
    ["إجمالي الربح", "", "", "", ""],
    ["هامش الربح", "", "", "", ""],
    ["صافي الربح", "", "", "", ""],
    ["التدفق النقدي", "", "", "", ""],
    ["النقد المتوفر", "", "", "", ""],
    ["الذمم المدينة", "", "", "", ""],
    ["الذمم الدائنة", "", "", "", ""],
    ["حجم المبيعات المستهدف", "", "", "", ""],
    ["نسبة تحقيق الموازنة", "", "", "", ""],
    ["عدد العملاء", "", "", "", ""],
    ["العملاء الجدد", "", "", "", ""],
    ["نسبة الاحتفاظ بالعملاء", "", "", "", ""],
    ["عدد الموظفين", "", "", "", ""],
    ["معدل دوران الموظفين", "", "", "", ""],
    ["المشاريع الجارية", "", "", "", ""],
    ["نسبة إنجاز المشاريع", "", "", "", ""]
  ], [30,16,16,18,22]);

  addSheet("٢-الأداء المالي", [
    ["الإيرادات (ريال)", ""],
    ["إجمالي الربح (ريال)", ""],
    ["إجمالي المصروفات (ريال)", ""],
    ["المصروفات الإدارية (ريال)", ""],
    ["مصروفات المبيعات والتسويق (ريال)", ""],
    ["الرواتب (ريال)", ""]
  ]);

  addSheet("٣-المبيعات", [
    ["المبيعات الشهرية (ريال)", ""],
    ["المستهدف الشهري (ريال)", ""],
    ["المبيعات منذ بداية السنة (ريال)", ""],
    ["عدد العملاء الجدد", ""],
    ["عدد العملاء المتوقفين عن التعامل", ""],
    ["عدد العقود التي تم تقديمها", ""]
  ]);

  addSheet("٤-التشغيل", [
    ["حجم الأعمال المنفذة", ""],
    ["الأعطال والتوقفات", ""],
    ["الإجراءات التصحيحية", ""],
    ["أهم المشكلات التشغيلية", ""]
  ]);

  addSheet("٥-المشاريع", [
    ["اسم المشروع", "القيمة (ريال)", "العميل", "نسبة الإنجاز (%)", "الحالة (🟢 حسب الخطة / 🟡 تحتاج متابعة / 🔴 تحتاج تدخلًا)", "ملاحظات"],
    ["مشروع 1", "", "", "", "", ""],
    ["مشروع 2", "", "", "", "", ""],
    ["مشروع 3", "", "", "", "", ""],
    ["مشروع 4", "", "", "", "", ""],
    ["مشروع 5", "", "", "", "", ""]
  ], [22,16,20,14,38,30]);

  addSheet("٦-الموارد البشرية", [
    ["إجمالي عدد الموظفين", ""],
    ["عدد الموظفين الجدد", ""],
    ["الاستقالات وحالات إنهاء الخدمة", ""],
    ["معدل دوران الموظفين (%)", ""],
    ["الوظائف الشاغرة والحرجة", ""],
    ["الوظائف المطلوب توظيفها", ""],
    ["التدريب وبرامج تطوير الموظفين", ""],
    ["المشاكل العمالية", ""],
    ["احتياجات الشركة المستقبلية من الموظفين", ""]
  ]);

  addSheet("٧-المشتريات", [
    ["إجمالي المشتريات (ريال)", ""],
    ["المشتريات مقارنة بالموازنة", ""],
    ["الموردون الجدد", ""]
  ]);

  addSheet("٨-العملاء وخدمة العملاء", [
    ["عدد العملاء", ""],
    ["العملاء الجدد والمفقودون", ""],
    ["معدل الاحتفاظ بالعملاء (%)", ""],
    ["مستوى رضا العملاء", ""],
    ["عدد الشكاوى وطبيعتها", ""],
    ["زمن معالجة الشكاوى والشكاوى التي لم تُغلق", ""],
    ["أهم العملاء", ""],
    ["العملاء المعرضون لخطر فقدانهم", ""],
    ["الإجراءات المتخذة لتحسين رضا العملاء", ""]
  ]);

  addSheet("٩-التسويق", [
    ["الحملات التسويقية المنفذة وتكلفتها ونتائجها", ""],
    ["العملاء الناتجون عن الحملات", ""],
    ["أداء الموقع الإلكتروني ووسائل التواصل الاجتماعي", ""],
    ["تقييم أداء الشركة مقارنة بالمنافسين", ""],
    ["الفرص التسويقية الجديدة", ""]
  ]);

  addSheet("١٠-الشؤون القانونية والعقود", [
    ["القضايا القائمة والجديدة والتي أُغلقت", ""],
    ["قيمة المطالبات", ""],
    ["العقود الجديدة والتي تحتاج مراجعة والتي انتهت أو ستنتهي", ""],
    ["النزاعات مع العملاء والموردين", ""],
    ["المخاطر القانونية والالتزامات المحتملة", ""]
  ]);

  addSheet("١١-الشركات التابعة والفروع", [
    ["اسم الشركة/الفرع", "هل التشغيل يسير بشكل سليم؟", "المشاكل إن وجدت"],
    ["شركة/فرع 1", "", ""],
    ["شركة/فرع 2", "", ""],
    ["شركة/فرع 3", "", ""],
    ["شركة/فرع 4", "", ""],
    ["شركة/فرع 5", "", ""]
  ], [30,28,45]);

  addSheet("١٢-الأداء مقابل الموازنة", [
    ["الإيرادات: المخطط مقابل الفعلي", ""],
    ["الأرباح: المخطط مقابل الفعلي", ""],
    ["المصروفات: المخطط مقابل الفعلي", ""],
    ["التدفقات النقدية: المخطط مقابل الفعلي", ""],
    ["المبيعات: المخطط مقابل الفعلي", ""],
    ["عدد العملاء: المخطط مقابل الفعلي", ""],
    ["المشاريع: المخطط مقابل الفعلي", ""],
    ["الاستثمارات: المخطط مقابل الفعلي", ""],
    ["الموارد البشرية: المخطط مقابل الفعلي", ""],
    ["أسباب الانحرافات والإجراءات التصحيحية", ""]
  ]);

  addSheet("١٣-التوقعات حتى نهاية السنة", [
    ["الإيرادات المتوقعة حتى نهاية السنة (ريال)", ""],
    ["الأرباح المتوقعة (ريال)", ""],
    ["التدفقات النقدية المتوقعة (ريال)", ""],
    ["المبيعات المتوقعة (ريال)", ""],
    ["العقود المتوقع توقيعها", ""],
    ["المشاريع المتوقع إنجازها", ""],
    ["المخاطر التي قد تؤثر على النتائج", ""],
    ["هل ستتحقق الموازنة السنوية؟", ""],
    ["هل هناك حاجة لتعديل التوقعات؟", ""]
  ]);

  addSheet("١٤-أهم التحديات", [
    ["التحدي — المشكلة", "الأثر — ما قامت به الإدارة — النتيجة — ما تحتاجه الإدارة"],
    ["تحدٍ 1", ""], ["تحدٍ 2", ""], ["تحدٍ 3", ""], ["تحدٍ 4", ""], ["تحدٍ 5", ""],
    ["تحدٍ 6", ""], ["تحدٍ 7", ""], ["تحدٍ 8", ""]
  ], [35,60]);

  addSheet("١٥-أولويات الشهر القادم", [
    ["الأولوية 1", ""], ["الأولوية 2", ""], ["الأولوية 3", ""], ["الأولوية 4", ""],
    ["الأولوية 5", ""], ["الأولوية 6", ""], ["الأولوية 7", ""], ["الأولوية 8", ""]
  ]);

  XLSX.writeFile(wb, "التقرير-المالي-والتشغيلي.xlsx");
  }catch(e){
    if(e.message !== "sheet name too long"){ alert("تعذّر توليد النموذج: " + e.message); }
  }
}

function numOrNull(v){
  if(v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function textOr(v){ return (v===undefined||v===null) ? "" : String(v).trim(); }

const SEC_KEY_MAPS = {
  financial: ["revenue","gross_profit","total_expenses","admin_expenses","sales_marketing_expenses","salaries"],
  sales: ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"],
  operations: ["work_volume","breakdowns_downtime","corrective_actions","operational_issues"],
  hr: ["total_employees","new_employees","resignations","turnover_rate","vacant_critical_roles","roles_to_hire","training","labor_issues","future_needs"],
  procurement: ["total_purchases","purchases_vs_budget","new_suppliers"],
  customers: ["customer_count","new_lost_customers","retention_rate","satisfaction_level","complaints_count","complaints_resolution","top_customers","at_risk_customers","improvement_actions"],
  marketing: ["campaigns","campaign_customers","digital_performance","vs_competitors","new_opportunities"],
  legal: ["legal_cases","claims_value","contracts_status","disputes","legal_risks"],
  budget: ["revenue_vs_plan","profit_vs_plan","expenses_vs_plan","cashflow_vs_plan","sales_vs_plan","customers_vs_plan","projects_vs_plan","investments_vs_plan","hr_vs_plan","variance_reasons"],
  forecast: ["expected_revenue","expected_profit","expected_cashflow","expected_sales","expected_contracts","expected_projects","risks_affecting_results","budget_achievable","forecast_adjustment_needed"]
};

// Score decays smoothly the later the report lands in the month — used as one input into the
// CEO's performance evaluation (a late/consistently-late report is treated as a governance
// signal, not just an admin nuisance): on time (day ≤5) = 100%, days 6-7 = 85%, then a gradual
// 5-point drop per additional day, floored at 15% so the score never fully bottoms out to zero.
function computeTimelinessScore(dayOfMonth){
  if(dayOfMonth <= 5) return 100;
  if(dayOfMonth <= 7) return 85;
  return Math.max(15, 85 - (dayOfMonth - 7) * 5);
}

async function handleIndicatorsUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = (name) => {
      const ws = wb.Sheets[name];
      return ws ? XLSX.utils.sheet_to_json(ws, { header: 1 }) : null;
    };

    const rows = {
      kpi: sheet("١-لوحة المؤشرات"),
      financial: sheet("٢-الأداء المالي"),
      sales: sheet("٣-المبيعات"),
      operations: sheet("٤-التشغيل"),
      projects: sheet("٥-المشاريع"),
      hr: sheet("٦-الموارد البشرية"),
      procurement: sheet("٧-المشتريات"),
      customers: sheet("٨-العملاء وخدمة العملاء"),
      marketing: sheet("٩-التسويق"),
      legal: sheet("١٠-الشؤون القانونية والعقود"),
      subsidiaries: sheet("١١-الشركات التابعة والفروع"),
      budget: sheet("١٢-الأداء مقابل الموازنة"),
      forecast: sheet("١٣-التوقعات حتى نهاية السنة"),
      challenges: sheet("١٤-أهم التحديات"),
      priorities: sheet("١٥-أولويات الشهر القادم")
    };
    for(const k in rows){ if(!rows[k]){ alert(`الملف لا يطابق شكل القالب المتوقع (ورقة "${k}" غير موجودة) — الرجاء استخدام القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.`); return; } }

    function buildSimple(sheetRows, keyMap, numericKeys){
      const obj = {};
      keyMap.forEach((key, i) => {
        const raw = sheetRows[i] ? sheetRows[i][1] : undefined;
        obj[key] = (numericKeys && numericKeys.includes(key)) ? numOrNull(raw) : textOr(raw);
      });
      return obj;
    }

    const period_label = textOr(rows.kpi[0] ? rows.kpi[0][1] : "");
    const kpiNames = ["revenue","sales","gross_profit","profit_margin","net_profit","cash_flow","available_cash",
      "receivables","payables","sales_target","budget_achievement_pct","customer_count","new_customers",
      "retention_rate","employee_count","turnover_rate","active_projects","project_completion_pct"];
    const kpiDashboard = kpiNames.map((key, i) => {
      const r = rows.kpi[i+2] || []; // row 0 = period, row 1 = header, data starts row 2
      return { key, name: r[0]||"", target: numOrNull(r[1]), actual: numOrNull(r[2]), prev_month: numOrNull(r[3]), prev_year: numOrNull(r[4]) };
    });

    const financialObj = buildSimple(rows.financial, SEC_KEY_MAPS.financial, SEC_KEY_MAPS.financial);
    const salesObj = buildSimple(rows.sales, SEC_KEY_MAPS.sales, ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"]);
    const operationsObj = buildSimple(rows.operations, SEC_KEY_MAPS.operations, []);
    const projectRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.projects[i]?.[0]), value: numOrNull(rows.projects[i]?.[1]), client: textOr(rows.projects[i]?.[2]),
      completion_pct: numOrNull(rows.projects[i]?.[3]), status: textOr(rows.projects[i]?.[4]), notes: textOr(rows.projects[i]?.[5])
    })).filter(p=>p.name);
    const hrObj = buildSimple(rows.hr, SEC_KEY_MAPS.hr, ["total_employees","new_employees","turnover_rate"]);
    const procurementObj = buildSimple(rows.procurement, SEC_KEY_MAPS.procurement, ["total_purchases"]);
    const customersObj = buildSimple(rows.customers, SEC_KEY_MAPS.customers, ["customer_count","complaints_count"]);
    const marketingObj = buildSimple(rows.marketing, SEC_KEY_MAPS.marketing, []);
    const legalObj = buildSimple(rows.legal, SEC_KEY_MAPS.legal, []);
    const subsidiaryRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.subsidiaries[i]?.[0]), ops_ok: textOr(rows.subsidiaries[i]?.[1]), problems: textOr(rows.subsidiaries[i]?.[2])
    })).filter(s=>s.name);
    const budgetObj = buildSimple(rows.budget, SEC_KEY_MAPS.budget, []);
    const forecastObj = buildSimple(rows.forecast, SEC_KEY_MAPS.forecast, ["expected_revenue","expected_profit","expected_cashflow","expected_sales"]);
    const challengeRows = [1,2,3,4,5,6,7,8].map(i => ({ challenge: textOr(rows.challenges[i]?.[0]), details: textOr(rows.challenges[i]?.[1]) })).filter(c=>c.challenge);
    const priorityRows = rows.priorities.map(r => textOr(r[1])).filter(Boolean);

    const fileUrl = await uploadBlobToStorage(file, "ceo-reports", file.name);

    const payload = {
      company_id: currentCompanyId, period_label,
      uploaded_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", source_file_url: fileUrl,
      submitted_day_of_month: new Date().getDate(), timeliness_score: computeTimelinessScore(new Date().getDate()),
      sec_kpi_dashboard: kpiDashboard,
      sec_financial: financialObj,
      sec_sales: salesObj,
      sec_operations: operationsObj,
      sec_projects: projectRows,
      sec_hr: hrObj,
      sec_procurement: procurementObj,
      sec_customers: customersObj,
      sec_marketing: marketingObj,
      sec_legal: legalObj,
      sec_subsidiaries: subsidiaryRows,
      sec_budget: budgetObj,
      sec_forecast: forecastObj,
      sec_challenges: challengeRows,
      sec_priorities: priorityRows
    };

    let error;
    if(period_label){
      const { data: existing } = await sb.from("ceo_monthly_reports").select("id").eq("company_id", currentCompanyId).eq("period_label", period_label).limit(1);
      if(existing && existing.length){
        if(!await uiConfirm(`يوجد تقرير محفوظ مسبقًا لنفس الفترة "${period_label}" — هل تريد استبداله؟`)){ return; }
        ({ error } = await sb.from("ceo_monthly_reports").update(payload).eq("id", existing[0].id));
      } else {
        ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
      }
    } else {
      ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
    }
    if(error){ alert("تعذّر حفظ البيانات: " + error.message); return; }
    logActivity("إنشاء", "تقرير مالي وتشغيلي", period_label || "فترة جديدة", "استيراد من Excel");
    alert("تم رفع التقرير وحفظه بنجاح ✅");
    input.value = "";
    loadIndicatorsReport();
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه نفس القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.");
  }
}

function fmtNum(n){ return n==null ? "—" : Number(n).toLocaleString("ar-SA-u-ca-gregory"); }
function fieldRow(label, val, isCurrency){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val)+" ريال" : val;
  return `<div style="padding:6px 0;border-bottom:1px solid var(--gray1);font-size:12px"><b style="color:var(--gray3)">${label}:</b> <span style="color:var(--dark)">${display}</span></div>`;
}
function sectionCard(title, innerHtml){
  if(!innerHtml || !innerHtml.trim()) return "";
  return `<div class="card" style="margin-bottom:16px"><div class="card-head"><span class="card-title">${title}</span></div><div class="card-body">${innerHtml}</div></div>`;
}
function tableFromRows(rows, cols){
  if(!rows || rows.length===0) return "";
  const head = cols.map(c=>`<th>${c}</th>`).join("");
  const body = rows.map(r => `<tr>${Object.values(r).map(v=>`<td>${(v!=null&&v!=="")?v:"—"}</td>`).join("")}</tr>`).join("");
  return `<table class="tbl" style="margin-top:6px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
// A small colored "KPI-style" tile — reuses the exact card language already used on the
// dashboard (colored stripe, big bold figure, faint icon watermark) so numeric report fields
// read as a proper statistic instead of a plain text line like "إجمالي الربح: 10000000 ريال".
function statCard(icon, label, val, isCurrency, color){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val) : val;
  return `<div class="kpi ${color||'blue'}" style="padding:14px 16px;min-width:0">
    <div class="kpi-stripe"></div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-val" style="font-size:21px;word-break:break-word">${display}${isCurrency?'<span style="font-size:12px;font-weight:700;color:var(--gray3)"> ريال</span>':''}</div>
    <div class="kpi-icon">${icon}</div>
  </div>`;
}
function statGrid(cards){
  const filled = cards.filter(Boolean);
  if(!filled.length) return "";
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${filled.join("")}</div>`;
}
// For narrative/free-text fields — a labeled callout block instead of a bare "label: value" line.
function textBlock(icon, label, text){
  if(!text) return "";
  return `<div style="background:var(--offwhite);border-radius:10px;padding:10px 14px;margin-top:10px">
    <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:4px">${icon} ${label}</div>
    <div style="font-size:12.5px;color:var(--dark);line-height:1.7">${text}</div>
  </div>`;
}
function textBlocks(items){ return items.filter(Boolean).join(""); }

async function loadIndicatorsReport(){
  const box = document.getElementById("indicatorsReport");
  if(!box) return;
  const pdfBtn = document.getElementById("indicatorsPdfBtn");
  if(pdfBtn) pdfBtn.style.display = isFullAccessRole(getCurrentRole()) ? "inline-block" : "none";
  const { data, error } = await sb.from("ceo_monthly_reports").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1);
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا توجد بيانات مستوردة بعد. نزّل النموذج وابدأ.</div>';
    return;
  }
  const r = data[0];
  const F = r.sec_financial||{}, SA = r.sec_sales||{}, OP = r.sec_operations||{},
        HR = r.sec_hr||{}, PR = r.sec_procurement||{}, CU = r.sec_customers||{},
        MK = r.sec_marketing||{}, LG = r.sec_legal||{},
        BU = r.sec_budget||{}, FC = r.sec_forecast||{};
  const kpis = r.sec_kpi_dashboard||[];
  const projects = r.sec_projects||[];
  const subsidiaries = r.sec_subsidiaries||[];
  const challenges = r.sec_challenges||[];
  const priorities = r.sec_priorities||[];

  const netProfit = (F.revenue!=null && F.total_expenses!=null) ? F.revenue - F.total_expenses : null;

  const kpiRows = kpis.filter(k=>k.name).map(k => {
    const variance = (k.target!=null && k.actual!=null && k.target!==0) ? (((k.actual-k.target)/Math.abs(k.target))*100).toFixed(1)+"%" : "—";
    const varColor = (k.target!=null && k.actual!=null) ? (k.actual>=k.target ? "var(--green)" : "var(--red)") : "var(--gray3)";
    return `<tr><td>${orgEsc(k.name)}</td><td>${fmtNum(k.target)}</td><td>${fmtNum(k.actual)}</td><td>${fmtNum(k.prev_month)}</td><td>${fmtNum(k.prev_year)}</td><td style="color:${varColor};font-weight:700">${variance}</td></tr>`;
  }).join("");

  box.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--primary),var(--primary2));border-radius:12px;padding:14px 18px;margin-bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b>التقرير المالي والتشغيلي — ${r.period_label||"—"}</b>${r.submitted_day_of_month ? `<div style="font-size:11px;opacity:0.85;margin-top:2px">رُفع في اليوم ${r.submitted_day_of_month} من الشهر — درجة الانضباط: ${r.timeliness_score}%</div>` : ""}</div>
      ${r.source_file_url ? `<a href="${r.source_file_url}" target="_blank" style="color:#fff;font-size:11px;text-decoration:underline"><span class="ico-i ico-document"></span>الملف الأصلي</a>` : ""}
    </div>

    ${sectionCard("١) لوحة مؤشرات الأداء الرئيسية — المستهدف مقابل الفعلي والانحراف", kpiRows ? `<table class="tbl"><thead><tr><th>المؤشر</th><th>المستهدف</th><th>الفعلي</th><th>الشهر السابق</th><th>نفس الشهر بالعام السابق</th><th>الانحراف</th></tr></thead><tbody>${kpiRows}</tbody></table>` : "")}

    ${sectionCard("٢) الأداء المالي", statGrid([
      statCard("💰","الإيرادات", F.revenue, true, "blue"),
      statCard("📈","إجمالي الربح", F.gross_profit, true, "green"),
      statCard("📉","إجمالي المصروفات", F.total_expenses, true, "red"),
      statCard("💵","صافي الربح", netProfit, true, "gold"),
      statCard("🏢","المصروفات الإدارية", F.admin_expenses, true, "blue"),
      statCard("📣","مصروفات المبيعات والتسويق", F.sales_marketing_expenses, true, "blue"),
      statCard("👥","الرواتب", F.salaries, true, "blue")
    ]))}

    ${sectionCard("٣) المبيعات", statGrid([
      statCard("🧾","المبيعات الشهرية", SA.monthly_sales, true, "blue"),
      statCard("🎯","المستهدف الشهري", SA.monthly_target, true, "gold"),
      statCard("📊","المبيعات منذ بداية السنة", SA.ytd_sales, true, "blue"),
      statCard("🆕","عملاء جدد", SA.new_customers, false, "green"),
      statCard("⚠️","عملاء متوقفون", SA.lost_customers, false, "red"),
      statCard("📄","عقود مُقدَّمة", SA.submitted_contracts_count, false, "blue")
    ]))}

    ${sectionCard("٤) التشغيل", textBlocks([
      textBlock("⚙️","حجم الأعمال المنفذة", OP.work_volume),
      textBlock("🔧","الأعطال والتوقفات", OP.breakdowns_downtime),
      textBlock("✅","الإجراءات التصحيحية", OP.corrective_actions),
      textBlock("❗","أهم المشكلات التشغيلية", OP.operational_issues)
    ]))}

    ${sectionCard("٥) المشاريع", tableFromRows(projects.map(p=>({
      name: p.name, value: p.value!=null?fmtNum(p.value)+" ريال":"—", client: p.client,
      completion: p.completion_pct!=null?p.completion_pct+"%":"—", status: p.status, notes: p.notes
    })), ["المشروع","القيمة","العميل","نسبة الإنجاز","الحالة","ملاحظات"]))}

    ${sectionCard("٦) الموارد البشرية", statGrid([
      statCard("👥","إجمالي الموظفين", HR.total_employees, false, "blue"),
      statCard("🆕","موظفون جدد", HR.new_employees, false, "green"),
      statCard("📉","معدل الدوران", HR.turnover_rate, false, "red")
    ]) + textBlocks([
      textBlock("👋","الاستقالات وإنهاء الخدمة", HR.resignations),
      textBlock("🪑","الوظائف الشاغرة والحرجة", HR.vacant_critical_roles),
      textBlock("📋","الوظائف المطلوب توظيفها", HR.roles_to_hire),
      textBlock("🎓","التدريب والتطوير", HR.training),
      textBlock("⚠️","المشاكل العمالية", HR.labor_issues),
      textBlock("🔮","الاحتياجات المستقبلية", HR.future_needs)
    ]))}

    ${sectionCard("٧) المشتريات", statGrid([
      statCard("📦","إجمالي المشتريات", PR.total_purchases, true, "blue")
    ]) + textBlocks([
      textBlock("📊","المشتريات مقارنة بالموازنة", PR.purchases_vs_budget),
      textBlock("🆕","الموردون الجدد", PR.new_suppliers)
    ]))}

    ${sectionCard("٨) العملاء وخدمة العملاء", statGrid([
      statCard("👤","عدد العملاء", CU.customer_count, false, "blue"),
      statCard("💬","عدد الشكاوى", CU.complaints_count, false, "red")
    ]) + textBlocks([
      textBlock("🔄","عملاء جدد ومفقودون", CU.new_lost_customers),
      textBlock("💚","معدل الاحتفاظ بالعملاء", CU.retention_rate),
      textBlock("😊","مستوى الرضا", CU.satisfaction_level),
      textBlock("⏱️","زمن المعالجة والشكاوى المفتوحة", CU.complaints_resolution),
      textBlock("⭐","أهم العملاء", CU.top_customers),
      textBlock("⚠️","عملاء معرّضون لخطر الفقدان", CU.at_risk_customers),
      textBlock("✅","إجراءات تحسين الرضا", CU.improvement_actions)
    ]))}

    ${sectionCard("٩) التسويق", textBlocks([
      textBlock("📣","الحملات التسويقية", MK.campaigns),
      textBlock("🆕","عملاء ناتجون عن الحملات", MK.campaign_customers),
      textBlock("💻","الأداء الرقمي", MK.digital_performance),
      textBlock("🏁","تقييم الأداء مقارنة بالمنافسين", MK.vs_competitors),
      textBlock("💡","فرص تسويقية جديدة", MK.new_opportunities)
    ]))}

    ${sectionCard("١٠) الشؤون القانونية والعقود", textBlocks([
      textBlock("⚖️","القضايا", LG.legal_cases),
      textBlock("💰","قيمة المطالبات", LG.claims_value),
      textBlock("📄","حالة العقود", LG.contracts_status),
      textBlock("🤝","النزاعات", LG.disputes),
      textBlock("⚠️","المخاطر القانونية", LG.legal_risks)
    ]))}

    ${sectionCard("١١) الشركات التابعة والفروع", tableFromRows(subsidiaries, ["الشركة/الفرع","التشغيل سليم؟","المشاكل"]))}

    ${sectionCard("١٢) الأداء مقابل الموازنة", textBlocks([
      textBlock("💰","الإيرادات", BU.revenue_vs_plan), textBlock("📈","الأرباح", BU.profit_vs_plan), textBlock("📉","المصروفات", BU.expenses_vs_plan),
      textBlock("💵","التدفقات النقدية", BU.cashflow_vs_plan), textBlock("🧾","المبيعات", BU.sales_vs_plan), textBlock("👤","عدد العملاء", BU.customers_vs_plan),
      textBlock("🏗️","المشاريع", BU.projects_vs_plan), textBlock("📊","الاستثمارات", BU.investments_vs_plan), textBlock("👥","الموارد البشرية", BU.hr_vs_plan),
      textBlock("❗","أسباب الانحرافات والإجراءات", BU.variance_reasons)
    ]))}

    ${sectionCard("١٣) التوقعات حتى نهاية السنة", statGrid([
      statCard("💰","الإيرادات المتوقعة", FC.expected_revenue, true, "blue"),
      statCard("📈","الأرباح المتوقعة", FC.expected_profit, true, "green"),
      statCard("💵","التدفقات النقدية المتوقعة", FC.expected_cashflow, true, "gold"),
      statCard("🧾","المبيعات المتوقعة", FC.expected_sales, true, "blue")
    ]) + textBlocks([
      textBlock("📄","العقود المتوقع توقيعها", FC.expected_contracts),
      textBlock("🏗️","المشاريع المتوقع إنجازها", FC.expected_projects),
      textBlock("⚠️","مخاطر مؤثرة على النتائج", FC.risks_affecting_results),
      textBlock("❓","هل ستتحقق الموازنة السنوية؟", FC.budget_achievable),
      textBlock("🔧","حاجة لتعديل التوقعات؟", FC.forecast_adjustment_needed)
    ]))}

    ${sectionCard("١٤) أهم التحديات", tableFromRows(challenges, ["التحدي","التفاصيل"]))}

    ${sectionCard("١٥) أولويات الشهر القادم", priorities.length ? `<ol style="margin:0;padding-inline-start:18px;font-size:12px;line-height:2">${priorities.map(p=>`<li>${p}</li>`).join("")}</ol>` : "")}
  `;
}

function exportIndicatorsPDF(){
  const reportBox = document.getElementById("indicatorsReport");
  if(!reportBox || !reportBox.querySelector(".card")){ alert("لا توجد بيانات مرفوعة بعد لتصديرها."); return; }
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التصدير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التقرير المالي والتشغيلي — ${companyName}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      .card-title,.card-head{font-size:14px;font-weight:800;color:#1A3A6B;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right;font-size:11px}
      th{background:#1A3A6B;color:#fff}
      .card{border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:12px;page-break-inside:avoid}
      a{display:none}
    </style></head><body>
    <h1><span class="ico-i ico-dashboard"></span>التقرير المالي والتشغيلي — ${companyName}</h1>
    <p>تاريخ التصدير: ${dateNow}</p>
    ${reportBox.innerHTML}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
    </body></html>
  `);
  w.document.close();
}
