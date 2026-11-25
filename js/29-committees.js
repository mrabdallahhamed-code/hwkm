/* ══ أنواع اللجان ومتطلبات لائحة حوكمة الشركات (إلزامية/اختيارية) ══
   إلزامية للمدرجة في السوق الرئيسية: المراجعة (م51) والمكافآت (م57) والترشيحات (م61)، ويجوز دمج الأخيرتين (م47/7).
   في الموازية: المراجعة فقط (م51/أ). اختيارية (استرشادية): المخاطر (م67) والحوكمة (م92) وما سواهما. */
function committeeKind(name){
  const n = name || "";
  if(/مراجعة/.test(n)) return "audit";
  const hasRem = /مكافآت|مكافات/.test(n), hasNom = /ترشيح/.test(n);
  if(hasRem && hasNom) return "remnom";
  if(hasRem) return "rem"; if(hasNom) return "nom";
  if(/مخاطر/.test(n)) return "risk"; if(/حوكمة/.test(n)) return "gov";
  return "other";
}
function committeeBinding(kind, level){
  if(kind === "audit") return (level === "main" || level === "parallel") ? { m: true, t: "إلزامية (م51)" } : { m: false, t: level === "advisory" ? "اختيارية لغير المدرجة (إلزامية للمدرجة)" : "إلزامية (م51)" };
  if(kind === "rem" || kind === "nom" || kind === "remnom") return level === "main" ? { m: true, t: "إلزامية (م57 وم61)" } : { m: false, t: "اختيارية (إلزامية للمدرجة في الرئيسية)" };
  if(kind === "risk") return { m: false, t: "اختيارية — استرشادية (م67)" };
  if(kind === "gov") return { m: false, t: "اختيارية — استرشادية (م92)" };
  return { m: false, t: "اختيارية (م47)" };
}
const COMMITTEE_REQ_TEXT = {
  audit: "لجنة المراجعة (م51 وم54): من 3 إلى 5 أعضاء من المساهمين أو غيرهم، لا يضمون عضوًا تنفيذيًا من المجلس، ومن بينهم مختص بالشؤون المالية والمحاسبية. رئيسها مستقل، ونصف أعضائها مستقلون على الأقل. ولا يكون فيها من عمل خلال السنتين الماضيتين في الإدارة التنفيذية أو المالية أو لدى المراجع. تجتمع 4 مرات في السنة على الأقل، ودوريًا مع المراجع الخارجي والداخلي.",
  rem: "لجنة المكافآت (م57 وم60): من غير التنفيذيين وفيها عضو مستقل على الأقل، وتجتمع مرة في السنة على الأقل.",
  nom: "لجنة الترشيحات (م61 وم64): من غير التنفيذيين وفيها عضو مستقل على الأقل، وتجتمع مرة في السنة على الأقل.",
  remnom: "لجنة المكافآت والترشيحات المدمجة (م47/7): تستوفي متطلبات اللجنتين، وتجتمع كل ستة أشهر على الأقل.",
  risk: "لجنة المخاطر (م67، استرشادية): رئيسها وغالبية أعضائها من غير التنفيذيين، ولهم معرفة بإدارة المخاطر والشؤون المالية.",
  gov: "لجنة الحوكمة (م92، استرشادية): تتابع تطبيقات الحوكمة وتزود المجلس سنويًا بالتقارير والتوصيات.",
  other: ""
};
let committeeExtDraft = [];
async function committeeExtColAvailable(){
  if(window.__committeeExtCol !== undefined) return window.__committeeExtCol;
  try { const { error } = await sb.from("committees").select("external_members").limit(1); window.__committeeExtCol = !error; } catch(e){ window.__committeeExtCol = false; }
  return window.__committeeExtCol;
}
function committeeReqHint(){
  const box = document.getElementById("mcm-req-hint"); if(!box) return;
  const k = committeeKind((document.getElementById("mcm-name") || {}).value);
  const base = "كل لجنة (م47): من 3 إلى 5 أعضاء، وللمدرجة إشعار هيئة السوق المالية بأسماء الأعضاء خلال 5 أيام عمل، وحضور رؤساء اللجان الجمعية العامة للإجابة عن أسئلة المساهمين.";
  box.innerHTML = (COMMITTEE_REQ_TEXT[k] ? "<b>" + COMMITTEE_REQ_TEXT[k] + "</b><br>" : "") + base;
  const fin = document.getElementById("mcm-fin-expert"); if(fin && fin.parentElement) fin.style.display = fin.previousElementSibling.style.display = (k === "audit") ? "" : "none";
}
function renderCommitteeExt(){
  const box = document.getElementById("mcm-ext-list"); if(!box) return;
  box.innerHTML = committeeExtDraft.map((e, i) => `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px;border:1px solid var(--gray1);border-radius:8px;padding:6px">
    <input class="fi" style="flex:1;min-width:140px" placeholder="الاسم" value="${orgEsc(e.name || "")}" oninput="committeeExtDraft[${i}].name=this.value"/>
    <label style="font-size:11.5px"><input type="checkbox" ${e.independent ? "checked" : ""} onchange="committeeExtDraft[${i}].independent=this.checked"> مستقل</label>
    <label style="font-size:11.5px" title="م51/و"><input type="checkbox" ${e.conflict2y ? "checked" : ""} onchange="committeeExtDraft[${i}].conflict2y=this.checked"> عمل خلال سنتين في الإدارة التنفيذية/المالية أو لدى المراجع</label>
    <button type="button" class="topic-del" onclick="committeeExtDraft.splice(${i},1);renderCommitteeExt()"><span class="ico ico-trash" style="width:16px;height:16px"></span></button></div>`).join("");
}
function addCommitteeExt(){ committeeExtDraft.push({ kind: "ext", name: "", independent: false, conflict2y: false }); renderCommitteeExt(); }
async function prepCommitteeExtUI(c){
  const wrap = document.getElementById("mcm-ext-wrap"); if(!wrap) return;
  const ok = await committeeExtColAvailable();
  wrap.style.display = ok ? "" : "none";
  const arr = (c && Array.isArray(c.external_members)) ? c.external_members : [];
  committeeExtDraft = arr.filter(e => e.kind === "ext").map(e => ({ ...e }));
  const meta = arr.find(e => e.kind === "meta");
  const fin = document.getElementById("mcm-fin-expert"); if(fin) fin.value = (meta && meta.financial_expert) || "";
  renderCommitteeExt(); committeeReqHint();
}
/* ══════════ COMMITTEES ══════════ */
let committeesCache = [];
async function loadCommittees(){
  const wrap = document.getElementById("committeesCards");
  if(!wrap) return;
  const { data, error } = await sb.from("committees").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ wrap.innerHTML = `<div style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</div>`; return; }
  committeesCache = data || [];
  if(committeesCache.length===0){ wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد بيانات بعد. اضغط "+ إضافة لجنة" للبدء.</div>'; return; }

  const ids = committeesCache.map(c=>c.id);
  const { data: allLinks } = ids.length ? await sb.from("committee_members").select("*").in("committee_id", ids) : { data: [] };
  const countByCommittee = {};
  (allLinks||[]).forEach(l => { countByCommittee[l.committee_id] = (countByCommittee[l.committee_id]||0) + 1; });

  const level = typeof govRegLevel === "function" ? await govRegLevel() : "advisory";
  const catColors = { "لجنة رئيسية": "var(--primary)", "لجنة متخصصة": "#8B2FC9" };
  wrap.innerHTML = committeesCache.map(c => {
    const color = catColors[c.category] || "var(--gray3)";
    const memberCount = (countByCommittee[c.id] || 0) + (Array.isArray(c.external_members) ? c.external_members.filter(e => e.kind === "ext").length : 0);
    const bind = committeeBinding(committeeKind(c.committee_name), level);
    const hasCharter = !!(c.charter_purpose || c.charter_authorities || c.charter_composition);
    return `<div class="card" style="margin:0;border-right:4px solid ${color};display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="font-size:11px;font-weight:800;color:${color};margin-bottom:4px">${orgEsc(c.category||"لجنة")}</div>
          <div style="display:flex;gap:6px">
            <button class="btn-xs primary" onclick="editCommittee(${c.id})"><span class="ico-i ico-edit"></span>تعديل</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteCommittee(${c.id})"><span class="ico-i ico-trash"></span>حذف</button>
          </div>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--dark);margin-bottom:4px">${orgEsc(c.committee_name||"")}</div>
        <div style="margin-bottom:8px"><span style="font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:99px;background:${bind.m ? "#FDE8E8" : "#EEF2F7"};color:${bind.m ? "var(--red)" : "var(--gray3)"}">${bind.t}</span></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-user"></span>رئيس اللجنة: <b style="color:var(--dark)">${orgEsc(c.chairman_name||"—")}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:4px"><span class="ico-i ico-users"></span>عدد الأعضاء المحددين: <b style="color:var(--dark)">${memberCount}</b></div>
        <div style="font-size:12px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-calendar"></span>تاريخ التعيين: ${c.appointment_date||"—"}</div>
        ${c.scope ? `<div style="font-size:11.5px;color:var(--gray3);background:var(--offwhite);border-radius:8px;padding:8px;margin-bottom:8px">${orgEsc(c.scope)}</div>` : ""}
        <button class="btn-xs" style="width:100%;margin-top:auto;background:${hasCharter?'#E8F8EF':'var(--offwhite)'};color:${hasCharter?'var(--green)':'var(--dark)'};border:1px solid ${hasCharter?'transparent':'var(--gray1)'};border-radius:6px;padding:6px;font-size:11px;cursor:pointer" onclick="openCharterModal(${c.id})"><span class="ico-i ico-scroll"></span>${hasCharter?'عرض/تعديل الميثاق ✅':'إعداد ميثاق اللجنة'}</button>
      </div>
    </div>`;
  }).join("");
}
function openCharterModal(committeeId){
  const c = committeesCache.find(x => x.id === committeeId);
  if(!c) return;
  document.getElementById("mch-committee-id").value = committeeId;
  document.getElementById("mch-title-h").textContent = "📜 ميثاق — " + (c.committee_name||"");
  document.getElementById("mch-purpose").value = c.charter_purpose || "";
  document.getElementById("mch-authorities").value = c.charter_authorities || "";
  document.getElementById("mch-composition").value = c.charter_composition || "";
  document.getElementById("mch-meetings-rules").value = c.charter_meetings_rules || "";
  document.getElementById("mch-reporting").value = c.charter_reporting || "";
  document.getElementById("mch-approved-date").value = c.charter_approved_date || "";
  document.getElementById("mch-file").value = "";
  openM("m-charter");
  renderCharterApprovalStatus(committeeId);
}

