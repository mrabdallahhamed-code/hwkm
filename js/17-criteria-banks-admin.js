/* ══════════ Admin management of the criteria banks themselves ══════════ */
async function openPerfCriteriaManager(){
  if(!perfCriteriaCache) await loadPerfCriteriaCache();
  openM("m-perf-criteria");
  document.getElementById("pc-role-select").value = "عضو مجلس";
  renderPerfCriteriaList();
}

function renderPerfCriteriaList(){
  const role = document.getElementById("pc-role-select").value;
  const list = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const box = document.getElementById("pc-list");
  box.innerHTML = list.map((c,i) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--offwhite);border-radius:6px;margin-bottom:6px">
    <span style="flex:1;font-size:12px;color:var(--dark)">${i+1}. ${c}</span>
    <button onclick="deletePerfCriterion(${i})" style="background:none;border:none;cursor:pointer;padding:4px" title="حذف هذا البند"><span class="ico ico-trash" style="width:14px;height:14px;color:var(--red)"></span></button>
  </div>`).join("") || '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد بنود بهذه القائمة.</div>';
}

async function persistPerfCriteria(role, items){
  await sb.from("performance_criteria").delete().eq("company_id", currentCompanyId).eq("role_type", role);
  if(items.length){
    const { error } = await sb.from("performance_criteria").insert(items.map((text,i) => ({ company_id: currentCompanyId, role_type: role, criterion_text: text, sort_order: i })));
    if(error){ alert("تعذّر الحفظ: " + error.message); return false; }
  }
  await loadPerfCriteriaCache();
  return true;
}

async function addPerfCriterion(){
  const role = document.getElementById("pc-role-select").value;
  const input = document.getElementById("pc-new-item");
  const text = input.value.trim();
  if(!text) return;
  const current = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const ok = await persistPerfCriteria(role, [...current, text]);
  if(ok){ input.value = ""; renderPerfCriteriaList(); }
}

async function deletePerfCriterion(index){
  if(!await uiConfirm("حذف هذا البند من قائمة التقييم؟ هذا يؤثر على أي تقييم يفتح لاحقًا بهذه الفئة.")) return;
  const role = document.getElementById("pc-role-select").value;
  const current = getPerfCriteria(role === "تنفيذي" ? "تنفيذي" : null, role);
  const ok = await persistPerfCriteria(role, current.filter((_,i)=>i!==index));
  if(ok) renderPerfCriteriaList();
}

async function resetPerfCriteriaToDefault(){
  const role = document.getElementById("pc-role-select").value;
  if(!(await uiConfirm("رجّع القائمة الافتراضية لهذي الفئة؟ يلغي أي تخصيص سابق لها."))) return;
  persistPerfCriteria(role, []).then(ok => { if(ok) renderPerfCriteriaList(); });
}

function selectPerfCriterionScore(btn, val){
  const row = btn.closest(".perf-crit-row");
  row.dataset.selected = val;
  row.querySelectorAll(".perf-crit-btn").forEach(b => {
    const active = Number(b.dataset.val) === val;
    b.style.background = active ? "linear-gradient(135deg,var(--primary),var(--accent))" : "#fff";
    b.style.color = active ? "#fff" : "var(--dark)";
  });
}

async function submitPerfReview(evaluationId){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }

  // Locked once submitted — checked here too, not just hidden in the UI, so this can't be
  // bypassed by calling the function directly. Intentional: a reviewer who could keep revising
  // after seeing others' scores (or simply reconsidering) is exactly the opening for favoritism
  // this lock exists to close.
  const { data: existing } = await sb.from("performance_evaluation_reviews").select("id").eq("evaluation_id", evaluationId).eq("reviewer_email", myEmail).limit(1);
  if(existing && existing.length){ alert("سبق أن أرسلت تقييمك لهذا الشخص — غير قابل للتعديل."); if(perfDetailContext) renderPerfReviewForm({id:evaluationId, ...perfCache.find(e=>e.id===evaluationId)}); return; }

  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("perf-review-notes-"+evaluationId);
  const notes = notesEl ? notesEl.value.trim() : "";

  const rows = document.querySelectorAll('.perf-crit-row[data-eval="'+evaluationId+'"]');
  const payloads = [];
  for(const row of rows){
    const val = row.dataset.selected;
    if(!val){ alert("الرجاء اختيار تقييم لكل البنود قبل الإرسال"); return; }
    payloads.push({
      evaluation_id: evaluationId, reviewer_email: myEmail, reviewer_name,
      criterion: row.dataset.criterion, score: Number(val), notes, company_id: currentCompanyId
    });
  }
  if(!await uiConfirm("بعد الإرسال ما تقدر تعدّل تقييمك لهذا الشخص. متابعة؟")) return;

  const { error } = await sb.from("performance_evaluation_reviews").insert(payloads);
  if(error){ alert("تعذّر حفظ تقييمك: " + error.message); return; }
  await perfMaybeAutoClose(evaluationId);
  const ev = perfCache.find(e=>e.id===evaluationId);
  if(ev) renderPerfReviewForm(ev);
}

const titles={
  dashboard:['لوحة التحكم الرئيسية','نظرة شاملة على حوكمة الشركة'],
  users:['إدارة الصلاحيات','التحكم بأدوار وصلاحيات المستخدمين'],
  meetings:['اجتماعات مجلس الإدارة','إدارة الاجتماعات والمحاضر والقرارات'],
  members:['أعضاء مجلس الإدارة','ملفات الأعضاء وسجل الحضور والمؤهلات'],
  risks:['إدارة المخاطر المؤسسية','سجل المخاطر وخطط المعالجة والمتابعة'],
  compliance:['الالتزام التنظيمي','متابعة الامتثال للأنظمة واللوائح السعودية'],
  signing:['التوقيع الإلكتروني','وثائق تنتظر التوقيع الإلكتروني المعتمد'],
  committees:['اللجان المتخصصة','لجان المجلس والمهام والاجتماعات'],
  agm:['الجمعيات العامة','إدارة الجمعيات العامة العادية والغير عادية'],
  governance:['السياسات والحوكمة','إدارة سياسات الشركة وأدلة الحوكمة'],
  announcements:['الإعلانات','إعلانات هيئة السوق المالية للشركات المدرجة'],
  archive:['الأرشيف والوثائق','حفظ واسترجاع الوثائق الحوكمية'],
  structure:['الهيكل التنظيمي','الهيكل الإداري وتسلسل الصلاحيات'],
  procedures:['الإجراءات','إجراءات العمل والترابط بين الإدارات'],
  permissions:['مصفوفة الصلاحيات','تحديد الصلاحيات والأدوار'],
  perf:['تقييم الأداء','تقييم أداء المجلس واللجان والإدارة العليا'],
  voting:['التصويت الإلكتروني','إدارة القرارات والتصويت الإلكتروني'],
  circulation:['قرارات التمرير','قرارات الجمعية العامة ومجلس الإدارة بالتمرير'],
  audit:['التدقيق الداخلي','خطط التدقيق والتقارير ومتابعة التوصيات'],
  reports:['تقارير الحوكمة','تقارير الأداء والامتثال والحوكمة'],
  appoint:['طلب تعيين عضو','طلب تعيين عضو مجلس إدارة أو عضو لجنة متخصصة'],
  consultants:['الاستشارات','الاستشارات القانونية والإدارية وعقودها'],
  mysub:['اشتراكي','باقتك وتفاصيل اشتراكك وطرق التواصل معنا'],
  platformcompanies:['الشركات','الإيرادات المتوقعة والتجارب وتوثيق الكيانات'],
  platformdashboard:['لوحة تحكم إدارة حوكم','نظرة شاملة على الشركات والاشتراكات'],
  platformusers:['فريق المنصة والمستخدمون','إدارة فريق المنصة وصلاحياته'],
  platformactivity:['سجل نشاط المنصة','آخر العمليات على مستوى كل الشركات'],
  adminrequests:['إدارة الطلبات','طلبات الشركات والاشتراكات والخدمات'],
  companyrequests:['طلبات إدراج الشركات','مراجعة طلبات إدراج الشركات'],
  companyrequest:['طلب إدراج شركة','تقديم بيانات الشركة للمراجعة'],
  indicators:['التقرير المالي والتشغيلي','مؤشرات الأداء المالي والتشغيلي مقابل المستهدف'],
  shareholders:['سجل المساهمين','المساهمون وملكياتهم وسجل التحويلات'],
  decisiontracking:['متابعة القرارات','متابعة تنفيذ قرارات المجلس'],
  govassess:['تقييم فعالية الحوكمة','قياس نضج الحوكمة وفعاليتها'],
  activitylog:['سجل النشاط','العمليات التي جرت في الشركة'],
  managerdecisions:['قرارات المدير','سجل قرارات المدير'],
  ownerdecisions:['قرارات المالك','سجل قرارات المالك'],
  restricted:['غير متاح','لا تملك صلاحية الوصول لهذه الصفحة'],
};

let viewingPlatformOverview = false;
let pendingUpgradeModuleKey = null;

/* Lightweight upgrade request — no self-service checkout exists yet, so this just gets a clear,
   specific request in front of HWKM's platform team by email, who then activates it via the
   existing "Manage Active Subscription" tool once payment is arranged. */
async function requestModuleUpgrade(){
  if(!pendingUpgradeModuleKey) return;
  const moduleLabel = { risk_management: 'إدارة المخاطر (ضمن باقة شريك)', internal_audit: 'التدقيق الداخلي (ضمن باقة شريك)' }[pendingUpgradeModuleKey] || pendingUpgradeModuleKey;
  const btn = document.getElementById('btnRequestUpgrade');
  if(btn){ btn.disabled = true; btn.textContent = 'جارِ الإرسال...'; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email || '—';
  const requesterName = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const companyName = document.getElementById('companySwitcher')?.selectedOptions?.[0]?.textContent?.trim() || currentCompanyId;

  const { success, error } = await sendNotificationEmail(
    'info@hwkm.net',
    `طلب ترقية باقة — ${companyName}`,
    `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2>🔓 طلب تفعيل ميزة إضافية</h2>
      <p><b>الشركة:</b> ${companyName} (ID: ${currentCompanyId})</p>
      <p><b>الميزة المطلوبة:</b> ${moduleLabel}</p>
      <p><b>مقدَّم من:</b> ${requesterName} (${myEmail})</p>
    </div>`
  );

  if(btn){ btn.disabled = false; }
  if(!success){ alert('تعذّر إرسال الطلب: ' + error); if(btn) btn.textContent = 'اطلب تفعيل هذي الميزة'; return; }
  if(btn){ btn.innerHTML = '<span class="ico-i ico-check"></span>تم إرسال طلبك ✅'; btn.style.background = 'var(--green)'; }
  setTimeout(() => alert('وصل طلبك لفريقنا — بنتواصل معك قريبًا لإتمام الترقية.'), 200);
}

let currentPageId = null;
