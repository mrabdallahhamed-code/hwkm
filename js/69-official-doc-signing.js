/* ══════════ OFFICIAL DOCUMENT SIGNING (signatures embedded in-place, not a certificate page) ══════════ */
let officialSigPadCtx = null, officialSigPadDrawing = false, currentOfficialSignDocId = null;

// Stamps the company's seal onto an EXISTING signed/generated PDF — works on any document
// already in signing_documents regardless of how it was originally produced (our own
// generator or a manually uploaded file), since it operates on the final PDF bytes directly.
async function applyCompanySealToDoc(signingDocId){
  const { data: doc } = await sb.from("signing_documents").select("file_url").eq("id", signingDocId).single();
  const { data: company } = await sb.from("companies").select("seal_url,seal_position").eq("id", currentCompanyId).single();
  if(!doc || !doc.file_url){ alert("تعذّر تحميل المستند"); return; }
  if(!company || !company.seal_url){ alert('لا يوجد ختم مرفوع بعد — ارفعه أولًا من "تعديل بيانات الشركة".'); return; }
  if(!await uiConfirm("إضافة ختم الشركة على هذا المستند؟")) return;

  try{
    const { PDFDocument } = PDFLib;
    const [existingBytes, sealBytes] = await Promise.all([
      fetch(doc.file_url).then(r => r.arrayBuffer()),
      fetch(company.seal_url).then(r => r.arrayBuffer())
    ]);
    const pdfDoc = await PDFDocument.load(existingBytes);
    const sealImg = company.seal_url.toLowerCase().includes(".png") ? await pdfDoc.embedPng(sealBytes) : await pdfDoc.embedJpg(sealBytes);
    const sealSize = 70;
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    const margin = 45;
    // PDF coordinates are bottom-left-origin, opposite of the canvas builder's top-left —
    // recalculated here rather than reusing CanvasPDFBuilder.drawSeal()'s positions directly.
    const positions = {
      "أسفل يمين الصفحة": [width - margin - sealSize, margin],
      "أسفل يسار الصفحة": [margin, margin],
      "أسفل وسط الصفحة": [(width - sealSize)/2, margin],
      "بجانب أول توقيع": [width/2 - sealSize - 20, margin + 25]
    };
    const [x, y] = positions[company.seal_position] || positions["أسفل يمين الصفحة"];
    lastPage.drawImage(sealImg, { x, y, width: sealSize, height: sealSize, opacity: 0.85 });

    const finalBytes = await pdfDoc.save();
    const blob = new Blob([finalBytes], { type: "application/pdf" });
    const file_url = await uploadBlobToStorage(blob, "official-documents", `مختوم-${signingDocId}-${Date.now()}.pdf`);
    if(!file_url) return;
    await sb.from("signing_documents").update({ file_url }).eq("id", signingDocId);
    alert("تم إضافة الختم ✅");
    loadSigning();
  }catch(e){
    alert("تعذّر إضافة الختم: " + e.message);
  }
}
