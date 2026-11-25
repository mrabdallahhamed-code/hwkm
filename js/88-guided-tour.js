/* ══════════ الجولة الإرشادية: تظهر عند أول دخول، ويبقى زر جانبي لإعادتها في أي وقت ══════════ */
const HWKM_TOUR_STEPS = [
  { icon:"👋", title:"أهلًا بك في حوكم", text:"هذه جولة قصيرة (دقيقتان) تعرّفك على أهم أجزاء المنصة. تقدر تتخطاها الآن، وتعيدها متى شئت من الزر الجانبي «جولة».", page:"dashboard" },
  { icon:"📊", title:"لوحة التحكم", text:"أول ما تدخل تشوف وضع شركتك: التنبيهات المهمة، والمهام المعلّقة، والمواعيد القريبة. ابدأ دائمًا بالتنبيهات الحمراء.", page:"dashboard" },
  { icon:"👥", title:"أعضاء المجلس", text:"أضف أعضاء مجلس الإدارة هنا مع صفاتهم ومددهم. باقي المنصة (الاجتماعات واللجان والتصويت) تعتمد على هذه القائمة، فابدأ بها.", page:"members" },
  { icon:"🗂️", title:"اللجان", text:"أنشئ لجنة المراجعة ولجنة الترشيحات والمكافآت وغيرها. المنصة تنبّهك إن كانت لجنة مطلوبة لنوع شركتك ولم تُنشأ.", page:"committees" },
  { icon:"📅", title:"الاجتماعات", text:"جدول اجتماعات المجلس واللجان، وسجّل الحضور والنصاب، ثم القرارات والتصويت. المنصة تنبّهك إلى المدد النظامية للدعوة.", page:"meetings" },
  { icon:"✍️", title:"القرارات بالتمرير", text:"للقرارات العاجلة بين الاجتماعات: تُرسل للأعضاء ويوقّعونها إلكترونيًا. المنصة تمنع المواضيع التي لا يجوز تمريرها وفق النظام.", page:"circulation" },
  { icon:"🏛️", title:"الجمعيات العامة", text:"أدر دعوة الجمعية وجدول أعمالها والتصويت الإلكتروني والنصاب والأغلبية، مع بيان السند النظامي لكل بند.", page:"agm" },
  { icon:"📜", title:"السياسات", text:"أنشئ سياسات شركتك واعتمدها وتابع مراجعتها الدورية، وكل نسخة تبقى محفوظة.", page:"governance" },
  { icon:"✅", title:"الالتزام النظامي", text:"قائمة المتطلبات النظامية لشركتك ونسبة التزامك بها، وما الذي ينقصك بالضبط.", page:"compliance" },
  { icon:"🔏", title:"التوقيع الإلكتروني", text:"أرسل أي مستند للتوقيع، وتابع من وقّع ومن لم يوقّع، والمستند الموقّع يُحفظ في الأرشيف.", page:"signing" },
  { icon:"🎯", title:"جاهز للبدء", text:"ابدأ بالخطوات الأربع في بطاقة «ابدأ من هنا» بلوحة التحكم. وإن احتجت هذه الجولة مرة أخرى فالزر «جولة» على جانب الشاشة دائمًا.", page:"dashboard" }
];

function hwkmTourKey(){ try{ return "hwkm_tour_done_" + ((currentUserProfile && currentUserProfile.email) || ""); }catch(e){ return "hwkm_tour_done_"; } }
let hwkmTourIdx = 0;

let hwkmTourOpenedSidebar = false;
function hwkmTourClearMark(){ document.querySelectorAll(".hwkm-tour-mark").forEach(e => { e.classList.remove("hwkm-tour-mark"); e.style.outline = ""; e.style.boxShadow = ""; }); }
function hwkmTourClose(markDone){
  const bg = document.getElementById("hwkmTourBg"); if(bg) bg.remove();
  hwkmTourClearMark();
  if(hwkmTourOpenedSidebar){ try{ toggleSidebar(); }catch(e){} hwkmTourOpenedSidebar = false; }
  if(markDone){ try{ localStorage.setItem(hwkmTourKey(), "1"); }catch(e){} }
}

