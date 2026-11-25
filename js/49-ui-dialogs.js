/* ══════════ Friendly dialogs: toasts instead of alert(), real dialogs instead of confirm()/prompt() ══════════ */
(function(){
  let css = document.createElement("style");
  css.textContent = `
  #uiToastHost{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100vw - 24px));pointer-events:none}
  .ui-toast{pointer-events:auto;display:flex;gap:10px;align-items:flex-start;background:#fff;color:#0D2447;border-radius:12px;box-shadow:0 8px 28px rgba(13,36,71,.22);border-inline-start:5px solid #1A3A6B;padding:11px 14px;font-size:13px;line-height:1.8;white-space:pre-line;direction:rtl;text-align:right;animation:uiIn .18s ease-out}
  .ui-toast.err{border-inline-start-color:#C0392B;background:#FFF6F5}.ui-toast.ok{border-inline-start-color:#1B7F4B;background:#F3FBF6}
  .ui-toast .tx{flex:1;word-break:break-word}.ui-toast button{background:none;border:none;font-size:18px;line-height:1;cursor:pointer;color:#5b6678;padding:0 2px}
  @keyframes uiIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
  #uiDlgBg{position:fixed;inset:0;background:rgba(13,36,71,.55);z-index:100002;display:flex;align-items:center;justify-content:center;padding:16px}
  #uiDlg{background:#fff;border-radius:14px;max-width:460px;width:100%;padding:20px 20px 16px;box-shadow:0 18px 50px rgba(0,0,0,.3);direction:rtl;text-align:right;font-family:inherit}
  #uiDlg .msg{font-size:13.5px;line-height:1.9;color:#0D2447;white-space:pre-line;word-break:break-word;margin-bottom:12px}
  #uiDlg textarea,#uiDlg input{width:100%;box-sizing:border-box;border:1.5px solid #cfd6e0;border-radius:8px;padding:9px 10px;font-family:inherit;font-size:13px;margin-bottom:12px;direction:rtl}
  #uiDlg .row{display:flex;gap:8px;justify-content:flex-start}
  #uiDlg button{border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  #uiDlg .okb{background:#1A3A6B;color:#fff}#uiDlg .okb.danger{background:#C0392B}#uiDlg .cb{background:#EEF1F5;color:#0D2447}`;
  document.head.appendChild(css);
  const en = () => (typeof currentLang !== "undefined" && currentLang === "en");
  function host(){ let h = document.getElementById("uiToastHost"); if(!h){ h = document.createElement("div"); h.id = "uiToastHost"; h.setAttribute("role","status"); h.setAttribute("aria-live","polite"); document.body.appendChild(h); } return h; }
  window.uiToast = function(message){
    const text = String(message == null ? "" : message);
    const err = /تعذّر|تعذر|خطأ|فشل|لا يمكن|غير مسموح|error|failed/i.test(text);
    const ok = !err && (/^\s*(✅|تم)|🎉/.test(text));
    const t = document.createElement("div"); t.className = "ui-toast" + (err ? " err" : ok ? " ok" : "");
    const tx = document.createElement("div"); tx.className = "tx"; tx.textContent = text;
    const x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label","close"); x.textContent = "×";
    t.appendChild(tx); t.appendChild(x);
    const h = host(); h.appendChild(t); while(h.children.length > 4) h.removeChild(h.firstChild);
    let timer; const close = () => { clearTimeout(timer); if(t.parentNode) t.parentNode.removeChild(t); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, Math.min(22000, (err ? 7000 : 4000) + text.length * 55)); };
    x.onclick = close; t.onmouseenter = () => clearTimeout(timer); t.onmouseleave = arm; arm();
  };
  window.__uiAlert = window.uiToast;
  function dialog(message, opts){
    return new Promise(resolve => {
      const prev = document.activeElement;
      const bg = document.createElement("div"); bg.id = "uiDlgBg";
      const d = document.createElement("div"); d.id = "uiDlg"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true");
      const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = (en() && typeof translateText === "function") ? translateText(String(message == null ? "" : message)) : String(message == null ? "" : message); d.appendChild(msg);
      let field = null;
      if(opts.prompt){ const long = String(message).length > 60 || /\n/.test(String(message)); field = document.createElement(long ? "textarea" : "input"); if(long) field.rows = 3; field.value = opts.def == null ? "" : String(opts.def); d.appendChild(field); }
      const row = document.createElement("div"); row.className = "row";
      const ok = document.createElement("button"); ok.type = "button"; ok.className = "okb" + (!opts.prompt && /حذف|إلغاء الاشتراك|نهائيًا|نهائيا|إزالة|رفض|delete|remove/i.test(String(message)) ? " danger" : ""); ok.textContent = en() ? "Confirm" : "تأكيد";
      const cn = document.createElement("button"); cn.type = "button"; cn.className = "cb"; cn.textContent = en() ? "Cancel" : "إلغاء";
      row.appendChild(ok); row.appendChild(cn); d.appendChild(row); bg.appendChild(d); document.body.appendChild(bg);
      const done = v => { document.removeEventListener("keydown", key, true); if(bg.parentNode) bg.parentNode.removeChild(bg); try{ prev && prev.focus && prev.focus(); }catch(e){} resolve(v); };
      const key = e => { if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); done(opts.prompt ? null : false); } else if(e.key === "Enter" && !(field && field.tagName === "TEXTAREA")){ e.preventDefault(); e.stopPropagation(); ok.click(); } };
      document.addEventListener("keydown", key, true);
      ok.onclick = () => done(opts.prompt ? field.value : true); cn.onclick = () => done(opts.prompt ? null : false);
      bg.addEventListener("mousedown", e => { if(e.target === bg) cn.click(); });
      setTimeout(() => (field || ok).focus(), 30);
    });
  }
  window.uiConfirm = m => dialog(m, {});
  window.uiPrompt = (m, def) => dialog(m, { prompt:true, def });
})();

