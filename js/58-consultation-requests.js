/* ══════════ CONSULTANTS ══════════ */
/* ══════════ CONSULTATION REQUESTS (chairman/secretary → admin quote → chairman decision) ══════════ */
const CONSULT_REQUEST_ROLES = ['مدير النظام'];
let consultRequestsCache = [];
const CONSULT_STATUS_STYLE = {
  "جديد": { bg:"var(--offwhite)", color:"var(--gray3)" },
  "عرض سعر مقدم": { bg:"#EAF0F8", color:"var(--primary)" },
  "معتمد": { bg:"#E8F8EF", color:"var(--green)" },
  "مرفوض": { bg:"#FDE8E8", color:"var(--red)" }
};

function isPlatformPrivilegedUser(){
  return !!(currentUserProfile && (currentUserProfile.is_platform_admin === true || currentUserProfile.platform_team_module));
}

async function loadConsultantsPage(){
  const role = getCurrentRole();
  const privileged = isPlatformPrivilegedUser();
  const consultSection = document.getElementById("consultRequestsSection");
  const manageBtn = document.getElementById("btn-manage-providers");
  const historyTitle = document.getElementById("requestsHistoryTitle");
  const historyCol1 = document.getElementById("requestsHistoryCol1");

  // Companies no longer file free-form consultation requests: the directory below sends the request
  // straight to the HWKM team. Older consultation requests (if any) stay visible, read-only.
  const newBtn = document.getElementById("btn-new-consult-request");
  if(newBtn) newBtn.style.display = "none";
  if(manageBtn) manageBtn.style.display = privileged ? "inline-block" : "none";

  if(privileged){
    if(consultSection) consultSection.style.display = "none";
    if(historyTitle) historyTitle.textContent = "📋 طلبات الخدمة الواردة من كل الشركات";
    if(historyCol1) historyCol1.textContent = "الشركة";
  } else {
    if(historyTitle) historyTitle.textContent = "📋 الطلبات السابقة";
    if(historyCol1) historyCol1.textContent = "النوع";
    await loadConsultRequests(role);
    if(consultSection) consultSection.style.display = consultRequestsCache.length ? "block" : "none";
  }

  await loadServiceProviders(privileged);
  await loadAllRequestsHistory(privileged);
}

