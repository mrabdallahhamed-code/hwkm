/* ══════════ ACTIVITY LOG (universal, non-blocking) ══════════ */
async function logActivity(action_type, entity_type, entity_label, details){
  try{
    if(!currentCompanyId) return;
    const { data: userData } = await sb.auth.getUser();
    const actor_email = userData && userData.user ? userData.user.email : null;
    const actor_name = currentUserProfile ? (currentUserProfile.full_name || actor_email) : actor_email;
    await sb.from("activity_log").insert([{ company_id: currentCompanyId, actor_email, actor_name, action_type, entity_type, entity_label: entity_label||"", details: details||"" }]);
  }catch(e){ /* logging must never block the actual action */ }
}

/* دخول فريق المنصة إلى بيانات شركة عميل: يُسجَّل في سجل نشاط الشركة ليراه مديروها (مرة لكل شركة في الجلسة).
   لا يُسجَّل إلا لمن ليس عضوًا في الشركة (إدارة حوكم أو فريقها)، ولا يعطّل أي عمل إن فشل التسجيل. */
const _platformAccessLogged = new Set();
function logPlatformStaffAccess(){
  try{
    if(!currentCompanyId || !currentUserProfile) return;
    const isStaff = currentUserProfile.is_platform_admin === true || !!currentUserProfile.platform_team_module;
    if(!isStaff) return;
    if((userMemberships || []).some(m => m.company_id === currentCompanyId)) return;
    const key = String(currentCompanyId);
    if(_platformAccessLogged.has(key)) return;
    _platformAccessLogged.add(key);
    const who = currentUserProfile.is_platform_admin === true ? "إدارة حوكم" : ("فريق المنصة — " + currentUserProfile.platform_team_module);
    logActivity("دخول", "دخول فريق المنصة", who, "دخول فريق المنصة إلى بيانات الشركة للدعم أو الإدارة");
  }catch(e){}
}

let activityLogCache = [];
let activityLogActiveType = "الكل";
const ACTIVITY_TYPE_ICONS = { "إنشاء":"➕", "تعديل":"✏️", "حذف":"🗑️", "دعوة":"🔗", "صلاحيات":"🛡️", "موافقة":"✅", "رفض":"❌", "توقيع":"✍️", "دخول":"🔓" };

