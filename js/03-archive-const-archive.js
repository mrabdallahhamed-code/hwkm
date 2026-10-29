/* ══════════ ARCHIVE ══════════ */
const ARCHIVE_CATEGORY_ICONS = {
  "محاضر": "📋", "تدقيق": "🔍", "مالية": "💰", "حوكمة": "🏛️",
  "جمعيات": "🤝", "سياسات": "📜", "أخرى": "📁"
};
const ARCHIVE_CATEGORY_COLORS = {
  "محاضر": "var(--primary)", "تدقيق": "#8B2FC9", "مالية": "var(--green)", "حوكمة": "var(--gold)",
  "جمعيات": "var(--teal)", "سياسات": "#C55A11", "أخرى": "var(--gray3)"
};
let archiveDocsCache = [];
let archiveActiveCategory = "الكل";

async function loadArchive(){
  const { data, error } = await sb.from("archive_documents").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){
    const grid = document.getElementById("archiveDocsGrid");
    if(grid) grid.innerHTML = `<div style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</div>`;
    return;
  }
  archiveDocsCache = data || [];
  renderArchivePills();
  renderArchiveDocs();
}

function renderArchivePills(){
  const box = document.getElementById("archiveCategoryPills");
  if(!box) return;
  const cats = ["الكل", ...Object.keys(ARCHIVE_CATEGORY_ICONS)];
  box.innerHTML = cats.map(c => {
    const active = c === archiveActiveCategory;
    const count = c === "الكل" ? archiveDocsCache.length : archiveDocsCache.filter(d => (d.category||"أخرى")===c).length;
    const icon = c === "الكل" ? "📚" : ARCHIVE_CATEGORY_ICONS[c];
    return `<button onclick="setArchiveCategory('${c}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'};transition:.15s">${icon} ${c} <span style="opacity:.75">(${count})</span></button>`;
  }).join("");
}

function setArchiveCategory(cat){
  archiveActiveCategory = cat;
  renderArchivePills();
  renderArchiveDocs();
}

