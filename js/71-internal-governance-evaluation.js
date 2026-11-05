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
