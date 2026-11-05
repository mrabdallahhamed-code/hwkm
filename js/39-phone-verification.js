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
