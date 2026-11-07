async function loadCompanies(preferredCompanyId){
  const sel = document.getElementById("companySwitcher");
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isTeamMember = currentUserProfile && currentUserProfile.platform_team_module && !isPlatformAdmin;
  const seesAllCompanies = isPlatformAdmin || isTeamMember;

  // Regular users now see every company they hold a membership in (could be more than one);
  // the platform owner AND narrow-specialty team members additionally see every tenant on the
  // platform — team members need this to review companies' data within their specialty.
  const memberCompanyIds = userMemberships.map(m => m.company_id).filter(Boolean);
  const query = seesAllCompanies
    ? sb.from("companies").select("*").order("id",{ascending:true})
    : (memberCompanyIds.length ? sb.from("companies").select("*").in("id", memberCompanyIds).order("id",{ascending:true}) : sb.from("companies").select("*").eq("id", -1));
  const { data, error } = await query;

  if(error || !data || data.length===0){
    if(sel) sel.innerHTML = seesAllCompanies ? '<option value="__platform__"><span class="ico-i ico-home"></span>نظرة عامة على المنصة</option>' : '<option>لا توجد شركة مرتبطة بحسابك</option>';
    currentCompanyId = null;
    reloadCurrentPageData();
    return;
  }
  if(sel){
    const companyOptions = data.map(c => `<option value="${c.id}">${orgEsc(c.name)}</option>`).join("");
    sel.innerHTML = seesAllCompanies ? `<option value="__platform__"><span class="ico-i ico-home"></span>نظرة عامة على المنصة</option>${companyOptions}` : companyOptions;
  }
  csBuild(data, seesAllCompanies);
  if(seesAllCompanies && viewingPlatformOverview){
    currentCompanyId = null;
    if(sel) sel.value = "__platform__";
    csSync();
    reloadCurrentPageData();
    return;
  }
  currentCompanyId = preferredCompanyId && data.some(c=>c.id===preferredCompanyId) ? preferredCompanyId : data[0].id;
  if(sel) sel.value = currentCompanyId;
  csSync();
  await refreshCompanyTypeVisibility();
  logPlatformStaffAccess();
  reloadCurrentPageData();
}

async function switchCompany(id){
  { const s0 = document.getElementById("companySwitcher"); if(s0 && String(s0.value) !== String(id)) s0.value = id; csSync(); csRecent(id); }
  if(id === "__platform__"){
    viewingPlatformOverview = true;
    currentCompanyId = null;
    await loadMyPermissionOverrides();
    await applyRolePermissions(); // already redirects to platformdashboard if needed
    return;
  }
  viewingPlatformOverview = false;
  currentCompanyId = Number(id);
  await loadMyPermissionOverrides();
  await applyRolePermissions();
  await refreshCompanyTypeVisibility();
  logPlatformStaffAccess();
  checkPendingApprovalBadges();
  const platformOnlyPages = ['adminrequests','platformdashboard','platformcompanies','platformusers','platformactivity'];
  if(platformOnlyPages.includes(currentPageId)){
    go('dashboard');
  } else {
    reloadCurrentPageData();
  }
}

function reloadCurrentPageData(){
  if(!currentCompanyId) return; // no company assigned yet — nothing to load
  const activePage = document.querySelector('.page.active');
  if(!activePage) { loadMembers(); loadMeetingsAll(); return; }
  const id = activePage.id.replace('p-','');
  loadMembers(); loadMeetingsAll();
  if(id==='governance') loadPolicies();
  if(id==='announcements') loadAnnouncementsPageList();
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
  if(id==='dashboard') loadDashboard();
  if(id==='companyrequest') loadCompanyRequestPage();
  if(id==='companyrequests') loadCompanyRequestsReview();
  if(id==='activitylog') loadActivityLog();
  if(id==='shareholders') loadShareholders();
  if(id==='indicators') loadIndicatorsReport();
  if(id==='adminrequests'){ switchAdminRequestsTab('companyrequests'); loadCompanyRequestsReview(); loadManageCompanies(); loadAuditAdmin(); loadRiskAdmin(); }
  if(id==='platformdashboard' || id==='platformcompanies') loadPlatformDashboard();
  if(id==='platformusers') loadPlatformUsers();
  if(id==='platformactivity') loadPlatformActivity();
}


