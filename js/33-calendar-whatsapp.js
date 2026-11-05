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
