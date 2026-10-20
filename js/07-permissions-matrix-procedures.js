/* ══════════ PERMISSIONS MATRIX — bulk Excel template + import ══════════
   Typing 165 real items one-by-one through a modal is genuinely impractical — Excel is a much
   faster, more reliable medium than parsing an arbitrary Word file: clean rows/columns, no
   merged-cell ambiguity, and the person can paste/edit dozens of rows in seconds. The template
   is pre-filled with real items extracted from the company's own reference matrix document. */
function triggerPermMatrixImport(){
  document.getElementById('permMatrixImportFile').click();
}

async function downloadPermMatrixTemplate(){
  const [{ data: holders }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true})
  ]);
  const holderNames = (holders||[]).map(h => h.name);
  if(holderNames.length === 0){
    alert("أضف جهات القرار أولًا (زر \"✏️ تعديل الجهات\") قبل تحميل النموذج — كل جهة تصير عمودًا بملف Excel.");
    return;
  }

  const header = ["الفئة", "البند", ...holderNames];
  const seedRows = [];
  Object.entries(STANDARD_PERM_MATRIX_ITEMS).forEach(([category, items]) => {
    items.forEach(item => {
      seedRows.push([category, item, ...holderNames.map(()=>"")]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...seedRows]);
  ws['!cols'] = [{wch:30},{wch:55}, ...holderNames.map(()=>({wch:14}))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مصفوفة الصلاحيات");

  const notesWs = XLSX.utils.aoa_to_sheet([
    ["تعليمات التعبئة"],
    ["- لكل جهة عمود مستقل — اكتب بخليتها: ت (توصية) أو م (مراجعة) أو ع (اعتماد)، أو اتركها فاضية إن لم تكن معنية."],
    ["- تقدر تحذف أي بند مو محتاجه، أو تضيف بنود جديدة بنفس الشكل (فئة + بند)."],
    ["- الفئات المتاحة بالضبط: الصلاحيات الاستراتيجية والتنظيمية، الصلاحيات المتعلقة بالموارد البشرية، الصلاحيات المالية والاستثمارية، الصلاحيات التشغيلية."],
    ["- بعد التعبئة، ارجع للمنصة واضغط \"📤 استيراد من Excel\" وارفع هذا الملف."]
  ]);
  XLSX.utils.book_append_sheet(wb, notesWs, "تعليمات");

  XLSX.writeFile(wb, "نموذج-مصفوفة-الصلاحيات.xlsx");
}

async function importPermMatrixFromExcel(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if(rows.length < 2){ alert("الملف فاضي أو غير صحيح"); return; }

      const header = rows[0];
      const holderNames = header.slice(2).map(h => String(h||"").trim()).filter(Boolean);
      const { data: holders } = await sb.from("permission_holders").select("*").eq("company_id", currentCompanyId);
      const holderIdByName = {};
      (holders||[]).forEach(h => { holderIdByName[(h.name||"").trim()] = h.id; });

      let addedItems = 0, addedCells = 0, skippedRows = 0;
      for(let i=1; i<rows.length; i++){
        const row = rows[i];
        if(!row || !row[1]) continue; // no item text
        const category = String(row[0]||"").trim();
        const item_text = String(row[1]||"").trim();
        if(!category || !item_text){ skippedRows++; continue; }

        const { data: newItem, error } = await sb.from("permission_items")
          .insert([{ item_name: item_text, category, company_id: currentCompanyId, sort_order: 1000+i }])
          .select().single();
        if(error || !newItem){
          if(error && !window._permImportFirstError) window._permImportFirstError = error.message;
          continue;
        }
        addedItems++;

        for(let c=0; c<holderNames.length; c++){
          const code = String(row[2+c]||"").trim();
          if(!code) continue;
          const holderId = holderIdByName[holderNames[c]];
          if(!holderId) continue;
          const { error: cellErr } = await sb.from("permission_cells").insert([{
            item_id: newItem.id, holder_id: holderId, code, company_id: currentCompanyId
          }]);
          if(!cellErr) addedCells++;
        }
      }
      const errorNote = window._permImportFirstError ? `\n\nخطأ التحقق: ${window._permImportFirstError}` : "";
      alert(`${addedItems>0?'تم الاستيراد ✅':'تعذّر الاستيراد ❌'} — أُضيف ${addedItems} بند و${addedCells} خانة صلاحية معبّاة.${skippedRows?` (تم تخطي ${skippedRows} صف ناقص البيانات)`:''}${errorNote}`);
      window._permImportFirstError = null;
      input.value = "";
      loadPermissionsMatrix();
    }catch(err){
      alert("تعذّر قراءة الملف: " + err.message);
    }
  };
  reader.readAsBinaryString(file);
}

function openPermItemsManager(){

  renderPermItemsManageList();
  openM("m-perm-items-manage");
}

async function deletePermItemFromManager(id){
  await deletePermItem(id, true);
  renderPermItemsManageList();
}

function openPermItemModal(){
  const container = document.getElementById("mpi-assignments");
  container.innerHTML = "";
  addPermAssignmentRow();
  const dl = document.getElementById("permHolderNames");
  dl.innerHTML = permHoldersCache.map(h => `<option value="${(h.name||"").replace(/"/g,'&quot;')}">`).join("");
  document.getElementById("mpi-name").value = "";
  openM("m-perm-item");
}

function addPermAssignmentRow(){
  const container = document.getElementById("mpi-assignments");
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;margin-top:6px";
  row.innerHTML = `
    <input list="permHolderNames" class="fi perm-assign-holder" placeholder="الجهة (مثال: الرئيس التنفيذي)" style="flex:2">
    <select class="fs perm-assign-code" style="flex:1">
      <option value="">—</option>
      <option value="ت">ت — توصية</option>
      <option value="ع">ع — اعتماد</option>
      <option value="م">م — مراجعة</option>
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
  `;
  container.appendChild(row);
}

async function findOrCreateHolder(name){
  const existing = permHoldersCache.find(h => (h.name||"").trim() === name);
  if(existing) return existing.id;
  const { data, error } = await sb.from("permission_holders")
    .insert([{ name, company_id: currentCompanyId, sort_order: permHoldersCache.length }])
    .select().single();
  if(error){ throw error; }
  permHoldersCache.push(data);
  return data.id;
}

/* ══ Real item editor: rename item, and add/edit/remove its holder assignments ══ */
async function openPermItemEditModal(itemId){
  const item = permItemsCache.find(i => i.id === itemId);
  if(!item) return;
  document.getElementById("mpie-id").value = item.id;
  document.getElementById("mpie-name").value = item.item_name || "";
  document.getElementById("mpie-category").value = item.category || "الصلاحيات التشغيلية";

  const { data: cells, error } = await sb.from("permission_cells").select("*").eq("item_id", itemId);
  if(error){ alert("تعذّر تحميل الصلاحيات الحالية: " + error.message); return; }

  const container = document.getElementById("mpie-assignments");
  container.innerHTML = "";
  (cells||[]).forEach(cell => {
    const holder = permHoldersCache.find(h => h.id === cell.holder_id);
    addPermEditAssignmentRow(cell.id, holder ? holder.name : "", cell.code);
  });
  if(!cells || cells.length===0) addPermEditAssignmentRow();

  const dl = document.getElementById("permHolderNames");
  if(dl) dl.innerHTML = permHoldersCache.map(h => `<option value="${(h.name||"").replace(/"/g,'&quot;')}">`).join("");

  openM("m-perm-item-edit");
}

function addPermEditAssignmentRow(cellId, holderName, code){
  const container = document.getElementById("mpie-assignments");
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;margin-top:6px";
  row.dataset.cellId = cellId || "";
  row.innerHTML = `
    <input list="permHolderNames" class="fi perm-edit-holder" placeholder="الجهة (مثال: الرئيس التنفيذي)" value="${holderName ? holderName.replace(/"/g,'&quot;') : ''}" style="flex:2">
    <select class="fs perm-edit-code" style="flex:1">
      <option value="" ${!code?'selected':''}>—</option>
      <option value="ت" ${code==='ت'?'selected':''}>ت — توصية</option>
      <option value="ع" ${code==='ع'?'selected':''}>ع — اعتماد</option>
      <option value="م" ${code==='م'?'selected':''}>م — مراجعة</option>
    </select>
    <button type="button" onclick="removePermEditAssignmentRow(this)" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
  `;
  container.appendChild(row);
}

async function removePermEditAssignmentRow(btn){
  const row = btn.closest("div[data-cell-id], div");
  const cellId = row.dataset.cellId;
  if(cellId){
    if(!await uiConfirm("حذف صلاحية هذه الجهة عن هذا البند؟")) return;
    const { error } = await sb.from("permission_cells").delete().eq("id", cellId);
    if(error){ alert("تعذّر الحذف: " + error.message); return; }
  }
  row.remove();
}

async function savePermItemEdit(){
  const id = document.getElementById("mpie-id").value;
  const item_name = document.getElementById("mpie-name").value.trim();
  if(!item_name){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mpie-category").value;

  const { error } = await sb.from("permission_items").update({ item_name, category }).eq("id", id);
  if(error){ alert("تعذّر حفظ البند: " + error.message); return; }

  const rows = document.querySelectorAll("#mpie-assignments > div");
  for(const row of rows){
    const holderName = row.querySelector(".perm-edit-holder").value.trim();
    const code = row.querySelector(".perm-edit-code").value;
    if(!holderName || !code) continue; // rows left blank are simply skipped, not saved
    try{
      const holderId = await findOrCreateHolder(holderName);
      await sb.from("permission_cells").upsert(
        [{ item_id: Number(id), holder_id: holderId, code, company_id: currentCompanyId }],
        { onConflict: 'item_id,holder_id' }
      );
    }catch(e){
      alert("تعذّر حفظ صلاحية الجهة \""+holderName+"\": " + e.message);
    }
  }

  closeM("m-perm-item-edit");
  await loadPermissionsMatrix();
  renderPermItemsManageList();
}

async function savePermItem(){
  const item_name = document.getElementById("mpi-name").value.trim();
  if(!item_name){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mpi-category").value;

  const { data: newItem, error } = await sb.from("permission_items")
    .insert([{ item_name, category, company_id: currentCompanyId, sort_order: permItemsCache.length }])
    .select().single();
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }

  // Apply any holder/code assignments entered inline for this new item
  const rows = document.querySelectorAll("#mpi-assignments > div");
  for(const row of rows){
    const holderName = row.querySelector(".perm-assign-holder").value.trim();
    const code = row.querySelector(".perm-assign-code").value;
    if(!holderName || !code) continue;
    try{
      const holderId = await findOrCreateHolder(holderName);
      await sb.from("permission_cells").upsert(
        [{ item_id: newItem.id, holder_id: holderId, code, company_id: currentCompanyId }],
        { onConflict: 'item_id,holder_id' }
      );
    }catch(e){
      alert("تعذّر حفظ صلاحية الجهة \""+holderName+"\": " + e.message);
    }
  }

  document.getElementById("mpi-name").value = "";
  closeM("m-perm-item");
  loadPermissionsMatrix();

  if(await uiConfirm(`تم إضافة البند "${item_name}" ✅\n\nهل تريد إشعار الفريق بالبريد الإلكتروني؟`)){
    await sendPermissionItemNotification(newItem.id);
  }
  if(await uiConfirm("هل تريد أيضًا مشاركته عبر واتساب؟")){
    sendPermissionItemWhatsApp(newItem.id);
  }
}

async function deletePermItem(id){
  if(!await uiConfirm("حذف هذا البند نهائيًا. متابعة؟")) return;
  const { error } = await sb.from("permission_items").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadPermissionsMatrix();
}

async function savePermCell(itemId, holderId, code){
  const { error } = await sb.from("permission_cells")
    .upsert([{ item_id: itemId, holder_id: holderId, code, company_id: currentCompanyId }], { onConflict: 'item_id,holder_id' });
  if(error){ alert("تعذّر الحفظ: " + error.message); }
}

async function generatePermissionsReport(){
  const w = openPrintWindow();
  if(w){ w.document.write('<html dir="rtl"><body style="font-family:sans-serif;padding:30px">جارِ تجهيز التقرير...</body></html>'); w.document.close(); }
  await loadPermissionsMatrix();
  const table = document.getElementById("permMatrixTable");
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const pmeta = await orgPdfMeta("matrix");
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع ثم المحاولة مرة أخرى."); return; }

  // Clone the table and strip interactive elements (delete buttons, selects) down to
  // plain printable text, so the PDF shows a clean report instead of live form controls.
  let printableHTML = '<p style="color:#C0392B">تعذّر تحميل جدول الصلاحيات.</p>';
  if(table){
    printableHTML = permPrintableTable(table).outerHTML;
  }

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير مصفوفة الصلاحيات</title>
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;padding:30px;color:#0D2447}
      h1{color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{border:1px solid #ccc;padding:8px;text-align:center;font-size:11.5px}
      td:first-child{text-align:right}
      th{background:#1A3A6B !important;color:#fff !important}
    </style></head><body>
    <h1>مصفوفة الصلاحيات — ${pmeta.companyName}</h1>
    ${approvalHeaderHTML(pmeta, x => String(x).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])))}
    <p style="font-size:11px;color:#5b6678">تاريخ إنشاء التقرير: ${dateNow}</p>
    <p><b>الرمز:</b> ت = توصية &nbsp; · &nbsp; ع = اعتماد &nbsp; · &nbsp; م = مراجعة</p>
    ${printableHTML}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>
  `);
  w.document.close();
}

/* ══════════ VOTES ══════════ */
let companySettings = { total_capital: null, total_shares: null };
async function loadCompanySettings(){
  const { data, error } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  if(!error && data) companySettings = data;
  const info = document.getElementById("companyCapitalInfo");
  if(info){
    const cap = companySettings.total_capital ? Number(companySettings.total_capital).toLocaleString("ar-SA-u-ca-gregory") + " ريال" : "—";
    const sh = companySettings.total_shares ? Number(companySettings.total_shares).toLocaleString("ar-SA-u-ca-gregory") : "—";
    info.innerHTML = `🏢 رأس مال الشركة: <b>${cap}</b> &nbsp;·&nbsp; إجمالي عدد أسهم الشركة: <b>${sh}</b>`;
  }
}
function pct(n, d){ return d ? ((n/d)*100).toFixed(1)+"%" : "0%"; }

/* Main entry point when navigating to the voting page: picks which AGM meeting we're
   voting in (or shows an empty state), then loads that meeting's topics + results. */
// Looks up the CURRENT user's real, verified record in the shareholders registry (matched via
// claimed_by_email at signup) rather than relying on self-reported name/shares typed during
// registration — this also correctly covers a board member who is separately a shareholder too,
// since it doesn't depend on which "account type" they originally picked at signup.
async function autofillShareholderVoteFields(){
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  if(!nameEl || !sharesEl) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  if(!email || !currentCompanyId) return;
  const { data: rows } = await sb.from("shareholders").select("name,shares_count")
    .eq("company_id", currentCompanyId).ilike("claimed_by_email", likeEsc(email)).limit(1);
  const sh = Array.isArray(rows) && rows.length ? rows[0] : null;
  nameEl.value = sh ? (sh.name || "") : "";
  sharesEl.value = sh && sh.shares_count != null ? sh.shares_count : "";
  nameEl.disabled = true; sharesEl.disabled = true;
  nameEl.style.background = "var(--gray1)"; sharesEl.style.background = "var(--gray1)";
  let note = document.getElementById("gm-registry-note");
  if(!note){ note = document.createElement("div"); note.id = "gm-registry-note"; note.style.cssText = "font-size:11.5px;margin-top:6px;line-height:1.8"; sharesEl.parentElement.parentElement.appendChild(note); }
  note.style.color = sh ? "var(--green)" : "var(--red)";
  note.textContent = sh ? "الاسم وعدد الأسهم مأخوذان من سجل المساهمين المعتمد." : "لا يوجد سجل مساهم مرتبط بحسابك. تواصل مع مدير الشركة لاعتماد انضمامك وربطك بسجلك قبل التصويت.";
}

async function loadAgmStrictToggle(){
  const row = document.getElementById("agmStrictRow"), chk = document.getElementById("agmStrictToggle");
  if(!row || !chk || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("agm_strict_voting").eq("id", currentCompanyId).maybeSingle();
  if(error || !data || !("agm_strict_voting" in data)){ row.style.display = "none"; return; }
  chk.checked = data.agm_strict_voting === true; row.style.display = "block";
}
async function loadShReportsToggle(){
  const row = document.getElementById("shReportsRow"), chk = document.getElementById("shReportsToggle");
  if(!row || !chk || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("shareholders_see_reports").eq("id", currentCompanyId).maybeSingle();
  if(error || !data || !("shareholders_see_reports" in data)){ row.style.display = "none"; return; }
  chk.checked = data.shareholders_see_reports === true; row.style.display = "block";
}
async function saveShReports(on){
  const { error } = await sb.from("companies").update({ shareholders_see_reports: !!on }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر حفظ الإعداد: " + error.message); loadShReportsToggle(); return; }
  logActivity("تعديل", "إعداد الجمعية", "تقارير الحوكمة للمساهمين", on ? "إظهار" : "إخفاء");
  uiToast(on ? "ستظهر «تقارير الحوكمة» للمساهمين عند دخولهم القادم." : "أُخفيت «تقارير الحوكمة» عن المساهمين.");
}
async function saveAgmStrict(on){
  const { error } = await sb.from("companies").update({ agm_strict_voting: !!on }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر حفظ الإعداد: " + error.message); loadAgmStrictToggle(); return; }
  logActivity("تعديل", "إعداد الجمعية", "تصويت صارم", on ? "تفعيل" : "إيقاف");
  alert(on ? "تم تفعيل التصويت الصارم لهذه الشركة ✅" : "تم إيقاف التصويت الصارم.");
}
async function loadVotingPage(){
  const isOverseer = getCurrentRole() === 'مدير النظام';
  if(isOverseer){ loadAgmStrictToggle(); loadShReportsToggle(); }
  const selfSection = document.getElementById("voterSelfSection");
  if(selfSection) selfSection.style.display = isOverseer ? "none" : "block";
  const adminSection = document.getElementById("voterAdminSection");
  if(adminSection) adminSection.style.display = isOverseer ? "block" : "none";

  if(!isOverseer){ loadDocumentTemplates(); autofillShareholderVoteFields(); }
  const titleEl = document.getElementById("votingMeetingTitle");
  const banner = document.getElementById("votingNotOpenBanner");
  const topicsBox = document.getElementById("votingTopicsContainer");

  if(!currentVotingMeetingId){
    const { data: agms } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").order("meeting_date",{ascending:false});
    if(agms && agms.length){
      const todayStr = new Date().toISOString().slice(0,10);
      const upcoming = agms.filter(m=>m.meeting_date && m.meeting_date>=todayStr).sort((a,b)=>(a.meeting_date||"").localeCompare(b.meeting_date||""));
      currentVotingMeetingId = upcoming.length ? upcoming[0].id : agms[0].id;
    }
  }

  if(!currentVotingMeetingId){
    if(titleEl) titleEl.textContent = "لا توجد جمعية عامة بعد";
    if(banner) banner.style.display = "none";
    if(topicsBox) topicsBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">أنشئ جمعية عامة أولًا من صفحة "الجمعية العامة".</div>';
    return;
  }

  const { data: m, error } = await sb.from("meetings").select("*").eq("id", currentVotingMeetingId).single();
  if(error || !m){
    if(titleEl) titleEl.textContent = "تعذّر تحميل بيانات الجمعية";
    return;
  }

  if(titleEl) titleEl.textContent = `${orgEsc(m.title||"جمعية عامة")} — ${m.meeting_date||""}`;

  if(isOverseer){
    loadCompanySettings().then(() => { loadVoteResults(); loadShareholdersSummary(); });
    return;
  }

  // Gate voting using the dedicated voting_start / voting_end window (set manually when
  // the AGM was created, or later from its detail view) — topics are fully hidden outside it.
  const now = new Date();
  const votingStart = m.voting_start ? new Date(m.voting_start) : null;
  const votingEnd = m.voting_end ? new Date(m.voting_end) : null;
  const notYetOpen = votingStart && now < votingStart;
  const alreadyClosed = votingEnd && now > votingEnd;
  const isOpen = !notYetOpen && !alreadyClosed;

  if(banner){
    if(notYetOpen){
      banner.style.display = "block";
      banner.textContent = `⏳ التصويت يبدأ بتاريخ ${votingStart.toLocaleDateString("ar-SA-u-ca-gregory")} — الساعة ${votingStart.toLocaleTimeString("ar-SA-u-ca-gregory",{hour:'2-digit',minute:'2-digit'})}`;
    } else if(alreadyClosed){
      banner.style.display = "block";
      banner.textContent = `🔒 انتهى التصويت بتاريخ ${votingEnd.toLocaleDateString("ar-SA-u-ca-gregory")} — الساعة ${votingEnd.toLocaleTimeString("ar-SA-u-ca-gregory",{hour:'2-digit',minute:'2-digit'})}`;
    } else {
      banner.style.display = "none";
    }
  }

  if(topicsBox){
    if(!isOpen){
      topicsBox.innerHTML = "";
    } else {
      const { data: topics, error: topErr } = await sb.from("vote_topics").select("*").eq("meeting_id", currentVotingMeetingId).order("sort_order",{ascending:true}).order("id",{ascending:true});
      if(topErr){ topicsBox.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل البنود</div>'; }
      else if(!topics || topics.length===0){ topicsBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لم تُضَف بنود لهذه الجمعية بعد.</div>'; }
      else {
        topicsBox.innerHTML = topics.map((t,i) => `
          <div style="background:var(--offwhite);border-radius:10px;padding:12px;border-right:4px solid var(--primary)">
            <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:2px">البند ${i+1}</div>
            <div style="font-size:13px;font-weight:700;margin-bottom:6px">${orgEsc(t.topic_text)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','موافق')" style="font-size:11px;padding:4px 12px">موافق</button>
              <button class="btn btn-ghost" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','معارض')" style="font-size:11px;padding:4px 12px;border:1px solid var(--red);color:var(--red)">معارض</button>
              <button class="btn btn-ghost" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','ممتنع')" style="font-size:11px;padding:4px 12px">ممتنع</button>
            </div>
          </div>`).join("");
      }
    }
  }

  await loadElectionVotingSection(isOpen);

  // إغلاق أزرار التصويت إذا وقّع المساهم بطاقته
  if(!isOverseer && isOpen){
    const nmEl = document.getElementById('gm-shareholder-name');
    const nm = nmEl ? nmEl.value.trim() : "";
    if(nm && await isVoteLockedFor(nm)){
      ["votingTopicsContainer","votingElectionContainer"].forEach(id => {
        const box = document.getElementById(id);
        if(!box) return;
        box.querySelectorAll("button,input").forEach(el => { el.disabled = true; el.style.opacity = "0.45"; el.style.cursor = "not-allowed"; });
        box.querySelectorAll("button[onclick*='submitElectionAllocation']").forEach(el => el.remove());
      });
      const tb = document.getElementById("votingTopicsContainer");
      if(tb && !document.getElementById("voteLockedNote")){
        tb.insertAdjacentHTML("afterbegin", '<div id="voteLockedNote" style="background:#E8F8EF;color:var(--green);border-radius:10px;padding:10px 12px;font-size:12px;font-weight:800;margin-bottom:8px"><span class="ico-i ico-check"></span>تم تسجيل تصويتك وتوقيع بطاقتك، وأُغلق التصويت عليك.</div>');
      }
    }
  }

  await loadCompanySettings();
  if(isOverseer){
    loadVoteResults();
    loadShareholdersSummary();
  } else {
    loadMyVoteHistory();
  }
}

/* Shareholder's own past voting record — every topic they've voted on, across every
   general assembly of this company. Shareholders never see other voters' choices,
   aggregate results, or the quorum table — those are restricted to the system admin. */
async function loadMyVoteHistory(){
  const tbody = document.getElementById("myVoteHistoryTbody");
  if(!tbody) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  if(!email || !currentCompanyId){ tbody.innerHTML = emptyRowHTML(3, "تعذّر تحديد هويتك."); return; }
  const { data: sh } = await sb.from("shareholders").select("name")
    .eq("company_id", currentCompanyId).eq("claimed_by_email", email).maybeSingle();
  if(!sh || !sh.name){ tbody.innerHTML = emptyRowHTML(3, "لم يتم العثور على سجل مساهم مرتبط بحسابك."); return; }

  const { data: votes, error } = await sb.from("votes").select("meeting_id, meetings(title,meeting_date)")
    .eq("company_id", currentCompanyId).eq("shareholder_name", sh.name).order("id",{ascending:false});
  if(error){ tbody.innerHTML = errorRowHTML(3, error.message); return; }
  const byMeeting = new Map();
  (votes||[]).forEach(v => { if(v.meeting_id && !byMeeting.has(v.meeting_id)) byMeeting.set(v.meeting_id, v.meetings || {}); });
  if(byMeeting.size===0){ tbody.innerHTML = emptyRowHTML(3, "لا يوجد لديك تصويت مسجّل بعد."); return; }
  const nm = String(sh.name).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  tbody.innerHTML = [...byMeeting.entries()].map(([mid, m]) => `<tr>
    <td>${orgEsc(m.title || "—")}</td>
    <td>${m.meeting_date || "—"}</td>
    <td style="text-align:center"><button class="btn-xs primary" onclick="openVoterSignedCard('${nm}', ${Number(mid)})"><span class="ico-i ico-document"></span>عرض بطاقة التصويت</button></td>
  </tr>`).join("");
}

/* Aggregated results per agenda item, weighted by shares & percentage of capital —
   scoped to the AGM meeting currently open on this page. */
async function loadVoteResults(){
  const tbody = document.getElementById("voteResultsTbody");
  if(!tbody) return;
  if(!currentVotingMeetingId){ tbody.innerHTML = emptyRowHTML(6, "لا توجد جمعية محددة."); return; }
  const { data, error } = await sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", currentVotingMeetingId).not("shareholder_name","is",null);
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  const rows = data || [];
  if(rows.length===0){ tbody.innerHTML = emptyRowHTML(6, "لا توجد أصوات مسجّلة من المساهمين بعد."); return; }
  const totalShares = Number(companySettings.total_shares) || 0;
  const byTopic = {};
  rows.forEach(v => {
    const t = v.topic || "—";
    if(!byTopic[t]) byTopic[t] = { yes:0, no:0, abs:0, voters:0 };
    const shares = Number(v.shares_count)||0;
    byTopic[t].voters += 1;
    if(v.result==="موافق") byTopic[t].yes += shares;
    else if(v.result==="معارض") byTopic[t].no += shares;
    else if(v.result==="ممتنع") byTopic[t].abs += shares;
  });
  tbody.innerHTML = Object.keys(byTopic).map(t => {
    const d = byTopic[t];
    const votedShares = d.yes + d.no + d.abs;
    return `<tr>
      <td>${t}</td>
      <td style="text-align:center">${d.voters}</td>
      <td style="text-align:center">${pct(votedShares, totalShares)}</td>
      <td style="text-align:center;color:var(--green);font-weight:700">${pct(d.yes, votedShares)}</td>
      <td style="text-align:center;color:var(--red);font-weight:700">${pct(d.no, votedShares)}</td>
      <td style="text-align:center;color:var(--orange);font-weight:700">${pct(d.abs, votedShares)}</td>
    </tr>`;
  }).join("");
}

/* Summary table per shareholder — scoped to the currently open AGM meeting */
async function loadShareholdersSummary(){
  const tbody = document.getElementById("shareholdersTbody");
  const tfoot = document.getElementById("shareholdersTfoot");
  const summaryBox = document.getElementById("votingCapitalSummary");
  if(!tbody) return;
  if(!currentVotingMeetingId){ tbody.innerHTML = emptyRowHTML(6, "لا توجد جمعية محددة."); return; }
  const { data, error } = await sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", currentVotingMeetingId).not("shareholder_name","is",null);
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  const rows = data || [];
  if(rows.length===0){
    tbody.innerHTML = emptyRowHTML(6, "لا يوجد مساهمون صوّتوا بعد.");
    if(tfoot) tfoot.innerHTML = "";
    if(summaryBox) summaryBox.textContent = "لا يوجد مساهمون صوّتوا بعد.";
    return;
  }
  const totalShares = Number(companySettings.total_shares) || 0;
  const byShareholder = {};
  rows.forEach(v => {
    const key = v.shareholder_name || "—";
    if(!byShareholder[key]) byShareholder[key] = { name:key, shares:Number(v.shares_count)||0, yes:0, no:0, abs:0, lastId:v.id };
    if(v.id >= byShareholder[key].lastId){
      byShareholder[key].shares = Number(v.shares_count)||0;
      byShareholder[key].lastId = v.id;
    }
    if(v.result==="موافق") byShareholder[key].yes++;
    else if(v.result==="معارض") byShareholder[key].no++;
    else if(v.result==="ممتنع") byShareholder[key].abs++;
  });
  const list = Object.values(byShareholder);
  tbody.innerHTML = list.map(s => `<tr>
    <td>${orgEsc(s.name)}</td>
    <td style="text-align:center">${s.shares}</td>
    <td style="text-align:center">${pct(s.shares, totalShares)}</td>
    <td style="text-align:center;color:var(--green)">${s.yes} بند</td>
    <td style="text-align:center;color:var(--red)">${s.no} بند</td>
    <td style="text-align:center;color:var(--orange)">${s.abs} بند</td>
    <td><button class="btn-xs primary" onclick="openVoterSignedCard('${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-document"></span>عرض/تحميل البطاقة الموقّعة</button>
    <button class="btn-xs" style="margin-top:4px;background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:700" onclick="reopenVoterVoting('${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-warning"></span>فتح التصويت للتعديل</button></td>
  </tr>`).join("");

  const totalVotedShares = list.reduce((sum,s)=>sum+s.shares,0);
  if(tfoot){
    tfoot.innerHTML = `<tr style="background:#EAF0F8;font-weight:800">
      <td>الإجمالي (${list.length} مساهم)</td>
      <td style="text-align:center">${totalVotedShares}</td>
      <td style="text-align:center">${pct(totalVotedShares, totalShares)}</td>
      <td colspan="3" style="text-align:center;font-size:11px;color:var(--gray3)">مجموع مشاركتهم من رأس المال</td>
    </tr>`;
  }
  if(summaryBox){
    const thresholdInput = document.getElementById("quorumThresholdInput");
    const thresholdPct = thresholdInput ? (Number(thresholdInput.value) || 50) : 50;
    const currentPct = totalShares ? (totalVotedShares/totalShares*100) : 0;
    const quorumMet = currentPct >= thresholdPct;
    const sharesNeeded = Math.max(0, Math.ceil(totalShares*thresholdPct/100) - totalVotedShares);
    summaryBox.innerHTML = `
      <div style="margin-bottom:10px"><span class="ico-i ico-users"></span>إجمالي المساهمين المصوّتين: <b>${list.length}</b> &nbsp;·&nbsp; إجمالي الأسهم المشاركة: <b>${totalVotedShares}</b> &nbsp;·&nbsp; ما نسبته: <b>${pct(totalVotedShares, totalShares)}</b> من رأس المال</div>
      <div style="background:${quorumMet?'#E8F8EF':'#FEF3E2'};border:2px solid ${quorumMet?'var(--green)':'var(--gold)'};border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:${quorumMet?'var(--green)':'var(--gold)'}">${currentPct.toFixed(1)}% / ${thresholdPct}%</div>
        <div style="font-size:12px;font-weight:700;color:${quorumMet?'var(--green)':'var(--gold)'};margin-top:4px">
          ${quorumMet ? '✅ اكتمل النصاب المطلوب' : `⏳ متبقٍ (${sharesNeeded.toLocaleString('ar-SA-u-ca-gregory')}) سهم لاكتمال النصاب`}
        </div>
      </div>`;
  }
}

async function saveVote(){
  const topic = document.getElementById("mv-topic").value.trim();
  if(!topic){ alert("الرجاء إدخال موضوع القرار"); return; }
  const result = document.getElementById("mv-result").value;
  const vote_date = document.getElementById("mv-date").value || null;
  const { error } = await sb.from("votes").insert([{ topic, result, vote_date, company_id: currentCompanyId }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mv-topic").value=""; document.getElementById("mv-date").value="";
  closeM("m-vote");
}

/* ══════════ AUDIT ITEMS ══════════ */
let auditCache = [];
/* ══════════ GOVERNANCE EFFECTIVENESS ASSESSMENT (8 axes, 32 criteria, maturity 1-5) ══════════ */
const GOVERNANCE_AXES = [
  { key: "axis_board", title: "المحور الأول: مجلس الإدارة", icon: "🏛️", criteria: [
    { key: "board_composition", label: "تشكيل المجلس", hint: "تنوع الخبرات – الاستقلالية – عدد الأعضاء" },
    { key: "board_performance", label: "أداء المجلس", hint: "التزام الحضور – جودة النقاش – فعالية القرارات" },
    { key: "board_charters", label: "المواثيق والسياسات", hint: "وجود ميثاق مجلس الإدارة – تحديثه" },
    { key: "board_self_eval", label: "تقييم الأداء", hint: "وجود عملية تقييم سنوي للمجلس" },
    { key: "board_mgmt_relation", label: "العلاقة بالإدارة التنفيذية", hint: "وضوح الأدوار – عدم التداخل – مساءلة الرئيس التنفيذي" }
  ]},
  { key: "axis_committees", title: "المحور الثاني: اللجان المتخصصة", icon: "👥", criteria: [
    { key: "audit_committee", label: "لجنة المراجعة", hint: "الاستقلالية – الاجتماعات – التقارير" },
    { key: "risk_committee", label: "لجنة المخاطر", hint: "تقييم المخاطر – رفع التوصيات – كفاءة الاجتماعات" },
    { key: "nom_rem_committee", label: "لجنة الترشيحات والمكافآت", hint: "سياسات التعيين – التعاقب الوظيفي – تقييم الأداء" },
    { key: "governance_committee", label: "لجنة الحوكمة", hint: "متابعة السياسات – دعم الامتثال – تطوير النظام" }
  ]},
  { key: "axis_policies", title: "المحور الثالث: السياسات واللوائح", icon: "📜", criteria: [
    { key: "governance_policies", label: "سياسات الحوكمة", hint: "تضارب المصالح – الإفصاح – السلوك المهني" },
    { key: "risk_policies", label: "سياسات المخاطر", hint: "تصنيف المخاطر – حدود الصلاحيات" },
    { key: "internal_control_policies", label: "سياسات الرقابة الداخلية", hint: "الضوابط – التحديث – الالتزام" },
    { key: "compliance_policies", label: "سياسات الامتثال", hint: "مكافحة الفساد – الالتزام القانوني – التقارير" }
  ]},
  { key: "axis_risk", title: "المحور الرابع: إدارة المخاطر", icon: "⚠️", criteria: [
    { key: "risk_identification", label: "تحديد المخاطر", hint: "شمولية ودقة تحديد المخاطر" },
    { key: "risk_assessment", label: "تقييم المخاطر", hint: "المنهجية – الأدوات – التحليل" },
    { key: "risk_response_plans", label: "خطط الاستجابة", hint: "جودة الخطط – مسؤوليات التنفيذ" },
    { key: "kris", label: "مؤشرات المخاطر (KRIs)", hint: "وجود مؤشرات – متابعة دورية" },
    { key: "risk_reporting", label: "التقارير", hint: "رفع تقارير للمجلس واللجان" }
  ]},
  { key: "axis_audit", title: "المحور الخامس: الرقابة الداخلية والمراجعة", icon: "🔍", criteria: [
    { key: "internal_control_system", label: "نظام الرقابة الداخلية", hint: "فعالية الضوابط – تغطية العمليات" },
    { key: "internal_audit_role", label: "دور المراجعة الداخلية", hint: "الاستقلال – نطاق العمل – التقارير" },
    { key: "external_audit", label: "المراجعة الخارجية", hint: "التواصل مع المجلس – جودة التقارير" },
    { key: "audit_recommendations", label: "تطبيق توصيات التدقيق", hint: "نسبة التنفيذ – جودة المعالجة" }
  ]},
  { key: "axis_disclosure", title: "المحور السادس: الشفافية والإفصاح", icon: "📢", criteria: [
    { key: "report_quality", label: "جودة التقارير", hint: "دقة البيانات – وضوحها – احترافيتها" },
    { key: "disclosure_commitment", label: "الالتزام بالإفصاح", hint: "مواعيد النشر – استجابة لطلبات المساهمين" },
    { key: "communication_channels", label: "قنوات التواصل", hint: "موقع الشركة – البيانات الجوهرية – التقارير السنوية" }
  ]},
  { key: "axis_culture", title: "المحور السابع: الثقافة المؤسسية والسلوك المهني", icon: "🤝", criteria: [
    { key: "integrity_culture", label: "ثقافة النزاهة", hint: "احترام السياسات – مكافحة الفساد – القدوة" },
    { key: "whistleblowing", label: "الإبلاغ عن المخالفات", hint: "وجود سياسة – سرية – حماية المبلّغين" },
    { key: "professional_conduct", label: "الالتزام المهني", hint: "السلوك – الأخلاقيات – احترام التسلسل" }
  ]},
  { key: "axis_digital", title: "المحور الثامن: التحول الرقمي الداعم للحوكمة", icon: "💻", criteria: [
    { key: "risk_mgmt_systems", label: "أنظمة إدارة المخاطر", hint: "أدوات رقمية – BI – تقارير لحظية" },
    { key: "controls_automation", label: "أتمتة الضوابط", hint: "صلاحيات – موافقات – تدقيق إلكتروني" },
    { key: "data_management", label: "إدارة البيانات", hint: "أمان المعلومات – حماية البيانات" },
    { key: "grc_systems", label: "أنظمة GRC", hint: "شمولية التطبيق – التكامل – الفاعلية" }
  ]}
];

const MATURITY_LABELS = { 1:"ضعيف", 2:"أساسي", 3:"جيد", 4:"متقدم", 5:"متميز" };
const MATURITY_COLORS = { 1:"var(--red)", 2:"#E67E22", 3:"var(--gold)", 4:"var(--teal)", 5:"var(--green)" };
function maturityColor(score){
  if(score==null) return "var(--gray3)";
  return MATURITY_COLORS[Math.round(score)] || "var(--gray3)";
}

// Board/committee axes only make sense where a board and real committees actually exist —
// a sole proprietorship has neither, and even a joint-stock company without any committees
// registered shouldn't be nudged into scoring an axis that doesn't apply to it (an assessor
// scoring "no committees" as a 1 would unfairly drag the overall average down for something
// that was never expected to exist in the first place).
async function getGovAssessApplicableAxes(){
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const noBoard = isSoleProp || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const { data: committees } = await sb.from("committees").select("id").eq("company_id", currentCompanyId).limit(1);
  const hasCommittees = !!(committees && committees.length);
  return GOVERNANCE_AXES.filter(axis => {
    if(noBoard && axis.key === "axis_board") return false;
    if(noBoard && axis.key === "axis_committees") return false;
    if(!hasCommittees && axis.key === "axis_committees") return false;
    return true;
  }).map(axis => ({ ...axis, title: displayStageLabel(axis.title) }));
}

function maturityInterpretation(score){
  if(score < 2) return { label: "حوكمة ابتدائية – تحتاج إعادة بناء جذرية", color: "var(--red)" };
  if(score < 3) return { label: "حوكمة ناشئة – تحتاج تطوير شامل", color: "#E67E22" };
  if(score < 4) return { label: "حوكمة معيارية – نظام جيد يحتاج تحسينات", color: "var(--gold)" };
  if(score < 4.5) return { label: "حوكمة متقدمة – فعّالة ومتماسكة", color: "var(--teal)" };
  return { label: "حوكمة رائدة – أفضل الممارسات العالمية", color: "var(--green)" };
}

let govassessEditingId = null;

async function openNewGovAssessment(){
  govassessEditingId = null;
  document.getElementById("ga-id").value = "";
  document.getElementById("ga-period").value = "";
  document.getElementById("ga-date").value = "";
  document.getElementById("ga-assessor").value = "المراجعة الداخلية";
  document.getElementById("govassessFormTitle").textContent = "📊 تقييم فعالية حوكمة جديد";
  await renderGovAxesForm(null);
  document.getElementById("govassessResultsSummary").style.display = "none";
  document.getElementById("govassessListView").style.display = "none";
  document.getElementById("govassessFormView").style.display = "block";
}

function closeGovAssessmentForm(){
  document.getElementById("govassessFormView").style.display = "none";
  document.getElementById("govassessListView").style.display = "block";
  loadGovAssessments();
}

let currentGovAxes = GOVERNANCE_AXES;

async function renderGovAxesForm(existingData){
  currentGovAxes = await getGovAssessApplicableAxes();
  await gaLoadAll();
  const gaCurrentId = document.getElementById("ga-id").value;
  const box = document.getElementById("govassessAxesContainer");
  box.innerHTML = currentGovAxes.map(axis => {
    const savedCriteria = existingData ? (existingData[axis.key]||[]) : [];
    const savedByKey = {}; savedCriteria.forEach(c => { savedByKey[c.key] = c; });
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-head"><span class="card-title">${axis.icon} ${orgEsc(axis.title)}</span></div>
      <div class="card-body">
        <table class="tbl">
          <thead><tr><th style="width:22%">المعيار</th><th style="width:20%">مستوى النضج (١-٥)</th><th style="width:29%">الملاحظات</th><th style="width:29%">الإجراءات التصحيحية</th></tr></thead>
          <tbody>
            ${axis.criteria.map(c => {
              const saved = savedByKey[c.key] || {};
              const initialColor = maturityColor(saved.score);
              return `<tr data-axis="${axis.key}" data-crit="${c.key}">
                <td><b style="font-size:11.5px">${c.label}</b><div style="font-size:10px;color:var(--gray3);margin-top:2px">${c.hint}</div></td>
                <td><select class="fs ga-score-select" style="font-size:12px;padding:6px;font-weight:700;color:${initialColor};border-color:${initialColor}55" onchange="this.style.color=maturityColor(this.value?Number(this.value):null);this.style.borderColor=maturityColor(this.value?Number(this.value):null)+'55'">
                  <option value="">—</option>
                  ${[1,2,3,4,5].map(n=>`<option value="${n}" ${saved.score==n?"selected":""}>${n} — ${MATURITY_LABELS[n]}</option>`).join("")}
                </select></td>
                <td><textarea class="fi ga-notes" rows="2" style="font-size:11.5px;resize:vertical">${orgEsc(saved.notes||"")}</textarea></td>
                <td><textarea class="fi ga-actions" rows="2" style="font-size:11.5px;resize:vertical">${saved.actions||""}</textarea><div class="ga-slot" data-axis="${axis.key}" data-crit="${c.key}">${gaSlotHTML(gaCurrentId, axis.key, c.key)}</div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join("");
}

function collectGovAxesData(){
  const result = {};
  currentGovAxes.forEach(axis => {
    result[axis.key] = axis.criteria.map(c => {
      const row = document.querySelector(`tr[data-axis="${axis.key}"][data-crit="${c.key}"]`);
      const score = row.querySelector(".ga-score-select").value;
      const notes = row.querySelector(".ga-notes").value.trim();
      const actions = row.querySelector(".ga-actions").value.trim();
      return { key: c.key, label: c.label, score: score ? Number(score) : null, notes, actions };
    });
  });
  return result;
}

function computeGovScores(axesData){
  const axisScores = {};
  let allScores = [];
  GOVERNANCE_AXES.forEach(axis => {
    const scored = (axesData[axis.key]||[]).map(c=>c.score).filter(s=>s!=null);
    axisScores[axis.key] = scored.length ? scored.reduce((a,b)=>a+b,0)/scored.length : null;
    allScores = allScores.concat(scored);
  });
  const finalScore = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : null;
  return { axisScores, finalScore };
}

async function saveGovAssessment(){
  const period = document.getElementById("ga-period").value.trim();
  const assessment_date = document.getElementById("ga-date").value || null;
  const assessed_by_type = document.getElementById("ga-assessor").value;
  if(!period){ alert("الرجاء إدخال الفترة محل التقييم"); return; }

  const axesData = collectGovAxesData();
  const payload = {
    company_id: currentCompanyId, period, assessed_by_type, assessment_date,
    axis_board: axesData.axis_board, axis_committees: axesData.axis_committees, axis_policies: axesData.axis_policies,
    axis_risk: axesData.axis_risk, axis_audit: axesData.axis_audit, axis_disclosure: axesData.axis_disclosure,
    axis_culture: axesData.axis_culture, axis_digital: axesData.axis_digital
  };

  const id = document.getElementById("ga-id").value;
  let error;
  if(id){
    ({ error } = await sb.from("governance_assessments").update(payload).eq("id", id));
  } else {
    // Keep the new row's id: before, a second click on Save inserted a duplicate assessment,
    // and corrective actions need a saved assessment to attach to.
    const r = await sb.from("governance_assessments").insert([payload]).select("id").single();
    error = r.error;
    if(!error && r.data){ document.getElementById("ga-id").value = r.data.id; govassessEditingId = r.data.id; }
  }
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  gaRefreshAllSlots();

  const { finalScore } = computeGovScores(axesData);
  logActivity("إنشاء", "تقييم فعالية الحوكمة", period, finalScore!=null ? `النتيجة النهائية: ${finalScore.toFixed(1)}/5` : "");
  renderGovResultsSummary(axesData);
  alert("تم حفظ التقييم بنجاح ✅");
}

function renderGovResultsSummary(axesData){
  const { axisScores, finalScore } = computeGovScores(axesData);
  const box = document.getElementById("govassessResultsSummary");
  if(finalScore == null){ box.style.display = "none"; return; }
  const interp = maturityInterpretation(finalScore);
  box.style.display = "block";
  box.innerHTML = `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><span class="card-title"><span class="ico-i ico-trending"></span>النتيجة النهائية</span></div>
    <div class="card-body">
      <table class="tbl">
        <thead><tr><th>المحور</th><th>الدرجة / 5</th></tr></thead>
        <tbody>
          ${GOVERNANCE_AXES.map(axis => `<tr><td>${axis.icon} ${orgEsc(axis.title.replace(/^المحور [^:]+:\s*/,""))}</td><td>${axisScores[axis.key]!=null ? axisScores[axis.key].toFixed(1) : "—"}</td></tr>`).join("")}
        </tbody>
      </table>
      <div style="margin-top:14px;padding:14px;background:${interp.color}15;border-radius:10px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:${interp.color}">${finalScore.toFixed(1)} / 5</div>
        <div style="font-size:13px;font-weight:700;color:${interp.color};margin-top:4px">${interp.label}</div>
      </div>
    </div>
  </div>`;
}

async function loadGovAssessments(){
  const tbody = document.getElementById("govassessHistoryTbody");
  if(!tbody) return;
  loadGaTracker();
  const { data, error } = await sb.from("governance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</td></tr>`; return; }
  if(!data || data.length===0){ tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد تقييمات بعد.</td></tr>'; return; }

  tbody.innerHTML = data.map(a => {
    const { finalScore } = computeGovScores(a);
    const interp = finalScore!=null ? maturityInterpretation(finalScore) : null;
    return `<tr>
      <td>${a.period||"—"}</td><td>${a.assessed_by_type||"—"}</td><td>${a.assessment_date||"—"}</td>
      <td>${finalScore!=null?finalScore.toFixed(1)+"/5":"—"}</td>
      <td>${interp?`<span style="color:${interp.color};font-weight:700;font-size:11px">${interp.label}</span>`:"—"}</td>
      <td><button class="btn-xs primary" onclick="viewGovAssessment(${a.id})">عرض/تعديل</button></td>
    </tr>`;
  }).join("");
}

async function viewGovAssessment(id){
  const { data: a, error } = await sb.from("governance_assessments").select("*").eq("id", id).single();
  if(error || !a){ alert("تعذّر تحميل التقييم"); return; }
  govassessEditingId = id;
  document.getElementById("ga-id").value = a.id;
  document.getElementById("ga-period").value = a.period || "";
  document.getElementById("ga-date").value = a.assessment_date || "";
  document.getElementById("ga-assessor").value = a.assessed_by_type || "المراجعة الداخلية";
  document.getElementById("govassessFormTitle").textContent = "📊 تعديل تقييم: " + (a.period||"");
  await renderGovAxesForm(a);
  renderGovResultsSummary(a);
  document.getElementById("govassessListView").style.display = "none";
  document.getElementById("govassessFormView").style.display = "block";
}

/* ══════════ CORRECTIVE ACTION TRACKING (متابعة الإجراءات التصحيحية) ══════════
   An assessment's corrective action used to be free text inside each criterion — nobody owned it,
   nothing had a date, nothing could be closed. Here each one can become its own record with three
   distinct roles (executor / monitor / approver) and a status that only moves in one direction
   except when it is sent back. The checks below run in the app code; the database policy only
   scopes rows to the company, it does not know about these roles. */
const GA_STATUS_STYLE = {
  "لم يبدأ": ["#F1F1F1","var(--gray3)"], "قيد التنفيذ": ["#FEF3E2","var(--gold)"],
  "بانتظار المراجعة": ["#E6EEF8","var(--primary)"], "بانتظار الاعتماد": ["#EFE6F8","#6B3FA0"], "مغلق": ["#E8F8EF","var(--green)"]
};
const GA_TRANSITIONS = {
  "لم يبدأ": [{ to:"قيد التنفيذ", actor:"executor", label:"بدء التنفيذ" }],
  "قيد التنفيذ": [{ to:"بانتظار المراجعة", actor:"executor", label:"إرسال للمراجعة", needNote:true, noteLabel:"ما تم تنفيذه والدليل عليه" }],
  "بانتظار المراجعة": [
    { to:"بانتظار الاعتماد", actor:"monitor", label:"قبول وإحالة للاعتماد" },
    { to:"قيد التنفيذ", actor:"monitor", label:"إعادة للمنفّذ", needNote:true, noteLabel:"سبب الإعادة", ret:true }
  ],
  "بانتظار الاعتماد": [
    { to:"مغلق", actor:"approver", label:"اعتماد وإغلاق" },
    { to:"قيد التنفيذ", actor:"approver", label:"رفض وإعادة للمنفّذ", needNote:true, noteLabel:"سبب الرفض", ret:true }
  ]
};
const GA_ACTOR_LABEL = { executor:"المنفّذ", monitor:"المراقب", approver:"المعتمِد" };
let gaActionsCache = [];
let gaMembersCache = [];

function gaEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function gaMyEmail(){ return currentUserProfile ? currentUserProfile.email : null; }
function gaIsPlatformOwner(){ return !!(currentUserProfile && currentUserProfile.is_platform_admin === true); }
function gaCanManage(){ return gaIsPlatformOwner() || ["مدير النظام","رئيس مجلس","سكرتير المجلس"].includes(getCurrentRole()); }
function gaNoBoard(){ return currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner; }
function gaName(email){ if(!email) return "غير محدَّد"; const m = gaMembersCache.find(x => x.email === email); return m ? m.name : email; }
function gaIsOverdue(a){ return a.status !== "مغلق" && !!a.target_date && new Date(a.target_date) < new Date(new Date().toDateString()); }
function gaCompanyName(){ return document.getElementById("companySwitcher")?.selectedOptions?.[0]?.textContent?.trim() || ""; }

async function gaLoadAll(){
  const [{ data: acts }, { data: ms }] = await Promise.all([
    sb.from("governance_actions").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId)
  ]);
  gaActionsCache = acts || [];
  const rows = (ms||[]).filter(m => m.role !== "مساهم");
  const emails = rows.map(r => r.email);
  const { data: profs } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameBy = {}; (profs||[]).forEach(p => { nameBy[p.email] = p.full_name; });
  gaMembersCache = rows.map(r => ({ email: r.email, role: r.role, name: nameBy[r.email] || r.email }));
}

/* Defaults by entity: with a board the approver is its chair and the monitor is the audit
   committee chair (or the board secretary); with no board it collapses to the system admin.
   Executor is the chief executive. If the executor would also be the approver, the approver
   is left empty rather than silently assigning someone to approve their own work. */
async function gaDefaultRoles(){
  const byRole = r => (gaMembersCache.find(m => m.role === r) || {}).email || null;
  let execs = []; try { execs = await getEvaluableExecutives(); } catch(e){}
  const ceo = execs.find(e => /رئيس تنفيذي|الرئيس التنفيذي|مدير عام|المدير العام|مدير تنفيذي|المدير التنفيذي/.test(e.position||"")) || execs[0] || null;
  let executor = ceo ? ceo.email : null, monitor, approver;
  if(gaNoBoard()){
    const admins = gaMembersCache.filter(m => m.role === "مدير النظام").map(m => m.email);
    approver = admins[0] || null;
    monitor = admins[1] || admins[0] || null;
  } else {
    approver = byRole("رئيس مجلس");
    monitor = byRole("رئيس لجنة مراجعة") || byRole("سكرتير المجلس");
  }
  if(executor && executor === approver) approver = null;
  return { executor, monitor, approver };
}

function gaSlotHTML(assessmentId, axisKey, critKey){
  const own = assessmentId ? gaActionsCache.find(a => String(a.assessment_id) === String(assessmentId) && a.criterion_key === critKey) : null;
  let html = "";
  if(own){
    const [bg,fg] = GA_STATUS_STYLE[own.status] || GA_STATUS_STYLE["لم يبدأ"];
    html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:${bg};color:${fg}">متابَع: ${gaEsc(own.status)}</span>
      <button type="button" class="btn-xs primary" onclick="gaOpen(${own.id})">فتح</button></div>`;
  } else {
    html += `<button type="button" class="btn-xs gold" style="margin-top:6px" onclick="gaCreateFromRow(this)"><span class="ico-i ico-check"></span>تتبّع كإجراء متابَع</button>`;
  }
  const prior = gaActionsCache.filter(a => a.criterion_key === critKey && String(a.assessment_id) !== String(assessmentId||""));
  if(prior.length){
    const open = prior.filter(a => a.status !== "مغلق").length;
    html += `<div style="font-size:10px;margin-top:5px;color:${open?'var(--red)':'var(--green)'}">إجراءات من تقييمات سابقة: ${open} مفتوح · ${prior.length-open} مغلق</div>`;
  }
  return html;
}
function gaRefreshAllSlots(){
  const gid = document.getElementById("ga-id").value;
  document.querySelectorAll(".ga-slot").forEach(el => { el.innerHTML = gaSlotHTML(gid, el.dataset.axis, el.dataset.crit); });
}

async function gaCreateFromRow(btn){
  const gid = document.getElementById("ga-id").value;
  if(!gid){ alert("احفظ التقييم أولاً، ثم حوّل الإجراء إلى متابعة."); return; }
  const tr = btn.closest("tr");
  const text = tr.querySelector(".ga-actions").value.trim();
  if(!text){ alert("اكتب الإجراء التصحيحي أولاً."); return; }
  const axis = tr.dataset.axis, crit = tr.dataset.crit;
  const label = tr.querySelector("b") ? tr.querySelector("b").textContent : crit;
  btn.disabled = true;
  const roles = await gaDefaultRoles();
  const { data, error } = await sb.from("governance_actions").insert([{
    company_id: currentCompanyId, assessment_id: Number(gid), axis_key: axis, criterion_key: crit, criterion_label: label,
    action_text: text, executor_email: roles.executor, monitor_email: roles.monitor, approver_email: roles.approver,
    status: "لم يبدأ", created_by: gaMyEmail()
  }]).select().single();
  btn.disabled = false;
  if(error){ alert("تعذّر إنشاء الإجراء: " + error.message); return; }
  await sb.from("governance_action_log").insert([{ action_id: data.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: null, to_status: "لم يبدأ", note: "إنشاء الإجراء" }]);
  await gaLoadAll();
  gaRefreshAllSlots();
  gaOpen(data.id);
}

/* ── Tracker on the assessment list page ── */
async function loadGaTracker(){ await gaLoadAll(); renderGaTracker(); }

function gaMyPending(a){
  const me = gaMyEmail();
  if(a.status === "لم يبدأ" || a.status === "قيد التنفيذ") return a.executor_email === me;
  if(a.status === "بانتظار المراجعة") return a.monitor_email === me;
  if(a.status === "بانتظار الاعتماد") return a.approver_email === me;
  return false;
}

function renderGaTracker(){
  const statsBox = document.getElementById("gaStats"), list = document.getElementById("gaList");
  if(!statsBox || !list) return;
  const all = gaActionsCache.filter(a => a.axis_key !== "compliance");
  const closed = all.filter(a => a.status === "مغلق").length;
  const overdue = all.filter(gaIsOverdue).length;
  const mine = all.filter(a => a.status !== "مغلق" && gaMyPending(a)).length;
  const rate = all.length ? Math.round(closed/all.length*100) : 0;
  statsBox.innerHTML = `
    <div class="kpi blue"><div class="kpi-label">إجمالي الإجراءات</div><div class="kpi-val">${all.length}</div></div>
    <div class="kpi gold"><div class="kpi-label">المطلوب مني</div><div class="kpi-val">${mine}</div></div>
    <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
    <div class="kpi green"><div class="kpi-label">نسبة الإغلاق</div><div class="kpi-val">${rate}%</div></div>`;

  const f = document.getElementById("ga-filter").value;
  const rows = all.filter(a => {
    if(f === "mine") return a.status !== "مغلق" && gaMyPending(a);
    if(f === "open") return a.status !== "مغلق";
    if(f === "overdue") return gaIsOverdue(a);
    if(f === "closed") return a.status === "مغلق";
    return true;
  });
  if(!rows.length){
    list.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${all.length ? "لا توجد إجراءات مطابقة." : "لا توجد إجراءات متابَعة بعد. من داخل أي تقييم اضغط «تتبّع كإجراء متابَع» بجانب الإجراء التصحيحي."}</div>`;
    return;
  }
  list.innerHTML = rows.map(a => {
    const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark);flex:1">${gaEsc(a.action_text)}</div>
        <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(a.status)}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">المعيار: ${gaEsc(a.criterion_label||a.criterion_key)}</div>
      <div style="font-size:11px;color:var(--gray3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
        <span>المنفّذ: ${gaEsc(gaName(a.executor_email))}</span><span>المراقب: ${gaEsc(gaName(a.monitor_email))}</span><span>المعتمِد: ${gaEsc(gaName(a.approver_email))}</span>
        <span>الموعد: ${a.target_date||"غير محدَّد"}</span>${gaIsOverdue(a) ? '<span style="color:var(--red);font-weight:800">متأخر</span>' : ""}
      </div>
      <button class="btn-xs ${a.status!=='مغلق' && gaMyPending(a) ? 'gold' : 'primary'}" onclick="gaOpen(${a.id})">${a.status!=='مغلق' && gaMyPending(a) ? 'مطلوب منك' : 'فتح'}</button>
    </div>`;
  }).join("");
}

/* ── Action modal ── */
function gaFillSelect(id, selected){
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">— غير محدَّد —</option>' + gaMembersCache.map(m => `<option value="${gaEsc(m.email)}" ${m.email===selected?"selected":""}>${gaEsc(m.name)} — ${gaEsc(m.role)}</option>`).join("");
  if(selected && !gaMembersCache.some(m => m.email === selected)) sel.insertAdjacentHTML("beforeend", `<option value="${gaEsc(selected)}" selected>${gaEsc(selected)}</option>`);
}

async function gaOpen(id){
  if(!gaMembersCache.length || !gaActionsCache.some(a => a.id === id)) await gaLoadAll();
  const a = gaActionsCache.find(x => x.id === id);
  if(!a){ alert("تعذّر تحميل الإجراء"); return; }
  document.getElementById("gam-id").value = id;
  document.getElementById("gam-context").textContent = `${a.action_kind ? "إجراء " + a.action_kind + " — " : ""}المعيار: ${a.criterion_label||a.criterion_key}`;
  const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
  document.getElementById("gam-status-badge").innerHTML = `<span style="font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;background:${bg};color:${fg}">${gaEsc(a.status)}</span>`;
  document.getElementById("gam-overdue-tag").innerHTML = gaIsOverdue(a) ? '<span style="font-size:11px;font-weight:800;color:var(--red)">متأخر عن الموعد</span>' : "";
  document.getElementById("gam-text").value = a.action_text || "";
  gaFillSelect("gam-executor", a.executor_email); gaFillSelect("gam-monitor", a.monitor_email); gaFillSelect("gam-approver", a.approver_email);
  document.getElementById("gam-target").value = a.target_date || "";

  const canEdit = gaCanManage() && a.status !== "مغلق";
  ["gam-text","gam-executor","gam-monitor","gam-approver","gam-target"].forEach(i => { document.getElementById(i).disabled = !canEdit; });
  document.getElementById("gam-assign-btn").innerHTML = canEdit ? '<button class="btn btn-gold" style="font-size:11.5px" onclick="gaSaveAssignment()"><span class="ico-i ico-save"></span>حفظ التكليف</button>' : "";

  const notes = [];
  if(a.evidence_note) notes.push(`<b>ما تم تنفيذه:</b> ${gaEsc(a.evidence_note)}`);
  if(a.monitor_note) notes.push(`<b>آخر ملاحظة مراجعة:</b> ${gaEsc(a.monitor_note)}`);
  const nb = document.getElementById("gam-notes-box");
  nb.style.display = notes.length ? "block" : "none"; nb.innerHTML = notes.join("<br>");

  const me = gaMyEmail();
  const opts = (GA_TRANSITIONS[a.status] || []).filter(t => gaIsPlatformOwner() || a[t.actor+"_email"] === me);
  const noteWrap = document.getElementById("gam-note-wrap");
  document.getElementById("gam-note").value = "";
  const needsNote = opts.some(t => t.needNote);
  noteWrap.style.display = needsNote ? "block" : "none";
  if(needsNote) document.getElementById("gam-note-label").textContent = opts.find(t => t.needNote).noteLabel;
  const btns = document.getElementById("gam-buttons");
  if(a.status === "مغلق"){ btns.innerHTML = `<span style="font-size:11.5px;color:var(--green);font-weight:700"><span class="ico-i ico-check"></span>أُغلق بتاريخ ${a.closed_at ? new Date(a.closed_at).toLocaleDateString('ar-SA-u-ca-gregory') : ""}</span>`; }
  else if(!opts.length){
    const need = (GA_TRANSITIONS[a.status]||[])[0];
    btns.innerHTML = `<span style="font-size:11px;color:var(--gray3)">الخطوة التالية بيد ${need ? GA_ACTOR_LABEL[need.actor] + ": " + gaEsc(gaName(a[need.actor+"_email"])) : "—"}.</span>`;
  } else {
    btns.innerHTML = opts.map(t => `<button class="btn ${t.ret?'btn-ghost':'btn-gold'}" style="font-size:11.5px" onclick="gaTransition(${a.id},'${t.to}')">${t.label}</button>`).join("");
  }

  const { data: log } = await sb.from("governance_action_log").select("*").eq("action_id", id).order("id",{ascending:false});
  document.getElementById("gam-log").innerHTML = (log||[]).map(l => `<div style="border-right:2px solid var(--gray1);padding-right:8px;margin-bottom:6px">
    <b style="color:var(--dark)">${gaEsc(l.actor_name||l.actor_email||"")}</b> — ${new Date(l.created_at).toLocaleString('ar-SA-u-ca-gregory')}<br>
    ${l.to_status ? `${l.from_status?gaEsc(l.from_status)+" ← ":""}<b>${gaEsc(l.to_status)}</b>` : ""}${l.note ? ` — ${gaEsc(l.note)}` : ""}</div>`).join("") || "لا توجد تحديثات.";
  openM("m-gaction");
}

async function gaLog(a, from, to, note){
  await sb.from("governance_action_log").insert([{ action_id: a.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: from, to_status: to, note: note||null }]);
}
function gaNotify(email, subject, body, a){
  if(!email || email === gaMyEmail()) return;
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h3 style="color:#1A3A6B">${gaEsc(subject)}</h3>
    <p><b>الشركة:</b> ${gaEsc(gaCompanyName())}</p><p><b>الإجراء:</b> ${gaEsc(a.action_text)}</p><p>${gaEsc(body)}</p></div>`;
  sendNotificationEmail(email, subject, html);
}

async function gaSaveAssignment(){
  const id = Number(document.getElementById("gam-id").value);
  const a = gaActionsCache.find(x => x.id === id);
  if(!a || a.status === "مغلق" || !gaCanManage()) return;
  const action_text = document.getElementById("gam-text").value.trim();
  const executor_email = document.getElementById("gam-executor").value || null;
  const monitor_email = document.getElementById("gam-monitor").value || null;
  const approver_email = document.getElementById("gam-approver").value || null;
  const target_date = document.getElementById("gam-target").value || null;
  if(!action_text){ alert("نص الإجراء مطلوب"); return; }

  const clashes = [];
  if(executor_email && executor_email === approver_email) clashes.push("المنفّذ هو نفسه المعتمِد");
  if(executor_email && executor_email === monitor_email) clashes.push("المنفّذ هو نفسه المراقب");
  if(clashes.length){
    if(!gaNoBoard()){ alert("لا يجوز: " + clashes.join(" و") + ". اختر شخصاً مختلفاً لضمان الفصل بين التنفيذ والرقابة والاعتماد."); return; }
    if(!await uiConfirm("تنبيه: " + clashes.join(" و") + ". هذا مقبول فقط لأن الكيان لا مجلس له وعدد الأشخاص محدود. متابعة؟")) return;
  }
  const { error } = await sb.from("governance_actions").update({ action_text, executor_email, monitor_email, approver_email, target_date }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  await gaLog(a, a.status, null, "تعديل التكليف");
  if(executor_email && executor_email !== a.executor_email) gaNotify(executor_email, "إجراء تصحيحي مسند إليك", "أُسند إليك تنفيذ هذا الإجراء" + (target_date ? ` قبل ${target_date}` : "") + ".", a);
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}

async function gaTransition(id, to){
  const a = gaActionsCache.find(x => x.id === id);
  if(!a) return;
  const t = (GA_TRANSITIONS[a.status]||[]).find(x => x.to === to);
  if(!t) return;
  if(!gaIsPlatformOwner() && a[t.actor+"_email"] !== gaMyEmail()){ alert("هذه الخطوة خاصة بـ" + GA_ACTOR_LABEL[t.actor] + " المحدَّد."); return; }
  if(!a.executor_email || !a.monitor_email || !a.approver_email){ alert("حدّد المنفّذ والمراقب والمعتمِد أولاً (حفظ التكليف)."); return; }
  const note = document.getElementById("gam-note").value.trim();
  if(t.needNote && !note){ alert("الرجاء كتابة: " + t.noteLabel); return; }

  const upd = { status: to };
  if(to === "مغلق") upd.closed_at = new Date().toISOString();
  if(to === "بانتظار المراجعة") upd.evidence_note = note;
  if(t.ret) upd.monitor_note = note;
  // Only applies if nobody else moved it meanwhile.
  const { data: done, error } = await sb.from("governance_actions").update(upd).eq("id", id).eq("status", a.status).select();
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  if(!done || !done.length){ alert("تغيّرت حالة الإجراء من مستخدم آخر. حدّث الصفحة وأعد المحاولة."); await gaLoadAll(); renderGaTracker(); gaOpen(id); return; }

  await gaLog(a, a.status, to, note);
  if(to === "بانتظار المراجعة") gaNotify(a.monitor_email, "إجراء تصحيحي بانتظار مراجعتك", "أرسل المنفّذ الإجراء للمراجعة.", a);
  if(to === "بانتظار الاعتماد") gaNotify(a.approver_email, "إجراء تصحيحي بانتظار اعتمادك", "قبل المراقب الإجراء وأحاله للاعتماد.", a);
  if(t.ret) gaNotify(a.executor_email, "أُعيد إليك إجراء تصحيحي", "السبب: " + note, a);
  if(to === "مغلق"){ gaNotify(a.executor_email, "اعتُمد إغلاق الإجراء التصحيحي", "تم اعتماد الإجراء وإغلاقه.", a); logActivity("إغلاق","إجراء تصحيحي",a.criterion_label||a.criterion_key,a.action_text); }
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}

/* ══════════ AUDIT SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const AUDIT_STATUS_ORDER = ["تم الاستلام","قيد التحليل","تحت المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const AUDIT_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "قيد التحليل":"var(--gold)", "تحت المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };

async function loadAudit(){
  const grid = document.getElementById("auditServicesGrid");
  const tbody = document.getElementById("auditRequestsTbody");
  if(!grid || !tbody) return;

  const [{ data: services, error: svcErr }, { data: requests, error: reqErr }] = await Promise.all([
    sb.from("audit_service_types").select("*").order("id",{ascending:true}),
    sb.from("audit_requests").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false})
  ]);

  if(svcErr){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${svcErr.message}</div>`; }
  else if(!services || services.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد خدمات متاحة حاليًا.</div>'; }
  else {
    grid.innerHTML = services.map(s => `<div class="card" style="margin:0;display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--gray3);margin-top:6px;line-height:1.6;flex:1">${orgEsc(s.description||"")}</div>
        ${s.duration_estimate ? `<div style="font-size:11px;color:var(--primary);margin-top:8px">⏱️ ${s.duration_estimate}</div>` : ""}
        <button class="btn btn-gold" style="width:100%;margin-top:12px;font-size:11.5px" onclick="openNewAuditRequest(${s.id},'${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-edit"></span>اطلب الخدمة الآن</button>
      </div>
    </div>`).join("");
  }

  if(reqErr){ tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red);font-size:12px">${reqErr.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });
  tbody.innerHTML = requests.map(r => {
    const resultBadge = r.inspection_result
      ? `<span style="color:${r.inspection_result==='مقبول'?'var(--green)':r.inspection_result==='غير مقبول'?'var(--red)':'var(--orange)'};font-weight:800;font-size:11px">${r.inspection_result==='مقبول'?'✅':r.inspection_result==='غير مقبول'?'❌':'⚠️'} ${r.inspection_result}</span>`
      : '<span style="color:var(--gray3);font-size:11px">—</span>';
    return `<tr style="cursor:pointer" onclick="openAuditRequestDetail(${r.id})">
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${AUDIT_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td>${resultBadge}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openAuditRequestDetail(${r.id})">عرض</button></td>
  </tr>`;
  }).join("");
}

function openNewAuditRequest(serviceId, serviceName){
  document.getElementById("anr-service-id").value = serviceId;
  document.getElementById("anr-service-name").textContent = serviceName;
  document.getElementById("anr-client-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  document.getElementById("anr-sector").value = "";
  document.getElementById("anr-scope").value = "";
  document.getElementById("anr-date").value = "";
  document.getElementById("anr-files").value = "";
  openM("m-audit-new-request");
}

async function submitAuditRequest(){
  const service_type_id = Number(document.getElementById("anr-service-id").value);
  const client_name = document.getElementById("anr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("anr-sector").value.trim();
  const org_size = document.getElementById("anr-org-size").value;
  const scope = document.getElementById("anr-scope").value.trim();
  const preferred_date = document.getElementById("anr-date").value || null;

  const filesInput = document.getElementById("anr-files");
  const file_urls = [];
  if(filesInput.files && filesInput.files.length){
    for(const f of filesInput.files){
      const fakeInput = { files: [f] };
      const url = await uploadFile(fakeInput, "audit-requests");
      if(url) file_urls.push({ name: f.name, url });
    }
  }

  const { data: userData } = await sb.auth.getUser();
  const requested_by_email = userData && userData.user ? userData.user.email : null;

  const { error } = await sb.from("audit_requests").insert([{
    company_id: currentCompanyId, service_type_id, requested_by_email, client_name, sector, org_size, scope,
    file_urls, preferred_date, status: "تم الاستلام"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  logActivity("إنشاء", "طلب مراجعة", client_name, "");
  alert("تم إرسال طلبك بنجاح ✅ — سيتواصل معك فريق المراجعة قريبًا.");
  closeM("m-audit-new-request");
  loadAudit();
}

async function openAuditRequestDetail(requestId){
  const box = document.getElementById("ard-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-audit-request-detail");

  const [{ data: r }, { data: findings }, { data: messages }, { data: rating }] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_ratings").select("*").eq("request_id", requestId).limit(1)
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("ard-title-h").textContent = "🔍 " + (r.client_name||"طلب مراجعة");
  const existingRating = (rating||[])[0];

  const statusIdx = AUDIT_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${AUDIT_STATUS_ORDER.slice(0,4).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<3?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?AUDIT_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<3 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div><div style="text-align:center;font-size:11px;font-weight:700;color:${AUDIT_STATUS_COLOR[r.status]}">${r.status}</div>`;

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;color:var(--primary)"><span class="ico-i ico-pin"></span>ملاحظة المراجع</div>
    <div style="font-size:12px;color:var(--dark);margin:4px 0">${orgEsc(f.finding_text)}</div>
    <div style="font-size:10px;color:${f.status==='مغلقة'?'var(--green)':'var(--gray3)'};margin-bottom:6px">الحالة: ${f.status}</div>
    <textarea class="fi" id="finding-resp-${f.id}" rows="2" placeholder="اكتب ردك أو الإجراء التصحيحي..." style="font-size:11.5px">${f.client_response||""}</textarea>
    <button class="btn-xs primary" style="margin-top:6px" onclick="submitFindingResponse(${f.id},${requestId})">إرسال الرد</button>
  </div>`).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد ملاحظات بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--primary)':'var(--offwhite)'};color:${m.sender_email===r.requested_by_email?'#fff':'var(--dark)'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const ratingHtml = (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px">⭐ تقييم الخدمة</div>
    <div class="card"><div class="card-body">
      ${existingRating ? `<div style="text-align:center;font-size:20px;color:var(--gold)">${"⭐".repeat(existingRating.rating)}</div><div style="font-size:11.5px;color:var(--gray3);text-align:center;margin-top:4px">${orgEsc(existingRating.comment||"")}</div>`
        : `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px" id="rating-stars">
             ${[1,2,3,4,5].map(n=>`<span onclick="setAuditRatingValue(${n})" id="star-${n}" style="font-size:24px;cursor:pointer;color:var(--gray1)">⭐</span>`).join("")}
           </div>
           <textarea class="fi" id="rating-comment" rows="2" placeholder="ملاحظاتك على الخدمة (اختياري)"></textarea>
           <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="submitAuditRating(${requestId})">إرسال التقييم</button>`}
    </div></div>` : "";

  const resultBadgeColor = r.inspection_result === 'مقبول' ? 'var(--green)' : r.inspection_result === 'غير مقبول' ? 'var(--red)' : 'var(--orange)';
  const resultIcon = r.inspection_result === 'مقبول' ? '✅' : r.inspection_result === 'غير مقبول' ? '❌' : '⚠️';
  const summaryHtml = r.inspection_result ? `
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-dashboard"></span>نتيجة المراجعة</div>
    <div class="card" style="border:2px solid ${resultBadgeColor}">
      <div class="card-body">
        <div style="text-align:center;font-size:16px;font-weight:900;color:${resultBadgeColor};margin-bottom:10px">${resultIcon} ${r.inspection_result}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;text-align:center">
          ${r.key_findings_count!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.key_findings_count}</div><div style="font-size:10.5px;color:var(--gray3)">عدد الملاحظات</div></div>` : ""}
          ${r.compliance_pct!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.compliance_pct}%</div><div style="font-size:10.5px;color:var(--gray3)">نسبة الامتثال</div></div>` : ""}
        </div>
        ${r.result_summary ? `<div style="font-size:11.5px;color:var(--dark);margin-top:10px;padding-top:10px;border-top:1px solid var(--gray1)">${r.result_summary}</div>` : ""}
      </div>
    </div>` : "";

  box.innerHTML = `
    ${timeline}
    ${summaryHtml}
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-pin"></span>الملاحظات والإجراءات التصحيحية</div>
    ${findingsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع فريق المراجعة</div>
    <div class="card"><div class="card-body">
      <div id="audit-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="audit-chat-input" placeholder="اكتب رسالتك..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendAuditMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
    ${ratingHtml}
  `;
  window.currentAuditRatingValue = 0;
}

async function submitFindingResponse(findingId, requestId){
  const val = document.getElementById(`finding-resp-${findingId}`).value.trim();
  const { error } = await sb.from("audit_findings").update({ client_response: val }).eq("id", findingId);
  if(error){ alert("تعذّر إرسال الرد: " + error.message); return; }
  alert("تم إرسال ردك ✅");
  openAuditRequestDetail(requestId);
}

async function sendAuditMessage(requestId){
  const input = document.getElementById("audit-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("audit_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:email, message
  }]);
  if(error){ alert("تعذّر إرسال الرسالة: " + error.message); return; }
  input.value = "";
  openAuditRequestDetail(requestId);
}

function setAuditRatingValue(n){
  window.currentAuditRatingValue = n;
  for(let i=1;i<=5;i++){ document.getElementById(`star-${i}`).style.color = i<=n ? "var(--gold)" : "var(--gray1)"; }
}

async function submitAuditRating(requestId){
  const rating = window.currentAuditRatingValue || 0;
  if(!rating){ alert("الرجاء اختيار عدد النجوم"); return; }
  const comment = document.getElementById("rating-comment").value.trim();
  const { error } = await sb.from("audit_ratings").insert([{ request_id: requestId, rating, comment }]);
  if(error){ alert("تعذّر إرسال التقييم: " + error.message); return; }
  alert("شكرًا لتقييمك ✅");
  openAuditRequestDetail(requestId);
}

/* ══════════ AUDIT SERVICES — BACK OFFICE (platform team manages all clients' requests) ══════════ */
function applyAdminRequestsTabVisibility(){
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const teamModule = currentUserProfile && currentUserProfile.platform_team_module;
  const tabVisibility = { companyrequests: true, managecompanies: true, auditadmin: true, riskadmin: true };
  if(!isPlatformAdmin && teamModule && teamModule !== 'حوكمة'){
    tabVisibility.auditadmin = (teamModule === 'تدقيق داخلي');
    tabVisibility.riskadmin = (teamModule === 'مخاطر');
  }
  document.querySelectorAll(".adminreq-tab-btn").forEach(btn => {
    btn.style.display = tabVisibility[btn.dataset.tab] ? '' : 'none';
  });
  return tabVisibility;
}

function switchAdminRequestsTab(tab){
  const visibility = applyAdminRequestsTabVisibility();
  if(!visibility[tab]){
    tab = Object.keys(visibility).find(k => visibility[k]) || 'companyrequests';
  }
  document.querySelectorAll(".adminreq-tab-content").forEach(el => { el.style.display = "none"; });
  document.getElementById("adminreq-tab-" + tab).style.display = "block";
  document.querySelectorAll(".adminreq-tab-btn").forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("btn-gold", active);
    btn.classList.toggle("btn-ghost", !active);
  });
}

async function loadAuditAdmin(){
  const tbody = document.getElementById("auditAdminTbody");
  if(!tbody) return;
  const [{ data: requests, error }, { data: companies }, { data: services }] = await Promise.all([
    sb.from("audit_requests").select("*").order("created_at",{ascending:false}),
    sb.from("companies").select("id,name"),
    sb.from("audit_service_types").select("id,name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });

  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openAuditAdminDetail(${r.id})">
    <td>${companyNameById[r.company_id]||"—"}</td>
    <td>${orgEsc(r.client_name||"—")}</td>
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${AUDIT_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td style="font-size:11px">${orgEsc(r.assigned_reviewer_email||"— غير مكلَّف —")}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openAuditAdminDetail(${r.id})">إدارة</button></td>
  </tr>`).join("");
}

async function openAuditAdminDetail(requestId){
  const box = document.getElementById("aad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-auditadmin-detail");

  const [{ data: r }, { data: findings }, { data: messages }] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("aad-title-h").textContent = "🗂️ " + (r.client_name||"طلب مراجعة");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:12px;color:var(--dark)">${orgEsc(f.finding_text)}</div>
    ${f.client_response ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد العميل:</b> ${f.client_response}</div>` : '<div style="font-size:10px;color:var(--gray3);margin-top:4px">بانتظار رد العميل...</div>'}
    <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
      <select class="fs" style="font-size:11px;padding:4px" onchange="updateFindingStatus(${f.id},this.value,${requestId})">
        <option ${f.status==='مفتوحة'?'selected':''}>مفتوحة</option>
        <option ${f.status==='مغلقة'?'selected':''}>مغلقة</option>
      </select>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteAuditFinding(${f.id},${requestId})">حذف</button>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملاحظات مضافة بعد.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'var(--primary)'};color:${m.sender_email===r.requested_by_email?'var(--dark)':'#fff'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  box.innerHTML = `
    ${r.pending_final_approval ? `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${r.staff_closed_by||"—"}</div>
      ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveAuditRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى يعتمده مالك المنصة.</div>`}
    </div>` : ""}
    <div class="row2">
      <div class="fg"><label style="font-size:11px">الحالة</label>
        <select class="fs" id="aad-status">
          ${AUDIT_STATUS_ORDER.map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}
        </select>
      </div>
      <div class="fg"><label style="font-size:11px">المراجع المكلَّف (إيميل)</label><input class="fi" id="aad-reviewer" value="${orgEsc(r.assigned_reviewer_email||'')}" placeholder="reviewer@email.com"/></div>
    </div>
    <button class="btn btn-gold" style="width:100%;margin-bottom:14px" onclick="updateAuditRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ الحالة والتكليف</button>

    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:11.5px;line-height:2">
      <div><b>القطاع:</b> ${r.sector||"—"}</div>
      <div><b>حجم المؤسسة:</b> ${r.org_size||"—"}</div>
      <div><b>نطاق المراجعة:</b> ${r.scope||"—"}</div>
      <div><b>الموعد المفضّل:</b> ${r.preferred_date||"—"}</div>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>ملفات العميل</div>
    <div class="card"><div class="card-body">${filesHtml}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-document"></span>التقرير النهائي</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع تقرير نهائي بعد.</div>'}
      <div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-top:8px">
        <div style="font-size:11px;font-weight:800;color:var(--dark);margin-bottom:6px">ملخّص النتيجة (يظهر للعميل مباشرة بدون فتح التقرير)</div>
        <div class="fg" style="margin:0 0 6px"><label style="font-size:10.5px">نتيجة التفتيش</label>
          <select class="fs" id="aad-inspection-result" style="margin:0">
            <option value="">— اختر —</option>
            <option value="مقبول" ${r.inspection_result==='مقبول'?'selected':''}><span class="ico-i ico-check"></span>مقبول</option>
            <option value="مقبول مع ملاحظات" ${r.inspection_result==='مقبول مع ملاحظات'?'selected':''}><span class="ico-i ico-warning"></span>مقبول مع ملاحظات</option>
            <option value="غير مقبول" ${r.inspection_result==='غير مقبول'?'selected':''}><span class="ico-i ico-xcircle"></span>غير مقبول</option>
          </select>
        </div>
        <div class="row2" style="margin:0 0 6px">
          <div class="fg" style="margin:0"><label style="font-size:10.5px">عدد الملاحظات</label><input type="number" class="fi" id="aad-findings-count" style="margin:0" value="${r.key_findings_count??''}"/></div>
          <div class="fg" style="margin:0"><label style="font-size:10.5px">نسبة الامتثال %</label><input type="number" min="0" max="100" class="fi" id="aad-compliance-pct" style="margin:0" value="${r.compliance_pct??''}"/></div>
        </div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px">ملخّص نصّي مختصر (سطر أو سطرين)</label><textarea class="fta" id="aad-result-summary" rows="2" style="margin:0">${r.result_summary||''}</textarea></div>
      </div>
      <input type="file" class="fi" id="aad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalAuditReport(${requestId})">رفع التقرير النهائي وحفظ الملخّص</button>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>إضافة ملاحظة/إجراء مطلوب</div>
    <div class="card"><div class="card-body">
      <textarea class="fi" id="aad-new-finding" rows="2" placeholder="اكتب ملاحظة المراجعة..."></textarea>
      <button class="btn-xs primary" style="margin-top:6px" onclick="addAuditFinding(${requestId})">إضافة الملاحظة</button>
      ${findingsHtml}
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع العميل</div>
    <div class="card"><div class="card-body">
      <div style="max-height:200px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="aad-chat-input" placeholder="اكتب ردًا للعميل..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendAuditAdminMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
  `;
}

async function updateAuditRequestAdmin(requestId){
  const status = document.getElementById("aad-status").value;
  const assigned_reviewer_email = document.getElementById("aad-reviewer").value.trim() || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ assigned_reviewer_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من مالك المنصة قبل ما يظهر للعميل.");
    loadAuditAdmin();
    openAuditAdminDetail(requestId);
    return;
  }

  const payload = { status, assigned_reviewer_email };
  if(status === "مغلق") payload.closed_at = new Date().toISOString();
  if(isFullOwner) payload.pending_final_approval = false;
  const { error } = await sb.from("audit_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم التحديث ✅");
  loadAuditAdmin();
}

async function addAuditFinding(requestId){
  const el = document.getElementById("aad-new-finding");
  const finding_text = el.value.trim();
  if(!finding_text) return;
  const { error } = await sb.from("audit_findings").insert([{ request_id: requestId, finding_text }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  openAuditAdminDetail(requestId);
}

async function updateFindingStatus(findingId, status, requestId){
  await sb.from("audit_findings").update({ status }).eq("id", findingId);
  openAuditAdminDetail(requestId);
}

async function deleteAuditFinding(findingId, requestId){
  if(!await uiConfirm("حذف هذه الملاحظة؟")) return;
  await sb.from("audit_findings").delete().eq("id", findingId);
  openAuditAdminDetail(requestId);
}

async function uploadFinalAuditReport(requestId){
  const input = document.getElementById("aad-report-file");
  const url = await uploadFile(input, "audit-reports");
  if(!url) return;
  const summaryFields = {
    inspection_result: document.getElementById("aad-inspection-result").value || null,
    key_findings_count: document.getElementById("aad-findings-count").value || null,
    compliance_pct: document.getElementById("aad-compliance-pct").value || null,
    result_summary: document.getElementById("aad-result-summary").value.trim() || null
  };
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(!isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم رفع التقرير والملخّص ✅ — بانتظار اعتماد مالك المنصة قبل ما يظهر للعميل.");
    openAuditAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("audit_requests").update({ final_report_url: url, ...summaryFields, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي والملخّص وتحديث الحالة ✅");
  openAuditAdminDetail(requestId);
}

async function finalApproveAuditRequest(requestId, targetStatus){
  const { error } = await sb.from("audit_requests").update({ status: targetStatus, pending_final_approval: false, closed_at: targetStatus==="مغلق" ? new Date().toISOString() : null }).eq("id", requestId);
  if(error){ alert("تعذّر الاعتماد: " + error.message); return; }
  alert("تم الاعتماد النهائي ✅");
  openAuditAdminDetail(requestId);
  loadAuditAdmin();
}

async function sendAuditAdminMessage(requestId){
  const input = document.getElementById("aad-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("audit_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:"فريق المراجعة", message
  }]);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  input.value = "";
  openAuditAdminDetail(requestId);
}

async function loadAuditServiceTypesAdmin(){
  const box = document.getElementById("auditServicesAdminList");
  if(!box) return;
  const { data, error } = await sb.from("audit_service_types").select("*").order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد خدمات بعد.</div>'; return; }
  box.innerHTML = data.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray1)">
    <span style="font-size:12px">${orgEsc(s.name)}</span>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteAuditServiceType(${s.id})">حذف</button>
  </div>`).join("");
}

async function addAuditServiceType(){
  const name = document.getElementById("svc-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم الخدمة"); return; }
  const description = document.getElementById("svc-desc").value.trim();
  const duration_estimate = document.getElementById("svc-duration").value.trim();
  const { error } = await sb.from("audit_service_types").insert([{ name, description, duration_estimate }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  document.getElementById("svc-name").value=""; document.getElementById("svc-desc").value=""; document.getElementById("svc-duration").value="";
  loadAuditServiceTypesAdmin();
}

async function deleteAuditServiceType(id){
  if(!await uiConfirm("حذف هذه الخدمة من الكتالوج؟")) return;
  await sb.from("audit_service_types").delete().eq("id", id);
  loadAuditServiceTypesAdmin();
}

/* ══════════ RISK SERVICES — BACK OFFICE (platform team manages all clients' requests) ══════════ */
async function loadRiskAdmin(){
  const tbody = document.getElementById("riskAdminTbody");
  if(!tbody) return;
  const [{ data: requests, error }, { data: companies }, { data: services }] = await Promise.all([
    sb.from("risk_requests").select("*").order("created_at",{ascending:false}),
    sb.from("companies").select("id,name"),
    sb.from("risk_service_types").select("id,name")
  ]);
  if(error){ tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);font-size:12px">${error.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }

  const companyNameById = {}; (companies||[]).forEach(c=>{ companyNameById[c.id]=c.name; });
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });

  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openRiskAdminDetail(${r.id})">
    <td>${companyNameById[r.company_id]||"—"}</td>
    <td>${orgEsc(r.client_name||"—")}</td>
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${RISK_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td style="font-size:11px">${orgEsc(r.assigned_consultant_email||"— غير مكلَّف —")}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openRiskAdminDetail(${r.id})">إدارة</button></td>
  </tr>`).join("");
}

async function openRiskAdminDetail(requestId){
  const box = document.getElementById("rad-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-riskadmin-detail");

  const [{ data: r }, { data: items }, { data: messages }] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true})
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("rad-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة من العميل.</div>';

  const itemsHtml = (items||[]).length ? items.map(it => {
    const lvl = riskLevelInfo(it.likelihood, it.impact);
    return `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-size:12px;color:var(--dark);font-weight:700">${orgEsc(it.description||"")}</div>
        <span style="background:${lvl.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${lvl.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">الفئة: ${orgEsc(it.category||"—")} · الاحتمالية: ${it.likelihood??"—"}/5 · التأثير: ${it.impact??"—"}/5</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select class="fs" style="font-size:11px;padding:4px" onchange="updateRiskItemStatus(${it.id},this.value,${requestId})">
          <option ${it.action_status==='معلّق'?'selected':''}>معلّق</option>
          <option ${it.action_status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option>
          <option ${it.action_status==='مكتمل'?'selected':''}>مكتمل</option>
        </select>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteRiskItem(${it.id},${requestId})">حذف</button>
      </div>
    </div>`;
  }).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد مخاطر مضافة بعد.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'right':'left'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--offwhite)':'var(--primary)'};color:${m.sender_email===r.requested_by_email?'var(--dark)':'#fff'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  box.innerHTML = `
    ${r.pending_final_approval ? `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار الاعتماد النهائي — اعتمد أوليًا: ${r.staff_closed_by||"—"}</div>
      ${(currentUserProfile && currentUserProfile.is_platform_admin===true) ? `<div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'تقرير نهائي جاهز')"><span class="ico-i ico-check"></span>اعتماد نهائي — تقرير جاهز</button>
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="finalApproveRiskRequest(${requestId}, 'مغلق')"><span class="ico-i ico-check"></span>اعتماد نهائي — إغلاق كامل</button>
      </div>` : `<div style="font-size:11px;color:var(--gray3);margin-top:4px">لن يظهر للعميل حتى يعتمده مالك المنصة.</div>`}
    </div>` : ""}
    <div class="row2">
      <div class="fg"><label style="font-size:11px">الحالة</label>
        <select class="fs" id="rad-status">
          ${RISK_STATUS_ORDER.map(st=>`<option ${r.status===st?'selected':''}>${st}</option>`).join("")}
        </select>
      </div>
      <div class="fg"><label style="font-size:11px">المستشار المكلَّف (إيميل)</label><input class="fi" id="rad-consultant" value="${orgEsc(r.assigned_consultant_email||'')}" placeholder="consultant@email.com"/></div>
    </div>
    <button class="btn btn-gold" style="width:100%;margin-bottom:14px" onclick="updateRiskRequestAdmin(${requestId})"><span class="ico-i ico-save"></span>حفظ الحالة والتكليف</button>

    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-clipboard"></span>بيانات الطلب</div>
    <div class="card"><div class="card-body" style="font-size:11.5px;line-height:2">
      <div><b>القطاع:</b> ${r.sector||"—"}</div>
      <div><b>نطاق التقييم:</b> ${r.scope||"—"}</div>
      <div><b>أنواع المخاطر المطلوبة:</b> ${r.risk_types_needed||"—"}</div>
      <div><b>الموعد المفضّل:</b> ${r.preferred_date||"—"}</div>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>ملفات العميل</div>
    <div class="card"><div class="card-body">${filesHtml}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px">🌡️ المصفوفة الحرارية</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-document"></span>التقرير النهائي</div>
    <div class="card"><div class="card-body">
      ${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-document"></span>عرض التقرير المرفوع</a>` : '<div style="font-size:11px;color:var(--gray3);margin-bottom:8px">لم يُرفع تقرير نهائي بعد.</div>'}
      <input type="file" class="fi" id="rad-report-file" style="margin-top:8px"/>
      <button class="btn-xs primary" style="margin-top:6px" onclick="uploadFinalRiskReport(${requestId})">رفع التقرير النهائي</button>
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>إضافة خطر</div>
    <div class="card"><div class="card-body">
      <input class="fi" id="rad-item-desc" placeholder="وصف الخطر" style="margin-bottom:6px"/>
      <div class="row2">
        <input class="fi" id="rad-item-source" placeholder="مصدر الخطر" style="margin:0"/>
        <select class="fs" id="rad-item-category" style="margin:0">
          <option>استراتيجية</option><option>تشغيلية</option><option>مالية</option><option>امتثال / قانونية</option><option>سلامة / بيئية</option>
        </select>
      </div>
      <div class="row2" style="margin-top:6px">
        <div><label style="font-size:10.5px;color:var(--gray3)">الاحتمالية (1-5)</label><input type="number" min="1" max="5" class="fi" id="rad-item-likelihood" style="margin:0"/></div>
        <div><label style="font-size:10.5px;color:var(--gray3)">التأثير (1-5)</label><input type="number" min="1" max="5" class="fi" id="rad-item-impact" style="margin:0"/></div>
      </div>
      <textarea class="fi" id="rad-item-treatment" rows="2" placeholder="خطة المعالجة المقترحة" style="margin-top:6px"></textarea>
      <div class="row2" style="margin-top:6px">
        <input class="fi" id="rad-item-responsible" placeholder="المسؤول عن التنفيذ" style="margin:0"/>
        <input type="date" class="fi" id="rad-item-target-date" style="margin:0"/>
      </div>
      <button class="btn-xs primary" style="margin-top:8px" onclick="addRiskItem(${requestId})">إضافة الخطر</button>
      ${itemsHtml}
    </div></div>

    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع العميل</div>
    <div class="card"><div class="card-body">
      <div style="max-height:200px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="rad-chat-input" placeholder="اكتب ردًا للعميل..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendRiskAdminMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
  `;
}

async function updateRiskRequestAdmin(requestId){
  const status = document.getElementById("rad-status").value;
  const assigned_consultant_email = document.getElementById("rad-consultant").value.trim() || null;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isFinalStatus = status === "مغلق" || status === "تقرير نهائي جاهز";

  if(isFinalStatus && !isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("risk_requests").update({ assigned_consultant_email, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم حفظ التغييرات — إنهاء الطلب يحتاج اعتماد نهائي من مالك المنصة قبل ما يظهر للعميل.");
    loadRiskAdmin();
    openRiskAdminDetail(requestId);
    return;
  }

  const payload = { status, assigned_consultant_email };
  if(status === "مغلق") payload.closed_at = new Date().toISOString();
  if(isFullOwner) payload.pending_final_approval = false;
  const { error } = await sb.from("risk_requests").update(payload).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم التحديث ✅");
  loadRiskAdmin();
}

async function addRiskItem(requestId){
  const description = document.getElementById("rad-item-desc").value.trim();
  if(!description){ alert("الرجاء إدخال وصف الخطر"); return; }
  const source = document.getElementById("rad-item-source").value.trim();
  const category = document.getElementById("rad-item-category").value;
  const likelihood = Number(document.getElementById("rad-item-likelihood").value) || null;
  const impact = Number(document.getElementById("rad-item-impact").value) || null;
  const treatment_plan = document.getElementById("rad-item-treatment").value.trim();
  const responsible_person = document.getElementById("rad-item-responsible").value.trim();
  const target_close_date = document.getElementById("rad-item-target-date").value || null;
  const { error } = await sb.from("risk_items").insert([{
    request_id: requestId, description, source, category, likelihood, impact, treatment_plan, responsible_person, target_close_date
  }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  openRiskAdminDetail(requestId);
}

async function updateRiskItemStatus(itemId, action_status, requestId){
  await sb.from("risk_items").update({ action_status }).eq("id", itemId);
  openRiskAdminDetail(requestId);
}

async function deleteRiskItem(itemId, requestId){
  if(!await uiConfirm("حذف هذا الخطر؟")) return;
  await sb.from("risk_items").delete().eq("id", itemId);
  openRiskAdminDetail(requestId);
}

async function uploadFinalRiskReport(requestId){
  const input = document.getElementById("rad-report-file");
  const url = await uploadFile(input, "risk-reports");
  if(!url) return;
  const isFullOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  if(!isFullOwner){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const { error } = await sb.from("risk_requests").update({ final_report_url: url, pending_final_approval: true, staff_closed_by: myEmail }).eq("id", requestId);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
    alert("تم رفع التقرير ✅ — بانتظار اعتماد مالك المنصة قبل ما يظهر للعميل.");
    openRiskAdminDetail(requestId);
    return;
  }
  const { error } = await sb.from("risk_requests").update({ final_report_url: url, status: "تقرير نهائي جاهز", pending_final_approval: false }).eq("id", requestId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم رفع التقرير النهائي وتحديث الحالة ✅");
  openRiskAdminDetail(requestId);
}

async function finalApproveRiskRequest(requestId, targetStatus){
  const { error } = await sb.from("risk_requests").update({ status: targetStatus, pending_final_approval: false, closed_at: targetStatus==="مغلق" ? new Date().toISOString() : null }).eq("id", requestId);
  if(error){ alert("تعذّر الاعتماد: " + error.message); return; }
  alert("تم الاعتماد النهائي ✅");
  openRiskAdminDetail(requestId);
  loadRiskAdmin();
}

async function sendRiskAdminMessage(requestId){
  const input = document.getElementById("rad-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("risk_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:"فريق المخاطر", message
  }]);
  if(error){ alert("تعذّر الإرسال: " + error.message); return; }
  input.value = "";
  openRiskAdminDetail(requestId);
}

async function loadRiskServiceTypesAdmin(){
  const box = document.getElementById("riskServicesAdminList");
  if(!box) return;
  const { data, error } = await sb.from("risk_service_types").select("*").order("id",{ascending:true});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد خدمات بعد.</div>'; return; }
  box.innerHTML = data.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray1)">
    <span style="font-size:12px">${orgEsc(s.name)}</span>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="deleteRiskServiceType(${s.id})">حذف</button>
  </div>`).join("");
}

async function addRiskServiceType(){
  const name = document.getElementById("rsvc-name").value.trim();
  if(!name){ alert("الرجاء إدخال اسم الخدمة"); return; }
  const description = document.getElementById("rsvc-desc").value.trim();
  const duration_estimate = document.getElementById("rsvc-duration").value.trim();
  const { error } = await sb.from("risk_service_types").insert([{ name, description, duration_estimate }]);
  if(error){ alert("تعذّر الإضافة: " + error.message); return; }
  document.getElementById("rsvc-name").value=""; document.getElementById("rsvc-desc").value=""; document.getElementById("rsvc-duration").value="";
  loadRiskServiceTypesAdmin();
}

async function deleteRiskServiceType(id){
  if(!await uiConfirm("حذف هذه الخدمة من الكتالوج؟")) return;
  await sb.from("risk_service_types").delete().eq("id", id);
  loadRiskServiceTypesAdmin();
}


/* ══════════ CONSULTANTS ══════════ */
/* ══════════ CONSULTATION REQUESTS (chairman/secretary → admin quote → chairman decision) ══════════ */
const CONSULT_REQUEST_ROLES = ['مدير النظام'];
let consultRequestsCache = [];
const CONSULT_STATUS_STYLE = {
  "جديد": { bg:"var(--offwhite)", color:"var(--gray3)" },
  "عرض سعر مقدم": { bg:"#EAF0F8", color:"var(--primary)" },
  "معتمد": { bg:"#E8F8EF", color:"var(--green)" },
  "مرفوض": { bg:"#FDE8E8", color:"var(--red)" }
};

async function loadConsultantsPage(){
  const role = getCurrentRole();
  const isPlatformOwner = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const consultSection = document.getElementById("consultRequestsSection");
  const newBtn = document.getElementById("btn-new-consult-request");
  const addProviderBtn = document.getElementById("btn-add-provider");
  const providersTitle = document.getElementById("providersSectionTitle");
  const historyTitle = document.getElementById("requestsHistoryTitle");
  const historyCol1 = document.getElementById("requestsHistoryCol1");

  if(isPlatformOwner){
    // Platform owner manages the global provider catalog and coordinates every client's
    // service requests — they don't request consultations from themselves.
    if(consultSection) consultSection.style.display = "none";
    if(addProviderBtn) addProviderBtn.style.display = "inline-block";
    if(providersTitle) providersTitle.textContent = "🤝 إدارة الوسطاء (كتالوج عام لكل الشركات)";
    if(historyTitle) historyTitle.textContent = "📋 طلبات الخدمة الواردة من كل الشركات";
    if(historyCol1) historyCol1.textContent = "الشركة";
  } else {
    if(consultSection) consultSection.style.display = "block";
    if(newBtn) newBtn.style.display = CONSULT_REQUEST_ROLES.includes(role) ? "inline-block" : "none";
    if(addProviderBtn) addProviderBtn.style.display = "none";
    if(providersTitle) providersTitle.textContent = "🤝 وساطة — مقدّمو الخدمات";
    if(historyTitle) historyTitle.textContent = "📋 الطلبات السابقة";
    if(historyCol1) historyCol1.textContent = "النوع";
    await loadConsultRequests(role);
  }

  await loadServiceProviders(isPlatformOwner);
  await loadAllRequestsHistory(isPlatformOwner);
}

async function loadConsultRequests(role){
  const box = document.getElementById("consultRequestsList");
  if(!box) return;
  const { data, error } = await sb.from("consultation_requests").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  consultRequestsCache = data || [];
  if(consultRequestsCache.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد طلبات استشارة بعد.</div>'; return; }

  const isAdmin = role === 'مدير النظام';
  const isChairman = role === 'رئيس مجلس';
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  box.innerHTML = consultRequestsCache.map(r => {
    const st = CONSULT_STATUS_STYLE[r.status] || CONSULT_STATUS_STYLE["جديد"];
    let actionHtml = "";
    if(r.status === "جديد"){
      actionHtml = isAdmin
        ? `<div style="margin-top:10px;padding:10px;background:var(--offwhite);border-radius:8px">
            <div class="row2">
              <div class="fg"><label style="font-size:11px">قيمة عرض السعر (ريال)</label><input type="number" class="fi" id="quote-amount-${r.id}"/></div>
              <div class="fg"><label style="font-size:11px">ملاحظات العرض</label><input class="fi" id="quote-notes-${r.id}"/></div>
            </div>
            <button class="btn-xs primary" onclick="submitQuote(${r.id})"><span class="ico-i ico-send"></span>تقديم عرض السعر</button>
          </div>`
        : `<div style="font-size:11px;color:var(--gray3);margin-top:6px">⏳ بانتظار عرض سعر من مدير النظام</div>`;
    } else if(r.status === "عرض سعر مقدم"){
      actionHtml = `<div style="font-size:12px;margin-top:6px"><span class="ico-i ico-money"></span>عرض السعر: <b>${r.quote_amount ? Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')+' ريال' : '—'}</b>${r.quote_notes ? (' — '+r.quote_notes) : ''}</div>` +
        (isChairman
          ? `<div style="display:flex;gap:6px;margin-top:8px">
              <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="decideConsultRequest(${r.id},'معتمد')"><span class="ico-i ico-check"></span>موافقة</button>
              <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="decideConsultRequest(${r.id},'مرفوض')"><span class="ico-i ico-xcircle"></span>رفض</button>
            </div>`
          : `<div style="font-size:11px;color:var(--gray3);margin-top:6px">⏳ بانتظار قرار رئيس المجلس</div>`);
    } else {
      actionHtml = `<div style="font-size:12px;margin-top:6px"><span class="ico-i ico-money"></span>عرض السعر: ${r.quote_amount ? Number(r.quote_amount).toLocaleString('ar-SA-u-ca-gregory')+' ريال' : '—'}</div>`;
    }
    // Only the original requester (or an admin) can edit/withdraw a request, and only
    // before a quote has been submitted — after that point it's already in motion.
    const canEditDelete = r.status === "جديد" && (isAdmin || (myEmail && r.requested_by_email === myEmail));
    const editDeleteHtml = canEditDelete
      ? `<div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn-xs primary" onclick="editConsultRequest(${r.id})"><span class="ico-i ico-edit"></span>تعديل</button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer" onclick="deleteConsultRequest(${r.id})"><span class="ico-i ico-trash"></span>حذف</button>
        </div>`
      : "";
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(r.category||"")} <span style="font-size:11px;color:var(--gray3);font-weight:600">— طلب #${r.id}</span></div>
            <div style="font-size:12px;color:var(--gray3);margin-top:3px">${r.details||""}</div>
            <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">مقدَّم من: ${orgEsc(r.requested_by_name||"—")} · ${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory') : ''}</div>
          </div>
          <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;background:${st.bg};color:${st.color}">${r.status}</span>
        </div>
        ${actionHtml}
        ${editDeleteHtml}
      </div>
    </div>`;
  }).join("");
}

async function submitConsultRequest(){
  const id = document.getElementById("mcr-id").value;
  const category = document.getElementById("mcr-category").value;
  const details = document.getElementById("mcr-details").value.trim();
  if(!details){ alert("الرجاء إدخال تفاصيل الطلب"); return; }

  if(id){
    const { error } = await sb.from("consultation_requests").update({ category, details }).eq("id", id);
    if(error){ alert("تعذّر حفظ التعديل: " + error.message); return; }
  } else {
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData && userData.user ? userData.user.email : null;
    const requested_by_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
    const { error } = await sb.from("consultation_requests").insert([{
      category, details, requested_by_name, requested_by_email: myEmail, status: "جديد", company_id: currentCompanyId
    }]);
    if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  }
  document.getElementById("mcr-id").value = "";
  document.getElementById("mcr-title-h").textContent = "💼 تقديم طلب استشارة";
  closeM("m-consult-request");
  loadConsultantsPage();
}

function editConsultRequest(id){
  const r = consultRequestsCache.find(x => x.id === id);
  if(!r) return;
  document.getElementById("mcr-id").value = r.id;
  document.getElementById("mcr-title-h").textContent = "✏️ تعديل طلب الاستشارة";
  document.getElementById("mcr-category").value = r.category || "إدارية";
  document.getElementById("mcr-details").value = r.details || "";
  openM("m-consult-request");
}

async function deleteConsultRequest(id){
  if(!await uiConfirm("هل تريد حذف/سحب هذا الطلب نهائيًا؟")) return;
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadConsultantsPage();
}

async function submitQuote(requestId){
  const amountEl = document.getElementById("quote-amount-"+requestId);
  const notesEl = document.getElementById("quote-notes-"+requestId);
  const quote_amount = amountEl && amountEl.value ? Number(amountEl.value) : null;
  if(!quote_amount){ alert("الرجاء إدخال قيمة عرض السعر"); return; }
  const quote_notes = notesEl ? notesEl.value.trim() : "";
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const quoted_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { error } = await sb.from("consultation_requests").update({
    quote_amount, quote_notes, quoted_by, status: "عرض سعر مقدم"
  }).eq("id", requestId);
  if(error){ alert("تعذّر إرسال العرض: " + error.message); return; }
  loadConsultantsPage();
}

async function decideConsultRequest(requestId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const decision_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const { error } = await sb.from("consultation_requests").update({
    status: decision, decision_by, decision_at: new Date().toISOString()
  }).eq("id", requestId);
  if(error){ alert("تعذّر تسجيل القرار: " + error.message); return; }
  loadConsultantsPage();
}

/* ══════════ SERVICE PROVIDER MARKETPLACE (وساطة) ══════════ */
const SERVICE_STAGES = ["قيد المراجعة", "قيد التنفيذ", "مكتمل"];
let providersCache = [];

async function loadServiceProviders(isPlatformOwner){
  const grid = document.getElementById("providersGrid");
  if(!grid) return;
  // Providers are now a platform-wide catalog the owner curates — every company sees the
  // same list, not just what their own company happened to add before.
  const { data, error } = await sb.from("service_providers").select("*").order("id",{ascending:false});
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${error.message}</div>`; return; }
  providersCache = data || [];
  if(providersCache.length===0){ grid.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">${isPlatformOwner ? 'لا توجد جهات مضافة بعد. اضغط "+ إضافة" للبدء.' : 'لا توجد جهات وساطة متاحة حاليًا.'}</div>`; return; }

  const canRequest = !isPlatformOwner && isFullAccessRole(getCurrentRole());
  grid.innerHTML = providersCache.map(p => `<div class="card" style="margin:0;display:flex;flex-direction:column">
    <div class="card-body" style="display:flex;flex-direction:column;flex:1">
      <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(p.entity_name||"")}</div>
      <div style="font-size:11.5px;color:var(--gray3);margin-top:4px">🛠️ ${p.service_provided||"—"}</div>
      <div style="font-size:11.5px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-tag"></span>${p.activity_type||"—"}</div>
      <div style="font-size:11px;color:var(--gray3);margin-top:2px"><span class="ico-i ico-document"></span>س.ت: ${p.cr_number||"—"}</div>
      ${canRequest ? `<button class="btn-xs gold" style="width:100%;margin-top:auto;padding-top:10px" onclick="requestService(${p.id})"><span class="ico-i ico-handshake"></span>اطلب الخدمة</button>` : (isPlatformOwner ? `<button class="btn-xs" style="width:100%;margin-top:auto;padding-top:10px;background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px;cursor:pointer" onclick="deleteServiceProvider(${p.id})"><span class="ico-i ico-trash"></span>حذف</button>` : "")}
    </div>
  </div>`).join("");
}

async function deleteServiceProvider(id){
  if(!await uiConfirm("حذف هذه الجهة من كتالوج الوسطاء؟")) return;
  await sb.from("service_providers").delete().eq("id", id);
  loadServiceProviders(true);
}

async function saveServiceProvider(){
  const entity_name = document.getElementById("mpv-name").value.trim();
  if(!entity_name){ alert("الرجاء إدخال اسم الجهة"); return; }
  const service_provided = document.getElementById("mpv-service").value.trim();
  const activity_type = document.getElementById("mpv-activity").value.trim();
  const cr_number = document.getElementById("mpv-cr").value.trim();
  // company_id intentionally omitted — providers are now a platform-wide catalog managed
  // solely by the platform owner, not tied to any one company.
  const { error } = await sb.from("service_providers").insert([{ entity_name, service_provided, activity_type, cr_number }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mpv-name").value=""; document.getElementById("mpv-service").value=""; document.getElementById("mpv-activity").value=""; document.getElementById("mpv-cr").value="";
  closeM("m-provider-add");
  loadServiceProviders(true);
}

async function requestService(providerId){
  if(!await uiConfirm("تأكيد إرسال طلب الخدمة لهذه الجهة؟")) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const requested_by_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  const { data, error } = await sb.from("service_requests").insert([{
    provider_id: providerId, requested_by_name, requested_by_email: myEmail, status: SERVICE_STAGES[0], company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  loadAllRequestsHistory();
  openServiceTrackingModal(data.id);
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
  const canAdvance = isFullAccessRole(getCurrentRole());
  if(canAdvance && currentIdx >= 0 && currentIdx < SERVICE_STAGES.length-1){
    advanceBox.innerHTML = `<button class="btn btn-gold" style="width:100%" onclick="advanceServiceRequest()">⏩ نقل إلى: ${SERVICE_STAGES[currentIdx+1]}</button>`;
  } else {
    advanceBox.innerHTML = "";
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

