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
      html += `<div class="card" style="margin-bottom:0">
        <div class="card-body" style="padding:14px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:800;color:var(--dark);word-break:break-word">${orgEsc(d.document_name||"")}</div>
              <div style="font-size:10.5px;color:var(--gray3);margin-top:3px"><span class="ico-i ico-calendar"></span>${d.upload_date||"—"}</div>
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
      <div style="font-size:12.5px;color:var(--gray3);line-height:1.8">تم إرسال طلب إدراج "<b>${orgEsc(latest.company_name)}</b>" وهو الآن بانتظار موافقة مالك المنصة.<br>بمجرد الموافقة، سجّل خروج ثم دخول من جديد وستجد شركتك جاهزة.</div>
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
      <div style="font-size:12px;color:var(--gray3);margin-top:4px">عبِّ بيانات شركتك — تقدر تبدأ تجربتك المجانية فورًا بضغطة زر، بدون انتظار.</div>
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
      <div class="fg"><label>رقم السجل التجاري</label><input class="fi" id="cr-cr-number"/></div>
      <div class="fg"><label>تاريخ السجل</label><input type="date" class="fi" id="cr-cr-date"/></div>
    </div>
    <div class="fg"><label>الشخص المسؤول (أنت)</label><input class="fi" id="cr-resp-name" value="${orgEsc(currentUserProfile.full_name||'')}"/></div>
    <div class="row2">
      <div class="fg"><label>جوال المسؤول</label><input class="fi" id="cr-resp-phone" value="${orgEsc(currentUserProfile.phone_number||'')}"/></div>
      <div class="fg"><label>إيميل المسؤول</label><input type="email" class="fi" id="cr-resp-email" value="${orgEsc(currentUserProfile.email||'')}"/></div>
    </div>

    <button class="btn btn-gold" style="width:100%;margin-top:10px;font-size:13.5px;padding:13px" onclick="startInstantTrial()"><span class="ico-i ico-bolt"></span>ابدأ تجربتك المجانية الآن (14 يوم، فورًا)</button>
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
const TRIAL_BTN_HTML = '<span class="ico-i ico-bolt"></span>ابدأ تجربتك المجانية الآن (14 يوم، فورًا)';
const TRIAL_PENDING_KEY = "hwkm_pending_trial_company";

async function startInstantTrial(){
  if(trialSubmitLock) return;
  const company_name = document.getElementById("cr-name").value.trim();
  if(!company_name){ alert("الرجاء إدخال اسم الشركة"); return; }
  const company_type = document.getElementById("cr-type").value;
  const cr_number = document.getElementById("cr-cr-number").value.trim();
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

    const { data: admins } = await sb.rpc("platform_admin_emails");
    if(admins && admins.length){
      const subject = `تجربة مجانية جديدة بدأت: ${company_name}`;
      const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B">تجربة مجانية تلقائية بدأت الآن</h2>
        <p><b>الشركة:</b> ${company_name} (${company_type})</p>
        <p><b>المسؤول:</b> ${(currentUserProfile && currentUserProfile.full_name)||sessionEmail} (${sessionEmail})</p>
        <p>لا يوجد إجراء مطلوب منك — هذا إشعار فقط. التجربة مفعَّلة تلقائيًا لمدة 14 يومًا.</p>
      </div>`;
      for(const a of admins){ sendNotificationEmail(a.email, subject, html); }
    }

    (window.__nativeAlert||alert)("تم إنشاء شركتك وتفعيل تجربتك المجانية 🎉 — راح تدخل منصتك الآن مباشرة.");
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

async function submitCompanyRequestImpl(){
  const company_name = document.getElementById("cr-name").value.trim();
  if(!company_name){ alert("الرجاء إدخال اسم الشركة"); return; }
  const company_type = document.getElementById("cr-type").value;
  const cr_number = document.getElementById("cr-cr-number").value.trim();
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
  const { data: admins } = await sb.rpc("platform_admin_emails");
  if(admins && admins.length){
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
    for(const a of admins){ await sendNotificationEmail(a.email, subject, html); }
  }

  loadCompanyRequestPage();
}

/* ══════════ PLATFORM OVERVIEW (owner-only, aggregated across every company) ══════════ */
async function loadPlatformDashboard(){
  const grid = document.getElementById("platformDashGrid");
  const modulesGrid = document.getElementById("platformModulesGrid");
  const trialsTbody = document.getElementById("platformTrialsTbody");
  if(!grid) return;

  const { data: companies, error } = await sb.from("companies").select("*");
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${error.message}</div>`; return; }
  const all = companies || [];

  const countByType = { "مساهمة": 0, "ذات مسؤولية محدودة": 0, "مؤسسة فردية": 0 };
  all.forEach(c => { if(countByType[c.company_type] !== undefined) countByType[c.company_type]++; });

  const cards = [
    { icon:"🏢", label:"إجمالي الشركات", val: all.length, color:"blue" },
    { icon:"📈", label:"شركات مساهمة", val: countByType["مساهمة"], color:"gold" },
    { icon:"🤝", label:"ذات مسؤولية محدودة", val: countByType["ذات مسؤولية محدودة"], color:"green" },
    { icon:"👤", label:"مؤسسات فردية", val: countByType["مؤسسة فردية"], color:"red" }
  ];
  grid.innerHTML = cards.map(c => `<div class="kpi ${c.color}"><div class="kpi-stripe"></div><div class="kpi-label">${c.label}</div><div class="kpi-val">${c.val}</div><div class="kpi-icon">${c.icon}</div></div>`).join("");

  const auditCount = all.filter(c => c.module_internal_audit).length;
  const riskCount = all.filter(c => c.module_risk_management).length;
  modulesGrid.innerHTML = [
    { icon:"🏛️", label:"الحوكمة والاجتماعات (أساسية)", val: all.length, color:"blue" },
    { icon:"🔍", label:"المراجعة الداخلية", val: auditCount, color:"gold" },
    { icon:"⚠️", label:"إدارة المخاطر", val: riskCount, color:"red" }
  ].map(c => `<div class="kpi ${c.color}"><div class="kpi-stripe"></div><div class="kpi-label">${c.label}</div><div class="kpi-val">${c.val}</div><div class="kpi-icon">${c.icon}</div></div>`).join("");

  const inTrial = all.filter(c => c.trial_ends_at && new Date(c.trial_ends_at) > new Date());
  if(inTrial.length === 0){
    trialsTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد شركات بفترة تجربة نشطة.</td></tr>';
  } else {
    trialsTbody.innerHTML = inTrial.map(c => {
      const daysLeft = Math.max(0, Math.ceil((new Date(c.trial_ends_at) - new Date()) / 86400000));
      return `<tr><td>${orgEsc(c.name)}</td><td>${daysLeft} يوم</td></tr>`;
    }).join("");
  }

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
    <td style="font-size:11px">${new Date(l.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td>
  </tr>`).join("");
}

/* ══════════ PLATFORM OWNER: trial start + permanent delete ══════════ */
let manageCompaniesCache = [];

async function startTrialForCompany(id){
  const c = manageCompaniesCache.find(x => x.id === id);
  if(!c) return;
  if(!await uiConfirm(`بدء تجربة مجانية 14 يوماً للشركة "${c.name}" (كل الوحدات مفتوحة)؟`)) return;
  const trial_ends_at = new Date(Date.now() + 14*86400000).toISOString();
  const { error } = await sb.from("companies").update({ trial_ends_at, module_internal_audit: true, module_risk_management: true }).eq("id", id);
  if(error){ alert("تعذّر بدء التجربة: " + error.message); return; }
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
  if(!(currentUserProfile && currentUserProfile.is_platform_admin === true)){ alert("هذه العملية لمالك المنصة فقط"); return; }
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
        ${inTrial ? `<span class="badge pending"><span class="ico-i ico-package"></span>تجربة — متبقٍ ${daysLeft} يوم</span>` : c.trial_ends_at ? `<span class="badge urgent"><span class="ico-i ico-warning"></span>انتهت التجربة</span>` : hasPlan ? `<span class="badge done"><span class="ico-i ico-check"></span>مشترك</span>` : `<span class="badge urgent"><span class="ico-i ico-warning"></span>غير مفعَّل — بلا تجربة ولا اشتراك</span>`}
      </div>
      ${c.pending_subscription_approval ? `<div style="background:#FEF3E2;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:11px;color:var(--gold);font-weight:700"><span class="ico-i ico-dot"></span>اعتماد أولي من ${c.staff_activated_by||"—"} — بانتظار الاعتماد النهائي
        ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:4px 10px;font-size:10.5px;cursor:pointer;margin-right:8px" onclick="finalApproveSubscription(${c.id})"><span class="ico-i ico-check"></span>اعتماد نهائي</button>` : ""}
      </div>` : ""}
      ${(inTrial || (c.trial_ends_at && !inTrial)) ? `<div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="openActivateSubModal(${c.id},'${orgEsc(c.name.replace(/'/g,""))}')"><span class="ico-i ico-check"></span>تفعيل الاشتراك</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="cancelTrial(${c.id},'${orgEsc(c.name.replace(/'/g,""))}')"><span class="ico-i ico-xcircle"></span>إلغاء التجربة</button>
      </div>` : ""}
      ${(!inTrial && !c.trial_ends_at && !hasPlan) || isOwner ? `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        ${(!inTrial && !c.trial_ends_at && !hasPlan) ? `<button class="btn-xs" style="background:#FEF3E2;color:var(--gold);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="startTrialForCompany(${c.id})"><span class="ico-i ico-bolt"></span>بدء تجربة 14 يوم</button>` : ""}
        ${isOwner ? `<button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="deleteCompanyPermanently(${c.id})"><span class="ico-i ico-trash"></span>حذف الشركة نهائياً</button>` : ""}
      </div>` : ""}
    </div></div>`;
  }).join("");
}

