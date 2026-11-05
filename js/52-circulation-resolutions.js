/* ══════════ CIRCULATION RESOLUTIONS (قرارات التمرير) ══════════
   General assembly of an UNLISTED joint-stock company (Companies Law Art. 101): approved by shareholders holding
   a majority of ALL voting rights (ordinary) or 75% (extraordinary) — measured against the company's total shares,
   not against attendance. Board of directors: resolutions by circulation among members; if any member asks in
   writing for a meeting to discuss it, it is not decided by circulation and goes to the next board meeting.
   Votes are written once and cannot be edited or deleted (enforced by the database). */
let circTab = "الجمعية العامة";
function circIsJSC(){ return /مساهمة/.test(currentCompanyType || ""); }
function circIsListed(){ return currentCompanyType === "مساهمة مدرجة"; }
function circCanPrint(){ const r = getCurrentRole(); return (currentUserProfile && currentUserProfile.is_platform_admin === true) || r === "مدير النظام" || ["سكرتير المجلس","سكرتير مجلس"].includes(r); }
function circCanManage(){ const r = getCurrentRole(); return isFullAccessRole(r) || ["رئيس مجلس","سكرتير مجلس","سكرتير المجلس"].includes(r); }
function circSetTab(t){ circTab = t; loadCirculation(); }

async function circMe(){
  const { data: u } = await sb.auth.getUser(); const email = u && u.user ? u.user.email : null;
  const [sh, bm] = await Promise.all([
    sb.from("shareholders").select("name,shares_count").eq("company_id", currentCompanyId).ilike("claimed_by_email", email || "-").maybeSingle(),
    sb.from("board_members").select("name,status").eq("company_id", currentCompanyId).ilike("claimed_by_email", email || "-").maybeSingle()
  ]);
  const boardOk = bm.data && !/مستقيل|منتهي/.test(bm.data.status || "");
  return { email, shareholder: sh.data || null, board: boardOk ? bm.data : null };
}

/* Pure evaluation of one resolution. ctx = { totalShares, boardCount } */
function circEvaluate(res, votes, ctx){
  const yes = votes.filter(v => v.vote === "موافق"), no = votes.filter(v => v.vote === "معارض"), abs = votes.filter(v => v.vote === "ممتنع");
  const req = Number(res.required_pct);
  let base, yesW, noW, absW, unit;
  if(res.body === "الجمعية العامة"){
    base = Number(ctx.totalShares) || 0; unit = "سهم";
    const sh = v => Number(v.shares) || 0;
    yesW = yes.reduce((x,v)=>x+sh(v),0); noW = no.reduce((x,v)=>x+sh(v),0); absW = abs.reduce((x,v)=>x+sh(v),0);
  } else {
    base = Number(ctx.boardCount) || 0; unit = "عضو";
    yesW = yes.length; noW = no.length; absW = abs.length;
  }
  const strict = res.body === "مجلس الإدارة" || res.kind !== "غير عادية";           // "more than half" for ordinary / board
  const meets = w => base > 0 && (strict && req <= 50 ? (w / base * 100) > req : (w / base * 100) + 1e-9 >= req);
  const passedNow = meets(yesW);
  const maxPossible = base - noW - absW;                                             // everyone left votes yes
  const impossible = base > 0 && !meets(maxPossible);
  const meetingRequested = res.body === "مجلس الإدارة" && votes.some(v => v.requested_meeting);
  const expired = res.deadline && new Date(res.deadline) < new Date();
  let status = res.status;
  if(res.status === "مفتوح"){
    if(meetingRequested) status = "طُلب اجتماع";
    else if(passedNow) status = "معتمد";
    else if(impossible || expired) status = "غير معتمد";
  }
  return { yesW, noW, absW, base, unit, pctYes: base ? yesW / base * 100 : 0, passedNow, impossible, expired, meetingRequested, status };
}

