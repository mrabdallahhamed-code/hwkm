/* ══════════ BOARD MEMBER REVIEW ON POLICIES AT "مرفوعة لمجلس الإدارة" STAGE ══════════ */
async function loadPolicyReviewSection(){
  const card = document.getElementById("policyReviewCard");
  const box = document.getElementById("policyReviewBody");
  if(!box || !card) return;
  const role = getCurrentRole();
  const hasNoBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(role === 'مساهم' || hasNoBoard){ card.style.display = "none"; return; }
  card.style.display = "block";
  const bodyLabel = getGovernanceBodyLabel();
  setText("policyReviewTitle", `سياسات تتطلب اعتماد المجلس`);

  const pending = policiesCache.filter(p => p.status === "مرفوعة لمجلس الإدارة");
  if(pending.length===0){ box.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بانتظار اعتماد المجلس.</div>`; return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const ids = pending.map(p=>p.id);
  const { data: reviews } = await sb.from("policy_reviews").select("*").in("policy_id", ids);
  const reviewsByPolicy = {};
  (reviews||[]).forEach(rv => {
    if(!reviewsByPolicy[rv.policy_id]) reviewsByPolicy[rv.policy_id] = [];
    reviewsByPolicy[rv.policy_id].push(rv);
  });

  box.innerHTML = pending.map(p => {
    const revs = reviewsByPolicy[p.id] || [];
    const yes = revs.filter(v=>v.decision==="موافق").length;
    const no = revs.filter(v=>v.decision==="معارض").length;
    const abst = revs.filter(v=>v.decision==="متحفظ").length;
    const mine = myEmail ? revs.find(v => v.reviewer_email === myEmail) : null;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(p.policy_name||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin:4px 0 8px">${orgEsc(p.category||"")} · ${orgEsc(p.policy_type||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin-bottom:8px">آراء ${getGovernanceMemberLabel()} حتى الآن: <span style="color:var(--green)"><span class="ico-i ico-check"></span>${yes}</span> · <span style="color:var(--red)"><span class="ico-i ico-xcircle"></span>${no}</span> · <span style="color:var(--orange)"><span class="ico-i ico-warning"></span>${abst}</span></div>
      <textarea id="policy-review-notes-${p.id}" placeholder="ملاحظاتك (اختياري)" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-bottom:8px" rows="2">${orgEsc(mine ? (mine.notes||"") : "")}</textarea>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='موافق'?'900':'600'}" onclick="submitPolicyReview(${p.id},'موافق')"><span class="ico-i ico-check"></span>موافقة</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='معارض'?'900':'600'}" onclick="submitPolicyReview(${p.id},'معارض')"><span class="ico-i ico-xcircle"></span>معارض</button>
        <button class="btn-xs" style="background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='متحفظ'?'900':'600'}" onclick="submitPolicyReview(${p.id},'متحفظ')"><span class="ico-i ico-warning"></span>تحفظ</button>
      </div>
      ${mine ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">رأيك المسجّل حاليًا: ${orgEsc(mine.decision)}</div>` : ""}
    </div>`;
  }).join("");
}

async function submitPolicyReview(policyId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("policy-review-notes-"+policyId);
  const notes = notesEl ? notesEl.value.trim() : "";

  await sb.from("policy_reviews").delete().eq("policy_id", policyId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("policy_reviews").insert([{
    policy_id: policyId, reviewer_email: myEmail, reviewer_name, decision, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ رأيك: " + error.message); return; }

  await recomputePolicyStage(policyId);
  loadPolicies();
}

/* If every board member who reviewed approved unanimously, auto-advance the policy to the
   next stage. Any single objection or reservation keeps it pending at the same stage. */
/* Real timeline tracking: every stage transition (auto or manual) is logged with who and when */
async function logPolicyStageChange(policyId, fromStatus, toStatus){
  if(fromStatus === toStatus) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const changed_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : (myEmail || "النظام");
  await sb.from("policy_stage_history").insert([{ policy_id: policyId, from_status: fromStatus, to_status: toStatus, changed_by, company_id: currentCompanyId }]);
}

async function advancePolicyToStatus(policyId, currentStatus, nextStatus, policyRow){
  await sb.from("policies").update({ status: nextStatus, stage_entered_at: new Date().toISOString() }).eq("id", policyId);
  await logPolicyStageChange(policyId, currentStatus, nextStatus);
  if(nextStatus === "معتمدة نهائيًا"){
    const p = policyRow || policiesCache.find(x => x.id === policyId);
    if(p && p.file_url){
      const { data: board } = await sb.from("user_profiles").select("*").eq("company_id", currentCompanyId).or("role.ilike.%مجلس%,role.eq.مدير النظام,role.in.(مالك,ممثل المالك)");
      await sb.from("signing_documents").insert([{
        document_name: `اعتماد نهائي — ${p.policy_name}`, doc_type: "اعتماد سياسة",
        signers_total: (board||[]).length, signers_done: 0, status: "قيد التوقيع", file_url: p.file_url, company_id: currentCompanyId
      }]);
      logActivity("موافقة", "سياسة", p.policy_name, "اعتمدت نهائيًا — انتقلت تلقائيًا للتوقيع الإلكتروني");
    }
  }
}

async function recomputePolicyStage(policyId){
  const { data: revs, error } = await sb.from("policy_reviews").select("*").eq("policy_id", policyId);
  if(error || !revs || revs.length===0) return;
  const allApprove = revs.every(v => v.decision === "موافق");
  if(!allApprove) return; // stays at the current board/committee/AGM stage until unanimous approval
  const p = policiesCache.find(x => x.id === policyId);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(policyId, p.status, nextStatus, p);
}

async function deletePolicy(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه السياسة؟")) return;
  const p = policiesCache.find(x=>x.id===id);
  const { error } = await sb.from("policies").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "سياسة", p?p.policy_name:"", "");
  loadPolicies();
}

async function advancePolicyStage(id){
  if(await polBlockIfOpen(id)) return;
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(id, p.status, nextStatus, p);
  loadPolicies();
}

async function openPolicyHistoryModal(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("ph-title").textContent = "🕒 السجل الزمني — " + (p.policy_name||"");
  const box = document.getElementById("ph-timeline");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">جارِ التحميل...</div>';
  openM("m-policy-history");

  const [{ data: history }, { data: reviews }] = await Promise.all([
    sb.from("policy_stage_history").select("*").eq("policy_id", id).order("created_at",{ascending:true}),
    sb.from("policy_reviews").select("*").eq("policy_id", id).order("created_at",{ascending:true})
  ]);

  const events = [];
  (history||[]).forEach(h => events.push({
    date: h.created_at,
    text: h.from_status ? `انتقلت من "${h.from_status}" إلى "${h.to_status}"` : `أُنشئت بحالة "${h.to_status}"`,
    by: h.changed_by, type: "stage"
  }));
  (reviews||[]).forEach(r => events.push({
    date: r.created_at,
    text: `${r.reviewer_name||r.reviewer_email} — ${r.decision}${r.notes ? (' ("'+r.notes+'")') : ''}`,
    by: null, type: "review"
  }));
  events.sort((a,b) => new Date(a.date) - new Date(b.date));

  if(events.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا يوجد سجل حركة بعد لهذه السياسة.</div>';
    return;
  }
  box.innerHTML = events.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="width:8px;height:8px;border-radius:50%;background:${e.type==='stage'?'var(--primary)':'var(--gold)'};margin-top:5px;flex-shrink:0"></div>
      <div>
        <div style="font-size:12px;color:var(--dark);font-weight:600">${e.text}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${e.by?e.by+' — ':''}${new Date(e.date).toLocaleString('ar-SA-u-ca-gregory')}</div>
      </div>
    </div>`).join("");
}

