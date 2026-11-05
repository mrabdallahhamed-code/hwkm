/* ══════════ VOTES ══════════ */
let companySettings = { total_capital: null, total_shares: null };
async function loadCompanySettings(){
  const { data, error } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  if(!error && data) companySettings = data;
  const info = document.getElementById("companyCapitalInfo");
  if(info){
    const cap = companySettings.total_capital ? Number(companySettings.total_capital).toLocaleString("ar-SA-u-ca-gregory") + " ريال" : "—";
    const sh = companySettings.total_shares ? Number(companySettings.total_shares).toLocaleString("ar-SA-u-ca-gregory") : "—";
    info.innerHTML = `🏢 رأس مال الشركة: <b>${cap}</b> &nbsp;·&nbsp; إجمالي عدد أسهم الشركة: <b>${sh}</b>`;
  }
}
function pct(n, d){ return d ? ((n/d)*100).toFixed(1)+"%" : "0%"; }

/* Main entry point when navigating to the voting page: picks which AGM meeting we're
   voting in (or shows an empty state), then loads that meeting's topics + results. */
// Looks up the CURRENT user's real, verified record in the shareholders registry (matched via
// claimed_by_email at signup) rather than relying on self-reported name/shares typed during
// registration — this also correctly covers a board member who is separately a shareholder too,
// since it doesn't depend on which "account type" they originally picked at signup.
async function autofillShareholderVoteFields(){
  const nameEl = document.getElementById('gm-shareholder-name');
  const sharesEl = document.getElementById('gm-shares-count');
  if(!nameEl || !sharesEl) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  if(!email || !currentCompanyId) return;
  const { data: rows } = await sb.from("shareholders").select("name,shares_count")
    .eq("company_id", currentCompanyId).ilike("claimed_by_email", likeEsc(email)).limit(1);
  const sh = Array.isArray(rows) && rows.length ? rows[0] : null;
  nameEl.value = sh ? (sh.name || "") : "";
  sharesEl.value = sh && sh.shares_count != null ? sh.shares_count : "";
  nameEl.disabled = true; sharesEl.disabled = true;
  nameEl.style.background = "var(--gray1)"; sharesEl.style.background = "var(--gray1)";
  let note = document.getElementById("gm-registry-note");
  if(!note){ note = document.createElement("div"); note.id = "gm-registry-note"; note.style.cssText = "font-size:11.5px;margin-top:6px;line-height:1.8"; sharesEl.parentElement.parentElement.appendChild(note); }
  note.style.color = sh ? "var(--green)" : "var(--red)";
  note.textContent = sh ? "الاسم وعدد الأسهم مأخوذان من سجل المساهمين المعتمد." : "لا يوجد سجل مساهم مرتبط بحسابك. تواصل مع مدير الشركة لاعتماد انضمامك وربطك بسجلك قبل التصويت.";
}