function openActivateSubModal(companyId, companyName){
  document.getElementById("mas-company-id").value = companyId;
  document.getElementById("mas-title-h").textContent = "✅ تفعيل الاشتراك — " + companyName;
  document.getElementById("mas-audit").checked = false;
  document.getElementById("mas-risk").checked = false;
  openM("m-activate-sub");
}

/* Package selector — a thin naming/pricing layer over the same raw module checkboxes that
   already gate access everywhere else. Selecting a package just sets those checkboxes for you;
   nothing about the underlying enforcement mechanism changes, so custom combos remain possible
   by ticking the boxes directly (which also visually clears the package selection, since it no
   longer matches a named tier exactly). */
const SUB_PACKAGES = { "ذاتي": { risk:false, audit:false }, "مدار": { risk:false, audit:false }, "شريك": { risk:true, audit:true }, "أساسية": { risk:false, audit:false }, "فضية": { risk:true, audit:false }, "ذهبية": { risk:true, audit:true } };

function selectSubPackage(prefix, pkg){
  const cfg = SUB_PACKAGES[pkg];
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
  document.querySelectorAll(`#${prefix}-package-selector [data-pkg]`).forEach(btn => {
    btn.style.background = "var(--gray1)"; btn.style.color = "var(--dark)"; btn.style.fontWeight = "600";
  });
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
      module_internal_audit, module_risk_management // proposed selection, applied on final approval
    }).eq("id", companyId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم تسجيل اعتمادك الأولي ✅ — بانتظار الاعتماد النهائي من مالك المنصة قبل ما يُفعَّل فعليًا.");
    closeM("m-activate-sub");
    loadManageCompanies();
    return;
  }

  const { error } = await sb.from("companies").update({ module_internal_audit, module_risk_management, trial_ends_at: null, converted_to_paid_at: new Date().toISOString(), pending_subscription_approval: false }).eq("id", companyId);
  if(error){ alert("تعذّر التفعيل: " + error.message); return; }
  logActivity("موافقة", "اشتراك", String(companyId), "تفعيل اشتراك مدفوع وإنهاء فترة التجربة");
  alert("تم تفعيل الاشتراك بنجاح ✅");
  closeM("m-activate-sub");
  loadManageCompanies();
}

async function finalApproveSubscription(companyId){
  const { error } = await sb.from("companies").update({ trial_ends_at: null, converted_to_paid_at: new Date().toISOString(), pending_subscription_approval: false }).eq("id", companyId);
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
    alert("تم تسجيل اعتمادك الأولي ✅ — بانتظار الاعتماد النهائي من مالك المنصة.");
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
  await sb.from("activity_log").insert([{ company_id: newCompany.id, actor_email: myEmail, actor_name: "مالك المنصة", action_type: "إنشاء", entity_type: "شركة", entity_label: newCompany.name, details: "تمت الموافقة على طلب الإدراج" }]);

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
        ${isTrial ? `<p>لديك فترة تجربة مجانية لمدة <b>${trialDays} يوم</b> — كل الوحدات مفتوحة خلالها.</p>` : ""}
        <p>يمكنك الآن تسجيل الدخول من <a href="https://hwkm.net">hwkm.net</a> بنفس بريدك الإلكتروني وكلمة المرور اللي سجّلت فيهم.</p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await sendNotificationEmail(r.requested_by_email, subject, html);
  }

  closeM("m-approve-company");
  alert("تم إنشاء الشركة وربط المستخدم بها كمدير نظام ✅"
    + (isTrial ? ` — فترة تجربة مجانية ${trialDays} يوم (كل الوحدات مفتوحة).` : "")
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
  const cr_number = document.getElementById("mco-cr-number").value.trim();
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

function renderTrialBanner(){
  let banner = document.getElementById("trialBanner");
  if(!currentCompanyTrialEndsAt){
    if(banner) banner.remove();
    return;
  }
  const daysLeft = Math.max(0, Math.ceil((new Date(currentCompanyTrialEndsAt) - new Date()) / 86400000));
  if(!banner){
    banner = document.createElement("div");
    banner.id = "trialBanner";
    banner.style.cssText = "background:linear-gradient(90deg,var(--gold),#D4AF37);color:#fff;text-align:center;font-size:12px;font-weight:700;padding:8px;position:sticky;top:0;z-index:400";
    const appWrapper = document.getElementById("appWrapper");
    appWrapper.insertBefore(banner, appWrapper.firstChild);
  }
  banner.textContent = daysLeft > 0
    ? `🎁 أنت بفترة تجربة مجانية — متبقٍ ${daysLeft} يوم (كل الوحدات مفتوحة مؤقتًا)`
    : `⚠️ انتهت فترة التجربة المجانية — تواصل معنا لتفعيل الاشتراك`;
}

let companyTypeReadyPromise = null;
function refreshCompanyTypeVisibility(){
  companyTypeReadyPromise = applyCompanyTypeVisibility();
  return companyTypeReadyPromise;
}

async function applyCompanyTypeVisibility(){
  if(!currentCompanyId) return;
  const { data: c } = await sb.from("companies").select("company_type,module_internal_audit,module_risk_management,trial_ends_at,llc_single_manager,llc_single_owner").eq("id", currentCompanyId).single();
  currentCompanyType = c ? c.company_type : null;
  const inTrial = !!(c && c.trial_ends_at && new Date(c.trial_ends_at) > new Date());
  currentCompanyTrialEndsAt = inTrial ? c.trial_ends_at : null;
  currentCompanyModules = {
    internal_audit: inTrial || !!c?.module_internal_audit,
    risk_management: inTrial || !!c?.module_risk_management
  };
  renderTrialBanner();
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

/* ══════════ TWO-FACTOR AUTHENTICATION (Supabase MFA / TOTP) ══════════ */
let pendingMfaFactorId = null;

async function openSecurityModal(){
  document.getElementById("secStatusLoading").style.display = "block";
  document.getElementById("secEnabled").style.display = "none";
  document.getElementById("secSetupStep1").style.display = "none";
  document.getElementById("secSetupStart").style.display = "none";
  openM("m-security");

  const { data, error } = await sb.auth.mfa.listFactors();
  document.getElementById("secStatusLoading").style.display = "none";
  if(error){ alert("تعذّر تحميل حالة الأمان: " + error.message); closeM("m-security"); return; }
  const verified = (data.totp || []).find(f => f.status === "verified");
  if(verified){
    document.getElementById("secEnabled").style.display = "block";
    pendingMfaFactorId = verified.id;
  } else {
    document.getElementById("secSetupStart").style.display = "block";
  }
}

async function startMfaEnroll(){
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
  if(error){ alert("تعذّر بدء التفعيل: " + error.message); return; }
  pendingMfaFactorId = data.id;
  document.getElementById("mfaQrBox").innerHTML = `<img src="${data.totp.qr_code}" style="width:180px;height:180px;border:1px solid var(--gray1);border-radius:8px" alt="QR"/>`;
  document.getElementById("mfaSecretKey").textContent = data.totp.secret;
  document.getElementById("secSetupStart").style.display = "none";
  document.getElementById("secSetupStep1").style.display = "block";
}

async function confirmMfaEnroll(){
  const code = document.getElementById("mfaEnrollCode").value.trim();
  if(!code || code.length !== 6){ alert("أدخل رمز مكوّن من 6 أرقام"); return; }
  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: pendingMfaFactorId });
  if(chErr){ alert("تعذّر التحقق: " + chErr.message); return; }
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: pendingMfaFactorId, challengeId: challenge.id, code });
  if(vErr){ alert("الرمز غير صحيح: " + vErr.message); return; }
  logActivity("صلاحيات", "الأمان", currentUserProfile?currentUserProfile.full_name:"", "تفعيل التحقق بخطوتين");
  alert("تم تفعيل التحقق بخطوتين بنجاح ✅");
  closeM("m-security");
}

async function disableMfa(){
  if(!await uiConfirm("إلغاء تفعيل التحقق بخطوتين؟ حسابك سيعتمد على كلمة المرور فقط بعدها.")) return;
  const { error } = await sb.auth.mfa.unenroll({ factorId: pendingMfaFactorId });
  if(error){ alert("تعذّر الإلغاء: " + error.message); return; }
  logActivity("صلاحيات", "الأمان", currentUserProfile?currentUserProfile.full_name:"", "إلغاء التحقق بخطوتين");
  alert("تم إلغاء التحقق بخطوتين.");
  closeM("m-security");
}

async function verifyMfaLogin(){
  const code = document.getElementById("mfaLoginCode").value.trim();
  const errBox = document.getElementById("mfaLoginError");
  errBox.style.display = "none";
  if(!code || code.length !== 6){ errBox.textContent = "أدخل رمز مكوّن من 6 أرقام"; errBox.style.display = "block"; return; }

  const { data: factors, error: fErr } = await sb.auth.mfa.listFactors();
  if(fErr){ errBox.textContent = fErr.message; errBox.style.display = "block"; return; }
  const factor = (factors.totp || []).find(f => f.status === "verified");
  if(!factor){ errBox.textContent = "تعذّر تحديد وسيلة التحقق"; errBox.style.display = "block"; return; }

  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if(chErr){ errBox.textContent = chErr.message; errBox.style.display = "block"; return; }
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
  if(vErr){ errBox.textContent = "رمز غير صحيح، حاول مجددًا."; errBox.style.display = "block"; return; }

  document.getElementById("mfaLoginCode").value = "";
  closeM("m-mfa-challenge");
  showApp();
}

