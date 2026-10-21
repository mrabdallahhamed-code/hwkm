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
  if(password.length < 6){ alert("كلمة المرور لازم تكون ٦ أحرف على الأقل"); return; }

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
  const listedLink = currentCompanyType === "مساهمة مدرجة" ? `${window.location.origin}${window.location.pathname}?listed_company=${currentCompanyId}` : null;

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

/* ══════════ ADD TO CALENDAR (URL-based, no API/OAuth needed) ══════════ */
function getCalendarLinks(meetingId, isAgm){
  const cache = isAgm ? agmMeetingsCache : allMeetingsCache;
  const m = (cache||[]).find(x => x.id === meetingId);
  if(!m || !m.meeting_date) return null;
  const [y, mo, da] = m.meeting_date.split("-").map(Number);
  const [hh, mm] = (m.meeting_time || "09:00").split(":").map(Number);
  const startDate = new Date(y, mo - 1, da, hh || 9, mm || 0);
  const endDate = new Date(startDate.getTime() + 60 * 60000);
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const title = m.title || "اجتماع";
  const details = `اجتماع عبر منصة حوكم${m.method ? (" — " + m.method) : ""}`;
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(startDate)}/${fmt(endDate)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(m.method||"")}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(m.method||"")}&path=/calendar/action/compose&rru=addevent`
  };
}

function addToCalendar(meetingId, provider, isAgm){
  const links = getCalendarLinks(meetingId, isAgm);
  if(!links){ alert("تعذّر تحديد بيانات الاجتماع (تأكد من وجود تاريخ محدد له)."); return; }
  window.open(links[provider], "_blank");
}

let waShareText = "";

async function openWhatsAppShareModal(text, recipientEmails){
  waShareText = text;
  document.getElementById("wa-share-text").value = waShareText;

  const box = document.getElementById("wa-team-list");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11.5px;padding:10px">جارِ التحميل...</div>';
  openM("m-whatsapp-share");

  let query = sb.from("user_profiles").select("full_name,phone_number,email").eq("company_id", currentCompanyId);
  const { data: team } = await query;
  let list = team || [];
  if(recipientEmails && recipientEmails.length){
    const set = new Set(recipientEmails.map(e => (e||"").toLowerCase()));
    list = list.filter(t => set.has((t.email||"").toLowerCase()));
  }
  const withPhones = list.filter(t => t.phone_number && t.phone_number.trim());
  if(withPhones.length === 0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:11.5px;padding:10px">لا يوجد أعضاء لديهم رقم جوال مسجّل حاليًا ضمن هذه القائمة.</div>';
    return;
  }
  box.innerHTML = withPhones.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray1)">
    <span style="font-size:12px;color:var(--dark)">${orgEsc(t.full_name||"—")}</span>
    <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="openDirectWhatsApp('${orgEsc((t.phone_number||"").replace(/'/g,""))}')"><span class="ico-i ico-phone"></span>إرسال</button>
  </div>`).join("");
}

async function shareMeetingViaWhatsApp(meetingId, isAgm){
  const cache = isAgm ? agmMeetingsCache : allMeetingsCache;
  const m = (cache||[]).find(x => x.id === meetingId);
  if(!m){ alert("تعذّر تحديد الاجتماع"); return; }
  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "";
  const text = `📅 *تذكير باجتماع*\n\n*${m.title||"اجتماع"}*\n🗓️ التاريخ: ${m.meeting_date||"—"}\n⏰ الوقت: ${m.meeting_time||"—"}\n📍 الطريقة: ${m.method||"—"}\n\n${companyName ? "— "+companyName+" عبر منصة حوكم" : "— منصة حوكم"}`;
  openWhatsAppShareModal(text, null);
}

function normalizeSaudiPhone(phone){
  let digits = (phone || "").replace(/[^\d]/g, "");
  if(digits.startsWith("00")) digits = digits.slice(2);
  if(digits.startsWith("0")) digits = "966" + digits.slice(1);
  if(!digits.startsWith("966") && digits.length === 9) digits = "966" + digits;
  return digits;
}

function openGenericWhatsApp(){
  window.open(`https://wa.me/?text=${encodeURIComponent(waShareText)}`, "_blank");
}
function openDirectWhatsApp(phone){
  const normalized = normalizeSaudiPhone(phone);
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(waShareText)}`, "_blank");
}
function copyWhatsAppText(){
  navigator.clipboard?.writeText(waShareText).then(()=>alert("تم نسخ النص ✅")).catch(()=>{
    const ta = document.getElementById("wa-share-text");
    ta.select(); document.execCommand("copy"); alert("تم نسخ النص ✅");
  });
}

/* ══════════ APPROVAL REMINDERS (policies + permissions) ══════════ */
async function sendPolicyApprovalReminder(policyId){
  const p = policiesCache.find(x => x.id === policyId);
  if(!p){ alert("تعذّر تحديد السياسة"); return; }
  const [{ data: team }, { data: reviews }] = await Promise.all([
    sb.from("user_profiles").select("email,full_name,phone_number").eq("company_id", currentCompanyId),
    sb.from("policy_reviews").select("reviewer_email").eq("policy_id", policyId)
  ]);
  const reviewedEmails = new Set((reviews||[]).map(r => (r.reviewer_email||"").toLowerCase()));
  const pending = (team||[]).filter(t => t.email && !reviewedEmails.has(t.email.toLowerCase()));
  if(pending.length === 0){ alert("كل الأعضاء راجعوا هذه السياسة بالفعل ✅"); return; }

  const subject = `تذكير موافقة: ${p.policy_name || "سياسة"}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-columns"></span>تذكير بمراجعة سياسة معلّقة</h2>
      <p><b>السياسة:</b> ${orgEsc(p.policy_name||"")}</p>
      <p><b>المرحلة الحالية:</b> ${p.status||"—"}</p>
      <p>الرجاء الدخول للمنصة ومراجعة السياسة والتصويت عليها.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(pending.map(t => ({ email: t.email })), subject, html, "تذكير موافقة سياسة");
  logActivity("إنشاء", "تذكير موافقة", p.policy_name, `أُرسل لـ${pending.length} عضو لم يراجعوا بعد`);

  const text = `🏛️ *تذكير بمراجعة سياسة*\n\n*${p.policy_name||""}*\nالمرحلة: ${p.status||"—"}\n\nالرجاء الدخول للمنصة ومراجعتها.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, pending.map(t => t.email));
}

async function sendPermissionItemNotification(itemId){
  const { data: item } = await sb.from("permission_items").select("*").eq("id", itemId).single();
  if(!item){ return; }
  const { data: team } = await sb.from("user_profiles").select("email,full_name,phone_number").eq("company_id", currentCompanyId);
  const recipients = (team||[]).filter(t => t.email);
  if(recipients.length === 0) return;

  const subject = `بند صلاحية جديد: ${item.item_name || ""}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-key"></span>بند جديد بمصفوفة الصلاحيات</h2>
      <p><b>البند:</b> ${orgEsc(item.item_name||"")}</p>
      <p><b>الفئة:</b> ${orgEsc(item.category||"—")}</p>
      <p>الرجاء مراجعة مصفوفة الصلاحيات بالمنصة والاطّلاع على البند الجديد.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(recipients.map(t => ({ email: t.email })), subject, html, "إشعار بند صلاحية جديد");
  logActivity("إنشاء", "إشعار صلاحيات", item.item_name, `أُرسل لـ${recipients.length} عضو`);
}

