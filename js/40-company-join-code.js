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