/* ══════════ AUTO-LOGOUT AFTER INACTIVITY ══════════
   The platform holds sensitive governance/financial data — a session left open indefinitely on
   a shared or public device is a real exposure risk. After 30 minutes with no mouse/keyboard/
   touch activity, sign the person out automatically with a clear message. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let idleTimer = null;
function resetIdleTimer(){
  if(!currentUserProfile) return; // no active session to protect yet
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await sb.auth.signOut();
    (window.__nativeAlert||alert)("تم تسجيل خروجك تلقائيًا بسبب عدم النشاط لفترة طويلة، لحماية بيانات شركتك.");
    location.reload();
  }, IDLE_TIMEOUT_MS);
}
['mousemove','mousedown','keydown','touchstart','scroll'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

/* ══════════ SUPPORT TICKETS ══════════ */
async function openSupportModal(){
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  openM("m-support");
  loadMySupportTickets();
}

async function submitSupportTicket(){
  const subject = document.getElementById("sup-subject").value.trim();
  const message = document.getElementById("sup-message").value.trim();
  if(!subject || !message){ alert("الرجاء تعبئة الموضوع والوصف"); return; }
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from("support_tickets").insert([{
    company_id: currentCompanyId || null, submitted_by_email: email,
    submitted_by_name: currentUserProfile ? currentUserProfile.full_name : email, subject, message
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  const { data: admins } = await sb.rpc("platform_admin_emails");
  if(admins && admins.length){
    const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B">🆘 طلب دعم فني جديد</h2>
      <p><b>من:</b> ${currentUserProfile?currentUserProfile.full_name:email} (${email})</p>
      <p><b>الموضوع:</b> ${subject}</p>
      <p><b>الرسالة:</b> ${message}</p>
    </div>`;
    for(const a of admins){ await sendNotificationEmail(a.email, `🆘 طلب دعم: ${subject}`, html); }
  }
  alert("تم إرسال طلبك ✅ — سيتواصل معك فريق الدعم قريبًا.");
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  loadMySupportTickets();
}

async function loadMySupportTickets(){
  const box = document.getElementById("mySupportTicketsList");
  if(!box) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { data, error } = await sb.from("support_tickets").select("*").eq("submitted_by_email", email).order("created_at",{ascending:false});
  if(error || !data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لا توجد طلبات سابقة.</div>'; return; }
  box.innerHTML = data.map(t => `<div style="background:var(--offwhite);border-radius:8px;padding:8px 10px;margin-bottom:6px">
    <div style="font-size:12px;font-weight:700">${orgEsc(t.subject)}</div>
    <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">الحالة: <b style="color:${t.status==='مغلقة'?'var(--green)':'var(--gold)'}">${t.status}</b> · ${new Date(t.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
    ${t.admin_reply ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد الدعم:</b> ${t.admin_reply}</div>` : ""}
  </div>`).join("");
}

/* ══════════ ONBOARDING GUIDE ══════════ */
/* ══════════ EXPORT ALL COMPANY DATA ══════════
   The subscription agreement (Article 22) grants the client the right to extract their data —
   this is the "one button" version of that: pull everything scoped to the current company
   across every major table and package it as a single downloadable JSON file. */
const EXPORT_TABLES = [
  "meetings","policies","risks","board_members","shareholders","committees","compliance_items",
  "audit_items","signing_documents","document_signatures","governance_assessments","performance_evaluations",
  "vote_topics","agm_attendance","share_transfers","activity_log","ceo_monthly_reports",
  "audit_requests","risk_requests","company_requests","document_templates"
];

async function exportAllCompanyData(){
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }
  if(!await uiConfirm("سيتم تجميع كل بيانات شركتك المسجَّلة بالمنصة بملف واحد قابل للتحميل. قد يأخذ هذا بضع ثوانٍ. متابعة؟")) return;

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const exportData = { exported_at: new Date().toISOString(), company: company || {}, data: {} };

  for(const table of EXPORT_TABLES){
    try{
      const { data, error } = await sb.from(table).select("*").eq("company_id", currentCompanyId);
      exportData.data[table] = error ? { error: error.message } : (data || []);
    }catch(e){
      exportData.data[table] = { error: e.message };
    }
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `بيانات-${(company?.name||"الشركة").replace(/[\\/:*?"<>|]/g,"_")}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  alert("تم تحميل ملف بيانات شركتك بنجاح ✅");
}

function openOnboardingGuide(){ openM("m-onboarding"); }
async function closeOnboardingGuide(){
  closeM("m-onboarding");
  if(currentUserProfile && !currentUserProfile.onboarding_seen){
    const { data: userData } = await sb.auth.getUser();
    const email = userData && userData.user ? userData.user.email : null;
    if(email) await sb.from("user_profiles").update({ onboarding_seen: true }).eq("email", email);
    currentUserProfile.onboarding_seen = true;
  }
}

async function logout(){
  await sb.auth.signOut();
  currentUserProfile = null;
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  if(nameEl){ nameEl.value = ""; nameEl.disabled = false; nameEl.style.background = ""; }
  if(sharesEl){ sharesEl.value = ""; sharesEl.disabled = false; sharesEl.style.background = ""; }
  const sName = document.getElementById('sidebarUserName');
  const sRole = document.getElementById('sidebarUserRole');
  const sAv = document.getElementById('sidebarUserAv');
  if(sName) sName.textContent = "مستخدم";
  if(sRole) sRole.textContent = "—";
  if(sAv) sAv.textContent = "م";
  document.getElementById("appWrapper").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

async function showApp(){
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appWrapper").style.display = "block";
  await loadCurrentUserProfile();
  logActivity("دخول", "تسجيل دخول", currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email) : "", "دخول للمنصة");
}

/* ══════════ FORGOT / RESET PASSWORD ══════════ */
function openForgotPasswordModal(){
  document.getElementById("forgot-email").value = document.getElementById("loginEmail")?.value || "";
  document.getElementById("forgot-msg").style.display = "none";
  openM("m-forgot-password");
}

async function sendPasswordResetEmail(){
  const email = document.getElementById("forgot-email").value.trim();
  const msgEl = document.getElementById("forgot-msg");
  if(!email){ msgEl.textContent = "الرجاء إدخال بريد إلكتروني صحيح"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  if(error){ msgEl.textContent = "تعذّر الإرسال: " + error.message; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  msgEl.textContent = "✅ تم إرسال رابط إعادة التعيين إلى بريدك — تحقق من صندوق الوارد (والمزعج/السبام).";
  msgEl.style.color = "var(--green)"; msgEl.style.display = "block";
}

async function confirmPasswordReset(){
  const pw = document.getElementById("reset-new-password").value;
  const pw2 = document.getElementById("reset-confirm-password").value;
  const msgEl = document.getElementById("reset-msg");
  if(!pw || pw.length < 6){ msgEl.textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  if(pw !== pw2){ msgEl.textContent = "كلمتا المرور غير متطابقتين"; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if(error){ msgEl.textContent = "تعذّر تعيين كلمة المرور: " + error.message; msgEl.style.color = "var(--red)"; msgEl.style.display = "block"; return; }
  closeM("m-reset-password");
  alert("تم تعيين كلمة المرور بنجاح ✅ يمكنك الآن استخدام المنصة.");
  showApp();
}

// When the person clicks the reset link in their email, Supabase redirects back here and
// fires a PASSWORD_RECOVERY auth event — catch it and show the "set a new password" modal
// instead of the normal app/login screen.
sb.auth.onAuthStateChange((event, session) => {
  if(event === "PASSWORD_RECOVERY"){
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("reset-msg").style.display = "none";
    document.getElementById("reset-new-password").value = "";
    document.getElementById("reset-confirm-password").value = "";
    openM("m-reset-password");
  }
});

async function checkSession(){
  const { data } = await sb.auth.getSession();
  if(data && data.session){
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel){
      document.getElementById("loginScreen").style.display = "flex";
      openM("m-mfa-challenge");
      return;
    }
    showApp();
  } else {
    document.getElementById("loginScreen").style.display = "flex";
  }
}
checkSession();
if(new URLSearchParams(window.location.search).get("invite") && authMode === "login"){
  toggleAuthMode();
}
// Lets the marketing site link straight into signup mode (e.g. "جرّب المنصة" →
// web.hwkm.net/?mode=signup) instead of routing visitors through a separate lead-capture
// form first — each signup gets its own isolated company workspace and a 14-day trial.
if(new URLSearchParams(window.location.search).get("mode") === "signup" && authMode === "login"){
  toggleAuthMode();
}
// Apply any saved language preference immediately (before login, so the login screen itself
// is translated too) — this runs synchronously at script parse time, ahead of any page render.
document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'en' ? 'ltr' : 'rtl';
/* Toggles the login password field between masked and plain text, swapping the eye icon to
   match — a closed-eye ("hide") state once revealed, so the button always shows the action
   it's about to perform rather than the current state. */
function toggleLoginPasswordVisibility(){
  const input = document.getElementById("loginPassword");
  const icon = document.getElementById("loginPwEyeIcon");
  if(!input || !icon) return;
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  icon.className = isHidden ? "ico ico-eyeoff" : "ico ico-eye";
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnLangToggle');
  if(btn) btn.textContent = currentLang === 'en' ? 'AR' : 'EN';

  // Pre-fill the remembered email, if any, so returning users don't retype it.
  const rememberedEmail = localStorage.getItem("hwkm_remembered_email");
  if(rememberedEmail){
    const emailField = document.getElementById("loginEmail");
    const rememberBox = document.getElementById("rememberMeCheckbox");
    if(emailField) emailField.value = rememberedEmail;
    if(rememberBox) rememberBox.checked = true;
  }

  if(currentLang === 'en'){
    loadI18n().catch(() => {}).then(() => {
      applyTranslation();
      langObserver = makeLangObserver();
      langObserver.observe(document.body, LANG_OBSERVER_OPTS);
    });
  }
});

if('serviceWorker' in navigator){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

/* ══════════ BOARD MEMBERS ══════════ */
let membersCache = [];
let disclosuresCache = [];
const memberColors = [
  "linear-gradient(135deg,var(--primary),var(--accent))",
  "linear-gradient(135deg,#8B2FC9,#B56AE8)",
  "linear-gradient(135deg,var(--teal),#29B8A8)",
  "linear-gradient(135deg,#C0392B,#E85D50)",
  "linear-gradient(135deg,var(--gold),var(--gold3))"
];

/* ══════════ BOARD TERM RENEWAL — full-board transition tied to an AGM election ══════════
   Ends the sitting term for anyone who doesn't continue, keeps continuing members linked to
   the new term, adds the freshly-elected members, and (since new members always need a CMA
   disclosure) opens one prefilled "تعيين عضو مجلس إدارة جديد" announcement draft per new
   member for review — reusing the existing 86-type announcement engine rather than inventing
   a separate bulk-announcement type that doesn't match real Tadawul practice. */
let newTermMemberRows = 0;

async function openNewBoardTermModal(){
  if(!meetingPlanRoleGuard()) return;
  const agmSel = document.getElementById("bt-agm-select");
  agmSel.innerHTML = '<option value="">جارِ التحميل...</option>';
  const membersBox = document.getElementById("bt-current-members");
  membersBox.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  document.getElementById("bt-new-members").innerHTML = "";
  newTermMemberRows = 0;
  document.getElementById("bt-term-start").value = "";
  openM("m-board-term");

  const { data: agms } = await sb.from("meetings").select("id,title,meeting_date")
    .eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").order("meeting_date",{ascending:false});
  agmSel.innerHTML = '<option value="">— اختر —</option>' +
    (agms||[]).map(a => `<option value="${a.id}" data-date="${a.meeting_date||''}">${orgEsc(a.title||'')} — ${a.meeting_date||'—'}</option>`).join("");
  agmSel.onchange = () => {
    const opt = agmSel.selectedOptions[0];
    if(opt && opt.dataset.date) document.getElementById("bt-term-start").value = opt.dataset.date;
  };

  const { data: members } = await sb.from("board_members").select("*")
    .eq("company_id", currentCompanyId).eq("status","نشط").order("id",{ascending:true});
  membersBox.innerHTML = (members && members.length)
    ? members.map(m => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--offwhite);border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" data-bt-member-id="${m.id}" data-bt-member-name="${orgEsc((m.name||'').replace(/"/g,''))}" checked style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0"/>
        <span>${orgEsc(m.name||"")} <span style="color:var(--gray3);font-size:10.5px">— ${orgEsc(m.position||"")}</span></span>
      </label>`).join("")
    : '<div style="font-size:11px;color:var(--gray3)">لا يوجد أعضاء حاليون مسجّلون.</div>';
}

function addNewTermMemberRow(){
  newTermMemberRows++;
  const idx = newTermMemberRows;
  const box = document.getElementById("bt-new-members");
  const row = document.createElement("div");
  row.id = `bt-new-row-${idx}`;
  row.style.cssText = "background:var(--offwhite);border-radius:10px;padding:10px;margin-bottom:8px";
  row.innerHTML = `
    <div class="row2">
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-name-${idx}" placeholder="اسم العضو الجديد" style="margin:0"/></div>
      <div class="fg" style="margin-bottom:6px"><input class="fi" id="bt-new-position-${idx}" placeholder="المنصب (مثال: عضو مستقل)" style="margin:0"/></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="fs" id="bt-new-exec-${idx}" style="flex:1;margin:0"><option>غير تنفيذي</option><option>تنفيذي</option><option>مستقل</option></select>
      <button type="button" onclick="document.getElementById('bt-new-row-${idx}').remove()" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  box.appendChild(row);
}

async function saveBoardTerm(){
  if(!meetingPlanRoleGuard()) return;
  const agm_meeting_id = document.getElementById("bt-agm-select").value;
  const term_start = document.getElementById("bt-term-start").value;
  if(!agm_meeting_id){ alert("الرجاء اختيار الجمعية العامة اللي تم فيها الانتخاب"); return; }
  if(!term_start){ alert("الرجاء تحديد تاريخ بداية الدورة الجديدة"); return; }

  const { data: term, error: termErr } = await sb.from("board_terms")
    .insert([{ company_id: currentCompanyId, agm_meeting_id: Number(agm_meeting_id), term_start, status:"نشطة" }])
    .select().single();
  if(termErr){ alert("تعذّر إنشاء الدورة: " + termErr.message); return; }

  const checkboxes = [...document.querySelectorAll("#bt-current-members [data-bt-member-id]")];
  const continuingNames = [];
  for(const cb of checkboxes){
    const memberId = Number(cb.dataset.btMemberId);
    if(cb.checked){
      await sb.from("board_members").update({ term_id: term.id }).eq("id", memberId);
      continuingNames.push(cb.dataset.btMemberName || "");
    } else {
      await sb.from("board_members").update({ status:"منتهي العضوية", term_end_date: term_start }).eq("id", memberId);
    }
  }

  const newRows = [...document.querySelectorAll("#bt-new-members [id^='bt-new-row-']")];
  const newMembersAdded = [];
  for(const row of newRows){
    const idx = row.id.replace("bt-new-row-","");
    const name = document.getElementById(`bt-new-name-${idx}`).value.trim();
    if(!name) continue;
    const position = document.getElementById(`bt-new-position-${idx}`).value.trim();
    const is_executive = document.getElementById(`bt-new-exec-${idx}`).value;
    await sb.from("board_members").insert([{
      name, position, position_level:"عضو", is_executive, committee_member:"لا",
      join_date: term_start, status:"نشط", term_id: term.id, company_id: currentCompanyId
    }]);
    newMembersAdded.push(name);
  }

  closeM("m-board-term");
  loadMembers();

  const allTermMembers = [...continuingNames, ...newMembersAdded].filter(Boolean);
  if(allTermMembers.length){
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅ — جهّزنا لك الآن مسودة «إعلان نتائج الجمعية» معبّاة بأعضاء المجلس الجدد كاملين، للمراجعة والتوليد.");
    await prefillAgmResultsWithElectedBoard(Number(agm_meeting_id), allTermMembers, term_start);
  } else {
    alert("تم اعتماد دورة المجلس الجديدة بنجاح ✅");
  }
}

/* Discloses the WHOLE elected/renewed board in one shot, inside the AGM's own "نتائج
   الجمعية" announcement (the "أعضاء مجلس تم انتخابهم/تعيينهم" field) — matching real Tadawul
   practice for a board elected at a general assembly, instead of one appointment
   announcement per member (that's only for a single seat changing between assemblies). */
async function prefillAgmResultsWithElectedBoard(agmMeetingId, memberNames, termStart){
  const { data: agmRow } = await sb.from("meetings").select("*").eq("id", agmMeetingId).single();
  if(agmRow && !agmMeetingsCache.some(x => x.id === agmMeetingId)) agmMeetingsCache.push(agmRow);
  currentAGMModalMeetingId = agmMeetingId;
  openTadawulAnnouncementForm("نتائج");
  setTimeout(() => {
    const el = document.getElementById("tdwAnn-elected");
    if(el) el.value = memberNames.map(n => `${n} — بداية الدورة: ${termStart}`).join("\n");
  }, 50);
}

/* Opens the existing generic (86-type) announcement form pre-filled for a specific new
   board member — kept available for a single mid-term seat change (not a full AGM renewal),
   still reachable manually from "الإعلانات" → "تعيين عضو مجلس إدارة جديد". */
function prefillAppointmentAnnouncement(memberName, meetingDate){
  selectAnnouncementType("تعيين عضو مجلس إدارة جديد");
  setTimeout(() => {
    const nameField = document.getElementById("genf-member_name");
    const dateField = document.getElementById("genf-meeting_date");
    const startField = document.getElementById("genf-start_date");
    if(nameField) nameField.value = memberName;
    if(dateField) dateField.value = meetingDate || "";
    if(startField) startField.value = meetingDate || "";
  }, 50);
}

async function loadMembers(){
  const grid = document.getElementById("membersGrid");
  const [{ data, error }, { data: disclosureForms }] = await Promise.all([
    sb.from("board_members").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("board_disclosure_forms").select("member_email,status").eq("company_id", currentCompanyId)
  ]);
  if(error){
    grid.innerHTML = '<div style="font-size:12px;color:var(--red);padding:12px">تعذّر تحميل الأعضاء: '+error.message+'</div>';
    return;
  }
  if(!data || data.length === 0){
    grid.innerHTML = '<div style="font-size:12px;color:var(--gray3);padding:12px">لا يوجد أعضاء بعد. اضغط "+ إضافة عضو" للبدء.</div>';
    return;
  }
  membersCache = data;
  disclosuresCache = disclosureForms || [];
  grid.innerHTML = data.map((m, i) => {
    const initial = (m.name || "?").trim().charAt(0);
    const bg = memberColors[i % memberColors.length];
    const status = m.status || "—";
    const execBadge = m.is_executive === "تنفيذي" ? '<span class="badge pending">تنفيذي</span>' : '<span class="badge info">غير تنفيذي</span>';
    const committeeBadge = m.committee_member === "نعم" ? '<span class="badge done">عضو لجنة</span>' : "";
    const memberDisclosure = m.claimed_by_email ? disclosuresCache.find(d => d.member_email === m.claimed_by_email) : null;
    const disclosureBadge = memberDisclosure && memberDisclosure.status === "موقّع" ? '<span class="badge done"><span class="ico-i ico-check"></span>أُفصح</span>' : '<span class="badge urgent"><span class="ico-i ico-warning"></span>لم يُفصح</span>';
    const claimBadge = m.claimed_by_email
      ? `<span class="badge done" title="${orgEsc(m.claimed_by_email)}"><span class="ico-i ico-link"></span>مرتبط بحساب دخول</span>`
      : '<span class="badge urgent"><span class="ico-i ico-warning"></span>غير مرتبط — لا يقدر يصوّت</span>';
    return `<div class="memcard">
      <div class="mem-av" style="background:${bg}">${initial}</div>
      <div class="mem-name">${orgEsc(m.name || "")}</div><div class="mem-role">${m.position_level || "عضو"} — ${orgEsc(m.position || "")}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin:4px 0">
        <span class="badge info">${status}</span>${execBadge}${committeeBadge}
      </div>
      <div style="display:flex;justify-content:center;margin:2px 0">${disclosureBadge}</div>
      <div style="display:flex;justify-content:center;margin:2px 0">${claimBadge}</div>
      <div class="mem-stats"><div><div class="ms-v">${m.join_date || "—"}</div><div class="ms-l">الانضمام</div></div></div>
      <div style="display:flex;gap:6px;margin-top:8px;width:100%">
        <button class="btn-xs primary" style="flex:1" onclick="editMember(${m.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        ${m.claimed_by_email ? "" : `<button class="btn-xs" style="flex:1;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1)" onclick="openClaimMemberModal(${m.id})"><span class="ico-i ico-link"></span>ربط بحساب</button>`}
      </div>
    </div>`;
  }).join("");
}

/* Linking a formal board_members row to an actual login (claimed_by_email) is what makes
   that person count for quorum, attendance, and decision voting — being invited to the
   platform with role "عضو مجلس" is NOT enough by itself, since board_members is a separate
   roster from user_company_memberships. This is normally set automatically when someone signs
   up with a matching national ID; this modal covers everyone else (e.g. invited by link). */
async function openClaimMemberModal(memberId){
  const m = membersCache.find(x => x.id === memberId);
  if(!m) return;
  document.getElementById("cm-member-id").value = memberId;
  document.getElementById("cm-member-name").textContent = m.name || "";
  const sel = document.getElementById("cm-email-select");
  sel.innerHTML = '<option value="">جارِ التحميل...</option>';
  openM("m-claim-member");

  const { data: memberships } = await sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId);
  const emails = (memberships||[]).map(x=>x.email);
  const { data: profiles } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameByEmail = {};
  (profiles||[]).forEach(p => { nameByEmail[p.email] = p.full_name; });

  if(!memberships || memberships.length === 0){
    sel.innerHTML = '<option value="">لا يوجد أعضاء بالفريق بعد</option>';
    return;
  }
  sel.innerHTML = '<option value="">— اختر حساب الدخول —</option>' +
    memberships.map(x => `<option value="${orgEsc(x.email)}">${orgEsc(nameByEmail[x.email]||x.email)} (${orgEsc(x.role)}) — ${orgEsc(x.email)}</option>`).join("");
}

async function confirmClaimMember(){
  const memberId = document.getElementById("cm-member-id").value;
  const email = document.getElementById("cm-email-select").value;
  if(!email){ alert("الرجاء اختيار حساب الدخول اللي تبي تربطه بهذا العضو"); return; }
  const { error } = await sb.from("board_members").update({ claimed_by_email: email }).eq("id", memberId);
  if(error){ alert("تعذّر الربط: " + error.message); return; }
  closeM("m-claim-member");
  alert("تم الربط بنجاح ✅ — هذا العضو الآن يقدر يصوّت على قرارات المجلس/اللجان، ويُحسب ضمن الحضور والنصاب.");
  loadMembers();
}

function editMember(id){
  const m = membersCache.find(x => x.id === id);
  if(!m) return;
  document.getElementById("mm-id").value = m.id;
  document.getElementById("mm-title").textContent = "✏️ تعديل عضو مجلس إدارة";
  document.getElementById("mm-source").value = "manual";
  document.getElementById("mm-shareholder-picker-wrap").style.display = "none";
  document.getElementById("mm-name").disabled = false; document.getElementById("mm-name").style.background = "";
  document.getElementById("mm-national-id").disabled = false; document.getElementById("mm-national-id").style.background = "";
  document.getElementById("mm-name").value = m.name || "";
  document.getElementById("mm-position").value = m.position || "";
  document.getElementById("mm-position-level").value = m.position_level || "عضو";
  document.getElementById("mm-executive").value = m.is_executive || "غير تنفيذي";
  document.getElementById("mm-committee").value = m.committee_member || "لا";
  document.getElementById("mm-joindate").value = m.join_date || "";
  document.getElementById("mm-status").value = m.status || "نشط";
  document.getElementById("mm-national-id").value = m.national_id || "";
  openM("m-member");
}

async function toggleMemberSource(){
  const source = document.getElementById("mm-source").value;
  const wrap = document.getElementById("mm-shareholder-picker-wrap");
  const nameField = document.getElementById("mm-name");
  const nationalIdField = document.getElementById("mm-national-id");
  if(source === "shareholder"){
    wrap.style.display = "block";
    nameField.disabled = true; nameField.style.background = "var(--gray1)";
    nationalIdField.disabled = true; nationalIdField.style.background = "var(--gray1)";
    const picker = document.getElementById("mm-shareholder-picker");
    const { data, error } = await sb.from("shareholders").select("id,name,national_id").eq("company_id", currentCompanyId).order("name",{ascending:true});
    if(error){ picker.innerHTML = '<option value="">تعذّر التحميل</option>'; return; }
    picker.innerHTML = '<option value="">— اختر —</option>' + (data||[]).map(s => `<option value="${s.id}" data-name="${orgEsc(s.name||'')}" data-national-id="${orgEsc(s.national_id||'')}">${orgEsc(s.name||'—')}</option>`).join("");
  } else {
    wrap.style.display = "none";
    nameField.disabled = false; nameField.style.background = "";
    nationalIdField.disabled = false; nationalIdField.style.background = "";
    nameField.value = ""; nationalIdField.value = "";
  }
}

function fillMemberFromShareholder(){
  const picker = document.getElementById("mm-shareholder-picker");
  const opt = picker.selectedOptions[0];
  if(!opt || !opt.value) return;
  document.getElementById("mm-name").value = opt.dataset.name || "";
  document.getElementById("mm-national-id").value = opt.dataset.nationalId || "";
}

async function saveMember(){
  const id = document.getElementById("mm-id").value;
  const name = document.getElementById("mm-name").value.trim();
  const position = document.getElementById("mm-position").value.trim();
  const position_level = document.getElementById("mm-position-level").value;
  const is_executive = document.getElementById("mm-executive").value;
  const committee_member = document.getElementById("mm-committee").value;
  const join_date = document.getElementById("mm-joindate").value || null;
  const status = document.getElementById("mm-status").value;
  const national_id = document.getElementById("mm-national-id").value.trim();
  if(!name){ alert("الرجاء إدخال اسم العضو"); return; }

  const payload = { name, position, position_level, is_executive, committee_member, join_date, status, national_id, company_id: currentCompanyId };
  const { error } = id
    ? await sb.from("board_members").update(payload).eq("id", id)
    : await sb.from("board_members").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }

  document.getElementById("mm-id").value = "";
  document.getElementById("mm-title").textContent = "👤 إضافة عضو مجلس إدارة";
  document.getElementById("mm-name").value = "";
  document.getElementById("mm-position").value = "";
  document.getElementById("mm-joindate").value = "";
  document.getElementById("mm-national-id").value = "";
  closeM("m-member");
  loadMembers();
}

/* ══════════ MEETINGS (routed by type) ══════════ */
const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fileCell(id, field, url){
  if(url){
    return `<div style="display:flex;gap:4px;align-items:center;justify-content:center">
      <a class="btn-xs primary" href="${url}" target="_blank" rel="noopener" title="تحميل"><span class="ico ico-inbox" style="width:16px;height:16px"></span></a>
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 6px;font-size:11px;cursor:pointer" title="حذف الملف" onclick="deleteMeetingFile(${id},'${field}')"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
    </div>`;
  }
  return `<label class="btn-xs primary" style="cursor:pointer;display:inline-block"><span class="ico-i ico-paperclip"></span>رفع<input type="file" style="display:none" onchange="uploadMeetingFile(${id},'${field}',this)"></label>`;
}

function renderMeetingRow(m){
  return `<tr>
    <td>${orgEsc(m.title || "")}</td>
    <td>${m.meeting_type || "—"}</td>
    <td>${m.meeting_date || "—"}</td>
    <td>${m.meeting_time || "—"}</td>
    <td>${m.method || "—"}</td>
    <td>${orgEsc(m.notes || "—")}</td>
    <td>${fileCell(m.id,'agenda_file_url',m.agenda_file_url)}</td>
    <td>${fileCell(m.id,'minutes_file_url',m.minutes_file_url)}</td>
    <td>${fileCell(m.id,'invitation_file_url',m.invitation_file_url)}</td>
    <td><button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deleteMeeting(${m.id})"><span class="ico-i ico-trash"></span>حذف</button></td>
  </tr>`;
}

async function uploadMeetingFile(id, field, inputEl){
  const url = await uploadFile(inputEl, "meetings");
  if(!url) return;
  const payload = {}; payload[field] = url;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeetingFile(id, field){
  if(!await uiConfirm("هل تريد حذف هذا الملف؟")) return;
  const payload = {}; payload[field] = null;
  const { error } = await sb.from("meetings").update(payload).eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}
async function deleteMeeting(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذا الاجتماع بالكامل؟")) return;
  const { error } = await sb.from("meetings").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadMeetingsAll();
}

/* ══════════ DASHBOARD (real data pulled from every page) ══════════ */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/* ══════════ NOTIFICATIONS (live-computed, no stored table — always fresh) ══════════ */
/* Generic "pick one" dropdown — reused for every consolidated export/edit button across the
   platform instead of one page having its own bespoke toggle logic. Closes on outside click. */
function toggleDD(id){
  document.querySelectorAll('.dd-menu.open').forEach(m => { if(m.id !== id) m.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.dd-wrap')) document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
});

function toggleNotifPanel(){
  const panel = document.getElementById("notifPanel");
  if(!panel) return;
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "block" : "none";
  if(opening) loadNotifications();
}
document.addEventListener('click', function(e){
  const panel = document.getElementById("notifPanel");
  if(!panel || panel.style.display === "none") return;
  if(!panel.contains(e.target) && !e.target.closest('.notif-btn')) panel.style.display = "none";
});

async function loadNotifications(){
  const list = document.getElementById("notifList");
  const dot = document.getElementById("notifDot");
  if(!list || !currentUserProfile) return;

  const role = getCurrentRole();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const items = [];

  // 0) Platform admin: new company registration requests awaiting review — this is a
  // platform-wide event, not scoped to whichever company is currently selected.
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(isPlatformAdmin){
    const { data: reqs } = await sb.from("company_requests").select("*").eq("status", "قيد المراجعة");
    (reqs||[]).forEach(r => { items.push({ icon:"🏢", text:`طلب إدراج شركة جديد: "${r.company_name}" ينتظر مراجعتك`, page:"companyrequests" }); });
  }

  // 1) Consultation requests needing your action
  if(role === 'مدير النظام' || role === 'رئيس مجلس'){
    const { data: cr } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId);
    (cr||[]).forEach(r => {
      if(role==='مدير النظام' && r.status==='جديد') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر عرض سعر منك`, page:"consultants" });
      if(role==='رئيس مجلس' && r.status==='عرض سعر مقدم') items.push({ icon:"💼", text:`طلب استشارة (${r.category}) ينتظر قرارك`, page:"consultants" });
    });
  }

  if(role !== 'مساهم'){
    // 2) Meeting requests needing your response
    const { data: mr } = await sb.from("meeting_requests").select("*").eq("company_id", currentCompanyId).eq("status","قيد الموافقة");
    if(mr && mr.length){
      const ids = mr.map(r=>r.id);
      const { data: myResponses } = await sb.from("meeting_request_responses").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const respondedIds = new Set((myResponses||[]).map(r=>r.request_id));
      mr.forEach(r => { if(!respondedIds.has(r.id)) items.push({ icon:"🗳️", text:`طلب اجتماع "${r.title}" ينتظر موافقتك على الموعد`, page:"meetings" }); });
    }

    // 3) Policy reviews needing your response
    const { data: pol } = await sb.from("policies").select("*").eq("company_id", currentCompanyId).eq("status","مرفوعة لمجلس الإدارة");
    if(pol && pol.length){
      const ids = pol.map(p=>p.id);
      const { data: myPolReviews } = await sb.from("policy_reviews").select("policy_id").in("policy_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPolReviews||[]).map(r=>r.policy_id));
      pol.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📜", text:`سياسة "${p.policy_name}" تنتظر رأيك`, page:"governance" }); });
    }

    // 4) Appointment requests needing your review
    const { data: ap } = await sb.from("appoint_requests").select("*").eq("company_id", currentCompanyId).eq("status","محال إلى مجلس الإدارة");
    if(ap && ap.length){
      const ids = ap.map(a=>a.id);
      const { data: myApReviews } = await sb.from("appoint_request_reviews").select("request_id").in("request_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myApReviews||[]).map(r=>r.request_id));
      ap.forEach(a => { if(!reviewedIds.has(a.id)) items.push({ icon:"👤", text:`طلب تعيين "${a.candidate_name}" ينتظر رأيك`, page:"appoint" }); });
    }

    // 5) Performance evaluations needing your input
    const { data: pe } = await sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId).eq("status","مفتوح للتقييم");
    if(pe && pe.length){
      const ids = pe.map(p=>p.id);
      const { data: myPeReviews } = await sb.from("performance_evaluation_reviews").select("evaluation_id").in("evaluation_id", ids).eq("reviewer_email", myEmail||"");
      const reviewedIds = new Set((myPeReviews||[]).map(r=>r.evaluation_id));
      pe.forEach(p => { if(!reviewedIds.has(p.id)) items.push({ icon:"📐", text:`تقييم أداء "${p.entity_name}" ينتظر تقييمك`, page:"perf" }); });
    }

    // 6) Documents needing your signature
    const { data: docs } = await sb.from("signing_documents").select("*").eq("company_id", currentCompanyId).neq("status","مكتمل");
    if(docs && docs.length){
      const ids = docs.map(d=>d.id);
      const { data: mySigs } = await sb.from("document_signatures").select("document_id").in("document_id", ids).eq("signer_email", myEmail||"");
      const signedIds = new Set((mySigs||[]).map(s=>s.document_id));
      docs.forEach(d => { if(!signedIds.has(d.id)) items.push({ icon:"✍️", text:`وثيقة "${d.document_name}" تنتظر توقيعك`, page:"signing" }); });
    }
  }

  // 7) Upcoming meetings within 3 days (everyone with page access)
  const { data: meetings } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId);
  const now = new Date();
  (meetings||[]).forEach(m => {
    if(!m.meeting_date) return;
    const days = Math.ceil((new Date(m.meeting_date) - now) / 86400000);
    if(days >= 0 && days <= 3){
      items.push({ icon:"📅", text:`${m.title||"اجتماع"} خلال ${days===0?'اليوم':(days+' يوم')}`, page: m.meeting_type==="الجمعية العامة"?"agm":(m.meeting_type==="اجتماع لجنة"?"committees":"meetings") });
    }
  });

  if(dot) dot.style.display = items.length ? "block" : "none";
  if(items.length===0){
    list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:16px">لا توجد تنبيهات حاليًا ✅</div>';
    return;
  }
  list.innerHTML = items.map(it => `
    <div onclick="document.getElementById('notifPanel').style.display='none';go('${it.page}',null)" style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" onmouseover="this.style.background='var(--offwhite)'" onmouseout="this.style.background='transparent'">
      <span style="font-size:15px">${it.icon}</span>
      <span style="font-size:12px;color:var(--dark);line-height:1.6">${it.text}</span>
    </div>`).join("");
}

