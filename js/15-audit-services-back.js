/* ══════════ AUDIT SERVICES — BACK OFFICE (platform team manages all clients' requests) ══════════ */
function applyAdminRequestsTabVisibility(){
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  const tabVisibility = { companyrequests: true, managecompanies: true, auditadmin: true, riskadmin: true };
  if(!isPlatformAdmin && teamModule && teamModule !== 'حوكمة'){
    tabVisibility.auditadmin = (teamModule === 'تدقيق داخلي');
    tabVisibility.riskadmin = (teamModule === 'مخاطر');
  }
  document.querySelectorAll(".adminreq-tab-btn").forEach(btn => {
    btn.style.display = tabVisibility[btn.dataset.tab] ? '' : 'none';
  });
  return tabVisibility;
}

function switchAdminRequestsTab(tab){
  const visibility = applyAdminRequestsTabVisibility();
  if(!visibility[tab]){
    tab = Object.keys(visibility).find(k => visibility[k]) || 'companyrequests';
  }
  document.querySelectorAll(".adminreq-tab-content").forEach(el => { el.style.display = "none"; });
  document.getElementById("adminreq-tab-" + tab).style.display = "block";
  document.querySelectorAll(".adminreq-tab-btn").forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("btn-gold", active);
    btn.classList.toggle("btn-ghost", !active);
  });
}

