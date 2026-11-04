/* استعلام وثّق: لمالك المنصة فقط (الدالة ترفض غيره). يعرض النتيجة ولا يغيّر أي بيانات. */
async function crWathqCheck(btn, n){
  const box = btn.nextElementSibling; if(!box) return;
  btn.disabled = true; box.style.display = ""; box.className = "cr-vmsg"; box.textContent = "جارٍ الاستعلام…";
  try{
    const { data, error } = await sb.functions.invoke("verify-commercial-registration", { body: { cr_number: n } });
    let msg = data && data.error;
    if(error && !msg){ try{ const b = await error.context.json(); msg = b && b.error; }catch(_){} }
    if(error || !data || data.error){ box.className = "cr-vmsg warn"; box.textContent = "تعذّر الاستعلام" + (msg ? " — " + msg : " الآن"); }
    else if(data.found){
      box.className = "cr-vmsg " + (data.active && !data.in_liquidation ? "ok" : "warn");
      box.textContent = (data.active ? "✓ " : "⚠ ") + (data.name || "سجل تجاري") + " — " + (data.status || "") + (data.in_liquidation ? " (قيد التصفية)" : "") + (data.entity_type ? " · " + data.entity_type : "") + (data.issue_date ? " · إصدار " + data.issue_date : "");
    } else {
      box.className = "cr-vmsg warn";
      box.textContent = data.need_national_number ? "لم يُطابَق الرقم — جرّب الرقم الوطني الموحد (يبدأ بـ 700)" : "لا يوجد سجل بهذا الرقم";
    }
  }catch(e){ box.className = "cr-vmsg warn"; box.textContent = "تعذّر الاستعلام الآن"; }
  btn.disabled = false;
}
