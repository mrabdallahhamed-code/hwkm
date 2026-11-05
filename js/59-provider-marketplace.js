/* ══════════ SERVICE PROVIDER MARKETPLACE (وساطة) ══════════ */
const SERVICE_STAGES = ["قيد المراجعة", "قيد التنفيذ", "مكتمل"];
let providersCache = [];

const PROVIDER_CATEGORIES = [
  "المراجعة والاستشارات القانونية","مكاتب المحاماة","الاستشارات الإدارية","المراجعة والمحاسبة",
  "الاستشارات المالية والضريبية","الموارد البشرية والتدريب","تقنية المعلومات والأمن السيبراني","أخرى"
];
let providerCatFilter = "الكل";
const provCat = p => (p.category && String(p.category).trim()) || "أخرى";
const provDate = d => d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory') : "";

// Company-facing directory: name, category, services, short profile, founding date and a request button.
// Phone, email and CR number are never shown here (phone/email live in a table only the platform team can read).
async function loadServiceProviders(privileged){
  const grid = document.getElementById("providersGrid");
  if(!grid) return;
  const { data, error } = await sb.from("service_providers").select("id,entity_name,service_provided,activity_type,category,about,founded_on,is_active").order("entity_name",{ascending:true});
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${orgEsc(error.message)}</div>`; return; }
  providersCache = (data || []).filter(p => p.is_active !== false);
  renderProviderDirectory(privileged);
}

function setProviderCat(cat){ providerCatFilter = cat; renderProviderDirectory(isPlatformPrivilegedUser()); }

function renderProviderDirectory(privileged){
  const grid = document.getElementById("providersGrid");
  const catsBox = document.getElementById("providerCats");
  if(!grid) return;
  if(providersCache.length===0){
    if(catsBox) catsBox.innerHTML = "";
    grid.innerHTML = `<div class="dir-empty">لا توجد جهات خدمة متاحة حاليًا. سيضيف فريق حوكم الجهات المعتمدة هنا.</div>`;
    return;
  }
  const counts = {}; providersCache.forEach(p => { const c = provCat(p); counts[c] = (counts[c]||0)+1; });
  const cats = Object.keys(counts).sort((a,b) => (PROVIDER_CATEGORIES.indexOf(a)+99*(PROVIDER_CATEGORIES.indexOf(a)<0)) - (PROVIDER_CATEGORIES.indexOf(b)+99*(PROVIDER_CATEGORIES.indexOf(b)<0)));
  if(providerCatFilter !== "الكل" && !counts[providerCatFilter]) providerCatFilter = "الكل";
  if(catsBox) catsBox.innerHTML = [`<button class="dir-chip ${providerCatFilter==='الكل'?'on':''}" onclick="setProviderCat('الكل')">الكل (${providersCache.length})</button>`]
    .concat(cats.map(c => `<button class="dir-chip ${providerCatFilter===c?'on':''}" data-cat="${orgEsc(c)}" onclick="setProviderCat(this.dataset.cat)">${orgEsc(c)} (${counts[c]})</button>`)).join("");

  const canRequest = !privileged && isFullAccessRole(getCurrentRole());
  const list = providersCache.filter(p => providerCatFilter === "الكل" || provCat(p) === providerCatFilter);
  grid.innerHTML = list.map(p => `<div class="prov-card">
    <div class="prov-top">
      <div class="prov-av">${orgEsc((p.entity_name||"؟").trim().charAt(0))}</div>
      <div style="min-width:0">
        <div class="prov-name">${orgEsc(p.entity_name||"")}</div>
        <span class="prov-cat">${orgEsc(provCat(p))}</span>
      </div>
    </div>
    ${p.service_provided ? `<div class="prov-row"><b>الخدمات:</b> ${orgEsc(p.service_provided)}</div>` : ""}
    ${p.about ? `<p class="prov-about">${orgEsc(p.about)}</p>` : ""}
    ${p.founded_on ? `<div class="prov-meta"><span class="ico-i ico-calendar"></span>تاريخ التأسيس: ${provDate(p.founded_on)}</div>` : ""}
    ${canRequest ? `<button class="btn-xs gold pol-cta" onclick="requestService(${p.id})"><span class="ico-i ico-handshake"></span>طلب الخدمة</button>` : ""}
  </div>`).join("");
}

function openProvidersAdmin(){ go('adminrequests', null); setTimeout(() => switchAdminRequestsTab('providers'), 150); }

/* ── Management (platform owner + platform team only; also enforced by database policies) ── */
let providersAdminCache = [];
async function loadProvidersAdmin(){
  const tbody = document.getElementById("providersAdminTbody");
  if(!tbody) return;
  const [{ data: provs, error }, { data: contacts }] = await Promise.all([
    sb.from("service_providers").select("*").order("id",{ascending:false}),
    sb.from("service_provider_contacts").select("*")
  ]);
  if(error){ tbody.innerHTML = errorRowHTML(7, error.message); return; }
  const contactById = {}; (contacts||[]).forEach(c => { contactById[c.provider_id] = c; });
  providersAdminCache = (provs||[]).map(p => ({ ...p, _contact: contactById[p.id] || {} }));
  const filter = (document.getElementById("providersAdminCat")||{}).value || "";
  const rows = providersAdminCache.filter(p => !filter || provCat(p) === filter);
  const catSel = document.getElementById("providersAdminCat");
  if(catSel && catSel.options.length <= 1){
    const all = Array.from(new Set(PROVIDER_CATEGORIES.concat(providersAdminCache.map(provCat))));
    catSel.innerHTML = '<option value="">كل الفئات</option>' + all.map(c => `<option>${orgEsc(c)}</option>`).join("");
    catSel.value = filter;
  }
  if(rows.length===0){ tbody.innerHTML = emptyRowHTML(7, "لا توجد جهات بعد. اضغط «+ إضافة جهة» للبدء."); }
  else tbody.innerHTML = rows.map(p => `<tr>
    <td><b>${orgEsc(p.entity_name||"")}</b>${p.founded_on ? `<div style="font-size:11px;color:var(--gray3)">تأسست: ${provDate(p.founded_on)}</div>` : ""}</td>
    <td>${orgEsc(provCat(p))}</td>
    <td style="max-width:220px">${orgEsc(p.service_provided||"—")}</td>
    <td dir="ltr" style="text-align:right">${orgEsc(p._contact.phone||"—")}</td>
    <td dir="ltr" style="text-align:right">${orgEsc(p._contact.email||"—")}</td>
    <td><span class="mc-pill ${p.is_active===false?'over':''}" style="margin:0">${p.is_active===false ? 'موقوفة' : 'نشطة'}</span></td>
    <td style="white-space:nowrap">
      <button class="btn-xs primary" onclick="openProviderEditor(${p.id})"><span class="ico-i ico-edit"></span>تعديل</button>
      <button class="btn-xs sec" onclick="toggleProviderActive(${p.id})">${p.is_active===false ? 'تفعيل' : 'إيقاف'}</button>
      <button class="btn-xs dng" onclick="deleteServiceProvider(${p.id})"><span class="ico-i ico-trash"></span>حذف</button>
    </td>
  </tr>`).join("");
  loadServiceRequestsAdmin();
}

function openProviderEditor(id){
  const p = id ? providersAdminCache.find(x => x.id === id) : null;
  const c = p ? p._contact : {};
  document.getElementById("mpv-id").value = p ? p.id : "";
  document.getElementById("mpv-title").textContent = p ? "تعديل جهة" : "إضافة جهة";
  document.getElementById("mpv-name").value = p ? (p.entity_name||"") : "";
  document.getElementById("mpv-category").value = p ? provCat(p) : "";
  document.getElementById("mpv-service").value = p ? (p.service_provided||"") : "";
  document.getElementById("mpv-about").value = p ? (p.about||"") : "";
  document.getElementById("mpv-founded").value = p && p.founded_on ? String(p.founded_on).slice(0,10) : "";
  document.getElementById("mpv-phone").value = c.phone || "";
  document.getElementById("mpv-email").value = c.email || "";
  document.getElementById("mpv-cr").value = p ? (p.cr_number||"") : "";
  document.getElementById("mpv-active").checked = p ? p.is_active !== false : true;
  const dl = document.getElementById("mpv-cats");
  if(dl && !dl.options.length) dl.innerHTML = PROVIDER_CATEGORIES.map(c => `<option value="${orgEsc(c)}">`).join("");
  openM("m-provider-add");
}

async function saveServiceProvider(){
  const id = document.getElementById("mpv-id").value;
  const entity_name = document.getElementById("mpv-name").value.trim();
  if(!entity_name){ alert("الرجاء إدخال اسم الجهة"); return; }
  const category = document.getElementById("mpv-category").value.trim();
  if(!category){ alert("الرجاء اختيار فئة الجهة"); return; }
  const payload = {
    entity_name, category,
    service_provided: document.getElementById("mpv-service").value.trim(),
    about: document.getElementById("mpv-about").value.trim() || null,
    founded_on: document.getElementById("mpv-founded").value || null,
    cr_number: document.getElementById("mpv-cr").value.trim(),
    is_active: document.getElementById("mpv-active").checked
  };
  const phone = document.getElementById("mpv-phone").value.trim() || null;
  const email = document.getElementById("mpv-email").value.trim() || null;
  let providerId = id ? Number(id) : null;
  if(providerId){
    const { error } = await sb.from("service_providers").update(payload).eq("id", providerId);
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  } else {
    const { data, error } = await sb.from("service_providers").insert([payload]).select("id").single();
    if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
    providerId = data.id;
  }
  const { error: cErr } = await sb.from("service_provider_contacts").upsert([{ provider_id: providerId, phone, email, updated_at: new Date().toISOString() }], { onConflict: "provider_id" });
  if(cErr){ alert("حُفظت بيانات الجهة، لكن تعذّر حفظ الجوال والإيميل: " + cErr.message); }
  closeM("m-provider-add");
  loadProvidersAdmin();
}

async function toggleProviderActive(id){
  const p = providersAdminCache.find(x => x.id === id); if(!p) return;
  const { error } = await sb.from("service_providers").update({ is_active: p.is_active === false }).eq("id", id);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  loadProvidersAdmin();
}

async function deleteServiceProvider(id){
  if(!await uiConfirm("حذف هذه الجهة نهائيًا من الدليل؟ (يمكنك إيقافها بدل الحذف)")) return;
  const { error } = await sb.from("service_providers").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadProvidersAdmin();
}

// Incoming requests from companies — the HWKM team follows these up and contacts the company.
async function loadServiceRequestsAdmin(){
  const tbody = document.getElementById("serviceRequestsAdminTbody");
  if(!tbody) return;
  const [{ data: reqs, error }, { data: companies }] = await Promise.all([
    sb.from("service_requests").select("*").order("created_at",{ascending:false}),
    sb.from("companies").select("id,name")
  ]);
  if(error){ tbody.innerHTML = errorRowHTML(5, error.message); return; }
  const cname = {}; (companies||[]).forEach(c => { cname[c.id] = c.name; });
  const rows = reqs || [];
  if(rows.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد طلبات واردة بعد."); return; }
  tbody.innerHTML = rows.map(r => {
    const prov = providersAdminCache.find(p => p.id === r.provider_id);
    return `<tr style="cursor:pointer" onclick="openServiceTrackingModal(${r.id})">
      <td>${orgEsc(cname[r.company_id]||"—")}<div style="font-size:11px;color:var(--gray3)">${orgEsc(r.requested_by_name||"")}</div></td>
      <td>${orgEsc(prov ? prov.entity_name : "—")}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</td>
      <td>${orgEsc(r.status||"—")}</td>
      <td><button class="btn-xs primary" onclick="event.stopPropagation();openServiceTrackingModal(${r.id})"><span class="ico-i ico-search"></span>متابعة</button></td>
    </tr>`;
  }).join("");
}

async function requestService(providerId){
  const prov = providersCache.find(p => p.id === providerId);
  if(!await uiConfirm(`إرسال طلب خدمة (${prov ? prov.entity_name : "هذه الجهة"}) إلى فريق حوكم؟ سيتواصل معكم الفريق لإكمال الطلب.`)) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const requested_by_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { error } = await sb.from("service_requests").insert([{
    provider_id: providerId, requested_by_name, requested_by_email: myEmail, status: SERVICE_STAGES[0], company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  await notifyOwnerNewRequest("طلب خدمة من مزوّد جديد", [["اسم الطالب", requested_by_name],["رقم المزوّد", providerId]]);
  alert("وصل طلبك إلى فريق حوكم، وسيتواصلون معكم قريبًا.");
  loadAllRequestsHistory(false);
}

async function loadAllRequestsHistory(isPlatformOwner){
  const tbody = document.getElementById("allRequestsHistoryTbody");
  if(!tbody) return;

  if(isPlatformOwner){
    const [{ data: serviceData, error: serviceErr }, { data: companies }] = await Promise.all([
      sb.from("service_requests").select("*").order("created_at",{ascending:false}),
      sb.from("companies").select("id,name")
    ]);
    if(serviceErr){ tbody.innerHTML = errorRowHTML(5, serviceErr.message); return; }
    const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
    const rows = serviceData || [];
    if(rows.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد طلبات واردة بعد."); return; }
    tbody.innerHTML = rows.map(r => {
      const provider = providersCache.find(p => p.id === r.provider_id);
      return `<tr style="cursor:pointer" onclick="openServiceTrackingModal(${r.id})">
        <td>${companyNameById[r.company_id]||"—"}</td>
        <td>${orgEsc(provider ? provider.entity_name : "—")}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</td>
        <td>${r.status||"—"}</td>
        <td><button class="btn-xs primary" onclick="event.stopPropagation();openServiceTrackingModal(${r.id})"><span class="ico-i ico-search"></span>تتبع/توجيه</button></td>
      </tr>`;
    }).join("");
    return;
  }

  const [{ data: consultData, error: consultErr }, { data: serviceData, error: serviceErr }] = await Promise.all([
    sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId),
    sb.from("service_requests").select("*").eq("company_id", currentCompanyId)
  ]);
  if(consultErr || serviceErr){ tbody.innerHTML = errorRowHTML(5, (consultErr||serviceErr).message); return; }

  const combined = [
    ...(consultData||[]).map(r => ({ kind:"استشارة", label:r.category, date:r.created_at, status:r.status, id:r.id })),
    ...(serviceData||[]).map(r => {
      const provider = providersCache.find(p => p.id === r.provider_id);
      return { kind:"وساطة", label: provider ? provider.entity_name : "—", date:r.created_at, status:r.status, id:r.id };
    })
  ].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

  if(combined.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد طلبات سابقة بعد."); return; }

  tbody.innerHTML = combined.map(r => {
    const action = r.kind === "استشارة"
      ? `onclick="openConsultDetailModal(${r.id})"`
      : `onclick="openServiceTrackingModal(${r.id})"`;
    const btnLabel = r.kind === "استشارة" ? "📄 التفاصيل" : "🔎 تتبع";
    return `<tr style="cursor:pointer" ${action}>
      <td>${r.kind}</td>
      <td>${r.label}</td>
      <td>${r.date ? new Date(r.date).toLocaleDateString('ar-SA-u-ca-gregory') : "—"}</td>
      <td>${r.status||"—"}</td>
      <td><button class="btn-xs primary" onclick="event.stopPropagation();${r.kind==='استشارة'?`openConsultDetailModal(${r.id})`:`openServiceTrackingModal(${r.id})`}">${btnLabel}</button></td>
    </tr>`;
  }).join("");
}

function openConsultDetailModal(id){
  const r = consultRequestsCache.find(x => x.id === id);
  const box = document.getElementById("mcd-body");
  if(!r){ box.innerHTML = '<div style="color:var(--gray3)">تعذّر إيجاد تفاصيل هذا الطلب.</div>'; openM("m-consult-detail"); return; }
  box.innerHTML = `
    <div><b>الفئة:</b> ${orgEsc(r.category||"—")}</div>
    <div><b>التفاصيل:</b> ${r.details||"—"}</div>
    <div><b>مقدَّم من:</b> ${orgEsc(r.requested_by_name||"—")}</div>
    <div><b>الحالة:</b> ${r.status||"—"}</div>
    ${r.quote_amount ? `<div><b>عرض السعر:</b> ${Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')} ريال${r.quote_notes?(' — '+r.quote_notes):''}</div>` : ""}
    ${r.quoted_by ? `<div><b>قدَّم العرض:</b> ${r.quoted_by}</div>` : ""}
    ${r.decision_by ? `<div><b>القرار من:</b> ${r.decision_by}${r.decision_at ? (' — '+new Date(r.decision_at).toLocaleDateString('ar-SA-u-ca-gregory')) : ''}</div>` : ""}
  `;
  openM("m-consult-detail");
}

let currentTrackingRequestId = null;
async function openServiceTrackingModal(requestId){
  currentTrackingRequestId = requestId;
  const { data: r, error } = await sb.from("service_requests").select("*").eq("id", requestId).single();
  if(error || !r){ alert("تعذّر تحميل بيانات الطلب"); return; }
  const provider = providersCache.find(p => p.id === r.provider_id);

  document.getElementById("mst-track-title").textContent = "🔎 تتبع الطلب — " + (provider ? provider.entity_name : "");
  document.getElementById("mst-track-meta").innerHTML = `مقدَّم من: ${r.requested_by_name||"—"} · ${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : ''}`;

  const currentIdx = SERVICE_STAGES.indexOf(r.status);
  document.getElementById("mst-track-stepper").innerHTML = `<div style="display:flex;align-items:center">
    ${SERVICE_STAGES.map((stage,i) => {
      const done = i < currentIdx, active = i === currentIdx;
      const dotColor = done ? "var(--green)" : active ? "var(--primary)" : "var(--gray1)";
      const lineColor = i < currentIdx ? "var(--green)" : "var(--gray1)";
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:${i<SERVICE_STAGES.length-1?'1':'0'}">
        <div style="display:flex;align-items:center;width:100%">
          <div style="width:14px;height:14px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
          ${i<SERVICE_STAGES.length-1 ? `<div style="flex:1;height:3px;background:${lineColor}"></div>` : ""}
        </div>
        <div style="font-size:10px;color:var(--gray3);margin-top:4px;white-space:nowrap">${stage}</div>
      </div>`;
    }).join("")}
  </div>`;

  const advanceBox = document.getElementById("mst-track-advance");
  const canAdvance = isPlatformPrivilegedUser();
  if(canAdvance && currentIdx >= 0 && currentIdx < SERVICE_STAGES.length-1){
    advanceBox.innerHTML = `<button class="btn btn-gold" style="width:100%" onclick="advanceServiceRequest()">⏩ نقل إلى: ${SERVICE_STAGES[currentIdx+1]}</button>`;
  } else {
    advanceBox.innerHTML = "";
  }
  const contactBox = document.getElementById("mst-track-contact");
  if(contactBox){
    contactBox.innerHTML = "";
    if(isPlatformPrivilegedUser()){
      const { data: ct } = await sb.from("service_provider_contacts").select("*").eq("provider_id", r.provider_id).maybeSingle();
      contactBox.innerHTML = `<div style="background:var(--offwhite);border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;font-size:12px;line-height:2"><b>تواصل الجهة (لفريق حوكم فقط):</b><br>الجوال: <span dir="ltr">${orgEsc((ct&&ct.phone)||"—")}</span><br>الإيميل: <span dir="ltr">${orgEsc((ct&&ct.email)||"—")}</span></div>`;
    }
  }
  openM("m-service-tracking");
}

async function advanceServiceRequest(){
  const requestId = currentTrackingRequestId;
  if(!requestId) return;
  const { data: r } = await sb.from("service_requests").select("*").eq("id", requestId).single();
  if(!r) return;
  const idx = SERVICE_STAGES.indexOf(r.status);
  if(idx === -1 || idx >= SERVICE_STAGES.length-1) return;
  const { error } = await sb.from("service_requests").update({ status: SERVICE_STAGES[idx+1] }).eq("id", requestId);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  openServiceTrackingModal(requestId);
  loadAllRequestsHistory();
}
