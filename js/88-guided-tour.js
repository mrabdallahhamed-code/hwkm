/* ══════════ الجولة الإرشادية: مخصصة لنوع الكيان، تظهر أول دخول، وزر دائم لإعادتها ══════════ */
const HWKM_TOUR_OWNER_STEPS = [
  { icon:"👋", title:"أهلًا بك في إدارة حوكم", text:"جولة قصيرة تعرّفك على أقسام لوحة مالك المنصة.", page:null },
  { icon:"📊", title:"لوحة التحكم", text:"نظرة عامة على المنصة: الشركات والمستخدمون والنشاط.", page:"platformdashboard" },
  { icon:"🏢", title:"الشركات", text:"كل الشركات المسجلة، واشتراكاتها، وإدارة بياناتها.", page:"platformcompanies" },
  { icon:"🛡️", title:"إدارة الصلاحيات", text:"المستخدمون وأدوارهم على مستوى المنصة.", page:"platformusers" },
  { icon:"📜", title:"سجل النشاط", text:"ما جرى على المنصة، ومن قام به ومتى.", page:"platformactivity" },
  { icon:"📥", title:"إدارة الطلبات", text:"طلبات إدراج الشركات وطلبات العملاء التي تنتظر قرارك.", page:"adminrequests" },
  { icon:"🎯", title:"انتهت الجولة", text:"تقدر تعيدها متى شئت من الزر «جولة تعريفية بالمنصة».", page:null }
];