function sendPermissionItemWhatsApp(itemId){
  const item = permItemsCache?.find(x => x.id === itemId);
  if(!item){ alert("تعذّر تحديد البند"); return; }
  const text = `🔑 *بند جديد بمصفوفة الصلاحيات*\n\n*${item.item_name||""}*\nالفئة: ${item.category||"—"}\n\nالرجاء مراجعتها بالمنصة.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, null);
}

/* ══════════ BOARD APPROVAL WORKFLOW (permissions matrix + org structure) ══════════ */
async function uploadBlobToStorage(blob, folder, filename){
  const MAX_SIZE = 50 * 1024 * 1024;
  if(blob.size > MAX_SIZE){
    alert(`تعذّر الرفع: الملف الناتج (${(blob.size/1024/1024).toFixed(1)} ميجا) أكبر من الحد المسموح حاليًا (٥٠ ميجا).`);
    return null;
  }
  const safeName = Date.now() + "_" + filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = (currentCompanyId ? currentCompanyId : "unassigned") + "/" + folder + "/" + safeName;
  const { error } = await sb.storage.from("documents").upload(path, blob);
  if(error){ alert("تعذّر رفع الملف: " + error.message); return null; }
  const { data, error: signErr } = await sb.storage.from("documents").createSignedUrl(path, 315360000);
  if(signErr || !data){ alert("تعذّر إنشاء رابط آمن للملف: " + (signErr?.message||"")); return null; }
  return data.signedUrl;
}

// "Board" pool = any team member whose role relates to the board (chairman/secretary/member) or
// the system admin — matches how the rest of the platform already treats board-related roles.
/* A single source of truth for "what do we call the approving body" — used everywhere board
   approval language shows up (policies, the structure/matrix/charter approval workflow, PDFs,
   emails) instead of hardcoding "المجلس" in dozens of places that read wrong for a sole
   proprietorship (single owner, no board at all) or an LLC (managers' board, not "الإدارة"). */
function getGovernanceBodyLabel(){
  if(currentCompanyType === "مؤسسة فردية") return "المالك";
  if(currentCompanyType === "ذات مسؤولية محدودة"){
    if(currentCompanyLLCSingleOwner) return "المالك";
    if(currentCompanyLLCSingleManager) return "المدير";
    return "مجلس المديرين";
  }
  return "مجلس الإدارة";
}
function getGovernanceMemberLabel(){
  if(currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner) return "المالك";
  if(currentCompanyLLCSingleManager) return "المدير";
  return `أعضاء ${getGovernanceBodyLabel()}`;
}
// Swaps the literal "مجلس الإدارة" substring for the company-appropriate label wherever a
// stage name or generated sentence is actually DISPLAYED — internal comparisons/status values
// stay on the original canonical string so existing data and logic keep working unchanged.
function displayStageLabel(text){
  if(!text) return text;
  return text.replace(/مجلس الإدارة/g, getGovernanceBodyLabel());
}

async function getBoardApprovers(){
  const { data } = await sb.from("user_profiles").select("full_name,email,role,is_entity_rep,represented_entity")
    .eq("company_id", currentCompanyId).or("role.ilike.%مجلس%,role.eq.مدير النظام,role.in.(مالك,ممثل المالك)");
  return data || [];
}

/* ══════════ GOVERNANCE APPROVAL ENGINE (vote + sequential position-based signing) ══════════
   Two independent stages, both required: (1) board VOTES موافقة/رفض/اعتراض — any رفض halts the
   document; اعتراض is a recorded objection but doesn't block. (2) once voting clears, a STRICT,
   ORDERED chain of position-holders signs — nobody can sign out of turn, which is what makes
   "who's holding things up" traceable afterward. Reusable across document types (currently
   matrix; policies use the same engine later) via a per-company, per-type ordered role template. */
let workflowDraftRoles = [];
let currentWorkflowDocType = null;

function getMatrixCompanyName(){
  return document.getElementById("reportCompanyName1")?.textContent && document.getElementById("reportCompanyName1").textContent !== "—"
    ? document.getElementById("reportCompanyName1").textContent
    : (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent || "الشركة");
}

async function openWorkflowTemplateModal(docType){
  currentWorkflowDocType = docType;
  const label = docType === "matrix" ? "مصفوفة الصلاحيات" : (POLICY_WORKFLOW_LABELS[docType] || "السياسات");
  document.getElementById("wft-title").textContent = `⚙️ إعداد تسلسل التوقيع — ${label}`;
  const { data } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", docType).maybeSingle();
  workflowDraftRoles = (data && data.ordered_roles) ? [...data.ordered_roles] : [];
  renderWorkflowRolesList();
  document.getElementById("wft-new-role").value = "";
  openM("m-workflow-template");
}

function renderWorkflowRolesList(){
  const box = document.getElementById("wft-roles-list");
  if(workflowDraftRoles.length === 0){
    box.innerHTML = '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لم تُضف أي مناصب بعد.</div>';
    return;
  }
  box.innerHTML = workflowDraftRoles.map((role, i) => `<div style="display:flex;align-items:center;gap:8px;background:var(--offwhite);border-radius:8px;padding:8px 10px;margin-bottom:6px">
    <span style="background:var(--primary);color:#fff;font-weight:800;font-size:11px;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
    <span style="flex:1;font-size:12.5px">${role}</span>
    <button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer" onclick="moveWorkflowRole(${i},-1)" ${i===0?'disabled style="opacity:0.3"':''}>▲</button>
    <button class="btn-xs" style="background:none;border:none;color:var(--gray3);cursor:pointer" onclick="moveWorkflowRole(${i},1)" ${i===workflowDraftRoles.length-1?'disabled style="opacity:0.3"':''}>▼</button>
    <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="removeWorkflowRole(${i})">حذف</button>
  </div>`).join("");
}

function addWorkflowRole(){
  const input = document.getElementById("wft-new-role");
  const role = input.value.trim();
  if(!role) return;
  workflowDraftRoles.push(role);
  input.value = "";
  renderWorkflowRolesList();
}

function removeWorkflowRole(i){ workflowDraftRoles.splice(i,1); renderWorkflowRolesList(); }
function moveWorkflowRole(i, dir){
  const j = i + dir;
  if(j < 0 || j >= workflowDraftRoles.length) return;
  [workflowDraftRoles[i], workflowDraftRoles[j]] = [workflowDraftRoles[j], workflowDraftRoles[i]];
  renderWorkflowRolesList();
}

async function saveWorkflowTemplate(){
  if(workflowDraftRoles.length === 0){ alert("أضف منصبًا واحدًا على الأقل"); return; }
  const { data: existing } = await sb.from("signing_workflow_templates").select("id").eq("company_id", currentCompanyId).eq("document_type", currentWorkflowDocType).maybeSingle();
  const payload = { company_id: currentCompanyId, document_type: currentWorkflowDocType, ordered_roles: workflowDraftRoles };
  const { error } = existing
    ? await sb.from("signing_workflow_templates").update(payload).eq("id", existing.id)
    : await sb.from("signing_workflow_templates").insert([payload]);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  alert("تم حفظ تسلسل التوقيع ✅");
  closeM("m-workflow-template");
}

/* ── Building the matrix content as a canvas page (reused for the voting snapshot AND the
   final signed PDF — same drawing code, signatures just get added once collected) ── */
async function buildMatrixCanvasPages(signaturesMap, orderedRoles){
  const [{ data: holders }, { data: items }, { data: cells }] = await Promise.all([
    sb.from("permission_holders").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}),
    sb.from("permission_items").select("*").eq("company_id", currentCompanyId).order("sort_order",{ascending:true}),
    sb.from("permission_cells").select("*").eq("company_id", currentCompanyId)
  ]);
  const cellMap = {};
  (cells||[]).forEach(c => { cellMap[c.item_id+'-'+c.holder_id] = c.code; });

  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw("مصفوفة الصلاحيات والمسؤوليات", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(6);
  b.wrapAndDraw(getMatrixCompanyName(), { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
  b.spacer(20);

  const byCategory = {};
  (items||[]).forEach(it => { (byCategory[it.category||"عام"] = byCategory[it.category||"عام"]||[]).push(it); });

  const tableW = b.W - b.margin*2;
  const wItem = tableW*0.34;
  const wHolder = (tableW - wItem) / Math.max(1,(holders||[]).length);
  const RM = b.W - b.margin;

  Object.entries(byCategory).forEach(([cat, catItems]) => {
    b.ensureSpace(30*b.scale);
    b.wrapAndDraw(cat, { font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight:20*b.scale });
    b.spacer(4);

    const xItemStart = RM - wItem;
    const holderBounds = (holders||[]).map((h,i) => ({ h, s: xItemStart - wHolder*(i+1), e: xItemStart - wHolder*i }));
    b.ensureSpace(26*b.scale);
    const headerH = 26*b.scale;
    b.ctx.strokeStyle="#333"; b.ctx.lineWidth=0.7*b.scale; b.ctx.font=`bold ${8.5*b.scale}px Tajawal, Arial`; b.ctx.textAlign="center";
    b.ctx.strokeRect(xItemStart, b.y, RM-xItemStart, headerH);
    b.ctx.fillText("البند", (xItemStart+RM)/2, b.y+17*b.scale);
    holderBounds.forEach(hb => { b.ctx.strokeRect(hb.s, b.y, hb.e-hb.s, headerH); const nm=(hb.h.name||"").length>10?hb.h.name.slice(0,10)+"…":hb.h.name; b.ctx.fillText(nm, (hb.s+hb.e)/2, b.y+17*b.scale); });
    b.y += headerH;

    b.ctx.font=`${8.5*b.scale}px Tajawal, Arial`;
    catItems.forEach(it => {
      b.ensureSpace(24*b.scale);
      const rowH = 24*b.scale;
      b.ctx.strokeRect(xItemStart, b.y, RM-xItemStart, rowH);
      b.ctx.textAlign="right";
      const txt = (it.item_name||"").length>34 ? it.item_name.slice(0,34)+"…" : (it.item_name||"");
      b.ctx.fillText(txt, RM-4*b.scale, b.y+rowH/2+3*b.scale);
      b.ctx.textAlign="center";
      holderBounds.forEach(hb => {
        b.ctx.strokeRect(hb.s, b.y, hb.e-hb.s, rowH);
        const code = cellMap[it.id+'-'+hb.h.id];
        if(code) b.ctx.fillText(code, (hb.s+hb.e)/2, b.y+rowH/2+3*b.scale);
      });
      b.y += rowH;
    });
    b.spacer(10);
  });

  // Signature block, in the mandated order, one per row
  if(orderedRoles && orderedRoles.length){
    b.spacer(20);
    b.wrapAndDraw("توقيعات الاعتماد", { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
    b.spacer(16);
    await b.preloadSignatures(signaturesMap);
    orderedRoles.forEach((role) => {
      b.ensureSpace(65*b.scale);
      b.drawSigSlot(role, (signaturesMap[role]&&signaturesMap[role].name)||"", b.W/2, b.y, signaturesMap);
      b.spacer(70);
    });
  }
  return b;
}

async function startGovernanceApproval(docType, refId){
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", docType).maybeSingle();
  if(!template || !template.ordered_roles || template.ordered_roles.length===0){
    alert(`لازم تحدد تسلسل التوقيع أولًا لهذا النوع (${POLICY_WORKFLOW_LABELS[docType]||docType}) — اضغط زر "⚙️ إعداد التسلسل" المطابق.`);
    return;
  }

  const isMatrix = docType === "matrix";
  // Policies skip the blanket "whole board votes first" gate — their approval IS the ordered
  // role sequence itself (e.g. مدير الموارد البشرية → الرئيس التنفيذي → مجلس الإدارة), with
  // board sign-off happening wherever it's placed in that sequence, not as a mandatory
  // separate step before it. The matrix keeps the board-wide vote, since it affects everyone.
  const skipVote = !isMatrix;
  if(!await uiConfirm(skipVote
    ? "سيبدأ هذا دورة اعتماد جديدة بالتسلسل المحدد بالمناصب (بدون تصويت عام مسبق). متابعة؟"
    : "سيبدأ هذا دورة اعتماد جديدة: تصويت المجلس أولًا، ثم توقيع تسلسلي بالمناصب المحددة. متابعة؟"
  )) return;

  const docLabel = isMatrix ? "مصفوفة الصلاحيات" : "سياسة";
  let b;
  if(isMatrix){
    b = await buildMatrixCanvasPages({}, null);
  } else {
    const policy = policiesCache.find(p => p.id === refId);
    if(!policy){ alert("تعذّر تحميل السياسة"); return; }
    b = await buildPolicyCanvasPages(policy, {}, null);
  }
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const snapshotUrl = await uploadBlobToStorage(blob, "governance-approvals", `${docLabel}-${Date.now()}.pdf`);
  if(!snapshotUrl) return;

  const { data: approval, error } = await sb.from("governance_approvals").insert([{
    company_id: currentCompanyId, document_type: docType, document_ref_id: refId,
    document_snapshot_url: snapshotUrl, status: skipVote ? "قيد الاعتماد" : "قيد التصويت"
  }]).select().single();
  if(error){ alert("تعذّر بدء الدورة: " + error.message); return; }

  if(skipVote){
    await notifyGovernanceSigningTurn(approval.id, docType, template.ordered_roles[0], docLabel, "اعتماد");
    alert(`تم بدء دورة الاعتماد ✅ — أول من يعتمد بالتسلسل: ${template.ordered_roles[0]}. التوقيع الرسمي يبدأ فقط بعد ما يوافق الجميع.`);
  } else {
    const board = await getBoardApprovers();
    for(const b2 of board){
      await sendNotificationEmail(b2.email, `🗳️ طلب تصويت — ${docLabel}`,
        `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2><span class="ico-i ico-ballot"></span>طلب تصويت</h2><p>مطلوب تصويتك على ${docLabel} المحدثة. ادخل المنصة لتسجيل تصويتك.</p></div>`);
    }
    alert("تم بدء دورة الاعتماد ✅ — أُرسل طلب تصويت لأعضاء المجلس.");
  }
  loadMatrixApprovalStatus();
}

/* Best-effort email to whoever holds the role currently up — used for both phases (اعتماد /
   توقيع), matched by role text since ordered_roles are free-typed role names, same convention
   used elsewhere. Silently does nothing if nobody with that exact role is found; the in-app
   approval screen still shows whose turn it is regardless. */
async function notifyGovernanceSigningTurn(approvalId, docType, roleName, docLabel, phase){
  if(!roleName) return;
  const { data: holders } = await sb.from("user_profiles").select("full_name,email,role").eq("company_id", currentCompanyId).eq("role", roleName);
  const isApproval = phase === "اعتماد";
  for(const h of (holders||[])){
    await sendNotificationEmail(h.email, `${isApproval?'✅ دورك للاعتماد':'✍️ دورك للتوقيع'} — ${docLabel}`,
      `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h2>${isApproval?'✅ دورك للاعتماد':'✍️ دورك للتوقيع الإلكتروني'}</h2><p>وصل الدور لمنصبكم (${roleName}) لـ${isApproval?'اعتماد':'توقيع'} ${docLabel}. ادخل المنصة لمراجعتها و${isApproval?'اعتمادها':'توقيعها'}.</p></div>`);
  }
}

async function loadMatrixApprovalStatus(){
  const box = document.getElementById("matrixApprovalStatus");
  if(!box) return;
  const { data: approvals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).eq("document_type","matrix").order("created_at",{ascending:false}).limit(1);
  const current = (approvals||[])[0];
  if(!current || current.status === "مكتملة" || current.status === "مرفوضة"){
    box.innerHTML = current ? `<div style="font-size:11.5px;color:${current.status==='مكتملة'?'var(--green)':'var(--red)'}">آخر دورة اعتماد: ${current.status}. <span style="cursor:pointer;text-decoration:underline;color:var(--primary)" onclick="openGovernanceApprovalModal(${current.id})">عرض التفاصيل</span></div>` : "";
    return;
  }
  box.innerHTML = `<div style="background:#FEF3E2;border:2px solid var(--gold);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--gold);cursor:pointer" onclick="openGovernanceApprovalModal(${current.id})">
    🟡 دورة اعتماد جارية — الحالة: <b>${current.status}</b> — اضغط لعرض التفاصيل والمشاركة
  </div>`;
}

async function openGovernanceApprovalModal(approvalId){
  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
  if(!approval){ alert("تعذّر تحميل الدورة"); return; }
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const [{ data: votes }, { data: allSteps }] = await Promise.all([
    sb.from("governance_votes").select("*").eq("approval_id", approvalId),
    sb.from("governance_signatures").select("*").eq("approval_id", approvalId).order("order_position",{ascending:true})
  ]);
  const approvalSteps = (allSteps||[]).filter(s => s.phase === "اعتماد");
  const sigs = (allSteps||[]).filter(s => s.phase !== "اعتماد"); // "توقيع" — also covers pre-existing rows with no phase set
  const board = await getBoardApprovers();
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData?.user?.email;
  const myVote = (votes||[]).find(v => v.voter_email === myEmail);
  const isMatrix = approval.document_type === "matrix";
  // The role that actually gates action buttons below — must match the step's required role
  // exactly (or be مدير النظام, who can unblock a stuck cycle). Sequence position alone isn't
  // enough: without this, anyone who simply opens the modal could act on someone else's step.
  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : (getCurrentRole()||"");
  const canActAsRole = (stepRole) => myRawRole === stepRole || myRawRole === "مدير النظام";

  document.getElementById("ga-title").textContent = `دورة اعتماد — ${isMatrix?'مصفوفة الصلاحيات':'سياسة'}`;
  const body = document.getElementById("ga-body");

  let html = `<div class="sec-title" style="font-size:13px"><span class="ico-i ico-document"></span>نسخة الوثيقة</div>
    <a href="${approval.document_snapshot_url}" target="_blank" style="font-size:12px;color:var(--primary);font-weight:700"><span class="ico-i ico-document"></span>عرض النسخة الحالية (PDF)</a>`;

  // Board-wide vote — matrix only. Policies skip straight to the ordered approval chain below.
  if(isMatrix){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-ballot"></span>التصويت (${(votes||[]).length}/${board.length})</div>`;
    html += `<div style="margin-bottom:10px">${(votes||[]).map(v => `<div style="font-size:11.5px;padding:4px 0">
      <b>${orgEsc(v.voter_name||v.voter_email)}</b> — <span style="color:${v.decision==='موافقة'?'var(--green)':v.decision==='رفض'?'var(--red)':'var(--gold)'};font-weight:700">${orgEsc(v.decision)}</span>
      ${v.notes?` — <span style="color:var(--gray3)">${orgEsc(v.notes)}</span>`:""}
    </div>`).join("") || '<div style="font-size:11px;color:var(--gray3)">لا توجد أصوات بعد.</div>'}</div>`;

    if(approval.status === "قيد التصويت" && !myVote && board.some(b2=>b2.email===myEmail)){
      html += `<div class="card"><div class="card-body">
        <textarea class="fi" id="ga-vote-notes" rows="2" placeholder="ملاحظاتك (اختياري، خصوصًا عند الاعتراض)"></textarea>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn-xs" style="flex:1;background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'موافقة')"><span class="ico-i ico-check"></span>موافقة</button>
          <button class="btn-xs" style="flex:1;background:#FEF3E2;color:var(--gold);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'اعتراض')"><span class="ico-i ico-warning"></span>اعتراض (مع ملاحظات)</button>
          <button class="btn-xs" style="flex:1;background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:8px;cursor:pointer" onclick="castGovernanceVote(${approvalId},'رفض')"><span class="ico-i ico-xcircle"></span>رفض</button>
        </div>
      </div></div>`;
    }
  }

  if(approval.status === "مرفوضة"){
    html += `<div style="background:#FDE8E8;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;color:var(--red);font-weight:700"><span class="ico-i ico-xcircle"></span>رُفضت الوثيقة — لم تنتقل لمرحلة التوقيع.</div>`;
  }

  // Phase 1 — الاعتماد: everyone in the chain must agree, in order, before anyone signs
  // anything. This is a lightweight decision (no signature), and it's a hard gate: one
  // rejection halts the whole cycle before it ever reaches formal signing.
  if(["قيد الاعتماد","قيد التوقيع","مكتملة"].includes(approval.status) && template){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-check"></span>مرحلة الاعتماد (بالترتيب)</div>`;
    template.ordered_roles.forEach((role, i) => {
      const step = approvalSteps.find(s => s.role === role);
      const prevApproved = i === 0 || approvalSteps.some(s => s.role === template.ordered_roles[i-1] && s.decision === "موافقة");
      const isMyTurn = !step && prevApproved && approval.status === "قيد الاعتماد" && canActAsRole(role);
      html += `<div style="display:flex;align-items:center;gap:10px;background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:6px">
        <span style="background:${step?(step.decision==='موافقة'?'var(--green)':'var(--red)'):isMyTurn?'var(--gold)':'var(--gray2)'};color:#fff;font-weight:800;font-size:11px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${role}</div>
          ${step ? `<div style="font-size:10.5px;color:${step.decision==='موافقة'?'var(--green)':'var(--red)'}">${step.decision==='موافقة'?'✅ وافق':'❌ رفض'}: ${orgEsc(step.signer_name)} — ${new Date(step.signed_at).toLocaleString('ar-SA-u-ca-gregory')}</div>`
            : isMyTurn ? `<div style="font-size:10.5px;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار قرارك</div>`
            : `<div style="font-size:10.5px;color:var(--gray3)">⏳ بانتظار دور المنصب السابق</div>`}
        </div>
        ${isMyTurn ? `<div style="display:flex;gap:5px">
            <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:6px 10px;cursor:pointer" onclick="castGovernanceApprovalStep(${approvalId},'${role.replace(/'/g,"")}','موافقة')">موافقة</button>
            <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px 10px;cursor:pointer" onclick="castGovernanceApprovalStep(${approvalId},'${role.replace(/'/g,"")}','رفض')">رفض</button>
          </div>` : ""}
      </div>`;
    });
  }

  // Phase 2 — التوقيع: only reachable once every role above has approved. Same ordered
  // sequence, now with an actual signature.
  if(["قيد التوقيع","مكتملة"].includes(approval.status) && template){
    html += `<div class="sec-title" style="font-size:13px;margin-top:16px"><span class="ico-i ico-signature"></span>مرحلة التوقيع الإلكتروني (بعد اكتمال الاعتماد)</div>`;
    template.ordered_roles.forEach((role, i) => {
      const sig = (sigs||[]).find(s => s.role === role);
      const prevSigned = i === 0 || (sigs||[]).some(s => s.role === template.ordered_roles[i-1]);
      const isMyTurn = !sig && prevSigned && canActAsRole(role);
      const daysWaiting = (!sig && prevSigned) ? Math.floor((Date.now() - new Date((sigs||[]).find(s=>s.role===template.ordered_roles[i-1])?.signed_at || approval.created_at).getTime())/86400000) : 0;
      html += `<div style="display:flex;align-items:center;gap:10px;background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:6px">
        <span style="background:${sig?'var(--green)':isMyTurn?'var(--gold)':'var(--gray2)'};color:#fff;font-weight:800;font-size:11px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${role}</div>
          ${sig ? `<div style="font-size:10.5px;color:var(--green)"><span class="ico-i ico-check"></span>وقّع: ${orgEsc(sig.signer_name)} — ${new Date(sig.signed_at).toLocaleString('ar-SA-u-ca-gregory')}</div>`
            : isMyTurn ? `<div style="font-size:10.5px;color:var(--gold)"><span class="ico-i ico-dot"></span>بانتظار التوقيع${daysWaiting>2?` — متأخر ${daysWaiting} يوم`:''}</div>`
            : `<div style="font-size:10.5px;color:var(--gray3)">⏳ بانتظار دور المنصب السابق</div>`}
        </div>
        ${isMyTurn ? `<button class="btn-xs gold" onclick="openGovernanceSignModal(${approvalId},'${role.replace(/'/g,"")}')">توقيع</button>` : ""}
      </div>`;
    });
  }

  if(approval.status === "مكتملة"){
    html += `<div style="background:#E8F8EF;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;color:var(--green);font-weight:700"><span class="ico-i ico-check"></span>اكتملت الدورة — كل التوقيعات مجمّعة بالوثيقة النهائية.</div>`;
  }

  body.innerHTML = html;
  openM("m-governance-approval");
}

/* Phase 1 decision (no signature) — one rejection halts the whole cycle immediately.
   Once every ordered role has approved, the cycle auto-advances to "قيد التوقيع" and the
   first signer is notified — signing never starts before approval is unanimous. */
async function castGovernanceApprovalStep(approvalId, role, decision){
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : "";
  if(myRawRole !== role && myRawRole !== "مدير النظام"){
    alert(`هذي الخطوة مخصّصة لمنصب "${role}" — دورك الحالي "${myRawRole||"غير محدد"}" ما يملك صلاحية اعتمادها.`);
    return;
  }
  const { error } = await sb.from("governance_signatures").insert([{
    approval_id: approvalId, role, order_position: -1, phase: "اعتماد", decision,
    signer_name: currentUserProfile?currentUserProfile.full_name:email, signer_email: email, signed_at: new Date().toISOString()
  }]);
  if(error){ alert("تعذّر تسجيل قرارك: " + error.message); return; }

  if(decision === "رفض"){
    await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
    alert("تم تسجيل الرفض — توقفت دورة الاعتماد. ❌");
    openGovernanceApprovalModal(approvalId);
    return;
  }

  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const { data: steps } = await sb.from("governance_signatures").select("*").eq("approval_id", approvalId).eq("phase","اعتماد");
  const allApproved = template.ordered_roles.every(r => (steps||[]).some(s => s.role === r && s.decision === "موافقة"));

  if(allApproved){
    await sb.from("governance_approvals").update({ status: "قيد التوقيع" }).eq("id", approvalId);
    const docLabel = approval.document_type === "matrix" ? "مصفوفة الصلاحيات" : "سياسة";
    await notifyGovernanceSigningTurn(approvalId, approval.document_type, template.ordered_roles[0], docLabel, "توقيع");
    alert("تم اعتماد آخر دور بالتسلسل ✅ — بدأت الآن مرحلة التوقيع الإلكتروني الرسمي.");
  } else {
    const idx = template.ordered_roles.indexOf(role);
    const nextRole = template.ordered_roles[idx+1];
    const docLabel = approval.document_type === "matrix" ? "مصفوفة الصلاحيات" : "سياسة";
    if(nextRole) await notifyGovernanceSigningTurn(approvalId, approval.document_type, nextRole, docLabel, "اعتماد");
    alert("تم تسجيل موافقتك ✅");
  }
  openGovernanceApprovalModal(approvalId);
}

async function castGovernanceVote(approvalId, decision){
  const notes = document.getElementById("ga-vote-notes")?.value.trim() || "";
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const { error } = await sb.from("governance_votes").insert([{
    approval_id: approvalId, voter_email: email, voter_name: currentUserProfile?currentUserProfile.full_name:email, decision, notes
  }]);
  if(error){ alert("تعذّر تسجيل تصويتك: " + error.message); return; }

  if(decision === "رفض"){
    await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
  } else {
    const board = await getBoardApprovers();
    const { data: votes } = await sb.from("governance_votes").select("*").eq("approval_id", approvalId);
    const anyReject = (votes||[]).some(v => v.decision === "رفض");
    if(anyReject){
      await sb.from("governance_approvals").update({ status: "مرفوضة" }).eq("id", approvalId);
    } else if((votes||[]).length >= board.length){
      // Voting cleared — move to sequential signing, seeding an empty ordered row per role.
      const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", approvalId).single();
      const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
      await sb.from("governance_approvals").update({ status: "قيد التوقيع" }).eq("id", approvalId);
      // governance_signatures rows are created lazily at signing time (not pre-seeded), so no
      // insert needed here — openGovernanceApprovalModal derives sequence state from what
      // exists vs. the template's ordered_roles list.
    }
  }
  alert("تم تسجيل تصويتك ✅");
  openGovernanceApprovalModal(approvalId);
  loadMatrixApprovalStatus();
}

let govSigPadCtx = null, govSigPadDrawing = false, currentGovSignApprovalId = null, currentGovSignRole = null;

function openGovernanceSignModal(approvalId, role){
  currentGovSignApprovalId = approvalId; currentGovSignRole = role;
  document.getElementById("gs-info").innerHTML = `<b>توقّع بصفتك:</b> ${role}`;
  openM("m-governance-sign");
  setTimeout(initGovSigPad, 50);
}

function initGovSigPad(){
  const canvas = document.getElementById("govSigCanvas");
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#0D2447"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  govSigPadCtx = ctx;
  const getPos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); govSigPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if(!govSigPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { govSigPadDrawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  applyLockedSignature("govSigCanvas");
}

function clearGovSigPad(){
  if(!govSigPadCtx) return;
  const canvas = document.getElementById("govSigCanvas");
  govSigPadCtx.clearRect(0,0,canvas.width,canvas.height);
}

function isGovSigPadEmpty(){
  const canvas = document.getElementById("govSigCanvas");
  if(!canvas) return true;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3; i<data.length; i+=4){ if(data[i] !== 0) return false; }
  return true;
}

async function confirmGovernanceSignature(){
  if(isGovSigPadEmpty()){ alert("الرجاء رسم التوقيع أولًا"); return; }
  const { data: approval } = await sb.from("governance_approvals").select("*").eq("id", currentGovSignApprovalId).single();
  const { data: template } = await sb.from("signing_workflow_templates").select("*").eq("company_id", currentCompanyId).eq("document_type", approval.document_type).maybeSingle();
  const orderedRoles = template.ordered_roles;
  const orderPos = orderedRoles.indexOf(currentGovSignRole);

  // Re-verify sequence server-side-equivalent (not just trusting the UI state) before writing.
  // Only look at actual SIGNING-phase rows — the ordered اعتماد decisions live in the same
  // table but must never be mistaken for a signature here.
  const { data: existingSigs } = await sb.from("governance_signatures").select("role").eq("approval_id", currentGovSignApprovalId).eq("phase","توقيع");
  const signedRoles = (existingSigs||[]).map(s=>s.role);
  if(orderPos > 0 && !signedRoles.includes(orderedRoles[orderPos-1])){
    alert(`لا يمكنك التوقيع الآن — بانتظار توقيع "${orderedRoles[orderPos-1]}" أولًا.`);
    return;
  }
  if(signedRoles.includes(currentGovSignRole)){ alert("هذا المنصب وقّع مسبقًا"); return; }

  const myMembership = userMemberships.find(m => m.company_id === currentCompanyId);
  const myRawRole = myMembership ? myMembership.role : "";
  if(myRawRole !== currentGovSignRole && myRawRole !== "مدير النظام"){
    alert(`هذا التوقيع مخصّص لمنصب "${currentGovSignRole}" — دورك الحالي "${myRawRole||"غير محدد"}" ما يملك صلاحية توقيعه.`);
    return;
  }

  if(!(await lockFirstSignature("govSigCanvas"))) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData?.user?.email;
  const signature_image = document.getElementById("govSigCanvas").toDataURL("image/png");
  const { error } = await sb.from("governance_signatures").insert([{
    approval_id: currentGovSignApprovalId, role: currentGovSignRole, order_position: orderPos, phase: "توقيع",
    signer_name: currentUserProfile?currentUserProfile.full_name:email, signer_email: email,
    signature_image, signed_at: new Date().toISOString()
  }]);
  if(error){ alert("تعذّر حفظ التوقيع: " + error.message); return; }

  closeM("m-governance-sign");
  alert("⏳ جارِ دمج توقيعك بالوثيقة...");

  // Regenerate the full document with every collected signature embedded at its slot.
  const { data: allSigs } = await sb.from("governance_signatures").select("*").eq("approval_id", currentGovSignApprovalId).eq("phase","توقيع");
  const signaturesMap = {};
  (allSigs||[]).forEach(s => { signaturesMap[s.role] = { name: s.signer_name, image: s.signature_image }; });
  const isMatrix = approval.document_type === "matrix";
  let policyForRegen = null;
  if(!isMatrix){
    policyForRegen = policiesCache.find(p=>p.id===approval.document_ref_id);
    if(!policyForRegen){
      const { data: fetchedPolicy } = await sb.from("policies").select("*").eq("id", approval.document_ref_id).single();
      policyForRegen = fetchedPolicy || {};
    }
  }
  const b = isMatrix
    ? await buildMatrixCanvasPages(signaturesMap, orderedRoles)
    : await buildPolicyCanvasPages(policyForRegen, signaturesMap, orderedRoles);
  const bytes = await b.toPDFBytes();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const newUrl = await uploadBlobToStorage(blob, "governance-approvals", `${isMatrix?'مصفوفة-صلاحيات':'سياسة'}-موقّعة-${Date.now()}.pdf`);

  const allSigned = orderedRoles.every(r => signaturesMap[r]);
  await sb.from("governance_approvals").update({
    document_snapshot_url: newUrl || approval.document_snapshot_url,
    status: allSigned ? "مكتملة" : "قيد التوقيع"
  }).eq("id", currentGovSignApprovalId);

  // Close the loop with the policy record itself: once every position in the chain has
  // signed, the policy is formally "معتمدة نهائيًا" and its actual approval date is set now
  // — not guessed at creation time. Otherwise, nudge whoever's turn is next.
  if(!isMatrix && policyForRegen && policyForRegen.id){
    if(allSigned){
      await sb.from("policies").update({ status: "معتمدة نهائيًا", approval_date: new Date().toISOString().slice(0,10), file_url: newUrl || policyForRegen.file_url }).eq("id", policyForRegen.id);
    } else {
      const nextRole = orderedRoles[orderPos+1];
      if(nextRole) await notifyGovernanceSigningTurn(currentGovSignApprovalId, approval.document_type, nextRole, "سياسة");
    }
  }

  alert(allSigned ? "تم دمج توقيعك — واكتملت دورة الاعتماد بالكامل ✅" : "تم دمج توقيعك ✅ — بانتظار باقي المناصب.");
  openGovernanceApprovalModal(currentGovSignApprovalId);
  loadMatrixApprovalStatus();
}

async function requestBoardApproval(type){
  const isMatrix = type === "matrix";
  const title = isMatrix ? "طلب موافقة على مصفوفة الصلاحيات" : "طلب موافقة على الهيكل التنظيمي";
  if(!await uiConfirm(`سيتم توليد نسخة PDF من ${isMatrix?"مصفوفة الصلاحيات":"الهيكل التنظيمي"} الحالية وإرسال طلب موافقة لـ${getGovernanceMemberLabel()}. متابعة؟`)) return;

  const board = await getBoardApprovers();
  if(board.length === 0){ alert("لا يوجد أعضاء مجلس مسجّلين لديهم حساب بالمنصة — أضفهم أولًا من صفحة إدارة الصلاحيات."); return; }

  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");

  const reqMeta = await orgPdfMeta(type);
  let bodyContent = "";
  if(isMatrix){
    await loadPermissionsMatrix();
    const table = document.getElementById("permMatrixTable");
    if(!table){ alert("تعذّر تحميل مصفوفة الصلاحيات."); return; }
    const clone = permPrintableTable(table);
    clone.querySelectorAll("th,td").forEach(c => { c.style.border = "1px solid #ccc"; c.style.padding = "6px"; c.style.fontSize = "11px"; });
    clone.style.cssText = "width:100%;border-collapse:collapse";
    bodyContent = clone.outerHTML;
  } else {
    const container = document.getElementById("orgTreeContainer");
    if(!container || !container.innerHTML.trim()){ alert("لا توجد شجرة هيكل تنظيمي لتصديرها."); return; }
    const treeRowsForPdf = orgTreeRows(structureCache);
    bodyContent = renderOrgTree(treeRowsForPdf, { static:true });
  }

  const boardListHtml = board.map(b => `<tr>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.full_name||b.email||"")}</td>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.role||"")}${b.is_entity_rep && b.represented_entity ? " — ممثل " + orgEsc(b.represented_entity) : ""}</td>
    <td style="border:1px solid #ccc;padding:6px;width:130px"></td>
  </tr>`).join("");

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;padding:20px;color:#0D2447;background:#fff";
  wrapper.innerHTML = `
    <h1 style="color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px">${orgEsc(title)} — ${orgEsc(reqMeta.companyName)}</h1>
    ${approvalHeaderHTML(Object.assign({}, reqMeta, { approved:false, dateTitle:"تاريخ الطلب", dateLabel:dateNow, approvers:[] }), orgEsc, (reqMeta.count + 1) + ".0 (قيد الاعتماد)")}
    <div style="overflow-x:auto;margin:16px 0">${bodyContent}</div>
    <h3 style="color:#1A3A6B;margin-top:24px">${getGovernanceMemberLabel()} المطلوب موافقتهم</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الاسم</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الصفة</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">التوقيع</th>
      </tr></thead>
      <tbody>${boardListHtml}</tbody>
    </table>`;
  pdfHostAdd(wrapper, 794);
  let pdfBlob;
  try{
    pdfBlob = await html2pdf().from(wrapper).set({ margin: 10, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] } }).outputPdf("blob");
  }catch(e){
    pdfHostRemove(wrapper);
    alert("تعذّر توليد ملف PDF: " + e.message);
    return;
  }
  pdfHostRemove(wrapper);

  const fileUrl = await uploadBlobToStorage(pdfBlob, "approvals", (isMatrix?"permissions-matrix":"org-structure")+".pdf");
  if(!fileUrl) return;

  const fullTitle = title + " — " + companyName + " — " + dateNow;
  const { error } = await sb.from("approval_requests").insert([{
    company_id: currentCompanyId, request_type: type, title: fullTitle,
    requested_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", pdf_url: fileUrl
  }]);
  if(error){ alert("تعذّر إنشاء طلب الموافقة: " + error.message); return; }

  logActivity("إنشاء", "طلب موافقة", fullTitle, `أُرسل لـ${board.length} عضو مجلس`);
  alert("تم إرسال طلب الموافقة لـ" + getGovernanceMemberLabel() + " ✅");
  renderApprovalStatus(type, isMatrix ? "matrixApprovalStatus" : "structureApprovalStatus");
  checkPendingApprovalBadges();
}

async function requestCharterApproval(){
  const committeeId = Number(document.getElementById("mch-committee-id").value);
  const c = committeesCache.find(x => x.id === committeeId);
  if(!c){ alert("تعذّر تحديد اللجنة"); return; }
  if(!c.charter_purpose && !c.charter_authorities && !c.charter_composition){
    if(!await uiConfirm("لم تحفظ الميثاق بعد — هل تريد المتابعة بطلب الموافقة على آخر نسخة محفوظة على أي حال؟")) return;
  }
  if(!await uiConfirm(`سيتم توليد نسخة PDF من ميثاق "${c.committee_name}" وإرسال طلب موافقة لـ${getGovernanceMemberLabel()}. متابعة؟`)) return;

  const board = await getBoardApprovers();
  if(board.length === 0){ alert("لا يوجد أعضاء مجلس مسجّلين لديهم حساب بالمنصة."); return; }

  const companyName = document.getElementById("reportCompanyName1")?.textContent || (document.getElementById("companySwitcher")?.selectedOptions[0]?.textContent) || "";
  const dateNow = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
  const title = `طلب موافقة على ميثاق لجنة ${c.committee_name}`;

  const boardListHtml = board.map(b => `<tr>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.full_name||b.email||"")}</td>
    <td style="border:1px solid #ccc;padding:6px">${orgEsc(b.role||"")}${b.is_entity_rep && b.represented_entity ? " — ممثل " + orgEsc(b.represented_entity) : ""}</td>
    <td style="border:1px solid #ccc;padding:6px;width:130px"></td>
  </tr>`).join("");

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "direction:rtl;text-align:right;font-family:Tajawal,Arial,sans-serif;padding:20px;color:#0D2447;background:#fff";
  wrapper.innerHTML = `
    <h1 style="color:#1A3A6B;font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:10px">${orgEsc(title)} — ${orgEsc(companyName)}</h1>
    <p><b>تاريخ الطلب:</b> ${dateNow}</p>
    <h3 style="color:#1A3A6B;margin-top:20px">الغرض والهدف من اللجنة</h3><p>${orgEsc(c.charter_purpose||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">الاختصاصات والصلاحيات</h3><p>${orgEsc(c.charter_authorities||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">التشكيل وعضوية اللجنة</h3><p>${orgEsc(c.charter_composition||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">تنظيم الاجتماعات</h3><p>${orgEsc(c.charter_meetings_rules||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:16px">آلية رفع التقارير لمجلس الإدارة</h3><p>${orgEsc(c.charter_reporting||"—").replace(/\n/g,"<br>")}</p>
    <h3 style="color:#1A3A6B;margin-top:24px">${getGovernanceMemberLabel()} المطلوب موافقتهم</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الاسم</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">الصفة</th>
        <th style="border:1px solid #ccc;padding:6px;background:#1A3A6B;color:#fff">التوقيع</th>
      </tr></thead>
      <tbody>${boardListHtml}</tbody>
    </table>`;
  pdfHostAdd(wrapper, 794);
  let pdfBlob;
  try{
    pdfBlob = await html2pdf().from(wrapper).set({ margin: 10, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollX: 0, scrollY: 0 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] } }).outputPdf("blob");
  }catch(e){
    pdfHostRemove(wrapper);
    alert("تعذّر توليد ملف PDF: " + e.message);
    return;
  }
  pdfHostRemove(wrapper);

  const fileUrl = await uploadBlobToStorage(pdfBlob, "approvals", "committee-charter.pdf");
  if(!fileUrl) return;

  const fullTitle = title + " — " + companyName + " — " + dateNow;
  const { error } = await sb.from("approval_requests").insert([{
    company_id: currentCompanyId, request_type: "charter", committee_id: committeeId, title: fullTitle,
    requested_by: currentUserProfile ? (currentUserProfile.full_name||currentUserProfile.email) : "", pdf_url: fileUrl
  }]);
  if(error){ alert("تعذّر إنشاء طلب الموافقة: " + error.message); return; }

  logActivity("إنشاء", "طلب موافقة", fullTitle, `أُرسل لـ${board.length} عضو مجلس`);
  alert("تم إرسال طلب الموافقة لـ" + getGovernanceMemberLabel() + " ✅");
  renderCharterApprovalStatus(committeeId);
  loadCommittees();
}

async function renderCharterApprovalStatus(committeeId){
  const box = document.getElementById("charterApprovalStatus");
  if(!box) return;
  const { data: reqs } = await sb.from("approval_requests").select("*").eq("company_id", currentCompanyId).eq("request_type", "charter").eq("committee_id", committeeId).order("created_at",{ascending:false}).limit(1);
  if(!reqs || reqs.length === 0){ box.innerHTML = ""; return; }
  const req = reqs[0];
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", req.id);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const totalBoard = board.length;
  const votedCount = board.filter(b => votedEmails.has((b.email||"").toLowerCase())).length;

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  const iAlreadyVoted = votedEmails.has((myEmail||"").toLowerCase());
  const amIBoardMember = board.some(b => (b.email||"").toLowerCase() === (myEmail||"").toLowerCase());

  if(req.status === "معتمد"){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:8px;padding:10px;font-size:11.5px"><span class="ico-i ico-check"></span>تمت موافقة ${getGovernanceBodyLabel()} على هذا الميثاق بتاريخ ${req.approved_at?new Date(req.approved_at).toLocaleDateString('ar-SA-u-ca-gregory'):"—"} — انتقل تلقائيًا للتوقيع الإلكتروني.</div>`;
    return;
  }
  box.innerHTML = `<div style="background:#FEF3E2;border-radius:8px;padding:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:6px">
      <b style="color:#8B6F1F">⏳ بانتظار موافقة ${getGovernanceBodyLabel()} (${votedCount}/${totalBoard})</b>
      <button class="btn-xs" style="background:#E8F0FA;color:var(--primary);border:none;border-radius:6px;padding:3px 8px;font-size:10.5px;cursor:pointer" onclick="sendApprovalReminder(${req.id})"><span class="ico-i ico-warning"></span>تذكير</button>
    </div>
    ${amIBoardMember && !iAlreadyVoted ? `<button class="btn btn-gold" style="width:100%;font-size:11px;padding:6px" onclick="castApprovalVote(${req.id})"><span class="ico-i ico-check"></span>الموافقة على هذا الميثاق</button>` : ""}
    ${amIBoardMember && iAlreadyVoted ? `<div style="text-align:center;color:var(--green);font-size:11px"><span class="ico-i ico-check"></span>لقد وافقت بالفعل</div>` : ""}
  </div>`;
}

function refreshApprovalButtonLabels(){
  const label = "اعتماد " + getGovernanceBodyLabel();
  ["approvalBtnStructure","approvalBtnMatrix","approvalBtnCharter"].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) btn.innerHTML = `<span class="ico-i ico-upload"></span>${label}`;
  });
}

