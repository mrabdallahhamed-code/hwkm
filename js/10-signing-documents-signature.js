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
