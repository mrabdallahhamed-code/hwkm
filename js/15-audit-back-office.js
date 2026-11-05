/* ══════════ AUDIT SERVICES — BACK OFFICE (platform team manages all clients' requests) ══════════ */
function applyAdminRequestsTabVisibility(){
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  const tabVisibility = { companyrequests: true, managecompanies: true, auditadmin: true, riskadmin: true, providers: true };
  if(!isPlatformAdmin && teamModule && !teamHas(teamModule,'حوكمة')){
    tabVisibility.auditadmin = teamHas(teamModule,'تدقيق داخلي');
    tabVisibility.riskadmin = teamHas(teamModule,'مخاطر');
  }
  // صلاحية مخصّصة لكل شخص: «بدون وصول» تخفي التبويب، و«عرض/تعديل» تُظهره حتى لو تخصصه لا يشمله
  ["auditadmin","riskadmin"].forEach(id => {
    const ov = (typeof myPermissionOverrides === "object" && myPermissionOverrides) ? myPermissionOverrides[id] : null;
    if(ov === "none") tabVisibility[id] = false;
    else if(ov === "view" || ov === "edit") tabVisibility[id] = true;
  });
  document.querySelectorAll(".adminreq-tab-btn").forEach(btn => {
    btn.style.display = tabVisibility[btn.dataset.tab] ? '' : 'none';
  });
  return tabVisibility;
}

