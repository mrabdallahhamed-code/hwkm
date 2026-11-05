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
