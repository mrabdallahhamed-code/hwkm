async function runGlobalSearch(q){
  const box = document.getElementById("globalSearchResults");
  if(!box || !currentCompanyId) return;
  box.style.display = "block";
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">جارِ البحث...</div>';

  const like = `%${q}%`;
  const [members, meetings, policies, risks, committees, archive, shareholders, structure, signing] = await Promise.all([
    sb.from("board_members").select("id,name").eq("company_id",currentCompanyId).ilike("name", like).limit(5),
    sb.from("meetings").select("id,title").eq("company_id",currentCompanyId).ilike("title", like).limit(5),
    sb.from("policies").select("id,policy_name").eq("company_id",currentCompanyId).ilike("policy_name", like).limit(5),
    sb.from("risks").select("id,risk_name").eq("company_id",currentCompanyId).ilike("risk_name", like).limit(5),
    sb.from("committees").select("id,committee_name").eq("company_id",currentCompanyId).ilike("committee_name", like).limit(5),
    sb.from("archive_documents").select("id,document_name").eq("company_id",currentCompanyId).ilike("document_name", like).limit(5),
    sb.from("shareholders").select("id,name").eq("company_id",currentCompanyId).ilike("name", like).limit(5),
    sb.from("org_structure").select("id,position_title,holder_name").eq("company_id",currentCompanyId).or(`position_title.ilike.${like},holder_name.ilike.${like}`).limit(5),
    sb.from("signing_documents").select("id,document_name").eq("company_id",currentCompanyId).ilike("document_name", like).limit(5)
  ]);

  const groups = [
    { label:"أعضاء المجلس", icon:"👤", page:"members", items:(members.data||[]).map(r=>r.name) },
    { label:"الاجتماعات", icon:"📅", page:"meetings", items:(meetings.data||[]).map(r=>r.title) },
    { label:"السياسات", icon:"📜", page:"governance", items:(policies.data||[]).map(r=>r.policy_name) },
    { label:"المخاطر", icon:"⚠️", page:"risks", items:(risks.data||[]).map(r=>r.risk_name) },
    { label:"اللجان", icon:"🏛️", page:"committees", items:(committees.data||[]).map(r=>r.committee_name) },
    { label:"الأرشيف", icon:"🗄️", page:"archive", items:(archive.data||[]).map(r=>r.document_name) },
    { label:"المساهمون", icon:"📇", page:"shareholders", items:(shareholders.data||[]).map(r=>r.name) },
    { label:"الهيكل التنظيمي", icon:"🌳", page:"structure", items:(structure.data||[]).map(r=>r.position_title+(r.holder_name?(' — '+r.holder_name):'')) },
    { label:"التوقيع الإلكتروني", icon:"✍️", page:"signing", items:(signing.data||[]).map(r=>r.document_name) }
  ].filter(g => g.items.length > 0);

  if(groups.length === 0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد نتائج مطابقة.</div>';
    return;
  }

  box.innerHTML = groups.map(g => `
    <div style="padding:8px 8px 4px;font-size:10.5px;font-weight:700;color:var(--gray3)">${g.icon} ${g.label}</div>
    ${g.items.map(item => `<div onclick="go('${g.page}',null);closeGlobalSearch()" style="padding:8px 10px;font-size:12.5px;color:var(--dark);cursor:pointer;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onmouseover="this.style.background='var(--offwhite)'" onmouseout="this.style.background=''">${item}</div>`).join("")}
  `).join("");
}

function closeGlobalSearch(){
  const box = document.getElementById("globalSearchResults");
  const input = document.getElementById("globalSearchInput");
  if(box) box.style.display = "none";
  if(input) input.value = "";
}

document.addEventListener("click", (e) => {
  const box = document.getElementById("globalSearchResults");
  const input = document.getElementById("globalSearchInput");
  if(box && input && box.style.display !== "none" && !box.contains(e.target) && e.target !== input){
    box.style.display = "none";
  }
});

async function loadShareholders(){
  const tbody = document.getElementById("shareholdersRegistryTbody");
  if(!tbody) return;
  const [{ data, error }, { data: company }] = await Promise.all([
    sb.from("shareholders").select("*").eq("company_id", currentCompanyId).order("shares_count",{ascending:false}),
    sb.from("companies").select("total_shares,name").eq("id", currentCompanyId).single()
  ]);
  if(error){ tbody.innerHTML = errorRowHTML(10, error.message); return; }
  shareholdersCache = data || [];
  const totalRegistered = shareholdersCache.reduce((s,x)=>s+(Number(x.shares_count)||0),0);
  const companyTotal = company ? Number(company.total_shares)||0 : 0;

  const summaryBox = document.getElementById("shareholdersSummary");
  if(summaryBox){
    const diff = companyTotal - totalRegistered;
    summaryBox.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      <div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--primary)">${totalRegistered.toLocaleString('ar-SA-u-ca-gregory')}</div><div style="font-size:11px;color:var(--gray3)">إجمالي الأسهم المسجّلة</div></div>
      <div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--gold)">${companyTotal.toLocaleString('ar-SA-u-ca-gregory')}</div><div style="font-size:11px;color:var(--gray3)">إجمالي أسهم الشركة</div></div>
      <div style="text-align:center"><div style="font-size:22px;font-weight:900;color:${diff===0?'var(--green)':'var(--red)'}">${diff===0?'✅ مطابق':diff.toLocaleString('ar-SA-u-ca-gregory')}</div><div style="font-size:11px;color:var(--gray3)">${diff===0?'السجل مطابق لإجمالي الشركة':(diff>0?'أسهم غير موزّعة بعد':'زيادة عن إجمالي الشركة!')}</div></div>
    </div>`;
  }

  if(shareholdersCache.length===0){
    tbody.innerHTML = emptyRowHTML(10, 'لا يوجد مساهمون مسجّلون بعد. اضغط "+ إضافة مساهم" للبدء.');
  } else {
    tbody.innerHTML = shareholdersCache.map(s => {
      const pct = companyTotal ? ((Number(s.shares_count)||0)/companyTotal*100).toFixed(2) : "—";
      return `<tr>
        <td>${orgEsc(s.name||"")}${s.shareholder_type==='كيان اعتباري'?' <span style="background:#EAF0F8;color:var(--primary);font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:5px"><span class="ico-i ico-building"></span>كيان اعتباري</span>':''}</td><td>${s.nationality||"—"}</td><td>${s.place_of_residence||"—"}</td><td>${s.profession||"—"}</td><td>${s.certificate_number||"—"}</td>
        <td>${(Number(s.shares_count)||0).toLocaleString('ar-SA-u-ca-gregory')}</td><td>${pct!=="—"?pct+"%":"—"}</td>
        <td>${s.paid_value!=null?Number(s.paid_value).toLocaleString('ar-SA-u-ca-gregory'):"—"}</td><td>${s.ownership_transfer_date||"—"}</td>
        <td>
          <button class="btn-xs primary" onclick="editShareholder(${s.id})"><span class="ico-i ico-edit"></span>تعديل</button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px" onclick="deleteShareholder(${s.id})"><span class="ico-i ico-trash"></span>حذف</button>
        </td>
      </tr>`;
    }).join("");
  }

  loadShareTransfers();
}