async function checkPendingApprovalBadges(){
  refreshApprovalButtonLabels();
  if(!currentCompanyId) return;
  const { data: pending } = await sb.from("approval_requests").select("request_type").eq("company_id", currentCompanyId).eq("status", "قيد المراجعة");
  const counts = { structure: 0, matrix: 0 };
  (pending||[]).forEach(r => { if(counts[r.request_type] !== undefined) counts[r.request_type]++; });

  const structBadge = document.getElementById("structureNavBadge");
  if(structBadge){ structBadge.style.display = counts.structure > 0 ? "inline-block" : "none"; structBadge.textContent = counts.structure; }
  const permBadge = document.getElementById("permissionsNavBadge");
  if(permBadge){ permBadge.style.display = counts.matrix > 0 ? "inline-block" : "none"; permBadge.textContent = counts.matrix; }
}

async function renderApprovalStatus(type, containerId){
  const box = document.getElementById(containerId);
  if(!box) return;
  const { data: reqs } = await sb.from("approval_requests").select("*").eq("company_id", currentCompanyId).eq("request_type", type).order("created_at",{ascending:false}).limit(1);
  if(!reqs || reqs.length === 0){ box.innerHTML = ""; return; }
  const req = reqs[0];
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", req.id);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const totalBoard = board.length;
  const votedCount = board.filter(b => votedEmails.has((b.email||"").toLowerCase())).length;

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  const iAlreadyVoted = votedEmails.has((myEmail||"").toLowerCase());
  const amIBoardMember = board.some(b => (b.email||"").toLowerCase() === (myEmail||"").toLowerCase());

  if(req.status === "معتمد"){
    box.innerHTML = `<div style="background:#E8F8EF;border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="font-size:12.5px"><b style="color:var(--green)"><span class="ico-i ico-check"></span>تمت موافقة ${getGovernanceBodyLabel()}</b> بتاريخ ${req.approved_at?new Date(req.approved_at).toLocaleDateString('ar-SA-u-ca-gregory'):"—"} — انتقل الملف تلقائيًا لصفحة التوقيع الإلكتروني.</div>
      <a href="${req.pdf_url}" target="_blank" class="btn-xs primary" style="text-decoration:none"><span class="ico-i ico-document"></span>عرض الملف</a>
    </div>`;
    return;
  }

  box.innerHTML = `<div style="background:#FEF3E2;border-radius:10px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <b style="color:#8B6F1F;font-size:12.5px">⏳ بانتظار موافقة ${getGovernanceBodyLabel()} (${votedCount}/${totalBoard})</b>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F0FA;color:var(--primary);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" onclick="sendApprovalReminder(${req.id})"><span class="ico-i ico-warning"></span>تذكير</button>
        <a href="${req.pdf_url}" target="_blank" class="btn-xs primary" style="text-decoration:none"><span class="ico-i ico-document"></span>عرض الملف</a>
      </div>
    </div>
    ${amIBoardMember && !iAlreadyVoted ? `<button class="btn btn-gold" style="width:100%" onclick="castApprovalVote(${req.id})"><span class="ico-i ico-check"></span>الموافقة على هذا الطلب</button>` : ""}
    ${amIBoardMember && iAlreadyVoted ? `<div style="text-align:center;color:var(--green);font-size:12px"><span class="ico-i ico-check"></span>لقد وافقت بالفعل — بانتظار بقية الأعضاء</div>` : ""}
  </div>`;
}

