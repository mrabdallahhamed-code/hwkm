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

/* ══════════ PHONE VERIFICATION (تأكيد الجوال) ══════════
   A phone number only counts once the SERVER has seen the code verified: the page-side flag that used
   to stand for this could be skipped by anyone calling the sign-up API directly. Two ways in:
   - the proof issued when the code was verified at sign-up (signed, bound to that phone and email, valid
     48h) is claimed on the first signed-in visit, so the person is not asked twice; or
   - a blocking dialog on that first visit if there is no valid proof.
   The phone, its normalised form and the verified time are written only by the server (a database trigger
   refuses them from the browser), and login by phone uses verified numbers only. */
async function authFn(body){
  const { data: { session } } = await sb.auth.getSession();
  const headers = { "Content-Type": "application/json" };
  if(session && session.access_token) headers["Authorization"] = "Bearer " + session.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, { method: "POST", headers, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch(e){}
  return { ok: res.ok, status: res.status, data };
}

async function claimPhoneProofIfAny(){
  try {
    if(!currentUserProfile || currentUserProfile.phone_verified_at) return;
    const { data: { user } } = await sb.auth.getUser();
    const proof = user && user.user_metadata ? user.user_metadata.phone_proof : null;
    if(!proof) return;
    const r = await authFn({ action: "claim_proof", proof });
    if(r.ok && r.data.verified){
      currentUserProfile.phone_verified_at = new Date().toISOString();
      currentUserProfile.phone_number = r.data.phone;
    }
    // Done, or unusable (expired / for another account / number taken): stop trying and fall back to the dialog.
    if(r.ok || r.status === 400 || r.status === 409){ await sb.auth.updateUser({ data: { phone_proof: null } }); }
  } catch(e){ console.warn("phone proof not claimed", e); }
}

let phoneGateMode = "gate";
function pgMsg(text, ok){
  const box = document.getElementById("pg-msg");
  box.style.display = "block"; box.style.background = ok ? "#E8F8EF" : "#FBEAEA"; box.style.color = ok ? "var(--green)" : "var(--red)";
  box.textContent = text;
}
function openPhoneGate(optional){
  phoneGateMode = optional ? "change" : "gate";
  document.getElementById("pg-title").textContent = optional ? "تغيير رقم الجوال" : "تأكيد رقم الجوال";
  document.getElementById("pg-hint").textContent = optional
    ? "اكتب رقمك الجديد وسيصلك رمز تحقق برسالة. لا يُغيَّر الرقم قبل التحقق منه."
    : "لحماية حسابك نحتاج تأكيد رقم جوالك مرة واحدة برمز يصلك برسالة.";
  document.getElementById("pg-phone").value = optional ? "" : ((currentUserProfile && currentUserProfile.phone_number) || "");
  document.getElementById("pg-code").value = "";
  document.getElementById("pg-code-row").style.display = "none";
  document.getElementById("pg-msg").style.display = "none";
  document.getElementById("pg-cancel").style.display = "inline-flex";
  document.getElementById("pg-cancel").textContent = optional ? "إلغاء" : "لاحقًا";
  document.getElementById("pg-logout").style.display = optional ? "none" : "inline-flex";
  openM("m-phone-gate");
}
function closePhoneGateLater(){
  try{ if(phoneGateMode === "gate") sessionStorage.setItem("hwkm_phone_later", "1"); }catch(e){}
  closeM("m-phone-gate");
}
async function sendGatePhoneOtp(){
  const phone = document.getElementById("pg-phone").value.trim();
  if(!phone){ pgMsg("اكتب رقم جوالك", false); return; }
  const btn = document.getElementById("pg-send"); btn.disabled = true;
  const r = await authFn({ action: "phone_send", phone });
  if(!r.ok){ btn.disabled = false; pgMsg(r.data.error || "تعذّر إرسال الرمز", false); return; }
  document.getElementById("pg-code-row").style.display = "block";
  startResendCooldown(document.getElementById("pg-send"), "إعادة إرسال الرمز", 60);
  pgMsg("تم إرسال الرمز إلى جوالك. قد تتأخر الرسالة دقيقة، وإن لم تصل فأعد الإرسال بعد انتهاء العدّاد. ويمكنك المتابعة الآن والتوثيق لاحقًا.", true);
}
async function verifyGatePhoneOtp(){
  const phone = document.getElementById("pg-phone").value.trim();
  const code = document.getElementById("pg-code").value.trim();
  if(!code){ pgMsg("اكتب الرمز", false); return; }
  const btn = document.getElementById("pg-verify"); btn.disabled = true;
  const r = await authFn({ action: "phone_verify", phone, otpCode: code });
  btn.disabled = false;
  if(!r.ok){ pgMsg(r.data.error || "تعذّر التحقق", false); return; }
  currentUserProfile.phone_verified_at = new Date().toISOString();
  currentUserProfile.phone_number = r.data.phone;
  closeM("m-phone-gate");
  // A company code typed at sign-up was waiting for a verified phone.
  const joinRes = await processPendingJoinIntent();
  if(joinRes && joinRes.status !== "phone_unverified"){ alert(joinResultMessage(joinRes).text); }
  if(phoneGateMode === "gate") await loadCurrentUserProfile();
  else alert("تم تحديث رقم جوالك بعد التحقق منه ✅");
}
async function gateLogout(){ closeM("m-phone-gate"); closeM("m-terms-consent"); await logout(); }

function likeEsc(s){ return String(s == null ? "" : s).replace(/[\\%_]/g, "\\$&"); }

/* ══════════ COMPANY JOIN CODE (كود الشركة) ══════════
   The model: the code is the key to ONE company, and everyone who comes in through it waits for that
   company's own مدير النظام (or the platform owner). Nobody is linked automatically — not even a person
   already listed in the shareholders registry. The national ID is used for one thing only: to show the
   approver which record of THIS company (if any) the applicant corresponds to, so the registry link is
   made at approval. A shareholder with shares in several companies enters each company's code and the
   companies appear in the bar one by one as each is approved.
   Requests are created by a database function (request_join_company) that takes the applicant's
   identity from their own signed-in session and rate-limits wrong codes. The browser never reads
   companies by code and never writes the request row itself. */
const JOIN_BOARD_ROLES = ["رئيس مجلس","سكرتير المجلس","رئيس لجنة الترشيحات","عضو لجنة الترشيحات","رئيس لجنة مراجعة","عضو لجنة مراجعة","عضو مجلس","عضو مجلس وعضو مساهم"];
const JOIN_ROLE_OPTIONS = JOIN_BOARD_ROLES.concat(["مساهم","موظف"]);

function joinNormName(s){
  return String(s||"").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/\s+/g," ").trim().toLowerCase();
}
/* Registries and sign-up forms often differ in the middle names, so the same first and last name counts as a match. */
function joinNamesMatch(a, b){
  const x = joinNormName(a), y = joinNormName(b);
  if(!x || !y) return false;
  if(x === y) return true;
  const tx = x.split(" "), ty = y.split(" ");
  return tx.length > 1 && ty.length > 1 && tx[0] === ty[0] && tx[tx.length-1] === ty[ty.length-1];
}

async function loadCompanyJoinCode(){
  const box = document.getElementById("companyJoinCodeDisplay");
  if(!box || !currentCompanyId) return;
  const { data: c } = await sb.from("companies").select("join_code").eq("id", currentCompanyId).maybeSingle();
  let code = c ? c.join_code : null;
  if(!code){
    code = "HWK-" + randomInviteCode();
    const { error } = await sb.from("companies").update({ join_code: code }).eq("id", currentCompanyId);
    if(error){ box.textContent = "تعذّر توليد الكود"; return; }
  }
  box.textContent = code;
}

function copyCompanyJoinCode(){
  const text = document.getElementById("companyJoinCodeDisplay").textContent.trim();
  if(!text || text === "جارِ التحميل...") return;
  navigator.clipboard.writeText(text);
  alert("تم نسخ كود الشركة ✅");
}

async function regenerateCompanyJoinCode(){
  if(!await uiConfirm("إعادة توليد الكود تُبطل الكود الحالي فوراً، فمن معه الكود القديم لا يستطيع استخدامه. الطلبات المعلّقة لا تتأثر. متابعة؟")) return;
  const code = "HWK-" + randomInviteCode();
  const { error } = await sb.from("companies").update({ join_code: code }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر التوليد: " + error.message); return; }
  document.getElementById("companyJoinCodeDisplay").textContent = code;
}

/* ── Applicant side ── */
function joinResultMessage(res){
  const n = res && res.company_name ? `«${res.company_name}»` : "";
  switch(res && res.status){
    case "pending": return { ok: true, text: `أُرسل طلبك للانضمام لشركة ${n}. سيراجعه مدير النظام، وبعد موافقته تظهر الشركة في شريط الشركات.` };
    case "already_pending": return { ok: true, text: `لديك طلب سابق لشركة ${n} ينتظر المراجعة.` };
    case "already_member": return { ok: true, text: `أنت عضو بالفعل في شركة ${n}.` };
    case "invalid_code": return { ok: false, text: "كود الشركة غير صحيح. تأكد منه مع مدير شركتك." };
    case "rate_limited": return { ok: false, text: "محاولات خاطئة كثيرة. انتظر ساعة ثم أعد المحاولة." };
    case "unauthenticated": return { ok: false, text: "سجّل الدخول أولاً." };
    case "phone_unverified": return { ok: false, text: "أكّد رقم جوالك أولاً ثم أعد المحاولة." };
    case "not_ready": return { ok: false, text: "الانضمام بالكود لم يُفعَّل بعد بقاعدة البيانات. تواصل مع الدعم." };
    default: return { ok: false, text: "تعذّر إرسال الطلب، حاول مرة أخرى." };
  }
}

async function requestJoinByCode(code){
  const clean = String(code || "").trim().toUpperCase();
  if(!clean) return { status: "invalid_code" };
  const { data, error } = await sb.rpc("request_join_company", { p_code: clean });
  if(error){
    const missing = error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message || "");
    return { status: missing ? "not_ready" : "error", message: error.message };
  }
  return data;
}

/* The code typed at sign-up is only remembered in the account's metadata. While the email is
   unconfirmed there is no session to act with, so the request is made here, on the first signed-in
   visit. A failure is retried next visit; it is only marked done once the database has answered. */
async function processPendingJoinIntent(){
  try {
    const { data: { user } } = await sb.auth.getUser();
    const md = user && user.user_metadata ? user.user_metadata : {};
    const code = String(md.join_code || "").trim();
    if(!code || md.join_intent_done) return null;
    const res = await requestJoinByCode(code);
    if(res && res.status !== "not_ready" && res.status !== "error" && res.status !== "phone_unverified"){
      await sb.auth.updateUser({ data: { join_intent_done: true } });
    }
    return res;
  } catch(e){ console.warn("join intent not processed", e); return null; }
}

function openJoinByCodeModal(){
  document.getElementById("jc-code").value = "";
  document.getElementById("jc-msg").style.display = "none";
  loadMyJoinRequests("jc-my-requests");
  openM("m-join-code");
}

async function submitJoinByCode(){
  const btn = document.getElementById("jc-btn");
  btn.disabled = true;
  const res = await requestJoinByCode(document.getElementById("jc-code").value);
  btn.disabled = false;
  const m = joinResultMessage(res);
  const box = document.getElementById("jc-msg");
  box.style.display = "block"; box.style.background = m.ok ? "#E8F8EF" : "#FBEAEA"; box.style.color = m.ok ? "var(--green)" : "var(--red)";
  box.textContent = m.text;
  if(res && res.status === "pending") document.getElementById("jc-code").value = "";
  loadMyJoinRequests("jc-my-requests"); loadMyJoinRequests("crJoinList");
}

async function refreshAfterJoinApproval(){
  closeM("m-join-code");
  await loadCurrentUserProfile();
}

