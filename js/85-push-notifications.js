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

/* ══════════ دعوة تفعيل الإشعارات بعد الدخول ══════════
   تظهر مرة بعد الدخول إن كان الجهاز يدعم الإشعارات ولم تُفعَّل بعد؛ "لاحقًا" تؤجّلها 7 أيام. */
function pushPromptKey(email){ return "hwkm_push_prompt_" + email; }
function pushPromptRemove(){ const e = document.getElementById("pushPromptBar"); if(e) e.remove(); }
async function pushPromptTick(){
  try{
    const email = (currentUserProfile && currentUserProfile.email || "").toLowerCase();
    if(!email){ pushPromptRemove(); return; }
    if(document.getElementById("pushPromptBar")) return;
    if(document.getElementById("hwkmTourCard")) return;               // لا نزاحم الجولة
    const ov = document.querySelector(".modal-bg.open"); if(ov) return;
    let until = 0; try{ until = parseInt(localStorage.getItem(pushPromptKey(email)) || "0", 10) || 0; }catch(e){}
    if(Date.now() < until) return;
    const iosTab = pushIsIOSBrowserTab();
    if(!iosTab){
      if(!pushSupported()) return;
      if(Notification.permission !== "default") return;               // مفعّلة أو محظورة
      if(await pushCurrentSub()) return;
    }else if(!/iphone|ipad|ipod/i.test(navigator.userAgent)) return;
    const bar = document.createElement("div");
    bar.id = "pushPromptBar";
    bar.setAttribute("style", "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9998;max-width:min(92vw,460px);width:max-content;background:#0D2447;color:#fff;border:1.5px solid #D9B945;border-radius:14px;padding:12px 16px;box-shadow:0 8px 28px rgba(0,0,0,.28);display:flex;align-items:center;gap:12px;direction:rtl;font-family:inherit");
    const msg = iosTab
      ? "لتصلك التنبيهات على الآيفون: أضف حوكم إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحه منها وفعّل الإشعارات."
      : "فعّل الإشعارات لتصلك تنبيهات المهام والاجتماعات والتصويت حتى والتطبيق مغلق.";
    bar.innerHTML = '<span style="font-size:22px">🔔</span><span style="font-size:13px;line-height:1.6;flex:1">' + msg + '</span>'
      + (iosTab ? "" : '<button id="pushPromptYes" style="background:#D9B945;color:#0D2447;border:0;border-radius:8px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit">تفعيل</button>')
      + '<button id="pushPromptLater" style="background:transparent;color:#cfd8e6;border:0;font-size:12px;cursor:pointer;font-family:inherit">لاحقًا</button>';
    document.body.appendChild(bar);
    const snooze = () => { try{ localStorage.setItem(pushPromptKey(email), String(Date.now() + 7*86400000)); }catch(e){} pushPromptRemove(); };
    document.getElementById("pushPromptLater").onclick = snooze;
    const yes = document.getElementById("pushPromptYes");
    if(yes) yes.onclick = async () => { pushPromptRemove(); await pushEnable(); if(Notification.permission === "default") snooze(); };
  }catch(e){}
}
(function pushPromptInit(){
  let first = 0;
  setInterval(() => {
    const has = !!(typeof currentUserProfile !== "undefined" && currentUserProfile && currentUserProfile.email);
    if(!has){ first = 0; pushPromptRemove(); return; }
    if(!first) first = Date.now();
    if(Date.now() - first < 12000) return;                            // بعد استقرار الواجهة
    pushPromptTick();
  }, 3000);
})();
