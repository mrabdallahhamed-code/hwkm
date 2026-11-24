/* تنبيه التحديث: إن نشرنا نسخة جديدة والمستخدم فاتح المنصة، تظهر له رسالة صغيرة «يتوفر تحديث» بدل أن يبقى على النسخة القديمة.
   لا نُعيد تحميل الصفحة تلقائيًا حتى لا يضيع ما يكتبه في نموذج مفتوح؛ هو يختار متى يحدّث. */
function __updSig(doc){
  const out = [];
  doc.querySelectorAll('script[src],link[rel="stylesheet"]').forEach(el => {
    const u = el.getAttribute("src") || el.getAttribute("href") || "";
    if(/^(https?:)?\/\//.test(u)) return;      // نتجاهل المكتبات الخارجية
    if(u.indexOf("?v=") > -1) out.push(u);
  });
  return out.sort().join("|");
}
let __updLoadedSig = null, __updLastCheck = 0, __updHiddenUntil = 0, __updShown = false;
function __updShowBanner(){
  if(__updShown || Date.now() < __updHiddenUntil) return;
  __updShown = true;
  const b = document.createElement("div");
  b.id = "updateBanner";
  b.setAttribute("role", "status");
  b.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:3000;background:#0D2447;color:#fff;border:1px solid rgba(217,190,106,.5);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:'Tajawal',sans-serif;font-size:13.5px;max-width:calc(100vw - 24px)";
  b.innerHTML = '<span>🔄 يتوفر تحديث جديد للمنصة</span>'
    + '<button type="button" style="background:linear-gradient(135deg,#B8972A,#8A6A1E);color:#fff;border:none;border-radius:9px;padding:7px 16px;font-weight:800;font-family:inherit;cursor:pointer" onclick="location.reload()">حدّث الآن</button>'
    + '<button type="button" aria-label="لاحقًا" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;font-family:inherit" onclick="__updLater()">لاحقًا</button>';
  document.body.appendChild(b);
}
function __updLater(){
  __updHiddenUntil = Date.now() + 30 * 60 * 1000;  // نعيد التذكير بعد نصف ساعة
  __updShown = false;
  const b = document.getElementById("updateBanner"); if(b) b.remove();
}
async function hwkmCheckForUpdate(force){
  try{
    if(!/^https?:$/.test(location.protocol)) return;
    if(!force && Date.now() - __updLastCheck < 20000) return;
    __updLastCheck = Date.now();
    if(__updLoadedSig === null) __updLoadedSig = __updSig(document);
    const res = await fetch(location.pathname + "?_u=" + Date.now(), { cache: "no-store" });
    if(!res.ok) return;
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const fresh = __updSig(doc);
    if(fresh && fresh !== __updLoadedSig) __updShowBanner();
  }catch(e){ /* لا يهمّنا فشل الفحص (انقطاع شبكة مثلًا) */ }
}
if(typeof window !== "undefined"){
  __updLoadedSig = __updSig(document);
  setInterval(() => { if(!document.hidden) hwkmCheckForUpdate(false); }, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if(!document.hidden) hwkmCheckForUpdate(false); });
}
