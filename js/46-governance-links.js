/* ══════════ GOVERNANCE LINKS — risk ↔ policy ↔ decision ══════════
   One generic table (governance_links). A link is stored once, from whichever side it was made, and
   shown on both sides. Same-type links are not offered. */
const GOV_LINK_META = { policy:{ label:"سياسة", icon:"📜" }, procedure:{ label:"إجراء", icon:"📋" }, authority:{ label:"صلاحية", icon:"🔑" }, risk:{ label:"خطر", icon:"⚠️" }, decision:{ label:"قرار", icon:"✅" } };

async function govLinkCandidatesRaw(){
  const [pol, dec, risks, proc, auth] = await Promise.all([
    sb.from("policies").select("id,policy_name,category").eq("company_id", currentCompanyId),
    sb.from("board_decisions").select("id,decision_text").eq("company_id", currentCompanyId),
    fetchCompanyRisks(),
    sb.from("procedures").select("id,title,department").eq("company_id", currentCompanyId),
    sb.from("permission_items").select("id,item_name,category").eq("company_id", currentCompanyId)
  ]);
  return {
    policy: (pol.data||[]).map(p => ({ id:p.id, name:p.policy_name||"", cat:p.category||"" })),
    decision: (dec.data||[]).map(d => ({ id:d.id, name:d.decision_text||"", cat:"" })),
    risk: (risks||[]).map(r => ({ id:r.id, name:r.risk_name||"", cat:r.category||"" })),
    procedure: (proc.data||[]).map(p => ({ id:p.id, name:p.title||"", cat:p.department||"" })),
    authority: (auth.data||[]).map(a => ({ id:a.id, name:a.item_name||"", cat:a.category||"" }))
  };
}
let _govCache = { t:0, cand:null, links:null, co:null };
function govCacheClear(){ _govCache = { t:0, cand:null, links:null, co:null }; }
let _govInflight = null;
async function govLoadAll(){
  if(_govCache.cand && _govCache.co === currentCompanyId && Date.now() - _govCache.t < 8000) return _govCache;
  if(_govInflight) return _govInflight;
  _govInflight = (async () => {
    try {
      const [cand, lk] = await Promise.all([ govLinkCandidatesRaw(), sb.from("governance_links").select("*").eq("company_id", currentCompanyId) ]);
      _govCache = { t: Date.now(), cand, links: lk.data || [], co: currentCompanyId };
      govBuildDF(cand);
      return _govCache;
    } finally { _govInflight = null; }
  })();
  return _govInflight;
}
async function govLinkCandidates(){ return (await govLoadAll()).cand; }
/* Arabic-aware keyword overlap used to SUGGEST links (never to create them silently). */
const GOV_STOP = new Set(["سياسه","سياسة","اجراء","إجراء","لائحه","لائحة","نظام","الشركه","الشركة","مع","على","علي","الى","إلى","من","في","عن","هذه","هذا","التي","الذي","او","أو","ثم","كل","بعد","قبل","عند","ذات","ذو","حول","بدون","وفق","حسب"]);
function govTokens(txt){
  return new Set(String(txt||"").replace(/[\u064B-\u0652\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .split(/[^\u0621-\u064Aa-zA-Z0-9]+/).map(w => w.replace(/^(وال|بال|لل|ال|و)(?=.{3,})/,"")).filter(w => w.length >= 3 && !GOV_STOP.has(w)));
}
let _govDF = null;
function govBuildDF(cand){
  const df = {}; let n = 0;
  Object.values(cand).forEach(list => list.forEach(x => { n++; govTokens(x.name + " " + x.cat).forEach(w => { df[w] = (df[w]||0) + 1; }); }));
  _govDF = { df, n };
}
/* Number of RARE shared words (a word is rare if it appears in at most ~8% of all items): common words such as
   "اعتماد" or "الموظف" appear everywhere and would make everything look related. */
function govScore(a, b){
  if(!_govDF) return 0;
  const ta = govTokens(a.name + " " + a.cat), tb = govTokens(b.name + " " + b.cat);
  const maxDf = Math.max(3, Math.round(_govDF.n * 0.08));
  let n = 0; ta.forEach(w => { if(tb.has(w) && (_govDF.df[w]||0) <= maxDf) n++; });
  return n;
}
async function govLinksFor(type, id){
  const { links } = await govLoadAll();
  const out = [];
  links.forEach(l => {
    if(l.source_type === type && String(l.source_id) === String(id)) out.push({ rowId:l.id, type:l.target_type, id:l.target_id });
    else if(l.target_type === type && String(l.target_id) === String(id)) out.push({ rowId:l.id, type:l.source_type, id:l.source_id });
  });
  return out;
}
/* ══ AUTOMATIC LINKING ══ runs silently (at most once a minute per company): links each policy to the
   procedures / authority items / risks whose wording genuinely matches (2+ rare shared words, max 6 per
   type per policy). Covers existing data and anything added later. Links the user removed by hand are
   remembered and never re-created. */
const _govDismissKey = () => "govDismissed:" + currentCompanyId;
function govDismissed(){ try { return new Set(JSON.parse(localStorage.getItem(_govDismissKey()) || "[]")); } catch(e){ return new Set(); } }
function govDismissAdd(keys){ try { const d = govDismissed(); keys.forEach(k => d.add(k)); localStorage.setItem(_govDismissKey(), JSON.stringify([...d])); } catch(e){} }
const _govPairKey = (a, ai, b, bi) => a + ":" + ai + ">" + b + ":" + bi;
let _govAutoAt = {}, _govAutoP = null;
function govAutoLinkOnce(){
  const co = currentCompanyId; if(!co) return Promise.resolve();
  if(_govAutoP && Date.now() - (_govAutoAt[co]||0) < 60000) return _govAutoP;
  _govAutoAt[co] = Date.now();
  _govAutoP = (async () => {
    try {
      const st = await govNetworkState();
      const dis = govDismissed();
      const have = new Set();
      st.links.forEach(l => { have.add(_govPairKey(l.source_type,l.source_id,l.target_type,l.target_id)); have.add(_govPairKey(l.target_type,l.target_id,l.source_type,l.source_id)); });
      const rows = [];
      st.cand.policy.forEach(p => ["procedure","authority","risk"].forEach(t => {
        st.cand[t].map(b => ({ b, sc: govScore(p, b) })).filter(x => x.sc >= 1).sort((x,y) => y.sc - x.sc).slice(0, 8).forEach(({b}) => {
          const k = _govPairKey("policy",p.id,t,b.id);
          if(have.has(k) || dis.has(k)) return;
          rows.push({ company_id: co, source_type:"policy", source_id:p.id, target_type:t, target_id:b.id, created_by:"auto" });
        });
      }));
      st.cand.authority.filter(a => /^\s*-?\s*اعتماد.*(سياسات|لوائح|لائحة)/.test(a.name)).forEach(a => st.cand.policy.forEach(p => {
        const k = _govPairKey("policy",p.id,"authority",a.id);
        if(have.has(k) || dis.has(k) || rows.some(r => r.source_id===p.id && r.target_id===a.id && r.target_type==="authority")) return;
        rows.push({ company_id: co, source_type:"policy", source_id:p.id, target_type:"authority", target_id:a.id, created_by:"auto" });
      }));
      if(rows.length){
        const { error } = await sb.from("governance_links").insert(rows);
        if(!error){ govCacheClear(); _govAutoAt[co] = Date.now(); }
      }
    } catch(e){}
  })();
  return _govAutoP;
}
async function renderGovLinks(boxId, type, id){
  const box = document.getElementById(boxId); if(!box) return;
  await govAutoLinkOnce();
  const links = await govLinksFor(type, id);
  if(!links.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<span class="glink-chip">…</span>';
  const cand = await govLinkCandidates();
  const groups = {};
  links.forEach(l => {
    const item = (cand[l.type]||[]).find(x => String(x.id) === String(l.id));
    if(item) (groups[l.type] = groups[l.type] || []).push(item);
  });
  const types = Object.keys(groups);
  if(!types.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<div class="glink-lbl">مربوطة بـ:</div>' + types.map(t => {
    const det = groups[t].map(x => `<div class="glink-det">${orgEsc(x.name).slice(0,80)}</div>`).join("");
    return `<div class="glink-grp"><button type="button" class="glink-sum" onclick="this.nextElementSibling.classList.toggle('open')">${GOV_LINK_META[t].icon} ${GOV_LINK_META[t].label} (${groups[t].length}) ▾</button><div class="glink-list">${det}</div></div>`;
  }).join("");
}
async function openGovLinkPicker(type, id){
  let m = document.getElementById("m-govlink");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-govlink";
    m.innerHTML = '<div class="modal"><div class="modal-title">ربط بعناصر أخرى</div><div id="govlink-body"></div><div class="modal-foot"><button class="btn btn-ghost" onclick="closeGovLinkPicker()">إلغاء</button><button class="btn btn-gold" id="govlink-save">تأكيد الربط</button></div></div>';
    document.body.appendChild(m);
  }
  const body = document.getElementById("govlink-body");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  m.classList.add("open");
  await govAutoLinkOnce();
  const [cand, existing] = await Promise.all([govLinkCandidates(), govLinksFor(type, id)]);
  const have = new Set(existing.map(l => l.type + ":" + l.id));
  if(!Object.values(cand).some(l => l.length)){ body.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--gray3)">لا توجد عناصر للربط بعد: أضف سياسة أو قراراً أو اطلب تقييم مخاطر أولاً.</div>'; return; }
  const types = Object.keys(GOV_LINK_META).filter(t => t !== type);
  const me = (cand[type]||[]).find(x => String(x.id) === String(id)) || { name:"", cat:"" };
  body.innerHTML = '<input class="fi" id="glink-search" placeholder="ابحث للعثور على عنصر..." style="margin-bottom:6px"><div style="display:flex;gap:8px;margin-bottom:4px"><button class="btn-xs sec" id="glink-pick-sug" type="button">تحديد كل المقترحات</button><span id="glink-hint" style="font-size:12px;color:var(--gray3);align-self:center"></span></div>' + types.map(t => {
    const list = (cand[t] || []).map(x => ({ ...x, _s: govScore(me, x) })).sort((a,b) => b._s - a._s);
    return `<div class="sec-title" style="font-size:13px;margin-top:10px">${GOV_LINK_META[t].icon} ${GOV_LINK_META[t].label}</div>` +
      (list.length ? list.map(x => `<label class="glink-row" data-sug="${x._s>0||have.has(t+":"+x.id)?1:0}" data-txt="${orgEsc(x.name).toLowerCase()}"><input type="checkbox" class="glink-chk" data-type="${t}" data-id="${x.id}" ${have.has(t+":"+x.id)?"checked":""}> <span>${orgEsc(x.name).slice(0,90)}${x._s>0 && !have.has(t+":"+x.id) ? ' <em class="glink-sug">مقترح</em>' : ""}</span></label>`).join("")
                   : `<div style="font-size:12px;color:var(--gray3);padding:6px 0">${t==="risk"?"لا توجد مخاطر بعد — تظهر هنا المخاطر المسجّلة في طلبات تقييم المخاطر.":t==="decision"?"لا توجد قرارات بعد — تظهر هنا القرارات المسجّلة من محاضر الاجتماعات (متابعة القرارات).":t==="procedure"?"لا توجد إجراءات بعد — تُولَّد من صفحة الإجراءات.":t==="authority"?"لا توجد بنود في مصفوفة الصلاحيات بعد.":"لا توجد سياسات."}</div>`);
  }).join("");
  const applyFilter = () => {
    const q = (document.getElementById("glink-search").value||"").trim().toLowerCase();
    let shown = 0, sug = 0;
    body.querySelectorAll(".glink-row").forEach(r => {
      const isSug = r.dataset.sug === "1"; if(isSug) sug++;
      const ok = q ? r.dataset.txt.includes(q) : isSug;
      r.classList.toggle("glink-hide", !ok); if(ok) shown++;
    });
    document.getElementById("glink-hint").textContent = q ? `${shown} نتيجة` : (sug ? `${sug} مقترح — استخدم البحث لعرض غيرها` : "لا توجد مقترحات — استخدم البحث");
  };
  document.getElementById("glink-search").oninput = applyFilter;
  document.getElementById("glink-pick-sug").onclick = () => body.querySelectorAll('.glink-row[data-sug="1"] input').forEach(c => { c.checked = true; });
  applyFilter();
  document.getElementById("govlink-save").onclick = () => saveGovLinks(type, id, existing);
}
function closeGovLinkPicker(){ const m = document.getElementById("m-govlink"); if(m) m.classList.remove("open"); }
async function saveGovLinks(type, id, existing){
  govCacheClear();
  const chosen = [...document.querySelectorAll(".glink-chk:checked")].map(c => ({ type:c.dataset.type, id:Number(c.dataset.id) }));
  const key = x => x.type + ":" + x.id;
  const chosenKeys = new Set(chosen.map(key));
  const toAdd = chosen.filter(c => !existing.some(e => key(e) === key(c)));
  const toRemove = existing.filter(e => !chosenKeys.has(key(e)));
  const { data: u } = await sb.auth.getUser();
  const email = u && u.user ? u.user.email : null;
  if(toAdd.length){
    const { error } = await sb.from("governance_links").insert(toAdd.map(c => ({ company_id: currentCompanyId, source_type:type, source_id:id, target_type:c.type, target_id:c.id, created_by: email })));
    if(error){ alert("تعذّر حفظ الروابط: " + error.message); return; }
  }
  govDismissAdd(toRemove.map(r => type === 'policy' ? _govPairKey('policy',id,r.type,r.id) : _govPairKey(r.type,r.id,type,id)));
  for(const r of toRemove){ await sb.from("governance_links").delete().eq("id", r.rowId); }
  logActivity("تعديل", "روابط الحوكمة", `${GOV_LINK_META[type].label} ${id}`, "");
  govCacheClear();
  closeGovLinkPicker();
  alert(chosen.length ? `تم حفظ الروابط ✅ (${chosen.length})` : "تم إزالة الروابط ✅");
  document.querySelectorAll(`[data-glinks="${type}:${id}"]`).forEach(b => renderGovLinks(b.id, type, id));
}

/* ══════════ GOVERNANCE NETWORK: coverage + auto-suggest wizard ══════════
   Coverage = how well the policy base is actually wired into how the company works:
   a policy with no procedure and no authority item is "inactive on paper"; a procedure or an
   authority item with no policy has no stated basis. The wizard proposes links from keyword
   overlap and applies only what the user confirms. */
async function govNetworkState(){
  govCacheClear();
  const { cand, links } = await govLoadAll();
  const has = (type, id, otherType) => links.some(l =>
    (l.source_type===type && String(l.source_id)===String(id) && l.target_type===otherType) ||
    (l.target_type===type && String(l.target_id)===String(id) && l.source_type===otherType));
  const policiesNoImpl = cand.policy.filter(p => !has("policy", p.id, "procedure") && !has("policy", p.id, "authority"));
  const procNoPolicy = cand.procedure.filter(p => !has("procedure", p.id, "policy"));
  const authNoPolicy = cand.authority.filter(a => !has("authority", a.id, "policy"));
  const total = cand.policy.length + cand.procedure.length + cand.authority.length;
  const bad = policiesNoImpl.length + procNoPolicy.length + authNoPolicy.length;
  return { cand, links, policiesNoImpl, procNoPolicy, authNoPolicy, total, pct: total ? Math.round((total - bad) / total * 100) : null };
}
async function renderGovNetworkCard(){
  await govAutoLinkOnce();
  const box = document.getElementById("dashGovNetwork"); if(!box) return;
  let st; try { st = await govNetworkState(); } catch(e){ box.innerHTML = ""; return; }
  if(!st.total){ box.innerHTML = '<div class="cd-empty"><div class="cd-empty-ico">🔗</div><div class="cd-empty-t">لم يبدأ قياس الترابط بعد</div><div class="cd-empty-s">أضف سياسات وإجراءات وبنود صلاحيات ليبدأ قياس الترابط بينها.</div></div>'; return; }
  const row = (n, text) => n ? `<div class="gn-row"><span class="gn-badge">${n}</span><span>${text}</span></div>` : "";
  box.innerHTML = `<div class="gn-top"><div class="gn-pct ${st.pct>=80?"pg-good":st.pct>=50?"pg-mid":"pg-low"}-t">${st.pct}%</div><div class="gn-mid"><div class="gn-lbl">من عناصر الحوكمة مرتبطة بسند أو تطبيق</div><div class="gn-bar"><i class="${st.pct>=80?"pg-good":st.pct>=50?"pg-mid":"pg-low"}" style="width:${Math.max(3,st.pct)}%"></i></div></div></div>
    ${row(st.policiesNoImpl.length, "سياسة بلا إجراء أو صلاحية تطبّقها (غير مفعّلة)")}
    ${row(st.procNoPolicy.length, "إجراء بلا سياسة كمرجع")}
    ${row(st.authNoPolicy.length, "بند صلاحية بلا سياسة كسند")}
    <button class="btn-xs primary" style="margin-top:10px" onclick="openAutoLinkWizard()">✨ اقترح الروابط تلقائياً</button>`;
}
async function openAutoLinkWizard(){
  let m = document.getElementById("m-autolink");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-autolink";
    m.innerHTML = '<div class="modal"><div class="modal-title">روابط مقترحة تلقائياً</div><div id="autolink-body"></div><div class="modal-foot"><button class="btn btn-ghost" onclick="document.getElementById(\'m-autolink\').classList.remove(\'open\')">إغلاق</button><button class="btn btn-gold" id="autolink-save">اعتماد المحدد</button></div></div>';
    document.body.appendChild(m);
  }
  const body = document.getElementById("autolink-body");
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ تحليل التطابق...</div>';
  m.classList.add("open");
  const st = await govNetworkState();
  const exists = (a, b) => st.links.some(l => (l.source_type===a.t && String(l.source_id)===String(a.x.id) && l.target_type===b.t && String(l.target_id)===String(b.x.id)) || (l.target_type===a.t && String(l.target_id)===String(a.x.id) && l.source_type===b.t && String(l.source_id)===String(b.x.id)));
  const sug = [];
  const pairs = [["policy","procedure"],["policy","authority"],["policy","risk"]];
  pairs.forEach(([ta, tb]) => st.cand[ta].forEach(a => st.cand[tb].forEach(b => {
    const sc = govScore(a, b);
    if(sc >= 1 && !exists({t:ta,x:a},{t:tb,x:b})) sug.push({ ta, a, tb, b, sc });
  })));
  sug.sort((x,y) => y.sc - x.sc);
  const top = sug.slice(0, 40);
  if(!top.length){ body.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--gray3)">لا توجد اقتراحات جديدة. أضف المزيد من السياسات والإجراءات أو اربط يدوياً من بطاقة كل عنصر.</div>'; document.getElementById("autolink-save").style.display = "none"; return; }
  document.getElementById("autolink-save").style.display = "";
  body.innerHTML = '<div style="font-size:12.5px;color:var(--gray3);margin-bottom:8px">الاقتراح مبني على تشابه الكلمات فقط. راجعه وأشّر على ما تراه صحيحاً.</div>' +
    top.map((x,i) => `<label class="glink-row"><input type="checkbox" class="alink-chk" data-i="${i}" ${x.sc>=2?"checked":""}> <span>${GOV_LINK_META[x.ta].icon} ${orgEsc(x.a.name).slice(0,50)} ⇄ ${GOV_LINK_META[x.tb].icon} ${orgEsc(x.b.name).slice(0,50)}${x.sc>=2?' <em class="glink-sug">تطابق قوي</em>':""}</span></label>`).join("");
  document.getElementById("autolink-save").onclick = async () => {
    const chosen = [...document.querySelectorAll(".alink-chk:checked")].map(c => top[Number(c.dataset.i)]);
    if(!chosen.length){ alert("لم تؤشّر على أي اقتراح"); return; }
    const { data: u } = await sb.auth.getUser();
    const email = u && u.user ? u.user.email : null;
    const { error } = await sb.from("governance_links").insert(chosen.map(x => ({ company_id: currentCompanyId, source_type:x.ta, source_id:x.a.id, target_type:x.tb, target_id:x.b.id, created_by: email })));
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    logActivity("إنشاء", "روابط الحوكمة", `${chosen.length} رابط مقترح`, "");
    govCacheClear();
    alert(`تم ربط ${chosen.length} عنصر ✅`);
    m.classList.remove("open");
    renderGovNetworkCard();
  };
}