async function loadShareTransfers(){
  const tbody = document.getElementById("shareTransfersTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("share_transfers").select("*").eq("company_id", currentCompanyId).order("transfer_date",{ascending:false});
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  if(!data || data.length===0){ tbody.innerHTML = emptyRowHTML(6, "لا توجد تحويلات مسجّلة بعد."); return; }
  const nameOf = id => { const s = shareholdersCache.find(x=>x.id===id); return s ? s.name : (id ? "—" : "إصدار جديد"); };
  tbody.innerHTML = data.map(t => `<tr>
    <td>${t.transfer_date||"—"}</td><td>${nameOf(t.from_shareholder_id)}</td><td>${nameOf(t.to_shareholder_id)}</td>
    <td>${(Number(t.shares_count)||0).toLocaleString('ar-SA-u-ca-gregory')}</td><td>${t.transfer_type||"—"}</td><td style="font-size:11px;color:var(--gray3)">${orgEsc(t.notes||"")}</td>
  </tr>`).join("");
}

function openNewShareholderModal(){
  document.getElementById("msh-id").value = "";
  document.getElementById("msh-title-h").textContent = "+ إضافة مساهم";
  ["msh-name","msh-nationality","msh-residence","msh-profession","msh-certificate","msh-shares","msh-paidvalue","msh-transferdate","msh-nationalid","msh-phone","msh-idexpiry","msh-email","msh-notes","msh-entity-cr","msh-authorized-rep"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("msh-type").value = "فرد";
  toggleShareholderEntityFields();
  openM("m-shareholder");
}

function toggleShareholderEntityFields(){
  const isEntity = document.getElementById("msh-type").value === "كيان اعتباري";
  document.getElementById("msh-entity-fields").style.display = isEntity ? "block" : "none";
  document.getElementById("msh-name-label").textContent = isEntity ? "اسم الكيان (الشركة/المؤسسة)" : "اسم المساهم";
  document.getElementById("msh-nationalid-label").textContent = isEntity ? "رقم هوية الشخص المخوّل" : "رقم الهوية";
}

function editShareholder(id){
  const s = shareholdersCache.find(x => x.id === id);
  if(!s) return;
  document.getElementById("msh-id").value = s.id;
  document.getElementById("msh-title-h").textContent = "✏️ تعديل مساهم";
  document.getElementById("msh-type").value = s.shareholder_type || "فرد";
  document.getElementById("msh-name").value = s.name || "";
  document.getElementById("msh-entity-cr").value = s.entity_cr_number || "";
  document.getElementById("msh-authorized-rep").value = s.authorized_rep_name || "";
  document.getElementById("msh-nationality").value = s.nationality || "";
  document.getElementById("msh-residence").value = s.place_of_residence || "";
  document.getElementById("msh-profession").value = s.profession || "";
  document.getElementById("msh-certificate").value = s.certificate_number || "";
  document.getElementById("msh-shares").value = s.shares_count ?? "";
  document.getElementById("msh-paidvalue").value = s.paid_value ?? "";
  document.getElementById("msh-transferdate").value = s.ownership_transfer_date || "";
  document.getElementById("msh-nationalid").value = s.national_id || "";
  document.getElementById("msh-phone").value = s.phone_number || s.phone || "";
  document.getElementById("msh-idexpiry").value = s.id_expiry_date || "";
  document.getElementById("msh-email").value = s.email || "";
  document.getElementById("msh-notes").value = s.notes || "";
  toggleShareholderEntityFields();
  openM("m-shareholder");
}

async function saveShareholder(){
  const id = document.getElementById("msh-id").value;
  const name = document.getElementById("msh-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم المساهم"); return; }
  const shareholder_type = document.getElementById("msh-type").value;
  const entity_cr_number = document.getElementById("msh-entity-cr").value.trim();
  if(shareholder_type === "كيان اعتباري" && !entity_cr_number){
    alert("رقم السجل التجاري إلزامي عند اختيار \"كيان اعتباري\" — هذا الرقم للتوثيق فقط، ولا يُستخدم لأي ربط تلقائي (الربط يعتمد فقط على رقم هوية الشخص المخوّل).");
    return;
  }
  const payload = {
    name,
    shareholder_type,
    entity_cr_number: shareholder_type === "كيان اعتباري" ? entity_cr_number : null,
    authorized_rep_name: shareholder_type === "كيان اعتباري" ? document.getElementById("msh-authorized-rep").value.trim() : null,
    nationality: document.getElementById("msh-nationality").value.trim(),
    place_of_residence: document.getElementById("msh-residence").value.trim(),
    profession: document.getElementById("msh-profession").value.trim(),
    certificate_number: document.getElementById("msh-certificate").value.trim(),
    shares_count: Number(document.getElementById("msh-shares").value) || 0,
    paid_value: document.getElementById("msh-paidvalue").value ? Number(document.getElementById("msh-paidvalue").value) : null,
    ownership_transfer_date: document.getElementById("msh-transferdate").value || null,
    national_id: document.getElementById("msh-nationalid").value.trim(),
    phone_number: document.getElementById("msh-phone").value.trim(),
    id_expiry_date: document.getElementById("msh-idexpiry").value || null,
    email: document.getElementById("msh-email").value.trim(),
    notes: document.getElementById("msh-notes").value.trim(),
    company_id: currentCompanyId
  };
  const { error } = id
    ? await sb.from("shareholders").update(payload).eq("id", id)
    : await sb.from("shareholders").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity(id?"تعديل":"إنشاء", "مساهم", name, "");
  closeM("m-shareholder");
  loadShareholders();
}

async function deleteShareholder(id){
  const s = shareholdersCache.find(x=>x.id===id);
  if(!await uiConfirm(`حذف المساهم "${s?s.name:''}"؟ هذا لا يحذف سجل التحويلات القديمة المرتبطة به.`)) return;
  const { error } = await sb.from("shareholders").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "مساهم", s?s.name:"", "");
  loadShareholders();
}

