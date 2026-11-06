let authMode = "login"; // "login" | "signup"
let currentUserProfile = null;
let currentCompanyId = null;

function toggleAuthMode(){
  authMode = (authMode === "login") ? "signup" : "login";
  document.getElementById("loginBtn").textContent = authMode === "login" ? "تسجيل الدخول" : "إنشاء الحساب";
  document.getElementById("authSwitch").innerHTML = authMode === "login"
    ? 'ليس لديك حساب؟ <b>إنشاء حساب جديد</b>'
    : 'لديك حساب بالفعل؟ <b>تسجيل الدخول</b>';
  document.getElementById("signupTypeField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupNameField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupNationalIdField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupPhoneField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupInviteField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupTermsField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("signupCompanyCodeField").style.display = authMode === "signup" ? "block" : "none";
  document.getElementById("passwordlessLoginOptions").style.display = authMode === "login" ? "block" : "none";
  if(authMode === "signup"){
    toggleShareholderFields();
    const urlInvite = new URLSearchParams(window.location.search).get("invite");
    if(urlInvite) document.getElementById("signupInviteCode").value = urlInvite;
    applyListedCompanySignupMode();
  }
  else { document.getElementById("signupSharesField").style.display = "none"; }
  hideLoginMsg();
}

let listedCompanyContext = null; // { id, name } when signing up via a listed-company link

async function applyListedCompanySignupMode(){
  const listedId = new URLSearchParams(window.location.search).get("listed_company");
  const banner = document.getElementById("listedCompanyBanner");
  const proofField = document.getElementById("listedProofField");
  if(!listedId){
    if(banner) banner.style.display = "none";
    if(proofField) proofField.style.display = "none";
    listedCompanyContext = null;
    return;
  }
  const { data: company } = await sb.from("companies").select("id,name").eq("id", listedId).eq("company_type", "مساهمة مدرجة").maybeSingle();
  if(!company){
    if(banner){ banner.style.display = "block"; banner.textContent = "⚠️ رابط تسجيل غير صالح"; banner.style.color = "var(--red)"; }
    return;
  }
  listedCompanyContext = company;
  if(banner){ banner.style.display = "block"; banner.textContent = `📋 تسجيل كمساهم بشركة "${company.name}"`; }
  // No pre-existing shareholders registry to match against for a listed company — lock the
  // account type to "مساهم" and require proof of ownership instead of automatic verification.
  const typeField = document.getElementById("signupTypeField");
  const typeSelect = document.getElementById("signupAccountType");
  if(typeField) typeField.style.display = "none";
  if(typeSelect) typeSelect.value = "مساهم";
  toggleShareholderFields();
  if(proofField) proofField.style.display = "block";
}

// Real identity verification via Nafath — replaces manually typing a national ID (which anyone
// could fake or borrow from someone else) with an actual government-app confirmation from the
// real person. Falls back gracefully to manual entry until a Nafath provider is connected.
let nafathPollInterval = null;
// Passwordless login: after Nafath or OTP verification succeeds server-side, the edge function
// hands back a magic-link token for the matching account — verifyOtp() below is what actually
// turns that into a real, working Supabase session client-side (no password ever touched).
async function completePasswordlessLogin(email, hashed_token){
  const { error } = await sb.auth.verifyOtp({ token_hash: hashed_token, type: "email" });
  if(error){ alert("تعذّر إتمام الدخول: " + error.message); return; }
  closeM("m-nafath-login"); closeM("m-otp-login");
  location.reload();
}

let nafathLoginPollInterval = null;
async function startNafathLoginFlow(){
  const nationalId = document.getElementById("nafathLoginNid").value.trim();
  const statusBox = document.getElementById("nafathLoginStatus");
  if(!nationalId){ statusBox.innerHTML = '<span style="color:var(--red)">اكتب رقم هويتك</span>'; return; }

  statusBox.innerHTML = '<span style="color:var(--gray3)">جارِ الاتصال بنفاذ...</span>';
  const startRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-nafath-identity`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", nationalId })
  });
  const startData = await startRes.json();
  if(!startRes.ok || !startData.transId){
    statusBox.innerHTML = '<span style="color:var(--orange)"><span class="ico-i ico-warning"></span>الدخول عبر نفاذ غير مفعّل بعد</span>';
    return;
  }
  statusBox.innerHTML = `<div style="background:#EAF0F8;border-radius:8px;padding:10px">
    <div style="font-size:11px;color:var(--gray3)">افتح تطبيق نفاذ واختر الرقم:</div>
    <div style="font-size:26px;font-weight:900;color:var(--primary)">${startData.randomNumber}</div>
  </div>`;

  if(nafathLoginPollInterval) clearInterval(nafathLoginPollInterval);
  nafathLoginPollInterval = setInterval(async () => {
    const pollRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-nafath-identity`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", transId: startData.transId })
    });
    const pollData = await pollRes.json();
    if(pollData.status === "COMPLETED"){
      clearInterval(nafathLoginPollInterval);
      statusBox.innerHTML = '<span style="color:var(--gray3)">جارِ تسجيل الدخول...</span>';
      const loginRes = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "nafath", nafathTransId: startData.transId })
      });
      const loginData = await loginRes.json();
      if(!loginRes.ok){ statusBox.innerHTML = `<span style="color:var(--red)">${loginData.error||"تعذّر الدخول"}</span>`; return; }
      await completePasswordlessLogin(loginData.email, loginData.hashed_token);
    } else if(pollData.status === "REJECTED" || pollData.status === "EXPIRED"){
      clearInterval(nafathLoginPollInterval);
      statusBox.innerHTML = '<span style="color:var(--red)">تعذّر التحقق — حاول مجددًا</span>';
    }
  }, 3000);
}

