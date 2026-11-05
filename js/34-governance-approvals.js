/* ══════════ APPROVAL REMINDERS (policies + permissions) ══════════ */
async function sendPolicyApprovalReminder(policyId){
  const p = policiesCache.find(x => x.id === policyId);
  if(!p){ alert("تعذّر تحديد السياسة"); return; }
  const [{ data: team }, { data: reviews }] = await Promise.all([
    sb.from("user_profiles").select("email,full_name,phone_number").eq("company_id", currentCompanyId),
    sb.from("policy_reviews").select("reviewer_email").eq("policy_id", policyId)
  ]);
  const reviewedEmails = new Set((reviews||[]).map(r => (r.reviewer_email||"").toLowerCase()));
  const pending = (team||[]).filter(t => t.email && !reviewedEmails.has(t.email.toLowerCase()));
  if(pending.length === 0){ alert("كل الأعضاء راجعوا هذه السياسة بالفعل ✅"); return; }

  const subject = `تذكير موافقة: ${p.policy_name || "سياسة"}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-columns"></span>تذكير بمراجعة سياسة معلّقة</h2>
      <p><b>السياسة:</b> ${orgEsc(p.policy_name||"")}</p>
      <p><b>المرحلة الحالية:</b> ${p.status||"—"}</p>
      <p>الرجاء الدخول للمنصة ومراجعة السياسة والتصويت عليها.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(pending.map(t => ({ email: t.email })), subject, html, "تذكير موافقة سياسة");
  logActivity("إنشاء", "تذكير موافقة", p.policy_name, `أُرسل لـ${pending.length} عضو لم يراجعوا بعد`);

  const text = `🏛️ *تذكير بمراجعة سياسة*\n\n*${p.policy_name||""}*\nالمرحلة: ${p.status||"—"}\n\nالرجاء الدخول للمنصة ومراجعتها.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, pending.map(t => t.email));
}

async function sendPermissionItemNotification(itemId){
  const { data: item } = await sb.from("permission_items").select("*").eq("id", itemId).single();
  if(!item){ return; }
  const { data: team } = await sb.from("user_profiles").select("email,full_name,phone_number").eq("company_id", currentCompanyId);
  const recipients = (team||[]).filter(t => t.email);
  if(recipients.length === 0) return;

  const subject = `بند صلاحية جديد: ${item.item_name || ""}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-key"></span>بند جديد بمصفوفة الصلاحيات</h2>
      <p><b>البند:</b> ${orgEsc(item.item_name||"")}</p>
      <p><b>الفئة:</b> ${orgEsc(item.category||"—")}</p>
      <p>الرجاء مراجعة مصفوفة الصلاحيات بالمنصة والاطّلاع على البند الجديد.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(recipients.map(t => ({ email: t.email })), subject, html, "إشعار بند صلاحية جديد");
  logActivity("إنشاء", "إشعار صلاحيات", item.item_name, `أُرسل لـ${recipients.length} عضو`);
}

function sendPermissionItemWhatsApp(itemId){
  const item = permItemsCache?.find(x => x.id === itemId);
  if(!item){ alert("تعذّر تحديد البند"); return; }
  const text = `🔑 *بند جديد بمصفوفة الصلاحيات*\n\n*${item.item_name||""}*\nالفئة: ${item.category||"—"}\n\nالرجاء مراجعتها بالمنصة.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, null);
}

/* ══════════ BOARD APPROVAL WORKFLOW (permissions matrix + org structure) ══════════ */
async function uploadBlobToStorage(blob, folder, filename){
  const MAX_SIZE = 50 * 1024 * 1024;
  if(blob.size > MAX_SIZE){
    alert(`تعذّر الرفع: الملف الناتج (${(blob.size/1024/1024).toFixed(1)} ميجا) أكبر من الحد المسموح حاليًا (٥٠ ميجا).`);
    return null;
  }
  const safeName = Date.now() + "_" + filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = (currentCompanyId ? currentCompanyId : "unassigned") + "/" + folder + "/" + safeName;
  const { error } = await sb.storage.from("documents").upload(path, blob);
  if(error){ alert("تعذّر رفع الملف: " + error.message); return null; }
  const { data, error: signErr } = await sb.storage.from("documents").createSignedUrl(path, 315360000);
  if(signErr || !data){ alert("تعذّر إنشاء رابط آمن للملف: " + (signErr?.message||"")); return null; }
  return data.signedUrl;
}

// "Board" pool = any team member whose role relates to the board (chairman/secretary/member) or
// the system admin — matches how the rest of the platform already treats board-related roles.
/* A single source of truth for "what do we call the approving body" — used everywhere board
   approval language shows up (policies, the structure/matrix/charter approval workflow, PDFs,
   emails) instead of hardcoding "المجلس" in dozens of places that read wrong for a sole
   proprietorship (single owner, no board at all) or an LLC (managers' board, not "الإدارة"). */
function getGovernanceBodyLabel(){
  if(currentCompanyType === "مؤسسة فردية") return "المالك";
  if(currentCompanyType === "ذات مسؤولية محدودة"){
    if(currentCompanyLLCSingleOwner) return "المالك";
    if(currentCompanyLLCSingleManager) return "المدير";
    return "مجلس المديرين";
  }
  return "مجلس الإدارة";
}
function getGovernanceMemberLabel(){
  if(currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner) return "المالك";
  if(currentCompanyLLCSingleManager) return "المدير";
  return `أعضاء ${getGovernanceBodyLabel()}`;
}
// Swaps the literal "مجلس الإدارة" substring for the company-appropriate label wherever a
// stage name or generated sentence is actually DISPLAYED — internal comparisons/status values
// stay on the original canonical string so existing data and logic keep working unchanged.
function displayStageLabel(text){
  if(!text) return text;
  return text.replace(/مجلس الإدارة/g, getGovernanceBodyLabel());
}

async function getBoardApprovers(){
  const { data } = await sb.from("user_profiles").select("full_name,email,role,is_entity_rep,represented_entity")
    .eq("company_id", currentCompanyId).or("role.ilike.%مجلس%,role.eq.مدير النظام,role.in.(مالك,ممثل المالك)");
  return data || [];
}

/* ══════════ GOVERNANCE APPROVAL ENGINE (vote + sequential position-based signing) ══════════
   Two independent stages, both required: (1) board VOTES موافقة/رفض/اعتراض — any رفض halts the
   document; اعتراض is a recorded objection but doesn't block. (2) once voting clears, a STRICT,
   ORDERED chain of position-holders signs — nobody can sign out of turn, which is what makes
   "who's holding things up" traceable afterward. Reusable across document types (currently
   matrix; policies use the same engine later) via a per-company, per-type ordered role template. */
