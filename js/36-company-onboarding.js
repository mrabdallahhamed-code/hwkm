/* ══════════ COMPANY ONBOARDING (request → platform-owner approval) ══════════ */
const COMPANY_REQUEST_STATUS_STYLE = {
  "قيد المراجعة": { bg:"var(--offwhite)", color:"var(--gray3)" },
  "معتمد": { bg:"#E8F8EF", color:"var(--green)" },
  "مرفوض": { bg:"#FDE8E8", color:"var(--red)" },
  "تجربة تلقائية": { bg:"#FEF3E2", color:"var(--gold)" }
};

async function loadCompanyRequestPage(){
  const box = document.getElementById("companyRequestBody");
  if(!box || !currentUserProfile) return;
  loadMyJoinRequests("crJoinList");
  const { data: myRequests } = await sb.from("company_requests").select("*").eq("requested_by_email", currentUserProfile.email).order("id",{ascending:false});
  const latest = myRequests && myRequests.length ? myRequests[0] : null;

  if(latest && latest.status === "قيد المراجعة"){
    box.innerHTML = `<div style="text-align:center;padding:20px">
      <div style="font-size:40px;margin-bottom:10px">⏳</div>
      <div style="font-size:15px;font-weight:800;color:var(--dark);margin-bottom:6px">طلبك قيد المراجعة</div>
      <div style="font-size:12.5px;color:var(--gray3);line-height:1.8">تم إرسال طلب إدراج "<b>${orgEsc(latest.company_name)}</b>" وهو الآن بانتظار موافقة إدارة حوكم.<br>بمجرد الموافقة، سجّل خروج ثم دخول من جديد وستجد شركتك جاهزة.</div>
    </div>`;
    return;
  }

  const rejectedNotice = latest && latest.status === "مرفوض"
    ? `<div style="background:#FDE8E8;color:var(--red);border-radius:8px;padding:10px;font-size:12px;margin-bottom:14px"><span class="ico-i ico-xcircle"></span>تم رفض طلبك السابق لـ"${orgEsc(latest.company_name)}". يمكنك تعديل البيانات وإعادة الإرسال.</div>`
    : "";

  box.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:36px"><span class="ico ico-new" style="width:16px;height:16px"></span></div>
      <div style="font-size:15px;font-weight:800;color:var(--dark);margin-top:6px">أدرج شركتك بالمنصة</div>
      <div style="font-size:12px;color:var(--gray3);margin-top:4px">عبِّ بيانات شركتك — تقدر تبدأ فترتك التجريبية فورًا بضغطة زر، بدون انتظار.</div>
    </div>
    ${rejectedNotice}
    <div class="cr-tabs"><button type="button" id="crTabF" class="on" onclick="crTab('f')">طلب الإدراج</button><button type="button" id="crTabP" onclick="crTab('p')">الباقات والتجربة</button></div>
    <div id="cr-pane-f">
    <div class="fg"><label>اسم الشركة</label><input class="fi" id="cr-name" placeholder="مثال: شركة النخبة القابضة"/></div>
    <div class="fg"><label>نوع الشركة</label>
      <select class="fs" id="cr-type" onchange="toggleCrLLCFields()">
        <option>مساهمة مدرجة</option><option>مساهمة غير مدرجة</option>
        <option>ذات مسؤولية محدودة</option><option>مؤسسة فردية</option>
        <option>شكل آخر — تواصل معنا</option>
      </select>
      <div id="cr-other-note" class="cr-vmsg warn" style="display:none">يمكنك إكمال التسجيل والدخول لاستكشاف المنصة وفترتها التجريبية، وتواصل معنا لنعرف كيف نخدم شكل شركتك: <a href="https://wa.me/966509015864" target="_blank" rel="noopener" style="color:inherit;font-weight:700">واتساب</a> · <a href="mailto:info@hwkm.net" style="color:inherit;font-weight:700">info@hwkm.net</a>. بعض الأحكام (كالنصاب) تُطبَّق عليك بشكل عام حتى نضبطها لشكلك.</div>
    </div>
    <div class="fg" id="cr-llc-fields" style="display:none;background:var(--offwhite);border-radius:8px;padding:10px 12px">
      <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" id="cr-llc-single-manager" style="width:14px;height:14px"/>
        الشركة يديرها مدير واحد فقط (بلا مجلس مديرين)
      </label>
      <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin:0">
        <input type="checkbox" id="cr-llc-single-owner" style="width:14px;height:14px"/>
        الشركة مملوكة لشخص واحد فقط (شركة الشخص الواحد)
      </label>
    </div>
    <div class="fg" id="cr-tadawul-box" style="background:var(--offwhite);border-radius:8px;padding:10px 12px">
      <label>رمز الشركة في تداول <span style="color:var(--red)">*</span></label>
      <input class="fi" id="cr-tadawul" inputmode="numeric" maxlength="4" placeholder="4 أرقام — مثال: 2222"/>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:5px">إلزامي للشركات المدرجة، ونتحقق منه من موقع تداول. إن كانت شركتك غير مدرجة فاختر نوعها الصحيح من القائمة أعلاه.</div>
    </div>
    <div class="row2">
      <div class="fg"><label>رقم السجل التجاري أو الرقم الموحد <span style="color:var(--red)">*</span></label><input class="fi" id="cr-cr-number" inputmode="numeric" maxlength="10" placeholder="10 أرقام — مثال: 1010XXXXXX"/></div>
      <div class="fg"><label>تاريخ السجل</label><input type="date" class="fi" id="cr-cr-date"/></div>
    </div>
    <div class="fg"><label>الشخص المسؤول (أنت)</label><input class="fi" id="cr-resp-name" value="${orgEsc(currentUserProfile.full_name||'')}"/></div>
    <div class="row2">
      <div class="fg"><label>جوال المسؤول</label><input class="fi" id="cr-resp-phone" value="${orgEsc(currentUserProfile.phone_number||'')}"/></div>
      <div class="fg"><label>إيميل المسؤول</label><input type="email" class="fi" id="cr-resp-email" value="${orgEsc(currentUserProfile.email||'')}"/></div>
    </div>

    <button class="btn btn-gold" style="width:100%;margin-top:10px;font-size:13.5px;padding:13px" onclick="startInstantTrial()"><span class="ico-i ico-bolt"></span>ابدأ فترتك التجريبية الآن (14 يوم، فورًا)</button>
    <p style="font-size:10.5px;color:var(--gray3);text-align:center;margin-top:6px">كل الوحدات مفتوحة أثناء التجربة — بلا حاجة لبطاقة دفع أو موافقة مسبقة.</p>

    <div style="display:flex;align-items:center;gap:10px;margin:16px 0">
      <div style="flex:1;height:1px;background:var(--gray1)"></div>
      <span style="font-size:11px;color:var(--gray3)">أو</span>
      <div style="flex:1;height:1px;background:var(--gray1)"></div>
    </div>
    <button class="btn btn-ghost" style="width:100%" onclick="submitCompanyRequest()"><span class="ico-i ico-send"></span>تواصل معنا لاشتراك مدفوع مباشرة (بدون تجربة)</button>
    </div>
    <div id="cr-pane-p" style="display:none">${renderPlanCards()}
      <button class="btn btn-gold" style="width:100%;margin-top:12px" onclick="crTab('f')">أدرج شركتك الآن</button>
    </div>
  `;
}
function crTab(w){
  const f = document.getElementById("cr-pane-f"), pn = document.getElementById("cr-pane-p");
  if(!f || !pn) return;
  f.style.display = w === "f" ? "" : "none"; pn.style.display = w === "p" ? "" : "none";
  document.getElementById("crTabF").classList.toggle("on", w === "f");
  document.getElementById("crTabP").classList.toggle("on", w === "p");
}

/* Self-serve trial — creates the company and grants full access immediately, with no admin
   in the loop. Manual review stays meaningful at the point real money changes hands (paid
   conversion); gatekeeping the free trial itself was pure friction with no matching benefit.
   A company_requests row is still logged (status "تجربة تلقائية") purely for visibility — the
   platform-owner dashboard's trial list and conversion-rate stat already read from real
   companies.trial_ends_at, so nothing else downstream needs to change to pick this up. */
const CR_OTHER_FORM = "شكل آخر — تواصل معنا";
function toggleCrLLCFields(){
  const box = document.getElementById("cr-llc-fields");
  if(box) box.style.display = document.getElementById("cr-type").value === "ذات مسؤولية محدودة" ? "block" : "none";
  const on = document.getElementById("cr-other-note");
  if(on) on.style.display = document.getElementById("cr-type").value === CR_OTHER_FORM ? "block" : "none";
  const tb = document.getElementById("cr-tadawul-box");
  if(tb) tb.style.display = document.getElementById("cr-type").value === "مساهمة مدرجة" ? "block" : "none";
}

/* رمز تداول: 4 أرقام، إلزامي للمدرجة فقط */
function normTadawul(v){ return String(v||"").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^0-9]/g,""); }
function readCrTadawul(company_type){
  if(company_type !== "مساهمة مدرجة") return { ok:true, symbol:null };
  const sym = normTadawul(document.getElementById("cr-tadawul").value);
  if(!/^\d{4}$/.test(sym)){
    alert("الشركة المدرجة يلزمها رمز تداول (4 أرقام) للتسجيل. إن لم تكن شركتك مدرجة فاختر نوعها الصحيح من القائمة.");
    return { ok:false };
  }
  return { ok:true, symbol:sym };
}

/* Self-serve trial. Every step's result is checked now — before, the membership insert's error
   was ignored, and since a regular user's company list is built from memberships alone, a silent
   failure there left the person with "no company linked", so they registered again and ended up
   with two. A half-finished attempt is remembered locally (the company row exists but linking
   failed), so a retry reuses that company instead of creating another. */
let trialSubmitLock = false;
const TRIAL_BTN_HTML = '<span class="ico-i ico-bolt"></span>ابدأ فترتك التجريبية الآن (14 يوم، فورًا)';
const TRIAL_PENDING_KEY = "hwkm_pending_trial_company";

async function startInstantTrial(){
  if(trialSubmitLock) return;
  const company_name = document.getElementById("cr-name").value.trim();
  if(!company_name){ alert("الرجاء إدخال اسم الشركة"); return; }
  const company_type = document.getElementById("cr-type").value;
  const cr_number = normCrNumber(document.getElementById("cr-cr-number").value);
  if(!validCrNumber(cr_number)){ alert(CR_REQUIRED_MSG); return; }
  const tdw = readCrTadawul(company_type); if(!tdw.ok) return;
  const cr_date = document.getElementById("cr-cr-date").value || null;
  const responsible_person = document.getElementById("cr-resp-name").value.trim();
  const responsible_phone = document.getElementById("cr-resp-phone").value.trim();
  const responsible_email = document.getElementById("cr-resp-email").value.trim();
  const llc_single_manager = document.getElementById("cr-llc-single-manager").checked;
  const llc_single_owner = document.getElementById("cr-llc-single-owner").checked;

  const btn = (typeof event !== "undefined" && event && event.target && event.target.closest) ? event.target.closest("button") : null;
  trialSubmitLock = true;
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="ico-i ico-refresh"></span>جارِ إنشاء شركتك...'; }
  const release = () => { trialSubmitLock = false; if(btn){ btn.disabled = false; btn.innerHTML = TRIAL_BTN_HTML; } };

  try {
    const { data: userData } = await sb.auth.getUser();
    const sessionEmail = userData && userData.user ? userData.user.email : (currentUserProfile ? currentUserProfile.email : null);
    if(!sessionEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); release(); return; }

    const { data: tr, error: trErr } = await sb.rpc("create_trial_company", {
      p_name: company_name, p_type: company_type, p_cr_number: cr_number, p_cr_date: cr_date,
      p_resp_person: responsible_person, p_resp_phone: responsible_phone, p_resp_email: responsible_email,
      p_llc_single_manager: llc_single_manager, p_llc_single_owner: llc_single_owner
    });
    if(trErr || !tr){ alert("تعذّر إنشاء الشركة: " + (trErr ? trErr.message : "لم يُرجَع نتيجة")); release(); return; }
    if(tr.status === "phone_unverified"){ alert("يجب توثيق رقم الجوال أولًا قبل إنشاء شركة."); release(); return; }
    if(tr.status === "limit"){ alert("وصلت للحد الأقصى من الشركات التجريبية. تواصل معنا لإضافة المزيد."); release(); return; }
    if(tr.status === "exists"){ (window.__nativeAlert||alert)("شركة بهذا الاسم مسجَّلة بالفعل بحسابك — سنفتحها لك الآن."); location.reload(); return; }
    if(tr.status !== "ok"){ alert("تعذّر إنشاء الشركة."); release(); return; }
    if(tdw.symbol){ try { await sb.rpc("set_company_tadawul", { p_name: company_name, p_symbol: tdw.symbol }); } catch(e){} }

    {
      const subject = `تجربة جديدة بدأت: ${company_name}`;
      const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B">تجربة تلقائية بدأت الآن</h2>
        <p><b>الشركة:</b> ${company_name} (${company_type}) — رقم السجل: ${cr_number||"—"}${tdw.symbol ? " — رمز تداول: " + tdw.symbol : ""}</p>
        <p style="color:#B8860B"><b>نوع الكيان غير موثّق:</b> راجعه من لوحة المنصة (السجل التجاري، وللمدرجة قائمة تداول).</p>
        <p><b>المسؤول:</b> ${(currentUserProfile && currentUserProfile.full_name)||sessionEmail} (${sessionEmail})</p>
        <p>لا يوجد إجراء مطلوب منك — هذا إشعار فقط. التجربة مفعَّلة تلقائيًا لمدة 14 يومًا.</p>
      </div>`;
      await Promise.race([ notifyPlatformAdmins(subject, html), new Promise(r => setTimeout(r, 6000)) ]);
    }

    (window.__nativeAlert||alert)("تم إنشاء شركتك وتفعيل تجربتك 🎉 — راح تدخل منصتك الآن مباشرة.");
    location.reload();
  } catch(e){
    alert("حدث خطأ غير متوقع: " + (e && e.message ? e.message : e));
    release();
  }
}


