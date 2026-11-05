/* ══════════ POLICY GOVERNANCE WORKFLOW (reuses the same sequential-sign engine) ══════════
   Every real policy category (the 8 in POLICY_CATEGORY_ICONS) gets its own fully independent,
   admin-configurable approval sequence — not 4 broad buckets that silently override each
   other. A policy's docType is derived directly from its own category, so what you configure
   for "سياسة المشتريات" only ever applies to سياسة المشتريات policies. */
function openPolicyWorkflowPicker(){
  const box = document.getElementById("policyWorkflowCategoryList");
  box.innerHTML = getPolicyCategoriesForCompany().map(cat => [cat, POLICY_CATEGORY_ICONS[cat] || "📁"]).map(([cat, icon]) =>
    `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px;text-align:right" onclick="closeM('m-policy-workflow-picker');openWorkflowTemplateModal('${policyCategoryToDocType(cat)}')">${icon} ${cat}</button>`
  ).join("");
  openM("m-policy-workflow-picker");
}

function policyCategoryToDocType(category){
  return "policy_" + (category || "بدون فئة");
}

function getPolicyWorkflowType(policy){
  return policyCategoryToDocType(policy.category);
}

const POLICY_WORKFLOW_LABELS = Object.fromEntries(
  Object.keys(POLICY_CATEGORY_ICONS).map(cat => [policyCategoryToDocType(cat), cat])
);

async function buildPolicyCanvasPages(policy, signaturesMap, orderedRoles){
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw(policy.policy_name || "سياسة", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(6);
  b.wrapAndDraw(getMatrixCompanyName(), { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
  b.spacer(20);

  b.wrapAndDraw(`الفئة: ${policy.category||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`النوع: ${policy.policy_type||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`تاريخ الاعتماد: ${policy.approval_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`موعد المراجعة القادمة: ${policy.review_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`مستوى الاعتماد: ${policy.approval_level||"مجلس الإدارة"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.spacer(14);
  if(policy.file_url){
    b.wrapAndDraw("📎 نص السياسة الكامل مرفق كملف منفصل عند تحميلها من المنصة — هذه الوثيقة سجل اعتماد وتوقيع رسمي، وليست بديلاً عن نص السياسة.", { font:`${10.5*b.scale}px Tajawal, Arial`, color:"#8B95A5", lineHeight:18*b.scale });
  }

  if(orderedRoles && orderedRoles.length){
    b.spacer(30);
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

async function startPolicyGovernanceApproval(policyId){
  if(await polBlockIfOpen(policyId)) return;
  const policy = policiesCache.find(p => p.id === policyId);
  if(!policy){ alert("تعذّر تحميل السياسة"); return; }
  const docType = getPolicyWorkflowType(policy);
  await startGovernanceApproval(docType, policyId);
}

async function loadPolicyApprovalStatus(policyId, containerId){
  const box = document.getElementById(containerId);
  if(!box) return;
  const { data: approvals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).eq("document_ref_id", policyId).order("created_at",{ascending:false}).limit(1);
  const current = (approvals||[])[0];
  if(!current){ box.innerHTML = ""; return; }
  if(current.status === "مكتملة" || current.status === "مرفوضة"){
    const isDone = current.status === "مكتملة";
    box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:700;padding:6px 12px;border-radius:20px;background:${isDone?'#E8F8EF':'#FBEAEA'};color:${isDone?'var(--green)':'var(--red)'};border:1.5px solid ${isDone?'var(--green)':'var(--red)'}"><span class="ico ico-${isDone?'check':'xcircle'}" style="width:13px;height:13px"></span>${current.status}</span>`;
    return;
  }
  const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
  const daysPassed = Math.floor((Date.now() - new Date(current.created_at).getTime()) / 86400000);
  const daysLeft = deadlineDays - daysPassed;
  const isLate = daysLeft < 0;
  const deadlineNote = isLate
    ? `<span style="font-size:10.5px;color:var(--red);font-weight:800">متأخرة ${Math.abs(daysLeft)} يوم</span>`
    : `<span style="font-size:10.5px;color:var(--gray3)">متبقٍ ${daysLeft} يوم</span>`;
  box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:800;padding:6px 12px;border-radius:20px;background:#FEF3E2;color:var(--gold);border:1.5px solid var(--gold)"><span class="ico ico-dot" style="width:11px;height:11px"></span>${current.status}</span> ${deadlineNote}`;
}

async function savePolicy(){
  const id = document.getElementById("mp-id").value;
  const policy_name = document.getElementById("mp-name").value.trim();
  const policy_type = document.getElementById("mp-type").value.trim();
  const submission_date = document.getElementById("mp-submission").value || new Date().toISOString().slice(0,10);
  const target_approval_date = document.getElementById("mp-target-approval").value || null;
  const approval_date = document.getElementById("mp-approval").value || null; // read-only field; only ever set automatically once the approval cycle completes
  const review_date = document.getElementById("mp-review").value || null;
  const status = document.getElementById("mp-status").value;
  const category = document.getElementById("mp-category").value;
  const approval_level = document.getElementById("mp-approval-level").value;
  if(!policy_name){ alert("الرجاء إدخال اسم السياسة"); return; }

  const previous = id ? policiesCache.find(x => x.id === Number(id)) : null;
  if(id && previous && previous.status !== status && status !== "مسودة" && await polBlockIfOpen(Number(id))) return;
  const fileInput = document.getElementById("mp-file");
  const file_url = await uploadFile(fileInput, "policies");

  const payload = { policy_name, policy_type, submission_date, target_approval_date, approval_date, review_date, status, category, approval_level, company_id: currentCompanyId };
  if(file_url) payload.file_url = file_url;
  if(!id || (previous && previous.status !== status)) payload.stage_entered_at = new Date().toISOString();

  const { error } = id
    ? await sb.from("policies").update(payload).eq("id", id)
    : await sb.from("policies").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  if(id && file_url){ try{ await polRegisterVersion(Number(id), file_url, previous ? previous.file_url : null); }catch(e){} }

  if(id && previous && previous.status !== status){
    await logPolicyStageChange(Number(id), previous.status, status);
  } else if(!id){
    const { data: created } = await sb.from("policies").select("id").eq("company_id", currentCompanyId).eq("policy_name", policy_name).order("id",{ascending:false}).limit(1).single();
    if(created) await logPolicyStageChange(created.id, null, status);
  }

  document.getElementById("mp-id").value = "";
  document.getElementById("mp-title-h").textContent = "🏛️ إضافة سياسة جديدة";
  document.getElementById("mp-name").value = "";
  document.getElementById("mp-type").value = "";
  document.getElementById("mp-submission").value = "";
  document.getElementById("mp-target-approval").value = "";
  document.getElementById("mp-approval").value = "";
  document.getElementById("mp-review").value = "";
  fileInput.value = "";
  closeM("m-policy");
  loadPolicies();
}
