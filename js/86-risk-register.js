/* ══════════ سجل المخاطر الذاتي + الخريطة الحرارية ══════════
   - المخاطر نوعان: «ذاتية» تضيفها الشركة بنفسها (جدول company_risks)، و«تقييم حوكم» وهي بنود
     خدمة التقييم المعتمدة (risk_items) للقراءة فقط. الخريطة تجمع النوعين.
   - الجدول يُنشأ بملف SQL رقم 076؛ قبل تشغيله تعمل الصفحة بمخاطر التقييم فقط ولا تُظهر زر الإضافة. */

const RR_LIK = { 1:"نادر", 2:"غير محتمل", 3:"ممكن", 4:"محتمل", 5:"شبه مؤكد" };
const RR_IMP = { 1:"طفيف", 2:"محدود", 3:"متوسط", 4:"كبير", 5:"جسيم" };
const RR_CATS = ["استراتيجية","تشغيلية","مالية","قانونية وتنظيمية","حوكمة","سمعة","تقنية وأمن معلومات","موارد بشرية","أخرى"];
const RR_STATUSES = ["مفتوح","قيد المعالجة","مراقبة","مغلق"];
const RR_FREQ_MONTHS = { "شهري":1, "ربع سنوي":3, "نصف سنوي":6, "سنوي":12 };
const RR_MANAGER_ROLES = ["مدير النظام","رئيس مجلس","رئيس المجلس","أمين السر","سكرتير المجلس"];

let rrRisks = [];          // كل المخاطر الموحّدة
let rrMode = "current";    // current | target
let rrCellFilter = null;   // {l,i}
let rrShowClosed = false;
let rrTableReady = true;

function rrScore(l, i){ return (Number(l)||0) * (Number(i)||0); }
function rrZone(score){
  if(score >= 15) return { key:"critical", label:"حرج", color:"#B3122B" };
  if(score >= 10) return { key:"high",     label:"عالٍ", color:"#E8742A" };
  if(score >= 5)  return { key:"medium",   label:"متوسط", color:"#E0B21F" };
  return                 { key:"low",      label:"منخفض", color:"#1E9E78" };
}
/* ألوان واضحة بحسب المنطقة مع تدرّج ناعم داخل كل منطقة: أخضر ← أصفر ← برتقالي ← أحمر */
function rrCellColor(score){
  let h, sat = 82, light = 46;
  if(score <= 4){ h = 158 - (score - 1) * 6; light = 40; }          // أخضر زمردي
  else if(score <= 9){ h = 52 - (score - 5) * 2; light = 49; }       // أصفر ذهبي
  else if(score <= 14){ h = 28 - (score - 10) * 1.5; light = 51; }   // برتقالي
  else { h = 9 - Math.min(score - 15, 10) * 0.8; light = 47 - Math.min(score - 15, 10) * 1.1; sat = 85; } // أحمر
  return `hsl(${Math.round(h)} ${sat}% ${Math.round(light)}%)`;
}
function rrCanEdit(){
  const r = getCurrentRole();
  return RR_MANAGER_ROLES.includes(r) || (typeof gaIsPlatformOwner === "function" && gaIsPlatformOwner());
}
function rrToday(){ return new Date(new Date().toDateString()); }
function rrAddMonths(d, m){ const x = new Date(d); x.setMonth(x.getMonth() + m); return x; }
function rrIso(d){ const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth()+1).padStart(2,"0") + "-" + String(x.getDate()).padStart(2,"0"); }