/* وصف كل قسم، مع صياغة خاصة بنوع الكيان عند الحاجة */
const HWKM_TOUR_PAGES = {
  dashboard:   { icon:"📊", text:"صورة شركتك اليوم: التنبيهات المهمة، والمهام المعلّقة، والمواعيد القريبة. ابدأ دائمًا بالتنبيهات الحمراء." },
  members:     { icon:"👥", text:"أضف الأعضاء مع صفاتهم ومددهم. بقية المنصة تعتمد على هذه القائمة فابدأ بها.",
                 llc:"أضف المديرين مع صلاحياتهم ومدد تعيينهم. المنصة تنبّهك إن خلا منصب المدير." },
  committees:  { icon:"🗂️", text:"أنشئ لجنة المراجعة والترشيحات والمكافآت وغيرها. تعرف المنصة اللجان المطلوبة لنوع شركتك وتنبّهك إن نقصت.",
                 listed:"لجنة المراجعة إلزامية للمدرجة، ولجنة الترشيحات والمكافآت كذلك للسوق الرئيسية. تنبّهك المنصة وفق لائحة الحوكمة." },
  meetings:    { icon:"📅", text:"جدول الاجتماعات وسجّل الحضور والنصاب، ثم القرارات والتصويت. تنبّهك المنصة لمدد الدعوة النظامية.",
                 llc:"جدول اجتماعات المديرين وسجّل الحضور والقرارات." },
  circulation: { icon:"✍️", text:"للقرارات العاجلة بين الاجتماعات: تُرسل للأعضاء ويوقّعونها إلكترونيًا. تمنع المنصة ما لا يجوز تمريره نظامًا." },
  managerdecisions:{ icon:"✍️", text:"سجّل قرارات إدارة الشركة بصيغة بسيطة وموثّقة، بدل اجتماعات لا تلزمك." },
  ownerdecisions:  { icon:"✍️", text:"قرارات المالك تُسجَّل وتُوقَّع وتُحفظ، فتكون مثبتة عند أي جهة أو شريك أو ممول." },
  agm:         { icon:"🏛️", text:"الدعوة وجدول الأعمال والتصويت الإلكتروني والنصاب والأغلبية، مع بيان السند النظامي لكل بند.",
                 llc:"اجتماعات الشركاء وقراراتهم، وتنبّهك المنصة للمدد النظامية (كاجتماع الشركاء السنوي)." },
  shareholders:{ icon:"📇", text:"سجل الملاك وحصصهم ونسبهم وحركة الملكية.",
                 llc:"سجل الشركاء وحصصهم، وإخطارات التنازل عن الحصص وحق الاسترداد خلال مدتها النظامية.",
                 sole:"سجل الملكية الخاص بمؤسستك." },
  announcements:{ icon:"📢", text:"الإفصاحات للشركات المدرجة (إعلانات تداول): نماذج جاهزة تساعدك على صياغتها وفق لوائح الهيئة." },
  governance:  { icon:"📜", text:"أنشئ سياساتك واعتمدها وتابع مراجعتها الدورية، وكل نسخة تبقى محفوظة." },
  structure:   { icon:"🌳", text:"الهيكل التنظيمي والأوصاف الوظيفية، ليعرف كل شخص موقعه ومسؤوليته." },
  permissions: { icon:"🔑", text:"من يملك صلاحية ماذا. مصفوفة واضحة تمنع الخلط بين المسؤوليات." },
  compliance:  { icon:"✅", text:"المتطلبات النظامية الخاصة بنوع شركتك، ونسبة التزامك بها، وما الذي ينقصك بالضبط." },
  risks:       { icon:"⚠️", text:"سجل المخاطر وتقييمها (احتمالية وتأثير) وخطط معالجتها." },
  audit:       { icon:"🔍", text:"أعمال المراجعة الداخلية وملاحظاتها ومتابعة تصحيحها." },
  signing:     { icon:"🔏", text:"أرسل أي مستند للتوقيع الإلكتروني وتابع من وقّع ومن لم يوقّع، والموقّع يُحفظ في الأرشيف." },
  archive:     { icon:"🗄️", text:"كل مستنداتك ومحاضرك في مكان واحد، منظمة وقابلة للبحث." }
};
const HWKM_TOUR_ORDER = {
  listed:   ["dashboard","members","committees","meetings","circulation","agm","shareholders","announcements","governance","structure","permissions","compliance","risks","audit","signing","archive"],
  unlisted: ["dashboard","members","committees","meetings","circulation","agm","shareholders","governance","structure","permissions","compliance","risks","audit","signing","archive"],
  llc:      ["dashboard","members","meetings","agm","shareholders","governance","structure","permissions","compliance","signing","archive"],
  llc1m:    ["dashboard","managerdecisions","agm","shareholders","governance","compliance","signing","archive"],
  llc1o:    ["dashboard","ownerdecisions","shareholders","governance","compliance","signing","archive"],
  sole:     ["dashboard","ownerdecisions","shareholders","governance","compliance","signing","archive"]
};
const HWKM_TOUR_KIND_LABEL = { listed:"شركة مساهمة مدرجة", unlisted:"شركة مساهمة غير مدرجة", llc:"شركة ذات مسؤولية محدودة", llc1m:"شركة ذات مسؤولية محدودة بمدير واحد", llc1o:"شركة الشخص الواحد", sole:"مؤسسة فردية" };