/* Auto-refresh: re-load the page you are looking at every 40 seconds (and when you return to the tab),
   unless you are typing, a window is open, or the page is an editor — so changes by others appear without F5. */
const AUTO_REFRESH_SKIP_PAGES = ['govassess','reports','procedures'];
let __lastAutoRefresh = Date.now();
function autoRefreshTick(force){
  try{
    if(document.visibilityState !== 'visible' || !currentCompanyId) return;
    if(!force && Date.now() - __lastAutoRefresh < 35000) return;
    if(document.querySelector('.modal-bg.open')) return;
    const ae = document.activeElement;
    if(ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
    if(AUTO_REFRESH_SKIP_PAGES.includes(currentPageId)) return;
    __lastAutoRefresh = Date.now();
    reloadCurrentPageData();
  }catch(e){}
}
setInterval(() => autoRefreshTick(false), 40000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') autoRefreshTick(false); });

function goBack(){
  const h = window.__pageHist || [];
  if(h.length < 2) return;
  h.pop(); const prev = h[h.length-1];
  window.__goingBack = true; go(prev, null);
}
async function go(id, el){
  if(typeof applySubscriptionLock === "function" && typeof currentCompanyExpiredRaw !== "undefined") applySubscriptionLock(currentCompanyExpiredRaw); // يعيد التقييم بعد اكتمال تحميل الملف الشخصي
  if(typeof currentCompanyLocked !== "undefined" && currentCompanyLocked && id !== 'mysub'){ id = 'mysub'; el = document.getElementById('navMySub'); }
  currentPageId = id;
  try{
    window.__pageHist = window.__pageHist || [];
    if(window.__goingBack){ window.__goingBack = false; }
    else if(window.__pageHist[window.__pageHist.length-1] !== id){ window.__pageHist.push(id); if(window.__pageHist.length > 30) window.__pageHist.shift(); }
    const bb = document.getElementById('backBtn'); if(bb) bb.style.display = window.__pageHist.length > 1 ? '' : 'none';
  }catch(e){}
  if(companyTypeReadyPromise){ try{ await companyTypeReadyPromise; }catch(e){} }
  const role = currentUserProfile ? getCurrentRole() : null;
  const blocked = role && !isPageAllowed(id, role);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(blocked){
    const rp = document.getElementById('p-restricted');
    if(rp) rp.classList.add('active');
    const t0 = titles[id] ? titles[id][0] : id;
    document.getElementById('restrictedTitle').textContent = t0 + ' — غير متاح';
    document.getElementById('restrictedRole').textContent = role;

    // Distinguish "not in your package" from an actual role restriction — only the former
    // gets the upsell treatment; a real permission wall still shows the plain message.
    const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
    const moduleKey = MODULE_PAGE_MAP[id];
    const isModuleBlock = moduleKey && !currentCompanyModules[moduleKey] && !isPlatformAdmin;
    document.getElementById('restrictedGenericIcon').style.display = isModuleBlock ? 'none' : 'block';
    document.getElementById('restrictedGenericBody').style.display = isModuleBlock ? 'none' : 'block';
    document.getElementById('restrictedUpgradeBlock').style.display = isModuleBlock ? 'block' : 'none';
    if(isModuleBlock){
      pendingUpgradeModuleKey = moduleKey;
      const pkgInfo = { risk_management: { name: (currentLang==='en'?'Partner':'شريك'), desc: 'إدارة المخاطر المؤسسية بشكل رقمي كامل — سجل حي، متابعة خطط المعالجة، وتنبيهات استباقية.' },
                        internal_audit: { name: (currentLang==='en'?'Partner':'شريك'), desc: 'إدارة كاملة لخطة التدقيق الداخلي وتنفيذها ومتابعتها رقميًا، بدل ملفات إكسل متناثرة.' } }[moduleKey];
      document.getElementById('restrictedPkgName').textContent = pkgInfo?.name || 'أعلى';
      document.getElementById('restrictedUpgradeDesc').textContent = pkgInfo?.desc || '';
    }
  } else {
    const pg=document.getElementById('p-'+id);
    if(pg) pg.classList.add('active');
  }
  if(el) el.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.getAttribute('onclick')&&n.getAttribute('onclick').includes("'"+id+"'")) n.classList.add('active');
  });
  const t=titles[id]||[id,''];
  document.getElementById('ptitle').textContent=t[0];
  document.getElementById('psub').textContent=t[1];
  closeSidebar();
  try{ refreshNavGroupsVisibility(); syncNavOpen(); renderMobileTabbar(); }catch(e){}
  if(blocked) return;
  if(id==='hub') renderNavHub();
  if(id==='dashboard') loadDashboard();
  if(id==='companyrequest') loadCompanyRequestPage();
  if(id==='companyrequests') loadCompanyRequestsReview();
  if(id==='activitylog') loadActivityLog();
  if(id==='shareholders') loadShareholders();
  if(id==='indicators') loadIndicatorsReport();
  if(id==='adminrequests'){ switchAdminRequestsTab('companyrequests'); loadCompanyRequestsReview(); loadManageCompanies(); loadAuditAdmin(); loadRiskAdmin(); }
  if(id==='platformdashboard' || id==='platformcompanies') loadPlatformDashboard();
  if(id==='mysub') renderMySubscription();
  if(id==='platformusers') loadPlatformUsers();
  if(id==='platformactivity') loadPlatformActivity();
  if(id==='members') loadMembers();
  if(id==='governance') loadPolicies();
  if(id==='announcements') loadAnnouncementsPageList();
  if(id==='meetings' || id==='committees' || id==='agm') loadMeetingsAll();
  if(id==='risks') loadRisks();
  if(id==='compliance') loadCompliance();
  if(id==='signing') loadSigning();
  if(id==='committees') loadCommittees();
  if(id==='procedures'){ loadProcedures(); }
  if(id==='structure'){ loadStructure(); renderApprovalStatus('structure','structureApprovalStatus'); }
  if(id==='permissions'){ loadPermissionsMatrix(); loadMatrixApprovalStatus(); }
  if(id==='voting') loadVotingPage();
  if(id==='circulation') loadCirculation();
  if(id==='audit') loadAudit();
  if(id==='govassess'){ document.getElementById('govassessListView').style.display='block'; document.getElementById('govassessFormView').style.display='none'; loadGovAssessments(); }
  if(id==='consultants') loadConsultantsPage();
  if(id==='perf') loadPerf();
  if(id==='decisiontracking') loadDecisionTracking();
  if(id==='managerdecisions') loadSimpleDecisions('manager');
  if(id==='ownerdecisions') loadSimpleDecisions('owner');
  if(id==='appoint'){ loadAppointRequests(); loadReviewSection(); }
  if(id==='reports') loadReportsPage();
  if(id==='archive') loadArchive();
  if(id==='users') loadUsers();
}
let __modalReturnFocus = {};
let __modalStack = [];   // order in which windows were opened, so Esc closes the one on top
function openM(id){
  const bg = document.getElementById(id); if(!bg) return;
  bg.classList.add('open');
  __modalStack = __modalStack.filter(x => x !== id); __modalStack.push(id);
  try{
    const m = bg.querySelector('.modal'); const t = bg.querySelector('.modal-title');
    if(m){ m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); if(t){ if(!t.id) t.id = id + '-title'; m.setAttribute('aria-labelledby', t.id); } }
    __modalReturnFocus[id] = document.activeElement;
    setTimeout(() => { const f = bg.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button.btn-gold,button'); if(f && bg.classList.contains('open') && !bg.contains(document.activeElement)) f.focus({ preventScroll:true }); }, 30);
  }catch(e){}
}
function closeM(id){
  const bg = document.getElementById(id); if(!bg) return;
  bg.classList.remove('open');
  __modalStack = __modalStack.filter(x => x !== id);
  try{ const r = __modalReturnFocus[id]; delete __modalReturnFocus[id]; if(r && r.focus && document.contains(r)) r.focus({ preventScroll:true }); }catch(e){}
}
function switchAGMTab(name){
  document.querySelectorAll('#m-agm-view [data-agmtab]').forEach(t=>t.classList.toggle('active', t.dataset.agmtab===name));
  document.querySelectorAll('#m-agm-view [data-agmpane]').forEach(p=>p.classList.toggle('active', p.dataset.agmpane===name));
  const body = document.querySelector('#m-agm-view .fp-body');
  if(body) body.scrollTop = 0;
}
function switchMeetingDetailTab(name){
  document.querySelectorAll('#m-meeting-view [data-mdtab]').forEach(t=>t.classList.toggle('active', t.dataset.mdtab===name));
  document.querySelectorAll('#m-meeting-view [data-mdpane]').forEach(p=>p.classList.toggle('active', p.dataset.mdpane===name));
  const body = document.querySelector('#m-meeting-view .fp-body');
  if(body) body.scrollTop = 0;
}
document.querySelectorAll('.modal-bg').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});
/* Collapsible nav sections — works for both the top-level group headers and the nested
   sub-group headers (اجتماعات المجلس / الجمعية العامة) with the same function, since both
   follow the identical header+children pairing convention (id="grp-X" / id="grp-X-children"). */