async function deleteAllShareholders(){
  if(shareholdersCache.length===0){ alert("لا يوجد مساهمون لحذفهم."); return; }
  if(!await uiConfirm(`⚠️ سيتم حذف جميع المساهمين المسجّلين (${shareholdersCache.length}) نهائيًا. هذا الإجراء لا يمكن التراجع عنه. متابعة؟`)) return;
  if(!await uiConfirm("تأكيد أخير: هل أنت متأكد فعلاً؟ سجل تحويلات الملكية القديمة سيبقى لكن أسماء المساهمين المرتبطة به ستفقد.")) return;
  const { error } = await sb.from("shareholders").delete().eq("company_id", currentCompanyId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "مساهمون", "الكل", `حذف جماعي لـ ${shareholdersCache.length} مساهم`);
  alert("تم حذف جميع المساهمين ✅");
  loadShareholders();
}

function openTransferModal(){
  const fromSel = document.getElementById("shtr-from");
  const toSel = document.getElementById("shtr-to");
  fromSel.innerHTML = '<option value="">— إصدار جديد (بدون مساهم مصدر) —</option>' +
    shareholdersCache.map(s => `<option value="${s.id}">${orgEsc(s.name)} (${(Number(s.shares_count)||0).toLocaleString('ar-SA-u-ca-gregory')} سهم)</option>`).join("");
  toSel.innerHTML = '<option value="">— اختر —</option><option value="__new__"><span class="ico-i ico-add"></span>مساهم جديد...</option>' +
    shareholdersCache.map(s => `<option value="${s.id}">${orgEsc(s.name)}</option>`).join("");
  document.getElementById("shtr-to-new").style.display = "none";
  document.getElementById("shtr-to-new-name").value = "";
  document.getElementById("shtr-shares").value = "";
  document.getElementById("shtr-notes").value = "";
  document.getElementById("shtr-date").value = new Date().toISOString().slice(0,10);
  openM("m-transfer");
}