async function sendOtpLoginCode(){
  const phone = document.getElementById("otpLoginPhone").value.trim();
  const statusBox = document.getElementById("otpLoginStatus");
  if(!phone){ statusBox.innerHTML = '<span style="color:var(--red)">اكتب رقم جوالك</span>'; return; }
  statusBox.innerHTML = '<span style="color:var(--gray3)">جارِ الإرسال...</span>';
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_otp", phone })
    });
    const data = await res.json();
    if(!res.ok){ statusBox.innerHTML = `<span style="color:var(--orange)"><span class="ico-i ico-warning"></span>${data.error||"الدخول برمز OTP غير مفعّل بعد"}</span>`; return; }
    document.getElementById("otpLoginCodeField").style.display = "block";
    statusBox.innerHTML = '<span style="color:var(--green)">إن كان الرقم مسجَّلاً ومؤكَّداً سيصلك الرمز خلال لحظات ✅</span>';
  }catch(e){
    statusBox.innerHTML = '<span style="color:var(--orange)"><span class="ico-i ico-warning"></span>الدخول برمز OTP غير مفعّل بعد</span>';
  }
}

async function verifyOtpLoginCode(){
  const phone = document.getElementById("otpLoginPhone").value.trim();
  const otpCode = document.getElementById("otpLoginCode").value.trim();
  const statusBox = document.getElementById("otpLoginStatus");
  statusBox.innerHTML = '<span style="color:var(--gray3)">جارِ التحقق...</span>';
  const res = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "otp", phone, otpCode })
  });
  const data = await res.json();
  if(!res.ok){ statusBox.innerHTML = `<span style="color:var(--red)">${data.error||"تعذّر الدخول"}</span>`; return; }
  await completePasswordlessLogin(data.email, data.hashed_token);
}