async function circPersistStatus(res, ev){
  if(ev.status === res.status) return;
  const note = ev.status === "معتمد" ? `بلغت الموافقات ${ev.pctYes.toFixed(1)}% من ${res.body === "الجمعية العامة" ? "حقوق التصويت" : "أعضاء المجلس"} (المطلوب ${res.required_pct}%)`
    : ev.status === "طُلب اجتماع" ? "طلب أحد الأعضاء كتابةً اجتماعاً لمناقشة القرار، فيُعرض في أول اجتماع تالٍ"
    : ev.expired ? "انتهت المهلة دون بلوغ النسبة المطلوبة" : "لم يعد بلوغ النسبة المطلوبة ممكناً";
  const { error } = await sb.from("circulation_resolutions").update({ status: ev.status, closed_at: new Date().toISOString(), result_note: note }).eq("id", res.id);
  if(!error){ logActivity("اعتماد", "قرار تمرير", res.title, `${ev.status} — ${note}`); res.status = ev.status; res.result_note = note; }
}

async function loadCirculation(){
  const box = document.getElementById("circBody"); if(!box) return;
  if(!circIsJSC()){ box.innerHTML = '<div class="card"><div class="card-body" style="font-size:13px;line-height:2">قرارات التمرير متاحة لشركات المساهمة. (قرارات الشركاء/المالك في الأنواع الأخرى تُسجَّل من صفحة قراراتهم.)</div></div>'; return; }
  const listed = circIsListed();
  if(listed && circTab === "الجمعية العامة") circTab = "مجلس الإدارة";
  document.getElementById("circTabAgm").style.display = listed ? "none" : "";
  document.getElementById("circTabAgm").className = "btn-xs " + (circTab === "الجمعية العامة" ? "primary" : "sec");
  document.getElementById("circTabBoard").className = "btn-xs " + (circTab === "مجلس الإدارة" ? "primary" : "sec");
  document.getElementById("circNewBtn").style.display = circCanManage() ? "" : "none";
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);padding:20px;font-size:12px">جارِ التحميل…</div>';
  const [rs, me, co, bmAll] = await Promise.all([
    sb.from("circulation_resolutions").select("*").eq("company_id", currentCompanyId).eq("body", circTab).order("id", { ascending: false }),
    circMe(),
    sb.from("companies").select("total_shares").eq("id", currentCompanyId).single(),
    sb.from("board_members").select("id,status").eq("company_id", currentCompanyId)
  ]);
  if(rs.error){ box.innerHTML = `<div class="card"><div class="card-body" style="color:var(--red)">تعذّر التحميل: ${orgEsc(rs.error.message)}</div></div>`; return; }
  const list = rs.data || [];
  if(!list.length){ box.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--gray3);font-size:13px;padding:26px">لا توجد قرارات تمرير بعد.</div></div>'; return; }
  const ctx = { totalShares: co.data ? co.data.total_shares : 0, boardCount: (bmAll.data || []).filter(m => !/مستقيل|منتهي/.test(m.status || "")).length };
  const { data: allVotes } = await sb.from("circulation_votes").select("*").in("resolution_id", list.map(r => r.id));
  const out = [];
  for(const r of list){
    const votes = (allVotes || []).filter(v => v.resolution_id === r.id);
    const ev = circEvaluate(r, votes, ctx);
    if(r.status === "مفتوح" && ev.status !== "مفتوح") await circPersistStatus(r, ev);
    out.push(circCardHTML(r, votes, ev, me, ctx));
  }
  box.innerHTML = out.join("");
}

