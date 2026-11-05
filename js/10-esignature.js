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