function switchAdminRequestsTab(tab){
  if(tab === 'providers') loadProvidersAdmin();
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

async function auditAddQuestion(requestId, sugIdx){
  const SUG = ["ما هو نشاط الشركة الرئيسي وهيكلها الإداري؟","هل توجد سياسات وإجراءات مكتوبة للنطاق المطلوب مراجعته؟ أرفقها إن وجدت","ما آخر مراجعة أو تدقيق تمّ للنطاق نفسه ونتيجته؟","ما أبرز المشكلات أو الشكاوى المتكررة في هذا النطاق؟","من المسؤول عن التواصل معنا وتزويدنا بالمستندات؟","هل توجد أنظمة أو برامج تُستخدم في هذه العمليات؟"];
  const inp = document.getElementById("aad-q-input");
  const question = sugIdx != null ? SUG[sugIdx] : (inp ? inp.value.trim() : "");
  if(!question){ alert("اكتب السؤال أولاً"); return; }
  const { count } = await sb.from("audit_questions").select("id", { count:"exact", head:true }).eq("request_id", requestId);
  const { error } = await sb.from("audit_questions").insert([{ request_id: requestId, position: (count||0)+1, question, asked_by: String((currentUserProfile && currentUserProfile.email) || "").toLowerCase() }]);
  if(error){ alert("تعذّر إضافة السؤال: " + error.message); return; }
  openAuditAdminDetail(requestId);
}
async function auditDeleteQuestion(id, requestId){
  const { error } = await sb.from("audit_questions").delete().eq("id", id).eq("sent", false);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  openAuditAdminDetail(requestId);
}
async function auditSendQuestions(requestId){
  if(!await uiConfirm("سيتم إرسال الأسئلة للعميل ويتحوّل الطلب إلى «بانتظار رد العميل». متابعة؟")) return;
  const { error } = await sb.from("audit_questions").update({ sent: true, sent_at: new Date().toISOString() }).eq("request_id", requestId).eq("sent", false);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  if(_aadCur.status === "تم الاستلام") await sb.from("audit_requests").update({ status: "بانتظار رد العميل" }).eq("id", requestId);
  logActivity("إرسال", "أسئلة مراجعة", _aadCur.clientName, "");
  if(_aadCur.clientEmail){
    try{ await sendNotificationEmail(_aadCur.clientEmail, "لديك أسئلة من المراجع — طلب المراجعة الداخلية", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">أسئلة من المراجع الداخلي</h2><p>أرسل لك المراجع أسئلة لازمة لبدء مراجعة شركتك. ادخل منصة حوكم ← المراجعة الداخلية ← طلبك، وأجب عن كل سؤال لنبدأ العمل.</p></div>`); }catch(e){}
  }
  alert("تم إرسال الأسئلة للعميل ✅");
  try{ loadAuditAdmin(); }catch(e){}
  openAuditAdminDetail(requestId);
}
async function auditSetStatusQuick(requestId, status){
  const { error } = await sb.from("audit_requests").update({ status }).eq("id", requestId);
  if(error){ alert("تعذّر تغيير الحالة: " + error.message); return; }
  logActivity("تعديل", "طلب مراجعة", "الحالة", status);
  openAuditAdminDetail(requestId); try{ loadAuditAdmin(); }catch(e){}
}

let _aadCur = { status:"", reviewer:"" };
async function openAuditAdminDetail(requestId){
  const box = document.getElementById("aad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-auditadmin-detail");

  const [{ data: r }, { data: findings }, { data: messages }, qRes] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_questions").select("*").eq("request_id", requestId).order("position",{ascending:true}).order("id",{ascending:true})
  ]);
  const qs = (qRes && qRes.data) || [];
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("aad-title-h").textContent = "🗂️ " + (r.client_name||"طلب مراجعة");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'#E8F0FB'};color:var(--dark);border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br><span style="white-space:pre-line">${orgEsc(m.message)}</span>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const me = String((currentUserProfile && currentUserProfile.email) || "").toLowerCase();
  const isOwner = !!(currentUserProfile && currentUserProfile.is_platform_admin === true);
  const assigned = String(r.assigned_reviewer_email || "").toLowerCase();
  const isReviewer = !!assigned && assigned === me;
  const canWork = isReviewer;
  const canChat = isOwner || isReviewer;
  const sIdx = AUDIT_STATUS_ORDER.indexOf(r.status);
  const sentQs = qs.filter(q => q.sent), draftQs = qs.filter(q => !q.sent);
  const answeredQs = sentQs.filter(q => q.answer);
  const clientReplied = sentQs.length > 0 && answeredQs.length === sentQs.length;
  const workStage = sIdx >= AUDIT_STATUS_ORDER.indexOf("قيد التحليل") || clientReplied;
  if(clientReplied && (r.status === "بانتظار رد العميل" || r.status === "تم الاستلام") && canChat){
    const { error: stErr } = await sb.from("audit_requests").update({ status: "قيد التحليل" }).eq("id", requestId);
    if(!stErr){ r.status = "قيد التحليل"; try{ loadAuditAdmin(); }catch(e){} }
  }
  const done = r.status === "تقرير نهائي جاهز" || r.status === "مغلق";
  const stage = !assigned ? 1 : (!workStage ? 2 : (done ? 4 : 3));
  _aadCur = { reportAI: !!(r.report_content && r.report_content.ai), status: r.status, reviewer: r.assigned_reviewer_email || "", clientEmail: r.requested_by_email || "", clientName: r.client_name || "" };

  const stepper = `<div style="display:flex;gap:6px;margin-bottom:16px">${["تكليف مراجع","التواصل مع العميل","المراجعة والملاحظات","التقرير النهائي"].map((t,i) => {
    const n = i+1, on = n === stage, ok = n < stage;
    return `<div style="flex:1;text-align:center"><div style="height:5px;border-radius:4px;background:${ok?'var(--green)':on?'var(--gold)':'var(--gray1)'}"></div><div style="font-size:10.5px;margin-top:5px;font-weight:${on?800:600};color:${on?'var(--dark)':'var(--gray3)'}">${ok?'✓ ':''}${n}. ${t}</div></div>`;
  }).join("")}</div>`;

  const approvalHtml = r.pending_final_approval ? `<div style="background:#EEF3FA;border:1.5px solid #B8C9E4;border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#1D3E64"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${orgEsc(r.staff_closed_by||"—")}</div>
      ${isOwner ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى تعتمده إدارة حوكم.</div>`}
    </div>` : "";

  const requestCard = `<div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:12px;line-height:2.1">
      <div><b>مقدّم الطلب:</b> ${orgEsc(r.client_name||"—")} ${r.requested_by_email ? `<span style="color:var(--gray3);direction:ltr;display:inline-block">(${orgEsc(r.requested_by_email)})</span>` : ""}</div>
      <div><b>القطاع:</b> ${orgEsc(r.sector||"—")}</div>
      <div><b>حجم المؤسسة:</b> ${orgEsc(r.org_size||"—")}</div>
      <div><b>نطاق المراجعة:</b> ${orgEsc(r.scope||"—")}</div>
      <div><b>الموعد المفضّل:</b> ${orgEsc(r.preferred_date||"—")}</div>
      <div style="margin-top:6px">${filesHtml}</div>
    </div></div>`;

  const assignCard = stage === 1
    ? (isOwner
      ? `<div class="sec-title" style="font-size:13px;margin-top:16px">👤 تكليف مراجع</div>
         <div class="card"><div class="card-body">
           <div class="fg" style="margin:0"><label style="font-size:11px">بريد المراجع</label><input class="fi" id="aad-reviewer" placeholder="reviewer@email.com" style="direction:ltr;text-align:left"/></div>
           <button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="assignAuditReviewer(${requestId})">تكليف المراجع</button>
         </div></div>`
      : `<div class="card" style="margin-top:16px"><div class="card-body" style="font-size:12px;color:var(--gray3);text-align:center">بانتظار تكليف مراجع من إدارة حوكم.</div></div>`)
    : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:12px"><span>👤 المراجع المكلَّف: <b style="direction:ltr;display:inline-block">${orgEsc(r.assigned_reviewer_email)}</b></span>
       ${isOwner ? `<details><summary style="cursor:pointer;color:var(--primary);font-size:11.5px">تغيير المراجع</summary><div style="display:flex;gap:6px;margin-top:6px"><input class="fi" id="aad-reviewer" value="${orgEsc(r.assigned_reviewer_email)}" style="direction:ltr;text-align:left;margin:0"/><button class="btn-xs primary" onclick="assignAuditReviewer(${requestId})">حفظ</button></div></details>` : ""}</div>`;

  let waitChip = "";
  if(sentQs.length && !clientReplied){
    const days = Math.floor((Date.now() - new Date(sentQs[0].sent_at || r.created_at).getTime())/86400000);
    waitChip = `<div style="background:#EEF3FA;border:1px solid #B8C9E4;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;color:#1D3E64;margin-bottom:10px">⏳ بانتظار العميل — أجاب عن ${answeredQs.length} من ${sentQs.length} · منذ ${days} يوم${days>=3?' — تأخّر الرد':''}</div>`;
  } else if(clientReplied){
    waitChip = `<div style="background:#E8F8EF;border:1px solid #A8DDBF;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;color:#1B7F4B;margin-bottom:10px">✅ أجاب العميل على جميع الأسئلة (${sentQs.length})</div>`;
  }
  const SUGGEST = ["ما هو نشاط الشركة الرئيسي وهيكلها الإداري؟","هل توجد سياسات وإجراءات مكتوبة للنطاق المطلوب مراجعته؟ أرفقها إن وجدت","ما آخر مراجعة أو تدقيق تمّ للنطاق نفسه ونتيجته؟","ما أبرز المشكلات أو الشكاوى المتكررة في هذا النطاق؟","من المسؤول عن التواصل معنا وتزويدنا بالمستندات؟","هل توجد أنظمة أو برامج تُستخدم في هذه العمليات؟"];
  const qRow = (q,i) => `<div style="padding:10px 0;${i?'border-top:1px dashed var(--gray1);':''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-size:12.5px;font-weight:800"><span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:${q.sent?'var(--primary)':'var(--gray3)'};color:#fff;font-size:11px;align-items:center;justify-content:center;margin-left:6px">${i+1}</span>${orgEsc(q.question)}</div>
        ${(!q.sent && canChat) ? `<button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:2px 8px;cursor:pointer" onclick="auditDeleteQuestion(${q.id},${requestId})">✕</button>` : ""}
      </div>
      ${!q.sent ? '<div style="font-size:10.5px;color:var(--gray3);margin-top:4px">مسودة — لم تُرسل بعد</div>'
        : q.answer ? `<div style="margin-top:6px;background:#EAF6EF;border-radius:8px;padding:8px 12px;font-size:12px;white-space:pre-line">${orgEsc(q.answer)}</div>`
        : '<div style="margin-top:6px;font-size:11.5px;color:var(--gray3)">لم يُجب بعد</div>'}
    </div>`;
  const askForm = canChat ? `<div style="margin-top:10px">
      <div style="display:flex;gap:6px"><input class="fi" id="aad-q-input" placeholder="اكتب سؤالاً للعميل ثم اضغط إضافة" style="margin:0;flex:1" onkeydown="if(event.key==='Enter'){auditAddQuestion(${requestId});}"/><button class="btn-xs primary" onclick="auditAddQuestion(${requestId})">إضافة سؤال</button></div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${SUGGEST.map((t,i)=>`<button class="btn-xs sec" style="font-size:10.5px" onclick="auditAddQuestion(${requestId},${i})">+ ${orgEsc(t)}</button>`).join("")}</div>
      ${draftQs.length ? `<button class="btn btn-gold" style="width:100%;margin-top:12px" onclick="auditSendQuestions(${requestId})">📤 إرسال ${draftQs.length} ${draftQs.length>2?'أسئلة':'سؤال'} للعميل</button>` : ""}
      ${(stage === 2 && sentQs.length && !clientReplied) ? `<button class="btn btn-ghost" style="width:100%;margin-top:6px;font-size:11.5px" onclick="auditSetStatusQuick(${requestId},'قيد التحليل')">العميل أجاب خارج المنصة — ابدأ المراجعة</button>` : ""}
    </div>` : "";
  const oldChat = (messages||[]).length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-size:11.5px;color:var(--gray3)">رسائل إضافية (${messages.length})</summary><div style="margin-top:8px;max-height:220px;overflow-y:auto">${chatHtml}</div>
      ${canChat ? `<div style="display:flex;gap:6px;margin-top:8px"><input class="fi" id="aad-chat-input" placeholder="اكتب ردًا للعميل..." style="flex:1;margin:0"><button class="btn-xs primary" onclick="sendAuditAdminMessage(${requestId})">إرسال</button></div>` : ""}</details>` : "";
  const chatCard = stage >= 2 ? `<div class="sec-title" style="font-size:13px;margin-top:16px">❓ أسئلة المراجع وإجابات العميل</div>
    <div class="card"><div class="card-body">
      ${waitChip}
      ${qs.length ? qs.map(qRow).join("") : '<div style="font-size:11.5px;color:var(--gray3);text-align:center;padding:6px 0">لم تُضف أسئلة بعد.</div>'}
      ${askForm}
      ${oldChat}
    </div></div>` : "";

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:12px;color:var(--dark)">${orgEsc(f.finding_text)}</div>
    <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">المسؤول: ${orgEsc(f.responsible_person||"—")} · الموعد: ${f.target_date||"—"}</div>
    ${f.client_response ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد العميل:</b> ${orgEsc(f.client_response)}</div>` : '<div style="font-size:10px;color:var(--gray3);margin-top:4px">بانتظار رد العميل.</div>'}
    ${canWork ? `<div style="display:flex;gap:6px;margin-top:6px;align-items:center">
      <select class="fs" style="font-size:11px;padding:4px" onchange="updateFindingStatus(${f.id},this.value,${requestId})">
        <option ${f.status==='مفتوحة'?'selected':''}>مفتوحة</option>
        <option ${f.status==='مغلقة'?'selected':''}>مغلقة</option>
      </select>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteAuditFinding(${f.id},${requestId})">حذف</button>
    </div>` : `<div style="font-size:10.5px;margin-top:4px">الحالة: <b>${orgEsc(f.status||"—")}</b></div>`}
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملاحظات مضافة بعد.</div>';

  const repFields = ["executive_summary|الملخص التنفيذي|4","methodology|منهجية المراجعة|3","key_findings|أبرز النتائج (كل نتيجة في سطر)|5","recommendations|التوصيات (كل توصية في سطر)|5","conclusion|الخاتمة|2"];
  const workCards = stage >= 3 ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-pin"></span>ملاحظات المراجعة</div>
    <div class="card"><div class="card-body">
      ${canWork ? `<textarea class="fi" id="aad-new-finding" rows="2" placeholder="اكتب ملاحظة المراجعة..."></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><input class="fi" id="aad-new-finding-owner" placeholder="المسؤول عن التصحيح (اختياري)" style="flex:1;min-width:150px;margin:0"><input class="fi" type="date" id="aad-new-finding-date" title="الموعد المستهدف" style="width:160px;margin:0"></div>
      <button class="btn btn-gold" style="width:100%;margin:8px 0 12px" onclick="addAuditFinding(${requestId})">إضافة الملاحظة</button>` : ""}
      ${findingsHtml}
    </div></div>
    <div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-dashboard"></span>نتيجة المراجعة</div>
    <div class="card"><div class="card-body">
      <div class="fg" style="margin:0 0 6px"><label style="font-size:10.5px">نتيجة التفتيش</label>
        <select class="fs" id="aad-inspection-result" style="margin:0" ${canWork ? "" : "disabled"}>
          <option value="">— اختر —</option>
          <option value="مقبول" ${r.inspection_result==='مقبول'?'selected':''}>مقبول</option>
          <option value="مقبول مع ملاحظات" ${r.inspection_result==='مقبول مع ملاحظات'?'selected':''}>مقبول مع ملاحظات</option>
          <option value="غير مقبول" ${r.inspection_result==='غير مقبول'?'selected':''}>غير مقبول</option>
        </select>
      </div>
      <div class="row2" style="margin:0 0 6px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px">عدد الملاحظات</label><input type="number" class="fi" id="aad-findings-count" style="margin:0" value="${r.key_findings_count??''}" ${canWork ? "" : "disabled"}/></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px">نسبة الامتثال %</label><input type="number" min="0" max="100" class="fi" id="aad-compliance-pct" style="margin:0" value="${r.compliance_pct??''}" ${canWork ? "" : "disabled"}/></div>
      </div>
      <div class="fg" style="margin:0"><label style="font-size:10.5px">ملخّص نصّي مختصر (سطر أو سطرين)</label><textarea class="fta" id="aad-result-summary" rows="2" style="margin:0" ${canWork ? "" : "disabled"}>${orgEsc(r.result_summary||'')}</textarea></div>
    </div></div>
    ${canWork || (isOwner && r.report_content) ? `<div class="sec-title" style="font-size:13px;margin-top:16px">✨ تقرير المراجعة</div>
    <div class="card"><div class="card-body">
      ${canWork ? `<button class="btn btn-ghost" id="aad-ai-btn" style="width:100%;margin-bottom:10px" onclick="auditAIGenerate(${requestId})">✨ توليد مسودة التقرير بالذكاء الصناعي</button>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:10px">يُرسَل للذكاء الصناعي القطاع والنطاق والأسئلة وإجاباتها والملاحظات فقط، دون اسم الشركة أو أي أسماء. المسودة قابلة للتعديل، وأنت المسؤول عن محتوى التقرير.</div>` : ""}
      ${repFields.map(x => { const [k,t,n] = x.split("|"); const v = (r.report_content || {})[k]; const val = Array.isArray(v) ? v.join("\n") : (v||""); return `<label style="font-size:11.5px;font-weight:700">${t}</label><textarea class="fi" id="aad-rep-${k}" rows="${n}" ${canWork ? "" : "readonly"} style="margin:2px 0 8px">${orgEsc(val)}</textarea>`; }).join("")}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${canWork ? `<button class="btn-xs primary" onclick="auditReportSave(${requestId},false)">💾 حفظ المسودة</button>
        <button class="btn btn-gold" style="flex:1" onclick="auditReportSave(${requestId},true)">📤 اعتماد التقرير وإرساله للاعتماد النهائي</button>` : ""}
        ${r.report_content ? `<button class="btn-xs sec" onclick="auditReportView(${requestId})">👁 معاينة / طباعة</button>` : ""}
      </div>
    </div></div>` : ""}
    <div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-document"></span>التقرير النهائي (ملف مرفوع)</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع ملف تقرير بعد.</div>'}
      ${canWork ? `<input type="file" class="fi" id="aad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalAuditReport(${requestId})">رفع الملف وحفظ نتيجة المراجعة</button>` : ""}
    </div></div>
    ${(canWork || isOwner) ? `<div class="sec-title" style="font-size:13px;margin-top:16px">المرحلة</div>
    <div class="card"><div class="card-body">
      <select class="fs" id="aad-status">${AUDIT_STATUS_ORDER.slice(2).map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}</select>
      <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="updateAuditRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ المرحلة</button>
      ${(!isOwner) ? '<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">إنهاء الطلب (تقرير جاهز / مغلق) يحتاج اعتماد إدارة حوكم قبل أن يظهر للعميل.</div>' : ""}
    </div></div>` : ""}` : "";

  box.innerHTML = `${stepper}${approvalHtml}${requestCard}${assignCard}${chatCard}${workCards}`;
}