async function startNafathVerification(){
  const nidInput = document.getElementById("signupNationalId");
  const statusBox = document.getElementById("nafathStatus");
  const nationalId = nidInput.value.trim();
  if(!nationalId){ statusBox.innerHTML = '<span style="color:var(--red)">اكتب رقم هويتك أولًا بالخانة، ثم اضغط تحقق</span>'; return; }

  statusBox.innerHTML = '<span style="color:var(--gray3)">جارِ الاتصال بنفاذ...</span>';
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-nafath-identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", nationalId })
    });
    const data = await res.json();
    if(!res.ok || !data.transId){
      statusBox.innerHTML = '<span style="color:var(--orange)"><span class="ico-i ico-warning"></span>التحقق عبر نفاذ غير مفعّل بعد — تقدر تكمل بكتابة رقم هويتك يدويًا مؤقتًا.</span>';
      return;
    }

    statusBox.innerHTML = `<div style="background:#EAF0F8;border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:11px;color:var(--gray3)">افتح تطبيق نفاذ واختر الرقم:</div>
      <div style="font-size:26px;font-weight:900;color:var(--primary)">${data.randomNumber}</div>
    </div>`;

    if(nafathPollInterval) clearInterval(nafathPollInterval);
    nafathPollInterval = setInterval(async () => {
      const pollRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-nafath-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", transId: data.transId })
      });
      const pollData = await pollRes.json();
      if(pollData.status === "COMPLETED"){
        clearInterval(nafathPollInterval);
        nidInput.value = pollData.verifiedNationalId || nationalId;
        nidInput.readOnly = true;
        statusBox.innerHTML = '<span style="color:var(--green)"><span class="ico-i ico-check"></span>تم التحقق من هويتك عبر نفاذ</span>';
      } else if(pollData.status === "REJECTED" || pollData.status === "EXPIRED"){
        clearInterval(nafathPollInterval);
        statusBox.innerHTML = '<span style="color:var(--red)">تعذّر التحقق (رُفض الطلب أو انتهت مهلته) — حاول مجددًا.</span>';
      }
    }, 3000);
  }catch(e){
    statusBox.innerHTML = '<span style="color:var(--orange)"><span class="ico-i ico-warning"></span>التحقق عبر نفاذ غير مفعّل بعد — تقدر تكمل بكتابة رقم هويتك يدويًا مؤقتًا.</span>';
  }
}

function toggleShareholderFields(){
  const type = document.getElementById("signupAccountType").value;
  // Shares are never typed by a shareholder: they come from the company's shareholder register when the account is matched.
  // Only the listed-company proof-of-ownership request still carries a claimed number, which a reviewer checks against the uploaded proof.
  document.getElementById("signupSharesField").style.display = (authMode==="signup" && type==="مساهم" && listedCompanyContext) ? "block" : "none";
}

function showLoginMsg(text, ok){
  const el = document.getElementById("loginMsg");
  el.textContent = text;
  el.style.display = "block";
  el.style.background = ok ? "#E8F8EF" : "#FDE8E8";
  el.style.color = ok ? "var(--green)" : "var(--red)";
}
function hideLoginMsg(){
  document.getElementById("loginMsg").style.display = "none";
}

