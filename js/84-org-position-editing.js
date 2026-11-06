function autoToggleLeadership(){
  const level = Number(document.getElementById("mst-level").value);
  document.getElementById("mst-leadership").checked = level <= 7;
}

function toggleBodyFields(){
  const isBody = document.getElementById("mst-is-body").checked;
  document.getElementById("mst-holder-field").style.display = isBody ? "none" : "block";
}

function editStructure(id){
  const s = structureCache.find(x => x.id === id);
  if(!s) return;
  if(s.unit_type){ openUnitModal(s); return; }
  openPositionModal(s);
}

const ORG_UNIT_LEVEL = { department: 6, section: 7, unit: 8 };
const ORG_UNIT_LABEL = { department: "إدارة", section: "قسم", unit: "وحدة" };
function orgHolderList(s){
  if(Array.isArray(s.holders) && s.holders.length) return s.holders;
  return s.holder_name ? [{ name: s.holder_name, direct_manager: "", appointment_date: s.appointment_date || "" }] : [];
}
function orgParentOptions(selected, excludeId){
  const rows = structureCache.filter(r => r.id !== excludeId);
  const units = rows.filter(r => r.unit_type || r.is_body);
  const others = rows.filter(r => !r.unit_type && !r.is_body);
  const opt = r => `<option value="${orgEsc(r.position_title||"")}">${orgEsc(r.position_title||"")}${r.unit_type ? " ("+ORG_UNIT_LABEL[r.unit_type]+")" : ""}</option>`;
  return '<option value="">— بدون (أعلى مستوى في الهيكل) —</option>'
    + (units.length ? '<optgroup label="الإدارات والأقسام والوحدات والجهات">'+units.map(opt).join("")+'</optgroup>' : "")
    + (others.length ? '<optgroup label="مناصب">'+others.map(opt).join("")+'</optgroup>' : "");
}
function openUnitModal(s){
  document.getElementById("mu-id").value = s ? s.id : "";
  document.getElementById("mu-title-h").textContent = s ? "✏️ تعديل" : "🌳 إضافة إدارة / قسم / وحدة";
  document.getElementById("mu-type").value = (s && s.unit_type) || "department";
  document.getElementById("mu-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mu-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  const sideRow = document.getElementById("mu-side-row");
  sideRow.style.display = orgSideSupported ? "flex" : "none";
  document.getElementById("mu-side").checked = s ? orgIsSideRaw(s) : false;
  document.getElementById("mu-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-unit");
}
async function saveUnit(){
  const id = document.getElementById("mu-id").value;
  const title = document.getElementById("mu-title").value.trim();
  if(!title){ alert("الرجاء إدخال الاسم"); return; }
  const unit_type = document.getElementById("mu-type").value;
  const dup = structureCache.find(r => r.position_title === title && String(r.id) !== String(id));
  if(dup){ alert("يوجد عنصر بنفس الاسم في الهيكل. اختر اسمًا مختلفًا."); return; }
  const payload = { position_title: title, unit_type, level: ORG_UNIT_LEVEL[unit_type], parent_position: document.getElementById("mu-parent").value.trim(),
    is_leadership: true, is_body: false, holder_name: "", holders: [], appointment_date: null, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mu-side").checked;
  let error;
  if(id){
    const old = structureCache.find(r => String(r.id) === String(id));
    ({ error } = await sb.from("org_structure").update(payload).eq("id", id));
    if(!error && old && old.position_title !== title){
      await sb.from("org_structure").update({ parent_position: title }).eq("company_id", currentCompanyId).eq("parent_position", old.position_title);
      await sb.from("org_structure").update({ unit_title: title }).eq("company_id", currentCompanyId).eq("unit_title", old.position_title);
    }
  } else {
    ({ error } = await sb.from("org_structure").insert([payload]));
  }
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}
async function deleteUnitFromModal(){
  const id = document.getElementById("mu-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. العناصر التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}

function addHolderRow(h){
  h = h || {};
  const list = document.getElementById("mst-holders-list");
  const div = document.createElement("div");
  div.className = "mst-holder-row";
  div.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;background:var(--offwhite);padding:8px;border-radius:8px";
  div.innerHTML = `<input class="fi mh-name" style="flex:2;min-width:140px" placeholder="اسم الشخص" value="${orgEsc(h.name||"")}" />
    <input class="fi mh-mgr" list="mst-people-dl" style="flex:2;min-width:140px" placeholder="المدير المباشر" value="${orgEsc(h.direct_manager||"")}" />
    <input type="date" class="fi mh-date" style="flex:1;min-width:130px" value="${orgEsc(h.appointment_date||"")}" title="تاريخ التعيين" />
    <button type="button" class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;cursor:pointer" onclick="this.parentNode.remove()">حذف</button>`;
  list.appendChild(div);
}
function openPositionModal(s){
  if(!s && (!structureCache || !structureCache.length)){
    alert("أضف الهيكل أولًا (إدارة أو قسم أو وحدة)، ثم أضف المناصب بعد اكتماله.");
    return;
  }
  document.getElementById("mst-id").value = s ? s.id : "";
  document.getElementById("mst-title-h").textContent = s ? "✏️ تعديل منصب" : "🌳 إضافة منصب في الهيكل التنظيمي";
  document.getElementById("mst-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mst-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  populateOrgLevelSelect(s ? s.level : undefined);
  document.getElementById("mst-level").value = s ? (s.level ?? "") : "";
  document.getElementById("mst-leadership").checked = s ? s.is_leadership !== false : false;
  document.getElementById("mst-is-body").checked = s ? !!s.is_body : false;
  document.getElementById("mst-side").checked = s ? orgIsSideRaw(s) : false;
  const dl = document.getElementById("mst-people-dl");
  const names = new Set();
  structureCache.forEach(r => orgHolderList(r).forEach(h => { if(h.name) names.add(h.name); }));
  dl.innerHTML = [...names].map(n => `<option value="${orgEsc(n)}"></option>`).join("");
  document.getElementById("mst-holders-list").innerHTML = "";
  if(s){ orgHolderList(s).forEach(h => addHolderRow(h)); }
  if(!s || !orgHolderList(s).length) addHolderRow();
  toggleBodyFields();
  mstParentChanged();
  document.getElementById("mst-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-structure");
}
function mstParentChanged(){
  const u = structureCache.find(r => r.position_title === document.getElementById("mst-parent").value);
  const row = document.getElementById("mst-leadership").parentNode;
  if(row) row.style.display = (u && u.unit_type) ? "none" : "flex";
  if(document.getElementById("mst-id").value) return;
  if(u && u.unit_type) document.getElementById("mst-level").value = String(u.level ?? "");
}

async function deleteStructureFromModal(){
  const id = document.getElementById("mst-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-structure");
  loadStructure();
}
async function saveStructure(){
  const id = document.getElementById("mst-id").value;
  const position_title = document.getElementById("mst-title").value.trim();
  if(!position_title){ alert("الرجاء إدخال اسم المنصب"); return; }
  const is_body = document.getElementById("mst-is-body").checked;
  const holders = is_body ? [] : [...document.querySelectorAll("#mst-holders-list .mst-holder-row")].map(r => ({
    name: r.querySelector(".mh-name").value.trim(),
    direct_manager: r.querySelector(".mh-mgr").value.trim(),
    appointment_date: r.querySelector(".mh-date").value || ""
  })).filter(h => h.name);
  const holder_name = holders.map(h => h.name).join("، ");
  const appointment_date = holders.length ? (holders[0].appointment_date || null) : null;
  const parent_position = document.getElementById("mst-parent").value.trim();
  const level = document.getElementById("mst-level").value ? Number(document.getElementById("mst-level").value) : null;
  const parentRow = structureCache.find(r => r.position_title === parent_position);
  const is_leadership = (parentRow && parentRow.unit_type) ? false : document.getElementById("mst-leadership").checked;
  const payload = { position_title, holder_name, holders, appointment_date, parent_position, unit_title: parent_position || null, unit_type: null, level, is_leadership, is_body, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mst-side").checked;
  const { error } = id
    ? await sb.from("org_structure").update(payload).eq("id", id)
    : await sb.from("org_structure").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mst-id").value = "";
  closeM("m-structure"); loadStructure();
}