async function loadMyJoinRequests(boxId){
  const box = document.getElementById(boxId);
  if(!box || !currentUserProfile) return;
  const { data } = await sb.from("company_join_requests").select("*").ilike("requester_email", likeEsc(currentUserProfile.email)).order("id",{ascending:false}).limit(10);
  if(!data || !data.length){ box.innerHTML = boxId === "jc-my-requests" ? '<div style="font-size:11.5px;color:var(--gray3)">لا توجد طلبات بعد.</div>' : ""; return; }
  const style = { "قيد المراجعة": ["#FEF3E2","var(--gold)","بانتظار موافقة المدير"], "معتمد": ["#E8F8EF","var(--green)","تمت الموافقة"], "مرفوض": ["#FBEAEA","var(--red)","رُفض الطلب"] };
  box.innerHTML = data.map(r => {
    const [bg, fg, label] = style[r.status] || style["قيد المراجعة"];
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--gray1);border-radius:8px;padding:8px 10px;margin-bottom:6px">
      <div style="font-size:12px;font-weight:700;color:var(--dark)">${gaEsc(r.company_name || "شركة")}</div>
      <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${label}</span></div>`;
  }).join("") + (data.some(r => r.status === "معتمد") ? '<button class="btn-xs primary" style="margin-top:4px" onclick="refreshAfterJoinApproval()">تحديث شركاتي</button>' : "");
}

/* ── Approver side ── */
async function loadCompanyJoinRequests(){
  const card = document.getElementById("companyJoinRequestsCard");
  const list = document.getElementById("companyJoinRequestsList");
  if(!card || !list || !currentCompanyId) return;
  const { data } = await sb.from("company_join_requests").select("*").eq("company_id", currentCompanyId).eq("status","قيد المراجعة").order("id",{ascending:false});
  if(!data || !data.length){ card.style.display = "none"; return; }
  card.style.display = "block";

  // Registry records of THIS company only, matched by the applicant's national ID.
  const ids = [...new Set(data.map(r => r.requester_national_id).filter(Boolean))];
  const none = { data: [] };
  const [shRes, bmRes, freeRes] = await Promise.all([
    ids.length ? sb.from("shareholders").select("id,name,shares_count,national_id,claimed_by_email").eq("company_id", currentCompanyId).in("national_id", ids) : none,
    ids.length ? sb.from("board_members").select("id,name,position,national_id,claimed_by_email").eq("company_id", currentCompanyId).in("national_id", ids) : none,
    sb.from("shareholders").select("id,name,shares_count").eq("company_id", currentCompanyId).is("claimed_by_email", null).order("name",{ascending:true})
  ]);
  const shs = shRes.data || [], bms = bmRes.data || [], freeShs = freeRes.data || [];

  list.innerHTML = data.map(r => {
    const mail = String(r.requester_email || "").toLowerCase();
    const sh = shs.find(x => x.national_id === r.requester_national_id);
    const bm = bms.find(x => x.national_id === r.requester_national_id);
    const shTaken = !!(sh && sh.claimed_by_email && String(sh.claimed_by_email).toLowerCase() !== mail);
    const bmTaken = !!(bm && bm.claimed_by_email && String(bm.claimed_by_email).toLowerCase() !== mail);
    const regName = (bm && !bmTaken ? bm.name : null) || (sh && !shTaken ? sh.name : null) || (bm || sh ? (bm || sh).name : null);
    const nameOk = regName ? joinNamesMatch(r.requester_name, regName) : null;

    let role = "موظف";
    if(bm && !bmTaken && sh && !shTaken) role = "عضو مجلس وعضو مساهم";
    else if(bm && !bmTaken) role = "عضو مجلس";
    else if(sh && !shTaken) role = "مساهم";

    const matchLines = [];
    if(bm) matchLines.push(`مطابق لعضو مجلس: <b>${gaEsc(bm.name)}</b>${bm.position ? " — " + gaEsc(bm.position) : ""}${bmTaken ? ' <span style="color:var(--red)">(السجل مرتبط بحساب آخر)</span>' : ""}`);
    if(sh) matchLines.push(`مطابق لمساهم: <b>${gaEsc(sh.name)}</b> — ${sh.shares_count || 0} سهم${shTaken ? ' <span style="color:var(--red)">(السجل مرتبط بحساب آخر)</span>' : ""}`);
    if(!matchLines.length) matchLines.push(r.requester_national_id ? "هذه الهوية غير مدرجة بأي سجل بهذي الشركة." : "لم يُدخل المتقدم رقم هوية.");

    const freeOpts = freeShs.map(s => `<option value="${s.id}" ${sh && !shTaken && s.id === sh.id ? "selected" : ""}>${gaEsc(s.name)} — ${s.shares_count||0} سهم</option>`).join("");
    const ownOpt = (sh && !shTaken && !freeShs.some(s => s.id === sh.id)) ? `<option value="${sh.id}" selected>${gaEsc(sh.name)} — ${sh.shares_count||0} سهم</option>` : "";
    const showSh = role === "مساهم" || role === "عضو مجلس وعضو مساهم";

    return `<div style="border-bottom:1px solid var(--gray1);padding:12px 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:800;color:var(--dark)">${gaEsc(r.requester_name || r.requester_email)}</div>
          <div style="font-size:10.5px;color:var(--gray3);margin-top:2px;line-height:1.8">${gaEsc(r.requester_email)} · هوية: ${gaEsc(r.requester_national_id || "—")} · جوال: ${gaEsc(r.requester_phone || "—")}<br>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="fs" id="cjr-role-${r.id}" ${(role === "مساهم" && sh && !shTaken && nameOk !== false) ? 'data-bulk-ok="1"' : ""} style="margin:0;font-size:11.5px;padding:6px 8px;width:160px" onchange="toggleCjrShareholderLink(${r.id})">
            ${JOIN_ROLE_OPTIONS.map(o => `<option ${o === role ? "selected" : ""}>${o}</option>`).join("")}
          </select>
          <button class="btn-xs primary" onclick="approveJoinRequest(${r.id})"><span class="ico-i ico-check"></span>موافقة</button>
          <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer" onclick="rejectJoinRequest(${r.id})">رفض</button>
        </div>
      </div>
      <div style="background:var(--offwhite);border-radius:8px;padding:8px 10px;font-size:11.5px;line-height:1.8">
        ${matchLines.join("<br>")}
        ${nameOk === false ? `<div style="color:var(--red);font-weight:800;margin-top:4px">⚠ الاسم عند التسجيل («${gaEsc(r.requester_name||"")}») لا يطابق اسم السجل («${gaEsc(regName)}»). تحقق من هوية المتقدم قبل الموافقة.</div>` : ""}
      </div>
      <div id="cjr-sh-wrap-${r.id}" style="display:${showSh ? "block" : "none"};margin-top:8px">
        <label style="font-size:10.5px;color:var(--gray3);display:block;margin-bottom:4px">اربطه بسجل مساهم (أسهمه وصوته بالجمعية يصيران تابعين لحسابه)</label>
        <select class="fs" id="cjr-sh-${r.id}" style="margin:0;font-size:11.5px;padding:6px 8px;width:100%">
          <option value="">— بلا ربط بسجل مساهم —</option>${ownOpt}${freeOpts}
        </select>
      </div>
    </div>`;
  }).join("");
}

function toggleCjrShareholderLink(id){
  const role = document.getElementById("cjr-role-"+id).value;
  const wrap = document.getElementById("cjr-sh-wrap-"+id);
  if(wrap) wrap.style.display = (role === "مساهم" || role === "عضو مجلس وعضو مساهم") ? "block" : "none";
}

/* Approves, in one go, only the requests that are a clean match: the national ID matches an unclaimed shareholder record,
   the name agrees with the register, and the role is plain shareholder. Anything else stays for the approver's own review. */
async function approveAllMatchedJoinRequests(){
  const ids = [...document.querySelectorAll('#companyJoinRequestsList select[data-bulk-ok="1"]')].map(x => Number(String(x.id).replace("cjr-role-","")));
  if(!ids.length){ alert("لا توجد طلبات مطابقة تمامًا للسجل حاليًا. راجع الطلبات يدويًا."); return; }
  if(!await uiConfirm("سيتم اعتماد " + ids.length + " طلبًا مطابقًا لسجل المساهمين (الهوية والاسم) بدور «مساهم» وربط كلٍّ بسجله. الطلبات غير المطابقة تبقى لمراجعتك. متابعة؟")) return;
  let done = 0;
  for(const id of ids){
    const sel = document.getElementById("cjr-role-" + id);
    if(!sel || sel.getAttribute("data-bulk-ok") !== "1") continue;
    await approveJoinRequest(id); done++;
  }
  alert("تم اعتماد " + done + " طلبًا ✅");
}

async function approveJoinRequest(id){
  const { data: req } = await sb.from("company_join_requests").select("*").eq("id", id).single();
  if(!req || req.status !== "قيد المراجعة"){ alert("هذا الطلب لم يعد معلّقاً."); loadCompanyJoinRequests(); return; }
  if(String(req.company_id) !== String(currentCompanyId)){ alert("افتح الشركة المعنية من شريط الشركات أولاً."); return; }
  const role = document.getElementById("cjr-role-"+id).value;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  const { data: existing } = await sb.from("user_company_memberships").select("id").ilike("email", likeEsc(req.requester_email)).eq("company_id", currentCompanyId).maybeSingle();
  const { error: memErr } = existing
    ? await sb.from("user_company_memberships").update({ role }).eq("id", existing.id)
    : await sb.from("user_company_memberships").insert([{ email: req.requester_email, company_id: currentCompanyId, role }]);
  if(memErr){ alert("تعذّرت الموافقة: " + memErr.message); return; }

  // Only becomes the account's primary company if it has none yet.
  const { data: prof } = await sb.from("user_profiles").select("company_id").ilike("email", likeEsc(req.requester_email)).maybeSingle();
  if(prof && !prof.company_id){ await sb.from("user_profiles").update({ company_id: currentCompanyId, role }).ilike("email", likeEsc(req.requester_email)); }

  // The registry link is made here, by the approver, and only onto a record nobody else holds.
  const shSel = document.getElementById("cjr-sh-"+id);
  const shareholderId = shSel ? shSel.value : "";
  if(shareholderId){
    const { data: row } = await sb.from("shareholders").select("claimed_by_email").eq("id", shareholderId).single();
    if(row && (!row.claimed_by_email || String(row.claimed_by_email).toLowerCase() === String(req.requester_email).toLowerCase())){
      await sb.from("shareholders").update({ claimed_by_email: req.requester_email }).eq("id", shareholderId);
    } else { alert("سجل المساهم مرتبط بحساب آخر فلم يُربط. اربطه يدوياً من سجل المساهمين."); }
  }
  if(JOIN_BOARD_ROLES.includes(role) && req.requester_national_id){
    await sb.from("board_members").update({ claimed_by_email: req.requester_email }).eq("company_id", currentCompanyId).eq("national_id", req.requester_national_id).is("claimed_by_email", null);
  }

  await sb.from("company_join_requests").update({ status: "معتمد", reviewed_by: myEmail, reviewed_at: new Date().toISOString() }).eq("id", id);
  logActivity("موافقة", "طلب انضمام", req.requester_name || req.requester_email, `بدور "${role}"`);
  loadCompanyJoinRequests();
  loadUsers();
}

async function rejectJoinRequest(id){
  if(!await uiConfirm("رفض طلب الانضمام هذا؟")) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from("company_join_requests").update({ status: "مرفوض", reviewed_by: myEmail, reviewed_at: new Date().toISOString() }).eq("id", id);
  if(error){ alert("تعذّر الرفض: " + error.message); return; }
  loadCompanyJoinRequests();
}

async function loadPendingInvites(){
  const card = document.getElementById("pendingInvitesCard");
  const box = document.getElementById("pendingInvitesList");
  if(!box || !currentCompanyId) return;
  const { data } = await sb.from("company_invites").select("*").eq("company_id", currentCompanyId).eq("used", false).order("id",{ascending:false});
  if(!data || data.length===0){ if(card) card.style.display = "none"; return; }
  if(card) card.style.display = "block";
  box.innerHTML = data.map(inv => {
    const link = `${window.location.origin}${window.location.pathname}?invite=${inv.invite_code}`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray1)">
      <div>
        <div style="font-size:12px;font-weight:700">${inv.invite_code} <span style="color:var(--gray3);font-weight:500">— ${inv.suggested_role}</span></div>
        <div style="font-size:10px;color:var(--gray3)">${new Date(inv.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-xs primary" onclick="navigator.clipboard.writeText('${link}');alert('تم نسخ الرابط ✅')"><span class="ico-i ico-clipboard"></span>نسخ</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer" onclick="deleteInvite(${inv.id})"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
      </div>
    </div>`;
  }).join("");
}