function populatePolicyCategorySelect(selected){
  const sel = document.getElementById("mp-category");
  if(!sel) return;
  const cats = getPolicyCategoriesForCompany();
  sel.innerHTML = cats.map(c => `<option ${c===selected?"selected":""}>${c}</option>`).join("");
  // A policy might already be filed under a governance category the company no longer has
  // (e.g. after a company-type change) — keep it selectable so editing doesn't silently
  // reassign it to the wrong bucket.
  if(selected && !cats.includes(selected)){
    sel.insertAdjacentHTML("beforeend", `<option selected>${selected}</option>`);
  }
}

// Same principle as the category list: a company with no board and no general assembly has
// nothing for "تحتاج اعتماد مجلس الإدارة" / "تحتاج اعتماد الجمعية العامة" to actually mean —
// offering them anyway invites picking an approval level that maps to nobody real.
function getApprovalLevelsForCompany(){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(noBoard){
    const approverWord = (currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner) ? "المالك" : "المدير";
    return [
      { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
      { value: "مجلس الإدارة", label: `تحتاج اعتماد ${approverWord}` },
    ];
  }
  return [
    { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
    { value: "مجلس الإدارة", label: `تحتاج اعتماد ${getGovernanceBodyLabel()}` },
    { value: "جمعية عامة", label: "تحتاج اعتماد الجمعية العامة" },
  ];
}

function populateApprovalLevelSelect(selected){
  const sel = document.getElementById("mp-approval-level");
  if(!sel) return;
  const levels = getApprovalLevelsForCompany();
  sel.innerHTML = levels.map(l => `<option value="${l.value}" ${l.value===selected?"selected":""}>${l.label}</option>`).join("");
  if(selected && !levels.some(l=>l.value===selected)){
    sel.insertAdjacentHTML("beforeend", `<option value="${selected}" selected>${selected}</option>`);
  }
}

function editPolicy(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("mp-id").value = p.id;
  document.getElementById("mp-title-h").textContent = "✏️ تعديل السياسة";
  document.getElementById("mp-name").value = p.policy_name || "";
  document.getElementById("mp-type").value = p.policy_type || "";
  document.getElementById("mp-submission").value = p.submission_date || "";
  document.getElementById("mp-target-approval").value = p.target_approval_date || "";
  const approvalWrap = document.getElementById("mp-approval-wrap");
  if(p.approval_date){
    approvalWrap.style.display = "block";
    document.getElementById("mp-approval").value = p.approval_date;
  } else {
    approvalWrap.style.display = "none";
  }
  document.getElementById("mp-review").value = p.review_date || "";
  document.getElementById("mp-status").value = p.status || "مسودة";
  populatePolicyCategorySelect(p.category || "لوائح داخلية");
  populateApprovalLevelSelect(p.approval_level || "مجلس الإدارة");
  openM("m-policy");
}
