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
  if(!ext) return { pct: 50, strict: true, label: "أغلبية حقوق التصويت الممثلة في الاجتماع (أكثر من 50%)" };
  if(AGM_SPECIAL_RE.test(topicText || "")) return { pct: 75, strict: false, label: "ثلاثة أرباع حقوق التصويت الممثلة (75%) — قرار من القرارات الخاصة" };
  return { pct: 66.67, strict: false, label: "ثلثا حقوق التصويت الممثلة (66.67%)" };
}
function agmEvaluateTopic(agmType, topicText, yesShares, represented){
  const req = agmRequiredMajority(agmType, topicText);
  const yesPct = represented > 0 ? (yesShares / represented) * 100 : 0;
  const passed = represented > 0 && (req.strict ? yesPct > req.pct : yesPct + 1e-9 >= req.pct);
  return { passed, yesPct, req };
}