async function loadConsultRequests(role){
  const box = document.getElementById("consultRequestsList");
  if(!box) return;
  const { data, error } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  consultRequestsCache = data || [];
  if(consultRequestsCache.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد طلبات استشارة بعد.</div>'; return; }

  const isAdmin = role === 'مدير النظام';
  const isChairman = role === 'رئيس مجلس';
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  box.innerHTML = consultRequestsCache.map(r => {
    const st = CONSULT_STATUS_STYLE[r.status] || CONSULT_STATUS_STYLE["جديد"];
    let actionHtml = "";
    if(r.status === "جديد"){
      actionHtml = isAdmin
        ? `<div style="margin-top:10px;padding:10px;background:var(--offwhite);border-radius:8px">
            <div class="row2">
              <div class="fg"><label style="font-size:11px">قيمة عرض السعر (ريال)</label><input type="number" class="fi" id="quote-amount-${r.id}"/></div>
              <div class="fg"><label style="font-size:11px">ملاحظات العرض</label><input class="fi" id="quote-notes-${r.id}"/></div>
            </div>
            <button class="btn-xs primary" onclick="submitQuote(${r.id})"><span class="ico-i ico-send"></span>تقديم عرض السعر</button>
          </div>`
        : `<div style="font-size:11px;color:var(--gray3);margin-top:6px">⏳ بانتظار عرض سعر من مدير النظام</div>`;
    } else if(r.status === "عرض سعر مقدم"){
      actionHtml = `<div style="font-size:12px;margin-top:6px"><span class="ico-i ico-money"></span>عرض السعر: <b>${r.quote_amount ? Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')+' ريال' : '—'}</b>${r.quote_notes ? (' — '+r.quote_notes) : ''}</div>` +
        (isChairman
          ? `<div style="display:flex;gap:6px;margin-top:8px">
              <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="decideConsultRequest(${r.id},'معتمد')"><span class="ico-i ico-check"></span>موافقة</button>
              <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="decideConsultRequest(${r.id},'مرفوض')"><span class="ico-i ico-xcircle"></span>رفض</button>
            </div>`
          : `<div style="font-size:11px;color:var(--gray3);margin-top:6px">⏳ بانتظار قرار رئيس المجلس</div>`);
    } else {
      actionHtml = `<div style="font-size:12px;margin-top:6px"><span class="ico-i ico-money"></span>عرض السعر: ${r.quote_amount ? Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')+' ريال' : '—'}</div>`;
    }
    // Only the original requester (or an admin) can edit/withdraw a request, and only
    // before a quote has been submitted — after that point it's already in motion.
    const canEditDelete = r.status === "جديد" && (isAdmin || (myEmail && r.requested_by_email === myEmail));
    const editDeleteHtml = canEditDelete
      ? `<div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn-xs primary" onclick="editConsultRequest(${r.id})"><span class="ico-i ico-edit"></span>تعديل</button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer" onclick="deleteConsultRequest(${r.id})"><span class="ico-i ico-trash"></span>حذف</button>
        </div>`
      : "";
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(r.category||"")} <span style="font-size:11px;color:var(--gray3);font-weight:600">— طلب #${r.id}</span></div>
            <div style="font-size:12px;color:var(--gray3);margin-top:3px">${r.details||""}</div>
            <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">مقدَّم من: ${orgEsc(r.requested_by_name||"—")} · ${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : ''}</div>
          </div>
          <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;background:${st.bg};color:${st.color}">${r.status}</span>
        </div>
        ${actionHtml}
        ${editDeleteHtml}
      </div>
    </div>`;
  }).join("");
}

async function submitConsultRequest(){
  const id = document.getElementById("mcr-id").value;
  const category = document.getElementById("mcr-category").value;
  const details = document.getElementById("mcr-details").value.trim();
  if(!details){ alert("الرجاء إدخال تفاصيل الطلب"); return; }

  if(id){
    const { error } = await sb.from("consultation_requests").update({ category, details }).eq("id", id);
    if(error){ alert("تعذّر حفظ التعديل: " + error.message); return; }
  } else {
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const requested_by_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
    const { error } = await sb.from("consultation_requests").insert([{
      category, details, requested_by_name, requested_by_email: myEmail, status: "جديد", company_id: currentCompanyId
    }]);
    if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  }
  document.getElementById("mcr-id").value = "";
  document.getElementById("mcr-title-h").textContent = "💼 تقديم طلب استشارة";
  closeM("m-consult-request");
  loadConsultantsPage();
}

function editConsultRequest(id){
  const r = consultRequestsCache.find(x => x.id === id);
  if(!r) return;
  document.getElementById("mcr-id").value = r.id;
  document.getElementById("mcr-title-h").textContent = "✏️ تعديل طلب الاستشارة";
  document.getElementById("mcr-category").value = r.category || "إدارية";
  document.getElementById("mcr-details").value = r.details || "";
  openM("m-consult-request");
}

async function deleteConsultRequest(id){
  if(!await uiConfirm("هل تريد حذف/سحب هذا الطلب نهائيًا؟")) return;
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadConsultantsPage();
}

async function submitQuote(requestId){
  const amountEl = document.getElementById("quote-amount-"+requestId);
  const notesEl = document.getElementById("quote-notes-"+requestId);
  const quote_amount = amountEl && amountEl.value ? Number(amountEl.value) : null;
  if(!quote_amount){ alert("الرجاء إدخال قيمة عرض السعر"); return; }
  const quote_notes = notesEl ? notesEl.value.trim() : "";
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const quoted_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { error } = await sb.from("consultation_requests").update({
    quote_amount, quote_notes, quoted_by, status: "عرض سعر مقدم"
  }).eq("id", requestId);
  if(error){ alert("تعذّر إرسال العرض: " + error.message); return; }
  loadConsultantsPage();
}

async function decideConsultRequest(requestId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const decision_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const { error } = await sb.from("consultation_requests").update({
    status: decision, decision_by, decision_at: new Date().toISOString()
  }).eq("id", requestId);
  if(error){ alert("تعذّر تسجيل القرار: " + error.message); return; }
  loadConsultantsPage();
}
