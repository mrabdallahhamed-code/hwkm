/* ══════════ EMAIL NOTIFICATIONS (via Supabase Edge Function + Resend) ══════════ */
// The Edge Functions gateway still validates against the legacy JWT-format anon key, not the
// newer "sb_publishable_..." key used for regular database calls — kept separate on purpose.
const LEGACY_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZGRua29mc2R0d2Zqa3hka3R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzE5OTcsImV4cCI6MjA5OTEwNzk5N30.mZFiuj3C8PcQ0ShSYkYQWpJDA6gNr5mjFbNVaGhkhlQ";

/* ══════════ SMS OTP (phone verification during signup) via Authentica & WhatsApp Business API ══════════ */
let signupOtpVerifiedFlag = false;
let signupPhoneProof = null;

/* عدّاد إعادة الإرسال: يمنع تكرار الضغط ويوضّح للمستخدم متى يعيد المحاولة */
function startResendCooldown(btn, baseLabel, secs){
  if(!btn) return;
  btn.disabled = true;
  let left = secs || 60;
  const tick = () => {
    if(left <= 0){ btn.disabled = false; btn.textContent = baseLabel; return; }
    btn.textContent = `${baseLabel} (بعد ${left} ث)`;
    left--; setTimeout(tick, 1000);
  };
  tick();
}

async function requestSignupOtp(){
  signupOtpVerifiedFlag = false; signupPhoneProof = null;
  const phone = document.getElementById("signupPhone").value.trim();
  if(!phone){ alert("الرجاء إدخال رقم الجوال أولًا"); return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_otp_signup", phone })
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || "فشل إرسال الرمز"); }
    document.getElementById("signupOtpRow").style.display = "block";
    startResendCooldown(document.getElementById("signupOtpSendBtn"), "إعادة إرسال الرمز", 60);
    alert("تم إرسال رمز التحقق إلى جوالك ✅ — قد تتأخر الرسالة دقيقة. ويمكنك إكمال التسجيل الآن وتوثيق الجوال لاحقًا.");
  }catch(e){
    alert("تعذّر إرسال رمز التحقق: " + e.message);
  }
}

async function verifySignupOtp(){
  const phone = document.getElementById("signupPhone").value.trim();
  const code = document.getElementById("signupOtpCode").value.trim();
  if(!code){ alert("الرجاء إدخال الرمز"); return; }
  if(!(document.getElementById("loginEmail").value || "").trim()){ alert("اكتب بريدك الإلكتروني أولاً، فالتحقق يُربط به."); return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/passwordless-login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_otp_signup", phone, otpCode: code, email: (document.getElementById("loginEmail").value || "").trim().toLowerCase() })
    });
    const data = await res.json();
    if(!res.ok || !data.verified){ alert("الرمز غير صحيح أو منتهي الصلاحية — اضغط \"إرسال رمز التحقق\" للحصول على رمز جديد."); return; }
    signupOtpVerifiedFlag = true;
    signupPhoneProof = data.proof || null;
    document.getElementById("signupOtpVerified").style.display = "block";
    document.getElementById("signupOtpRow").style.display = "none";
  }catch(e){
    alert("تعذّر التحقق: " + e.message);
  }
}

// Generic WhatsApp Business API sender — requires an APPROVED message template on Meta's side
// (business-initiated messages can't be free-form text), so callers pass the template name and
// the ordered list of values that fill its placeholders.
async function sendWhatsAppReminderAPI(phone, templateName, params){
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-reminder`, {
      method: "POST", headers: await edgeAuthHeaders(),
      body: JSON.stringify({ phone: normalizeSaudiPhone(phone), templateName, params })
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || "فشل الإرسال"); }
    return { success: true, data };
  }catch(e){
    return { success: false, error: e.message };
  }
}

async function edgeAuthHeaders(){
  const h = { "Content-Type": "application/json" };
  try{
    const { data } = await sb.auth.getSession();
    const t = data && data.session && data.session.access_token;
    if(t) h["Authorization"] = "Bearer " + t;
  }catch(e){}
  return h;
}

// إشعار مالكي المنصة: الخادم هو من يحدّد عناوينهم، فلا تُكشف لأي مستخدم من الواجهة.
async function notifyPlatformAdmins(subject, html){
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: await edgeAuthHeaders(),
      body: JSON.stringify({ notify_admins: true, subject, html })
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || data.message || "فشل الإرسال"); }
    return { success: true, data };
  }catch(e){
    return { success: false, error: e.message };
  }
}

/* إشعار إدارة حوكم بوصول طلب جديد (مخاطر / مراجعة / خدمة...). ننتظر الإرسال بحد أقصى 6 ثوانٍ
   حتى لا يلغيه تحديث الصفحة أو إغلاقها، ولا نُظهر للعميل أي خطأ إن تعذّر. */
async function notifyOwnerNewRequest(kindLabel, rows){
  try{
    let coName = "—";
    try{ const { data: c } = await sb.from("companies").select("name,cr_number").eq("id", currentCompanyId).single(); if(c) coName = c.name + (c.cr_number ? " — س.ت: " + c.cr_number : " — بلا رقم سجل"); }catch(e){}
    const esc = v => String(v == null || v === "" ? "—" : v).replace(/[&<>]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]));
    const who = (currentUserProfile && (currentUserProfile.full_name || currentUserProfile.email)) || "";
    const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B">📥 ${esc(kindLabel)}</h2>
      <p><b>الشركة:</b> ${esc(coName)}</p>
      <p><b>مقدّم الطلب:</b> ${esc(who)}</p>
      ${(rows||[]).map(r => `<p><b>${esc(r[0])}:</b> ${esc(r[1])}</p>`).join("")}
      <p style="color:#B8860B">ردّ على العميل خلال يوم عمل — افتح لوحة المنصة ← الطلبات.</p>
    </div>`;
    await Promise.race([ notifyPlatformAdmins("📥 " + kindLabel + " — " + coName, html), new Promise(r => setTimeout(r, 6000)) ]);
  }catch(e){}
}

