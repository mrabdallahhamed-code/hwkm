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

async function riskAddQuestion(requestId, sugIdx){
  const SUG = ["كم عدد الموظفين في الشركة؟","ما هو نشاط الشركة الرئيسي ومصادر إيراداتها؟","هل توجد سياسات وإجراءات مكتوبة؟ أرفقها إن وجدت","ما أهم 3 مخاطر تقلقكم حاليًا؟","هل حدثت خسائر أو حوادث كبيرة خلال آخر 3 سنوات؟","من الشخص المسؤول عن التواصل معنا في الشركة؟"];
  const inp = document.getElementById("rad-q-input");
  const question = sugIdx != null ? SUG[sugIdx] : (inp ? inp.value.trim() : "");
  if(!question){ alert("اكتب السؤال أولاً"); return; }
  const { count } = await sb.from("risk_questions").select("id", { count:"exact", head:true }).eq("request_id", requestId);
  const { error } = await sb.from("risk_questions").insert([{ request_id: requestId, position: (count||0)+1, question, asked_by: String((currentUserProfile && currentUserProfile.email) || "").toLowerCase() }]);
  if(error){ alert("تعذّر إضافة السؤال: " + error.message); return; }
  openRiskAdminDetail(requestId);
}
async function riskDeleteQuestion(id, requestId){
  const { error } = await sb.from("risk_questions").delete().eq("id", id).eq("sent", false);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  openRiskAdminDetail(requestId);
}
async function riskSendQuestions(requestId){
  if(!await uiConfirm("سيتم إرسال الأسئلة للعميل ويتحوّل الطلب إلى «بانتظار رد العميل». متابعة؟")) return;
  const { error } = await sb.from("risk_questions").update({ sent: true, sent_at: new Date().toISOString() }).eq("request_id", requestId).eq("sent", false);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  if(_radCur.status === "تم الاستلام") await sb.from("risk_requests").update({ status: "بانتظار رد العميل" }).eq("id", requestId);
  logActivity("إرسال", "أسئلة تقييم مخاطر", _radCur.clientName, "");
  if(_radCur.clientEmail){
    try{ await sendNotificationEmail(_radCur.clientEmail, "لديك أسئلة من المستشار — طلب تقييم المخاطر", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">أسئلة من مستشار المخاطر</h2><p>أرسل لك المستشار أسئلة لازمة لبدء تقييم مخاطر شركتك. ادخل منصة حوكم ← المخاطر ← طلبك، وأجب عن كل سؤال لنبدأ العمل.</p></div>`); }catch(e){}
  }
  alert("تم إرسال الأسئلة للعميل ✅");
  try{ loadRiskAdmin(); }catch(e){}
  openRiskAdminDetail(requestId);
}
async function riskSetStatusQuick(requestId, status){
  const { error } = await sb.from("risk_requests").update({ status }).eq("id", requestId);
  if(error){ alert("تعذّر تغيير الحالة: " + error.message); return; }
  logActivity("تعديل", "طلب تقييم مخاطر", "الحالة", status);
  openRiskAdminDetail(requestId); if(typeof loadRiskAdmin === "function") try{ loadRiskAdmin(); }catch(e){}
}

let _radCur = { status:"", consultant:"" };
async function openRiskAdminDetail(requestId){
  const box = document.getElementById("rad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-riskadmin-detail");

  const [{ data: r }, { data: items }, { data: messages }, qRes] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_questions").select("*").eq("request_id", requestId).order("position",{ascending:true}).order("id",{ascending:true})
  ]);
  const qs = (qRes && qRes.data) || [];
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("rad-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'var(--primary)'};color:${m.sender_email===r.requested_by_email?'var(--dark)':'#fff'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br><span style="white-space:pre-line">${orgEsc(m.message)}</span>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const me = String((currentUserProfile && currentUserProfile.email) || "").toLowerCase();
  const isOwner = !!(currentUserProfile && currentUserProfile.is_platform_admin === true);
  const assigned = String(r.assigned_consultant_email || "").toLowerCase();
  const isConsultant = !!assigned && assigned === me;
  const canWork = isConsultant;
  let sIdx = RISK_STATUS_ORDER.indexOf(r.status);
  const staffMsgs = (messages||[]).filter(m => m.sender_email !== r.requested_by_email);
  const clientMsgs = (messages||[]).filter(m => m.sender_email === r.requested_by_email);
  const firstStaff = staffMsgs[0], lastStaff = staffMsgs[staffMsgs.length-1], lastClient = clientMsgs[clientMsgs.length-1];
  const sentQs = qs.filter(q => q.sent), draftQs = qs.filter(q => !q.sent);
  const answeredQs = sentQs.filter(q => q.answer);
  const clientReplied = sentQs.length > 0 && answeredQs.length === sentQs.length;
  const workStage = sIdx >= RISK_STATUS_ORDER.indexOf("قيد التحليل") || clientReplied;
  // أجاب العميل على كل الأسئلة: ننقل الطلب تلقائيًا إلى «قيد التحليل» (يشمل الطلبات الحالية)
  if(clientReplied && (r.status === "بانتظار رد العميل" || r.status === "تم الاستلام") && (isOwner || isConsultant)){
    const { error: stErr } = await sb.from("risk_requests").update({ status: "قيد التحليل" }).eq("id", requestId);
    if(!stErr){ r.status = "قيد التحليل"; try{ loadRiskAdmin(); }catch(e){} }
  }
  const done = r.status === "تقرير نهائي جاهز" || r.status === "مغلق";
  const stage = !assigned ? 1 : (!workStage ? 2 : (done ? 4 : 3));
  _radCur = { reportAI: !!(r.report_content && r.report_content.ai), status: r.status, consultant: r.assigned_consultant_email || "", clientEmail: r.requested_by_email || "", clientName: r.client_name || "" };

  const stepper = `<div style="display:flex;gap:6px;margin-bottom:16px">${["تكليف مستشار","التواصل مع العميل","التحليل والمصفوفة","التقرير النهائي"].map((t,i) => {
    const n = i+1, on = n === stage, ok = n < stage;
    return `<div style="flex:1;text-align:center"><div style="height:5px;border-radius:4px;background:${ok?'var(--green)':on?'var(--gold)':'var(--gray1)'}"></div><div style="font-size:10.5px;margin-top:5px;font-weight:${on?800:600};color:${on?'var(--dark)':'var(--gray3)'}">${ok?'✓ ':''}${n}. ${t}</div></div>`;
  }).join("")}</div>`;

  const approvalHtml = r.pending_final_approval ? `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${orgEsc(r.staff_closed_by||"—")}</div>
      ${isOwner ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى يعتمده إدارة حوكم.</div>`}
    </div>` : "";

  const requestCard = `<div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:12px;line-height:2.1">
      <div><b>مقدّم الطلب:</b> ${orgEsc(r.client_name||"—")} ${r.requested_by_email ? `<span style="color:var(--gray3);direction:ltr;display:inline-block">(${orgEsc(r.requested_by_email)})</span>` : ""}</div>
      <div><b>القطاع:</b> ${orgEsc(r.sector||"—")}</div>
      <div><b>نطاق التقييم:</b> ${orgEsc(r.scope||"—")}</div>
      <div><b>أنواع المخاطر المطلوبة:</b> ${orgEsc(r.risk_types_needed||"—")}</div>
      <div><b>الموعد المفضّل:</b> ${orgEsc(r.preferred_date||"—")}</div>
      <div style="margin-top:6px">${filesHtml}</div>
    </div></div>`;

  // المرحلة 1: التكليف (إدارة حوكم فقط)
  const assignCard = stage === 1
    ? (isOwner
      ? `<div class="sec-title" style="font-size:13px;margin-top:16px">👤 تكليف مستشار</div>
         <div class="card"><div class="card-body">
           <div class="fg" style="margin:0"><label style="font-size:11px">بريد المستشار</label><input class="fi" id="rad-consultant" placeholder="consultant@email.com" style="direction:ltr;text-align:left"/></div>
           <button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="assignRiskConsultant(${requestId})">تكليف المستشار</button>
         </div></div>`
      : `<div class="card" style="margin-top:16px"><div class="card-body" style="font-size:12px;color:var(--gray3);text-align:center">بانتظار تكليف مستشار من إدارة حوكم.</div></div>`)
    : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:12px"><span>👤 المستشار المكلَّف: <b style="direction:ltr;display:inline-block">${orgEsc(r.assigned_consultant_email)}</b></span>
       ${isOwner ? `<details><summary style="cursor:pointer;color:var(--primary);font-size:11.5px">تغيير المستشار</summary><div style="display:flex;gap:6px;margin-top:6px"><input class="fi" id="rad-consultant" value="${orgEsc(r.assigned_consultant_email)}" style="direction:ltr;text-align:left;margin:0"/><button class="btn-xs primary" onclick="assignRiskConsultant(${requestId})">حفظ</button></div></details>` : ""}</div>`;

  // المرحلة 2+: أسئلة المستشار وإجابات العميل
  const canChat = isOwner || isConsultant;
  let waitChip = "";
  if(sentQs.length && !clientReplied){
    const days = Math.floor((Date.now() - new Date(sentQs[0].sent_at || r.created_at).getTime())/86400000);
    waitChip = `<div style="background:#FFF4D6;border:1px solid #E6C766;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;color:#8A5A00;margin-bottom:10px">⏳ بانتظار العميل — أجاب عن ${answeredQs.length} من ${sentQs.length} · منذ ${days} يوم${days>=3?' — تأخّر الرد':''}</div>`;
  } else if(clientReplied){
    waitChip = `<div style="background:#E8F8EF;border:1px solid #A8DDBF;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;color:#1B7F4B;margin-bottom:10px">✅ أجاب العميل على جميع الأسئلة (${sentQs.length})</div>`;
  }
  const SUGGEST = ["كم عدد الموظفين في الشركة؟","ما هو نشاط الشركة الرئيسي ومصادر إيراداتها؟","هل توجد سياسات وإجراءات مكتوبة؟ أرفقها إن وجدت","ما أهم 3 مخاطر تقلقكم حاليًا؟","هل حدثت خسائر أو حوادث كبيرة خلال آخر 3 سنوات؟","من الشخص المسؤول عن التواصل معنا في الشركة؟"];
  const qRow = (q,i) => `<div style="padding:10px 0;${i?'border-top:1px dashed var(--gray1);':''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-size:12.5px;font-weight:800"><span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:${q.sent?'var(--primary)':'var(--gray3)'};color:#fff;font-size:11px;align-items:center;justify-content:center;margin-left:6px">${i+1}</span>${orgEsc(q.question)}</div>
        ${(!q.sent && canChat) ? `<button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:2px 8px;cursor:pointer" onclick="riskDeleteQuestion(${q.id},${requestId})">✕</button>` : ""}
      </div>
      ${!q.sent ? '<div style="font-size:10.5px;color:var(--gray3);margin-top:4px">مسودة — لم تُرسل بعد</div>'
        : q.answer ? `<div style="margin-top:6px;background:#EAF6EF;border-radius:8px;padding:8px 12px;font-size:12px;white-space:pre-line">${orgEsc(q.answer)}</div>`
        : '<div style="margin-top:6px;font-size:11.5px;color:#B8610A">لم يُجب بعد</div>'}
    </div>`;
  const askForm = canChat ? `<div style="margin-top:10px">
      <div style="display:flex;gap:6px"><input class="fi" id="rad-q-input" placeholder="اكتب سؤالاً للعميل ثم اضغط إضافة" style="margin:0;flex:1" onkeydown="if(event.key==='Enter'){riskAddQuestion(${requestId});}"/><button class="btn-xs primary" onclick="riskAddQuestion(${requestId})">إضافة سؤال</button></div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${SUGGEST.map((t,i)=>`<button class="btn-xs sec" style="font-size:10.5px" onclick="riskAddQuestion(${requestId},${i})">+ ${orgEsc(t)}</button>`).join("")}</div>
      ${draftQs.length ? `<button class="btn btn-gold" style="width:100%;margin-top:12px" onclick="riskSendQuestions(${requestId})">📤 إرسال ${draftQs.length} ${draftQs.length>2?'أسئلة':'سؤال'} للعميل</button>` : ""}
      ${(stage === 2 && sentQs.length && !clientReplied) ? `<button class="btn btn-ghost" style="width:100%;margin-top:6px;font-size:11.5px" onclick="riskSetStatusQuick(${requestId},'قيد التحليل')">العميل أجاب خارج المنصة — ابدأ التحليل</button>` : ""}
    </div>` : "";
  const oldChat = (messages||[]).length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-size:11.5px;color:var(--gray3)">رسائل إضافية (${messages.length})</summary><div style="margin-top:8px;max-height:220px;overflow-y:auto">${chatHtml}</div></details>` : "";
  const chatCard = stage >= 2 ? `<div class="sec-title" style="font-size:13px;margin-top:16px">❓ أسئلة المستشار وإجابات العميل</div>
    <div class="card"><div class="card-body">
      ${waitChip}
      ${qs.length ? qs.map(qRow).join("") : '<div style="font-size:11.5px;color:var(--gray3);text-align:center;padding:6px 0">لم تُضف أسئلة بعد.</div>'}
      ${askForm}
      ${oldChat}
    </div></div>` : "";

  // المرحلة 3+: التحليل
  const itemsHtmlR = (items||[]).length ? items.map(it => {
    const lvl = riskLevelInfo(it.likelihood, it.impact);
    return `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-size:12px;color:var(--dark);font-weight:700">${orgEsc(it.description||"")}</div>
        <span style="background:${lvl.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${lvl.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">الفئة: ${orgEsc(it.category||"—")} · الاحتمالية: ${it.likelihood??"—"}/5 · التأثير: ${it.impact??"—"}/5</div>
      ${canWork ? `<div style="display:flex;gap:6px;margin-top:6px">
        <select class="fs" style="font-size:11px;padding:4px" onchange="updateRiskItemStatus(${it.id},this.value,${requestId})">
          <option ${it.action_status==='معلّق'?'selected':''}>معلّق</option><option ${it.action_status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option><option ${it.action_status==='مكتمل'?'selected':''}>مكتمل</option>
        </select>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteRiskItem(${it.id},${requestId})">حذف</button>
      </div>` : `<div style="font-size:10.5px;margin-top:4px">الحالة: <b>${orgEsc(it.action_status||"—")}</b></div>`}
    </div>`;
  }).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد مخاطر مضافة بعد.</div>';

  const addRiskForm = canWork ? `
      <input class="fi" id="rad-item-desc" placeholder="وصف الخطر" style="margin-bottom:6px"/>
      <div class="row2">
        <input class="fi" id="rad-item-source" placeholder="مصدر الخطر" style="margin:0"/>
        <select class="fs" id="rad-item-category" style="margin:0"><option>استراتيجية</option><option>تشغيلية</option><option>مالية</option><option>امتثال / قانونية</option><option>سلامة / بيئية</option></select>
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
      <button class="btn btn-gold" style="width:100%;margin:8px 0 12px" onclick="addRiskItem(${requestId})">إضافة الخطر</button>` : "";

  const workCards = stage >= 3 ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-pin"></span>المخاطر المسجَّلة</div>
    <div class="card"><div class="card-body">${addRiskForm}${itemsHtmlR}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:16px">🌡️ المصفوفة الحرارية</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>
    ${canWork || (isOwner && r.report_content) ? `<div class="sec-title" style="font-size:13px;margin-top:16px">✨ تقرير المخاطر</div>
    <div class="card"><div class="card-body">
      ${canWork ? `<button class="btn btn-ghost" id="rad-ai-btn" style="width:100%;margin-bottom:10px" onclick="riskAIGenerate(${requestId})">✨ توليد مسودة التقرير بالذكاء الصناعي</button>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:10px">يُرسَل للذكاء الصناعي القطاع والنطاق والأسئلة وإجاباتها والمخاطر فقط، دون اسم الشركة أو أي أسماء. المسودة قابلة للتعديل، وأنت المسؤول عن محتوى التقرير.</div>` : ""}
      ${["executive_summary|الملخص التنفيذي|4","methodology|منهجية التقييم|3","key_findings|أبرز النتائج (كل نتيجة في سطر)|5","recommendations|التوصيات (كل توصية في سطر)|5","conclusion|الخاتمة|2"].map(x => { const [k,t,n] = x.split("|"); const v = (r.report_content || {})[k]; const val = Array.isArray(v) ? v.join("\n") : (v||""); return `<label style="font-size:11.5px;font-weight:700">${t}</label><textarea class="fi" id="rad-rep-${k}" rows="${n}" ${canWork ? "" : "readonly"} style="margin:2px 0 8px">${orgEsc(val)}</textarea>`; }).join("")}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${canWork ? `<button class="btn-xs primary" onclick="riskReportSave(${requestId},false)">💾 حفظ المسودة</button>
        <button class="btn btn-gold" style="flex:1" onclick="riskReportSave(${requestId},true)">📤 اعتماد التقرير وإرساله للاعتماد النهائي</button>` : ""}
        ${r.report_content ? `<button class="btn-xs sec" onclick="riskReportView(${requestId})">👁 معاينة / طباعة</button>` : ""}
      </div>
    </div></div>` : ""}
    <div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-document"></span>التقرير النهائي</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع تقرير نهائي بعد.</div>'}
      ${canWork ? `<input type="file" class="fi" id="rad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalRiskReport(${requestId})">رفع التقرير النهائي</button>` : ""}
    </div></div>
    ${(canWork || isOwner) ? `<div class="sec-title" style="font-size:13px;margin-top:16px">المرحلة</div>
    <div class="card"><div class="card-body">
      <select class="fs" id="rad-status">${RISK_STATUS_ORDER.slice(2).map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}</select>
      <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="updateRiskRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ المرحلة</button>
      ${(!isOwner) ? '<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">إنهاء الطلب (تقرير جاهز / مغلق) يحتاج اعتماد إدارة حوكم قبل أن يظهر للعميل.</div>' : ""}
    </div></div>` : ""}` : "";

  box.innerHTML = `${stepper}${approvalHtml}${requestCard}${assignCard}${chatCard}${workCards}`;
}

async function assignRiskConsultant(requestId){
  const el = document.getElementById("rad-consultant");
  const email = el ? el.value.trim().toLowerCase() : "";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ alert("أدخل بريد المستشار بشكل صحيح"); return; }
  const { error } = await sb.from("risk_requests").update({ assigned_consultant_email: email }).eq("id", requestId);
  if(error){ alert("تعذّر التكليف: " + error.message); return; }
  logActivity("تكليف", "طلب تقييم مخاطر", email, "");
  try{ await sendNotificationEmail(email, "تم تكليفك بطلب تقييم مخاطر جديد", `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2 style="color:#1A3A6B">طلب تقييم مخاطر جديد</h2><p>تم تكليفك بطلب تقييم مخاطر على منصة حوكم. ادخل المنصة ← الطلبات ← طلبات تحليل المخاطر، وأرسل للعميل أسئلتك وطلباتك لبدء العمل.</p></div>`); }catch(e){}
  openRiskAdminDetail(requestId); try{ loadRiskAdmin(); }catch(e){}
}

async function updateRiskRequestAdmin(requestId){
  const statusEl = document.getElementById("rad-status"), consEl = document.getElementById("rad-consultant");
  const status = statusEl ? statusEl.value : _radCur.status;
  const assigned_consultant_email = (consEl ? consEl.value.trim() : _radCur.consultant) || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("risk_requests").update({ assigned_consultant_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من إدارة حوكم قبل ما يظهر للعميل.");
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

function riskReportCollect(){
  const g = k => (document.getElementById("rad-rep-"+k) || { value:"" }).value.trim();
  const lines = k => g(k).split(/\n+/).map(x => x.replace(/^[-•\d.\s]+/, "").trim()).filter(Boolean);
  return { executive_summary: g("executive_summary"), methodology: g("methodology"), key_findings: lines("key_findings"), recommendations: lines("recommendations"), conclusion: g("conclusion") };
}
async function riskAIGenerate(requestId){
  if(!await uiConfirm("سيُرسَل القطاع ونطاق التقييم والأسئلة وإجاباتها والمخاطر (دون اسم الشركة أو أي أسماء) إلى خدمة ذكاء اصطناعي لتوليد مسودة التقرير، وستحل محل النصوص الحالية في الخانات. متابعة؟")) return;
  const btn = document.getElementById("rad-ai-btn"); const old = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = "جارٍ توليد المسودة…"; }
  try{
    const { data: sd } = await sb.auth.getSession();
    const token = sd && sd.session && sd.session.access_token;
    if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخولك من جديد."); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-risk-report`, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token }, body: JSON.stringify({ request_id: requestId }) });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ alert(data.error || "تعذّر توليد المسودة الآن."); return; }
    const c = data.content || {};
    const set = (k, v) => { const el = document.getElementById("rad-rep-"+k); if(el) el.value = Array.isArray(v) ? v.join("\n") : (v||""); };
    ["executive_summary","methodology","key_findings","recommendations","conclusion"].forEach(k => set(k, c[k]));
    window._radReportFromAI = true;
    alert("تم توليد المسودة ✅ — راجعها وعدّلها، ثم اضغط «حفظ المسودة» أو «اعتماد التقرير».");
  }catch(e){ alert("تعذّر الاتصال بالخدمة: " + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = old; } }
}
async function riskReportSave(requestId, submit){
  const content = riskReportCollect();
  if(!content.executive_summary || !content.key_findings.length){ alert("اكتب الملخص التنفيذي ونتيجة واحدة على الأقل، أو ولّد مسودة بالذكاء الصناعي أولاً."); return; }
  content.ai = !!window._radReportFromAI || !!(_radCur && _radCur.reportAI);
  if(submit && !await uiConfirm("سيُرسَل التقرير لاعتماد إدارة حوكم ولن يظهر للعميل قبل اعتماده. متابعة؟")) return;
  const payload = { report_content: content };
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(submit){
    if(isFullOwner){ payload.status = "تقرير نهائي جاهز"; payload.pending_final_approval = false; content.approved_at = new Date().toISOString(); }
    else { const { data: ud } = await sb.auth.getUser(); payload.pending_final_approval = true; payload.staff_closed_by = ud && ud.user ? ud.user.email : null; }
  }
  const { error } = await sb.from("risk_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  if(submit && !isFullOwner){ try{ await notifyOwnerNewRequest("تقرير مخاطر بانتظار اعتمادك", [["رقم الطلب", requestId]]); }catch(e){} }
  alert(submit ? (isFullOwner ? "تم اعتماد التقرير ✅ وظهر للعميل" : "تم إرسال التقرير لاعتماد إدارة حوكم ✅") : "تم حفظ المسودة ✅");
  try{ loadRiskAdmin(); }catch(e){}
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
    alert("تم رفع التقرير ✅ — بانتظار اعتماد إدارة حوكم قبل ما يظهر للعميل.");
    openRiskAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("risk_requests").update({ final_report_url: url, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي وتحديث الحالة ✅");
  openRiskAdminDetail(requestId);
}

async function finalApproveRiskRequest(requestId, targetStatus){
  try{
    const { data: cur } = await sb.from("risk_requests").select("report_content").eq("id", requestId).single();
    if(cur && cur.report_content) await sb.from("risk_requests").update({ report_content: Object.assign({}, cur.report_content, { approved_at: new Date().toISOString() }) }).eq("id", requestId);
  }catch(e){}
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
  if(_radCur.status === "تم الاستلام"){ await sb.from("risk_requests").update({ status: "بانتظار رد العميل" }).eq("id", requestId); try{ loadRiskAdmin(); }catch(e){} }
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