async function handleAuth(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if(!email || !password){ showLoginMsg("الرجاء تعبئة البريد الإلكتروني وكلمة المرور", false); return; }

  const captchaToken = tsToken("tsLoginBox");
  if(window.turnstile && !captchaToken){ showLoginMsg("جارٍ التحقق الأمني… انتظر لحظة ثم اضغط مرة أخرى", false); return; }

  if(authMode === "login"){
    const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
    tsReset("tsLoginBox");
    if(error){ showLoginMsg("خطأ: " + error.message, false); return; }

    // Remember Me only ever stores the email (never the password) — purely a convenience so
    // returning users don't retype it, not a session-persistence mechanism.
    const rememberMe = document.getElementById("rememberMeCheckbox")?.checked;
    if(rememberMe) localStorage.setItem("hwkm_remembered_email", email);
    else localStorage.removeItem("hwkm_remembered_email");

    // If this account has 2FA enabled, the session is only at AAL1 (password-only) right
    // after sign-in — require the TOTP code before letting them into the app.
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel){
      openM("m-mfa-challenge");
      return;
    }
    showApp();
  } else {
    const account_type = document.getElementById("signupAccountType").value;
    const full_name = document.getElementById("signupFullName").value.trim();
    const national_id = document.getElementById("signupNationalId").value.trim();
    const phone_number = document.getElementById("signupPhone").value.trim();
    const shares_count = document.getElementById("signupShares").value ? Number(document.getElementById("signupShares").value) : null;
    if(!full_name){ showLoginMsg("الرجاء إدخال الاسم الكامل", false); return; }
    if(!national_id){ showLoginMsg("الرجاء إدخال رقم الهوية", false); return; }
    if(!phone_number){ showLoginMsg("الرجاء إدخال رقم الجوال", false); return; }
    if(listedCompanyContext && account_type === "مساهم" && !shares_count){ showLoginMsg("الرجاء إدخال عدد الأسهم", false); return; }
    if(password.length < 8){ showLoginMsg("كلمة المرور يجب أن تكون 8 أحرف على الأقل", false); return; }

    // The company code is only remembered in the account's metadata here. While the email is
    // unconfirmed there is no session, so the join request is made on the first signed-in visit
    // (processPendingJoinIntent), by a database function that reads the identity from that session.
    const joinCodeTyped = (document.getElementById("signupCompanyCode").value || "").trim().toUpperCase();
    const signupMeta = {};
    if(joinCodeTyped) signupMeta.join_code = joinCodeTyped;
    if(signupPhoneProof) signupMeta.phone_proof = signupPhoneProof;   // server-signed; claimed on the first signed-in visit
    // الملف الشخصي لا يُدرَج من الزائر: تُحفظ بياناته هنا في حساب الدخول، ويُنشأ صفّه في قاعدة البيانات
    // عند أول دخول موثَّق (ensureProfileFromSignup) ببريد الجلسة نفسه، فلا يمكن اختلاق ملف ببريد غيرك.
    signupMeta.hwkm_profile = { account_type, full_name, national_id, phone_number };
    const { data: signUpData, error } = await sb.auth.signUp({ email, password, options: { data: signupMeta, captchaToken } });
    tsReset("tsLoginBox");
    if(error){ showLoginMsg("خطأ: " + error.message, false); return; }
    if(signUpData && signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0){
      showLoginMsg("هذا البريد الإلكتروني مسجّل بحساب موجود مسبقًا — الرجاء تسجيل الدخول بدل إنشاء حساب جديد.", false);
      return;
    }

    // Listed-company shareholder signup: no pre-existing registry to auto-match against, so
    // this becomes a proof-of-ownership request the company reviews manually — completely
    // bypassing the invite/national-ID matching flow below.
    if(listedCompanyContext){
      const proofInput = document.getElementById("listedProofFile");
      if(!proofInput.files || !proofInput.files[0]){
        showLoginMsg("الرجاء رفع إثبات الملكية أولًا", false); return;
      }
      const proof_file_url = await uploadFile(proofInput, "shareholder-verification-proofs");
      const { error: reqError } = await sb.from("shareholder_verification_requests").insert([{
        company_id: listedCompanyContext.id, requester_email: email, requester_name: full_name,
        national_id, claimed_shares: shares_count, proof_file_url, status: "قيد المراجعة"
      }]);
      if(reqError){ showLoginMsg("تعذّر إرسال طلبك: " + reqError.message, false); return; }
      await sb.auth.signOut();
      showLoginMsg(`✅ تم إرسال طلبك بنجاح — بانتظار مراجعة شركة "${listedCompanyContext.name}" للإثبات المرفوع. سيصلك إشعار فور الاعتماد.`, true);
      return;
    }

    // If an invite code was supplied, validate it and join that company directly
    // instead of landing in the company-less "request a company" state.
    const inviteCode = document.getElementById("signupInviteCode").value.trim();
    let inviteCompanyId = null, inviteRole = null;
    if(inviteCode){
      const { data: inv, error: invErr } = await sb.rpc("redeem_invite", { p_code: inviteCode, p_email: email });
      if(!invErr && inv && inv.status === "ok"){
        inviteCompanyId = inv.company_id; inviteRole = inv.role;
      } else {
        showLoginMsg("تنبيه: رمز الدعوة غير صحيح أو مُستخدَم بالفعل — سيُنشأ حسابك بدون ربطه بشركة.", false);
      }
    }

    // Nobody is linked to a company automatically from what they type here — not by a code and not by a
    // national ID. A company code becomes a pending request that company's admin must approve, and the
    // national ID is used only by that approver to see which registry record of THAT company matches.
    // Only an explicit invite link (an admin acting for one named person) joins immediately.
    let claimedRecords = [];
    let memberships = []; // { company_id, role } — only ever filled by an invite link

    // (لا إدراج للملف الشخصي هنا — انظر ensureProfileFromSignup عند أول دخول.)
    if(inviteCompanyId){ memberships = [{ company_id: inviteCompanyId, role: inviteRole }]; }
    // Claiming board_members/shareholders rows must happen AFTER the membership rows above are
    // created — the RLS policy on those tables requires is_member_of(company_id), which only
    // becomes true once the membership insert just above has actually gone through. Doing this
    // in the old order silently failed every claim (RLS blocked it with no visible error).
    showLoginMsg(
      inviteCompanyId ? (memberships.length > 1 ? `تم إنشاء الحساب وربطه تلقائيًا بـ${memberships.length} شركات ✅ يمكنك تسجيل الدخول الآن.` : "تم إنشاء الحساب وربطه بشركتك تلقائيًا ✅ يمكنك تسجيل الدخول الآن.")
      : joinCodeTyped ? "تم إنشاء الحساب. أكّد بريدك الإلكتروني ثم سجّل الدخول، وسيصل طلب انضمامك لمدير الشركة ليوافق عليه."
      : "تم إنشاء الحساب. يمكنك تسجيل الدخول الآن (أو تحقق من بريدك للتفعيل)", true);
    authMode = "login";
    document.getElementById("loginBtn").textContent = "تسجيل الدخول";
    document.getElementById("signupTypeField").style.display = "none";
    document.getElementById("signupNameField").style.display = "none";
    document.getElementById("signupNationalIdField").style.display = "none";
    document.getElementById("signupPhoneField").style.display = "none";
    document.getElementById("signupInviteField").style.display = "none";
    document.getElementById("signupTermsField").style.display = "none";
    document.getElementById("signupCompanyCodeField").style.display = "none";
    document.getElementById("signupSharesField").style.display = "none";
  }
}