let companyRequestLock = false;
async function submitCompanyRequest(){
  if(companyRequestLock) return;
  companyRequestLock = true;
  try { await submitCompanyRequestImpl(); } finally { companyRequestLock = false; }
}

/* رقم السجل التجاري / الرقم الوطني الموحد: 10 أرقام، يتحقق منه فريق المنصة يدويًا مع وزارة التجارة */
function normCrNumber(v){ return String(v||"").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^0-9]/g,""); }
function validCrNumber(v){ return /^\d{10}$/.test(normCrNumber(v)); }
const CR_REQUIRED_MSG = "رقم السجل التجاري أو الرقم الموحد إلزامي (10 أرقام) — لازم لتوثيق شركتك داخل المنصة.";

async function submitCompanyRequestImpl(){
  const company_name = document.getElementById("cr-name").value.trim();
  if(!company_name){ alert("الرجاء إدخال اسم الشركة"); return; }
  const company_type = document.getElementById("cr-type").value;
  const cr_number = normCrNumber(document.getElementById("cr-cr-number").value);
  if(!validCrNumber(cr_number)){ alert(CR_REQUIRED_MSG); return; }
  const tdw = readCrTadawul(company_type); if(!tdw.ok) return;
  const cr_date = document.getElementById("cr-cr-date").value || null;
  const responsible_person = document.getElementById("cr-resp-name").value.trim();
  const responsible_phone = document.getElementById("cr-resp-phone").value.trim();
  const responsible_email = document.getElementById("cr-resp-email").value.trim();

  const { data: userData } = await sb.auth.getUser();
  const sessionEmail = userData && userData.user ? userData.user.email : currentUserProfile.email;

  const { data: dupReq } = await sb.from("company_requests").select("id").eq("requested_by_email", sessionEmail).eq("company_name", company_name).eq("status", "قيد المراجعة").limit(1);
  if(dupReq && dupReq.length){ alert("أرسلتَ طلباً بهذا الاسم من قبل وهو قيد المراجعة — لا حاجة لإرساله مرة ثانية."); return; }

  const { error } = await sb.from("company_requests").insert([{
    requested_by_email: sessionEmail, requested_by_name: currentUserProfile.full_name,
    company_name, company_type, cr_number, cr_date, responsible_person, responsible_phone, responsible_email,
    tadawul_symbol: tdw.symbol,
    status: "قيد المراجعة"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  // Notify every platform admin by email — this is a cross-tenant event, not scoped to any
  // single company's team, so it can't reuse the normal per-company bulk-email helper.
  {
    const subject = `طلب إدراج شركة جديد: ${company_name}`;
    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B"><span class="ico-i ico-building"></span>طلب إدراج شركة جديد بمنصة حوكم</h2>
        <p><b>اسم الشركة:</b> ${company_name}</p>
        <p><b>نوع الشركة:</b> ${company_type||"—"}${tdw.symbol ? " — رمز تداول: " + tdw.symbol : ""}</p>
        <p><b>مقدَّم من:</b> ${orgEsc(currentUserProfile.full_name||currentUserProfile.email)} (${orgEsc(currentUserProfile.email)})</p>
        <p>الرجاء الدخول للمنصة ومراجعة الطلب من صفحة "طلبات إدراج الشركات".</p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await notifyPlatformAdmins(subject, html);
  }

  loadCompanyRequestPage();
}