function renderArchiveDocs(){
  const grid = document.getElementById("archiveDocsGrid");
  if(!grid) return;
  const searchEl = document.getElementById("archiveSearchInput");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";

  let docs = archiveDocsCache;
  if(archiveActiveCategory !== "الكل") docs = docs.filter(d => (d.category||"أخرى") === archiveActiveCategory);
  if(search) docs = docs.filter(d => (d.document_name||"").toLowerCase().includes(search));

  if(docs.length === 0){
    grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:30px">لا توجد وثائق مطابقة. اضغط "+ رفع وثيقة" للبدء.</div>';
    return;
  }

  // Group by category for a tidy library layout, unless a specific category is already selected
  const groups = {};
  docs.forEach(d => {
    const cat = d.category || "أخرى";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(d);
  });

  let html = "";
  Object.keys(groups).forEach(cat => {
    const icon = ARCHIVE_CATEGORY_ICONS[cat] || "📁";
    const color = ARCHIVE_CATEGORY_COLORS[cat] || "var(--gray3)";
    html += `<div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px">
      <span style="font-size:15px">${icon}</span>
      <span style="font-weight:900;font-size:13.5px;color:${color}">${cat}</span>
      <span style="flex:1;height:1px;background:var(--gray1)"></span>
      <span style="font-size:11px;color:var(--gray3)">${groups[cat].length} وثيقة</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">`;
    groups[cat].forEach(d => {
      html += `<div class="card pcard" style="margin-bottom:0">
        <div class="card-body" style="padding:14px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:800;color:var(--dark);word-break:break-word">${orgEsc(d.document_name||"")}</div>
              <div style="font-size:12px;color:var(--gray3);margin-top:3px"><span class="ico-i ico-calendar"></span>${d.upload_date||"—"}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px">
            ${d.file_url ? `<a class="btn-xs primary" style="flex:1;text-align:center" href="${d.file_url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>` : '<span style="flex:1;text-align:center;font-size:10.5px;color:var(--gray3)">لا يوجد ملف</span>'}
            <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer" onclick="deleteArchiveDoc(${d.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  grid.innerHTML = html;
}

/* Files created by the platform itself (minutes, finalized policies, etc.) file themselves
   into the Archive automatically the moment they're generated/finalized — no separate manual
   upload step needed. Silently does nothing if the same file is somehow archived twice. */
async function autoArchiveDocument(document_name, category, file_url){
  if(!file_url || !currentCompanyId) return;
  const { data: dup } = await sb.from("archive_documents").select("id")
    .eq("company_id", currentCompanyId).eq("file_url", file_url).maybeSingle();
  if(dup) return;
  await sb.from("archive_documents").insert([{
    document_name, category, upload_date: new Date().toISOString().slice(0,10), file_url, company_id: currentCompanyId
  }]);
  if(document.getElementById("p-archive")?.classList.contains("active")) loadArchive();
}

async function saveArchiveDoc(){
  const document_name = document.getElementById("mar-name").value.trim();
  if(!document_name){ alert("الرجاء إدخال اسم الوثيقة"); return; }
  const category = document.getElementById("mar-category").value;
  const upload_date = document.getElementById("mar-date").value || new Date().toISOString().slice(0,10);
  const fileInput = document.getElementById("mar-file");
  const file_url = await uploadFile(fileInput, "archive");
  const { error } = await sb.from("archive_documents").insert([{ document_name, category, upload_date, file_url, company_id: currentCompanyId }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mar-name").value = "";
  document.getElementById("mar-date").value = "";
  fileInput.value = "";
  closeM("m-archive");
  loadArchive();
}

async function deleteArchiveDoc(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه الوثيقة؟")) return;
  const { error } = await sb.from("archive_documents").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadArchive();
}

function toggleShareNominalField(){
  const type = document.getElementById("mco-type").value;
  const box = document.getElementById("mco-nominal-field");
  if(box) box.style.display = (type==="مساهمة مدرجة" || type==="مساهمة غير مدرجة") ? "block" : "none";
  const llcBox = document.getElementById("mco-llc-fields");
  if(llcBox) llcBox.style.display = (type === "ذات مسؤولية محدودة") ? "block" : "none";
}

function resetCompanyForm(){
  document.getElementById("mco-id").value = "";
  document.getElementById("mco-name").value = "";
  document.getElementById("mco-type").value = "مساهمة غير مدرجة";
  document.getElementById("mco-cr-number").value = "";
  document.getElementById("mco-cr-date").value = "";
  document.getElementById("mco-activity").value = "";
  document.getElementById("mco-size").value = "صغيرة";
  document.getElementById("mco-resp-name").value = "";
  document.getElementById("mco-resp-phone").value = "";
  document.getElementById("mco-resp-email").value = "";
  document.getElementById("mco-capital").value = "";
  document.getElementById("mco-shares").value = "";
  document.getElementById("mco-nominal").value = "";
  document.getElementById("mco-llc-single-manager").checked = false;
  document.getElementById("mco-llc-single-owner").checked = false;
  document.getElementById("mco-start-trial").checked = true;
  document.getElementById("mco-trial-row").style.display = "block";
  document.getElementById("mco-delete-btn").style.display = "none";
  toggleShareNominalField();
}

function openNewCompanyModal(){
  resetCompanyForm();
  document.getElementById("mco-title-h").textContent = "🏢 إضافة شركة جديدة";
  openM("m-company");
}

async function openEditCompanyModal(){
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }
  const { data: c, error } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  if(error || !c){ alert("تعذّر تحميل بيانات الشركة"); return; }
  document.getElementById("mco-id").value = c.id;
  document.getElementById("mco-title-h").textContent = "✏️ تعديل بيانات الشركة";
  document.getElementById("mco-name").value = c.name || "";
  document.getElementById("mco-type").value = c.company_type || "مساهمة غير مدرجة";
  document.getElementById("mco-cr-number").value = c.cr_number || "";
  document.getElementById("mco-cr-date").value = c.cr_date || "";
  document.getElementById("mco-activity").value = c.business_activity || "";
  document.getElementById("mco-size").value = c.company_size || "صغيرة";
  document.getElementById("mco-resp-name").value = c.responsible_person || "";
  document.getElementById("mco-resp-phone").value = c.responsible_phone || "";
  document.getElementById("mco-resp-email").value = c.responsible_email || "";
  document.getElementById("mco-capital").value = c.total_capital ?? "";
  document.getElementById("mco-shares").value = c.total_shares ?? "";
  document.getElementById("mco-nominal").value = c.share_nominal_value ?? "";
  document.getElementById("mco-seal-position").value = c.seal_position || "أسفل يمين الصفحة";
  document.getElementById("mco-llc-single-manager").checked = !!c.llc_single_manager;
  document.getElementById("mco-llc-single-owner").checked = !!c.llc_single_owner;
  document.getElementById("mco-trial-row").style.display = "none";
  document.getElementById("mco-delete-btn").style.display = (currentUserProfile && currentUserProfile.is_platform_admin === true) ? "inline-flex" : "none";
  document.getElementById("mco-letterhead-current").innerHTML = c.letterhead_url ? `✅ مرفوعة حاليًا — <a href="${c.letterhead_url}" target="_blank">عرض</a> (ارفع ملف جديد لاستبدالها)` : "لم تُرفع بعد";
  document.getElementById("mco-seal-current").innerHTML = c.seal_url ? `✅ مرفوع حاليًا — <a href="${c.seal_url}" target="_blank">عرض</a> (ارفع ملف جديد لاستبداله)` : "لم يُرفع بعد";
  toggleShareNominalField();
  openM("m-company");
}

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
    <div class="fg"><label>اسم الشركة</label><input class="fi" id="cr-name" placeholder="مثال: شركة النخبة القابضة"/></div>
    <div class="fg"><label>نوع الشركة</label>
      <select class="fs" id="cr-type" onchange="toggleCrLLCFields()">
        <option>مساهمة مدرجة</option><option>مساهمة غير مدرجة</option>
        <option>ذات مسؤولية محدودة</option><option>مؤسسة فردية</option>
      </select>
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
  `;
}

/* Self-serve trial — creates the company and grants full access immediately, with no admin
   in the loop. Manual review stays meaningful at the point real money changes hands (paid
   conversion); gatekeeping the free trial itself was pure friction with no matching benefit.
   A company_requests row is still logged (status "تجربة تلقائية") purely for visibility — the
   platform-owner dashboard's trial list and conversion-rate stat already read from real
   companies.trial_ends_at, so nothing else downstream needs to change to pick this up. */
function toggleCrLLCFields(){
  const box = document.getElementById("cr-llc-fields");
  if(box) box.style.display = document.getElementById("cr-type").value === "ذات مسؤولية محدودة" ? "block" : "none";
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

    {
      const subject = `تجربة جديدة بدأت: ${company_name}`;
      const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B">تجربة تلقائية بدأت الآن</h2>
        <p><b>الشركة:</b> ${company_name} (${company_type}) — رقم السجل: ${cr_number||"—"}</p>
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
        <p><b>نوع الشركة:</b> ${company_type||"—"}</p>
        <p><b>مقدَّم من:</b> ${orgEsc(currentUserProfile.full_name||currentUserProfile.email)} (${orgEsc(currentUserProfile.email)})</p>
        <p>الرجاء الدخول للمنصة ومراجعة الطلب من صفحة "طلبات إدراج الشركات".</p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await notifyPlatformAdmins(subject, html);
  }

  loadCompanyRequestPage();
}

/* ══════════ PLATFORM OVERVIEW (owner-only, aggregated across every company) ══════════ */
async function loadPlatformDashboard(){
  const grid = document.getElementById("platformDashGrid");
  const modulesGrid = document.getElementById("platformModulesGrid");
  const trialsList = document.getElementById("platformTrialsList");
  if(!grid) return;

  const { data: companies, error } = await sb.from("companies").select("*");
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  const all = companies || [];
  const upd = document.getElementById("pdUpdated"); if(upd) upd.textContent = "آخر تحديث: " + new Date().toLocaleTimeString("ar-SA-u-ca-gregory",{hour:"2-digit",minute:"2-digit"});

  const countByType = { "مساهمة": 0, "ذات مسؤولية محدودة": 0, "مؤسسة فردية": 0 };
  all.forEach(c => { const k = (c.company_type||"").indexOf("مساهمة") === 0 ? "مساهمة" : c.company_type; if(countByType[k] !== undefined) countByType[k]++; });
  const stat = (icon, label, val, cls) => `<div class="pd-stat ${cls||""}"><span class="pd-stat-ico">${icon}</span><div><div class="pd-stat-val">${val}</div><div class="pd-stat-lbl">${label}</div></div></div>`;
  const total = all.length || 1;
  const segs = [["مساهمة","شركات مساهمة","#2F6FD0"],["ذات مسؤولية محدودة","ذات مسؤولية محدودة","#16A085"],["مؤسسة فردية","مؤسسات فردية","#E0752D"]];
  grid.innerHTML = `<div class="pd-dist-bar">${segs.map(([k,,col]) => countByType[k] ? `<i style="width:${countByType[k]/total*100}%;background:${col}"></i>` : "").join("")}</div>
    <div class="pd-dist-legend">${segs.map(([k,l,col]) => `<div class="pd-dist-item"><span class="pd-dot" style="background:${col}"></span><span class="pd-dist-l">${l}</span><b>${countByType[k]}</b></div>`).join("")}</div>`;
  const active = all.filter(c => c.subscription_ends_at && new Date(c.subscription_ends_at) > new Date());
  const monthly = active.reduce((t,c) => t + (Number(c.subscription_price)||0) / (c.billing_cycle === "monthly" ? 1 : 12), 0);
  const nf = n => Math.round(n).toLocaleString("en-US");
  const rg = document.getElementById("pcRevenueGrid"); if(rg) rg.innerHTML = stat("💰","إيراد شهري متوقع (ر.س)", nf(monthly)) + stat("📅","إيراد سنوي متوقع (ر.س)", nf(monthly*12)) + stat("✅","اشتراكات فعّالة", active.length);
  const auditCount = all.filter(c => c.module_internal_audit).length;
  const riskCount = all.filter(c => c.module_risk_management).length;
  const mod = (ico, label, n, col) => `<div class="pd-mod"><div class="pd-mod-top"><span class="pd-mod-ico" style="background:${col}1A">${ico}</span><span class="pd-mod-l">${label}</span><b>${n}<small> / ${all.length}</small></b></div><div class="pd-mod-bar"><i style="width:${all.length ? n/all.length*100 : 0}%;background:${col}"></i></div></div>`;
  modulesGrid.innerHTML = mod("🏛️","الحوكمة والاجتماعات", all.length, "#2F6FD0") + mod("🔍","المراجعة الداخلية", auditCount, "#16A085") + mod("⚠️","إدارة المخاطر", riskCount, "#E0752D");
  const hero = document.getElementById("pdHeroStats");

  const now = new Date();
  const inTrial = all.filter(c => c.trial_ends_at && new Date(c.trial_ends_at) > now)
    .map(c => ({ c, days: Math.max(0, Math.ceil((new Date(c.trial_ends_at) - now) / 86400000)) })).sort((x,y) => x.days - y.days);
  if(hero){
    const h = (n,l,c) => `<div class="pd-hero-k" style="--k:${c}"><b>${n}</b><span>${l}</span></div>`;
    hero.innerHTML = h(all.length,"شركة على المنصة","#6FB1FF") + h(active.length,"اشتراك فعّال","#5FE3B5") + h(inTrial.length,"في فترة تجربة","#FFC46B") + h(nf(monthly),"إيراد شهري متوقع (ر.س)","#C3A6FF");
  }
  const tc = document.getElementById("pdTrialCount"); if(tc) tc.textContent = inTrial.length || "";
  if(!inTrial.length){
    trialsList.innerHTML = '<div class="pd-empty">لا توجد شركات بفترة تجربة نشطة.</div>';
  } else {
    trialsList.innerHTML = inTrial.map(({c, days}) => {
      const tone = days <= 3 ? "red" : days <= 7 ? "amber" : "green";
      const pct = Math.max(4, Math.min(100, Math.round(days / 14 * 100)));
      return `<div class="pd-trial"><div class="pd-trial-main"><div class="pd-trial-name">${orgEsc(c.name)}</div>
        <div class="pd-trial-meta">${orgEsc(c.company_type||"—")}${c.responsible_person ? " · " + orgEsc(c.responsible_person) : ""}${c.responsible_phone ? ` · <span style="direction:ltr;display:inline-block">${orgEsc(c.responsible_phone)}</span>` : ""}${c.cr_number ? "" : ' · <span class="pd-chip red">بلا رقم سجل</span>'}</div></div>
        <div class="pd-trial-days ${tone}"><b>${days}</b> يوم<div class="pd-bar"><i style="width:${pct}%"></i></div></div></div>`;
    }).join("");
  }

  // مركز عمل المالك: ما ينتظر قراراً أو تصرفاً منك
  const actions = document.getElementById("pdActions");
  if(actions){
    let pendingAssign = 0, pendingApprove = 0;
    try{
      const [rr, ar] = await Promise.all([
        sb.from("risk_requests").select("status,assigned_consultant_email,pending_final_approval"),
        sb.from("audit_requests").select("status,pending_final_approval")
      ]);
      (rr.data||[]).forEach(x => { if(x.pending_final_approval) pendingApprove++; if(x.status === "تم الاستلام" && !x.assigned_consultant_email) pendingAssign++; });
      (ar.data||[]).forEach(x => { if(x.pending_final_approval) pendingApprove++; if(x.status === "تم الاستلام") pendingAssign++; });
    }catch(e){}
    const soon = inTrial.filter(x => x.days <= 7).length;
    const subSoon = all.filter(c => !c.trial_ends_at && c.subscription_ends_at && Math.ceil((new Date(c.subscription_ends_at) - now)/86400000) <= 30).length;
    const unverified = all.filter(c => c.entity_verification !== "verified").length;
    const noCr = all.filter(c => !String(c.cr_number||"").trim()).length;
    const COLS = {"📥": "#D64545", "📝": "#E0752D", "⏳": "#D4A017", "🔔": "#7C5CC4", "🛡️": "#2D7A6B", "🪪": "#2F6FD0"};
    const act = (n, label, page, tone, ico) => `<div class="pd-act ${n ? tone : "ok"}" style="--c:${n ? COLS[ico] : "#27AE60"}" onclick="${page ? `go('${page}',null)` : ""}"><span class="pd-act-ico">${n ? ico : "✓"}</span><div class="pd-act-n">${n}</div><div class="pd-act-l">${label}</div></div>`;
    actions.innerHTML = [
      act(pendingAssign, "طلبات جديدة بانتظار تكليف", "adminrequests", "red", "📥"),
      act(pendingApprove, "تقارير بانتظار اعتمادك", "adminrequests", "red", "📝"),
      act(soon, "تجارب تنتهي خلال 7 أيام", "", "amber", "⏳"),
      act(subSoon, "اشتراكات تنتهي خلال 30 يوم", "", "amber", "🔔"),
      act(unverified, "كيانات غير موثّقة", "", "amber", "🛡️"),
      act(noCr, "شركات بلا رقم سجل", "", "amber", "🪪")
    ].join("");
  }

  renderEntityVerificationTable(all);

  const converted = all.filter(c => c.converted_to_paid_at);
  const avgEl = document.getElementById("platformAvgConversionDays");
  const subEl = document.getElementById("platformConversionSubtext");
  if(converted.length === 0){
    avgEl.textContent = "—";
    subEl.textContent = "لا توجد شركات تحوّلت لاشتراك مدفوع بعد.";
  } else {
    const totalDays = converted.reduce((sum,c) => sum + Math.round((new Date(c.converted_to_paid_at) - new Date(c.created_at))/86400000), 0);
    avgEl.textContent = Math.round(totalDays/converted.length) + " يوم";
    subEl.textContent = `بناءً على ${converted.length} شركة تحوّلت لاشتراك مدفوع`;
  }
}

/* توثيق نوع الكيان: يراجعه إدارة حوكم يدويًا (السجل التجاري + قائمة الشركات المدرجة في تداول).
   الخادم يمنع أي مستخدم غير مالك/فريق المنصة من تغيير الحالة، ويعيدها لـ"غير موثّق" تلقائيًا
   إذا تغيّر نوع الشركة أو اسمها أو رقم سجلها. */
function renderEntityVerificationTable(all){
  const tb = document.getElementById("platformEntityTbody");
  if(!tb) return;
  const badge = (st) => st === "verified" ? '<span class="pd-chip green">موثّق ✓</span>'
    : st === "rejected" ? '<span class="pd-chip red">مرفوض</span>'
    : '<span class="pd-chip amber">غير موثّق</span>';
  const rank = c => (c.entity_verification === "verified" ? 2 : 0) + ((c.company_type||"").indexOf("مدرجة") > 0 && c.company_type.indexOf("غير") < 0 ? 0 : 1);
  const rows = (all||[]).slice().sort((a,b) => rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at));
  if(!rows.length){ tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد شركات.</td></tr>'; return; }
  tb.innerHTML = rows.map(c => `<tr>
    <td>${orgEsc(c.name)}</td>
    <td>${orgEsc(c.company_type||"—")}</td>
    <td>${(() => { const n = String(c.cr_number||"").trim(); if(!n) return '<span class="pd-chip red">بلا رقم</span>'; return /^\d{10}$/.test(n) ? `<span style="direction:ltr;display:inline-block">${orgEsc(n)}</span>` : `<span style="direction:ltr;display:inline-block">${orgEsc(n)}</span> <span class="pd-chip red">غير صالح</span>`; })()}</td>
    <td>${orgEsc(c.responsible_person||"—")}<div style="font-size:10.5px;color:var(--gray3);direction:ltr;text-align:right">${orgEsc(c.responsible_phone||"")}${c.responsible_email ? "<br>" + orgEsc(c.responsible_email) : ""}</div></td>
    <td>${badge(c.entity_verification)}</td>
    <td style="white-space:nowrap">
      ${c.entity_verification === "verified"
        ? `<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="setEntityVerification(${c.id},'unverified')">إلغاء التوثيق</button>`
        : `<button class="btn btn-primary" style="font-size:11px;padding:4px 10px" onclick="setEntityVerification(${c.id},'verified')">توثيق</button>
           <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="setEntityVerification(${c.id},'rejected')">رفض</button>`}
    </td></tr>`).join("");
}

async function setEntityVerification(companyId, status){
  const labels = { verified:"توثيق", rejected:"رفض", unverified:"إلغاء توثيق" };
  if(!await uiConfirm(`تأكيد ${labels[status]||"تغيير"} نوع الكيان لهذه الشركة؟ تأكد أولًا من السجل التجاري، وللمدرجة من قائمة الشركات المدرجة.`)) return;
  const me = (currentUserProfile && currentUserProfile.email) || "";
  const patch = status === "verified"
    ? { entity_verification:"verified", entity_verified_at:new Date().toISOString(), entity_verified_by:me }
    : { entity_verification:status, entity_verified_at:null, entity_verified_by:null };
  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  loadPlatformDashboard();
}

async function assignPlatformTeamModule(){
  const email = document.getElementById("pts-email").value.trim();
  if(!email){ alert("الرجاء إدخال البريد الإلكتروني"); return; }
  const platform_team_module = document.getElementById("pts-module").value;
  const { data: existing, error: findErr } = await sb.from("user_profiles").select("*").ilike("email", likeEsc(email)).maybeSingle();
  if(findErr || !existing){ alert("لا يوجد حساب مسجّل بهذا البريد الإلكتروني — لازم يسجّل حساب بالمنصة أولًا."); return; }
  const { error } = await sb.from("user_profiles").update({ platform_team_module }).ilike("email", likeEsc(email));
  if(error){ alert("تعذّر التعيين: " + error.message); return; }
  alert(`تم تعيين "${existing.full_name||email}" بتخصص "${platform_team_module}" ✅ — عليه تسجيل خروج ثم دخول من جديد.`);
  document.getElementById("pts-email").value = "";
  loadPlatformTeam();
}

async function removePlatformTeamModule(email, name){
  if(!await uiConfirm(`إزالة تخصص "${name}" من فريق المنصة؟ يرجع حساب عادي بدون صلاحيات خاصة.`)) return;
  const { error } = await sb.from("user_profiles").update({ platform_team_module: null }).ilike("email", likeEsc(email));
  if(error){ alert("تعذّر الإزالة: " + error.message); return; }
  loadPlatformTeam();
}

async function loadPlatformTeam(){
  const tbody = document.getElementById("platformTeamTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("user_profiles").select("*").not("platform_team_module","is",null);
  if(error){ tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!data || data.length===0){ tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا يوجد فريق منصة معيّن بعد.</td></tr>'; return; }
  tbody.innerHTML = data.map(u => `<tr>
    <td>${orgEsc(u.full_name||"—")}</td><td style="font-size:11px">${orgEsc(u.email)}</td>
    <td><span style="background:#EAF0F8;color:var(--primary);font-weight:700;font-size:11px;padding:2px 8px;border-radius:6px">${u.platform_team_module}</span></td>
    <td>
      <button class="btn-xs" style="background:#EAF0F8;color:var(--primary);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer;margin-left:4px" onclick="openUserPermissionOverridesModal('${orgEsc(u.email)}','${orgEsc((u.full_name||u.email).replace(/'/g,""))}', null)"><span class="ico-i ico-wrench"></span>صلاحيات</button>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="removePlatformTeamModule('${orgEsc(u.email)}','${orgEsc((u.full_name||u.email).replace(/'/g,""))}')">إزالة</button>
    </td>
  </tr>`).join("");
}

/* ══════════ PLATFORM-OWNER BULK LINK (ربط إيميلات بشركة مباشرة) ══════════
   Unlike the company join-code above (a request a company's own admin must approve), this is
   the platform owner acting directly — no approval step, because the platform owner already
   has standing access to every company. Emails that haven't signed up yet still get a
   membership row now; the matching signup-time check (see handleAuth) picks it up the moment
   that account is actually created, instead of leaving them company-less. */
async function loadPlatformBulkLinkCompanies(){
  const sel = document.getElementById("pbl-company");
  if(!sel) return;
  const { data } = await sb.from("companies").select("id,name").order("name",{ascending:true});
  sel.innerHTML = (data||[]).map(c => `<option value="${c.id}">${orgEsc(c.name)}</option>`).join("");
}

async function platformBulkLink(){
  const companyId = Number(document.getElementById("pbl-company").value);
  const role = document.getElementById("pbl-role").value;
  const emails = document.getElementById("pbl-emails").value.split("\\n").map(e => e.trim()).filter(Boolean);
  const resultBox = document.getElementById("pbl-result");
  if(!companyId){ alert("اختر الشركة"); return; }
  if(!emails.length){ alert("أدخل إيميلاً واحداً على الأقل"); return; }

  const results = [];
  for(const email of emails){
    const { data: existingMem } = await sb.from("user_company_memberships").select("id").eq("email", email).eq("company_id", companyId).maybeSingle();
    if(existingMem){ results.push(`${email} — مرتبط أصلاً بهذي الشركة`); continue; }
    const { error } = await sb.from("user_company_memberships").insert([{ email, company_id: companyId, role }]);
    if(error){ results.push(`${email} — تعذّر: ${error.message}`); continue; }
    const { data: prof } = await sb.from("user_profiles").select("company_id").eq("email", email).maybeSingle();
    if(prof && !prof.company_id){ await sb.from("user_profiles").update({ company_id: companyId, role }).eq("email", email); results.push(`${email} — ربط فوري ✅ (حساب موجود)`); }
    else if(!prof){ results.push(`${email} — جاهز، سيُربط تلقائيًا أول ما يسجّل حساباً بهذا الإيميل`); }
    else { results.push(`${email} — أُضيف بدوره هنا، بقي حسابه الأساسي كما هو بشركة أخرى`); }
  }
  resultBox.textContent = results.join("\\n");
  document.getElementById("pbl-emails").value = "";
}

async function loadPlatformUsers(){
  const tbody = document.getElementById("platformUsersTbody");
  if(!tbody) return;
  loadPlatformTeam();
  loadPlatformBulkLinkCompanies();
  const [{ data: memberships, error }, { data: companies }, { data: profiles }] = await Promise.all([
    sb.from("user_company_memberships").select("*").order("company_id",{ascending:true}),
    sb.from("companies").select("id,name"),
    sb.from("user_profiles").select("email,full_name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!memberships || memberships.length===0){ tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا يوجد أعضاء بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  const nameByEmail = {}; (profiles||[]).forEach(p=>{ nameByEmail[p.email]=p.full_name; });

  platformMembershipsCache = memberships;
  tbody.innerHTML = memberships.map(m => `<tr id="pm-row-${m.id}">
    <td>${orgEsc(nameByEmail[m.email]||"—")}</td>
    <td style="font-size:11px">${orgEsc(m.email)}</td>
    <td>${companyNameById[m.company_id]||"—"}</td>
    <td>
      <span id="pm-role-view-${m.id}">${ROLE_STYLE[m.role]?.icon||""} ${orgEsc(m.role||"—")}</span>
      <span id="pm-role-edit-${m.id}" style="display:none">
        <select class="fs" id="pm-role-sel-${m.id}" style="margin:0;font-size:11px;padding:4px 6px;width:160px">
          <option>رئيس مجلس</option><option>سكرتير المجلس</option>
          <option>رئيس لجنة الترشيحات</option><option>عضو لجنة الترشيحات</option>
          <option>رئيس لجنة مراجعة</option><option>عضو لجنة مراجعة</option>
          <option>عضو مجلس</option><option>عضو مجلس وعضو مساهم</option><option>مساهم</option><option>موظف</option><option>مدير النظام</option><option>مالك</option><option>ممثل المالك</option>
        </select>
        <button class="btn-xs primary" style="padding:4px 8px" onclick="savePlatformMembershipRole(${m.id})"><span class="ico-i ico-check"></span></button>
        <button class="btn-xs" style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer" onclick="cancelPlatformMembershipEdit(${m.id})">إلغاء</button>
      </span>
      <button class="btn-xs" id="pm-role-btn-${m.id}" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:11px;padding:2px 6px" onclick="editPlatformMembershipRole(${m.id})"><span class="ico-i ico-edit"></span>تعديل</button>
    </td>
  </tr>`).join("");
}

let platformMembershipsCache = [];
function editPlatformMembershipRole(id){
  const m = platformMembershipsCache.find(x => x.id === id);
  if(!m) return;
  document.getElementById("pm-role-view-"+id).style.display = "none";
  document.getElementById("pm-role-btn-"+id).style.display = "none";
  document.getElementById("pm-role-edit-"+id).style.display = "inline-flex";
  document.getElementById("pm-role-sel-"+id).value = m.role || "عضو مجلس";
}
function cancelPlatformMembershipEdit(id){
  document.getElementById("pm-role-view-"+id).style.display = "inline";
  document.getElementById("pm-role-btn-"+id).style.display = "inline-block";
  document.getElementById("pm-role-edit-"+id).style.display = "none";
}
async function savePlatformMembershipRole(id){
  const newRole = document.getElementById("pm-role-sel-"+id).value;
  const { error } = await sb.from("user_company_memberships").update({ role: newRole }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  const m = platformMembershipsCache.find(x => x.id === id);
  if(m){
    m.role = newRole;
    // Keep the profile's primary role in sync only if this was their primary company.
    const { data: prof } = await sb.from("user_profiles").select("company_id").eq("email", m.email).maybeSingle();
    if(prof && prof.company_id === m.company_id){ await sb.from("user_profiles").update({ role: newRole }).eq("email", m.email); }
  }
  loadPlatformUsers();
}

async function loadPlatformActivity(){
  const tbody = document.getElementById("platformActivityTbody");
  if(!tbody) return;
  const [{ data: logs, error }, { data: companies }] = await Promise.all([
    sb.from("activity_log").select("*").order("created_at",{ascending:false}).limit(300),
    sb.from("companies").select("id,name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!logs || logs.length===0){ tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا يوجد نشاط مسجَّل بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  tbody.innerHTML = logs.map(l => `<tr>
    <td>${companyNameById[l.company_id]||"—"}</td>
    <td style="font-size:11.5px">${l.action_type||""} — ${l.entity_type||""} — ${l.entity_label||""}</td>
    <td style="font-size:11px">${orgEsc(l.actor_name||l.actor_email||"—")}</td>
    <td style="font-size:12.5px;white-space:nowrap">${new Date(l.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td>
  </tr>`).join("");
}

/* ══════════ PLATFORM OWNER: trial start + permanent delete ══════════ */
let manageCompaniesCache = [];

function startTrialForCompany(id){
  const c = manageCompaniesCache.find(x => x.id === id);
  if(!c) return;
  document.getElementById("mtd-company-id").value = id;
  document.getElementById("mtd-title").textContent = "🎁 فترة تجريبية — " + c.name;
  document.getElementById("mtd-days").value = 14;
  openM("m-trial-days");
}
function setTrialQuick(n){ document.getElementById("mtd-days").value = n; }
async function saveTrialDays(){
  const id = Number(document.getElementById("mtd-company-id").value);
  const days = parseInt(document.getElementById("mtd-days").value, 10);
  if(!days || days < 1 || days > 365){ alert("اكتب عدد أيام بين 1 و 365"); return; }
  const trial_ends_at = new Date(Date.now() + days*86400000).toISOString();
  const cc = manageCompaniesCache.find(x => x.id === id);
  const wasPaid = !!(cc && (cc.converted_to_paid_at || cc.subscription_ends_at) && !(cc.trial_ends_at && new Date(cc.trial_ends_at) > new Date()));
  const patch = { trial_ends_at, module_internal_audit: true, module_risk_management: true };
  if(wasPaid){
    if(!await uiConfirm(`هذه الشركة مشتركة. سيتم إرجاعها لفترة تجريبية ${days} يوم، ويُمسح اشتراكها الحالي (الباقة والسعر والتواريخ). متابعة؟`)) return;
    Object.assign(patch, { converted_to_paid_at: null, pending_subscription_approval: false, subscription_package: null, subscription_price: null, billing_cycle: null, subscription_starts_at: null, subscription_ends_at: null });
  }
  const { error } = await sb.from("companies").update(patch).eq("id", id);
  if(error){ alert("تعذّر حفظ التجربة: " + error.message); return; }
  logActivity("تعديل", "اشتراك", String(id), "تحديد فترة تجريبية " + days + " يوم");
  closeM("m-trial-days");
  loadManageCompanies();
}

/* Deletion goes through one database function (atomic: all of the company's data goes, or nothing
   does). The confirmation is an in-page dialog rather than prompt(): prompt can be blocked by
   the browser and fails silently, and a typed name breaks on a duplicate that has the same name.
   The dialog shows what is inside the company so the empty duplicate can be told apart, shows the
   database's full error text if it refuses, and checks afterwards that the company is really gone. */
const DC_BTN_HTML = '<span class="ico-i ico-trash"></span>حذف نهائي';

function dcShowError(text){
  const box = document.getElementById("dc-error");
  box.style.display = "block";
  box.textContent = text;
}

function deleteFromCompanyModal(){
  const id = Number(document.getElementById("mco-id").value);
  if(!id) return;
  closeM("m-company");
  deleteCompanyPermanently(id);
}

async function deleteCompanyPermanently(id){
  if(!(currentUserProfile && currentUserProfile.is_platform_admin === true)){ alert("هذه العملية لإدارة حوكم فقط"); return; }
  let c = manageCompaniesCache.find(x => x.id === id);
  if(!c){ const r = await sb.from("companies").select("id,name,company_type,created_at").eq("id", id).maybeSingle(); c = r.data; }
  if(!c){ alert("تعذّر تحميل بيانات الشركة"); return; }
  document.getElementById("dc-id").value = id;
  document.getElementById("dc-name").textContent = c.name;
  document.getElementById("dc-meta").textContent = `رقم ${c.id} · ${c.company_type||"—"} · أُنشئت ${c.created_at ? new Date(c.created_at).toLocaleString("ar-SA-u-ca-gregory") : "—"}`;
  document.getElementById("dc-confirm").value = "";
  document.getElementById("dc-error").style.display = "none";
  const btn = document.getElementById("dc-btn"); btn.disabled = false; btn.innerHTML = DC_BTN_HTML;
  document.getElementById("dc-counts").textContent = "جارِ فحص محتوى الشركة...";
  openM("m-delete-company");
  const count = async (t) => {
    const r = await sb.from(t).select("id", { count: "exact", head: true }).eq("company_id", id);
    return (r.error || r.count == null) ? "؟" : r.count;
  };
  const [members, meetings, policies] = await Promise.all([count("user_company_memberships"), count("meetings"), count("policies")]);
  document.getElementById("dc-counts").textContent = `تحتوي حالياً على: ${members} عضو مرتبط، ${meetings} اجتماع، ${policies} سياسة. إن كانت كلها صفراً فالأرجح أنها نسخة زائدة فارغة.`;
}

async function confirmDeleteCompany(){
  const id = Number(document.getElementById("dc-id").value);
  if(document.getElementById("dc-confirm").value.trim() !== "حذف"){ dcShowError("اكتب كلمة «حذف» بالضبط بالمربع للتأكيد."); return; }
  const btn = document.getElementById("dc-btn");
  btn.disabled = true; btn.textContent = "جارِ الحذف...";
  document.getElementById("dc-error").style.display = "none";

  const { error } = await sb.rpc("delete_company_cascade", { target_id: id });
  btn.disabled = false; btn.innerHTML = DC_BTN_HTML;
  if(error){
    const missing = error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message||"");
    dcShowError(missing
      ? "دالة الحذف غير مُنشأة بقاعدة البيانات. شغّل ملف HWKM-delete-company-function.sql بلوحة Supabase ثم أعد المحاولة."
      : "رفضت قاعدة البيانات الحذف، ولم يُحذف شيء. أرسل هذا النص كما هو:\n\n" + [error.message, error.details, error.hint, error.code ? "الرمز: " + error.code : ""].filter(Boolean).join("\n"));
    return;
  }
  const { data: still } = await sb.from("companies").select("id").eq("id", id).maybeSingle();
  if(still){ dcShowError("اكتملت الدالة بلا خطأ لكن الشركة ما زالت موجودة. غالباً صلاحيات على الجدول، أرسل لي هذا الوصف."); return; }
  closeM("m-delete-company");
  alert("تم حذف الشركة وكل بياناتها ✅");
  await loadManageCompanies();
  if(typeof loadCompanies === "function") loadCompanies();
}


async function loadManageCompanies(){
  const box = document.getElementById("manageCompaniesList");
  if(!box) return;
  const { data, error } = await sb.from("companies").select("*").order("id",{ascending:false});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد شركات بعد.</div>'; return; }

  manageCompaniesCache = data;
  const nameCount = {};
  data.forEach(x => { const k = (x.name||"").trim().toLowerCase(); nameCount[k] = (nameCount[k]||0) + 1; });
  const isOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  box.innerHTML = data.map(c => {
    const inTrial = c.trial_ends_at && new Date(c.trial_ends_at) > new Date();
    const isDup = nameCount[(c.name||"").trim().toLowerCase()] > 1;
    const hasPlan = !!(c.converted_to_paid_at || c.module_internal_audit || c.module_risk_management);
    const daysLeft = inTrial ? Math.max(0, Math.ceil((new Date(c.trial_ends_at) - new Date()) / 86400000)) : 0;
    const modules = [
      c.module_internal_audit || inTrial ? "المراجعة الداخلية" : null,
      c.module_risk_management || inTrial ? "المخاطر" : null
    ].filter(Boolean);
    return `<div class="card" style="margin-bottom:12px"><div class="card-body">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(c.name)}</div>
          <div style="font-size:11px;color:var(--gray3);margin-top:2px">${c.company_type||"—"} · الوحدات: ${modules.length?modules.join("، "):"الأساسية فقط"}</div>
          <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">رقم ${c.id} · أُنشئت ${c.created_at ? new Date(c.created_at).toLocaleString("ar-SA-u-ca-gregory") : "—"}${isDup ? ' <span style="color:var(--red);font-weight:800">· اسم مكرَّر — راجعها واحذف الزائدة</span>' : ""}</div>
        </div>
        ${inTrial ? `<span class="badge pending"><span class="ico-i ico-package"></span>تجربة — متبقٍ ${daysLeft} يوم</span>` : c.trial_ends_at ? `<span class="badge urgent"><span class="ico-i ico-warning"></span>انتهت التجربة</span>` : hasPlan ? `<span class="badge done"><span class="ico-i ico-check"></span>مشترك${c.subscription_package ? " — " + orgEsc(c.subscription_package) : ""}${c.subscription_ends_at ? " · حتى " + new Date(c.subscription_ends_at).toLocaleDateString("ar-SA-u-ca-gregory") : ""}</span>${c.subscription_price != null ? ` <span class="pd-chip">${Number(c.subscription_price).toLocaleString("en-US")} ر.س / ${CYCLE_AR[c.billing_cycle]||""}</span>` : ""}${isOwner ? ` <button class="btn-xs" style="margin-inline-start:6px" onclick="renewSubscription(${c.id})">${c.subscription_ends_at ? "🔄 تجديد" : "📅 تحديد مدة الاشتراك"}</button>` : ""}` : `<span class="badge urgent"><span class="ico-i ico-warning"></span>غير مفعَّل — بلا تجربة ولا اشتراك</span>`}
      </div>
      ${c.pending_subscription_approval ? `<div style="background:#FEF3E2;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:11px;color:var(--gold);font-weight:700"><span class="ico-i ico-dot"></span>اعتماد أولي من ${c.staff_activated_by||"—"} — بانتظار الاعتماد النهائي
        ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:4px 10px;font-size:10.5px;cursor:pointer;margin-right:8px" onclick="finalApproveSubscription(${c.id})"><span class="ico-i ico-check"></span>اعتماد نهائي</button>` : ""}
      </div>` : ""}
      ${(inTrial || (c.trial_ends_at && !inTrial)) ? `<div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="openActivateSubModal(${c.id},'${orgEsc(c.name.replace(/'/g,""))}')"><span class="ico-i ico-check"></span>تفعيل الاشتراك</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="cancelTrial(${c.id},'${orgEsc(c.name.replace(/'/g,""))}')"><span class="ico-i ico-xcircle"></span>إلغاء التجربة</button>
        <button class="btn-xs" style="background:#EEF1F6;color:var(--primary);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="startTrialForCompany(${c.id})">📅 تعديل مدة التجربة</button>
      </div>` : ""}
      ${(!inTrial && !c.trial_ends_at && !hasPlan) || isOwner ? `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        ${(!inTrial && !c.trial_ends_at && !hasPlan) ? `<button class="btn-xs" style="background:#FEF3E2;color:var(--gold);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="startTrialForCompany(${c.id})"><span class="ico-i ico-bolt"></span>بدء فترة تجريبية</button>` : ""}
        ${(isOwner && hasPlan && !inTrial) ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="openActivateSubModal(${c.id},'${orgEsc(c.name.replace(/'/g,""))}',true)">✏️ تعديل الاشتراك</button>
        <button class="btn-xs" style="background:#EEF1F6;color:var(--primary);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="startTrialForCompany(${c.id})">↩️ إرجاع لفترة تجريبية</button>` : ""}
        ${isOwner ? `<button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="deleteCompanyPermanently(${c.id})"><span class="ico-i ico-trash"></span>حذف الشركة نهائياً</button>` : ""}
      </div>` : ""}
    </div></div>`;
  }).join("");
}

function openActivateSubModal(companyId, companyName, edit){
  document.getElementById("mas-company-id").value = companyId;
  window._masEdit = !!edit;
  document.getElementById("mas-title-h").textContent = (edit ? "✏️ تعديل الاشتراك — " : "✅ تفعيل الاشتراك — ") + companyName;
  document.getElementById("mas-end").value = "";
  document.getElementById("mas-audit").checked = false;
  document.getElementById("mas-risk").checked = false;
  _masPkg = null; clearSubPackageSelection("mas");
  document.getElementById("mas-price").value = "";
  document.getElementById("mas-cycle").value = "annual";
  document.getElementById("mas-start").value = new Date().toISOString().slice(0,10);
  if(edit){
    const c = manageCompaniesCache.find(x => x.id === companyId);
    if(c){
      document.getElementById("mas-audit").checked = !!c.module_internal_audit;
      document.getElementById("mas-risk").checked = !!c.module_risk_management;
      if(c.subscription_package && SUB_PACKAGES[c.subscription_package]) selectSubPackage("mas", c.subscription_package);
      if(c.subscription_price != null) document.getElementById("mas-price").value = c.subscription_price;
      if(c.billing_cycle) document.getElementById("mas-cycle").value = c.billing_cycle;
      if(c.subscription_starts_at) document.getElementById("mas-start").value = c.subscription_starts_at.slice(0,10);
      if(c.subscription_ends_at) document.getElementById("mas-end").value = c.subscription_ends_at.slice(0,10);
    }
  }
  openM("m-activate-sub");
}

/* Package selector — a thin naming/pricing layer over the same raw module checkboxes that
   already gate access everywhere else. Selecting a package just sets those checkboxes for you;
   nothing about the underlying enforcement mechanism changes, so custom combos remain possible
   by ticking the boxes directly (which also visually clears the package selection, since it no
   longer matches a named tier exactly). */
const SUB_PACKAGES = { "ذاتي": { risk:false, audit:false }, "مدار": { risk:false, audit:false }, "شريك": { risk:true, audit:true }, "أساسية": { risk:false, audit:false }, "فضية": { risk:true, audit:false }, "ذهبية": { risk:true, audit:true } };

let _masPkg = null;
function selectSubPackage(prefix, pkg){
  const cfg = SUB_PACKAGES[pkg];
  if(prefix === "mas"){
    _masPkg = pkg;
    const cy = document.getElementById("mas-cycle"); if(cy) cy.value = (pkg === "ذاتي") ? "annual" : "monthly";
  }
  document.getElementById(`${prefix}-risk`).checked = cfg.risk;
  document.getElementById(`${prefix}-audit`).checked = cfg.audit;
  document.querySelectorAll(`#${prefix}-package-selector [data-pkg]`).forEach(btn => {
    const selected = btn.dataset.pkg === pkg;
    btn.style.background = selected ? "var(--gold)" : "var(--gray1)";
    btn.style.color = selected ? "#fff" : "var(--dark)";
    btn.style.fontWeight = selected ? "800" : "600";
  });
}

function clearSubPackageSelection(prefix){
  if(prefix === "mas") _masPkg = null;
  document.querySelectorAll(`#${prefix}-package-selector [data-pkg]`).forEach(btn => {
    btn.style.background = "var(--gray1)"; btn.style.color = "var(--dark)"; btn.style.fontWeight = "600";
  });
}

const CYCLE_AR = { annual:"سنوي", monthly:"شهري" };
function subEndFrom(startIso, cycle){
  const d = new Date(startIso);
  if(cycle === "monthly") d.setMonth(d.getMonth()+1); else d.setFullYear(d.getFullYear()+1);
  return d.toISOString();
}
function subFields(){
  const price = parseFloat(document.getElementById("mas-price").value);
  const cycle = document.getElementById("mas-cycle").value || "annual";
  const sv = document.getElementById("mas-start").value;
  const start = sv ? new Date(sv + "T09:00:00").toISOString() : new Date().toISOString();
  const ev = document.getElementById("mas-end").value;
  const end = ev ? new Date(ev + "T09:00:00").toISOString() : subEndFrom(start, cycle);
  return { subscription_package: _masPkg, subscription_price: isNaN(price) ? null : price, billing_cycle: cycle, subscription_starts_at: start, subscription_ends_at: end };
}
async function activateSubscription(){
  const companyId = Number(document.getElementById("mas-company-id").value);
  const module_internal_audit = document.getElementById("mas-audit").checked;
  const module_risk_management = document.getElementById("mas-risk").checked;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  if(!isFullOwner){
    const { error } = await sb.from("companies").update({
      pending_subscription_approval: true, staff_activated_by: myEmail,
      module_internal_audit, module_risk_management, // proposed selection, applied on final approval
      ...subFields()
    }).eq("id", companyId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم تسجيل اعتمادك الأولي ✅ — بانتظار الاعتماد النهائي من إدارة حوكم قبل ما يُفعَّل فعليًا.");
    closeM("m-activate-sub");
    loadManageCompanies();
    return;
  }

  const { error } = await sb.from("companies").update({ module_internal_audit, module_risk_management, trial_ends_at: null, ...(window._masEdit ? {} : { converted_to_paid_at: new Date().toISOString() }), pending_subscription_approval: false, ...subFields() }).eq("id", companyId);
  if(error){ alert("تعذّر التفعيل: " + error.message); return; }
  logActivity("موافقة", "اشتراك", String(companyId), "تفعيل اشتراك مدفوع وإنهاء فترة التجربة");
  alert("تم تفعيل الاشتراك بنجاح ✅");
  closeM("m-activate-sub");
  loadManageCompanies();
}

async function finalApproveSubscription(companyId){
  const extra = {};
  try{
    const { data: cc } = await sb.from("companies").select("billing_cycle,subscription_starts_at,subscription_ends_at").eq("id", companyId).single();
    if(cc && !cc.subscription_ends_at){
      const st = new Date().toISOString(); const cy = cc.billing_cycle || "annual";
      extra.subscription_starts_at = st; extra.subscription_ends_at = subEndFrom(st, cy); extra.billing_cycle = cy;
    }
  }catch(e){}
  const { error } = await sb.from("companies").update({ ...extra, trial_ends_at: null, converted_to_paid_at: new Date().toISOString(), pending_subscription_approval: false }).eq("id", companyId);
  if(error){ alert("تعذّر الاعتماد: " + error.message); return; }
  logActivity("موافقة", "اشتراك", String(companyId), "اعتماد نهائي لتفعيل الاشتراك");
  alert("تم الاعتماد النهائي وتفعيل الاشتراك ✅");
  loadManageCompanies();
}

async function cancelTrial(companyId, companyName){
  if(!await uiConfirm(`إلغاء فترة تجربة "${companyName}"؟ سيفقد الوصول للوحدات الإضافية فورًا (تبقى الحوكمة والاجتماعات الأساسية فقط).`)) return;
  const { error } = await sb.from("companies").update({ module_internal_audit: false, module_risk_management: false, trial_ends_at: null }).eq("id", companyId);
  if(error){ alert("تعذّر الإلغاء: " + error.message); return; }
  logActivity("رفض", "اشتراك", companyName, "إلغاء فترة التجربة بدون اشتراك");
  alert("تم إلغاء فترة التجربة.");
  loadManageCompanies();
}

async function loadCompanyRequestsReview(){
  const pendingBox = document.getElementById("companyRequestsReviewList");
  const historyBox = document.getElementById("companyRequestsHistoryTbody");
  if(!pendingBox) return;
  const { data, error } = await sb.from("company_requests").select("*").order("id",{ascending:false});
  if(error){ pendingBox.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }

  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const pending = (data||[]).filter(r => r.status === "قيد المراجعة");
  pendingBox.innerHTML = pending.length===0
    ? '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد طلبات جديدة حاليًا.</div>'
    : pending.map(r => `<div class="card" style="margin-bottom:14px">
        <div class="card-body">
          <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(r.company_name)}</div>
          <div style="font-size:11.5px;color:var(--gray3);margin-top:4px">النوع: ${r.company_type} · س.ت: ${r.cr_number||"—"} ${r.cr_date?(' · تاريخ: '+r.cr_date):''}</div>
          <div style="font-size:11.5px;color:var(--gray3);margin-top:2px">المسؤول: ${r.responsible_person||"—"} · ${r.responsible_phone||""} · ${orgEsc(r.responsible_email||"")}</div>
          <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">مقدَّم من: ${orgEsc(r.requested_by_name||r.requested_by_email)} · ${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
          ${r.staff_approved_by ? `<div style="font-size:11px;color:var(--gold);font-weight:700;margin-top:6px"><span class="ico-i ico-dot"></span>اعتماد أولي من ${r.staff_approved_by} — بانتظار الاعتماد النهائي</div>` : ""}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="openApproveCompanyModal(${r.id})">${isFullOwner ? '✅ موافقة نهائية وإنشاء الشركة' : (r.staff_approved_by ? '✅ تم اعتمادك مسبقًا' : '✅ اعتماد أولي')}</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="rejectCompanyRequest(${r.id})"><span class="ico-i ico-xcircle"></span>رفض</button>
          </div>
        </div>
      </div>`).join("");

  if(historyBox){
    if(!data || data.length===0){ historyBox.innerHTML = emptyRowHTML(4, "لا توجد طلبات بعد."); }
    else {
      historyBox.innerHTML = data.map(r => {
        const st = COMPANY_REQUEST_STATUS_STYLE[r.status] || COMPANY_REQUEST_STATUS_STYLE["قيد المراجعة"];
        return `<tr>
          <td>${orgEsc(r.company_name)}</td><td>${orgEsc(r.requested_by_name||r.requested_by_email)}</td><td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
          <td><span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;background:${st.bg};color:${st.color}">${r.status}</span></td>
        </tr>`;
      }).join("");
    }
  }
}

async function openApproveCompanyModal(requestId){
  document.getElementById("apc-request-id").value = requestId;
  document.getElementById("apc-audit").checked = false;
  document.getElementById("apc-risk").checked = false;
  document.getElementById("apc-payment").checked = false;
  document.getElementById("apc-trial").checked = true;
  document.getElementById("apc-trial-days").value = "14";
  document.getElementById("apc-trial-days-row").style.display = "flex";
  document.getElementById("apc-llc-single-manager").checked = false;
  document.getElementById("apc-llc-single-owner").checked = false;

  const { data: req } = await sb.from("company_requests").select("company_type").eq("id", requestId).maybeSingle();
  const llcBox = document.getElementById("apc-llc-fields");
  if(llcBox) llcBox.style.display = (req?.company_type === "ذات مسؤولية محدودة") ? "block" : "none";

  openM("m-approve-company");
}

async function approveCompanyRequest(requestId){
  const module_internal_audit = document.getElementById("apc-audit").checked;
  const module_risk_management = document.getElementById("apc-risk").checked;
  const payment_confirmed = document.getElementById("apc-payment").checked;
  const isTrial = document.getElementById("apc-trial").checked;
  const trialDays = Number(document.getElementById("apc-trial-days").value) || 14;
  const trial_ends_at = isTrial ? new Date(Date.now() + trialDays*86400000).toISOString() : null;
  if(!payment_confirmed && !isTrial && !await uiConfirm("لم تؤكد استلام السداد ولا منحت فترة تجربة — هل تريد المتابعة على أي حال؟")) return;

  const { data: r, error: rErr } = await sb.from("company_requests").select("*").eq("id", requestId).single();
  if(rErr || !r){ alert("تعذّر تحميل الطلب"); return; }

  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  if(!isFullOwner){
    // Platform-team staff can only give a preliminary sign-off — the real company creation
    // (and the requester's login access) only happens once a full owner does the final approval.
    const { error } = await sb.from("company_requests").update({
      staff_approved_by: myEmail, staff_approved_at: new Date().toISOString(),
      payment_confirmed, payment_confirmed_at: payment_confirmed ? new Date().toISOString() : null,
      requested_modules: { internal_audit: module_internal_audit, risk_management: module_risk_management, trial: isTrial, trial_days: trialDays }
    }).eq("id", requestId);
    if(error){ alert("تعذّر حفظ الاعتماد الأولي: " + error.message); return; }
    alert("تم تسجيل اعتمادك الأولي ✅ — بانتظار الاعتماد النهائي من إدارة حوكم.");
    closeM("m-approve-company");
    loadCompanyRequestsReview();
    return;
  }

  const llc_single_manager = document.getElementById("apc-llc-single-manager").checked;
  const llc_single_owner = document.getElementById("apc-llc-single-owner").checked;
  const { data: newCompany, error: cErr } = await sb.from("companies").insert([{
    name: r.company_name, company_type: r.company_type, cr_number: r.cr_number, cr_date: r.cr_date,
    responsible_person: r.responsible_person, responsible_phone: r.responsible_phone, responsible_email: r.responsible_email,
    module_internal_audit, module_risk_management, trial_ends_at,
    llc_single_manager, llc_single_owner,
    converted_to_paid_at: (payment_confirmed && !isTrial) ? new Date().toISOString() : null
  }]).select().single();
  if(cErr){ alert("تعذّر إنشاء الشركة: " + cErr.message); return; }

  const { error: uErr } = await sb.from("user_profiles").update({ company_id: newCompany.id, role: "مدير النظام" }).eq("email", r.requested_by_email);
  if(uErr){ alert("تم إنشاء الشركة لكن تعذّر ربط المستخدم بها: " + uErr.message); return; }
  const { data: apprMem } = await sb.from("user_company_memberships").select("id").eq("email", r.requested_by_email).eq("company_id", newCompany.id).maybeSingle();
  if(!apprMem){
    const { error: apprMemErr } = await sb.from("user_company_memberships").insert([{ email: r.requested_by_email, company_id: newCompany.id, role: "مدير النظام" }]);
    if(apprMemErr){ alert("أُنشئت الشركة لكن تعذّر ربط المستخدم بها: " + apprMemErr.message); return; }
  }

  await sb.from("company_requests").update({
    status: "معتمد", reviewed_at: new Date().toISOString(), reviewed_by: myEmail, company_id: newCompany.id,
    payment_confirmed, payment_confirmed_at: payment_confirmed ? new Date().toISOString() : null,
    requested_modules: { internal_audit: module_internal_audit, risk_management: module_risk_management }
  }).eq("id", requestId);
  await sb.from("activity_log").insert([{ company_id: newCompany.id, actor_email: myEmail, actor_name: "إدارة حوكم", action_type: "إنشاء", entity_type: "شركة", entity_label: newCompany.name, details: "تمت الموافقة على طلب الإدراج" }]);

  // Give the new company a ready-made starting point: clone every template an admin has
  // marked as a platform default, instead of leaving their document templates page empty.
  const { data: defaults } = await sb.from("document_templates").select("*").eq("is_platform_default", true);
  if(defaults && defaults.length){
    const clones = defaults.map(t => ({
      company_id: newCompany.id, template_key: t.template_key, file_url: t.file_url,
      file_name: t.file_name, is_platform_default: false, updated_at: new Date().toISOString()
    }));
    await sb.from("document_templates").upsert(clones, { onConflict: 'company_id,template_key' });
  }

  // Notify the requester their company is live — approval was previously completely silent
  // from their side (they'd only discover it by trying to log in and hoping it worked).
  if(r.requested_by_email){
    const subject = `تمت الموافقة على طلب إدراج "${newCompany.name}" في منصة حوكم ✅`;
    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B">🎉 تهانينا! تمت الموافقة على طلبك</h2>
        <p>تم إنشاء شركة <b>${orgEsc(newCompany.name)}</b> على منصة حوكم، وربطك بها كمدير نظام.</p>
        ${isTrial ? `<p>لديك فترة تجريبية لمدة <b>${trialDays} يوم</b> — كل الوحدات مفتوحة خلالها.</p>` : ""}
        <p>يمكنك الآن تسجيل الدخول من <a href="https://hwkm.net">hwkm.net</a> بنفس بريدك الإلكتروني وكلمة المرور اللي سجّلت فيهم.</p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await sendNotificationEmail(r.requested_by_email, subject, html);
  }

  closeM("m-approve-company");
  alert("تم إنشاء الشركة وربط المستخدم بها كمدير نظام ✅"
    + (isTrial ? ` — فترة تجريبية ${trialDays} يوم (كل الوحدات مفتوحة).` : "")
    + (defaults && defaults.length ? ` وتم نسخ ${defaults.length} قالب مستند افتراضي لها.` : ""));
  loadCompanyRequestsReview();
}

async function rejectCompanyRequest(requestId){
  if(!await uiConfirm("رفض هذا الطلب؟")) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from("company_requests").update({ status: "مرفوض", reviewed_at: new Date().toISOString(), reviewed_by: myEmail }).eq("id", requestId);
  if(error){ alert("تعذّر الرفض: " + error.message); return; }
  loadCompanyRequestsReview();
}

let saveCompanyLock = false;
async function saveCompany(){
  if(saveCompanyLock) return;
  saveCompanyLock = true;
  try { await saveCompanyImpl(); } finally { saveCompanyLock = false; }
}

async function saveCompanyImpl(){
  const id = document.getElementById("mco-id").value;
  const name = document.getElementById("mco-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم الشركة"); return; }
  const company_type = document.getElementById("mco-type").value;
  const cr_number = normCrNumber(document.getElementById("mco-cr-number").value);
  if(cr_number && !validCrNumber(cr_number)){ alert("رقم السجل/الرقم الموحد يجب أن يكون 10 أرقام."); return; }
  const cr_date = document.getElementById("mco-cr-date").value || null;
  const business_activity = document.getElementById("mco-activity").value.trim();
  const company_size = document.getElementById("mco-size").value;
  const responsible_person = document.getElementById("mco-resp-name").value.trim();
  const responsible_phone = document.getElementById("mco-resp-phone").value.trim();
  const responsible_email = document.getElementById("mco-resp-email").value.trim();
  const total_capital = document.getElementById("mco-capital").value ? Number(document.getElementById("mco-capital").value) : null;
  const total_shares = document.getElementById("mco-shares").value ? Number(document.getElementById("mco-shares").value) : null;
  const share_nominal_value = document.getElementById("mco-nominal").value ? Number(document.getElementById("mco-nominal").value) : null;
  const seal_position = document.getElementById("mco-seal-position").value;
  const llc_single_manager = document.getElementById("mco-llc-single-manager").checked;
  const llc_single_owner = document.getElementById("mco-llc-single-owner").checked;

  const letterheadInput = document.getElementById("mco-letterhead");
  const sealInput = document.getElementById("mco-seal");
  const letterhead_url = (letterheadInput.files && letterheadInput.files[0]) ? await uploadFile(letterheadInput, "company-branding") : undefined;
  const seal_url = (sealInput.files && sealInput.files[0]) ? await uploadFile(sealInput, "company-branding") : undefined;

  const payload = { name, company_type, cr_number, cr_date, business_activity, company_size, responsible_person, responsible_phone, responsible_email, total_capital, total_shares, share_nominal_value, seal_position, llc_single_manager, llc_single_owner };
  if(letterhead_url !== undefined) payload.letterhead_url = letterhead_url;
  if(seal_url !== undefined) payload.seal_url = seal_url;

  if(id){
    const { error } = await sb.from("companies").update(payload).eq("id", id);
    if(error){ alert("تعذّر حفظ التعديلات: " + error.message); return; }
    closeM("m-company");
    await loadCompanies(Number(id));
    if(typeof refreshCompanyTypeVisibility === "function") await refreshCompanyTypeVisibility();
    alert("تم تحديث بيانات الشركة ✅");
  } else {
    const { data: sameName } = await sb.from("companies").select("id").ilike("name", name);
    if(sameName && sameName.length && !await uiConfirm(`توجد شركة بنفس الاسم "${name}" بالفعل. هل تريد إنشاء شركة أخرى بنفس الاسم؟`)) return;
    if(document.getElementById("mco-start-trial") && document.getElementById("mco-start-trial").checked){
      payload.trial_ends_at = new Date(Date.now() + 14*86400000).toISOString();
      payload.module_internal_audit = true;
      payload.module_risk_management = true;
    }
    const { data, error } = await sb.from("companies").insert([payload]).select().single();
    if(error){ alert("تعذّر إنشاء الشركة: " + error.message); return; }
    closeM("m-company");
    await loadCompanies(data ? data.id : null);
    alert("تم إنشاء الشركة بنجاح ✅ — أنت الآن تعمل عليها. كل البيانات الجديدة (أعضاء، اجتماعات...) ستُسجَّل تحتها بشكل منفصل تمامًا.");
  }
  resetCompanyForm();
}

/* Company-type-aware navigation: sole proprietorships have no board/shareholders, so
   board/committee/AGM-related pages are irrelevant and get hidden from the sidebar. */
const SOLE_PROP_HIDDEN_PAGES = ['meetings','committees','agm','voting','members','appoint','shareholders','announcements','indicators','decisiontracking','managerdecisions'];
const LLC_HIDDEN_PAGES = ['committees','announcements'];
let currentCompanyModules = { internal_audit: false, risk_management: false };
let currentCompanyTrialEndsAt = null;
const MODULE_PAGE_MAP = { audit: 'internal_audit', risks: 'risk_management' };

/* الشريطان الثابتان (التجربة + رقم السجل) يدفعان الشريط العلوي لأسفل بدل أن يغطّياه */
function updateBannerOffset(){
  const h = ["trialBanner","crBanner"].reduce((a,id) => { const e = document.getElementById(id); return a + (e ? e.offsetHeight : 0); }, 0);
  document.documentElement.style.setProperty("--banner-h", h + "px");
  const cb = document.getElementById("crBanner"), tb = document.getElementById("trialBanner");
  if(cb) cb.style.top = (tb ? tb.offsetHeight : 0) + "px";
}
window.addEventListener("resize", () => { try{ updateBannerOffset(); }catch(e){} });
let currentCompanySub = null;
function subDaysLeft(){
  if(!currentCompanySub || !currentCompanySub.ends) return null;
  return Math.ceil((new Date(currentCompanySub.ends) - new Date()) / 86400000);
}
function renderTrialBanner(){
  let banner = document.getElementById("trialBanner");
  const isAdmin = getCurrentRole() === "مدير النظام" || !!(currentUserProfile && currentUserProfile.is_platform_admin === true);
  let msg = "", warn = false;
  if(currentCompanyTrialEndsAt){
    const d = Math.max(0, Math.ceil((new Date(currentCompanyTrialEndsAt) - new Date()) / 86400000));
    msg = d > 0 ? `🎁 أنت بفترة تجريبية — متبقٍ ${d} يوم (كل الوحدات مفتوحة مؤقتًا)` + (d <= 7 ? " — اشترك الآن حتى لا ينقطع وصولك" : "")
                : `⚠️ انتهت فترة الفترة التجريبية — تواصل معنا لتفعيل الاشتراك`;
    warn = d <= 7;
  } else {
    const d = subDaysLeft();
    if(d !== null && d <= 30 && isAdmin){
      warn = true;
      msg = d > 0 ? `⏳ ينتهي اشتراكك خلال ${d} يوم — جدّد الآن لاستمرار الخدمة` : `⚠️ انتهى اشتراكك — تواصل معنا لتجديده`;
    }
  }
  if(!msg){ if(banner) banner.remove(); updateBannerOffset(); return; }
  if(!banner){
    banner = document.createElement("div");
    banner.id = "trialBanner";
    banner.style.cssText = "color:#fff;text-align:center;font-size:12px;font-weight:700;padding:8px;position:sticky;top:0;z-index:400;cursor:pointer";
    banner.onclick = () => openMySubscription();
    const appWrapper = document.getElementById("appWrapper");
    appWrapper.insertBefore(banner, appWrapper.firstChild);
  }
  banner.style.background = warn ? "linear-gradient(90deg,#C0392B,#E0674F)" : "linear-gradient(90deg,var(--gold),#D4AF37)";
  banner.textContent = msg + "  (اضغط للتفاصيل)";
  updateBannerOffset();
}

function openMySubscription(){ go('mysub', document.getElementById('navMySub')); }
function renderMySubscription(){
  const s = currentCompanySub, b = document.getElementById("mySubBody");
  if(!b) return;
  const fmt = d => d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory",{year:"numeric",month:"long",day:"numeric"}) : "—";
  const cell = (l,v) => `<div class="ms-cell"><span>${l}</span><b>${v}</b></div>`;
  let tone = "gray", badge = "لا يوجد اشتراك", big = "—", bigl = "", cells = "", note = "";
  if(!s){ note = "تعذّر تحميل بيانات الاشتراك."; }
  else if(s.trial){
    const d = Math.max(0, Math.ceil((new Date(s.trial) - new Date()) / 86400000));
    tone = d <= 7 ? "red" : "gold"; badge = "🎁 فترة تجريبية"; big = d; bigl = "يوم متبقٍ";
    cells = cell("تنتهي في", fmt(s.trial)) + cell("الوحدات","كل الوحدات مفتوحة مؤقتًا");
    note = "لتفعيل الاشتراك بعد التجربة تواصل معنا وسنفعّل الباقة المناسبة لك.";
  } else if(s.paid || s.ends){
    const d = subDaysLeft();
    const expired = d !== null && d < 0;
    tone = expired ? "red" : (d !== null && d <= 30 ? "gold" : "green");
    badge = expired ? "⚠️ اشتراك منتهٍ" : "✅ اشتراك فعّال";
    big = d === null ? "—" : Math.abs(d); bigl = d === null ? "" : (expired ? "يوم منذ الانتهاء" : "يوم متبقٍ");
    const mods = ["الحوكمة والاجتماعات"].concat(s.risk ? ["إدارة المخاطر"] : [], s.audit ? ["المراجعة الداخلية"] : []).join("، ");
    cells = cell("الباقة", s.pkg || "مخصّصة") + cell("الوحدات المتاحة", mods)
      + (s.price != null ? cell("قيمة الاشتراك", Number(s.price).toLocaleString("en-US") + " ريال / " + (CYCLE_AR[s.cycle]||"")) : "")
      + cell("بداية الاشتراك", fmt(s.starts)) + cell("نهاية الاشتراك", fmt(s.ends));
    if(d !== null && d <= 30) note = "اشتراكك قارب على الانتهاء — تواصل معنا للتجديد حتى لا تنقطع الخدمة.";
  } else {
    cells = cell("الوحدات","الحوكمة والاجتماعات (الأساسية)");
    note = "للاشتراك أو بدء تجربة مجانية تواصل معنا.";
  }
  b.innerHTML = `<div class="pd-head"><div class="pd-title"><span class="ico-i ico-package"></span>اشتراكي</div></div>
    <div class="ms-hero ${tone}"><div><div class="ms-badge">${badge}</div><div class="ms-sub">${(() => { const sw = document.getElementById("companySwitcher"); return sw && sw.selectedOptions[0] ? orgEsc(sw.selectedOptions[0].textContent) : ""; })()}</div></div>
      <div class="ms-big"><b>${big}</b><span>${bigl}</span></div></div>
    <div class="ms-grid">${cells}</div>
    ${note ? `<div class="ms-note">${note}</div>` : ""}
    <div class="pd-sec">تواصل معنا</div>
    <div class="ms-contact">
      <a class="ms-btn wa" href="https://wa.me/966509015864" target="_blank" rel="noopener"><span>💬</span><div><b>واتساب</b><small dir="ltr">+966 50 901 5864</small></div></a>
      <a class="ms-btn" href="tel:+966509015864"><span>📞</span><div><b>اتصال</b><small dir="ltr">+966 50 901 5864</small></div></a>
      <a class="ms-btn" href="mailto:info@hwkm.net"><span>✉️</span><div><b>البريد</b><small>info@hwkm.net</small></div></a>
    </div>`;
}

async function renewSubscription(companyId){
  if(!(currentUserProfile && currentUserProfile.is_platform_admin === true)) return;
  const { data: c } = await sb.from("companies").select("billing_cycle,subscription_ends_at,subscription_price,subscription_starts_at,converted_to_paid_at").eq("id", companyId).single();
  if(!c) return;
  const extra = {};
  let cy = c.billing_cycle || "annual";
  if(!c.subscription_ends_at){
    // مشترك قديم بلا بيانات مدة: نسأل عن الدورة والسعر مرة واحدة
    const a = prompt("دورة الفوترة لهذا المشترك؟ اكتب: سنوي أو شهري", "سنوي");
    if(a === null) return;
    cy = /شهر/.test(a) ? "monthly" : "annual";
    const pr = prompt("السعر المتفق عليه بالريال (اتركه فارغًا لو غير معروف)", "");
    if(pr === null) return;
    if(pr.trim() !== "" && !isNaN(parseFloat(pr))) extra.subscription_price = parseFloat(pr);
    extra.subscription_starts_at = c.converted_to_paid_at || new Date().toISOString();
  }
  const base = (c.subscription_ends_at && new Date(c.subscription_ends_at) > new Date()) ? c.subscription_ends_at : new Date().toISOString();
  const ends = subEndFrom(base, cy);
  if(!confirm("تجديد الاشتراك (" + (CYCLE_AR[cy]) + ") ليمتد حتى " + new Date(ends).toLocaleDateString("ar-SA-u-ca-gregory") + " ؟")) return;
  const { error } = await sb.from("companies").update({ ...extra, subscription_ends_at: ends, billing_cycle: cy }).eq("id", companyId);
  if(error){ alert("تعذّر التجديد: " + error.message); return; }
  logActivity("تعديل", "اشتراك", String(companyId), "تجديد الاشتراك");
  loadManageCompanies();
}

let currentCompanyHasCr = true;
function renderCrBanner(){
  let b = document.getElementById("crBanner");
  const isOwner = !!(currentUserProfile && currentUserProfile.is_platform_admin === true);
  const isAdmin = getCurrentRole() === "مدير النظام" || isOwner;
  if(currentCompanyHasCr || !isAdmin || !currentCompanyId){ if(b) b.remove(); updateBannerOffset(); return; }
  if(!b){
    b = document.createElement("div");
    b.id = "crBanner";
    b.style.cssText = "background:#FFF4D6;color:#7A5A00;border-bottom:1px solid #E6C766;text-align:center;font-size:12.5px;font-weight:700;padding:8px 12px;position:sticky;z-index:399";
    const w = document.getElementById("appWrapper");
    const t = document.getElementById("trialBanner");
    w.insertBefore(b, t ? t.nextSibling : w.firstChild);
  }
  b.innerHTML = (isOwner
    ? '🪪 (للمالك) هذه الشركة لم تُدخل رقم السجل أو الرقم الموحد — غير قابلة للتوثيق بعد. '
    : '🪪 فضلاً أدخل رقم السجل التجاري أو الرقم الموحد ليكتمل توثيق شركتك. ')
    + '<button class="btn-xs primary" style="margin-inline-start:8px" onclick="openEditCompanyModal()">إدخال الرقم الآن</button>';
  updateBannerOffset();
}

let companyTypeReadyPromise = null;
function refreshCompanyTypeVisibility(){
  companyTypeReadyPromise = applyCompanyTypeVisibility();
  return companyTypeReadyPromise;
}

async function applyCompanyTypeVisibility(){
  if(!currentCompanyId) return;
  const { data: c } = await sb.from("companies").select("company_type,module_internal_audit,module_risk_management,trial_ends_at,llc_single_manager,llc_single_owner,entity_verification,cr_number,subscription_package,subscription_price,billing_cycle,subscription_starts_at,subscription_ends_at,converted_to_paid_at").eq("id", currentCompanyId).single();
  currentCompanyType = c ? c.company_type : null;
  currentCompanyEntityVerified = !!(c && c.entity_verification === "verified");
  const inTrial = !!(c && c.trial_ends_at && new Date(c.trial_ends_at) > new Date());
  currentCompanyTrialEndsAt = inTrial ? c.trial_ends_at : null;
  currentCompanyModules = {
    internal_audit: inTrial || !!c?.module_internal_audit,
    risk_management: inTrial || !!c?.module_risk_management
  };
  currentCompanyHasCr = !!(c && String(c.cr_number||"").trim());
  currentCompanySub = c ? { pkg:c.subscription_package, price:c.subscription_price, cycle:c.billing_cycle, starts:c.subscription_starts_at, ends:c.subscription_ends_at, paid:c.converted_to_paid_at, trial:inTrial ? c.trial_ends_at : null, audit:!!c.module_internal_audit, risk:!!c.module_risk_management } : null;
  renderTrialBanner();
  renderCrBanner();
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const isLLCType = currentCompanyType === "ذات مسؤولية محدودة";
  const isLLCSingleManager = isLLCType && !!c?.llc_single_manager;
  currentCompanyLLCSingleManager = isLLCSingleManager;
  const isLLCSingleOwner = isLLCType && !!c?.llc_single_owner;
  currentCompanyLLCSingleOwner = isLLCSingleOwner;

  // "أعضاء المجلس" everywhere it appears as a page/nav label should say whichever body this
  // company actually has (مجلس الإدارة / مجلس المديرين) — getGovernanceBodyLabel() is already
  // the single source of truth for that name across the rest of the platform.
  const bodyLabel = getGovernanceBodyLabel();
  setText("membersPageTitle", `أعضاء ${bodyLabel}`);
  setText("membersNavLabel", `أعضاء ${bodyLabel}`);

  // A single-manager LLC has no one to hold a "board meeting" with — swap the whole meeting/
  // members/appointment/report machinery for the one simple decision log that actually fits.
  const boardMeetingsHeader = document.getElementById("grp-boardmeetings");
  ["navMeetingsOld","navMembersOld","navAppointOld","navIndicatorsOld","navDecisionTrackingOld"].forEach(elId => {
    const el = document.getElementById(elId);
    if(el) el.style.display = isLLCSingleManager ? "none" : "";
  });
  const managerDecisionsNav = document.getElementById("navManagerDecisions");
  if(managerDecisionsNav) managerDecisionsNav.style.display = isLLCSingleManager ? "" : "none";
  setText("boardMeetingsGroupLabel", isLLCSingleManager ? "قرارات الإدارة" : "اجتماعات المجلس");
  if(boardMeetingsHeader) boardMeetingsHeader.style.display = "flex"; // header itself always stays — just its one child changes

  // A single-owner LLC still legally holds "general assembly" powers — they just always
  // belong to the same one person, so what would normally be assembly resolutions become that
  // owner's simply-documented decisions instead of a dressed-up assembly with one attendee.
  const ownerDecisionsNav = document.getElementById("navOwnerDecisions");
  const agmOldNav = document.getElementById("navAgmOld");
  const isOwnerOnly = isLLCSingleOwner || isSoleProp;   // one person owns it, so assembly-style decisions are simply theirs
  if(ownerDecisionsNav) ownerDecisionsNav.style.display = isOwnerOnly ? "" : "none";
  if(agmOldNav) agmOldNav.style.display = isOwnerOnly ? "none" : "";
  setText("generalAssemblyGroupLabel", isOwnerOnly ? "قرارات المالك" : "الجمعية العامة");
  setText("agmNavLabel", isLLCSingleOwner ? "قرارات المالك" : "الجمعيات العامة");
  setText("agmPageTitle", isLLCSingleOwner ? "قرارات المالك" : "الجمعيات العامة");

  const navAnnouncements = document.getElementById("navAnnouncements");
  if(navAnnouncements) navAnnouncements.style.display = (currentCompanyType !== "مؤسسة فردية" && currentCompanyType !== "ذات مسؤولية محدودة") ? "flex" : "none";
  const shareholdersLabel = currentCompanyLLCSingleOwner ? "سجل الملكية" : (isLLCType ? "سجل الشركاء" : "سجل المساهمين");
  setText("shareholdersNavLabel", shareholdersLabel);
  setText("shareholdersPageTitle", `📇 ${shareholdersLabel}`);
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  document.querySelectorAll('.nav-item').forEach(item => {
    const pageId = item.getAttribute('onclick')?.match(/go\('([a-z]+)'/)?.[1];
    if(!pageId) return;
    if(isSoleProp && SOLE_PROP_HIDDEN_PAGES.includes(pageId)){
      item.style.display = 'none';
      return;
    }
    if(isLLCType && LLC_HIDDEN_PAGES.includes(pageId)){
      item.style.display = 'none';
      return;
    }
    if(currentCompanyLLCSingleManager && LLC_SINGLE_MANAGER_HIDDEN_PAGES.includes(pageId)){
      item.style.display = 'none';
      return;
    }
    if(currentCompanyLLCSingleOwner && LLC_SINGLE_OWNER_HIDDEN_PAGES.includes(pageId)){
      item.style.display = 'none';
      return;
    }
    // These two nav items are NOT in any hidden-pages list (they are the replacement pages), so
    // without an explicit rule the default branch below would show them to every company.
    if(pageId === 'circulation' && !/مساهمة/.test(currentCompanyType || '')){ item.style.display = 'none'; return; }
    if(pageId === 'managerdecisions' && !currentCompanyLLCSingleManager){ item.style.display = 'none'; return; }
    if(pageId === 'ownerdecisions' && !(currentCompanyLLCSingleOwner || isSoleProp)){ item.style.display = 'none'; return; }
    const moduleKey = MODULE_PAGE_MAP[pageId];
    if(moduleKey && !currentCompanyModules[moduleKey] && !isPlatformAdmin){
      // Locked, not hidden — the whole point of a package upsell is that people can see the
      // feature exists. A completely invisible nav item can never turn into a sale.
      item.style.display = '';
      item.classList.add('nav-locked');
      if(!item.querySelector('.nav-lock-badge')){
        item.insertAdjacentHTML('beforeend', '<span class="ico nav-lock-badge ico-lock" style="width:11px;height:11px;margin-right:auto;opacity:0.75"></span>');
      }
      return;
    }
    item.style.display = '';
    item.classList.remove('nav-locked');
    item.querySelector('.nav-lock-badge')?.remove();
  });

  // A sub-group whose items are all hidden for this company type would otherwise stay on screen
  // as an empty heading with an arrow that opens nothing.
  document.querySelectorAll('.nav-subgroup-header').forEach(h => {
    const kids = document.getElementById(h.id + '-children');
    if(!kids) return;
    const anyVisible = Array.from(kids.querySelectorAll('.nav-item')).some(it => it.style.display !== 'none');
    h.style.display = anyVisible ? 'flex' : 'none';
    kids.style.display = anyVisible ? '' : 'none';
  });
}

