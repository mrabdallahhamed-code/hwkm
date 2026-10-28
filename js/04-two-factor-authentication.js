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

/* ══════════ SUPPORT TICKETS ══════════ */
async function openSupportModal(){
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  openM("m-support");
  loadMySupportTickets();
}

async function submitSupportTicket(){
  const subject = document.getElementById("sup-subject").value.trim();
  const message = document.getElementById("sup-message").value.trim();
  if(!subject || !message){ alert("الرجاء تعبئة الموضوع والوصف"); return; }
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from("support_tickets").insert([{
    company_id: currentCompanyId || null, submitted_by_email: email,
    submitted_by_name: currentUserProfile ? currentUserProfile.full_name : email, subject, message
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  {
    const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B">🆘 طلب دعم فني جديد</h2>
      <p><b>من:</b> ${currentUserProfile?currentUserProfile.full_name:email} (${email})</p>
      <p><b>الموضوع:</b> ${subject}</p>
      <p><b>الرسالة:</b> ${message}</p>
    </div>`;
    await notifyPlatformAdmins(`🆘 طلب دعم: ${subject}`, html);
  }
  alert("تم إرسال طلبك ✅ — سيتواصل معك فريق الدعم قريبًا.");
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  loadMySupportTickets();
}

async function loadMySupportTickets(){
  const box = document.getElementById("mySupportTicketsList");
  if(!box) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { data, error } = await sb.from("support_tickets").select("*").eq("submitted_by_email", email).order("created_at",{ascending:false});
  if(error || !data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لا توجد طلبات سابقة.</div>'; return; }
  box.innerHTML = data.map(t => `<div style="background:var(--offwhite);border-radius:8px;padding:8px 10px;margin-bottom:6px">
    <div style="font-size:12px;font-weight:700">${orgEsc(t.subject)}</div>
    <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">الحالة: <b style="color:${t.status==='مغلقة'?'var(--green)':'var(--gold)'}">${t.status}</b> · ${new Date(t.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
    ${t.admin_reply ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد الدعم:</b> ${t.admin_reply}</div>` : ""}
  </div>`).join("");
}

/* ══════════ ONBOARDING GUIDE ══════════ */
/* ══════════ EXPORT ALL COMPANY DATA ══════════
   The subscription agreement (Article 22) grants the client the right to extract their data —
   this is the "one button" version of that: pull everything scoped to the current company
   across every major table and package it as a single downloadable JSON file. */
const EXPORT_TABLES = [
  "meetings","policies","risks","board_members","shareholders","committees","compliance_items",
  "audit_items","signing_documents","document_signatures","governance_assessments","performance_evaluations",
  "vote_topics","agm_attendance","share_transfers","activity_log","ceo_monthly_reports",
  "audit_requests","risk_requests","company_requests","document_templates"
];

async function exportAllCompanyData(){
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }
  if(!await uiConfirm("سيتم تجميع كل بيانات شركتك المسجَّلة بالمنصة بملف واحد قابل للتحميل. قد يأخذ هذا بضع ثوانٍ. متابعة؟")) return;

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const exportData = { exported_at: new Date().toISOString(), company: company || {}, data: {} };

  for(const table of EXPORT_TABLES){
    try{
      const { data, error } = await sb.from(table).select("*").eq("company_id", currentCompanyId);
      exportData.data[table] = error ? { error: error.message } : (data || []);
    }catch(e){
      exportData.data[table] = { error: e.message };
    }
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `بيانات-${(company?.name||"الشركة").replace(/[\\/:*?"<>|]/g,"_")}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  alert("تم تحميل ملف بيانات شركتك بنجاح ✅");
}

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
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }

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

function toggleNotifPanel(){
  const panel = document.getElementById("notifPanel");
  if(!panel) return;
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "block" : "none";
  if(opening) loadNotifications();
}
document.addEventListener('click', function(e){
  const panel = document.getElementById("notifPanel");
  if(!panel || panel.style.display === "none") return;
  if(!panel.contains(e.target) && !e.target.closest('.notif-btn')) panel.style.display = "none";
});

async function loadNotifications(){
  const list = document.getElementById("notifList");
  const dot = document.getElementById("notifDot");
  if(!list || !currentUserProfile) return;

  const role = getCurrentRole();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const items = [];

  // 0) Platform admin: new company registration requests awaiting review — this is a
  // platform-wide event, not scoped to whichever company is currently selected.
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(isPlatformAdmin){
    const { data: reqs } = await sb.from("company_requests").select("*").eq("status", "قيد المراجعة");
    (reqs||[]).forEach(r => { items.push({ icon:"🏢", text:`طلب إدراج شركة جديد: "${r.company_name}" ينتظر مراجعتك`, page:"companyrequests" }); });
  }

  // 1) Consultation requests needing your action
  if(role === 'مدير النظام' || role === 'رئيس مجلس'){
    const { data: cr } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId);
    (cr||[]).forEach(r => {
      if(role==='مدير النظام' && r.status==='جديد') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر عرض سعر منك`, page:"consultants" });
      if(role==='رئيس مجلس' && r.status==='عرض سعر مقدم') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر قرارك`, page:"consultants" });
    });
  }

  if(role !== 'مساهم'){
    // 2) Meeting requests needing your response
    const { data: mr } = await sb.from("meeting_requests").select("*").eq("company_id", currentCompanyId).eq("status","قيد الموافقة");
    if(mr && mr.length){
      const ids = mr.map(r=>r.id);
      const { data: myResponses } = await sb.from("meeting_request_responses").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const respondedIds = new Set((myResponses||[]).map(r=>r.request_id));
      mr.forEach(r => { if(!respondedIds.has(r.id)) items.push({ icon:"🗳️", text:`طلب اجتماع "${r.title}" ينتظر موافقتك على الموعد`, page:"meetings" }); });
    }

    // 3) Policy reviews needing your response
    const { data: pol } = await sb.from("policies").select("*").eq("company_id", currentCompanyId).eq("status","مرفوعة لمجلس الإدارة");
    if(pol && pol.length){
      const ids = pol.map(p=>p.id);
      const { data: myPolReviews } = await sb.from("policy_reviews").select("policy_id").in("policy_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPolReviews||[]).map(r=>r.policy_id));
      pol.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📜", text:`سياسة "${p.policy_name}" تنتظر رأيك`, page:"governance" }); });
    }

    // 4) Appointment requests needing your review
    const { data: ap } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).eq("status","محال إلى مجلس الإدارة");
    if(ap && ap.length){
      const ids = ap.map(a=>a.id);
      const { data: myApReviews } = await sb.from("appoint_request_reviews").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myApReviews||[]).map(r=>r.request_id));
      ap.forEach(a => { if(!reviewedIds.has(a.id)) items.push({ icon:"👤", text:`طلب تعيين "${a.candidate_name}" ينتظر رأيك`, page:"appoint" }); });
    }

    // 5) Performance evaluations needing your input
    const { data: pe } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).eq("status","مفتوح للتقييم");
    if(pe && pe.length){
      const ids = pe.map(p=>p.id);
      const { data: myPeReviews } = await sb.from("performance_evaluation_reviews").select("evaluation_id").in("evaluation_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPeReviews||[]).map(r=>r.evaluation_id));
      pe.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📐", text:`تقييم أداء "${p.entity_name}" ينتظر تقييمك`, page:"perf" }); });
    }

    // 6) Documents needing your signature
    const { data: docs } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).neq("status","مكتمل");
    if(docs && docs.length){
      const ids = docs.map(d=>d.id);
      const { data: mySigs } = await sb.from("document_signatures").select("document_id").in("document_id", ids).eq("signer_email", myEmail||"");
      const signedIds = new Set((mySigs||[]).map(s=>s.document_id));
      docs.forEach(d => { if(!signedIds.has(d.id)) items.push({ icon:"✍️", text:`وثيقة "${d.document_name}" تنتظر توقيعك`, page:"signing" }); });
    }
  }

  // 7) Upcoming meetings within 3 days (everyone with page access)
  const { data: meetings } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId);
  const now = new Date();
  (meetings||[]).forEach(m => {
    if(!m.meeting_date) return;
    const days = Math.ceil((new Date(m.meeting_date) - now) / 86400000);
    if(days >= 0 && days <= 3){
      items.push({ icon:"📅", text:`${m.title||"اجتماع"} خلال ${days===0?'اليوم':(days+' يوم')}`, page: m.meeting_type==="الجمعية العامة"?"agm":(m.meeting_type==="اجتماع لجنة"?"committees":"meetings") });
    }
  });

  if(dot) dot.style.display = items.length ? "block" : "none";
  if(items.length===0){
    list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">لا توجد تنبيهات حاليًا ✅</div>';
    return;
  }
  list.innerHTML = items.map(it => `
    <div onclick="document.getElementById('notifPanel').style.display='none';go('${it.page}',null)" style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" onmouseover="this.style.background='var(--offwhite)'" onmouseout="this.style.background='transparent'">
      <span style="font-size:15px">${it.icon}</span>
      <span style="font-size:12px;color:var(--dark);line-height:1.6">${it.text}</span>
    </div>`).join("");
}

function renderDashTopRisks(risks){
  const box = document.getElementById("dashTopRisks");
  if(!box) return;
  if(risks.length===0){ box.innerHTML = '<div class="dash-empty"><span>لم تُسجَّل مخاطر بعد.</span><button class="btn-xs primary" onclick="go(\'risks\',null)">سجّل أول خطر</button></div>'; return; }
  const severity = r => (r.impact==="عالٍ"?2:r.impact==="متوسط"?1:0) * 100 + (r.probability||0);
  const top = [...risks].sort((a,b)=>severity(b)-severity(a)).slice(0,5);
  box.innerHTML = top.map(r => {
    const color = riskSeverityColor(r.impact, r.probability);
    return `<div onclick="go('risks',null)" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray1);cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="font-size:12px;font-weight:600;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${orgEsc(r.risk_name||"")}</span>
      </div>
      <span style="font-size:10.5px;color:var(--gray3);flex-shrink:0">${r.impact||"—"} · ${r.probability!=null?r.probability+'%':'—'}</span>
    </div>`;
  }).join("");
}

function renderDashAuditStatus(items){
  const box = document.getElementById("dashAuditStatus");
  if(!box) return;
  if(items.length===0){ box.innerHTML = '<div class="dash-empty"><span>لا توجد بنود تدقيق مسجّلة بعد.</span><button class="btn-xs primary" onclick="go(\'audit\',null)">أضف بند تدقيق</button></div>'; return; }
  const open = items.filter(i=>i.status==="مفتوحة").length;
  const inProgress = items.filter(i=>i.status==="قيد المتابعة").length;
  const closed = items.filter(i=>i.status==="مغلقة").length;
  const total = items.length;
  const pct = total ? Math.round((closed/total)*100) : 0;
  const openItems = items.filter(i=>i.status!=="مغلقة").slice(0,3);
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="font-size:26px;font-weight:900;color:var(--teal)">${pct}%</div>
      <div style="flex:1">
        <div style="height:8px;background:var(--offwhite);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--teal)"></div></div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">${closed} مغلقة · ${inProgress} قيد المتابعة · ${open} مفتوحة</div>
      </div>
    </div>
    ${openItems.map(i => `<div onclick="go('audit',null)" style="padding:6px 0;border-top:1px solid var(--gray1);cursor:pointer;font-size:11.5px;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔸 ${i.item||""}</div>`).join("")}
  `;
}

/* ══════════ PROACTIVE GOVERNANCE ALERTS ══════════
   Everything here is already tracked somewhere in the platform — this doesn't compute anything
   new, it just refuses to leave it as passive data someone has to remember to go dig for.
   Performance/attendance items are only ever included for viewers who canSeePerfResults() —
   the panel is shared infrastructure, but it never leaks a confidentiality-restricted signal
   to someone who wouldn't otherwise be allowed to see it. */
async function computeGovernanceAlerts(){
  const alerts = [];
  const govBodyLabel = getGovernanceBodyLabel();

  // 1) Performance trending down or stuck low across evaluation cycles
  if(await canSeePerfResults()){
    const { data: completed } = await sb.from("performance_evaluations").select("*")
      .eq("company_id", currentCompanyId).eq("status","مكتمل").not("evaluated_email","is",null).order("period",{ascending:true});
    const byPerson = {};
    (completed||[]).forEach(e => { if(!byPerson[e.evaluated_email]) byPerson[e.evaluated_email]=[]; byPerson[e.evaluated_email].push(e); });
    for(const email in byPerson){
      const evals = byPerson[email];
      if(evals.length < 2) continue;
      const scores = evals.map(e=>Number(e.score)||0);
      const last = scores[scores.length-1];
      const isDeclining = scores.every((s,i) => i===0 || s <= scores[i-1]) && scores[0] > last;
      const isConsistentlyLow = scores.slice(-Math.min(3,scores.length)).every(s => s < 3);
      if(isDeclining || isConsistentlyLow){
        alerts.push({
          severity: "high",
          text: `أداء "${evals[evals.length-1].entity_name}" ${isConsistentlyLow?'منخفض باستمرار':'في تراجع'} عبر ${evals.length} دورات تقييم — يستاهل نقاش لجنة الترشيحات${govBodyLabel==='مجلس الإدارة'?' أو رئيس المجلس':''}.`,
          page: "perf"
        });
      }
    }

    // 2) Real attendance rate below a healthy threshold
    try {
      const attendance = await computeAttendancePercentages();
      attendance.filter(a => a.pct !== null && a.pct < 60).forEach(a => {
        alerts.push({ severity: "medium", text: `نسبة حضور "${a.name}" الفعلية ${a.pct}% فقط — أقل من الحد الصحي المعتاد (60%).`, page: "perf" });
      });
    } catch(e){ console.error("attendance alert check failed", e); }
  }

  // 3) Policies stuck in an approval cycle past the company's own configured deadline
  try {
    const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
    const { data: allApprovals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).not("status","eq","مكتملة").not("status","eq","مرفوضة");
    const stuck = (allApprovals||[]).filter(a => (a.document_type||"").startsWith("policy_") && Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000) > deadlineDays);
    if(stuck.length){
      const maxLate = Math.max(...stuck.map(a => Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000) - deadlineDays));
      alerts.push({ severity: "high", cta: "راجع السياسات", text: `${stuck.length} ${stuck.length===1?'سياسة متأخرة':'سياسات متأخرة'} عن مهلة الاعتماد (${deadlineDays} يوم)، وأقدمها تجاوزت المهلة بـ ${maxLate} يوماً — بانتظار توقيع أحد الموقّعين.`, page: "governance" });
    }
  } catch(e){ console.error("policy deadline alert check failed", e); }

  // 4) High-impact risks that are still just "مراقبة" (i.e., no active treatment yet)
  try {
    const { data: risks } = await sb.from("risks").select("*").eq("company_id", currentCompanyId).eq("impact","عالٍ").eq("status","مراقبة");
    if(risks && risks.length){
      alerts.push({ severity: "high", text: `${risks.length} ${risks.length===1?'خطر عالي التأثير':'مخاطر عالية التأثير'} لسا بمرحلة "مراقبة" فقط — بلا خطة معالجة نشطة بعد.`, page: "risks" });
    }
  } catch(e){ console.error("risk alert check failed", e); }

  // 5) Board decisions past their target date with no completion yet
  try {
    const { data: decisions } = await sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).not("target_date","is",null).not("status","eq","منجز");
    const overdue = (decisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
    if(overdue.length){
      alerts.push({ severity: "high", text: `${overdue.length} ${overdue.length===1?'قرار مجلس متأخر':'قرارات مجلس متأخرة'} عن موعد التنفيذ المستهدف.`, page: "decisiontracking" });
    }
  } catch(e){ console.error("decision tracking alert check failed", e); }

  // 7) Corrective actions from governance assessments past their target date, not yet closed
  try {
    const { data: gaOpenActs } = await sb.from("governance_actions").select("id,target_date,status").eq("company_id", currentCompanyId).not("status","eq","مغلق").not("target_date","is",null);
    const gaLate = (gaOpenActs||[]).filter(x => new Date(x.target_date) < new Date(new Date().toDateString()));
    if(gaLate.length){
      alerts.push({ severity: "high", text: `${gaLate.length} ${gaLate.length===1?'إجراء تصحيحي متأخر':'إجراءات تصحيحية متأخرة'} عن موعدها من تقييم فعالية الحوكمة.`, page: "govassess" });
    }
  } catch(e){ console.error("corrective action alert check failed", e); }

  // 9) Join requests waiting for this company's approver
  if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){
    try {
      const { data: jr } = await sb.from("company_join_requests").select("id").eq("company_id", currentCompanyId).eq("status","قيد المراجعة");
      if(jr && jr.length) alerts.push({ severity: "high", text: `${jr.length} ${jr.length===1?'طلب انضمام ينتظر':'طلبات انضمام تنتظر'} موافقتك.`, page: "users" });
    } catch(e){ console.error("join request alert check failed", e); }
  }

  // 8) External compliance items past their deadline (a recurring one with a past date is unconfirmed)
  try {
    const { data: cmpRows } = await sb.from("compliance_items").select("id,status,due_date,frequency").eq("company_id", currentCompanyId);
    const cmpLate = (cmpRows||[]).filter(i => complianceDerivedStatus(i) === "متأخر").length;
    if(cmpLate){
      alerts.push({ severity: "high", text: `${cmpLate} ${cmpLate===1?'التزام نظامي متأخر':'التزامات نظامية متأخرة'} عن موعدها.`, page: "compliance" });
    }
  } catch(e){ console.error("compliance alert check failed", e); }

  // 6) Manager decisions (single-manager LLC) past their own target date, unfinished
  if(currentCompanyLLCSingleManager){
    try {
      const { data: mgrDecisions } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context","manager").not("target_date","is",null).not("status","eq","منجز");
      const overdueMgr = (mgrDecisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
      if(overdueMgr.length){
        alerts.push({ severity: "high", text: `${overdueMgr.length} ${overdueMgr.length===1?'قرار مدير متأخر':'قرارات مدير متأخرة'} عن موعد التنفيذ المستهدف.`, page: "managerdecisions" });
      }
    } catch(e){ console.error("manager decision alert check failed", e); }
  }

  return alerts;
}

async function renderGovAlertsPanel(){
  const panel = document.getElementById("govAlertsPanel");
  if(!panel) return;
  const alerts = await computeGovernanceAlerts();
  if(alerts.length === 0){ panel.style.display = "none"; return; }

  const high = alerts.filter(a=>a.severity==="high");
  const med = alerts.filter(a=>a.severity!=="high");
  const row = a => `<div class="gal-row ${a.severity==='high'?'gal-high':'gal-med'}" onclick="go('${a.page}',null)">
      <span class="gal-dot"></span>
      <span class="gal-text">${a.text}</span>
      <span class="gal-cta">${a.cta||"افتح"} ‹</span>
    </div>`;
  panel.style.display = "block";
  panel.innerHTML = `<div class="card gal-card">
    <div class="gal-head">
      <span class="ico ico-bolt" style="width:18px;height:18px"></span>
      <span class="gal-title">تنبيهات الحوكمة</span>
      ${high.length ? `<span class="gal-chip gal-chip-high">${high.length} تحتاج تصرفاً الآن</span>` : ""}
      ${med.length ? `<span class="gal-chip">${med.length} للعلم</span>` : ""}
    </div>
    ${high.length ? `<div class="gal-sec">تحتاج تصرفاً الآن</div>${high.map(row).join("")}` : ""}
    ${med.length ? `<div class="gal-sec">للعلم والمتابعة</div>${med.map(row).join("")}` : ""}
  </div>`;
}

/* Dashboard for entities that have no board: the meeting cards, "board members" and "committees"
   figures and the upcoming-meetings list describe things these companies don't have. Recent
   decisions replaces the meetings list so the card isn't just removed and left as a hole. */
async function applyDashboardEntityAdaptation(){
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const isLLC = currentCompanyType === "ذات مسؤولية محدودة";
  const noBoard = isSoleProp || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const hide = (id, on) => { const el = document.getElementById(id); const box = el ? (el.closest(".kpi") || el.closest(".sb-item")) : null; if(box) box.style.display = on ? "none" : ""; };

  hide("kpi-meetings-q", noBoard);
  hide("stat-members", noBoard);
  hide("stat-committees", noBoard || isLLC);
  const minutesLbl = document.getElementById("kpi-minutes") ? document.getElementById("kpi-minutes").closest(".kpi").querySelector(".kpi-label") : null;
  if(minutesLbl) minutesLbl.textContent = noBoard ? "وثائق موقّعة" : "محاضر معتمدة";
  const membersLbl = document.getElementById("stat-members") ? document.getElementById("stat-members").parentElement.querySelector(".sb-lbl") : null;
  if(membersLbl) membersLbl.textContent = `أعضاء ${getGovernanceBodyLabel()}`;

  const body = document.getElementById("dashUpcomingMeetings");
  const card = body ? body.closest(".card") : null;
  if(!card) return;
  const title = card.querySelector(".card-title");
  const btn = card.querySelector(".card-head button");
  if(!noBoard){
    if(title) title.innerHTML = '<span class="ico-i ico-calendar"></span>الاجتماعات القادمة';
    if(btn){ btn.setAttribute("onclick","go('meetings',null)"); btn.textContent = "عرض الكل"; btn.style.display = ""; }
    return;
  }
  const context = currentCompanyLLCSingleManager ? "manager" : "owner";
  const page = context === "manager" ? "managerdecisions" : "ownerdecisions";
  if(title) title.innerHTML = `<span class="ico-i ico-signature"></span>آخر قرارات ${context === "manager" ? "المدير" : "المالك"}`;
  if(btn){ btn.setAttribute("onclick", `go('${page}',null)`); btn.textContent = "عرض الكل"; btn.style.display = ""; }
  const { data } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context", context).order("decision_date",{ascending:false}).limit(4);
  const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  body.innerHTML = (data && data.length)
    ? data.map(d => `<div style="padding:8px 0;border-bottom:1px solid var(--gray1)">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${esc(String(d.decision_text).slice(0,90))}${String(d.decision_text).length>90?"…":""}</div>
        <div style="font-size:11px;color:var(--gray3);margin-top:2px">${esc(d.decision_date)} · ${d.signed_at ? "موقَّع" : "غير موقَّع"}</div></div>`).join("")
    : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد قرارات موثَّقة بعد.<br><button class="btn-xs primary" style="margin-top:8px" onclick="go('${page}',null)">توثيق قرار</button></div>`;
}

async function loadDashboard(){
  renderGovAlertsPanel(); // fire independently — a slow/failed alert check must never block the rest of the dashboard
  const [meetingsRes, risksRes, complianceRes, membersRes, committeesRes, signingRes, policiesRes, auditRes, govAssessRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("risks").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("audit_items").select("*").eq("company_id", currentCompanyId),
    sb.from("governance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1)
  ]);

  const meetings = meetingsRes.data || [];
  const risks = risksRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const members = membersRes.data || [];
  const committeesData = committeesRes.data || [];
  const signingDocs = signingRes.data || [];
  const policies = policiesRes.data || [];
  const auditItems = auditRes.data || [];

  const govassessKpiEl = document.getElementById("kpi-govassess");
  const govassessFootEl = document.getElementById("kpi-govassess-foot");
  const govassessStripeEl = document.getElementById("kpi-govassess-stripe");
  if(govassessKpiEl){
    const latestAssess = (govAssessRes.data||[])[0];
    if(latestAssess){
      const { finalScore } = computeGovScores(latestAssess);
      if(finalScore != null){
        const pct = Math.round((finalScore/5)*100);
        const interp = maturityInterpretation(finalScore);
        govassessKpiEl.textContent = pct + "%";
        govassessKpiEl.style.color = interp.color;
        if(govassessStripeEl) govassessStripeEl.style.background = interp.color;
        if(govassessFootEl) govassessFootEl.textContent = interp.label + " · " + (latestAssess.period||"");
      } else {
        govassessKpiEl.textContent = "—";
        if(govassessFootEl) govassessFootEl.textContent = "لا توجد معايير مُقيَّمة بعد";
      }
    } else {
      govassessKpiEl.textContent = "—";
      if(govassessFootEl) govassessFootEl.textContent = "لم يُجرَ تقييم بعد";
    }
  }
  renderDashTopRisks(risks);
  renderDashAuditStatus(auditItems);

  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);
  const currentQuarter = Math.floor(now.getMonth()/3);
  const currentYear = now.getFullYear();

  // ── KPI: meetings this quarter ──
  const quarterMeetings = meetings.filter(m => {
    if(!m.meeting_date) return false;
    const d = new Date(m.meeting_date);
    return d.getFullYear()===currentYear && Math.floor(d.getMonth()/3)===currentQuarter;
  });
  const completedQ = quarterMeetings.filter(m => m.meeting_date < todayStr).length;
  const upcomingQ = quarterMeetings.filter(m => m.meeting_date >= todayStr).length;
  setText("kpi-meetings-q", quarterMeetings.length);
  setText("kpi-meetings-q-foot", `✅ ${completedQ} مكتملة · ${upcomingQ} قادمة`);

  // ── KPI: approved minutes (fully-signed documents) ──
  const approvedDocs = signingDocs.filter(d => d.status === "مكتمل");
  const approvedThisMonth = approvedDocs.filter(d => d.created_at && new Date(d.created_at).getMonth()===now.getMonth() && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("kpi-minutes", approvedDocs.length);
  setText("kpi-minutes-foot", `↑ ${approvedThisMonth} هذا الشهر`);

  // ── KPI: compliance % ──
  const cmpSum = complianceSummary(compliance, await cmpLatestAssessment());
  setText("kpi-compliance", cmpSum.pct != null ? cmpSum.pct+"%" : "—");
  setText("kpi-compliance-foot", cmpSum.text);
  setText("stat-compliance2", cmpSum.pct != null ? cmpSum.pct+"%" : "—");

  // ── KPI: open risks ──
  const openRisks = risks.filter(r => r.status === "مراقبة" || r.status === "متابعة");
  const highOpenRisks = openRisks.filter(r => r.impact === "عالٍ").length;
  setText("kpi-risks", openRisks.length);
  setText("kpi-risks-foot", highOpenRisks ? `🔴 ${highOpenRisks} عالية الأولوية` : "لا مخاطر عالية حاليًا");

  // ── Stats bar ──
  setText("stat-members", members.length);
  setText("stat-committees", committeesData.length);
  const decisionsThisYear = signingDocs.filter(d => d.created_at && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("stat-decisions", decisionsThisYear);
  setText("stat-pending-signs", signingDocs.filter(d => d.status !== "مكتمل").length);

  // ── Upcoming meetings (next 4, any type) ──
  const upcoming = meetings
    .filter(m => m.meeting_date && m.meeting_date >= todayStr)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""))
    .slice(0,4);
  const upcomingBox = document.getElementById("dashUpcomingMeetings");
  if(upcomingBox){
    if(upcoming.length===0){
      upcomingBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد اجتماعات قادمة حاليًا.</div>';
    } else {
      upcomingBox.innerHTML = upcoming.map(m => {
        const d = new Date(m.meeting_date);
        const isEmergency = m.meeting_type === "اجتماع طارئ";
        const badge = isEmergency ? '<span class="badge urgent">طارئ</span>' : '<span class="badge done">مؤكد</span>';
        return `<div class="meet-item">
          <div class="meet-dt"><div class="meet-day">${d.getDate()}</div><div class="meet-mon">${AR_MONTHS[d.getMonth()]}</div></div>
          <div class="meet-info"><div class="meet-name">${orgEsc(m.title||"")}</div><div class="meet-meta"><span class="ico-i ico-pin"></span>${m.method||"—"}${m.meeting_time?(' · '+m.meeting_time):''} · ${m.meeting_type||""}</div></div>
          ${badge}
        </div>`;
      }).join("");
    }
  }

  // ── Executive alerts, generated from real conditions across the platform ──
  const alerts = [];
  if(upcoming.length){
    const next = upcoming[0];
    const daysAway = Math.ceil((new Date(next.meeting_date) - now) / 86400000);
    if(daysAway <= 7){
      alerts.push({ color:"red", text:`${next.title||"اجتماع"} مقرر خلال ${daysAway} ${daysAway===1?'يوم':'أيام'} — ${next.meeting_date}` });
    }
  }
  if(highOpenRisks){
    alerts.push({ color:"red", text:`يوجد ${highOpenRisks} ${highOpenRisks===1?'خطر مصنّف':'مخاطر مصنّفة'} عالية الأولوية تحتاج خطة معالجة` });
  }
  const pendingSignCount = signingDocs.filter(d => d.status !== "مكتمل").length;
  if(pendingSignCount){
    alerts.push({ color:"gold", text:`${pendingSignCount} ${pendingSignCount===1?'وثيقة تنتظر':'وثائق تنتظر'} التوقيع الإلكتروني` });
  }
  const recentlyApproved = approvedDocs
    .filter(d => d.created_at && (now - new Date(d.created_at)) < 7*86400000)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
  if(recentlyApproved){
    alerts.push({ color:"green", text:`تم اعتماد "${recentlyApproved.document_name}" بالتوقيع الإلكتروني من جميع الأطراف` });
  }
  const soonReview = policies
    .filter(p => p.review_date && (new Date(p.review_date)-now) < 30*86400000 && (new Date(p.review_date)-now) > 0)
    .sort((a,b)=> new Date(a.review_date)-new Date(b.review_date))[0];
  if(soonReview){
    const daysLeft = Math.ceil((new Date(soonReview.review_date)-now)/86400000);
    alerts.push({ color:"gold", text:`موعد مراجعة "${soonReview.policy_name}" خلال ${daysLeft} يومًا` });
  }
  const complianceGaps = compliance.filter(c => !complianceIsOk(c)).length;
  if(complianceGaps){
    alerts.push({ color:"gold", text:`${complianceGaps} ${complianceGaps===1?'بند امتثال':'بنود امتثال'} لم يكتمل بعد` });
  }

  const alertsBox = document.getElementById("dashAlerts");
  if(alertsBox){
    const bar = (label, done, total, goPage) => {
      if(!total) return `<div class="pg-row" onclick="go('${goPage}',null)"><div class="pg-top"><span>${label}</span><small>لا بيانات بعد</small></div><div class="pg-track"></div></div>`;
      const p = Math.round(done/total*100);
      const cls = p>=80?"pg-good":p>=50?"pg-mid":"pg-low";
      return `<div class="pg-row" onclick="go('${goPage}',null)"><div class="pg-top"><span>${label}</span><small><b>${done}</b> من ${total} · ${p}%</small></div><div class="pg-track"><div class="pg-fill ${cls}" style="width:${p}%"></div></div></div>`;
    };
    const pol = policies;
    const polDone = pol.filter(p => p.approval_date).length;
    const signTot = signingDocs.length, signDone = signingDocs.filter(d => d.status === "مكتمل").length;
    const cmpOk = compliance.filter(complianceIsOk).length;
    const auditTot = auditItems.length, auditDone = auditItems.filter(i => i.status === "مغلقة").length;
    let actTot = 0, actDone = 0;
    try {
      const { data: acts } = await sb.from("governance_actions").select("status").eq("company_id", currentCompanyId);
      actTot = (acts||[]).length; actDone = (acts||[]).filter(x => x.status === "مغلق").length;
    } catch(e){}
    alertsBox.innerHTML = `<div class="pg-wrap">
      ${bar("سياسات معتمدة", polDone, pol.length, "governance")}
      ${bar("وثائق موقّعة بالكامل", signDone, signTot, "signing")}
      ${bar("بنود امتثال ملتزمة", cmpOk, compliance.length, "compliance")}
      ${bar("بنود تدقيق مغلقة", auditDone, auditTot, "audit")}
      ${bar("إجراءات تصحيحية مُغلقة", actDone, actTot, "govassess")}
    </div>`;
  }
  enhanceDashboardKpis({ quarterMeetings: quarterMeetings.length, completedQ, upcomingQ, pendingSigns: signingDocs.filter(d => d.status !== "مكتمل").length, approvedThisMonth, cmpSum, risksTotal: risks.length, openRisks: openRisks.length, highOpenRisks });
  applyDashboardEntityAdaptation();
}