let userMemberships = [];

/* Terms & privacy consent. Bump TERMS_VERSION when the texts change materially: everyone is asked again once. */
const TERMS_VERSION = "2026-10";
function needsTermsConsent(){
  return !!currentUserProfile && (!currentUserProfile.terms_accepted_at || currentUserProfile.terms_version !== TERMS_VERSION) && sessionStorage.getItem("hwkm_terms_ok") !== TERMS_VERSION;
}
function openTermsGate(){
  const chk = document.getElementById("terms-gate-check"); if(chk) chk.checked = false;
  const ok = document.getElementById("terms-gate-ok"); if(ok) ok.disabled = true;
  openM("m-terms-consent");
}
async function acceptTermsGate(){
  if(!currentUserProfile) return;
  const now = new Date().toISOString();
  const r = await sb.from("user_profiles").update({ terms_accepted_at: now, terms_version: TERMS_VERSION }).eq("email", currentUserProfile.email);
  if(r.error){
    // Never lock someone out of their own company's records because the consent could not be stored — allow this session and ask again next time.
    try{ sessionStorage.setItem("hwkm_terms_ok", TERMS_VERSION); }catch(e){}
    alert("تعذّر حفظ موافقتك الآن، يمكنك المتابعة وسنطلبها مرة أخرى في الدخول القادم.");
  } else {
    currentUserProfile.terms_accepted_at = now; currentUserProfile.terms_version = TERMS_VERSION;
  }
  closeM("m-terms-consent");
  try{
    if(currentUserProfile && !currentUserProfile.phone_verified_at && sessionStorage.getItem("hwkm_phone_later") !== "1") openPhoneGate(false);
  }catch(e){}
}