async function deleteInvite(id){
  if(!await uiConfirm("إلغاء هذه الدعوة؟")) return;
  await sb.from("company_invites").delete().eq("id", id);
  loadPendingInvites();
}

const ROLE_STYLE = {
  "مدير النظام": { color: "var(--primary)", bg: "#EAF0F8", icon: "🛡️" },
  "مالك": { color: "var(--gold)", bg: "#FDF5DC", icon: "🏛️" },
  "ممثل المالك": { color: "var(--gold)", bg: "#FDF5DC", icon: "🖋️" },
  "رئيس مجلس": { color: "var(--gold)", bg: "#FDF5DC", icon: "👑" },
  "سكرتير المجلس": { color: "#8B2FC9", bg: "#F3E8FB", icon: "🗂️" },
  "رئيس لجنة الترشيحات": { color: "var(--teal)", bg: "#E5F6F4", icon: "🎖️" },
  "عضو لجنة الترشيحات": { color: "var(--teal)", bg: "#E5F6F4", icon: "🎗️" },
  "رئيس لجنة مراجعة": { color: "#0E76BC", bg: "#E4F1FB", icon: "🧾" },
  "عضو لجنة مراجعة": { color: "#0E76BC", bg: "#E4F1FB", icon: "📑" },
  "عضو مجلس": { color: "var(--green)", bg: "#E8F8EF", icon: "👤" },
  "عضو مجلس وعضو مساهم": { color: "var(--orange)", bg: "#FCEFE3", icon: "🤝" },
  "موظف": { color: "var(--gray3)", bg: "#F1F1F1", icon: "👤" },
  "مساهم": { color: "var(--gray3)", bg: "var(--offwhite)", icon: "💰" }
};
// Fallback style for a custom, owner-typed role name that isn't in the map above.
const CUSTOM_ROLE_STYLE = { color: "#6B4FA0", bg: "#EFEAFA", icon: "🏷️" };
function roleStyleOf(role){ return ROLE_STYLE[role] || CUSTOM_ROLE_STYLE; }

/* ══════════ ACTIVITY LOG (universal, non-blocking) ══════════ */
async function logActivity(action_type, entity_type, entity_label, details){
  try{
    if(!currentCompanyId) return;
    const { data: userData } = await sb.auth.getUser();
    const actor_email = userData && userData.user ? userData.user.email : null;
    const actor_name = currentUserProfile ? (currentUserProfile.full_name || actor_email) : actor_email;
    await sb.from("activity_log").insert([{ company_id: currentCompanyId, actor_email, actor_name, action_type, entity_type, entity_label: entity_label||"", details: details||"" }]);
  }catch(e){ /* logging must never block the actual action */ }
}

let activityLogCache = [];
let activityLogActiveType = "الكل";
const ACTIVITY_TYPE_ICONS = { "إنشاء":"➕", "تعديل":"✏️", "حذف":"🗑️", "دعوة":"🔗", "صلاحيات":"🛡️", "موافقة":"✅", "رفض":"❌", "توقيع":"✍️", "دخول":"🔓" };

async function loadActivityLog(){
  const tbody = document.getElementById("activityLogTbody");
  if(!tbody) return;
  const { data, error } = await sb.from("activity_log").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false}).limit(300);
  if(error){ tbody.innerHTML = errorRowHTML(5, error.message); return; }
  activityLogCache = data || [];
  renderActivityLogPills();
  renderActivityLogFiltered();
}

function renderActivityLogPills(){
  const box = document.getElementById("activityLogTypePills");
  if(!box) return;
  const types = [...new Set(activityLogCache.map(a => a.action_type))];
  const pill = (label, key, count) => {
    const active = activityLogActiveType === key;
    const icon = ACTIVITY_TYPE_ICONS[key] || "•";
    return `<button onclick="setActivityLogType('${key}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'}">${key==='الكل'?'📜':icon} ${label}${count!=null?` (${count})`:''}</button>`;
  };
  let html = pill("الكل", "الكل", activityLogCache.length);
  types.forEach(t => { html += pill(t, t, activityLogCache.filter(a=>a.action_type===t).length); });
  box.innerHTML = html;
}
function setActivityLogType(t){ activityLogActiveType = t; renderActivityLogPills(); renderActivityLogFiltered(); }

function renderActivityLogFiltered(){
  const tbody = document.getElementById("activityLogTbody");
  if(!tbody) return;
  const search = (document.getElementById("activityLogSearchInput")?.value || "").trim().toLowerCase();
  let list = activityLogCache;
  if(activityLogActiveType !== "الكل") list = list.filter(a => a.action_type === activityLogActiveType);
  if(search) list = list.filter(a => (a.actor_name||"").toLowerCase().includes(search) || (a.entity_label||"").toLowerCase().includes(search));
  if(activityLogCache.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا يوجد نشاط مسجّل بعد."); return; }
  if(list.length===0){ tbody.innerHTML = emptyRowHTML(5, "لا توجد نتائج مطابقة."); return; }
  tbody.innerHTML = list.map(a => `<tr>
    <td style="font-size:11px;color:var(--gray3);white-space:nowrap">${new Date(a.created_at).toLocaleString('ar-SA-u-ca-gregory')}</td>
    <td>${orgEsc(a.actor_name||a.actor_email||"—")}</td>
    <td>${ACTIVITY_TYPE_ICONS[a.action_type]||''} ${a.action_type||""} ${a.entity_type||""}</td>
    <td>${a.entity_label||"—"}</td>
    <td style="font-size:11px;color:var(--gray3)">${a.details||""}</td>
  </tr>`).join("");
}

function showListedShareholderLink(){
  const link = `${window.location.origin}${window.location.pathname}?listed_company=${currentCompanyId}`;
  document.getElementById("listedShareholderLinkText").textContent = link;
  openM("m-listed-shareholder-link");
}

function copyListedShareholderLink(){
  const text = document.getElementById("listedShareholderLinkText").textContent;
  navigator.clipboard.writeText(text).then(() => alert("تم نسخ الرابط ✅"));
}

async function loadPendingShareholderVerifications(){
  const card = document.getElementById("pendingShareholderVerificationsCard");
  const list = document.getElementById("pendingShareholderVerificationsList");
  if(!card || !list) return;
  const { data, error } = await sb.from("shareholder_verification_requests").select("*")
    .eq("company_id", currentCompanyId).eq("status", "قيد المراجعة").order("created_at",{ascending:false});
  if(error || !data || data.length === 0){ card.style.display = "none"; return; }
  card.style.display = "block";
  list.innerHTML = data.map(r => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-weight:700;font-size:12.5px">${orgEsc(r.requester_name||"—")}</div>
    <div style="font-size:11px;color:var(--gray3)">${orgEsc(r.requester_email)} · رقم الهوية: ${orgEsc(r.national_id||"—")} · عدد الأسهم المدّعى: ${r.claimed_shares||"—"}</div>
    ${r.proof_file_url ? `<a href="${r.proof_file_url}" target="_blank" style="font-size:11.5px;color:var(--primary);font-weight:700"><span class="ico-i ico-paperclip"></span>عرض ملف الإثبات</a>` : '<div style="font-size:11px;color:var(--red)">لا يوجد ملف إثبات</div>'}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="approveShareholderVerification(${r.id})"><span class="ico-i ico-check"></span>اعتماد</button>
      <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer" onclick="rejectShareholderVerification(${r.id})"><span class="ico-i ico-xcircle"></span>رفض</button>
    </div>
  </div>`).join("");
}

async function approveShareholderVerification(id){
  const { data: req } = await sb.from("shareholder_verification_requests").select("*").eq("id", id).single();
  if(!req){ alert("تعذّر تحميل الطلب"); return; }
  if(!await uiConfirm(`اعتماد "${req.requester_name}" كمساهم بـ${req.claimed_shares||0} سهم؟`)) return;

  // Creates a real row in the same shareholders registry every other feature (voting, vote
  // cards, AGM attendance, quorum) already reads from — nothing downstream needs to know this
  // shareholder came through proof-of-ownership review instead of the usual pre-entered list.
  const { error: shErr } = await sb.from("shareholders").insert([{
    name: req.requester_name, national_id: req.national_id, shares_count: req.claimed_shares,
    company_id: req.company_id, claimed_by_email: req.requester_email
  }]);
  if(shErr){ alert("تعذّر إنشاء سجل المساهم: " + shErr.message); return; }

  await sb.from("user_company_memberships").insert([{ email: req.requester_email, company_id: req.company_id, role: "مساهم" }]);
  await sb.from("shareholder_verification_requests").update({ status: "معتمد", reviewed_by: currentUserProfile?.email, reviewed_at: new Date().toISOString() }).eq("id", id);

  await sendNotificationEmail(req.requester_email, "✅ تم اعتماد طلبك كمساهم",
    `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2><span class="ico-i ico-check"></span>تم اعتماد طلبك</h2><p>تم التحقق من ملكيتك واعتمادك كمساهم بالمنصة. يمكنك الآن تسجيل الدخول والمشاركة بالتصويت.</p></div>`);
  alert("تم الاعتماد ✅");
  loadPendingShareholderVerifications();
}

async function rejectShareholderVerification(id){
  const reason = await uiPrompt("سبب الرفض (اختياري):", "") || "";
  const { data: req } = await sb.from("shareholder_verification_requests").select("*").eq("id", id).single();
  await sb.from("shareholder_verification_requests").update({ status: "مرفوض", rejection_reason: reason, reviewed_by: currentUserProfile?.email, reviewed_at: new Date().toISOString() }).eq("id", id);
  if(req){
    await sendNotificationEmail(req.requester_email, "❌ تعذّر اعتماد طلبك كمساهم",
      `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2>تعذّر الاعتماد</h2><p>${reason||"لم يتم التحقق من الإثبات المرفوع."}</p></div>`);
  }
  alert("تم الرفض");
  loadPendingShareholderVerifications();
}

/* ══════════ COMPOSABLE PERMISSIONS: role (base) + per-user overrides (add/remove on top) ══════════
   The role system (FULL_ACCESS_ROLES, SHAREHOLDER_PAGES, etc.) still decides default access —
   this layer lets an admin grant or revoke access to SPECIFIC pages for a SPECIFIC person,
   entirely from the UI, without needing new code for each case. An override always wins over
   whatever the role would otherwise decide, for that one person and that one page. */
const ALL_PAGE_IDS_FOR_OVERRIDES = ['procedures',
  'dashboard','users','meetings','members','risks','compliance','signing','committees','agm',
  'governance','govassess','archive','structure','permissions','perf','voting','audit',
  'reports','appoint','consultants','announcements'
];
let myPermissionOverrides = {}; // page_id -> 'view' | 'edit' | 'none', for the CURRENTLY LOGGED-IN person

async function loadMyPermissionOverrides(){
  myPermissionOverrides = {};
  if(!currentUserProfile) return;
  // A person's full override set always applies, whether they're currently inside a specific
  // company or on a platform-level page — load both scopes together rather than picking one.
  const queries = [ sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", currentUserProfile.email).is("company_id", null) ];
  if(currentCompanyId){
    queries.push(sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", currentUserProfile.email).eq("company_id", currentCompanyId));
  }
  const results = await Promise.all(queries);
  results.forEach(({ data }) => (data||[]).forEach(r => { myPermissionOverrides[r.page_id] = r.access_level; }));
}

const PLATFORM_LEVEL_PAGE_IDS = ['platformdashboard','platformusers','platformactivity','adminrequests','companyrequests','managecompanies','auditadmin'];

/* ══════════ ADMIN UI: grant/revoke a specific person's access, page by page ══════════ */
let permOverrideDraftEmail = null;
let permOverrideDraft = {}; // page_id -> access_level, edited in the modal before saving

let permOverrideDraftScope = null; // null (platform-level) or a company_id

async function openUserPermissionOverridesModal(email, displayName, scopeCompanyId){
  permOverrideDraftEmail = email;
  permOverrideDraftScope = scopeCompanyId != null ? scopeCompanyId : null;
  document.getElementById("upo-title").textContent = `🔧 صلاحيات مخصّصة — ${displayName||email}${permOverrideDraftScope===null?' (مستوى المنصة)':''}`;
  let query = sb.from("user_permission_overrides").select("page_id,access_level").ilike("user_email", email);
  query = permOverrideDraftScope === null ? query.is("company_id", null) : query.eq("company_id", permOverrideDraftScope);
  const { data } = await query;
  permOverrideDraft = {};
  (data||[]).forEach(r => { permOverrideDraft[r.page_id] = r.access_level; });
  renderUserPermissionOverridesList();
  openM("m-user-permission-overrides");
}

const PLATFORM_LEVEL_PAGE_TITLES = {
  platformdashboard: "لوحة تحكم المنصة", platformusers: "فريق المنصة والمستخدمين",
  platformactivity: "سجل نشاط المنصة", adminrequests: "إدارة الطلبات",
  companyrequests: "طلبات إدراج الشركات", managecompanies: "إدارة الشركات", auditadmin: "إدارة خدمات المراجعة/المخاطر"
};

function renderUserPermissionOverridesList(){
  const box = document.getElementById("upo-list");
  const pageIds = permOverrideDraftScope === null ? PLATFORM_LEVEL_PAGE_IDS : ALL_PAGE_IDS_FOR_OVERRIDES;
  box.innerHTML = pageIds.map(pageId => {
    const label = (titles[pageId] && titles[pageId][0]) || PLATFORM_LEVEL_PAGE_TITLES[pageId] || pageId;
    const current = permOverrideDraft[pageId] || "افتراضي";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray1)">
      <span style="font-size:12.5px;font-weight:700">${label}</span>
      <select class="fs" style="width:150px;font-size:11.5px;padding:6px 8px" onchange="permOverrideDraft['${pageId}']=this.value==='افتراضي'?undefined:this.value">
        <option ${current==='افتراضي'?'selected':''} value="افتراضي">افتراضي (حسب الدور)</option>
        <option ${current==='edit'?'selected':''} value="edit"><span class="ico-i ico-edit"></span>تعديل كامل</option>
        <option ${current==='view'?'selected':''} value="view"><span class="ico-i ico-eye"></span>عرض فقط</option>
        <option ${current==='none'?'selected':''} value="none"><span class="ico-i ico-xcircle"></span>بدون وصول</option>
      </select>
    </div>`;
  }).join("");

  const quickBox = document.getElementById("upo-quick-restrict-list");
  if(quickBox){
    quickBox.innerHTML = pageIds.map(pageId => {
      const label = (titles[pageId] && titles[pageId][0]) || PLATFORM_LEVEL_PAGE_TITLES[pageId] || pageId;
      const currentlyAllowed = permOverrideDraft[pageId] === 'view' || permOverrideDraft[pageId] === 'edit';
      return `<label style="display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12px;cursor:pointer">
        <input type="checkbox" data-qr-page="${pageId}" ${currentlyAllowed?'checked':''} style="accent-color:var(--gold);width:14px;height:14px;flex-shrink:0"/>
        ${label}
      </label>`;
    }).join("");
  }
}