let workflowDraftRoles = [];
let currentWorkflowDocType = null;

function getMatrixCompanyName(){
  return document.getElementById("reportCompanyName1")?.textContent && document.getElementById("reportCompanyName1").textContent !== "—"
    ? document.getElementById("reportCompanyName1").textContent
    : (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent || "الشركة");
}

async function openWorkflowTemplateModal(docType){
  currentWorkflowDocType = docType;
  const label = docType === "matrix" ? "مصفوفة الصلاحيات" : (POLICY_WORKFLOW_LABELS[docType] || "السياسات");
  document.getElementById("wft-title").textContent = `⚙️ إعداد تسلسل التوقيع — ${label}`;
  const { data } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", docType).maybeSingle();
  workflowDraftRoles = (data && data.ordered_roles) ? [...data.ordered_roles] : [];
  renderWorkflowRolesList();
  document.getElementById("wft-new-role").value = "";
  openM("m-workflow-template");
}

function renderWorkflowRolesList(){
  const box = document.getElementById("wft-roles-list");
  if(workflowDraftRoles.length === 0){
    box.innerHTML = '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لم تُضف أي مناصب بعد.</div>';
    return;
  }
  box.innerHTML = workflowDraftRoles.map((role, i) => `<div style="display:flex;align-items:center;gap:8px;background:var(--offwhite);border-radius:8px;padding:8px 10px;margin-bottom:6px">
    <span style="background:var(--primary);color:#fff;font-weight:800;font-size:11px;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
    <span style="flex:1;font-size:12.5px">${role}</span>
    <button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer" onclick="moveWorkflowRole(${i},-1)" ${i===0?'disabled style="opacity:0.3"':''}>▲</button>
    <button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer" onclick="moveWorkflowRole(${i},1)" ${i===workflowDraftRoles.length-1?'disabled style="opacity:0.3"':''}>▼</button>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="removeWorkflowRole(${i})">حذف</button>
  </div>`).join("");
}

function addWorkflowRole(){
  const input = document.getElementById("wft-new-role");
  const role = input.value.trim();
  if(!role) return;
  workflowDraftRoles.push(role);
  input.value = "";
  renderWorkflowRolesList();
}

function removeWorkflowRole(i){ workflowDraftRoles.splice(i,1); renderWorkflowRolesList(); }
function moveWorkflowRole(i, dir){
  const j = i + dir;
  if(j < 0 || j >= workflowDraftRoles.length) return;
  [workflowDraftRoles[i], workflowDraftRoles[j]] = [workflowDraftRoles[j], workflowDraftRoles[i]];
  renderWorkflowRolesList();
}

async function saveWorkflowTemplate(){
  if(workflowDraftRoles.length === 0){ alert("أضف منصبًا واحدًا على الأقل"); return; }
  const { data: existing } = await sb.from("signing_workflow_templates").select("id").eq("company_id", currentCompanyId).eq("document_type", currentWorkflowDocType).maybeSingle();
  const payload = { company_id: currentCompanyId, document_type: currentWorkflowDocType, ordered_roles: workflowDraftRoles };
  const { error } = existing
    ? await sb.from("signing_workflow_templates").update(payload).eq("id", existing.id)
    : await sb.from("signing_workflow_templates").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم حفظ تسلسل التوقيع ✅");
  closeM("m-workflow-template");
}

/* ── Building the matrix content as a canvas page (reused for the voting snapshot AND the
   final signed PDF — same drawing code, signatures just get added once collected) ── */
