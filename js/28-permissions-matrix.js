/* ══════════ PERMISSIONS MATRIX (flexible, company-editable) ══════════ */
const PERM_CATEGORY_ORDER = [
  "الصلاحيات الاستراتيجية والتنظيمية",
  "الصلاحيات المتعلقة بالموارد البشرية",
  "الصلاحيات المالية والاستثمارية",
  "الصلاحيات التشغيلية"
];
let permHoldersCache = [];
let permItemsCache = [];
let permCellsCache = {}; // key: itemId+'-'+holderId -> code

const PERM_CATEGORY_ICONS = {
  "الصلاحيات الاستراتيجية والتنظيمية": "🎯",
  "الصلاحيات المتعلقة بالموارد البشرية": "👥",
  "الصلاحيات المالية والاستثمارية": "💰",
  "الصلاحيات التشغيلية": "⚙️"
};
function permCodeStyle(code){
  if(code==="ع") return "background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border:none";
  if(code==="ت") return "background:linear-gradient(135deg,#0EA5A0,#0C8B87);color:#fff;border:none";
  if(code==="م") return "background:linear-gradient(135deg,var(--gold),var(--gold3));color:var(--dark);border:none";
  return "background:var(--offwhite);color:var(--gray2);border:1.5px dashed var(--gray1)";
}
function onPermCellChange(sel, itemId, holderId){
  sel.style.cssText = "font-size:12.5px;font-weight:900;text-align:center;text-align-last:center;padding:6px 4px;border-radius:8px;width:52px;cursor:pointer;appearance:none;-webkit-appearance:none;" + permCodeStyle(sel.value);
  savePermCell(itemId, holderId, sel.value);
}

async function loadPermissionsMatrix(){
  const thead = document.getElementById("permMatrixThead");
  const tbody = document.getElementById("permMatrixTbody");
  if(!tbody) return;

  const [{ data: holders, error: hErr }, { data: items, error: iErr }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}).order("id",{ascending:true}),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}).order("id",{ascending:true})
  ]);
  if(hErr || iErr){ tbody.innerHTML = errorRowHTML(2, (hErr||iErr).message); return; }
  permHoldersCache = holders || [];
  permItemsCache = items || [];

  if(permHoldersCache.length===0 || permItemsCache.length===0){
    thead.innerHTML = "<tr><th>البند</th></tr>";
    tbody.innerHTML = emptyRowHTML(1, 'أضف "صاحب صلاحية" (عمود) و"بند" (صف) واحد على الأقل لبدء بناء المصفوفة.');
    return;
  }

  const itemIds = permItemsCache.map(i=>i.id);
  const { data: cells, error: cErr } = await sb.from("permission_cells").select("*").in("item_id", itemIds);
  if(cErr){ tbody.innerHTML = errorRowHTML(2, cErr.message); return; }
  permCellsCache = {};
  (cells||[]).forEach(c => { permCellsCache[c.item_id+'-'+c.holder_id] = c.code; });

  // Header row: item column + one polished chip-style column per holder
  thead.innerHTML = '<tr>'
    + '<th style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;padding:14px 16px;font-size:12.5px">البند</th>'
    + permHoldersCache.map(h =>
        `<th style="background:linear-gradient(135deg,var(--primary),var(--accent));text-align:center;color:#fff;padding:12px 8px;font-size:11.5px;font-weight:800;min-width:110px">${orgEsc(h.name)}</th>`
      ).join('')
    + '</tr>';

  // Group items by category, preserving a sensible fixed category order
  const groups = {};
  permItemsCache.forEach(it => {
    const cat = it.category || "الصلاحيات التشغيلية";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(it);
  });
  const cats = Object.keys(groups).sort((a,b)=>{
    const ia = PERM_CATEGORY_ORDER.indexOf(a), ib = PERM_CATEGORY_ORDER.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b,'ar');
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });

  const colCount = permHoldersCache.length + 1;
  let rows = "";
  cats.forEach(cat => {
    const icon = PERM_CATEGORY_ICONS[cat] || "📋";
    rows += `<tr><td colspan="${colCount}" style="background:var(--offwhite);border-right:4px solid var(--gold);font-weight:800;color:var(--primary);font-size:12px;padding:10px 16px">${icon} ${cat}</td></tr>`;
    groups[cat].forEach(it => {
      rows += `<tr>
        <td style="padding:10px 16px;font-size:12.5px;font-weight:600;color:var(--dark)">${orgEsc(it.item_name||"")} <button class="btn-xs sec" style="padding:2px 8px;font-size:11px;margin-inline-start:6px" onclick="openGovLinkPicker('authority',${it.id})" title="ربط ببنود أخرى">🔗</button><div class="glinks" id="glk-authority-${it.id}" data-glinks="authority:${it.id}" style="margin-top:4px"></div></td>`;
      permHoldersCache.forEach(h => {
        const key = it.id+'-'+h.id;
        const code = permCellsCache[key] || "";
        rows += `<td style="text-align:center;padding:8px">
          <select onchange="onPermCellChange(this,${it.id},${h.id})" style="font-size:12.5px;font-weight:900;text-align:center;text-align-last:center;padding:6px 4px;border-radius:8px;width:52px;cursor:pointer;appearance:none;-webkit-appearance:none;${permCodeStyle(code)}">
            <option value="" ${code===""?"selected":""}>—</option>
            <option value="ت" ${code==="ت"?"selected":""}>ت</option>
            <option value="ع" ${code==="ع"?"selected":""}>ع</option>
            <option value="م" ${code==="م"?"selected":""}>م</option>
          </select>
        </td>`;
      });
      rows += `</tr>`;
    });
  });
  tbody.innerHTML = rows;
  (typeof permItemsCache !== "undefined" ? permItemsCache : []).forEach(it => { if(typeof renderGovLinks === "function") renderGovLinks(`glk-authority-${it.id}`, "authority", it.id); });
}

