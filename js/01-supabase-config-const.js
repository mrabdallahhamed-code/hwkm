/* دالة تنظيف النصوص تُعرَّف مبكرًا حتى لا تفشل الشاشات التي تُحمَّل قبل ملف التوقيع (js/10) */
function orgEsc(v){ return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
/* ══════════ SUPABASE CONFIG ══════════ */
const SUPABASE_URL = "https://omddnkofsdtwfjkxdktt.supabase.co";
const SUPABASE_KEY = "sb_publishable_SbHWC7JAuyvXypZyJeiWkg_I9Y4gjbj";
/* ══════════ CAPTCHA (Cloudflare Turnstile) ══════════
   المفتاح العام فقط هنا (آمن للنشر). المفتاح السري يوضع في إعدادات Supabase ولا يظهر في الكود. */
const TURNSTILE_SITE_KEY = "0x4AAAAAAFfbq7ZLVouDezxS";
const _tsIds = {};
function tsRender(boxId){
  if(!window.turnstile || _tsIds[boxId] !== undefined) return;
  const box = document.getElementById(boxId);
  if(!box) return;
  try{ _tsIds[boxId] = window.turnstile.render(box, { sitekey: TURNSTILE_SITE_KEY, theme: "light" }); }catch(e){}
}
function tsToken(boxId){
  if(!window.turnstile || _tsIds[boxId] === undefined) return undefined;
  return window.turnstile.getResponse(_tsIds[boxId]) || undefined;
}
function tsReset(boxId){
  try{ if(window.turnstile && _tsIds[boxId] !== undefined) window.turnstile.reset(_tsIds[boxId]); }catch(e){}
}
window.hwkmTsReady = function(){ tsRender("tsLoginBox"); };

/* ══════════ ENGLISH TRANSLATION LAYER ══════════
   Rather than rewrite every function that builds Arabic HTML (hundreds of them), we translate
   the rendered DOM after the fact: a dictionary of exact Arabic phrases → English, applied to
   every text node (and placeholder/title attributes) on load and again via MutationObserver
   whenever new content renders (page navigation, data loading, modals opening). Any Arabic
   string with no dictionary entry is simply left as-is — a safe fallback, never a broken UI. */
let currentLang = localStorage.getItem('hawkim_lang') || 'ar';

let TRANSLATIONS = {}, TRANSLATION_PATTERNS = [], TRANSLATION_INDEX = {};
/* The English dictionary lives in i18n-en.js and is fetched only when English is actually used,
   so Arabic users (almost everyone) do not download or parse it. */
let i18nLoading = null;
function adoptI18n(){ const p = window.__I18N_EN; if(p){ TRANSLATIONS = p.dict; TRANSLATION_PATTERNS = p.patterns; TRANSLATION_INDEX = p.index; return true; } return false; }
function loadI18n(){
  if(adoptI18n()) return Promise.resolve();
  if(i18nLoading) return i18nLoading;
  i18nLoading = new Promise((resolve, reject) => {
    const sc = document.createElement("script"); sc.src = "i18n-en.js?v=944ecdad";
    sc.onload = () => { adoptI18n(); resolve(); };
    sc.onerror = () => { i18nLoading = null; reject(new Error("i18n load failed")); };
    document.head.appendChild(sc);
  });
  return i18nLoading;
}
adoptI18n(); // English users get the dictionary from the early synchronous tag below

// Index of dictionary keys by their first Arabic word so mixed strings (fixed text + dynamic
// numbers/names) can be translated phrase-by-phrase, longest phrase first.
const AR_LETTER = /[؀-ۿ]/;

function translatePhrases(text){
  let out = "", i = 0, changed = false;
  const n = text.length;
  while(i < n){
    const ch = text[i];
    if(AR_LETTER.test(ch) && (i === 0 || !AR_LETTER.test(text[i-1]))){
      let j = i;
      while(j < n && /[؀-ۿً-ٟ‏]/.test(text[j])) j++;
      const cands = TRANSLATION_INDEX[text.slice(i, j)];
      let hit = null;
      if(cands){
        for(const k of cands){
          if(k.length < 4) continue; // never swap tiny function words inside longer sentences
          if(text.startsWith(k, i)){
            const nx = text[i + k.length];
            if(nx === undefined || !AR_LETTER.test(nx)){ hit = k; break; }
          }
        }
      }
      if(hit){ out += TRANSLATIONS[hit]; i += hit.length; changed = true; continue; }
      out += text.slice(i, j); i = j; continue;
    }
    out += ch; i++;
  }
  return changed ? out : text;
}

function translateText(text){
  if(!text || !AR_LETTER.test(text)) return text;
  const trimmed = text.trim();
  if(!trimmed) return text;
  if(TRANSLATIONS[trimmed]) return text.replace(trimmed, TRANSLATIONS[trimmed]);
  const collapsed = trimmed.replace(/\s+/g, ' ');
  if(collapsed !== trimmed && TRANSLATIONS[collapsed]) return text.replace(trimmed, TRANSLATIONS[collapsed]);
  for(const [pattern, fn] of TRANSLATION_PATTERNS){
    const m = trimmed.match(pattern);
    if(m) return text.replace(trimmed, fn(m));
  }
  return translatePhrases(text);
}

const TRANSLATABLE_ATTRS = ['placeholder','title','aria-label','alt'];
function translateAttrs(el){
  TRANSLATABLE_ATTRS.forEach(a => {
    const v = el.getAttribute && el.getAttribute(a);
    if(v && AR_LETTER.test(v)){ const t = translateText(v); if(t !== v) el.setAttribute(a, t); }
  });
  if(el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && AR_LETTER.test(el.value||'')){
    const t = translateText(el.value); if(t !== el.value) el.value = t;
  }
}

function translateSubtree(root){
  if(!root) return;
  if(root.nodeType === Node.TEXT_NODE){
    const t = translateText(root.textContent); if(t !== root.textContent) root.textContent = t;
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while((n = walker.nextNode())){
    const p = n.parentNode && n.parentNode.nodeName;
    if(p === 'SCRIPT' || p === 'STYLE') continue;
    nodes.push(n);
  }
  nodes.forEach(node => {
    const t = translateText(node.textContent);
    if(t !== node.textContent) node.textContent = t;
  });
  if(root.nodeType === Node.ELEMENT_NODE) translateAttrs(root);
  root.querySelectorAll?.('[placeholder],[title],[aria-label],[alt],input[type=button],input[type=submit]').forEach(translateAttrs);
}

// Observer shared by every entry point: new nodes, edited text, and changed attributes.
function makeLangObserver(){
  return new MutationObserver((mutations) => {
    for(const m of mutations){
      if(m.type === 'childList'){
        m.addedNodes.forEach(node => {
          if(node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) translateSubtree(node);
        });
      } else if(m.type === 'characterData'){
        translateSubtree(m.target);
      } else if(m.type === 'attributes'){
        translateAttrs(m.target);
      }
    }
  });
}
const LANG_OBSERVER_OPTS = { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:TRANSLATABLE_ATTRS };

// alert / confirm / prompt messages are not DOM text, so translate them at call time.
(function(){
  ['alert','confirm','prompt'].forEach(fn => {
    const orig = window[fn].bind(window);
    window[fn] = function(msg, ...rest){
      if(typeof currentLang !== 'undefined' && currentLang === 'en' && typeof msg === 'string') msg = translateText(msg);
      return orig(msg, ...rest);
    };
  });
})();

let langObserver = null;
function applyTranslation(){
  if(currentLang !== 'en') return;
  translateSubtree(document.body);
}

function toggleLanguage(){
  setLanguage(currentLang === 'ar' ? 'en' : 'ar');
}

function setLanguage(lang){
  if(lang === 'en'){ loadI18n().then(() => setLanguageNow(lang)).catch(() => alert("تعذّر تحميل اللغة الإنجليزية الآن، تحقق من الاتصال وأعد المحاولة.")); }
  else setLanguageNow(lang);
}
function setLanguageNow(lang){
  currentLang = lang;
  localStorage.setItem('hawkim_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  const btn = document.getElementById('btnLangToggle');
  if(btn) btn.textContent = lang === 'en' ? 'AR' : 'EN';
  if(lang === 'en'){
    applyTranslation();
    if(!langObserver){
      langObserver = makeLangObserver();
    }
    langObserver.observe(document.body, LANG_OBSERVER_OPTS);
  } else if(langObserver){
    langObserver.disconnect();
    location.reload(); // simplest reliable way back to full Arabic without stale translated text lingering
  }
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Input hygiene (defence in depth) ──────────────────────────────────────────────────────────
   Text typed by users is later shown inside HTML. Before anything is written to the database we turn tag-like
   "<x" and the quote characters that could break out of an HTML attribute into harmless look-alike characters.
   Fields that must stay byte-exact (emails, links, keys, signatures, JSON text) are left untouched.
   This is a safety net on top of escaping at display time, not a replacement for it. */
const HYGIENE_SKIP_KEY = /(^|_)(email|url|urls|link|password|token|signature|key|hash|path|file|html|json|data)$|^draft_content$|^national_id$|^phone(_number)?$|^id$|_id$/i;
function hygieneClean(v, key){
  if(typeof v === "string"){
    if(key && HYGIENE_SKIP_KEY.test(key)) return v;
    return v.replace(/<(?=[a-zA-Z\/!?])/g, "\uFF1C").replace(/"/g, "\u201D").replace(/'/g, "\u2019");
  }
  if(Array.isArray(v)) return v.map(x => hygieneClean(x, key));
  if(v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype){
    const o = {}; Object.keys(v).forEach(k => { o[k] = hygieneClean(v[k], k); }); return o;
  }
  return v;
}
(function(){
  const origFrom = sb.from.bind(sb);
  sb.from = function(table){
    const q = origFrom(table);
    ["insert","update","upsert"].forEach(m => {
      if(typeof q[m] === "function"){ const orig = q[m].bind(q); q[m] = function(values, opts){ return orig(hygieneClean(values), opts); }; }
    });
    return q;
  };
})();

/* ══════════ FILE UPLOAD HELPER ══════════ */
async function uploadFile(inputEl, folder){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return null;
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB — current plan's hard limit
  if(file.size > MAX_SIZE){
    alert(`تعذّر الرفع: حجم الملف (${(file.size/1024/1024).toFixed(1)} ميجا) أكبر من الحد المسموح حاليًا (٥٠ ميجا). الرجاء ضغط الملف أو تصغير حجمه والمحاولة مجددًا.`);
    inputEl.value = "";
    return null;
  }
  const safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = (currentCompanyId ? currentCompanyId : "unassigned") + "/" + folder + "/" + safeName;
  const { error } = await sb.storage.from("documents").upload(path, file);
  if(error){ alert("تعذّر رفع الملف: " + error.message); return null; }
  // The bucket is private now — generate a long-lived signed URL (10 years) instead of a
  // permanent public one, so the same stored file_url string keeps working everywhere in the
  // app exactly as before, but is no longer openly accessible to anyone off the internet.
  const { data, error: signErr } = await sb.storage.from("documents").createSignedUrl(path, 315360000);
  if(signErr || !data){ alert("تعذّر إنشاء رابط آمن للملف: " + (signErr?.message||"")); return null; }
  return data.signedUrl;
}
function downloadBtn(url){
  return url
    ? `<a class="btn-xs primary" href="${url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>`
    : `<button class="btn-xs primary" disabled style="opacity:0.5;cursor:not-allowed"><span class="ico-i ico-inbox"></span>لا يوجد ملف</button>`;
}

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
    if(teamModule === 'حوكمة') return 'مدير النظام';
    if(currentPageId === PLATFORM_TEAM_FULL_PAGE[teamModule]) return 'مدير النظام';
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

  if(isPlatformTeamMember && teamModule !== 'حوكمة'){
    // Narrow specialty inside a company: hide every nav item outside their own module and the
    // governance-adjacent read-only set, matching exactly what isPageAllowed() would block.
    const allowedPages = [PLATFORM_TEAM_FULL_PAGE[teamModule], ...GOVERNANCE_VIEW_ONLY_PAGES];
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
  if(teamModule && teamModule !== 'حوكمة' && !isPlatformAdmin){
    const allowedPages = [PLATFORM_TEAM_FULL_PAGE[teamModule], ...GOVERNANCE_VIEW_ONLY_PAGES];
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

/* ══════════ VIEW-ONLY ENFORCEMENT (عضو مجلس) ══════════ */
function isMutatingOnclick(val){
  if(!val) return false;
  return /^openM\(\s*'m-/.test(val)
    || /^openPermItemModal\(/.test(val)
    || /^triggerPermMatrixImport\(/.test(val)
    || /^openPermHoldersManager\(/.test(val)
    || /^openPermItemsManager\(/.test(val)
    || /^openPermItemEditModal\(/.test(val)
    || /^linkMeetingToSigningDoc\(/.test(val)
    || /^addAGMTopic\(/.test(val)
    || /^addBoardDecision\(/.test(val)
    || /^saveAGMVotingDates\(/.test(val)
    || /^saveMeetingAttendance\(/.test(val)
    || /^openNewCommitteeModal\(/.test(val)
    || /^openNewGovEvalModal\(/.test(val)
    || /^generateBaseStructure\(/.test(val)
    || /^openNewShareholderModal\(/.test(val)
    || /^openTransferModal\(/.test(val)
    || /^saveShareholder\(/.test(val)
    || /^executeShareTransfer\(/.test(val)
    || /^openPdfImportModal\(/.test(val)
    || /^confirmPdfImport\(/.test(val)
    || /^openNewCompanyModal\(/.test(val)
    || /^openInviteModal\(/.test(val)
    || /^openEditCompanyModal\(/.test(val)
    || /^edit[A-Z]/.test(val)
    || /^delete[A-Z]/.test(val)
    || /^saveCompany/.test(val)
    || /^switchCompany/.test(val);
}
function isMutatingOnchange(val){
  if(!val) return false;
  return /^uploadFile\(/.test(val)
    || /^uploadMeetingFile\(/.test(val)
    || /^uploadAGMSupportingDoc\(/.test(val)
    || /^uploadDocumentTemplate\(/.test(val)
    || /^handlePdfFileSelect\(/.test(val)
    || /^handleIndicatorsUpload\(/.test(val)
    || /^handleShareholdersExcelUpload\(/.test(val)
    || /^exportIndicatorsPDF\(/.test(val)
    || /^checkInAttendee\(/.test(val)
    || /^deleteCheckin\(/.test(val)
    || /^toggleTemplateDefault\(/.test(val)
    || /^openActivateSubModal\(/.test(val)
    || /^exportAllCompanyData\(/.test(val)
    || /^saveGovAssessment\(/.test(val)
    || /^finalApproveAuditRequest\(/.test(val)
    || /^finalApproveRiskRequest\(/.test(val)
    || /^finalApproveSubscription\(/.test(val)
    || /^openNewGovAssessment\(/.test(val)
    || /^activateSubscription\(/.test(val)
    || /^openMySubscription\(/.test(val)
    || /^renewSubscription\(/.test(val)
    || /^cancelTrial\(/.test(val)
    || /^openCharterModal\(/.test(val)
    || /^saveCharter\(/.test(val)
    || /^sendMeetingReminderEmails\(/.test(val)
    || /^sendPolicyApprovalReminder\(/.test(val)
    || /^sendPermissionItemNotification\(/.test(val)
    || /^sendPermissionItemWhatsApp\(/.test(val)
    || /^requestBoardApproval\(/.test(val)
    || /^openWorkflowTemplateModal\(/.test(val)
    || /^saveWorkflowTemplate\(/.test(val)
    || /^startGovernanceApproval\(/.test(val)
    || /^startPolicyGovernanceApproval\(/.test(val)
    || /^openUserPermissionOverridesModal\(/.test(val)
    || /^sendApprovalReminder\(/.test(val)
    || /^requestCharterApproval\(/.test(val)
    || /^updateUserRole\(/.test(val)
    || /^updateRequestStatus\(/.test(val)
    || /^savePermCell\(/.test(val);
}

function restrictMutatingButtons(){
  // Per-user, per-page override takes precedence over the role-based default: 'edit' forces
  // full access on this page even if the role wouldn't normally allow it, 'view' forces
  // read-only even if the role would normally allow editing. No override → fall back to role.
  const pageOverride = myPermissionOverrides[currentPageId] || myPermissionOverrides['*'];
  let restricted;
  if(pageOverride === 'edit') restricted = false;
  else if(pageOverride === 'view') restricted = true;
  else restricted = FULL_ACCESS_ROLES.indexOf(getCurrentRole()) === -1 && getCurrentRole() !== 'مساهم';
  // Reset first (in case role changed to a full-access one after a prior restriction pass)
  document.querySelectorAll('[data-role-hidden="1"]').forEach(el=>{
    el.style.display = '';
    el.removeAttribute('data-role-hidden');
  });
  if(!restricted) return;

  document.querySelectorAll('[onclick]').forEach(el=>{
    if(isMutatingOnclick(el.getAttribute('onclick'))){
      el.style.display = 'none';
      el.setAttribute('data-role-hidden','1');
    }
  });
  document.querySelectorAll('input[onchange], select[onchange]').forEach(el=>{
    if(isMutatingOnchange(el.getAttribute('onchange'))){
      const target = el.closest('label') || el;
      target.style.display = 'none';
      target.setAttribute('data-role-hidden','1');
    }
  });
}

let mutationGuardStarted = false;
function startMutationGuard(){
  if(mutationGuardStarted) return;
  mutationGuardStarted = true;
  const main = document.querySelector('.main');
  if(!main) return;
  const observer = new MutationObserver(()=>{ restrictMutatingButtons(); });
  observer.observe(main, { childList: true, subtree: true });
}