async function rrFetchAssessmentRisks(){
  try{
    const { data: reqs } = await sb.from("risk_requests").select("id,status,pending_final_approval").eq("company_id", currentCompanyId);
    const ids = (reqs||[]).filter(r => (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") && !r.pending_final_approval).map(r => r.id);
    if(!ids.length) return [];
    const { data: items } = await sb.from("risk_items").select("*").in("request_id", ids);
    return (items||[]).filter(it => it.likelihood && it.impact).map(it => ({
      src: "assess", id: it.id, title: it.description || "—", category: it.category || "", l: Number(it.likelihood), i: Number(it.impact),
      owner: it.responsible_person || "", status: it.action_status === "مكتمل" ? "مغلق" : (it.action_status === "قيد التنفيذ" ? "قيد المعالجة" : "مفتوح"),
      plan: it.treatment_plan || "", targetClose: it.target_close_date || null
    }));
  }catch(e){ return []; }
}
async function rrFetchOwnRisks(){
  const { data, error } = await sb.from("company_risks").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ rrTableReady = false; return []; }
  rrTableReady = true;
  return (data||[]).map(r => ({
    src: "own", id: r.id, title: r.title, description: r.description || "", category: r.category || "", l: r.likelihood, i: r.impact,
    pl: r.prev_likelihood, pi: r.prev_impact, tl: r.target_likelihood, ti: r.target_impact,
    owner: r.owner || "", status: r.status, plan: r.treatment_plan || "", targetClose: r.target_close_date,
    freq: r.review_frequency, lastReview: r.last_reviewed_at, nextReview: r.next_review_date
  }));
}

async function loadRiskRegister(){
  const host = document.getElementById("riskRegisterHost");
  if(!host) return;
  const [own, assess] = await Promise.all([rrFetchOwnRisks(), rrFetchAssessmentRisks()]);
  rrRisks = [...own, ...assess];
  rrRisks.forEach((r, idx) => { r.n = idx + 1; });
  renderRiskRegister();
}

function rrVisible(){
  return rrRisks.filter(r => rrShowClosed || r.status !== "مغلق");
}
function rrPos(r){
  if(rrMode === "target" && r.tl && r.ti) return { l: r.tl, i: r.ti, moved: true };
  return { l: r.l, i: r.i, moved: false };
}

function renderRiskRegister(){
  const host = document.getElementById("riskRegisterHost");
  if(!host) return;
  const list = rrVisible();
  const canEdit = rrCanEdit() && rrTableReady;

  // ملخص المناطق ومؤشر الخطر الكلي
  const zones = { critical:0, high:0, medium:0, low:0 };
  let sum = 0;
  list.forEach(r => { const p = rrPos(r); const s = rrScore(p.l, p.i); zones[rrZone(s).key]++; sum += s; });
  const index = list.length ? Math.round(sum / (list.length * 25) * 100) : 0;
  const overdueReview = rrRisks.filter(r => r.src==="own" && r.status!=="مغلق" && r.nextReview && new Date(r.nextReview) < rrToday()).length;
  const idxColor = index >= 60 ? "#E8452C" : index >= 35 ? "#E8A92A" : "#2BC49A";

  // الخريطة 5×5 — الاحتمال رأسيًا (5 فوق) والأثر أفقيًا (1 إلى 5)
  const cellsBy = {};
  list.forEach(r => { const p = rrPos(r); const k = p.l + "-" + p.i; (cellsBy[k] = cellsBy[k] || []).push(r); });
  let grid = "";
  for(let l = 5; l >= 1; l--){
    grid += `<div class="rr-axis rr-axis-y"><b>${l}</b><small>${RR_LIK[l]}</small></div>`;
    for(let i = 1; i <= 5; i++){
      const s = rrScore(l, i), z = rrZone(s), here = cellsBy[l+"-"+i] || [];
      const active = rrCellFilter && rrCellFilter.l === l && rrCellFilter.i === i;
      const bubbles = here.slice(0, 4).map(r => {
        const mv = rrMoveArrow(r);
        return `<button class="rr-bub ${r.src==='assess'?'rr-bub-a':''}" title="${orgEsc(r.title)}" onclick="event.stopPropagation();openRiskDetail('${r.src}',${r.id})">${r.n}${mv}</button>`;
      }).join("") + (here.length > 4 ? `<span class="rr-more">+${here.length-4}</span>` : "");
      grid += `<div class="rr-cell rr-z-${z.key}${active?' rr-active':''}" style="--c:${rrCellColor(s)}" onclick="rrFilterCell(${l},${i})" title="الاحتمال: ${RR_LIK[l]} — الأثر: ${RR_IMP[i]} — الدرجة ${s}">
        <span class="rr-score">${s}</span><div class="rr-bubs">${bubbles}</div></div>`;
    }
  }
  grid += `<div></div>` + [1,2,3,4,5].map(i => `<div class="rr-axis rr-axis-x"><b>${i}</b><small>${RR_IMP[i]}</small></div>`).join("");

  const top = [...list].sort((a,b) => { const pa = rrPos(a), pb = rrPos(b); return rrScore(pb.l,pb.i) - rrScore(pa.l,pa.i); }).slice(0,5);
  const topHtml = top.length ? top.map(r => { const p = rrPos(r), z = rrZone(rrScore(p.l,p.i));
      return `<div class="rr-top" onclick="openRiskDetail('${r.src}',${r.id})"><span class="rr-top-n" style="background:${z.color}">${r.n}</span><span class="rr-top-t">${orgEsc(r.title)}</span><span class="rr-top-z" style="color:${z.color}">${z.label}</span></div>`; }).join("")
    : `<div class="rr-empty-s">لا مخاطر ظاهرة بعد</div>`;

  const filtered = rrCellFilter ? list.filter(r => { const p = rrPos(r); return p.l === rrCellFilter.l && p.i === rrCellFilter.i; }) : list;
  const rows = filtered.length ? filtered.map(r => rrRowHtml(r, canEdit)).join("") :
    `<tr><td colspan="8" style="text-align:center;color:var(--gray3);font-size:12px;padding:18px">${rrRisks.length ? "لا مخاطر في هذا الاختيار" : "لا توجد مخاطر مسجّلة بعد. ابدأ بإضافة أول خطر."}</td></tr>`;

  host.innerHTML = `
  <style>
    .rr-wrap{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:16px;margin-bottom:18px}
    @media(max-width:900px){.rr-wrap{grid-template-columns:1fr}}
    .rr-panel{background:linear-gradient(160deg,#0D2447 0%,#14305f 55%,#0b1c38 100%);border-radius:20px;padding:20px;color:#fff;box-shadow:0 14px 40px rgba(13,36,71,.35);position:relative;overflow:hidden}
    .rr-panel:before{content:"";position:absolute;inset:-40% -20% auto auto;width:420px;height:420px;background:radial-gradient(circle,rgba(184,151,42,.22),transparent 65%);pointer-events:none}
    .rr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;position:relative}
    .rr-title{font-weight:800;font-size:16px;letter-spacing:.2px}
    .rr-title small{display:block;font-weight:500;font-size:11.5px;opacity:.7;margin-top:2px}
    .rr-seg{display:inline-flex;background:rgba(255,255,255,.1);border-radius:999px;padding:3px}
    .rr-seg button{border:0;background:transparent;color:#fff;font:600 11.5px Tajawal,system-ui;padding:6px 14px;border-radius:999px;cursor:pointer;opacity:.75}
    .rr-seg button.on{background:#B8972A;color:#0D2447;opacity:1;font-weight:800}
    .rr-gridbox{display:grid;grid-template-columns:54px repeat(5,minmax(0,1fr));gap:6px;direction:ltr;position:relative}
    .rr-cell{position:relative;aspect-ratio:1/.82;border-radius:12px;background:radial-gradient(120% 120% at 30% 20%,color-mix(in srgb,var(--c) 100%,#fff 18%),var(--c));border:1px solid rgba(255,255,255,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,box-shadow .18s ease,filter .18s;min-height:0;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 10px rgba(0,0,0,.25)}
    .rr-cell:hover{transform:translateY(-3px) scale(1.04);z-index:2;filter:brightness(1.08);box-shadow:0 10px 24px rgba(0,0,0,.45)}
    .rr-cell.rr-active{outline:3px solid #fff;outline-offset:1px;z-index:3}
    .rr-z-critical{animation:rrPulse 2.6s ease-in-out infinite}
    @keyframes rrPulse{0%,100%{box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 10px rgba(0,0,0,.25),0 0 0 0 rgba(232,69,44,.0)}50%{box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 10px rgba(0,0,0,.25),0 0 22px 4px rgba(232,69,44,.55)}}
    @media(prefers-reduced-motion:reduce){.rr-z-critical{animation:none}.rr-cell{transition:none}}
    .rr-score{position:absolute;top:5px;left:7px;font:800 10px Tajawal,system-ui;color:rgba(255,255,255,.55)}
    .rr-bubs{display:flex;flex-wrap:wrap;gap:3px;align-items:center;justify-content:center;padding:4px}
    .rr-bub{position:relative;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:#0D2447;color:#fff;font:800 11px Tajawal,system-ui;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.45);display:inline-flex;align-items:center;justify-content:center;padding:0;transition:transform .15s}
    .rr-bub:hover{transform:scale(1.18)}
    .rr-bub-a{background:#B8972A;color:#0D2447;border-color:#fff}
    .rr-bub i{position:absolute;top:-9px;right:-6px;font-style:normal;font-size:10px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))}
    .rr-more{font:800 11px Tajawal,system-ui;color:#fff;background:rgba(0,0,0,.35);border-radius:10px;padding:2px 6px}
    .rr-axis{display:flex;flex-direction:column;align-items:center;justify-content:center;color:#E9D48A;line-height:1.2;text-align:center}
    .rr-axis b{font-size:14px}.rr-axis small{font-size:9.5px;opacity:.8;font-weight:600}
    .rr-axlbl{display:flex;justify-content:space-between;font-size:10.5px;color:#E9D48A;opacity:.85;margin:8px 0 0 54px;direction:ltr;font-weight:700}
    .rr-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;font-size:11.5px;position:relative}
    .rr-legend span{display:inline-flex;align-items:center;gap:6px}
    .rr-legend i{width:11px;height:11px;border-radius:4px;display:inline-block}
    .rr-side{display:flex;flex-direction:column;gap:14px}
    .rr-card{background:#fff;border:1px solid var(--gray1);border-radius:18px;padding:16px}
    .rr-gauge{display:flex;align-items:center;gap:14px}
    .rr-ring{width:96px;height:96px;border-radius:50%;background:conic-gradient(var(--rc) calc(var(--p)*1%),#e8ecf3 0);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .rr-ring div{width:74px;height:74px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:var(--dark)}
    .rr-ring small{font-size:9.5px;color:var(--gray3);font-weight:600}
    .rr-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1}
    .rr-chip{border-radius:12px;text-align:center;padding:8px 2px;color:#fff;font-weight:800;font-size:17px;line-height:1.1}
    .rr-chip small{display:block;font-size:10px;font-weight:600;opacity:.9;margin-top:3px}
    .rr-top{display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid #eef1f6;cursor:pointer;border-radius:8px}
    .rr-top:hover{background:#f6f8fc}
    .rr-top-n{width:24px;height:24px;border-radius:50%;color:#fff;font:800 11px Tajawal,system-ui;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
    .rr-top-t{flex:1;font-size:12.5px;color:var(--dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rr-top-z{font-size:11px;font-weight:800}
    .rr-empty-s{text-align:center;color:var(--gray3);font-size:12px;padding:12px}
    .rr-zchip{display:inline-block;border-radius:999px;color:#fff;font-size:11px;font-weight:800;padding:2px 10px}
    .rr-tag{display:inline-block;border-radius:6px;background:#f0f3f9;color:var(--dark);font-size:10.5px;padding:2px 7px;font-weight:700}
    .rr-late{color:#B3122B;font-weight:800}
    .rr-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:10px}
    .rr-tbl{min-width:780px}
    @media(max-width:600px){
      .rr-panel{padding:14px 10px;border-radius:16px}
      .rr-gridbox{grid-template-columns:38px repeat(5,minmax(0,1fr));gap:4px}
      .rr-axlbl{margin-left:38px}
      .rr-cell{aspect-ratio:1/1;border-radius:9px}
      .rr-bub{width:21px;height:21px;font-size:10px}
      .rr-score{font-size:8.5px;top:3px;left:4px}
      .rr-axis small{display:none}
      .rr-legend{gap:8px 12px;font-size:10.5px}
    }
    .rr-tbl-n{width:24px;height:24px;border-radius:50%;background:#0D2447;color:#fff;font:800 11px Tajawal,system-ui;display:inline-flex;align-items:center;justify-content:center}
    .rr-tbl-n.a{background:#B8972A;color:#0D2447}
  </style>

  <div class="sec-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
    <span><span class="ico-i ico-warning"></span>سجل المخاطر والخريطة الحرارية</span>
    ${canEdit ? `<button class="btn btn-gold" style="font-size:12px" onclick="openRiskEditor()">+ إضافة خطر</button>` : ""}
  </div>

  <div class="rr-wrap">
    <div class="rr-panel">
      <div class="rr-head">
        <div class="rr-title">الخريطة الحرارية للمخاطر<small>الاحتمال × الأثر — اضغط خانة لتصفية الجدول، واضغط الدائرة لفتح الخطر</small></div>
        <div class="rr-seg"><button class="${rrMode==='current'?'on':''}" onclick="rrSetMode('current')">الوضع الحالي</button><button class="${rrMode==='target'?'on':''}" onclick="rrSetMode('target')">بعد المعالجة</button></div>
      </div>
      <div class="rr-gridbox">${grid}</div>
      <div class="rr-axlbl"><span>أثر أخف</span><span>الأثر ←</span><span>أثر أشد</span></div>
      <div class="rr-legend">
        <span><i style="background:#1E9E78"></i>منخفض (1–4)</span><span><i style="background:#E0B21F"></i>متوسط (5–9)</span>
        <span><i style="background:#E8742A"></i>عالٍ (10–14)</span><span><i style="background:#B3122B"></i>حرج (15–25)</span>
        <span><i style="background:#0D2447;border:1px solid #fff"></i>خطر ذاتي</span><span><i style="background:#B8972A"></i>من تقييم حوكم</span>
        <span>▲ ارتفع · ▼ انخفض منذ المراجعة</span>
      </div>
    </div>

    <div class="rr-side">
      <div class="rr-card">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark);margin-bottom:10px">مؤشر الخطر الكلي</div>
        <div class="rr-gauge">
          <div class="rr-ring" style="--p:${index};--rc:${idxColor}"><div>${index}%<small>${index>=60?'مرتفع':index>=35?'متوسط':'مقبول'}</small></div></div>
          <div class="rr-chips">
            <div class="rr-chip" style="background:#B3122B">${zones.critical}<small>حرج</small></div>
            <div class="rr-chip" style="background:#E8742A">${zones.high}<small>عالٍ</small></div>
            <div class="rr-chip" style="background:#E0B21F">${zones.medium}<small>متوسط</small></div>
            <div class="rr-chip" style="background:#1E9E78">${zones.low}<small>منخفض</small></div>
          </div>
        </div>
        ${overdueReview ? `<div style="margin-top:10px;background:#FDE8E8;color:#B3122B;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700">⏰ ${overdueReview} ${overdueReview===1?'خطر فات':'مخاطر فاتت'} موعد مراجعتها</div>` : ""}
      </div>
      <div class="rr-card">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark);margin-bottom:6px">أخطر خمس مخاطر</div>
        ${topHtml}
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="card-body">
      <div class="rr-tools">
        <div style="font-size:12px;color:var(--gray3)">${rrCellFilter ? `مصفّى على خانة (احتمال ${rrCellFilter.l} × أثر ${rrCellFilter.i}) <button class="btn-xs" onclick="rrFilterCell(null)">إلغاء التصفية</button>` : `${list.length} ${list.length===1?'خطر':'مخاطر'} ظاهرة`}</div>
        <label style="font-size:12px;color:var(--gray3);cursor:pointer"><input type="checkbox" ${rrShowClosed?'checked':''} onchange="rrToggleClosed(this.checked)"> إظهار المغلقة</label>
      </div>
      <div style="overflow-x:auto"><table class="tbl rr-tbl">
        <thead><tr><th>#</th><th>الخطر</th><th>الفئة</th><th>المستوى</th><th>المسؤول</th><th>الحالة</th><th>المراجعة القادمة</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
  </div>`;
}

function rrMoveArrow(r){
  if(rrMode !== "current" || r.src !== "own" || !r.pl || !r.pi) return "";
  const was = rrScore(r.pl, r.pi), now = rrScore(r.l, r.i);
  if(now > was) return `<i style="color:#ff6b57">▲</i>`;
  if(now < was) return `<i style="color:#4be0b0">▼</i>`;
  return "";
}

function rrRowHtml(r, canEdit){
  const p = rrPos(r), s = rrScore(p.l, p.i), z = rrZone(s);
  const late = r.src === "own" && r.status !== "مغلق" && r.nextReview && new Date(r.nextReview) < rrToday();
  const review = r.src === "own" ? (r.nextReview ? `<span class="${late?'rr-late':''}">${late?'⏰ ':''}${new Date(r.nextReview).toLocaleDateString('ar-SA-u-ca-gregory')}</span>` : "—") : `<span class="rr-tag">من تقييم حوكم</span>`;
  const actions = (r.src === "own" && canEdit)
    ? `<button class="btn-xs primary" onclick="event.stopPropagation();rrMarkReviewed(${r.id})" title="تم استعراض الخطر اليوم">✔ مراجعة</button>
       <button class="btn-xs" onclick="event.stopPropagation();openRiskEditor(${r.id})">تعديل</button>`
    : `<button class="btn-xs" onclick="event.stopPropagation();openRiskDetail('${r.src}',${r.id})">عرض</button>`;
  return `<tr style="cursor:pointer" onclick="openRiskDetail('${r.src}',${r.id})">
    <td><span class="rr-tbl-n ${r.src==='assess'?'a':''}">${r.n}</span></td>
    <td style="max-width:280px"><div style="font-weight:700;font-size:12.5px">${orgEsc(r.title)}</div></td>
    <td><span class="rr-tag">${orgEsc(r.category||"—")}</span></td>
    <td><span class="rr-zchip" style="background:${z.color}">${z.label} · ${s}</span></td>
    <td style="font-size:12px">${orgEsc(r.owner||"—")}</td>
    <td style="font-size:12px">${orgEsc(r.status)}</td>
    <td style="font-size:12px">${review}</td>
    <td style="white-space:nowrap">${actions}</td></tr>`;
}

function rrSetMode(m){ rrMode = m; renderRiskRegister(); }
function rrFilterCell(l, i){
  if(l == null){ rrCellFilter = null; }
  else if(rrCellFilter && rrCellFilter.l === l && rrCellFilter.i === i){ rrCellFilter = null; }
  else rrCellFilter = { l, i };
  renderRiskRegister();
}
function rrToggleClosed(v){ rrShowClosed = !!v; renderRiskRegister(); }

function openRiskDetail(src, id){
  const r = rrRisks.find(x => x.src === src && x.id === id); if(!r) return;
  const s = rrScore(r.l, r.i), z = rrZone(s);
  const tgt = (r.tl && r.ti) ? `${RR_LIK[r.tl]} × ${RR_IMP[r.ti]} (درجة ${rrScore(r.tl, r.ti)})` : "—";
  const canEdit = r.src === "own" && rrCanEdit() && rrTableReady;
  const body = document.getElementById("rrDetailBody");
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="rr-tbl-n ${r.src==='assess'?'a':''}">${r.n}</span>
      <div style="font-weight:800;font-size:15px;color:var(--dark)">${orgEsc(r.title)}</div></div>
    <div style="margin-bottom:10px"><span class="rr-zchip" style="background:${z.color}">${z.label} · الدرجة ${s}</span> <span class="rr-tag">${r.src==='assess'?'من تقييم حوكم':'خطر ذاتي'}</span> <span class="rr-tag">${orgEsc(r.category||"بلا فئة")}</span></div>
    ${r.description ? `<div style="font-size:12.5px;line-height:1.9;margin-bottom:10px;color:var(--dark)">${orgEsc(r.description)}</div>` : ""}
    <div class="row2" style="font-size:12.5px;margin-bottom:8px"><div><b>الاحتمال:</b> ${RR_LIK[r.l]||r.l}</div><div><b>الأثر:</b> ${RR_IMP[r.i]||r.i}</div></div>
    <div style="font-size:12.5px;margin-bottom:6px"><b>الوضع المستهدف بعد المعالجة:</b> ${tgt}</div>
    <div style="font-size:12.5px;margin-bottom:6px"><b>المسؤول:</b> ${orgEsc(r.owner||"—")} &nbsp;·&nbsp; <b>الحالة:</b> ${orgEsc(r.status)}</div>
    <div style="font-size:12.5px;margin-bottom:6px"><b>خطة المعالجة:</b> ${orgEsc(r.plan||"—")}</div>
    <div style="font-size:12.5px;margin-bottom:6px"><b>الإقفال المستهدف:</b> ${r.targetClose ? new Date(r.targetClose).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</div>
    ${r.src==='own' ? `<div style="font-size:12.5px"><b>دورية المراجعة:</b> ${orgEsc(r.freq||"—")} &nbsp;·&nbsp; <b>آخر مراجعة:</b> ${r.lastReview ? new Date(r.lastReview).toLocaleDateString('ar-SA-u-ca-gregory') : "لم تُراجع بعد"}</div>` : ""}
    <div class="modal-foot" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="closeM('m-risk-detail')">إغلاق</button>
      ${canEdit ? `<button class="btn btn-gold" onclick="closeM('m-risk-detail');openRiskEditor(${r.id})">تعديل</button>` : ""}
    </div>`;
  openM("m-risk-detail");
}

function rrFillSelect(id, map){
  const el = document.getElementById(id); if(!el || el.dataset.filled) return;
  el.innerHTML = Object.entries(map).map(([k,v]) => `<option value="${k}">${k} — ${v}</option>`).join("");
  el.dataset.filled = "1";
}
function rrPreview(){
  const l = Number(document.getElementById("rr-l").value), i = Number(document.getElementById("rr-i").value);
  const s = rrScore(l, i), z = rrZone(s);
  const el = document.getElementById("rr-prev");
  if(el) el.innerHTML = `<span class="rr-zchip" style="background:${z.color}">${z.label} · الدرجة ${s}</span>`;
}
function openRiskEditor(id){
  if(!rrCanEdit() || !rrTableReady) return;
  rrFillSelect("rr-l", RR_LIK); rrFillSelect("rr-i", RR_IMP);
  const tl = document.getElementById("rr-tl"), ti = document.getElementById("rr-ti");
  if(!tl.dataset.filled){
    tl.innerHTML = `<option value="">— بلا —</option>` + Object.entries(RR_LIK).map(([k,v]) => `<option value="${k}">${k} — ${v}</option>`).join(""); tl.dataset.filled = "1";
    ti.innerHTML = `<option value="">— بلا —</option>` + Object.entries(RR_IMP).map(([k,v]) => `<option value="${k}">${k} — ${v}</option>`).join(""); ti.dataset.filled = "1";
  }
  const cat = document.getElementById("rr-cat"); if(!cat.dataset.filled){ cat.innerHTML = `<option value="">— اختر —</option>` + RR_CATS.map(c => `<option>${c}</option>`).join(""); cat.dataset.filled = "1"; }
  const r = id ? rrRisks.find(x => x.src === "own" && x.id === id) : null;
  document.getElementById("rr-id").value = r ? r.id : "";
  document.getElementById("rr-title").value = r ? r.title : "";
  document.getElementById("rr-desc").value = r ? (r.description||"") : "";
  cat.value = r ? (r.category||"") : "";
  document.getElementById("rr-l").value = r ? r.l : 3;
  document.getElementById("rr-i").value = r ? r.i : 3;
  tl.value = r && r.tl ? r.tl : ""; ti.value = r && r.ti ? r.ti : "";
  document.getElementById("rr-owner").value = r ? (r.owner||"") : "";
  document.getElementById("rr-status").value = r ? r.status : "مفتوح";
  document.getElementById("rr-plan").value = r ? (r.plan||"") : "";
  document.getElementById("rr-close").value = r && r.targetClose ? String(r.targetClose).slice(0,10) : "";
  document.getElementById("rr-freq").value = r ? (r.freq||"ربع سنوي") : "ربع سنوي";
  document.getElementById("rr-del").style.display = r ? "" : "none";
  document.getElementById("rr-modal-title").textContent = r ? "تعديل خطر" : "إضافة خطر جديد";
  rrPreview();
  openM("m-risk-edit");
}

async function saveRiskEditor(){
  const idv = document.getElementById("rr-id").value;
  const title = document.getElementById("rr-title").value.trim();
  if(title.length < 3){ alert("اكتب وصفًا واضحًا للخطر (3 أحرف على الأقل)."); return; }
  const l = Number(document.getElementById("rr-l").value), i = Number(document.getElementById("rr-i").value);
  const tlv = document.getElementById("rr-tl").value, tiv = document.getElementById("rr-ti").value;
  if((tlv && !tiv) || (!tlv && tiv)){ alert("حدّد احتمال وأثر الوضع المستهدف معًا، أو اتركهما فارغين."); return; }
  const freq = document.getElementById("rr-freq").value;
  const closeV = document.getElementById("rr-close").value || null;
  const payload = {
    title, description: document.getElementById("rr-desc").value.trim() || null,
    category: document.getElementById("rr-cat").value || null, likelihood: l, impact: i,
    target_likelihood: tlv ? Number(tlv) : null, target_impact: tiv ? Number(tiv) : null,
    owner: document.getElementById("rr-owner").value.trim() || null, status: document.getElementById("rr-status").value,
    treatment_plan: document.getElementById("rr-plan").value.trim() || null, target_close_date: closeV, review_frequency: freq
  };
  let error;
  if(idv){
    const old = rrRisks.find(x => x.src === "own" && x.id === Number(idv));
    if(old && (old.l !== l || old.i !== i)){ payload.prev_likelihood = old.l; payload.prev_impact = old.i; }
    if(old && old.freq !== freq){ payload.next_review_date = rrIso(rrAddMonths(old.lastReview || rrToday(), RR_FREQ_MONTHS[freq] || 3)); }
    ({ error } = await sb.from("company_risks").update(payload).eq("id", Number(idv)));
  } else {
    payload.company_id = currentCompanyId;
    payload.created_by = currentUserProfile ? currentUserProfile.email : null;
    payload.next_review_date = rrIso(rrAddMonths(rrToday(), RR_FREQ_MONTHS[freq] || 3));
    ({ error } = await sb.from("company_risks").insert([payload]));
  }
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  try{ logActivity(idv ? "تعديل" : "إضافة", "سجل المخاطر", title, `احتمال ${l} × أثر ${i}`); }catch(e){}
  closeM("m-risk-edit");
  uiToast(idv ? "تم حفظ التعديل." : "أُضيف الخطر إلى السجل.");
  loadRiskRegister();
}

async function deleteRiskFromEditor(){
  const idv = document.getElementById("rr-id").value; if(!idv) return;
  if(!await uiConfirm("حذف هذا الخطر نهائيًا من السجل؟ لا يمكن التراجع. وإن كان قد انتهى فالأفضل تغيير حالته إلى «مغلق».")) return;
  const { error } = await sb.from("company_risks").delete().eq("id", Number(idv));
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  try{ logActivity("حذف", "سجل المخاطر", document.getElementById("rr-title").value.trim(), ""); }catch(e){}
  closeM("m-risk-edit"); uiToast("حُذف الخطر."); loadRiskRegister();
}

async function rrMarkReviewed(id){
  const r = rrRisks.find(x => x.src === "own" && x.id === id); if(!r) return;
  const t = rrToday();
  const { error } = await sb.from("company_risks").update({
    last_reviewed_at: rrIso(t), next_review_date: rrIso(rrAddMonths(t, RR_FREQ_MONTHS[r.freq] || 3))
  }).eq("id", id);
  if(error){ alert("تعذّر تسجيل المراجعة: " + error.message); return; }
  try{ logActivity("تعديل", "سجل المخاطر", r.title, "تسجيل مراجعة"); }catch(e){}
  uiToast("سُجّلت المراجعة، وحُدّد موعد المراجعة القادمة.");
  loadRiskRegister();
}

/* مخاطر السجل الذاتي لتنبيهات لوحة التحكم: خطر حرج بلا خطة، مراجعة فائتة، إقفال متأخر */
async function rrAlertCounts(){
  try{
    const { data, error } = await sb.from("company_risks").select("likelihood,impact,status,treatment_plan,next_review_date,target_close_date").eq("company_id", currentCompanyId).neq("status","مغلق");
    if(error || !data) return null;
    const today = rrToday();
    return {
      criticalNoPlan: data.filter(r => rrScore(r.likelihood, r.impact) >= 15 && !(r.treatment_plan||"").trim()).length,
      reviewLate: data.filter(r => r.next_review_date && new Date(r.next_review_date) < today).length,
      closeLate: data.filter(r => r.target_close_date && new Date(r.target_close_date) < today).length
    };
  }catch(e){ return null; }
}