async function savePermHolder(){
  const name = document.getElementById("mph-name").value.trim();
  if(!name){ alert("الرجاء إدخال الاسم"); return; }
  const { error } = await sb.from("permission_holders").insert([{ name, company_id: currentCompanyId, sort_order: permHoldersCache.length }]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  document.getElementById("mph-name").value = "";
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

async function renamePermHolder(id){
  const h = permHoldersCache.find(x => x.id === id);
  if(!h) return;
  const name = await uiPrompt("اسم الجهة الجديد:", h.name || "");
  if(name === null) return;
  const clean = name.trim();
  if(!clean || clean === h.name) return;
  // Only the name changes — the cells (ت / ع / م) belong to the holder's id, so nothing in the matrix is lost.
  const { error } = await sb.from("permission_holders").update({ name: clean }).eq("id", id);
  if(error){ alert("تعذّر التعديل: " + error.message); return; }
  logActivity("تعديل", "جهة بمصفوفة الصلاحيات", clean, `تغيير الاسم من "${h.name}"`);
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

async function deletePermHolder(id){
  if(!await uiConfirm("حذف هذه الجهة سيحذف كل قيمها بالمصفوفة. متابعة؟")) return;
  const { error } = await sb.from("permission_holders").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  await loadPermissionsMatrix();
  renderPermHoldersManageList();
}

function renderPermHoldersManageList(){
  const list = document.getElementById("permHoldersManageList");
  if(!list) return;
  if(permHoldersCache.length===0){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد جهات بعد.</div>'; return; }
  list.innerHTML = permHoldersCache.map(h => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--gray1);font-size:12.5px">
      <span>${orgEsc(h.name)}</span>
      <div style="display:flex;gap:6px">
        <button style="background:var(--offwhite);color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="renamePermHolder(${h.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deletePermHolder(${h.id})"><span class="ico-i ico-trash"></span>حذف</button>
      </div>
    </div>`).join('');
}

function openPermHoldersManager(){
  renderPermHoldersManageList();
  document.getElementById("mph-name").value = "";
  openM("m-perm-holder");
}

function renderPermItemsManageList(){
  const list = document.getElementById("permItemsManageList");
  if(!list) return;
  if(permItemsCache.length===0){ list.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد بنود بعد.</div>'; return; }
  list.innerHTML = permItemsCache.map(it => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--gray1);font-size:12.5px">
      <span>${orgEsc(it.item_name)}<br><span style="font-size:10px;color:var(--gray3)">${orgEsc(it.category||"")}</span></span>
      <div style="display:flex;gap:6px">
        <button style="background:var(--offwhite);color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openPermItemEditModal(${it.id})"><span class="ico-i ico-edit"></span>تعديل</button>
        <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="deletePermItemFromManager(${it.id})"><span class="ico-i ico-trash"></span>حذف</button>
      </div>
    </div>`).join('');
}

const STANDARD_PERM_MATRIX_ITEMS = {"الصلاحيات الاستراتيجية والتنظيمية": ["تعديل عقد التأسيس والنظام الأساسي للشركة", "اعتماد سياسات الشركة", "اعتماد إعادة هيلكة الإدارات التفصيلية", "اعتماد إجراءات العمل", "تصميم الرؤيا والرسالة والأهداف والاستراتيجيات العامة", "اعتماد الأهداف الاستراتيجية", "اعتماد خطة عمل الشركة ( Business Plan ) الخمسية", "اعتماد خطط عمل ( Action Plans ) سنوية للإدارات", "الدخول في مجالات عمل جديدة", "الخروج من مجالات عمل حالية", "الهيكل التنظيمي للشركة (الإدارة العليا)", "اعتماد مصفوفة مصفوفات الصلاحيات والمسؤوليات", "عقد تحالف استراتيجي مع جهات خارج الشركة", "اعتماد عمليات الاستحواذ والاندماج", "التوسع الجغرافي في أعمال الشركة داخل المملكة", "التوسع الجغرافي في أعمال الشركة خارج المملكة", "وقف التعامل مع عميل استراتيجي للشركة", "اعتماد وضع مؤشرات الأداء", "إعادة هيكلة الإدارات الإدارة الوسطى فما دون", "تعديل مهام وحدة تنظيمية (إدارة) على مستوى الشركة", "اعتماد تقييم تقارير الأداء الدورية للإدارات", "مؤشرات الأداء الرئيس التنفيذي", "مؤشرات الأداء للرئيس التنفيذي", "مؤشرات الأداء لنواب الرئيس", "مؤشرات الأداء لمديري الإدارات", "مؤشرات الأداء للموظفين", "التعديل على الأنظمة الآلية وتدفق الإجراءات", "إلغاء أو تعديل أو إضافة إجراء على النظام الآلي"], "الصلاحيات المتعلقة بالموارد البشرية": ["اعتماد دليل سياسات وإجراءات الموارد البشرية وتعديل لوائح الموارد البشرية", "اعتماد خطة احتياجات الشركة السنوية من الموارد البشرية", "اعتماد وتعديل سلم الرواتب والاجور", "تفسير احكام سياسات الموارد البشرية", "اعتماد استحداث وظيفة جديدة خارج خطة التوظيف", "اعتماد تعديل وصف الوظائف وإعادة تصنيف الوظائف ضمن سلم المرتبات", "اعتماد النص النمطي للأعلان عن الوظيفة", "توقيع عرض / عقد العمل", "إعطاء موافقة لنقل خدمات موظف لشركة أخرى", "الاتفاق مع مؤسسات التوظيف المتخصصة لإيجاد الأشخاص الكافات المطلوبة", "الأشتراك في مواقع التوظيف المتخصصة لتوفير السير الذاتية للوظائف المطلوبة", "اعتماد تجديد او تعديل عقد العمل", "الموافقة على تعين موظفين مؤقتين", "موافقة على تمديد مدة تجربة الموظف الجديد", "اعتماد دفع بدل ساعات إضافية بموجب تصريح مسبق بالعمل الإضافي", "اعتماد دفع بدل ساعات إضافية للموظفين دون وجود امر كتابي مسبق", "اعتماد توفير مسكن لأحد الموظفين أو دفع بدل سكن حسب السياسات", "التدريب داخل المملكة بحسب الموازنة", "اعتماد توفير سيارة لأحد موظفي الشركة أو دفع بدل نقل حسب سياسات الشركة", "التدريب خارج المملكة بحسب الموازنة", "الموافقة على حضور / اشتراك الموظف في المؤتمرات والمحاضرات الخارجية ( مدفوعه )", "الموافقة على حضور / اشتراك الموظف في المؤتمرات والمحاضرات الداخلية ( مدفوعه )", "لغاية 10 أيام (لمرة واحدة في السنة)", "لغاية 20 يوم (لمرة واحدة في السنة)", "أكثر من 20 يوم وحتى 30 يوم على الاتزيد الاجازة السنوية عن 60 يوم متصلة.", "تقييم أداء الموظفين", "الزيادة الدورية الاعتيادية للموظفين / العلاوات السنوية", "الترقيات", "المكافآت السنوية لجميع الموظفين (جماعية)/ العمولات بناءً على الأداء", "زيادة راتب/ ترقية/ علاوة/ مكافأة (استثنائيا)", "زيادة الراتب بما يزيد عن 20% من راتب الموظف الاجمالي", "مكافآت استثنائية للموظفين بما لا يزيد عن الراتب الإجمالي الشهري للموظف ولا يتجاوز 100 ألف بالسنة", "اعتماد تكليف موظف للعمل في وظيفة أخرى ضمن نفس الإدارة", "اعتماد تكليف موظف للعمل في وظيفة أخرى في إدارة أخرى", "اعتماد أعارة موظفين إلى مؤسسات أخرى", "الموافقة على تأخر / مغادرة الموظف في الحضور أو الأنصراف لمكان العمل لفترة محدودة", "التصريح بالبقاء في مواقع العمل أو الدخول أو الخروج منها خارج أوقات الدوام الرسمي", "البت بتظلم الموظفين", "دفع مستحقات موظفي الشركة للإجازة أو نهاية الخدمة", "دفع مستحقات موظفي الشركة نهاية الخدمة", "تصفية على رأس العمل دون الذهاب للإجازة لحاجة العمل", "صرف دفعات لا تزيد عن 50% من مستحقات الموظفين المنتهية خدماتهم ومعتمد نقل كفالاتهم قبل نقل الكفالة", "الموافقة على تغيب الموظف عن العمل مقابل ساعات عمل أضافي", "الموافقة على تراكم الأجازات السنوية في حدود السياسة المعتمدة", "البت في الخالفات الناتجه عن تضارب مواعيد الأجازات السنوية للموظفين", "اعتماد صرف النفقات التي تكبدها الموظف الذي قطعت أجازته بناء طلب الشركة", "اعتماد صرف قيمة تذكرة السفر نقدا في حال عدم تمتع الموظف في الأجازة السنوية", "اعتماد قبول التقرير الطبي المدعم لطلب الأجازةالمرضية", "اعتماد منح الموظف أجازت الحج", "التنقل الداخلي بين الإدارات / القطاعات", "التنقل داخل القطاع مدير إدارة / موظفين", "التنقل خارج القطاع مدير إدارة / موظفين", "اعتماد ترقية درجة التأمين الطبي للموظف على حسابه الشخصي (بشرط عدم مخالفة وثيقة التأمين الطبي السارية)", "الخدمات الحكومية لموظفي الشركة", "مخاطبات إدارة الجوازات", "إصدار تصاريح العمل", "تجديد وإصدار الاقامات لمرة وأكثر من مرة", "إصدار تأشيرة خروج وعودة متعدد لحاجة العمل", "إصدار تأشيرة خروج وعودة متعدد على حساب الموظف", "إصدار تأشيرة خروج وعودة مفرد بما يتجاوز المدة المحددة بسياسات الشركة", "تعديل المهنة لضرورات العمل على حساب الشركة", "طلب إصدار تأشيرات العمل الجديدة", "إصدار وتمديد تأشيرات الزيارات لأغراض العمل", "الموافقة على منح الموظفة المتزوجة أجازة أمومة", "أقرار اعفاء الموظف المستقيل أو المفصول من فترة الأنذار", "اعتماد تمديد خدمة الموظف الذي وصل إلى سن التقاعد", "انهاء خدمة الموظف بسبب العجز الدائم أو عدم اللياقه الصحية", "توقيع شهادة اخلاء الطرف / شهادة الخبرة", "تعديل مهام وحدة / قسم / إدارة أو تعديل وتغير مسمى وظيفي", "الموافقة على سحب ملفات وسجلات الموظفين أو الأطلاع عليها", "اعتماد عمل إضافي خارج أوقات الدوام الرسمي (يصرف لما هو دون مدير الادارة) بما لايزيد عن 50% عن الراتب الشهري", "اعتماد منح السلف للموظفين حسب السياسات", "سلف استثنائية السياسات بما لا يزيد عن راتب شهرين للموظف الواحد وبسقف لا يتجاوز رصيده 100,000 ريال لجميع السلف الاستثنائية القائمة", "اعتماد تأجيل خصم أقساط سلفة موظف لمدة لا تزيد عن شهر.", "اعتماد تأجيل خصم أقساط سلفة موظف لمدة لا تزيد عن ثلاثة شهور", "التنازل عن شرط الكفيل اللازم للحصول على سلفة في حدود رصيد مكافأة نهاية الخدمة المرصودة للموظف بتاريخ السلفة.", "اعتماد اوامر الاركاب لإصدار تذاكر السفر بالطائرة بحسب السياسه", "تحديد المناطق المحظورة على زوار الشركة أو الموظفين الغير عاملين فيها", "الموافقة على نشر تعميم داخلي على بريد الشركة الألكتروني", "اعتماد منح صلاحية نشر التعاميم الداخلية على بريد الشركة الألكتروني", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ لا يتجاوز 300 ريال بغرض التمتع بالاجازة", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ يتجاوز 150 ريال ويقل عن 1000 ريال", "اعتماد زيادة سعر تذاكر الطيران عن المبلغ المخصص بمبلغ يتجاوز 1000 ريال"], "الصلاحيات المالية والاستثمارية": ["تعديل رأس المال", "توزيع الأرباح على المساهمين", "تجنيب احتياطيات إضافية", "اعتماد و/ أو تعديل الموازنة", "اعتماد القوائم المالية", "اعتماد سياسة المخاطر المالية الائتمانية", "اعتماد السياسات والإجراءات المالية والتشغيلية والإدارية", "فتح حسابات بالعملة السعودية أو العملات الأخرى في البنوك المعتمدة", "اعتماد سياسة الاقتراض من البنوك المعتمدة", "رهن موجودات الشركة", "سياسة الاستثمارات قصيرة الأجل للسيولة النقدية الفائضة في أسواق المال والبنوك", "تحديد المفوضين بالتوقيع لدى البنوك، ووضع وتعديل حدود صلاحياتهم.", "العقود والمناقصات", "تحديد الموصفات ( كراسة الشروط والمتطلبات الفنية )", "طرح المناقصات", "فحص العروض", "توقيع العقود الرأسمالية والتشغيلية ( ضمن الموازنة )", "من 500 ألف ريال حتى 2 مليون ريال", "أكثر من أثنين مليون ريال", "أعتماد طلبات الشراء ( الشراء المباشر بحسب السياسات )", "أكثر من 200 ألف ريال وأقل من 500 ألف ريال", "استئجار الممتلكات الضرورية للشركة (مباني، سيارات، معدات...) \" ضمن الموازنة \"", "من 300 ألف ريال إلى مليون ريال للعملية الواحدة", "أكثر من مليون ريال للعملية الواحدة", "التوقيع على عقود المؤجرين (ضمن الشروط المعتمدة)", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ لا يزيد عن 20,000 ريال", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ لا يزيد عن 30,000 ريال", "الاعفاء من تقديم خطاب الضمان مقابل ضمان حسن التنفيذ او مقابل دفعات مقدمة بمبلغ يزيد عن 30,000 ريال", "استبعاد الأصول الثابتة بالشطب أو البيع واعتماد سعر البيع", "القيمة الدفترية أقل من 10 الاف ريال", "القيمة الدفترية أكثر من 10 الاف ريال", "تعديل معدلات إهلاك للأصول الثابتة", "تشكيل لجنة جرد الأصول الثابتة", "اعتماد نتائج جرد الأصول الثابتة بفروقات لا تزيد عن 200 ألف ريال في السنة", "اعتماد صرف الهدايا والهبات والتبرعات.", "أقل من 20.000 ريال . سنوياً", "أكثر من 20 ألف ريال وأقل من 200 ألف ريال سنوياً", "أكثر من 200 ألف ريال سنوياً", "اعتماد المخصصات بجميع أنواعها.", "الزكاة والضرائب", "اعتماد إقرارات الزكاة وإقرارت الضرائب", "- اعتماد قرارات الربط الزكوي الصادرة عن مصلحة الزكاة، أو الاعتراض عليها أو استئنافها", "- تعيين المستشار الزكوي (إذا كان هناك حاجة)", "العهد المستديمة والمؤقتة (وفقاً للسياسة)", "تأسيس عهدة بحد أقصى 20.000 ريال", "تأسيس عهدة أكثر من 20.000 ريال وبحد أقصى 200.000 ريال", "وضع وتعديل حدود الشراء عن طريق عهدة المصروفات النثرية"], "الصلاحيات التشغيلية": ["اعتماد سياسة التعامل بالآجل والتسعير والتعديل عليهما", "التوقيع على عقود العملاء حسب العقد الموحد المعتمد", "التوقيع على عقود العملاء باختلاف عن العقد الموحد المعتمد", "اعتماد سياسة الخصم من الاسعار المعتمدة بما يزيد عن (20%)", "اعتماد سياسة الخصم من الاسعار المعتمدة بما لا يزيد عن (20%)", "اعتماد سياسة الخصم من الاسعار المعتمدة بما لا يزيد عن (5%)", "زيادة الحد الائتماني حتى 20% عن السياسة"]};
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
  govCheckApprovalNow(id);
  await loadPermissionsMatrix();
  renderPermItemsManageList();
}

async function savePermItem(){
  const item_name = document.getElementById("mpi-name").value.trim();
  if(!item_name){ alert("الرجاء إدخال نص البند"); return; }
  const category = document.getElementById("mpi-category").value;
  const normN = x => String(x||"").replace(/[\s\-–:]+/g," ").trim();
  if((permItemsCache||[]).some(x => normN(x.item_name) === normN(item_name))){ alert("هذا البند موجود مسبقاً في المصفوفة — لن يُضاف مكرراً."); return; }

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
  govCheckApprovalNow(newItem.id);
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
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  if(code === "ع") govCheckApprovalNow(itemId);
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



/* Remove duplicate authority items (same text): keep the one with the most assignments, move over any
   assignment the others had, and delete the extras. Asks first. */
async function permDedupe(){
  const { data: items } = await sb.from("permission_items").select("id,item_name").eq("company_id", currentCompanyId);
  const norm = x => String(x||"").replace(/[\s\-–:]+/g," ").trim();
  const groups = {}; (items||[]).forEach(i => { (groups[norm(i.item_name)] = groups[norm(i.item_name)] || []).push(i); });
  const dups = Object.values(groups).filter(g => g.length > 1);
  if(!dups.length){ alert("لا توجد بنود مكرّرة ✅"); return; }
  const extra = dups.reduce((n,g) => n + g.length - 1, 0);
  if(!await uiConfirm(`وُجد ${dups.length} بند مكرّر (${extra} نسخة زائدة). سيُبقي النظام نسخة واحدة من كل بند بصلاحياتها، ويحذف النسخ الزائدة نهائياً. متابعة؟`)) return;
  const ids = items.map(i => i.id);
  const { data: cells } = await sb.from("permission_cells").select("*").in("item_id", ids);
  for(const g of dups){
    const cnt = id => (cells||[]).filter(c => c.item_id === id).length;
    g.sort((a,b) => cnt(b.id) - cnt(a.id) || a.id - b.id);
    const keep = g[0];
    for(const d of g.slice(1)){
      for(const c of (cells||[]).filter(c => c.item_id === d.id)){
        const has = (cells||[]).some(k => k.item_id === keep.id && k.holder_id === c.holder_id);
        if(!has) await sb.from("permission_cells").update({ item_id: keep.id }).eq("id", c.id);
      }
      await sb.from("governance_links").delete().eq("company_id", currentCompanyId).or(`and(source_type.eq.authority,source_id.eq.${d.id}),and(target_type.eq.authority,target_id.eq.${d.id})`);
      await sb.from("permission_cells").delete().eq("item_id", d.id);
      await sb.from("permission_items").delete().eq("id", d.id);
    }
  }
  logActivity("حذف", "مصفوفة الصلاحيات", `${extra} بند مكرر`, "");
  govCacheClear();
  await loadPermissionsMatrix(); renderPermItemsManageList();
  alert(`تم حذف ${extra} بند مكرر ✅`);
}