/* ══ INSTANT APPROVAL CHECK ══ shown right when someone sets who approves an item in the authority matrix
   (or changes a policy's approval level) — not as a standing dashboard alert. */
function govApprovalNeed(lvl){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  return lvl === "جمعية عامة" ? { re:/جمعية|مساهم|شركاء/, word:"الجمعية العامة" }
    : lvl === "داخلية" ? { re:/حوكم|تنفيذي|ادارة|إدارة|مدير/, word:"الحوكمة أو الإدارة التنفيذية" }
    : noBoard ? { re:/مالك|مدير/, word:"المالك/المدير" } : { re:/مجلس|لجنة|رئيس المجلس|عضو/, word:"مجلس الإدارة" };
}
function govNotice(msg){
  let n = document.getElementById("govNotice");
  if(!n){ n = document.createElement("div"); n.id = "govNotice"; n.className = "gov-toast"; n.onclick = () => n.classList.remove("open"); document.body.appendChild(n); }
  n.innerHTML = msg + '<div style="font-size:11px;opacity:.7;margin-top:6px">اضغط للإغلاق</div>';
  n.classList.add("open"); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove("open"), 20000);
}
async function govCheckApprovalNow(itemId){
  try {
    const co = currentCompanyId;
    const [pol, it, hd, lk] = await Promise.all([
      sb.from("policies").select("id,policy_name,approval_level").eq("company_id", co),
      sb.from("permission_items").select("id,item_name").eq("company_id", co),
      sb.from("permission_holders").select("id,name").eq("company_id", co),
      sb.from("governance_links").select("*").eq("company_id", co)
    ]);
    const items = (it.data||[]).filter(x => (!itemId || String(x.id) === String(itemId)) && /^\s*-?\s*اعتماد/.test(x.item_name||""));
    if(!items.length || !(pol.data||[]).length) return;
    const cells = (await sb.from("permission_cells").select("item_id,holder_id,code").in("item_id", items.map(x => x.id))).data || [];
    const hn = {}; (hd.data||[]).forEach(h => hn[h.id] = h.name || "");
    const msgs = [], seen = new Set();
    items.forEach(item => {
      const apprs = cells.filter(c => c.item_id === item.id && c.code === "ع").map(c => hn[c.holder_id]).filter(Boolean);
      if(!apprs.length) return;
      const general = /(سياسات|لوائح|لائحة)/.test(item.item_name);
      const linked = new Set((lk.data||[]).filter(l => (l.source_type==="policy" && l.target_type==="authority" && l.target_id===item.id) || (l.target_type==="policy" && l.source_type==="authority" && l.source_id===item.id)).map(l => l.source_type==="policy" ? l.source_id : l.target_id));
      const bad = (pol.data||[]).filter(p => (general || linked.has(p.id)) && !apprs.some(a => govApprovalNeed(p.approval_level || "مجلس الإدارة").re.test(a)));
      if(!bad.length) return;
      const key = item.item_name.trim() + "|" + apprs.join(",");
      if(seen.has(key)) return; seen.add(key);
      const need = [...new Set(bad.map(p => govApprovalNeed(p.approval_level || "مجلس الإدارة").word))].join(" / ");
      msgs.push(`«${orgEsc(item.item_name)}» اعتماده بيد: <b>${orgEsc(apprs.join("، "))}</b>، بينما السياسات (${orgEsc(bad.slice(0,3).map(p => p.policy_name).join("، "))}${bad.length>3?" …":""}) تتطلب اعتماد <b>${need}</b>.`);
    });
    if(msgs.length) govNotice("⚠️ <b>مراجعة مقترحة — قد يكون هذا خروجاً عن الصلاحيات</b><br>" + msgs.slice(0,3).join("<br><br>"));
  } catch(e){ console.error("approval check failed", e); }
}
