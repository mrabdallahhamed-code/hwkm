/* ══════════ SIGNING DOCUMENTS ══════════ */
/* ══════════ E-SIGNATURE (real per-user signing) ══════════ */
let signingDocsCache = [];
let signingSigsByDoc = {};
let signingOfficialSigsByDoc = {};

async function loadSigning(){
  const actionBox = document.getElementById("signingActionCards");
  const archiveTbody = document.getElementById("signingTbody");
  if(!actionBox && !archiveTbody) return;

  const { data: docs, error } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){
    if(actionBox) actionBox.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--red);font-size:12px;padding:20px">${error.message}</div>`;
    if(archiveTbody) archiveTbody.innerHTML = errorRowHTML(6, error.message);
    return;
  }
  signingDocsCache = docs || [];

  const docIds = signingDocsCache.map(d=>d.id);
  signingSigsByDoc = {};
  signingOfficialSigsByDoc = {};
  if(docIds.length){
    const [{ data: sigs }, { data: officialSigs }] = await Promise.all([
      sb.from("document_signatures").select("*").in("document_id", docIds),
      sb.from("official_doc_signatures").select("*").in("document_id", docIds)
    ]);
    (sigs||[]).forEach(s => { if(!signingSigsByDoc[s.document_id]) signingSigsByDoc[s.document_id]=[]; signingSigsByDoc[s.document_id].push(s); });
    (officialSigs||[]).forEach(s => { if(!signingOfficialSigsByDoc[s.document_id]) signingOfficialSigsByDoc[s.document_id]=[]; signingOfficialSigsByDoc[s.document_id].push(s); });
  }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  window.__myEmailForSigning = myEmail;
  const role = getCurrentRole();

  // ── Pending cards: only what still needs a signature, front and center ──
  if(actionBox){
    if(role === 'مساهم'){
      actionBox.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد وثائق تخصّك.</div>`;
    } else {
      const pending = signingDocsCache.filter(s => {
        const signed = (!!s.signer_roles ? signingOfficialSigsByDoc[s.id] : signingSigsByDoc[s.id]) || [];
        const total = s.signers_total || 0;
        return !(total>0 && signed.length >= total);
      });
      if(pending.length===0){
        actionBox.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--green);font-size:12.5px;padding:20px;font-weight:700"><span class="ico-i ico-check"></span>لا توجد وثائق تنتظر التوقيع حاليًا.</div>`;
      } else {
        actionBox.innerHTML = pending.map(s => {
          const signed = (!!s.signer_roles ? signingOfficialSigsByDoc[s.id] : signingSigsByDoc[s.id]) || [];
          const total = s.signers_total || 0;
          const iSigned = myEmail && signed.some(x => x.signer_email === myEmail);
          const namesList = signed.length ? signed.map(x=>x.signer_name||x.signer_email).join('، ') : 'لا أحد بعد';
          const pct = total>0 ? Math.round(signed.length/total*100) : 0;
          const actionBtn = s.signer_roles
            ? officialActionHTML(s, signed, myEmail, true)
            : (iSigned
              ? '<span class="badge done" style="width:100%;justify-content:center;padding:9px 0"><span class="ico-i ico-check"></span>وقّعت — انتهى توقيعك</span>'
              : `<button class="btn btn-gold" style="width:100%" onclick="openSignaturePad(${s.id})"><span class="ico-i ico-signature"></span>توقيع الآن</button>`);
          return `<div class="card">
            <div class="card-body">
              <div style="font-weight:800;font-size:13.5px;color:var(--dark);margin-bottom:2px">${orgEsc(s.document_name||"")}</div>
              <div style="font-size:11px;color:var(--gray3);margin-bottom:10px">${s.doc_type||"—"} ${s.due_date?(' · موعد: '+s.due_date):''}</div>
              <div style="background:var(--gray1);border-radius:3px;height:5px;overflow:hidden;margin-bottom:6px">
                <div style="background:var(--gold);height:100%;width:${pct}%"></div>
              </div>
              <div style="font-size:10.5px;color:var(--gray3);margin-bottom:12px">${signed.length}/${total||"?"} وقّعوا — ${namesList}</div>
              ${actionBtn}
            </div>
          </div>`;
        }).join("");
      }
    }
  }

  renderSigningArchiveTable();
}

