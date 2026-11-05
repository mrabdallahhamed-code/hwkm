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
