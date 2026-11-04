/* ══════════ TWO-FACTOR AUTHENTICATION (Supabase MFA / TOTP) ══════════ */
let pendingMfaFactorId = null;

async function openSecurityModal(){
  document.getElementById("secStatusLoading").style.display = "block";
  document.getElementById("secEnabled").style.display = "none";
  document.getElementById("secSetupStep1").style.display = "none";
  document.getElementById("secSetupStart").style.display = "none";
  openM("m-security");

  const { data, error } = await sb.auth.mfa.listFactors();
  document.getElementById("secStatusLoading").style.display = "none";
  if(error){ alert("تعذّر تحميل حالة الأمان: " + error.message); closeM("m-security"); return; }
  const verified = (data.totp || []).find(f => f.status === "verified");
  if(verified){
    document.getElementById("secEnabled").style.display = "block";
    pendingMfaFactorId = verified.id;
  } else {
    document.getElementById("secSetupStart").style.display = "block";
  }
}

async function startMfaEnroll(){
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
  if(error){ alert("تعذّر بدء التفعيل: " + error.message); return; }
  pendingMfaFactorId = data.id;
  document.getElementById("mfaQrBox").innerHTML = `<img src="${data.totp.qr_code}" style="width:180px;height:180px;border:1px solid var(--gray1);border-radius:8px" alt="QR"/>`;
  document.getElementById("mfaSecretKey").textContent = data.totp.secret;
  document.getElementById("secSetupStart").style.display = "none";
  document.getElementById("secSetupStep1").style.display = "block";
}

async function confirmMfaEnroll(){
  const code = document.getElementById("mfaEnrollCode").value.trim();
  if(!code || code.length !== 6){ alert("أدخل رمز مكوّن من 6 أرقام"); return; }
  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: pendingMfaFactorId });
  if(chErr){ alert("تعذّر التحقق: " + chErr.message); return; }
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: pendingMfaFactorId, challengeId: challenge.id, code });
  if(vErr){ alert("الرمز غير صحيح: " + vErr.message); return; }
  logActivity("صلاحيات", "الأمان", currentUserProfile?currentUserProfile.full_name:"", "تفعيل التحقق بخطوتين");
  alert("تم تفعيل التحقق بخطوتين بنجاح ✅");
  closeM("m-security");
}

async function disableMfa(){
  if(!await uiConfirm("إلغاء تفعيل التحقق بخطوتين؟ حسابك سيعتمد على كلمة المرور فقط بعدها.")) return;
  const { error } = await sb.auth.mfa.unenroll({ factorId: pendingMfaFactorId });
  if(error){ alert("تعذّر الإلغاء: " + error.message); return; }
  logActivity("صلاحيات", "الأمان", currentUserProfile?currentUserProfile.full_name:"", "إلغاء التحقق بخطوتين");
  alert("تم إلغاء التحقق بخطوتين.");
  closeM("m-security");
}

async function verifyMfaLogin(){
  const code = document.getElementById("mfaLoginCode").value.trim();
  const errBox = document.getElementById("mfaLoginError");
  errBox.style.display = "none";
  if(!code || code.length !== 6){ errBox.textContent = "أدخل رمز مكوّن من 6 أرقام"; errBox.style.display = "block"; return; }

  const { data: factors, error: fErr } = await sb.auth.mfa.listFactors();
  if(fErr){ errBox.textContent = fErr.message; errBox.style.display = "block"; return; }
  const factor = (factors.totp || []).find(f => f.status === "verified");
  if(!factor){ errBox.textContent = "تعذّر تحديد وسيلة التحقق"; errBox.style.display = "block"; return; }

  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if(chErr){ errBox.textContent = chErr.message; errBox.style.display = "block"; return; }
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
  if(vErr){ errBox.textContent = "رمز غير صحيح، حاول مجددًا."; errBox.style.display = "block"; return; }

  document.getElementById("mfaLoginCode").value = "";
  closeM("m-mfa-challenge");
  showApp();
}