function hwkmTourKind(){
  try{
    if(currentCompanyType === "مؤسسة فردية") return "sole";
    if(currentCompanyType === "ذات مسؤولية محدودة"){
      if(currentCompanyLLCSingleOwner) return "llc1o";
      if(currentCompanyLLCSingleManager) return "llc1m";
      return "llc";
    }
    if(currentCompanyType === "مساهمة مدرجة") return "listed";
  }catch(e){}
  return "unlisted";
}
function hwkmTourVisible(page){
  const el = document.querySelector(`.nav-item[onclick^="go('${page}'"]`);
  return !!el && el.offsetParent !== null;
}
function hwkmTourSteps(){
  if(typeof currentUserProfile !== "undefined" && currentUserProfile && currentUserProfile.is_platform_admin === true) return HWKM_TOUR_OWNER_STEPS;
  const kind = hwkmTourKind();
  const family = kind.indexOf("llc") === 0 ? "llc" : (kind === "sole" ? "sole" : (kind === "listed" ? "listed" : "joint"));
  const steps = [{ icon:"👋", title:"أهلًا بك في حوكم", text:`هذه جولة مخصصة لـ«${HWKM_TOUR_KIND_LABEL[kind]}». تمر على الأقسام التي تخصك فقط، وتقدر تتخطاها وتعيدها متى شئت.`, page:null }];
  (HWKM_TOUR_ORDER[kind] || HWKM_TOUR_ORDER.unlisted).forEach(pg => {
    const d = HWKM_TOUR_PAGES[pg]; if(!d || !hwkmTourVisible(pg)) return;
    const nav = document.querySelector(`.nav-item[onclick^="go('${pg}'"] .ni-text`);
    steps.push({ icon:d.icon, title:(nav && nav.textContent.trim()) || pg, text:d[family] || d[kind] || d.text, page:pg });
  });
  steps.push({ icon:"🎯", title:"جاهز للبدء", text:"ابدأ بالخطوات الأربع في بطاقة «ابدأ من هنا» بلوحة التحكم. وتقدر تعيد هذه الجولة من الزر «جولة تعريفية بالمنصة» في أسفل الشاشة.", page:null });
  return steps;
}

function hwkmTourKey(){ try{ return "hwkm_tour_done_" + ((currentUserProfile && currentUserProfile.email) || ""); }catch(e){ return "hwkm_tour_done_"; } }
let hwkmTourIdx = 0;
let hwkmTourList = [];
let hwkmTourOpenedSidebar = false;

function hwkmTourCss(){
  if(document.getElementById("hwkmTourCss")) return;
  const st = document.createElement("style"); st.id = "hwkmTourCss";
  st.textContent = `
  @keyframes hwkmTourIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes hwkmTourPulse{0%{box-shadow:0 0 0 0 rgba(184,151,42,.65)}70%{box-shadow:0 0 0 12px rgba(184,151,42,0)}100%{box-shadow:0 0 0 0 rgba(184,151,42,0)}}
  .hwkm-tour-mark{outline:2px solid #D9B945 !important;outline-offset:2px;border-radius:10px;animation:hwkmTourPulse 1.6s infinite;background:rgba(217,185,69,.16) !important}
  #hwkmTourCard{animation:hwkmTourIn .25s ease;overflow:visible}
  #hwkmTourCard .tc-head{background:linear-gradient(135deg,#0D2447,#1B4478);color:#fff;border-radius:14px 14px 0 0;padding:14px 18px;display:flex;align-items:center;gap:12px}
  #hwkmTourCard .tc-ico{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.14);border:1.5px solid #D9B945;display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0}
  #hwkmTourCard .tc-title{font-size:16px;font-weight:800;line-height:1.4}
  #hwkmTourCard .tc-count{font-size:11px;color:#D9B945;font-weight:700;margin-top:1px}
  #hwkmTourCard .tc-body{padding:14px 18px 6px;font-size:13.5px;color:#3b4a63;line-height:1.95}
  #hwkmTourCard .tc-bar{height:4px;background:#EEF1F5;margin:10px 18px 0;border-radius:4px;overflow:hidden}
  #hwkmTourCard .tc-bar i{display:block;height:100%;background:linear-gradient(90deg,#B8972A,#E3C75A);border-radius:4px;transition:width .3s}
  #hwkmTourCard .tc-foot{display:flex;gap:8px;align-items:center;padding:12px 18px 16px}
  #hwkmTourCard .tc-next{flex:1;background:linear-gradient(135deg,#B8972A,#D9B945);color:#0D2447;border:none;border-radius:10px;padding:10px 14px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit}
  #hwkmTourCard .tc-sec{background:#F2F4F8;color:#4a5a73;border:none;border-radius:10px;padding:10px 14px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
  #hwkmTourCard .tc-arrow{position:absolute;top:50%;width:14px;height:14px;background:#fff;transform:translateY(-50%) rotate(45deg);border:2px solid #D9B945}
  #hwkmTourBtn{transition:transform .15s}#hwkmTourBtn:hover{transform:translateY(-2px)}`;
  document.head.appendChild(st);
}

