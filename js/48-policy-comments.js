/* ══════════ POLICY COMMENTS ══════════ */
let polState = { pid:null, comments:[], versions:[] };
function polMyRole(){ return (typeof getRawRole === "function" ? getRawRole() : "") || getCurrentRole() || ""; }
function polMyName(){ return currentUserProfile ? (currentUserProfile.full_name || currentUserProfile.email || "—") : "—"; }
function polIsGov(){ const r = polMyRole(); return getCurrentRole() === "مدير النظام" || /حوكمة|الحوكمة/.test(r); }
function polDur(ms){
  if(!(ms >= 0)) return "—";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if(d >= 1) return d + " يوم" + (h % 24 ? " و" + (h % 24) + " ساعة" : "");
  if(h >= 1) return h + " ساعة" + (m % 60 ? " و" + (m % 60) + " دقيقة" : "");
  return Math.max(m, 1) + " دقيقة";
}
function polCurVersion(versions, policy){ return versions.length ? Math.max(...versions.map(v => v.version_no)) : (policy && policy.file_url ? 1 : 1); }
async function polOpenCount(pid){
  try{ const r = await sb.from("policy_comments").select("id", { count:"exact", head:true }).eq("policy_id", pid).eq("status","مفتوحة"); return r.count || 0; }catch(e){ return 0; }
}
async function polBlockIfOpen(pid){
  const n = await polOpenCount(pid);
  if(n > 0){ alert(`لا يمكن المتابعة: توجد ${n} ملاحظة مفتوحة على هذه السياسة.\nأغلقها بالمعالجة (بعد رفع نسخة معدّلة) أو بالرفض مع كتابة السبب، ثم أعد المحاولة.`); return true; }
  return false;
}
async function polLoadBadges(list){
  try{
    const r = await sb.from("policy_comments").select("policy_id").eq("company_id", currentCompanyId).eq("status","مفتوحة");
    const c = {}; (Array.isArray(r.data) ? r.data : []).forEach(x => { c[x.policy_id] = (c[x.policy_id] || 0) + 1; });
    let total = 0;
    list.forEach(p => { const el = document.getElementById("polcom-n-" + p.id); const n = c[p.id] || 0; total += n; if(el){ el.textContent = n ? "(" + n + " مفتوحة)" : ""; el.style.color = n ? "var(--red)" : ""; } });
  }catch(e){}
}
async function polRegisterVersion(policyId, newUrl, prevUrl){
  const ex = await sb.from("policy_file_versions").select("version_no").eq("policy_id", policyId);
  let max = Array.isArray(ex.data) && ex.data.length ? Math.max(...ex.data.map(x => x.version_no)) : 0;
  const by = polMyName(), role = polMyRole();
  if(max === 0 && prevUrl){ await sb.from("policy_file_versions").insert([{ company_id: currentCompanyId, policy_id: policyId, version_no: 1, file_url: prevUrl, uploaded_by: "—", uploaded_role: "" }]); max = 1; }
  await sb.from("policy_file_versions").insert([{ company_id: currentCompanyId, policy_id: policyId, version_no: max + 1, file_url: newUrl, uploaded_by: by, uploaded_role: role }]);
  try{
    const oc = await sb.from("policy_comments").select("author_email").eq("policy_id", policyId).eq("status", "مفتوحة");
    const pn = (policiesCache.find(x => x.id === policyId) || {}).policy_name || "";
    polNotify(new Set((Array.isArray(oc.data) ? oc.data : []).map(x => x.author_email).filter(Boolean)), "نسخة معدّلة من سياسة: " + pn,
      ["رُفعت النسخة " + (max + 1) + " بواسطة <b>" + orgEsc(by) + "</b> (" + orgEsc(role) + ").", "لديك ملاحظات مفتوحة على هذه السياسة، سيراجعها موظف الحوكمة ويغلقها."]);
  }catch(e){}
}
/* ── email notifications for policy comments (failures never block saving) ── */
async function polGovRecipients(){
  const set = new Set();
  try{ const a = await sb.from("user_profiles").select("email").eq("is_platform_admin", true); (Array.isArray(a.data) ? a.data : []).forEach(x => x.email && set.add(x.email.toLowerCase())); }catch(e){}
  try{ const g = await sb.from("user_company_memberships").select("email").eq("company_id", currentCompanyId).ilike("role", "%حوكمة%"); (Array.isArray(g.data) ? g.data : []).forEach(x => x.email && set.add(x.email.toLowerCase())); }catch(e){}
  return set;
}
async function polNotify(recipients, subject, lines){
  try{
    const me = (currentUserProfile && currentUserProfile.email ? currentUserProfile.email : "").toLowerCase();
    const to = [...recipients].filter(e => e && e.toLowerCase() !== me);
    if(!to.length) return;
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.9;color:#0D2447"><h3 style="color:#1A3A6B;margin:0 0 8px">${orgEsc(subject)}</h3>${lines.filter(Boolean).map(l => `<div>${l}</div>`).join("")}<hr style="border:none;border-top:1px solid #e3e8ef;margin:14px 0"><div style="font-size:12px;color:#5b6678">رسالة آلية من منصة حوكم.</div></div>`;
    for(const t of to){ await sendNotificationEmail(t, subject, html); }
  }catch(e){}
}
async function openPolComments(pid){
  polState.pid = pid; openM("m-polcom");
  document.getElementById("polcom-gov").style.display = polIsGov() ? "block" : "none";
  await polRefresh();
}
async function polRefresh(){
  try{ await polRefreshInner(); }
  catch(e){ const l = document.getElementById("polcom-list"); if(l) l.innerHTML = '<div style="color:var(--red);font-size:12px;padding:14px">تعذّر تحميل الملاحظات الآن، أعد المحاولة.</div>'; }
}
async function polRefreshInner(){
  const pid = polState.pid, p = policiesCache.find(x => x.id === pid) || {};
  document.getElementById("polcom-title").textContent = "ملاحظات: " + (p.policy_name || "");
  const [c, v] = await Promise.all([
    sb.from("policy_comments").select("*").eq("policy_id", pid).order("created_at",{ascending:false}),
    sb.from("policy_file_versions").select("*").eq("policy_id", pid).order("version_no",{ascending:true})
  ]);
  if(c.error){ document.getElementById("polcom-list").innerHTML = `<div style="color:var(--red);font-size:12px">تعذّر التحميل: ${orgEsc(c.error.message)}</div>`; return; }
  polState.comments = Array.isArray(c.data) ? c.data : []; polState.versions = Array.isArray(v.data) ? v.data : [];
  const cur = polCurVersion(polState.versions, p), list = polState.comments;
  const open = list.filter(x => x.status === "مفتوحة");
  const done = list.filter(x => x.status === "تمت المعالجة" && x.resolved_at);
  const avg = done.length ? done.reduce((s, x) => s + (new Date(x.resolved_at) - new Date(x.created_at)), 0) / done.length : null;
  const hot = {}; list.forEach(x => { const k = x.clause_no || (x.page_no ? "صفحة " + x.page_no : ""); if(k) hot[k] = (hot[k] || 0) + 1; });
  const top = Object.entries(hot).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 1).slice(0, 3).map(e => `${orgEsc(e[0])} (${e[1]})`).join("، ");
  document.getElementById("polcom-stats").innerHTML = `النسخة الحالية: <b>${cur}</b> · مفتوحة: <b style="color:${open.length ? "var(--red)" : "var(--green)"}">${open.length}</b> · معالجة: <b>${done.length}</b>${avg != null ? " · متوسط زمن المعالجة: <b>" + polDur(avg) + "</b>" : ""}${top ? "<br>أكثر المواضع تكرارًا في الملاحظات: " + top : ""}`;
  document.getElementById("polcom-versions").innerHTML = polState.versions.length ? "النسخ: " + polState.versions.map(x => `<a href="${orgEsc(x.file_url)}" target="_blank" rel="noopener">النسخة ${x.version_no}</a> (${procFmt(x.uploaded_at)}${x.uploaded_by && x.uploaded_by !== "—" ? " — " + orgEsc(x.uploaded_by) : ""})`).join(" · ") : "لا توجد نسخ مسجّلة بعد؛ يُعدّ الملف الحالي النسخة 1.";
  const now = Date.now(), gov = polIsGov();
  const ST = { "مفتوحة":["#FEF3E2","#9C7A2E"], "تمت المعالجة":["#E8F8EF","#1B7F4B"], "مرفوضة":["#FDE8E8","#C0392B"] };
  document.getElementById("polcom-list").innerHTML = list.length ? list.map(x => {
    const st = ST[x.status] || ST["مفتوحة"];
    let timing = "";
    if(x.status === "مفتوحة") timing = `مفتوحة منذ <b>${polDur(now - new Date(x.created_at))}</b>`;
    else if(x.resolved_at) timing = `${x.status === "تمت المعالجة" ? "عولجت" : "رُفضت"} بعد <b>${polDur(new Date(x.resolved_at) - new Date(x.created_at))}</b>${x.resolved_in_version ? " في النسخة " + x.resolved_in_version : ""} — ${orgEsc(x.resolved_by || "")}${x.resolved_role ? " (" + orgEsc(x.resolved_role) + ")" : ""}`;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11.5px">
        <div><span style="background:${st[0]};color:${st[1]};border-radius:10px;padding:1px 10px;font-weight:800">${orgEsc(x.status)}</span>
        <span style="background:#EEF1F5;border-radius:10px;padding:1px 10px;margin-inline-start:4px">${orgEsc(x.category)}</span>
        ${x.page_no ? ` · صفحة ${orgEsc(x.page_no)}` : ""}${x.clause_no ? ` · ${orgEsc(x.clause_no)}` : ""} · على النسخة ${x.file_version_no}</div>
        <div style="color:var(--gray3)">${orgEsc(x.author_name || "—")}${x.author_role ? " — <b>" + orgEsc(x.author_role) + "</b>" : ""} · ${procFmt(x.created_at)}</div></div>
      <div style="font-size:12.5px;margin:6px 0;white-space:pre-wrap">${orgEsc(x.body)}</div>
      ${x.suggested_text ? `<div style="background:var(--offwhite);border-radius:8px;padding:6px 10px;font-size:12px"><b>الصياغة المقترحة:</b> <span id="polsug-${x.id}">${orgEsc(x.suggested_text)}</span> <button class="btn-xs" onclick="polCopy(${x.id})">نسخ</button></div>` : ""}
      <div style="font-size:11px;color:var(--gray3);margin-top:6px">${timing}</div>
      ${x.resolution_note ? `<div style="font-size:11.5px;margin-top:4px"><b>ملاحظة المعالجة:</b> ${orgEsc(x.resolution_note)}</div>` : ""}
      ${x.status === "مفتوحة" && gov ? `<div style="margin-top:8px;display:flex;gap:6px"><button class="btn-xs primary" onclick="polResolve(${x.id})">تمت المعالجة</button><button class="btn-xs" style="color:var(--red)" onclick="polRejectC(${x.id})">رفض مع السبب</button></div>` : ""}
    </div>`; }).join("") : '<div style="text-align:center;color:var(--gray3);font-size:12.5px;padding:18px">لا توجد ملاحظات على هذه السياسة.</div>';
}
function polCopy(id){ const el = document.getElementById("polsug-" + id); if(el && navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(() => alert("تم النسخ")); }
async function polAddComment(){
  const body = document.getElementById("polcom-body").value.trim();
  if(!body){ alert("اكتب نص الملاحظة."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const { data: u } = await sb.auth.getUser();
  const r = await sb.from("policy_comments").insert([{ company_id: currentCompanyId, policy_id: polState.pid, file_version_no: polCurVersion(polState.versions, p),
    page_no: document.getElementById("polcom-page").value.trim() || null, clause_no: document.getElementById("polcom-clause").value.trim() || null,
    category: document.getElementById("polcom-cat").value, body, suggested_text: document.getElementById("polcom-sugg").value.trim() || null,
    author_name: polMyName(), author_email: u && u.user ? u.user.email : null, author_role: polMyRole() }]);
  if(r.error){ alert("تعذّر الحفظ: " + r.error.message); return; }
  const nPage = document.getElementById("polcom-page").value.trim(), nClause = document.getElementById("polcom-clause").value.trim(), nCat = document.getElementById("polcom-cat").value;
  ["page","clause","body","sugg"].forEach(k => { document.getElementById("polcom-" + k).value = ""; });
  logActivity("إنشاء", "ملاحظة سياسة", p.policy_name || "", nCat);
  polNotify(await polGovRecipients(), "ملاحظة جديدة على سياسة: " + (p.policy_name || ""), [
    "كاتب الملاحظة: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ")",
    "التصنيف: " + orgEsc(nCat) + (nPage ? " — صفحة " + orgEsc(nPage) : "") + (nClause ? " — " + orgEsc(nClause) : ""),
    "<b>الملاحظة:</b> " + orgEsc(body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
async function polUploadVersion(){
  if(!polIsGov()){ alert("رفع النسخ لموظف الحوكمة أو مدير النظام."); return; }
  const inp = document.getElementById("polcom-file"); if(!inp.files || !inp.files[0]){ alert("اختر ملف PDF أولًا."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const url = await uploadFile(inp, "policies"); if(!url) return;
  const up = await sb.from("policies").update({ file_url: url }).eq("id", polState.pid);
  if(up.error){ alert("تعذّر تحديث الملف: " + up.error.message); return; }
  await polRegisterVersion(polState.pid, url, p.file_url); p.file_url = url; inp.value = "";
  await polRefresh();
}
async function polResolve(id){
  const c = polState.comments.find(x => x.id === id); if(!c) return;
  const p = policiesCache.find(x => x.id === polState.pid) || {};
  const cur = polCurVersion(polState.versions, p);
  if(cur <= c.file_version_no){ alert("لا يمكن اعتبارها معالجة قبل رفع نسخة معدّلة من الملف.\nارفع النسخة الجديدة أعلاه ثم أعد المحاولة."); return; }
  const note = await uiPrompt("ملاحظة المعالجة (اختياري):"); if(note === null) return;
  const v = polState.versions.find(x => x.version_no === cur);
  const r = await sb.from("policy_comments").update({ status:"تمت المعالجة", resolution_note: note.trim() || null, resolved_in_version: cur, resolved_by: polMyName(), resolved_role: polMyRole(), resolved_at: v ? v.uploaded_at : new Date().toISOString() }).eq("id", id);
  if(r.error){ alert("تعذّر التنفيذ: " + r.error.message); return; }
  polNotify([c.author_email], "تمت معالجة ملاحظتك على سياسة: " + (p.policy_name || ""), ["عالجها: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ") في النسخة " + cur + " بعد " + polDur((v ? new Date(v.uploaded_at) : new Date()) - new Date(c.created_at)), note.trim() ? "ملاحظة المعالجة: " + orgEsc(note.trim()) : "", "ملاحظتك: " + orgEsc(c.body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
async function polRejectC(id){
  const reason = await uiPrompt("سبب رفض الملاحظة (مطلوب):"); if(reason === null) return;
  if(!reason.trim()){ alert("السبب مطلوب."); return; }
  const r = await sb.from("policy_comments").update({ status:"مرفوضة", resolution_note: reason.trim(), resolved_by: polMyName(), resolved_role: polMyRole(), resolved_at: new Date().toISOString() }).eq("id", id);
  if(r.error){ alert("تعذّر التنفيذ: " + r.error.message); return; }
  const cc = polState.comments.find(x => x.id === id), pp = policiesCache.find(x => x.id === polState.pid) || {};
  if(cc) polNotify([cc.author_email], "رُفضت ملاحظتك على سياسة: " + (pp.policy_name || ""), ["رفضها: <b>" + orgEsc(polMyName()) + "</b> (" + orgEsc(polMyRole()) + ")", "السبب: " + orgEsc(reason.trim()), "ملاحظتك: " + orgEsc(cc.body)]);
  await polRefresh(); polLoadBadges(policiesCache);
}
function polLogHTML(p, company, list){
  const td = "border:1px solid #cfd6e0;padding:5px 6px;font-size:10.5px;text-align:right;vertical-align:top", th = td + ";background:#1A3A6B;color:#fff";
  return `<div style="border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:10px"><div style="font-size:17px;font-weight:800;color:#1A3A6B">سجل ملاحظات: ${orgEsc(p.policy_name)}</div><div style="font-size:11.5px;color:#5b6678">${orgEsc(company)} · النسخة الحالية ${polCurVersion(polState.versions, p)} · تاريخ التصدير ${procFmt(new Date())}</div></div>
   <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">#</th><th style="${th}">الموضع</th><th style="${th}">الملاحظة</th><th style="${th}">صاحبها / دوره</th><th style="${th}">الحالة والمعالجة</th><th style="${th}">الزمن</th></tr></thead><tbody>
   ${list.map((x, i) => `<tr style="page-break-inside:avoid"><td style="${td}">${i + 1}</td><td style="${td}">${orgEsc([x.page_no && "ص " + x.page_no, x.clause_no].filter(Boolean).join(" / ") || "—")}<br>${orgEsc(x.category)}</td><td style="${td}">${orgEsc(x.body)}${x.suggested_text ? "<br><b>مقترح:</b> " + orgEsc(x.suggested_text) : ""}</td><td style="${td}">${orgEsc(x.author_name || "—")}<br>${orgEsc(x.author_role || "")}<br>${procFmt(x.created_at)}</td><td style="${td}">${orgEsc(x.status)}${x.resolved_by ? "<br>" + orgEsc(x.resolved_by) + (x.resolved_role ? " (" + orgEsc(x.resolved_role) + ")" : "") : ""}${x.resolution_note ? "<br>" + orgEsc(x.resolution_note) : ""}</td><td style="${td}">${x.resolved_at ? polDur(new Date(x.resolved_at) - new Date(x.created_at)) : "مفتوحة منذ " + polDur(Date.now() - new Date(x.created_at))}</td></tr>`).join("")}</tbody></table>`;
}
async function polPrint(){
  const p = policiesCache.find(x => x.id === polState.pid) || {}, list = polState.comments.slice().reverse();
  if(!list.length){ alert("لا توجد ملاحظات."); return; }
  printDocument("ملاحظات-" + (p.policy_name || "سياسة"), polLogHTML(p, await procCompanyName(), list), false);
}
async function polExportPDF(){
  if(typeof html2pdf === "undefined"){ alert("تعذّر تحميل أداة PDF — تحقق من الاتصال."); return; }
  const p = policiesCache.find(x => x.id === polState.pid) || {}, list = polState.comments.slice().reverse();
  if(!list.length){ alert("لا توجد ملاحظات."); return; }
  const company = await procCompanyName();
  const w = document.createElement("div"); w.style.cssText = "width:720px;direction:rtl;font-family:Tajawal,Arial,sans-serif;color:#0D2447;background:#fff";
  w.innerHTML = polLogHTML(p, company, list);
  const holder = document.createElement("div"); holder.style.cssText = "position:absolute;top:0;left:-20000px;width:720px;pointer-events:none"; holder.appendChild(w); document.body.appendChild(holder);
  try{ await html2pdf().from(w).set({ margin:10, filename:("ملاحظات-" + (p.policy_name || "سياسة") + ".pdf").replace(/[\\/:*?"<>|]/g, "-"), image:{type:"jpeg",quality:.98}, html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff",scrollX:0,scrollY:0}, jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}, pagebreak:{mode:["css","legacy"],avoid:["tr"]} }).save(); }
  catch(e){ alert("تعذّر إنشاء PDF: " + (e && e.message ? e.message : e)); }
  finally{ if(holder.parentNode) holder.parentNode.removeChild(holder); }
}

/* Print/PDF windows are opened from this page, so they share its origin: anything unescaped that reaches
   document.write could run with the user's session. printSafe strips scripts (except our own print trigger)
   and inline event handlers from whatever is written — a second line of defence beside escaping. */
function printSafe(html){
  return String(html == null ? "" : html)
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => /^\s*window\.onload=function\(\)\{setTimeout\(function\(\)\{window\.print\(\)\}/.test(body) ? m : "")
    .replace(/<(iframe|object|embed|link)\b[^>]*>/gi, "")
    .replace(/(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}
function openPrintWindow(){
  const w = window.open("", "_blank"); if(!w) return null;
  try{
    const d = w.document, ow = d.write.bind(d);
    // A visible "save as PDF / print" button (hidden when printing) — on phones the automatic print prompt is often blocked.
    const banner = '<style>@media print{.np-bar{display:none!important}}</style><div class="np-bar" style="position:sticky;top:0;z-index:9;background:#0D2447;padding:8px 12px;text-align:center;direction:rtl"><button onclick="window.print()" style="background:#D4AF37;color:#0D2447;border:none;border-radius:8px;padding:9px 22px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">حفظ كملف PDF / طباعة</button></div>';
    d.write = html => ow(printSafe(html).replace(/(<body[^>]*>)/i, "$1" + banner));
  }catch(e){}
  return w;
}
/* Text-based (searchable, light) PDF path: opens a clean print view; "Save as PDF" in the print dialog gives a vector file. */
function printDocument(title, innerHtml, landscape){
  const w = openPrintWindow();
  if(!w){ alert("المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة."); return; }
  w.document.open();
  w.document.write('<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + orgEsc(title) + '</title><style>@page{size:A4 ' + (landscape ? "landscape" : "portrait") + ';margin:10mm}body{font-family:Tajawal,Arial,sans-serif;color:#0D2447;margin:0;padding:12px}table{border-collapse:collapse;width:100%}tr{page-break-inside:avoid}</style></head><body>' + innerHtml + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
  w.document.close();
}
/* Off-screen host for html2pdf sources: fixed A4 width so the PDF looks the same on phones and desktops,
   and nothing flashes on the visible page while it renders. */
function pdfHostAdd(el, widthPx){
  const h = document.createElement("div"); h.setAttribute("data-pdf-host","1");
  h.style.cssText = "position:absolute;top:0;left:-20000px;width:" + widthPx + "px;pointer-events:none";
  el.style.width = widthPx + "px"; h.appendChild(el); document.body.appendChild(h);
}
function pdfHostRemove(el){ const h = el && el.parentNode; if(h && h.getAttribute && h.getAttribute("data-pdf-host") && h.parentNode) h.parentNode.removeChild(h); else if(el && el.parentNode) el.parentNode.removeChild(el); }
