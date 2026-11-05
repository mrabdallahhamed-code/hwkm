/* ══════════ التوقيع حسب صاحب الدور (المستندات متعددة الأطراف) ══════════
   كل حساب يوقّع دوره هو فقط: الأدوار المعروضة له هي التي اسمها المكتوب في المستند يطابق اسمه،
   وإذا وقّع انتهى توقيعه وبقي مفتوحًا لأصحاب الأدوار الباقية. */
function normArName(x){
  return String(x||"").replace(/[\u064B-\u0652\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
    .replace(/\s+/g," ").trim().toLowerCase();
}
function isMyName(name){
  const me = normArName(currentUserProfile && currentUserProfile.full_name);
  const other = normArName(name);
  if(!me || !other) return false;
  if(me === other) return true;
  const a = me.split(" "), b = other.split(" ");
  const small = a.length <= b.length ? a : b, big = a.length <= b.length ? b : a;
  return small.length >= 2 && small.every(t => big.includes(t));
}
// حالة المستند بالنسبة لحسابي: أدواري المتبقية، وهل وقّعت، وما بقي على الآخرين
function officialDocMyState(doc, sigs, myEmail){
  const roles = doc.signer_roles || [];
  const signedRoles = (sigs||[]).map(x => x.role);
  const remaining = roles.filter(r => !signedRoles.includes(r.role));
  const myPending = remaining.filter(r => isMyName(r.name)).map(r => r.role);
  const iSigned = !!(myEmail && (sigs||[]).some(x => (x.signer_email||"").toLowerCase() === myEmail.toLowerCase()));
  return { remaining, myPending, iSigned, othersPending: remaining.filter(r => !isMyName(r.name)).map(r => r.role) };
}
function officialActionHTML(doc, sigs, myEmail, big){
  const st = officialDocMyState(doc, sigs, myEmail);
  const w = big ? 'style="width:100%;justify-content:center;padding:9px 0"' : '';
  if(st.myPending.length) return big
    ? `<button class="btn btn-gold" style="width:100%" onclick="openOfficialSignModal(${doc.id})"><span class="ico-i ico-signature"></span>توقيع الآن</button>`
    : `<button class="btn-xs gold" onclick="openOfficialSignModal(${doc.id})">توقيع</button>`;
  if(st.iSigned) return `<span class="badge done" ${w}><span class="ico-i ico-check"></span>وقّعت — انتهى توقيعك</span>`;
  if(st.remaining.length) return `<span class="badge pending" ${w} title="بانتظار: ${orgEsc(st.othersPending.join('، '))}">بانتظار توقيع الآخرين</span>`;
  return "";
}

async function openOfficialSignModal(docId){
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", docId).single();
  if(!doc || !doc.signer_roles){ alert("هذا المستند لا يستخدم نظام التوقيع بالمواضع"); return; }
  const { data: sigs } = await sb.from("official_doc_signatures").select("role").eq("document_id", docId);
  const signedRoles = (sigs||[]).map(s => s.role);
  const remainingRoles = (doc.signer_roles||[]).filter(r => !signedRoles.includes(r.role) && isMyName(r.name)).map(r => r.role);
  const anyRemaining = (doc.signer_roles||[]).some(r => !signedRoles.includes(r.role));
  if(remainingRoles.length === 0){
    alert(anyRemaining ? "لا يوجد دور توقيع باسمك في هذا المستند، أو أنك وقّعت دورك بالفعل. التوقيع لصاحب الدور فقط." : "اكتمل توقيع كل الأطراف المطلوبة.");
    return;
  }

  currentOfficialSignDocId = docId;
  document.getElementById("officialSignInfo").innerHTML =
    `<b>${orgEsc(doc.document_name)}</b><br>وقّع حتى الآن: ${signedRoles.length} من ${doc.signer_roles.length}`;
  const sel = document.getElementById("official-sign-role");
  sel.disabled = false;
  sel.innerHTML = remainingRoles.map(r => `<option value="${orgEsc(r)}">${orgEsc(r)}</option>`).join("");
  openM("m-official-sign");
  setTimeout(initOfficialSigPad, 50);
}

function initOfficialSigPad(){
  const canvas = document.getElementById("officialSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  officialSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); officialSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!officialSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { officialSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("officialSigCanvas");
}

function clearOfficialSigPad(){
  if(!officialSigPadCtx) return;
  const canvas = document.getElementById("officialSigCanvas");
  officialSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isOfficialSigPadEmpty(){
  const canvas = document.getElementById("officialSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

async function confirmOfficialSignature(){
  const sel = document.getElementById("official-sign-role");
  if(sel.disabled){ alert("لا توجد أدوار متبقية للتوقيع بهذا المستند"); return; }
  const role = sel.value;
  if(isOfficialSigPadEmpty()){ alert("الرجاء رسم التوقيع أولًا"); return; }
  // إعادة التحقق من قاعدة البيانات: الدور لي ولم يُوقَّع بعد
  {
    const { data: docChk } = await sb.from("signing_documents").select("signer_roles").eq("id", currentOfficialSignDocId).single();
    const { data: sigChk } = await sb.from("official_doc_signatures").select("role").eq("document_id", currentOfficialSignDocId);
    const roleRow = ((docChk && docChk.signer_roles) || []).find(r => r.role === role);
    if(!roleRow || !isMyName(roleRow.name)){ alert("هذا الدور ليس لك، التوقيع لصاحب الدور فقط."); closeM("m-official-sign"); return; }
    if((sigChk||[]).some(x => x.role === role)){ alert("هذا الدور وقّع بالفعل ✅"); closeM("m-official-sign"); loadSigning(); return; }
  }
  if(!(await lockFirstSignature("officialSigCanvas"))) return;

  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const signer_name = currentUserProfile ? currentUserProfile.full_name : email;
  const signature_image = document.getElementById("officialSigCanvas").toDataURL("image/png");

  const { error } = await sb.from("official_doc_signatures").insert([{
    document_id: currentOfficialSignDocId, role, signer_name, signer_email: email, signature_image
  }]);
  if(error){ alert("تعذّر حفظ التوقيع: " + error.message); return; }

  closeM("m-official-sign");
  alert("⏳ جارِ دمج توقيعك بالمستند...");
  const newUrl = await regenerateOfficialDoc(currentOfficialSignDocId);
  if(newUrl){
    alert("تم دمج توقيعك بالمستند بنجاح ✅");
  } else {
    alert("تم حفظ توقيعك، لكن تعذّر إعادة توليد المستند — تواصل مع الدعم الفني.");
  }
  await archiveIfFullySigned(currentOfficialSignDocId, newUrl);
  loadSigning();
}

/* Once a document collects every required signature, it files itself into the Archive
   automatically — a draft/partially-signed document never gets archived, only a finished,
   fully-executed one. Covers every signing_documents type uniformly: AGM invitations and
   minutes, disclosure forms, and final policy approvals alike. */
const ARCHIVE_CATEGORY_BY_DOC_TYPE = {
  "دعوة جمعية عامة": "جمعيات",
  "محضر جمعية عامة": "محاضر",
  "محضر فرز الأصوات": "محاضر",
  "كشف حضور": "محاضر",
  "نموذج إفصاح عضوية مجلس": "حوكمة",
  "اعتماد سياسة": "سياسات",
  "بطاقة توصيف وظيفي": "حوكمة"
};
async function archiveIfFullySigned(signingDocId, latestFileUrl){
  const { data: doc } = await sb.from("signing_documents").select("*").eq("id", signingDocId).single();
  if(!doc) return;
  const { count } = await sb.from("official_doc_signatures").select("*", { count: "exact", head: true }).eq("document_id", signingDocId);
  const signedCount = count || 0;
  if(signedCount < (doc.signers_total || 1)) return; // still missing a signature — not final yet
  await sb.from("signing_documents").update({ status: "موقّع بالكامل" }).eq("id", signingDocId);
  const category = ARCHIVE_CATEGORY_BY_DOC_TYPE[doc.doc_type] || "أخرى";
  await autoArchiveDocument(doc.document_name || doc.doc_type, category, latestFileUrl || doc.file_url);
  if(doc.doc_type === "بطاقة توصيف وظيفي"){
    await sb.from("job_descriptions").update({ status: "موقّعة نهائية", final_file_url: latestFileUrl || doc.file_url }).eq("signing_doc_id", signingDocId);
  }
}

async function generateSignedDocumentPDF(docId, btn){
  const originalBtnText = btn ? btn.textContent : null;
  if(btn){ btn.textContent = "⏳ جارِ التجهيز..."; btn.disabled = true; }

  try{
    const [{ data: doc, error: docErr }, { data: sigs, error: sigErr }] = await Promise.all([
      sb.from("signing_documents").select("*").eq("id", docId).single(),
      sb.from("document_signatures").select("*").eq("document_id", docId).order("created_at",{ascending:true})
    ]);
    if(docErr || sigErr || !doc) throw new Error("تعذّر تحميل بيانات الوثيقة");

    const signatures = sigs || [];
    const total = doc.signers_total || 0;
    const isComplete = total>0 && signatures.length >= total;
    const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
    const isPdfOriginal = doc.file_url && /\.pdf(\?|$)/i.test(doc.file_url);

    // Draw the certificate on an offscreen canvas first — the browser's own text engine
    // correctly shapes/joins Arabic letters (pdf-lib's built-in text drawing does not), so we
    // render it as pixels here and embed that as a real PDF page, guaranteeing it reads right.
    const scale = 2; // render at 2x for print sharpness
    const W = 595 * scale, H = 842 * scale; // A4 in points × scale
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    const RM = W - 50*scale; // right margin x

    ctx.fillStyle = "#1A3A6B";
    ctx.fillRect(0, 0, W, 6*scale);
    ctx.font = `bold ${22*scale}px Tajawal, Arial`;
    ctx.fillStyle = "#1A3A6B";
    ctx.fillText(isComplete ? "وثيقة موقّعة إلكترونيًا" : "شهادة توقيع إلكتروني", RM, 50*scale);

    ctx.font = `${13*scale}px Tajawal, Arial`;
    ctx.fillStyle = "#0D2447";
    let y = 85*scale;
    const line = (label, value) => { ctx.fillText(`${label}: ${value||"—"}`, RM, y); y += 22*scale; };
    line("اسم الوثيقة", doc.document_name);
    line("النوع", doc.doc_type);
    line("الموعد", doc.due_date);
    line("تاريخ إصدار الشهادة", dateNow);

    y += 15*scale;
    ctx.font = `bold ${14*scale}px Tajawal, Arial`;
    ctx.fillText("سجل التوقيعات", RM, y);
    y += 15*scale;
    ctx.strokeStyle = "#cccccc"; ctx.beginPath(); ctx.moveTo(50*scale,y); ctx.lineTo(RM,y); ctx.stroke();
    y += 25*scale;

    // Pre-load signature images so we can draw them inline with each row.
    const loadImg = (src) => new Promise((resolve) => {
      if(!src){ resolve(null); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    const sigImages = await Promise.all(signatures.map(s => loadImg(s.signature_image)));

    if(signatures.length === 0){
      ctx.font = `${12*scale}px Tajawal, Arial`;
      ctx.fillStyle = "#C0392B";
      ctx.fillText("لا توجد توقيعات مسجّلة بعد.", RM, y);
      y += 25*scale;
    } else {
      ctx.font = `${12*scale}px Tajawal, Arial`;
      signatures.forEach((s, i) => {
        ctx.fillStyle = "#0D2447";
        ctx.fillText(`${i+1}. ${s.signer_name||"—"}  (${s.signer_email||"—"})`, RM, y);
        ctx.font = `${10.5*scale}px Tajawal, Arial`;
        ctx.fillStyle = "#8B95A5";
        ctx.fillText(`وقّع بتاريخ: ${new Date(s.created_at).toLocaleString("ar-SA-u-ca-gregory")}`, RM, y + 15*scale);
        const img = sigImages[i];
        if(img){
          const imgH = 26*scale, imgW = imgH * (img.width/img.height);
          ctx.drawImage(img, 50*scale, y - 18*scale, Math.min(imgW,90*scale), imgH);
        }
        ctx.font = `${12*scale}px Tajawal, Arial`;
        y += 42*scale;
      });
    }

    y += 10*scale;
    ctx.fillStyle = isComplete ? "#EAF8F0" : "#FEF3E2";
    ctx.fillRect(50*scale, y, W-100*scale, 55*scale);
    ctx.strokeStyle = isComplete ? "#1E8E5A" : "#C99A2E";
    ctx.lineWidth = 2*scale;
    ctx.strokeRect(50*scale, y, W-100*scale, 55*scale);
    ctx.font = `bold ${13*scale}px Tajawal, Arial`;
    ctx.fillStyle = isComplete ? "#166A43" : "#8A6D1F";
    ctx.textAlign = "center";
    const stampText = isComplete
      ? `✅ اكتمل توقيع هذه الوثيقة من ${signatures.length} من ${total} من الأشخاص المخوّلين.`
      : `⏳ التوقيع قيد الإتمام — وقّع حتى الآن ${signatures.length} من ${total||'?'} موقّعين مطلوبين.`;
    ctx.fillText(stampText, W/2, y + 32*scale);
    ctx.textAlign = "right";

    const certPngDataUrl = canvas.toDataURL("image/png");

    // Build the final PDF: start from the original file's bytes when it's already a PDF (so its
    // real pages carry over untouched), otherwise start a fresh document — then append our
    // canvas-rendered certificate page on top either way.
    const { PDFDocument } = PDFLib;
    let pdfDoc;
    if(isPdfOriginal){
      const res = await fetch(doc.file_url);
      const bytes = await res.arrayBuffer();
      pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } else {
      pdfDoc = await PDFDocument.create();
    }
    const pngBytes = await (await fetch(certPngDataUrl)).arrayBuffer();
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([595, 842]);
    page.drawImage(pngImage, { x: 0, y: 0, width: 595, height: 842 });

    const finalBytes = await pdfDoc.save();
    const blob = new Blob([finalBytes], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${isComplete?"وثيقة-موقّعة":"شهادة-توقيع"}-${(doc.document_name||"مستند").replace(/[\\/:*?"<>|]/g,"_")}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);

    if(!isPdfOriginal && doc.file_url){
      alert("تم تحميل شهادة التوقيع كـPDF حقيقي ✅\n\nملاحظة: الملف الأصلي المرفوع هو Word، والمتصفحات لا تقدر تدمج محتواه تلقائيًا داخل PDF. لضمّ محتوى المستند نفسه مع التوقيعات مستقبلًا، ارفعه كـPDF بدل Word.");
    }
  }catch(e){
    alert("تعذّر توليد الملف: " + e.message);
  }finally{
    if(btn){ btn.textContent = originalBtnText; btn.disabled = false; }
  }
}

async function saveSigning(){
  const document_name = document.getElementById("ms-name").value.trim();
  if(!document_name){ alert("الرجاء إدخال اسم الوثيقة"); return; }
  const doc_type = document.getElementById("ms-type").value.trim();
  const signers_total = document.getElementById("ms-total").value ? Number(document.getElementById("ms-total").value) : null;
  const due_date = document.getElementById("ms-duedate").value || null;
  const fileInput = document.getElementById("ms-file");
  const file_url = await uploadFile(fileInput, "signing");
  const { error } = await sb.from("signing_documents").insert([{ document_name, doc_type, signers_total, signers_done: 0, status: "قيد التوقيع", due_date, file_url, company_id: currentCompanyId }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("ms-name").value=""; document.getElementById("ms-type").value=""; document.getElementById("ms-total").value=""; document.getElementById("ms-duedate").value=""; fileInput.value="";
  closeM("m-signing"); loadSigning();
}