async function loadAuditAdmin(){
  const tbody = document.getElementById("auditAdminTbody");
  if(!tbody) return;
  const [{ data: requests, error }, { data: companies }, { data: services }] = await Promise.all([
    sb.from("audit_requests").select("*").order("created_at",{ascending:false}),
    sb.from("companies").select("id,name"),
    sb.from("audit_service_types").select("id,name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });

  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openAuditAdminDetail(${r.id})">
    <td>${companyNameById[r.company_id]||"—"}</td>
    <td>${orgEsc(r.client_name||"—")}</td>
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${AUDIT_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td style="font-size:11px">${orgEsc(r.assigned_reviewer_email||"— غير مكلَّف —")}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openAuditAdminDetail(${r.id})">إدارة</button></td>
  </tr>`).join("");
}

async function openAuditAdminDetail(requestId){
  const box = document.getElementById("aad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-auditadmin-detail");

  const [{ data: r }, { data: findings }, { data: messages }] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("aad-title-h").textContent = "🗂️ " + (r.client_name||"طلب مراجعة");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:12px;color:var(--dark)">${orgEsc(f.finding_text)}</div>
    ${f.client_response ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد العميل:</b> ${f.client_response}</div>` : '<div style="font-size:10px;color:var(--gray3);margin-top:4px">بانتظار رد العميل...</div>'}
    <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
      <select class="fs" style="font-size:11px;padding:4px" onchange="updateFindingStatus(${f.id},this.value,${requestId})">
        <option ${f.status==='مفتوحة'?'selected':''}>مفتوحة</option>
        <option ${f.status==='مغلقة'?'selected':''}>مغلقة</option>
      </select>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteAuditFinding(${f.id},${requestId})">حذف</button>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملاحظات مضافة بعد.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'var(--primary)'};color:${m.sender_email===r.requested_by_email?'var(--dark)':'#fff'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  box.innerHTML = `
    ${r.pending_final_approval ? `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${r.staff_closed_by||"—"}</div>
      ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى يعتمده مالك المنصة.</div>`}
    </div>` : ""}
    <div class="row2">
      <div class="fg"><label style="font-size:11px">الحالة</label>
        <select class="fs" id="aad-status">
          ${AUDIT_STATUS_ORDER.map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}
        </select>
      </div>
      <div class="fg"><label style="font-size:11px">المراجع المكلَّف (إيميل)</label><input class="fi" id="aad-reviewer" value="${orgEsc(r.assigned_reviewer_email||'')}" placeholder="reviewer@email.com"/></div>
    </div>
    <button class="btn btn-gold" style="width:100%;margin-bottom:14px" onclick="updateAuditRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ الحالة والتكليف</button>

    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:11.5px;line-height:2">
      <div><b>القطاع:</b> ${r.sector||"—"}</div>
      <div><b>حجم المؤسسة:</b> ${r.org_size||"—"}</div>
      <div><b>نطاق المراجعة:</b> ${r.scope||"—"}</div>
      <div><b>الموعد المفضّل:</b> ${r.preferred_date||"—"}</div>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>ملفات العميل</div>
    <div class="card"><div class="card-body">${filesHtml}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-document"></span>التقرير النهائي</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع تقرير نهائي بعد.</div>'}
      <div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-top:8px">
        <div style="font-size:11px;font-weight:800;color:var(--dark);margin-bottom:6px">ملخّص النتيجة (يظهر للعميل مباشرة بدون فتح التقرير)</div>
        <div class="fg" style="margin:0 0 6px"><label style="font-size:10.5px">نتيجة التفتيش</label>
          <select class="fs" id="aad-inspection-result" style="margin:0">
            <option value="">— اختر —</option>
            <option value="مقبول" ${r.inspection_result==='مقبول'?'selected':''}><span class="ico-i ico-check"></span>مقبول</option>
            <option value="مقبول مع ملاحظات" ${r.inspection_result==='مقبول مع ملاحظات'?'selected':''}><span class="ico-i ico-warning"></span>مقبول مع ملاحظات</option>
            <option value="غير مقبول" ${r.inspection_result==='غير مقبول'?'selected':''}><span class="ico-i ico-xcircle"></span>غير مقبول</option>
          </select>
        </div>
        <div class="row2" style="margin:0 0 6px">
          <div class="fg" style="margin:0"><label style="font-size:10.5px">عدد الملاحظات</label><input type="number" class="fi" id="aad-findings-count" style="margin:0" value="${r.key_findings_count??''}"/></div>
          <div class="fg" style="margin:0"><label style="font-size:10.5px">نسبة الامتثال %</label><input type="number" min="0" max="100" class="fi" id="aad-compliance-pct" style="margin:0" value="${r.compliance_pct??''}"/></div>
        </div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px">ملخّص نصّي مختصر (سطر أو سطرين)</label><textarea class="fta" id="aad-result-summary" rows="2" style="margin:0">${r.result_summary||''}</textarea></div>
      </div>
      <input type="file" class="fi" id="aad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalAuditReport(${requestId})">رفع التقرير النهائي وحفظ الملخّص</button>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>إضافة ملاحظة/إجراء مطلوب</div>
    <div class="card"><div class="card-body">
      <textarea class="fi" id="aad-new-finding" rows="2" placeholder="اكتب ملاحظة المراجعة..."></textarea>
      <button class="btn-xs primary" style="margin-top:6px" onclick="addAuditFinding(${requestId})">إضافة الملاحظة</button>
      ${findingsHtml}
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع العميل</div>
    <div class="card"><div class="card-body">
      <div style="max-height:200px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="aad-chat-input" placeholder="اكتب ردًا للعميل..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendAuditAdminMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
  `;
}

async function updateAuditRequestAdmin(requestId){
  const status = document.getElementById("aad-status").value;
  const assigned_reviewer_email = document.getElementById("aad-reviewer").value.trim() || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ assigned_reviewer_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من مالك المنصة قبل ما يظهر للعميل.");
    loadAuditAdmin();
    openAuditAdminDetail(requestId);
    return;
  }

  const payload = { status, assigned_reviewer_email };
  if(status === "مغلق") payload.closed_at = new Date().toISOString();
  if(isFullOwner) payload.pending_final_approval = false;
  const { error } = await sb.from("audit_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم التحديث ✅");
  loadAuditAdmin();
}

async function addAuditFinding(requestId){
  const el = document.getElementById("aad-new-finding");
  const finding_text = el.value.trim();
  if(!finding_text) return;
  const { error } = await sb.from("audit_findings").insert([{ request_id: requestId, finding_text }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  openAuditAdminDetail(requestId);
}

async function updateFindingStatus(findingId, status, requestId){
  await sb.from("audit_findings").update({ status }).eq("id", findingId);
  openAuditAdminDetail(requestId);
}

async function deleteAuditFinding(findingId, requestId){
  if(!await uiConfirm("حذف هذه الملاحظة؟")) return;
  await sb.from("audit_findings").delete().eq("id", findingId);
  openAuditAdminDetail(requestId);
}

async function uploadFinalAuditReport(requestId){
  const input = document.getElementById("aad-report-file");
  const url = await uploadFile(input, "audit-reports");
  if(!url) return;
  const summaryFields = {
    inspection_result: document.getElementById("aad-inspection-result").value || null,
    key_findings_count: document.getElementById("aad-findings-count").value || null,
    compliance_pct: document.getElementById("aad-compliance-pct").value || null,
    result_summary: document.getElementById("aad-result-summary").value.trim() || null
  };
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(!isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم رفع التقرير والملخّص ✅ — بانتظار اعتماد مالك المنصة قبل ما يظهر للعميل.");
    openAuditAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي والملخّص وتحديث الحالة ✅");
  openAuditAdminDetail(requestId);
}

async function finalApproveAuditRequest(requestId, targetStatus){
  const { error } = await sb.from("audit_requests").update({ status: targetStatus, pending_final_approval: false, closed_at: targetStatus==="مغلق" ? new Date().toISOString() : null }).eq("id", requestId);
  if(error){ alert("تعذّر الاعتماد: " + error.message); return; }
  alert("تم الاعتماد النهائي ✅");
  openAuditAdminDetail(requestId);
  loadAuditAdmin();
}

async function sendAuditAdminMessage(requestId){
  const input = document.getElementById("aad-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("audit_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:"فريق المراجعة", message
  }]);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  input.value = "";
  openAuditAdminDetail(requestId);
}

async function loadAuditServiceTypesAdmin(){
  const box = document.getElementById("auditServicesAdminList");
  if(!box) return;
  const { data, error } = await sb.from("audit_service_types").select("*").order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد خدمات بعد.</div>'; return; }
  box.innerHTML = data.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray1)">
    <span style="font-size:12px">${orgEsc(s.name)}</span>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteAuditServiceType(${s.id})">حذف</button>
  </div>`).join("");
}

async function addAuditServiceType(){
  const name = document.getElementById("svc-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم الخدمة"); return; }
  const description = document.getElementById("svc-desc").value.trim();
  const duration_estimate = document.getElementById("svc-duration").value.trim();
  const { error } = await sb.from("audit_service_types").insert([{ name, description, duration_estimate }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  document.getElementById("svc-name").value=""; document.getElementById("svc-desc").value=""; document.getElementById("svc-duration").value="";
  loadAuditServiceTypesAdmin();
}

async function deleteAuditServiceType(id){
  if(!await uiConfirm("حذف هذه الخدمة من الكتالوج؟")) return;
  await sb.from("audit_service_types").delete().eq("id", id);
  loadAuditServiceTypesAdmin();
}

/* ══════════ RISK SERVICES — BACK OFFICE (platform team manages all clients' requests) ══════════ */
async function loadRiskAdmin(){
  const tbody = document.getElementById("riskAdminTbody");
  if(!tbody) return;
  const [{ data: requests, error }, { data: companies }, { data: services }] = await Promise.all([
    sb.from("risk_requests").select("*").order("created_at",{ascending:false}),
    sb.from("companies").select("id,name"),
    sb.from("risk_service_types").select("id,name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });

  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openRiskAdminDetail(${r.id})">
    <td>${companyNameById[r.company_id]||"—"}</td>
    <td>${orgEsc(r.client_name||"—")}</td>
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${RISK_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td style="font-size:11px">${orgEsc(r.assigned_consultant_email||"— غير مكلَّف —")}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openRiskAdminDetail(${r.id})">إدارة</button></td>
  </tr>`).join("");
}

async function openRiskAdminDetail(requestId){
  const box = document.getElementById("rad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-riskadmin-detail");

  const [{ data: r }, { data: items }, { data: messages }] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("rad-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const itemsHtml = (items||[]).length ? items.map(it => {
    const lvl = riskLevelInfo(it.likelihood, it.impact);
    return `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-size:12px;color:var(--dark);font-weight:700">${orgEsc(it.description||"")}</div>
        <span style="background:${lvl.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${lvl.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">الفئة: ${orgEsc(it.category||"—")} · الاحتمالية: ${it.likelihood??"—"}/5 · التأثير: ${it.impact??"—"}/5</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select class="fs" style="font-size:11px;padding:4px" onchange="updateRiskItemStatus(${it.id},this.value,${requestId})">
          <option ${it.action_status==='معلّق'?'selected':''}>معلّق</option>
          <option ${it.action_status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option>
          <option ${it.action_status==='مكتمل'?'selected':''}>مكتمل</option>
        </select>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteRiskItem(${it.id},${requestId})">حذف</button>
      </div>
    </div>`;
  }).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد مخاطر مضافة بعد.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'var(--primary)'};color:${m.sender_email===r.requested_by_email?'var(--dark)':'#fff'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  box.innerHTML = `
    ${r.pending_final_approval ? `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${r.staff_closed_by||"—"}</div>
      ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى يعتمده مالك المنصة.</div>`}
    </div>` : ""}
    <div class="row2">
      <div class="fg"><label style="font-size:11px">الحالة</label>
        <select class="fs" id="rad-status">
          ${RISK_STATUS_ORDER.map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}
        </select>
      </div>
      <div class="fg"><label style="font-size:11px">المستشار المكلَّف (إيميل)</label><input class="fi" id="rad-consultant" value="${orgEsc(r.assigned_consultant_email||'')}" placeholder="consultant@email.com"/></div>
    </div>
    <button class="btn btn-gold" style="width:100%;margin-bottom:14px" onclick="updateRiskRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ الحالة والتكليف</button>

    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:11.5px;line-height:2">
      <div><b>القطاع:</b> ${r.sector||"—"}</div>
      <div><b>نطاق التقييم:</b> ${r.scope||"—"}</div>
      <div><b>أنواع المخاطر المطلوبة:</b> ${r.risk_types_needed||"—"}</div>
      <div><b>الموعد المفضّل:</b> ${r.preferred_date||"—"}</div>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>ملفات العميل</div>
    <div class="card"><div class="card-body">${filesHtml}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px">🌡️ المصفوفة الحرارية</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-document"></span>التقرير النهائي</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع تقرير نهائي بعد.</div>'}
      <input type="file" class="fi" id="rad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalRiskReport(${requestId})">رفع التقرير النهائي</button>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>إضافة خطر</div>
    <div class="card"><div class="card-body">
      <input class="fi" id="rad-item-desc" placeholder="وصف الخطر" style="margin-bottom:6px"/>
      <div class="row2">
        <input class="fi" id="rad-item-source" placeholder="مصدر الخطر" style="margin:0"/>
        <select class="fs" id="rad-item-category" style="margin:0">
          <option>استراتيجية</option><option>تشغيلية</option><option>مالية</option><option>امتثال / قانونية</option><option>سلامة / بيئية</option>
        </select>
      </div>
      <div class="row2" style="margin-top:6px">
        <div><label style="font-size:10.5px;color:var(--gray3)">الاحتمالية (1-5)</label><input type="number" min="1" max="5" class="fi" id="rad-item-likelihood" style="margin:0"/></div>
        <div><label style="font-size:10.5px;color:var(--gray3)">التأثير (1-5)</label><input type="number" min="1" max="5" class="fi" id="rad-item-impact" style="margin:0"/></div>
      </div>
      <textarea class="fi" id="rad-item-treatment" rows="2" placeholder="خطة المعالجة المقترحة" style="margin-top:6px"></textarea>
      <div class="row2" style="margin-top:6px">
        <input class="fi" id="rad-item-responsible" placeholder="المسؤول عن التنفيذ" style="margin:0"/>
        <input type="date" class="fi" id="rad-item-target-date" style="margin:0"/>
      </div>
      <button class="btn-xs primary" style="margin-top:8px" onclick="addRiskItem(${requestId})">إضافة الخطر</button>
      ${itemsHtml}
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع العميل</div>
    <div class="card"><div class="card-body">
      <div style="max-height:200px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="rad-chat-input" placeholder="اكتب ردًا للعميل..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendRiskAdminMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
  `;
}

async function updateRiskRequestAdmin(requestId){
  const status = document.getElementById("rad-status").value;
  const assigned_consultant_email = document.getElementById("rad-consultant").value.trim() || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("risk_requests").update({ assigned_consultant_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من مالك المنصة قبل ما يظهر للعميل.");
    loadRiskAdmin();
    openRiskAdminDetail(requestId);
    return;
  }

  const payload = { status, assigned_consultant_email };
  if(status === "مغلق") payload.closed_at = new Date().toISOString();
  if(isFullOwner) payload.pending_final_approval = false;
  const { error } = await sb.from("risk_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم التحديث ✅");
  loadRiskAdmin();
}

async function addRiskItem(requestId){
  const description = document.getElementById("rad-item-desc").value.trim();
  if(!description){ alert("الرجاء إدخال وصف الخطر"); return; }
  const source = document.getElementById("rad-item-source").value.trim();
  const category = document.getElementById("rad-item-category").value;
  const likelihood = Number(document.getElementById("rad-item-likelihood").value) || null;
  const impact = Number(document.getElementById("rad-item-impact").value) || null;
  const treatment_plan = document.getElementById("rad-item-treatment").value.trim();
  const responsible_person = document.getElementById("rad-item-responsible").value.trim();
  const target_close_date = document.getElementById("rad-item-target-date").value || null;
  const { error } = await sb.from("risk_items").insert([{
    request_id: requestId, description, source, category, likelihood, impact, treatment_plan, responsible_person, target_close_date
  }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  openRiskAdminDetail(requestId);
}

async function updateRiskItemStatus(itemId, action_status, requestId){
  await sb.from("risk_items").update({ action_status }).eq("id", itemId);
  openRiskAdminDetail(requestId);
}

async function deleteRiskItem(itemId, requestId){
  if(!await uiConfirm("حذف هذا الخطر؟")) return;
  await sb.from("risk_items").delete().eq("id", itemId);
  openRiskAdminDetail(requestId);
}

async function uploadFinalRiskReport(requestId){
  const input = document.getElementById("rad-report-file");
  const url = await uploadFile(input, "risk-reports");
  if(!url) return;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(!isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("risk_requests").update({ final_report_url: url, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم رفع التقرير ✅ — بانتظار اعتماد مالك المنصة قبل ما يظهر للعميل.");
    openRiskAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("risk_requests").update({ final_report_url: url, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي وتحديث الحالة ✅");
  openRiskAdminDetail(requestId);
}

async function finalApproveRiskRequest(requestId, targetStatus){
  const { error } = await sb.from("risk_requests").update({ status: targetStatus, pending_final_approval: false, closed_at: targetStatus==="مغلق" ? new Date().toISOString() : null }).eq("id", requestId);
  if(error){ alert("تعذّر الاعتماد: " + error.message); return; }
  alert("تم الاعتماد النهائي ✅");
  openRiskAdminDetail(requestId);
  loadRiskAdmin();
}

async function sendRiskAdminMessage(requestId){
  const input = document.getElementById("rad-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("risk_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:"فريق المخاطر", message
  }]);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  input.value = "";
  openRiskAdminDetail(requestId);
}

async function loadRiskServiceTypesAdmin(){
  const box = document.getElementById("riskServicesAdminList");
  if(!box) return;
  const { data, error } = await sb.from("risk_service_types").select("*").order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد خدمات بعد.</div>'; return; }
  box.innerHTML = data.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray1)">
    <span style="font-size:12px">${orgEsc(s.name)}</span>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteRiskServiceType(${s.id})">حذف</button>
  </div>`).join("");
}

