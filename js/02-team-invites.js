/* ══════════ TEAM INVITES (join an existing company via code/link) ══════════ */
function openInviteModal(){
  document.getElementById("mi-role").value = "عضو مجلس";
  switchInviteTab('new');
  openM("m-invite");
}

function switchInviteTab(tab){
  const isNew = tab === 'new';
  document.getElementById("mi-form").style.display = isNew ? "block" : "none";
  document.getElementById("mi-existing-form").style.display = isNew ? "none" : "block";
  document.getElementById("mi-result").style.display = "none";
  document.getElementById("mi-title-h").textContent = isNew ? "🔗 دعوة عضو جديد" : "🔗 ربط حساب موجود بشركتك";
  document.getElementById("mi-tab-new").style.background = isNew ? "" : "var(--offwhite)";
  document.getElementById("mi-tab-new").style.color = isNew ? "" : "var(--dark)";
  document.getElementById("mi-tab-new").className = isNew ? "btn-xs primary" : "btn-xs";
  document.getElementById("mi-tab-existing").className = isNew ? "btn-xs" : "btn-xs primary";
  document.getElementById("mi-tab-existing").style.background = isNew ? "var(--offwhite)" : "";
  document.getElementById("mi-tab-existing").style.color = isNew ? "var(--dark)" : "";
}

function toggleCustomRoleInput(selectId, inputId){
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  if(!sel || !inp) return;
  inp.style.display = sel.value === '__custom__' ? 'block' : 'none';
}
function resolveRoleValue(selectId, inputId){
  const sel = document.getElementById(selectId);
  if(sel && sel.value === '__custom__'){
    const inp = document.getElementById(inputId);
    return inp ? inp.value.trim() : '';
  }
  return sel ? sel.value : '';
}
async function linkExistingAccount(){
  const email = document.getElementById("mi-existing-email").value.trim();
  if(!email){ alert("الرجاء إدخال البريد الإلكتروني"); return; }
  const role = resolveRoleValue("mi-existing-role", "mi-existing-role-custom");
  if(!role){ alert("الرجاء كتابة المسمى المخصّص للدور"); return; }
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }

  const { data: existing, error: findErr } = await sb.from("user_profiles").select("*").ilike("email", likeEsc(email)).maybeSingle();
  if(findErr || !existing){ alert("لا يوجد حساب مسجّل بهذا البريد الإلكتروني. تأكد أنه سجّل حساب بالمنصة أولًا، أو استخدم تبويب \"عضو جديد\" بدل ذلك."); return; }

  if(!await uiConfirm(`سيتم إضافة "${existing.full_name||email}" لفريق شركتك بدور "${role}" (يبقى عضوًا بأي شركة أخرى ينتمي لها). متابعة؟`)) return;

  const { error } = await sb.from("user_company_memberships").upsert(
    [{ email: existing.email, company_id: currentCompanyId, role }], { onConflict: 'email,company_id' }
  );
  if(error){ alert("تعذّر الربط: " + error.message); return; }
  logActivity("صلاحيات", "مستخدم", existing.full_name||email, `ربط حساب موجود بدور "${role}"`);
  alert(`تم ربط "${existing.full_name||email}" بشركتك ✅ — عليه تسجيل خروج ثم دخول من جديد ليرى شركتك بقائمة تبديل الشركات.`);
  document.getElementById("mi-existing-email").value = "";
  closeM("m-invite");
  loadUsers();
}

function randomInviteCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for(let i=0;i<8;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

async function generateInvite(){
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }
  const suggested_role = resolveRoleValue("mi-role", "mi-role-custom");
  if(!suggested_role){ alert("الرجاء كتابة المسمى المخصّص للدور"); return; }
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const invite_code = randomInviteCode();

  const { error } = await sb.from("company_invites").insert([{ company_id: currentCompanyId, invite_code, suggested_role, created_by: myEmail }]);
  if(error){ alert("تعذّر توليد الدعوة: " + error.message); return; }
  logActivity("دعوة", "رابط دعوة", invite_code, `بدور "${suggested_role}"`);

  const link = `${window.location.origin}${window.location.pathname}?invite=${invite_code}`;
  document.getElementById("mi-link").value = link;
  document.getElementById("mi-form").style.display = "none";
  document.getElementById("mi-result").style.display = "block";
  loadPendingInvites();
}

function copyInviteLink(){
  const el = document.getElementById("mi-link");
  el.select();
  navigator.clipboard?.writeText(el.value).then(()=>alert("تم نسخ الرابط ✅")).catch(()=>{});
}