function renderDashTopRisks(risks){
  const box = document.getElementById("dashTopRisks");
  if(!box) return;
  if(risks.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد مخاطر مسجّلة بعد.</div>'; return; }
  const severity = r => (r.impact==="عالٍ"?2:r.impact==="متوسط"?1:0) * 100 + (r.probability||0);
  const top = [...risks].sort((a,b)=>severity(b)-severity(a)).slice(0,5);
  box.innerHTML = top.map(r => {
    const color = riskSeverityColor(r.impact, r.probability);
    return `<div onclick="go('risks',null)" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray1);cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="font-size:12px;font-weight:600;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${orgEsc(r.risk_name||"")}</span>
      </div>
      <span style="font-size:10.5px;color:var(--gray3);flex-shrink:0">${r.impact||"—"} · ${r.probability!=null?r.probability+'%':'—'}</span>
    </div>`;
  }).join("");
}

function renderDashAuditStatus(items){
  const box = document.getElementById("dashAuditStatus");
  if(!box) return;
  if(items.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد بنود تدقيق مسجّلة بعد.</div>'; return; }
  const open = items.filter(i=>i.status==="مفتوحة").length;
  const inProgress = items.filter(i=>i.status==="قيد المتابعة").length;
  const closed = items.filter(i=>i.status==="مغلقة").length;
  const total = items.length;
  const pct = total ? Math.round((closed/total)*100) : 0;
  const openItems = items.filter(i=>i.status!=="مغلقة").slice(0,3);
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="font-size:26px;font-weight:900;color:var(--teal)">${pct}%</div>
      <div style="flex:1">
        <div style="height:8px;background:var(--offwhite);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--teal)"></div></div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">${closed} مغلقة · ${inProgress} قيد المتابعة · ${open} مفتوحة</div>
      </div>
    </div>
    ${openItems.map(i => `<div onclick="go('audit',null)" style="padding:6px 0;border-top:1px solid var(--gray1);cursor:pointer;font-size:11.5px;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔸 ${i.item||""}</div>`).join("")}
  `;
}

/* ══════════ PROACTIVE GOVERNANCE ALERTS ══════════
   Everything here is already tracked somewhere in the platform — this doesn't compute anything
   new, it just refuses to leave it as passive data someone has to remember to go dig for.
   Performance/attendance items are only ever included for viewers who canSeePerfResults() —
   the panel is shared infrastructure, but it never leaks a confidentiality-restricted signal
   to someone who wouldn't otherwise be allowed to see it. */
async function computeGovernanceAlerts(){
  const alerts = [];
  const govBodyLabel = getGovernanceBodyLabel();

  // 1) Performance trending down or stuck low across evaluation cycles
  if(await canSeePerfResults()){
    const { data: completed } = await sb.from("performance_evaluations").select("*")
      .eq("company_id", currentCompanyId).eq("status","مكتمل").not("evaluated_email","is",null).order("period",{ascending:true});
    const byPerson = {};
    (completed||[]).forEach(e => { if(!byPerson[e.evaluated_email]) byPerson[e.evaluated_email]=[]; byPerson[e.evaluated_email].push(e); });
    for(const email in byPerson){
      const evals = byPerson[email];
      if(evals.length < 2) continue;
      const scores = evals.map(e=>Number(e.score)||0);
      const last = scores[scores.length-1];
      const isDeclining = scores.every((s,i) => i===0 || s <= scores[i-1]) && scores[0] > last;
      const isConsistentlyLow = scores.slice(-Math.min(3,scores.length)).every(s => s < 3);
      if(isDeclining || isConsistentlyLow){
        alerts.push({
          severity: "high",
          text: `أداء "${evals[evals.length-1].entity_name}" ${isConsistentlyLow?'منخفض باستمرار':'في تراجع'} عبر ${evals.length} دورات تقييم — يستاهل نقاش لجنة الترشيحات${govBodyLabel==='مجلس الإدارة'?' أو رئيس المجلس':''}.`,
          page: "perf"
        });
      }
    }

    // 2) Real attendance rate below a healthy threshold
    try {
      const attendance = await computeAttendancePercentages();
      attendance.filter(a => a.pct !== null && a.pct < 60).forEach(a => {
        alerts.push({ severity: "medium", text: `نسبة حضور "${a.name}" الفعلية ${a.pct}% فقط — أقل من الحد الصحي المعتاد (60%).`, page: "perf" });
      });
    } catch(e){ console.error("attendance alert check failed", e); }
  }

  // 3) Policies stuck in an approval cycle past the company's own configured deadline
  try {
    const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
    const { data: allApprovals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).not("status","eq","مكتملة").not("status","eq","مرفوضة");
    const stuck = (allApprovals||[]).filter(a => (a.document_type||"").startsWith("policy_") && Math.floor((Date.now()-new Date(a.created_at).getTime())/86400000) > deadlineDays);
    if(stuck.length){
      alerts.push({ severity: "medium", text: `${stuck.length} ${stuck.length===1?'سياسة متأخرة':'سياسات متأخرة'} عن مهلة الاعتماد المحددة (${deadlineDays} يوم) — بانتظار خطوة من أحد الموقّعين.`, page: "governance" });
    }
  } catch(e){ console.error("policy deadline alert check failed", e); }

  // 4) High-impact risks that are still just "مراقبة" (i.e., no active treatment yet)
  try {
    const { data: risks } = await sb.from("risks").select("*").eq("company_id", currentCompanyId).eq("impact","عالٍ").eq("status","مراقبة");
    if(risks && risks.length){
      alerts.push({ severity: "high", text: `${risks.length} ${risks.length===1?'خطر عالي التأثير':'مخاطر عالية التأثير'} لسا بمرحلة "مراقبة" فقط — بلا خطة معالجة نشطة بعد.`, page: "risks" });
    }
  } catch(e){ console.error("risk alert check failed", e); }

  // 5) Board decisions past their target date with no completion yet
  try {
    const { data: decisions } = await sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).not("target_date","is",null).not("status","eq","منجز");
    const overdue = (decisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
    if(overdue.length){
      alerts.push({ severity: "high", text: `${overdue.length} ${overdue.length===1?'قرار مجلس متأخر':'قرارات مجلس متأخرة'} عن موعد التنفيذ المستهدف.`, page: "decisiontracking" });
    }
  } catch(e){ console.error("decision tracking alert check failed", e); }

  // 7) Corrective actions from governance assessments past their target date, not yet closed
  try {
    const { data: gaOpenActs } = await sb.from("governance_actions").select("id,target_date,status").eq("company_id", currentCompanyId).not("status","eq","مغلق").not("target_date","is",null);
    const gaLate = (gaOpenActs||[]).filter(x => new Date(x.target_date) < new Date(new Date().toDateString()));
    if(gaLate.length){
      alerts.push({ severity: "high", text: `${gaLate.length} ${gaLate.length===1?'إجراء تصحيحي متأخر':'إجراءات تصحيحية متأخرة'} عن موعدها من تقييم فعالية الحوكمة.`, page: "govassess" });
    }
  } catch(e){ console.error("corrective action alert check failed", e); }

  // 9) Join requests waiting for this company's approver
  if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){
    try {
      const { data: jr } = await sb.from("company_join_requests").select("id").eq("company_id", currentCompanyId).eq("status","قيد المراجعة");
      if(jr && jr.length) alerts.push({ severity: "high", text: `${jr.length} ${jr.length===1?'طلب انضمام ينتظر':'طلبات انضمام تنتظر'} موافقتك.`, page: "users" });
    } catch(e){ console.error("join request alert check failed", e); }
  }

  // 8) External compliance items past their deadline (a recurring one with a past date is unconfirmed)
  try {
    const { data: cmpRows } = await sb.from("compliance_items").select("id,status,due_date,frequency").eq("company_id", currentCompanyId);
    const cmpLate = (cmpRows||[]).filter(i => complianceDerivedStatus(i) === "متأخر").length;
    if(cmpLate){
      alerts.push({ severity: "high", text: `${cmpLate} ${cmpLate===1?'التزام نظامي متأخر':'التزامات نظامية متأخرة'} عن موعدها.`, page: "compliance" });
    }
  } catch(e){ console.error("compliance alert check failed", e); }

  // 6) Manager decisions (single-manager LLC) past their own target date, unfinished
  if(currentCompanyLLCSingleManager){
    try {
      const { data: mgrDecisions } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context","manager").not("target_date","is",null).not("status","eq","منجز");
      const overdueMgr = (mgrDecisions||[]).filter(d => new Date(d.target_date) < new Date(new Date().toDateString()));
      if(overdueMgr.length){
        alerts.push({ severity: "high", text: `${overdueMgr.length} ${overdueMgr.length===1?'قرار مدير متأخر':'قرارات مدير متأخرة'} عن موعد التنفيذ المستهدف.`, page: "managerdecisions" });
      }
    } catch(e){ console.error("manager decision alert check failed", e); }
  }

  return alerts;
}

async function renderGovAlertsPanel(){
  const panel = document.getElementById("govAlertsPanel");
  if(!panel) return;
  const alerts = await computeGovernanceAlerts();
  if(alerts.length === 0){ panel.style.display = "none"; return; }

  const sorted = [...alerts.filter(a=>a.severity==="high"), ...alerts.filter(a=>a.severity==="medium")];

  panel.style.display = "block";
  panel.innerHTML = `<div class="card" style="border-right:4px solid var(--gold);margin:0">
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="ico ico-bolt" style="width:18px;height:18px;color:var(--gold)"></span>
        <span style="font-weight:900;font-size:14px;color:var(--dark)">تنبيهات تستاهل انتباهكم (${alerts.length})</span>
      </div>
      ${sorted.map((a,i) => `<div onclick="go('${a.page}',null)" style="cursor:pointer;display:flex;align-items:flex-start;gap:9px;padding:9px 10px;background:${a.severity==='high'?'#FBEAEA':'#FEF3E2'};border-radius:8px;margin-bottom:7px">
        <span class="ico ico-${a.severity==='high'?'warning':'clock'}" style="width:15px;height:15px;color:${a.severity==='high'?'var(--red)':'var(--gold)'};flex-shrink:0;margin-top:2px"></span>
        <span style="font-size:12px;color:var(--dark);line-height:1.6">${a.text}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

/* Dashboard for entities that have no board: the meeting cards, "board members" and "committees"
   figures and the upcoming-meetings list describe things these companies don't have. Recent
   decisions replaces the meetings list so the card isn't just removed and left as a hole. */
async function applyDashboardEntityAdaptation(){
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const isLLC = currentCompanyType === "ذات مسؤولية محدودة";
  const noBoard = isSoleProp || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const hide = (id, on) => { const el = document.getElementById(id); const box = el ? (el.closest(".kpi") || el.closest(".sb-item")) : null; if(box) box.style.display = on ? "none" : ""; };

  hide("kpi-meetings-q", noBoard);
  hide("stat-members", noBoard);
  hide("stat-committees", noBoard || isLLC);
  const minutesLbl = document.getElementById("kpi-minutes") ? document.getElementById("kpi-minutes").closest(".kpi").querySelector(".kpi-label") : null;
  if(minutesLbl) minutesLbl.textContent = noBoard ? "وثائق موقّعة" : "محاضر معتمدة";
  const membersLbl = document.getElementById("stat-members") ? document.getElementById("stat-members").parentElement.querySelector(".sb-lbl") : null;
  if(membersLbl) membersLbl.textContent = `أعضاء ${getGovernanceBodyLabel()}`;

  const body = document.getElementById("dashUpcomingMeetings");
  const card = body ? body.closest(".card") : null;
  if(!card) return;
  const title = card.querySelector(".card-title");
  const btn = card.querySelector(".card-head button");
  if(!noBoard){
    if(title) title.innerHTML = '<span class="ico-i ico-calendar"></span>الاجتماعات القادمة';
    if(btn){ btn.setAttribute("onclick","go('meetings',null)"); btn.textContent = "عرض الكل"; btn.style.display = ""; }
    return;
  }
  const context = currentCompanyLLCSingleManager ? "manager" : "owner";
  const page = context === "manager" ? "managerdecisions" : "ownerdecisions";
  if(title) title.innerHTML = `<span class="ico-i ico-signature"></span>آخر قرارات ${context === "manager" ? "المدير" : "المالك"}`;
  if(btn){ btn.setAttribute("onclick", `go('${page}',null)`); btn.textContent = "عرض الكل"; btn.style.display = ""; }
  const { data } = await sb.from("simple_decisions").select("*").eq("company_id", currentCompanyId).eq("context", context).order("decision_date",{ascending:false}).limit(4);
  const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  body.innerHTML = (data && data.length)
    ? data.map(d => `<div style="padding:8px 0;border-bottom:1px solid var(--gray1)">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${esc(String(d.decision_text).slice(0,90))}${String(d.decision_text).length>90?"…":""}</div>
        <div style="font-size:11px;color:var(--gray3);margin-top:2px">${esc(d.decision_date)} · ${d.signed_at ? "موقَّع" : "غير موقَّع"}</div></div>`).join("")
    : `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد قرارات موثَّقة بعد.<br><button class="btn-xs primary" style="margin-top:8px" onclick="go('${page}',null)">توثيق قرار</button></div>`;
}

async function loadDashboard(){
  renderGovAlertsPanel(); // fire independently — a slow/failed alert check must never block the rest of the dashboard
  const [meetingsRes, risksRes, complianceRes, membersRes, committeesRes, signingRes, policiesRes, auditRes, govAssessRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("risks").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("policies").select("*").eq("company_id", currentCompanyId),
    sb.from("audit_items").select("*").eq("company_id", currentCompanyId),
    sb.from("governance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(1)
  ]);

  const meetings = meetingsRes.data || [];
  const risks = risksRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const members = membersRes.data || [];
  const committeesData = committeesRes.data || [];
  const signingDocs = signingRes.data || [];
  const policies = policiesRes.data || [];
  const auditItems = auditRes.data || [];

  const govassessKpiEl = document.getElementById("kpi-govassess");
  const govassessFootEl = document.getElementById("kpi-govassess-foot");
  const govassessStripeEl = document.getElementById("kpi-govassess-stripe");
  if(govassessKpiEl){
    const latestAssess = (govAssessRes.data||[])[0];
    if(latestAssess){
      const { finalScore } = computeGovScores(latestAssess);
      if(finalScore != null){
        const pct = Math.round((finalScore/5)*100);
        const interp = maturityInterpretation(finalScore);
        govassessKpiEl.textContent = pct + "%";
        govassessKpiEl.style.color = interp.color;
        if(govassessStripeEl) govassessStripeEl.style.background = interp.color;
        if(govassessFootEl) govassessFootEl.textContent = interp.label + " · " + (latestAssess.period||"");
      } else {
        govassessKpiEl.textContent = "—";
        if(govassessFootEl) govassessFootEl.textContent = "لا توجد معايير مُقيَّمة بعد";
      }
    } else {
      govassessKpiEl.textContent = "—";
      if(govassessFootEl) govassessFootEl.textContent = "لم يُجرَ تقييم بعد";
    }
  }
  renderDashTopRisks(risks);
  renderDashAuditStatus(auditItems);

  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);
  const currentQuarter = Math.floor(now.getMonth()/3);
  const currentYear = now.getFullYear();

  // ── KPI: meetings this quarter ──
  const quarterMeetings = meetings.filter(m => {
    if(!m.meeting_date) return false;
    const d = new Date(m.meeting_date);
    return d.getFullYear()===currentYear && Math.floor(d.getMonth()/3)===currentQuarter;
  });
  const completedQ = quarterMeetings.filter(m => m.meeting_date < todayStr).length;
  const upcomingQ = quarterMeetings.filter(m => m.meeting_date >= todayStr).length;
  setText("kpi-meetings-q", quarterMeetings.length);
  setText("kpi-meetings-q-foot", `✅ ${completedQ} مكتملة · ${upcomingQ} قادمة`);

  // ── KPI: approved minutes (fully-signed documents) ──
  const approvedDocs = signingDocs.filter(d => d.status === "مكتمل");
  const approvedThisMonth = approvedDocs.filter(d => d.created_at && new Date(d.created_at).getMonth()===now.getMonth() && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("kpi-minutes", approvedDocs.length);
  setText("kpi-minutes-foot", `↑ ${approvedThisMonth} هذا الشهر`);

  // ── KPI: compliance % ──
  const cmpSum = complianceSummary(compliance, await cmpLatestAssessment());
  setText("kpi-compliance", cmpSum.pct != null ? cmpSum.pct+"%" : "—");
  setText("kpi-compliance-foot", cmpSum.text);
  setText("stat-compliance2", cmpSum.pct != null ? cmpSum.pct+"%" : "—");

  // ── KPI: open risks ──
  const openRisks = risks.filter(r => r.status === "مراقبة" || r.status === "متابعة");
  const highOpenRisks = openRisks.filter(r => r.impact === "عالٍ").length;
  setText("kpi-risks", openRisks.length);
  setText("kpi-risks-foot", highOpenRisks ? `🔴 ${highOpenRisks} عالية الأولوية` : "لا مخاطر عالية حاليًا");

  // ── Stats bar ──
  setText("stat-members", members.length);
  setText("stat-committees", committeesData.length);
  const decisionsThisYear = signingDocs.filter(d => d.created_at && new Date(d.created_at).getFullYear()===currentYear).length;
  setText("stat-decisions", decisionsThisYear);
  setText("stat-pending-signs", signingDocs.filter(d => d.status !== "مكتمل").length);

  // ── Upcoming meetings (next 4, any type) ──
  const upcoming = meetings
    .filter(m => m.meeting_date && m.meeting_date >= todayStr)
    .sort((a,b) => (a.meeting_date||"").localeCompare(b.meeting_date||""))
    .slice(0,4);
  const upcomingBox = document.getElementById("dashUpcomingMeetings");
  if(upcomingBox){
    if(upcoming.length===0){
      upcomingBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد اجتماعات قادمة حاليًا.</div>';
    } else {
      upcomingBox.innerHTML = upcoming.map(m => {
        const d = new Date(m.meeting_date);
        const isEmergency = m.meeting_type === "اجتماع طارئ";
        const badge = isEmergency ? '<span class="badge urgent">طارئ</span>' : '<span class="badge done">مؤكد</span>';
        return `<div class="meet-item">
          <div class="meet-dt"><div class="meet-day">${d.getDate()}</div><div class="meet-mon">${AR_MONTHS[d.getMonth()]}</div></div>
          <div class="meet-info"><div class="meet-name">${orgEsc(m.title||"")}</div><div class="meet-meta"><span class="ico-i ico-pin"></span>${m.method||"—"}${m.meeting_time?(' · '+m.meeting_time):''} · ${m.meeting_type||""}</div></div>
          ${badge}
        </div>`;
      }).join("");
    }
  }

  // ── Executive alerts, generated from real conditions across the platform ──
  const alerts = [];
  if(upcoming.length){
    const next = upcoming[0];
    const daysAway = Math.ceil((new Date(next.meeting_date) - now) / 86400000);
    if(daysAway <= 7){
      alerts.push({ color:"red", text:`${next.title||"اجتماع"} مقرر خلال ${daysAway} ${daysAway===1?'يوم':'أيام'} — ${next.meeting_date}` });
    }
  }
  if(highOpenRisks){
    alerts.push({ color:"red", text:`يوجد ${highOpenRisks} ${highOpenRisks===1?'خطر مصنّف':'مخاطر مصنّفة'} عالية الأولوية تحتاج خطة معالجة` });
  }
  const pendingSignCount = signingDocs.filter(d => d.status !== "مكتمل").length;
  if(pendingSignCount){
    alerts.push({ color:"gold", text:`${pendingSignCount} ${pendingSignCount===1?'وثيقة تنتظر':'وثائق تنتظر'} التوقيع الإلكتروني` });
  }
  const recentlyApproved = approvedDocs
    .filter(d => d.created_at && (now - new Date(d.created_at)) < 7*86400000)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
  if(recentlyApproved){
    alerts.push({ color:"green", text:`تم اعتماد "${recentlyApproved.document_name}" بالتوقيع الإلكتروني من جميع الأطراف` });
  }
  const soonReview = policies
    .filter(p => p.review_date && (new Date(p.review_date)-now) < 30*86400000 && (new Date(p.review_date)-now) > 0)
    .sort((a,b)=> new Date(a.review_date)-new Date(b.review_date))[0];
  if(soonReview){
    const daysLeft = Math.ceil((new Date(soonReview.review_date)-now)/86400000);
    alerts.push({ color:"gold", text:`موعد مراجعة "${soonReview.policy_name}" خلال ${daysLeft} يومًا` });
  }
  const complianceGaps = compliance.filter(c => !complianceIsOk(c)).length;
  if(complianceGaps){
    alerts.push({ color:"gold", text:`${complianceGaps} ${complianceGaps===1?'بند امتثال':'بنود امتثال'} لم يكتمل بعد` });
  }

  const alertsBox = document.getElementById("dashAlerts");
  if(alertsBox){
    if(alerts.length===0){
      alertsBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد تنبيهات حاليًا. كل شي على ما يرام ✅</div>';
    } else {
      alertsBox.innerHTML = alerts.slice(0,6).map(a =>
        `<div class="alert-item"><div class="a-dot ${a.color}"></div><div><div class="a-text">${a.text}</div></div></div>`
      ).join("");
    }
  }
  applyDashboardEntityAdaptation();
}
function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

async function loadMeetingsAll(){
  const { data, error } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId).order("id", { ascending: false });
  if(error){
    return;
  }
  allMeetingsCache = data || [];

  const board = (data || []).filter(m => m.meeting_type === "اجتماع مجلس الإدارة الدوري" || m.meeting_type === "اجتماع طارئ");
  const committee = (data || []).filter(m => m.meeting_type === "اجتماع لجنة");
  const agm = (data || []).filter(m => m.meeting_type === "الجمعية العامة");

  renderMeetingCardsGroup(board, "board");
  renderMeetingCardsGroup(committee, "committee");
  renderAGMSection(agm);
  loadMeetingPlans();
}

