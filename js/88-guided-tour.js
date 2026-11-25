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

function hwkmTourClose(markDone){
  const bg = document.getElementById("hwkmTourBg"); if(bg) bg.remove();
  if(markDone){ try{ localStorage.setItem(hwkmTourKey(), "1"); }catch(e){} }
}

function hwkmTourShow(i){
  hwkmTourIdx = Math.max(0, Math.min(i, HWKM_TOUR_STEPS.length - 1));
  const s = HWKM_TOUR_STEPS[hwkmTourIdx];
  const last = hwkmTourIdx === HWKM_TOUR_STEPS.length - 1;
  try{ if(typeof go === "function" && s.page && (typeof currentPageId === "undefined" || currentPageId !== s.page)) go(s.page, null); }catch(e){}
  let bg = document.getElementById("hwkmTourBg");
  if(!bg){
    bg = document.createElement("div"); bg.id = "hwkmTourBg";
    bg.setAttribute("style", "position:fixed;inset:0;background:rgba(13,36,71,.45);z-index:100000;display:flex;align-items:flex-end;justify-content:center;padding:16px");
    document.body.appendChild(bg);
  }
  const dots = HWKM_TOUR_STEPS.map((_, k) => `<span style="width:${k===hwkmTourIdx?18:6}px;height:6px;border-radius:6px;background:${k===hwkmTourIdx?"#B8972A":"#d5dbe6"};display:inline-block;margin:0 2px"></span>`).join("");
  bg.innerHTML = `<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;max-width:460px;width:100%;padding:20px 22px;box-shadow:0 12px 40px rgba(13,36,71,.3);direction:rtl;font-family:inherit">
    <div style="font-size:34px;line-height:1">${s.icon}</div>
    <div style="font-size:17px;font-weight:800;color:#0D2447;margin:8px 0 6px">${orgEsc(s.title)}</div>
    <div style="font-size:13.5px;color:#4a5a73;line-height:1.9">${orgEsc(s.text)}</div>
    <div style="text-align:center;margin:14px 0 12px">${dots}</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button type="button" class="btn btn-gold" id="hwkmTourNext" style="flex:1">${last ? "إنهاء الجولة" : "التالي"}</button>
      ${hwkmTourIdx > 0 ? `<button type="button" class="btn btn-ghost" id="hwkmTourPrev">السابق</button>` : ""}
      ${last ? "" : `<button type="button" class="btn btn-ghost" id="hwkmTourSkip">تخطي</button>`}
    </div>
    <div style="font-size:10.5px;color:#7A90B0;text-align:center;margin-top:8px">${hwkmTourIdx + 1} من ${HWKM_TOUR_STEPS.length}</div>
  </div>`;
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
    if(!loggedIn || isOwner){ if(btn) btn.remove(); return; }
    if(!btn){
      btn = document.createElement("button"); btn.id = "hwkmTourBtn"; btn.type = "button";
      btn.title = "جولة إرشادية في المنصة"; btn.textContent = "؟ جولة";
      btn.setAttribute("style", "position:fixed;left:0;top:45%;z-index:9000;background:#B8972A;color:#fff;border:none;border-radius:0 10px 10px 0;padding:10px 8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(13,36,71,.25);writing-mode:vertical-rl");
      btn.onclick = startGuidedTour;
      document.body.appendChild(btn);
    }
    let done = false; try{ done = localStorage.getItem(hwkmTourKey()) === "1"; }catch(e){ done = true; }
    if(!done && !document.getElementById("hwkmTourBg") && !window.__hwkmTourAuto){
      window.__hwkmTourAuto = true;
      setTimeout(() => { if(!document.getElementById("hwkmTourBg")) startGuidedTour(); }, 2500);
    }
  }catch(e){}
}
setInterval(hwkmTourInit, 2000);
