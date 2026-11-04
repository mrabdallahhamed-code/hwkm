/* ══════════ SUPPORT TICKETS ══════════ */
async function openSupportModal(){
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  openM("m-support");
  loadMySupportTickets();
}

async function submitSupportTicket(){
  const subject = document.getElementById("sup-subject").value.trim();
  const message = document.getElementById("sup-message").value.trim();
  if(!subject || !message){ alert("الرجاء تعبئة الموضوع والوصف"); return; }
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from("support_tickets").insert([{
    company_id: currentCompanyId || null, submitted_by_email: email,
    submitted_by_name: currentUserProfile ? currentUserProfile.full_name : email, subject, message
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  {
    const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
      <h2 style="color:#1A3A6B">🆘 طلب دعم فني جديد</h2>
      <p><b>من:</b> ${currentUserProfile?currentUserProfile.full_name:email} (${email})</p>
      <p><b>الموضوع:</b> ${subject}</p>
      <p><b>الرسالة:</b> ${message}</p>
    </div>`;
    await notifyPlatformAdmins(`🆘 طلب دعم: ${subject}`, html);
  }
  alert("تم إرسال طلبك ✅ — سيتواصل معك فريق الدعم قريبًا.");
  document.getElementById("sup-subject").value = "";
  document.getElementById("sup-message").value = "";
  loadMySupportTickets();
}

async function loadMySupportTickets(){
  const box = document.getElementById("mySupportTicketsList");
  if(!box) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { data, error } = await sb.from("support_tickets").select("*").eq("submitted_by_email", email).order("created_at",{ascending:false});
  if(error || !data || data.length===0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لا توجد طلبات سابقة.</div>'; return; }
  box.innerHTML = data.map(t => `<div style="background:var(--offwhite);border-radius:8px;padding:8px 10px;margin-bottom:6px">
    <div style="font-size:12px;font-weight:700">${orgEsc(t.subject)}</div>
    <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">الحالة: <b style="color:${t.status==='مغلقة'?'var(--green)':'var(--gold)'}">${t.status}</b> · ${new Date(t.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</div>
    ${t.admin_reply ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>رد الدعم:</b> ${t.admin_reply}</div>` : ""}
  </div>`).join("");
}

/* ══════════ EXPORT ALL COMPANY DATA ══════════
   The subscription agreement (Article 22) grants the client the right to extract their data —
   this is the "one button" version of that: pull everything scoped to the current company
   across every major table and package it as a single downloadable JSON file. */
const EXPORT_TABLES = [
  "meetings","policies","risks","board_members","shareholders","committees","compliance_items",
  "audit_items","signing_documents","document_signatures","governance_assessments","performance_evaluations",
  "vote_topics","agm_attendance","share_transfers","activity_log","ceo_monthly_reports",
  "audit_requests","risk_requests","company_requests","document_templates"
];

async function exportAllCompanyData(){
  if(!currentCompanyId){ alert("لا توجد شركة محددة حاليًا"); return; }
  if(!await uiConfirm("سيتم تجميع كل بيانات شركتك المسجَّلة بالمنصة بملف واحد قابل للتحميل. قد يأخذ هذا بضع ثوانٍ. متابعة؟")) return;

  const { data: company } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  const exportData = { exported_at: new Date().toISOString(), company: company || {}, data: {} };

  for(const table of EXPORT_TABLES){
    try{
      const { data, error } = await sb.from(table).select("*").eq("company_id", currentCompanyId);
      exportData.data[table] = error ? { error: error.message } : (data || []);
    }catch(e){
      exportData.data[table] = { error: e.message };
    }
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `بيانات-${(company?.name||"الشركة").replace(/[\\/:*?"<>|]/g,"_")}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  alert("تم تحميل ملف بيانات شركتك بنجاح ✅");
}
