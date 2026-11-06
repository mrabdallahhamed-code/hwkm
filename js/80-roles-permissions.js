/* ══════════ ROLES & PERMISSIONS ══════════ */
const OWNER_ROLES = ['مالك','ممثل المالك'];
const FULL_ACCESS_ROLES = ['مدير النظام'];
function isFullAccessRole(r){ return FULL_ACCESS_ROLES.includes(r) || (r === getCurrentRole() && myPermissionOverrides && myPermissionOverrides['*'] === 'edit'); }

const SHAREHOLDER_PAGES = ['agm','voting','signing','circulation'];
let currentShareholdersSeeReports = false;   // يحدده مدير النظام/إدارة حوكم لكل شركة
// An employee starts with the least a staff member needs; the approver adds anything more per person
// from the permissions page (a per-user override is checked before this list and always wins).
const EMPLOYEE_PAGES = ['dashboard','governance','signing'];

// A person's role can differ per company they belong to (e.g. board member at one company,
// shareholder-only at another) — always resolve against whichever company is currently
// selected, not a single global role.
// Module a platform-team staffer has FULL control over (their specialty) — everything else
// they touch inside a company is either read-only (governance context, since it informs their
// work) or fully blocked, per the page-group map below.
const PLATFORM_TEAM_FULL_PAGE = { 'تدقيق داخلي':'audit', 'مخاطر':'risks', 'التزام':'compliance' };
/* الموظف قد يحمل أكثر من تخصص، مفصولة بـ «،» مثل: تدقيق داخلي،مخاطر */
function teamModules(v){ return String(v||'').split(/[،,]/).map(x => x.trim()).filter(Boolean); }
function teamHas(v, name){ const m = teamModules(v); return m.includes('حوكمة') || m.includes(name); }
function teamFullPages(v){ return teamModules(v).map(x => PLATFORM_TEAM_FULL_PAGE[x]).filter(Boolean); }
// Governance staff are the one exception — full access everywhere, same as a real "مدير النظام".
const GOVERNANCE_VIEW_ONLY_PAGES = ['governance','govassess','structure','members','permissions','reports','dashboard','appoint','perf'];

function getCurrentRole(){
  // Platform owners manage every tenant on the platform — whatever company they're currently
  // viewing, they need the same full access a real "مدير النظام" of that company would have
  // (permissions page, activity log, editing every section), even though they intentionally
  // hold no membership row anywhere (see the company-less-by-design note in loadCurrentUserProfile).
  if(currentUserProfile && currentUserProfile.is_platform_admin === true) return 'مدير النظام';

  // Platform team members hold a NARROW specialty (audit/risk/compliance) or the broad
  // "حوكمة" specialty (full access everywhere, like an owner). Their effective role varies by
  // WHICH PAGE they're currently on: full control on their own module's page, read-only on
  // governance-adjacent pages (since seeing policies/structure genuinely helps their work), and
  // isPageAllowed() blocks everything else outright.
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  if(teamModule){
    if(teamHas(teamModule,'حوكمة')) return 'مدير النظام';
    if(teamFullPages(teamModule).includes(currentPageId)) return 'مدير النظام';
    if(GOVERNANCE_VIEW_ONLY_PAGES.includes(currentPageId)) return 'عضو مجلس';
    return 'عضو مجلس'; // isPageAllowed() is what actually blocks pages outside their scope
  }

  const membership = userMemberships.find(m => m.company_id === currentCompanyId);
  // The owner and the owner's representative hold the owner's full authority, so they act with full access.
  const rawR = (membership && membership.role) ? membership.role : (currentUserProfile ? (currentUserProfile.role || 'عضو مجلس') : 'عضو مجلس');
  return OWNER_ROLES.includes(rawR) ? 'مدير النظام' : rawR;
}
function getRawRole(){
  const m = userMemberships.find(x => x.company_id === currentCompanyId);
  return (m && m.role) || (currentUserProfile && currentUserProfile.role) || '';
}

