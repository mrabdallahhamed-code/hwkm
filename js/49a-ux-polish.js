/* ══════════ UX polish: global loading bar, accessibility labels, Escape-to-close, "start here" card ══════════ */

/* 1) Thin loading bar shown while any request to our backend is running for more than a moment.
   Installed here (before the Supabase client is created) so it sees every call. */
(function(){
  try{
    if(typeof window.fetch !== "function" || window.__uxFetchPatched) return;
    window.__uxFetchPatched = true;
    const css = document.createElement("style");
    css.textContent = `#uxLoadBar{position:fixed;top:0;left:0;right:0;height:3px;z-index:100003;pointer-events:none;opacity:0;transition:opacity .2s}
    #uxLoadBar.on{opacity:1}#uxLoadBar::after{content:"";position:absolute;top:0;bottom:0;width:35%;background:linear-gradient(90deg,transparent,#B8972A,transparent);animation:uxLoad 1.1s ease-in-out infinite}
    @keyframes uxLoad{from{left:-35%}to{left:100%}}
    @media (prefers-reduced-motion: reduce){#uxLoadBar::after{animation:none;width:100%;background:#B8972A}}`;
    document.head.appendChild(css);
    const bar = document.createElement("div"); bar.id = "uxLoadBar"; bar.setAttribute("aria-hidden", "true");
    const mount = () => { if(!bar.parentNode && document.body) document.body.appendChild(bar); };
    let pending = 0, timer = null;
    const update = () => {
      mount();
      if(pending > 0){ if(!timer && !bar.classList.contains("on")) timer = setTimeout(() => { timer = null; if(pending > 0) bar.classList.add("on"); }, 350); }
      else { if(timer){ clearTimeout(timer); timer = null; } bar.classList.remove("on"); }
    };
    const orig = window.fetch.bind(window);
    window.fetch = function(input, init){
      let url = ""; try{ url = typeof input === "string" ? input : (input && input.url) || ""; }catch(e){}
      if(url.indexOf(".supabase.co") === -1) return orig(input, init);
      pending++; update();
      const done = () => { pending = Math.max(0, pending - 1); update(); };
      let p; try{ p = orig(input, init); }catch(e){ done(); throw e; }
      p.then(done, done);
      return p;
    };
  }catch(e){}
})();

/* 2) Accessibility: give icon-only buttons a spoken name, and let Escape close the open window. */
(function(){
  const CLOSE_RE = /^[\s×✕✖xX]+$/;
  function labelButtons(root){
    try{
      const list = (root.querySelectorAll ? root.querySelectorAll("button:not([aria-label]),[role=button]:not([aria-label])") : []);
      list.forEach(b => {
        const txt = (b.textContent || "").trim();
        if(txt.length > 2 && /[؀-ۿA-Za-z]/.test(txt)) return;          // already has a readable name
        if(b.getAttribute("title")){ b.setAttribute("aria-label", b.getAttribute("title")); return; }
        if(CLOSE_RE.test(txt) && txt) b.setAttribute("aria-label", "إغلاق");
      });
    }catch(e){}
  }
  let queued = false;
  function schedule(){ if(queued) return; queued = true; requestAnimationFrame(() => { queued = false; labelButtons(document); }); }
  function start(){
    labelButtons(document);
    try{ new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true }); }catch(e){}
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  document.addEventListener("keydown", function(e){
    if(e.key !== "Escape" || e.defaultPrevented) return;
    if(document.getElementById("uiDlgBg")) return;                               // a confirm/prompt dialog handles its own Escape
    const ae = document.activeElement;
    if(ae && ae.tagName === "TEXTAREA") return;                                  // don't lose text being written
    let topId = null;
    for(let i = __modalStack.length - 1; i >= 0; i--){
      const el = document.getElementById(__modalStack[i]);
      if(el && el.classList.contains("open") && !el.classList.contains("fullpage")){ topId = __modalStack[i]; break; }
    }
    if(topId){ e.preventDefault(); closeM(topId); }
  });
})();