async function executeShareTransfer(){
  const fromId = document.getElementById("shtr-from").value ? Number(document.getElementById("shtr-from").value) : null;
  const toVal = document.getElementById("shtr-to").value;
  const shares = Number(document.getElementById("shtr-shares").value);
  const transfer_type = document.getElementById("shtr-type").value;
  const transfer_date = document.getElementById("shtr-date").value || null;
  const notes = document.getElementById("shtr-notes").value.trim();

  if(!shares || shares <= 0){ alert("الرجاء إدخال عدد أسهم صحيح"); return; }
  if(!toVal){ alert("الرجاء تحديد الطرف المستلم"); return; }

  const fromShareholder = fromId ? shareholdersCache.find(s => s.id === fromId) : null;
  if(fromShareholder && (Number(fromShareholder.shares_count)||0) < shares){
    alert(`"${fromShareholder.name}" يملك ${fromShareholder.shares_count} سهم فقط — لا يمكن نقل ${shares} سهم.`);
    return;
  }

  let toId;
  let toName;
  if(toVal === "__new__"){
    const newName = document.getElementById("shtr-to-new-name").value.trim();
    if(!newName){ alert("الرجاء إدخال اسم المساهم الجديد"); return; }
    const { data: created, error: cErr } = await sb.from("shareholders").insert([{ name: newName, shares_count: shares, company_id: currentCompanyId }]).select().single();
    if(cErr){ alert("تعذّر إنشاء المساهم الجديد: " + cErr.message); return; }
    toId = created.id; toName = newName;
  } else {
    toId = Number(toVal);
    const toShareholder = shareholdersCache.find(s => s.id === toId);
    toName = toShareholder ? toShareholder.name : "";
    const newCount = (Number(toShareholder.shares_count)||0) + shares;
    const { error: uErr } = await sb.from("shareholders").update({ shares_count: newCount }).eq("id", toId);
    if(uErr){ alert("تعذّر تحديث رصيد المستلم: " + uErr.message); return; }
  }

  if(fromShareholder){
    const newFromCount = (Number(fromShareholder.shares_count)||0) - shares;
    const { error: fErr } = await sb.from("shareholders").update({ shares_count: newFromCount }).eq("id", fromShareholder.id);
    if(fErr){ alert("تعذّر تحديث رصيد المصدر: " + fErr.message); return; }
  }

  const { error: tErr } = await sb.from("share_transfers").insert([{
    company_id: currentCompanyId, from_shareholder_id: fromShareholder?fromShareholder.id:null, to_shareholder_id: toId,
    shares_count: shares, transfer_type, transfer_date, notes
  }]);
  if(tErr){ alert("تم تحديث الأرصدة لكن تعذّر تسجيل حركة التحويل: " + tErr.message); }

  logActivity("تعديل", "نقل ملكية", `${fromShareholder?fromShareholder.name:'إصدار جديد'} ← ${toName}`, `${shares} سهم — ${transfer_type}`);
  alert("تم تنفيذ التحويل بنجاح ✅");
  closeM("m-transfer");
  loadShareholders();
}
