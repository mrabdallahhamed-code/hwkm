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
  if(seesAllCompanies && viewingPlatformOverview){
    currentCompanyId = null;
    if(sel) sel.value = "__platform__";
    reloadCurrentPageData();
    return;
  }
  currentCompanyId = preferredCompanyId && data.some(c=>c.id===preferredCompanyId) ? preferredCompanyId : data[0].id;
  if(sel) sel.value = currentCompanyId;
  await refreshCompanyTypeVisibility();
  logPlatformStaffAccess();
  reloadCurrentPageData();
}

async function switchCompany(id){
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
