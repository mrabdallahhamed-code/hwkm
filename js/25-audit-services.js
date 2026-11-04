/* ══════════ AUDIT SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const AUDIT_STATUS_ORDER = ["تم الاستلام","بانتظار رد العميل","قيد التحليل","تحت المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const AUDIT_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "بانتظار رد العميل":"#D9822B", "قيد التحليل":"var(--gold)", "تحت المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };
function auditFinalOK(r){ return (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") && !r.pending_final_approval; }

async function loadAudit(){
  const grid = document.getElementById("auditServicesGrid");
  const tbody = document.getElementById("auditRequestsTbody");
  if(!grid || !tbody) return;

  const [{ data: services, error: svcErr }, { data: requests, error: reqErr }] = await Promise.all([
    sb.from("audit_service_types").select("*").order("id",{ascending:true}),
    sb.from("audit_requests").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false})
  ]);

  if(svcErr){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${svcErr.message}</div>`; }
  else if(!services || services.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد خدمات متاحة حاليًا.</div>'; }
  else {
    grid.innerHTML = services.map(s => `<div class="card" style="margin:0;display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--gray3);margin-top:6px;line-height:1.6;flex:1">${orgEsc(s.description||"")}</div>
        ${s.duration_estimate ? `<div style="font-size:11px;color:var(--primary);margin-top:8px">⏱️ ${s.duration_estimate}</div>` : ""}
        <button class="btn btn-gold" style="width:100%;margin-top:12px;font-size:11.5px" onclick="openNewAuditRequest(${s.id},'${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-edit"></span>اطلب الخدمة الآن</button>
      </div>
    </div>`).join("");
  }

  if(reqErr){ tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red);font-size:12px">${reqErr.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });
  tbody.innerHTML = requests.map(r => {
    const resultBadge = (r.inspection_result && auditFinalOK(r))
      ? `<span style="color:${r.inspection_result==='مقبول'?'var(--green)':r.inspection_result==='غير مقبول'?'var(--red)':'var(--orange)'};font-weight:800;font-size:11px">${r.inspection_result==='مقبول'?'✅':r.inspection_result==='غير مقبول'?'❌':'⚠️'} ${r.inspection_result}</span>`
      : '<span style="color:var(--gray3);font-size:11px">—</span>';
    return `<tr style="cursor:pointer" onclick="openAuditRequestDetail(${r.id})">
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${AUDIT_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td>${resultBadge}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openAuditRequestDetail(${r.id})">عرض</button></td>
  </tr>`;
  }).join("");
}

function openNewAuditRequest(serviceId, serviceName){
  document.getElementById("anr-service-id").value = serviceId;
  document.getElementById("anr-service-name").textContent = serviceName;
  document.getElementById("anr-client-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  document.getElementById("anr-sector").value = "";
  document.getElementById("anr-scope").value = "";
  document.getElementById("anr-date").value = "";
  document.getElementById("anr-files").value = "";
  { const ak = document.getElementById("anr-paid-ack"); if(ak) ak.checked = false; const n = document.getElementById("anr-paid-note"); if(n) n.style.display = (typeof currentCompanyTrialEndsAt !== "undefined" && currentCompanyTrialEndsAt && new Date(currentCompanyTrialEndsAt) > new Date()) ? "" : "none"; }
  openM("m-audit-new-request");
}

async function submitAuditRequest(){
  { const n = document.getElementById("anr-paid-note"), ak = document.getElementById("anr-paid-ack"); if(n && n.style.display !== "none" && ak && !ak.checked){ alert("يلزم الإقرار بأن هذه خدمة مدفوعة قبل إرسال الطلب (الخانة أعلى النموذج)."); n.scrollIntoView({ block: "center" }); return; } }
  const service_type_id = Number(document.getElementById("anr-service-id").value);
  const client_name = document.getElementById("anr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("anr-sector").value.trim();
  const org_size = document.getElementById("anr-org-size").value;
  const scope = document.getElementById("anr-scope").value.trim();
  const preferred_date = document.getElementById("anr-date").value || null;
  if(!sector){ alert("الرجاء إدخال قطاع الشركة"); return; }
  if(scope.length < 15){ alert("الرجاء وصف نطاق المراجعة بوضوح (إدارة أو عملية أو سياسة) في سطر أو سطرين على الأقل، ليتمكّن المراجع من فهم طلبك"); return; }

  const filesInput = document.getElementById("anr-files");
  const file_urls = [];
  if(filesInput.files && filesInput.files.length){
    for(const f of filesInput.files){
      const fakeInput = { files: [f] };
      const url = await uploadFile(fakeInput, "audit-requests");
      if(url) file_urls.push({ name: f.name, url });
    }
  }

  const { data: userData } = await sb.auth.getUser();
  const requested_by_email = userData && userData.user ? userData.user.email : null;

  const { error } = await sb.from("audit_requests").insert([{
    company_id: currentCompanyId, service_type_id, requested_by_email, client_name, sector, org_size, scope,
    file_urls, preferred_date, status: "تم الاستلام"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  logActivity("إنشاء", "طلب مراجعة", client_name, "");
  await notifyOwnerNewRequest("طلب مراجعة جديد", [["اسم مقدّم الطلب", client_name],["القطاع", sector],["نطاق المراجعة", scope],["عدد الملفات المرفقة", file_urls.length]]);
  alert("تم إرسال طلبك بنجاح ✅ — سيتواصل معك فريق المراجعة قريبًا.");
  closeM("m-audit-new-request");
  loadAudit();
}

async function openAuditRequestDetail(requestId){
  const box = document.getElementById("ard-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-audit-request-detail");

  const [{ data: r }, { data: findings }, { data: messages }, { data: rating }, qRes] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_ratings").select("*").eq("request_id", requestId).limit(1),
    sb.from("audit_questions").select("*").eq("request_id", requestId).eq("sent", true).order("position",{ascending:true}).order("id",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }
  const questions = (qRes && qRes.data) || [];
  const finalOK = auditFinalOK(r);

  document.getElementById("ard-title-h").textContent = "🔍 " + (r.client_name||"طلب مراجعة");
  const existingRating = (rating||[])[0];

  const statusIdx = AUDIT_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${AUDIT_STATUS_ORDER.slice(0,5).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<4?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?AUDIT_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<4 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div><div style="text-align:center;font-size:11px;font-weight:700;color:${AUDIT_STATUS_COLOR[r.status]}">${r.status}</div>`;

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;color:var(--primary)"><span class="ico-i ico-pin"></span>ملاحظة المراجع</div>
    <div style="font-size:12px;color:var(--dark);margin:4px 0">${orgEsc(f.finding_text)}</div>
    <div style="font-size:10px;color:${f.status==='مغلقة'?'var(--green)':'var(--gray3)'};margin-bottom:6px">الحالة: ${f.status}</div>
    ${(()=>{ if(f.status==='مغلقة'||!f.target_date) return ""; const d = Math.round((new Date(f.target_date) - new Date(new Date().toDateString()))/86400000); return d<0 ? `<div style="font-size:11px;color:var(--red);font-weight:800;margin-bottom:6px">متأخرة ${-d} يوم عن الموعد</div>` : d<=14 ? `<div style="font-size:11px;color:#B8610A;font-weight:700;margin-bottom:6px">يحين موعدها بعد ${d} يوم</div>` : ""; })()}
    <textarea class="fi" id="finding-resp-${f.id}" rows="2" placeholder="اكتب ردك أو الإجراء التصحيحي..." style="font-size:11.5px">${orgEsc(f.client_response||"")}</textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><input class="fi" id="finding-own-${f.id}" placeholder="المسؤول عن التنفيذ" value="${orgEsc(f.responsible_person||"")}" style="flex:1;min-width:140px;margin:0;font-size:11.5px"><input class="fi" type="date" id="finding-date-${f.id}" value="${f.target_date||""}" title="الموعد المستهدف للتنفيذ" style="width:150px;margin:0;font-size:11.5px"></div>
    <button class="btn-xs primary" style="margin-top:6px" onclick="submitFindingResponse(${f.id},${requestId})">إرسال الرد</button>
  </div>`).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد ملاحظات بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'#E8F0FB':'#F1F1EC'};color:var(--dark);border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br><span style="white-space:pre-line">${orgEsc(m.message)}</span>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const unanswered = questions.filter(q => !q.answer);
  const qaHtml = questions.length ? `<div class="sec-title" style="font-size:13px;margin-top:6px">❓ أسئلة المراجع${unanswered.length ? ` <span style="font-size:11px;color:#B8610A;font-weight:700">— بانتظار ردّك على ${unanswered.length}</span>` : ' <span style="font-size:11px;color:var(--green);font-weight:700">— تمت الإجابة ✓</span>'}</div>
    <div class="card" style="${unanswered.length ? 'border:1.5px solid #E6C766' : ''}"><div class="card-body">
      ${unanswered.length ? '<div style="font-size:12px;color:#8A5A00;margin-bottom:10px">أجب عن كل سؤال ثم اضغط «إرسال الإجابات» ليبدأ المراجع العمل على طلبك.</div>' : ""}
      ${questions.map((q,i) => `<div style="padding:10px 0;${i? 'border-top:1px dashed var(--gray1);' : ''}">
        <div style="font-size:12.5px;font-weight:800;color:var(--dark)"><span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:11px;align-items:center;justify-content:center;margin-left:6px">${i+1}</span>${orgEsc(q.question)}</div>
        ${q.answer ? `<div style="margin-top:6px;background:#EAF6EF;border-radius:8px;padding:8px 12px;font-size:12px;white-space:pre-line">${orgEsc(q.answer)}</div>`
          : `<textarea class="fi audit-ans-input" data-qid="${q.id}" rows="2" placeholder="اكتب إجابتك هنا..." style="margin-top:6px"></textarea>`}
      </div>`).join("")}
      ${unanswered.length ? `<button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="submitAuditAnswers(${requestId})">إرسال الإجابات</button>` : ""}
    </div></div>` : "";

  const ratingHtml = finalOK ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px">⭐ تقييم الخدمة</div>
    <div class="card"><div class="card-body">
      ${existingRating ? `<div style="text-align:center;font-size:20px;color:var(--gold)">${"⭐".repeat(existingRating.rating)}</div><div style="font-size:11.5px;color:var(--gray3);text-align:center;margin-top:4px">${orgEsc(existingRating.comment||"")}</div>`
        : `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px" id="rating-stars">
             ${[1,2,3,4,5].map(n=>`<span onclick="setAuditRatingValue(${n})" id="star-${n}" style="font-size:24px;cursor:pointer;color:var(--gray1)">⭐</span>`).join("")}
           </div>
           <textarea class="fi" id="rating-comment" rows="2" placeholder="ملاحظاتك على الخدمة (اختياري)"></textarea>
           <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="submitAuditRating(${requestId})">إرسال التقييم</button>`}
    </div></div>` : "";

  const resultBadgeColor = r.inspection_result === 'مقبول' ? 'var(--green)' : r.inspection_result === 'غير مقبول' ? 'var(--red)' : 'var(--orange)';
  const resultIcon = r.inspection_result === 'مقبول' ? '✅' : r.inspection_result === 'غير مقبول' ? '❌' : '⚠️';
  const summaryHtml = (r.inspection_result && finalOK) ? `
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-dashboard"></span>نتيجة المراجعة</div>
    <div class="card" style="border:2px solid ${resultBadgeColor}">
      <div class="card-body">
        <div style="text-align:center;font-size:16px;font-weight:900;color:${resultBadgeColor};margin-bottom:10px">${resultIcon} ${orgEsc(r.inspection_result)}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;text-align:center">
          ${r.key_findings_count!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.key_findings_count}</div><div style="font-size:10.5px;color:var(--gray3)">عدد الملاحظات</div></div>` : ""}
          ${r.compliance_pct!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.compliance_pct}%</div><div style="font-size:10.5px;color:var(--gray3)">نسبة الامتثال</div></div>` : ""}
        </div>
        ${r.result_summary ? `<div style="font-size:11.5px;color:var(--dark);margin-top:10px;padding-top:10px;border-top:1px solid var(--gray1)">${orgEsc(r.result_summary)}</div>` : ""}
      </div>
    </div>` : "";

  box.innerHTML = `
    ${timeline}
    ${qaHtml}
    ${summaryHtml}
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-pin"></span>الملاحظات والإجراءات التصحيحية</div>
    ${findingsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${(r.report_content && finalOK) ? `<button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="auditReportView(${requestId})">📄 عرض تقرير المراجعة / طباعة PDF</button>` : ""}${(r.final_report_url && finalOK) ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <details style="margin-top:14px"><summary style="cursor:pointer;font-size:12.5px;font-weight:800"><span class="ico-i ico-message"></span> رسائل إضافية لفريق المراجعة</summary>
    <div class="card" style="margin-top:8px"><div class="card-body">
      <div id="audit-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <textarea class="fi" id="audit-chat-input" rows="3" placeholder="اكتب رسالتك..." style="flex:1;margin:0"></textarea>
        <button class="btn-xs primary" onclick="sendAuditMessage(${requestId})">إرسال</button>
      </div>
    </div></div></details>
    ${ratingHtml}
  `;
  window.currentAuditRatingValue = 0;
}

async function submitAuditAnswers(requestId){
  const inputs = [...document.querySelectorAll(".audit-ans-input")];
  const filled = inputs.filter(t => t.value.trim());
  if(!filled.length){ alert("اكتب إجابة سؤال واحد على الأقل"); return; }
  if(filled.length < inputs.length && !await uiConfirm(`لم تُجب عن ${inputs.length - filled.length} سؤال. هل ترسل إجاباتك الحالية الآن؟ (يمكنك الرد على الباقي لاحقاً)`)) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const now = new Date().toISOString();
  for(const t of filled){
    const { error } = await sb.from("audit_questions").update({ answer: t.value.trim(), answered_by: email, answered_at: now }).eq("id", Number(t.dataset.qid));
    if(error){ alert("تعذّر حفظ الإجابات: " + error.message); return; }
  }
  const { data: r } = await sb.from("audit_requests").select("assigned_reviewer_email").eq("id", requestId).single();
  if(r && r.assigned_reviewer_email){
    try{ await sendNotificationEmail(r.assigned_reviewer_email, "أجاب العميل على أسئلتك — طلب المراجعة الداخلية", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">وصلت إجابات العميل</h2><p>أجاب العميل على ${filled.length} من أسئلتك. ادخل المنصة ← الطلبات ← طلبات المراجعة لتبدأ العمل.</p></div>`); }catch(e){}
  }
  try{
    const { data: left } = await sb.from("audit_questions").select("id").eq("request_id", requestId).eq("sent", true).is("answer", null);
    if(left && !left.length) await sb.from("audit_requests").update({ status: "قيد التحليل" }).eq("id", requestId).in("status", ["بانتظار رد العميل","تم الاستلام"]);
  }catch(e){}
  await notifyOwnerNewRequest("إجابات العميل على أسئلة المراجع", [["عدد الإجابات", filled.length]]);
  alert("تم إرسال إجاباتك ✅ — سيبدأ المراجع العمل على طلبك.");
  openAuditRequestDetail(requestId);
}

async function auditReportView(requestId){
  const [{ data: r }, { data: findings }] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r || !r.report_content){ alert("لا يوجد تقرير محفوظ لهذا الطلب بعد."); return; }
  let coName = "", svc = "";
  try{ const { data: c } = await sb.from("companies").select("name").eq("id", r.company_id).single(); coName = c ? c.name : ""; }catch(e){}
  try{ const { data: sv } = await sb.from("audit_service_types").select("name").eq("id", r.service_type_id).maybeSingle(); svc = sv ? sv.name : ""; }catch(e){}
  const c = r.report_content, list = findings || [];
  const w = openPrintWindow(); if(!w){ alert("اسمح بالنوافذ المنبثقة للطباعة"); return; }
  const E = orgEsc, para = t => E(t||"").split(/\n+/).filter(Boolean).map(x => `<p>${x}</p>`).join("");
  const ul = a => (a||[]).length ? `<ol>${a.map(x => `<li>${E(x)}</li>`).join("")}</ol>` : "<p>—</p>";
  const dstr = new Date().toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"long",year:"numeric"});
  let revName = r.assigned_reviewer_email || "—";
  try{ if(r.assigned_reviewer_email){ const { data: cp } = await sb.from("user_profiles").select("full_name").ilike("email", r.assigned_reviewer_email).maybeSingle(); if(cp && cp.full_name) revName = cp.full_name; } }catch(e){}
  const okFinal = auditFinalOK(r);
  const approvedAt = (okFinal && c.approved_at) ? new Date(c.approved_at).toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"long",year:"numeric"}) : (okFinal ? dstr : "");
  const ref = "AUD-" + new Date().getFullYear() + "-" + String(requestId).padStart(4,"0");
  const resCol = r.inspection_result === 'مقبول' ? '#1B8A52' : r.inspection_result === 'غير مقبول' ? '#C0392B' : '#D4A60A';
  const stat = (n, t, col) => `<div class="st"><div class="n" style="color:${col}">${n}</div><div class="t">${t}</div></div>`;
  const openCnt = list.filter(f => f.status !== "مغلقة").length, closedCnt = list.length - openCnt;
  let sec = 0; const H = t => `<h2><span class="no">${++sec}</span>${t}</h2>`;
  w.document.open();
  w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المراجعة الداخلية — ${E(coName)}</title><style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
  @page{size:A4;margin:14mm 13mm 18mm}
  *{box-sizing:border-box}
  body{font-family:Tajawal,Arial,sans-serif;color:#0D2447;line-height:1.95;font-size:13px;margin:0;padding:0 4px}
  .hero{background:#0D2447;color:#fff;border-radius:10px;padding:22px 26px;margin-bottom:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hero .brand{color:#D4AF37;font-weight:800;font-size:13px;letter-spacing:.5px}
  .hero h1{font-size:25px;margin:6px 0 2px}.hero .co{font-size:15px;font-weight:700}
  .hero .meta2{display:flex;gap:22px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;color:#C9D4E6}
  .info{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .info div{border:1px solid #D9DEE8;border-radius:8px;padding:7px 12px;background:#F8F9FC;font-size:12px;break-inside:avoid}
  .info b{display:block;color:#6B7690;font-size:10.5px;font-weight:700}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
  .st{border:1px solid #D9DEE8;border-radius:10px;text-align:center;padding:8px 4px;break-inside:avoid}.st .n{font-size:22px;font-weight:800;line-height:1.3}.st .t{font-size:11px;color:#6B7690}
  h2{font-size:15.5px;margin:20px 0 6px;display:flex;align-items:center;gap:8px;break-after:avoid;page-break-after:avoid}
  h2 .no{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#D4AF37;color:#0D2447;font-size:12px;font-weight:800;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  p{margin:0 0 6px;text-align:justify}ol{margin:4px 0;padding-right:22px}li{margin-bottom:4px;break-inside:avoid}
  table{width:100%;border-collapse:collapse;margin-top:6px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
  th,td{border:1px solid #D0D6E2;padding:6px 8px;font-size:11.5px;text-align:center;vertical-align:middle}
  th{background:#1A3A6B;color:#fff;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.l{text-align:right}
  .esig{display:flex;gap:16px;margin-top:30px;break-inside:avoid}
  .esig .box{flex:1;border:1.5px solid #1A3A6B;border-radius:10px;text-align:center;padding:12px 8px;background:#F8F9FC}
  .esig .h{font-size:11px;color:#6B7690;font-weight:700}.esig .nm{font-size:15px;font-weight:800;margin:2px 0}.esig .sm{font-size:11.5px;color:#444}
  .esig .ok{display:inline-block;margin-top:8px;border:1.5px solid #1B8A52;color:#1B8A52;border-radius:6px;padding:2px 12px;font-size:11.5px;font-weight:800;transform:rotate(-2deg)}
  .note{font-size:10.5px;color:#7a8296;margin-top:22px;border-top:1px solid #ddd;padding-top:8px}
  .foot{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:10px;color:#8a93a6;border-top:1px solid #e2e5ec;padding-top:4px;background:#fff}
  </style></head><body>
  <div class="foot">${E(ref)} — تقرير المراجعة الداخلية — ${E(coName)} — سرّي</div>
  <div class="hero"><div class="brand">حوكم · HWKM</div><h1>تقرير المراجعة الداخلية</h1><div class="co">${E(coName)}</div>
    <div class="meta2"><span>رقم التقرير: ${E(ref)}</span><span>تاريخ الإصدار: ${dstr}</span>${svc ? `<span>الخدمة: ${E(svc)}</span>` : ""}</div></div>
  <div class="info"><div><b>القطاع</b>${E(r.sector||"—")}</div><div><b>حجم المؤسسة</b>${E(r.org_size||"—")}</div><div><b>نطاق المراجعة</b>${E(r.scope||"—")}</div></div>
  <div class="stats">${stat(r.inspection_result ? E(r.inspection_result) : "—","نتيجة المراجعة",resCol)}${stat(r.compliance_pct!=null ? r.compliance_pct+"%" : "—","نسبة الامتثال","#1D3E64")}${stat(openCnt,"ملاحظات مفتوحة","#E67E22")}${stat(closedCnt,"ملاحظات مغلقة","#27AE60")}</div>
  ${H("الملخص التنفيذي")}${para(c.executive_summary)}
  ${H("منهجية المراجعة")}${para(c.methodology)}
  ${H("أبرز النتائج")}${ul(c.key_findings)}
  ${H("سجل الملاحظات والإجراءات التصحيحية")}<table><thead><tr><th style="width:30px">#</th><th>الملاحظة</th><th>رد الجهة / الإجراء التصحيحي</th><th>الحالة</th></tr></thead><tbody>${list.length ? list.map((f,i) => `<tr><td>${i+1}</td><td class="l">${E(f.finding_text||"")}</td><td class="l">${E(f.client_response||"—")}</td><td>${E(f.status||"—")}</td></tr>`).join("") : '<tr><td colspan="4">لا توجد ملاحظات مسجّلة</td></tr>'}</tbody></table>
  ${H("التوصيات")}${ul(c.recommendations)}
  ${H("الخاتمة")}${para(c.conclusion)}
  <div class="esig">
    <div class="box"><div class="h">أعدّه</div><div class="nm">${E(revName)}</div><div class="sm">المراجع الداخلي المختص</div><div class="ok">✔ توقيع إلكتروني</div></div>
    <div class="box"><div class="h">اعتمده</div><div class="nm">إدارة حوكم</div><div class="sm">الرئيس التنفيذي${approvedAt ? " — " + E(approvedAt) : " — بانتظار الاعتماد النهائي"}</div><div class="ok" style="${approvedAt ? "" : "color:#B8610A;border-color:#B8610A"}">${approvedAt ? "✔ اعتماد إلكتروني" : "⏳ لم يُعتمد بعد"}</div></div>
  </div>
  <div style="font-size:10.5px;color:#6B7690;text-align:center;margin-top:6px">التوقيع والاعتماد إلكترونيان مسجَّلان في منصة حوكم برقم التقرير ${E(ref)}، وهما نافذان دون حاجة لتوقيع ورقي.</div>
  <div class="note">${c.ai ? "أُعدّت مسودة هذا التقرير بمساعدة الذكاء الاصطناعي ثم راجعها وعدّلها المراجع المختص. " : ""}يعتمد التقرير على المعلومات والمستندات المقدَّمة من الجهة وقت المراجعة.</div>
  </body></html>`);
  w.document.close();
}

async function submitFindingResponse(findingId, requestId){
  const val = document.getElementById(`finding-resp-${findingId}`).value.trim();
  const { error } = await sb.from("audit_findings").update({ client_response: val, responsible_person: (document.getElementById(`finding-own-${findingId}`)||{}).value?.trim() || null, target_date: (document.getElementById(`finding-date-${findingId}`)||{}).value || null }).eq("id", findingId);
  if(error){ alert("تعذّر إرسال الرد: " + error.message); return; }
  alert("تم إرسال ردك ✅");
  openAuditRequestDetail(requestId);
}

async function sendAuditMessage(requestId){
  const input = document.getElementById("audit-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("audit_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:email, message
  }]);
  if(error){ alert("تعذّر إرسال الرسالة: " + error.message); return; }
  input.value = "";
  openAuditRequestDetail(requestId);
}

function setAuditRatingValue(n){
  window.currentAuditRatingValue = n;
  for(let i=1;i<=5;i++){ document.getElementById(`star-${i}`).style.color = i<=n ? "var(--gold)" : "var(--gray1)"; }
}

async function submitAuditRating(requestId){
  const rating = window.currentAuditRatingValue || 0;
  if(!rating){ alert("الرجاء اختيار عدد النجوم"); return; }
  const comment = document.getElementById("rating-comment").value.trim();
  const { error } = await sb.from("audit_ratings").insert([{ request_id: requestId, rating, comment }]);
  if(error){ alert("تعذّر إرسال التقييم: " + error.message); return; }
  alert("شكرًا لتقييمك ✅");
  openAuditRequestDetail(requestId);
}