/* ══════════ منتقي الشركات (زر + لوحة بحث) — يبقى <select> الأصلي مخفيًا مصدرًا للقيمة حتى لا يتأثر باقي الكود ══════════ */
let csItems = [], csSeesAll = false, csHl = -1;
function csStatus(c){
  const now = new Date();
  if(c.trial_ends_at && new Date(c.trial_ends_at) > now) return ["تجربة", "t"];
  if(c.converted_to_paid_at || (c.subscription_ends_at && new Date(c.subscription_ends_at) > now)) return ["مشترك", "p"];
  if(c.trial_ends_at) return ["منتهية", "x"];
  return ["", ""];
}
function csBuild(companies, seesAll){
  csSeesAll = !!seesAll;
  csItems = companies.map(c => ({ id: String(c.id), name: c.name || "", st: seesAll ? csStatus(c) : ["", ""] }));
  const sel = document.getElementById("companySwitcher"), w = document.getElementById("csWrap");
  if(!sel || !w) return;
  sel.classList.add("cs-hidden"); w.style.display = "";
  csClose();
}
function csCurrentLabel(){
  const sel = document.getElementById("companySwitcher");
  return sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : "";
}
function csSync(){
  const l = document.getElementById("csLabel"); if(!l) return;
  l.textContent = csCurrentLabel() || "—";
  const b = document.getElementById("csBtn"); if(b) b.title = l.textContent;
}
function csRecentList(){ try{ return JSON.parse(localStorage.getItem("hwkm_recent_co") || "[]"); }catch(e){ return []; } }
function csRecent(id){
  if(id === "__platform__" || id == null) return;
  try{ const r = csRecentList().filter(x => String(x) !== String(id)); r.unshift(String(id)); localStorage.setItem("hwkm_recent_co", JSON.stringify(r.slice(0, 4))); }catch(e){}
}
function csToggle(ev){
  if(ev) ev.stopPropagation();
  const p = document.getElementById("csPanel"); if(!p) return;
  if(p.style.display !== "none"){ csClose(); return; }
  if(csItems.length < 2 && !csSeesAll) return; // شركة واحدة: لا حاجة للقائمة
  p.style.display = "block"; document.getElementById("csBtn").setAttribute("aria-expanded", "true");
  const s = document.getElementById("csSearch"); s.value = ""; csRender(""); setTimeout(() => s.focus(), 30);
}
function csClose(){
  const p = document.getElementById("csPanel"); if(p) p.style.display = "none";
  const b = document.getElementById("csBtn"); if(b) b.setAttribute("aria-expanded", "false");
}
function csNorm(t){ return String(t || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase().trim(); }
function csRender(q){
  const box = document.getElementById("csList"); if(!box) return;
  const cur = document.getElementById("companySwitcher").value, nq = csNorm(q);
  const row = (id, name, st, extra) => `<div class="cs-item ${extra||""} ${String(id)===String(cur)?"cur":""}" role="option" data-id="${orgEsc(id)}" onclick="csPick(this.dataset.id)"><span>${orgEsc(name)}</span>${st && st[0] ? `<span class="cs-chip ${st[1]}">${st[0]}</span>` : ""}</div>`;
  let html = "";
  if(csSeesAll && (!nq || csNorm("نظرة عامة على المنصة").includes(nq))) html += row("__platform__", "نظرة عامة على المنصة", null, "plat");
  const list = csItems.filter(c => !nq || csNorm(c.name).includes(nq));
  if(!nq && csItems.length > 6){
    const rec = csRecentList().map(id => csItems.find(c => c.id === String(id))).filter(Boolean);
    if(rec.length){ html += '<div class="cs-sec">الأخيرة</div>' + rec.map(c => row(c.id, c.name, c.st)).join(""); html += '<div class="cs-sec">كل الشركات</div>'; }
  }
  html += list.map(c => row(c.id, c.name, c.st)).join("");
  if(!list.length && !(csSeesAll && html)) html = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">لا توجد شركة بهذا الاسم</div>';
  box.innerHTML = html; csHl = -1;
  const cnt = document.getElementById("csCount"); if(cnt) cnt.textContent = csItems.length > 1 ? (nq ? list.length + " من " : "") + csItems.length + " شركة" : "";
}
function csKey(e){
  const items = [...document.querySelectorAll("#csList .cs-item")];
  if(e.key === "Escape"){ csClose(); return; }
  if(!items.length) return;
  if(e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault(); csHl = e.key === "ArrowDown" ? Math.min(items.length - 1, csHl + 1) : Math.max(0, csHl - 1);
    items.forEach((it, i) => it.classList.toggle("hl", i === csHl)); items[csHl].scrollIntoView({ block: "nearest" });
  } else if(e.key === "Enter"){
    e.preventDefault(); const it = items[csHl >= 0 ? csHl : 0]; if(it) csPick(it.dataset.id);
  }
}
function csPick(id){
  csClose();
  const sel = document.getElementById("companySwitcher"); if(!sel) return;
  sel.value = id; csSync();
  switchCompany(id);
}
document.addEventListener("click", (e) => { const w = document.getElementById("csWrap"); if(w && !w.contains(e.target)) csClose(); });
