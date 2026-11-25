/* رسائل المنصة: بدل نافذة alert القديمة الحاجبة (التي تظهر كنافذة متصفح غريبة) تظهر رسالة أنيقة غير حاجبة تختفي وحدها،
   والرسائل الطويلة تظهر في نافذة صغيرة بزر «حسنًا». النسخة الأصلية تبقى في window.__nativeAlert لما يحتاج الحجب
   (مثل رسالة الخروج التلقائي قبل إعادة التحميل). */
(function(){
  if(typeof window === "undefined" || window.__friendlyMsgs) return;
  window.__friendlyMsgs = true;
  window.__nativeAlert = window.alert.bind(window);

  function kindOf(t){
    if(/^\s*(✅|✔|🎉)/.test(t) || /(^|\s)(تم|نجح|اكتمل)\s/.test(t.slice(0, 40))) return "ok";
    if(/(تعذّر|تعذر|فشل|خطأ|غير صالح|مرفوض|ممنوع|لا يمكن|غير متاح|انتهت)/.test(t)) return "err";
    if(/^\s*(⚠|❗)/.test(t) || /(الرجاء|يرجى|أدخل|اختر|يجب|مطلوب|لا بد)/.test(t.slice(0, 60))) return "warn";
    return "info";
  }
  const ICON = { ok: "✓", err: "!", warn: "!", info: "i" };
  function box(){
    let c = document.getElementById("msgToasts");
    if(!c){ c = document.createElement("div"); c.id = "msgToasts"; c.setAttribute("aria-live", "polite"); document.body.appendChild(c); }
    return c;
  }
  function toast(text, kind){
    const c = box();
    while(c.children.length >= 3) c.removeChild(c.firstChild);
    const d = document.createElement("div");
    d.className = "msg-toast msg-" + kind;
    d.setAttribute("role", kind === "err" ? "alert" : "status");
    const i = document.createElement("span"); i.className = "msg-ic"; i.textContent = ICON[kind];
    const s = document.createElement("span"); s.className = "msg-tx"; s.textContent = text;
    d.appendChild(i); d.appendChild(s);
    const kill = () => { d.classList.add("out"); setTimeout(() => { if(d.parentNode) d.parentNode.removeChild(d); }, 220); };
    d.addEventListener("click", kill);
    c.appendChild(d);
    let ms = Math.min(11000, 3800 + text.length * 45); if(kind === "err") ms += 2500;
    let t = setTimeout(kill, ms);
    d.addEventListener("mouseenter", () => clearTimeout(t));
    d.addEventListener("mouseleave", () => { clearTimeout(t); t = setTimeout(kill, 3000); });
  }
  function dialog(text, kind){
    const bg = document.createElement("div"); bg.className = "msg-dlg-bg";
    const b = document.createElement("div"); b.className = "msg-dlg msg-" + kind; b.setAttribute("role", "alertdialog"); b.setAttribute("aria-modal", "true");
    const p = document.createElement("div"); p.className = "msg-dlg-tx"; p.textContent = text;
    const ok = document.createElement("button"); ok.type = "button"; ok.className = "btn btn-gold"; ok.textContent = "حسنًا";
    const close = () => { document.removeEventListener("keydown", esc, true); if(bg.parentNode) bg.parentNode.removeChild(bg); };
    const esc = (e) => { if(e.key === "Escape"){ e.stopPropagation(); close(); } };
    ok.onclick = close; bg.addEventListener("click", (e) => { if(e.target === bg) close(); });
    document.addEventListener("keydown", esc, true);
    b.appendChild(p); b.appendChild(ok); bg.appendChild(b); document.body.appendChild(bg);
    setTimeout(() => ok.focus(), 30);
  }
  window.alert = function(msg){
    try{
      const text = String(msg == null ? "" : msg).trim();
      if(!text || !document.body) return;
      const kind = kindOf(text);
      if(text.length > 240 || text.split("\n").length > 4) dialog(text, kind); else toast(text, kind);
    }catch(e){ try{ window.__nativeAlert(msg); }catch(_){} }
  };
  window.__friendlyAlert = window.alert;
})();