async function sendApprovalReminder(requestId){
  const { data: req } = await sb.from("approval_requests").select("*").eq("id", requestId).single();
  if(!req){ alert("تعذّر تحديد الطلب"); return; }
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", requestId);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const pending = board.filter(b => b.email && !votedEmails.has(b.email.toLowerCase()));
  if(pending.length === 0){ alert("كل الأعضاء وافقوا بالفعل ✅"); return; }

  const subject = `تذكير موافقة: ${req.title}`;
  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B"><span class="ico-i ico-upload"></span>تذكير بطلب موافقة معلّق</h2>
      <p><b>الطلب:</b> ${orgEsc(req.title)}</p>
      <p>الرجاء الدخول للمنصة ومراجعة الطلب والموافقة عليه.</p>
      <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
    </div>`;
  await sendBulkEmails(pending.map(t => ({ email: t.email })), subject, html, "تذكير موافقة");
  logActivity("إنشاء", "تذكير موافقة", req.title, `أُرسل لـ${pending.length} عضو لم يوافقوا بعد`);

  const text = `📤 *تذكير بطلب موافقة معلّق*\n\n*${req.title}*\n\nالرجاء الدخول للمنصة ومراجعته والموافقة عليه.\n\n— منصة حوكم`;
  openWhatsAppShareModal(text, pending.map(t => t.email));
}

async function castApprovalVote(requestId){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : "";
  if(!myEmail) return;
  const { error } = await sb.from("approval_votes").insert([{
    request_id: requestId, reviewer_email: myEmail,
    reviewer_name: currentUserProfile ? currentUserProfile.full_name : myEmail, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر تسجيل موافقتك: " + error.message); return; }

  const { data: req } = await sb.from("approval_requests").select("*").eq("id", requestId).single();
  const board = await getBoardApprovers();
  const { data: votes } = await sb.from("approval_votes").select("reviewer_email").eq("request_id", requestId);
  const votedEmails = new Set((votes||[]).map(v => (v.reviewer_email||"").toLowerCase()));
  const allVoted = board.length > 0 && board.every(b => votedEmails.has((b.email||"").toLowerCase()));

  if(allVoted && req.status !== "معتمد"){
    await sb.from("approval_requests").update({ status: "معتمد", approved_at: new Date().toISOString() }).eq("id", requestId);
    const docTypeLabel = req.request_type === "matrix" ? "موافقة مجلس — مصفوفة صلاحيات"
      : req.request_type === "structure" ? "موافقة مجلس — هيكل تنظيمي"
      : "موافقة مجلس — ميثاق لجنة";
    await sb.from("signing_documents").insert([{
      document_name: req.title, doc_type: docTypeLabel,
      signers_total: board.length, signers_done: 0, status: "قيد التوقيع", file_url: req.pdf_url, company_id: currentCompanyId
    }]);
    logActivity("موافقة", "طلب موافقة", req.title, "اكتملت موافقة " + getGovernanceBodyLabel() + " — انتقل تلقائيًا للتوقيع الإلكتروني");
    alert("🎉 اكتملت موافقة جميع " + getGovernanceMemberLabel() + " ! تم نقل الملف تلقائيًا لصفحة التوقيع الإلكتروني.");
  } else {
    alert("تم تسجيل موافقتك ✅");
  }
  if(req.request_type === "charter") renderCharterApprovalStatus(req.committee_id);
  else renderApprovalStatus(req.request_type, req.request_type === "matrix" ? "matrixApprovalStatus" : "structureApprovalStatus");
  checkPendingApprovalBadges();
}

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

