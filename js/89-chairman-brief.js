/* ══════════ ملخص رئيس المجلس: أهم 5 بنود + الاجتماع القادم وجدول أعماله + القرارات السابقة غير المنجزة ══════════ */
function chairBriefDays(d){ if(!d) return null; return Math.ceil((new Date(String(d).slice(0,10) + "T00:00:00") - new Date(new Date().toDateString())) / 86400000); }

async function openChairBrief(){
  let bg = document.getElementById("chairBriefBg");
  if(bg) bg.remove();
  bg = document.createElement("div"); bg.id = "chairBriefBg";
  bg.setAttribute("style", "position:fixed;inset:0;background:rgba(13,36,71,.55);z-index:99990;display:flex;align-items:center;justify-content:center;padding:14px");
  bg.onclick = e => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow:auto;direction:rtl;font-family:inherit;box-shadow:0 14px 44px rgba(13,36,71,.4)">
    <div style="background:linear-gradient(135deg,#0D2447,#1B4478);color:#fff;padding:16px 20px;border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div><div style="font-size:17px;font-weight:800">ملخص رئيس ${orgEsc(typeof getGovernanceBodyLabel === "function" ? getGovernanceBodyLabel() : "المجلس")}</div><div style="font-size:11px;color:#D9B945;font-weight:700;margin-top:2px">أهم ما يحتاج قرارك هذا الأسبوع</div></div>
      <button type="button" id="cbClose" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div id="cbBody" style="padding:16px 20px;font-size:13px;color:#3b4a63">جارٍ التحميل…</div></div>`;
  document.body.appendChild(bg);
  document.getElementById("cbClose").onclick = () => bg.remove();

  const body = document.getElementById("cbBody");
  const lines = [];
  let html = "";
  const sec = (t) => `<div style="font-size:13.5px;font-weight:800;color:#0D2447;margin:14px 0 6px;border-right:4px solid #D9B945;padding-right:8px">${t}</div>`;
  try{
    // 1) أهم 5 بنود
    let alerts = [];
    try{ alerts = await computeGovernanceAlerts(); }catch(e){}
    alerts.sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1));
    const top = alerts.slice(0, 5);
    html += sec("١) أهم 5 بنود");
    if(!top.length) html += `<div style="color:#2f855a;font-weight:700">لا توجد تنبيهات تحتاج قرارك الآن ✓</div>`;
    top.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.text}`);
      html += `<div onclick="document.getElementById('chairBriefBg').remove();go('${orgEsc(a.page || "dashboard")}',null)" style="cursor:pointer;display:flex;gap:8px;padding:9px 10px;margin-bottom:6px;border-radius:10px;border:1px solid ${a.severity === "high" ? "#f3c3c3" : "#ecdfb0"};background:${a.severity === "high" ? "#fff5f5" : "#fffaf0"}">
        <b style="color:${a.severity === "high" ? "#c53030" : "#B8972A"}">${i + 1}</b><span style="line-height:1.8">${orgEsc(a.text)}</span></div>`;
    });

    // 2) الاجتماع القادم
    const { data: meetings } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId);
    const upcoming = (meetings || []).filter(m => m.meeting_date && chairBriefDays(m.meeting_date) >= 0).sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)));
    html += sec("٢) الاجتماع القادم");
    if(!upcoming.length) html += `<div style="color:#7A90B0">لا يوجد اجتماع مجدول. جدول اجتماعك القادم من صفحة الاجتماعات.</div>`;
    else{
      const m = upcoming[0]; const dd = chairBriefDays(m.meeting_date);
      const { data: topics } = await sb.from("vote_topics").select("*").eq("meeting_id", m.id).order("id", { ascending: true });
      lines.push(`الاجتماع القادم: ${m.title || "اجتماع"} — ${String(m.meeting_date).slice(0, 10)} (${dd === 0 ? "اليوم" : "بعد " + dd + " يوم"})`);
      html += `<div style="font-weight:700;color:#0D2447">${orgEsc(m.title || "اجتماع")}</div><div style="font-size:12px;color:#7A90B0;margin:2px 0 6px">${orgEsc(String(m.meeting_date).slice(0, 10))} — ${dd === 0 ? "اليوم" : "بعد " + dd + " يوم"}</div>`;
      if(topics && topics.length){
        html += `<div style="font-size:12px;font-weight:700;margin-bottom:4px">جدول الأعمال:</div><ol style="margin:0;padding-right:20px;line-height:1.9">${topics.map(t => `<li>${orgEsc(t.topic_text || t.topic || "")}</li>`).join("")}</ol>`;
        topics.forEach((t, i) => lines.push(`   - ${t.topic_text || t.topic || ""}`));
      }else html += `<div style="color:#7A90B0;font-size:12px">لم يُضف جدول أعمال بعد.</div>`;
    }

    // 3) قرارات سابقة غير منجزة
    const { data: dec } = await sb.from("board_decisions").select("*").eq("company_id", currentCompanyId).not("status", "eq", "منجز").order("id", { ascending: false }).limit(30);
    html += sec("٣) قرارات سابقة لم تُنجز");
    const open = (dec || []).filter(d => d.decision_text).slice(0, 6);
    if(!open.length) html += `<div style="color:#2f855a;font-weight:700">لا توجد قرارات معلّقة ✓</div>`;
    open.forEach(d => {
      const dd = chairBriefDays(d.target_date);
      const late = dd !== null && dd < 0;
      lines.push(`- ${d.decision_text}${d.target_date ? " (موعد: " + String(d.target_date).slice(0, 10) + (late ? " — متأخر" : "") + ")" : ""}`);
      html += `<div style="padding:8px 10px;margin-bottom:6px;border-radius:10px;background:#f7f9fc;line-height:1.8">${orgEsc(d.decision_text)}${d.target_date ? `<div style="font-size:11px;color:${late ? "#c53030" : "#7A90B0"};font-weight:700">${late ? "متأخر منذ " + (-dd) + " يوم" : "الموعد: " + orgEsc(String(d.target_date).slice(0, 10))}</div>` : ""}</div>`;
    });
  }catch(e){ html += `<div style="color:#c53030">تعذّر تحميل بعض الأقسام.</div>`; }

  html += `<div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="btn btn-gold" id="cbCopy" style="flex:1">نسخ الملخص</button><button type="button" class="btn btn-ghost" id="cbClose2">إغلاق</button></div>`;
  body.innerHTML = html;
  document.getElementById("cbClose2").onclick = () => bg.remove();
  document.getElementById("cbCopy").onclick = async () => {
    const txt = "ملخص رئيس المجلس\n\n" + lines.join("\n");
    try{ await navigator.clipboard.writeText(txt); alert("تم نسخ الملخص"); }catch(e){ alert("تعذّر النسخ"); }
  };
}

/* زر الملخص على لوحة التحكم (للكيانات التي لها مجلس) */
function chairBriefInit(){
  try{
    const hero = document.getElementById("cdHero");
    const login = document.getElementById("loginScreen");
    const ok = hero && login && getComputedStyle(login).display === "none" && currentUserProfile && !currentUserProfile.is_platform_admin
      && currentCompanyType !== "مؤسسة فردية" && !currentCompanyLLCSingleManager && !currentCompanyLLCSingleOwner;
    let btn = document.getElementById("chairBriefBtn");
    if(!ok){ if(btn) btn.remove(); return; }
    if(btn) return;
    btn = document.createElement("button"); btn.id = "chairBriefBtn"; btn.type = "button";
    btn.textContent = "📋 ملخص رئيس المجلس";
    btn.setAttribute("style", "margin:10px 0 0;background:#fff;border:1.5px solid #D9B945;color:#0D2447;border-radius:10px;padding:9px 16px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(13,36,71,.08)");
    btn.onclick = openChairBrief;
    hero.parentNode.insertBefore(btn, hero.nextSibling);
  }catch(e){}
}
setInterval(chairBriefInit, 2500);
