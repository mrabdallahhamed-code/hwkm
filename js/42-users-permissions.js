/* ══════════ COMPOSABLE PERMISSIONS: role (base) + per-user overrides (add/remove on top) ══════════
   The role system (FULL_ACCESS_ROLES, SHAREHOLDER_PAGES, etc.) still decides default access —
   this layer lets an admin grant or revoke access to SPECIFIC pages for a SPECIFIC person,
   entirely from the UI, without needing new code for each case. An override always wins over
   whatever the role would otherwise decide, for that one person and that one page. */
const ALL_PAGE_IDS_FOR_OVERRIDES = ['procedures',
  'dashboard','users','meetings','members','risks','compliance','signing','committees','agm',
  'governance','govassess','archive','structure','permissions','perf','voting','circulation','audit',
  'reports','appoint','consultants','announcements'
];
let myPermissionOverrides = {}; // page_id -> 'view' | 'edit' | 'none', for the CURRENTLY LOGGED-IN person

async function loadMyPermissionOverrides(){
  myPermissionOverrides = {};
  if(!currentUserProfile) return;
  // A person's full override set always applies, whether they're currently inside a specific
  // company or on a platform-level page — load both scopes together rather than picking one.
  const queries = [ sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", currentUserProfile.email).is("company_id", null) ];
  if(currentCompanyId){
    queries.push(sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", currentUserProfile.email).eq("company_id", currentCompanyId));
  }
  const results = await Promise.all(queries);
  results.forEach(({ data }) => (data||[]).forEach(r => { myPermissionOverrides[r.page_id] = r.access_level; }));
}

const PLATFORM_LEVEL_PAGE_IDS = ['platformdashboard','platformcompanies','platformusers','platformactivity','adminrequests','companyrequests','managecompanies','auditadmin','riskadmin'];

/* ══════════ ADMIN UI: grant/revoke a specific person's access, page by page ══════════ */
let permOverrideDraftEmail = null;
let permOverrideDraft = {}; // page_id -> access_level, edited in the modal before saving

let permOverrideDraftScope = null; // null (platform-level) or a company_id

async function openUserPermissionOverridesModal(email, displayName, scopeCompanyId){
  permOverrideDraftEmail = email;
  permOverrideDraftScope = scopeCompanyId != null ? scopeCompanyId : null;
  document.getElementById("upo-title").textContent = `🔧 صلاحيات مخصّصة — ${displayName||email}${permOverrideDraftScope===null?' (مستوى المنصة)':''}`;
  let query = sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", email);
  query = permOverrideDraftScope === null ? query.is("company_id", null) : query.eq("company_id", permOverrideDraftScope);
  const { data } = await query;
  permOverrideDraft = {};
  (data||[]).forEach(r => { permOverrideDraft[r.page_id] = r.access_level; });
  renderUserPermissionOverridesList();
  openM("m-user-permission-overrides");
}

const PLATFORM_LEVEL_PAGE_TITLES = {
  platformdashboard: "لوحة تحكم المنصة", platformcompanies: "الشركات", platformusers: "فريق المنصة والمستخدمين",
  platformactivity: "سجل نشاط المنصة", adminrequests: "إدارة الطلبات",
  companyrequests: "طلبات إدراج الشركات", managecompanies: "إدارة الشركات", auditadmin: "إدارة طلبات المراجعة الداخلية", riskadmin: "إدارة طلبات المخاطر"
};

function renderUserPermissionOverridesList(){
  const box = document.getElementById("upo-list");
  const pageIds = permOverrideDraftScope === null ? PLATFORM_LEVEL_PAGE_IDS : ALL_PAGE_IDS_FOR_OVERRIDES;
  box.innerHTML = pageIds.map(pageId => {
    const label = (titles[pageId] && titles[pageId][0]) || PLATFORM_LEVEL_PAGE_TITLES[pageId] || pageId;
    const current = permOverrideDraft[pageId] || "افتراضي";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray1)">
      <span style="font-size:12.5px;font-weight:700">${label}</span>
      <select class="fs" style="width:150px;font-size:11.5px;padding:6px 8px" onchange="permOverrideDraft['${pageId}']=this.value==='افتراضي'?undefined:this.value">
        <option ${current==='افتراضي'?'selected':''} value="افتراضي">افتراضي (حسب الدور)</option>
        <option ${current==='edit'?'selected':''} value="edit"><span class="ico-i ico-edit"></span>تعديل كامل</option>
        <option ${current==='view'?'selected':''} value="view"><span class="ico-i ico-eye"></span>عرض فقط</option>
        <option ${current==='none'?'selected':''} value="none"><span class="ico-i ico-xcircle"></span>بدون وصول</option>
      </select>
    </div>`;
  }).join("");

  const quickBox = document.getElementById("upo-quick-restrict-list");
  if(quickBox){
    quickBox.innerHTML = pageIds.map(pageId => {
      const label = (titles[pageId] && titles[pageId][0]) || PLATFORM_LEVEL_PAGE_TITLES[pageId] || pageId;
      const currentlyAllowed = permOverrideDraft[pageId] === 'view' || permOverrideDraft[pageId] === 'edit';
      return `<label style="display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12px;cursor:pointer">
        <input type="checkbox" data-qr-page="${pageId}" ${currentlyAllowed?'checked':''} style="accent-color:var(--gold);width:14px;height:14px;flex-shrink:0"/>
        ${label}
      </label>`;
    }).join("");
  }
}

function applyQuickRestrict(){
  const pageIds = permOverrideDraftScope === null ? PLATFORM_LEVEL_PAGE_IDS : ALL_PAGE_IDS_FOR_OVERRIDES;
  const allowed = new Set([...document.querySelectorAll("#upo-quick-restrict-list [data-qr-page]:checked")].map(cb => cb.dataset.qrPage));
  pageIds.forEach(pageId => {
    permOverrideDraft[pageId] = allowed.has(pageId) ? 'view' : 'none';
  });
  renderUserPermissionOverridesList();
  alert(`تم تقييد الوصول لـ${allowed.size} صفحة فقط. اضغط "✅ حفظ" بالأسفل عشان يصير فعليًا — أو عدّل أي صفحة يدويًا بالقائمة تحت لو تبي "تعديل كامل" بدل "عرض فقط".`);
}

async function saveUserPermissionOverrides(){
  // Simplest reliable approach for a small per-user list: clear this person's overrides for
  // this scope, then re-insert whatever is left in the draft — avoids tracking individual
  // adds/removes/updates separately.
  let delQuery = sb.from("user_permission_overrides").delete().ilike("user_email", permOverrideDraftEmail);
  delQuery = permOverrideDraftScope === null ? delQuery.is("company_id", null) : delQuery.eq("company_id", permOverrideDraftScope);
  await delQuery;
  const rows = Object.entries(permOverrideDraft)
    .filter(([,level]) => level)
    .map(([page_id, access_level]) => ({ company_id: permOverrideDraftScope, user_email: permOverrideDraftEmail, page_id, access_level }));
  if(rows.length){
    const { error } = await sb.from("user_permission_overrides").insert(rows);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  }
  alert(`تم حفظ الصلاحيات المخصّصة ✅ — على "${permOverrideDraftEmail}" تسجيل خروج ثم دخول من جديد ليطبَّق التغيير.`);
  closeM("m-user-permission-overrides");
}

let usersPageCache = { memberships: [], profileByEmail: {}, roles: [], isSoleProp: false, myEmail: null };

async function toggleEditGrant(email, on){
  if(getCurrentRole() !== 'مدير النظام'){ alert("هذه الصلاحية لمدير النظام فقط"); return; }
  const em = String(email||"").toLowerCase();
  await sb.from("user_permission_overrides").delete().eq("company_id", currentCompanyId).eq("page_id","*").ilike("user_email", likeEsc(em));
  if(on){
    const { error } = await sb.from("user_permission_overrides").insert([{ company_id: currentCompanyId, user_email: em, page_id: "*", access_level: "edit" }]);
    if(error){ alert("تعذّر الحفظ: " + error.message); loadUsers(); return; }
  }
  if(usersPageCache && usersPageCache.editSet){ if(on) usersPageCache.editSet[em] = true; else delete usersPageCache.editSet[em]; }
  alert(on ? "تم السماح له بالتعديل ✅ — يظهر ذلك عنده بعد إعادة تحميل الصفحة." : "تم سحب صلاحية التعديل — أصبح للقراءة فقط.");
}

async function loadUsers(){
  loadPendingInvites();
  if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){ loadCompanyJoinCode(); loadCompanyJoinRequests(); }
  else { const jc = document.getElementById("companyJoinCodeCard"); if(jc) jc.style.display = "none"; }
  const linkBtn = document.getElementById("btnListedShareholderLink");
  const listedVerified = currentCompanyType === "مساهمة مدرجة" && currentCompanyEntityVerified;
  if(linkBtn) linkBtn.style.display = listedVerified ? "inline-block" : "none";
  const evNote = document.getElementById("entityVerifyNote");
  if(evNote) evNote.remove();
  if(linkBtn && currentCompanyType === "مساهمة مدرجة" && !currentCompanyEntityVerified){
    const n = document.createElement("div");
    n.id = "entityVerifyNote";
    n.style.cssText = "font-size:11.5px;color:var(--gold);background:var(--offwhite);border-radius:8px;padding:8px 12px;margin:6px 0";
    n.textContent = "⏳ نوع الكيان (مساهمة مدرجة) قيد التحقق من فريق المنصة. تُفعَّل ميزات الشركات المدرجة (رابط توثيق المساهمين) بعد التوثيق. للتسريع تواصل معنا وأرسل صورة السجل التجاري.";
    linkBtn.parentNode.insertBefore(n, linkBtn);
  }
  if(listedVerified) loadPendingShareholderVerifications();
  const testUserBtn = document.getElementById("btnCreateTestUser");
  if(testUserBtn) testUserBtn.style.display = (getCurrentRole() === "مدير النظام") ? "inline-block" : "none";
  const grid = document.getElementById("usersCardsGrid");
  if(!grid) return;
  if(getCurrentRole() !== 'مدير النظام'){
    grid.innerHTML = '<div style="text-align:center;color:var(--red);font-size:12px;padding:20px;grid-column:1/-1">هذه الصفحة متاحة لمدير النظام فقط</div>';
    return;
  }
  const { data: memberships, error } = await sb.from("user_company_memberships").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;padding:20px;grid-column:1/-1">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!memberships || memberships.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا يوجد أعضاء بالفريق بعد — استخدم "🔗 دعوة عضو جديد" لإضافة أول عضو.</div>'; return; }

  const emails = memberships.map(m => m.email);
  const { data: profiles } = await sb.from("user_profiles").select("*").in("email", emails);
  const profileByEmail = {};
  (profiles||[]).forEach(p => { profileByEmail[p.email] = p; });

  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const roles = isSoleProp ? ['مدير النظام','مالك','ممثل المالك','عضو مجلس','موظف'] : ['مدير النظام','مالك','ممثل المالك','رئيس مجلس','سكرتير المجلس','رئيس لجنة الترشيحات','عضو لجنة الترشيحات','رئيس لجنة مراجعة','عضو لجنة مراجعة','عضو مجلس','عضو مجلس وعضو مساهم','مساهم','موظف'];
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  let editSet = {};
  try {
    const { data: eds } = await sb.from("user_permission_overrides").select("user_email").eq("company_id", currentCompanyId).eq("page_id","*").eq("access_level","edit");
    (eds||[]).forEach(r => { editSet[(r.user_email||"").toLowerCase()] = true; });
  } catch(e){}
  usersPageCache = { memberships, profileByEmail, roles, isSoleProp, myEmail, editSet };

  // Populate the role filter dropdown with whatever roles actually exist on this team
  // (including custom ones), so it stays useful regardless of team size or role mix.
  const filterSel = document.getElementById("usersRoleFilter");
  if(filterSel){
    const uniqueRoles = [...new Set(memberships.map(m => m.role))];
    const currentVal = filterSel.value;
    filterSel.innerHTML = '<option value="">كل الأدوار</option>' + uniqueRoles.map(r => `<option value="${r}">${r}</option>`).join("");
    filterSel.value = uniqueRoles.includes(currentVal) ? currentVal : "";
  }

  renderUsersFiltered();
}

function roleDisplayLabelFor(r){
  return usersPageCache.isSoleProp && r === 'عضو مجلس' ? 'عضو فريق' : r;
}

function renderUsersFiltered(){
  const grid = document.getElementById("usersCardsGrid");
  if(!grid) return;
  const { memberships, profileByEmail } = usersPageCache;
  const q = (document.getElementById("usersSearch")?.value || "").trim().toLowerCase();
  const roleFilter = document.getElementById("usersRoleFilter")?.value || "";

  const filtered = memberships.filter(m => {
    if(roleFilter && m.role !== roleFilter) return false;
    if(!q) return true;
    const u = profileByEmail[m.email] || {};
    return (u.full_name||"").toLowerCase().includes(q) || (m.email||"").toLowerCase().includes(q) || (m.role||"").toLowerCase().includes(q);
  });

  const countBadge = document.getElementById("usersCountBadge");
  if(countBadge) countBadge.textContent = `(${filtered.length} من ${memberships.length})`;

  if(filtered.length === 0){
    grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا نتائج مطابقة.</div>';
    return;
  }

  grid.innerHTML = filtered.map(renderUserCard).join("");
}

function renderUserCard(m){
  const { profileByEmail, roles, myEmail } = usersPageCache;
  const u = profileByEmail[m.email] || {};
  const st = roleStyleOf(m.role);
  const initial = (u.full_name || m.email || "؟").trim().charAt(0);
  const isMe = m.email === myEmail;
  const isCustomRole = !roles.includes(m.role);
  return `<div class="card" style="margin:0;border-top:4px solid ${st.color};display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:46px;height:46px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0">${initial}</div>
          <div style="min-width:0;flex:1">
            <div style="font-size:13.5px;font-weight:800;color:var(--dark);word-break:break-word">${orgEsc(u.full_name||"—")}</div>
            <div style="font-size:11px;color:var(--gray3);word-break:break-all;margin-top:1px">${orgEsc(m.email||"—")}</div>
          </div>
          ${isMe ? '<span style="font-size:9.5px;font-weight:700;color:var(--primary);background:#EAF0F8;padding:2px 7px;border-radius:6px;flex-shrink:0;white-space:nowrap">أنت</span>' : ""}
        </div>

        <div style="margin:12px 0;padding:10px;background:var(--offwhite);border-radius:8px;font-size:11px;color:var(--gray3);display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between"><span>رقم الهوية</span><span style="color:var(--dark);font-weight:600">${orgEsc(u.national_id||"—")}</span></div>
          <div style="display:flex;justify-content:space-between"><span>رقم الجوال</span><span style="color:var(--dark);font-weight:600">${orgEsc(u.phone_number||"—")}</span></div>
        </div>
        ${(m.role !== 'مدير النظام' && m.role !== 'مساهم') ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#FDF5DC;border-radius:8px;padding:8px 10px;font-size:11.5px;font-weight:700;color:var(--gold);margin-bottom:8px;cursor:pointer"><span>السماح له بالتعديل</span><input type="checkbox" ${(usersPageCache.editSet||{})[(m.email||'').toLowerCase()] ? 'checked' : ''} onchange="toggleEditGrant('${orgEsc((m.email||'').replace(/'/g,""))}', this.checked)" style="width:18px;height:18px;cursor:pointer"></label>` : ''}
        ${u.id ? `<button style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px" onclick="openEditProfileModal(${u.id})"><span class="ico-i ico-edit"></span>تعديل البيانات</button>` : ""}
        <button style="width:100%;background:#EAF0F8;color:var(--primary);border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:8px" onclick="openUserPermissionOverridesModal('${orgEsc((m.email||'').replace(/'/g,""))}','${orgEsc((u.full_name||m.email||'').replace(/'/g,""))}', currentCompanyId)"><span class="ico-i ico-wrench"></span>صلاحيات مخصّصة</button>
        <button style="width:100%;background:#FDF5DC;color:var(--gold);border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:8px" onclick="openPolicyCategoryRestrictionModal(${m.id},'${orgEsc((m.email||'').replace(/'/g,""))}','${orgEsc((u.full_name||m.email||'').replace(/'/g,""))}')"><span class="ico-i ico-clipboard"></span>تقييد فئة السياسات</button>

        <div style="margin-top:auto">
          <label style="font-size:10px;color:var(--gray3);display:block;margin-bottom:4px">الدور / الصلاحية بهذه الشركة</label>
          <select onchange="this.value==='__custom__' ? promptCustomRole(${m.id}) : updateUserRole(${m.id}, this.value)" style="width:100%;font-size:12px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;background:${st.bg};color:${st.color};border:1.5px solid ${st.color}55;margin-bottom:8px">
            ${isCustomRole ? `<option value="${orgEsc(m.role)}" selected>${st.icon} ${orgEsc(m.role)}</option>` : ""}
            ${roles.map(r=>`<option value="${r}" ${m.role===r?"selected":""}>${ROLE_STYLE[r].icon} ${roleDisplayLabelFor(r)}</option>`).join("")}
            <option value="__custom__"><span class="ico-i ico-tag"></span>مسمى مخصّص (لجنة أخرى)...</option>
          </select>
          ${isCustomRole ? `<p style="font-size:9.5px;color:var(--gray3);margin:-2px 0 8px">مسمى مخصّص — حدد صفحاته من "🔧 صلاحيات مخصّصة" فوق.</p>` : ""}
          ${isMe ? "" : `<button style="width:100%;background:#FDE8E8;color:var(--red);border:none;border-radius:8px;padding:8px;font-size:11.5px;font-weight:600;cursor:pointer" onclick="deleteUserProfile(${m.id},'${orgEsc((u.full_name||m.email||"").replace(/'/g,""))}')"><span class="ico-i ico-trash"></span>حذف</button>`}
        </div>
      </div>
    </div>`;
}

/* Company-configurable deadline (days) per approval/signing stage — replaces the previous
   hardcoded 14-day constant used everywhere the policies page shows a deadline countdown. */
async function openPolicyDeadlineSettingsModal(){
  const { data: company } = await sb.from("companies").select("policy_stage_deadline_days").eq("id", currentCompanyId).single();
  document.getElementById("mpd-days").value = company?.policy_stage_deadline_days ?? 14;
  openM("m-policy-deadline");
}

async function savePolicyDeadlineSettings(){
  const days = Number(document.getElementById("mpd-days").value) || 14;
  const { error } = await sb.from("companies").update({ policy_stage_deadline_days: days }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  currentCompanyPolicyDeadlineDays = days;
  closeM("m-policy-deadline");
  alert(`تم تحديث مهلة كل مرحلة إلى ${days} يوم ✅`);
  loadPolicies();
}

/* Position-based policy visibility — e.g. مدير المشتريات only ever sees سياسة المشتريات.
   An empty/unset list means "no restriction, sees everything", so setting this up is opt-in
   per member and never accidentally locks someone out until an admin deliberately configures it. */
async function openPolicyCategoryRestrictionModal(membershipId, email, name){
  document.getElementById("pcr-membership-id").value = membershipId;
  document.getElementById("pcr-name").textContent = name || email;
  const box = document.getElementById("pcr-category-list");
  box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  openM("m-policy-category-restriction");

  const { data: membership } = await sb.from("user_company_memberships").select("allowed_policy_categories").eq("id", membershipId).single();
  const current = Array.isArray(membership?.allowed_policy_categories) ? membership.allowed_policy_categories : [];

  box.innerHTML = getPolicyCategoriesForCompany().map(cat => `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--offwhite);border-radius:8px;margin-bottom:6px;font-size:12.5px;cursor:pointer">
    <input type="checkbox" data-pcr-cat="${cat}" ${current.includes(cat)?'checked':''} style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0"/>
    ${POLICY_CATEGORY_ICONS[cat]||"📄"} ${cat}
  </label>`).join("");
}

async function savePolicyCategoryRestriction(){
  const membershipId = document.getElementById("pcr-membership-id").value;
  const checked = [...document.querySelectorAll("#pcr-category-list [data-pcr-cat]:checked")].map(cb => cb.dataset.pcrCat);
  const { error } = await sb.from("user_company_memberships").update({ allowed_policy_categories: checked }).eq("id", membershipId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-policy-category-restriction");
  alert(checked.length ? `تم تقييد العرض بـ${checked.length} فئة ✅` : "تم إلغاء القيد — يشوف كل الفئات الآن ✅");
}

async function deleteUserProfile(membershipId, name){
  if(!await uiConfirm(`هل تريد إزالة "${name}" من فريق هذه الشركة؟ حسابه يبقى فعّالًا إن كان عضوًا بشركات أخرى على المنصة.`)) return;
  const { error } = await sb.from("user_company_memberships").delete().eq("id", membershipId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "مستخدم", name, "إزالة من فريق الشركة");
  loadUsers();
}

async function openEditProfileModal(id){
  const { data: u, error } = await sb.from("user_profiles").select("*").eq("id", id).single();
  if(error || !u){ alert("تعذّر تحميل بيانات العضو"); return; }
  document.getElementById("mep-id").value = u.id;
  if(typeof pushRefreshUI==="function") pushRefreshUI(false);
  document.getElementById("mep-title-h").textContent = "✏️ تعديل بيانات — " + (u.full_name||u.email||"");
  document.getElementById("mep-name").value = u.full_name || "";
  document.getElementById("mep-national-id").value = u.national_id || "";
  document.getElementById("mep-phone").value = u.phone_number || "";
  document.getElementById("mep-phone-note").textContent = u.phone_verified_at ? "رقم موثّق برمز تحقق ✅" : "رقم غير موثّق";
  document.getElementById("mep-phone-change").style.display = (currentUserProfile && String(currentUserProfile.id) === String(u.id)) ? "inline-flex" : "none";
  openM("m-edit-profile");
}

async function openMyProfileModal(){
  if(!currentUserProfile || !currentUserProfile.id){ alert("تعذّر تحديد حسابك حاليًا"); return; }
  await openEditProfileModal(currentUserProfile.id);
  if(typeof pushRefreshUI==="function") pushRefreshUI(true);
}

async function saveEditProfile(){
  const id = document.getElementById("mep-id").value;
  const full_name = document.getElementById("mep-name").value.trim();
  const national_id = document.getElementById("mep-national-id").value.trim();
  const { error } = await sb.from("user_profiles").update({ full_name, national_id }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "بيانات عضو", full_name, "تحديث بيانات الاتصال");
  closeM("m-edit-profile");
  alert("تم الحفظ ✅");
  if(currentUserProfile && String(currentUserProfile.id) === String(id)){
    currentUserProfile.full_name = full_name;
    currentUserProfile.national_id = national_id;
    const nameEl = document.getElementById('sidebarUserName');
    if(nameEl) nameEl.textContent = full_name || nameEl.textContent;
  }
  loadUsers();
}

async function updateUserRole(membershipId, role){
  const { data: membership } = await sb.from("user_company_memberships").select("*").eq("id", membershipId).single();
  let repInfo = null;
  if(role === "ممثل المالك"){
    const ent = await uiPrompt("اسم الجهة الاعتبارية (الشركة المالكة) التي يمثلها هذا الشخص:");
    if(!ent || !ent.trim()){ loadUsers(); return; }
    const ref = await uiPrompt("مرجع التفويض (رقم قرار الشركة المالكة أو تاريخه) — اختياري:") || "";
    repInfo = { is_entity_rep: true, represented_entity: ent.trim(), authorization_ref: ref.trim() || null };
  }
  const target = membership ? await sb.from("user_profiles").select("full_name,email").eq("email", membership.email).maybeSingle() : null;
  const { error } = await sb.from("user_company_memberships").update({ role }).eq("id", membershipId);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  if(membership && (role === "مالك" || role === "ممثل المالك")){
    // The approval lists read the profile role, so keep it in step for the company the person is currently working in.
    const upd = { role };
    if(repInfo) Object.assign(upd, repInfo);
    const r2 = await sb.from("user_profiles").update(upd).eq("email", membership.email).eq("company_id", membership.company_id);
    if(r2.error && repInfo){ alert("تم تغيير الدور، لكن تعذّر حفظ بيانات الجهة الممثَّلة: " + r2.error.message + " — تأكد من تنفيذ ملف قاعدة البيانات."); }
  }
  logActivity("صلاحيات", "مستخدم", target && target.data ? (target.data.full_name||target.data.email) : (membership?membership.email:""), `تغيير الدور إلى "${role}"`);
  loadUsers();
}

// Lets مدير النظام give a person a role name that isn't on the standard list — e.g. a
// committee that's specific to this company ("رئيس لجنة المخاطر", "عضو لجنة الحوكمة"...).
// The role string itself carries no special access beyond the safe "broad view, no edit"
// default every non-standard role gets — real per-page control still comes from the
// existing "🔧 صلاحيات مخصّصة" override system, which is exactly what makes this safe:
// no new permission logic needed, just a free-text label plus the tool that already exists.
async function promptCustomRole(membershipId){
  const name = await uiPrompt('اكتب المسمى المخصص للدور (مثال: "رئيس لجنة المخاطر" أو "عضو لجنة الحوكمة"):');
  if(!name || !name.trim()){ loadUsers(); return; }
  await updateUserRole(membershipId, name.trim());
  alert(`تم تعيين المسمى "${name.trim()}" ✅ — افتح "🔧 صلاحيات مخصّصة" على بطاقة هذا الشخص الآن لتحديد بالضبط أي صفحات يشوفها ويقدر يعدّل فيها.`);
}