function toggleNavGroup(id){
  const header = document.getElementById('grp-'+id);
  const children = document.getElementById('grp-'+id+'-children');
  if(!header || !children) return;
  const opening = children.classList.contains('collapsed');
  if(opening) document.querySelectorAll('#companyNavGroups .nav-group-header').forEach(h => {   // قسم واحد مفتوح في كل مرة
    if(h === header) return;
    h.classList.add('collapsed'); const c = document.getElementById(h.id + '-children'); if(c) c.classList.add('collapsed');
  });
  header.classList.toggle('collapsed', !opening);
  children.classList.toggle('collapsed', !opening);
}
/* الضغط على اسم القسم: يتوسع في الشريط وتُفتح في الصفحة بطاقات ما تحته */
function navGroupClick(id){
  window.__hubGroup = id;
  /* القسم المفتوح يُطوى بضغطة على اسمه (بلا الانتقال لصفحة أخرى)، والمطوي يُفتح مع صفحة بطاقاته */
  const ch0 = document.getElementById('grp-'+id+'-children');
  if(window.innerWidth > 900 && ch0 && !ch0.classList.contains('collapsed')){ toggleNavGroup(id); return; }
  /* على الجوال القائمة تغطي الصفحة، فيتوسع القسم في القائمة نفسها ويختار منه العميل مباشرة */
  if(window.innerWidth <= 900){ const c = document.getElementById('grp-'+id+'-children'); if(c) toggleNavGroup(id); return; }
  go('hub', null);
}
/* قسم لم يبقَ فيه أي عنصر ظاهر (بحسب نوع الكيان أو الصلاحية) يختفي كله بدل أن يظهر فارغًا */
function refreshNavGroupsVisibility(){
  document.querySelectorAll('#companyNavGroups .nav-group').forEach(g => {
    if(g.id === 'adminNavGroup' || g.id === 'companyRequestNavGroup') return;   // هاتان لهما منطقهما الخاص
    const has = [...g.querySelectorAll('.nav-item')].some(i => i.style.display !== 'none');
    g.style.display = has ? '' : 'none';
  });
}
/* يفتح القسم الذي فيه الصفحة الحالية ويطوي الباقي (إن لم نعرف القسم نترك الحال كما هو) */
function syncNavOpen(){
  const root = document.getElementById('companyNavGroups'); if(!root) return;
  let gid = null;
  if(currentPageId === 'hub') gid = window.__hubGroup || null;
  else { const act = root.querySelector('.nav-item.active'); const ch = act && act.closest('.nav-group-children'); if(ch) gid = ch.id.replace(/^grp-/,'').replace(/-children$/,''); }
  if(!gid) return;
  root.querySelectorAll('.nav-group-header').forEach(h => {
    const id = h.id.replace(/^grp-/,''); const c = document.getElementById(h.id + '-children'); const open = id === gid;
    h.classList.toggle('collapsed', !open); if(c) c.classList.toggle('collapsed', !open); h.classList.toggle('has-active', open);
  });
}
const HUB_DESC = {
  dashboard:'نظرة شاملة على حالة الحوكمة والمؤشرات', mysub:'باقتك الحالية وتاريخ الاشتراك',
  governance:'سياسات الشركة واعتمادها', structure:'الهيكل التنظيمي والأوصاف الوظيفية', procedures:'إجراءات العمل المعتمدة',
  permissions:'من يملك أي صلاحية في الشركة', perf:'تقييم أداء الأعضاء والإدارة', reports:'تقارير الحوكمة الجاهزة', govassess:'قياس مدى فعالية الحوكمة',
  meetings:'جدولة الاجتماعات والمحاضر', members:'أعضاء المجلس وملفاتهم', committees:'لجان المجلس ومهامها', appoint:'رفع طلب تعيين عضو جديد',
  decisiontracking:'متابعة تنفيذ القرارات', circulation:'قرارات بالتمرير دون اجتماع', managerdecisions:'قرارات المدير الموثقة', indicators:'المؤشرات المالية والتشغيلية',
  agm:'الجمعيات العامة والتصويت عليها', ownerdecisions:'قرارات المالك الموثقة', announcements:'الإفصاحات للشركات المدرجة (إعلانات تداول)',
  shareholders:'سجل المساهمين أو الشركاء وحصصهم', voting:'التصويت الإلكتروني على البنود',
  risks:'سجل المخاطر وخطط المعالجة', audit:'خطة التدقيق الداخلي ومتابعتها', compliance:'الالتزام بالأنظمة واللوائح',
  signing:'وثائق تنتظر التوقيع الإلكتروني', archive:'أرشيف الوثائق والمستندات'
};
function renderNavHub(){
  const root = document.getElementById('companyNavGroups'); const grid = document.getElementById('hubGrid'); if(!root || !grid) return;
  let gid = window.__hubGroup; const gEl = gid ? document.getElementById('navg-'+gid) : null;
  if(!gid || !gEl || gEl.style.display === 'none'){ const f = [...root.querySelectorAll('.nav-group')].filter(x => x.style.display !== 'none').map(x => x.querySelector('.nav-group-header')).find(Boolean); gid = f ? f.id.replace(/^grp-/,'') : null; window.__hubGroup = gid; }
  const head = gid ? document.getElementById('grp-'+gid) : null;
  const label = head ? (head.querySelector('.nav-group-label')||{}).textContent : '';
  document.getElementById('ptitle').textContent = label || 'الأقسام';
  document.getElementById('psub').textContent = 'اختر الصفحة التي تريدها';
  const kids = [...document.querySelectorAll('#grp-'+gid+'-children .nav-item')].filter(n => n.style.display !== 'none');
  const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  grid.innerHTML = kids.length ? kids.map((n,i) => {
    const pid = ((n.getAttribute('onclick')||'').match(/go\('([a-z]+)'/)||[])[1];
    const ic = n.querySelector('.ni-icon'); const icls = ic ? [...ic.classList].filter(c => /^ico-/.test(c)).join(' ') : 'ico-dashboard';
    let bd = n.querySelector('.ni-badge'); if(bd && (bd.style.display === 'none' || !bd.textContent.trim())) bd = null; const t = n.querySelector('.ni-text');
    return `<button type="button" class="hub-card${n.classList.contains('nav-locked')?' locked':''}" data-hub="${i}"><span class="hub-ic"><span class="ico ${icls}"></span></span><span class="hub-tx"><b>${esc(t?t.textContent:'')}</b><small>${esc(HUB_DESC[pid]||'')}</small></span>${bd?`<span class="ni-badge ${[...bd.classList].filter(c=>c!=='ni-badge').join(' ')}">${esc(bd.textContent)}</span>`:''}</button>`;
  }).join('') : '<div class="hub-empty">لا توجد صفحات متاحة لك في هذا القسم.</div>';
  grid.querySelectorAll('.hub-card').forEach(b => b.addEventListener('click', () => { const n = kids[+b.dataset.hub]; if(n) n.click(); }));
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}
async function submitRequest(){
  const candidate_name = document.getElementById("apr-name").value.trim();
  if(!candidate_name){ alert("الرجاء إدخال اسم المرشح"); return; }
  const request_type = document.getElementById("apr-type").value;
  const proposed_position = document.getElementById("apr-position").value;
  const id_number = document.getElementById("apr-idnumber").value.trim();
  const qualification = document.getElementById("apr-qualification").value.trim();
  const experience = document.getElementById("apr-experience").value;
  const specialization = document.getElementById("apr-specialization").value;
  const justification = document.getElementById("apr-justification").value.trim();

  const { error } = await sb.from("appoint_requests").insert([{
    candidate_name, request_type, proposed_position, id_number, qualification, experience, specialization, justification, status: "جديد", company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  document.getElementById("apr-name").value = "";
  document.getElementById("apr-idnumber").value = "";
  document.getElementById("apr-qualification").value = "";
  document.getElementById("apr-justification").value = "";

  const msg=document.getElementById("req-msg");
  msg.style.display="block";
  setTimeout(()=>{msg.style.display="none";},4000);
  loadAppointRequests();
}

const APPOINT_TYPE_ICONS = {
  "تعيين عضو مجلس إدارة جديد": "🧑‍💼",
  "تعيين عضو لجنة متخصصة": "👥",
  "تجديد عضوية عضو حالي": "🔁",
  "إحلال عضو بديل": "🔄"
};
const APPOINT_STATUS_STYLE = {
  "جديد": { bg: "var(--offwhite)", color: "var(--gray3)", border: "var(--gray1)" },
  "محال إلى مجلس الإدارة": { bg: "#EAF0F8", color: "var(--primary)", border: "#C9D9EE" },
  "معتمد": { bg: "#E8F8EF", color: "var(--green)", border: "#BFEBD1" },
  "مرفوض": { bg: "#FDE8E8", color: "var(--red)", border: "#F5C6C6" }
};

async function loadAppointRequests(){
  const thead = document.getElementById("appointRequestsThead");
  const tbody = document.getElementById("appointRequestsTbody");
  if(!tbody) return;
  if(thead){
    thead.innerHTML = '<tr>' +
      ['المرشح','نوع الطلب','المنصب المقترح','التخصص','التاريخ','الحالة'].map(h =>
        `<th style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;padding:12px 14px;font-size:11.5px">${h}</th>`
      ).join('') + '</tr>';
  }

  const { data, error } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  if(!data || data.length===0){ tbody.innerHTML = emptyRowHTML(6, "لا توجد طلبات مقدَّمة بعد."); return; }

  // Group requests by type (عضو مجلس / عضو لجنة ...) so each category's requests sit together
  const groups = {};
  data.forEach(r => {
    const cat = r.request_type || "أخرى";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  });

  let rows = "";
  Object.keys(groups).forEach(cat => {
    const icon = APPOINT_TYPE_ICONS[cat] || "📋";
    rows += `<tr><td colspan="6" style="background:var(--offwhite);border-right:4px solid var(--gold);font-weight:800;color:var(--primary);font-size:12px;padding:10px 16px">${icon} ${cat}</td></tr>`;
    groups[cat].forEach(r => {
      const initial = (r.candidate_name||"؟").trim().charAt(0);
      const st = APPOINT_STATUS_STYLE[r.status] || APPOINT_STATUS_STYLE["جديد"];
      rows += `<tr>
        <td style="padding:12px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${initial}</div>
            <span style="font-weight:700;color:var(--dark)">${orgEsc(r.candidate_name||"")}</span>
          </div>
        </td>
        <td style="font-size:12px;color:var(--gray3)">${r.request_type||"—"}</td>
        <td style="font-size:12.5px;font-weight:600">${r.proposed_position||"—"}</td>
        <td style="font-size:12px;color:var(--gray3)">${r.specialization||"—"}</td>
        <td style="font-size:12px;color:var(--gray3)">${r.created_at ? new Date(r.created_at).toLocaleDateString("ar-SA-u-ca-gregory") : "—"}</td>
        <td>
          <select onchange="updateRequestStatus(${r.id}, this.value)" style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:8px;cursor:pointer;background:${st.bg};color:${st.color};border:1.5px solid ${st.border}">
            <option ${r.status==="جديد"?"selected":""}>جديد</option>
            <option ${r.status==="محال إلى مجلس الإدارة"?"selected":""}>محال إلى مجلس الإدارة</option>
            <option ${r.status==="معتمد"?"selected":""}>معتمد</option>
            <option ${r.status==="مرفوض"?"selected":""}>مرفوض</option>
          </select>
        </td>
      </tr>`;
    });
  });
  tbody.innerHTML = rows;
}

async function updateRequestStatus(id, status){
  const { error } = await sb.from("appoint_requests").update({ status }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  loadAppointRequests();
}

/* شريط أقسام ثابت أسفل الصفحة على الجوال: الرئيسية والمجلس والجمعية والحوكمة والرقابة ثم «المزيد» (القائمة كاملة) */
const M_TABS = [['home','الرئيسية','ico-home'],['boardmeetings','المجلس','ico-calendar'],['generalassembly','الجمعية','ico-handshake'],['governance','الحوكمة','ico-columns'],['riskcontrol','الرقابة','ico-warning']];
function renderMobileTabbar(){
  const bar = document.getElementById('mTabbar'); if(!bar) return;
  const app = document.getElementById('appWrapper');
  const nav = document.getElementById('companyNavGroups');
  const show = window.innerWidth <= 900 && app && app.style.display !== 'none' && nav && nav.style.display !== 'none' && document.querySelector('#navg-home');
  bar.style.display = show ? 'flex' : 'none';
  document.body.classList.toggle('has-tabbar', !!show);
  if(!show) return;
  const cur = (() => { const act = nav.querySelector('.nav-item.active'); const ch = act && act.closest('.nav-group-children'); return currentPageId === 'hub' ? window.__hubGroup : (ch ? ch.id.replace(/^grp-/,'').replace(/-children$/,'') : null); })();
  const tabs = M_TABS.filter(t => { const g = document.getElementById('navg-'+t[0]); return g && g.style.display !== 'none'; });
  bar.innerHTML = tabs.map(t => `<button type="button" class="mt-btn${cur===t[0]?' on':''}" data-g="${t[0]}"><span class="ico ${t[2]}"></span><span>${t[1]}</span></button>`).join('')
    + `<button type="button" class="mt-btn" data-g="more"><span class="ico ico-menu"></span><span>المزيد</span></button>`;
  bar.querySelectorAll('.mt-btn').forEach(b => b.onclick = () => {
    const g = b.dataset.g;
    if(g === 'more'){ toggleSidebar(); return; }
    if(g === 'home'){ go('dashboard', null); return; }
    window.__hubGroup = g; go('hub', null);
  });
}
window.addEventListener('resize', () => { try{ renderMobileTabbar(); }catch(e){} });
