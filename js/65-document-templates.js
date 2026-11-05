/* ══════════ DOCUMENT TEMPLATES (upload real Word templates, fill with real data) ══════════ */
const DOC_TEMPLATE_DEFS = [
  { key: "agm_invitation", label: "📨 دعوة الجمعية" },
  { key: "attendance_sheet", label: "🧾 محضر كشف الحضور" },
  { key: "vote_minutes", label: "🗳️ محضر فرز الأصوات" },
  { key: "agm_minutes", label: "📋 محضر الجمعية العامة" },
  { key: "vote_card", label: "🪪 بطاقة تصويت المساهم" }
];
let docTemplatesCache = {};

async function loadDocumentTemplates(){
  const section = document.getElementById("docTemplatesSection");
  const role = getCurrentRole();
  const canSeeTemplates = role === "مدير النظام" || role === "سكرتير المجلس";
  if(section) section.style.display = canSeeTemplates ? "block" : "none";
  if(!canSeeTemplates) return;

  const box = document.getElementById("docTemplatesList");
  const { data, error } = await sb.from("document_templates").select("*").eq("company_id", currentCompanyId);
  if(error){ if(box) box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  docTemplatesCache = {};
  (data||[]).forEach(t => { docTemplatesCache[t.template_key] = t; });
  if(!box) return;

  box.innerHTML = DOC_TEMPLATE_DEFS.map(def => {
    const t = docTemplatesCache[def.key];
    const isDefault = t && t.is_platform_default;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div>
        <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${def.label}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${t ? '✅ '+t.file_name+(isDefault?' · <span style="color:var(--gold)"><span class="ico-i ico-pin"></span>قالب افتراضي لكل شركة جديدة</span>':'') : 'لم يُرفع قالب — يُستخدم التصميم الافتراضي'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <label class="btn-xs primary" style="cursor:pointer"><span class="ico-i ico-paperclip"></span>${t?'استبدال':'رفع'} القالب<input type="file" accept=".docx" style="display:none" onchange="uploadDocumentTemplate('${def.key}',this)"></label>
        ${t ? `<button class="btn-xs" style="background:${isDefault?'#FEF3E2':'var(--offwhite)'};color:${isDefault?'var(--gold)':'var(--dark)'};border:1px solid ${isDefault?'transparent':'var(--gray1)'};border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer" onclick="toggleTemplateDefault('${def.key}',${t.id},${!isDefault})"><span class="ico-i ico-pin"></span>${isDefault?'إلغاء الافتراضي':'اجعله افتراضيًا'}</button>` : ""}
        ${t ? `<button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer" onclick="deleteDocumentTemplate('${def.key}')"><span class="ico-i ico-trash"></span>حذف</button>` : ""}
      </div>
    </div>`;
  }).join("");
}

async function toggleTemplateDefault(key, id, makeDefault){
  const { error } = await sb.from("document_templates").update({ is_platform_default: makeDefault }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  logActivity("تعديل", "قالب مستند", key, makeDefault ? "تعيينه افتراضيًا لكل شركة جديدة" : "إلغاء التعيين الافتراضي");
  loadDocumentTemplates();
}

async function deleteDocumentTemplate(key){
  if(!await uiConfirm("حذف هذا القالب؟ سيرجع النظام يستخدم التصميم الافتراضي بدلاً منه.")) return;
  const { error } = await sb.from("document_templates").delete().eq("company_id", currentCompanyId).eq("template_key", key);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadDocumentTemplates();
}

async function uploadDocumentTemplate(key, inputEl){
  if(!inputEl.files || !inputEl.files[0]) return;
  const fileName = inputEl.files[0].name;
  const file_url = await uploadFile(inputEl, "templates");
  if(!file_url) return;
  const { error } = await sb.from("document_templates")
    .upsert([{ company_id: currentCompanyId, template_key: key, file_url, file_name: fileName, updated_at: new Date().toISOString() }], { onConflict: 'company_id,template_key' });
  if(error){ alert("تعذّر حفظ القالب: " + error.message); return; }
  loadDocumentTemplates();
}

/* Loads a docx template, fills its {tags} with real data using docxtemplater, and
   triggers a download of the resulting real .docx file. */
async function fillDocxTemplate(templateUrl, data, downloadName){
  const response = await fetch(templateUrl);
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = downloadName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function generateVoteReport(){
  if(!currentVotingMeetingId){ alert("تعذّر تحديد الجمعية الحالية"); return; }
  const w = openPrintWindow();
  if(w){ w.document.write('<html dir="rtl"><body style="font-family:sans-serif;padding:30px">جارِ تجهيز التقرير...</body></html>'); w.document.close(); }
  await loadVotingPage();
  const resultsTable = document.getElementById("voteResultsTable");
  const shareholdersTable = document.getElementById("shareholdersTable");
  const summaryText = document.getElementById("votingCapitalSummary");
  const meetingTitle = document.getElementById("votingMeetingTitle")?.textContent || "الجمعية العامة";
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع ثم المحاولة مرة أخرى."); return; }
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير نتائج التصويت الشامل</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:19px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      h2{color:#1A3A6B;font-size:15px;margin-top:26px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:right;font-size:11.5px}
      th{background:#EAF0F8}
    </style></head><body>
    <h1><span class="ico-i ico-document"></span>تقرير نتائج التصويت الإلكتروني الشامل — ${meetingTitle}</h1>
    <p>تاريخ التقرير: ${dateNow}</p>
    ${summaryText ? '<p>'+summaryText.textContent+'</p>' : ''}
    <h2><span class="ico-i ico-dashboard"></span>نتائج التصويت حسب البند</h2>
    ${resultsTable ? resultsTable.outerHTML : '<p>لا توجد بيانات.</p>'}
    <h2><span class="ico-i ico-document"></span>المساهمون المصوّتون</h2>
    ${shareholdersTable ? shareholdersTable.outerHTML : '<p>لا توجد بيانات.</p>'}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}
