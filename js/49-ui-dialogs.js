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

async function go(id, el){
  if(typeof currentCompanyLocked !== "undefined" && currentCompanyLocked && id !== 'mysub'){ id = 'mysub'; el = document.getElementById('navMySub'); }
  currentPageId = id;
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
  if(blocked) return;
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
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');}
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
  header.classList.toggle('collapsed');
  children.classList.toggle('collapsed');
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