/* ══════════ AUTO-LOGOUT AFTER INACTIVITY ══════════
   The platform holds sensitive governance/financial data — a session left open indefinitely on
   a shared or public device is a real exposure risk. After 30 minutes with no mouse/keyboard/
   touch activity, sign the person out automatically with a clear message. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let idleTimer = null;
function resetIdleTimer(){
  if(!currentUserProfile) return; // no active session to protect yet
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await sb.auth.signOut();
    (window.__nativeAlert||alert)("تم تسجيل خروجك تلقائيًا بسبب عدم النشاط لفترة طويلة، لحماية بيانات شركتك.");
    location.reload();
  }, IDLE_TIMEOUT_MS);
}
['mousemove','mousedown','keydown','touchstart','scroll'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

/* ══════════ ONBOARDING GUIDE ══════════ */
function openOnboardingGuide(){ openM("m-onboarding"); }
async function closeOnboardingGuide(){
  closeM("m-onboarding");
  if(currentUserProfile && !currentUserProfile.onboarding_seen){
    const { data: userData } = await sb.auth.getUser();
    const email = userData && userData.user ? userData.user.email : null;
    if(email) await sb.from("user_profiles").update({ onboarding_seen: true }).eq("email", email);
    currentUserProfile.onboarding_seen = true;
  }
}

