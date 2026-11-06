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
  try{
    _tsIds[boxId] = window.turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY, theme: "light",
      callback: function(){ tsNote(box, ""); },
      "expired-callback": function(){ tsNote(box, ""); },
      /* أخطاء عائلة 300xxx = فشل التحدي في متصفح الزائر (إضافات حجب، VPN، متصفح قديم أو داخل تطبيق).
         بلا رسالة يبقى المستخدم أمام «جارٍ التحقق…» دون أن يعرف السبب. المحاولة التلقائية تبقى مفعّلة. */
      "error-callback": function(){ tsNote(box, "تعذّر التحقق الأمني. حدّث الصفحة، أو جرّب متصفحًا آخر، أو أوقف الـ VPN وإضافات حجب الإعلانات مؤقتًا ثم أعد المحاولة."); return true; }
    });
  }catch(e){}
}
function tsNote(box, msg){
  if(!box || !box.parentNode) return;
  let n = box.nextElementSibling;
  if(!n || !n.classList.contains("ts-note")){
    n = document.createElement("div"); n.className = "ts-note";
    n.style.cssText = "font-size:12px;color:#B7791F;margin-top:6px;line-height:1.7";
    box.parentNode.insertBefore(n, box.nextSibling);
  }
  n.textContent = msg; n.style.display = msg ? "" : "none";
}
function tsToken(boxId){
  if(!window.turnstile || _tsIds[boxId] === undefined) return undefined;
  return window.turnstile.getResponse(_tsIds[boxId]) || undefined;
}
function tsReset(boxId){
  try{ if(window.turnstile && _tsIds[boxId] !== undefined) window.turnstile.reset(_tsIds[boxId]); }catch(e){}
}
window.hwkmTsReady = function(){ tsRender("tsLoginBox"); };