async function loadActivityLog(){
  const tbody = document.getElementById("activityLogTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("activity_log").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(300);
  if(error){ tbody.innerHTML = errorRowHTML(5, error.message); return; }
  activityLogCache = data || [];
  renderActivityLogPills();
  renderActivityLogFiltered();
}

function renderActivityLogPills(){
  const box = document.getElementById("activityLogTypePills");
  if(!box) return;
  const types = [...new Set(activityLogCache.map(a => a.action_type))];
  const pill = (label, key, count) => {
    const active = activityLogActiveType === key;
    const icon = ACTIVITY_TYPE_ICONS[key] || "•";
    return `<button onclick="setActivityLogType('${key}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'}">${key==='الكل'?'📜':icon} ${label}${count!=null?` (${count})`:''}</button>`;
  };
  let html = pill("الكل", "الكل", activityLogCache.length);
  types.forEach(t => { html += pill(t, t, activityLogCache.filter(a=>a.action_type===t).length); });
  box.innerHTML = html;
}
function setActivityLogType(t){ activityLogActiveType = t; renderActivityLogPills(); renderActivityLogFiltered(); }

function renderActivityLogFiltered(){
  const tbody = document.getElementById("activityLogTbody");
  if(!tbody) return;
  const search = (document.getElementById("activityLogSearchInput")?.value || "").trim().toLowerCase();
  let list = activityLogCache;
  if(activityLogActiveType !== "الكل") list = list.filter(a => a.action_type === activityLogActiveType);
  if(search) list = list.filter(a => (a.actor_name||"").toLowerCase().includes(search) || (a.entity_label||"").toLowerCase().includes(search));
  if(activityLogCache.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا يوجد نشاط مسجّل بعد."); return; }
  if(list.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد نتائج مطابقة."); return; }
  tbody.innerHTML = list.map(a => `<tr>
    <td style="font-size:12.5px;color:var(--gray3);white-space:nowrap">${new Date(a.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td>
    <td>${orgEsc(a.actor_name||a.actor_email||"—")}</td>
    <td>${ACTIVITY_TYPE_ICONS[a.action_type]||''} ${a.action_type||""} ${a.entity_type||""}</td>
    <td>${a.entity_label||"—"}</td>
    <td style="font-size:12px;color:var(--gray3)">${a.details||""}</td>
  </tr>`).join("");
}

function showListedShareholderLink(){
  const link = `${window.location.origin}${window.location.pathname}?listed_company=${currentCompanyId}`;
  document.getElementById("listedShareholderLinkText").textContent = link;
  openM("m-listed-shareholder-link");
}

function copyListedShareholderLink(){
  const text = document.getElementById("listedShareholderLinkText").textContent;
  navigator.clipboard.writeText(text).then(() => alert("تم نسخ الرابط ✅"));
}

async function loadPendingShareholderVerifications(){
  const card = document.getElementById("pendingShareholderVerificationsCard");
  const list = document.getElementById("pendingShareholderVerificationsList");
  if(!card || !list) return;
  const { data, error } = await sb.from("shareholder_verification_requests").select("*")
    .eq("company_id", currentCompanyId).eq("status", "قيد المراجعة").order("created_at",{ascending:false});
  if(error || !data || data.length === 0){ card.style.display = "none"; return; }
  card.style.display = "block";
  list.innerHTML = data.map(r => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-weight:700;font-size:12.5px">${orgEsc(r.requester_name||"—")}</div>
    <div style="font-size:11px;color:var(--gray3)">${orgEsc(r.requester_email)} · رقم الهوية: ${orgEsc(r.national_id||"—")} · عدد الأسهم المدّعى: ${r.claimed_shares||"—"}</div>
    ${r.proof_file_url ? `<a href="${r.proof_file_url}" target="_blank" style="font-size:11.5px;color:var(--primary);font-weight:700"><span class="ico-i ico-paperclip"></span>عرض ملف الإثبات</a>` : '<div style="font-size:11px;color:var(--red)">لا يوجد ملف إثبات</div>'}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="approveShareholderVerification(${r.id})"><span class="ico-i ico-check"></span>اعتماد</button>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="rejectShareholderVerification(${r.id})"><span class="ico-i ico-xcircle"></span>رفض</button>
    </div>
  </div>`).join("");
}

async function approveShareholderVerification(id){
  const { data: req } = await sb.from("shareholder_verification_requests").select("*").eq("id", id).single();
  if(!req){ alert("تعذّر تحميل الطلب"); return; }
  if(!await uiConfirm(`اعتماد "${req.requester_name}" كمساهم بـ${req.claimed_shares||0} سهم؟`)) return;

  // Creates a real row in the same shareholders registry every other feature (voting, vote
  // cards, AGM attendance, quorum) already reads from — nothing downstream needs to know this
  // shareholder came through proof-of-ownership review instead of the usual pre-entered list.
  const { error: shErr } = await sb.from("shareholders").insert([{
    name: req.requester_name, national_id: req.national_id, shares_count: req.claimed_shares,
    company_id: req.company_id, claimed_by_email: req.requester_email
  }]);
  if(shErr){ alert("تعذّر إنشاء سجل المساهم: " + shErr.message); return; }

  await sb.from("user_company_memberships").insert([{ email: req.requester_email, company_id: req.company_id, role: "مساهم" }]);
  await sb.from("shareholder_verification_requests").update({ status: "معتمد", reviewed_by: currentUserProfile?.email, reviewed_at: new Date().toISOString() }).eq("id", id);

  await sendNotificationEmail(req.requester_email, "✅ تم اعتماد طلبك كمساهم",
    `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2><span class="ico-i ico-check"></span>تم اعتماد طلبك</h2><p>تم التحقق من ملكيتك واعتمادك كمساهم بالمنصة. يمكنك الآن تسجيل الدخول والمشاركة بالتصويت.</p></div>`);
  alert("تم الاعتماد ✅");
  loadPendingShareholderVerifications();
}

async function rejectShareholderVerification(id){
  const reason = await uiPrompt("سبب الرفض (اختياري):", "") || "";
  const { data: req } = await sb.from("shareholder_verification_requests").select("*").eq("id", id).single();
  await sb.from("shareholder_verification_requests").update({ status: "مرفوض", rejection_reason: reason, reviewed_by: currentUserProfile?.email, reviewed_at: new Date().toISOString() }).eq("id", id);
  if(req){
    await sendNotificationEmail(req.requester_email, "❌ تعذّر اعتماد طلبك كمساهم",
      `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2>تعذّر الاعتماد</h2><p>${reason||"لم يتم التحقق من الإثبات المرفوع."}</p></div>`);
  }
  alert("تم الرفض");
  loadPendingShareholderVerifications();
}
