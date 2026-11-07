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
  document.getElementById("mco-tadawul").value = "";
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
  document.getElementById("mco-tadawul").value = c.tadawul_symbol || "";
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

  const tdwSym = normTadawul(document.getElementById("mco-tadawul").value);
  if(tdwSym && !/^\d{4}$/.test(tdwSym)){ alert("رمز تداول يجب أن يكون 4 أرقام."); return; }
  const payload = { tadawul_symbol: tdwSym || null, name, company_type, cr_number, cr_date, business_activity, company_size, responsible_person, responsible_phone, responsible_email, total_capital, total_shares, share_nominal_value, seal_position, llc_single_manager, llc_single_owner };
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
/* انتهت التجربة بلا اشتراك فعّال: يدخل العميل لكن كل شيء مقفل ما عدا صفحة «اشتراكي» (تواصل معنا). مالك المنصة مستثنى. */
let currentCompanyLocked = false;
let currentCompanyExpiredRaw = false; // التجربة منتهية فعلًا (قبل استثناء مالك المنصة)
function computeTrialExpired(c){
  if(!c || !c.trial_ends_at || new Date(c.trial_ends_at) > new Date()) return false;
  if(c.converted_to_paid_at) return false;
  if(c.subscription_ends_at && new Date(c.subscription_ends_at) > new Date()) return false;
  return true;
}
function applySubscriptionLock(expired){
  currentCompanyExpiredRaw = !!expired;
  currentCompanyLocked = !!expired && !(currentUserProfile && currentUserProfile.is_platform_admin === true);
  try{ document.body.classList.toggle("sub-locked", currentCompanyLocked); }catch(e){}
}
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
  if(currentCompanyLocked){ const b0 = document.getElementById("trialBanner"); if(b0) b0.remove(); updateBannerOffset(); return; }
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
  const dkey = "hwkm_tb_" + currentCompanyId;
  let dismissed = false; try{ dismissed = sessionStorage.getItem(dkey) === "1"; }catch(e){}
  if(!msg || dismissed){ if(banner) banner.remove(); updateBannerOffset(); return; }
  if(!banner){
    banner = document.createElement("div");
    banner.id = "trialBanner";
    banner.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;font-size:12px;font-weight:600;padding:6px 12px;position:sticky;top:0;z-index:400;border-bottom:1px solid";
    const appWrapper = document.getElementById("appWrapper");
    appWrapper.insertBefore(banner, appWrapper.firstChild);
  }
  banner.style.background = warn ? "#FFF3E6" : "#EEF3FA";
  banner.style.color = warn ? "#8A4B12" : "#1D3E64";
  banner.style.borderBottomColor = warn ? "#F0D2B0" : "#D3DEEE";
  banner.innerHTML = `<span style="cursor:pointer" onclick="dismissTrialBanner();openMySubscription()">${msg} — <u>التفاصيل</u></span><button type="button" aria-label="إغلاق" onclick="dismissTrialBanner()" style="border:none;background:none;color:inherit;font-size:15px;cursor:pointer;line-height:1;opacity:.7">✕</button>`;
  updateBannerOffset();
  // يظهر عند الدخول ثم يختفي وحده بعد لحظات
  clearTimeout(window._tbTimer);
  window._tbTimer = setTimeout(() => { try{ dismissTrialBanner(); }catch(e){} }, 9000);
}
function dismissTrialBanner(){
  try{ sessionStorage.setItem("hwkm_tb_" + currentCompanyId, "1"); }catch(e){}
  const b = document.getElementById("trialBanner"); if(b) b.remove();
  updateBannerOffset();
}

/* بطاقات الباقات (4): التجربة + الباقات الثلاث. الأسعار عبر التواصل */
function renderPlanCards(){
  const wa = "https://wa.me/966509015864";
  const card = (key, name, label, desc, items, cta) => `<div class="pk-card pk-${key}">
    <div class="pk-head"><div class="pk-label">${label}</div><div class="pk-name">${name}</div><div class="pk-desc">${desc}</div></div>
    <div class="pk-body"><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>
    <a class="pk-cta" href="${wa}" target="_blank" rel="noopener">${cta}</a></div></div>`;
  return `<div class="pd-sec">الباقات</div><div class="pk-grid">
    ${card("trial","فترة تجريبية","مجانية · للاطلاع فقط","14 يومًا للتعرّف على مميزات المنصة وتجربتها. لا تتضمن تنفيذ خدمات.",["كل وحدات المنصة مفتوحة للاستكشاف","بلا بطاقة دفع","الخدمات المدفوعة (مراجعة، تقييم مخاطر) بعرض سعر مستقل"],"استفسر عن الباقات")}
    ${card("self","ذاتي","تشغيل ذاتي","تدير المنصة بنفسك بالكامل بكل ما فيها.",["الحوكمة والاجتماعات","إدارة المخاطر","المراجعة الداخلية"],"الأسعار: تواصل معنا")}
    ${card("managed","مدار","حوكمة مؤسسية","حوكمة مؤسسية مصمّمة حسب طبيعة كيانك.",["تُحدَّد حسب نوع كيانك وحجمه","إدارة الحوكمة من فريقنا"],"الأسعار: تواصل معنا")}
    ${card("partner","شريك","الباقة الشاملة · الأكثر اكتمالًا","كل ما في مدار، مع كل خدمات المنصة.",["الحوكمة المؤسسية حسب كيانك","كل وحدات المنصة: الحوكمة والاجتماعات والمخاطر والمراجعة الداخلية","موظف حوكمة مخصّص يعمل كمدير علاقة لشركتك"],"الأسعار: تواصل معنا")}
  </div><div class="pk-note">للأسعار أو الاشتراك: واتساب 0509015864 · info@hwkm.net</div>`;
}

function openMySubscription(){ go('mysub', document.getElementById('navMySub')); }
function renderMySubscription(){
  const s = currentCompanySub, b = document.getElementById("mySubBody");
  if(!b) return;
  const fmt = d => d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory",{year:"numeric",month:"long",day:"numeric"}) : "—";
  const cell = (l,v) => `<div class="ms-cell"><span>${l}</span><b>${v}</b></div>`;
  let tone = "gray", badge = "لا يوجد اشتراك", big = "—", bigl = "", cells = "", note = "";
  if(!s){ note = "تعذّر تحميل بيانات الاشتراك."; }
  else if(s.expiredTrial && currentCompanyLocked){
    tone = "red"; badge = "🔒 انتهت فترتك التجريبية"; big = "—"; bigl = "";
    cells = cell("انتهت في", fmt(s.expiredTrial)) + cell("حالة الحساب","مقفل حتى تفعيل الاشتراك");
    note = "بياناتك محفوظة بالكامل ولن تُحذف. تواصل معنا لتفعيل الاشتراك وسنعيد لك الوصول فورًا.";
  }
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
    ${(!s || !(s.paid || s.ends) || (s.expiredTrial && currentCompanyLocked)) ? renderPlanCards() : ""}
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
  const trialExpired = computeTrialExpired(c);
  if(currentCompanySub) currentCompanySub.expiredTrial = trialExpired ? c.trial_ends_at : null;
  applySubscriptionLock(trialExpired);
  renderTrialBanner();
  renderCrBanner();
  if(currentCompanyLocked && currentPageId !== "mysub"){ try{ go('mysub', document.getElementById('navMySub')); }catch(e){} }
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