async function saveCharter(){
  const committeeId = Number(document.getElementById("mch-committee-id").value);
  const fileInput = document.getElementById("mch-file");
  const file_url = await uploadFile(fileInput, "charters");
  const payload = {
    charter_purpose: document.getElementById("mch-purpose").value.trim(),
    charter_authorities: document.getElementById("mch-authorities").value.trim(),
    charter_composition: document.getElementById("mch-composition").value.trim(),
    charter_meetings_rules: document.getElementById("mch-meetings-rules").value.trim(),
    charter_reporting: document.getElementById("mch-reporting").value.trim(),
    charter_approved_date: document.getElementById("mch-approved-date").value || null
  };
  if(file_url) payload.charter_file_url = file_url;
  const { error } = await sb.from("committees").update(payload).eq("id", committeeId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  const c = committeesCache.find(x => x.id === committeeId);
  logActivity("تعديل", "ميثاق لجنة", c?c.committee_name:"", "");
  closeM("m-charter");
  loadCommittees();
}

function editCommittee(id){
  const c = committeesCache.find(x => x.id === id);
  if(!c) return;
  document.getElementById("mcm-id").value = c.id;
  document.getElementById("mcm-title-h").textContent = "✏️ تعديل لجنة";
  document.getElementById("mcm-name").value = c.committee_name || "";
  document.getElementById("mcm-chairman").value = c.chairman_name || "";
  document.getElementById("mcm-appointment-date").value = c.appointment_date || "";
  document.getElementById("mcm-category").value = c.category || "لجنة رئيسية";
  document.getElementById("mcm-scope").value = c.scope || "";
  renderCommitteeMembersCheckboxes(id);
  prepCommitteeExtUI(c);
  openM("m-committee");
}

async function openNewCommitteeModal(){
  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value = "";
  document.getElementById("mcm-chairman").value = "";
  document.getElementById("mcm-appointment-date").value = "";
  document.getElementById("mcm-scope").value = "";
  await renderCommitteeMembersCheckboxes(null);
  await prepCommitteeExtUI(null);
  openM("m-committee");
}

async function renderCommitteeMembersCheckboxes(committeeId){
  const box = document.getElementById("mcm-members-list");
  if(!box) return;
  box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  const { data: allMembers } = await sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  let selectedIds = [];
  if(committeeId){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", committeeId);
    selectedIds = (links||[]).map(l => l.member_id);
  }
  if(!allMembers || allMembers.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء مسجّلون بصفحة "أعضاء مجلس الإدارة" بعد.</div>'; return; }
  box.innerHTML = allMembers.map(m => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;cursor:pointer">
      <input type="checkbox" class="mcm-member-cb" value="${m.id}" ${selectedIds.includes(m.id)?"checked":""}>
      ${orgEsc(m.name||"")}
    </label>`).join("");
}

async function deleteCommittee(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه اللجنة نهائيًا؟")) return;
  const { error } = await sb.from("committees").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadCommittees();
}
async function saveCommittee(){
  const id = document.getElementById("mcm-id").value;
  const committee_name = document.getElementById("mcm-name").value.trim();
  if(!committee_name){ alert("الرجاء إدخال اسم اللجنة"); return; }
  const chairman_name = document.getElementById("mcm-chairman").value.trim();
  const appointment_date = document.getElementById("mcm-appointment-date").value || null;
  const category = document.getElementById("mcm-category").value;
  const scope = document.getElementById("mcm-scope").value.trim();
  const payload = { committee_name, chairman_name, appointment_date, category, scope, company_id: currentCompanyId };
  if(window.__committeeExtCol){
    const fin = ((document.getElementById("mcm-fin-expert") || {}).value || "").trim();
    payload.external_members = committeeExtDraft.filter(e => (e.name || "").trim()).map(e => ({ kind: "ext", name: e.name.trim(), independent: !!e.independent, conflict2y: !!e.conflict2y })).concat(fin ? [{ kind: "meta", financial_expert: fin }] : []);
  }

  let committeeId = id;
  if(id){
    const { error } = await sb.from("committees").update(payload).eq("id", id);
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("committees").insert([payload]).select().single();
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
    committeeId = data.id;
  }

  // Sync selected members: clear old links then insert the currently-checked ones
  const checkedIds = Array.from(document.querySelectorAll(".mcm-member-cb:checked")).map(cb => Number(cb.value));
  await sb.from("committee_members").delete().eq("committee_id", committeeId);
  if(checkedIds.length){
    await sb.from("committee_members").insert(checkedIds.map(mid => ({ committee_id: committeeId, member_id: mid, company_id: currentCompanyId })));
  }

  document.getElementById("mcm-id").value = "";
  document.getElementById("mcm-title-h").textContent = "📋 إضافة لجنة";
  document.getElementById("mcm-name").value=""; document.getElementById("mcm-chairman").value=""; document.getElementById("mcm-appointment-date").value=""; document.getElementById("mcm-scope").value="";
  closeM("m-committee"); loadCommittees();
}