function hwkmTourClearMark(){ document.querySelectorAll(".hwkm-tour-mark").forEach(e => e.classList.remove("hwkm-tour-mark")); }
function hwkmTourClose(markDone){
  const bg = document.getElementById("hwkmTourBg"); if(bg) bg.remove();
  hwkmTourClearMark();
  if(hwkmTourOpenedSidebar){ try{ toggleSidebar(); }catch(e){} hwkmTourOpenedSidebar = false; }
  if(markDone){ try{ localStorage.setItem(hwkmTourKey(), "1"); }catch(e){} }
}

function hwkmTourShow(i){
  hwkmTourCss();
  if(i === 0 || !hwkmTourList.length) hwkmTourList = hwkmTourSteps();
  hwkmTourIdx = Math.max(0, Math.min(i, hwkmTourList.length - 1));
  const s = hwkmTourList[hwkmTourIdx];
  const total = hwkmTourList.length;
  const last = hwkmTourIdx === total - 1;
  const mobile = window.innerWidth <= 900;
  hwkmTourClearMark();
  const target = (s.page && !last && hwkmTourIdx > 0) ? document.querySelector(`.nav-item[onclick^="go('${s.page}'"]`) : null;
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
  const pct = Math.round((hwkmTourIdx + 1) / total * 100);
  bg.innerHTML = `<div id="hwkmTourCard" role="dialog" style="pointer-events:auto;position:fixed;background:#fff;border-radius:16px;width:min(350px,calc(100vw - 24px));box-shadow:0 14px 44px rgba(13,36,71,.4);border:2px solid #D9B945;direction:rtl;font-family:inherit">
    ${target && !mobile ? `<span class="tc-arrow" style="left:-9px;border-right:none;border-top:none"></span>` : ""}
    <div class="tc-head"><div class="tc-ico">${s.icon}</div><div><div class="tc-title">${orgEsc(s.title)}</div><div class="tc-count">الخطوة ${hwkmTourIdx + 1} من ${total}</div></div></div>
    <div class="tc-body">${orgEsc(s.text)}</div>
    <div class="tc-bar"><i style="width:${pct}%"></i></div>
    <div class="tc-foot">
      <button type="button" class="tc-next" id="hwkmTourNext">${last ? "إنهاء الجولة ✓" : (hwkmTourIdx === 0 ? "ابدأ الجولة ←" : "التالي ←")}</button>
      ${hwkmTourIdx > 0 ? `<button type="button" class="tc-sec" id="hwkmTourPrev">السابق</button>` : ""}
      ${last ? "" : `<button type="button" class="tc-sec" id="hwkmTourSkip">تخطي</button>`}
    </div>
  </div>`;
  const card = document.getElementById("hwkmTourCard");
  const place = () => {
    if(target){
      target.classList.add("hwkm-tour-mark");
      const r = target.getBoundingClientRect();
      if(mobile){ card.style.bottom = "12px"; card.style.left = "12px"; }
      else{
        card.style.right = Math.max(12, window.innerWidth - r.left + 18) + "px";
        const h = card.offsetHeight;
        const top = Math.max(12, Math.min(r.top + r.height/2 - h/2, window.innerHeight - h - 12));
        card.style.top = top + "px";
        const ar = card.querySelector(".tc-arrow"); if(ar) ar.style.top = (r.top + r.height/2 - top) + "px";
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
      btn.setAttribute("style", "position:fixed;left:16px;bottom:18px;z-index:9000;background:#B8972A;color:#fff;border:none;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(13,36,71,.3)");
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