async function loadAgmStrictToggle(){
  const row = document.getElementById("agmStrictRow"), chk = document.getElementById("agmStrictToggle");
  if(!row || !chk || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("agm_strict_voting").eq("id", currentCompanyId).maybeSingle();
  if(error || !data || !("agm_strict_voting" in data)){ row.style.display = "none"; return; }
  chk.checked = data.agm_strict_voting === true; row.style.display = "block";
}
async function loadShReportsToggle(){
  const row = document.getElementById("shReportsRow"), chk = document.getElementById("shReportsToggle");
  if(!row || !chk || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("shareholders_see_reports").eq("id", currentCompanyId).maybeSingle();
  if(error || !data || !("shareholders_see_reports" in data)){ row.style.display = "none"; return; }
  chk.checked = data.shareholders_see_reports === true; row.style.display = "block";
}
async function saveShReports(on){
  const { error } = await sb.from("companies").update({ shareholders_see_reports: !!on }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر حفظ الإعداد: " + error.message); loadShReportsToggle(); return; }
  logActivity("تعديل", "إعداد الجمعية", "تقارير الحوكمة للمساهمين", on ? "إظهار" : "إخفاء");
  uiToast(on ? "ستظهر «تقارير الحوكمة» للمساهمين عند دخولهم القادم." : "أُخفيت «تقارير الحوكمة» عن المساهمين.");
}
async function saveAgmStrict(on){
  const { error } = await sb.from("companies").update({ agm_strict_voting: !!on }).eq("id", currentCompanyId);
  if(error){ alert("تعذّر حفظ الإعداد: " + error.message); loadAgmStrictToggle(); return; }
  logActivity("تعديل", "إعداد الجمعية", "تصويت صارم", on ? "تفعيل" : "إيقاف");
  alert(on ? "تم تفعيل التصويت الصارم لهذه الشركة ✅" : "تم إيقاف التصويت الصارم.");
}
async function loadVotingPage(){
  const isOverseer = getCurrentRole() === 'مدير النظام';
  if(isOverseer){ loadAgmStrictToggle(); loadShReportsToggle(); loadQuorumSettings(); }
  const selfSection = document.getElementById("voterSelfSection");
  if(selfSection) selfSection.style.display = isOverseer ? "none" : "block";
  const adminSection = document.getElementById("voterAdminSection");
  if(adminSection) adminSection.style.display = isOverseer ? "block" : "none";

  if(!isOverseer){ loadDocumentTemplates(); autofillShareholderVoteFields(); }
  const titleEl = document.getElementById("votingMeetingTitle");
  const banner = document.getElementById("votingNotOpenBanner");
  const topicsBox = document.getElementById("votingTopicsContainer");

  if(!currentVotingMeetingId){
    const { data: agms } = await sb.from("meetings").select("*").eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").order("meeting_date",{ascending:false});
    if(agms && agms.length){
      const todayStr = new Date().toISOString().slice(0,10);
      const upcoming = agms.filter(m=>m.meeting_date && m.meeting_date>=todayStr).sort((a,b)=>(a.meeting_date||"").localeCompare(b.meeting_date||""));
      currentVotingMeetingId = upcoming.length ? upcoming[0].id : agms[0].id;
    }
  }

  if(!currentVotingMeetingId){
    if(titleEl) titleEl.textContent = "لا توجد جمعية عامة بعد";
    if(banner) banner.style.display = "none";
    if(topicsBox) topicsBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">أنشئ جمعية عامة أولًا من صفحة "الجمعية العامة".</div>';
    return;
  }

  const { data: m, error } = await sb.from("meetings").select("*").eq("id", currentVotingMeetingId).single();
  if(error || !m){
    if(titleEl) titleEl.textContent = "تعذّر تحميل بيانات الجمعية";
    return;
  }

  if(titleEl) titleEl.textContent = `${orgEsc(m.title||"جمعية عامة")} — ${m.meeting_date||""}`;

  if(isOverseer){
    loadCompanySettings().then(() => { loadVoteResults(); loadShareholdersSummary(); });
    return;
  }

  // Gate voting using the dedicated voting_start / voting_end window (set manually when
  // the AGM was created, or later from its detail view) — topics are fully hidden outside it.
  const now = new Date();
  const votingStart = m.voting_start ? new Date(m.voting_start) : null;
  const votingEnd = m.voting_end ? new Date(m.voting_end) : null;
  const notYetOpen = votingStart && now < votingStart;
  const alreadyClosed = votingEnd && now > votingEnd;
  const isOpen = !notYetOpen && !alreadyClosed;

  if(banner){
    if(notYetOpen){
      banner.style.display = "block";
      banner.textContent = `⏳ التصويت يبدأ بتاريخ ${votingStart.toLocaleDateString("ar-SA-u-ca-gregory")} — الساعة ${votingStart.toLocaleTimeString("ar-SA-u-ca-gregory",{hour:'2-digit',minute:'2-digit'})}`;
    } else if(alreadyClosed){
      banner.style.display = "block";
      banner.textContent = `🔒 انتهى التصويت بتاريخ ${votingEnd.toLocaleDateString("ar-SA-u-ca-gregory")} — الساعة ${votingEnd.toLocaleTimeString("ar-SA-u-ca-gregory",{hour:'2-digit',minute:'2-digit'})}`;
    } else {
      banner.style.display = "none";
    }
  }

  if(topicsBox){
    if(!isOpen){
      topicsBox.innerHTML = "";
    } else {
      const { data: topics, error: topErr } = await sb.from("vote_topics").select("*").eq("meeting_id", currentVotingMeetingId).order("sort_order",{ascending:true}).order("id",{ascending:true});
      if(topErr){ topicsBox.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل البنود</div>'; }
      else if(!topics || topics.length===0){ topicsBox.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px">لم تُضَف بنود لهذه الجمعية بعد.</div>'; }
      else {
        topicsBox.innerHTML = topics.map((t,i) => `
          <div style="background:var(--offwhite);border-radius:10px;padding:12px;border-right:4px solid var(--primary)">
            <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:2px">البند ${i+1}</div>
            <div style="font-size:13px;font-weight:700;margin-bottom:6px">${orgEsc(t.topic_text)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','موافق')" style="font-size:11px;padding:4px 12px">موافق</button>
              <button class="btn btn-ghost" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','معارض')" style="font-size:11px;padding:4px 12px;border:1px solid var(--red);color:var(--red)">معارض</button>
              <button class="btn btn-ghost" onclick="voteItem(this,'${orgEsc(t.topic_text.replace(/'/g,"\\'"))}','ممتنع')" style="font-size:11px;padding:4px 12px">ممتنع</button>
            </div>
          </div>`).join("");
      }
    }
  }

  await loadElectionVotingSection(isOpen);

  // إغلاق أزرار التصويت إذا وقّع المساهم بطاقته
  if(!isOverseer && isOpen){
    const nmEl = document.getElementById('gm-shareholder-name');
    const nm = nmEl ? nmEl.value.trim() : "";
    if(nm && await isVoteLockedFor(nm)){
      ["votingTopicsContainer","votingElectionContainer"].forEach(id => {
        const box = document.getElementById(id);
        if(!box) return;
        box.querySelectorAll("button,input").forEach(el => { el.disabled = true; el.style.opacity = "0.45"; el.style.cursor = "not-allowed"; });
        box.querySelectorAll("button[onclick*='submitElectionAllocation']").forEach(el => el.remove());
      });
      const tb = document.getElementById("votingTopicsContainer");
      if(tb && !document.getElementById("voteLockedNote")){
        tb.insertAdjacentHTML("afterbegin", '<div id="voteLockedNote" style="background:#E8F8EF;color:var(--green);border-radius:10px;padding:10px 12px;font-size:12px;font-weight:800;margin-bottom:8px"><span class="ico-i ico-check"></span>تم تسجيل تصويتك وتوقيع بطاقتك، وأُغلق التصويت عليك.</div>');
      }
    }
  }

  await loadCompanySettings();
  if(isOverseer){
    loadVoteResults();
    loadShareholdersSummary();
  } else {
    loadMyVoteHistory();
  }
}

/* Shareholder's own past voting record — every topic they've voted on, across every
   general assembly of this company. Shareholders never see other voters' choices,
   aggregate results, or the quorum table — those are restricted to the system admin. */
async function loadMyVoteHistory(){
  const tbody = document.getElementById("myVoteHistoryTbody");
  if(!tbody) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  if(!email || !currentCompanyId){ tbody.innerHTML = emptyRowHTML(3, "تعذّر تحديد هويتك."); return; }
  const { data: sh } = await sb.from("shareholders").select("name")
    .eq("company_id", currentCompanyId).eq("claimed_by_email", email).maybeSingle();
  if(!sh || !sh.name){ tbody.innerHTML = emptyRowHTML(3, "لم يتم العثور على سجل مساهم مرتبط بحسابك."); return; }

  const { data: votes, error } = await sb.from("votes").select("meeting_id, meetings(title,meeting_date)")
    .eq("company_id", currentCompanyId).eq("shareholder_name", sh.name).order("id",{ascending:false});
  if(error){ tbody.innerHTML = errorRowHTML(3, error.message); return; }
  const byMeeting = new Map();
  (votes||[]).forEach(v => { if(v.meeting_id && !byMeeting.has(v.meeting_id)) byMeeting.set(v.meeting_id, v.meetings || {}); });
  if(byMeeting.size===0){ tbody.innerHTML = emptyRowHTML(3, "لا يوجد لديك تصويت مسجّل بعد."); return; }
  const nm = String(sh.name).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  tbody.innerHTML = [...byMeeting.entries()].map(([mid, m]) => `<tr>
    <td>${orgEsc(m.title || "—")}</td>
    <td>${m.meeting_date || "—"}</td>
    <td style="text-align:center"><button class="btn-xs primary" onclick="openVoterSignedCard('${nm}', ${Number(mid)})"><span class="ico-i ico-document"></span>عرض بطاقة التصويت</button></td>
  </tr>`).join("");
}

/* Aggregated results per agenda item, weighted by shares & percentage of capital —
   scoped to the AGM meeting currently open on this page. */
async function loadVoteResults(){
  const tbody = document.getElementById("voteResultsTbody");
  if(!tbody) return;
  if(!currentVotingMeetingId){ tbody.innerHTML = emptyRowHTML(7, "لا توجد جمعية محددة."); return; }
  const { data, error } = await sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", currentVotingMeetingId).not("shareholder_name","is",null);
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  const rows = data || [];
  if(rows.length===0){ tbody.innerHTML = emptyRowHTML(6, "لا توجد أصوات مسجّلة من المساهمين بعد."); return; }
  const totalShares = Number(companySettings.total_shares) || 0;
  let agmTypeForRule = "";
  try { const { data: mm } = await sb.from("meetings").select("agm_type").eq("id", currentVotingMeetingId).maybeSingle(); agmTypeForRule = (mm && mm.agm_type) || ""; } catch(e){}
  let attendedShares = 0;
  try { const { data: at } = await sb.from("agm_attendance").select("shares_asalah,shares_wakala").eq("meeting_id", currentVotingMeetingId); attendedShares = (at||[]).reduce((x,a) => x + (Number(a.shares_asalah)||0) + (Number(a.shares_wakala)||0), 0); } catch(e){}
  const byTopic = {};
  rows.forEach(v => {
    const t = v.topic || "—";
    if(!byTopic[t]) byTopic[t] = { yes:0, no:0, abs:0, voters:0 };
    const shares = Number(v.shares_count)||0;
    byTopic[t].voters += 1;
    if(v.result==="موافق") byTopic[t].yes += shares;
    else if(v.result==="معارض") byTopic[t].no += shares;
    else if(v.result==="ممتنع") byTopic[t].abs += shares;
  });
  tbody.innerHTML = Object.keys(byTopic).map(t => {
    const d = byTopic[t];
    const votedShares = d.yes + d.no + d.abs;
    const represented = attendedShares > 0 ? Math.max(attendedShares, votedShares) : votedShares;
    const ev = agmEvaluateTopic(agmTypeForRule, t, d.yes, represented);
    return `<tr>
      <td>${t}</td>
      <td style="text-align:center">${d.voters}</td>
      <td style="text-align:center">${pct(votedShares, totalShares)}</td>
      <td style="text-align:center;color:var(--green);font-weight:700">${pct(d.yes, votedShares)}</td>
      <td style="text-align:center;color:var(--red);font-weight:700">${pct(d.no, votedShares)}</td>
      <td style="text-align:center;color:var(--orange);font-weight:700">${pct(d.abs, votedShares)}</td>
      <td style="text-align:center;font-size:11.5px;line-height:1.7"><b style="color:${ev.passed ? "var(--green)" : "var(--red)"}">${ev.passed ? "✅ مستوفٍ للأغلبية" : "❌ لم يبلغ الأغلبية"}</b><br>الموافقة ${ev.yesPct.toFixed(1)}% من الممثَّل — المطلوب ${ev.req.pct}%${attendedShares > 0 ? "" : "<br><small style=\"color:var(--gray3)\">محسوبة من الأصوات المسجّلة لعدم تسجيل حضور</small>"}</td>
    </tr>`;
  }).join("");
}

/* Summary table per shareholder — scoped to the currently open AGM meeting */
async function loadShareholdersSummary(){
  const tbody = document.getElementById("shareholdersTbody");
  const tfoot = document.getElementById("shareholdersTfoot");
  const summaryBox = document.getElementById("votingCapitalSummary");
  if(!tbody) return;
  if(!currentVotingMeetingId){ tbody.innerHTML = emptyRowHTML(6, "لا توجد جمعية محددة."); return; }
  const { data, error } = await sb.from("votes").select("*").eq("company_id", currentCompanyId).eq("meeting_id", currentVotingMeetingId).not("shareholder_name","is",null);
  if(error){ tbody.innerHTML = errorRowHTML(6, error.message); return; }
  const rows = data || [];
  if(rows.length===0){
    tbody.innerHTML = emptyRowHTML(7, "لا يوجد مساهمون صوّتوا بعد.");
    if(tfoot) tfoot.innerHTML = "";
    if(summaryBox) summaryBox.textContent = "";
    return;
  }
  const totalShares = Number(companySettings.total_shares) || 0;
  const byShareholder = {};
  rows.forEach(v => {
    const key = v.shareholder_name || "—";
    if(!byShareholder[key]) byShareholder[key] = { name:key, shares:Number(v.shares_count)||0, yes:0, no:0, abs:0, lastId:v.id };
    if(v.id >= byShareholder[key].lastId){
      byShareholder[key].shares = Number(v.shares_count)||0;
      byShareholder[key].lastId = v.id;
    }
    if(v.result==="موافق") byShareholder[key].yes++;
    else if(v.result==="معارض") byShareholder[key].no++;
    else if(v.result==="ممتنع") byShareholder[key].abs++;
  });
  const list = Object.values(byShareholder);
  tbody.innerHTML = list.map(s => `<tr>
    <td>${orgEsc(s.name)}</td>
    <td style="text-align:center">${s.shares}</td>
    <td style="text-align:center">${pct(s.shares, totalShares)}</td>
    <td style="text-align:center;color:var(--green)">${s.yes} بند</td>
    <td style="text-align:center;color:var(--red)">${s.no} بند</td>
    <td style="text-align:center;color:var(--orange)">${s.abs} بند</td>
    <td><button class="btn-xs primary" onclick="openVoterSignedCard('${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-document"></span>عرض/تحميل البطاقة الموقّعة</button>
    <button class="btn-xs" style="margin-top:4px;background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:700" onclick="reopenVoterVoting('${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-warning"></span>فتح التصويت للتعديل</button></td>
  </tr>`).join("");

  const totalVotedShares = list.reduce((sum,s)=>sum+s.shares,0);
  if(tfoot){
    tfoot.innerHTML = `<tr style="background:#EAF0F8;font-weight:800">
      <td>الإجمالي (${list.length} مساهم)</td>
      <td style="text-align:center">${totalVotedShares}</td>
      <td style="text-align:center">${pct(totalVotedShares, totalShares)}</td>
      <td colspan="3" style="text-align:center;font-size:11px;color:var(--gray3)">مجموع مشاركتهم من رأس المال</td>
    </tr>`;
  }
  if(summaryBox){
    const thresholdInput = document.getElementById("quorumThresholdInput");
    const thresholdPct = thresholdInput ? (Number(thresholdInput.value) || 50) : 50;
    const currentPct = totalShares ? (totalVotedShares/totalShares*100) : 0;
    const quorumMet = currentPct >= thresholdPct;
    const sharesNeeded = Math.max(0, Math.ceil(totalShares*thresholdPct/100) - totalVotedShares);
    summaryBox.innerHTML = `
      <div style="margin-bottom:10px"><span class="ico-i ico-users"></span>إجمالي المساهمين المصوّتين: <b>${list.length}</b> &nbsp;·&nbsp; إجمالي الأسهم المشاركة: <b>${totalVotedShares}</b> &nbsp;·&nbsp; ما نسبته: <b>${pct(totalVotedShares, totalShares)}</b> من رأس المال</div>
      <div style="background:${quorumMet?'#E8F8EF':'#FEF3E2'};border:2px solid ${quorumMet?'var(--green)':'var(--gold)'};border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:${quorumMet?'var(--green)':'var(--gold)'}">${currentPct.toFixed(1)}% / ${thresholdPct}%</div>
        <div style="font-size:12px;font-weight:700;color:${quorumMet?'var(--green)':'var(--gold)'};margin-top:4px">
          ${quorumMet ? '✅ اكتمل النصاب المطلوب' : `⏳ متبقٍ (${sharesNeeded.toLocaleString('ar-SA-u-ca-gregory')}) سهم لاكتمال النصاب`}
        </div>
      </div>`;
  }
}

async function saveVote(){
  const topic = document.getElementById("mv-topic").value.trim();
  if(!topic){ alert("الرجاء إدخال موضوع القرار"); return; }
  const result = document.getElementById("mv-result").value;
  const vote_date = document.getElementById("mv-date").value || null;
  const { error } = await sb.from("votes").insert([{ topic, result, vote_date, company_id: currentCompanyId }]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  document.getElementById("mv-topic").value=""; document.getElementById("mv-date").value="";
  closeM("m-vote");
}

/* ══════════ AUDIT ITEMS ══════════ */
let auditCache = [];
/* ══════════ GOVERNANCE EFFECTIVENESS ASSESSMENT (8 axes, 32 criteria, maturity 1-5) ══════════ */
const GOVERNANCE_AXES = [
  { key: "axis_board", title: "المحور الأول: مجلس الإدارة", icon: "🏛️", criteria: [
    { key: "board_composition", label: "تشكيل المجلس", hint: "تنوع الخبرات – الاستقلالية – عدد الأعضاء" },
    { key: "board_performance", label: "أداء المجلس", hint: "التزام الحضور – جودة النقاش – فعالية القرارات" },
    { key: "board_charters", label: "المواثيق والسياسات", hint: "وجود ميثاق مجلس الإدارة – تحديثه" },
    { key: "board_self_eval", label: "تقييم الأداء", hint: "وجود عملية تقييم سنوي للمجلس" },
    { key: "board_mgmt_relation", label: "العلاقة بالإدارة التنفيذية", hint: "وضوح الأدوار – عدم التداخل – مساءلة الرئيس التنفيذي" }
  ]},
  { key: "axis_committees", title: "المحور الثاني: اللجان المتخصصة", icon: "👥", criteria: [
    { key: "audit_committee", label: "لجنة المراجعة", hint: "الاستقلالية – الاجتماعات – التقارير" },
    { key: "risk_committee", label: "لجنة المخاطر", hint: "تقييم المخاطر – رفع التوصيات – كفاءة الاجتماعات" },
    { key: "nom_rem_committee", label: "لجنة الترشيحات والمكافآت", hint: "سياسات التعيين – التعاقب الوظيفي – تقييم الأداء" },
    { key: "governance_committee", label: "لجنة الحوكمة", hint: "متابعة السياسات – دعم الامتثال – تطوير النظام" }
  ]},
  { key: "axis_policies", title: "المحور الثالث: السياسات واللوائح", icon: "📜", criteria: [
    { key: "governance_policies", label: "سياسات الحوكمة", hint: "تضارب المصالح – الإفصاح – السلوك المهني" },
    { key: "risk_policies", label: "سياسات المخاطر", hint: "تصنيف المخاطر – حدود الصلاحيات" },
    { key: "internal_control_policies", label: "سياسات الرقابة الداخلية", hint: "الضوابط – التحديث – الالتزام" },
    { key: "compliance_policies", label: "سياسات الامتثال", hint: "مكافحة الفساد – الالتزام القانوني – التقارير" }
  ]},
  { key: "axis_risk", title: "المحور الرابع: إدارة المخاطر", icon: "⚠️", criteria: [
    { key: "risk_identification", label: "تحديد المخاطر", hint: "شمولية ودقة تحديد المخاطر" },
    { key: "risk_assessment", label: "تقييم المخاطر", hint: "المنهجية – الأدوات – التحليل" },
    { key: "risk_response_plans", label: "خطط الاستجابة", hint: "جودة الخطط – مسؤوليات التنفيذ" },
    { key: "kris", label: "مؤشرات المخاطر (KRIs)", hint: "وجود مؤشرات – متابعة دورية" },
    { key: "risk_reporting", label: "التقارير", hint: "رفع تقارير للمجلس واللجان" }
  ]},
  { key: "axis_audit", title: "المحور الخامس: الرقابة الداخلية والمراجعة", icon: "🔍", criteria: [
    { key: "internal_control_system", label: "نظام الرقابة الداخلية", hint: "فعالية الضوابط – تغطية العمليات" },
    { key: "internal_audit_role", label: "دور المراجعة الداخلية", hint: "الاستقلال – نطاق العمل – التقارير" },
    { key: "external_audit", label: "المراجعة الخارجية", hint: "التواصل مع المجلس – جودة التقارير" },
    { key: "audit_recommendations", label: "تطبيق توصيات التدقيق", hint: "نسبة التنفيذ – جودة المعالجة" }
  ]},
  { key: "axis_disclosure", title: "المحور السادس: الشفافية والإفصاح", icon: "📢", criteria: [
    { key: "report_quality", label: "جودة التقارير", hint: "دقة البيانات – وضوحها – احترافيتها" },
    { key: "disclosure_commitment", label: "الالتزام بالإفصاح", hint: "مواعيد النشر – استجابة لطلبات المساهمين" },
    { key: "communication_channels", label: "قنوات التواصل", hint: "موقع الشركة – البيانات الجوهرية – التقارير السنوية" }
  ]},
  { key: "axis_culture", title: "المحور السابع: الثقافة المؤسسية والسلوك المهني", icon: "🤝", criteria: [
    { key: "integrity_culture", label: "ثقافة النزاهة", hint: "احترام السياسات – مكافحة الفساد – القدوة" },
    { key: "whistleblowing", label: "الإبلاغ عن المخالفات", hint: "وجود سياسة – سرية – حماية المبلّغين" },
    { key: "professional_conduct", label: "الالتزام المهني", hint: "السلوك – الأخلاقيات – احترام التسلسل" }
  ]},
  { key: "axis_digital", title: "المحور الثامن: التحول الرقمي الداعم للحوكمة", icon: "💻", criteria: [
    { key: "risk_mgmt_systems", label: "أنظمة إدارة المخاطر", hint: "أدوات رقمية – BI – تقارير لحظية" },
    { key: "controls_automation", label: "أتمتة الضوابط", hint: "صلاحيات – موافقات – تدقيق إلكتروني" },
    { key: "data_management", label: "إدارة البيانات", hint: "أمان المعلومات – حماية البيانات" },
    { key: "grc_systems", label: "أنظمة GRC", hint: "شمولية التطبيق – التكامل – الفاعلية" }
  ]}
];

const MATURITY_LABELS = { 1:"ضعيف", 2:"أساسي", 3:"جيد", 4:"متقدم", 5:"متميز" };
const MATURITY_COLORS = { 1:"var(--red)", 2:"#E67E22", 3:"var(--gold)", 4:"var(--teal)", 5:"var(--green)" };
function maturityColor(score){
  if(score==null) return "var(--gray3)";
  return MATURITY_COLORS[Math.round(score)] || "var(--gray3)";
}

// Board/committee axes only make sense where a board and real committees actually exist —
// a sole proprietorship has neither, and even a joint-stock company without any committees
// registered shouldn't be nudged into scoring an axis that doesn't apply to it (an assessor
// scoring "no committees" as a 1 would unfairly drag the overall average down for something
// that was never expected to exist in the first place).
async function getGovAssessApplicableAxes(){
  const isSoleProp = currentCompanyType === "مؤسسة فردية";
  const noBoard = isSoleProp || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  const { data: committees } = await sb.from("committees").select("id").eq("company_id", currentCompanyId).limit(1);
  const hasCommittees = !!(committees && committees.length);
  return GOVERNANCE_AXES.filter(axis => {
    if(noBoard && axis.key === "axis_board") return false;
    if(noBoard && axis.key === "axis_committees") return false;
    if(!hasCommittees && axis.key === "axis_committees") return false;
    return true;
  }).map(axis => ({ ...axis, title: displayStageLabel(axis.title) }));
}

function maturityInterpretation(score){
  if(score < 2) return { label: "حوكمة ابتدائية – تحتاج إعادة بناء جذرية", color: "var(--red)" };
  if(score < 3) return { label: "حوكمة ناشئة – تحتاج تطوير شامل", color: "#E67E22" };
  if(score < 4) return { label: "حوكمة معيارية – نظام جيد يحتاج تحسينات", color: "var(--gold)" };
  if(score < 4.5) return { label: "حوكمة متقدمة – فعّالة ومتماسكة", color: "var(--teal)" };
  return { label: "حوكمة رائدة – أفضل الممارسات العالمية", color: "var(--green)" };
}

let govassessEditingId = null;

async function openNewGovAssessment(){
  govassessEditingId = null;
  document.getElementById("ga-id").value = "";
  document.getElementById("ga-period").value = "";
  document.getElementById("ga-date").value = "";
  document.getElementById("ga-assessor").value = "المراجعة الداخلية";
  document.getElementById("govassessFormTitle").textContent = "📊 تقييم فعالية حوكمة جديد";
  await renderGovAxesForm(null);
  { const b = document.getElementById("gaAutoSummary"); if(b) b.innerHTML = ""; }
  document.getElementById("govassessResultsSummary").style.display = "none";
  document.getElementById("govassessListView").style.display = "none";
  document.getElementById("govassessFormView").style.display = "block";
}

function closeGovAssessmentForm(){
  document.getElementById("govassessFormView").style.display = "none";
  document.getElementById("govassessListView").style.display = "block";
  loadGovAssessments();
}

let currentGovAxes = GOVERNANCE_AXES;

async function renderGovAxesForm(existingData){
  currentGovAxes = await getGovAssessApplicableAxes();
  await gaLoadAll();
  const gaCurrentId = document.getElementById("ga-id").value;
  const box = document.getElementById("govassessAxesContainer");
  box.innerHTML = currentGovAxes.map(axis => {
    const savedCriteria = existingData ? (existingData[axis.key]||[]) : [];
    const savedByKey = {}; savedCriteria.forEach(c => { savedByKey[c.key] = c; });
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-head"><span class="card-title">${axis.icon} ${orgEsc(axis.title)}</span></div>
      <div class="card-body">
        <table class="tbl">
          <thead><tr><th style="width:22%">المعيار</th><th style="width:20%">مستوى النضج (١-٥)</th><th style="width:29%">الملاحظات</th><th style="width:29%">الإجراءات التصحيحية</th></tr></thead>
          <tbody>
            ${axis.criteria.map(c => {
              const saved = savedByKey[c.key] || {};
              const initialColor = maturityColor(saved.score);
              return `<tr data-axis="${axis.key}" data-crit="${c.key}">
                <td><b style="font-size:11.5px">${c.label}</b><div style="font-size:10px;color:var(--gray3);margin-top:2px">${c.hint}</div></td>
                <td><select class="fs ga-score-select" style="font-size:12px;padding:6px;font-weight:700;color:${initialColor};border-color:${initialColor}55" onchange="this.style.color=maturityColor(this.value?Number(this.value):null);this.style.borderColor=maturityColor(this.value?Number(this.value):null)+'55'">
                  <option value="">—</option>
                  ${[1,2,3,4,5].map(n=>`<option value="${n}" ${saved.score==n?"selected":""}>${n} — ${MATURITY_LABELS[n]}</option>`).join("")}
                </select></td>
                <td><textarea class="fi ga-notes" rows="2" style="font-size:11.5px;resize:vertical">${orgEsc(saved.notes||"")}</textarea></td>
                <td><textarea class="fi ga-actions" rows="2" style="font-size:11.5px;resize:vertical">${saved.actions||""}</textarea><div class="ga-slot" data-axis="${axis.key}" data-crit="${c.key}">${gaSlotHTML(gaCurrentId, axis.key, c.key)}</div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join("");
}

function collectGovAxesData(){
  const result = {};
  currentGovAxes.forEach(axis => {
    result[axis.key] = axis.criteria.map(c => {
      const row = document.querySelector(`tr[data-axis="${axis.key}"][data-crit="${c.key}"]`);
      const score = row.querySelector(".ga-score-select").value;
      const notes = row.querySelector(".ga-notes").value.trim();
      const actions = row.querySelector(".ga-actions").value.trim();
      return { key: c.key, label: c.label, score: score ? Number(score) : null, notes, actions };
    });
  });
  return result;
}

function computeGovScores(axesData){
  const axisScores = {};
  let allScores = [];
  GOVERNANCE_AXES.forEach(axis => {
    const scored = (axesData[axis.key]||[]).map(c=>c.score).filter(s=>s!=null);
    axisScores[axis.key] = scored.length ? scored.reduce((a,b)=>a+b,0)/scored.length : null;
    allScores = allScores.concat(scored);
  });
  const finalScore = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : null;
  return { axisScores, finalScore };
}

async function saveGovAssessment(){
  const period = document.getElementById("ga-period").value.trim();
  const assessment_date = document.getElementById("ga-date").value || null;
  const assessed_by_type = document.getElementById("ga-assessor").value;
  if(!period){ alert("الرجاء إدخال الفترة محل التقييم"); return; }

  const axesData = collectGovAxesData();
  const payload = {
    company_id: currentCompanyId, period, assessed_by_type, assessment_date,
    axis_board: axesData.axis_board, axis_committees: axesData.axis_committees, axis_policies: axesData.axis_policies,
    axis_risk: axesData.axis_risk, axis_audit: axesData.axis_audit, axis_disclosure: axesData.axis_disclosure,
    axis_culture: axesData.axis_culture, axis_digital: axesData.axis_digital
  };

  const id = document.getElementById("ga-id").value;
  let error;
  if(id){
    ({ error } = await sb.from("governance_assessments").update(payload).eq("id", id));
  } else {
    // Keep the new row's id: before, a second click on Save inserted a duplicate assessment,
    // and corrective actions need a saved assessment to attach to.
    const r = await sb.from("governance_assessments").insert([payload]).select("id").single();
    error = r.error;
    if(!error && r.data){ document.getElementById("ga-id").value = r.data.id; govassessEditingId = r.data.id; }
  }
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  gaRefreshAllSlots();

  const { finalScore } = computeGovScores(axesData);
  logActivity("إنشاء", "تقييم فعالية الحوكمة", period, finalScore!=null ? `النتيجة النهائية: ${finalScore.toFixed(1)}/5` : "");
  renderGovResultsSummary(axesData);
  alert("تم حفظ التقييم بنجاح ✅");
}

function renderGovResultsSummary(axesData){
  const { axisScores, finalScore } = computeGovScores(axesData);
  const box = document.getElementById("govassessResultsSummary");
  if(finalScore == null){ box.style.display = "none"; return; }
  const interp = maturityInterpretation(finalScore);
  box.style.display = "block";
  box.innerHTML = `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><span class="card-title"><span class="ico-i ico-trending"></span>النتيجة النهائية</span></div>
    <div class="card-body">
      <table class="tbl">
        <thead><tr><th>المحور</th><th>الدرجة / 5</th></tr></thead>
        <tbody>
          ${GOVERNANCE_AXES.map(axis => `<tr><td>${axis.icon} ${orgEsc(axis.title.replace(/^المحور [^:]+:\s*/,""))}</td><td>${axisScores[axis.key]!=null ? axisScores[axis.key].toFixed(1) : "—"}</td></tr>`).join("")}
        </tbody>
      </table>
      <div style="margin-top:14px;padding:14px;background:${interp.color}15;border-radius:10px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:${interp.color}">${finalScore.toFixed(1)} / 5</div>
        <div style="font-size:13px;font-weight:700;color:${interp.color};margin-top:4px">${interp.label}</div>
      </div>
    </div>
  </div>`;
}

async function loadGovAssessments(){
  const tbody = document.getElementById("govassessHistoryTbody");
  if(!tbody) return;
  loadGaTracker();
  const { data, error } = await sb.from("governance_assessments").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${error.message}</td></tr>`; return; }
  if(!data || data.length===0){ tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد تقييمات بعد.</td></tr>'; return; }

  tbody.innerHTML = data.map(a => {
    const { finalScore } = computeGovScores(a);
    const interp = finalScore!=null ? maturityInterpretation(finalScore) : null;
    return `<tr>
      <td>${a.period||"—"}</td><td>${a.assessed_by_type||"—"}</td><td>${a.assessment_date||"—"}</td>
      <td>${finalScore!=null?finalScore.toFixed(1)+"/5":"—"}</td>
      <td>${interp?`<span style="color:${interp.color};font-weight:700;font-size:11px">${interp.label}</span>`:"—"}</td>
      <td><button class="btn-xs primary" onclick="viewGovAssessment(${a.id})">عرض/تعديل</button> <button class="btn-xs" onclick="govGapReport(${a.id})">تقرير الفجوات</button></td>
    </tr>`;
  }).join("");
}

async function viewGovAssessment(id){
  const { data: a, error } = await sb.from("governance_assessments").select("*").eq("id", id).single();
  if(error || !a){ alert("تعذّر تحميل التقييم"); return; }
  govassessEditingId = id;
  document.getElementById("ga-id").value = a.id;
  document.getElementById("ga-period").value = a.period || "";
  document.getElementById("ga-date").value = a.assessment_date || "";
  document.getElementById("ga-assessor").value = a.assessed_by_type || "المراجعة الداخلية";
  document.getElementById("govassessFormTitle").textContent = "📊 تعديل تقييم: " + (a.period||"");
  await renderGovAxesForm(a);
  renderGovResultsSummary(a);
  document.getElementById("govassessListView").style.display = "none";
  document.getElementById("govassessFormView").style.display = "block";
}