/* 3) "Start here" card on the dashboard: four first steps, shown until they are done (or dismissed). */
function startHereKey(){ return "hwkm_starthere_off_" + (currentCompanyId || ""); }
function renderStartHere(c){
  try{
    const page = document.getElementById("p-dashboard"); if(!page) return;
    let card = document.getElementById("startHereCard");
    const steps = [
      { done: (c.members || 0) > 0,  label: "أضف أعضاء مجلس الإدارة", go: "members" },
      { done: (c.policies || 0) > 0, label: "أنشئ سياسة واعتمدها", go: "governance" },
      { done: (c.meetings || 0) > 0, label: "جدول اجتماعك الأول", go: "meetings" },
      { done: (c.signing || 0) > 0,  label: "أرسل مستندًا للتوقيع الإلكتروني", go: "signing" }
    ];
    const doneN = steps.filter(s => s.done).length;
    let off = false; try{ off = localStorage.getItem(startHereKey()) === "1"; }catch(e){}
    if(doneN === steps.length || off){ if(card) card.remove(); return; }
    if(!card){
      card = document.createElement("div"); card.id = "startHereCard";
      const hero = document.getElementById("cdHero");
      if(hero && hero.parentNode) hero.parentNode.insertBefore(card, hero.nextSibling); else page.insertBefore(card, page.firstChild);
    }
    card.setAttribute("style", "background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:10px 16px;margin:10px 0;box-shadow:0 2px 10px rgba(13,36,71,.06)");
    const pct = Math.round(doneN / steps.length * 100);
    card.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">` +
        `<div style="font-weight:800;color:#0D2447;font-size:15px">ابدأ من هنا <span style="color:#7A90B0;font-weight:600;font-size:12.5px">(${doneN} من ${steps.length})</span></div>` +
        `<button type="button" id="startHereHide" style="background:none;border:none;color:#7A90B0;cursor:pointer;font-size:12px;font-family:inherit" aria-label="إخفاء قائمة البداية">إخفاء</button>` +
      `</div>` +
      `<div style="height:4px;background:#EEF1F5;border-radius:4px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:${pct}%;background:#B8972A"></div></div>` +
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">` +
      steps.map(s =>
        `<button type="button" data-go="${s.go}" style="text-align:right;font-family:inherit;font-size:12.5px;padding:7px 12px;border-radius:9px;cursor:pointer;border:1px solid ${s.done ? "#cfe8d8" : "#e3e8f0"};background:${s.done ? "#F3FBF6" : "#fff"};color:${s.done ? "#1B7F4B" : "#0D2447"};font-weight:700">` +
        `${s.done ? "✓ " : "○ "}${s.label}</button>`).join("") +
      `</div>`;
    card.querySelectorAll("button[data-go]").forEach(b => { b.onclick = () => go(b.getAttribute("data-go"), null); });
    const hide = card.querySelector("#startHereHide");
    if(hide) hide.onclick = () => { try{ localStorage.setItem(startHereKey(), "1"); }catch(e){} card.remove(); };
  }catch(e){}
}


/* 5) نماذج الاجتماع: وقت النهاية يُقترح تلقائيًا بعد ساعة من البداية إن كان فارغًا (يبقى قابلًا للتعديل). */
(function(){
  try{
    document.addEventListener("change", function(e){
      const t = e.target; if(!t || !t.id) return;
      const map = { "mt-time": "mt-time-end", "mtr-time": "mtr-time-end" };
      const endId = map[t.id]; if(!endId) return;
      const end = document.getElementById(endId);
      if(!end || end.value || !/^\d{2}:\d{2}$/.test(t.value)) return;
      const [h, m] = t.value.split(":").map(Number);
      const total = (h * 60 + m + 60) % 1440;
      end.value = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    });
  }catch(e){}
})();


/* لوحة التحكم المختصرة: أهم المؤشرات فقط افتراضيًا، وزر يعرض الباقي (ويتذكّر اختيار المستخدم). */
function toggleDashFull(){
  const pg = document.getElementById("p-dashboard"); if(!pg) return;
  const on = pg.classList.toggle("dash-full");
  try{ localStorage.setItem("hwkm_dash_full", on ? "1" : "0"); }catch(e){}
  const b = document.getElementById("dashMoreBtn"); if(b) b.textContent = on ? "إخفاء المؤشرات الإضافية ▴" : "عرض كل المؤشرات ▾";
}
(function(){
  try{
    const apply = () => {
      const pg = document.getElementById("p-dashboard"); if(!pg) return;
      let on = false; try{ on = localStorage.getItem("hwkm_dash_full") === "1"; }catch(e){}
      pg.classList.toggle("dash-full", on);
      const b = document.getElementById("dashMoreBtn"); if(b) b.textContent = on ? "إخفاء المؤشرات الإضافية ▴" : "عرض كل المؤشرات ▾";
    };
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
  }catch(e){}
})();