async function sendNotificationEmail(to, subject, html){
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: await edgeAuthHeaders(),
      body: JSON.stringify({ to, subject, html })
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || data.message || "فشل الإرسال"); }
    return { success: true, data };
  }catch(e){
    return { success: false, error: e.message };
  }
}

async function sendBulkEmails(recipients, subject, html, confirmLabel){
  if(!recipients || recipients.length === 0){ alert("لا يوجد مستلمين لديهم إيميل مسجّل."); return; }
  if(!await uiConfirm(`سيتم إرسال ${confirmLabel||"تذكير بريدي"} لـ${recipients.length} شخص. متابعة؟`)) return;
  let sent = 0, failed = 0;
  for(const r of recipients){
    const result = await sendNotificationEmail(r.email, subject, html);
    if(result.success) sent++; else failed++;
  }
  alert(`تم الإرسال: ${sent} ناجح${failed?`، ${failed} فشل`:''}`);
  return { sent, failed };
}

/* Internal test/demo users — fake email, auto-confirmed server-side, no OTP/Nafath involved.
   The actual account creation happens in an Edge Function (create-test-user) since it needs
   the Supabase service-role key, which must never touch client-side code. */
function openCreateTestUserModal(){
  document.getElementById("ctu-name").value = "";
  document.getElementById("ctu-email").value = "";
  document.getElementById("ctu-password").value = "";
  document.getElementById("ctu-role").value = "مدير النظام";
  document.getElementById("ctu-role-custom").value = "";
  document.getElementById("ctu-role-custom").style.display = "none";
  openM("m-create-test-user");
}

async function createTestUser(){
  const name = document.getElementById("ctu-name").value.trim();
  const email = document.getElementById("ctu-email").value.trim();
  const password = document.getElementById("ctu-password").value.trim();
  const role = resolveRoleValue("ctu-role", "ctu-role-custom");
  if(!name || !email || !password){ alert("الرجاء تعبئة الاسم والإيميل وكلمة المرور"); return; }
  if(!role){ alert("الرجاء كتابة المسمى الوظيفي المخصّص"); return; }
  if(password.length < 8){ alert("كلمة المرور لازم تكون ٨ أحرف على الأقل"); return; }

  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if(!token){ alert("تعذّر التحقق من جلستك — سجّل دخول من جديد وحاول مرة ثانية"); return; }

  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-test-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ company_id: currentCompanyId, name, email, password, role })
    });
    const data = await res.json();
    if(!res.ok){ alert("تعذّر إنشاء الحساب: " + (data.error || "خطأ غير معروف")); return; }
    closeM("m-create-test-user");
    alert(`تم إنشاء المستخدم التجريبي بنجاح ✅\nالإيميل: ${email}\nكلمة المرور: ${password}\n\nسجّل دخول فورًا بنفس البيانات، بدون أي تأكيد إضافي.`);
    loadUsers();
  }catch(e){
    alert("تعذّر الاتصال بالدالة الخلفية: " + e.message + "\n\nتأكد إنك نشرت دالة create-test-user على Supabase.");
  }
}