function renderSigningArchiveTable(){
  const archiveTbody = document.getElementById("signingTbody");
  if(!archiveTbody) return;
  const q = (document.getElementById("signingArchiveSearch")?.value || "").trim().toLowerCase();
  const list = q
    ? signingDocsCache.filter(s => (s.document_name||"").toLowerCase().includes(q) || (s.doc_type||"").toLowerCase().includes(q))
    : signingDocsCache;

  if(signingDocsCache.length===0){
    archiveTbody.innerHTML = emptyRowHTML(6, 'لا توجد بيانات بعد. اضغط "+ توقيع جديد" للبدء.');
    return;
  }
  if(list.length===0){
    archiveTbody.innerHTML = emptyRowHTML(6, 'لا نتائج مطابقة للبحث.');
    return;
  }

  archiveTbody.innerHTML = list.map(s => {
    const isOfficialDoc = !!s.signer_roles;
    const signed = isOfficialDoc ? (signingOfficialSigsByDoc[s.id] || []) : (signingSigsByDoc[s.id] || []);
    const total = s.signers_total || 0;
    const isComplete = total>0 && signed.length >= total;
    const statusBadge = isComplete ? '<span class="badge done"><span class="ico-i ico-check" style="margin-left:3px"></span>مكتمل</span>' : '<span class="badge pending">قيد التوقيع</span>';
    const fileLink = s.file_url ? `<a href="${s.file_url}" target="_blank" rel="noopener" title="عرض الملف" style="color:var(--primary);margin-left:10px"><span class="ico ico-document" style="width:16px;height:16px"></span></a>` : "";
    const primaryAction = isOfficialDoc
      ? (isComplete ? `<button class="btn-xs" style="background:#FEF3E2;color:var(--gold);border:1px solid var(--gold);border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer" onclick="applyCompanySealToDoc(${s.id})">إضافة الختم</button>`
                    : officialActionHTML(s, signed, window.__myEmailForSigning, false))
      : `<button class="btn-xs gold" onclick="generateSignedDocumentPDF(${s.id},this)">${isComplete ? "تحميل PDF" : "حالة التوقيع"}</button>`;
    return `<tr>
      <td>${fileLink}${orgEsc(s.document_name||"")}</td>
      <td style="color:var(--gray3);font-size:12px">${s.doc_type||"—"}</td>
      <td style="font-size:12px">${signed.length}/${total||"?"}</td>
      <td>${statusBadge}</td>
      <td style="color:var(--gray3);font-size:12px">${s.due_date||"—"}</td>
      <td style="display:flex;gap:6px;align-items:center">${primaryAction}<button class="btn-xs" style="background:#FBEAEA;color:var(--red);border:none;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer" onclick="deleteSigningDoc(${s.id})" title="حذف"><span class="ico ico-trash" style="width:13px;height:13px"></span></button></td>
    </tr>`;
  }).join("");
}

let currentSignDocId = null;
let sigPadDrawing = false;
let sigPadCtx = null;

function openSignaturePad(docId){
  currentSignDocId = docId;
  openM("m-signature-pad");
  // Canvas must be sized/initialized after the modal is visible, otherwise it has zero size
  setTimeout(initSignaturePad, 50);
}

/* ══════════ PERMANENT SIGNATURE (التوقيع الدائم) ══════════
   A person's first signature on the platform becomes their only one. Every signing flow reads its
   image straight from its own drawing pad, so rather than touching each flow's save logic, a locked
   signature is painted onto the pad itself and drawing is switched off — whichever flow reads the
   pad then gets the locked image. The database allows one insert per email and no updates or
   deletes (see the user_signatures policies), so this is not just a hidden button. */
