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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizeSaudiPhone(phone), templateName, params })
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || "فشل الإرسال"); }
    return { success: true, data };
  }catch(e){
    return { success: false, error: e.message };
  }
}

async function sendNotificationEmail(to, subject, html){
  try{
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/* ══════════ PDF IMPORT (best-effort extraction, always reviewed before commit) ══════════ */
let pdfImportRowsData = [];

function openPdfImportModal(){
  document.getElementById("pdfImportFile").value = "";
  document.getElementById("pdfImportStep1").style.display = "block";
  document.getElementById("pdfImportStep2").style.display = "none";
  document.getElementById("pdfImportLoading").style.display = "none";
  document.getElementById("pdfImportConfirmBtn").style.display = "none";
  pdfImportRowsData = [];
  openM("m-pdf-import");
}

async function handlePdfFileSelect(input){
  if(!input.files || !input.files[0]) return;
  document.getElementById("pdfImportLoading").style.display = "block";
  try{
    const arrayBuffer = await input.files[0].arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for(let p = 1; p <= pdf.numPages; p++){
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = {};
      content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if(!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      const sortedY = Object.keys(lines).map(Number).sort((a,b)=>b-a);
      sortedY.forEach(y => { fullText += lines[y].join(" ") + "\n"; });
    }
    pdfImportRowsData = parsePdfTextToRows(fullText);
    renderPdfImportRows();
    document.getElementById("pdfImportStep1").style.display = "none";
    document.getElementById("pdfImportStep2").style.display = "block";
    document.getElementById("pdfImportConfirmBtn").style.display = "inline-block";
  }catch(e){
    alert("تعذّرت قراءة الملف: " + e.message + " — تأكد أنه ملف PDF سليم، أو أضف الصفوف يدويًا.");
    document.getElementById("pdfImportStep2").style.display = "block";
    document.getElementById("pdfImportConfirmBtn").style.display = "inline-block";
  }
  document.getElementById("pdfImportLoading").style.display = "none";
}

/* Heuristic only: looks for a long digit sequence (ID/CR number, 8-10 digits) and a shorter
   trailing number (shares count) on each line; everything before the ID becomes the name.
   Lines that don't match a recognizable pattern are skipped — the person reviews the result
   and adds/fixes rows manually before anything is written to the database. */
/* Targets the registry's real column layout:
   مسلسل | الاسم | الجنسية | محل الإقامة | المهنة | رقم الشهادة | عدد الأسهم | القيمة المدفوعة | تاريخ انتقال الملكية
   Reliably peeling a trailing date, then two numbers, then a certificate number from the END
   of each line is much sturdier than guessing at the free-text columns (name/nationality/
   residence/profession), which are left for the person to fill in during review instead of
   risking a wrong automatic split. */
function toEnglishDigits(s){
  if(!s) return "";
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
  return s.replace(/[٠-٩]/g, d => map[d]);
}
function stripCommas(s){ return toEnglishDigits(s).replace(/[,٬]/g,""); }

const SHAREHOLDER_ROLE_WORDS = /مساهم|رئيس مجلس الإدارة|رئيس مجلس|نائب رئيس مجلس|عضو مجلس الإدارة|عضو مجلس|موظف|متقاعد|طالب|أعمال حرة|ربة منزل|عسكري|طبيب|مهندس/;
const COUNTRY_WORDS = /المملكة|السعودية|العربية|الإمارات|الكويت|قطر|البحرين|مصر|الأردن/;

/* Two extraction strategies, tried in order:
   1) Tab-based — if the copied/extracted text still has tab characters between cells (common
      when copying directly from a PDF viewer), each shareholder record ends at a line that is
      just a serial number; everything since the previous boundary is flattened and split on
      tabs/newlines to get ordered cell values, mapped from the END backward (name, then a
      residence pair, then a nationality pair, then whatever role/profession word is present,
      then certificate number, shares count, paid value) since the tail of each record is the
      most reliable, unambiguous part.
   2) Anchor/heuristic fallback — no tabs available (typical for this app's own in-browser PDF.js
      extraction): anchor on a recognizable role word, then reconstruct name/nationality/residence
      from the following lines. Both paths always leave ambiguous fields (certificate number,
      hijri date) blank rather than guessing wrong — always meant to be reviewed before import. */
function parsePdfTextToRows(text){
  if(text.includes("\t")) return parseTabbedPdfRows(text);
  return parseAnchorBasedPdfRows(text);
}

function parseTabbedPdfRows(text){
  const rows = [];
  const rawLines = text.split("\n");
  let blockStart = 0;
  const isSerialLine = l => !l.includes("\t") && /^[\d٠-٩]+$/.test(l.trim());

  for(let i = 0; i < rawLines.length; i++){
    if(!isSerialLine(rawLines[i])) continue;
    const block = rawLines.slice(blockStart, i).join(" ");
    blockStart = i + 1;
    const tokens = block.split(/[\t\n]+/).map(t => t.trim()).filter(Boolean);
    if(tokens.length === 0) continue;

    let rest = tokens.slice();
    const name = (rest.pop() || "").replace(/\s+/g," ").trim();
    let place_of_residence = "";
    if(rest.length >= 1 && COUNTRY_WORDS.test(rest[rest.length-1])){
      place_of_residence = rest.pop().replace(/\s+/g," ").trim();
    }
    let nationality = "";
    if(rest.length >= 1 && COUNTRY_WORDS.test(rest[rest.length-1])){
      nationality = rest.pop().replace(/\s+/g," ").trim();
    }
    let profession = "";
    if(rest.length >= 1 && SHAREHOLDER_ROLE_WORDS.test(rest[rest.length-1])){
      profession = rest.pop();
    }
    const certificate_number = rest.length ? stripCommas(rest.pop()) : "";
    const shares_count = rest.length ? stripCommas(rest.pop()) : "";
    const paid_value = rest.length ? stripCommas(rest.pop()) : "";

    if(!name && !shares_count) continue;
    rows.push({ name, nationality, place_of_residence, profession, certificate_number, shares_count, paid_value, ownership_transfer_date: "" });
  }
  return rows;
}

function parseAnchorBasedPdfRows(text){
  const rows = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const anchorIdx = [];
  lines.forEach((line, i) => { if(SHAREHOLDER_ROLE_WORDS.test(line) && /[\d٠-٩]/.test(line)) anchorIdx.push(i); });

  anchorIdx.forEach((idx, k) => {
    const dataLine = lines[idx];
    const blockEnd = anchorIdx[k+1] !== undefined ? anchorIdx[k+1] : lines.length;
    const block = lines.slice(idx+1, blockEnd);

    const profMatch = dataLine.match(SHAREHOLDER_ROLE_WORDS);
    const profession = profMatch ? profMatch[0] : "";

    const allNums = dataLine.match(/[\d٠-٩]+(?:[,٬][\d٠-٩]+)*/g) || [];
    const paidToken = allNums.find(n => /[,٬]/.test(n)) || "";
    const remaining = allNums.filter(n => n !== paidToken);
    // Remaining bare numbers (excluding the paid value) are typically: hijri year fragment,
    // day/month fragments, shares count, certificate number — sorted longest-first tends to
    // put the shares count (usually 4-5 digits) ahead of the shorter fragments.
    const sorted = [...remaining].sort((a,b)=>stripCommas(b).length - stripCommas(a).length);
    const shares_count = sorted[0] ? stripCommas(sorted[0]) : "";
    // Certificate number and the hijri date fragments are all short 1-2 digit tokens once the
    // date gets scrambled by RTL extraction — too ambiguous to guess reliably, so they're left
    // blank here rather than risk assigning the wrong number. Fill them in during review.

    const countryLines = block.filter(l => COUNTRY_WORDS.test(l));
    const nameLines = block.filter(l =>
      !COUNTRY_WORDS.test(l) &&
      !SHAREHOLDER_ROLE_WORDS.test(l) &&
      !/^[\d٠-٩\s\/\-هـ]+$/.test(l)
    );
    const name = nameLines.join(" ").replace(/^[\d٠-٩]+\s*/, "").replace(/\s*[\d٠-٩]+$/, "").trim();
    const nationality = countryLines.slice(0,2).join(" ").trim();
    const place_of_residence = countryLines.slice(2,4).join(" ").trim() || nationality;

    if(!name && !shares_count) return;
    rows.push({
      name, nationality, place_of_residence, profession,
      certificate_number: "", shares_count,
      paid_value: stripCommas(paidToken), ownership_transfer_date: ""
    });
  });
  return rows;
}

function renderPdfImportRows(){
  const box = document.getElementById("pdfImportRows");
  if(pdfImportRowsData.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">ما قدرنا نتعرف على صفوف تلقائيًا — أضف الصفوف يدويًا بالزر تحت.</div>';
    return;
  }
  const fields = ["name","nationality","place_of_residence","profession","certificate_number","shares_count","paid_value","ownership_transfer_date"];
  box.innerHTML = pdfImportRowsData.map((r, i) => `
    <div style="display:grid;grid-template-columns:repeat(8,1fr) 0.35fr;gap:5px;margin-bottom:6px;align-items:center">
      ${fields.map(f => `<input class="fi" style="margin:0;padding:6px 6px;font-size:10.5px" value="${(r[f]||"").toString().replace(/"/g,'&quot;')}" oninput="pdfImportRowsData[${i}].${f}=this.value">`).join("")}
      <button style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:6px;font-size:11px;cursor:pointer" onclick="removeImportRow(${i})"><span class="ico ico-xcircle" style="width:16px;height:16px"></span></button>
    </div>`).join("");
}

function addImportRow(){
  pdfImportRowsData.push({ name:"", nationality:"", place_of_residence:"", profession:"", certificate_number:"", shares_count:"", paid_value:"", ownership_transfer_date:"" });
  renderPdfImportRows();
}
function removeImportRow(i){
  pdfImportRowsData.splice(i,1);
  renderPdfImportRows();
}

async function confirmPdfImport(){
  const validRows = pdfImportRowsData.filter(r => r.name && r.name.trim());
  if(validRows.length===0){ alert("لا توجد صفوف صالحة للاستيراد"); return; }
  if(!await uiConfirm(`سيتم إضافة ${validRows.length} مساهم جديد لسجل المساهمين. متابعة؟`)) return;
  const payload = validRows.map(r => ({
    name: r.name.trim(),
    nationality: (r.nationality||"").trim(),
    place_of_residence: (r.place_of_residence||"").trim(),
    profession: (r.profession||"").trim(),
    certificate_number: (r.certificate_number||"").trim(),
    shares_count: Number(r.shares_count) || 0,
    paid_value: r.paid_value ? Number(r.paid_value) : null,
    ownership_transfer_date: r.ownership_transfer_date ? normalizeImportedDate(r.ownership_transfer_date) : null,
    company_id: currentCompanyId
  }));
  const { error } = await sb.from("shareholders").insert(payload);
  if(error){ alert("تعذّر الاستيراد: " + error.message); return; }
  logActivity("إنشاء", "استيراد مساهمين", `${validRows.length} مساهم`, "استيراد من PDF");
  alert(`تم استيراد ${validRows.length} مساهم بنجاح ✅`);
  closeM("m-pdf-import");
  loadShareholders();
}

/* Accepts common day/month/year variants (with / or -) and normalizes to YYYY-MM-DD for the
   date input; if the format can't be confidently parsed, returns null rather than guessing. */
function normalizeImportedDate(raw){
  const m = raw.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if(!m) return null;
  let [, a, b, c] = m;
  if(a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`;
  if(c.length === 4) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
  return null;
}

async function generateBaseStructure(){
  const { data: company } = await sb.from("companies").select("company_type,llc_single_manager,llc_single_owner").eq("id", currentCompanyId).single();
  const type = company ? company.company_type : "مساهمة غير مدرجة";
  const isLLCSingleOwner = type === "ذات مسؤولية محدودة" && !!company?.llc_single_owner;

  let rows = [];
  if(type === "مؤسسة فردية"){
    if(!await uiConfirm('سيُضاف: المالك ← المدير العام ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير العام / التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير العام / التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(isLLCSingleOwner){
    // A single-person LLC has no partners' assembly and no council of managers to route through
    // — it's structurally the same shape as a sole proprietorship (owner, then CEO, then
    // departments), just under a different legal form.
    if(!await uiConfirm('سيُضاف: المالك ← المدير التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "المالك", parent_position: "", level: 1, is_body: false, is_leadership: true },
      { position_title: "المدير التنفيذي", parent_position: "المالك", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "المدير التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else if(type === "ذات مسؤولية محدودة"){
    if(!await uiConfirm('سيُضاف: جمعية الشركاء ← مجلس المديرين ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "جمعية الشركاء", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس المديرين", parent_position: "جمعية الشركاء", level: 2, is_body: true },
      { position_title: "الرئيس التنفيذي", parent_position: "مجلس المديرين", level: 4, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات والتسويق", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  } else {
    // مساهمة مدرجة / مساهمة غير مدرجة (default)
    if(!await uiConfirm('سيُضاف: الجمعية العامة ← مجلس الإدارة ← الرئيس التنفيذي ← الإدارات الرئيسية. تقدر تعدّله بعدها. متابعة؟')) return;
    rows = [
      { position_title: "الجمعية العامة", parent_position: "", level: 1, is_body: true },
      { position_title: "مجلس الإدارة", parent_position: "الجمعية العامة", level: 2, is_body: true },
      // Insertion order matters here: in this RTL layout the first child of "مجلس الإدارة"
      // renders on the right, the last on the left — so اللجان المنبثقة (right), رئيس مجلس
      // الإدارة (center, with الرئيس التنفيذي nested directly beneath it — giving the
      // "stacked in one line" look requested), then أمين سر المجلس (left).
      { position_title: "اللجان المنبثقة", parent_position: "مجلس الإدارة", level: 2, is_body: true },
      { position_title: "رئيس مجلس الإدارة", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الرئيس التنفيذي", parent_position: "رئيس مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "أمين سر المجلس", parent_position: "مجلس الإدارة", level: 2, is_body: false, is_leadership: true },
      { position_title: "الإدارة المالية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة الموارد البشرية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التشغيل", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة المبيعات", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "إدارة التسويق وخدمة العملاء", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true },
      { position_title: "الإدارة القانونية", parent_position: "الرئيس التنفيذي", level: 6, is_body: false, is_leadership: true }
    ];
  }

  // Replace-by-name: remove any existing position/body with the exact same title first, so
  // regenerating doesn't create duplicates or leave a mis-wired older copy behind — while
  // any custom positions the company added themselves (different titles) stay untouched.
  const titles = rows.map(r => r.position_title);
  await sb.from("org_structure").delete().eq("company_id", currentCompanyId).in("position_title", titles);

  const payload = rows.map(r => ({ ...r, company_id: currentCompanyId }));
  const { error } = await sb.from("org_structure").insert(payload);
  if(error){ alert("تعذّر إنشاء الهيكل: " + error.message); return; }
  alert("تم إنشاء الهيكل ✅ — أضف بقية المناصب وتأكد كل واحد يتبع للجهة الصحيحة.");
  loadStructure();
}

async function deletePosition(id){
  if(!await uiConfirm("حذف هذا المنصب سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  loadStructure();
}

/* Build a real parent → child tree from parent_position text-matching, and render it as
   a classic top-down org chart: the CEO/root at the top, each generation of subordinates
   in its own centered row below, connected with simple vertical lines — not a stacked list. */
function renderOrgTree(rows, opts){
  opts = opts || {};
  const isStatic = !!opts.static, expandAll = !!opts.expandAll;
  const byTitle = {};
  rows.forEach(r => { if(r.position_title) byTitle[r.position_title] = r; });
  const hasKids = {};
  rows.forEach(r => { if(r.parent_position && byTitle[r.parent_position]) hasKids[r.parent_position] = true; });
  const childrenOf = {}, sideOf = {}, roots = [];
  rows.forEach(r => {
    const p = r.parent_position && byTitle[r.parent_position] ? r.parent_position : null;
    if(p){
      if(orgIsSideRaw(r) && !hasKids[r.position_title]){ (sideOf[p] = sideOf[p] || []).push(r); }
      else { (childrenOf[p] = childrenOf[p] || []).push(r); }
    } else {
      roots.push(r);
    }
  });
  const byLevel = (a,b) => (a.level ?? 99) - (b.level ?? 99) || a.id - b.id;
  roots.sort(byLevel);
  Object.keys(childrenOf).forEach(k => childrenOf[k].sort(byLevel));
  Object.keys(sideOf).forEach(k => sideOf[k].sort(byLevel));

  const hangWidth = d => Math.max(110, 170 - 20 * d);
  const estH = n => (!n.is_body && n.holder_name) ? 52 : 34;

  // w = fixed width (departments and everything below them); null = natural width (governance / management levels)
  function box(s, depth, hiddenCount, isOpen, w){
    const small = depth > 0;
    const pad = small ? "7px 14px" : "9px 20px";
    const fs = small ? "11px" : "13px";
    const ring = s.is_body ? "box-shadow:inset 0 0 0 2px rgba(255,255,255,.55);" : "";
    const icon = s.is_body ? '<span class="ico ico-columns" style="width:14px;height:14px;vertical-align:-2px;margin-inline-end:5px"></span>' : "";
    const holder = (!s.is_body && s.holder_name) ? `<div style="font-size:${small ? "10px" : "11px"};font-weight:600;opacity:.92;margin-top:2px;${w ? "" : "white-space:nowrap"}">${orgEsc(s.holder_name)}</div>` : "";
    let chip = "";
    if(hiddenCount > 0 || isOpen){
      if(isStatic){ chip = hiddenCount > 0 ? `<div style="font-size:10px;font-weight:700;opacity:.9;margin-top:3px">+${hiddenCount}</div>` : ""; }
      else { chip = `<span onclick="event.stopPropagation();toggleOrgNode(${s.id})" title="${isOpen ? "طي" : "عرض الأقسام والوحدات التابعة"}" style="cursor:pointer;display:inline-block;margin-top:4px;background:rgba(255,255,255,.25);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${isOpen ? "−" : "+" + hiddenCount}</span>`; }
    }
    const click = isStatic ? "" : `onclick="editStructure(${s.id})" title="اضغط للتعديل أو الحذف" `;
    const sizing = w ? `width:${w}px;box-sizing:border-box;` : `min-width:${small ? 120 : 130}px;`;
    return `<div ${click}style="${isStatic ? "" : "cursor:pointer;"}display:inline-block;background:${orgLevelColor(s.level)};color:#fff;border-radius:6px;padding:${pad};font-size:${fs};font-weight:800;${sizing}text-align:center;${ring}"><div style="${w ? "word-break:break-word" : "white-space:nowrap"}">${icon}${orgEsc(s.position_title)}</div>${holder}${chip}</div>`;
  }

  // Which sub-positions are shown for a node, honouring the fold state (default: sections and units start folded).
  function visibleKids(s){
    const all = childrenOf[s.position_title] || [];
    const collapsible = all.filter(k => (k.level ?? 0) >= ORG_COLLAPSE_FROM_LEVEL);
    const ov = (isStatic || expandAll) ? undefined : orgOverride.get(s.id);
    let kids;
    if(expandAll) kids = all;
    else if(ov === true) kids = [];
    else if(ov === false) kids = all;
    else kids = collapsible.length ? all.filter(k => (k.level ?? 0) < ORG_COLLAPSE_FROM_LEVEL) : all;
    const hidden = all.length - kids.length;
    orgNodeCollapsed[s.id] = hidden > 0;
    return { kids, hidden, isOpen: !isStatic && !expandAll && all.length > 0 && hidden === 0 };
  }

  // Everything below a department hangs vertically: one list under the parent, each level indented 20px,
  // with a spine and a tick per item (like a folder tree). Departments themselves stay in one horizontal row.
  function hangList(kids, pd, extraTop){
    return `<div style="width:${hangWidth(pd)}px;margin-top:${8 + (extraTop || 0)}px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">${kids.map((k, i) => hangChild(k, pd + 1, i === kids.length - 1)).join("")}</div>`;
  }
  function hangChild(k, d, isLast){
    const w = hangWidth(d);
    const vk = visibleKids(k);
    const sub = vk.kids.concat(sideOf[k.position_title] || []);
    const tickY = Math.round(estH(k) / 2);
    const spine = `<span style="position:absolute;right:-11px;top:-8px;width:2px;background:var(--gray2);height:${isLast ? (8 + tickY) + "px" : "calc(100% + 8px)"}"></span>`;
    const tick = `<span style="position:absolute;right:-10px;top:${tickY}px;width:10px;border-top:2px solid var(--gray2)"></span>`;
    return `<div style="position:relative;width:${w}px;margin-right:20px">${spine}${tick}${box(k, 1, vk.hidden, vk.isOpen, w)}${sub.length ? hangList(sub, d) : ""}</div>`;
  }

  // Real org-chart connectors for the upper levels: a stem drops from the parent to a horizontal bus line
  // spanning exactly the width of its children, then a stem drops from that bus to each child
  // (the standard CSS "family tree" trick: half-border on first/last child).
  function renderNode(s, depth){
    const allKids = childrenOf[s.position_title] || [];
    // A node hangs its children vertically when it is a department (level 6+), or when everything under it is a section / unit (level 7+) — even if the department itself was saved at level 4 or 5.
    const hangRoot = (s.level ?? 0) >= 6 || (allKids.length > 0 && allKids.every(k => (k.level ?? 0) >= 7));
    const vk = visibleKids(s);
    const kids = vk.kids;
    const sides = sideOf[s.position_title] || [];
    let html = `<div style="display:flex;flex-direction:column;align-items:center">`;
    let head = box(s, depth, vk.hidden, vk.isOpen, hangRoot ? hangWidth(0) : null);
    if(sides.length){
      head = `<div style="padding:0 ${ORG_SIDE_WIDTH}px"><div style="position:relative;display:inline-block">${head}<div style="position:absolute;right:100%;top:0;display:flex;flex-direction:column;gap:6px">${sides.map(k => `<div style="display:flex;align-items:center;direction:rtl"><span style="display:block;width:26px;border-top:2px dashed #7A8794"></span>${box(k, Math.max(depth,1), 0, false, null)}</div>`).join("")}</div></div></div>`;
    }
    html += head;
    // Several side units stack downwards; lengthen the space below so they never touch the connector bus.
    const sideExtra = sides.length ? Math.max(0, sides.reduce((a, k) => a + estH(k), 0) + (sides.length - 1) * 6 - estH(s)) : 0;
    if(kids.length && hangRoot){
      html += hangList(kids, 0, sideExtra);
    } else if(kids.length){
      html += `<div style="width:2px;height:${18 + sideExtra}px;background:var(--gray2)"></div>`;
      html += `<div style="display:flex;flex-direction:row;align-items:flex-start">`;
      kids.forEach((k, i) => {
        const isFirst = i === 0, isLast = i === kids.length-1, isOnly = kids.length === 1;
        // The page is RTL, so the first markup half renders on the right and the second on the left.
        // A child only draws the half reaching toward a sibling that actually exists on that side.
        const rightHalf = (isOnly || isFirst) ? "transparent" : "var(--gray2)";
        const leftHalf = (isOnly || isLast) ? "transparent" : "var(--gray2)";
        html += `<div style="flex:1;padding:0 16px;position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="position:absolute;top:0;right:0;left:0;height:2px;display:flex">
            <div style="flex:1;background:${rightHalf}"></div>
            <div style="flex:1;background:${leftHalf}"></div>
          </div>
          <div style="width:2px;height:16px;background:var(--gray2)"></div>
          ${renderNode(k, depth+1)}
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Phone layout: one vertical, indented list (every level under its parent) — no sideways scrolling.
  function mobNode(n, d){
    const vk = visibleKids(n);
    const sides = sideOf[n.position_title] || [];
    const all = vk.kids.concat(sides);
    const chip = (vk.hidden > 0 || vk.isOpen) ? `<span onclick="event.stopPropagation();toggleOrgNode(${n.id})" style="cursor:pointer;margin-inline-start:8px;background:rgba(255,255,255,.28);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${vk.isOpen ? "−" : "+" + vk.hidden}</span>` : "";
    const dashed = orgIsSideRaw(n) && !(childrenOf[n.position_title] || []).length ? "outline:2px dashed rgba(255,255,255,.7);outline-offset:-4px;" : "";
    const holder = (!n.is_body && n.holder_name) ? `<div style="font-size:11px;font-weight:600;opacity:.92;margin-top:2px">${orgEsc(n.holder_name)}</div>` : "";
    const card = `<div onclick="editStructure(${n.id})" style="background:${orgLevelColor(n.level)};color:#fff;border-radius:8px;padding:9px 12px;font-size:12.5px;font-weight:800;${dashed}display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span>${orgEsc(n.position_title)}</span>${chip}</div>${holder}</div>`;
    const kidsHtml = all.length ? `<div style="margin:6px 14px 0 0;padding-right:10px;border-right:2px solid var(--gray2);display:flex;flex-direction:column;gap:6px">${all.map(k => mobNode(k, d + 1)).join("")}</div>` : "";
    return `<div>${card}${kidsHtml}</div>`;
  }
  if(opts.mobile && !isStatic && roots.length){
    return `<div style="display:flex;flex-direction:column;gap:8px">${roots.map(r => mobNode(r, 0)).join("")}</div>`;
  }

  if(roots.length===0) return '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">تعذّر رسم الهيكل — تحقق من ربط "يتبع لـ" لكل منصب.</div>';
  return `<div style="display:flex;justify-content:center;gap:50px;align-items:flex-start">${roots.map(r => renderNode(r, 0)).join("")}</div>`;
}

/* Colour legend + the structure type, shown under the tree on screen and inside every PDF page. */
function orgLegendHTML(rows){
  const levels = [...new Set(rows.map(r => r.level).filter(l => l != null))].sort((a,b) => a-b);
  const titles = new Set(rows.map(r => r.position_title));
  const hasSide = rows.some(r => orgIsSideRaw(r) && r.parent_position && titles.has(r.parent_position));
  const item = "display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#0D2447;margin:2px 9px";
  const swatches = levels.map(l => `<span style="${item}"><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${orgLevelColor(l)}"></i>${orgEsc((currentLang === "en" && (ORG_LABELS_EN[orgLevelKind()] || {})[l]) || orgLabels()[l] || orgLevelLabels[l] || ("مستوى " + l))}</span>`).join("");
  const side = hasSide ? `<span style="${item}"><i style="display:inline-block;width:22px;border-top:2px dashed #7A8794"></i>وحدة جانبية (داعمة / رقابية)</span>` : "";
  return `<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e0d0;text-align:center"><div>${swatches}${side}</div><div style="font-size:11px;color:#5b6678;margin-top:6px">نوع الهيكل: هرمي وظيفي مع وحدات جانبية (Line &amp; Staff)</div></div>`;
}
/* Tree rows = positions marked "show in tree" + every position above them, so a hidden owner / CEO never leaves its departments floating without a head. */
function orgTreeRows(all){
  all = all || [];
  const bt = {}; all.forEach(r => { if(r.position_title) bt[r.position_title] = r; });
  const keep = new Set();
  all.filter(r => r.is_leadership !== false).forEach(r => {
    let cur = r, n = 0;
    while(cur && !keep.has(cur.id) && n++ < 12){ keep.add(cur.id); cur = cur.parent_position ? bt[cur.parent_position] : null; }
  });
  return all.filter(r => keep.has(r.id));
}
function rerenderOrgTree(){
  const c = document.getElementById("orgTreeContainer");
  if(!c || !structureCache || !structureCache.length) return;
  const rows = orgTreeRows(structureCache);
  c.innerHTML = renderOrgTree(rows, { mobile: window.innerWidth <= 700 }) + orgLegendHTML(rows);
}
let __orgMob = null;
window.addEventListener("resize", () => { const m = window.innerWidth <= 700; if(__orgMob !== null && m !== __orgMob && document.getElementById("orgTreeContainer")) rerenderOrgTree(); __orgMob = m; });
function toggleOrgNode(id){ orgOverride.set(id, !orgNodeCollapsed[id]); rerenderOrgTree(); }
function orgExpandAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, false)); rerenderOrgTree(); }
function orgCollapseAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, true)); rerenderOrgTree(); }

function autoToggleLeadership(){
  const level = Number(document.getElementById("mst-level").value);
  document.getElementById("mst-leadership").checked = level <= 7;
}

function toggleBodyFields(){
  const isBody = document.getElementById("mst-is-body").checked;
  document.getElementById("mst-holder-field").style.display = isBody ? "none" : "block";
}

function editStructure(id){
  const s = structureCache.find(x => x.id === id);
  if(!s) return;
  if(s.unit_type){ openUnitModal(s); return; }
  openPositionModal(s);
}

const ORG_UNIT_LEVEL = { department: 6, section: 7, unit: 8 };
const ORG_UNIT_LABEL = { department: "إدارة", section: "قسم", unit: "وحدة" };
function orgHolderList(s){
  if(Array.isArray(s.holders) && s.holders.length) return s.holders;
  return s.holder_name ? [{ name: s.holder_name, direct_manager: "", appointment_date: s.appointment_date || "" }] : [];
}
function orgParentOptions(selected, excludeId){
  const rows = structureCache.filter(r => r.id !== excludeId);
  const units = rows.filter(r => r.unit_type || r.is_body);
  const others = rows.filter(r => !r.unit_type && !r.is_body);
  const opt = r => `<option value="${orgEsc(r.position_title||"")}">${orgEsc(r.position_title||"")}${r.unit_type ? " ("+ORG_UNIT_LABEL[r.unit_type]+")" : ""}</option>`;
  return '<option value="">— بدون (أعلى مستوى في الهيكل) —</option>'
    + (units.length ? '<optgroup label="الإدارات والأقسام والوحدات والجهات">'+units.map(opt).join("")+'</optgroup>' : "")
    + (others.length ? '<optgroup label="مناصب">'+others.map(opt).join("")+'</optgroup>' : "");
}
function openUnitModal(s){
  document.getElementById("mu-id").value = s ? s.id : "";
  document.getElementById("mu-title-h").textContent = s ? "✏️ تعديل" : "🌳 إضافة إدارة / قسم / وحدة";
  document.getElementById("mu-type").value = (s && s.unit_type) || "department";
  document.getElementById("mu-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mu-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  const sideRow = document.getElementById("mu-side-row");
  sideRow.style.display = orgSideSupported ? "flex" : "none";
  document.getElementById("mu-side").checked = s ? orgIsSideRaw(s) : false;
  document.getElementById("mu-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-unit");
}
async function saveUnit(){
  const id = document.getElementById("mu-id").value;
  const title = document.getElementById("mu-title").value.trim();
  if(!title){ alert("الرجاء إدخال الاسم"); return; }
  const unit_type = document.getElementById("mu-type").value;
  const dup = structureCache.find(r => r.position_title === title && String(r.id) !== String(id));
  if(dup){ alert("يوجد عنصر بنفس الاسم في الهيكل. اختر اسمًا مختلفًا."); return; }
  const payload = { position_title: title, unit_type, level: ORG_UNIT_LEVEL[unit_type], parent_position: document.getElementById("mu-parent").value.trim(),
    is_leadership: true, is_body: false, holder_name: "", holders: [], appointment_date: null, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mu-side").checked;
  let error;
  if(id){
    const old = structureCache.find(r => String(r.id) === String(id));
    ({ error } = await sb.from("org_structure").update(payload).eq("id", id));
    if(!error && old && old.position_title !== title){
      await sb.from("org_structure").update({ parent_position: title }).eq("company_id", currentCompanyId).eq("parent_position", old.position_title);
      await sb.from("org_structure").update({ unit_title: title }).eq("company_id", currentCompanyId).eq("unit_title", old.position_title);
    }
  } else {
    ({ error } = await sb.from("org_structure").insert([payload]));
  }
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}
async function deleteUnitFromModal(){
  const id = document.getElementById("mu-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. العناصر التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-unit"); loadStructure();
}

function addHolderRow(h){
  h = h || {};
  const list = document.getElementById("mst-holders-list");
  const div = document.createElement("div");
  div.className = "mst-holder-row";
  div.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;background:var(--offwhite);padding:8px;border-radius:8px";
  div.innerHTML = `<input class="fi mh-name" style="flex:2;min-width:140px" placeholder="اسم الشخص" value="${orgEsc(h.name||"")}" />
    <input class="fi mh-mgr" list="mst-people-dl" style="flex:2;min-width:140px" placeholder="المدير المباشر" value="${orgEsc(h.direct_manager||"")}" />
    <input type="date" class="fi mh-date" style="flex:1;min-width:130px" value="${orgEsc(h.appointment_date||"")}" title="تاريخ التعيين" />
    <button type="button" class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:4px 10px;cursor:pointer" onclick="this.parentNode.remove()">حذف</button>`;
  list.appendChild(div);
}
function openPositionModal(s){
  if(!s && (!structureCache || !structureCache.length)){
    alert("أضف الهيكل أولًا (إدارة أو قسم أو وحدة)، ثم أضف المناصب بعد اكتماله.");
    return;
  }
  document.getElementById("mst-id").value = s ? s.id : "";
  document.getElementById("mst-title-h").textContent = s ? "✏️ تعديل منصب" : "🌳 إضافة منصب في الهيكل التنظيمي";
  document.getElementById("mst-title").value = s ? (s.position_title || "") : "";
  const sel = document.getElementById("mst-parent");
  sel.innerHTML = orgParentOptions("", s ? s.id : null);
  sel.value = s ? (s.parent_position || "") : "";
  populateOrgLevelSelect(s ? s.level : undefined);
  document.getElementById("mst-level").value = s ? (s.level ?? "") : "";
  document.getElementById("mst-leadership").checked = s ? s.is_leadership !== false : false;
  document.getElementById("mst-is-body").checked = s ? !!s.is_body : false;
  document.getElementById("mst-side").checked = s ? orgIsSideRaw(s) : false;
  const dl = document.getElementById("mst-people-dl");
  const names = new Set();
  structureCache.forEach(r => orgHolderList(r).forEach(h => { if(h.name) names.add(h.name); }));
  dl.innerHTML = [...names].map(n => `<option value="${orgEsc(n)}"></option>`).join("");
  document.getElementById("mst-holders-list").innerHTML = "";
  if(s){ orgHolderList(s).forEach(h => addHolderRow(h)); }
  if(!s || !orgHolderList(s).length) addHolderRow();
  toggleBodyFields();
  mstParentChanged();
  document.getElementById("mst-delete-btn").style.display = s ? "inline-block" : "none";
  openM("m-structure");
}
function mstParentChanged(){
  const u = structureCache.find(r => r.position_title === document.getElementById("mst-parent").value);
  const row = document.getElementById("mst-leadership").parentNode;
  if(row) row.style.display = (u && u.unit_type) ? "none" : "flex";
  if(document.getElementById("mst-id").value) return;
  if(u && u.unit_type) document.getElementById("mst-level").value = String(u.level ?? "");
}

async function deleteStructureFromModal(){
  const id = document.getElementById("mst-id").value;
  if(!id) return;
  if(!await uiConfirm("حذف هذا العنصر سيفصله عن الهيكل. المناصب التابعة له ستحتاج إعادة ربط يدويًا. متابعة؟")) return;
  const { error } = await sb.from("org_structure").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  closeM("m-structure");
  loadStructure();
}
async function saveStructure(){
  const id = document.getElementById("mst-id").value;
  const position_title = document.getElementById("mst-title").value.trim();
  if(!position_title){ alert("الرجاء إدخال اسم المنصب"); return; }
  const is_body = document.getElementById("mst-is-body").checked;
  const holders = is_body ? [] : [...document.querySelectorAll("#mst-holders-list .mst-holder-row")].map(r => ({
    name: r.querySelector(".mh-name").value.trim(),
    direct_manager: r.querySelector(".mh-mgr").value.trim(),
    appointment_date: r.querySelector(".mh-date").value || ""
  })).filter(h => h.name);
  const holder_name = holders.map(h => h.name).join("، ");
  const appointment_date = holders.length ? (holders[0].appointment_date || null) : null;
  const parent_position = document.getElementById("mst-parent").value.trim();
  const level = document.getElementById("mst-level").value ? Number(document.getElementById("mst-level").value) : null;
  const parentRow = structureCache.find(r => r.position_title === parent_position);
  const is_leadership = (parentRow && parentRow.unit_type) ? false : document.getElementById("mst-leadership").checked;
  const payload = { position_title, holder_name, holders, appointment_date, parent_position, unit_title: parent_position || null, unit_type: null, level, is_leadership, is_body, company_id: currentCompanyId };
  if(orgSideSupported) payload.is_side = document.getElementById("mst-side").checked;
  const { error } = id
    ? await sb.from("org_structure").update(payload).eq("id", id)
    : await sb.from("org_structure").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mst-id").value = "";
  closeM("m-structure"); loadStructure();
}

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
        <td style="padding:10px 16px;font-size:12.5px;font-weight:600;color:var(--dark)">${orgEsc(it.item_name||"")}</td>`;
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