function applyShareholderSidebar(){
  const allowed = SHAREHOLDER_PAGES.concat(currentShareholdersSeeReports ? ['reports'] : []);
  const root = document.getElementById('companyNavGroups');
  if(!root) return;
  root.querySelectorAll('.nav-item').forEach(item => {
    const m = (item.getAttribute('onclick') || '').match(/go\('([a-z]+)'/);
    item.style.display = (m && allowed.includes(m[1])) ? '' : 'none';
    item.classList.remove('active');
  });
  const hasVisible = el => [...el.querySelectorAll('.nav-item')].some(i => i.style.display !== 'none');
  // المجموعات الفرعية: نخفي العنوان والمحتوى معًا إن لم يبقَ فيها شيء، ونفتحها إن بقي
  root.querySelectorAll('.nav-subgroup-children').forEach(ch => {
    const head = ch.previousElementSibling && ch.previousElementSibling.classList.contains('nav-subgroup-header') ? ch.previousElementSibling : null;
    const show = hasVisible(ch);
    ch.style.display = show ? '' : 'none';
    if(head) head.style.display = show ? '' : 'none';
    if(show){ ch.classList.remove('collapsed'); if(head) head.classList.remove('collapsed'); }
  });
  root.querySelectorAll('.nav-group').forEach(g => {
    const show = hasVisible(g);
    g.style.display = show ? '' : 'none';
    if(show) g.querySelectorAll('.collapsed').forEach(c => c.classList.remove('collapsed'));
  });
  const adminGroup = document.getElementById('adminNavGroup'); if(adminGroup) adminGroup.style.display = 'none';
  const reqGroup = document.getElementById('companyRequestNavGroup'); if(reqGroup) reqGroup.style.display = 'none';
}

async function applyRolePermissions(){
  const role = getCurrentRole();
  const isShareholder = role === 'مساهم';
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  const isPlatformTeamMember = !!teamModule && !isPlatformAdmin;
  const hasNoCompany = currentUserProfile && userMemberships.length === 0;

  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avEl = document.getElementById('sidebarUserAv');
  const displayName = currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email || "مستخدم") : "مستخدم";
  if(nameEl) nameEl.textContent = displayName;
  if(roleEl) roleEl.textContent = isPlatformAdmin ? "المؤسس" : (isPlatformTeamMember ? `فريق حوكم — ${teamModule}` : (hasNoCompany ? "بانتظار ربط شركة" : role));
  if(avEl) avEl.textContent = displayName.trim().charAt(0) || "م";

  const btnAddCompany = document.getElementById('btnAddCompany');
  if(btnAddCompany) btnAddCompany.style.display = isPlatformAdmin ? 'inline-block' : 'none';

  // Platform owners get a dedicated, minimal sidebar (aggregate dashboard/permissions/activity/
  // requests across every tenant) until they actually pick a specific company from the switcher
  // — at which point the full sidebar takes over exactly as a real "مدير النظام" of that company
  // would see it. Team members with a narrow specialty get the same landing concept, but scoped
  // down to just "إدارة الطلبات" (their own module's back-office tab) — the aggregate dashboard/
  // permissions/activity pages stay owner-only. Regular users never see this toggle at all.
  if((isPlatformAdmin || isPlatformTeamMember) && viewingPlatformOverview){
    document.getElementById('platformOverviewNavGroup').style.display = 'block';
    document.getElementById('companyNavGroups').style.display = 'none';
    document.querySelectorAll('#platformOverviewNavGroup .nav-item').forEach(item=>{
      const pageId = item.getAttribute('onclick')?.match(/go\('([a-z]+)'/)?.[1];
      const ownerOnly = ['platformdashboard','platformcompanies','platformusers','platformactivity'];
      item.style.display = (isPlatformTeamMember && ownerOnly.includes(pageId)) ? 'none' : '';
    });
    const landingPage = isPlatformTeamMember ? 'adminrequests' : 'platformdashboard';
    const validPages = isPlatformTeamMember ? ['adminrequests'] : ['platformdashboard','platformcompanies','platformusers','platformactivity','adminrequests'];
    if(!validPages.includes(currentPageId)){
      go(landingPage);
    }
    restrictMutatingButtons();
    startMutationGuard();
    return;
  }
  document.getElementById('platformOverviewNavGroup').style.display = 'none';
  document.getElementById('companyNavGroups').style.display = 'block';

  if(hasNoCompany && !isPlatformAdmin && !isPlatformTeamMember){
    // No company yet: hide every other section and force the "request a company" page —
    // this account has nothing to see until an owner request is approved.
    document.querySelectorAll('.nav-group').forEach(g => { g.style.display = 'none'; });
    document.getElementById('companyRequestNavGroup').style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(item=>{ item.style.display = ''; });
    go('companyrequest');
    restrictMutatingButtons();
    startMutationGuard();
    return;
  }

  // Sidebar shows every item/group otherwise — access is enforced per-page in go()
  document.getElementById('adminNavGroup').style.display = 'block';
  document.getElementById('companyRequestNavGroup').style.display = isPlatformAdmin ? 'block' : 'none';
  document.querySelectorAll('.nav-item').forEach(item=>{ item.style.display = ''; });
  await refreshCompanyTypeVisibility();

  if(isPlatformTeamMember && !teamHas(teamModule,'حوكمة')){
    // Narrow specialty inside a company: hide every nav item outside their own module and the
    // governance-adjacent read-only set, matching exactly what isPageAllowed() would block.
    const allowedPages = [...teamFullPages(teamModule), ...GOVERNANCE_VIEW_ONLY_PAGES];
    document.querySelectorAll('#companyNavGroups .nav-item').forEach(item => {
      const pageId = item.getAttribute('onclick')?.match(/go\('([a-z]+)'/)?.[1];
      if(pageId && !allowedPages.includes(pageId)) item.style.display = 'none';
    });
    document.getElementById('adminNavGroup').style.display = 'none';
  }

  if(isShareholder){
    // المساهم: القائمة الجانبية تبقى لكن بثلاث صفحات فقط (الجمعية، التصويت، التوقيع)،
    // وتُضاف «تقارير الحوكمة» فقط إذا أذن بها مدير النظام أو إدارة حوكم لهذه الشركة.
    currentShareholdersSeeReports = false;
    try{
      const { data: shFlag } = await sb.from("companies").select("shareholders_see_reports").eq("id", currentCompanyId).maybeSingle();
      currentShareholdersSeeReports = !!(shFlag && shFlag.shareholders_see_reports === true);
    }catch(e){}
    applyShareholderSidebar();
    go('agm');
  }

  restrictMutatingButtons();
  startMutationGuard();
  loadNotifications();
  if(!window._notifIntervalStarted){
    window._notifIntervalStarted = true;
    setInterval(loadNotifications, 60000); // refresh every minute for a "live" feel
  }
}

let currentCompanyType = null;
let currentCompanyEntityVerified = false; // نوع الكيان وُثّق من فريق المنصة
let currentCompanyLLCSingleManager = false;
let currentCompanyLLCSingleOwner = false;
const LLC_SINGLE_MANAGER_HIDDEN_PAGES = ['meetings','members','appoint','indicators','decisiontracking'];
const LLC_SINGLE_OWNER_HIDDEN_PAGES = ['agm','voting'];

function isPageAllowed(pageId, role){
  // A per-user override always wins, before any role-based logic runs — this is what makes
  // the "add/remove access for this one person" promise actually true, not just a role tweak.
  const override = myPermissionOverrides[pageId];
  if(override === 'none') return false;
  if(override === 'view' || override === 'edit') return true;

  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  const hasNoCompany = currentUserProfile && userMemberships.length === 0;
  if(pageId === 'mysub') return true;
  if(pageId === 'adminrequests') return isPlatformAdmin || !!teamModule;
  if(pageId === 'platformdashboard' || pageId === 'platformcompanies') return isPlatformAdmin;
  if(pageId === 'platformusers') return isPlatformAdmin;
  if(pageId === 'platformactivity') return isPlatformAdmin;
  if(pageId === 'companyrequests') return isPlatformAdmin;
  if(pageId === 'managecompanies') return isPlatformAdmin;
  if(pageId === 'auditadmin') return isPlatformAdmin;
  if(pageId === 'companyrequest') return true;
  if(hasNoCompany && !isPlatformAdmin && !teamModule) return false;
  // A narrow-specialty team member (audit/risk/compliance) is blocked from any company page
  // outside their own module and the governance-adjacent read-only set — "حوكمة" staff are the
  // one specialty exempted from this, since their whole job is full-breadth access.
  if(teamModule && !teamHas(teamModule,'حوكمة') && !isPlatformAdmin){
    const allowedPages = [...teamFullPages(teamModule), ...GOVERNANCE_VIEW_ONLY_PAGES];
    if(!allowedPages.includes(pageId)) return false;
  }
  if(pageId === 'users') return role === 'مدير النظام';
  if(pageId === 'activitylog') return role === 'مدير النظام';
  if(pageId === 'circulation' && !/مساهمة/.test(currentCompanyType || '')) return false;
  if(role === 'مساهم') return SHAREHOLDER_PAGES.includes(pageId) || (pageId === 'reports' && currentShareholdersSeeReports === true);
  if(role === 'موظف') return EMPLOYEE_PAGES.includes(pageId);
  if(currentCompanyType === 'مؤسسة فردية' && SOLE_PROP_HIDDEN_PAGES.includes(pageId)) return false;
  if(currentCompanyType === 'ذات مسؤولية محدودة' && LLC_HIDDEN_PAGES.includes(pageId)) return false;
  if(currentCompanyLLCSingleManager && LLC_SINGLE_MANAGER_HIDDEN_PAGES.includes(pageId)) return false;
  if(currentCompanyLLCSingleOwner && LLC_SINGLE_OWNER_HIDDEN_PAGES.includes(pageId)) return false;
  if(pageId === 'managerdecisions' && !currentCompanyLLCSingleManager) return false;
  if(pageId === 'ownerdecisions' && !(currentCompanyLLCSingleOwner || currentCompanyType === 'مؤسسة فردية')) return false;
  if(MODULE_PAGE_MAP[pageId] && !currentCompanyModules[MODULE_PAGE_MAP[pageId]] && !isPlatformAdmin) return false;
  return true;
}