function circCardHTML(r, votes, ev, me, ctx){
  const st = r.status;
  const col = st === "معتمد" ? "var(--green)" : st === "غير معتمد" || st === "ملغى" ? "var(--red)" : st === "طُلب اجتماع" ? "#b0701c" : "var(--primary)";
  const myVote = votes.find(v => (v.voter_email || "").toLowerCase() === (me.email || "").toLowerCase());
  const isAgm = r.body === "الجمعية العامة";
  const eligible = isAgm ? !!me.shareholder : !!me.board;
  const open = st === "مفتوح";
  const bar = Math.min(100, ev.pctYes), reqBar = Math.min(100, Number(r.required_pct));
  const fmt = n => Number(n).toLocaleString("ar-SA-u-ca-gregory");
  let voteUI = "";
  if(open && eligible && !myVote){
    voteUI = `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #e3e7ee">
      <div style="font-size:12px;margin-bottom:6px">صوّتك${isAgm ? ` (${fmt(me.shareholder.shares_count)} سهم)` : ""} — لا يمكن تعديله بعد الإرسال:</div>
      ${isAgm ? "" : `<label style="display:block;font-size:12px;margin-bottom:6px"><input type="checkbox" id="circMeet-${r.id}"> أطلب عقد اجتماع لمناقشة هذا القرار (يمنع إصداره بالتمرير)</label>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-xs primary" onclick="circVote(${r.id},'موافق')">موافق</button>
        <button class="btn-xs sec" onclick="circVote(${r.id},'معارض')">معارض</button>
        <button class="btn-xs sec" onclick="circVote(${r.id},'ممتنع')">ممتنع</button>
      </div></div>`;
  } else if(myVote){
    voteUI = `<div style="margin-top:10px;font-size:12px;color:var(--green)">✔ سُجّل صوتك: <b>${orgEsc(myVote.vote)}</b></div>`;
  } else if(open && !eligible){
    voteUI = `<div style="margin-top:10px;font-size:12px;color:var(--gray3)">${isAgm ? "التصويت للمساهمين المسجَّلين المرتبطين بحساباتهم." : "التصويت لأعضاء المجلس المرتبطين بحساباتهم."}</div>`;
  }
  const rows = votes.map(v => `<tr><td>${orgEsc(v.voter_name || v.voter_email)}</td>${isAgm ? `<td style="text-align:center">${fmt(v.shares || 0)}</td>` : ""}<td style="text-align:center"><b>${orgEsc(v.vote)}</b>${v.requested_meeting ? " · طلب اجتماعاً" : ""}</td><td style="text-align:center;font-size:11px">${new Date(v.created_at).toLocaleString("ar-SA-u-ca-gregory")}</td></tr>`).join("");
  const canSee = circCanManage();
  return `<div class="card" style="margin-bottom:14px"><div class="card-body">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div style="font-weight:800;font-size:14px">${orgEsc(r.title)}</div>
      <span style="font-size:11.5px;font-weight:800;color:${col};border:1px solid ${col};border-radius:20px;padding:2px 10px">${orgEsc(st)}</span>
    </div>
    <div style="font-size:12px;color:var(--gray3);margin:4px 0">${isAgm ? `جمعية ${orgEsc(r.kind || "")}${r.special_matter ? " — قرار خاص" : ""}` : "مجلس الإدارة"} · النسبة المطلوبة ${r.required_pct}% من ${isAgm ? "إجمالي حقوق التصويت" : "أعضاء المجلس"} · ${r.deadline ? "المهلة حتى " + new Date(r.deadline).toLocaleString("ar-SA-u-ca-gregory") : "بلا مهلة"}</div>
    ${r.resolution_text ? `<div style="font-size:13px;line-height:1.9;margin:8px 0;white-space:pre-line">${orgEsc(r.resolution_text)}</div>` : ""}
    ${circAttachmentsHTML(r)}
    <div style="position:relative;height:12px;background:#eef1f6;border-radius:8px;margin:12px 0 6px;overflow:hidden">
      <div style="height:100%;width:${bar}%;background:${ev.passedNow ? "var(--green)" : "var(--primary)"}"></div>
      <div style="position:absolute;top:0;bottom:0;width:2px;background:#c0392b;right:${100 - reqBar}%"></div>
    </div>
    <div style="font-size:12px">موافِق: <b>${fmt(ev.yesW)}</b> ${ev.unit} (${ev.pctYes.toFixed(1)}%) · معارض: ${fmt(ev.noW)} · ممتنع: ${fmt(ev.absW)} · الإجمالي المرجعي: ${fmt(ev.base)} ${ev.unit} — الخط الأحمر هو النسبة المطلوبة</div>
    ${r.result_note ? `<div style="font-size:12px;margin-top:6px;color:${col}">${orgEsc(r.result_note)}</div>` : ""}
    ${st === "طُلب اجتماع" ? '<div style="font-size:12px;margin-top:4px">يُعرض القرار على المجلس في أول اجتماع تالٍ لمناقشته.</div>' : ""}
    ${st === "معتمد" && !isAgm ? '<div style="font-size:12px;margin-top:4px">يُعرض هذا القرار على المجلس في أول اجتماع تالٍ لإثباته في محضره.</div>' : ""}
    ${voteUI}
    ${canSee && votes.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px">سجل الأصوات (${votes.length})</summary><div style="overflow-x:auto"><table class="tbl" style="margin-top:6px"><thead><tr><th>الاسم</th>${isAgm ? "<th>الأسهم</th>" : ""}<th>الصوت</th><th>الوقت</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : ""}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      ${circCanPrint() ? `<button class="btn-xs sec" onclick="circPrint(${r.id})">${r.status === "معتمد" ? "📄 إصدار القرار" : "🖨 سجل القرار"}</button>` : ""}
      ${canSee && open ? `<button class="btn-xs sec" onclick="circCancel(${r.id})">إلغاء القرار</button>` : ""}
    </div>
  </div></div>`;
}

async function circVote(id, vote){
  const me = await circMe(); if(!me.email){ alert("تعذّر تحديد هويتك"); return; }
  const { data: res } = await sb.from("circulation_resolutions").select("*").eq("id", id).single();
  if(!res || res.status !== "مفتوح"){ alert("هذا القرار لم يعد مفتوحاً للتصويت."); loadCirculation(); return; }
  if(res.deadline && new Date(res.deadline) < new Date()){ alert("انتهت مهلة التصويت."); loadCirculation(); return; }
  const isAgm = res.body === "الجمعية العامة";
  const person = isAgm ? me.shareholder : me.board;
  if(!person){ alert("لا يوجد سجل مرتبط بحسابك للتصويت."); return; }
  const meetEl = document.getElementById("circMeet-" + id);
  const wants = !!(meetEl && meetEl.checked);
  let justification = null;
  if(wants){ justification = await uiPrompt("اكتب سبب طلب الاجتماع (يُحفظ مع صوتك):", ""); if(justification === null) return; }
  if(!await uiConfirm(`تأكيد التصويت «${vote}»${wants ? " مع طلب اجتماع" : ""}؟ لا يمكن تعديله بعد الإرسال.`)) return;
  const { error } = await sb.from("circulation_votes").insert([{
    resolution_id: id, company_id: currentCompanyId, voter_email: me.email, voter_name: person.name,
    shares: isAgm ? Number(person.shares_count) || 0 : null, vote, justification, requested_meeting: wants
  }]);
  if(error){ alert(/duplicate|unique/i.test(error.message) ? "سبق أن صوّتّ على هذا القرار." : "تعذّر التسجيل: " + error.message); loadCirculation(); return; }
  logActivity("تصويت", "قرار تمرير", res.title, vote);
  loadCirculation();
}

async function circCancel(id){
  if(!await uiConfirm("إلغاء قرار التمرير؟ لن يُحتسب.")) return;
  await sb.from("circulation_resolutions").update({ status: "ملغى", closed_at: new Date().toISOString(), result_note: "أُلغي من مدير النظام/الرئاسة" }).eq("id", id);
  loadCirculation();
}

function circOpenNew(){
  let m = document.getElementById("m-circ-new");
  if(!m){
    m = document.createElement("div"); m.className = "modal-bg"; m.id = "m-circ-new";
    m.innerHTML = `<div class="modal"><div class="modal-title" id="circNewTitle">قرار تمرير جديد</div>
      <div class="fg"><label>عنوان القرار</label><input class="fi" id="cn-title"/></div>
      <div class="fg"><label>نص القرار</label><textarea class="fta" id="cn-text" rows="4" oninput="circSuggest()"></textarea></div>
      <div id="cn-board-fields" class="fg" style="display:none"><label>سبب الاستعجال (يجوز التمرير في الأمور العاجلة فقط)</label><textarea class="fta" id="cn-urgent" rows="2"></textarea></div>
      <div id="cn-agm-fields">
        <div class="row2"><div class="fg"><label>نوع الجمعية</label><select class="fs" id="cn-kind" onchange="circSuggest()"><option>عادية</option><option>غير عادية</option></select></div>
        <div class="fg"><label style="display:block">قرار خاص (٧٥%)</label><label style="font-size:12px"><input type="checkbox" id="cn-special" onchange="circSuggest()"> زيادة/تخفيض رأس المال، تمديد المدة، حل، اندماج، تقسيم</label></div></div>
      </div>
      <div class="fg"><label>المستند المرفق <span style="color:var(--red)">*</span> (إلزامي، ويراه المصوّتون قبل التصويت)</label><input type="file" class="fi" id="cn-files" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"/><div style="font-size:11px;color:var(--gray3);margin-top:4px">مثل: عرض، تقرير، عقد، أو أي مستند يشرح موضوع القرار. يمكن رفع أكثر من ملف.</div></div>
      <div class="row2"><div class="fg"><label>النسبة المطلوبة (%)</label><input type="number" class="fi" id="cn-req" step="0.01"/><div id="cn-req-note" style="font-size:11px;color:var(--gray3);margin-top:4px"></div></div>
      <div class="fg"><label>مهلة التصويت</label><input type="datetime-local" class="fi" id="cn-deadline"/></div></div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="document.getElementById('m-circ-new').classList.remove('open')">إلغاء</button><button class="btn btn-gold" onclick="circCreate()">إطلاق التصويت</button></div></div>`;
    document.body.appendChild(m);
  }
  const isAgm = circTab === "الجمعية العامة";
  document.getElementById("circNewTitle").textContent = isAgm ? "قرار تمرير للجمعية العامة" : "قرار تمرير لمجلس الإدارة";
  document.getElementById("cn-agm-fields").style.display = isAgm ? "" : "none";
  document.getElementById("cn-board-fields").style.display = isAgm ? "none" : "";
  document.getElementById("cn-urgent").value = "";
  ["cn-title","cn-text","cn-deadline"].forEach(i => document.getElementById(i).value = "");
  { const f = document.getElementById("cn-files"); if(f) f.value = ""; }
  document.getElementById("cn-special").checked = false;
  circSuggest(true);
  m.classList.add("open");
}
function circSuggest(initial){
  const isAgm = circTab === "الجمعية العامة";
  const reqEl = document.getElementById("cn-req"), note = document.getElementById("cn-req-note");
  if(!isAgm){ if(initial || !reqEl.value) reqEl.value = 50; reqEl.min = 50; note.textContent = "نظام الشركات: موافقة أغلبية أصوات الأعضاء (أكثر من 50%)، ما لم ينص النظام الأساس على نسبة أو عدد أكبر — يمكنك رفعها ولا يمكن خفضها."; return; }
  const kind = document.getElementById("cn-kind").value, text = document.getElementById("cn-text").value;
  const sp = document.getElementById("cn-special");
  if(AGM_SPECIAL_RE.test(text) && kind === "غير عادية") sp.checked = true;
  const law = kind === "غير عادية" ? 75 : 50;
  reqEl.value = law; reqEl.min = law;
  note.textContent = kind === "غير عادية" ? "نظام الشركات (م101): 75% على الأقل من حقوق التصويت لكل أسهم الشركة." : "نظام الشركات (م101): أغلبية حقوق التصويت (أكثر من 50%) لكل أسهم الشركة. يمكن رفعها إن نصّ النظام الأساس.";
}
/* رفع ملفات قرار التمرير (يُرجع [{name,url}] أو null عند الفشل) */
async function circUploadFiles(inputEl){
  const out = [];
  for(const file of Array.from(inputEl.files || [])){
    if(file.size > 50 * 1024 * 1024){ alert(`الملف "${file.name}" أكبر من الحد المسموح (50 ميجا).`); return null; }
    const safe = Date.now() + "_" + out.length + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = currentCompanyId + "/circulation/" + safe;
    const { error } = await sb.storage.from("documents").upload(path, file);
    if(error){ alert("تعذّر رفع الملف \"" + file.name + "\": " + error.message); return null; }
    const { data, error: sErr } = await sb.storage.from("documents").createSignedUrl(path, 315360000);
    if(sErr || !data){ alert("تعذّر إنشاء رابط آمن للملف: " + (sErr ? sErr.message : "")); return null; }
    out.push({ name: file.name, url: data.signedUrl });
  }
  return out;
}
function circAttachmentsHTML(r){
  const a = Array.isArray(r.attachments) ? r.attachments : [];
  if(!a.length) return "";
  return `<div style="margin:8px 0;padding:8px 10px;background:#F6F8FB;border-radius:8px;font-size:12px"><b>المستندات المرفقة (اطّلع عليها قبل التصويت):</b>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${a.map(f => `<a class="btn-xs primary" href="${orgEsc(f.url)}" target="_blank" rel="noopener">${orgEsc(f.name)}</a>`).join("")}</div></div>`;
}
async function circCreate(){
  const isAgm = circTab === "الجمعية العامة";
  const title = document.getElementById("cn-title").value.trim(), text = document.getElementById("cn-text").value.trim();
  const req = Number(document.getElementById("cn-req").value), dl = document.getElementById("cn-deadline").value;
  if(!title){ alert("اكتب عنوان القرار"); return; }
  if(!text){ alert("اكتب نص القرار"); return; }
  if(!req || req <= 0 || req > 100){ alert("النسبة المطلوبة غير صحيحة"); return; }
  const kind = isAgm ? document.getElementById("cn-kind").value : null;
  const urgent = isAgm ? "" : document.getElementById("cn-urgent").value.trim();
  if(!isAgm && !urgent){ alert("اكتب سبب الاستعجال: قرارات المجلس بالتمرير تجوز في الأمور العاجلة فقط."); return; }
  if(!isAgm && req < 50){ alert("لا يجوز أن تقل النسبة عن أغلبية أصوات الأعضاء (50%)."); return; }
  if(isAgm && req < (kind === "غير عادية" ? 75 : 50)){ alert("النسبة أقل من الحد النظامي لقرار التمرير."); return; }
  if(isAgm && circIsListed()){ alert("قرارات التمرير للجمعية العامة لا تُتاح للشركات المدرجة."); return; }
  const filesInput = document.getElementById("cn-files");
  if(!filesInput || !filesInput.files || !filesInput.files.length){ alert("المستند المرفق إلزامي: أرفق الملف الذي يشرح موضوع القرار ليطّلع عليه المصوّتون."); return; }
  const attachments = await circUploadFiles(filesInput);
  if(!attachments) return;
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from("circulation_resolutions").insert([{ company_id: currentCompanyId, body: circTab, kind, title, attachments, resolution_text: (urgent ? "سبب الاستعجال: " + urgent + "\n\n" : "") + text,
    special_matter: isAgm && document.getElementById("cn-special").checked, required_pct: req, deadline: dl ? new Date(dl).toISOString() : null, created_by: u && u.user ? u.user.email : null }]);
  if(error){ alert("تعذّر الإنشاء: " + error.message); return; }
  logActivity("إنشاء", "قرار تمرير", title, circTab);
  document.getElementById("m-circ-new").classList.remove("open");
  loadCirculation();
}

async function circPrint(id){
  const [{ data: r }, { data: v }, { data: co }] = await Promise.all([
    sb.from("circulation_resolutions").select("*").eq("id", id).single(),
    sb.from("circulation_votes").select("*").eq("resolution_id", id).order("created_at", { ascending: true }),
    sb.from("companies").select("name,total_shares").eq("id", currentCompanyId).single()
  ]);
  const { data: bm } = await sb.from("board_members").select("status").eq("company_id", currentCompanyId);
  const ev = circEvaluate(r, v || [], { totalShares: co.total_shares, boardCount: (bm || []).filter(m => !/مستقيل|منتهي/.test(m.status || "")).length });
  const isAgm = r.body === "الجمعية العامة", fmt = n => Number(n).toLocaleString("ar-SA-u-ca-gregory");
  if(r.status === "معتمد"){
    const w2 = openPrintWindow(); if(!w2){ alert("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    const dt = new Date(r.closed_at || Date.now()), dstr = dt.toLocaleDateString("ar-SA-u-ca-gregory", { day:"numeric", month:"long", year:"numeric" });
    const body = isAgm ? "الجمعية العامة " + (r.kind || "") : "مجلس الإدارة";
    const yes = (v || []).filter(x => x.vote === "موافق");
    const no = (v || []).filter(x => x.vote === "معارض").length, abs = (v || []).filter(x => x.vote === "ممتنع").length;
    const ref = "ق.ت/" + dt.getFullYear() + "/" + String(r.id).padStart(3, "0");
    const basis = isAgm
      ? `وحيث إن الشركة غير مدرجة، وإعمالاً لأحكام نظام الشركات في شأن قرارات الجمعية العامة بالتمرير، وبناءً على ما ورد في نظام الشركة الأساس؛ فقد وافق على القرار الآتي مساهمون يمثلون <b>${ev.pctYes.toFixed(2)}%</b> من إجمالي حقوق التصويت (${fmt(ev.yesW)} من ${fmt(ev.base)} سهماً)، وهي نسبة تبلغ النصاب المقرَّر لهذا النوع من القرارات (${r.required_pct}%).`
      : `وإعمالاً لأحكام نظام الشركات ونظام الشركة الأساس في شأن قرارات المجلس بالتمرير في الحالات المستعجلة، وبعد عرض القرار على جميع أعضاء المجلس كتابةً، دون أن يطلب أي منهم اجتماع المجلس لمناقشته؛ فقد وافق على القرار الآتي <b>${fmt(ev.yesW)}</b> من أصل <b>${fmt(ev.base)}</b> أعضاء، أي <b>${ev.pctYes.toFixed(2)}%</b> من إجمالي أعضاء المجلس (المطلوب ${r.required_pct}%).`;
    w2.document.open();
    w2.document.write(`<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>قرار بالتمرير</title><style>body{font-family:Tajawal,Arial,sans-serif;padding:40px 50px;color:#0D2447;line-height:2.1;font-size:14px}h1{text-align:center;font-size:22px;margin:0}h2{text-align:center;font-size:15px;font-weight:600;margin:4px 0 18px;color:#555}.meta{display:flex;justify-content:space-between;border-top:3px solid #D4AF37;border-bottom:1px solid #ccc;padding:6px 0;font-size:13px}.dec{border:1px solid #1A3A6B;border-radius:6px;padding:14px 18px;margin:16px 0;background:#f8f9fc;white-space:pre-line}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:6px;font-size:12px;text-align:center}th{background:#1A3A6B;color:#fff}.sig{display:flex;gap:40px;margin-top:60px}.sig div{flex:1;border-top:1px solid #555;text-align:center;padding-top:6px;font-size:12px}.foot{font-size:11px;color:#666;margin-top:20px}</style></head><body>
    <h1>${orgEsc(co.name)}</h1><h2>قرار ${isAgm ? "الجمعية العامة" : "مجلس الإدارة"} بالتمرير</h2>
    <div class="meta"><span><b>الرقم:</b> ${ref}</span><span><b>تاريخ الإصدار:</b> ${dstr}</span></div>
    <p><b>الموضوع:</b> ${orgEsc(r.title)}</p>
    <p>${basis}</p>
    <p><b>نصّ القرار:</b></p>
    <div class="dec">${orgEsc(r.resolution_text || r.title)}</div>
    <p>وعليه، <b>صدر هذا القرار بالتمرير</b> ${isAgm ? "من الجمعية العامة" : "من مجلس الإدارة"} بتاريخ ${dstr}، ويُعدّ نافذاً من تاريخ صدوره، ${isAgm ? "ويُدوَّن في سجل قرارات الجمعية العامة" : "ويُعرض على المجلس في أول اجتماع تالٍ لإثباته في محضره"}.</p>
    <p><b>نتيجة التصويت:</b> موافق ${fmt(yes.length)} · معارض ${fmt(no)} · ممتنع ${fmt(abs)}.</p>
    <table><thead><tr><th>الاسم</th>${isAgm ? "<th>الأسهم</th>" : ""}<th>الصوت</th><th>وقت التصويت</th></tr></thead><tbody>${(v || []).map(x => `<tr><td>${orgEsc(x.voter_name || x.voter_email)}</td>${isAgm ? `<td>${fmt(x.shares || 0)}</td>` : ""}<td>${orgEsc(x.vote)}</td><td>${new Date(x.created_at).toLocaleString("ar-SA-u-ca-gregory")}</td></tr>`).join("")}</tbody></table>
    <div class="sig"><div>رئيس ${isAgm ? "الجمعية" : "المجلس"}</div><div>${isAgm ? "أمين سر الجمعية" : "أمين سر المجلس"}</div></div>
    <p class="foot">صدر هذا القرار إلكترونياً عبر منصة حوكم، والأصوات مسجَّلة بحسابات أصحابها ولا يمكن تعديلها بعد إرسالها.</p></body></html>`);
    w2.document.close();
    return;
  }
  const w = openPrintWindow(); if(!w){ alert("اسمح بالنوافذ المنبثقة للطباعة"); return; }
  w.document.open();
  w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سجل قرار بالتمرير</title><style>body{font-family:Tajawal,Arial,sans-serif;padding:30px;color:#0D2447;line-height:1.9}h1{font-size:20px;border-bottom:3px solid #D4AF37;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:7px;font-size:12px;text-align:center}th{background:#1A3A6B;color:#fff}.sig{display:flex;gap:40px;margin-top:50px}.sig div{flex:1;border-top:1px solid #555;text-align:center;padding-top:6px;font-size:12px}</style></head><body>
  <h1>سجل قرار بالتمرير — ${orgEsc(co.name)}</h1>
  <p><b>الجهة:</b> ${isAgm ? "الجمعية العامة " + orgEsc(r.kind || "") : "مجلس الإدارة"} &nbsp;|&nbsp; <b>الحالة:</b> ${orgEsc(r.status)}</p>
  <p><b>القرار:</b> ${orgEsc(r.title)}</p><p style="white-space:pre-line">${orgEsc(r.resolution_text || "")}</p>
  <p><b>النسبة المطلوبة:</b> ${r.required_pct}% من ${isAgm ? "إجمالي حقوق التصويت (" + fmt(ev.base) + " سهم)" : "أعضاء المجلس (" + fmt(ev.base) + ")"} &nbsp;|&nbsp; <b>المحقَّق:</b> ${ev.pctYes.toFixed(2)}% (${fmt(ev.yesW)} ${ev.unit})</p>
  ${r.result_note ? `<p><b>النتيجة:</b> ${orgEsc(r.result_note)}</p>` : ""}
  <table><thead><tr><th>الاسم</th>${isAgm ? "<th>الأسهم</th>" : ""}<th>الصوت</th><th>وقت التصويت</th></tr></thead><tbody>${(v || []).map(x => `<tr><td>${orgEsc(x.voter_name || x.voter_email)}</td>${isAgm ? `<td>${fmt(x.shares || 0)}</td>` : ""}<td>${orgEsc(x.vote)}${x.requested_meeting ? " (طلب اجتماعاً)" : ""}</td><td>${new Date(x.created_at).toLocaleString("ar-SA-u-ca-gregory")}</td></tr>`).join("")}</tbody></table>
  <p style="font-size:11px;color:#666;margin-top:14px">أُنشئ هذا السجل من منصة حوكم. الأصوات مسجّلة مرة واحدة ولا يمكن تعديلها. يُثبَّت القرار في محضر أول اجتماع تالٍ ويُدوَّن في السجل الخاص بالقرارات.</p>
  <div class="sig"><div>رئيس ${isAgm ? "الجمعية" : "المجلس"}</div><div>${isAgm ? "أمين سر الجمعية" : "أمين سر المجلس"}</div></div></body></html>`);
  w.document.close();
}