/* Dashboard KPI interpretation: every figure gets a plain status, the reason behind it and the next step,
   so an executive can decide from the card itself instead of guessing what "0%" or "—" means. */
function enhanceDashboardKpis(c){
  const put = (valId, st, why, act, valText) => {
    const v = document.getElementById(valId); const k = v ? v.closest(".kpi") : null; if(!k) return;
    if(valText !== undefined){ v.textContent = valText; v.classList.toggle("kpi-val-na", valText === "غير مقيَّم" || valText === "لا بيانات"); }
    else v.classList.remove("kpi-val-na");
    const foot = k.querySelector(".kpi-foot"); if(foot) foot.style.display = "none";
    let ins = k.querySelector(".kpi-ins"); if(!ins){ ins = document.createElement("div"); ins.className = "kpi-ins"; k.appendChild(ins); }
    const lbl = {good:"جيد", watch:"يحتاج متابعة", crit:"حرج", na:"غير مقيَّم"}[st];
    ins.innerHTML = `<span class="kst kst-${st}">${lbl}</span><div class="kpi-why">${why}</div>${act ? `<div class="kpi-act">${act} ‹</div>` : ""}`;
  };
  // meetings
  put("kpi-meetings-q", c.quarterMeetings ? "good" : "watch",
    c.quarterMeetings ? `${c.completedQ} منعقدة و${c.upcomingQ} قادمة هذا الربع` : "لا توجد اجتماعات مجدولة لهذا الربع",
    c.quarterMeetings ? "" : "جدولة اجتماع");
  // minutes / signed documents
  put("kpi-minutes", c.pendingSigns ? "watch" : "good",
    c.pendingSigns ? `${c.pendingSigns} ${c.pendingSigns===1?'وثيقة تنتظر':'وثائق تنتظر'} توقيعاً · ${c.approvedThisMonth} اعتُمدت هذا الشهر` : `كل الوثائق موقّعة · ${c.approvedThisMonth} هذا الشهر`,
    c.pendingSigns ? "افتح التوقيعات" : "");
  // compliance
  const unassessed = c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||"");
  if(c.cmpSum.pct == null) put("kpi-compliance","na","لا توجد بنود امتثال مسجّلة بعد","ابدأ بإضافة البنود","لا بيانات");
  else if(unassessed) put("kpi-compliance","na",`${c.cmpSum.text.replace(" (لم يُجرَ تقييم بعد)","")} — بلا تقييم رسمي حتى الآن`,"ابدأ التقييم","غير مقيَّم");
  else { const p=c.cmpSum.pct; put("kpi-compliance", p<50?"crit":p<80?"watch":"good", c.cmpSum.text, p<80?"راجع البنود غير المكتملة":"", p+"%"); }
  // risks
  if(!c.risksTotal) put("kpi-risks","na","لم تُسجَّل مخاطر بعد","سجّل أول خطر","لا بيانات");
  else if(c.highOpenRisks) put("kpi-risks","crit",`${c.highOpenRisks} عالية التأثير ما زالت قيد المراقبة بلا خطة معالجة`,"راجع المخاطر");
  else if(c.openRisks) put("kpi-risks","watch",`${c.openRisks} ${c.openRisks===1?'خطر مفتوح':'مخاطر مفتوحة'} متوسطة أو منخفضة التأثير`,"راجع المخاطر");
  else put("kpi-risks","good","لا مخاطر مفتوحة حالياً","");
  // governance effectiveness
  const g = document.getElementById("kpi-govassess");
  if(g){
    const m = (g.textContent||"").match(/(\d+)%/);
    if(!m) put("kpi-govassess","na","لم يُجرَ تقييم لفعالية الحوكمة بعد","ابدأ التقييم","غير مقيَّم");
    else { const p=+m[1]; const f=document.getElementById("kpi-govassess-foot"); const why=f&&f.textContent?f.textContent:"نتيجة آخر تقييم"; put("kpi-govassess", p<50?"crit":p<75?"watch":"good", why, p<75?"اطّلع على الإجراءات التصحيحية":""); }
  }
  // stats bar: pending signatures becomes an actionable item
  const sc = document.getElementById("stat-compliance2"); if(sc && (c.cmpSum.pct == null || /لم يُجرَ/.test(c.cmpSum.text||""))) sc.textContent = "غير مقيَّم";
  const ps = document.getElementById("stat-pending-signs"); const psb = ps ? ps.closest(".sb-item") : null;
  if(psb){ psb.style.cursor="pointer"; psb.onclick = () => go("signing", null); psb.classList.toggle("sb-alert", c.pendingSigns > 0); }
}
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