async function assignAuditReviewer(requestId){
  const el = document.getElementById("aad-reviewer");
  const email = el ? el.value.trim().toLowerCase() : "";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ alert("أدخل بريد المراجع بشكل صحيح"); return; }
  const { error } = await sb.from("audit_requests").update({ assigned_reviewer_email: email }).eq("id", requestId);
  if(error){ alert("تعذّر التكليف: " + error.message); return; }
  logActivity("تكليف", "طلب مراجعة", email, "");
  try{ await sendNotificationEmail(email, "تم تكليفك بطلب مراجعة داخلية جديد", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">طلب مراجعة داخلية جديد</h2><p>تم تكليفك بطلب مراجعة داخلية على منصة حوكم. ادخل المنصة ← الطلبات ← طلبات المراجعة، وأرسل للعميل أسئلتك وطلباتك لبدء العمل.</p></div>`); }catch(e){}
  openAuditAdminDetail(requestId); try{ loadAuditAdmin(); }catch(e){}
}

function auditResultFields(){
  const g = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const cnt = g("aad-findings-count"), pct = g("aad-compliance-pct");
  return {
    inspection_result: g("aad-inspection-result") || null,
    key_findings_count: cnt !== "" ? Number(cnt) : null,
    compliance_pct: pct !== "" ? Number(pct) : null,
    result_summary: g("aad-result-summary").trim() || null
  };
}
function auditReportCollect(){
  const g = k => { const el = document.getElementById("aad-rep-"+k); return el ? el.value.trim() : ""; };
  const lines = t => t.split(/\n+/).map(x => x.replace(/^[\s\-•\d.)]+/, "").trim()).filter(Boolean);
  return { executive_summary: g("executive_summary"), methodology: g("methodology"), key_findings: lines(g("key_findings")), recommendations: lines(g("recommendations")), conclusion: g("conclusion") };
}
async function auditAIGenerate(requestId){
  if(!await uiConfirm("سيُرسَل القطاع ونطاق المراجعة والأسئلة وإجاباتها والملاحظات (دون اسم الشركة أو أي أسماء) إلى خدمة الذكاء الصناعي لكتابة مسودة. متابعة؟")) return;
  const btn = document.getElementById("aad-ai-btn"); const old = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = "جارٍ توليد المسودة…"; }
  try{
    // نحفظ نتيجة المراجعة أولاً حتى تدخل في المسودة
    await sb.from("audit_requests").update(auditResultFields()).eq("id", requestId);
    const { data: sd } = await sb.auth.getSession();
    const token = sd && sd.session && sd.session.access_token;
    if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخولك من جديد."); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-audit-report`, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token }, body: JSON.stringify({ request_id: requestId }) });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ alert(data.error || "تعذّر توليد المسودة الآن."); return; }
    const c = data.content || {};
    const set = (k, v) => { const el = document.getElementById("aad-rep-"+k); if(el) el.value = Array.isArray(v) ? v.join("\n") : (v||""); };
    ["executive_summary","methodology","key_findings","recommendations","conclusion"].forEach(k => set(k, c[k]));
    window._aadReportFromAI = true;
    alert("تم توليد المسودة ✅ — راجعها وعدّلها، ثم اضغط «حفظ المسودة» أو «اعتماد التقرير».");
  }catch(e){ alert("تعذّر الاتصال بالخدمة: " + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = old; } }
}
async function auditReportSave(requestId, submit){
  const content = auditReportCollect();
  if(!content.executive_summary || !content.key_findings.length){ alert("اكتب الملخص التنفيذي ونتيجة واحدة على الأقل، أو ولّد مسودة بالذكاء الصناعي."); return; }
  content.ai = !!window._aadReportFromAI || !!(_aadCur && _aadCur.reportAI);
  if(submit && !await uiConfirm("سيُرسَل التقرير لاعتماد إدارة حوكم ولن يظهر للعميل قبل اعتماده. متابعة؟")) return;
  const payload = { report_content: content, ...auditResultFields() };
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(submit){
    if(isFullOwner){ payload.status = "تقرير نهائي جاهز"; payload.pending_final_approval = false; content.approved_at = new Date().toISOString(); }
    else { const { data: ud } = await sb.auth.getUser(); payload.pending_final_approval = true; payload.staff_closed_by = ud && ud.user ? ud.user.email : null; }
  }
  const { error } = await sb.from("audit_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  if(submit && !isFullOwner){ try{ await notifyOwnerNewRequest("تقرير مراجعة بانتظار اعتمادك", [["رقم الطلب", requestId]]); }catch(e){} }
  alert(submit ? (isFullOwner ? "تم اعتماد التقرير ✅ وظهر للعميل" : "تم إرسال التقرير لاعتماد إدارة حوكم ✅") : "تم حفظ المسودة ✅");
  try{ loadAuditAdmin(); }catch(e){}
  openAuditAdminDetail(requestId);
}

async function updateAuditRequestAdmin(requestId){
  const statusEl = document.getElementById("aad-status"), revEl = document.getElementById("aad-reviewer");
  const status = statusEl ? statusEl.value : _aadCur.status;
  const assigned_reviewer_email = (revEl ? revEl.value.trim() : _aadCur.reviewer) || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ assigned_reviewer_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من إدارة حوكم قبل ما يظهر للعميل.");
    loadAuditAdmin();
    openAuditAdminDetail(requestId);
    return;
  }

  const payload = { status, assigned_reviewer_email };
  if(status === "مغلق") payload.closed_at = new Date().toISOString();
  if(isFullOwner && isFinalStatus) payload.pending_final_approval = false;
  const { error } = await sb.from("audit_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم التحديث ✅");
  loadAuditAdmin();
  openAuditAdminDetail(requestId);
}

