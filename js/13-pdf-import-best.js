/* ══════════ PDF IMPORT (best-effort extraction, always reviewed before commit) ══════════ */
let pdfImportRowsData = [];

function openPdfImportModal(){
  document.getElementById("pdfImportFile").value = "";
  document.getElementById("pdfImportStep1").style.display = "block";
  document.getElementById("pdfImportStep2").style.display = "none";
  document.getElementById("pdfImportLoading").style.display = "none";
  document.getElementById("pdfImportConfirmBtn").style.display = "none";
  pdfImportRowsData = [];
  openM("m-pdf-import");
}

async function handlePdfFileSelect(input){
  if(!input.files || !input.files[0]) return;
  document.getElementById("pdfImportLoading").style.display = "block";
  try{
    const arrayBuffer = await input.files[0].arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for(let p = 1; p <= pdf.numPages; p++){
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = {};
      content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if(!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      const sortedY = Object.keys(lines).map(Number).sort((a,b)=>b-a);
      sortedY.forEach(y => { fullText += lines[y].join(" ") + "\n"; });
    }
    pdfImportRowsData = parsePdfTextToRows(fullText);
    renderPdfImportRows();
    document.getElementById("pdfImportStep1").style.display = "none";
    document.getElementById("pdfImportStep2").style.display = "block";
    document.getElementById("pdfImportConfirmBtn").style.display = "inline-block";
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه ملف PDF سليم، أو أضف الصفوف يدويًا.");
    document.getElementById("pdfImportStep2").style.display = "block";
    document.getElementById("pdfImportConfirmBtn").style.display = "inline-block";
  }
  document.getElementById("pdfImportLoading").style.display = "none";
}

/* Heuristic only: looks for a long digit sequence (ID/CR number, 8-10 digits) and a shorter
   trailing number (shares count) on each line; everything before the ID becomes the name.
   Lines that don't match a recognizable pattern are skipped — the person reviews the result
   and adds/fixes rows manually before anything is written to the database. */
/* Targets the registry's real column layout:
   مسلسل | الاسم | الجنسية | محل الإقامة | المهنة | رقم الشهادة | عدد الأسهم | القيمة المدفوعة | تاريخ انتقال الملكية
   Reliably peeling a trailing date, then two numbers, then a certificate number from the END
   of each line is much sturdier than guessing at the free-text columns (name/nationality/
   residence/profession), which are left for the person to fill in during review instead of
   risking a wrong automatic split. */
function toEnglishDigits(s){
  if(!s) return "";
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
  return s.replace(/[٠-٩]/g, d => map[d]);
}
function stripCommas(s){ return toEnglishDigits(s).replace(/[,٬]/g,""); }

const SHAREHOLDER_ROLE_WORDS = /مساهم|رئيس مجلس الإدارة|رئيس مجلس|نائب رئيس مجلس|عضو مجلس الإدارة|عضو مجلس|موظف|متقاعد|طالب|أعمال حرة|ربة منزل|عسكري|طبيب|مهندس/;
const COUNTRY_WORDS = /المملكة|السعودية|العربية|الإمارات|الكويت|قطر|البحرين|مصر|الأردن/;

/* Two extraction strategies, tried in order:
   1) Tab-based — if the copied/extracted text still has tab characters between cells (common
      when copying directly from a PDF viewer), each shareholder record ends at a line that is
      just a serial number; everything since the previous boundary is flattened and split on
      tabs/newlines to get ordered cell values, mapped from the END backward (name, then a
      residence pair, then a nationality pair, then whatever role/profession word is present,
      then certificate number, shares count, paid value) since the tail of each record is the
      most reliable, unambiguous part.
   2) Anchor/heuristic fallback — no tabs available (typical for this app's own in-browser PDF.js
      extraction): anchor on a recognizable role word, then reconstruct name/nationality/residence
      from the following lines. Both paths always leave ambiguous fields (certificate number,
      hijri date) blank rather than guessing wrong — always meant to be reviewed before import. */
function parsePdfTextToRows(text){
  if(text.includes("\t")) return parseTabbedPdfRows(text);
  return parseAnchorBasedPdfRows(text);
}

function parseTabbedPdfRows(text){
  const rows = [];
  const rawLines = text.split("\n");
  let blockStart = 0;
  const isSerialLine = l => !l.includes("\t") && /^[\d٠-٩]+$/.test(l.trim());

  for(let i = 0; i < rawLines.length; i++){
    if(!isSerialLine(rawLines[i])) continue;
    const block = rawLines.slice(blockStart, i).join(" ");
    blockStart = i + 1;
    const tokens = block.split(/[\t\n]+/).map(t => t.trim()).filter(Boolean);
    if(tokens.length === 0) continue;

    let rest = tokens.slice();
    const name = (rest.pop() || "").replace(/\s+/g," ").trim();
    let place_of_residence = "";
    if(rest.length >= 1 && COUNTRY_WORDS.test(rest[rest.length-1])){
      place_of_residence = rest.pop().replace(/\s+/g," ").trim();
    }
    let nationality = "";
    if(rest.length >= 1 && COUNTRY_WORDS.test(rest[rest.length-1])){
      nationality = rest.pop().replace(/\s+/g," ").trim();
    }
    let profession = "";
    if(rest.length >= 1 && SHAREHOLDER_ROLE_WORDS.test(rest[rest.length-1])){
      profession = rest.pop();
    }
    const certificate_number = rest.length ? stripCommas(rest.pop()) : "";
    const shares_count = rest.length ? stripCommas(rest.pop()) : "";
    const paid_value = rest.length ? stripCommas(rest.pop()) : "";

    if(!name && !shares_count) continue;
    rows.push({ name, nationality, place_of_residence, profession, certificate_number, shares_count, paid_value, ownership_transfer_date: "" });
  }
  return rows;
}

function parseAnchorBasedPdfRows(text){
  const rows = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const anchorIdx = [];
  lines.forEach((line, i) => { if(SHAREHOLDER_ROLE_WORDS.test(line) && /[\d٠-٩]/.test(line)) anchorIdx.push(i); });

  anchorIdx.forEach((idx, k) => {
    const dataLine = lines[idx];
    const blockEnd = anchorIdx[k+1] !== undefined ? anchorIdx[k+1] : lines.length;
    const block = lines.slice(idx+1, blockEnd);

    const profMatch = dataLine.match(SHAREHOLDER_ROLE_WORDS);
    const profession = profMatch ? profMatch[0] : "";

    const allNums = dataLine.match(/[\d٠-٩]+(?:[,٬][\d٠-٩]+)*/g) || [];
    const paidToken = allNums.find(n => /[,٬]/.test(n)) || "";
    const remaining = allNums.filter(n => n !== paidToken);
    // Remaining bare numbers (excluding the paid value) are typically: hijri year fragment,
    // day/month fragments, shares count, certificate number — sorted longest-first tends to
    // put the shares count (usually 4-5 digits) ahead of the shorter fragments.
    const sorted = [...remaining].sort((a,b)=>stripCommas(b).length - stripCommas(a).length);
    const shares_count = sorted[0] ? stripCommas(sorted[0]) : "";
    // Certificate number and the hijri date fragments are all short 1-2 digit tokens once the
    // date gets scrambled by RTL extraction — too ambiguous to guess reliably, so they're left
    // blank here rather than risk assigning the wrong number. Fill them in during review.

    const countryLines = block.filter(l => COUNTRY_WORDS.test(l));
    const nameLines = block.filter(l =>
      !COUNTRY_WORDS.test(l) &&
      !SHAREHOLDER_ROLE_WORDS.test(l) &&
      !/^[\d٠-٩\s\/\-هـ]+$/.test(l)
    );
    const name = nameLines.join(" ").replace(/^[\d٠-٩]+\s*/, "").replace(/\s*[\d٠-٩]+$/, "").trim();
    const nationality = countryLines.slice(0,2).join(" ").trim();
    const place_of_residence = countryLines.slice(2,4).join(" ").trim() || nationality;

    if(!name && !shares_count) return;
    rows.push({
      name, nationality, place_of_residence, profession,
      certificate_number: "", shares_count,
      paid_value: stripCommas(paidToken), ownership_transfer_date: ""
    });
  });
  return rows;
}

function renderPdfImportRows(){
  const box = document.getElementById("pdfImportRows");
  if(pdfImportRowsData.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">ما قدرنا نتعرف على صفوف تلقائيًا — أضف الصفوف يدويًا بالزر تحت.</div>';
    return;
  }
  const fields = ["name","nationality","place_of_residence","profession","certificate_number","shares_count","paid_value","ownership_transfer_date"];
  box.innerHTML = pdfImportRowsData.map((r, i) => `
    <div style="display:grid;grid-template-columns:repeat(8,1fr) 0.35fr;gap:5px;margin-bottom:6px;align-items:center">
      ${fields.map(f => `<input class="fi" style="margin:0;padding:6px 6px;font-size:10.5px" value="${(r[f]||"").toString().replace(/"/g,'&quot;')}" oninput="pdfImportRowsData[${i}].${f}=this.value">`).join("")}
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px;font-size:11px;cursor:pointer" onclick="removeImportRow(${i})"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
    </div>`).join("");
}

function addImportRow(){
  pdfImportRowsData.push({ name:"", nationality:"", place_of_residence:"", profession:"", certificate_number:"", shares_count:"", paid_value:"", ownership_transfer_date:"" });
  renderPdfImportRows();
}
function removeImportRow(i){
  pdfImportRowsData.splice(i,1);
  renderPdfImportRows();
}

async function confirmPdfImport(){
  const validRows = pdfImportRowsData.filter(r => r.name && r.name.trim());
  if(validRows.length===0){ alert("لا توجد صفوف صالحة للاستيراد"); return; }
  if(!await uiConfirm(`سيتم إضافة ${validRows.length} مساهم جديد لسجل المساهمين. متابعة؟`)) return;
  const payload = validRows.map(r => ({
    name: r.name.trim(),
    nationality: (r.nationality||"").trim(),
    place_of_residence: (r.place_of_residence||"").trim(),
    profession: (r.profession||"").trim(),
    certificate_number: (r.certificate_number||"").trim(),
    shares_count: Number(r.shares_count) || 0,
    paid_value: r.paid_value ? Number(r.paid_value) : null,
    ownership_transfer_date: r.ownership_transfer_date ? normalizeImportedDate(r.ownership_transfer_date) : null,
    company_id: currentCompanyId
  }));
  const { error } = await sb.from("shareholders").insert(payload);
  if(error){ alert("تعذّر الاستيراد: " + error.message); return; }
  logActivity("إنشاء", "استيراد مساهمين", `${validRows.length} مساهم`, "استيراد من PDF");
  alert(`تم استيراد ${validRows.length} مساهم بنجاح ✅`);
  closeM("m-pdf-import");
  loadShareholders();
}

/* Accepts common day/month/year variants (with / or -) and normalizes to YYYY-MM-DD for the
   date input; if the format can't be confidently parsed, returns null rather than guessing. */
function normalizeImportedDate(raw){
  const m = raw.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if(!m) return null;
  let [, a, b, c] = m;
  if(a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`;
  if(c.length === 4) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
  return null;
}