function applyQuickRestrict(){
  const pageIds = permOverrideDraftScope === null ? PLATFORM_LEVEL_PAGE_IDS : ALL_PAGE_IDS_FOR_OVERRIDES;
  const allowed = new Set([...document.querySelectorAll("#upo-quick-restrict-list [data-qr-page]:checked")].map(cb => cb.dataset.qrPage));
  pageIds.forEach(pageId => {
    permOverrideDraft[pageId] = allowed.has(pageId) ? 'view' : 'none';
  });
  renderUserPermissionOverridesList();
  alert(`تم تقييد الوصول لـ${allowed.size} صفحة فقط. اضغط "✅ حفظ" بالأسفل عشان يصير فعليًا — أو عدّل أي صفحة يدويًا بالقائمة تحت لو تبي "تعديل كامل" بدل "عرض فقط".`);
}

async function saveUserPermissionOverrides(){
  // Simplest reliable approach for a small per-user list: clear this person's overrides for
  // this scope, then re-insert whatever is left in the draft — avoids tracking individual
  // adds/removes/updates separately.
  let delQuery = sb.from("user_permission_overrides").delete().ilike("user_email", permOverrideDraftEmail);
  delQuery = permOverrideDraftScope === null ? delQuery.is("company_id", null) : delQuery.eq("company_id", permOverrideDraftScope);
  await delQuery;
  const rows = Object.entries(permOverrideDraft)
    .filter(([,level]) => level)
    .map(([page_id, access_level]) => ({ company_id: permOverrideDraftScope, user_email: permOverrideDraftEmail, page_id, access_level }));
  if(rows.length){
    const { error } = await sb.from("user_permission_overrides").insert(rows);
    if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  }
  alert(`تم حفظ الصلاحيات المخصّصة ✅ — على "${permOverrideDraftEmail}" تسجيل خروج ثم دخول من جديد ليطبَّق التغيير.`);
  closeM("m-user-permission-overrides");
}

let usersPageCache = { memberships: [], profileByEmail: {}, roles: [], isSoleProp: false, myEmail: null };

async function toggleEditGrant(email, on){
  if(getCurrentRole() !== 'مدير النظام'){ alert("هذه الصلاحية لمدير النظام فقط"); return; }
  const em = String(email||"").toLowerCase();
  await sb.from("user_permission_overrides").delete().eq("company_id", currentCompanyId).eq("page_id","*").ilike("user_email", likeEsc(em));
  if(on){
    const { error } = await sb.from("user_permission_overrides").insert([{ company_id: currentCompanyId, user_email: em, page_id: "*", access_level: "edit" }]);
    if(error){ alert("تعذّر الحفظ: " + error.message); loadUsers(); return; }
  }
  if(usersPageCache && usersPageCache.editSet){ if(on) usersPageCache.editSet[em] = true; else delete usersPageCache.editSet[em]; }
  alert(on ? "تم السماح له بالتعديل ✅ — يظهر ذلك عنده بعد إعادة تحميل الصفحة." : "تم سحب صلاحية التعديل — أصبح للقراءة فقط.");
}

