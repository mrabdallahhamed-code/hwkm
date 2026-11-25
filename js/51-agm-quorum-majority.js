/* ══ AGM QUORUM SETTINGS — default = Saudi Companies Law (Arts. 92–93); editable per company where the
   Articles of Association set a different (permitted) figure ══ */
const QUORUM_LAW = { agm_ordinary_quorum_1: 25, agm_ordinary_quorum_2: 0, agm_extraordinary_quorum_1: 50, agm_extraordinary_quorum_2: 25, agm_extraordinary_quorum_3: 0, board_quorum_percentage: 50 };
const QUORUM_FIELDS = { "qs-o1":"agm_ordinary_quorum_1", "qs-o2":"agm_ordinary_quorum_2", "qs-e1":"agm_extraordinary_quorum_1", "qs-e2":"agm_extraordinary_quorum_2", "qs-e3":"agm_extraordinary_quorum_3", "qs-b":"board_quorum_percentage" };
async function loadQuorumSettings(){
  const row = document.getElementById("quorumSettingsRow"); if(!row || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("agm_ordinary_quorum_1,agm_ordinary_quorum_2,agm_extraordinary_quorum_1,agm_extraordinary_quorum_2,agm_extraordinary_quorum_3,board_quorum_percentage").eq("id", currentCompanyId).maybeSingle();
  if(error || !data){ row.style.display = "none"; return; }
  let custom = false;
  Object.entries(QUORUM_FIELDS).forEach(([id, col]) => {
    const v = data[col] != null ? Number(data[col]) : QUORUM_LAW[col];
    document.getElementById(id).value = v;
    if(v !== QUORUM_LAW[col]) custom = true;
  });
  const src = document.getElementById("quorumSettingsSrc");
  src.innerHTML = custom ? "المصدر الحالي: <b style=\"color:#b0701c\">النظام الأساس للشركة (قيم معدّلة)</b>" : "المصدر الحالي: <b style=\"color:var(--green)\">نظام الشركات (الافتراضي)</b>";
  row.style.display = "block";
  callRightBox(data);
}
/* م90: من يحق له طلب دعوة الجمعية — مراجع الحسابات أو لجنة المراجعة، أو مساهمون يملكون 10% فأكثر من أسهم التصويت */
async function callRightBox(){
  const box = document.getElementById("agmCallRight"); if(!box) return;
  try {
    const [{ data: co }, { data: sh }] = await Promise.all([
      sb.from("companies").select("total_shares").eq("id", currentCompanyId).single(),
      sb.from("shareholders").select("name,shares_count").eq("company_id", currentCompanyId)
    ]);
    const total = Number(co && co.total_shares) || 0;
    const big = (sh || []).filter(x => total && (Number(x.shares_count) || 0) / total >= 0.10);
    let h = '<b>حق طلب دعوة الجمعية (م90):</b> يجب على مجلس الإدارة دعوة الجمعية متى طلب ذلك مراجع الحسابات أو لجنة المراجعة، أو مساهمون يملكون 10% فأكثر من أسهم التصويت، وذلك خلال <b>30 يومًا</b> من تاريخ الطلب؛ فإن لم يدعُ المجلس في هذه المدة جاز لمراجع الحسابات دعوتها.<br>';
    if(!total) h += '<span style="color:var(--gray3)">أدخل إجمالي أسهم الشركة ليحسب النظام المساهمين الذين يبلغون 10%.</span>';
    else if(big.length) h += 'مساهمون منفردون يبلغون 10% فأكثر: ' + big.map(x => orgEsc(x.name || "") + " (" + (((Number(x.shares_count) || 0) / total) * 100).toFixed(1) + "%)").join("، ") + ". ويجوز أن يجتمع عدة مساهمين لبلوغ النسبة.";
    else h += 'لا يبلغ أي مساهم منفردًا 10%؛ ويجوز أن يجتمع عدة مساهمين لبلوغ النسبة.';
    box.innerHTML = h;
  } catch(e){ box.style.display = "none"; }
}
async function saveQuorumSettings(){
  const upd = {}; const bad = [];
  Object.entries(QUORUM_FIELDS).forEach(([id, col]) => {
    const el = document.getElementById(id), v = Number(el.value);
    if(el.value === "" || isNaN(v) || v < Number(el.min) || v > Number(el.max)) bad.push(el.previousElementSibling.textContent + ` (من ${el.min} إلى ${el.max})`);
    upd[col] = v;
  });
  if(bad.length){ alert("قيمة خارج الحدود النظامية:\n- " + bad.join("\n- ")); return; }
  const { error } = await sb.from("companies").update(upd).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "إعداد الجمعية", "النصاب القانوني", Object.entries(upd).map(([k,v]) => `${k}=${v}`).join("، "));
  alert("تم حفظ النصاب ✅ — يسري على الجمعيات والاجتماعات القادمة.");
  loadQuorumSettings();
}
async function restoreQuorumDefaults(){
  if(!await uiConfirm("استعادة النصاب إلى ما نص عليه نظام الشركات؟")) return;
  const { error } = await sb.from("companies").update(QUORUM_LAW).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "إعداد الجمعية", "النصاب القانوني", "استعادة نظام الشركات");
  loadQuorumSettings();
}


