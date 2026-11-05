/* ══════════ ORG STRUCTURE ══════════ */
let structureCache = [];
const orgLevelLabels = {1:'الجمعية العامة',2:'مجلس الإدارة',3:'اللجان المنبثقة',4:'الرئيس التنفيذي',5:'نواب الرئيس / الإدارة العليا',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'};
/* One colour per organisational level — the same colour is used on screen, in the PDF and in the legend. */
/* Level names depend on the legal form: a sole proprietorship or a single-owner LLC has an owner and a manager,
   not a general assembly. The stored number (1-8) and its colour stay the same for every entity type. */
const ORG_LABELS_BY_KIND = {
  stock: orgLevelLabels,
  llc:   {1:'جمعية الشركاء',2:'مجلس المديرين',3:'اللجان المنبثقة',4:'الرئيس التنفيذي / المدير العام',5:'الإدارة العليا / المدراء الرئيسيون',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'},
  small: {1:'المالك',4:'المدير العام / التنفيذي',5:'الإدارة العليا / المدراء الرئيسيون',6:'الإدارات',7:'الأقسام',8:'الوحدات / الفرق'}
};
const ORG_LABELS_EN = {
  stock: {1:'General Assembly',2:'Board of Directors',3:'Sub-committees',4:'Chief Executive Officer',5:'Vice Presidents / Senior Management',6:'Departments',7:'Sections',8:'Units / Teams'},
  llc:   {1:"Partners' Assembly",2:'Board of Managers',3:'Sub-committees',4:'CEO / General Manager',5:'Senior Management / Principal Managers',6:'Departments',7:'Sections',8:'Units / Teams'},
  small: {1:'Owner',4:'General / Executive Manager',5:'Senior Management / Principal Managers',6:'Departments',7:'Sections',8:'Units / Teams'}
};
function orgLevelKind(){
  if(currentCompanyType === "مؤسسة فردية" || (currentCompanyType === "ذات مسؤولية محدودة" && typeof currentCompanyLLCSingleOwner !== "undefined" && currentCompanyLLCSingleOwner)) return "small";
  if(currentCompanyType === "ذات مسؤولية محدودة") return "llc";
  return "stock";
}
function orgLabels(){ return ORG_LABELS_BY_KIND[orgLevelKind()] || orgLevelLabels; }
/* Fill the level dropdown with only the levels that make sense for this company (plus the level of the row being edited). */
function populateOrgLevelSelect(extraLevel){
  const sel = document.getElementById("mst-level");
  if(!sel) return;
  const L = orgLabels();
  const prev = sel.value;
  const levels = new Set(Object.keys(L).map(Number));
  if(extraLevel != null && extraLevel !== "" && !isNaN(Number(extraLevel))) levels.add(Number(extraLevel));
  sel.innerHTML = [...levels].sort((a,b) => a-b).map(l => `<option value="${l}">${l} — ${orgEsc(L[l] || orgLevelLabels[l] || ("مستوى " + l))}</option>`).join("");
  const want = (extraLevel != null && extraLevel !== "") ? String(extraLevel) : prev;
  sel.value = (want && levels.has(Number(want))) ? want : (orgLevelKind() === "small" ? "6" : "3");
}
const ORG_LEVEL_COLORS = {1:'#0F2138',2:'#1F4E8C',3:'#6B4FA0',4:'#1B5E4A',5:'#2E8B6E',6:'#9C7A2E',7:'#B5612A',8:'#5E6B78'};
function orgLevelColor(l){ return ORG_LEVEL_COLORS[l] || '#5E6B78'; }
/* Per-node override: true = children hidden, false = children shown. No entry = the default (sections and units start folded). */
let orgOverride = new Map();
let orgNodeCollapsed = {};
let orgSideSupported = false;
const ORG_SIDE_WIDTH = 210;
const ORG_COLLAPSE_FROM_LEVEL = 7;
/* A "side" unit (internal audit, governance, CEO office...) is drawn beside the unit it reports to with a dashed
   line, while keeping its own level colour. The explicit is_side column wins; while it is empty (or the column
   does not exist yet) well-known unit names are recognised automatically. */
function orgIsSideRaw(r){
  if(r.is_side === true) return true;
  if(r.is_side === false) return false;
  return !r.is_body && (r.level ?? 0) >= 5 && /المراجعة الداخلية|التدقيق الداخلي|الحوكمة|مكتب (الرئيس|المدير)/.test(r.position_title || "");
}
function orgEsc(v){ return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function orgLevelLabel(lvl){
  if(lvl==null) return "—";
  const L = orgLabels();
  const nm = L[lvl] || orgLevelLabels[lvl];
  return nm ? `${lvl} — ${nm}` : `مستوى ${lvl}`;
}

/* Fill the "يتبع لـ" dropdown with every existing position, defaulting to the most
   recently added one so a new position naturally chains under the previous one. */
function populateParentPositionSelect(preselect){
  const sel = document.getElementById("mst-parent");
  if(!sel) return;
  const options = ['<option value="">— بدون (أعلى مستوى في الهيكل) —</option>']
    .concat(structureCache.map(s => `<option value="${(s.position_title||"").replace(/"/g,'&quot;')}">${orgEsc(s.position_title||"")}</option>`));
  sel.innerHTML = options.join("");
  sel.value = preselect || "";
}

async function loadStructure(){
  const tbody = document.getElementById("structureTbody");
  const chartWrap = document.getElementById("orgTreeContainer");
  if(!tbody) return;
  const { data, error } = await sb.from("org_structure").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  if(error){ tbody.innerHTML = errorRowHTML(7, error.message); if(chartWrap) chartWrap.innerHTML = ""; return; }
  structureCache = data || [];
  // Display-only: positions saved without a level take their parent's level + 1 (nothing is written back to the database).
  (function(){
    const bt = {}; structureCache.forEach(r => { if(r.position_title) bt[r.position_title] = r; });
    const eff = (r, d) => { if(r.level != null) return r.level; if(d > 8) return 5; const p = bt[r.parent_position]; return p && p !== r ? Math.min(8, (eff(p, d+1) ?? 4) + 1) : 5; };
    structureCache.forEach(r => { if(r.level == null && !r.is_body) r.level = eff(r, 0); });
  })();
  try{
    const probe = await sb.from("org_structure").select("is_side").limit(1);
    orgSideSupported = !probe.error;
  }catch(e){ orgSideSupported = false; }
  populateOrgLevelSelect();
  const sideRow = document.getElementById("mst-side-row");
  if(sideRow) sideRow.style.display = orgSideSupported ? "flex" : "none";
  if(structureCache.length===0){
    tbody.innerHTML = emptyRowHTML(7, 'لا توجد بيانات بعد. اضغط "+ إضافة إدارة / قسم / وحدة" للبدء.');
    if(chartWrap) chartWrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا يوجد هيكل تنظيمي بعد. اضغط "+ إضافة إدارة / قسم / وحدة" لبدء بناء الهيكل.</div>';
    return;
  }

  const byT = {}; structureCache.forEach(r => { if(r.position_title) byT[r.position_title] = r; });
  const deptOf = r => { let c = byT[r.parent_position], n = 0; while(c && n++ < 12){ if(c.unit_type === "department") return c.position_title; c = byT[c.parent_position]; } return ""; };
  const btns = s => `<button class="btn-xs primary" onclick="editStructure(${s.id})"><span class="ico-i ico-edit"></span>تعديل</button>
      <button class="btn-xs" style="background:#FDF5DC;color:var(--gold);border:1px solid #F0D8A0;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px" onclick="openJobDescriptionModal(${s.id})"><span class="ico-i ico-document"></span>الوصف الوظيفي</button>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px" onclick="deletePosition(${s.id})"><span class="ico-i ico-trash"></span>حذف</button>`;
  const personRows = [];
  structureCache.filter(s => !s.is_body && !s.unit_type).forEach(s => {
    const hs = orgHolderList(s);
    const par = byT[s.parent_position];
    const unitCol = s.parent_position ? orgEsc(s.parent_position) : "—";
    const dept = deptOf(s);
    const deptCol = dept && dept !== s.parent_position ? orgEsc(dept) : (par && par.unit_type === "department" ? orgEsc(par.position_title) : "—");
    const unitShown = par && par.unit_type === "department" ? "—" : unitCol;
    (hs.length ? hs : [{ name: "", direct_manager: "", appointment_date: "" }]).forEach(h => {
      personRows.push(`<tr><td>${orgEsc(h.name || "— (شاغر)")}</td><td>${orgEsc(s.position_title||"")}</td><td>${unitShown}</td><td>${deptCol}</td><td>${orgEsc(h.direct_manager||"—")}</td><td>${h.appointment_date ? orgEsc(h.appointment_date) : "—"}</td><td>${btns(s)}</td></tr>`);
    });
  });
  tbody.innerHTML = personRows.join("") || emptyRowHTML(7, "لا يوجد مناصب بعد. أضف الهيكل أولًا ثم اضغط \"+ إضافة منصب\".");

  rerenderOrgTree();
  if(typeof orgCenterScroll === "function") orgCenterScroll();
}