// Sends the actual generated/signed invitation to every shareholder in the registry who has
// an email on file — this is what "sendMeetingReminderEmails" (team-only) never covered.
async function sendInvitationToShareholders(meetingId){
  const m = allMeetingsCache.find(x => x.id === meetingId) || (await sb.from("meetings").select("*").eq("id", meetingId).single()).data;
  if(!m){ alert("تعذّر تحديد الاجتماع"); return; }

  const [{ data: shareholders }, { data: invitationDoc }, { data: company }] = await Promise.all([
    sb.from("shareholders").select("name,email").eq("company_id", currentCompanyId),
    sb.from("signing_documents").select("*").eq("related_meeting_id", meetingId).eq("doc_type","دعوة جمعية عامة").order("id",{ascending:false}).limit(1),
    sb.from("companies").select("name").eq("id", currentCompanyId).single()
  ]);
  const recipients = (shareholders||[]).filter(s => s.email);

  const invitation = (invitationDoc||[])[0];
  const invitationLink = invitation ? invitation.file_url : null;
  const listedLink = (currentCompanyType === "مساهمة مدرجة" && currentCompanyEntityVerified) ? `${window.location.origin}${window.location.pathname}?listed_company=${currentCompanyId}` : null;

  if(!await uiConfirm(recipients.length
    ? `سيتم نشر دعوة الجمعية لكل المساهمين على المنصة، وإرسالها بالبريد لـ${recipients.length} مساهم لديهم بريد مسجَّل. متابعة؟`
    : "سيتم نشر دعوة الجمعية لكل المساهمين على المنصة (لا يوجد بريد مسجَّل في سجل المساهمين، فلن تُرسل رسائل بريدية). متابعة؟")) return;

  // نشر الدعوة وملفاتها الداعمة على حسابات المساهمين (يشترط اكتمال توقيع الدعوة)
  const { data: pubRes, error: pubErr } = await sb.rpc("publish_agm_invitation", { p_meeting_id: meetingId });
  if(pubErr){ alert("تعذّر نشر الدعوة: " + pubErr.message + "\nتأكد من تنفيذ ملف SQL الخاص بالنشر."); return; }
  if(!pubRes || pubRes.ok !== true){ alert("لم تُنشر الدعوة: " + ((pubRes && pubRes.reason) || "سبب غير معروف")); return; }

  if(recipients.length === 0){
    alert("تم نشر الدعوة للمساهمين على المنصة ✅ — ولم تُرسل رسائل بريدية لعدم وجود بريد مسجَّل في سجل المساهمين.");
    try{ openAGMDetailModal(meetingId); }catch(e){}
    return;
  }

  const subject = `دعوة لحضور ${m.title||"الجمعية العامة"} — ${company?.name||""}`;
  let sent = 0, failed = 0;
  for(const s of recipients){
    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B"><span class="ico-i ico-send"></span>دعوة لحضور ${orgEsc(m.title||"الجمعية العامة")}</h2>
        <p>عزيزي/عزيزتي ${orgEsc(s.name||"")}،</p>
        <p>يتشرف مجلس إدارة ${orgEsc(company?.name||"الشركة")} بدعوتكم لحضور ${orgEsc(m.title||"الجمعية العامة")} ${m.agm_type||""}، والمنعقدة ${m.method||""} بتاريخ ${m.meeting_date||""} الساعة ${m.meeting_time||""}.</p>
        ${invitationLink ? `<p><a href="${invitationLink}" target="_blank"><span class="ico-i ico-document"></span>عرض نص الدعوة الرسمية (PDF)</a></p>` : ""}
        ${listedLink ? `<p>لم تسجّل حسابك بالمنصة بعد؟ <a href="${listedLink}" target="_blank">سجّل كمساهم من هنا</a> لتتمكن من التصويت إلكترونيًا.</p>` : ""}
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    const result = await sendNotificationEmail(s.email, subject, html);
    if(result && result.success) sent++; else failed++;
  }
  alert(`تم نشر الدعوة للمساهمين على المنصة ✅ — وأُرسلت ${sent} رسالة بريد ناجحة${failed?`، ${failed} فشلت`:""}.`);
  try{ openAGMDetailModal(meetingId); }catch(e){}
}

async function sendMeetingReminderEmails(meetingId){
  const m = allMeetingsCache.find(x => x.id === meetingId) || (await sb.from("meetings").select("*").eq("id", meetingId).single()).data;
  if(!m){ alert("تعذّر تحديد الاجتماع"); return; }
  const { data: team } = await sb.from("user_profiles").select("email,full_name").eq("company_id", currentCompanyId);
  const recipients = (team||[]).filter(t => t.email);
  if(recipients.length === 0){ alert("لا يوجد أعضاء فريق لديهم إيميل مسجّل."); return; }

  if(!await uiConfirm(`سيتم إرسال تذكير بريدي لـ${recipients.length} عضو فريق. متابعة؟`)) return;

  const subject = `تذكير: ${m.title || "اجتماع"} — ${m.meeting_date || ""}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-calendar"></span>تذكير باجتماع قادم</h2>
      <p><b>العنوان:</b> ${orgEsc(m.title||"")}</p>
      <p><b>التاريخ:</b> ${m.meeting_date||"—"} &nbsp; <b>الوقت:</b> ${m.meeting_time||"—"}</p>
      <p><b>الطريقة:</b> ${m.method||"—"}</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;

  let sent = 0, failed = 0;
  for(const r of recipients){
    const result = await sendNotificationEmail(r.email, subject, html);
    if(result.success) sent++; else failed++;
  }
  alert(`تم الإرسال: ${sent} ناجح${failed?`، ${failed} فشل (على الأغلب بسبب قيود النطاق التجريبي بـResend)`:''}`);
  logActivity("إنشاء", "تذكير بريدي", m.title||"", `أُرسل لـ${sent} من ${recipients.length}`);
}