async function buildMatrixCanvasPages(signaturesMap, orderedRoles){
  const [{ data: holders }, { data: items }, { data: cells }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}),
    sb.from("permission_cells").select("*").eq("company_id", currentCompanyId)
  ]);
  const cellMap = {};
  (cells||[]).forEach(c => { cellMap[c.item_id+'-'+c.holder_id] = c.code; });

  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw("مصفوفة الصلاحيات والمسؤوليات", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(6);
  b.wrapAndDraw(getMatrixCompanyName(), { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
  b.spacer(20);

  const byCategory = {};
  (items||[]).forEach(it => { (byCategory[it.category||"عام"] = byCategory[it.category||"عام"]||[]).push(it); });

  const tableW = b.W - b.margin*2;
  const wItem = tableW*0.34;
  const wHolder = (tableW - wItem) / Math.max(1,(holders||[]).length);
  const RM = b.W - b.margin;

  Object.entries(byCategory).forEach(([cat, catItems]) => {
    b.ensureSpace(30*b.scale);
    b.wrapAndDraw(cat, { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
    b.spacer(4);

    const xItemStart = RM - wItem;
    const holderBounds = (holders||[]).map((h,i) => ({ h, s: xItemStart - wHolder*(i+1), e: xItemStart - wHolder*i }));
    b.ensureSpace(26*b.scale);
    const headerH = 26*b.scale;
    b.ctx.strokeStyle="#333"; b.ctx.lineWidth=0.7*b.scale; b.ctx.font=`bold ${8.5*b.scale}px Tajawal, Arial`; b.ctx.textAlign="center";
    b.ctx.strokeRect(xItemStart, b.y, RM-xItemStart, headerH);
    b.ctx.fillText("البند", (xItemStart+RM)/2, b.y+17*b.scale);
    holderBounds.forEach(hb => { b.ctx.strokeRect(hb.s, b.y, hb.e-hb.s, headerH); const nm=(hb.h.name||"").length>10?hb.h.name.slice(0,10)+"…":hb.h.name; b.ctx.fillText(nm, (hb.s+hb.e)/2, b.y+17*b.scale); });
    b.y += headerH;

    b.ctx.font=`${8.5*b.scale}px Tajawal, Arial`;
    catItems.forEach(it => {
      b.ensureSpace(24*b.scale);
      const rowH = 24*b.scale;
      b.ctx.strokeRect(xItemStart, b.y, RM-xItemStart, rowH);
      b.ctx.textAlign="right";
      const txt = (it.item_name||"").length>34 ? it.item_name.slice(0,34)+"…" : (it.item_name||"");
      b.ctx.fillText(txt, RM-4*b.scale, b.y+rowH/2+3*b.scale);
      b.ctx.textAlign="center";
      holderBounds.forEach(hb => {
        b.ctx.strokeRect(hb.s, b.y, hb.e-hb.s, rowH);
        const code = cellMap[it.id+'-'+hb.h.id];
        if(code) b.ctx.fillText(code, (hb.s+hb.e)/2, b.y+rowH/2+3*b.scale);
      });
      b.y += rowH;
    });
    b.spacer(10);
  });

  // Signature block, in the mandated order, one per row
  if(orderedRoles && orderedRoles.length){
    b.spacer(20);
    b.wrapAndDraw("توقيعات الاعتماد", { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
    b.spacer(16);
    await b.preloadSignatures(signaturesMap);
    orderedRoles.forEach((role) => {
      b.ensureSpace(65*b.scale);
      b.drawSigSlot(role, (signaturesMap[role]&&signaturesMap[role].name)||"", b.W/2, b.y, signaturesMap);
      b.spacer(70);
    });
  }
  return b;
}

async function startGovernanceApproval(docType, refId){
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", docType).maybeSingle();
  if(!template || !template.ordered_roles || template.ordered_roles.length===0){
    alert(`لازم تحدد تسلسل التوقيع أولًا لهذا النوع (${POLICY_WORKFLOW_LABELS[docType]||docType}) — اضغط زر "⚙️ إعداد التسلسل" المطابق.`);
    return;
  }

  const isMatrix = docType === "matrix";
  // Policies skip the blanket "whole board votes first" gate — their approval IS the ordered
  // role sequence itself (e.g. مدير الموارد البشرية → الرئيس التنفيذي → مجلس الإدارة), with
  // board sign-off happening wherever it's placed in that sequence, not as a mandatory
  // separate step before it. The matrix keeps the board-wide vote, since it affects everyone.
  const skipVote = !isMatrix;
  if(!await uiConfirm(skipVote
    ? "سيبدأ هذا دورة اعتماد جديدة بالتسلسل المحدد بالمناصب (بدون تصويت عام مسبق). متابعة؟"
    : "سيبدأ هذا دورة اعتماد جديدة: تصويت المجلس أولًا، ثم توقيع تسلسلي بالمناصب المحددة. متابعة؟"
  )) return;

  const docLabel = isMatrix ? "مصفوفة الصلاحيات" : "سياسة";
  let b;
  if(isMatrix){
    b = await buildMatrixCanvasPages({}, null);
  } else {
    const policy = policiesCache.find(p => p.id === refId);
    if(!policy){ alert("تعذّر تحميل السياسة"); return; }
    b = await buildPolicyCanvasPages(policy, {}, null);
  }
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const snapshotUrl = await uploadBlobToStorage(blob, "governance-approvals", `${docLabel}-${Date.now()}.pdf`);
  if(!snapshotUrl) return;

  const { data: approval, error } = await sb.from("governance_approvals").insert([{
    company_id: currentCompanyId, document_type: docType, document_ref_id: refId,
    document_snapshot_url: snapshotUrl, status: skipVote ? "قيد الاعتماد" : "قيد التصويت"
  }]).select().single();
  if(error){ alert("تعذّر بدء الدورة: " + error.message); return; }

  if(skipVote){
    await notifyGovernanceSigningTurn(approval.id, docType, template.ordered_roles[0], docLabel, "اعتماد");
    alert(`تم بدء دورة الاعتماد ✅ — أول من يعتمد بالتسلسل: ${template.ordered_roles[0]}. التوقيع الرسمي يبدأ فقط بعد ما يوافق الجميع.`);
  } else {
    const board = await getBoardApprovers();
    for(const b2 of board){
      await sendNotificationEmail(b2.email, `🗳️ طلب تصويت — ${docLabel}`,
        `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2><span class="ico-i ico-ballot"></span>طلب تصويت</h2><p>مطلوب تصويتك على ${docLabel} المحدثة. ادخل المنصة لتسجيل تصويتك.</p></div>`);
    }
    alert("تم بدء دورة الاعتماد ✅ — أُرسل طلب تصويت لأعضاء المجلس.");
  }
  loadMatrixApprovalStatus();
}

/* Best-effort email to whoever holds the role currently up — used for both phases (اعتماد /
   توقيع), matched by role text since ordered_roles are free-typed role names, same convention
   used elsewhere. Silently does nothing if nobody with that exact role is found; the in-app
   approval screen still shows whose turn it is regardless. */
async function notifyGovernanceSigningTurn(approvalId, docType, roleName, docLabel, phase){
  if(!roleName) return;
  const { data: holders } = await sb.from("user_profiles").select("full_name,email,role").eq("company_id", currentCompanyId).eq("role", roleName);
  const isApproval = phase === "اعتماد";
  for(const h of (holders||[])){
    await sendNotificationEmail(h.email, `${isApproval?'✅ دورك للاعتماد':'✍️ دورك للتوقيع'} — ${docLabel}`,
      `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2>${isApproval?'✅ دورك للاعتماد':'✍️ دورك للتوقيع الإلكتروني'}</h2><p>وصل الدور لمنصبكم (${roleName}) لـ${isApproval?'اعتماد':'توقيع'} ${docLabel}. ادخل المنصة لمراجعتها و${isApproval?'اعتمادها':'توقيعها'}.</p></div>`);
  }
}

async function loadMatrixApprovalStatus(){
  const box = document.getElementById("matrixApprovalStatus");
  if(!box) return;
  const { data: approvals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).eq("document_type","matrix").order("created_at",{ascending:false}).limit(1);
  const current = (approvals||[])[0];
  if(!current || current.status === "مكتملة" || current.status === "مرفوضة"){
    box.innerHTML = current ? `<div style="font-size:11.5px;color:${current.status==='مكتملة'?'var(--green)':'var(--red)'}">آخر دورة اعتماد: ${current.status}. <span style="cursor:pointer;text-decoration:underline;color:var(--primary)" onclick="openGovernanceApprovalModal(${current.id})">عرض التفاصيل</span></div>` : "";
    return;
  }
  box.innerHTML = `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--gold);cursor:pointer" onclick="openGovernanceApprovalModal(${current.id})">
    🟡 دورة اعتماد جارية — الحالة: <b>${current.status}</b> — اضغط لعرض التفاصيل والمشاركة
  </div>`;
}

async function openGovernanceApprovalModal(approvalId){
  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
  if(!approval){ alert("تعذّر تحميل الدورة"); return; }
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const [{ data: votes }, { data: allSteps }] = await Promise.all([
    sb.from("governance_votes").select("*").eq("approval_id", approvalId),
    sb.from("governance_signatures").select("*").eq("approval_id", approvalId).order("order_position",{ascending:true})
  ]);
  const approvalSteps = (allSteps||[]).filter(s => s.phase === "اعتماد");
  const sigs = (allSteps||[]).filter(s => s.phase !== "اعتماد"); // "توقيع" — also covers pre-existing rows with no phase set
  const board = await getBoardApprovers();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;
  const myVote = (votes||[]).find(v => v.voter_email === myEmail);
  const isMatrix = approval.document_type === "matrix";
  // The role that actually gates action buttons below — must match the step's required role
  // exactly (or be مدير النظام, who can unblock a stuck cycle). Sequence position alone isn't
  // enough: without this, anyone who simply opens the modal could act on someone else's step.
  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : (getCurrentRole()||"");
  const canActAsRole = (stepRole) => myRawRole === stepRole || myRawRole === "مدير النظام";

  document.getElementById("ga-title").textContent = `دورة اعتماد — ${isMatrix?'مصفوفة الصلاحيات':'سياسة'}`;
  const body = document.getElementById("ga-body");

  let html = `<div class="sec-title" style="font-size:13px"><span class="ico-i ico-document"></span>نسخة الوثيقة</div>
    <a href="${approval.document_snapshot_url}" target="_blank" style="font-size:12px;color:var(--primary);font-weight:700"><span class="ico-i ico-document"></span>عرض النسخة الحالية (PDF)</a>`;

  // Board-wide vote — matrix only. Policies skip straight to the ordered approval chain below.
  if(isMatrix){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-ballot"></span>التصويت (${(votes||[]).length}/${board.length})</div>`;
    html += `<div style="margin-bottom:10px">${(votes||[]).map(v => `<div style="font-size:11.5px;padding:4px 0">
      <b>${orgEsc(v.voter_name||v.voter_email)}</b> — <span style="color:${v.decision==='موافقة'?'var(--green)':v.decision==='رفض'?'var(--red)':'var(--gold)'};font-weight:700">${orgEsc(v.decision)}</span>
      ${v.notes?` — <span style="color:var(--gray3)">${orgEsc(v.notes)}</span>`:""}
    </div>`).join("") || '<div style="font-size:11px;color:var(--gray3)">لا توجد أصوات بعد.</div>'}</div>`;

    if(approval.status === "قيد التصويت" && !myVote && board.some(b2=>b2.email===myEmail)){
      html += `<div class="card"><div class="card-body">
        <textarea class="fi" id="ga-vote-notes" rows="2" placeholder="ملاحظاتك (اختياري، خصوصًا عند الاعتراض)"></textarea>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn-xs" style="flex:1;background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'موافقة')"><span class="ico-i ico-check"></span>موافقة</button>
          <button class="btn-xs" style="flex:1;background:#FEF3E2;color:var(--gold);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'اعتراض')"><span class="ico-i ico-warning"></span>اعتراض (مع ملاحظات)</button>
          <button class="btn-xs" style="flex:1;background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'رفض')"><span class="ico-i ico-xcircle"></span>رفض</button>
        </div>
      </div></div>`;
    }
  }

  if(approval.status === "مرفوضة"){
    html += `<div style="background:#FDE8E8;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;color:var(--red);font-weight:700"><span class="ico-i ico-xcircle"></span>رُفضت الوثيقة — لم تنتقل لمرحلة التوقيع.</div>`;
  }

  // Phase 1 — الاعتماد: everyone in the chain must agree, in order, before anyone signs
  // anything. This is a lightweight decision (no signature), and it's a hard gate: one
  // rejection halts the whole cycle before it ever reaches formal signing.
  if(["قيد الاعتماد","قيد التوقيع","مكتملة"].includes(approval.status) && template){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-check"></span>مرحلة الاعتماد (بالترتيب)</div>`;
    template.ordered_roles.forEach((role, i) => {
      const step = approvalSteps.find(s => s.role === role);
      const prevApproved = i === 0 || approvalSteps.some(s => s.role === template.ordered_roles[i-1] && s.decision === "موافقة");
      const isMyTurn = !step && prevApproved && approval.status === "قيد الاعتماد" && canActAsRole(role);
      html += `<div style="display:flex;align-items:center;gap:10px;background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:6px">
        <span style="background:${step?(step.decision==='موافقة'?'var(--green)':'var(--red)'):isMyTurn?'var(--gold)':'var(--gray2)'};color:#fff;font-weight:800;font-size:11px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${role}</div>
          ${step ? `<div style="font-size:10.5px;color:${step.decision==='موافقة'?'var(--green)':'var(--red)'}">${step.decision==='موافقة'?'✅ وافق':'❌ رفض'}: ${orgEsc(step.signer_name)} — ${new Date(step.signed_at).toLocaleString('ar-SA-u-ca-gregory')}</div>`
            : isMyTurn ? `<div style="font-size:10.5px;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار قرارك</div>`
            : `<div style="font-size:10.5px;color:var(--gray3)">⏳ بانتظار دور المنصب السابق</div>`}
        </div>
        ${isMyTurn ? `<div style="display:flex;gap:5px">
            <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 10px;cursor:pointer" onclick="castGovernanceApprovalStep(${approvalId},'${role.replace(/'/g,"")}','موافقة')">موافقة</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 10px;cursor:pointer" onclick="castGovernanceApprovalStep(${approvalId},'${role.replace(/'/g,"")}','رفض')">رفض</button>
          </div>` : ""}
      </div>`;
    });
  }

  // Phase 2 — التوقيع: only reachable once every role above has approved. Same ordered
  // sequence, now with an actual signature.
  if(["قيد التوقيع","مكتملة"].includes(approval.status) && template){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-signature"></span>مرحلة التوقيع الإلكتروني (بعد اكتمال الاعتماد)</div>`;
    template.ordered_roles.forEach((role, i) => {
      const sig = (sigs||[]).find(s => s.role === role);
      const prevSigned = i === 0 || (sigs||[]).some(s => s.role === template.ordered_roles[i-1]);
      const isMyTurn = !sig && prevSigned && canActAsRole(role);
      const daysWaiting = (!sig && prevSigned) ? Math.floor((Date.now() - new Date((sigs||[]).find(s=>s.role===template.ordered_roles[i-1])?.signed_at || approval.created_at).getTime())/86400000) : 0;
      html += `<div style="display:flex;align-items:center;gap:10px;background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:6px">
        <span style="background:${sig?'var(--green)':isMyTurn?'var(--gold)':'var(--gray2)'};color:#fff;font-weight:800;font-size:11px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${role}</div>
          ${sig ? `<div style="font-size:10.5px;color:var(--green)"><span class="ico-i ico-check"></span>وقّع: ${orgEsc(sig.signer_name)} — ${new Date(sig.signed_at).toLocaleString('ar-SA-u-ca-gregory')}</div>`
            : isMyTurn ? `<div style="font-size:10.5px;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار التوقيع${daysWaiting>2?` — متأخر ${daysWaiting} يوم`:''}</div>`
            : `<div style="font-size:10.5px;color:var(--gray3)">⏳ بانتظار دور المنصب السابق</div>`}
        </div>
        ${isMyTurn ? `<button class="btn-xs gold" onclick="openGovernanceSignModal(${approvalId},'${role.replace(/'/g,"")}')">توقيع</button>` : ""}
      </div>`;
    });
  }

  if(approval.status === "مكتملة"){
    html += `<div style="background:#E8F8EF;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-check"></span>اكتملت الدورة — كل التوقيعات مجمّعة بالوثيقة النهائية.</div>`;
  }

  body.innerHTML = html;
  openM("m-governance-approval");
}

/* Phase 1 decision (no signature) — one rejection halts the whole cycle immediately.
   Once every ordered role has approved, the cycle auto-advances to "قيد التوقيع" and the
   first signer is notified — signing never starts before approval is unanimous. */
async function castGovernanceApprovalStep(approvalId, role, decision){
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : "";
  if(myRawRole !== role && myRawRole !== "مدير النظام"){
    alert(`هذي الخطوة مخصّصة لمنصب "${role}" — دورك الحالي "${myRawRole||"غير محدد"}" ما يملك صلاحية اعتمادها.`);
    return;
  }
  const { error } = await sb.from("governance_signatures").insert([{
    approval_id: approvalId, role, order_position: -1, phase: "اعتماد", decision,
    signer_name: currentUserProfile?currentUserProfile.full_name:email, signer_email: email, signed_at: new Date().toISOString()
  }]);
  if(error){ alert("تعذّر تسجيل قرارك: " + error.message); return; }

  if(decision === "رفض"){
    await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
    alert("تم تسجيل الرفض — توقفت دورة الاعتماد. ❌");
    openGovernanceApprovalModal(approvalId);
    return;
  }

  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const { data: steps } = await sb.from("governance_signatures").select("*").eq("approval_id", approvalId).eq("phase","اعتماد");
  const allApproved = template.ordered_roles.every(r => (steps||[]).some(s => s.role === r && s.decision === "موافقة"));

  if(allApproved){
    await sb.from("governance_approvals").update({ status: "قيد التوقيع" }).eq("id", approvalId);
    const docLabel = approval.document_type === "matrix" ? "مصفوفة الصلاحيات" : "سياسة";
    await notifyGovernanceSigningTurn(approvalId, approval.document_type, template.ordered_roles[0], docLabel, "توقيع");
    alert("تم اعتماد آخر دور بالتسلسل ✅ — بدأت الآن مرحلة التوقيع الإلكتروني الرسمي.");
  } else {
    const idx = template.ordered_roles.indexOf(role);
    const nextRole = template.ordered_roles[idx+1];
    const docLabel = approval.document_type === "matrix" ? "مصفوفة الصلاحيات" : "سياسة";
    if(nextRole) await notifyGovernanceSigningTurn(approvalId, approval.document_type, nextRole, docLabel, "اعتماد");
    alert("تم تسجيل موافقتك ✅");
  }
  openGovernanceApprovalModal(approvalId);
}

async function castGovernanceVote(approvalId, decision){
  const notes = document.getElementById("ga-vote-notes")?.value.trim() || "";
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const { error } = await sb.from("governance_votes").insert([{
    approval_id: approvalId, voter_email: email, voter_name: currentUserProfile?currentUserProfile.full_name:email, decision, notes
  }]);
  if(error){ alert("تعذّر تسجيل تصويتك: " + error.message); return; }

  if(decision === "رفض"){
    await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
  } else {
    const board = await getBoardApprovers();
    const { data: votes } = await sb.from("governance_votes").select("*").eq("approval_id", approvalId);
    const anyReject = (votes||[]).some(v => v.decision === "رفض");
    if(anyReject){
      await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
    } else if((votes||[]).length >= board.length){
      // Voting cleared — move to sequential signing, seeding an empty ordered row per role.
      const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
      const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
      await sb.from("governance_approvals").update({ status: "قيد التوقيع" }).eq("id", approvalId);
      // governance_signatures rows are created lazily at signing time (not pre-seeded), so no
      // insert needed here — openGovernanceApprovalModal derives sequence state from what
      // exists vs. the template's ordered_roles list.
    }
  }
  alert("تم تسجيل تصويتك ✅");
  openGovernanceApprovalModal(approvalId);
  loadMatrixApprovalStatus();
}

let govSigPadCtx = null, govSigPadDrawing = false, currentGovSignApprovalId = null, currentGovSignRole = null;

function openGovernanceSignModal(approvalId, role){
  currentGovSignApprovalId = approvalId; currentGovSignRole = role;
  document.getElementById("gs-info").innerHTML = `<b>توقّع بصفتك:</b> ${role}`;
  openM("m-governance-sign");
  setTimeout(initGovSigPad, 50);
}

function initGovSigPad(){
  const canvas = document.getElementById("govSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  govSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); govSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!govSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { govSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("govSigCanvas");
}

function clearGovSigPad(){
  if(!govSigPadCtx) return;
  const canvas = document.getElementById("govSigCanvas");
  govSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isGovSigPadEmpty(){
  const canvas = document.getElementById("govSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

async function confirmGovernanceSignature(){
  if(isGovSigPadEmpty()){ alert("الرجاء رسم التوقيع أولًا"); return; }
  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", currentGovSignApprovalId).single();
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const orderedRoles = template.ordered_roles;
  const orderPos = orderedRoles.indexOf(currentGovSignRole);

  // Re-verify sequence server-side-equivalent (not just trusting the UI state) before writing.
  // Only look at actual SIGNING-phase rows — the ordered اعتماد decisions live in the same
  // table but must never be mistaken for a signature here.
  const { data: existingSigs } = await sb.from("governance_signatures").select("role").eq("approval_id", currentGovSignApprovalId).eq("phase","توقيع");
  const signedRoles = (existingSigs||[]).map(s=>s.role);
  if(orderPos > 0 && !signedRoles.includes(orderedRoles[orderPos-1])){
    alert(`لا يمكنك التوقيع الآن — بانتظار توقيع "${orderedRoles[orderPos-1]}" أولًا.`);
    return;
  }
  if(signedRoles.includes(currentGovSignRole)){ alert("هذا المنصب وقّع مسبقًا"); return; }

  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : "";
  if(myRawRole !== currentGovSignRole && myRawRole !== "مدير النظام"){
    alert(`هذا التوقيع مخصّص لمنصب "${currentGovSignRole}" — دورك الحالي "${myRawRole||"غير محدد"}" ما يملك صلاحية توقيعه.`);
    return;
  }

  if(!(await lockFirstSignature("govSigCanvas"))) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const signature_image = document.getElementById("govSigCanvas").toDataURL("image/png");
  const { error } = await sb.from("governance_signatures").insert([{
    approval_id: currentGovSignApprovalId, role: currentGovSignRole, order_position: orderPos, phase: "توقيع",
    signer_name: currentUserProfile?currentUserProfile.full_name:email, signer_email: email,
    signature_image, signed_at: new Date().toISOString()
  }]);
  if(error){ alert("تعذّر حفظ التوقيع: " + error.message); return; }

  closeM("m-governance-sign");
  alert("⏳ جارِ دمج توقيعك بالوثيقة...");

  // Regenerate the full document with every collected signature embedded at its slot.
  const { data: allSigs } = await sb.from("governance_signatures").select("*").eq("approval_id", currentGovSignApprovalId).eq("phase","توقيع");
  const signaturesMap = {};
  (allSigs||[]).forEach(s => { signaturesMap[s.role] = { name: s.signer_name, image: s.signature_image }; });
  const isMatrix = approval.document_type === "matrix";
  let policyForRegen = null;
  if(!isMatrix){
    policyForRegen = policiesCache.find(p=>p.id===approval.document_ref_id);
    if(!policyForRegen){
      const { data: fetchedPolicy } = await sb.from("policies").select("*").eq("id", approval.document_ref_id).single();
      policyForRegen = fetchedPolicy || {};
    }
  }
  const b = isMatrix
    ? await buildMatrixCanvasPages(signaturesMap, orderedRoles)
    : await buildPolicyCanvasPages(policyForRegen, signaturesMap, orderedRoles);
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const newUrl = await uploadBlobToStorage(blob, "governance-approvals", `${isMatrix?'مصفوفة-صلاحيات':'سياسة'}-موقّعة-${Date.now()}.pdf`);

  const allSigned = orderedRoles.every(r => signaturesMap[r]);
  await sb.from("governance_approvals").update({
    document_snapshot_url: newUrl || approval.document_snapshot_url,
    status: allSigned ? "مكتملة" : "قيد التوقيع"
  }).eq("id", currentGovSignApprovalId);

  // Close the loop with the policy record itself: once every position in the chain has
  // signed, the policy is formally "معتمدة نهائيًا" and its actual approval date is set now
  // — not guessed at creation time. Otherwise, nudge whoever's turn is next.
  if(!isMatrix && policyForRegen && policyForRegen.id){
    if(allSigned){
      await sb.from("policies").update({ status: "معتمدة نهائيًا", approval_date: new Date().toISOString().slice(0,10), file_url: newUrl || policyForRegen.file_url }).eq("id", policyForRegen.id);
    } else {
      const nextRole = orderedRoles[orderPos+1];
      if(nextRole) await notifyGovernanceSigningTurn(currentGovSignApprovalId, approval.document_type, nextRole, "سياسة");
    }
  }

  alert(allSigned ? "تم دمج توقيعك — واكتملت دورة الاعتماد بالكامل ✅" : "تم دمج توقيعك ✅ — بانتظار باقي المناصب.");
  openGovernanceApprovalModal(currentGovSignApprovalId);
  loadMatrixApprovalStatus();
}

async function requestBoardApproval(type){
  const isMatrix = type === "matrix";
  const title = isMatrix ? "طلب موافقة على مصفوفة الصلاحيات" : "طلب موافقة على الهيكل التنظيمي";
  if(!await uiConfirm(`سيتم توليد نسخة PDF من ${isMatrix?"مصفوفة الصلاحيات":"الهيكل التنظيمي"} الحالية وإرسال طلب موافقة لـ${getGovernanceMemberLabel()}. متابعة؟`)) return;

  const board = await getBoardApprovers();
  if(board.length === 0){ alert("لا يوجد أعضاء مجلس مسجّلين لديهم حساب بالمنصة — أضفهم أولًا من صفحة إدارة الصلاحيات."); return; }

  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");

  const reqMeta = await orgPdfMeta(type);
  let bodyContent = "";
  if(isMatrix){
    await loadPermissionsMatrix();
    const table = document.getElementById("permMatrixTable");
    if(!table){ alert("تعذّر تحميل مصفوفة الصلاحيات."); return; }
    const clone = permPrintableTable(table);
    clone.querySelectorAll("th,td").forEach(c => { c.style.border = "1px solid #ccc"; c.style.padding = "6px"; c.style.fontSize = "11px"; });
    clone.style.cssText = "width:100%;border-collapse:collapse";
    bodyContent = clone.outerHTML;
  } else {
    const container = document.getElementById("orgTreeContainer");
    if(!container || !container.innerHTML.trim()){ alert("لا توجد شجرة هيكل تنظيمي لتصديرها."); return; }
    const treeRowsForPdf = orgTreeRows(structureCache);
    bodyContent = renderOrgTree(treeRowsForPdf, { static:true });
  }

  const boardListHtml = board.map(b => `<tr>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.full_name||b.email||"")}</td>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.role||"")}${b.is_entity_rep && b.represented_entity ? " — ممثل " + orgEsc(b.represented_entity) : ""}</td>
    <td style="border:1px solid #ccc;padding:6px;width:130px"></td>
  </tr>`).join("");

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;padding:20px;color:#0D2447;background:#fff";
  wrapper.innerHTML = `
    <h1 style="color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px">${orgEsc(title)} — ${orgEsc(reqMeta.companyName)}</h1>
    ${approvalHeaderHTML(Object.assign({}, reqMeta, { approved:false, dateTitle:"تاريخ الطلب", dateLabel:dateNow, approvers:[] }), orgEsc, (reqMeta.count + 1) + ".0 (قيد الاعتماد)")}
    <div style="overflow-x:auto;margin:16px 0">${bodyContent}</div>
    <h3 style="color:#1A3A6B;margin-top:24px">${getGovernanceMemberLabel()} المطلوب موافقتهم</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الاسم</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الصفة</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">التوقيع</th>
      </tr></thead>
      <tbody>${boardListHtml}</tbody>
    </table>`;
  pdfHostAdd(wrapper, 794);
  let pdfBlob;
  try{
    pdfBlob = await html2pdf().from(wrapper).set({ margin: 10, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] } }).outputPdf("blob");
  }catch(e){
    pdfHostRemove(wrapper);
    alert("تعذّر توليد ملف PDF: " + e.message);
    return;
  }
  pdfHostRemove(wrapper);

  const fileUrl = await uploadBlobToStorage(pdfBlob, "approvals", (isMatrix?"permissions-matrix":"org-structure")+".pdf");
  if(!fileUrl) return;

  const fullTitle = title + " — " + companyName + " — " + dateNow;
  const { error } = await sb.from("approval_requests").insert([{
    company_id: currentCompanyId, request_type: type, title: fullTitle,
    requested_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", pdf_url: fileUrl
  }]);
  if(error){ alert("تعذّر إنشاء طلب الموافقة: " + error.message); return; }

  logActivity("إنشاء", "طلب موافقة", fullTitle, `أُرسل لـ${board.length} عضو مجلس`);
  alert("تم إرسال طلب الموافقة لـ" + getGovernanceMemberLabel() + " ✅");
  renderApprovalStatus(type, isMatrix ? "matrixApprovalStatus" : "structureApprovalStatus");
  checkPendingApprovalBadges();
}

async function requestCharterApproval(){
  const committeeId = Number(document.getElementById("mch-committee-id").value);
  const c = committeesCache.find(x => x.id === committeeId);
  if(!c){ alert("تعذّر تحديد اللجنة"); return; }
  if(!c.charter_purpose && !c.charter_authorities && !c.charter_composition){
    if(!await uiConfirm("لم تحفظ الميثاق بعد — هل تريد المتابعة بطلب الموافقة على آخر نسخة محفوظة على أي حال؟")) return;
  }
  if(!await uiConfirm(`سيتم توليد نسخة PDF من ميثاق "${c.committee_name}" وإرسال طلب موافقة لـ${getGovernanceMemberLabel()}. متابعة؟`)) return;

  const board = await getBoardApprovers();
  if(board.length === 0){ alert("لا يوجد أعضاء مجلس مسجّلين لديهم حساب بالمنصة."); return; }

  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const title = `طلب موافقة على ميثاق لجنة ${c.committee_name}`;

  const boardListHtml = board.map(b => `<tr>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.full_name||b.email||"")}</td>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.role||"")}${b.is_entity_rep && b.represented_entity ? " — ممثل " + orgEsc(b.represented_entity) : ""}</td>
    <td style="border:1px solid #ccc;padding:6px;width:130px"></td>
  </tr>`).join("");

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;padding:20px;color:#0D2447;background:#fff";
  wrapper.innerHTML = `
    <h1 style="color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px">${orgEsc(title)} — ${orgEsc(companyName)}</h1>
    <p><b>تاريخ الطلب:</b> ${dateNow}</p>
    <h3 style="color:#1A3A6B;margin-top:20px">الغرض والهدف من اللجنة</h3><p>${orgEsc(c.charter_purpose||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">الاختصاصات والصلاحيات</h3><p>${orgEsc(c.charter_authorities||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">التشكيل وعضوية اللجنة</h3><p>${orgEsc(c.charter_composition||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">تنظيم الاجتماعات</h3><p>${orgEsc(c.charter_meetings_rules||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">آلية رفع التقارير لمجلس الإدارة</h3><p>${orgEsc(c.charter_reporting||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:24px">${getGovernanceMemberLabel()} المطلوب موافقتهم</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الاسم</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الصفة</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">التوقيع</th>
      </tr></thead>
      <tbody>${boardListHtml}</tbody>
    </table>`;
  pdfHostAdd(wrapper, 794);
  let pdfBlob;
  try{
    pdfBlob = await html2pdf().from(wrapper).set({ margin: 10, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] } }).outputPdf("blob");
  }catch(e){
    pdfHostRemove(wrapper);
    alert("تعذّر توليد ملف PDF: " + e.message);
    return;
  }
  pdfHostRemove(wrapper);

  const fileUrl = await uploadBlobToStorage(pdfBlob, "approvals", "committee-charter.pdf");
  if(!fileUrl) return;

  const fullTitle = title + " — " + companyName + " — " + dateNow;
  const { error } = await sb.from("approval_requests").insert([{
    company_id: currentCompanyId, request_type: "charter", committee_id: committeeId, title: fullTitle,
    requested_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", pdf_url: fileUrl
  }]);
  if(error){ alert("تعذّر إنشاء طلب الموافقة: " + error.message); return; }

  logActivity("إنشاء", "طلب موافقة", fullTitle, `أُرسل لـ${board.length} عضو مجلس`);
  alert("تم إرسال طلب الموافقة لـ" + getGovernanceMemberLabel() + " ✅");
  renderCharterApprovalStatus(committeeId);
  loadCommittees();
}

async function renderCharterApprovalStatus(committeeId){
  const box = document.getElementById("charterApprovalStatus");
  if(!box) return;
  const { data: reqs } = await sb.from("approval_requests").select("*").eq("company_id", currentCompanyId).eq("request_type", "charter").eq("committee_id", committeeId).order("created_at",{ascending:false}).limit(1);
  if(!reqs || reqs.length === 0){ box.innerHTML = ""; return; }
  const req = reqs[0];
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", req.id);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const totalBoard = board.length;
  const votedCount = board.filter(b => votedEmails.has((b.email||"").toLowerCase())).length;

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  const iAlreadyVoted = votedEmails.has((myEmail||"").toLowerCase());
  const amIBoardMember = board.some(b => (b.email||"").toLowerCase() === (myEmail||"").toLowerCase());

  if(req.status === "معتمد"){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:8px;padding:10px;font-size:11.5px"><span class="ico-i ico-check"></span>تمت موافقة ${getGovernanceBodyLabel()} على هذا الميثاق بتاريخ ${req.approved_at?new Date(req.approved_at).toLocaleDateString('ar-SA-u-ca-gregory'):"—"} — انتقل تلقائيًا للتوقيع الإلكتروني.</div>`;
    return;
  }
  box.innerHTML = `<div style="background:#FEF3E2;border-radius:8px;padding:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:6px">
      <b style="color:#8B6F1F">⏳ بانتظار موافقة ${getGovernanceBodyLabel()} (${votedCount}/${totalBoard})</b>
      <button class="btn-xs" style="background:#E8F0FA;color:var(--primary);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="sendApprovalReminder(${req.id})"><span class="ico-i ico-warning"></span>تذكير</button>
    </div>
    ${amIBoardMember && !iAlreadyVoted ? `<button class="btn btn-gold" style="width:100%;font-size:11px;padding:6px" onclick="castApprovalVote(${req.id})"><span class="ico-i ico-check"></span>الموافقة على هذا الميثاق</button>` : ""}
    ${amIBoardMember && iAlreadyVoted ? `<div style="text-align:center;color:var(--green);font-size:11px"><span class="ico-i ico-check"></span>لقد وافقت بالفعل</div>` : ""}
  </div>`;
}

function refreshApprovalButtonLabels(){
  const label = "اعتماد " + getGovernanceBodyLabel();
  ["approvalBtnStructure","approvalBtnMatrix","approvalBtnCharter"].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) btn.innerHTML = `<span class="ico-i ico-upload"></span>${label}`;
  });
}

async function checkPendingApprovalBadges(){
  refreshApprovalButtonLabels();
  if(!currentCompanyId) return;
  const { data: pending } = await sb.from("approval_requests").select("request_type").eq("company_id", currentCompanyId).eq("status", "قيد المراجعة");
  const counts = { structure: 0, matrix: 0 };
  (pending||[]).forEach(r => { if(counts[r.request_type] !== undefined) counts[r.request_type]++; });

  const structBadge = document.getElementById("structureNavBadge");
  if(structBadge){ structBadge.style.display = counts.structure > 0 ? "inline-block" : "none"; structBadge.textContent = counts.structure; }
  const permBadge = document.getElementById("permissionsNavBadge");
  if(permBadge){ permBadge.style.display = counts.matrix > 0 ? "inline-block" : "none"; permBadge.textContent = counts.matrix; }
}

async function renderApprovalStatus(type, containerId){
  const box = document.getElementById(containerId);
  if(!box) return;
  const { data: reqs } = await sb.from("approval_requests").select("*").eq("company_id", currentCompanyId).eq("request_type", type).order("created_at",{ascending:false}).limit(1);
  if(!reqs || reqs.length === 0){ box.innerHTML = ""; return; }
  const req = reqs[0];
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", req.id);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const totalBoard = board.length;
  const votedCount = board.filter(b => votedEmails.has((b.email||"").toLowerCase())).length;

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  const iAlreadyVoted = votedEmails.has((myEmail||"").toLowerCase());
  const amIBoardMember = board.some(b => (b.email||"").toLowerCase() === (myEmail||"").toLowerCase());

  if(req.status === "معتمد"){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="font-size:12.5px"><b style="color:var(--green)"><span class="ico-i ico-check"></span>تمت موافقة ${getGovernanceBodyLabel()}</b> بتاريخ ${req.approved_at?new Date(req.approved_at).toLocaleDateString('ar-SA-u-ca-gregory'):"—"} — انتقل الملف تلقائيًا لصفحة التوقيع الإلكتروني.</div>
      <a href="${req.pdf_url}" target="_blank" class="btn-xs primary" style="text-decoration:none"><span class="ico-i ico-document"></span>عرض الملف</a>
    </div>`;
    return;
  }

  box.innerHTML = `<div style="background:#FEF3E2;border-radius:10px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <b style="color:#8B6F1F;font-size:12.5px">⏳ بانتظار موافقة ${getGovernanceBodyLabel()} (${votedCount}/${totalBoard})</b>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F0FA;color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="sendApprovalReminder(${req.id})"><span class="ico-i ico-warning"></span>تذكير</button>
        <a href="${req.pdf_url}" target="_blank" class="btn-xs primary" style="text-decoration:none"><span class="ico-i ico-document"></span>عرض الملف</a>
      </div>
    </div>
    ${amIBoardMember && !iAlreadyVoted ? `<button class="btn btn-gold" style="width:100%" onclick="castApprovalVote(${req.id})"><span class="ico-i ico-check"></span>الموافقة على هذا الطلب</button>` : ""}
    ${amIBoardMember && iAlreadyVoted ? `<div style="text-align:center;color:var(--green);font-size:12px"><span class="ico-i ico-check"></span>لقد وافقت بالفعل — بانتظار بقية الأعضاء</div>` : ""}
  </div>`;
}

async function sendApprovalReminder(requestId){
  const { data: req } = await sb.from("approval_requests").select("*").eq("id", requestId).single();
  if(!req){ alert("تعذّر تحديد الطلب"); return; }
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", requestId);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const pending = board.filter(b => b.email && !votedEmails.has(b.email.toLowerCase()));
  if(pending.length === 0){ alert("كل الأعضاء وافقوا بالفعل ✅"); return; }

  const subject = `تذكير موافقة: ${req.title}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-upload"></span>تذكير بطلب موافقة معلّق</h2>
      <p><b>الطلب:</b> ${orgEsc(req.title)}</p>
      <p>الرجاء الدخول للمنصة ومراجعة الطلب والموافقة عليه.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(pending.map(t => ({ email: t.email })), subject, html, "تذكير موافقة");
  logActivity("إنشاء", "تذكير موافقة", req.title, `أُرسل لـ${pending.length} عضو لم يوافقوا بعد`);

  const text = `📤 *تذكير بطلب موافقة معلّق*\n\n*${req.title}*\n\nالرجاء الدخول للمنصة ومراجعته والموافقة عليه.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, pending.map(t => t.email));
}

async function castApprovalVote(requestId){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  if(!myEmail) return;
  const { error } = await sb.from("approval_votes").insert([{
    request_id: requestId, reviewer_email: myEmail,
    reviewer_name: currentUserProfile ? currentUserProfile.full_name : myEmail, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر تسجيل موافقتك: " + error.message); return; }

  const { data: req } = await sb.from("approval_requests").select("*").eq("id", requestId).single();
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", requestId);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const allVoted = board.length > 0 && board.every(b => votedEmails.has((b.email||"").toLowerCase()));

  if(allVoted && req.status !== "معتمد"){
    await sb.from("approval_requests").update({ status: "معتمد", approved_at: new Date().toISOString() }).eq("id", requestId);
    const docTypeLabel = req.request_type === "matrix" ? "موافقة مجلس — مصفوفة صلاحيات"
      : req.request_type === "structure" ? "موافقة مجلس — هيكل تنظيمي"
      : "موافقة مجلس — ميثاق لجنة";
    await sb.from("signing_documents").insert([{
      document_name: req.title, doc_type: docTypeLabel,
      signers_total: board.length, signers_done: 0, status: "قيد التوقيع", file_url: req.pdf_url, company_id: currentCompanyId
    }]);
    logActivity("موافقة", "طلب موافقة", req.title, "اكتملت موافقة " + getGovernanceBodyLabel() + " — انتقل تلقائيًا للتوقيع الإلكتروني");
    alert("🎉 اكتملت موافقة جميع " + getGovernanceMemberLabel() + " ! تم نقل الملف تلقائيًا لصفحة التوقيع الإلكتروني.");
  } else {
    alert("تم تسجيل موافقتك ✅");
  }
  if(req.request_type === "charter") renderCharterApprovalStatus(req.committee_id);
  else renderApprovalStatus(req.request_type, req.request_type === "matrix" ? "matrixApprovalStatus" : "structureApprovalStatus");
  checkPendingApprovalBadges();
}
