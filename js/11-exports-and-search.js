/* ══════════ SHAREHOLDERS REGISTRY (real ownership + transfer history) ══════════ */
let shareholdersCache = [];

/* ══════════ GLOBAL SEARCH (across all major entities) ══════════ */
let globalSearchDebounce = null;
function handleGlobalSearchInput(val){
  clearTimeout(globalSearchDebounce);
  const box = document.getElementById("globalSearchResults");
  if(!val || val.trim().length < 2){ if(box) box.style.display = "none"; return; }
  globalSearchDebounce = setTimeout(() => runGlobalSearch(val.trim()), 300);
}

/* ══════════ EXCEL EXPORT (generic, works for any table/cache) ══════════ */
function exportToExcel(data, columns, filename){
  if(!data || data.length === 0){ alert("لا توجد بيانات للتصدير."); return; }
  const rows = data.map(row => {
    const out = {};
    columns.forEach(c => { out[c.label] = typeof c.value === "function" ? c.value(row) : (row[c.key] ?? ""); });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportMembers(){
  exportToExcel(membersCache, [
    { label:"الاسم", key:"name" }, { label:"المنصب", key:"position" }, { label:"المستوى", key:"position_level" },
    { label:"الحالة", key:"status" }, { label:"تنفيذي؟", key:"is_executive" }, { label:"تاريخ الانضمام", key:"join_date" }
  ], "أعضاء مجلس الإدارة");
}
function exportMeetingsList(){
  exportToExcel(allMeetingsCache, [
    { label:"العنوان", key:"title" }, { label:"النوع", key:"meeting_type" }, { label:"التاريخ", key:"meeting_date" },
    { label:"الوقت", key:"meeting_time" }, { label:"الطريقة", key:"method" }, { label:"الحالة", key:"status" }
  ], "الاجتماعات");
}
function exportPoliciesList(){
  exportToExcel(policiesCache, [
    { label:"الاسم", key:"policy_name" }, { label:"النوع", key:"policy_type" }, { label:"الفئة", key:"category" },
    { label:"الحالة", key:"status" }, { label:"تاريخ الاعتماد", key:"approval_date" }, { label:"تاريخ المراجعة", key:"review_date" }
  ], "السياسات");
}
function exportRisksList(){
  exportToExcel(risksCache, [
    { label:"الاسم", key:"risk_name" }, { label:"الفئة", key:"category" }, { label:"الاحتمالية", key:"probability" },
    { label:"التأثير", key:"impact" }, { label:"المسؤول", key:"owner" }, { label:"الحالة", key:"status" }
  ], "المخاطر");
}
function exportCommitteesList(){
  exportToExcel(committeesCache, [
    { label:"اسم اللجنة", key:"committee_name" }, { label:"الرئيس", key:"chairman_name" },
    { label:"الفئة", key:"category" }, { label:"النطاق", key:"scope" }
  ], "اللجان");
}
/* ══════════ SHAREHOLDERS EXCEL IMPORT (reliable — we control the exact column layout) ══════════ */
const SHAREHOLDERS_TEMPLATE_COLS = [
  { label: "الاسم", key: "name" },
  { label: "الجنسية", key: "nationality" },
  { label: "محل الإقامة", key: "place_of_residence" },
  { label: "المهنة", key: "profession" },
  { label: "رقم الشهادة", key: "certificate_number" },
  { label: "عدد الأسهم", key: "shares_count", numeric: true },
  { label: "القيمة المدفوعة (ريال)", key: "paid_value", numeric: true },
  { label: "تاريخ انتقال الملكية (YYYY-MM-DD)", key: "ownership_transfer_date" },
  { label: "رقم الهوية", key: "national_id" },
  { label: "رقم الجوال", key: "phone_number" },
  { label: "البريد الإلكتروني", key: "email" }
];

function downloadShareholdersTemplate(){
  const header = SHAREHOLDERS_TEMPLATE_COLS.map(c => c.label);
  const exampleRow = ["عبدالله محمد الحامد", "المملكة العربية السعودية", "الرياض", "رجل أعمال", "61", 10000, 100000, "2025-09-02", "1012345678", "0501234567", "example@email.com"];
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  ws["!cols"] = SHAREHOLDERS_TEMPLATE_COLS.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المساهمون");
  XLSX.writeFile(wb, "قالب-سجل-المساهمين.xlsx");
}

async function handleShareholdersExcelUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("المساهمون") ? "المساهمون" : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    if(!rows || rows.length < 2){ alert("الملف فاضي أو لا يحتوي بيانات."); input.value = ""; return; }

    // Row 0 is the header (labels only, not used for mapping — we rely on fixed column order
    // matching the template exactly); everything from row 1 onward is data, skipping the
    // example row if the person left it as-is.
    const dataRows = rows.slice(1).filter(r => r && r[0] && String(r[0]).trim() && String(r[0]).trim() !== "عبدالله محمد الحامد");

    if(dataRows.length === 0){ alert("لم يتم العثور على أي صفوف بيانات فعلية (تأكد من حذف صف المثال أو تعبئة صفوف جديدة)."); input.value = ""; return; }

    const payload = dataRows.map(r => {
      const obj = { company_id: currentCompanyId };
      SHAREHOLDERS_TEMPLATE_COLS.forEach((c, i) => {
        let v = r[i];
        if(v === undefined || v === "") v = null;
        if(c.numeric && v != null) v = Number(v) || 0;
        obj[c.key] = v;
      });
      return obj;
    });

    if(!await uiConfirm(`سيتم استيراد ${payload.length} مساهم — أي مساهم موجود مسبقًا (بنفس رقم الهوية) يُحدَّث برقم أسهمه الجديد بدون ما يفقد ربطه بحسابه، وأي مساهم جديد يُضاف. متابعة؟`)) { input.value = ""; return; }

    // Existing shareholders (by national_id) get UPDATED in place — this is what makes a
    // periodic re-import safe (e.g. refreshing the list before each new AGM): whoever already
    // claimed their record via signup keeps that link, only their share count/name refreshes.
    const { data: existing } = await sb.from("shareholders").select("id,national_id").eq("company_id", currentCompanyId).not("national_id","is",null);
    const existingByNationalId = {};
    (existing||[]).forEach(s => { if(s.national_id) existingByNationalId[s.national_id] = s.id; });

    const toInsert = [], toUpdate = [];
    payload.forEach(p => {
      const existingId = p.national_id ? existingByNationalId[p.national_id] : null;
      if(existingId) toUpdate.push({ id: existingId, ...p });
      else toInsert.push(p);
    });

    let updatedCount = 0, insertErr = null, updateErr = null;
    if(toInsert.length){
      const { error } = await sb.from("shareholders").insert(toInsert);
      insertErr = error;
    }
    for(const row of toUpdate){
      const { id, ...fields } = row;
      const { error } = await sb.from("shareholders").update(fields).eq("id", id);
      if(error) updateErr = error; else updatedCount++;
    }
    if(insertErr || updateErr){ alert("تعذّر الاستيراد بالكامل: " + (insertErr||updateErr).message); return; }
    logActivity("إنشاء", "استيراد مساهمين", `${toInsert.length} جديد + ${updatedCount} محدَّث`, "استيراد من Excel");
    alert(`تم الاستيراد ✅ — ${toInsert.length} مساهم جديد، و${updatedCount} مساهم محدَّث.`);
    input.value = "";
    loadShareholders();
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه نفس القالب المُحمَّل من المنصة بدون تعديل بترتيب الأعمدة.");
  }
}

function exportShareholdersList(){
  exportToExcel(shareholdersCache, [
    { label:"الاسم", key:"name" }, { label:"الجنسية", key:"nationality" }, { label:"محل الإقامة", key:"place_of_residence" },
    { label:"المهنة", key:"profession" }, { label:"رقم الشهادة", key:"certificate_number" }, { label:"عدد الأسهم", key:"shares_count" },
    { label:"القيمة المدفوعة", key:"paid_value" }, { label:"تاريخ انتقال الملكية", key:"ownership_transfer_date" }
  ], "سجل المساهمين");
}
function exportArchiveList(){
  exportToExcel(archiveDocsCache, [
    { label:"اسم الوثيقة", key:"document_name" }, { label:"الفئة", key:"category" },
    { label:"تاريخ الرفع", key:"created_at", value: r => r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : "" }
  ], "الأرشيف");
}
function exportPositionsList(){
  if(!structureCache || structureCache.length===0){ alert("لا توجد بيانات للتصدير."); return; }
  const head = ["#","المنصب / اسم الجهة","الاسم","يتبع لـ","المستوى","تاريخ التعيين","جهة/مجلس؟","بالشجرة؟","خط جانبي؟"];
  const sorted = structureCache.slice().sort((x,y) => (x.level ?? 99) - (y.level ?? 99) || (x.id||0) - (y.id||0));
  const aoa = [head].concat(sorted.map((r,i) => [
    i+1, r.position_title||"", r.holder_name||"", r.parent_position||"", orgLevelLabel(r.level),
    r.appointment_date||"", r.is_body ? "نعم" : "لا", r.is_leadership !== false ? "نعم" : "لا", orgIsSideRaw(r) ? "نعم" : "لا"
  ]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths follow the longest value in each column so names and titles are never cut off.
  ws["!cols"] = head.map((_,c) => ({ wch: Math.min(60, Math.max(8, ...aoa.map(r => String(r[c] ?? "").length)) + 4) }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1, c:head.length-1} }) };
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الهيكل التنظيمي");
  XLSX.writeFile(wb, "دليل المناصب التنظيمية.xlsx");
}

/* PDF header facts: the company's real name, the approval date if the structure was approved (otherwise the export date), and a version number = how many times it was approved. */
async function orgPdfMeta(type){
  type = type || "structure";
  let companyName = "";
  try{ const { data } = await sb.from("companies").select("name").eq("id", currentCompanyId).single(); companyName = (data && typeof data.name === "string") ? data.name : ""; }catch(e){}
  if(!companyName) companyName = (document.getElementById("reportCompanyName1")?.textContent || "").replace(/^—$/, "") || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const fmt = d => new Date(d).toLocaleDateString("ar-SA-u-ca-gregory");
  let dateTitle = "تاريخ التصدير", dateLabel = fmt(new Date()), version = "مسودة", approved = false, approvers = [], count = 0;
  try{
    const { data: reqs } = await sb.from("approval_requests").select("id,status,approved_at,created_at").eq("company_id", currentCompanyId).eq("request_type", type).order("created_at",{ascending:false});
    const ok = Array.isArray(reqs) ? reqs.filter(r => r.status === "معتمد") : [];
    count = ok.length;
    if(ok.length){
      const last = ok.slice().sort((a,b) => new Date(b.approved_at || b.created_at) - new Date(a.approved_at || a.created_at))[0];
      approved = true; dateTitle = "تاريخ الاعتماد"; dateLabel = fmt(last.approved_at || last.created_at); version = ok.length + ".0";
      const { data: votes } = await sb.from("approval_votes").select("reviewer_name,reviewer_email").eq("request_id", last.id);
      if(Array.isArray(votes)) approvers = votes.map(v => v.reviewer_name || v.reviewer_email).filter(Boolean);
    }
  }catch(e){}
  return { companyName, dateTitle, dateLabel, version, approved, approvers, count };
}
/* Header block for governance PDFs: status (draft / approved), version, date and who approved. */
function approvalHeaderHTML(meta, esc, extraLabel){
  const status = meta.approved ? "معتمد" : "مسودة (غير معتمدة)";
  const col = meta.approved ? "#1B7F4B" : "#9C7A2E";
  return `<div style="font-size:12px;color:#5b6678;line-height:1.8"><div><b style="color:${col}">الحالة: ${status}</b></div><div>رقم النسخة: ${esc(extraLabel || meta.version)}</div><div>${esc(meta.dateTitle)}: ${esc(meta.dateLabel)}</div>${meta.approved && meta.approvers.length ? `<div>اعتمده: ${meta.approvers.map(esc).join("، ")}</div>` : ""}</div>`;
}
/* Printable copy of the permissions matrix: every dropdown becomes its letter, read from the LIVE table (a detached clone loses the selected value). */
function permPrintableTable(table){
  const clone = table.cloneNode(true);
  clone.querySelectorAll("button").forEach(b => b.remove());
  const live = table.querySelectorAll("select"), copy = clone.querySelectorAll("select");
  const colors = { "ع":["#1A3A6B","#fff"], "ت":["#0C8B87","#fff"], "م":["#D4AF37","#0D2447"] };
  copy.forEach((sel, k) => {
    const v = (live[k] && live[k].value) || "";
    const span = document.createElement("span");
    span.textContent = v || "—";
    const c = colors[v];
    span.style.cssText = c ? `display:inline-block;min-width:26px;font-weight:900;padding:3px 8px;border-radius:6px;background:${c[0]};color:${c[1]}` : "display:inline-block;color:#9aa4b2";
    sel.parentNode.replaceChild(span, sel);
  });
  clone.querySelectorAll("th").forEach(th => { th.style.background = "#1A3A6B"; th.style.color = "#fff"; });
  return clone;
}
async function exportOrgTreePDF(){
  const treeRows = orgTreeRows(structureCache);
  if(!treeRows.length){ alert("لا توجد شجرة لتصديرها."); return; }
  if(typeof html2pdf === "undefined"){ alert("تعذّر تحميل أداة إنشاء PDF — تحقق من الاتصال بالإنترنت ثم أعد المحاولة."); return; }
  const meta = await orgPdfMeta("structure");
  const companyName = meta.companyName;
  const dateNow = meta.dateLabel;
  const esc = orgEsc;
  const byLevel = (x,y) => (x.level ?? 99) - (y.level ?? 99) || (x.id||0) - (y.id||0);

  // Page 1 = the top of the structure. Joint-stock / LLC: levels 1-5 (assembly, board, committees, CEO, senior management).
  // Sole proprietorship / single-owner LLC: owner, manager and the main departments (levels up to 6).
  const small = orgLevelKind() === "small";
  const cut = small ? 6 : 5;
  let summaryRows = treeRows.filter(r => (r.level ?? 0) <= cut);
  // Side units (e.g. the CEO office, which keeps its own level colour) stay next to the unit they belong to on page 1.
  const summaryTitles = new Set(summaryRows.map(r => r.position_title));
  summaryRows = summaryRows.concat(treeRows.filter(r => (r.level ?? 0) > cut && orgIsSideRaw(r) && summaryTitles.has(r.parent_position)));
  const descendants = root => {
    const out = [root], seen = new Set([root.id]), q = [root];
    while(q.length){ const cur = q.shift(); treeRows.forEach(r => { if(r.parent_position === cur.position_title && !seen.has(r.id)){ seen.add(r.id); out.push(r); q.push(r); } }); }
    return out;
  };
  // One detail page for every senior position that has departments under it (departments side by side,
  // their sections and units hanging below each one). For the small entities there is a single page.
  const isDept = r => (r.level ?? 0) >= 6 && !orgIsSideRaw(r);
  let detailRoots = treeRows.filter(r => (r.level ?? 0) <= 5 && !orgIsSideRaw(r) && treeRows.some(k => k.parent_position === r.position_title && isDept(k))).sort(byLevel);
  if(small) detailRoots = detailRoots.filter(r => descendants(r).some(d => d.parent_position && treeRows.some(t => t.position_title === d.parent_position && isDept(t)) && isDept(d)));
  let detailed = false;
  if(detailRoots.length){
    detailed = await uiConfirm("الصفحة الأولى تعرض أعلى الهيكل.\n\nهل تريد أيضًا صفحات تفصيلية تعرض الإدارات وتحتها الأقسام والوحدات؟\n\nموافق = الصفحة الأولى + التفاصيل، إلغاء = الصفحة الأولى فقط.");
  }

  const others = (structureCache || []).filter(r => r.is_leadership === false).sort(byLevel);
  let includeOthers = false;
  if(others.length){
    includeOthers = await uiConfirm("توجد مناصب وإدارات غير معروضة في الشجرة. هل تريد إضافتها في صفحة مستقلة بآخر ملف PDF؟\n\nموافق = إضافتها، إلغاء = بدونها.");
  }

  const th = "border:1px solid #cfd6e0;padding:7px 8px;background:#1A3A6B;color:#fff;font-size:12px;text-align:right";
  const td = "border:1px solid #cfd6e0;padding:6px 8px;font-size:12px;text-align:right";
  const head = (title, withDate) => `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:14px"><div style="font-size:21px;font-weight:800;color:#1A3A6B">${title}</div>${approvalHeaderHTML(meta, esc)}</div>`;
  const fit = html => `<div class="orgpdf-box" style="margin:0 auto"><div class="orgpdf-inner" style="display:inline-block;transform-origin:top right">${html}</div></div>`;

  let pages = `<div>${head("الهيكل التنظيمي — " + esc(companyName), true)}${fit(renderOrgTree(summaryRows, { static:true }))}</div>`;
  if(detailed){
    detailRoots.forEach(r => {
      const sub = descendants(r);
      pages += `<div style="page-break-before:always">${head("الإدارات التابعة لـ " + esc(r.position_title) + " — " + esc(companyName), false)}${fit(renderOrgTree(sub, { static:true, expandAll:true }))}</div>`;
    });
  }
  if(includeOthers){
    pages += `
    <div style="page-break-before:always;padding-top:4px">
      ${head("ملحق: إدارات ومناصب أخرى غير معروضة في الشجرة — " + esc(companyName), false)}
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <thead><tr><th style="${th};width:40px">#</th><th style="${th}">المنصب</th><th style="${th}">الاسم</th><th style="${th}">يتبع لـ</th><th style="${th}">المستوى</th></tr></thead>
        <tbody>${others.map((r,i) => `<tr style="page-break-inside:avoid"><td style="${td}">${i+1}</td><td style="${td};font-weight:700">${esc(r.position_title)}</td><td style="${td}">${esc(r.holder_name||"—")}</td><td style="${td}">${esc(r.parent_position||"—")}</td><td style="${td}">${esc(orgLevelLabel(r.level))}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "width:1040px;direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;color:#0D2447;background:#fff";
  wrapper.innerHTML = pages;
  // The off-screen offset lives on a holder, not on the wrapper: html2pdf clones the wrapper with its
  // inline styles, and a cloned element still pushed off-screen renders as a blank PDF.
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;top:0;left:-20000px;width:1040px;pointer-events:none";
  holder.appendChild(wrapper);
  document.body.appendChild(holder);
  try{
    // Shrink each drawing so it fits its landscape A4 page (about 1040 x 500 px of usable area).
    wrapper.querySelectorAll(".orgpdf-box").forEach(box => {
      const inner = box.querySelector(".orgpdf-inner");
      const natW = inner.offsetWidth || 1, natH = inner.offsetHeight || 1;
      const scale = Math.max(0.3, Math.min(1, 1040 / natW, 500 / natH));
      inner.style.transform = `scale(${scale})`;
      box.style.width = Math.ceil(natW * scale) + "px";
      box.style.height = Math.ceil(natH * scale) + "px";
    });
    await html2pdf().from(wrapper).set({
      margin: 10,
      filename: `الهيكل-التنظيمي-${companyName}.pdf`.replace(/[\\/:*?"<>|]/g, "-"),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] }
    }).save();
  }catch(e){
    alert("تعذّر توليد ملف PDF: " + (e && e.message ? e.message : e));
  }finally{
    if(holder.parentNode) holder.parentNode.removeChild(holder);
  }
}

async function exportPermissionsMatrix(){
  await loadPermissionsMatrix();
  const table = document.getElementById("permMatrixTable");
  if(!table){ alert("تعذّر تحميل مصفوفة الصلاحيات."); return; }
  const clone = permPrintableTable(table);
  const ws = XLSX.utils.table_to_sheet(clone);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مصفوفة الصلاحيات");
  XLSX.writeFile(wb, "مصفوفة الصلاحيات.xlsx");
}

function exportActivityLogExcel(){
  exportToExcel(activityLogCache, [
    { label:"الوقت", key:"created_at", value: r => r.created_at ? new Date(r.created_at).toLocaleString('ar-SA-u-ca-gregory') : "" },
    { label:"المستخدم", key:"actor_name" }, { label:"نوع الإجراء", key:"action_type" },
    { label:"العنصر", key:"entity_type" }, { label:"اسم العنصر", key:"entity_label" }, { label:"التفاصيل", key:"details" }
  ], "سجل النشاط");
}

function exportActivityLogPDF(){
  if(!activityLogCache || activityLogCache.length === 0){ alert("لا يوجد نشاط لتصديره."); return; }
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التصدير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const rows = activityLogCache.map(a => `<tr>
    <td>${new Date(a.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td><td>${orgEsc(a.actor_name||a.actor_email||"—")}</td>
    <td>${a.action_type||""} ${a.entity_type||""}</td><td>${a.entity_label||"—"}</td><td>${a.details||""}</td>
  </tr>`).join("");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سجل النشاط — ${companyName}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{border:1px solid #ccc;padding:8px;text-align:right;font-size:11px}
      th{background:#1A3A6B;color:#fff}
    </style></head><body>
    <h1><span class="ico-i ico-scroll"></span>سجل النشاط — ${companyName}</h1>
    <p>تاريخ التصدير: ${dateNow}</p>
    <table><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>العنصر</th><th>التفاصيل</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}

async function exportUsersList(){
  const { data } = await sb.from("user_profiles").select("*").eq("company_id", currentCompanyId);
  exportToExcel(data||[], [
    { label:"الاسم", key:"full_name" }, { label:"الإيميل", key:"email" }, { label:"الدور", key:"role" },
    { label:"رقم الهوية", key:"national_id" }, { label:"الجوال", key:"phone_number" }
  ], "فريق حوكمة الشركة");
}