async function generateBaseStructure(){
  const { data: company } = await sb.from("companies").select("company_type,llc_single_manager,llc_single_owner").eq("id", currentCompanyId).single();
  const type = company ? company.company_type : "مساهمة غير مدرجة";
  const isLLCSingleOwner = type === "ذات مسؤولية محدودة" && !!company?.llc_single_owner;

  let rows = [];
  if(type === "مؤسسة فردية"){
    if(!await uiConfirm('سيُضاف: المالك ← المدير العام ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير العام / التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(isLLCSingleOwner){
    // A single-person LLC has no partners' assembly and no council of managers to route through
    // — it's structurally the same shape as a sole proprietorship (owner, then CEO, then
    // departments), just under a different legal form.
    if(!await uiConfirm('سيُضاف: المالك ← المدير التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(type === "ذات مسؤولية محدودة"){
    if(!await uiConfirm('سيُضاف: جمعية الشركاء ← مجلس المديرين ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "جمعية الشركاء", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس المديرين", parent_position: "جمعية الشركاء", level: 2, is_body: true },
      { position_title: "الرئيس التنفيذي", parent_position: "مجلس المديرين", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else {
    // مساهمة مدرجة / مساهمة غير مدرجة (default)
    if(!await uiConfirm('سيُضاف: الجمعية العامة ← مجلس الإدارة ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "الجمعية العامة", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس الإدارة", parent_position: "الجمعية العامة", level: 2, is_body: true },
      // Insertion order matters here: in this RTL layout the first child of "مجلس الإدارة"
      // renders on the right, the last on the left — so اللجان المنبثقة (right), رئيس مجلس
      // الإدارة (center, with الرئيس التنفيذي nested directly beneath it — giving the
      // "stacked in one line" look requested), then أمين سر المجلس (left).
      { position_title: "اللجان المنبثقة", parent_position: "مجلس الإدارة", level: 2, is_body: true },
      { position_title: "رئيس مجلس الإدارة", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الرئيس التنفيذي", parent_position: "رئيس مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "أمين سر المجلس", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التسويق وخدمة العملاء", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "الإدارة القانونية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  }

  // Replace-by-name: remove any existing position/body with the exact same title first, so
  // regenerating doesn't create duplicates or leave a mis-wired older copy behind — while
  // any custom positions the company added themselves (different titles) stay untouched.
  const titles = rows.map(r => r.position_title);
  await sb.from("org_structure").delete().eq("company_id", currentCompanyId).in("position_title", titles);

  const payload = rows.map(r => ({ ...r, company_id: currentCompanyId }));
  const { error } = await sb.from("org_structure").insert(payload);
  if(error){ alert("تعذّر إنشاء الهيكل: " + error.message); return; }
  alert("تم إنشاء الهيكل ✅ — أضف بقية المناصب وتأكد كل واحد يتبع للجهة الصحيحة.");
  loadStructure();
}

async function deletePosition(id){
  if(!await uiConfirm("حذف هذا المنصب سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadStructure();
}

/* Build a real parent → child tree from parent_position text-matching, and render it as
   a classic top-down org chart: the CEO/root at the top, each generation of subordinates
   in its own centered row below, connected with simple vertical lines — not a stacked list. */
function renderOrgTree(rows, opts){
  opts = opts || {};
  const isStatic = !!opts.static, expandAll = !!opts.expandAll;
  const byTitle = {};
  rows.forEach(r => { if(r.position_title) byTitle[r.position_title] = r; });
  const hasKids = {};
  rows.forEach(r => { if(r.parent_position && byTitle[r.parent_position]) hasKids[r.parent_position] = true; });
  const childrenOf = {}, sideOf = {}, roots = [];
  rows.forEach(r => {
    const p = r.parent_position && byTitle[r.parent_position] ? r.parent_position : null;
    if(p){
      if(orgIsSideRaw(r) && !hasKids[r.position_title]){ (sideOf[p] = sideOf[p] || []).push(r); }
      else { (childrenOf[p] = childrenOf[p] || []).push(r); }
    } else {
      roots.push(r);
    }
  });
  const byLevel = (a,b) => (a.level ?? 99) - (b.level ?? 99) || a.id - b.id;
  roots.sort(byLevel);
  Object.keys(childrenOf).forEach(k => childrenOf[k].sort(byLevel));
  Object.keys(sideOf).forEach(k => sideOf[k].sort(byLevel));

  const hangWidth = d => Math.max(110, 170 - 20 * d);
  const estH = n => (!n.is_body && n.holder_name) ? 52 : 34;

  // w = fixed width (departments and everything below them); null = natural width (governance / management levels)
  function box(s, depth, hiddenCount, isOpen, w){
    const small = depth > 0;
    const pad = small ? "7px 14px" : "9px 20px";
    const fs = small ? "11px" : "13px";
    const ring = s.is_body ? "box-shadow:inset 0 0 0 2px rgba(255,255,255,.55);" : "";
    const icon = s.is_body ? '<span class="ico ico-columns" style="width:14px;height:14px;vertical-align:-2px;margin-inline-end:5px"></span>' : "";
    const holder = (!s.is_body && s.holder_name) ? `<div style="font-size:${small ? "10px" : "11px"};font-weight:600;opacity:.92;margin-top:2px;${w ? "" : "white-space:nowrap"}">${orgEsc(s.holder_name)}</div>` : "";
    let chip = "";
    if(hiddenCount > 0 || isOpen){
      if(isStatic){ chip = hiddenCount > 0 ? `<div style="font-size:10px;font-weight:700;opacity:.9;margin-top:3px">+${hiddenCount}</div>` : ""; }
      else { chip = `<span onclick="event.stopPropagation();toggleOrgNode(${s.id})" title="${isOpen ? "طي" : "عرض الأقسام والوحدات التابعة"}" style="cursor:pointer;display:inline-block;margin-top:4px;background:rgba(255,255,255,.25);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${isOpen ? "−" : "+" + hiddenCount}</span>`; }
    }
    const click = isStatic ? "" : `onclick="editStructure(${s.id})" title="اضغط للتعديل أو الحذف" `;
    const sizing = w ? `width:${w}px;box-sizing:border-box;` : `min-width:${small ? 120 : 130}px;`;
    return `<div ${click}style="${isStatic ? "" : "cursor:pointer;"}display:inline-block;background:${orgLevelColor(s.level)};color:#fff;border-radius:6px;padding:${pad};font-size:${fs};font-weight:800;${sizing}text-align:center;${ring}"><div style="${w ? "word-break:break-word" : "white-space:nowrap"}">${icon}${orgEsc(s.position_title)}</div>${holder}${chip}</div>`;
  }

  // Which sub-positions are shown for a node, honouring the fold state (default: sections and units start folded).
  function visibleKids(s){
    const all = childrenOf[s.position_title] || [];
    const collapsible = all.filter(k => (k.level ?? 0) >= ORG_COLLAPSE_FROM_LEVEL);
    const ov = (isStatic || expandAll) ? undefined : orgOverride.get(s.id);
    let kids;
    if(expandAll) kids = all;
    else if(ov === true) kids = [];
    else if(ov === false) kids = all;
    else kids = collapsible.length ? all.filter(k => (k.level ?? 0) < ORG_COLLAPSE_FROM_LEVEL) : all;
    const hidden = all.length - kids.length;
    orgNodeCollapsed[s.id] = hidden > 0;
    return { kids, hidden, isOpen: !isStatic && !expandAll && all.length > 0 && hidden === 0 };
  }

  // Everything below a department hangs vertically: one list under the parent, each level indented 20px,
  // with a spine and a tick per item (like a folder tree). Departments themselves stay in one horizontal row.
  function hangList(kids, pd, extraTop){
    return `<div style="width:${hangWidth(pd)}px;margin-top:${8 + (extraTop || 0)}px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">${kids.map((k, i) => hangChild(k, pd + 1, i === kids.length - 1)).join("")}</div>`;
  }
  function hangChild(k, d, isLast){
    const w = hangWidth(d);
    const vk = visibleKids(k);
    const sub = vk.kids.concat(sideOf[k.position_title] || []);
    const tickY = Math.round(estH(k) / 2);
    const spine = `<span style="position:absolute;right:-11px;top:-8px;width:2px;background:var(--gray2);height:${isLast ? (8 + tickY) + "px" : "calc(100% + 8px)"}"></span>`;
    const tick = `<span style="position:absolute;right:-10px;top:${tickY}px;width:10px;border-top:2px solid var(--gray2)"></span>`;
    return `<div style="position:relative;width:${w}px;margin-right:20px">${spine}${tick}${box(k, 1, vk.hidden, vk.isOpen, w)}${sub.length ? hangList(sub, d) : ""}</div>`;
  }

  // Real org-chart connectors for the upper levels: a stem drops from the parent to a horizontal bus line
  // spanning exactly the width of its children, then a stem drops from that bus to each child
  // (the standard CSS "family tree" trick: half-border on first/last child).
  function renderNode(s, depth){
    const allKids = childrenOf[s.position_title] || [];
    // A node hangs its children vertically when it is a department (level 6+), or when everything under it is a section / unit (level 7+) — even if the department itself was saved at level 4 or 5.
    const hangRoot = (s.level ?? 0) >= 6 || (allKids.length > 0 && allKids.every(k => (k.level ?? 0) >= 7));
    const vk = visibleKids(s);
    const kids = vk.kids;
    const sides = sideOf[s.position_title] || [];
    let html = `<div style="display:flex;flex-direction:column;align-items:center">`;
    let head = box(s, depth, vk.hidden, vk.isOpen, hangRoot ? hangWidth(0) : null);
    if(sides.length){
      head = `<div style="padding:0 ${ORG_SIDE_WIDTH}px"><div style="position:relative;display:inline-block">${head}<div style="position:absolute;right:100%;top:0;display:flex;flex-direction:column;gap:6px">${sides.map(k => `<div style="display:flex;align-items:center;direction:rtl"><span style="display:block;width:26px;border-top:2px dashed #7A8794"></span>${box(k, Math.max(depth,1), 0, false, null)}</div>`).join("")}</div></div></div>`;
    }
    html += head;
    // Several side units stack downwards; lengthen the space below so they never touch the connector bus.
    const sideExtra = sides.length ? Math.max(0, sides.reduce((a, k) => a + estH(k), 0) + (sides.length - 1) * 6 - estH(s)) : 0;
    if(kids.length && hangRoot){
      html += hangList(kids, 0, sideExtra);
    } else if(kids.length){
      html += `<div style="width:2px;height:${18 + sideExtra}px;background:var(--gray2)"></div>`;
      html += `<div style="display:flex;flex-direction:row;align-items:flex-start">`;
      kids.forEach((k, i) => {
        const isFirst = i === 0, isLast = i === kids.length-1, isOnly = kids.length === 1;
        // The page is RTL, so the first markup half renders on the right and the second on the left.
        // A child only draws the half reaching toward a sibling that actually exists on that side.
        const rightHalf = (isOnly || isFirst) ? "transparent" : "var(--gray2)";
        const leftHalf = (isOnly || isLast) ? "transparent" : "var(--gray2)";
        html += `<div style="flex:1;padding:0 16px;position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="position:absolute;top:0;right:0;left:0;height:2px;display:flex">
            <div style="flex:1;background:${rightHalf}"></div>
            <div style="flex:1;background:${leftHalf}"></div>
          </div>
          <div style="width:2px;height:16px;background:var(--gray2)"></div>
          ${renderNode(k, depth+1)}
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Phone layout: one vertical, indented list (every level under its parent) — no sideways scrolling.
  function mobNode(n, d){
    const vk = visibleKids(n);
    const sides = sideOf[n.position_title] || [];
    const all = vk.kids.concat(sides);
    const chip = (vk.hidden > 0 || vk.isOpen) ? `<span onclick="event.stopPropagation();toggleOrgNode(${n.id})" style="cursor:pointer;margin-inline-start:8px;background:rgba(255,255,255,.28);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${vk.isOpen ? "−" : "+" + vk.hidden}</span>` : "";
    const dashed = orgIsSideRaw(n) && !(childrenOf[n.position_title] || []).length ? "outline:2px dashed rgba(255,255,255,.7);outline-offset:-4px;" : "";
    const holder = (!n.is_body && n.holder_name) ? `<div style="font-size:11px;font-weight:600;opacity:.92;margin-top:2px">${orgEsc(n.holder_name)}</div>` : "";
    const card = `<div onclick="editStructure(${n.id})" style="background:${orgLevelColor(n.level)};color:#fff;border-radius:8px;padding:9px 12px;font-size:12.5px;font-weight:800;${dashed}display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span>${orgEsc(n.position_title)}</span>${chip}</div>${holder}</div>`;
    const kidsHtml = all.length ? `<div style="margin:6px 6px 0 0;padding-right:8px;border-right:2px solid var(--gray2);display:flex;flex-direction:column;gap:6px">${all.map(k => mobNode(k, d + 1)).join("")}</div>` : "";
    return `<div>${card}${kidsHtml}</div>`;
  }
  if(opts.mobile && !isStatic && roots.length){
    return `<div style="display:flex;flex-direction:column;gap:8px">${roots.map(r => mobNode(r, 0)).join("")}</div>`;
  }

  if(roots.length===0) return '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">تعذّر رسم الهيكل — تحقق من ربط "يتبع لـ" لكل منصب.</div>';
  return `<div style="display:flex;justify-content:center;gap:50px;align-items:flex-start">${roots.map(r => renderNode(r, 0)).join("")}</div>`;
}

/* Colour legend + the structure type, shown under the tree on screen and inside every PDF page. */
function orgLegendHTML(rows){
  const levels = [...new Set(rows.map(r => r.level).filter(l => l != null))].sort((a,b) => a-b);
  const titles = new Set(rows.map(r => r.position_title));
  const hasSide = rows.some(r => orgIsSideRaw(r) && r.parent_position && titles.has(r.parent_position));
  const item = "display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#0D2447;margin:2px 9px";
  const swatches = levels.map(l => `<span style="${item}"><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${orgLevelColor(l)}"></i>${orgEsc((currentLang === "en" && (ORG_LABELS_EN[orgLevelKind()] || {})[l]) || orgLabels()[l] || orgLevelLabels[l] || ("مستوى " + l))}</span>`).join("");
  const side = hasSide ? `<span style="${item}"><i style="display:inline-block;width:22px;border-top:2px dashed #7A8794"></i>وحدة جانبية (داعمة / رقابية)</span>` : "";
  return `<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e0d0;text-align:center"><div>${swatches}${side}</div><div style="font-size:11px;color:#5b6678;margin-top:6px">نوع الهيكل: هرمي وظيفي مع وحدات جانبية (Line &amp; Staff)</div></div>`;
}
/* Tree rows = positions marked "show in tree" + every position above them, so a hidden owner / CEO never leaves its departments floating without a head. */
function orgTreeRows(all){
  all = all || [];
  const bt = {}; all.forEach(r => { if(r.position_title) bt[r.position_title] = r; });
  const keep = new Set();
  all.filter(r => r.is_leadership !== false).forEach(r => {
    let cur = r, n = 0;
    while(cur && !keep.has(cur.id) && n++ < 12){ keep.add(cur.id); cur = cur.parent_position ? bt[cur.parent_position] : null; }
  });
  return all.filter(r => keep.has(r.id));
}
function rerenderOrgTree(){
  const c = document.getElementById("orgTreeContainer");
  if(!c || !structureCache || !structureCache.length) return;
  const rows = orgTreeRows(structureCache);
  c.innerHTML = renderOrgTree(rows, { mobile: window.innerWidth <= 700 }) + orgLegendHTML(rows);
}
/* على الشاشات العريضة: افتح الشجرة وجذرها في منتصف منطقة العرض بدل أن تبدأ من طرف واحد. */
function orgCenterScroll(){
  const c = document.getElementById("orgTreeContainer");
  const sc = c && c.parentElement;
  if(!sc || sc.scrollWidth <= sc.clientWidth + 4) return;
  const d = sc.scrollWidth - sc.clientWidth;
  sc.scrollLeft = getComputedStyle(sc).direction === "rtl" ? -d / 2 : d / 2;
}
let __orgMob = null;
window.addEventListener("resize", () => { const m = window.innerWidth <= 700; if(__orgMob !== null && m !== __orgMob && document.getElementById("orgTreeContainer")) rerenderOrgTree(); __orgMob = m; });
function toggleOrgNode(id){ orgOverride.set(id, !orgNodeCollapsed[id]); rerenderOrgTree(); }
function orgExpandAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, false)); rerenderOrgTree(); }
function orgCollapseAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, true)); rerenderOrgTree(); }

function autoToggleLeadership(){
  const level = Number(document.getElementById("mst-level").value);
  document.getElementById("mst-leadership").checked = level <= 7;
}

function toggleBodyFields(){
  const isBody = document.getElementById("mst-is-body").checked;
  document.getElementById("mst-holder-field").style.display = isBody ? "none" : "block";
}

function editStructure(id){
  const s = structureCache.find(x => x.id === id);
  if(!s) return;
  if(s.unit_type){ openUnitModal(s); return; }
  openPositionModal(s);
}

const ORG_UNIT_LEVEL = { department: 6, section: 7, unit: 8 };
const ORG_UNIT_LABEL = { department: "إدارة", section: "قسم", unit: "وحدة" };
function orgHolderList(s){
  if(Array.isArray(s.holders) && s.holders.length) return s.holders;
  return s.holder_name ? [{ name: s.holder_name, direct_manager: "", appointment_date: s.appointment_date || "" }] : [];
}
function orgParentOptions(selected, excludeId){
  const rows = structureCache.filter(r => r.id !== excludeId);
  const units = rows.filter(r => r.unit_type || r.is_body);
  const others = rows.filter(r => !r.unit_type && !r.is_body);
  const opt = r => `<option value="${orgEsc(r.position_title||"")}">${orgEsc(r.position_title||"")}${r.unit_type ? " ("+ORG_UNIT_LABEL[r.unit_type]+")" : ""}</option>`;
  return '<option value="">— بدون (أعلى مستوى في الهيكل) —</option>'
    + (units.length ? '<optgroup label="الإدارات والأقسام والوحدات والجهات">'+units.map(opt).join("")+'</optgroup>' : "")
    + (others.length ? '<optgroup label="مناصب">'+others.map(opt).join("")+'</optgroup>' : "");
}
function openUnitModal(s){
  document.getElementById("mu-id").value = s ? s.id : "";
  document.getElementById("mu-title-h").textContent = s ? "✏️ تعديل" : "🌳 إضافة إدارة / قسم / وحدة";
  document.getElementById("mu-type").value = (s && s.unit_type) || "department";
  document.getElementById("mu-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mu-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  const sideRow = document.getElementById("mu-side-row");
  sideRow.style.display = orgSideSupported ? "flex" : "none";
  document.getElementById("mu-side").checked = s ? orgIsSideRaw(s) : false;
  document.getElementById("mu-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-unit");
}
async function saveUnit(){
  const id = document.getElementById("mu-id").value;
  const title = document.getElementById("mu-title").value.trim();
  if(!title){ alert("الرجاء إدخال الاسم"); return; }
  const unit_type = document.getElementById("mu-type").value;
  const dup = structureCache.find(r => r.position_title === title && String(r.id) !== String(id));
  if(dup){ alert("يوجد عنصر بنفس الاسم في الهيكل. اختر اسمًا مختلفًا."); return; }
  const payload = { position_title: title, unit_type, level: ORG_UNIT_LEVEL[unit_type], parent_position: document.getElementById("mu-parent").value.trim(),
    is_leadership: true, is_body: false, holder_name: "", holders: [], appointment_date: null, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mu-side").checked;
  let error;
  if(id){
    const old = structureCache.find(r => String(r.id) === String(id));
    ({ error } = await sb.from("org_structure").update(payload).eq("id", id));
    if(!error && old && old.position_title !== title){
      await sb.from("org_structure").update({ parent_position: title }).eq("company_id", currentCompanyId).eq("parent_position", old.position_title);
      await sb.from("org_structure").update({ unit_title: title }).eq("company_id", currentCompanyId).eq("unit_title", old.position_title);
    }
  } else {
    ({ error } = await sb.from("org_structure").insert([payload]));
  }
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}
async function deleteUnitFromModal(){
  const id = document.getElementById("mu-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. العناصر التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}

function addHolderRow(h){
  h = h || {};
  const list = document.getElementById("mst-holders-list");
  const div = document.createElement("div");
  div.className = "mst-holder-row";
  div.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;background:var(--offwhite);padding:8px;border-radius:8px";
  div.innerHTML = `<input class="fi mh-name" style="flex:2;min-width:140px" placeholder="اسم الشخص" value="${orgEsc(h.name||"")}" />
    <input class="fi mh-mgr" list="mst-people-dl" style="flex:2;min-width:140px" placeholder="المدير المباشر" value="${orgEsc(h.direct_manager||"")}" />
    <input type="date" class="fi mh-date" style="flex:1;min-width:130px" value="${orgEsc(h.appointment_date||"")}" title="تاريخ التعيين" />
    <button type="button" class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;cursor:pointer" onclick="this.parentNode.remove()">حذف</button>`;
  list.appendChild(div);
}
function openPositionModal(s){
  if(!s && (!structureCache || !structureCache.length)){
    alert("أضف الهيكل أولًا (إدارة أو قسم أو وحدة)، ثم أضف المناصب بعد اكتماله.");
    return;
  }
  document.getElementById("mst-id").value = s ? s.id : "";
  document.getElementById("mst-title-h").textContent = s ? "✏️ تعديل منصب" : "🌳 إضافة منصب في الهيكل التنظيمي";
  document.getElementById("mst-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mst-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  populateOrgLevelSelect(s ? s.level : undefined);
  document.getElementById("mst-level").value = s ? (s.level ?? "") : "";
  document.getElementById("mst-leadership").checked = s ? s.is_leadership !== false : false;
  document.getElementById("mst-is-body").checked = s ? !!s.is_body : false;
  document.getElementById("mst-side").checked = s ? orgIsSideRaw(s) : false;
  const dl = document.getElementById("mst-people-dl");
  const names = new Set();
  structureCache.forEach(r => orgHolderList(r).forEach(h => { if(h.name) names.add(h.name); }));
  dl.innerHTML = [...names].map(n => `<option value="${orgEsc(n)}"></option>`).join("");
  document.getElementById("mst-holders-list").innerHTML = "";
  if(s){ orgHolderList(s).forEach(h => addHolderRow(h)); }
  if(!s || !orgHolderList(s).length) addHolderRow();
  toggleBodyFields();
  mstParentChanged();
  document.getElementById("mst-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-structure");
}
function mstParentChanged(){
  const u = structureCache.find(r => r.position_title === document.getElementById("mst-parent").value);
  const row = document.getElementById("mst-leadership").parentNode;
  if(row) row.style.display = (u && u.unit_type) ? "none" : "flex";
  if(document.getElementById("mst-id").value) return;
  if(u && u.unit_type) document.getElementById("mst-level").value = String(u.level ?? "");
}

async function deleteStructureFromModal(){
  const id = document.getElementById("mst-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-structure");
  loadStructure();
}
async function saveStructure(){
  const id = document.getElementById("mst-id").value;
  const position_title = document.getElementById("mst-title").value.trim();
  if(!position_title){ alert("الرجاء إدخال اسم المنصب"); return; }
  const is_body = document.getElementById("mst-is-body").checked;
  const holders = is_body ? [] : [...document.querySelectorAll("#mst-holders-list .mst-holder-row")].map(r => ({
    name: r.querySelector(".mh-name").value.trim(),
    direct_manager: r.querySelector(".mh-mgr").value.trim(),
    appointment_date: r.querySelector(".mh-date").value || ""
  })).filter(h => h.name);
  const holder_name = holders.map(h => h.name).join("، ");
  const appointment_date = holders.length ? (holders[0].appointment_date || null) : null;
  const parent_position = document.getElementById("mst-parent").value.trim();
  const level = document.getElementById("mst-level").value ? Number(document.getElementById("mst-level").value) : null;
  const parentRow = structureCache.find(r => r.position_title === parent_position);
  const is_leadership = (parentRow && parentRow.unit_type) ? false : document.getElementById("mst-leadership").checked;
  const payload = { position_title, holder_name, holders, appointment_date, parent_position, unit_title: parent_position || null, unit_type: null, level, is_leadership, is_body, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mst-side").checked;
  const { error } = id
    ? await sb.from("org_structure").update(payload).eq("id", id)
    : await sb.from("org_structure").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mst-id").value = "";
  closeM("m-structure"); loadStructure();
}

/* ══════════ PERMISSIONS MATRIX (flexible, company-editable) ══════════ */
const PERM_CATEGORY_ORDER = [
  "الصلاحيات الاستراتيجية والتنظيمية",
  "الصلاحيات المتعلقة بالموارد البشرية",
  "الصلاحيات المالية والاستثمارية",
  "الصلاحيات التشغيلية"
];
let permHoldersCache = [];
let permItemsCache = [];
let permCellsCache = {}; // key: itemId+'-'+holderId -> code

const PERM_CATEGORY_ICONS = {
  "الصلاحيات الاستراتيجية والتنظيمية": "🎯",
  "الصلاحيات المتعلقة بالموارد البشرية": "👥",
  "الصلاحيات المالية والاستثمارية": "💰",
  "الصلاحيات التشغيلية": "⚙️"
};
function permCodeStyle(code){
  if(code==="ع") return "background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border:none";
  if(code==="ت") return "background:linear-gradient(135deg,#0EA5A0,#0C8B87);color:#fff;border:none";
  if(code==="م") return "background:linear-gradient(135deg,var(--gold),var(--gold3));color:var(--dark);border:none";
  return "background:var(--offwhite);color:var(--gray2);border:1.5px dashed var(--gray1)";
}
function onPermCellChange(sel, itemId, holderId){
  sel.style.cssText = "font-size:12.5px;font-weight:900;text-align:center;text-align-last:center;padding:6px 4px;border-radius:8px;width:52px;cursor:pointer;appearance:none;-webkit-appearance:none;" + permCodeStyle(sel.value);
  savePermCell(itemId, holderId, sel.value);
}

async function loadPermissionsMatrix(){
  const thead = document.getElementById("permMatrixThead");
  const tbody = document.getElementById("permMatrixTbody");
  if(!tbody) return;

  const [{ data: holders, error: hErr }, { data: items, error: iErr }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}).order("id",{ascending:true}),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}).order("id",{ascending:true})
  ]);
  if(hErr || iErr){ tbody.innerHTML = errorRowHTML(2, (hErr||iErr).message); return; }
  permHoldersCache = holders || [];
  permItemsCache = items || [];

  if(permHoldersCache.length===0 || permItemsCache.length===0){
    thead.innerHTML = "<tr><th>البند</th></tr>";
    tbody.innerHTML = emptyRowHTML(1, 'أضف "صاحب صلاحية" (عمود) و"بند" (صف) واحد على الأقل لبدء بناء المصفوفة.');
    return;
  }

  const itemIds = permItemsCache.map(i=>i.id);
  const { data: cells, error: cErr } = await sb.from("permission_cells").select("*").in("item_id", itemIds);
  if(cErr){ tbody.innerHTML = errorRowHTML(2, cErr.message); return; }
  permCellsCache = {};
  (cells||[]).forEach(c => { permCellsCache[c.item_id+'-'+c.holder_id] = c.code; });

  // Header row: item column + one polished chip-style column per holder
  thead.innerHTML = '<tr>'
    + '<th style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;padding:14px 16px;font-size:12.5px">البند</th>'
    + permHoldersCache.map(h =>
        `<th style="background:linear-gradient(135deg,var(--primary),var(--accent));text-align:center;color:#fff;padding:12px 8px;font-size:11.5px;font-weight:800;min-width:110px">${orgEsc(h.name)}</th>`
      ).join('')
    + '</tr>';

  // Group items by category, preserving a sensible fixed category order
  const groups = {};
  permItemsCache.forEach(it => {
    const cat = it.category || "الصلاحيات التشغيلية";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(it);
  });
  const cats = Object.keys(groups).sort((a,b)=>{
    const ia = PERM_CATEGORY_ORDER.indexOf(a), ib = PERM_CATEGORY_ORDER.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b,'ar');
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });

  const colCount = permHoldersCache.length + 1;
  let rows = "";
  cats.forEach(cat => {
    const icon = PERM_CATEGORY_ICONS[cat] || "📋";
    rows += `<tr><td colspan="${colCount}" style="background:var(--offwhite);border-right:4px solid var(--gold);font-weight:800;color:var(--primary);font-size:12px;padding:10px 16px">${icon} ${cat}</td></tr>`;
    groups[cat].forEach(it => {
      rows += `<tr>
        <td style="padding:10px 16px;font-size:12.5px;font-weight:600;color:var(--dark)">${orgEsc(it.item_name||"")} <button class="btn-xs sec" style="padding:2px 8px;font-size:11px;margin-inline-start:6px" onclick="openGovLinkPicker('authority',${it.id})" title="ربط ببنود أخرى">🔗</button><div class="glinks" id="glk-authority-${it.id}" data-glinks="authority:${it.id}" style="margin-top:4px"></div></td>`;
      permHoldersCache.forEach(h => {
        const key = it.id+'-'+h.id;
        const code = permCellsCache[key] || "";
        rows += `<td style="text-align:center;padding:8px">
          <select onchange="onPermCellChange(this,${it.id},${h.id})" style="font-size:12.5px;font-weight:900;text-align:center;text-align-last:center;padding:6px 4px;border-radius:8px;width:52px;cursor:pointer;appearance:none;-webkit-appearance:none;${permCodeStyle(code)}">
            <option value="" ${code===""?"selected":""}>—</option>
            <option value="ت" ${code==="ت"?"selected":""}>ت</option>
            <option value="ع" ${code==="ع"?"selected":""}>ع</option>
            <option value="م" ${code==="م"?"selected":""}>م</option>
          </select>
        </td>`;
      });
      rows += `</tr>`;
    });
  });
  tbody.innerHTML = rows;
  (typeof permItemsCache !== "undefined" ? permItemsCache : []).forEach(it => { if(typeof renderGovLinks === "function") renderGovLinks(`glk-authority-${it.id}`, "authority", it.id); });
}

async function savePermHolder(){
  const name = document.getElementById("mph-name").value.trim();
  if(!name){ alert("الرجاء إدخال الاسم"); return; }
  const { error } = await sb.from("permission_holders").insert([{ name, company_id: currentCompanyId, sort_order: permHoldersCache.length }]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  document.getElementById("mph-name").value = "";
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

async function renamePermHolder(id){
  const h = permHoldersCache.find(x => x.id === id);
  if(!h) return;
  const name = await uiPrompt("اسم الجهة الجديد:", h.name || "");
  if(name === null) return;
  const clean = name.trim();
  if(!clean || clean === h.name) return;
  // Only the name changes — the cells (ت / ع / م) belong to the holder's id, so nothing in the matrix is lost.
  const { error } = await sb.from("permission_holders").update({ name: clean }).eq("id", id);
  if(error){ alert("تعذّر التعديل: " + error.message); return; }
  logActivity("تعديل", "جهة بمصفوفة الصلاحيات", clean, `تغيير الاسم من "${h.name}"`);
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

async function deletePermHolder(id){
  if(!await uiConfirm("حذف هذه الجهة سيحذف كل قيمها بالمصفوفة. متابعة؟")) return;
  const { error } = await sb.from("permission_holders").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

function renderPermHoldersManageList(){
  const list = document.getElementById("permHoldersManageList");
  if(!list) return;
  if(permHoldersCache.length===0){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد جهات بعد.</div>'; return; }
  list.innerHTML = permHoldersCache.map(h => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--gray1);font-size:12.5px">
      <span>${orgEsc(h.name)}</span>
      <div style="display:flex;gap:6px">
        <button style="background:var(--offwhite);color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="renamePermHolder(${h.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deletePermHolder(${h.id})"><span class="ico-i ico-trash"></span>حذف</button>
      </div>
    </div>`).join('');
}

function openPermHoldersManager(){
  renderPermHoldersManageList();
  document.getElementById("mph-name").value = "";
  openM("m-perm-holder");
}

function renderPermItemsManageList(){
  const list = document.getElementById("permItemsManageList");
  if(!list) return;
  if(permItemsCache.length===0){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد بنود بعد.</div>'; return; }
  list.innerHTML = permItemsCache.map(it => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--gray1);font-size:12.5px">
      <span>${orgEsc(it.item_name)}<br><span style="font-size:10px;color:var(--gray3)">${orgEsc(it.category||"")}</span></span>
      <div style="display:flex;gap:6px">
        <button style="background:var(--offwhite);color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openPermItemEditModal(${it.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deletePermItemFromManager(${it.id})"><span class="ico-i ico-trash"></span>حذف</button>
      </div>
    </div>`).join('');
}

const STANDARD_PERM_MATRIX_ITEMS = {"الصلاحيات الاستراتيجية والتنظيمية": ["تعديل عقد التأسيس والنظام الأساسي للشركة", "اعتماد سياسات الشركة", "اعتماد إعادة هيلكة الإدارات التفصيلية", "اعتماد إجراءات العمل", "تصميم الرؤيا والرسالة والأهداف والاستراتيجيات العامة", "اعتماد الأهداف الاستراتيجية", "اعتماد خطة عمل الشركة ( Business Plan ) الخمسية", "اعتماد خطط عمل ( Action Plans ) سنوية للإدارات", "الدخول في مجالات عمل جديدة", "الخروج من مجالات عمل حالية", "الهيكل التنظيمي للشركة (الإدارة العليا)", "اعتماد مصفوفة مصفوفات الصلاحيات والمسؤوليات", "عقد تحالف استراتيجي مع جهات خارج الشركة", "اعتماد عمليات الاستحواذ والاندماج", "التوسع الجغرافي في أعمال الشركة داخل المملكة", "التوسع الجغرافي في أعمال الشركة خارج المملكة", "وقف التعامل مع عميل استراتيجي للشركة", "اعتماد وضع مؤشرات الأداء", "إعادة هيكلة الإدارات الإدارة الوسطى فما دون", "تعديل مهام وحدة تنظيمية (إدارة) على مستوى الشركة", "اعتماد تقييم تقارير الأداء الدورية للإدارات", "مؤشرات الأداء الرئيس التنفيذي", "مؤشرات الأداء للرئيس التنفيذي", "مؤشرات الأداء لنواب الرئيس", "مؤشرات الأداء لمديري الإدارات", "مؤشرات الأداء للموظفين", "التعديل على الأنظمة الآلية وتدفق الإجراءات", "إلغاء أو تعديل أو إضافة إجراء على النظام الآلي"], "الصلاحيات المتعلقة بالموارد البشرية": ["اعتماد دليل سياسات وإجراءات الموارد البشرية وتعديل لوائح الموارد البشرية", "اعتماد خطة احتياجات الشركة السنوية من الموارد البشرية", "اعتماد وتعديل سلم الرواتب والاجور", "تفسير احكام سياسات الموارد البشرية", "اعتماد استحداث وظيفة جديدة خارج خطة التوظيف", "اعتماد تعديل وصف الوظائف وإعادة تصنيف الوظائف ضمن سلم المرتبات", "اعتماد النص النمطي للأعلان عن الوظيفة", "توقيع عرض / عقد العمل", "إعطاء موافقة لنقل خدمات موظف لشركة أخرى", "الاتفاق مع مؤسسات التوظيف المتخصصة لإيجاد الأشخاص الكافات المطلوبة", "الأشتراك في مواقع التوظيف المتخصصة لتوفير السير الذاتية للوظائف المطلوبة", "اعتماد تجديد او تعديل عقد العمل", "الموافقة على تعين موظفين مؤقتين", "موافقة على تمديد مدة تجربة الموظف الجديد", "اعتماد دفع بدل ساعات إضافية بموجب تصريح مسبق بالعمل الإضافي", "اعتماد دفع بدل ساعات إضافية للموظفين دون وجود امر كتابي مسبق", "اعتماد توفير مسكن لأحد الموظفين أو دفع بدل سكن حسب السياسات", "التدريب داخل المملكة بحسب الموازنة", "اعتماد توفير سيارة لأحد موظفي الشركة أو دفع بدل نقل حسب سياسات الشركة", "التدريب خارج المملكة بحسب الموازنة", "الموافقة على حضور / اشتراك الموظف في المؤتمرات والمحاضرات الخارجية ( مدفوعه )", "الموافقة على حضور / اشتراك الموظف في المؤتمرات والمحاضرات الداخلية ( مدفوعه )", "لغاية 10 أيام (لمرة واحدة في السنة)", "لغاية 20 يوم (لمرة واحدة في السنة)", "أكثر من 20 يوم وحتى 30 يوم على الاتزيد الاجازة السنوية عن 60 يوم متصلة.", "تقييم أداء الموظفين", "الزيادة الدورية الاعتيادية للموظفين / العلاوات السنوية", "الترقيات", "المكافآت السنوية لجميع الموظفين (جماعية)/ العمولات بناءً على الأداء", "زيادة راتب/ ترقية/ علاوة/ مكافأة (استثنائيا)", "زيادة الراتب بما يزيد عن 20% من راتب الموظف الاجمالي", "مكافآت استثنائية للموظفين بما لا يزيد عن الراتب الإجمالي الشهري للموظف ولا يتجاوز 100 ألف بالسنة", "اعتماد تكليف موظف للعمل في وظيفة أخرى ضمن نفس الإدارة", "اعتماد تكليف موظف للعمل في وظيفة أخرى في إدارة أخرى", "اعتماد أعارة موظفين إلى مؤسسات أخرى", "الموافقة على تأخر / مغادرة الموظف في الحضور أو الأنصراف لمكان العمل لفترة محدودة", "التصريح بالبقاء في مواقع العمل أو الدخول أو الخروج منها خارج أوقات الدوام الرسمي", "البت بتظلم الموظفين", "دفع مستحقات موظفي الشركة للإجازة أو نهاية الخدمة", "دفع مستحقات موظفي الشركة نهاية الخدمة", "تصفية على رأس العمل دون الذهاب للإجازة لحاجة العمل", "صرف دفعات لا تزيد عن 50% من مستحقات الموظفين المنتهية خدماتهم ومعتمد نقل كفالاتهم قبل نقل الكفالة", "الموافقة على تغيب الموظف عن العمل مقابل ساعات عمل أضافي", "الموافقة على تراكم الأجازات السنوية في حدود السياسة المعتمدة", "البت في الخالفات الناتجه عن تضارب مواعيد الأجازات السنوية للموظفين", "اعتماد صرف النفقات التي تكبدها الموظف الذي قطعت أجازته بناء طلب الشركة", "اعتماد صرف قيمة تذكرة السفر نقدا في حال عدم تمتع الموظف في الأجازة السنوية", "اعتماد قبول التقرير الطبي المدعم لطلب الأجازةالمرضية", "اعتماد منح الموظف أجازت الحج", "التنقل الداخلي بين الإدارات / القطاعات", "التنقل داخل القطاع مدير إدارة / موظفين", "التنقل خارج القطاع مدير إدارة / موظفين", "اعتماد ترقية درجة التأمين الطبي للموظف على حسابه الشخصي (بشرط عدم مخالفة وثيقة التأمين الطبي السارية)", "الخدمات الحكومية لموظفي الشركة", "مخاطبات إدارة الجوازات", "إصدار تصاريح العمل", "تجديد وإصدار الاقامات لمرة وأكثر من مرة", "إصدار تأشيرة خروج وعودة متعدد لحاجة العمل", "إصدار تأشيرة خروج وعودة متعدد على حساب الموظف", "إصدار تأشيرة خروج وعودة مفرد بما يتجاوز المدة المحددة بسياسات الشركة", "تعديل المهنة لضرورات العمل على حساب الشركة", "طلب إصدار تأشيرات العمل الجديدة", "إصدار وتمديد تأشيرات الزيارات لأغراض العمل", "الموافقة على منح الموظفة المتزوجة أجازة أمومة", "أقرار اعفاء الموظف المستقيل أو المفصول من فترة الأنذار", "اعتماد تمديد خدمة الموظف الذي وصل إلى سن التقاعد", "انهاء خدمة الموظف بسبب العجز الدائم أو عدم اللياقه الصحية", "توقيع شهادة اخلاء الطرف / شهادة الخبرة", "تعديل مهام وحدة / قسم / إدارة أو تعديل وتغير مسمى وظيفي", "الموافقة على سحب ملفات وسجلات الموظفين أو الأطلاع عليها", "اعتماد عمل إضافي خارج أوقات الدوام الرسمي (يصرف لما هو دون مدير الادارة) بما لايزيد عن 50% عن الراتب الشهري", "اعتماد منح السلف للموظفين حسب السياسات", "سلف استثنائية السياسات بما لا يزيد عن راتب شهرين للموظف الواحد وبسقف لا يتجاوز رصيده 100,000 ريال لجميع السلف الاستثنائية القائمة", "اعتماد تأجيل خصم أقساط سلفة موظف لمدة لا تزيد عن شهر.", "اعتماد تأجيل خصم أقساط سلفة موظف لمدة لا تزيد عن ثلاثة شهور", "التنازل عن شرط الكفيل اللازم للحصول على سلفة في حدود رصيد مكافأة نهاية الخدمة المرصودة للموظف بتاريخ السلفة.", "اعتماد اوامر الاركاب لإصدار تذاكر السفر بالطائرة بحسب السياسه", "تحديد المناطق المحظورة على زوار الشركة أو الموظفين الغير عاملين فيها", "الموافقة على نشر تعميم داخلي على بريد الشركة الألكتروني", "اعتماد منح صلاحية نشر التعاميم الداخلية على بريد الشركة الألكتروني", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ لا يتجاوز 300 ريال بغرض التمتع بالاجازة", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ يتجاوز 150 ريال ويقل عن 1000 ريال", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ يتجاوز 1000 ريال"], "الصلاحيات المالية والاستثمارية": ["تعديل رأس المال", "توزيع الأرباح على المساهمين", "تجنيب احتياطيات إضافية", "اعتماد و/ أو تعديل الموازنة", "اعتماد القوائم المالية", "اعتماد سياسة المخاطر المالية الائتمانية", "اعتماد السياسات والإجراءات المالية والتشغيلية والإدارية", "فتح حسابات بالعملة السعودية أو العملات الأخرى في البنوك المعتمدة", "اعتماد سياسة الاقتراض من البنوك المعتمدة", "رهن موجودات الشركة", "سياسة الاستثمارات قصيرة الأجل للسيولة النقدية الفائضة في أسواق المال والبنوك", "تحديد المفوضين بالتوقيع لدى البنوك، ووضع وتعديل حدود صلاحياتهم.", "العقود والمناقصات", "تحديد الموصفات ( كراسة الشروط والمتطلبات الفنية )", "طرح المناقصات", "فحص العروض", "توقيع العقود الرأسمالية والتشغيلية ( ضمن الموازنة )", "من 500 ألف ريال حتى 2 مليون ريال", "أكثر من أثنين مليون ريال", "أعتماد طلبات الشراء ( الشراء المباشر بحسب السياسات )", "أكثر من 200 ألف ريال وأقل من 500 ألف ريال", "استئجار الممتلكات الضرورية للشركة (مباني، سيارات، معدات...) \" ضمن الموازنة \"", "من 300 ألف ريال إلى مليون ريال للعملية الواحدة", "أكثر من مليون ريال للعملية الواحدة", "التوقيع على عقود المؤجرين (ضمن الشروط المعتمدة)", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ لا يزيد عن 20,000 ريال", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ لا يزيد عن 30,000 ريال", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ يزيد عن 30,000 ريال", "استبعاد الأصول الثابتة بالشطب أو البيع واعتماد سعر البيع", "القيمة الدفترية أقل من 10 الاف ريال", "القيمة الدفترية أكثر من 10 الاف ريال", "تعديل معدلات إهلاك للأصول الثابتة", "تشكيل لجنة جرد الأصول الثابتة", "اعتماد نتائج جرد الأصول الثابتة بفروقات لا تزيد عن 200 ألف ريال في السنة", "اعتماد صرف الهدايا والهبات والتبرعات.", "أقل من 20.000 ريال . سنوياً", "أكثر من 20 ألف ريال وأقل من 200 ألف ريال سنوياً", "أكثر من 200 ألف ريال سنوياً", "اعتماد المخصصات بجميع أنواعها.", "الزكاة والضرائب", "اعتماد إقرارات الزكاة وإقرارت الضرائب", "- اعتماد قرارات الربط الزكوي الصادرة عن مصلحة الزكاة، أو الاعتراض عليها أو استئنافها", "- تعيين المستشار الزكوي (إذا كان هناك حاجة)", "العهد المستديمة والمؤقتة (وفقاً للسياسة)", "تأسيس عهدة بحد أقصى 20.000 ريال", "تأسيس عهدة أكثر من 20.000 ريال وبحد أقصى 200.000 ريال", "وضع وتعديل حدود الشراء عن طريق عهدة المصروفات النثرية"], "الصلاحيات التشغيلية": ["اعتماد سياسة التعامل بالآجل والتسعير والتعديل عليهما", "التوقيع على عقود العملاء حسب العقد الموحد المعتمد", "التوقيع على عقود العملاء باختلاف عن العقد الموحد المعتمد", "اعتماد سياسة الخصم من الاسعار المعتمدة بما يزيد عن (20%)", "اعتماد سياسة الخصم من الاسعار المعتمدة بما لا يزيد عن (20%)", "اعتماد سياسة الخصم من الاسعار المعتمدة بما لا يزيد عن (5%)", "زيادة الحد الائتماني حتى 20% عن السياسة"]};
/* ══════════ PERMISSIONS MATRIX — bulk Excel template + import ══════════
   Typing 165 real items one-by-one through a modal is genuinely impractical — Excel is a much
   faster, more reliable medium than parsing an arbitrary Word file: clean rows/columns, no
   merged-cell ambiguity, and the person can paste/edit dozens of rows in seconds. The template
   is pre-filled with real items extracted from the company's own reference matrix document. */
function triggerPermMatrixImport(){
  document.getElementById('permMatrixImportFile').click();
}

async function downloadPermMatrixTemplate(){
  const [{ data: holders }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true})
  ]);
  const holderNames = (holders||[]).map(h => h.name);
  if(holderNames.length === 0){
    alert("أضف جهات القرار أولًا (زر \"✏️ تعديل الجهات\") قبل تحميل النموذج — كل جهة تصير عمودًا بملف Excel.");
    return;
  }

  const header = ["الفئة", "البند", ...holderNames];
  const seedRows = [];
  Object.entries(STANDARD_PERM_MATRIX_ITEMS).forEach(([category, items]) => {
    items.forEach(item => {
      seedRows.push([category, item, ...holderNames.map(()=>"")]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...seedRows]);
  ws['!cols'] = [{wch:30},{wch:55}, ...holderNames.map(()=>({wch:14}))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مصفوفة الصلاحيات");

  const notesWs = XLSX.utils.aoa_to_sheet([
    ["تعليمات التعبئة"],
    ["- لكل جهة عمود مستقل — اكتب بخليتها: ت (توصية) أو م (مراجعة) أو ع (اعتماد)، أو اتركها فاضية إن لم تكن معنية."],
    ["- تقدر تحذف أي بند مو محتاجه، أو تضيف بنود جديدة بنفس الشكل (فئة + بند)."],
    ["- الفئات المتاحة بالضبط: الصلاحيات الاستراتيجية والتنظيمية، الصلاحيات المتعلقة بالموارد البشرية، الصلاحيات المالية والاستثمارية، الصلاحيات التشغيلية."],
    ["- بعد التعبئة، ارجع للمنصة واضغط \"📤 استيراد من Excel\" وارفع هذا الملف."]
  ]);
  XLSX.utils.book_append_sheet(wb, notesWs, "تعليمات");

  XLSX.writeFile(wb, "نموذج-مصفوفة-الصلاحيات.xlsx");
}

async function importPermMatrixFromExcel(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if(rows.length < 2){ alert("الملف فاضي أو غير صحيح"); return; }

      const header = rows[0];
      const holderNames = header.slice(2).map(h => String(h||"").trim()).filter(Boolean);
      const { data: holders } = await sb.from("permission_holders").select("*").eq("company_id", currentCompanyId);
      const holderIdByName = {};
      (holders||[]).forEach(h => { holderIdByName[(h.name||"").trim()] = h.id; });

      let addedItems = 0, addedCells = 0, skippedRows = 0;
      for(let i=1; i<rows.length; i++){
        const row = rows[i];
        if(!row || !row[1]) continue; // no item text
        const category = String(row[0]||"").trim();
        const item_text = String(row[1]||"").trim();
        if(!category || !item_text){ skippedRows++; continue; }

        const { data: newItem, error } = await sb.from("permission_items")
          .insert([{ item_name: item_text, category, company_id: currentCompanyId, sort_order: 1000+i }])
          .select().single();
        if(error || !newItem){
          if(error && !window._permImportFirstError) window._permImportFirstError = error.message;
          continue;
        }
        addedItems++;

        for(let c=0; c<holderNames.length; c++){
          const code = String(row[2+c]||"").trim();
          if(!code) continue;
          const holderId = holderIdByName[holderNames[c]];
          if(!holderId) continue;
          const { error: cellErr } = await sb.from("permission_cells").insert([{
            item_id: newItem.id, holder_id: holderId, code, company_id: currentCompanyId
          }]);
          if(!cellErr) addedCells++;
        }
      }
      const errorNote = window._permImportFirstError ? `\n\nخطأ التحقق: ${window._permImportFirstError}` : "";
      alert(`${addedItems>0?'تم الاستيراد ✅':'تعذّر الاستيراد ❌'} — أُضيف ${addedItems} بند و${addedCells} خانة صلاحية معبّاة.${skippedRows?` (تم تخطي ${skippedRows} صف ناقص البيانات)`:''}${errorNote}`);
      window._permImportFirstError = null;
      input.value = "";
      loadPermissionsMatrix();
    }catch(err){
      alert("تعذّر قراءة الملف: " + err.message);
    }
  };
  reader.readAsBinaryString(file);
}

function openPermItemsManager(){

  renderPermItemsManageList();
  openM("m-perm-items-manage");
}

async function deletePermItemFromManager(id){
  await deletePermItem(id, true);
  renderPermItemsManageList();
}

function openPermItemModal(){
  const container = document.getElementById("mpi-assignments");
  container.innerHTML = "";
  addPermAssignmentRow();
  const dl = document.getElementById("permHolderNames");
  dl.innerHTML = permHoldersCache.map(h => `<option value="${(h.name||"").replace(/"/g,'&quot;')}">`).join("");
  document.getElementById("mpi-name").value = "";
  openM("m-perm-item");
}

function addPermAssignmentRow(){
  const container = document.getElementById("mpi-assignments");
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;margin-top:6px";
  row.innerHTML = `
    <input list="permHolderNames" class="fi perm-assign-holder" placeholder="الجهة (مثال: الرئيس التنفيذي)" style="flex:2">
    <select class="fs perm-assign-code" style="flex:1">
      <option value="">—</option>
      <option value="ت">ت — توصية</option>
      <option value="ع">ع — اعتماد</option>
      <option value="م">م — مراجعة</option>
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
  `;
  container.appendChild(row);
}

async function findOrCreateHolder(name){
  const existing = permHoldersCache.find(h => (h.name||"").trim() === name);
  if(existing) return existing.id;
  const { data, error } = await sb.from("permission_holders")
    .insert([{ name, company_id: currentCompanyId, sort_order: permHoldersCache.length }])
    .select().single();
  if(error){ throw error; }
  permHoldersCache.push(data);
  return data.id;
}

/* ══ Real item editor: rename item, and add/edit/remove its holder assignments ══ */
async function openPermItemEditModal(itemId){
  const item = permItemsCache.find(i => i.id === itemId);
  if(!item) return;
  document.getElementById("mpie-id").value = item.id;
  document.getElementById("mpie-name").value = item.item_name || "";
  document.getElementById("mpie-category").value = item.category || "الصلاحيات التشغيلية";

  const { data: cells, error } = await sb.from("permission_cells").select("*").eq("item_id", itemId);
  if(error){ alert("تعذّر تحميل الصلاحيات الحالية: " + error.message); return; }

  const container = document.getElementById("mpie-assignments");
  container.innerHTML = "";
  (cells||[]).forEach(cell => {
    const holder = permHoldersCache.find(h => h.id === cell.holder_id);
    addPermEditAssignmentRow(cell.id, holder ? holder.name : "", cell.code);
  });
  if(!cells || cells.length===0) addPermEditAssignmentRow();

  const dl = document.getElementById("permHolderNames");
  if(dl) dl.innerHTML = permHoldersCache.map(h => `<option value="${(h.name||"").replace(/"/g,'&quot;')}">`).join("");

  openM("m-perm-item-edit");
}

function addPermEditAssignmentRow(cellId, holderName, code){
  const container = document.getElementById("mpie-assignments");
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;margin-top:6px";
  row.dataset.cellId = cellId || "";
  row.innerHTML = `
    <input list="permHolderNames" class="fi perm-edit-holder" placeholder="الجهة (مثال: الرئيس التنفيذي)" value="${holderName ? holderName.replace(/"/g,'&quot;') : ''}" style="flex:2">
    <select class="fs perm-edit-code" style="flex:1">
      <option value="" ${!code?'selected':''}>—</option>
      <option value="ت" ${code==='ت'?'selected':''}>ت — توصية</option>
      <option value="ع" ${code==='ع'?'selected':''}>ع — اعتماد</option>
      <option value="م" ${code==='م'?'selected':''}>م — مراجعة</option>
    </select>
    <button type="button" onclick="removePermEditAssignmentRow(this)" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
  `;
  container.appendChild(row);
}

async function removePermEditAssignmentRow(btn){
  const row = btn.closest("div[data-cell-id], div");
  const cellId = row.dataset.cellId;
  if(cellId){
    if(!await uiConfirm("حذف صلاحية هذه الجهة عن هذا البند؟")) return;
    const { error } = await sb.from("permission_cells").delete().eq("id", cellId);
    if(error){ alert("تعذّر الحذف: " + error.message); return; }
  }
  row.remove();
}

async function savePermItemEdit(){
  const id = document.getElementById("mpie-id").value;
  const item_name = document.getElementById("mpie-name").value.trim();
  if(!item_name){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mpie-category").value;

  const { error } = await sb.from("permission_items").update({ item_name, category }).eq("id", id);
  if(error){ alert("تعذّر حفظ البند: " + error.message); return; }

  const rows = document.querySelectorAll("#mpie-assignments > div");
  for(const row of rows){
    const holderName = row.querySelector(".perm-edit-holder").value.trim();
    const code = row.querySelector(".perm-edit-code").value;
    if(!holderName || !code) continue; // rows left blank are simply skipped, not saved
    try{
      const holderId = await findOrCreateHolder(holderName);
      await sb.from("permission_cells").upsert(
        [{ item_id: Number(id), holder_id: holderId, code, company_id: currentCompanyId }],
        { onConflict: 'item_id,holder_id' }
      );
    }catch(e){
      alert("تعذّر حفظ صلاحية الجهة \""+holderName+"\": " + e.message);
    }
  }

  closeM("m-perm-item-edit");
  govCheckApprovalNow(id);
  await loadPermissionsMatrix();
  renderPermItemsManageList();
}

async function savePermItem(){
  const item_name = document.getElementById("mpi-name").value.trim();
  if(!item_name){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mpi-category").value;
  const normN = x => String(x||"").replace(/[\s\-–:]+/g," ").trim();
  if((permItemsCache||[]).some(x => normN(x.item_name) === normN(item_name))){ alert("هذا البند موجود مسبقاً في المصفوفة — لن يُضاف مكرراً."); return; }

  const { data: newItem, error } = await sb.from("permission_items")
    .insert([{ item_name, category, company_id: currentCompanyId, sort_order: permItemsCache.length }])
    .select().single();
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }

  // Apply any holder/code assignments entered inline for this new item
  const rows = document.querySelectorAll("#mpi-assignments > div");
  for(const row of rows){
    const holderName = row.querySelector(".perm-assign-holder").value.trim();
    const code = row.querySelector(".perm-assign-code").value;
    if(!holderName || !code) continue;
    try{
      const holderId = await findOrCreateHolder(holderName);
      await sb.from("permission_cells").upsert(
        [{ item_id: newItem.id, holder_id: holderId, code, company_id: currentCompanyId }],
        { onConflict: 'item_id,holder_id' }
      );
    }catch(e){
      alert("تعذّر حفظ صلاحية الجهة \""+holderName+"\": " + e.message);
    }
  }

  document.getElementById("mpi-name").value = "";
  closeM("m-perm-item");
  govCheckApprovalNow(newItem.id);
  loadPermissionsMatrix();

  if(await uiConfirm(`تم إضافة البند "${item_name}" ✅\n\nهل تريد إشعار الفريق بالبريد الإلكتروني؟`)){
    await sendPermissionItemNotification(newItem.id);
  }
  if(await uiConfirm("هل تريد أيضًا مشاركته عبر واتساب؟")){
    sendPermissionItemWhatsApp(newItem.id);
  }
}

async function deletePermItem(id){
  if(!await uiConfirm("حذف هذا البند نهائيًا. متابعة؟")) return;
  const { error } = await sb.from("permission_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadPermissionsMatrix();
}

async function savePermCell(itemId, holderId, code){
  const { error } = await sb.from("permission_cells")
    .upsert([{ item_id: itemId, holder_id: holderId, code, company_id: currentCompanyId }], { onConflict: 'item_id,holder_id' });
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  if(code === "ع") govCheckApprovalNow(itemId);
}

async function generatePermissionsReport(){
  const w = openPrintWindow();
  if(w){ w.document.write('<html dir="rtl"><body style="font-family:sans-serif;padding:30px">جارِ تجهيز التقرير...</body></html>'); w.document.close(); }
  await loadPermissionsMatrix();
  const table = document.getElementById("permMatrixTable");
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const pmeta = await orgPdfMeta("matrix");
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع ثم المحاولة مرة أخرى."); return; }

  // Clone the table and strip interactive elements (delete buttons, selects) down to
  // plain printable text, so the PDF shows a clean report instead of live form controls.
  let printableHTML = '<p style="color:#C0392B">تعذّر تحميل جدول الصلاحيات.</p>';
  if(table){
    printableHTML = permPrintableTable(table).outerHTML;
  }

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير مصفوفة الصلاحيات</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{border:1px solid #ccc;padding:8px;text-align:center;font-size:11.5px}
      td:first-child{text-align:right}
      th{background:#1A3A6B !important;color:#fff !important}
    </style></head><body>
    <h1>مصفوفة الصلاحيات — ${pmeta.companyName}</h1>
    ${approvalHeaderHTML(pmeta, x => String(x).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])))}
    <p style="font-size:11px;color:#5b6678">تاريخ إنشاء التقرير: ${dateNow}</p>
    <p><b>الرمز:</b> ت = توصية &nbsp; · &nbsp; ع = اعتماد &nbsp; · &nbsp; م = مراجعة</p>
    ${printableHTML}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}



/* Remove duplicate authority items (same text): keep the one with the most assignments, move over any
   assignment the others had, and delete the extras. Asks first. */
async function permDedupe(){
  const { data: items } = await sb.from("permission_items").select("id,item_name").eq("company_id", currentCompanyId);
  const norm = x => String(x||"").replace(/[\s\-–:]+/g," ").trim();
  const groups = {}; (items||[]).forEach(i => { (groups[norm(i.item_name)] = groups[norm(i.item_name)] || []).push(i); });
  const dups = Object.values(groups).filter(g => g.length > 1);
  if(!dups.length){ alert("لا توجد بنود مكرّرة ✅"); return; }
  const extra = dups.reduce((n,g) => n + g.length - 1, 0);
  if(!await uiConfirm(`وُجد ${dups.length} بند مكرّر (${extra} نسخة زائدة). سيُبقي النظام نسخة واحدة من كل بند بصلاحياتها، ويحذف النسخ الزائدة نهائياً. متابعة؟`)) return;
  const ids = items.map(i => i.id);
  const { data: cells } = await sb.from("permission_cells").select("*").in("item_id", ids);
  for(const g of dups){
    const cnt = id => (cells||[]).filter(c => c.item_id === id).length;
    g.sort((a,b) => cnt(b.id) - cnt(a.id) || a.id - b.id);
    const keep = g[0];
    for(const d of g.slice(1)){
      for(const c of (cells||[]).filter(c => c.item_id === d.id)){
        const has = (cells||[]).some(k => k.item_id === keep.id && k.holder_id === c.holder_id);
        if(!has) await sb.from("permission_cells").update({ item_id: keep.id }).eq("id", c.id);
      }
      await sb.from("governance_links").delete().eq("company_id", currentCompanyId).or(`and(source_type.eq.authority,source_id.eq.${d.id}),and(target_type.eq.authority,target_id.eq.${d.id})`);
      await sb.from("permission_cells").delete().eq("item_id", d.id);
      await sb.from("permission_items").delete().eq("id", d.id);
    }
  }
  logActivity("حذف", "مصفوفة الصلاحيات", `${extra} بند مكرر`, "");
  govCacheClear();
  await loadPermissionsMatrix(); renderPermItemsManageList();
  alert(`تم حذف ${extra} بند مكرر ✅`);
}