/* ══ MAJORITY RULES FOR AGM RESOLUTIONS (Saudi Companies Law, Arts. 92–93) ══
   Ordinary: a majority (more than half) of the voting rights REPRESENTED at the meeting.
   Extraordinary: two-thirds of the represented rights — except capital increase/decrease, extending the
   company's term, dissolving it early, merging or splitting it: three-quarters. Abstentions count as
   represented, so they weigh against approval. A company's Articles may require more; use the
   per-topic override below when they do. */
const AGM_SPECIAL_RE = /زيادة\s*(رأس\s*)?المال|تخفيض\s*(رأس\s*)?المال|تخفيض\s*رأس|إطالة\s*مدة|تمديد\s*مدة|حل\s*الشركة|اندماج|الاندماج|دمج\s*الشركة|تقسيم\s*الشركة/;
function agmRequiredMajority(agmType, topicText){
  const ext = /غير\s*عادية/.test(agmType || "");
  if(!ext) return { pct: 50, strict: true, label: "أغلبية حقوق التصويت الممثلة في الاجتماع (أكثر من 50%) — السند: م92/3" };
  if(AGM_SPECIAL_RE.test(topicText || "")) return { pct: 75, strict: false, label: "ثلاثة أرباع حقوق التصويت الممثلة (75%) — قرار من القرارات الخاصة — السند: م93/4" };
  return { pct: 66.67, strict: false, label: "ثلثا حقوق التصويت الممثلة (66.67%) — السند: م93/4" };
}
function agmEvaluateTopic(agmType, topicText, yesShares, represented){
  const req = agmRequiredMajority(agmType, topicText);
  const yesPct = represented > 0 ? (yesShares / represented) * 100 : 0;
  const passed = represented > 0 && (req.strict ? yesPct > req.pct : yesPct + 1e-9 >= req.pct);
  return { passed, yesPct, req };
}


/* ══ سجل إفصاحات أعضاء المجلس لمساهمي الشركة (لائحة حوكمة الشركات م89/2) — دالة قاعدة البيانات get_disclosure_register ══ */
function showDisclosureRegisterRow(){
  const row = document.getElementById("shDiscRegisterRow");
  if(row) row.style.display = /مساهمة/.test(currentCompanyType || "") ? "block" : "none";
}
async function openDisclosureRegister(){
  let m = document.getElementById("m-disc-register");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-disc-register";
    m.innerHTML = '<div class="modal" style="max-width:720px"><div class="modal-title">سجل إفصاحات أعضاء مجلس الإدارة</div><div style="font-size:11.5px;color:var(--gray3);line-height:1.8;margin-bottom:10px">يتيح للمساهمين الاطلاع على إفصاحات الأعضاء دون مقابل (م89/2 من لائحة حوكمة الشركات).</div><div id="discRegBody"></div><div class="modal-foot"><button class="btn btn-ghost" onclick="document.getElementById(\'m-disc-register\').classList.remove(\'open\')">إغلاق</button></div></div>';
    document.body.appendChild(m);
  }
  const body = document.getElementById("discRegBody");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);padding:12px">جارِ التحميل...</div>';
  m.classList.add("open");
  const { data, error } = await sb.rpc("get_disclosure_register", { p_company: currentCompanyId });
  if(error){ body.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل السجل. ' + orgEsc(error.message || "") + '</div>'; return; }
  const rows = Array.isArray(data) ? data : [];
  body.innerHTML = rows.length ? rows.map(r => {
    const om = Array.isArray(r.other_memberships) ? r.other_memberships : [];
    return '<div style="border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;margin-bottom:8px"><b>' + orgEsc(r.full_name || "") + '</b> <span style="font-size:11.5px;color:var(--gray3)">— ' + orgEsc(r.membership_capacity || "") + (r.term_start ? ' — بداية الدورة ' + orgEsc(r.term_start) : '') + '</span>' +
      (om.length ? '<div style="font-size:12px;margin-top:6px">عضويات أخرى: ' + om.map(o => orgEsc((o.company_name || "") + (o.legal_form ? " (" + o.legal_form + ")" : "") + (o.capacity ? " — " + o.capacity : ""))).join("؛ ") + '</div>' : '<div style="font-size:12px;color:var(--gray3);margin-top:6px">لا عضويات أخرى مصرَّح بها.</div>') + '</div>';
  }).join("") : '<div style="text-align:center;color:var(--gray3);padding:12px">لا توجد إفصاحات مسجَّلة بعد.</div>';
}