let userLockedSignature = undefined;      // undefined = not loaded yet, null = has none, string = data URL
let userLockedSignatureFor = null;

async function loadUserLockedSignature(force){
  const { data: { session } } = await sb.auth.getSession();
  const email = session && session.user ? session.user.email : null;
  if(!email) return null;
  if(!force && userLockedSignature !== undefined && userLockedSignatureFor === email) return userLockedSignature;
  const { data } = await sb.from("user_signatures").select("signature_image").eq("email", email).maybeSingle();
  userLockedSignatureFor = email;
  userLockedSignature = data ? data.signature_image : null;
  return userLockedSignature;
}

function sigPadModalButtons(canvas){
  const modal = canvas.closest(".modal");
  return modal ? Array.from(modal.querySelectorAll("button")).filter(b => /^clear\w*Pad/.test((b.getAttribute("onclick")||"").trim())) : [];
}

async function applyLockedSignature(canvasId){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const locked = await loadUserLockedSignature();
  const holder = canvas.parentElement;
  const old = holder.parentElement.querySelector(".sig-lock-note");
  if(old) old.remove();
  const note = document.createElement("div");
  note.className = "sig-lock-note";
  note.style.cssText = "font-size:11px;margin-top:6px;line-height:1.6;" + (locked ? "color:var(--green);font-weight:700" : "color:var(--gray3)");
  note.textContent = locked ? "توقيعك المعتمد الدائم — يُستخدم تلقائيًا ولا يمكن تغييره." : "أول توقيع تعتمده هنا سيصبح توقيعك الدائم لكل المستندات القادمة، ولا يمكن تغييره بعد ذلك.";
  holder.insertAdjacentElement("afterend", note);

  sigPadModalButtons(canvas).forEach(b => { b.style.display = locked ? "none" : ""; });
  if(!locked){ canvas.style.cursor = "crosshair"; return; }

  canvas.onmousedown = canvas.onmousemove = canvas.onmouseup = canvas.onmouseleave = null;
  canvas.ontouchstart = canvas.ontouchmove = canvas.ontouchend = null;
  canvas.style.cursor = "default";
  const ctx = canvas.getContext("2d");
  await new Promise(res => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * r, h = img.height * r;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      res();
    };
    img.onerror = res;
    img.src = locked;
  });
}

/* Called by each confirm function once its own validations have passed. Returns false if the
   person backs out of making this their permanent signature. If a signature already exists
   (including one saved from another device a moment ago) it is painted back onto the pad, so the
   image the caller reads next is always the locked one. */
async function lockFirstSignature(canvasId){
  const existing = await loadUserLockedSignature();
  if(existing){ await applyLockedSignature(canvasId); return true; }
  if(!await uiConfirm("هذا أول توقيع لك بالمنصة، وسيُعتمد توقيعاً دائماً لكل مستنداتك القادمة ولا يمكن تغييره لاحقاً.\n\nهل تعتمد هذا التوقيع؟")) return false;
  const canvas = document.getElementById(canvasId);
  const { data: { session } } = await sb.auth.getSession();
  const email = session && session.user ? session.user.email : null;
  if(!email){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return false; }
  const { error } = await sb.from("user_signatures").insert([{ email, signature_image: canvas.toDataURL("image/png") }]);
  if(error){
    const again = await loadUserLockedSignature(true);
    if(again){ await applyLockedSignature(canvasId); alert("لديك توقيع معتمد مسبقاً، وسيُستخدم هو."); return true; }
    alert("تعذّر حفظ التوقيع الدائم: " + error.message);
    return false;
  }
  userLockedSignature = canvas.toDataURL("image/png");
  userLockedSignatureFor = email;
  await applyLockedSignature(canvasId);
  return true;
}