function hwkmTourShow(i){
  hwkmTourIdx = Math.max(0, Math.min(i, HWKM_TOUR_STEPS.length - 1));
  const s = HWKM_TOUR_STEPS[hwkmTourIdx];
  const last = hwkmTourIdx === HWKM_TOUR_STEPS.length - 1;
  const mobile = window.innerWidth <= 900;
  hwkmTourClearMark();
  const target = (s.page && hwkmTourIdx > 0 && !last) ? document.querySelector(`.nav-item[onclick^="go('${s.page}'"]`) : null;
  if(target && mobile){
    const sb = document.getElementById("sidebar");
    if(sb && !sb.classList.contains("open")){ try{ toggleSidebar(); hwkmTourOpenedSidebar = true; }catch(e){} }
  }
  if(!mobile){ try{ if(typeof go === "function" && s.page) go(s.page, null); }catch(e){} }
  let bg = document.getElementById("hwkmTourBg");
  if(!bg){
    bg = document.createElement("div"); bg.id = "hwkmTourBg";
    bg.setAttribute("style", "position:fixed;inset:0;z-index:100000;pointer-events:none");
    document.body.appendChild(bg);
  }
  const dots = HWKM_TOUR_STEPS.map((_, k) => `<span style="width:${k===hwkmTourIdx?18:6}px;height:6px;border-radius:6px;background:${k===hwkmTourIdx?"#B8972A":"#d5dbe6"};display:inline-block;margin:0 2px"></span>`).join("");
  bg.innerHTML = `<div id="hwkmTourCard" role="dialog" style="pointer-events:auto;position:fixed;background:#fff;border-radius:14px;width:min(330px,calc(100vw - 24px));padding:16px 18px;box-shadow:0 10px 36px rgba(13,36,71,.35);border:2px solid #B8972A;direction:rtl;font-family:inherit">
    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:26px;line-height:1">${s.icon}</span><span style="font-size:15.5px;font-weight:800;color:#0D2447">${orgEsc(s.title)}</span></div>
    <div style="font-size:13px;color:#4a5a73;line-height:1.85;margin-top:8px">${orgEsc(s.text)}</div>
    <div style="text-align:center;margin:10px 0">${dots}</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button type="button" class="btn btn-gold" id="hwkmTourNext" style="flex:1">${last ? "إنهاء الجولة" : "التالي"}</button>
      ${hwkmTourIdx > 0 ? `<button type="button" class="btn btn-ghost" id="hwkmTourPrev">السابق</button>` : ""}
      ${last ? "" : `<button type="button" class="btn btn-ghost" id="hwkmTourSkip">تخطي</button>`}
    </div>
    <div style="font-size:10.5px;color:#7A90B0;text-align:center;margin-top:6px">${hwkmTourIdx + 1} من ${HWKM_TOUR_STEPS.length}</div>
  </div>`;
  const card = document.getElementById("hwkmTourCard");
  const place = () => {
    if(target){
      target.classList.add("hwkm-tour-mark");
      target.style.outline = "3px solid #B8972A"; target.style.boxShadow = "0 0 0 6px rgba(184,151,42,.25)";
      const r = target.getBoundingClientRect();
      if(mobile){ card.style.bottom = "12px"; card.style.left = "12px"; }
      else{
        card.style.right = Math.max(12, window.innerWidth - r.left + 14) + "px";
        const h = card.offsetHeight;
        card.style.top = Math.max(12, Math.min(r.top + r.height/2 - h/2, window.innerHeight - h - 12)) + "px";
      }
    }else{
      card.style.left = "50%"; card.style.top = "50%"; card.style.transform = "translate(-50%,-50%)";
    }
  };
  if(target){ try{ target.scrollIntoView({ block: mobile ? "start" : "center" }); }catch(e){} setTimeout(place, 350); } else place();
  document.getElementById("hwkmTourNext").onclick = () => { if(last) hwkmTourClose(true); else hwkmTourShow(hwkmTourIdx + 1); };
  const pv = document.getElementById("hwkmTourPrev"); if(pv) pv.onclick = () => hwkmTourShow(hwkmTourIdx - 1);
  const sk = document.getElementById("hwkmTourSkip"); if(sk) sk.onclick = () => hwkmTourClose(true);
}

function startGuidedTour(){ hwkmTourShow(0); }

function hwkmTourInit(){
  try{
    const login = document.getElementById("loginScreen");
    const loggedIn = !!(typeof currentUserProfile !== "undefined" && currentUserProfile) && login && getComputedStyle(login).display === "none";
    const isOwner = loggedIn && currentUserProfile.is_platform_admin === true;
    let btn = document.getElementById("hwkmTourBtn");
    if(!loggedIn){ if(btn) btn.remove(); return; }
    if(!btn){
      btn = document.createElement("button"); btn.id = "hwkmTourBtn"; btn.type = "button";
      btn.title = "اضغط لبدء جولة تعريفية تشرح لك أقسام المنصة"; btn.textContent = "🧭 جولة تعريفية بالمنصة";
      btn.setAttribute("style", "position:fixed;left:0;top:45%;z-index:9000;background:#B8972A;color:#fff;border:none;border-radius:0 10px 10px 0;padding:12px 8px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(13,36,71,.25);writing-mode:vertical-rl");
      btn.onclick = startGuidedTour;
      document.body.appendChild(btn);
    }
    let done = false; try{ done = localStorage.getItem(hwkmTourKey()) === "1"; }catch(e){ done = true; }
    if(!done && !isOwner && !document.getElementById("hwkmTourBg") && !window.__hwkmTourAuto){
      window.__hwkmTourAuto = true;
      setTimeout(() => { if(!document.getElementById("hwkmTourBg")) startGuidedTour(); }, 2500);
    }
  }catch(e){}
}
setInterval(hwkmTourInit, 2000);
