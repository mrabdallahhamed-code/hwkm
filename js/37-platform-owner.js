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
        sb.from("audit_requests").select("status,assigned_reviewer_email,pending_final_approval")
      ]);
      (rr.data||[]).forEach(x => { if(x.pending_final_approval) pendingApprove++; if(x.status === "تم الاستلام" && !x.assigned_consultant_email) pendingAssign++; });
      (ar.data||[]).forEach(x => { if(x.pending_final_approval) pendingApprove++; if(x.status === "تم الاستلام" && !x.assigned_reviewer_email) pendingAssign++; });
    }catch(e){}
    const soon = inTrial.filter(x => x.days <= 7).length;
    const subSoon = all.filter(c => !c.trial_ends_at && c.subscription_ends_at && Math.ceil((new Date(c.subscription_ends_at) - now)/86400000) <= 30).length;
    const unverified = all.filter(c => c.entity_verification !== "verified").length;
    const noCr = all.filter(c => !String(c.cr_number||"").trim()).length;
    const COLS = {"📥": "#D64545", "📝": "#E0752D", "⏳": "#D4A017", "🔔": "#7C5CC4", "🛡️": "#2D7A6B", "🪪": "#2F6FD0"};
    window._pdData = { all, inTrial, now };
    const act = (n, label, page, tone, ico) => `<div class="pd-act ${n ? tone : "ok"}" style="--c:${n ? COLS[ico] : "#27AE60"}" onclick="${page ? (page.startsWith("list:") ? `pdShowList('${page.slice(5)}')` : `go('${page}',null)`) : ""}"><span class="pd-act-ico">${n ? ico : "✓"}</span><div class="pd-act-n">${n}</div><div class="pd-act-l">${label}</div></div>`;
    actions.innerHTML = [
      act(pendingAssign, "طلبات جديدة بانتظار تكليف", "adminrequests", "red", "📥"),
      act(pendingApprove, "تقارير بانتظار اعتمادك", "adminrequests", "red", "📝"),
      act(soon, "تجارب تنتهي خلال 7 أيام", "list:trial", "amber", "⏳"),
      act(subSoon, "اشتراكات تنتهي خلال 30 يوم", "list:sub", "amber", "🔔"),
      act(unverified, "كيانات غير موثّقة", "list:unver", "amber", "🛡️"),
      act(noCr, "شركات بلا رقم سجل", "list:nocr", "amber", "🪪")
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

/* عند الضغط على بطاقة في مركز عمل المالك: تظهر الشركات المعنيّة فقط تحت البطاقات */
function pdShowList(kind){
  const d = window._pdData; const box = document.getElementById("pdFilterList"); if(!d || !box) return;
  const day = x => Math.ceil((new Date(x) - d.now) / 86400000);
  const T = {
    trial: ["⏳ تجارب تنتهي خلال 7 أيام", d.inTrial.filter(x => x.days <= 7).map(x => ({ c: x.c, note: `تنتهي بعد ${x.days} يوم` }))],
    sub: ["🔔 اشتراكات تنتهي خلال 30 يوم", d.all.filter(c => !c.trial_ends_at && c.subscription_ends_at && day(c.subscription_ends_at) <= 30).map(c => ({ c, note: day(c.subscription_ends_at) < 0 ? `انتهى منذ ${-day(c.subscription_ends_at)} يوم` : `ينتهي بعد ${day(c.subscription_ends_at)} يوم` }))],
    unver: ["🛡️ كيانات غير موثّقة", d.all.filter(c => c.entity_verification !== "verified").map(c => ({ c, note: "راجع السجل التجاري ثم وثّق من جدول التوثيق أدناه" }))],
    nocr: ["🪪 شركات بلا رقم سجل", d.all.filter(c => !String(c.cr_number||"").trim()).map(c => ({ c, note: "تواصل مع المسؤول لطلب رقم السجل" }))]
  }[kind];
  if(!T){ return; }
  const rows = T[1];
  box.style.display = "";
  box.innerHTML = `<div class="card" style="margin:12px 0"><div class="card-head"><span class="card-title">${T[0]} (${rows.length})</span><button class="btn-xs" onclick="document.getElementById('pdFilterList').style.display='none'">إغلاق</button></div><div class="card-body">${rows.length ? rows.map(({c, note}) => `<div class="pd-trial" style="margin-bottom:8px"><div class="pd-trial-main"><div class="pd-trial-name">${orgEsc(c.name)}</div><div class="pd-trial-meta">${orgEsc(c.company_type||"—")}${c.responsible_person ? " · " + orgEsc(c.responsible_person) : ""}${c.responsible_phone ? ` · <span style="direction:ltr;display:inline-block">${orgEsc(c.responsible_phone)}</span>` : ""}</div></div><div style="font-size:12px;font-weight:700;color:#B8610A">${note}</div></div>`).join("") : '<div class="pd-empty">لا توجد شركات.</div>'}</div></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    <td>${(() => { const n = String(c.cr_number||"").trim(); if(!n) return '<span class="pd-chip red">بلا رقم</span>'; return /^\d{10}$/.test(n) ? `<span style="direction:ltr;display:inline-block">${orgEsc(n)}</span> <button class="btn btn-ghost" style="font-size:10.5px;padding:2px 8px" onclick="crWathqCheck(this,'${n}')">استعلام وثّق</button><div class="cr-vmsg" style="display:none"></div>` : `<span style="direction:ltr;display:inline-block">${orgEsc(n)}</span> <span class="pd-chip red">غير صالح</span>`; })()}</td>
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
  const picked = [...document.querySelectorAll(".pts-mod-chk:checked")].map(c => c.value);
  if(!picked.length){ alert("اختر تخصصًا واحدًا على الأقل"); return; }
  const platform_team_module = picked.includes("حوكمة") ? "حوكمة" : picked.join("،");
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
