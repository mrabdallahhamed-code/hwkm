/* ══════════ INTERNAL GOVERNANCE EVALUATION (linked to policies & permissions matrix) ══════════ */
let govEvalCache = [];

function govEvalItemStatus(item, policiesById, permCellsByItemId){
  if(item.linked_policy_id){
    const p = policiesById[item.linked_policy_id];
    if(!p) return "غير مطبّق";
    if(p.status === "معتمدة نهائيًا") return "مطبّق";
    if(p.status === "مسودة") return "غير مطبّق";
    return "قيد التنفيذ";
  }
  if(item.linked_permission_item_id){
    const hasCells = permCellsByItemId[item.linked_permission_item_id];
    return hasCells ? "مطبّق" : "غير مطبّق";
  }
  return item.manual_status || "غير مطبّق";
}

async function loadGovEval(){
  const listBox = document.getElementById("govEvalList");
  const scoreBox = document.getElementById("govEvalScore");
  if(!listBox) return;

  const [{ data: items, error }, { data: policies }, { data: permCells }] = await Promise.all([
    sb.from("governance_evaluation_items").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("permission_cells").select("*")
  ]);
  if(error){ listBox.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  govEvalCache = items || [];

  const policiesById = {};
  (policies||[]).forEach(p => { policiesById[p.id] = p; });
  const permCellsByItemId = {};
  (permCells||[]).forEach(c => { if(c.code) permCellsByItemId[c.item_id] = true; });

  if(govEvalCache.length === 0){
    listBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد بنود تقييم بعد. اضغط "+ إضافة بند تقييم" للبدء.</div>';
    if(scoreBox) scoreBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لا توجد بيانات بعد.</div>';
    return;
  }

  const withStatus = govEvalCache.map(it => ({ ...it, _status: govEvalItemStatus(it, policiesById, permCellsByItemId) }));
  const appliedCount = withStatus.filter(it => it._status === "مطبّق").length;
  const scorePct = Math.round((appliedCount / withStatus.length) * 100);

  if(scoreBox){
    scoreBox.innerHTML = `<div class="comp-item"><div class="comp-head"><span class="comp-name">نسبة تطبيق بنود الحوكمة الداخلية</span><span class="comp-pct">${scorePct}%</span></div><div class="comp-track"><div class="comp-fill" style="width:${scorePct}%"></div></div></div>
      <div style="font-size:11px;color:var(--gray3);margin-top:4px">${appliedCount} من ${withStatus.length} بندًا مطبّق</div>`;
  }

  const statusStyle = { "مطبّق": {bg:"#E8F8EF",color:"var(--green)"}, "قيد التنفيذ": {bg:"#FEF3E2",color:"var(--gold)"}, "غير مطبّق": {bg:"#FDE8E8",color:"var(--red)"} };
  const groups = {};
  withStatus.forEach(it => { const c = it.category||"عام"; if(!groups[c]) groups[c]=[]; groups[c].push(it); });

  listBox.innerHTML = Object.keys(groups).map(cat => {
    const rows = groups[cat].map(it => {
      const st = statusStyle[it._status] || statusStyle["غير مطبّق"];
      const linkNote = it.linked_policy_id ? `🔗 مرتبط بسياسة: ${policiesById[it.linked_policy_id]?.policy_name||""}`
        : (it.linked_permission_item_id ? `🔗 مرتبط ببند صلاحية` : "");
      return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--gray1);gap:8px">
        <div>
          <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${orgEsc(it.item_text||"")}</div>
          ${linkNote ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${linkNote}</div>` : ""}
          ${it.notes ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-edit"></span>${orgEsc(it.notes)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:8px;background:${st.bg};color:${st.color}">${it._status}</span>
          <button class="btn-xs primary" onclick="editGovEvalItem(${it.id})"><span class="ico ico-edit" style="width:16px;height:16px"></span></button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer" onclick="deleteGovEvalItem(${it.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
        </div>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-bottom:14px"><div class="card-head"><span class="card-title">${cat}</span></div><div class="card-body">${rows}</div></div>`;
  }).join("");
}

async function populateGovEvalLinkSelects(){
  const [{ data: policies }, { data: permItems }] = await Promise.all([
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId)
  ]);
  const polSel = document.getElementById("mge-policy");
  polSel.innerHTML = '<option value="">— بدون ربط —</option>' + (policies||[]).map(p => `<option value="${p.id}">${orgEsc(p.policy_name)}</option>`).join("");
  const permSel = document.getElementById("mge-permission");
  permSel.innerHTML = '<option value="">— بدون ربط —</option>' + (permItems||[]).map(p => `<option value="${p.id}">${orgEsc(p.item_name)}</option>`).join("");
}

async function openNewGovEvalModal(){
  document.getElementById("mge-id").value = "";
  document.getElementById("mge-title-h").textContent = "📊 إضافة بند تقييم حوكمة";
  document.getElementById("mge-text").value = "";
  document.getElementById("mge-category").value = "";
  document.getElementById("mge-notes").value = "";
  document.getElementById("mge-manual-status").value = "غير مطبّق";
  await populateGovEvalLinkSelects();
  document.getElementById("mge-policy").value = "";
  document.getElementById("mge-permission").value = "";
  openM("m-gov-eval");
}

async function editGovEvalItem(id){
  const it = govEvalCache.find(x => x.id === id);
  if(!it) return;
  document.getElementById("mge-id").value = it.id;
  document.getElementById("mge-title-h").textContent = "✏️ تعديل بند تقييم حوكمة";
  document.getElementById("mge-text").value = it.item_text || "";
  document.getElementById("mge-category").value = it.category || "";
  document.getElementById("mge-notes").value = it.notes || "";
  document.getElementById("mge-manual-status").value = it.manual_status || "غير مطبّق";
  await populateGovEvalLinkSelects();
  document.getElementById("mge-policy").value = it.linked_policy_id || "";
  document.getElementById("mge-permission").value = it.linked_permission_item_id || "";
  openM("m-gov-eval");
}

async function deleteGovEvalItem(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذا البند؟")) return;
  const { error } = await sb.from("governance_evaluation_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadGovEval();
}

async function saveGovEvalItem(){
  const id = document.getElementById("mge-id").value;
  const item_text = document.getElementById("mge-text").value.trim();
  if(!item_text){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mge-category").value.trim();
  const linked_policy_id = document.getElementById("mge-policy").value ? Number(document.getElementById("mge-policy").value) : null;
  const linked_permission_item_id = document.getElementById("mge-permission").value ? Number(document.getElementById("mge-permission").value) : null;
  const manual_status = document.getElementById("mge-manual-status").value;
  const notes = document.getElementById("mge-notes").value.trim();
  const payload = { item_text, category, linked_policy_id, linked_permission_item_id, manual_status, notes, company_id: currentCompanyId };
  const { error } = id
    ? await sb.from("governance_evaluation_items").update(payload).eq("id", id)
    : await sb.from("governance_evaluation_items").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-gov-eval");
  loadGovEval();
}


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

/* ══════════ JOB DESCRIPTIONS — draft → edit → final document → e-signature ══════════
   Generic by design: pulls the company's own name, legal entity type (to word the approval
   line correctly — مجلس الإدارة for a joint-stock company, الشركاء for an LLC...), and
   registered activity, so the same tool works for any company instead of being written for
   one specific industry. Content sections start with light, general-purpose seed bullets the
   admin edits per role — no fabricated industry-specific claims. */
let currentJobDescription = null;

const GENERIC_JD_SEEDS = {
  purpose: ["تحقيق أهداف الإدارة ضمن الخطة العامة للشركة.", "الإشراف على تنفيذ المهام المنوطة بالوظيفة بكفاءة وجودة عالية."],
  tasks: ["تنفيذ المهام اليومية المرتبطة بالوظيفة وفق السياسات المعتمدة.", "إعداد التقارير الدورية ورفعها للمدير المباشر.", "التنسيق مع الإدارات الأخرى لإنجاز الأعمال المشتركة.", "الالتزام بإجراءات وسياسات الشركة المعتمدة."],
  authorities: ["اتخاذ القرارات التشغيلية اليومية ضمن نطاق الوظيفة."],
  qualifications: ["المؤهل العلمي المناسب لطبيعة الوظيفة.", "الخبرة العملية المناسبة لمستوى الوظيفة."],
  skills: ["مهارات التواصل والعمل ضمن فريق.", "القدرة على التخطيط وتنظيم الوقت."]
};

function approvalAuthorityLabel(companyType){
  if(companyType === "مساهمة مدرجة" || companyType === "مساهمة غير مدرجة") return "مجلس الإدارة";
  if(companyType === "ذات مسؤولية محدودة") return "الشركاء";
  return "الإدارة العليا";
}

function autoJobCode(title){
  if(!title) return "JOB-" + Math.floor(Math.random()*900+100);
  const words = title.trim().split(/\s+/).filter(w => !["إدارة","الإدارة","مدير","نائب","رئيس","لـ"].includes(w));
  const initials = (words.slice(0,2).map(w=>w[0]).join("") || title[0]).toUpperCase();
  return `${initials}-${Math.floor(Math.random()*900+100)}`;
}

/* Ready-made starting points by job title. A suggestion only — everything stays editable before approval. */
const JD_TEMPLATES = [
  { re:/مالي|محاسب|خزينة|ميزانية|زكاة|ضريب/, t:{
    purpose:["إدارة الشؤون المالية والمحاسبية للشركة بدقة وشفافية، وضمان سلامة التقارير المالية والتزامها بالأنظمة."],
    tasks:["إعداد الموازنة التقديرية ومتابعة تنفيذها.","إعداد القوائم والتقارير المالية الدورية.","الإشراف على الحسابات والقيود والإقفالات الشهرية والسنوية.","إدارة التدفقات النقدية والسيولة.","متابعة الالتزامات الزكوية والضريبية.","التنسيق مع المراجع الخارجي وتزويده بالمعلومات."],
    authorities:["اعتماد القيود والتسويات ضمن حدود الصلاحيات المعتمدة.","اقتراح السياسات المالية ورفعها للاعتماد."],
    qualifications:["بكالوريوس في المحاسبة أو المالية.","خبرة عملية في المجال المالي مناسبة لمستوى الوظيفة.","يفضّل شهادة مهنية (SOCPA / CPA / CMA)."],
    skills:["التحليل المالي.","إتقان الأنظمة المحاسبية وإكسل.","الدقة والالتزام بالمواعيد.","إعداد التقارير."] } },
  { re:/موارد بشرية|الموارد البشرية|شؤون الموظفين|شئون الموظفين|توظيف/, t:{
    purpose:["إدارة رأس المال البشري للشركة من استقطاب وتطوير وتنظيم علاقات العمل بما يحقق أهدافها ويلتزم بنظام العمل."],
    tasks:["تخطيط الاحتياج الوظيفي والإشراف على الاستقطاب والتعيين.","إعداد وتحديث الهيكل التنظيمي والأوصاف الوظيفية.","إدارة شؤون الموظفين والإجازات والحضور والرواتب بالتنسيق مع المالية.","إدارة تقييم الأداء وخطط التطوير والتدريب.","ضمان الالتزام بنظام العمل ولوائح الشركة.","متابعة العقود والتأمينات والتقارير الدورية."],
    authorities:["اعتماد إجراءات الموارد البشرية ضمن السياسات المعتمدة.","رفع التوصيات بالتعيين والترقية والنقل."],
    qualifications:["بكالوريوس في الموارد البشرية أو الإدارة.","خبرة عملية في الموارد البشرية.","معرفة بنظام العمل السعودي."],
    skills:["التواصل وحل النزاعات.","السرية والنزاهة.","التخطيط والتنظيم.","إتقان أنظمة الموارد البشرية."] } },
  { re:/مشتريات|مشتري|عقود ومشتريات|إمداد|امداد|توريد/, t:{
    purpose:["تأمين احتياجات الشركة من السلع والخدمات بالجودة والتكلفة والوقت المناسبين وفق سياسات الشراء المعتمدة."],
    tasks:["استلام طلبات الشراء ومراجعة مواصفاتها.","طلب عروض الأسعار والمقارنة بينها وإعداد التوصيات.","إعداد أوامر الشراء ومتابعة التوريد والاستلام.","تقييم الموردين والحفاظ على سجل الموردين المعتمدين.","التفاوض على الأسعار والشروط التعاقدية.","التنسيق مع المالية والمخازن في الفواتير والمدفوعات."],
    authorities:["اعتماد أوامر الشراء ضمن سقف الصلاحية المعتمد.","استبعاد مورد مخالف بعد الرجوع للإدارة العليا."],
    qualifications:["بكالوريوس في إدارة الأعمال أو سلاسل الإمداد أو ما يعادلها.","خبرة عملية في المشتريات."],
    skills:["التفاوض.","تحليل العروض.","النزاهة وتجنب تعارض المصالح.","إدارة العلاقة مع الموردين."] } },
  { re:/مبيعات|بيع|تجاري|التجارية|أعمال العملاء|تطوير الأعمال/, t:{
    purpose:["تحقيق أهداف الإيرادات والنمو عبر إدارة المبيعات وبناء علاقات مستدامة مع العملاء."],
    tasks:["وضع خطط وأهداف المبيعات ومتابعة تحقيقها.","إدارة فريق المبيعات وقنوات البيع.","بناء علاقات مع العملاء الحاليين والمحتملين.","إعداد العروض والعقود بالتنسيق مع القانونية والمالية.","تحليل السوق والمنافسين ورفع التقارير الدورية.","متابعة التحصيل بالتنسيق مع المالية."],
    authorities:["منح الخصومات ضمن الحدود المعتمدة.","التفاوض وتوقيع العروض ضمن الصلاحيات."],
    qualifications:["بكالوريوس في إدارة الأعمال أو التسويق أو ما يعادلها.","خبرة عملية في المبيعات."],
    skills:["الإقناع والتفاوض.","التخطيط وتحقيق الأهداف.","العرض والتواصل.","استخدام أنظمة إدارة العملاء."] } },
  { re:/تسويق|علامة تجارية|اتصال مؤسسي|علاقات عامة/, t:{
    purpose:["بناء حضور العلامة التجارية للشركة ودعم أهداف المبيعات والنمو عبر الخطط التسويقية والاتصال المؤسسي."],
    tasks:["إعداد الخطة والموازنة التسويقية السنوية.","إدارة الحملات والمحتوى والقنوات الرقمية.","قياس الأداء التسويقي وتحليل النتائج.","الحفاظ على هوية العلامة وتوحيد الرسائل.","التنسيق مع المبيعات وخدمة العملاء."],
    authorities:["اعتماد المحتوى التسويقي ضمن الموازنة المعتمدة."],
    qualifications:["بكالوريوس في التسويق أو الإعلام أو ما يعادله.","خبرة عملية في التسويق."],
    skills:["الإبداع وصناعة المحتوى.","التحليل الرقمي.","إدارة المشاريع.","التواصل."] } },
  { re:/قانون|شؤون قانونية|شئون قانونية|عقود/, t:{
    purpose:["حماية مصالح الشركة القانونية وضمان التزام أعمالها بالأنظمة واللوائح والعقود."],
    tasks:["مراجعة وصياغة العقود والاتفاقيات.","تقديم الرأي القانوني للإدارات.","متابعة القضايا والمطالبات مع الجهات والمحامين الخارجيين.","متابعة التزام الشركة بالتراخيص والأنظمة.","دعم مجلس الإدارة والجمعيات بالجوانب النظامية."],
    authorities:["إبداء الرأي القانوني الملزم إجرائيًا قبل توقيع العقود الجوهرية."],
    qualifications:["بكالوريوس في القانون أو الشريعة والأنظمة.","خبرة عملية قانونية، ويفضّل رخصة محاماة."],
    skills:["الصياغة القانونية.","التحليل والبحث النظامي.","السرية.","التفاوض."] } },
  { re:/تقنية|معلومات|نظم|تكنولوجيا|IT|برمج|أمن سيبراني|الأمن السيبراني/i, t:{
    purpose:["توفير بنية تقنية آمنة وموثوقة تدعم أعمال الشركة وتحمي معلوماتها."],
    tasks:["إدارة الأنظمة والشبكات والبنية التحتية.","ضمان أمن المعلومات وحماية البيانات والنسخ الاحتياطي.","تقديم الدعم الفني للمستخدمين.","إدارة عقود ومزودي الخدمات التقنية.","تنفيذ مشاريع التحول الرقمي بالتنسيق مع الإدارات.","رفع تقارير الجاهزية والحوادث."],
    authorities:["إدارة صلاحيات الدخول للأنظمة وفق السياسات المعتمدة.","إيقاف الوصول عند الاشتباه بخطر أمني."],
    qualifications:["بكالوريوس في علوم الحاسب أو تقنية المعلومات.","خبرة عملية، ويفضّل شهادات مهنية (ITIL / CISSP)."],
    skills:["الأمن السيبراني.","حل المشكلات.","إدارة المشاريع التقنية.","التوثيق."] } },
  { re:/مراجعة داخلية|تدقيق داخلي|المراجعة الداخلية/, t:{
    purpose:["تقديم تأكيد مستقل وموضوعي لمجلس الإدارة ولجنة المراجعة عن كفاية الرقابة الداخلية والحوكمة وإدارة المخاطر."],
    tasks:["إعداد خطة المراجعة السنوية المبنية على المخاطر.","تنفيذ مهام المراجعة وفحص الضوابط.","رفع التقارير والتوصيات للجنة المراجعة.","متابعة تنفيذ الإجراءات التصحيحية.","التنسيق مع المراجع الخارجي والجهات الرقابية."],
    authorities:["الاطلاع على السجلات والمعلومات اللازمة للمراجعة دون قيود.","الرفع المباشر للجنة المراجعة ومجلس الإدارة."],
    qualifications:["بكالوريوس في المحاسبة أو المراجعة أو ما يعادله.","خبرة في المراجعة، ويفضّل CIA أو CPA."],
    skills:["الاستقلالية والموضوعية.","التحليل والتدقيق.","كتابة التقارير.","معرفة بمعايير المراجعة الداخلية."] } },
  { re:/حوكمة|امتثال|التزام|مطابقة/, t:{
    purpose:["ضمان التزام الشركة بنظام الحوكمة والأنظمة واللوائح، ودعم المجلس واللجان بالمنظومة الحوكمية."],
    tasks:["متابعة تطبيق السياسات والمصفوفات والهيكل المعتمد.","إعداد تقارير الامتثال والفجوات وخطط المعالجة.","دعم أعمال المجلس واللجان وتوثيق القرارات.","رصد التغييرات النظامية وتحديث السياسات.","نشر الوعي بالحوكمة داخل الشركة."],
    authorities:["طلب المعلومات من الإدارات لأغراض الامتثال.","رفع حالات عدم الالتزام للإدارة العليا."],
    qualifications:["بكالوريوس في القانون أو الإدارة أو ما يعادلها.","خبرة في الحوكمة والامتثال، ويفضّل شهادة مهنية."],
    skills:["معرفة بأنظمة الحوكمة.","التحليل.","الصياغة والتوثيق.","التواصل مع المجلس."] } },
  { re:/مخاطر/, t:{
    purpose:["بناء وتشغيل منظومة إدارة المخاطر بما يحمي أهداف الشركة ويدعم قرارات المجلس."],
    tasks:["تحديد المخاطر وتقييمها وتحديث سجل المخاطر.","اقتراح خطط المعالجة ومتابعة تنفيذها.","إعداد تقارير المخاطر الدورية.","نشر ثقافة المخاطر بين الإدارات.","التنسيق مع المراجعة الداخلية والامتثال."],
    authorities:["طلب المعلومات من الإدارات لتقييم المخاطر.","رفع المخاطر الجوهرية للإدارة العليا ومجلس الإدارة."],
    qualifications:["بكالوريوس في الإدارة أو المالية أو ما يعادلها.","خبرة في إدارة المخاطر، ويفضّل شهادة مهنية."],
    skills:["التحليل الكمي والنوعي.","التفكير الاستراتيجي.","إعداد التقارير.","التواصل."] } },
  { re:/جودة|سلامة/, t:{
    purpose:["ضمان جودة العمليات والمنتجات والخدمات وسلامة بيئة العمل وفق المعايير المعتمدة."],
    tasks:["إعداد وتحديث نظام الجودة والإجراءات.","تنفيذ المراجعات الداخلية ومتابعة الملاحظات.","قياس مؤشرات الأداء وتحليل أسباب الانحرافات.","إدارة شكاوى الجودة والإجراءات التصحيحية.","الإشراف على متطلبات السلامة والصحة المهنية."],
    authorities:["إيقاف العملية عند وجود خطر على السلامة أو الجودة."],
    qualifications:["بكالوريوس في الهندسة أو الإدارة أو ما يعادله.","خبرة في الجودة، ويفضّل شهادات (ISO / Six Sigma)."],
    skills:["التفكير التحليلي.","معرفة بالمعايير الدولية.","التدريب والتوعية.","الدقة."] } },
  { re:/تشغيل|عمليات|إنتاج|انتاج|لوجست|مستودع|مخازن/, t:{
    purpose:["إدارة العمليات التشغيلية اليومية بكفاءة وجودة وفي حدود الموازنة والمعايير المعتمدة."],
    tasks:["تخطيط وجدولة العمليات والموارد.","متابعة مؤشرات الأداء التشغيلي ورفع التقارير.","تحسين الإجراءات ورفع الكفاءة وتقليل الهدر.","التنسيق مع المشتريات والمخازن والجودة.","الإشراف على فرق العمل وتنظيم مهامها."],
    authorities:["اتخاذ القرارات التشغيلية اليومية ضمن الصلاحيات."],
    qualifications:["بكالوريوس في الهندسة أو إدارة العمليات أو ما يعادله.","خبرة تشغيلية مناسبة."],
    skills:["التخطيط والتنظيم.","حل المشكلات.","القيادة.","التحليل."] } },
  { re:/مشاريع|مشروع|تطوير/, t:{
    purpose:["تخطيط وتنفيذ المشاريع وفق النطاق والجدول والتكلفة والجودة المعتمدة."],
    tasks:["إعداد خطط المشاريع والجداول والموازنات.","إدارة الفريق والموردين ومتابعة التنفيذ.","إدارة المخاطر والتغييرات في المشروع.","رفع تقارير التقدم لأصحاب المصلحة.","إقفال المشاريع وتوثيق الدروس المستفادة."],
    authorities:["اعتماد التغييرات الصغيرة ضمن حدود المشروع.","رفع طلبات التغيير الجوهرية للجهة المعتمدة."],
    qualifications:["بكالوريوس في الهندسة أو الإدارة أو ما يعادله.","خبرة في إدارة المشاريع، ويفضّل PMP."],
    skills:["إدارة المشاريع.","التواصل مع أصحاب المصلحة.","إدارة الوقت.","حل المشكلات."] } },
  { re:/عملاء|خدمة العملاء|دعم العملاء/, t:{
    purpose:["تقديم تجربة عملاء متميزة والاستجابة لطلباتهم وشكاواهم بسرعة وجودة."],
    tasks:["استقبال طلبات العملاء وشكاواهم ومتابعتها حتى الإغلاق.","قياس رضا العملاء ورفع التقارير.","التنسيق مع الإدارات لمعالجة الطلبات.","تحديث قاعدة المعرفة وإجابات الأسئلة الشائعة."],
    authorities:["معالجة الحالات ضمن حدود الصلاحية المعتمدة."],
    qualifications:["دبلوم أو بكالوريوس مناسب.","خبرة في خدمة العملاء."],
    skills:["التواصل.","الصبر وحل المشكلات.","سرعة الاستجابة.","استخدام أنظمة الدعم."] } },
  { re:/رئيس تنفيذي|المدير العام|مدير عام|الرئيس التنفيذي|المدير التنفيذي/, t:{
    purpose:["قيادة الشركة وتنفيذ استراتيجيتها وقرارات مجلس الإدارة (أو المالك) وتحقيق نتائج الأداء المستهدفة."],
    tasks:["تنفيذ الاستراتيجية والخطة السنوية والموازنة.","الإشراف على الإدارات ومتابعة أدائها.","رفع التقارير الدورية لمجلس الإدارة أو المالك.","تمثيل الشركة أمام الجهات الخارجية ضمن الصلاحيات.","ضمان الالتزام بالحوكمة والأنظمة.","إدارة المخاطر الرئيسية ورفع المستجدات الجوهرية."],
    authorities:["الصلاحيات الممنوحة بقرار مجلس الإدارة أو المالك ومصفوفة الصلاحيات."],
    qualifications:["بكالوريوس على الأقل، ويفضّل ماجستير في الإدارة.","خبرة قيادية طويلة في القطاع."],
    skills:["القيادة والتفكير الاستراتيجي.","اتخاذ القرار.","التواصل والتفاوض.","الإدارة المالية."] } },
  { re:/سكرتير|أمين سر|امين سر/, t:{
    purpose:["تنظيم أعمال مجلس الإدارة واجتماعاته وتوثيق قراراته ومتابعة تنفيذها."],
    tasks:["إعداد جدول الأعمال ودعوات الاجتماعات.","تدوين المحاضر وصياغتها واعتمادها.","متابعة تنفيذ القرارات.","حفظ وثائق المجلس وسجلاته.","التنسيق بين المجلس والإدارة التنفيذية."],
    authorities:["الاطلاع على وثائق المجلس وتوثيقها وفق السياسات."],
    qualifications:["بكالوريوس في الإدارة أو القانون أو ما يعادله.","خبرة في أعمال المجالس والحوكمة."],
    skills:["الصياغة والتوثيق.","السرية.","التنظيم.","التواصل."] } }
];
function jdTemplateFor(title){
  const t = String(title || "");
  const hit = JD_TEMPLATES.find(x => x.re.test(t));
  return hit ? hit.t : null;
}
function jdFillFields(c){
  const bullets = a => (a || []).map(x => "• " + x).join("\n");
  document.getElementById("jd-purpose").value = bullets(c.purpose);
  document.getElementById("jd-tasks").value = bullets(c.tasks);
  document.getElementById("jd-authorities").value = bullets(c.authorities);
  document.getElementById("jd-qualifications").value = bullets(c.qualifications);
  document.getElementById("jd-skills").value = bullets(c.skills);
}
function jdSetNote(kind){
  const el = document.getElementById("jd-source-note");
  if(!el) return;
  el.textContent = kind === "template" ? "تم تجهيز البنود من قالب جاهز يناسب مسمى الوظيفة. راجعها وعدّلها قبل الاعتماد."
    : kind === "ai" ? "⚠️ البنود مقترحة آليًا بالذكاء الاصطناعي ولم تُراجَع بعد. راجعها وعدّلها قبل الحفظ والاعتماد."
    : kind === "saved" ? "بنود محفوظة سابقًا لهذه الوظيفة. يمكنك طلب اقتراح جديد بالذكاء الاصطناعي."
    : "بنود عامة لأن لا يوجد قالب جاهز لهذا المسمى. يمكنك طلب اقتراح بالذكاء الاصطناعي.";
}
async function suggestJobDescriptionAI(){
  const title = document.getElementById("jd-department").value.trim() || document.getElementById("jd-position-title").textContent.trim();
  if(!title){ alert("اكتب المسمى الوظيفي أولًا."); return; }
  if(!await uiConfirm('سيُرسل المسمى الوظيفي "' + title + '" وقطاع الشركة فقط (دون أي أسماء أو بيانات أشخاص) إلى خدمة ذكاء اصطناعي لاقتراح الوصف، وسيستبدل الاقتراح البنود الحالية في الشاشة. متابعة؟')) return;
  const btn = document.getElementById("jd-ai-btn");
  const old = btn.textContent; btn.disabled = true; btn.textContent = "جارٍ الاقتراح…";
  try{
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخولك من جديد."); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-job-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ company_id: currentCompanyId, title, sector: document.getElementById("jd-sector").value.trim(), entity_type: currentCompanyType || "" })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ alert(data.error || "تعذّر الاقتراح الآن. استخدم القالب الجاهز أو اكتب البنود يدويًا."); return; }
    jdFillFields(data.content);
    jdSetNote("ai");
  }catch(e){
    alert("تعذّر الاتصال بالخدمة: " + e.message);
  }finally{
    btn.disabled = false; btn.textContent = old;
  }
}

async function openJobDescriptionModal(positionId){
  const pos = structureCache.find(s => s.id === positionId);
  if(!pos) return;
  document.getElementById("jd-position-id").value = positionId;
  document.getElementById("jd-position-title").textContent = pos.position_title || "";

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const { data: existing } = await sb.from("job_descriptions").select("*").eq("position_id", positionId).order("id",{ascending:false}).limit(1).maybeSingle();
  currentJobDescription = existing || null;
  document.getElementById("jd-id").value = existing ? existing.id : "";

  let content = {};
  try{ content = existing && existing.draft_content ? JSON.parse(existing.draft_content) : {}; }catch(e){ content = {}; }

  const jdTpl = jdTemplateFor(pos.position_title);
  jdSetNote(content.tasks ? "saved" : (jdTpl ? "template" : "generic"));
  document.getElementById("jd-department").value = content.department || pos.position_title || "";
  document.getElementById("jd-sector").value = content.sector || company?.business_activity || "";
  document.getElementById("jd-code").value = content.code || autoJobCode(pos.position_title);
  document.getElementById("jd-manager").value = content.manager || pos.parent_position || "—";
  document.getElementById("jd-purpose").value = content.purpose || (jdTpl ? jdTpl.purpose : GENERIC_JD_SEEDS.purpose).map(t=>"• "+t).join("\n");
  document.getElementById("jd-tasks").value = content.tasks || (jdTpl ? jdTpl.tasks : GENERIC_JD_SEEDS.tasks).map(t=>"• "+t).join("\n");
  document.getElementById("jd-authorities").value = content.authorities || (jdTpl ? jdTpl.authorities : GENERIC_JD_SEEDS.authorities).map(t=>"• "+t).join("\n");
  document.getElementById("jd-qualifications").value = content.qualifications || (jdTpl ? jdTpl.qualifications : GENERIC_JD_SEEDS.qualifications).map(t=>"• "+t).join("\n");
  document.getElementById("jd-skills").value = content.skills || (jdTpl ? jdTpl.skills : GENERIC_JD_SEEDS.skills).map(t=>"• "+t).join("\n");

  const status = existing?.status || "مسودة";
  document.getElementById("jd-status-badge").innerHTML =
    `<span class="badge ${status==='موقّعة نهائية'?'done':(status==='قيد التوقيع'?'pending':'info')}" style="flex-shrink:0">${status}</span>`;

  renderJobDescriptionFinalSection(existing);
  openM("m-job-desc");
}

function collectJobDescriptionContent(){
  return {
    department: document.getElementById("jd-department").value.trim(),
    sector: document.getElementById("jd-sector").value.trim(),
    code: document.getElementById("jd-code").value.trim(),
    manager: document.getElementById("jd-manager").value.trim(),
    purpose: document.getElementById("jd-purpose").value,
    tasks: document.getElementById("jd-tasks").value,
    authorities: document.getElementById("jd-authorities").value,
    qualifications: document.getElementById("jd-qualifications").value,
    skills: document.getElementById("jd-skills").value
  };
}

async function saveJobDescriptionDraft(){
  const positionId = Number(document.getElementById("jd-position-id").value);
  const id = document.getElementById("jd-id").value;
  const draft_content = JSON.stringify(collectJobDescriptionContent());
  if(id){
    const { error } = await sb.from("job_descriptions").update({ draft_content }).eq("id", id);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("job_descriptions")
      .insert([{ position_id: positionId, company_id: currentCompanyId, draft_content, status:"مسودة" }]).select().single();
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    document.getElementById("jd-id").value = data.id;
    currentJobDescription = data;
  }
  alert("تم حفظ المسودة ✅");
}

function bulletLines(text){
  return (text||"").split("\n").map(l=>l.trim()).filter(Boolean).map(l=>l.replace(/^•\s*/,""));
}

async function generateJobDescriptionDoc(){
  await saveJobDescriptionDraft();
  const positionId = Number(document.getElementById("jd-position-id").value);
  const pos = structureCache.find(s => s.id === positionId);
  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const c = collectJobDescriptionContent();
  const approverLabel = approvalAuthorityLabel(company?.company_type);

  const html = `<html><head><meta charset="UTF-8"><title>بطاقة توصيف وظيفي</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:30px;color:#0D2447}
      h1{text-align:center;color:#1A3A6B;border-bottom:2px solid #D4AF37;padding-bottom:10px}
      table.meta{width:100%;border-collapse:collapse;margin:16px 0}
      table.meta td{border:1px solid #999;padding:8px 10px;font-size:12.5px}
      table.meta td.label{background:#EAF0F8;font-weight:bold;width:180px}
      h2{color:#1A3A6B;font-size:14px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:4px}
      ul{padding-right:20px;font-size:12.5px;line-height:1.9}
      .sig{margin-top:50px;display:flex;justify-content:space-between;font-size:12px}
      .sig div{width:30%;text-align:center;border-top:1px solid #333;padding-top:6px}
    </style></head><body>
      <h1>بطاقة توصيف وظيفي</h1>
      <table class="meta">
        <tr><td class="label">المسمى الوظيفي</td><td>${orgEsc(pos?.position_title||"")}</td><td class="label">كود الوظيفة</td><td>${c.code}</td></tr>
        <tr><td class="label">الإدارة</td><td>${orgEsc(c.department)}</td><td class="label">القطاع</td><td>${c.sector}</td></tr>
        <tr><td class="label">الشركة</td><td>${orgEsc(company?.name||"")}</td><td class="label">المسمى الوظيفي للمدير المباشر</td><td>${c.manager}</td></tr>
      </table>
      <h2>الهدف من الوظيفة</h2><ul>${bulletLines(c.purpose).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المهام والمسؤوليات الوظيفية</h2><ul>${bulletLines(c.tasks).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>الصلاحيات</h2><ul>${bulletLines(c.authorities).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المؤهلات والخبرات</h2><ul>${bulletLines(c.qualifications).map(t=>`<li>${t}</li>`).join("")}</ul>
      <h2>المهارات والقدرات</h2><ul>${bulletLines(c.skills).map(t=>`<li>${t}</li>`).join("")}</ul>
      <div class="sig"><div>إعداد</div><div>مراجعة</div><div>اعتمدت بواسطة (${approverLabel})</div></div>
      <div class="sig" style="margin-top:40px"><div>اسم شاغل الوظيفة</div><div>توقيع شاغل الوظيفة</div><div>التاريخ</div></div>
    </body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const positionSafe = (pos?.position_title||"وظيفة").replace(/[\/\\]/g,"-");
  const file_url = await uploadBlobToStorage(blob, "job-descriptions", `توصيف-${positionSafe}-${Date.now()}.doc`);
  if(!file_url){ alert("تعذّر رفع المستند"); return; }

  const id = document.getElementById("jd-id").value;
  await sb.from("job_descriptions").update({ final_file_url: file_url }).eq("id", id);
  const { data: refreshed } = await sb.from("job_descriptions").select("*").eq("id", id).single();
  currentJobDescription = refreshed;
  renderJobDescriptionFinalSection(refreshed);
  alert("تم توليد المستند النهائي ✅ راجعه ثم أرسله للتوقيع.");
}

function renderJobDescriptionFinalSection(jd){
  const box = document.getElementById("jd-finalBody");
  if(!box) return;
  if(!jd || !jd.final_file_url){
    box.innerHTML = '<p class="modal-section-hint">ولّد المستند النهائي أولًا (زر "📄 توليد المستند النهائي") قبل إرساله للتوقيع.</p>';
    return;
  }
  if(jd.signing_doc_id){
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <a class="btn btn-outline" style="font-size:11px;padding:8px 16px" href="${jd.final_file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض المستند</a>
      <span style="font-size:11.5px;color:var(--gray3)">حالة التوقيع: ${jd.status}</span>
    </div>`;
  } else {
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-outline" style="font-size:11px;padding:8px 16px" href="${jd.final_file_url}" target="_blank" rel="noopener"><span class="ico-i ico-eye"></span>عرض المستند</a>
      <button class="btn btn-gold" style="font-size:11px;padding:8px 16px" onclick="sendJobDescriptionForSigning()">🔏 إرسال للتوقيع</button>
    </div>`;
  }
}

async function sendJobDescriptionForSigning(){
  const id = document.getElementById("jd-id").value;
  const jd = currentJobDescription;
  if(!jd || !jd.final_file_url){ alert("ولّد المستند النهائي أولًا"); return; }
  const pos = structureCache.find(s => s.id === Number(document.getElementById("jd-position-id").value));

  const signersInput = await uiPrompt("كم عدد الموقّعين المطلوبين (مثال: إعداد + مراجعة + اعتماد + الموظف)؟", "4");
  const signers_total = Number(signersInput) || 4;

  const { data: doc, error } = await sb.from("signing_documents").insert([{
    document_name: `بطاقة توصيف وظيفي — ${pos?.position_title||""}`, doc_type: "بطاقة توصيف وظيفي",
    signers_total, signers_done: 0, status:"قيد التوقيع", file_url: jd.final_file_url, company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر الإرسال للتوقيع: " + error.message); return; }

  await sb.from("job_descriptions").update({ signing_doc_id: doc.id, status:"قيد التوقيع" }).eq("id", id);
  const { data: refreshed } = await sb.from("job_descriptions").select("*").eq("id", id).single();
  currentJobDescription = refreshed;
  renderJobDescriptionFinalSection(refreshed);
  alert("تم إرسال المستند للتوقيع ✅ — تابع حالته من صفحة «التوقيع الإلكتروني».");
}

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
/* ══════════ FINANCIAL & OPERATIONAL INDICATORS (Excel round-trip) ══════════ */
/* ══════════ CEO MONTHLY REPORT — full replacement of the old financial indicators system ══════════ */

/* ══════════ FINANCIAL & OPERATIONAL REPORT v2 — trimmed to 15 sections per feedback ══════════ */

function downloadIndicatorsTemplate(){
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, colW) => {
    if(name.length > 31){ console.error("Sheet name exceeds 31 chars:", name); alert("خطأ داخلي: اسم ورقة طويل جدًا (\""+name+"\") — تواصل مع الدعم الفني."); throw new Error("sheet name too long"); }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = (colW||[55,30]).map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  try{

  addSheet("١-لوحة المؤشرات", [
    ["الفترة (مثال: يونيو 2026)", "", "", "", ""],
    ["المؤشر", "المستهدف", "الفعلي", "الشهر السابق", "نفس الشهر بالعام السابق"],
    ["الإيرادات", "", "", "", ""],
    ["المبيعات", "", "", "", ""],
    ["إجمالي الربح", "", "", "", ""],
    ["هامش الربح", "", "", "", ""],
    ["صافي الربح", "", "", "", ""],
    ["التدفق النقدي", "", "", "", ""],
    ["النقد المتوفر", "", "", "", ""],
    ["الذمم المدينة", "", "", "", ""],
    ["الذمم الدائنة", "", "", "", ""],
    ["حجم المبيعات المستهدف", "", "", "", ""],
    ["نسبة تحقيق الموازنة", "", "", "", ""],
    ["عدد العملاء", "", "", "", ""],
    ["العملاء الجدد", "", "", "", ""],
    ["نسبة الاحتفاظ بالعملاء", "", "", "", ""],
    ["عدد الموظفين", "", "", "", ""],
    ["معدل دوران الموظفين", "", "", "", ""],
    ["المشاريع الجارية", "", "", "", ""],
    ["نسبة إنجاز المشاريع", "", "", "", ""]
  ], [30,16,16,18,22]);

  addSheet("٢-الأداء المالي", [
    ["الإيرادات (ريال)", ""],
    ["إجمالي الربح (ريال)", ""],
    ["إجمالي المصروفات (ريال)", ""],
    ["المصروفات الإدارية (ريال)", ""],
    ["مصروفات المبيعات والتسويق (ريال)", ""],
    ["الرواتب (ريال)", ""]
  ]);

  addSheet("٣-المبيعات", [
    ["المبيعات الشهرية (ريال)", ""],
    ["المستهدف الشهري (ريال)", ""],
    ["المبيعات منذ بداية السنة (ريال)", ""],
    ["عدد العملاء الجدد", ""],
    ["عدد العملاء المتوقفين عن التعامل", ""],
    ["عدد العقود التي تم تقديمها", ""]
  ]);

  addSheet("٤-التشغيل", [
    ["حجم الأعمال المنفذة", ""],
    ["الأعطال والتوقفات", ""],
    ["الإجراءات التصحيحية", ""],
    ["أهم المشكلات التشغيلية", ""]
  ]);

  addSheet("٥-المشاريع", [
    ["اسم المشروع", "القيمة (ريال)", "العميل", "نسبة الإنجاز (%)", "الحالة (🟢 حسب الخطة / 🟡 تحتاج متابعة / 🔴 تحتاج تدخلًا)", "ملاحظات"],
    ["مشروع 1", "", "", "", "", ""],
    ["مشروع 2", "", "", "", "", ""],
    ["مشروع 3", "", "", "", "", ""],
    ["مشروع 4", "", "", "", "", ""],
    ["مشروع 5", "", "", "", "", ""]
  ], [22,16,20,14,38,30]);

  addSheet("٦-الموارد البشرية", [
    ["إجمالي عدد الموظفين", ""],
    ["عدد الموظفين الجدد", ""],
    ["الاستقالات وحالات إنهاء الخدمة", ""],
    ["معدل دوران الموظفين (%)", ""],
    ["الوظائف الشاغرة والحرجة", ""],
    ["الوظائف المطلوب توظيفها", ""],
    ["التدريب وبرامج تطوير الموظفين", ""],
    ["المشاكل العمالية", ""],
    ["احتياجات الشركة المستقبلية من الموظفين", ""]
  ]);

  addSheet("٧-المشتريات", [
    ["إجمالي المشتريات (ريال)", ""],
    ["المشتريات مقارنة بالموازنة", ""],
    ["الموردون الجدد", ""]
  ]);

  addSheet("٨-العملاء وخدمة العملاء", [
    ["عدد العملاء", ""],
    ["العملاء الجدد والمفقودون", ""],
    ["معدل الاحتفاظ بالعملاء (%)", ""],
    ["مستوى رضا العملاء", ""],
    ["عدد الشكاوى وطبيعتها", ""],
    ["زمن معالجة الشكاوى والشكاوى التي لم تُغلق", ""],
    ["أهم العملاء", ""],
    ["العملاء المعرضون لخطر فقدانهم", ""],
    ["الإجراءات المتخذة لتحسين رضا العملاء", ""]
  ]);

  addSheet("٩-التسويق", [
    ["الحملات التسويقية المنفذة وتكلفتها ونتائجها", ""],
    ["العملاء الناتجون عن الحملات", ""],
    ["أداء الموقع الإلكتروني ووسائل التواصل الاجتماعي", ""],
    ["تقييم أداء الشركة مقارنة بالمنافسين", ""],
    ["الفرص التسويقية الجديدة", ""]
  ]);

  addSheet("١٠-الشؤون القانونية والعقود", [
    ["القضايا القائمة والجديدة والتي أُغلقت", ""],
    ["قيمة المطالبات", ""],
    ["العقود الجديدة والتي تحتاج مراجعة والتي انتهت أو ستنتهي", ""],
    ["النزاعات مع العملاء والموردين", ""],
    ["المخاطر القانونية والالتزامات المحتملة", ""]
  ]);

  addSheet("١١-الشركات التابعة والفروع", [
    ["اسم الشركة/الفرع", "هل التشغيل يسير بشكل سليم؟", "المشاكل إن وجدت"],
    ["شركة/فرع 1", "", ""],
    ["شركة/فرع 2", "", ""],
    ["شركة/فرع 3", "", ""],
    ["شركة/فرع 4", "", ""],
    ["شركة/فرع 5", "", ""]
  ], [30,28,45]);

  addSheet("١٢-الأداء مقابل الموازنة", [
    ["الإيرادات: المخطط مقابل الفعلي", ""],
    ["الأرباح: المخطط مقابل الفعلي", ""],
    ["المصروفات: المخطط مقابل الفعلي", ""],
    ["التدفقات النقدية: المخطط مقابل الفعلي", ""],
    ["المبيعات: المخطط مقابل الفعلي", ""],
    ["عدد العملاء: المخطط مقابل الفعلي", ""],
    ["المشاريع: المخطط مقابل الفعلي", ""],
    ["الاستثمارات: المخطط مقابل الفعلي", ""],
    ["الموارد البشرية: المخطط مقابل الفعلي", ""],
    ["أسباب الانحرافات والإجراءات التصحيحية", ""]
  ]);

  addSheet("١٣-التوقعات حتى نهاية السنة", [
    ["الإيرادات المتوقعة حتى نهاية السنة (ريال)", ""],
    ["الأرباح المتوقعة (ريال)", ""],
    ["التدفقات النقدية المتوقعة (ريال)", ""],
    ["المبيعات المتوقعة (ريال)", ""],
    ["العقود المتوقع توقيعها", ""],
    ["المشاريع المتوقع إنجازها", ""],
    ["المخاطر التي قد تؤثر على النتائج", ""],
    ["هل ستتحقق الموازنة السنوية؟", ""],
    ["هل هناك حاجة لتعديل التوقعات؟", ""]
  ]);

  addSheet("١٤-أهم التحديات", [
    ["التحدي — المشكلة", "الأثر — ما قامت به الإدارة — النتيجة — ما تحتاجه الإدارة"],
    ["تحدٍ 1", ""], ["تحدٍ 2", ""], ["تحدٍ 3", ""], ["تحدٍ 4", ""], ["تحدٍ 5", ""],
    ["تحدٍ 6", ""], ["تحدٍ 7", ""], ["تحدٍ 8", ""]
  ], [35,60]);

  addSheet("١٥-أولويات الشهر القادم", [
    ["الأولوية 1", ""], ["الأولوية 2", ""], ["الأولوية 3", ""], ["الأولوية 4", ""],
    ["الأولوية 5", ""], ["الأولوية 6", ""], ["الأولوية 7", ""], ["الأولوية 8", ""]
  ]);

  XLSX.writeFile(wb, "التقرير-المالي-والتشغيلي.xlsx");
  }catch(e){
    if(e.message !== "sheet name too long"){ alert("تعذّر توليد النموذج: " + e.message); }
  }
}

function numOrNull(v){
  if(v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function textOr(v){ return (v===undefined||v===null) ? "" : String(v).trim(); }

const SEC_KEY_MAPS = {
  financial: ["revenue","gross_profit","total_expenses","admin_expenses","sales_marketing_expenses","salaries"],
  sales: ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"],
  operations: ["work_volume","breakdowns_downtime","corrective_actions","operational_issues"],
  hr: ["total_employees","new_employees","resignations","turnover_rate","vacant_critical_roles","roles_to_hire","training","labor_issues","future_needs"],
  procurement: ["total_purchases","purchases_vs_budget","new_suppliers"],
  customers: ["customer_count","new_lost_customers","retention_rate","satisfaction_level","complaints_count","complaints_resolution","top_customers","at_risk_customers","improvement_actions"],
  marketing: ["campaigns","campaign_customers","digital_performance","vs_competitors","new_opportunities"],
  legal: ["legal_cases","claims_value","contracts_status","disputes","legal_risks"],
  budget: ["revenue_vs_plan","profit_vs_plan","expenses_vs_plan","cashflow_vs_plan","sales_vs_plan","customers_vs_plan","projects_vs_plan","investments_vs_plan","hr_vs_plan","variance_reasons"],
  forecast: ["expected_revenue","expected_profit","expected_cashflow","expected_sales","expected_contracts","expected_projects","risks_affecting_results","budget_achievable","forecast_adjustment_needed"]
};

// Score decays smoothly the later the report lands in the month — used as one input into the
// CEO's performance evaluation (a late/consistently-late report is treated as a governance
// signal, not just an admin nuisance): on time (day ≤5) = 100%, days 6-7 = 85%, then a gradual
// 5-point drop per additional day, floored at 15% so the score never fully bottoms out to zero.
function computeTimelinessScore(dayOfMonth){
  if(dayOfMonth <= 5) return 100;
  if(dayOfMonth <= 7) return 85;
  return Math.max(15, 85 - (dayOfMonth - 7) * 5);
}

async function handleIndicatorsUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = (name) => {
      const ws = wb.Sheets[name];
      return ws ? XLSX.utils.sheet_to_json(ws, { header: 1 }) : null;
    };

    const rows = {
      kpi: sheet("١-لوحة المؤشرات"),
      financial: sheet("٢-الأداء المالي"),
      sales: sheet("٣-المبيعات"),
      operations: sheet("٤-التشغيل"),
      projects: sheet("٥-المشاريع"),
      hr: sheet("٦-الموارد البشرية"),
      procurement: sheet("٧-المشتريات"),
      customers: sheet("٨-العملاء وخدمة العملاء"),
      marketing: sheet("٩-التسويق"),
      legal: sheet("١٠-الشؤون القانونية والعقود"),
      subsidiaries: sheet("١١-الشركات التابعة والفروع"),
      budget: sheet("١٢-الأداء مقابل الموازنة"),
      forecast: sheet("١٣-التوقعات حتى نهاية السنة"),
      challenges: sheet("١٤-أهم التحديات"),
      priorities: sheet("١٥-أولويات الشهر القادم")
    };
    for(const k in rows){ if(!rows[k]){ alert(`الملف لا يطابق شكل القالب المتوقع (ورقة "${k}" غير موجودة) — الرجاء استخدام القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.`); return; } }

    function buildSimple(sheetRows, keyMap, numericKeys){
      const obj = {};
      keyMap.forEach((key, i) => {
        const raw = sheetRows[i] ? sheetRows[i][1] : undefined;
        obj[key] = (numericKeys && numericKeys.includes(key)) ? numOrNull(raw) : textOr(raw);
      });
      return obj;
    }

    const period_label = textOr(rows.kpi[0] ? rows.kpi[0][1] : "");
    const kpiNames = ["revenue","sales","gross_profit","profit_margin","net_profit","cash_flow","available_cash",
      "receivables","payables","sales_target","budget_achievement_pct","customer_count","new_customers",
      "retention_rate","employee_count","turnover_rate","active_projects","project_completion_pct"];
    const kpiDashboard = kpiNames.map((key, i) => {
      const r = rows.kpi[i+2] || []; // row 0 = period, row 1 = header, data starts row 2
      return { key, name: r[0]||"", target: numOrNull(r[1]), actual: numOrNull(r[2]), prev_month: numOrNull(r[3]), prev_year: numOrNull(r[4]) };
    });

    const financialObj = buildSimple(rows.financial, SEC_KEY_MAPS.financial, SEC_KEY_MAPS.financial);
    const salesObj = buildSimple(rows.sales, SEC_KEY_MAPS.sales, ["monthly_sales","monthly_target","ytd_sales","new_customers","lost_customers","submitted_contracts_count"]);
    const operationsObj = buildSimple(rows.operations, SEC_KEY_MAPS.operations, []);
    const projectRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.projects[i]?.[0]), value: numOrNull(rows.projects[i]?.[1]), client: textOr(rows.projects[i]?.[2]),
      completion_pct: numOrNull(rows.projects[i]?.[3]), status: textOr(rows.projects[i]?.[4]), notes: textOr(rows.projects[i]?.[5])
    })).filter(p=>p.name);
    const hrObj = buildSimple(rows.hr, SEC_KEY_MAPS.hr, ["total_employees","new_employees","turnover_rate"]);
    const procurementObj = buildSimple(rows.procurement, SEC_KEY_MAPS.procurement, ["total_purchases"]);
    const customersObj = buildSimple(rows.customers, SEC_KEY_MAPS.customers, ["customer_count","complaints_count"]);
    const marketingObj = buildSimple(rows.marketing, SEC_KEY_MAPS.marketing, []);
    const legalObj = buildSimple(rows.legal, SEC_KEY_MAPS.legal, []);
    const subsidiaryRows = [1,2,3,4,5].map(i => ({
      name: textOr(rows.subsidiaries[i]?.[0]), ops_ok: textOr(rows.subsidiaries[i]?.[1]), problems: textOr(rows.subsidiaries[i]?.[2])
    })).filter(s=>s.name);
    const budgetObj = buildSimple(rows.budget, SEC_KEY_MAPS.budget, []);
    const forecastObj = buildSimple(rows.forecast, SEC_KEY_MAPS.forecast, ["expected_revenue","expected_profit","expected_cashflow","expected_sales"]);
    const challengeRows = [1,2,3,4,5,6,7,8].map(i => ({ challenge: textOr(rows.challenges[i]?.[0]), details: textOr(rows.challenges[i]?.[1]) })).filter(c=>c.challenge);
    const priorityRows = rows.priorities.map(r => textOr(r[1])).filter(Boolean);

    const fileUrl = await uploadBlobToStorage(file, "ceo-reports", file.name);

    const payload = {
      company_id: currentCompanyId, period_label,
      uploaded_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", source_file_url: fileUrl,
      submitted_day_of_month: new Date().getDate(), timeliness_score: computeTimelinessScore(new Date().getDate()),
      sec_kpi_dashboard: kpiDashboard,
      sec_financial: financialObj,
      sec_sales: salesObj,
      sec_operations: operationsObj,
      sec_projects: projectRows,
      sec_hr: hrObj,
      sec_procurement: procurementObj,
      sec_customers: customersObj,
      sec_marketing: marketingObj,
      sec_legal: legalObj,
      sec_subsidiaries: subsidiaryRows,
      sec_budget: budgetObj,
      sec_forecast: forecastObj,
      sec_challenges: challengeRows,
      sec_priorities: priorityRows
    };

    let error;
    if(period_label){
      const { data: existing } = await sb.from("ceo_monthly_reports").select("id").eq("company_id", currentCompanyId).eq("period_label", period_label).limit(1);
      if(existing && existing.length){
        if(!await uiConfirm(`يوجد تقرير محفوظ مسبقًا لنفس الفترة "${period_label}" — هل تريد استبداله؟`)){ return; }
        ({ error } = await sb.from("ceo_monthly_reports").update(payload).eq("id", existing[0].id));
      } else {
        ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
      }
    } else {
      ({ error } = await sb.from("ceo_monthly_reports").insert([payload]));
    }
    if(error){ alert("تعذّر حفظ البيانات: " + error.message); return; }
    logActivity("إنشاء", "تقرير مالي وتشغيلي", period_label || "فترة جديدة", "استيراد من Excel");
    alert("تم رفع التقرير وحفظه بنجاح ✅");
    input.value = "";
    loadIndicatorsReport();
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه نفس القالب المُحمَّل من المنصة بدون تعديل بأسماء الأوراق.");
  }
}

function fmtNum(n){ return n==null ? "—" : Number(n).toLocaleString("ar-SA-u-ca-gregory"); }
function fieldRow(label, val, isCurrency){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val)+" ريال" : val;
  return `<div style="padding:6px 0;border-bottom:1px solid var(--gray1);font-size:12px"><b style="color:var(--gray3)">${label}:</b> <span style="color:var(--dark)">${display}</span></div>`;
}
function sectionCard(title, innerHtml){
  if(!innerHtml || !innerHtml.trim()) return "";
  return `<div class="card" style="margin-bottom:16px"><div class="card-head"><span class="card-title">${title}</span></div><div class="card-body">${innerHtml}</div></div>`;
}
function tableFromRows(rows, cols){
  if(!rows || rows.length===0) return "";
  const head = cols.map(c=>`<th>${c}</th>`).join("");
  const body = rows.map(r => `<tr>${Object.values(r).map(v=>`<td>${(v!=null&&v!=="")?v:"—"}</td>`).join("")}</tr>`).join("");
  return `<table class="tbl" style="margin-top:6px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
// A small colored "KPI-style" tile — reuses the exact card language already used on the
// dashboard (colored stripe, big bold figure, faint icon watermark) so numeric report fields
// read as a proper statistic instead of a plain text line like "إجمالي الربح: 10000000 ريال".
function statCard(icon, label, val, isCurrency, color){
  if(val===undefined || val===null || val==="") return "";
  const display = (isCurrency && !isNaN(Number(val))) ? fmtNum(val) : val;
  return `<div class="kpi ${color||'blue'}" style="padding:14px 16px;min-width:0">
    <div class="kpi-stripe"></div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-val" style="font-size:21px;word-break:break-word">${display}${isCurrency?'<span style="font-size:12px;font-weight:700;color:var(--gray3)"> ريال</span>':''}</div>
    <div class="kpi-icon">${icon}</div>
  </div>`;
}
function statGrid(cards){
  const filled = cards.filter(Boolean);
  if(!filled.length) return "";
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${filled.join("")}</div>`;
}
// For narrative/free-text fields — a labeled callout block instead of a bare "label: value" line.
function textBlock(icon, label, text){
  if(!text) return "";
  return `<div style="background:var(--offwhite);border-radius:10px;padding:10px 14px;margin-top:10px">
    <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:4px">${icon} ${label}</div>
    <div style="font-size:12.5px;color:var(--dark);line-height:1.7">${text}</div>
  </div>`;
}
function textBlocks(items){ return items.filter(Boolean).join(""); }

async function loadIndicatorsReport(){
  const box = document.getElementById("indicatorsReport");
  if(!box) return;
  const pdfBtn = document.getElementById("indicatorsPdfBtn");
  if(pdfBtn) pdfBtn.style.display = isFullAccessRole(getCurrentRole()) ? "inline-block" : "none";
  const { data, error } = await sb.from("ceo_monthly_reports").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1);
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا توجد بيانات مستوردة بعد. نزّل النموذج وابدأ.</div>';
    return;
  }
  const r = data[0];
  const F = r.sec_financial||{}, SA = r.sec_sales||{}, OP = r.sec_operations||{},
        HR = r.sec_hr||{}, PR = r.sec_procurement||{}, CU = r.sec_customers||{},
        MK = r.sec_marketing||{}, LG = r.sec_legal||{},
        BU = r.sec_budget||{}, FC = r.sec_forecast||{};
  const kpis = r.sec_kpi_dashboard||[];
  const projects = r.sec_projects||[];
  const subsidiaries = r.sec_subsidiaries||[];
  const challenges = r.sec_challenges||[];
  const priorities = r.sec_priorities||[];

  const netProfit = (F.revenue!=null && F.total_expenses!=null) ? F.revenue - F.total_expenses : null;

  const kpiRows = kpis.filter(k=>k.name).map(k => {
    const variance = (k.target!=null && k.actual!=null && k.target!==0) ? (((k.actual-k.target)/Math.abs(k.target))*100).toFixed(1)+"%" : "—";
    const varColor = (k.target!=null && k.actual!=null) ? (k.actual>=k.target ? "var(--green)" : "var(--red)") : "var(--gray3)";
    return `<tr><td>${orgEsc(k.name)}</td><td>${fmtNum(k.target)}</td><td>${fmtNum(k.actual)}</td><td>${fmtNum(k.prev_month)}</td><td>${fmtNum(k.prev_year)}</td><td style="color:${varColor};font-weight:700">${variance}</td></tr>`;
  }).join("");

  box.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--primary),var(--primary2));border-radius:12px;padding:14px 18px;margin-bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b>التقرير المالي والتشغيلي — ${r.period_label||"—"}</b>${r.submitted_day_of_month ? `<div style="font-size:11px;opacity:0.85;margin-top:2px">رُفع في اليوم ${r.submitted_day_of_month} من الشهر — درجة الانضباط: ${r.timeliness_score}%</div>` : ""}</div>
      ${r.source_file_url ? `<a href="${r.source_file_url}" target="_blank" style="color:#fff;font-size:11px;text-decoration:underline"><span class="ico-i ico-document"></span>الملف الأصلي</a>` : ""}
    </div>

    ${sectionCard("١) لوحة مؤشرات الأداء الرئيسية — المستهدف مقابل الفعلي والانحراف", kpiRows ? `<table class="tbl"><thead><tr><th>المؤشر</th><th>المستهدف</th><th>الفعلي</th><th>الشهر السابق</th><th>نفس الشهر بالعام السابق</th><th>الانحراف</th></tr></thead><tbody>${kpiRows}</tbody></table>` : "")}

    ${sectionCard("٢) الأداء المالي", statGrid([
      statCard("💰","الإيرادات", F.revenue, true, "blue"),
      statCard("📈","إجمالي الربح", F.gross_profit, true, "green"),
      statCard("📉","إجمالي المصروفات", F.total_expenses, true, "red"),
      statCard("💵","صافي الربح", netProfit, true, "gold"),
      statCard("🏢","المصروفات الإدارية", F.admin_expenses, true, "blue"),
      statCard("📣","مصروفات المبيعات والتسويق", F.sales_marketing_expenses, true, "blue"),
      statCard("👥","الرواتب", F.salaries, true, "blue")
    ]))}

    ${sectionCard("٣) المبيعات", statGrid([
      statCard("🧾","المبيعات الشهرية", SA.monthly_sales, true, "blue"),
      statCard("🎯","المستهدف الشهري", SA.monthly_target, true, "gold"),
      statCard("📊","المبيعات منذ بداية السنة", SA.ytd_sales, true, "blue"),
      statCard("🆕","عملاء جدد", SA.new_customers, false, "green"),
      statCard("⚠️","عملاء متوقفون", SA.lost_customers, false, "red"),
      statCard("📄","عقود مُقدَّمة", SA.submitted_contracts_count, false, "blue")
    ]))}

    ${sectionCard("٤) التشغيل", textBlocks([
      textBlock("⚙️","حجم الأعمال المنفذة", OP.work_volume),
      textBlock("🔧","الأعطال والتوقفات", OP.breakdowns_downtime),
      textBlock("✅","الإجراءات التصحيحية", OP.corrective_actions),
      textBlock("❗","أهم المشكلات التشغيلية", OP.operational_issues)
    ]))}

    ${sectionCard("٥) المشاريع", tableFromRows(projects.map(p=>({
      name: p.name, value: p.value!=null?fmtNum(p.value)+" ريال":"—", client: p.client,
      completion: p.completion_pct!=null?p.completion_pct+"%":"—", status: p.status, notes: p.notes
    })), ["المشروع","القيمة","العميل","نسبة الإنجاز","الحالة","ملاحظات"]))}

    ${sectionCard("٦) الموارد البشرية", statGrid([
      statCard("👥","إجمالي الموظفين", HR.total_employees, false, "blue"),
      statCard("🆕","موظفون جدد", HR.new_employees, false, "green"),
      statCard("📉","معدل الدوران", HR.turnover_rate, false, "red")
    ]) + textBlocks([
      textBlock("👋","الاستقالات وإنهاء الخدمة", HR.resignations),
      textBlock("🪑","الوظائف الشاغرة والحرجة", HR.vacant_critical_roles),
      textBlock("📋","الوظائف المطلوب توظيفها", HR.roles_to_hire),
      textBlock("🎓","التدريب والتطوير", HR.training),
      textBlock("⚠️","المشاكل العمالية", HR.labor_issues),
      textBlock("🔮","الاحتياجات المستقبلية", HR.future_needs)
    ]))}

    ${sectionCard("٧) المشتريات", statGrid([
      statCard("📦","إجمالي المشتريات", PR.total_purchases, true, "blue")
    ]) + textBlocks([
      textBlock("📊","المشتريات مقارنة بالموازنة", PR.purchases_vs_budget),
      textBlock("🆕","الموردون الجدد", PR.new_suppliers)
    ]))}

    ${sectionCard("٨) العملاء وخدمة العملاء", statGrid([
      statCard("👤","عدد العملاء", CU.customer_count, false, "blue"),
      statCard("💬","عدد الشكاوى", CU.complaints_count, false, "red")
    ]) + textBlocks([
      textBlock("🔄","عملاء جدد ومفقودون", CU.new_lost_customers),
      textBlock("💚","معدل الاحتفاظ بالعملاء", CU.retention_rate),
      textBlock("😊","مستوى الرضا", CU.satisfaction_level),
      textBlock("⏱️","زمن المعالجة والشكاوى المفتوحة", CU.complaints_resolution),
      textBlock("⭐","أهم العملاء", CU.top_customers),
      textBlock("⚠️","عملاء معرّضون لخطر الفقدان", CU.at_risk_customers),
      textBlock("✅","إجراءات تحسين الرضا", CU.improvement_actions)
    ]))}

    ${sectionCard("٩) التسويق", textBlocks([
      textBlock("📣","الحملات التسويقية", MK.campaigns),
      textBlock("🆕","عملاء ناتجون عن الحملات", MK.campaign_customers),
      textBlock("💻","الأداء الرقمي", MK.digital_performance),
      textBlock("🏁","تقييم الأداء مقارنة بالمنافسين", MK.vs_competitors),
      textBlock("💡","فرص تسويقية جديدة", MK.new_opportunities)
    ]))}

    ${sectionCard("١٠) الشؤون القانونية والعقود", textBlocks([
      textBlock("⚖️","القضايا", LG.legal_cases),
      textBlock("💰","قيمة المطالبات", LG.claims_value),
      textBlock("📄","حالة العقود", LG.contracts_status),
      textBlock("🤝","النزاعات", LG.disputes),
      textBlock("⚠️","المخاطر القانونية", LG.legal_risks)
    ]))}

    ${sectionCard("١١) الشركات التابعة والفروع", tableFromRows(subsidiaries, ["الشركة/الفرع","التشغيل سليم؟","المشاكل"]))}

    ${sectionCard("١٢) الأداء مقابل الموازنة", textBlocks([
      textBlock("💰","الإيرادات", BU.revenue_vs_plan), textBlock("📈","الأرباح", BU.profit_vs_plan), textBlock("📉","المصروفات", BU.expenses_vs_plan),
      textBlock("💵","التدفقات النقدية", BU.cashflow_vs_plan), textBlock("🧾","المبيعات", BU.sales_vs_plan), textBlock("👤","عدد العملاء", BU.customers_vs_plan),
      textBlock("🏗️","المشاريع", BU.projects_vs_plan), textBlock("📊","الاستثمارات", BU.investments_vs_plan), textBlock("👥","الموارد البشرية", BU.hr_vs_plan),
      textBlock("❗","أسباب الانحرافات والإجراءات", BU.variance_reasons)
    ]))}

    ${sectionCard("١٣) التوقعات حتى نهاية السنة", statGrid([
      statCard("💰","الإيرادات المتوقعة", FC.expected_revenue, true, "blue"),
      statCard("📈","الأرباح المتوقعة", FC.expected_profit, true, "green"),
      statCard("💵","التدفقات النقدية المتوقعة", FC.expected_cashflow, true, "gold"),
      statCard("🧾","المبيعات المتوقعة", FC.expected_sales, true, "blue")
    ]) + textBlocks([
      textBlock("📄","العقود المتوقع توقيعها", FC.expected_contracts),
      textBlock("🏗️","المشاريع المتوقع إنجازها", FC.expected_projects),
      textBlock("⚠️","مخاطر مؤثرة على النتائج", FC.risks_affecting_results),
      textBlock("❓","هل ستتحقق الموازنة السنوية؟", FC.budget_achievable),
      textBlock("🔧","حاجة لتعديل التوقعات؟", FC.forecast_adjustment_needed)
    ]))}

    ${sectionCard("١٤) أهم التحديات", tableFromRows(challenges, ["التحدي","التفاصيل"]))}

    ${sectionCard("١٥) أولويات الشهر القادم", priorities.length ? `<ol style="margin:0;padding-inline-start:18px;font-size:12px;line-height:2">${priorities.map(p=>`<li>${p}</li>`).join("")}</ol>` : "")}
  `;
}

function exportIndicatorsPDF(){
  const reportBox = document.getElementById("indicatorsReport");
  if(!reportBox || !reportBox.querySelector(".card")){ alert("لا توجد بيانات مرفوعة بعد لتصديرها."); return; }
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة التصدير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التقرير المالي والتشغيلي — ${companyName}</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      .card-title,.card-head{font-size:14px;font-weight:800;color:#1A3A6B;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right;font-size:11px}
      th{background:#1A3A6B;color:#fff}
      .card{border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:12px;page-break-inside:avoid}
      a{display:none}
    </style></head><body>
    <h1><span class="ico-i ico-dashboard"></span>التقرير المالي والتشغيلي — ${companyName}</h1>
    <p>تاريخ التصدير: ${dateNow}</p>
    ${reportBox.innerHTML}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
    </body></html>
  `);
  w.document.close();
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

