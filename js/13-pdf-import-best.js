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
