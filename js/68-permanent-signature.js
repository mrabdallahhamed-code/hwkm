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