/* ينشئ صف الملف الشخصي عند أول دخول موثَّق من البيانات التي حُفظت مع حساب الدخول عند التسجيل.
   البريد يؤخذ من الجلسة (لا من النموذج)، وقاعدة البيانات تفرض الشركة والدور من العضويات ولا تسمح بصلاحيات المنصة. */
async function ensureProfileFromSignup(user){
  try{
    const m = user && user.user_metadata && user.user_metadata.hwkm_profile;
    if(!m || !user.email) return false;
    const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
    const payload = {
      email: user.email,
      account_type: clip(m.account_type, 40),
      full_name: clip(m.full_name, 120),
      national_id: clip(m.national_id, 20),
      phone_number: clip(m.phone_number, 20),
      shares_count: null, terms_accepted_at: null, terms_version: null
    };
    const { error } = await sb.from("user_profiles").insert([payload]);
    if(error && !/duplicate|unique/i.test(error.message || "")){ console.warn("profile create failed", error.message); return false; }
    return true;
  }catch(e){ return false; }
}

async function loadCurrentUserProfile(){
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  if(nameEl){ nameEl.value = ""; nameEl.disabled = false; nameEl.style.background = ""; }
  if(sharesEl){ sharesEl.value = ""; sharesEl.disabled = false; sharesEl.style.background = ""; }

  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  if(!email) return;
  let [{ data }, { data: memberships }] = await Promise.all([
    sb.from("user_profiles").select("*").eq("email", email).maybeSingle(),
    sb.from("user_company_memberships").select("*").eq("email", email)
  ]);
  if(!data){
    const made = await ensureProfileFromSignup(userData.user);
    if(made){ const r = await sb.from("user_profiles").select("*").eq("email", email).maybeSingle(); data = r.data || null; }
  }
  currentUserProfile = data || null;
  userMemberships = memberships || [];
  await claimPhoneProofIfAny();
  if(currentUserProfile && !currentUserProfile.phone_verified_at){
    let later = false; try{ later = sessionStorage.getItem("hwkm_phone_later") === "1"; }catch(e){}
    if(!later && !needsTermsConsent()) openPhoneGate(false);   // الشروط أولًا، ثم نافذة الجوال بعد قبولها
  }
  if(needsTermsConsent()){ openTermsGate(); }
  const joinIntentResult = await processPendingJoinIntent();
  // (The voter name and shares are filled later, only from the company's shareholder register — see autofillShareholderVoteFields.)
  // Platform owners stay company-less by design — even if their national ID happens to match
  // a shareholder/board-member record somewhere (and gets auto-linked at signup), the platform
  // view should never default them into "belonging" to that company. They explicitly pick a
  // company from the switcher only when they actually need to look at one.
  const isPlatformAdminAccount = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isTeamMemberAccount = currentUserProfile && currentUserProfile.platform_team_module && !isPlatformAdminAccount;
  const preferred = (currentUserProfile && !isPlatformAdminAccount && !isTeamMemberAccount) ? currentUserProfile.company_id : null;
  if(isPlatformAdminAccount || isTeamMemberAccount) viewingPlatformOverview = true;
  const joinBtn = document.getElementById("btnJoinByCode");
  if(joinBtn) joinBtn.style.display = (isPlatformAdminAccount || isTeamMemberAccount) ? "none" : "inline-flex";
  await loadCompanies(preferred);
  await loadMyPermissionOverrides();
  await applyRolePermissions();
  checkPendingApprovalBadges();
  resetIdleTimer();
  if(joinIntentResult && joinIntentResult.status !== "phone_unverified"){ const jm = joinResultMessage(joinIntentResult); setTimeout(() => alert(jm.text), 700); }
  if(currentUserProfile && !currentUserProfile.onboarding_seen && !isPlatformAdminAccount){
    setTimeout(() => openOnboardingGuide(), 600);
  }
}