function initSignaturePad(){
  const canvas = document.getElementById("sigCanvas");
  if(!canvas) return;
  // Match the canvas's internal pixel size to its displayed size for crisp, correctly-aligned drawing
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  sigPadCtx = ctx;

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - r.left, y: point.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); sigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!sigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { sigPadDrawing = false; };

  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("sigCanvas");
}

function clearSignaturePad(){
  if(!sigPadCtx) return;
  const canvas = document.getElementById("sigCanvas");
  sigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isSignaturePadEmpty(){
  const canvas = document.getElementById("sigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

async function confirmSignature(){
  const docId = currentSignDocId;
  if(!docId) return;
  if(isSignaturePadEmpty()){ alert("الرجاء رسم توقيعك أولًا قبل التأكيد"); return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const signer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { data: existing } = await sb.from("document_signatures").select("id").eq("document_id", docId).eq("signer_email", myEmail);
  if(existing && existing.length){ alert("لقد وقّعت هذه الوثيقة بالفعل ✅"); closeM("m-signature-pad"); return; }

  if(!(await lockFirstSignature("sigCanvas"))) return;
  const canvas = document.getElementById("sigCanvas");
  const signature_image = canvas.toDataURL("image/png");

  const { error } = await sb.from("document_signatures").insert([{ document_id: docId, signer_email: myEmail, signer_name, signature_image, company_id: currentCompanyId }]);
  if(error){ alert("تعذّر تسجيل التوقيع: " + error.message); return; }

  // Recompute and, if this was the final required signature, mark the document complete
  const { data: sigs } = await sb.from("document_signatures").select("id").eq("document_id", docId);
  const doc = signingDocsCache.find(d => d.id === docId);
  if(doc && doc.signers_total && sigs && sigs.length >= doc.signers_total){
    await sb.from("signing_documents").update({ status: "مكتمل" }).eq("id", docId);
  }
  closeM("m-signature-pad");
  loadSigning();
  loadMeetingsAll(); // refresh any board/committee minutes cards linked to this document
}

async function deleteSigningDoc(id){
  if(!await uiConfirm("حذف هذه الوثيقة وكل توقيعاتها نهائيًا؟")) return;
  const { error } = await sb.from("signing_documents").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadSigning();
}

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

/* ══════════ COMMITTEES ══════════ */
let committeesCache = [];
async function loadCommittees(){
  const wrap = document.getElementById("committeesCards");
  if(!wrap) return;
  const { data, error } = await sb.from("committees").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ wrap.innerHTML = `<div style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</div>`; return; }
  committeesCache = data || [];
  if(committeesCache.length===0){ wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد بيانات بعد. اضغط "+ إضافة لجنة" للبدء.</div>'; return; }

  const ids = committeesCache.map(c=>c.id);
  const { data: allLinks } = ids.length ? await sb.from("committee_members").select("*").in("committee_id", ids) : { data: [] };
  const countByCommittee = {};
  (allLinks||[]).forEach(l => { countByCommittee[l.committee_id] = (countByCommittee[l.committee_id]||0) + 1; });

  const catColors = { "لجنة رئيسية": "var(--primary)", "لجنة متخصصة": "#8B2FC9" };
  wrap.innerHTML = committeesCache.map(c => {
    const color = catColors[c.category] || "var(--gray3)";
    const memberCount = countByCommittee[c.id] || 0;
    const hasCharter = !!(c.charter_purpose || c.charter_authorities || c.charter_composition);
    return `<div class="card" style="margin:0;border-right:4px solid ${color};display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="font-size:11px;font-weight:800;color:${color};margin-bottom:4px">${orgEsc(c.category||"لجنة")}</div>
          <div style="display:flex;gap:6px">
            <button class="btn-xs primary" onclick="editCommittee(${c.id})"><span class="ico-i ico-edit"></span>تعديل</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteCommittee(${c.id})"><span class="ico-i ico-trash"></span>حذف</button>
          </div>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--dark);margin-bottom:8px">${orgEsc(c.committee_name||"")}</div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-user"></span>رئيس اللجنة: <b style="color:var(--dark)">${orgEsc(c.chairman_name||"—")}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-users"></span>عدد الأعضاء المحددين: <b style="color:var(--dark)">${memberCount}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-calendar"></span>تاريخ التعيين: ${c.appointment_date||"—"}</div>
        ${c.scope ? `<div style="font-size:11.5px;color:var(--gray3);background:var(--offwhite);border-radius:8px;padding:8px;margin-bottom:8px">${c.scope}</div>` : ""}
        <button class="btn-xs" style="width:100%;margin-top:auto;background:${hasCharter?'#E8F8EF':'var(--offwhite)'};color:${hasCharter?'var(--green)':'var(--dark)'};border:1px solid ${hasCharter?'transparent':'var(--gray1)'};border-radius:6px;padding:6px;font-size:11px;cursor:pointer" onclick="openCharterModal(${c.id})"><span class="ico-i ico-scroll"></span>${hasCharter?'عرض/تعديل الميثاق ✅':'إعداد ميثاق اللجنة'}</button>
      </div>
    </div>`;
  }).join("");
}
function openCharterModal(committeeId){
  const c = committeesCache.find(x => x.id === committeeId);
  if(!c) return;
  document.getElementById("mch-committee-id").value = committeeId;
  document.getElementById("mch-title-h").textContent = "📜 ميثاق — " + (c.committee_name||"");
  document.getElementById("mch-purpose").value = c.charter_purpose || "";
  document.getElementById("mch-authorities").value = c.charter_authorities || "";
  document.getElementById("mch-composition").value = c.charter_composition || "";
  document.getElementById("mch-meetings-rules").value = c.charter_meetings_rules || "";
  document.getElementById("mch-reporting").value = c.charter_reporting || "";
  document.getElementById("mch-approved-date").value = c.charter_approved_date || "";
  document.getElementById("mch-file").value = "";
  openM("m-charter");
  renderCharterApprovalStatus(committeeId);
}

async function saveCharter(){
  const committeeId = Number(document.getElementById("mch-committee-id").value);
  const fileInput = document.getElementById("mch-file");
  const file_url = await uploadFile(fileInput, "charters");
  const payload = {
    charter_purpose: document.getElementById("mch-purpose").value.trim(),
    charter_authorities: document.getElementById("mch-authorities").value.trim(),
    charter_composition: document.getElementById("mch-composition").value.trim(),
    charter_meetings_rules: document.getElementById("mch-meetings-rules").value.trim(),
    charter_reporting: document.getElementById("mch-reporting").value.trim(),
    charter_approved_date: document.getElementById("mch-approved-date").value || null
  };
  if(file_url) payload.charter_file_url = file_url;
  const { error } = await sb.from("committees").update(payload).eq("id", committeeId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  const c = committeesCache.find(x => x.id === committeeId);
  logActivity("تعديل", "ميثاق لجنة", c?c.committee_name:"", "");
  closeM("m-charter");
  loadCommittees();
}

function editCommittee(id){
  const c = committeesCache.find(x => x.id === id);
  if(!c) return;
  document.getElementById("mcm-id").value = c.id;
  document.getElementById("mcm-title-h").textContent = "✏️ تعديل لجنة";
  document.getElementById("mcm-name").value = c.committee_name || "";
  document.getElementById("mcm-chairman").value = c.chairman_name || "";
  document.getElementById("mcm-appointment-date").value = c.appointment_date || "";
  document.getElementById("mcm-category").value = c.category || "لجنة رئيسية";
  document.getElementById("mcm-scope").value = c.scope || "";
  renderCommitteeMembersCheckboxes(id);
  openM("m-committee");
}

async function openNewCommitteeModal(){
  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value = "";
  document.getElementById("mcm-chairman").value = "";
  document.getElementById("mcm-appointment-date").value = "";
  document.getElementById("mcm-scope").value = "";
  await renderCommitteeMembersCheckboxes(null);
  openM("m-committee");
}

async function renderCommitteeMembersCheckboxes(committeeId){
  const box = document.getElementById("mcm-members-list");
  if(!box) return;
  box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  const { data: allMembers } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  let selectedIds = [];
  if(committeeId){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", committeeId);
    selectedIds = (links||[]).map(l => l.member_id);
  }
  if(!allMembers || allMembers.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء مسجّلون بصفحة "أعضاء مجلس الإدارة" بعد.</div>'; return; }
  box.innerHTML = allMembers.map(m => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;cursor:pointer">
      <input type="checkbox" class="mcm-member-cb" value="${m.id}" ${selectedIds.includes(m.id)?"checked":""}>
      ${orgEsc(m.name||"")}
    </label>`).join("");
}

async function deleteCommittee(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه اللجنة نهائيًا؟")) return;
  const { error } = await sb.from("committees").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadCommittees();
}
async function saveCommittee(){
  const id = document.getElementById("mcm-id").value;
  const committee_name = document.getElementById("mcm-name").value.trim();
  if(!committee_name){ alert("الرجاء إدخال اسم اللجنة"); return; }
  const chairman_name = document.getElementById("mcm-chairman").value.trim();
  const appointment_date = document.getElementById("mcm-appointment-date").value || null;
  const category = document.getElementById("mcm-category").value;
  const scope = document.getElementById("mcm-scope").value.trim();
  const payload = { committee_name, chairman_name, appointment_date, category, scope, company_id: currentCompanyId };

  let committeeId = id;
  if(id){
    const { error } = await sb.from("committees").update(payload).eq("id", id);
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("committees").insert([payload]).select().single();
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
    committeeId = data.id;
  }

  // Sync selected members: clear old links then insert the currently-checked ones
  const checkedIds = Array.from(document.querySelectorAll(".mcm-member-cb:checked")).map(cb => Number(cb.value));
  await sb.from("committee_members").delete().eq("committee_id", committeeId);
  if(checkedIds.length){
    await sb.from("committee_members").insert(checkedIds.map(mid => ({ committee_id: committeeId, member_id: mid, company_id: currentCompanyId })));
  }

  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value=""; document.getElementById("mcm-chairman").value=""; document.getElementById("mcm-appointment-date").value=""; document.getElementById("mcm-scope").value="";
  closeM("m-committee"); loadCommittees();
}

/* ══════════ ORG STRUCTURE ══════════ */
let structureCache = [];
const orgLevelLabels = {1:'الجمعية العامة',2:'مجلس الإدارة',3:'اللجان المنبثقة',4:'الرئيس التنفيذي',5:'نواب الرئيس / الإدارة العليا',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'};
/* One colour per organisational level — the same colour is used on screen, in the PDF and in the legend. */
/* Level names depend on the legal form: a sole proprietorship or a single-owner LLC has an owner and a manager,
   not a general assembly. The stored number (1-8) and its colour stay the same for every entity type. */
const ORG_LABELS_BY_KIND = {
  stock: orgLevelLabels,
  llc:   {1:'جمعية الشركاء',2:'مجلس المديرين',3:'اللجان المنبثقة',4:'الرئيس التنفيذي / المدير العام',5:'الإدارة العليا / المدراء الرئيسيون',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'},
  small: {1:'المالك',4:'المدير العام / التنفيذي',5:'الإدارة العليا / المدراء الرئيسيون',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'}
};
const ORG_LABELS_EN = {
  stock: {1:'General Assembly',2:'Board of Directors',3:'Sub-committees',4:'Chief Executive Officer',5:'Vice Presidents / Senior Management',6:'Departments',7:'Sections',8:'Units / Teams'},
  llc:   {1:"Partners' Assembly",2:'Board of Managers',3:'Sub-committees',4:'CEO / General Manager',5:'Senior Management / Principal Managers',6:'Departments',7:'Sections',8:'Units / Teams'},
  small: {1:'Owner',4:'General / Executive Manager',5:'Senior Management / Principal Managers',6:'Departments',7:'Sections',8:'Units / Teams'}
};
function orgLevelKind(){
  if(currentCompanyType === "مؤسسة فردية" || (currentCompanyType === "ذات مسؤولية محدودة" && typeof currentCompanyLLCSingleOwner !== "undefined" && currentCompanyLLCSingleOwner)) return "small";
  if(currentCompanyType === "ذات مسؤولية محدودة") return "llc";
  return "stock";
}
function orgLabels(){ return ORG_LABELS_BY_KIND[orgLevelKind()] || orgLevelLabels; }
/* Fill the level dropdown with only the levels that make sense for this company (plus the level of the row being edited). */
function populateOrgLevelSelect(extraLevel){
  const sel = document.getElementById("mst-level");
  if(!sel) return;
  const L = orgLabels();
  const prev = sel.value;
  const levels = new Set(Object.keys(L).map(Number));
  if(extraLevel != null && extraLevel !== "" && !isNaN(Number(extraLevel))) levels.add(Number(extraLevel));
  sel.innerHTML = [...levels].sort((a,b) => a-b).map(l => `<option value="${l}">${l} — ${orgEsc(L[l] || orgLevelLabels[l] || ("مستوى " + l))}</option>`).join("");
  const want = (extraLevel != null && extraLevel !== "") ? String(extraLevel) : prev;
  sel.value = (want && levels.has(Number(want))) ? want : (orgLevelKind() === "small" ? "6" : "3");
}
const ORG_LEVEL_COLORS = {1:'#0F2138',2:'#1F4E8C',3:'#6B4FA0',4:'#1B5E4A',5:'#2E8B6E',6:'#9C7A2E',7:'#B5612A',8:'#5E6B78'};
function orgLevelColor(l){ return ORG_LEVEL_COLORS[l] || '#5E6B78'; }
/* Per-node override: true = children hidden, false = children shown. No entry = the default (sections and units start folded). */
let orgOverride = new Map();
let orgNodeCollapsed = {};
let orgSideSupported = false;
const ORG_SIDE_WIDTH = 210;
const ORG_COLLAPSE_FROM_LEVEL = 7;
/* A "side" unit (internal audit, governance, CEO office...) is drawn beside the unit it reports to with a dashed
   line, while keeping its own level colour. The explicit is_side column wins; while it is empty (or the column
   does not exist yet) well-known unit names are recognised automatically. */
function orgIsSideRaw(r){
  if(r.is_side === true) return true;
  if(r.is_side === false) return false;
  return !r.is_body && (r.level ?? 0) >= 5 && /المراجعة الداخلية|التدقيق الداخلي|الحوكمة|مكتب (الرئيس|المدير)/.test(r.position_title || "");
}
function orgEsc(v){ return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function orgLevelLabel(lvl){
  if(lvl==null) return "—";
  const L = orgLabels();
  const nm = L[lvl] || orgLevelLabels[lvl];
  return nm ? `${lvl} — ${nm}` : `مستوى ${lvl}`;
}

/* Fill the "يتبع لـ" dropdown with every existing position, defaulting to the most
   recently added one so a new position naturally chains under the previous one. */
function populateParentPositionSelect(preselect){
  const sel = document.getElementById("mst-parent");
  if(!sel) return;
  const options = ['<option value="">— بدون (أعلى مستوى في الهيكل) —</option>']
    .concat(structureCache.map(s => `<option value="${(s.position_title||"").replace(/"/g,'&quot;')}">${orgEsc(s.position_title||"")}</option>`));
  sel.innerHTML = options.join("");
  sel.value = preselect || "";
}

async function loadStructure(){
  const tbody = document.getElementById("structureTbody");
  const chartWrap = document.getElementById("orgTreeContainer");
  if(!tbody) return;
  const { data, error } = await sb.from("org_structure").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  if(error){ tbody.innerHTML = errorRowHTML(7, error.message); if(chartWrap) chartWrap.innerHTML = ""; return; }
  structureCache = data || [];
  // Display-only: positions saved without a level take their parent's level + 1 (nothing is written back to the database).
  (function(){
    const bt = {}; structureCache.forEach(r => { if(r.position_title) bt[r.position_title] = r; });
    const eff = (r, d) => { if(r.level != null) return r.level; if(d > 8) return 5; const p = bt[r.parent_position]; return p && p !== r ? Math.min(8, (eff(p, d+1) ?? 4) + 1) : 5; };
    structureCache.forEach(r => { if(r.level == null && !r.is_body) r.level = eff(r, 0); });
  })();
  try{
    const probe = await sb.from("org_structure").select("is_side").limit(1);
    orgSideSupported = !probe.error;
  }catch(e){ orgSideSupported = false; }
  populateOrgLevelSelect();
  const sideRow = document.getElementById("mst-side-row");
  if(sideRow) sideRow.style.display = orgSideSupported ? "flex" : "none";
  if(structureCache.length===0){
    tbody.innerHTML = emptyRowHTML(7, 'لا توجد بيانات بعد. اضغط "+ إضافة إدارة / قسم / وحدة" للبدء.');
    if(chartWrap) chartWrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا يوجد هيكل تنظيمي بعد. اضغط "+ إضافة إدارة / قسم / وحدة" لبدء بناء الهيكل.</div>';
    return;
  }

  const byT = {}; structureCache.forEach(r => { if(r.position_title) byT[r.position_title] = r; });
  const deptOf = r => { let c = byT[r.parent_position], n = 0; while(c && n++ < 12){ if(c.unit_type === "department") return c.position_title; c = byT[c.parent_position]; } return ""; };
  const btns = s => `<button class="btn-xs primary" onclick="editStructure(${s.id})"><span class="ico-i ico-edit"></span>تعديل</button>
      <button class="btn-xs" style="background:#FDF5DC;color:var(--gold);border:1px solid #F0D8A0;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px" onclick="openJobDescriptionModal(${s.id})"><span class="ico-i ico-document"></span>الوصف الوظيفي</button>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px" onclick="deletePosition(${s.id})"><span class="ico-i ico-trash"></span>حذف</button>`;
  const personRows = [];
  structureCache.filter(s => !s.is_body && !s.unit_type).forEach(s => {
    const hs = orgHolderList(s);
    const par = byT[s.parent_position];
    const unitCol = s.parent_position ? orgEsc(s.parent_position) : "—";
    const dept = deptOf(s);
    const deptCol = dept && dept !== s.parent_position ? orgEsc(dept) : (par && par.unit_type === "department" ? orgEsc(par.position_title) : "—");
    const unitShown = par && par.unit_type === "department" ? "—" : unitCol;
    (hs.length ? hs : [{ name: "", direct_manager: "", appointment_date: "" }]).forEach(h => {
      personRows.push(`<tr><td>${orgEsc(h.name || "— (شاغر)")}</td><td>${orgEsc(s.position_title||"")}</td><td>${unitShown}</td><td>${deptCol}</td><td>${orgEsc(h.direct_manager||"—")}</td><td>${h.appointment_date ? orgEsc(h.appointment_date) : "—"}</td><td>${btns(s)}</td></tr>`);
    });
  });
  tbody.innerHTML = personRows.join("") || emptyRowHTML(7, "لا يوجد مناصب بعد. أضف الهيكل أولًا ثم اضغط \"+ إضافة منصب\".");

  rerenderOrgTree();
}