async function logout(){
  await sb.auth.signOut();
  currentUserProfile = null;
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  if(nameEl){ nameEl.value = ""; nameEl.disabled = false; nameEl.style.background = ""; }
  if(sharesEl){ sharesEl.value = ""; sharesEl.disabled = false; sharesEl.style.background = ""; }
  const sName = document.getElementById('sidebarUserName');
  const sRole = document.getElementById('sidebarUserRole');
  const sAv = document.getElementById('sidebarUserAv');
  if(sName) sName.textContent = "مستخدم";
  if(sRole) sRole.textContent = "—";
  if(sAv) sAv.textContent = "م";
  document.getElementById("appWrapper").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

async function showApp(){
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appWrapper").style.display = "block";
  await loadCurrentUserProfile();
  logActivity("دخول", "تسجيل دخول", currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "", "دخول للمنصة");
}

/* ══════════ FORGOT / RESET PASSWORD ══════════ */
function openForgotPasswordModal(){
  document.getElementById("forgot-email").value = document.getElementById("loginEmail")?.value || "";
  document.getElementById("forgot-msg").style.display = "none";
  openM("m-forgot-password");
  tsRender("tsForgotBox");
}

async function sendPasswordResetEmail(){
  const email = document.getElementById("forgot-email").value.trim();
  const msgEl = document.getElementById("forgot-msg");
  if(!email){ msgEl.textContent = "الرجاء إدخال بريد إلكتروني صحيح"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  const captchaToken = tsToken("tsForgotBox");
  if(window.turnstile && !captchaToken){ msgEl.textContent = "جارٍ التحقق الأمني… انتظر لحظة ثم اضغط مرة أخرى"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname, captchaToken });
  tsReset("tsForgotBox");
  if(error){ msgEl.textContent = "تعذّر الإرسال: " + error.message; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  msgEl.textContent = "✅ تم إرسال رابط إعادة التعيين إلى بريدك — تحقق من صندوق الوارد (والمزعج/السبام).";
  msgEl.style.color = "var(--green)"; msgEl.style.display = "block";
}

async function confirmPasswordReset(){
  const pw = document.getElementById("reset-new-password").value;
  const pw2 = document.getElementById("reset-confirm-password").value;
  const msgEl = document.getElementById("reset-msg");
  if(!pw || pw.length < 8){ msgEl.textContent = "كلمة المرور يجب أن تكون 8 أحرف على الأقل"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  if(pw !== pw2){ msgEl.textContent = "كلمتا المرور غير متطابقتين"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if(error){ msgEl.textContent = "تعذّر تعيين كلمة المرور: " + error.message; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  closeM("m-reset-password");
  alert("تم تعيين كلمة المرور بنجاح ✅ يمكنك الآن استخدام المنصة.");
  showApp();
}

// When the person clicks the reset link in their email, Supabase redirects back here and
// fires a PASSWORD_RECOVERY auth event — catch it and show the "set a new password" modal
// instead of the normal app/login screen.
sb.auth.onAuthStateChange((event, session) => {
  if(event === "PASSWORD_RECOVERY"){
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("reset-msg").style.display = "none";
    document.getElementById("reset-new-password").value = "";
    document.getElementById("reset-confirm-password").value = "";
    openM("m-reset-password");
  }
});

async function checkSession(){
  const { data } = await sb.auth.getSession();
  if(data && data.session){
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel){
      document.getElementById("loginScreen").style.display = "flex";
      openM("m-mfa-challenge");
      return;
    }
    showApp();
  } else {
    document.getElementById("loginScreen").style.display = "flex";
  }
}
checkSession();
if(new URLSearchParams(window.location.search).get("invite") && authMode === "login"){
  toggleAuthMode();
}
// Lets the marketing site link straight into signup mode (e.g. "جرّب المنصة" →
// web.hwkm.net/?mode=signup) instead of routing visitors through a separate lead-capture
// form first — each signup gets its own isolated company workspace and a 14-day trial.
if(new URLSearchParams(window.location.search).get("mode") === "signup" && authMode === "login"){
  toggleAuthMode();
}
// Apply any saved language preference immediately (before login, so the login screen itself
// is translated too) — this runs synchronously at script parse time, ahead of any page render.
document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'en' ? 'ltr' : 'rtl';
/* Toggles the login password field between masked and plain text, swapping the eye icon to
   match — a closed-eye ("hide") state once revealed, so the button always shows the action
   it's about to perform rather than the current state. */
function toggleLoginPasswordVisibility(){
  const input = document.getElementById("loginPassword");
  const icon = document.getElementById("loginPwEyeIcon");
  if(!input || !icon) return;
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  icon.className = isHidden ? "ico ico-eyeoff" : "ico ico-eye";
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnLangToggle');
  if(btn) btn.textContent = currentLang === 'en' ? 'AR' : 'EN';

  // Pre-fill the remembered email, if any, so returning users don't retype it.
  const rememberedEmail = localStorage.getItem("hwkm_remembered_email");
  if(rememberedEmail){
    const emailField = document.getElementById("loginEmail");
    const rememberBox = document.getElementById("rememberMeCheckbox");
    if(emailField) emailField.value = rememberedEmail;
    if(rememberBox) rememberBox.checked = true;
  }

  if(currentLang === 'en'){
    loadI18n().catch(() => {}).then(() => {
      applyTranslation();
      langObserver = makeLangObserver();
      langObserver.observe(document.body, LANG_OBSERVER_OPTS);
    });
  }
});

if('serviceWorker' in navigator){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

/* ══════════ BOARD MEMBERS ══════════ */
let membersCache = [];
let disclosuresCache = [];
const memberColors = [
  "linear-gradient(135deg,var(--primary),var(--accent))",
  "linear-gradient(135deg,#8B2FC9,#B56AE8)",
  "linear-gradient(135deg,var(--teal),#29B8A8)",
  "linear-gradient(135deg,#C0392B,#E85D50)",
  "linear-gradient(135deg,var(--gold),var(--gold3))"
];

/* ══════════ BOARD TERM RENEWAL — full-board transition tied to an AGM election ══════════
   Ends the sitting term for anyone who doesn't continue, keeps continuing members linked to
   the new term, adds the freshly-elected members, and (since new members always need a CMA
   disclosure) opens one prefilled "تعيين عضو مجلس إدارة جديد" announcement draft per new
   member for review — reusing the existing 86-type announcement engine rather than inventing
   a separate bulk-announcement type that doesn't match real Tadawul practice. */
let newTermMemberRows = 0;

async function openNewBoardTermModal(){
  if(!meetingPlanRoleGuard()) return;
  const agmSel = document.getElementById("bt-agm-select");
  agmSel.innerHTML = '<option value="">جارِ التحميل...</option>';
  const membersBox = document.getElementById("bt-current-members");
  membersBox.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  document.getElementById("bt-new-members").innerHTML = "";
  newTermMemberRows = 0;
  document.getElementById("bt-term-start").value = "";
  openM("m-board-term");

  const { data: agms } = await sb.from("meetings").select("id,title,meeting_date")
    .eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").order("meeting_date",{ascending:false});
  agmSel.innerHTML = '<option value="">— اختر —</option>' +
    (agms||[]).map(a => `<option value="${a.id}" data-date="${a.meeting_date||''}">${orgEsc(a.title||'')} — ${a.meeting_date||'—'}</option>`).join("");
  agmSel.onchange = () => {
    const opt = agmSel.selectedOptions[0];
    if(opt && opt.dataset.date) document.getElementById("bt-term-start").value = opt.dataset.date;
  };

  const { data: members } = await sb.from("board_members").select("*")
    .eq("company_id", currentCompanyId).eq("status","نشط").order("id",{ascending:true});
  membersBox.innerHTML = (members && members.length)
    ? members.map(m => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--offwhite);border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" data-bt-member-id="${m.id}" data-bt-member-name="${orgEsc((m.name||'').replace(/"/g,''))}" checked style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0"/>
        <span>${orgEsc(m.name||"")} <span style="color:var(--gray3);font-size:10.5px">— ${orgEsc(m.position||"")}</span></span>
      </label>`).join("")
    : '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء حاليون مسجّلون.</div>';
}

function addNewTermMemberRow(){
  newTermMemberRows++;
  const idx = newTermMemberRows;
  const box = document.getElementById("bt-new-members");
  const row = document.createElement("div");
  row.id = `bt-new-row-${idx}`;
  row.style.cssText = "background:var(--offwhite);border-radius:10px;padding:10px;margin-bottom:8px";
  row.innerHTML = `
    <div class="row2">
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-name-${idx}" placeholder="اسم العضو الجديد" style="margin:0"/></div>
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-position-${idx}" placeholder="المنصب (مثال: عضو مستقل)" style="margin:0"/></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="fs" id="bt-new-exec-${idx}" style="flex:1;margin:0"><option>غير تنفيذي</option><option>تنفيذي</option><option>مستقل</option></select>
      <button type="button" onclick="document.getElementById('bt-new-row-${idx}').remove()" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  box.appendChild(row);
}

async function saveBoardTerm(){
  if(!meetingPlanRoleGuard()) return;
  const agm_meeting_id = document.getElementById("bt-agm-select").value;
  const term_start = document.getElementById("bt-term-start").value;
  if(!agm_meeting_id){ alert("الرجاء اختيار الجمعية العامة اللي تم فيها الانتخاب"); return; }
  if(!term_start){ alert("الرجاء تحديد تاريخ بداية الدورة الجديدة"); return; }

  const { data: term, error: termErr } = await sb.from("board_terms")
    .insert([{ company_id: currentCompanyId, agm_meeting_id: Number(agm_meeting_id), term_start, status:"نشطة" }])
    .select().single();
  if(termErr){ alert("تعذّر إنشاء الدورة: " + termErr.message); return; }

  const checkboxes = [...document.querySelectorAll("#bt-current-members [data-bt-member-id]")];
  const continuingNames = [];
  for(const cb of checkboxes){
    const memberId = Number(cb.dataset.btMemberId);
    if(cb.checked){
      await sb.from("board_members").update({ term_id: term.id }).eq("id", memberId);
      continuingNames.push(cb.dataset.btMemberName || "");
    } else {
      await sb.from("board_members").update({ status:"منتهي العضوية", term_end_date: term_start }).eq("id", memberId);
    }
  }

  const newRows = [...document.querySelectorAll("#bt-new-members [id^='bt-new-row-']")];
  const newMembersAdded = [];
  for(const row of newRows){
    const idx = row.id.replace("bt-new-row-","");
    const name = document.getElementById(`bt-new-name-${idx}`).value.trim();
    if(!name) continue;
    const position = document.getElementById(`bt-new-position-${idx}`).value.trim();
    const is_executive = document.getElementById(`bt-new-exec-${idx}`).value;
    await sb.from("board_members").insert([{
      name, position, position_level:"عضو", is_executive, committee_member:"لا",
      join_date: term_start, status:"نشط", term_id: term.id, company_id: currentCompanyId
    }]);
    newMembersAdded.push(name);
  }

  closeM("m-board-term");
  loadMembers();

  const allTermMembers = [...continuingNames, ...newMembersAdded].filter(Boolean);
  if(allTermMembers.length){
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅ — جهّزنا لك الآن مسودة «إعلان نتائج الجمعية» معبّاة بأعضاء المجلس الجدد كاملين، للمراجعة والتوليد.");
    await prefillAgmResultsWithElectedBoard(Number(agm_meeting_id), allTermMembers, term_start);
  } else {
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅");
  }
}

/* Discloses the WHOLE elected/renewed board in one shot, inside the AGM's own "نتائج
   الجمعية" announcement (the "أعضاء مجلس تم انتخابهم/تعيينهم" field) — matching real Tadawul
   practice for a board elected at a general assembly, instead of one appointment
   announcement per member (that's only for a single seat changing between assemblies). */
async function prefillAgmResultsWithElectedBoard(agmMeetingId, memberNames, termStart){
  const { data: agmRow } = await sb.from("meetings").select("*").eq("id", agmMeetingId).single();
  if(agmRow && !agmMeetingsCache.some(x => x.id === agmMeetingId)) agmMeetingsCache.push(agmRow);
  currentAGMModalMeetingId = agmMeetingId;
  openTadawulAnnouncementForm("نتائج");
  setTimeout(() => {
    const el = document.getElementById("tdwAnn-elected");
    if(el) el.value = memberNames.map(n => `${n} — بداية الدورة: ${termStart}`).join("\n");
  }, 50);
}

/* Opens the existing generic (86-type) announcement form pre-filled for a specific new
   board member — kept available for a single mid-term seat change (not a full AGM renewal),
   still reachable manually from "الإعلانات" → "تعيين عضو مجلس إدارة جديد". */
function prefillAppointmentAnnouncement(memberName, meetingDate){
  selectAnnouncementType("تعيين عضو مجلس إدارة جديد");
  setTimeout(() => {
    const nameField = document.getElementById("genf-member_name");
    const dateField = document.getElementById("genf-meeting_date");
    const startField = document.getElementById("genf-start_date");
    if(nameField) nameField.value = memberName;
    if(dateField) dateField.value = meetingDate || "";
    if(startField) startField.value = meetingDate || "";
  }, 50);
}

async function loadMembers(){
  const grid = document.getElementById("membersGrid");
  const [{ data, error }, { data: disclosureForms }] = await Promise.all([
    sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("board_disclosure_forms").select("member_email,status").eq("company_id", currentCompanyId)
  ]);
  if(error){
    grid.innerHTML = '<div style="font-size:12px;color:var(--red);padding:12px">تعذّر تحميل الأعضاء: '+error.message+'</div>';
    return;
  }
  if(!data || data.length === 0){
    grid.innerHTML = '<div style="font-size:12px;color:var(--gray3);padding:12px">لا يوجد أعضاء بعد. اضغط "+ إضافة عضو" للبدء.</div>';
    return;
  }
  membersCache = data;
  disclosuresCache = disclosureForms || [];
  grid.innerHTML = data.map((m, i) => {
    const initial = (m.name || "?").trim().charAt(0);
    const bg = memberColors[i % memberColors.length];
    const status = m.status || "—";
    const execBadge = m.is_executive === "تنفيذي" ? '<span class="badge pending">تنفيذي</span>' : '<span class="badge info">غير تنفيذي</span>';
    const committeeBadge = m.committee_member === "نعم" ? '<span class="badge done">عضو لجنة</span>' : "";
    const memberDisclosure = m.claimed_by_email ? disclosuresCache.find(d => d.member_email === m.claimed_by_email) : null;
    const disclosureBadge = memberDisclosure && memberDisclosure.status === "موقّع" ? '<span class="badge done"><span class="ico-i ico-check"></span>أُفصح</span>' : '<span class="badge urgent"><span class="ico-i ico-warning"></span>لم يُفصح</span>';
    const claimBadge = m.claimed_by_email
      ? `<span class="badge done" title="${orgEsc(m.claimed_by_email)}"><span class="ico-i ico-link"></span>مرتبط بحساب دخول</span>`
      : '<span class="badge urgent"><span class="ico-i ico-warning"></span>غير مرتبط — لا يقدر يصوّت</span>';
    return `<div class="memcard">
      <div class="mem-av" style="background:${bg}">${initial}</div>
      <div class="mem-name">${orgEsc(m.name || "")}</div><div class="mem-role">${m.position_level || "عضو"} — ${orgEsc(m.position || "")}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin:4px 0">
        <span class="badge info">${status}</span>${execBadge}${committeeBadge}
      </div>
      <div style="display:flex;justify-content:center;margin:2px 0">${disclosureBadge}</div>
      <div style="display:flex;justify-content:center;margin:2px 0">${claimBadge}</div>
      <div class="mem-stats"><div><div class="ms-v">${m.join_date || "—"}</div><div class="ms-l">الانضمام</div></div></div>
      <div style="display:flex;gap:6px;margin-top:8px;width:100%">
        <button class="btn-xs primary" style="flex:1" onclick="editMember(${m.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        ${m.claimed_by_email ? "" : `<button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="openClaimMemberModal(${m.id})"><span class="ico-i ico-link"></span>ربط بحساب</button>`}
      </div>
    </div>`;
  }).join("");
}

/* Linking a formal board_members row to an actual login (claimed_by_email) is what makes
   that person count for quorum, attendance, and decision voting — being invited to the
   platform with role "عضو مجلس" is NOT enough by itself, since board_members is a separate
   roster from user_company_memberships. This is normally set automatically when someone signs
   up with a matching national ID; this modal covers everyone else (e.g. invited by link). */
async function openClaimMemberModal(memberId){
  const m = membersCache.find(x => x.id === memberId);
  if(!m) return;
  document.getElementById("cm-member-id").value = memberId;
  document.getElementById("cm-member-name").textContent = m.name || "";
  const sel = document.getElementById("cm-email-select");
  sel.innerHTML = '<option value="">جارِ التحميل...</option>';
  openM("m-claim-member");

  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  const emails = (memberships||[]).map(x=>x.email);
  const { data: profiles } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameByEmail = {};
  (profiles||[]).forEach(p => { nameByEmail[p.email] = p.full_name; });

  if(!memberships || memberships.length === 0){
    sel.innerHTML = '<option value="">لا يوجد أعضاء بالفريق بعد</option>';
    return;
  }
  sel.innerHTML = '<option value="">— اختر حساب الدخول —</option>' +
    memberships.map(x => `<option value="${orgEsc(x.email)}">${orgEsc(nameByEmail[x.email]||x.email)} (${orgEsc(x.role)}) — ${orgEsc(x.email)}</option>`).join("");
}

async function confirmClaimMember(){
  const memberId = document.getElementById("cm-member-id").value;
  const email = document.getElementById("cm-email-select").value;
  if(!email){ alert("الرجاء اختيار حساب الدخول اللي تبي تربطه بهذا العضو"); return; }
  const { error } = await sb.from("board_members").update({ claimed_by_email: email }).eq("id", memberId);
  if(error){ alert("تعذّر الربط: " + error.message); return; }
  closeM("m-claim-member");
  alert("تم الربط بنجاح ✅ — هذا العضو الآن يقدر يصوّت على قرارات المجلس/اللجان، ويُحسب ضمن الحضور والنصاب.");
  loadMembers();
}

function editMember(id){
  const m = membersCache.find(x => x.id === id);
  if(!m) return;
  document.getElementById("mm-id").value = m.id;
  document.getElementById("mm-title").textContent = "✏️ تعديل عضو مجلس إدارة";
  document.getElementById("mm-source").value = "manual";
  document.getElementById("mm-shareholder-picker-wrap").style.display = "none";
  document.getElementById("mm-name").disabled = false; document.getElementById("mm-name").style.background = "";
  document.getElementById("mm-national-id").disabled = false; document.getElementById("mm-national-id").style.background = "";
  document.getElementById("mm-name").value = m.name || "";
  document.getElementById("mm-position").value = m.position || "";
  document.getElementById("mm-position-level").value = m.position_level || "عضو";
  document.getElementById("mm-executive").value = m.is_executive || "غير تنفيذي";
  document.getElementById("mm-committee").value = m.committee_member || "لا";
  document.getElementById("mm-joindate").value = m.join_date || "";
  document.getElementById("mm-status").value = m.status || "نشط";
  document.getElementById("mm-national-id").value = m.national_id || "";
  openM("m-member");
}

async function toggleMemberSource(){
  const source = document.getElementById("mm-source").value;
  const wrap = document.getElementById("mm-shareholder-picker-wrap");
  const nameField = document.getElementById("mm-name");
  const nationalIdField = document.getElementById("mm-national-id");
  if(source === "shareholder"){
    wrap.style.display = "block";
    nameField.disabled = true; nameField.style.background = "var(--gray1)";
    nationalIdField.disabled = true; nationalIdField.style.background = "var(--gray1)";
    const picker = document.getElementById("mm-shareholder-picker");
    const { data, error } = await sb.from("shareholders").select("id,name,national_id").eq("company_id", currentCompanyId).order("name",{ascending:true});
    if(error){ picker.innerHTML = '<option value="">تعذّر التحميل</option>'; return; }
    picker.innerHTML = '<option value="">— اختر —</option>' + (data||[]).map(s => `<option value="${s.id}" data-name="${orgEsc(s.name||'')}" data-national-id="${orgEsc(s.national_id||'')}">${orgEsc(s.name||'—')}</option>`).join("");
  } else {
    wrap.style.display = "none";
    nameField.disabled = false; nameField.style.background = "";
    nationalIdField.disabled = false; nationalIdField.style.background = "";
    nameField.value = ""; nationalIdField.value = "";
  }
}

function fillMemberFromShareholder(){
  const picker = document.getElementById("mm-shareholder-picker");
  const opt = picker.selectedOptions[0];
  if(!opt || !opt.value) return;
  document.getElementById("mm-name").value = opt.dataset.name || "";
  document.getElementById("mm-national-id").value = opt.dataset.nationalId || "";
}

async function saveMember(){
  const id = document.getElementById("mm-id").value;
  const name = document.getElementById("mm-name").value.trim();
  const position = document.getElementById("mm-position").value.trim();
  const position_level = document.getElementById("mm-position-level").value;
  const is_executive = document.getElementById("mm-executive").value;
  const committee_member = document.getElementById("mm-committee").value;
  const join_date = document.getElementById("mm-joindate").value || null;
  const status = document.getElementById("mm-status").value;
  const national_id = document.getElementById("mm-national-id").value.trim();
  if(!name){ alert("الرجاء إدخال اسم العضو"); return; }

  const payload = { name, position, position_level, is_executive, committee_member, join_date, status, national_id, company_id: currentCompanyId };
  const { error } = id
    ? await sb.from("board_members").update(payload).eq("id", id)
    : await sb.from("board_members").insert([payload]);
  if(error){
    const rls = /row-level security|permission denied/i.test(error.message||"");
    alert(rls ? "ليست لديك صلاحية تعديل أعضاء المجلس بهذا الحساب.\nصلاحيتك هنا «عرض فقط». اطلب من مدير النظام منحك صلاحية «تعديل» على صفحة الأعضاء." : "خطأ أثناء الحفظ: " + error.message);
    return;
  }

  document.getElementById("mm-id").value = "";
  document.getElementById("mm-title").textContent = "👤 إضافة عضو مجلس إدارة";
  document.getElementById("mm-name").value = "";
  document.getElementById("mm-position").value = "";
  document.getElementById("mm-joindate").value = "";
  document.getElementById("mm-national-id").value = "";
  closeM("m-member");
  loadMembers();
}

/* ══════════ MEETINGS (routed by type) ══════════ */
const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fileCell(id, field, url){
  if(url){
    return `<div style="display:flex;gap:4px;align-items:center;justify-content:center">
      <a class="btn-xs primary" href="${url}" target="_blank" rel="noopener" title="تحميل"><span class="ico ico-inbox" style="width:16px;height:16px"></span></a>
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 6px;font-size:11px;cursor:pointer" title="حذف الملف" onclick="deleteMeetingFile(${id},'${field}')"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  }
  return `<label class="btn-xs primary" style="cursor:pointer;display:inline-block"><span class="ico-i ico-paperclip"></span>رفع<input type="file" style="display:none" onchange="uploadMeetingFile(${id},'${field}',this)"></label>`;
}

function renderMeetingRow(m){
  return `<tr>
    <td>${orgEsc(m.title || "")}</td>
    <td>${m.meeting_type || "—"}</td>
    <td>${m.meeting_date || "—"}</td>
    <td>${m.meeting_time || "—"}</td>
    <td>${m.method || "—"}</td>
    <td>${orgEsc(m.notes || "—")}</td>
    <td>${fileCell(m.id,'agenda_file_url',m.agenda_file_url)}</td>
    <td>${fileCell(m.id,'minutes_file_url',m.minutes_file_url)}</td>
    <td>${fileCell(m.id,'invitation_file_url',m.invitation_file_url)}</td>
    <td><button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteMeeting(${m.id})"><span class="ico-i ico-trash"></span>حذف</button></td>
  </tr>`;
}

async function uploadMeetingFile(id, field, inputEl){
  const url = await uploadFile(inputEl, "meetings");
  if(!url) return;
  const payload = {}; payload[field] = url;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeetingFile(id, field){
  if(!await uiConfirm("هل تريد حذف هذا الملف؟")) return;
  const payload = {}; payload[field] = null;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeeting(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذا الاجتماع بالكامل؟")) return;
  const { error } = await sb.from("meetings").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}

/* ══════════ DASHBOARD (real data pulled from every page) ══════════ */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/* ══════════ NOTIFICATIONS (live-computed, no stored table — always fresh) ══════════ */
/* Generic "pick one" dropdown — reused for every consolidated export/edit button across the
   platform instead of one page having its own bespoke toggle logic. Closes on outside click. */
function toggleDD(id){
  document.querySelectorAll('.dd-menu.open').forEach(m => { if(m.id !== id) m.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.dd-wrap')) document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
});

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

async function loadMeetingsAll(){
  const { data, error } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId).order("id", { ascending: false });
  if(error){
    return;
  }
  allMeetingsCache = data || [];

  const board = (data || []).filter(m => m.meeting_type === "اجتماع مجلس الإدارة الدوري" || m.meeting_type === "اجتماع طارئ");
  const committee = (data || []).filter(m => m.meeting_type === "اجتماع لجنة");
  const agm = (data || []).filter(m => m.meeting_type === "الجمعية العامة");

  renderMeetingCardsGroup(board, "board");
  renderMeetingCardsGroup(committee, "committee");
  renderAGMSection(agm);
  loadMeetingPlans();
}
