/* ══════════ RISK SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const RISK_STATUS_ORDER = ["تم الاستلام","بانتظار رد العميل","قيد التحليل","قيد المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const RISK_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "بانتظار رد العميل":"#D9822B", "قيد التحليل":"var(--gold)", "قيد المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };

function riskLevelInfo(likelihood, impact){
  if(likelihood==null || impact==null) return { label:"—", color:"var(--gray3)" };
  const score = likelihood * impact;
  if(score >= 16) return { label:"عالٍ جداً", color:"#C0392B" };
  if(score >= 10) return { label:"عالٍ", color:"#E67E22" };
  if(score >= 5) return { label:"متوسط", color:"#F1C40F" };
  return { label:"منخفض", color:"#27AE60" };
}

/* متابعة خطط المعالجة: خطط المخاطر المعتمدة فقط، مرتبة بالمتأخر أولاً، وللمسؤول تحديث الحالة */
/* عرض/طباعة تقرير المخاطر (من report_content) — يستخدمه المستشار والعميل */
async function riskReportView(requestId){
  const [{ data: r }, { data: items }] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r || !r.report_content){ alert("لا يوجد تقرير محفوظ لهذا الطلب بعد."); return; }
  let coName = "";
  try{ const { data: c } = await sb.from("companies").select("name").eq("id", r.company_id).single(); coName = c ? c.name : ""; }catch(e){}
  const c = r.report_content, list = items || [];
  const dstr0 = new Date().toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"long",year:"numeric"});
  const w = openPrintWindow(); if(!w){ alert("اسمح بالنوافذ المنبثقة للطباعة"); return; }
  const E = orgEsc, para = t => E(t||"").split(/\n+/).filter(Boolean).map(x => `<p>${x}</p>`).join("");
  const ul = a => (a||[]).length ? `<ol>${a.map(x => `<li>${E(x)}</li>`).join("")}</ol>` : "<p>—</p>";
  const cells = {};
  list.forEach((it,i) => { if(it.likelihood!=null && it.impact!=null){ const k = it.likelihood+"-"+it.impact; (cells[k] = cells[k] || []).push(i+1); } });
  let mx = '<table class="mx"><tr><td class="ax"></td>' + [1,2,3,4,5].map(n => `<td class="ax">${n}</td>`).join("") + '</tr>';
  for(let l=5; l>=1; l--){
    mx += `<tr><td class="ax">${l}</td>` + [1,2,3,4,5].map(im => { const inf = riskLevelInfo(l, im); return `<td style="background:${inf.color}">${(cells[l+"-"+im]||[]).map(n => `<span class="dot">${n}</span>`).join("")}</td>`; }).join("") + "</tr>";
  }
  mx += '</table><div class="axl">التأثير ← &nbsp;&nbsp;|&nbsp;&nbsp; ↑ الاحتمالية</div>';
  const reg = list.map((it,i) => { const inf = riskLevelInfo(it.likelihood, it.impact); return `<tr><td>${i+1}</td><td style="text-align:right">${E(it.description||"")}</td><td>${E(it.category||"—")}</td><td>${it.likelihood??"—"}</td><td>${it.impact??"—"}</td><td style="background:${inf.color};color:#fff;font-weight:700">${inf.label}</td></tr>`; }).join("");
  const plans = list.map((it,i) => `<tr><td>${i+1}</td><td style="text-align:right">${E(it.treatment_plan||"—")}</td><td>${E(it.responsible_person||"—")}</td><td>${E(it.target_close_date||"—")}</td></tr>`).join("");
  let consName = r.assigned_consultant_email || "—";
  try{ if(r.assigned_consultant_email){ const { data: cp } = await sb.from("user_profiles").select("full_name").ilike("email", r.assigned_consultant_email).maybeSingle(); if(cp && cp.full_name) consName = cp.full_name; } }catch(e){}
  const approvedAt = (c.approved_at && !r.pending_final_approval && (r.status === "تقرير نهائي جاهز" || r.status === "مغلق")) ? new Date(c.approved_at).toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"long",year:"numeric"}) : ((!r.pending_final_approval && (r.status === "تقرير نهائي جاهز" || r.status === "مغلق")) ? dstr0 : "");
  const cnt = { "عالٍ جداً":0, "عالٍ":0, "متوسط":0, "منخفض":0 };
  list.forEach(it => { const l = riskLevelInfo(it.likelihood, it.impact).label; if(cnt[l] != null) cnt[l]++; });
  const stat = (n, t, col) => `<div class="st"><div class="n" style="color:${col}">${n}</div><div class="t">${t}</div></div>`;
  const dstr = new Date().toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"long",year:"numeric"});
  const ref = "RSK-" + new Date().getFullYear() + "-" + String(requestId).padStart(4,"0");
  let sec = 0; const H = t => `<h2><span class="no">${++sec}</span>${t}</h2>`;
  w.document.open();
  w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير تقييم المخاطر — ${E(coName)}</title><style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
  @page{size:A4;margin:14mm 13mm 18mm}
  *{box-sizing:border-box}
  body{font-family:Tajawal,Arial,sans-serif;color:#0D2447;line-height:1.95;font-size:13px;margin:0;padding:0 4px}
  .hero{background:#0D2447;color:#fff;border-radius:10px;padding:22px 26px;margin-bottom:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hero .brand{color:#D4AF37;font-weight:800;font-size:13px;letter-spacing:.5px}
  .hero h1{font-size:25px;margin:6px 0 2px}.hero .co{font-size:15px;font-weight:700}
  .hero .meta2{display:flex;gap:22px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;color:#C9D4E6}
  .info{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .info div{border:1px solid #D9DEE8;border-radius:8px;padding:7px 12px;background:#F8F9FC;font-size:12px;break-inside:avoid}
  .info b{display:block;color:#6B7690;font-size:10.5px;font-weight:700}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
  .st{border:1px solid #D9DEE8;border-radius:10px;text-align:center;padding:8px 4px;break-inside:avoid}.st .n{font-size:24px;font-weight:800;line-height:1.3}.st .t{font-size:11px;color:#6B7690}
  h2{font-size:15.5px;margin:20px 0 6px;display:flex;align-items:center;gap:8px;break-after:avoid;page-break-after:avoid}
  h2 .no{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#D4AF37;color:#0D2447;font-size:12px;font-weight:800;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  p{margin:0 0 6px;text-align:justify}ol{margin:4px 0;padding-right:22px}li{margin-bottom:4px;break-inside:avoid}
  table{width:100%;border-collapse:collapse;margin-top:6px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
  th,td{border:1px solid #D0D6E2;padding:6px 8px;font-size:11.5px;text-align:center;vertical-align:middle}
  th{background:#1A3A6B;color:#fff;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.l{text-align:right}
  .chip{display:inline-block;border-radius:12px;padding:1px 10px;color:#fff;font-weight:700;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .mxw{break-inside:avoid;text-align:center;margin-top:6px}
  .mx{width:auto;margin:6px auto 2px;direction:ltr;border-collapse:separate;border-spacing:3px}.mx td{width:62px;height:46px;border:none;border-radius:6px;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mx td.ax{background:none;width:26px;height:auto;color:#6B7690;font-weight:700}
  .dot{display:inline-block;width:20px;height:20px;line-height:20px;border-radius:50%;background:#fff;color:#0D2447;font-weight:800;font-size:11px;margin:1px}
  .axl{font-size:11px;color:#6B7690;font-weight:700}
  .esig{display:flex;gap:16px;margin-top:30px;break-inside:avoid}
  .esig .box{flex:1;border:1.5px solid #1A3A6B;border-radius:10px;text-align:center;padding:12px 8px;background:#F8F9FC}
  .esig .h{font-size:11px;color:#6B7690;font-weight:700}.esig .nm{font-size:15px;font-weight:800;margin:2px 0}.esig .sm{font-size:11.5px;color:#444}
  .esig .ok{display:inline-block;margin-top:8px;border:1.5px solid #1B8A52;color:#1B8A52;border-radius:6px;padding:2px 12px;font-size:11.5px;font-weight:800;transform:rotate(-2deg)}
  .note{font-size:10.5px;color:#7a8296;margin-top:22px;border-top:1px solid #ddd;padding-top:8px}
  .foot{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:10px;color:#8a93a6;border-top:1px solid #e2e5ec;padding-top:4px;background:#fff}
  </style></head><body>
  <div class="foot">${E(ref)} — تقرير تقييم المخاطر — ${E(coName)} — سرّي</div>
  <div class="hero"><div class="brand">حوكم · HWKM</div><h1>تقرير تقييم المخاطر المؤسسية</h1><div class="co">${E(coName)}</div>
    <div class="meta2"><span>رقم التقرير: ${E(ref)}</span><span>تاريخ الإصدار: ${dstr}</span></div></div>
  <div class="info"><div><b>القطاع</b>${E(r.sector||"—")}</div><div><b>نطاق التقييم</b>${E(r.scope||"—")}</div><div><b>أنواع المخاطر المطلوبة</b>${E(r.risk_types_needed||"—")}</div></div>
  <div class="stats">${stat(cnt["عالٍ جداً"],"عالٍ جداً","#C0392B")}${stat(cnt["عالٍ"],"عالٍ","#E67E22")}${stat(cnt["متوسط"],"متوسط","#D4A60A")}${stat(cnt["منخفض"],"منخفض","#27AE60")}</div>
  ${H("الملخص التنفيذي")}${para(c.executive_summary)}
  ${H("منهجية التقييم")}${para(c.methodology)}
  ${H("المصفوفة الحرارية")}<div class="mxw">${mx}</div>
  ${H("سجل المخاطر")}<table><thead><tr><th style="width:30px">#</th><th>الخطر</th><th>الفئة</th><th>الاحتمالية</th><th>التأثير</th><th>المستوى</th></tr></thead><tbody>${list.map((it,i) => { const inf = riskLevelInfo(it.likelihood, it.impact); return `<tr><td>${i+1}</td><td class="l">${E(it.description||"")}</td><td>${E(it.category||"—")}</td><td>${it.likelihood??"—"}</td><td>${it.impact??"—"}</td><td><span class="chip" style="background:${inf.color}">${inf.label}</span></td></tr>`; }).join("")}</tbody></table>
  ${H("أبرز النتائج")}${ul(c.key_findings)}
  ${H("خطط المعالجة")}<table><thead><tr><th style="width:30px">#</th><th>الخطر</th><th>خطة المعالجة</th><th>المسؤول</th><th>الموعد المستهدف</th></tr></thead><tbody>${list.map((it,i) => `<tr><td>${i+1}</td><td class="l">${E(it.description||"")}</td><td class="l">${E(it.treatment_plan||"—")}</td><td>${E(it.responsible_person||"—")}</td><td style="white-space:nowrap">${E(it.target_close_date||"—")}</td></tr>`).join("")}</tbody></table>
  ${H("التوصيات")}${ul(c.recommendations)}
  ${H("الخاتمة")}${para(c.conclusion)}
  <div class="esig">
    <div class="box"><div class="h">أعدّه</div><div class="nm">${E(consName)}</div><div class="sm">مستشار المخاطر المختص</div><div class="ok">✔ توقيع إلكتروني</div></div>
    <div class="box"><div class="h">اعتمده</div><div class="nm">إدارة حوكم</div><div class="sm">الرئيس التنفيذي${approvedAt ? " — " + E(approvedAt) : " — بانتظار الاعتماد النهائي"}</div><div class="ok" style="${approvedAt ? "" : "color:#B8610A;border-color:#B8610A"}">${approvedAt ? "✔ اعتماد إلكتروني" : "⏳ لم يُعتمد بعد"}</div></div>
  </div>
  <div style="font-size:10.5px;color:#6B7690;text-align:center;margin-top:6px">التوقيع والاعتماد إلكترونيان مسجَّلان في منصة حوكم برقم التقرير ${E(ref)}، وهما نافذان دون حاجة لتوقيع ورقي.</div>
  <div class="note">${c.ai ? "أُعدّت مسودة هذا التقرير بمساعدة الذكاء الاصطناعي ثم راجعها وعدّلها المستشار المختص. " : ""}يعتمد التقرير على المعلومات المقدَّمة من الشركة وقت التقييم، ولا يُغني عن المراجعة الدورية للمخاطر.</div>
  </body></html>`);
  w.document.close();
}

async function loadRiskTreatments(){
  const sec = document.getElementById("riskTreatmentSection"), body = document.getElementById("riskTreatmentBody");
  if(!sec || !body) return;
  let risks = [];
  try{ risks = await fetchCompanyRisks(); }catch(e){}
  if(!risks.length){ sec.style.display = "none"; return; }
  sec.style.display = "";
  const today = new Date(new Date().toDateString());
  const info = r => {
    const due = r.target_close_date ? new Date(r.target_close_date) : null;
    const days = due ? Math.round((due - today) / 86400000) : null;
    const done = r.action_status === "مكتمل";
    const late = !done && due && days < 0;
    const soon = !done && due && days >= 0 && days <= 14;
    return { due, days, done, late, soon };
  };
  const rows = risks.map(r => ({ r, i: info(r) })).sort((a,b) => (b.i.late - a.i.late) || (b.i.soon - a.i.soon) || (a.i.done - b.i.done));
  const cnt = { all: rows.length, late: rows.filter(x => x.i.late).length, prog: rows.filter(x => !x.i.done && x.r.action_status === "قيد التنفيذ").length, done: rows.filter(x => x.i.done).length };
  const box = (n, t, c) => `<div style="flex:1;min-width:90px;background:#fff;border:1px solid var(--gray1);border-radius:10px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:900;color:${c}">${n}</div><div style="font-size:11px;color:var(--gray3)">${t}</div></div>`;
  const stCol = { "معلّق":"#8A8F98", "قيد التنفيذ":"#D9822B", "مكتمل":"#1B8A52" };
  body.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${box(cnt.all,"إجمالي الخطط","var(--dark)")}${box(cnt.prog,"قيد التنفيذ","#D9822B")}${box(cnt.late,"متأخرة", cnt.late ? "var(--red)" : "var(--gray3)")}${box(cnt.done,"مكتملة","#1B8A52")}</div>
  <div class="card"><div class="card-body" style="padding:0;overflow-x:auto"><table class="tbl">
    <thead><tr><th>الخطر</th><th>خطة المعالجة</th><th>المسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead>
    <tbody>${rows.map(({r,i}) => `<tr>
      <td style="font-weight:700;font-size:12px">${orgEsc(r.risk_name||"—")}<div style="font-size:10.5px;font-weight:400;color:var(--gray3)">التأثير: ${orgEsc(r.impact)}</div></td>
      <td style="font-size:11.5px;max-width:240px">${orgEsc(r.treatment_plan||"— لا توجد خطة")}</td>
      <td style="font-size:11.5px">${orgEsc(r.owner||"—")}</td>
      <td style="font-size:11.5px;white-space:nowrap">${r.target_close_date ? orgEsc(r.target_close_date) : "—"}${i.late ? `<div style="color:var(--red);font-weight:800;font-size:10.5px">متأخرة ${Math.abs(i.days)} يوم</div>` : i.soon ? `<div style="color:#B8610A;font-weight:700;font-size:10.5px">بعد ${i.days} يوم</div>` : ""}</td>
      <td><select class="fs" style="font-size:11px;padding:4px;color:${stCol[r.action_status]||'inherit'};font-weight:700" onchange="updateRiskTreatmentStatus(${r.id},this.value)">${["معلّق","قيد التنفيذ","مكتمل"].map(x => `<option ${r.action_status===x?"selected":""}>${x}</option>`).join("")}</select></td>
    </tr>`).join("")}</tbody></table></div></div>`;
}
async function updateRiskTreatmentStatus(itemId, action_status){
  const { error } = await sb.from("risk_items").update({ action_status }).eq("id", itemId);
  if(error){ alert(/row-level security|permission denied/i.test(error.message||"") ? "ليست لديك صلاحية تحديث خطط المعالجة بهذا الحساب." : "تعذّر التحديث: " + error.message); }
  else logActivity("تعديل", "خطة معالجة خطر", action_status, "");
  loadRiskTreatments();
}

async function loadRisks(){
  loadRiskTreatments();
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
  { const ak = document.getElementById("rnr-paid-ack"); if(ak) ak.checked = false; const n = document.getElementById("rnr-paid-note"); if(n) n.style.display = (typeof currentCompanyTrialEndsAt !== "undefined" && currentCompanyTrialEndsAt && new Date(currentCompanyTrialEndsAt) > new Date()) ? "" : "none"; }
  openM("m-risk-new-request");
}

async function submitRiskRequest(){
  { const n = document.getElementById("rnr-paid-note"), ak = document.getElementById("rnr-paid-ack"); if(n && n.style.display !== "none" && ak && !ak.checked){ alert("يلزم الإقرار بأن هذه خدمة مدفوعة قبل إرسال الطلب (الخانة أعلى النموذج)."); n.scrollIntoView({ block: "center" }); return; } }
  const service_type_id = Number(document.getElementById("rnr-service-id").value);
  const client_name = document.getElementById("rnr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("rnr-sector").value.trim();
  const scope = document.getElementById("rnr-scope").value.trim();
  const preferred_date = document.getElementById("rnr-date").value || null;
  const risk_types_needed = [...document.querySelectorAll(".rnr-risktype-chk:checked")].map(c=>c.value).join("، ");
  if(!sector){ alert("الرجاء إدخال قطاع الشركة"); return; }
  if(scope.length < 15){ alert("الرجاء وصف نطاق التقييم بوضوح (قسم أو عملية أو مشروع) في سطر أو سطرين على الأقل، ليتمكّن المستشار من فهم طلبك"); return; }
  if(!risk_types_needed){ alert("الرجاء اختيار نوع واحد على الأقل من أنواع المخاطر المطلوب تحليلها"); return; }

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
  await notifyOwnerNewRequest("طلب تقييم مخاطر جديد", [["اسم مقدّم الطلب", client_name],["القطاع", sector],["نطاق التقييم", scope],["أنواع المخاطر", risk_types_needed],["عدد الملفات المرفقة", file_urls.length]]);
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

  const [{ data: r }, { data: items }, { data: messages }, { data: rating }, qRes] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_ratings").select("*").eq("request_id", requestId).limit(1),
    sb.from("risk_questions").select("*").eq("request_id", requestId).eq("sent", true).order("position",{ascending:true}).order("id",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }
  const questions = (qRes && qRes.data) || [];

  document.getElementById("rrd-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");
  const existingRating = (rating||[])[0];

  const statusIdx = RISK_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${RISK_STATUS_ORDER.slice(0,5).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<4?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?RISK_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<4 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
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
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><button class="btn-xs sec" onclick="openGovLinkPicker('risk',${it.id})">🔗 ربط بسياسة أو قرار</button><div class="glinks" id="glk-risk-${it.id}" data-glinks="risk:${it.id}"></div></div>
    </div>`;
  }).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد مخاطر مسجَّلة بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'#E8F0FB':'#F1F1EC'};color:var(--dark);border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br><span style="white-space:pre-line">${orgEsc(m.message)}</span>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const unanswered = questions.filter(q => !q.answer);
  const qaHtml = questions.length ? `<div class="sec-title" style="font-size:13px;margin-top:6px">❓ أسئلة المستشار${unanswered.length ? ` <span style="font-size:11px;color:#B8610A;font-weight:700">— بانتظار ردّك على ${unanswered.length}</span>` : ' <span style="font-size:11px;color:var(--green);font-weight:700">— تمت الإجابة ✓</span>'}</div>
    <div class="card" style="${unanswered.length ? 'border:1.5px solid #E6C766' : ''}"><div class="card-body">
      ${unanswered.length ? '<div style="font-size:12px;color:#8A5A00;margin-bottom:10px">أجب عن كل سؤال ثم اضغط «إرسال الإجابات» ليبدأ المستشار العمل على تقييمك.</div>' : ""}
      ${questions.map((q,i) => `<div style="padding:10px 0;${i? 'border-top:1px dashed var(--gray1);' : ''}">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark)"><span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:11px;align-items:center;justify-content:center;margin-left:6px">${i+1}</span>${orgEsc(q.question)}</div>
        ${q.answer ? `<div style="margin-top:6px;background:#EAF6EF;border-radius:8px;padding:8px 12px;font-size:12px;white-space:pre-line">${orgEsc(q.answer)}</div>`
          : `<textarea class="fi risk-ans-input" data-qid="${q.id}" rows="2" placeholder="اكتب إجابتك هنا..." style="margin-top:6px"></textarea>`}
      </div>`).join("")}
      ${unanswered.length ? `<button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="submitRiskAnswers(${requestId})">إرسال الإجابات</button>` : ""}
    </div></div>` : "";
  const awaitHtml = "";

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
    ${qaHtml}
    <div class="sec-title" style="font-size:13px">🌡️ المصفوفة الحرارية لهذا الطلب</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>المخاطر المسجَّلة وخطط المعالجة</div>
    ${itemsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${(r.report_content && (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") && !r.pending_final_approval) ? `<button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="riskReportView(${requestId})">📄 عرض تقرير المخاطر / طباعة PDF</button>` : ""}${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <details style="margin-top:14px"><summary style="cursor:pointer;font-size:12.5px;font-weight:800"><span class="ico-i ico-message"></span> رسائل إضافية لفريق المخاطر</summary>
    <div class="card" style="margin-top:8px"><div class="card-body">
      <div id="risk-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <textarea class="fi" id="risk-chat-input" rows="3" placeholder="اكتب رسالتك..." style="flex:1;margin:0"></textarea>
        <button class="btn-xs primary" onclick="sendRiskMessage(${requestId})">إرسال</button>
      </div>
    </div></div></details>
    ${ratingHtml}
  `;
  window.currentRiskRatingValue = 0;
  (items||[]).forEach(it => renderGovLinks(`glk-risk-${it.id}`, 'risk', it.id));
}

async function submitRiskAnswers(requestId){
  const inputs = [...document.querySelectorAll(".risk-ans-input")];
  const filled = inputs.filter(t => t.value.trim());
  if(!filled.length){ alert("اكتب إجابة سؤال واحد على الأقل"); return; }
  if(filled.length < inputs.length && !await uiConfirm(`لم تُجب عن ${inputs.length - filled.length} سؤال. هل ترسل إجاباتك الحالية الآن؟ (يمكنك الرد على الباقي لاحقاً)`)) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const now = new Date().toISOString();
  for(const t of filled){
    const { error } = await sb.from("risk_questions").update({ answer: t.value.trim(), answered_by: email, answered_at: now }).eq("id", Number(t.dataset.qid));
    if(error){ alert("تعذّر حفظ الإجابات: " + error.message); return; }
  }
  const { data: r } = await sb.from("risk_requests").select("assigned_consultant_email").eq("id", requestId).single();
  if(r && r.assigned_consultant_email){
    try{ await sendNotificationEmail(r.assigned_consultant_email, "أجاب العميل على أسئلتك — طلب تقييم المخاطر", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">وصلت إجابات العميل</h2><p>أجاب العميل على ${filled.length} من أسئلتك. ادخل المنصة ← طلبات تحليل المخاطر لتبدأ التحليل.</p></div>`); }catch(e){}
  }
  try{
    const { data: left } = await sb.from("risk_questions").select("id").eq("request_id", requestId).eq("sent", true).is("answer", null);
    if(left && !left.length) await sb.from("risk_requests").update({ status: "قيد التحليل" }).eq("id", requestId);
  }catch(e){}
  await notifyOwnerNewRequest("إجابات العميل على أسئلة المستشار", [["عدد الإجابات", filled.length]]);
  alert("تم إرسال إجاباتك ✅ — سيبدأ المستشار العمل على تقييمك.");
  openRiskRequestDetail(requestId);
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
  await notifyOwnerNewRequest("رد جديد من العميل على طلب تقييم المخاطر", [["الرسالة", message.slice(0,300)]]);
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