async function loadUsers(){
  loadPendingInvites();
  if(getCurrentRole() === "مدير النظام" || (currentUserProfile && currentUserProfile.is_platform_admin === true)){ loadCompanyJoinCode(); loadCompanyJoinRequests(); }
  else { const jc = document.getElementById("companyJoinCodeCard"); if(jc) jc.style.display = "none"; }
  const linkBtn = document.getElementById("btnListedShareholderLink");
  const listedVerified = currentCompanyType === "مساهمة مدرجة" && currentCompanyEntityVerified;
  if(linkBtn) linkBtn.style.display = listedVerified ? "inline-block" : "none";
  const evNote = document.getElementById("entityVerifyNote");
  if(evNote) evNote.remove();
  if(linkBtn && currentCompanyType === "مساهمة مدرجة" && !currentCompanyEntityVerified){
    const n = document.createElement("div");
    n.id = "entityVerifyNote";
    n.style.cssText = "font-size:11.5px;color:var(--gold);background:var(--offwhite);border-radius:8px;padding:8px 12px;margin:6px 0";
    n.textContent = "⏳ نوع الكيان (مساهمة مدرجة) قيد التحقق من فريق المنصة. تُفعَّل ميزات الشركات المدرجة (رابط توثيق المساهمين) بعد التوثيق. للتسريع تواصل معنا وأرسل صورة السجل التجاري.";
    linkBtn.parentNode.insertBefore(n, linkBtn);
  }
  if(listedVerified) loadPendingShareholderVerifications();
  const testUserBtn = document.getElementById("btnCreateTestUser");
  if(testUserBtn) testUserBtn.style.display = (getCurrentRole() === "مدير النظام") ? "inline-block" : "none";
  const grid = document.getElementById("usersCardsGrid");
  if(!grid) return;
  if(getCurrentRole() !== 'مدير النظام'){
    grid.innerHTML = '<div style="text-align:center;color:var(--red);font-size:12px;padding:20px;grid-column:1/-1">هذه الصفحة متاحة لمدير النظام فقط</div>';
    return;
  }
  const { data: memberships, error } = await sb.from("user_company_memberships").select("*").eq("company_id", currentCompanyId).order("id",{ascending:true});
  if(error){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;padding:20px;grid-column:1/-1">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!memberships || memberships.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا يوجد أعضاء بالفريق بعد — استخدم "🔗 دعوة عضو جديد" لإضافة أول عضو.</div>'; return; }

  const emails = memberships.map(m => m.email);
  const { data: profiles } = await sb.from("user_profiles").select("*").in("email", emails);
  const profileByEmail = {};
  (profiles||[]).forEach(p => { profileByEmail[p.email] = p; });

  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const roles = isSoleProp ? ['مدير النظام','مالك','ممثل المالك','عضو مجلس','موظف'] : ['مدير النظام','مالك','ممثل المالك','رئيس مجلس','سكرتير المجلس','رئيس لجنة الترشيحات','عضو لجنة الترشيحات','رئيس لجنة مراجعة','عضو لجنة مراجعة','عضو مجلس','عضو مجلس وعضو مساهم','مساهم','موظف'];
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;

  let editSet = {};
  try {
    const { data: eds } = await sb.from("user_permission_overrides").select("user_email").eq("company_id", currentCompanyId).eq("page_id","*").eq("access_level","edit");
    (eds||[]).forEach(r => { editSet[(r.user_email||"").toLowerCase()] = true; });
  } catch(e){}
  usersPageCache = { memberships, profileByEmail, roles, isSoleProp, myEmail, editSet };

  // Populate the role filter dropdown with whatever roles actually exist on this team
  // (including custom ones), so it stays useful regardless of team size or role mix.
  const filterSel = document.getElementById("usersRoleFilter");
  if(filterSel){
    const uniqueRoles = [...new Set(memberships.map(m => m.role))];
    const currentVal = filterSel.value;
    filterSel.innerHTML = '<option value="">كل الأدوار</option>' + uniqueRoles.map(r => `<option value="${r}">${r}</option>`).join("");
    filterSel.value = uniqueRoles.includes(currentVal) ? currentVal : "";
  }

  renderUsersFiltered();
}

function roleDisplayLabelFor(r){
  return usersPageCache.isSoleProp && r === 'عضو مجلس' ? 'عضو فريق' : r;
}

function renderUsersFiltered(){
  const grid = document.getElementById("usersCardsGrid");
  if(!grid) return;
  const { memberships, profileByEmail } = usersPageCache;
  const q = (document.getElementById("usersSearch")?.value || "").trim().toLowerCase();
  const roleFilter = document.getElementById("usersRoleFilter")?.value || "";

  const filtered = memberships.filter(m => {
    if(roleFilter && m.role !== roleFilter) return false;
    if(!q) return true;
    const u = profileByEmail[m.email] || {};
    return (u.full_name||"").toLowerCase().includes(q) || (m.email||"").toLowerCase().includes(q) || (m.role||"").toLowerCase().includes(q);
  });

  const countBadge = document.getElementById("usersCountBadge");
  if(countBadge) countBadge.textContent = `(${filtered.length} من ${memberships.length})`;

  if(filtered.length === 0){
    grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا نتائج مطابقة.</div>';
    return;
  }

  grid.innerHTML = filtered.map(renderUserCard).join("");
}

function renderUserCard(m){
  const { profileByEmail, roles, myEmail } = usersPageCache;
  const u = profileByEmail[m.email] || {};
  const st = roleStyleOf(m.role);
  const initial = (u.full_name || m.email || "؟").trim().charAt(0);
  const isMe = m.email === myEmail;
  const isCustomRole = !roles.includes(m.role);
  return `<div class="card" style="margin:0;border-top:4px solid ${st.color};display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:46px;height:46px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0">${initial}</div>
          <div style="min-width:0;flex:1">
            <div style="font-size:13.5px;font-weight:800;color:var(--dark);word-break:break-word">${orgEsc(u.full_name||"—")}</div>
            <div style="font-size:11px;color:var(--gray3);word-break:break-all;margin-top:1px">${orgEsc(m.email||"—")}</div>
          </div>
          ${isMe ? '<span style="font-size:9.5px;font-weight:700;color:var(--primary);background:#EAF0F8;padding:2px 7px;border-radius:6px;flex-shrink:0;white-space:nowrap">أنت</span>' : ""}
        </div>

        <div style="margin:12px 0;padding:10px;background:var(--offwhite);border-radius:8px;font-size:11px;color:var(--gray3);display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between"><span>رقم الهوية</span><span style="color:var(--dark);font-weight:600">${orgEsc(u.national_id||"—")}</span></div>
          <div style="display:flex;justify-content:space-between"><span>رقم الجوال</span><span style="color:var(--dark);font-weight:600">${orgEsc(u.phone_number||"—")}</span></div>
        </div>
        ${(m.role !== 'مدير النظام' && m.role !== 'مساهم') ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#FDF5DC;border-radius:8px;padding:8px 10px;font-size:11.5px;font-weight:700;color:var(--gold);margin-bottom:8px;cursor:pointer"><span>السماح له بالتعديل</span><input type="checkbox" ${(usersPageCache.editSet||{})[(m.email||'').toLowerCase()] ? 'checked' : ''} onchange="toggleEditGrant('${orgEsc((m.email||'').replace(/'/g,""))}', this.checked)" style="width:18px;height:18px;cursor:pointer"></label>` : ''}
        ${u.id ? `<button style="width:100%;background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px" onclick="openEditProfileModal(${u.id})"><span class="ico-i ico-edit"></span>تعديل البيانات</button>` : ""}
        <button style="width:100%;background:#EAF0F8;color:var(--primary);border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:8px" onclick="openUserPermissionOverridesModal('${orgEsc((m.email||'').replace(/'/g,""))}','${orgEsc((u.full_name||m.email||'').replace(/'/g,""))}', currentCompanyId)"><span class="ico-i ico-wrench"></span>صلاحيات مخصّصة</button>
        <button style="width:100%;background:#FDF5DC;color:var(--gold);border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:8px" onclick="openPolicyCategoryRestrictionModal(${m.id},'${orgEsc((m.email||'').replace(/'/g,""))}','${orgEsc((u.full_name||m.email||'').replace(/'/g,""))}')"><span class="ico-i ico-clipboard"></span>تقييد فئة السياسات</button>

        <div style="margin-top:auto">
          <label style="font-size:10px;color:var(--gray3);display:block;margin-bottom:4px">الدور / الصلاحية بهذه الشركة</label>
          <select onchange="this.value==='__custom__' ? promptCustomRole(${m.id}) : updateUserRole(${m.id}, this.value)" style="width:100%;font-size:12px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;background:${st.bg};color:${st.color};border:1.5px solid ${st.color}55;margin-bottom:8px">
            ${isCustomRole ? `<option value="${orgEsc(m.role)}" selected>${st.icon} ${orgEsc(m.role)}</option>` : ""}
            ${roles.map(r=>`<option value="${r}" ${m.role===r?"selected":""}>${ROLE_STYLE[r].icon} ${roleDisplayLabelFor(r)}</option>`).join("")}
            <option value="__custom__"><span class="ico-i ico-tag"></span>مسمى مخصّص (لجنة أخرى)...</option>
          </select>
          ${isCustomRole ? `<p style="font-size:9.5px;color:var(--gray3);margin:-2px 0 8px">مسمى مخصّص — حدد صفحاته من "🔧 صلاحيات مخصّصة" فوق.</p>` : ""}
          ${isMe ? "" : `<button style="width:100%;background:#FDE8E8;color:var(--red);border:none;border-radius:8px;padding:8px;font-size:11.5px;font-weight:600;cursor:pointer" onclick="deleteUserProfile(${m.id},'${orgEsc((u.full_name||m.email||"").replace(/'/g,""))}')"><span class="ico-i ico-trash"></span>حذف</button>`}
        </div>
      </div>
    </div>`;
}

/* Company-configurable deadline (days) per approval/signing stage — replaces the previous
   hardcoded 14-day constant used everywhere the policies page shows a deadline countdown. */
async function openPolicyDeadlineSettingsModal(){
  const { data: company } = await sb.from("companies").select("policy_stage_deadline_days").eq("id", currentCompanyId).single();
  document.getElementById("mpd-days").value = company?.policy_stage_deadline_days ?? 14;
  openM("m-policy-deadline");
}

async function savePolicyDeadlineSettings(){
  const days = Number(document.getElementById("mpd-days").value) || 14;
  const { error } = await sb.from("companies").update({ policy_stage_deadline_days: days }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  currentCompanyPolicyDeadlineDays = days;
  closeM("m-policy-deadline");
  alert(`تم تحديث مهلة كل مرحلة إلى ${days} يوم ✅`);
  loadPolicies();
}

/* Position-based policy visibility — e.g. مدير المشتريات only ever sees سياسة المشتريات.
   An empty/unset list means "no restriction, sees everything", so setting this up is opt-in
   per member and never accidentally locks someone out until an admin deliberately configures it. */
async function openPolicyCategoryRestrictionModal(membershipId, email, name){
  document.getElementById("pcr-membership-id").value = membershipId;
  document.getElementById("pcr-name").textContent = name || email;
  const box = document.getElementById("pcr-category-list");
  box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">جارِ التحميل...</div>';
  openM("m-policy-category-restriction");

  const { data: membership } = await sb.from("user_company_memberships").select("allowed_policy_categories").eq("id", membershipId).single();
  const current = Array.isArray(membership?.allowed_policy_categories) ? membership.allowed_policy_categories : [];

  box.innerHTML = getPolicyCategoriesForCompany().map(cat => `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--offwhite);border-radius:8px;margin-bottom:6px;font-size:12.5px;cursor:pointer">
    <input type="checkbox" data-pcr-cat="${cat}" ${current.includes(cat)?'checked':''} style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0"/>
    ${POLICY_CATEGORY_ICONS[cat]||"📄"} ${cat}
  </label>`).join("");
}

async function savePolicyCategoryRestriction(){
  const membershipId = document.getElementById("pcr-membership-id").value;
  const checked = [...document.querySelectorAll("#pcr-category-list [data-pcr-cat]:checked")].map(cb => cb.dataset.pcrCat);
  const { error } = await sb.from("user_company_memberships").update({ allowed_policy_categories: checked }).eq("id", membershipId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  closeM("m-policy-category-restriction");
  alert(checked.length ? `تم تقييد العرض بـ${checked.length} فئة ✅` : "تم إلغاء القيد — يشوف كل الفئات الآن ✅");
}

async function deleteUserProfile(membershipId, name){
  if(!await uiConfirm(`هل تريد إزالة "${name}" من فريق هذه الشركة؟ حسابه يبقى فعّالًا إن كان عضوًا بشركات أخرى على المنصة.`)) return;
  const { error } = await sb.from("user_company_memberships").delete().eq("id", membershipId);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "مستخدم", name, "إزالة من فريق الشركة");
  loadUsers();
}

async function openEditProfileModal(id){
  const { data: u, error } = await sb.from("user_profiles").select("*").eq("id", id).single();
  if(error || !u){ alert("تعذّر تحميل بيانات العضو"); return; }
  document.getElementById("mep-id").value = u.id;
  document.getElementById("mep-title-h").textContent = "✏️ تعديل بيانات — " + (u.full_name||u.email||"");
  document.getElementById("mep-name").value = u.full_name || "";
  document.getElementById("mep-national-id").value = u.national_id || "";
  document.getElementById("mep-phone").value = u.phone_number || "";
  document.getElementById("mep-phone-note").textContent = u.phone_verified_at ? "رقم موثّق برمز تحقق ✅" : "رقم غير موثّق";
  document.getElementById("mep-phone-change").style.display = (currentUserProfile && String(currentUserProfile.id) === String(u.id)) ? "inline-flex" : "none";
  openM("m-edit-profile");
}

async function openMyProfileModal(){
  if(!currentUserProfile || !currentUserProfile.id){ alert("تعذّر تحديد حسابك حاليًا"); return; }
  await openEditProfileModal(currentUserProfile.id);
}

async function saveEditProfile(){
  const id = document.getElementById("mep-id").value;
  const full_name = document.getElementById("mep-name").value.trim();
  const national_id = document.getElementById("mep-national-id").value.trim();
  const { error } = await sb.from("user_profiles").update({ full_name, national_id }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "بيانات عضو", full_name, "تحديث بيانات الاتصال");
  closeM("m-edit-profile");
  alert("تم الحفظ ✅");
  if(currentUserProfile && String(currentUserProfile.id) === String(id)){
    currentUserProfile.full_name = full_name;
    currentUserProfile.national_id = national_id;
    const nameEl = document.getElementById('sidebarUserName');
    if(nameEl) nameEl.textContent = full_name || nameEl.textContent;
  }
  loadUsers();
}

async function updateUserRole(membershipId, role){
  const { data: membership } = await sb.from("user_company_memberships").select("*").eq("id", membershipId).single();
  let repInfo = null;
  if(role === "ممثل المالك"){
    const ent = await uiPrompt("اسم الجهة الاعتبارية (الشركة المالكة) التي يمثلها هذا الشخص:");
    if(!ent || !ent.trim()){ loadUsers(); return; }
    const ref = await uiPrompt("مرجع التفويض (رقم قرار الشركة المالكة أو تاريخه) — اختياري:") || "";
    repInfo = { is_entity_rep: true, represented_entity: ent.trim(), authorization_ref: ref.trim() || null };
  }
  const target = membership ? await sb.from("user_profiles").select("full_name,email").eq("email", membership.email).maybeSingle() : null;
  const { error } = await sb.from("user_company_memberships").update({ role }).eq("id", membershipId);
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  if(membership && (role === "مالك" || role === "ممثل المالك")){
    // The approval lists read the profile role, so keep it in step for the company the person is currently working in.
    const upd = { role };
    if(repInfo) Object.assign(upd, repInfo);
    const r2 = await sb.from("user_profiles").update(upd).eq("email", membership.email).eq("company_id", membership.company_id);
    if(r2.error && repInfo){ alert("تم تغيير الدور، لكن تعذّر حفظ بيانات الجهة الممثَّلة: " + r2.error.message + " — تأكد من تنفيذ ملف قاعدة البيانات."); }
  }
  logActivity("صلاحيات", "مستخدم", target && target.data ? (target.data.full_name||target.data.email) : (membership?membership.email:""), `تغيير الدور إلى "${role}"`);
  loadUsers();
}

// Lets مدير النظام give a person a role name that isn't on the standard list — e.g. a
// committee that's specific to this company ("رئيس لجنة المخاطر", "عضو لجنة الحوكمة"...).
// The role string itself carries no special access beyond the safe "broad view, no edit"
// default every non-standard role gets — real per-page control still comes from the
// existing "🔧 صلاحيات مخصّصة" override system, which is exactly what makes this safe:
// no new permission logic needed, just a free-text label plus the tool that already exists.
async function promptCustomRole(membershipId){
  const name = await uiPrompt('اكتب المسمى المخصص للدور (مثال: "رئيس لجنة المخاطر" أو "عضو لجنة الحوكمة"):');
  if(!name || !name.trim()){ loadUsers(); return; }
  await updateUserRole(membershipId, name.trim());
  alert(`تم تعيين المسمى "${name.trim()}" ✅ — افتح "🔧 صلاحيات مخصّصة" على بطاقة هذا الشخص الآن لتحديد بالضبط أي صفحات يشوفها ويقدر يعدّل فيها.`);
}
async function loadCompanies(preferredCompanyId){
  const sel = document.getElementById("companySwitcher");
  const isPlatformAdmin = currentUserProfile && currentUserProfile.is_platform_admin === true;
  const isTeamMember = currentUserProfile && currentUserProfile.platform_team_module && !isPlatformAdmin;
  const seesAllCompanies = isPlatformAdmin || isTeamMember;

  // Regular users now see every company they hold a membership in (could be more than one);
  // the platform owner AND narrow-specialty team members additionally see every tenant on the
  // platform — team members need this to review companies' data within their specialty.
  const memberCompanyIds = userMemberships.map(m => m.company_id).filter(Boolean);
  const query = seesAllCompanies
    ? sb.from("companies").select("*").order("id",{ascending:true})
    : (memberCompanyIds.length ? sb.from("companies").select("*").in("id", memberCompanyIds).order("id",{ascending:true}) : sb.from("companies").select("*").eq("id", -1));
  const { data, error } = await query;

  if(error || !data || data.length===0){
    if(sel) sel.innerHTML = seesAllCompanies ? '<option value="__platform__"><span class="ico-i ico-home"></span>نظرة عامة على المنصة</option>' : '<option>لا توجد شركة مرتبطة بحسابك</option>';
    currentCompanyId = null;
    reloadCurrentPageData();
    return;
  }
  if(sel){
    const companyOptions = data.map(c => `<option value="${c.id}">${orgEsc(c.name)}</option>`).join("");
    sel.innerHTML = seesAllCompanies ? `<option value="__platform__"><span class="ico-i ico-home"></span>نظرة عامة على المنصة</option>${companyOptions}` : companyOptions;
  }
  if(seesAllCompanies && viewingPlatformOverview){
    currentCompanyId = null;
    if(sel) sel.value = "__platform__";
    reloadCurrentPageData();
    return;
  }
  currentCompanyId = preferredCompanyId && data.some(c=>c.id===preferredCompanyId) ? preferredCompanyId : data[0].id;
  if(sel) sel.value = currentCompanyId;
  await refreshCompanyTypeVisibility();
  reloadCurrentPageData();
}

async function switchCompany(id){
  if(id === "__platform__"){
    viewingPlatformOverview = true;
    currentCompanyId = null;
    await loadMyPermissionOverrides();
    await applyRolePermissions(); // already redirects to platformdashboard if needed
    return;
  }
  viewingPlatformOverview = false;
  currentCompanyId = Number(id);
  await loadMyPermissionOverrides();
  await applyRolePermissions();
  await refreshCompanyTypeVisibility();
  checkPendingApprovalBadges();
  const platformOnlyPages = ['adminrequests','platformdashboard','platformusers','platformactivity'];
  if(platformOnlyPages.includes(currentPageId)){
    go('dashboard');
  } else {
    reloadCurrentPageData();
  }
}

function reloadCurrentPageData(){
  if(!currentCompanyId) return; // no company assigned yet — nothing to load
  const activePage = document.querySelector('.page.active');
  if(!activePage) { loadMembers(); loadMeetingsAll(); return; }
  const id = activePage.id.replace('p-','');
  loadMembers(); loadMeetingsAll();
  if(id==='governance') loadPolicies();
  if(id==='announcements') loadAnnouncementsPageList();
  if(id==='risks') loadRisks();
  if(id==='compliance') loadCompliance();
  if(id==='signing') loadSigning();
  if(id==='committees') loadCommittees();
  if(id==='procedures'){ loadProcedures(); }
  if(id==='structure'){ loadStructure(); renderApprovalStatus('structure','structureApprovalStatus'); }
  if(id==='permissions'){ loadPermissionsMatrix(); loadMatrixApprovalStatus(); }
  if(id==='voting') loadVotingPage();
  if(id==='audit') loadAudit();
  if(id==='govassess'){ document.getElementById('govassessListView').style.display='block'; document.getElementById('govassessFormView').style.display='none'; loadGovAssessments(); }
  if(id==='consultants') loadConsultantsPage();
  if(id==='perf') loadPerf();
  if(id==='decisiontracking') loadDecisionTracking();
  if(id==='managerdecisions') loadSimpleDecisions('manager');
  if(id==='ownerdecisions') loadSimpleDecisions('owner');
  if(id==='appoint'){ loadAppointRequests(); loadReviewSection(); }
  if(id==='reports') loadReportsPage();
  if(id==='archive') loadArchive();
  if(id==='users') loadUsers();
  if(id==='dashboard') loadDashboard();
  if(id==='companyrequest') loadCompanyRequestPage();
  if(id==='companyrequests') loadCompanyRequestsReview();
  if(id==='activitylog') loadActivityLog();
  if(id==='shareholders') loadShareholders();
  if(id==='indicators') loadIndicatorsReport();
  if(id==='adminrequests'){ switchAdminRequestsTab('companyrequests'); loadCompanyRequestsReview(); loadManageCompanies(); loadAuditAdmin(); loadRiskAdmin(); }
  if(id==='platformdashboard') loadPlatformDashboard();
  if(id==='platformusers') loadPlatformUsers();
  if(id==='platformactivity') loadPlatformActivity();
}

const REPORT_MANUAL_FIELDS = [
  { key:'compliance_statement', label:'', placeholder:'اذكر ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسباب ذلك...', default:'طبّقت الشركة كافة الأحكام الواردة في لائحة حوكمة الشركات الصادرة عن هيئة السوق المالية.' },
  { key:'other_directorships', placeholder:'أسماء الشركات (داخل المملكة أو خارجها) التي يكون أي من أعضاء الإدارة العليا عضوًا في مجالس إدارتها الحالية أو السابقة...' },
  { key:'remuneration', placeholder:'إفصاح عن مكافآت أعضاء مجلس الإدارة والإدارة التنفيذية، وسياسة تحديدها، والعلاقة بين المكافآت الممنوحة وسياسة المكافآت المعمول بها...' },
  { key:'penalties', placeholder:'أي عقوبة أو جزاء أو تدبير احترازي مفروض على الشركة من الهيئة أو أي جهة تنظيمية، مع بيان الأسباب وسبل العلاج...', default:'لم تتعرض الشركة خلال هذا العام لأي عقوبات أو جزاءات من الجهات التنظيمية.' },
  { key:'internal_control', placeholder:'نتائج المراجعة السنوية لفعالية إجراءات الرقابة الداخلية، ورأي لجنة المراجعة في مدى كفايتها...' },
  { key:'risk_policy', placeholder:'سياسة إدارة المخاطر المذكورة أعلاه وآلية مراقبتها...' },
  { key:'material_variances', placeholder:'أي فروقات جوهرية (10% فأكثر) في النتائج التشغيلية عن السنة السابقة أو عن أي توقعات أعلنتها الشركة...', default:'لا توجد فروقات جوهرية تستدعي الإفصاح عنها.' },
  { key:'subsidiaries', placeholder:'اسم كل شركة تابعة، ورأس مالها، ونسبة ملكية الشركة فيها، ونشاطها الرئيسي، ودولة التأسيس...', default:'لا توجد شركات تابعة.' },
  { key:'loans', placeholder:'معلومات عن أي قروض على الشركة (المبلغ، الجهة المانحة، المدة، الرصيد المتبقي)...', default:'لا توجد قروض على الشركة.' },
  { key:'share_registry_requests', placeholder:'عدد طلبات الشركة لسجل المساهمين وتواريخها وأسبابها...' },
  { key:'related_party_contracts', placeholder:'أي أعمال أو عقود تكون الشركة طرفًا فيها ولأحد أصحاب القرار أو كبار التنفيذيين مصلحة فيها...', default:'لا توجد أعمال أو عقود من هذا القبيل.' },
  { key:'dividends', placeholder:'نسب الأرباح الموزعة على المساهمين خلال العام، والمقترح توزيعه في نهاية السنة المالية...' },
  { key:'declarations', placeholder:'إقرارات مجلس الإدارة...', default:'يقر مجلس الإدارة بأن سجلات الحسابات أُعدت بالشكل الصحيح، وأن نظام الرقابة الداخلية أُعد على أسس سليمة ونُفذ بفاعلية، وأنه لا يوجد أي شك يُذكر في قدرة الشركة على مواصلة نشاطها.' }
];

// For a single-owner LLC there is no board — a few fields' placeholder/default text hard-codes
// "مجلس الإدارة" language that would otherwise get saved verbatim into the report unedited
// (declarations especially: its default is a full sentence someone could submit as-is,
// literally attributing a declaration to a board that doesn't exist).
function getReportFieldTextForEntity(f){
  if(currentCompanyType === "ذات مسؤولية محدودة" && currentCompanyLLCSingleOwner){
    const overrides = {
      remuneration: { placeholder: 'إفصاح عن مكافآت الإدارة التنفيذية، وسياسة تحديدها...' },
      internal_control: { placeholder: 'نتائج المراجعة السنوية لفعالية إجراءات الرقابة الداخلية...' },
      declarations: { placeholder: 'إقرارات المالك...', default: 'يقر المالك بأن سجلات الحسابات أُعدت بالشكل الصحيح، وأن نظام الرقابة الداخلية أُعد على أسس سليمة ونُفذ بفاعلية، وأنه لا يوجد أي شك يُذكر في قدرة الشركة على مواصلة نشاطها.' },
    };
    if(overrides[f.key]) return { ...f, ...overrides[f.key] };
  }
  return f;
}

function renderReportManualFields(year, savedValues){
  REPORT_MANUAL_FIELDS.forEach(f0 => {
    const f = getReportFieldTextForEntity(f0);
    const box = document.getElementById("field-"+f.key);
    if(!box) return;
    const val = savedValues[f.key] != null ? savedValues[f.key] : (f.default || "");
    box.innerHTML = `
      <textarea class="rep-field-textarea" id="repfield-${f.key}" rows="2" placeholder="${f.placeholder}">${val}</textarea>
      <button class="btn-xs primary" onclick="saveReportField('${f.key}',${year})"><span class="ico-i ico-save"></span>حفظ</button>
    `;
  });
}

async function saveReportField(key, year){
  const el = document.getElementById("repfield-"+key);
  if(!el) return;
  const field_value = el.value;
  const { error } = await sb.from("board_report_fields")
    .upsert([{ company_id: currentCompanyId, year, field_key: key, field_value }], { onConflict: 'company_id,year,field_key' });
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم الحفظ ✅");
}

function boardMemberClassification(m){
  if(m.is_executive === "تنفيذي") return "تنفيذي";
  if(m.status === "مستقل") return "مستقل";
  return "غير تنفيذي";
}

function applyReportTypeAdaptation(){
  const type = currentCompanyType;
  const isSoleProp = type === "مؤسسة فردية";
  const isLLC = type === "ذات مسؤولية محدودة";
  const isLLCSingleManager = isLLC && currentCompanyLLCSingleManager;
  const isLLCSingleOwner = isLLC && currentCompanyLLCSingleOwner;
  const noBoard = isSoleProp || isLLCSingleManager || isLLCSingleOwner; // no board / council of managers to report on at all

  let pageTitle, subTitle, boardWord;
  if(isSoleProp || isLLCSingleOwner){
    // A single-owner LLC is, for reporting purposes, exactly the sole-proprietorship case —
    // one annual company report, no board-of-managers framing to keep up.
    pageTitle = "📈 التقرير السنوي"; subTitle = "التقرير السنوي"; boardWord = "المالك";
  }
  else if(isLLCSingleManager){ pageTitle = "📈 تقرير المدير السنوي"; subTitle = "تقرير المدير السنوي"; boardWord = "المدير"; }
  else if(isLLC){ pageTitle = "📈 تقرير مجلس المديرين السنوي"; subTitle = "تقرير مجلس المديرين السنوي"; boardWord = "مجلس المديرين"; }
  else { pageTitle = "📈 تقرير مجلس الإدارة السنوي (حسب المادة 90 من لائحة حوكمة الشركات)"; subTitle = "تقرير مجلس الإدارة السنوي"; boardWord = "مجلس الإدارة"; }

  setText("reportsPageTitle", pageTitle);
  setText("reportSubTitle", subTitle);

  // CMA-specific sections — never applicable outside joint-stock companies (unchanged from
  // before). Board/council-specific sections — hidden wherever there is genuinely no such body
  // (sole prop, single-manager LLC, single-owner LLC), not just for sole proprietorships alone.
  ["sec-compliance", "sec-share-registry"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = (isSoleProp || isLLC) ? "none" : "";
  });
  ["sec-board-composition", "sec-other-directorships", "sec-committees", "sec-related-party"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = noBoard ? "none" : "";
  });
  // Internal control and declarations always stay VISIBLE (never hidden) — every entity, board
  // or not, still has internal controls worth reporting on and still makes a formal declaration;
  // only the wording of who is making it changes below.

  if(noBoard){
    setText("rep-title-1", "أولاً: تأسيس الشركة");
    setText("rep-title-5", "أولاً: مكافآت الإدارة التنفيذية");
    setText("rep-title-7", "أولاً: نتائج المراجعة السنوية للرقابة الداخلية");
    setText("rep-title-11", "أولاً: الأعمال والعقود مع أطراف ذات علاقة");
    setText("rep-title-15", `أولاً: إقرارات ${boardWord}`);
  } else {
    setText("rep-title-1", "أولاً: ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسبابه");
    setText("rep-title-5", `أولاً: مكافآت أعضاء ${boardWord} والإدارة التنفيذية`);
    setText("rep-title-7", "أولاً: نتائج المراجعة السنوية للرقابة الداخلية ورأي لجنة المراجعة");
    setText("rep-title-11", "أولاً: القروض على الشركة");
    setText("rep-title-15", `أولاً: إقرارات ${boardWord}`);
  }
  renumberVisibleReportSections();
}

// Section numbers (أولاً، ثانياً...) are baked into each title's text, but whole sections get
// hidden depending on company type — walk the ones still visible, in document order, and
// re-stamp each with the correct sequential ordinal instead of leaving gaps like "خامساً"
// showing up as the first visible section.
const REPORT_ORDINALS = ["أولاً","ثانياً","ثالثاً","رابعاً","خامساً","سادساً","سابعاً","ثامناً","تاسعاً","عاشراً","حادي عشر","ثاني عشر","ثالث عشر","رابع عشر","خامس عشر"];
function renumberVisibleReportSections(){
  const body = document.getElementById("reportBody");
  if(!body) return;
  const titles = body.querySelectorAll(".rep-sec-title");
  let idx = 0;
  titles.forEach(el => {
    const isHidden = el.offsetParent === null;
    if(isHidden) return;
    const match = el.textContent.match(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر):\s*(.*)$/);
    if(!match) return; // titles with no ordinal (e.g. "أبرز القرارات") are left as-is
    el.textContent = `${REPORT_ORDINALS[idx]}: ${match[2]}`;
    idx++;
  });
}

async function loadReportsPage(){
  applyReportTypeAdaptation();
  const list = document.getElementById("companySwitcher");
  const name = list && list.selectedOptions.length ? list.selectedOptions[0].textContent : "الشركة";
  setText("reportCompanyName1", name);

  const yearSelect = document.getElementById("reportYearSelect");
  const nowYear = new Date().getFullYear();
  if(yearSelect && yearSelect.options.length === 0){
    for(let y = nowYear; y >= nowYear-4; y--){
      const opt = document.createElement("option");
      opt.value = y; opt.textContent = y;
      yearSelect.appendChild(opt);
    }
  }
  const currentYear = yearSelect ? Number(yearSelect.value) : nowYear;
  setText("reportPeriodLine", `للسنة المالية المنتهية في 31 ديسمبر ${currentYear}`);
  setText("reportGenDate", new Date().toLocaleDateString("ar-SA-u-ca-gregory"));

  const [meetingsRes, signingRes, complianceRes, committeesRes, membersRes, risksRes, perfRes, fieldsRes, attendanceRes, committeeMembersRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("risks").select("*").eq("company_id", currentCompanyId),
    sb.from("performance_evaluations").select("*").eq("company_id", currentCompanyId),
    sb.from("board_report_fields").select("*").eq("company_id", currentCompanyId).eq("year", currentYear),
    sb.from("meeting_attendance").select("*").eq("company_id", currentCompanyId),
    sb.from("committee_members").select("*").eq("company_id", currentCompanyId)
  ]);
  const meetings = meetingsRes.data || [];
  const signingDocs = signingRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const committeesData = committeesRes.data || [];
  const members = membersRes.data || [];
  const risks = risksRes.data || [];
  const perfEvals = perfRes.data || [];
  const attendance = attendanceRes.data || [];
  const committeeLinks = committeeMembersRes.data || [];

  const savedFields = {};
  (fieldsRes.data||[]).forEach(f => { savedFields[f.field_key] = f.field_value; });
  renderReportManualFields(currentYear, savedFields);

  const boardMeetingsThisYear = meetings.filter(m => (m.meeting_type==="اجتماع مجلس الإدارة الدوري"||m.meeting_type==="اجتماع طارئ") && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
  const decisionsThisYear = signingDocs.filter(d => d.status==="مكتمل" && d.created_at && new Date(d.created_at).getFullYear()===currentYear);
  const cmpAssess = await cmpLatestAssessment();
  const compliancePct = complianceSummary(compliance, cmpAssess).pct;

  setText("rep-kpi-meetings", boardMeetingsThisYear.length);
  setText("rep-kpi-decisions", decisionsThisYear.length);
  setText("rep-kpi-compliance", compliancePct!=null ? compliancePct+"%" : "—");
  setText("rep-kpi-committees", committeesData.length);

  // ── Section 2: Board composition & classification (real) ──
  const compBox = document.getElementById("rep-board-composition");
  if(compBox){
    compBox.innerHTML = members.length ? `<table class="tbl"><thead><tr><th>الاسم</th><th>المنصب</th><th>التصنيف</th></tr></thead><tbody>
      ${members.map(m => `<tr><td>${orgEsc(m.name||"")}</td><td>${orgEsc(m.position||"—")}</td><td>${boardMemberClassification(m)}</td></tr>`).join("")}
    </tbody></table>` : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا يوجد أعضاء مسجّلون بعد.</div>';
  }

  // ── Section 4: Committees detail — members, meeting count, attendance (real) ──
  const commBox = document.getElementById("rep-committees-detail");
  if(commBox){
    if(committeesData.length===0){
      commBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد لجان مسجّلة بعد.</div>';
    } else {
      commBox.innerHTML = `<table class="tbl"><thead><tr><th>اللجنة</th><th>الرئيس</th><th>عدد الأعضاء</th><th>اجتماعاتها هذا العام</th><th>متوسط نسبة الحضور</th></tr></thead><tbody>
        ${committeesData.map(c => {
          const memberIds = committeeLinks.filter(l=>l.committee_id===c.id).map(l=>l.member_id);
          const cMeetings = meetings.filter(m => m.committee_id===c.id && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
          const cMeetingIds = cMeetings.map(m=>m.id);
          const cAttendance = attendance.filter(a => cMeetingIds.includes(a.meeting_id) && memberIds.includes(a.member_id));
          const present = cAttendance.filter(a=>a.status==="حاضر").length;
          const avgPct = cAttendance.length ? Math.round((present/cAttendance.length)*100) : null;
          return `<tr><td>${orgEsc(c.committee_name||"")}</td><td>${orgEsc(c.chairman_name||"—")}</td><td>${memberIds.length}</td><td>${cMeetings.length}</td><td>${avgPct!=null?avgPct+'%':'—'}</td></tr>`;
        }).join("")}
      </tbody></table>`;
    }
  }

  // ── Section 8: Risks list (real) ──
  const riskBox = document.getElementById("rep-risks-list");
  if(riskBox){
    riskBox.innerHTML = risks.length ? `<table class="tbl"><thead><tr><th>الخطر</th><th>الفئة</th><th>التأثير</th><th>الاحتمالية</th><th>الحالة</th></tr></thead><tbody>
      ${risks.map(r => `<tr><td>${orgEsc(r.risk_name||"")}</td><td>${orgEsc(r.category||"—")}</td><td>${r.impact||"—"}</td><td>${r.probability!=null?r.probability+'%':'—'}</td><td>${r.status||"—"}</td></tr>`).join("")}
    </tbody></table>` : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد مخاطر مسجّلة بعد.</div>';
  }

  // Decisions list
  const decBox = document.getElementById("rep-decisions-list");
  if(decBox){
    const topDecisions = decisionsThisYear.sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
    decBox.innerHTML = topDecisions.length
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        topDecisions.map(d => `<div style="background:#E8F8EF;border-radius:8px;padding:10px 14px;font-size:12px;color:var(--green);font-weight:600"><span class="ico-i ico-check"></span>${orgEsc(d.document_name)}</div>`).join("") +
        '</div>'
      : '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا توجد قرارات موقّعة مكتملة هذا العام بعد.</div>';
  }

  // Other governance reports — live summaries linking to real pages
  const otherBox = document.getElementById("rep-other-tbody");
  if(otherBox){
    const completedPerf = perfEvals.filter(p=>p.status==="مكتمل").length;
    const openRisks = risks.filter(r=>r.status==="مراقبة"||r.status==="متابعة").length;
    const agmCount = meetings.filter(m=>m.meeting_type==="الجمعية العامة").length;
    const rows = [
      { title:"تقرير الامتثال التنظيمي", type:"امتثال", summary: complianceSummary(compliance, cmpAssess).text, ok: compliancePct===100, page:"compliance" },
      { title:"تقرير تقييم أداء المجلس", type:"تقييم", summary: perfEvals.length ? `${completedPerf} تقييم مكتمل من ${perfEvals.length}` : "لا توجد بيانات", ok: perfEvals.length>0 && completedPerf===perfEvals.length, page:"perf" },
      { title:"تقرير إدارة المخاطر", type:"مخاطر", summary: risks.length ? `${openRisks} خطر مفتوح من ${risks.length}` : "لا توجد بيانات", ok: openRisks===0, page:"risks" },
      { title:"تقرير الحوكمة للجمعية العامة", type:"جمعية", summary: agmCount ? `${agmCount} جمعية مسجّلة` : "لا توجد بيانات", ok: agmCount>0, page:"agm" },
      { title:"تقرير السياسات والحوكمة", type:"سياسات", summary: "عرض كل السياسات ومراحل اعتمادها", ok: null, page:"governance" }
    ];
    otherBox.innerHTML = rows.map(r => {
      const badge = r.ok===null ? '<span class="badge info">مرجع</span>' : (r.ok ? '<span class="badge done">جيد ✅</span>' : '<span class="badge pending">يحتاج متابعة</span>');
      return `<tr>
        <td>${orgEsc(r.title)}</td><td>${r.type}</td><td style="font-size:12px;color:var(--gray3)">${r.summary}</td>
        <td>${badge}</td>
        <td><button class="btn-xs primary" onclick="go('${r.page}',null)"><span class="ico-i ico-document"></span>عرض التفاصيل</button></td>
      </tr>`;
    }).join("");
  }
}


async function generateAnnualReportPDF(){
  const w = openPrintWindow();
  if(w){ w.document.write('<html dir="rtl"><body style="font-family:sans-serif;padding:30px">جارِ تجهيز التقرير...</body></html>'); w.document.close(); }

  const yearSelect = document.getElementById("reportYearSelect");
  const currentYear = yearSelect ? Number(yearSelect.value) : new Date().getFullYear();
  const companyName = document.getElementById("reportCompanyName1")?.textContent || "الشركة";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");

  // Pull whatever is currently written in each manual field (including unsaved edits),
  // since generating the PDF is meant to happen right after finishing writing the report.
  const manualValues = {};
  REPORT_MANUAL_FIELDS.forEach(f => {
    const el = document.getElementById("repfield-"+f.key);
    manualValues[f.key] = el ? el.value.trim() : (f.default || "");
  });

  const [meetingsRes, signingRes, complianceRes, committeesRes, membersRes, risksRes, attendanceRes, committeeMembersRes] = await Promise.all([
    sb.from("meetings").select("*").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("company_id", currentCompanyId),
    sb.from("compliance_items").select("*").eq("company_id", currentCompanyId),
    sb.from("committees").select("*").eq("company_id", currentCompanyId),
    sb.from("board_members").select("*").eq("company_id", currentCompanyId),
    sb.from("risks").select("*").eq("company_id", currentCompanyId),
    sb.from("meeting_attendance").select("*").eq("company_id", currentCompanyId),
    sb.from("committee_members").select("*").eq("company_id", currentCompanyId)
  ]);
  if(!w){ alert("المتصفح منع فتح نافذة التقرير — الرجاء السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى."); return; }

  const meetings = meetingsRes.data || [];
  const signingDocs = signingRes.data || [];
  const compliance = complianceApplicable(complianceRes.data || []);
  const committeesData = committeesRes.data || [];
  const members = membersRes.data || [];
  const risks = risksRes.data || [];
  const attendance = attendanceRes.data || [];
  const committeeLinks = committeeMembersRes.data || [];

  const boardMeetingsThisYear = meetings.filter(m => (m.meeting_type==="اجتماع مجلس الإدارة الدوري"||m.meeting_type==="اجتماع طارئ") && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
  const decisionsThisYear = signingDocs.filter(d => d.status==="مكتمل" && d.created_at && new Date(d.created_at).getFullYear()===currentYear);
  const cmpAssess = await cmpLatestAssessment();
  const compliancePct = complianceSummary(compliance, cmpAssess).pct;

  const composRows = members.map(m => `<tr><td>${orgEsc(m.name||"")}</td><td>${orgEsc(m.position||"—")}</td><td>${boardMemberClassification(m)}</td></tr>`).join("")
    || '<tr><td colspan="3">لا يوجد أعضاء مسجّلون.</td></tr>';

  const commRows = committeesData.map(c => {
    const memberIds = committeeLinks.filter(l=>l.committee_id===c.id).map(l=>l.member_id);
    const cMeetings = meetings.filter(m => m.committee_id===c.id && m.meeting_date && new Date(m.meeting_date).getFullYear()===currentYear);
    const cMeetingIds = cMeetings.map(m=>m.id);
    const cAttendance = attendance.filter(a => cMeetingIds.includes(a.meeting_id) && memberIds.includes(a.member_id));
    const present = cAttendance.filter(a=>a.status==="حاضر").length;
    const avgPct = cAttendance.length ? Math.round((present/cAttendance.length)*100) : null;
    return `<tr><td>${orgEsc(c.committee_name||"")}</td><td>${orgEsc(c.chairman_name||"—")}</td><td>${memberIds.length}</td><td>${cMeetings.length}</td><td>${avgPct!=null?avgPct+'%':'—'}</td></tr>`;
  }).join("") || '<tr><td colspan="5">لا توجد لجان مسجّلة.</td></tr>';

  const riskRows = risks.map(r => `<tr><td>${orgEsc(r.risk_name||"")}</td><td>${orgEsc(r.category||"—")}</td><td>${r.impact||"—"}</td><td>${r.probability!=null?r.probability+'%':'—'}</td><td>${r.status||"—"}</td></tr>`).join("")
    || '<tr><td colspan="5">لا توجد مخاطر مسجّلة.</td></tr>';

  const decisionsList = decisionsThisYear.length
    ? '<ul>' + decisionsThisYear.map(d => `<li>${orgEsc(d.document_name)}</li>`).join("") + '</ul>'
    : '<p>لا توجد قرارات موقّعة مكتملة هذا العام بعد.</p>';

  const repIsSoleProp = currentCompanyType === "مؤسسة فردية";
  const repIsLLC = currentCompanyType === "ذات مسؤولية محدودة";
  const repBoardWord = repIsSoleProp ? "المالك" : repIsLLC ? "مجلس المديرين" : "مجلس الإدارة";
  const repTitle = repIsSoleProp ? "التقرير السنوي" : repIsLLC ? "تقرير مجلس المديرين السنوي" : "تقرير مجلس الإدارة السنوي";

  let sections = [
    { key:"compliance", num:"أولاً", title:"ما طُبّق من أحكام لائحة حوكمة الشركات وما لم يُطبّق وأسبابه", body: `<p>${orgEsc(manualValues.compliance_statement||"—")}</p>` },
    { key:"board", num:"ثانياً", title:`تكوين ${repBoardWord} وتصنيف الأعضاء`, body: `<table><thead><tr><th>الاسم</th><th>المنصب</th><th>التصنيف</th></tr></thead><tbody>${composRows}</tbody></table>` },
    { key:"directorships", num:"ثالثاً", title:"عضوية أعضاء المجلس في مجالس إدارات أخرى", body: `<p>${orgEsc(manualValues.other_directorships||"لا يوجد")}</p>` },
    { key:"committees", num:"رابعاً", title:"اللجان — الأعضاء وعدد الاجتماعات ونسب الحضور", body: `<table><thead><tr><th>اللجنة</th><th>الرئيس</th><th>عدد الأعضاء</th><th>اجتماعاتها هذا العام</th><th>متوسط نسبة الحضور</th></tr></thead><tbody>${commRows}</tbody></table>` },
    { key:"all", num:"خامساً", title:`مكافآت أعضاء ${repBoardWord} والإدارة التنفيذية`, body: `<p>${orgEsc(manualValues.remuneration||"—")}</p>` },
    { key:"all", num:"سادساً", title:"العقوبات والجزاءات المفروضة على الشركة", body: `<p>${orgEsc(manualValues.penalties||"—")}</p>` },
    { key:"internal_control", num:"سابعاً", title:"نتائج المراجعة السنوية للرقابة الداخلية ورأي لجنة المراجعة", body: `<p>${orgEsc(manualValues.internal_control||"—")}</p>` },
    { key:"all", num:"ثامناً", title:"المخاطر التي تواجه الشركة وسياسة إدارتها", body: `<table><thead><tr><th>الخطر</th><th>الفئة</th><th>التأثير</th><th>الاحتمالية</th><th>الحالة</th></tr></thead><tbody>${riskRows}</tbody></table><p style="margin-top:8px">${orgEsc(manualValues.risk_policy||"")}</p>` },
    { key:"all", num:"تاسعاً", title:"الفروقات الجوهرية في النتائج التشغيلية عن السنة السابقة", body: `<p>${orgEsc(manualValues.material_variances||"—")}</p>` },
    { key:"all", num:"عاشراً", title:"الشركات التابعة", body: `<p>${orgEsc(manualValues.subsidiaries||"—")}</p>` },
    { key:"all", num:"حادي عشر", title:"القروض على الشركة", body: `<p>${orgEsc(manualValues.loans||"—")}</p>` },
    { key:"share_registry", num:"ثاني عشر", title:"طلبات الشركة لسجل المساهمين", body: `<p>${orgEsc(manualValues.share_registry_requests||"—")}</p>` },
    { key:"all", num:"ثالث عشر", title:`الأعمال والعقود مع أطراف ذات علاقة بـ${repIsSoleProp?"المالك":"أعضاء "+repBoardWord}`, body: `<p>${orgEsc(manualValues.related_party_contracts||"—")}</p>` },
    { key:"all", num:"رابع عشر", title:"توزيعات الأرباح", body: `<p>${orgEsc(manualValues.dividends||"—")}</p>` },
    { key:"declarations", num:"خامس عشر", title:`إقرارات ${repBoardWord}`, body: `<p>${orgEsc(manualValues.declarations||"—")}</p>` },
    { key:"all", num:"", title:"أبرز القرارات الصادرة هذا العام", body: decisionsList }
  ];
  const hideKeysNonJointStock = ["compliance","share_registry"];
  const hideKeysSoleProp = ["board","directorships","committees","internal_control","declarations"];
  sections = sections.filter(s => {
    if((repIsSoleProp || repIsLLC) && hideKeysNonJointStock.includes(s.key)) return false;
    if(repIsSoleProp && hideKeysSoleProp.includes(s.key)) return false;
    return true;
  });
  const ORDINALS = ["أولاً","ثانياً","ثالثاً","رابعاً","خامساً","سادساً","سابعاً","ثامناً","تاسعاً","عاشراً","حادي عشر","ثاني عشر","ثالث عشر","رابع عشر","خامس عشر"];
  let ordinalIdx = 0;
  sections.forEach(s => { if(s.num !== "") s.num = ORDINALS[ordinalIdx++]; });

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${repTitle} ${currentYear}</title>
    <style>
      @page{ margin:2cm 1.8cm; }
      *{ box-sizing:border-box; }
      body{ font-family:'Tajawal',Arial,sans-serif; color:#0D2447; font-size:12.5px; line-height:1.9; margin:0; }
      .cover{
        background:linear-gradient(135deg,#1A3A6B,#2E5AA8); color:#fff; text-align:center;
        padding:60px 30px; border-radius:0 0 24px 24px; margin-bottom:30px;
      }
      .cover .kingdom{ font-size:11px; letter-spacing:3px; color:rgba(255,255,255,0.65); margin-bottom:14px; }
      .cover .company{ font-size:26px; font-weight:900; color:#D4AF37; margin-bottom:10px; }
      .cover .title{ font-size:18px; font-weight:700; margin-top:14px; }
      .cover .period{ font-size:13px; color:rgba(255,255,255,0.75); margin-top:6px; }
      .kpis{ display:flex; justify-content:center; gap:14px; margin:-40px 30px 30px; flex-wrap:wrap; }
      .kpi-box{ background:#fff; border:1px solid #E4E9F0; border-radius:10px; padding:14px 18px; text-align:center; box-shadow:0 4px 14px rgba(10,22,40,0.08); min-width:110px; }
      .kpi-box .val{ font-size:22px; font-weight:900; color:#1A3A6B; }
      .kpi-box .lbl{ font-size:10px; color:#8B95A5; margin-top:4px; }
      .section{ padding:0 4px; margin-bottom:22px; page-break-inside:avoid; }
      .section h2{ font-size:14.5px; font-weight:800; color:#1A3A6B; border-bottom:2px solid #D4AF37; padding-bottom:8px; margin-bottom:10px; }
      .section h2 .num{ color:#D4AF37; margin-left:6px; }
      .section p{ color:#33475B; margin:0 0 6px; }
      table{ width:100%; border-collapse:collapse; margin-top:6px; font-size:11.5px; }
      th,td{ border:1px solid #D8DEE8; padding:7px 9px; text-align:right; }
      th{ background:#EAF0F8; color:#1A3A6B; font-weight:800; }
      ul{ margin:4px 0; padding-right:20px; color:#33475B; }
      .footer{ margin-top:40px; padding:14px; background:#F5F7FA; border-radius:8px; font-size:10.5px; color:#8B95A5; text-align:center; }
      @media print{ .cover{ border-radius:0; } }
    </style></head>
    <body>
      <div class="cover">
        <div class="kingdom">المملكة العربية السعودية</div>
        <div class="company">${companyName}</div>
        <div class="title">${repTitle}</div>
        <div class="period">للسنة المالية المنتهية في 31 ديسمبر ${currentYear}</div>
      </div>
      <div class="kpis">
        <div class="kpi-box"><div class="val">${boardMeetingsThisYear.length}</div><div class="lbl">اجتماعات المجلس</div></div>
        <div class="kpi-box"><div class="val">${decisionsThisYear.length}</div><div class="lbl">قراراً موقّعًا</div></div>
        <div class="kpi-box"><div class="val">${compliancePct!=null?compliancePct+'%':'—'}</div><div class="lbl">نسبة الامتثال</div></div>
        <div class="kpi-box"><div class="val">${committeesData.length}</div><div class="lbl">لجان نشطة</div></div>
      </div>
      ${sections.map(s => `<div class="section"><h2>${s.num?`<span class="num">${s.num}:</span>`:''}${orgEsc(s.title)}</h2>${s.body}</div>`).join("")}
      <div class="footer">تقرير مبني على بيانات المنصة الحقيقية بتاريخ ${dateNow} — طبقًا للمادة (90) من لائحة حوكمة الشركات الصادرة عن هيئة السوق المالية.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
    </body></html>
  `);
  w.document.close();
}