async function addRiskServiceType(){
  const name = document.getElementById("rsvc-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم الخدمة"); return; }
  const description = document.getElementById("rsvc-desc").value.trim();
  const duration_estimate = document.getElementById("rsvc-duration").value.trim();
  const { error } = await sb.from("risk_service_types").insert([{ name, description, duration_estimate }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  document.getElementById("rsvc-name").value=""; document.getElementById("rsvc-desc").value=""; document.getElementById("rsvc-duration").value="";
  loadRiskServiceTypesAdmin();
}

async function deleteRiskServiceType(id){
  if(!await uiConfirm("حذف هذه الخدمة من الكتالوج؟")) return;
  await sb.from("risk_service_types").delete().eq("id", id);
  loadRiskServiceTypesAdmin();
}


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

async function loadConsultantsPage(){
  const role = getCurrentRole();
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const consultSection = document.getElementById("consultRequestsSection");
  const newBtn = document.getElementById("btn-new-consult-request");
  const addProviderBtn = document.getElementById("btn-add-provider");
  const providersTitle = document.getElementById("providersSectionTitle");
  const historyTitle = document.getElementById("requestsHistoryTitle");
  const historyCol1 = document.getElementById("requestsHistoryCol1");

  if(isPlatformOwner){
    // Platform owner manages the global provider catalog and coordinates every client's
    // service requests — they don't request consultations from themselves.
    if(consultSection) consultSection.style.display = "none";
    if(addProviderBtn) addProviderBtn.style.display = "inline-block";
    if(providersTitle) providersTitle.textContent = "🤝 إدارة الوسطاء (كتالوج عام لكل الشركات)";
    if(historyTitle) historyTitle.textContent = "📋 طلبات الخدمة الواردة من كل الشركات";
    if(historyCol1) historyCol1.textContent = "الشركة";
  } else {
    if(consultSection) consultSection.style.display = "block";
    if(newBtn) newBtn.style.display = CONSULT_REQUEST_ROLES.includes(role) ? "inline-block" : "none";
    if(addProviderBtn) addProviderBtn.style.display = "none";
    if(providersTitle) providersTitle.textContent = "🤝 وساطة — مقدّمو الخدمات";
    if(historyTitle) historyTitle.textContent = "📋 الطلبات السابقة";
    if(historyCol1) historyCol1.textContent = "النوع";
    await loadConsultRequests(role);
  }

  await loadServiceProviders(isPlatformOwner);
  await loadAllRequestsHistory(isPlatformOwner);
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

/* ══════════ SERVICE PROVIDER MARKETPLACE (وساطة) ══════════ */
const SERVICE_STAGES = ["قيد المراجعة", "قيد التنفيذ", "مكتمل"];
let providersCache = [];

async function loadServiceProviders(isPlatformOwner){
  const grid = document.getElementById("providersGrid");
  if(!grid) return;
  // Providers are now a platform-wide catalog the owner curates — every company sees the
  // same list, not just what their own company happened to add before.
  const { data, error } = await sb.from("service_providers").select("*").order("id",{ascending:false});
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  providersCache = data || [];
  if(providersCache.length===0){ grid.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">${isPlatformOwner ? 'لا توجد جهات مضافة بعد. اضغط "+ إضافة" للبدء.' : 'لا توجد جهات وساطة متاحة حاليًا.'}</div>`; return; }

  const canRequest = !isPlatformOwner && isFullAccessRole(getCurrentRole());
  grid.innerHTML = providersCache.map(p => `<div class="card" style="margin:0;display:flex;flex-direction:column">
    <div class="card-body" style="display:flex;flex-direction:column;flex:1">
      <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(p.entity_name||"")}</div>
      <div style="font-size:11.5px;color:var(--gray3);margin-top:4px">🛠️ ${p.service_provided||"—"}</div>
      <div style="font-size:11.5px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-tag"></span>${p.activity_type||"—"}</div>
      <div style="font-size:11px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-document"></span>س.ت: ${p.cr_number||"—"}</div>
      ${canRequest ? `<button class="btn-xs gold" style="width:100%;margin-top:auto;padding-top:10px" onclick="requestService(${p.id})"><span class="ico-i ico-handshake"></span>اطلب الخدمة</button>` : (isPlatformOwner ? `<button class="btn-xs" style="width:100%;margin-top:auto;padding-top:10px;background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px;cursor:pointer" onclick="deleteServiceProvider(${p.id})"><span class="ico-i ico-trash"></span>حذف</button>` : "")}
    </div>
  </div>`).join("");
}

async function deleteServiceProvider(id){
  if(!await uiConfirm("حذف هذه الجهة من كتالوج الوسطاء؟")) return;
  await sb.from("service_providers").delete().eq("id", id);
  loadServiceProviders(true);
}

async function saveServiceProvider(){
  const entity_name = document.getElementById("mpv-name").value.trim();
  if(!entity_name){ alert("الرجاء إدخال اسم الجهة"); return; }
  const service_provided = document.getElementById("mpv-service").value.trim();
  const activity_type = document.getElementById("mpv-activity").value.trim();
  const cr_number = document.getElementById("mpv-cr").value.trim();
  // company_id intentionally omitted — providers are now a platform-wide catalog managed
  // solely by the platform owner, not tied to any one company.
  const { error } = await sb.from("service_providers").insert([{ entity_name, service_provided, activity_type, cr_number }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mpv-name").value=""; document.getElementById("mpv-service").value=""; document.getElementById("mpv-activity").value=""; document.getElementById("mpv-cr").value="";
  closeM("m-provider-add");
  loadServiceProviders(true);
}

async function requestService(providerId){
  if(!await uiConfirm("تأكيد إرسال طلب الخدمة لهذه الجهة؟")) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const requested_by_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { data, error } = await sb.from("service_requests").insert([{
    provider_id: providerId, requested_by_name, requested_by_email: myEmail, status: SERVICE_STAGES[0], company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  loadAllRequestsHistory();
  openServiceTrackingModal(data.id);
}

async function loadAllRequestsHistory(isPlatformOwner){
  const tbody = document.getElementById("allRequestsHistoryTbody");
  if(!tbody) return;

  if(isPlatformOwner){
    const [{ data: serviceData, error: serviceErr }, { data: companies }] = await Promise.all([
      sb.from("service_requests").select("*").order("created_at",{ascending:false}),
      sb.from("companies").select("id,name")
    ]);
    if(serviceErr){ tbody.innerHTML = errorRowHTML(5, serviceErr.message); return; }
    const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
    const rows = serviceData || [];
    if(rows.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد طلبات واردة بعد."); return; }
    tbody.innerHTML = rows.map(r => {
      const provider = providersCache.find(p => p.id === r.provider_id);
      return `<tr style="cursor:pointer" onclick="openServiceTrackingModal(${r.id})">
        <td>${companyNameById[r.company_id]||"—"}</td>
        <td>${orgEsc(provider ? provider.entity_name : "—")}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</td>
        <td>${r.status||"—"}</td>
        <td><button class="btn-xs primary" onclick="event.stopPropagation();openServiceTrackingModal(${r.id})"><span class="ico-i ico-search"></span>تتبع/توجيه</button></td>
      </tr>`;
    }).join("");
    return;
  }

  const [{ data: consultData, error: consultErr }, { data: serviceData, error: serviceErr }] = await Promise.all([
    sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId),
    sb.from("service_requests").select("*").eq("company_id", currentCompanyId)
  ]);
  if(consultErr || serviceErr){ tbody.innerHTML = errorRowHTML(5, (consultErr||serviceErr).message); return; }

  const combined = [
    ...(consultData||[]).map(r => ({ kind:"استشارة", label:r.category, date:r.created_at, status:r.status, id:r.id })),
    ...(serviceData||[]).map(r => {
      const provider = providersCache.find(p => p.id === r.provider_id);
      return { kind:"وساطة", label: provider ? provider.entity_name : "—", date:r.created_at, status:r.status, id:r.id };
    })
  ].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

  if(combined.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد طلبات سابقة بعد."); return; }

  tbody.innerHTML = combined.map(r => {
    const action = r.kind === "استشارة"
      ? `onclick="openConsultDetailModal(${r.id})"`
      : `onclick="openServiceTrackingModal(${r.id})"`;
    const btnLabel = r.kind === "استشارة" ? "📄 التفاصيل" : "🔎 تتبع";
    return `<tr style="cursor:pointer" ${action}>
      <td>${r.kind}</td>
      <td>${r.label}</td>
      <td>${r.date ? new Date(r.date).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</td>
      <td>${r.status||"—"}</td>
      <td><button class="btn-xs primary" onclick="event.stopPropagation();${r.kind==='استشارة'?`openConsultDetailModal(${r.id})`:`openServiceTrackingModal(${r.id})`}">${btnLabel}</button></td>
    </tr>`;
  }).join("");
}

function openConsultDetailModal(id){
  const r = consultRequestsCache.find(x => x.id === id);
  const box = document.getElementById("mcd-body");
  if(!r){ box.innerHTML = '<div style="color:var(--gray3)">تعذّر إيجاد تفاصيل هذا الطلب.</div>'; openM("m-consult-detail"); return; }
  box.innerHTML = `
    <div><b>الفئة:</b> ${orgEsc(r.category||"—")}</div>
    <div><b>التفاصيل:</b> ${r.details||"—"}</div>
    <div><b>مقدَّم من:</b> ${orgEsc(r.requested_by_name||"—")}</div>
    <div><b>الحالة:</b> ${r.status||"—"}</div>
    ${r.quote_amount ? `<div><b>عرض السعر:</b> ${Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')} ريال${r.quote_notes?(' — '+r.quote_notes):''}</div>` : ""}
    ${r.quoted_by ? `<div><b>قدَّم العرض:</b> ${r.quoted_by}</div>` : ""}
    ${r.decision_by ? `<div><b>القرار من:</b> ${r.decision_by}${r.decision_at ? (' — '+new Date(r.decision_at).toLocaleDateString('ar-SA-u-ca-gregory')) : ''}</div>` : ""}
  `;
  openM("m-consult-detail");
}

let currentTrackingRequestId = null;
async function openServiceTrackingModal(requestId){
  currentTrackingRequestId = requestId;
  const { data: r, error } = await sb.from("service_requests").select("*").eq("id", requestId).single();
  if(error || !r){ alert("تعذّر تحميل بيانات الطلب"); return; }
  const provider = providersCache.find(p => p.id === r.provider_id);

  document.getElementById("mst-track-title").textContent = "🔎 تتبع الطلب — " + (provider ? provider.entity_name : "");
  document.getElementById("mst-track-meta").innerHTML = `مقدَّم من: ${r.requested_by_name||"—"} · ${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : ''}`;

  const currentIdx = SERVICE_STAGES.indexOf(r.status);
  document.getElementById("mst-track-stepper").innerHTML = `<div style="display:flex;align-items:center">
    ${SERVICE_STAGES.map((stage,i) => {
      const done = i < currentIdx, active = i === currentIdx;
      const dotColor = done ? "var(--green)" : active ? "var(--primary)" : "var(--gray1)";
      const lineColor = i < currentIdx ? "var(--green)" : "var(--gray1)";
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:${i<SERVICE_STAGES.length-1?'1':'0'}">
        <div style="display:flex;align-items:center;width:100%">
          <div style="width:14px;height:14px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
          ${i<SERVICE_STAGES.length-1 ? `<div style="flex:1;height:3px;background:${lineColor}"></div>` : ""}
        </div>
        <div style="font-size:10px;color:var(--gray3);margin-top:4px;white-space:nowrap">${stage}</div>
      </div>`;
    }).join("")}
  </div>`;

  const advanceBox = document.getElementById("mst-track-advance");
  const canAdvance = isFullAccessRole(getCurrentRole());
  if(canAdvance && currentIdx >= 0 && currentIdx < SERVICE_STAGES.length-1){
    advanceBox.innerHTML = `<button class="btn btn-gold" style="width:100%" onclick="advanceServiceRequest()">⏩ نقل إلى: ${SERVICE_STAGES[currentIdx+1]}</button>`;
  } else {
    advanceBox.innerHTML = "";
  }
  openM("m-service-tracking");
}

async function advanceServiceRequest(){
  const requestId = currentTrackingRequestId;
  if(!requestId) return;
  const { data: r } = await sb.from("service_requests").select("*").eq("id", requestId).single();
  if(!r) return;
  const idx = SERVICE_STAGES.indexOf(r.status);
  if(idx === -1 || idx >= SERVICE_STAGES.length-1) return;
  const { error } = await sb.from("service_requests").update({ status: SERVICE_STAGES[idx+1] }).eq("id", requestId);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  openServiceTrackingModal(requestId);
  loadAllRequestsHistory();
}