async function addAuditFinding(requestId){
  const el = document.getElementById("aad-new-finding");
  const finding_text = el.value.trim();
  if(!finding_text) return;
  const responsible_person = (document.getElementById("aad-new-finding-owner")||{}).value?.trim() || null;
  const target_date = (document.getElementById("aad-new-finding-date")||{}).value || null;
  const { error } = await sb.from("audit_findings").insert([{ request_id: requestId, finding_text, responsible_person, target_date }]);
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
  const summaryFields = auditResultFields();
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(!isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم رفع التقرير والملخّص ✅ — بانتظار اعتماد إدارة حوكم قبل ما يظهر للعميل.");
    openAuditAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي والملخّص وتحديث الحالة ✅");
  openAuditAdminDetail(requestId);
}

async function finalApproveAuditRequest(requestId, targetStatus){
  const payload = { status: targetStatus, pending_final_approval: false, closed_at: targetStatus==="مغلق" ? new Date().toISOString() : null };
  try{
    const { data: cur } = await sb.from("audit_requests").select("report_content").eq("id", requestId).single();
    if(cur && cur.report_content) payload.report_content = { ...cur.report_content, approved_at: new Date().toISOString() };
  }catch(e){}
  const { error } = await sb.from("audit_requests").update(payload).eq("id", requestId);
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
