/* ══════════ إشعارات الجوال/المتصفح (Web Push) ══════════
   المفتاح العام فقط هنا (آمن). المفتاح السري في أسرار Supabase ولا يظهر في الكود. */
const PUSH_PUBLIC_KEY = "BGb1tf3nPf1V7NRrPMM9UjCwk50-cisxqnlsLq5t_BDmyW7E8uFgG0QzdoPHwGM8ddALj0QLYfWMAZ0nuqvHhnc";

function pushSupported(){
  return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
}
function pushB64ToBytes(s){
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const b = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
function pushIsIOSBrowserTab(){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}
async function pushCurrentSub(){
  try{ const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }catch(e){ return null; }
}

async function pushRefreshUI(show){
  const box = document.getElementById("mep-push");
  if(!box) return;
  if(show === false){ box.style.display = "none"; return; }
  box.style.display = "block";
  const note = document.getElementById("mep-push-note");
  const btn = document.getElementById("mep-push-btn");
  if(!pushSupported()){
    btn.style.display = "none";
    note.textContent = pushIsIOSBrowserTab() ? "على الآيفون: أضف حوكم إلى الشاشة الرئيسية أولًا (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحه منها لتفعيل الإشعارات." : "متصفحك لا يدعم الإشعارات.";
    return;
  }
  if(pushIsIOSBrowserTab()){
    btn.style.display = "none";
    note.textContent = "على الآيفون: أضف حوكم إلى الشاشة الرئيسية أولًا (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحه منها لتفعيل الإشعارات.";
    return;
  }
  btn.style.display = "inline-block";
  if(Notification.permission === "denied"){
    btn.style.display = "none";
    note.textContent = "الإشعارات محظورة لهذا الموقع في إعدادات المتصفح. فعّلها من إعدادات الموقع ثم أعد المحاولة.";
    return;
  }
  const sub = await pushCurrentSub();
  if(sub){ btn.textContent = "إيقاف الإشعارات على هذا الجهاز"; btn.onclick = pushDisable; note.textContent = "الإشعارات مفعّلة على هذا الجهاز ✅"; }
  else { btn.textContent = "تفعيل الإشعارات على هذا الجهاز"; btn.onclick = pushEnable; note.textContent = "تصلك تنبيهات المهام والاجتماعات والتصويت حتى والتطبيق مغلق."; }
}

async function pushEnable(){
  try{
    if(!pushSupported()) return;
    const perm = await Notification.requestPermission();
    if(perm !== "granted"){ pushRefreshUI(); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushB64ToBytes(PUSH_PUBLIC_KEY) });
    const j = sub.toJSON();
    const email = (currentUserProfile && currentUserProfile.email || "").toLowerCase();
    if(!email){ alert("تعذّر تحديد حسابك"); return; }
    const { error } = await sb.from("push_subscriptions").upsert(
      { user_email: email, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: "endpoint" });
    if(error){ alert("تعذّر تفعيل الإشعارات: " + error.message); return; }
    pushRefreshUI();
  }catch(e){ alert("تعذّر تفعيل الإشعارات: " + e.message); }
}

async function pushDisable(){
  try{
    const sub = await pushCurrentSub();
    if(sub){
      await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  }catch(e){}
  pushRefreshUI();
}
