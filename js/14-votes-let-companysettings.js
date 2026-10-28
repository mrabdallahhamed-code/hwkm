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
      <td><button class="btn-xs primary" onclick="viewGovAssessment(${a.id})">عرض/تعديل</button></td>
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

/* ══════════ CORRECTIVE ACTION TRACKING (متابعة الإجراءات التصحيحية) ══════════
   An assessment's corrective action used to be free text inside each criterion — nobody owned it,
   nothing had a date, nothing could be closed. Here each one can become its own record with three
   distinct roles (executor / monitor / approver) and a status that only moves in one direction
   except when it is sent back. The checks below run in the app code; the database policy only
   scopes rows to the company, it does not know about these roles. */
const GA_STATUS_STYLE = {
  "لم يبدأ": ["#F1F1F1","var(--gray3)"], "قيد التنفيذ": ["#FEF3E2","var(--gold)"],
  "بانتظار المراجعة": ["#E6EEF8","var(--primary)"], "بانتظار الاعتماد": ["#EFE6F8","#6B3FA0"], "مغلق": ["#E8F8EF","var(--green)"]
};
const GA_TRANSITIONS = {
  "لم يبدأ": [{ to:"قيد التنفيذ", actor:"executor", label:"بدء التنفيذ" }],
  "قيد التنفيذ": [{ to:"بانتظار المراجعة", actor:"executor", label:"إرسال للمراجعة", needNote:true, noteLabel:"ما تم تنفيذه والدليل عليه" }],
  "بانتظار المراجعة": [
    { to:"بانتظار الاعتماد", actor:"monitor", label:"قبول وإحالة للاعتماد" },
    { to:"قيد التنفيذ", actor:"monitor", label:"إعادة للمنفّذ", needNote:true, noteLabel:"سبب الإعادة", ret:true }
  ],
  "بانتظار الاعتماد": [
    { to:"مغلق", actor:"approver", label:"اعتماد وإغلاق" },
    { to:"قيد التنفيذ", actor:"approver", label:"رفض وإعادة للمنفّذ", needNote:true, noteLabel:"سبب الرفض", ret:true }
  ]
};
const GA_ACTOR_LABEL = { executor:"المنفّذ", monitor:"المراقب", approver:"المعتمِد" };
let gaActionsCache = [];
let gaMembersCache = [];

function gaEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function gaMyEmail(){ return currentUserProfile ? currentUserProfile.email : null; }
function gaIsPlatformOwner(){ return !!(currentUserProfile && currentUserProfile.is_platform_admin === true); }
function gaCanManage(){ return gaIsPlatformOwner() || ["مدير النظام","رئيس مجلس","سكرتير المجلس"].includes(getCurrentRole()); }
function gaNoBoard(){ return currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner; }
function gaName(email){ if(!email) return "غير محدَّد"; const m = gaMembersCache.find(x => x.email === email); return m ? m.name : email; }
function gaIsOverdue(a){ return a.status !== "مغلق" && !!a.target_date && new Date(a.target_date) < new Date(new Date().toDateString()); }
function gaCompanyName(){ return document.getElementById("companySwitcher")?.selectedOptions?.[0]?.textContent?.trim() || ""; }

async function gaLoadAll(){
  const [{ data: acts }, { data: ms }] = await Promise.all([
    sb.from("governance_actions").select("*").eq("company_id", currentCompanyId).order("id",{ascending:false}),
    sb.from("user_company_memberships").select("email,role").eq("company_id", currentCompanyId)
  ]);
  gaActionsCache = acts || [];
  const rows = (ms||[]).filter(m => m.role !== "مساهم");
  const emails = rows.map(r => r.email);
  const { data: profs } = emails.length ? await sb.from("user_profiles").select("email,full_name").in("email", emails) : { data: [] };
  const nameBy = {}; (profs||[]).forEach(p => { nameBy[p.email] = p.full_name; });
  gaMembersCache = rows.map(r => ({ email: r.email, role: r.role, name: nameBy[r.email] || r.email }));
}

/* Defaults by entity: with a board the approver is its chair and the monitor is the audit
   committee chair (or the board secretary); with no board it collapses to the system admin.
   Executor is the chief executive. If the executor would also be the approver, the approver
   is left empty rather than silently assigning someone to approve their own work. */
async function gaDefaultRoles(){
  const byRole = r => (gaMembersCache.find(m => m.role === r) || {}).email || null;
  let execs = []; try { execs = await getEvaluableExecutives(); } catch(e){}
  const ceo = execs.find(e => /رئيس تنفيذي|الرئيس التنفيذي|مدير عام|المدير العام|مدير تنفيذي|المدير التنفيذي/.test(e.position||"")) || execs[0] || null;
  let executor = ceo ? ceo.email : null, monitor, approver;
  if(gaNoBoard()){
    const admins = gaMembersCache.filter(m => m.role === "مدير النظام").map(m => m.email);
    approver = admins[0] || null;
    monitor = admins[1] || admins[0] || null;
  } else {
    approver = byRole("رئيس مجلس");
    monitor = byRole("رئيس لجنة مراجعة") || byRole("سكرتير المجلس");
  }
  if(executor && executor === approver) approver = null;
  return { executor, monitor, approver };
}

function gaSlotHTML(assessmentId, axisKey, critKey){
  const own = assessmentId ? gaActionsCache.find(a => String(a.assessment_id) === String(assessmentId) && a.criterion_key === critKey) : null;
  let html = "";
  if(own){
    const [bg,fg] = GA_STATUS_STYLE[own.status] || GA_STATUS_STYLE["لم يبدأ"];
    html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:${bg};color:${fg}">متابَع: ${gaEsc(own.status)}</span>
      <button type="button" class="btn-xs primary" onclick="gaOpen(${own.id})">فتح</button></div>`;
  } else {
    html += `<button type="button" class="btn-xs gold" style="margin-top:6px" onclick="gaCreateFromRow(this)"><span class="ico-i ico-check"></span>تتبّع كإجراء متابَع</button>`;
  }
  const prior = gaActionsCache.filter(a => a.criterion_key === critKey && String(a.assessment_id) !== String(assessmentId||""));
  if(prior.length){
    const open = prior.filter(a => a.status !== "مغلق").length;
    html += `<div style="font-size:10px;margin-top:5px;color:${open?'var(--red)':'var(--green)'}">إجراءات من تقييمات سابقة: ${open} مفتوح · ${prior.length-open} مغلق</div>`;
  }
  return html;
}
function gaRefreshAllSlots(){
  const gid = document.getElementById("ga-id").value;
  document.querySelectorAll(".ga-slot").forEach(el => { el.innerHTML = gaSlotHTML(gid, el.dataset.axis, el.dataset.crit); });
}

async function gaCreateFromRow(btn){
  const gid = document.getElementById("ga-id").value;
  if(!gid){ alert("احفظ التقييم أولاً، ثم حوّل الإجراء إلى متابعة."); return; }
  const tr = btn.closest("tr");
  const text = tr.querySelector(".ga-actions").value.trim();
  if(!text){ alert("اكتب الإجراء التصحيحي أولاً."); return; }
  const axis = tr.dataset.axis, crit = tr.dataset.crit;
  const label = tr.querySelector("b") ? tr.querySelector("b").textContent : crit;
  btn.disabled = true;
  const roles = await gaDefaultRoles();
  const { data, error } = await sb.from("governance_actions").insert([{
    company_id: currentCompanyId, assessment_id: Number(gid), axis_key: axis, criterion_key: crit, criterion_label: label,
    action_text: text, executor_email: roles.executor, monitor_email: roles.monitor, approver_email: roles.approver,
    status: "لم يبدأ", created_by: gaMyEmail()
  }]).select().single();
  btn.disabled = false;
  if(error){ alert("تعذّر إنشاء الإجراء: " + error.message); return; }
  await sb.from("governance_action_log").insert([{ action_id: data.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: null, to_status: "لم يبدأ", note: "إنشاء الإجراء" }]);
  await gaLoadAll();
  gaRefreshAllSlots();
  gaOpen(data.id);
}

/* ── Tracker on the assessment list page ── */
async function loadGaTracker(){ await gaLoadAll(); renderGaTracker(); }

function gaMyPending(a){
  const me = gaMyEmail();
  if(a.status === "لم يبدأ" || a.status === "قيد التنفيذ") return a.executor_email === me;
  if(a.status === "بانتظار المراجعة") return a.monitor_email === me;
  if(a.status === "بانتظار الاعتماد") return a.approver_email === me;
  return false;
}

function renderGaTracker(){
  const statsBox = document.getElementById("gaStats"), list = document.getElementById("gaList");
  if(!statsBox || !list) return;
  const all = gaActionsCache.filter(a => a.axis_key !== "compliance");
  const closed = all.filter(a => a.status === "مغلق").length;
  const overdue = all.filter(gaIsOverdue).length;
  const mine = all.filter(a => a.status !== "مغلق" && gaMyPending(a)).length;
  const rate = all.length ? Math.round(closed/all.length*100) : 0;
  statsBox.innerHTML = `
    <div class="kpi blue"><div class="kpi-label">إجمالي الإجراءات</div><div class="kpi-val">${all.length}</div></div>
    <div class="kpi gold"><div class="kpi-label">المطلوب مني</div><div class="kpi-val">${mine}</div></div>
    <div class="kpi red"><div class="kpi-label">متأخرة</div><div class="kpi-val">${overdue}</div></div>
    <div class="kpi green"><div class="kpi-label">نسبة الإغلاق</div><div class="kpi-val">${rate}%</div></div>`;

  const f = document.getElementById("ga-filter").value;
  const rows = all.filter(a => {
    if(f === "mine") return a.status !== "مغلق" && gaMyPending(a);
    if(f === "open") return a.status !== "مغلق";
    if(f === "overdue") return gaIsOverdue(a);
    if(f === "closed") return a.status === "مغلق";
    return true;
  });
  if(!rows.length){
    list.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${all.length ? "لا توجد إجراءات مطابقة." : "لا توجد إجراءات متابَعة بعد. من داخل أي تقييم اضغط «تتبّع كإجراء متابَع» بجانب الإجراء التصحيحي."}</div>`;
    return;
  }
  list.innerHTML = rows.map(a => {
    const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:700;color:var(--dark);flex:1">${gaEsc(a.action_text)}</div>
        <span style="font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};white-space:nowrap">${gaEsc(a.status)}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-bottom:6px">المعيار: ${gaEsc(a.criterion_label||a.criterion_key)}</div>
      <div style="font-size:11px;color:var(--gray3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
        <span>المنفّذ: ${gaEsc(gaName(a.executor_email))}</span><span>المراقب: ${gaEsc(gaName(a.monitor_email))}</span><span>المعتمِد: ${gaEsc(gaName(a.approver_email))}</span>
        <span>الموعد: ${a.target_date||"غير محدَّد"}</span>${gaIsOverdue(a) ? '<span style="color:var(--red);font-weight:800">متأخر</span>' : ""}
      </div>
      <button class="btn-xs ${a.status!=='مغلق' && gaMyPending(a) ? 'gold' : 'primary'}" onclick="gaOpen(${a.id})">${a.status!=='مغلق' && gaMyPending(a) ? 'مطلوب منك' : 'فتح'}</button>
    </div>`;
  }).join("");
}

/* ── Action modal ── */
function gaFillSelect(id, selected){
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">— غير محدَّد —</option>' + gaMembersCache.map(m => `<option value="${gaEsc(m.email)}" ${m.email===selected?"selected":""}>${gaEsc(m.name)} — ${gaEsc(m.role)}</option>`).join("");
  if(selected && !gaMembersCache.some(m => m.email === selected)) sel.insertAdjacentHTML("beforeend", `<option value="${gaEsc(selected)}" selected>${gaEsc(selected)}</option>`);
}

async function gaOpen(id){
  if(!gaMembersCache.length || !gaActionsCache.some(a => a.id === id)) await gaLoadAll();
  const a = gaActionsCache.find(x => x.id === id);
  if(!a){ alert("تعذّر تحميل الإجراء"); return; }
  document.getElementById("gam-id").value = id;
  document.getElementById("gam-context").textContent = `${a.action_kind ? "إجراء " + a.action_kind + " — " : ""}المعيار: ${a.criterion_label||a.criterion_key}`;
  const [bg,fg] = GA_STATUS_STYLE[a.status] || GA_STATUS_STYLE["لم يبدأ"];
  document.getElementById("gam-status-badge").innerHTML = `<span style="font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;background:${bg};color:${fg}">${gaEsc(a.status)}</span>`;
  document.getElementById("gam-overdue-tag").innerHTML = gaIsOverdue(a) ? '<span style="font-size:11px;font-weight:800;color:var(--red)">متأخر عن الموعد</span>' : "";
  document.getElementById("gam-text").value = a.action_text || "";
  gaFillSelect("gam-executor", a.executor_email); gaFillSelect("gam-monitor", a.monitor_email); gaFillSelect("gam-approver", a.approver_email);
  document.getElementById("gam-target").value = a.target_date || "";

  const canEdit = gaCanManage() && a.status !== "مغلق";
  ["gam-text","gam-executor","gam-monitor","gam-approver","gam-target"].forEach(i => { document.getElementById(i).disabled = !canEdit; });
  document.getElementById("gam-assign-btn").innerHTML = canEdit ? '<button class="btn btn-gold" style="font-size:11.5px" onclick="gaSaveAssignment()"><span class="ico-i ico-save"></span>حفظ التكليف</button>' : "";

  const notes = [];
  if(a.evidence_note) notes.push(`<b>ما تم تنفيذه:</b> ${gaEsc(a.evidence_note)}`);
  if(a.monitor_note) notes.push(`<b>آخر ملاحظة مراجعة:</b> ${gaEsc(a.monitor_note)}`);
  const nb = document.getElementById("gam-notes-box");
  nb.style.display = notes.length ? "block" : "none"; nb.innerHTML = notes.join("<br>");

  const me = gaMyEmail();
  const opts = (GA_TRANSITIONS[a.status] || []).filter(t => gaIsPlatformOwner() || a[t.actor+"_email"] === me);
  const noteWrap = document.getElementById("gam-note-wrap");
  document.getElementById("gam-note").value = "";
  const needsNote = opts.some(t => t.needNote);
  noteWrap.style.display = needsNote ? "block" : "none";
  if(needsNote) document.getElementById("gam-note-label").textContent = opts.find(t => t.needNote).noteLabel;
  const btns = document.getElementById("gam-buttons");
  if(a.status === "مغلق"){ btns.innerHTML = `<span style="font-size:11.5px;color:var(--green);font-weight:700"><span class="ico-i ico-check"></span>أُغلق بتاريخ ${a.closed_at ? new Date(a.closed_at).toLocaleDateString('ar-SA-u-ca-gregory') : ""}</span>`; }
  else if(!opts.length){
    const need = (GA_TRANSITIONS[a.status]||[])[0];
    btns.innerHTML = `<span style="font-size:11px;color:var(--gray3)">الخطوة التالية بيد ${need ? GA_ACTOR_LABEL[need.actor] + ": " + gaEsc(gaName(a[need.actor+"_email"])) : "—"}.</span>`;
  } else {
    btns.innerHTML = opts.map(t => `<button class="btn ${t.ret?'btn-ghost':'btn-gold'}" style="font-size:11.5px" onclick="gaTransition(${a.id},'${t.to}')">${t.label}</button>`).join("");
  }

  const { data: log } = await sb.from("governance_action_log").select("*").eq("action_id", id).order("id",{ascending:false});
  document.getElementById("gam-log").innerHTML = (log||[]).map(l => `<div style="border-right:2px solid var(--gray1);padding-right:8px;margin-bottom:6px">
    <b style="color:var(--dark)">${gaEsc(l.actor_name||l.actor_email||"")}</b> — ${new Date(l.created_at).toLocaleString('ar-SA-u-ca-gregory')}<br>
    ${l.to_status ? `${l.from_status?gaEsc(l.from_status)+" ← ":""}<b>${gaEsc(l.to_status)}</b>` : ""}${l.note ? ` — ${gaEsc(l.note)}` : ""}</div>`).join("") || "لا توجد تحديثات.";
  openM("m-gaction");
}

async function gaLog(a, from, to, note){
  await sb.from("governance_action_log").insert([{ action_id: a.id, company_id: currentCompanyId, actor_email: gaMyEmail(), actor_name: currentUserProfile?.full_name||gaMyEmail(), from_status: from, to_status: to, note: note||null }]);
}
function gaNotify(email, subject, body, a){
  if(!email || email === gaMyEmail()) return;
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px"><h3 style="color:#1A3A6B">${gaEsc(subject)}</h3>
    <p><b>الشركة:</b> ${gaEsc(gaCompanyName())}</p><p><b>الإجراء:</b> ${gaEsc(a.action_text)}</p><p>${gaEsc(body)}</p></div>`;
  sendNotificationEmail(email, subject, html);
}

async function gaSaveAssignment(){
  const id = Number(document.getElementById("gam-id").value);
  const a = gaActionsCache.find(x => x.id === id);
  if(!a || a.status === "مغلق" || !gaCanManage()) return;
  const action_text = document.getElementById("gam-text").value.trim();
  const executor_email = document.getElementById("gam-executor").value || null;
  const monitor_email = document.getElementById("gam-monitor").value || null;
  const approver_email = document.getElementById("gam-approver").value || null;
  const target_date = document.getElementById("gam-target").value || null;
  if(!action_text){ alert("نص الإجراء مطلوب"); return; }

  const clashes = [];
  if(executor_email && executor_email === approver_email) clashes.push("المنفّذ هو نفسه المعتمِد");
  if(executor_email && executor_email === monitor_email) clashes.push("المنفّذ هو نفسه المراقب");
  if(clashes.length){
    if(!gaNoBoard()){ alert("لا يجوز: " + clashes.join(" و") + ". اختر شخصاً مختلفاً لضمان الفصل بين التنفيذ والرقابة والاعتماد."); return; }
    if(!await uiConfirm("تنبيه: " + clashes.join(" و") + ". هذا مقبول فقط لأن الكيان لا مجلس له وعدد الأشخاص محدود. متابعة؟")) return;
  }
  const { error } = await sb.from("governance_actions").update({ action_text, executor_email, monitor_email, approver_email, target_date }).eq("id", id);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  await gaLog(a, a.status, null, "تعديل التكليف");
  if(executor_email && executor_email !== a.executor_email) gaNotify(executor_email, "إجراء تصحيحي مسند إليك", "أُسند إليك تنفيذ هذا الإجراء" + (target_date ? ` قبل ${target_date}` : "") + ".", a);
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}

async function gaTransition(id, to){
  const a = gaActionsCache.find(x => x.id === id);
  if(!a) return;
  const t = (GA_TRANSITIONS[a.status]||[]).find(x => x.to === to);
  if(!t) return;
  if(!gaIsPlatformOwner() && a[t.actor+"_email"] !== gaMyEmail()){ alert("هذه الخطوة خاصة بـ" + GA_ACTOR_LABEL[t.actor] + " المحدَّد."); return; }
  if(!a.executor_email || !a.monitor_email || !a.approver_email){ alert("حدّد المنفّذ والمراقب والمعتمِد أولاً (حفظ التكليف)."); return; }
  const note = document.getElementById("gam-note").value.trim();
  if(t.needNote && !note){ alert("الرجاء كتابة: " + t.noteLabel); return; }

  const upd = { status: to };
  if(to === "مغلق") upd.closed_at = new Date().toISOString();
  if(to === "بانتظار المراجعة") upd.evidence_note = note;
  if(t.ret) upd.monitor_note = note;
  // Only applies if nobody else moved it meanwhile.
  const { data: done, error } = await sb.from("governance_actions").update(upd).eq("id", id).eq("status", a.status).select();
  if(error){ alert("تعذّر التحديث: " + error.message); return; }
  if(!done || !done.length){ alert("تغيّرت حالة الإجراء من مستخدم آخر. حدّث الصفحة وأعد المحاولة."); await gaLoadAll(); renderGaTracker(); gaOpen(id); return; }

  await gaLog(a, a.status, to, note);
  if(to === "بانتظار المراجعة") gaNotify(a.monitor_email, "إجراء تصحيحي بانتظار مراجعتك", "أرسل المنفّذ الإجراء للمراجعة.", a);
  if(to === "بانتظار الاعتماد") gaNotify(a.approver_email, "إجراء تصحيحي بانتظار اعتمادك", "قبل المراقب الإجراء وأحاله للاعتماد.", a);
  if(t.ret) gaNotify(a.executor_email, "أُعيد إليك إجراء تصحيحي", "السبب: " + note, a);
  if(to === "مغلق"){ gaNotify(a.executor_email, "اعتُمد إغلاق الإجراء التصحيحي", "تم اعتماد الإجراء وإغلاقه.", a); logActivity("إغلاق","إجراء تصحيحي",a.criterion_label||a.criterion_key,a.action_text); }
  await gaLoadAll(); renderGaTracker(); gaRefreshAllSlots(); cmpRefreshActionsCard(); gaOpen(id);
}

/* ══════════ AUDIT SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const AUDIT_STATUS_ORDER = ["تم الاستلام","قيد التحليل","تحت المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const AUDIT_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "قيد التحليل":"var(--gold)", "تحت المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };

async function loadAudit(){
  const grid = document.getElementById("auditServicesGrid");
  const tbody = document.getElementById("auditRequestsTbody");
  if(!grid || !tbody) return;

  const [{ data: services, error: svcErr }, { data: requests, error: reqErr }] = await Promise.all([
    sb.from("audit_service_types").select("*").order("id",{ascending:true}),
    sb.from("audit_requests").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false})
  ]);

  if(svcErr){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${svcErr.message}</div>`; }
  else if(!services || services.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد خدمات متاحة حاليًا.</div>'; }
  else {
    grid.innerHTML = services.map(s => `<div class="card" style="margin:0;display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--gray3);margin-top:6px;line-height:1.6;flex:1">${orgEsc(s.description||"")}</div>
        ${s.duration_estimate ? `<div style="font-size:11px;color:var(--primary);margin-top:8px">⏱️ ${s.duration_estimate}</div>` : ""}
        <button class="btn btn-gold" style="width:100%;margin-top:12px;font-size:11.5px" onclick="openNewAuditRequest(${s.id},'${orgEsc(s.name.replace(/'/g,""))}')"><span class="ico-i ico-edit"></span>اطلب الخدمة الآن</button>
      </div>
    </div>`).join("");
  }

  if(reqErr){ tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red);font-size:12px">${reqErr.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });
  tbody.innerHTML = requests.map(r => {
    const resultBadge = r.inspection_result
      ? `<span style="color:${r.inspection_result==='مقبول'?'var(--green)':r.inspection_result==='غير مقبول'?'var(--red)':'var(--orange)'};font-weight:800;font-size:11px">${r.inspection_result==='مقبول'?'✅':r.inspection_result==='غير مقبول'?'❌':'⚠️'} ${r.inspection_result}</span>`
      : '<span style="color:var(--gray3);font-size:11px">—</span>';
    return `<tr style="cursor:pointer" onclick="openAuditRequestDetail(${r.id})">
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${AUDIT_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td>${resultBadge}</td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openAuditRequestDetail(${r.id})">عرض</button></td>
  </tr>`;
  }).join("");
}

function openNewAuditRequest(serviceId, serviceName){
  document.getElementById("anr-service-id").value = serviceId;
  document.getElementById("anr-service-name").textContent = serviceName;
  document.getElementById("anr-client-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  document.getElementById("anr-sector").value = "";
  document.getElementById("anr-scope").value = "";
  document.getElementById("anr-date").value = "";
  document.getElementById("anr-files").value = "";
  openM("m-audit-new-request");
}

async function submitAuditRequest(){
  const service_type_id = Number(document.getElementById("anr-service-id").value);
  const client_name = document.getElementById("anr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("anr-sector").value.trim();
  const org_size = document.getElementById("anr-org-size").value;
  const scope = document.getElementById("anr-scope").value.trim();
  const preferred_date = document.getElementById("anr-date").value || null;

  const filesInput = document.getElementById("anr-files");
  const file_urls = [];
  if(filesInput.files && filesInput.files.length){
    for(const f of filesInput.files){
      const fakeInput = { files: [f] };
      const url = await uploadFile(fakeInput, "audit-requests");
      if(url) file_urls.push({ name: f.name, url });
    }
  }

  const { data: userData } = await sb.auth.getUser();
  const requested_by_email = userData && userData.user ? userData.user.email : null;

  const { error } = await sb.from("audit_requests").insert([{
    company_id: currentCompanyId, service_type_id, requested_by_email, client_name, sector, org_size, scope,
    file_urls, preferred_date, status: "تم الاستلام"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  logActivity("إنشاء", "طلب مراجعة", client_name, "");
  alert("تم إرسال طلبك بنجاح ✅ — سيتواصل معك فريق المراجعة قريبًا.");
  closeM("m-audit-new-request");
  loadAudit();
}

async function openAuditRequestDetail(requestId){
  const box = document.getElementById("ard-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-audit-request-detail");

  const [{ data: r }, { data: findings }, { data: messages }, { data: rating }] = await Promise.all([
    sb.from("audit_requests").select("*").eq("id", requestId).single(),
    sb.from("audit_findings").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("audit_ratings").select("*").eq("request_id", requestId).limit(1)
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("ard-title-h").textContent = "🔍 " + (r.client_name||"طلب مراجعة");
  const existingRating = (rating||[])[0];

  const statusIdx = AUDIT_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${AUDIT_STATUS_ORDER.slice(0,4).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<3?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?AUDIT_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<3 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div><div style="text-align:center;font-size:11px;font-weight:700;color:${AUDIT_STATUS_COLOR[r.status]}">${r.status}</div>`;

  const findingsHtml = (findings||[]).length ? findings.map(f => `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;color:var(--primary)"><span class="ico-i ico-pin"></span>ملاحظة المراجع</div>
    <div style="font-size:12px;color:var(--dark);margin:4px 0">${orgEsc(f.finding_text)}</div>
    <div style="font-size:10px;color:${f.status==='مغلقة'?'var(--green)':'var(--gray3)'};margin-bottom:6px">الحالة: ${f.status}</div>
    <textarea class="fi" id="finding-resp-${f.id}" rows="2" placeholder="اكتب ردك أو الإجراء التصحيحي..." style="font-size:11.5px">${f.client_response||""}</textarea>
    <button class="btn-xs primary" style="margin-top:6px" onclick="submitFindingResponse(${f.id},${requestId})">إرسال الرد</button>
  </div>`).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد ملاحظات بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--primary)':'var(--offwhite)'};color:${m.sender_email===r.requested_by_email?'#fff':'var(--dark)'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br>${m.message}
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const ratingHtml = (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px">⭐ تقييم الخدمة</div>
    <div class="card"><div class="card-body">
      ${existingRating ? `<div style="text-align:center;font-size:20px;color:var(--gold)">${"⭐".repeat(existingRating.rating)}</div><div style="font-size:11.5px;color:var(--gray3);text-align:center;margin-top:4px">${orgEsc(existingRating.comment||"")}</div>`
        : `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px" id="rating-stars">
             ${[1,2,3,4,5].map(n=>`<span onclick="setAuditRatingValue(${n})" id="star-${n}" style="font-size:24px;cursor:pointer;color:var(--gray1)">⭐</span>`).join("")}
           </div>
           <textarea class="fi" id="rating-comment" rows="2" placeholder="ملاحظاتك على الخدمة (اختياري)"></textarea>
           <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="submitAuditRating(${requestId})">إرسال التقييم</button>`}
    </div></div>` : "";

  const resultBadgeColor = r.inspection_result === 'مقبول' ? 'var(--green)' : r.inspection_result === 'غير مقبول' ? 'var(--red)' : 'var(--orange)';
  const resultIcon = r.inspection_result === 'مقبول' ? '✅' : r.inspection_result === 'غير مقبول' ? '❌' : '⚠️';
  const summaryHtml = r.inspection_result ? `
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-dashboard"></span>نتيجة المراجعة</div>
    <div class="card" style="border:2px solid ${resultBadgeColor}">
      <div class="card-body">
        <div style="text-align:center;font-size:16px;font-weight:900;color:${resultBadgeColor};margin-bottom:10px">${resultIcon} ${r.inspection_result}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;text-align:center">
          ${r.key_findings_count!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.key_findings_count}</div><div style="font-size:10.5px;color:var(--gray3)">عدد الملاحظات</div></div>` : ""}
          ${r.compliance_pct!=null ? `<div><div style="font-size:20px;font-weight:900;color:var(--dark)">${r.compliance_pct}%</div><div style="font-size:10.5px;color:var(--gray3)">نسبة الامتثال</div></div>` : ""}
        </div>
        ${r.result_summary ? `<div style="font-size:11.5px;color:var(--dark);margin-top:10px;padding-top:10px;border-top:1px solid var(--gray1)">${r.result_summary}</div>` : ""}
      </div>
    </div>` : "";

  box.innerHTML = `
    ${timeline}
    ${summaryHtml}
    <div class="sec-title" style="font-size:13px"><span class="ico-i ico-pin"></span>الملاحظات والإجراءات التصحيحية</div>
    ${findingsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع فريق المراجعة</div>
    <div class="card"><div class="card-body">
      <div id="audit-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <input class="fi" id="audit-chat-input" placeholder="اكتب رسالتك..." style="flex:1;margin:0">
        <button class="btn-xs primary" onclick="sendAuditMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
    ${ratingHtml}
  `;
  window.currentAuditRatingValue = 0;
}

async function submitFindingResponse(findingId, requestId){
  const val = document.getElementById(`finding-resp-${findingId}`).value.trim();
  const { error } = await sb.from("audit_findings").update({ client_response: val }).eq("id", findingId);
  if(error){ alert("تعذّر إرسال الرد: " + error.message); return; }
  alert("تم إرسال ردك ✅");
  openAuditRequestDetail(requestId);
}

async function sendAuditMessage(requestId){
  const input = document.getElementById("audit-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("audit_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:email, message
  }]);
  if(error){ alert("تعذّر إرسال الرسالة: " + error.message); return; }
  input.value = "";
  openAuditRequestDetail(requestId);
}

function setAuditRatingValue(n){
  window.currentAuditRatingValue = n;
  for(let i=1;i<=5;i++){ document.getElementById(`star-${i}`).style.color = i<=n ? "var(--gold)" : "var(--gray1)"; }
}

async function submitAuditRating(requestId){
  const rating = window.currentAuditRatingValue || 0;
  if(!rating){ alert("الرجاء اختيار عدد النجوم"); return; }
  const comment = document.getElementById("rating-comment").value.trim();
  const { error } = await sb.from("audit_ratings").insert([{ request_id: requestId, rating, comment }]);
  if(error){ alert("تعذّر إرسال التقييم: " + error.message); return; }
  alert("شكرًا لتقييمك ✅");
  openAuditRequestDetail(requestId);
}


/* ══════════ AUTOMATIC EVIDENCE FOR THE GOVERNANCE EFFECTIVENESS ASSESSMENT ══════════
   Fills the criteria the platform can measure from its own records (meetings, attendance, policies,
   committees, risk register, permission matrix, reports, e-signature). It never overwrites a score the
   assessor already entered. Criteria that need human judgement (independence, quality, culture, KRIs…)
   stay empty. A criterion with no data in the platform is NOT scored low — it is left for the assessor,
   because "no record here" is not the same as "not practiced". */

/* ══ INDEPENDENCE CHECK (CMA Corporate Governance Regulations, Article 19 — independence obstacles) ══
   Reads the member disclosure form: answers a–l on the form map to the obstacles in Art. 19(ج),
   and 9+ consecutive years on the board is the last obstacle. Only members CLASSED as independent are checked. */
const INDEP_OBSTACLE = { a:"ملكية 5% فأكثر (هو أو أقاربه)", b:"من كبار التنفيذيين خلال العامين الماضيين", c:"صلة قرابة بعضو مجلس أو من كبار التنفيذيين", d:"عضو مجلس إدارة في شركة من مجموعة الشركة",
  e:"موظف خلال العامين الماضيين أو طرف متعامل مع الشركة", f:"يتقاضى مبالغ تزيد عن 200 ألف ريال أو 50% من مكافأة العضوية", g:"مصلحة مباشرة أو غير مباشرة في أعمال وعقود الشركة",
  h:"قريب/عضو في شركة لها عقود مع الشركة", i:"يملك منشأة لها عقود مع الشركة", j:"يشارك في عمل ينافس الشركة", k:"عضو/تنفيذي في شركة منافسة", l:"يملك منشأة منافسة" };
async function govIndependenceCheck(){
  const co = currentCompanyId;
  const [bmR, dfR] = await Promise.all([ sb.from("board_members").select("*").eq("company_id", co), sb.from("board_disclosure_forms").select("*").eq("company_id", co) ]);
  const bm = (bmR.data||[]).filter(m => !/مستقيل|منتهي/.test(m.status || "")), forms = dfR.data || [];
  const norm = x => String(x||"").replace(/\s+/g," ").trim();
  const formOf = m => forms.filter(d => (m.claimed_by_email && d.member_email === m.claimed_by_email) || (m.national_id && d.national_id && String(d.national_id) === String(m.national_id)) || (norm(d.full_name) && norm(m.name) && (norm(d.full_name).includes(norm(m.name)) || norm(m.name).includes(norm(d.full_name))))).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const now = new Date(), res = [];
  bm.forEach(m => {
    const d = formOf(m);
    const classed = m.status === "مستقل" || /مستقل/.test(m.position || "") || (d && /مستقل/.test(d.membership_capacity || ""));
    if(!classed) return;
    const row = { name: m.name, hasForm: !!d, obstacles: [], stale: false };
    if(d){
      const sa = d.survey_answers || {};
      Object.keys(INDEP_OBSTACLE).forEach(k => { if(sa[k] && sa[k].answer === true) row.obstacles.push(INDEP_OBSTACLE[k]); });
      row.stale = (now - new Date(d.created_at)) > 365 * 86400000;
    }
    const start = m.join_date || (d && d.term_start);
    if(start && (now - new Date(start)) / (365.25 * 86400000) > 9) row.obstacles.push("قضى أكثر من 9 سنوات في عضوية المجلس");
    res.push(row);
  });
  return res;
}

async function gaAutoEvidence(){
  const co = currentCompanyId, now = new Date(), y1 = new Date(now.getFullYear()-1, now.getMonth(), now.getDate());
  const q = async (t, c) => { try { const r = await sb.from(t).select(c || "*").eq("company_id", co); return r.data || []; } catch(e){ return []; } };
  const [bm, com, mt, att, pol, ceo, perf, disc, aud, perm, cells, sign, links] = await Promise.all([
    q("board_members"), q("committees"), q("meetings"), q("meeting_attendance"), q("policies"), q("ceo_monthly_reports"),
    q("performance_evaluations"), q("board_disclosure_forms"), q("audit_requests"), q("permission_items","id"), q("permission_cells","item_id,code"), q("signing_documents","id"), q("governance_links","id")
  ]);
  const risks = await fetchCompanyRisks();
  const ev = {};
  const put = (k, score, note) => { ev[k] = { score: Math.max(1, Math.min(5, score)), note }; };
  const past = d => d && new Date(d) <= now, recent = d => d && new Date(d) >= y1 && new Date(d) <= now;

  // ── Board
  const active = bm.filter(m => !/مستقيل|منتهي/.test(m.status || ""));
  const nonExec = active.filter(m => /غير تنفيذي/.test(m.is_executive || ""));
  const indepCheck = await govIndependenceCheck();
  const indep = indepCheck.length ? indepCheck : active.filter(m => m.status === "مستقل" || /مستقل/.test(m.position || ""));
  const indepBad = indepCheck.filter(r => r.obstacles.length), indepNoForm = indepCheck.filter(r => !r.hasForm);
  if(active.length){
    const isJSC = /مساهمة/.test(currentCompanyType || "");
    let s = active.length < 3 ? 2 : (nonExec.length + indep.length > active.length / 2 ? 3 : 2);
    let note = `${active.length} أعضاء (${nonExec.length} غير تنفيذي، ${indep.length} مستقل).`;
    if(isJSC){
      const need = Math.max(2, Math.ceil(active.length / 3));
      if(indep.length === 0) { s = Math.min(s, 1); note += " لا يوجد عضو مستقل مسجَّل — وشركات المساهمة يُنتظر فيها وجود أعضاء مستقلين."; }
      else if(indep.length < need) { s = Math.min(s, 2); note += ` عدد المستقلين أقل من الحد المعتاد للشركات المدرجة (عضوان أو ثلث المجلس: ${need}).`; }
      else note += ` عدد المستقلين يفي بالحد المعتاد للمدرجة (${need}).`;
      if(indepBad.length){ s = Math.min(s, 2); note += ` ⚠️ ${indepBad.length} من المصنَّفين مستقلين لديهم عوارض استقلال بحسب نموذج الإفصاح: ` + indepBad.map(r => `${r.name} (${r.obstacles.slice(0,2).join("، ")})`).join("؛ ") + "."; }
      if(indepNoForm.length) note += ` ${indepNoForm.length} مستقل بلا نموذج إفصاح مكتمل، فلا يمكن التحقق من استقلاله.`;
      if(!indepBad.length && !indepNoForm.length && indepCheck.length) note += " تم التحقق من نماذج الإفصاح: لا عوارض استقلال معلنة.";
    } else note += " الاستقلالية والخبرات لا تُقاس تلقائياً — راجعها.";
    put("board_composition", s, note);
  }
  const boardMeets = mt.filter(m => /مجلس/.test(m.meeting_type || "") && !m.committee_id && recent(m.meeting_date));
  if(mt.length){
    const ids = new Set(boardMeets.map(m => m.id));
    const rows = att.filter(a => ids.has(a.meeting_id));
    const rate = rows.length ? Math.round(rows.filter(a => a.status === "حاضر").length / rows.length * 100) : null;
    let s = boardMeets.length === 0 ? 1 : boardMeets.length === 1 ? 2 : boardMeets.length < 4 ? 3 : 4;
    if(boardMeets.length >= 4 && rate != null && rate >= 85) s = 5;
    put("board_performance", s, `${boardMeets.length} اجتماع مجلس خلال 12 شهراً` + (rate != null ? `، نسبة الحضور ${rate}%` : "، لا تسجيل حضور") + ". جودة النقاش لا تُقاس تلقائياً.");
  }
  const pAppr = p => /معتمدة/.test(p.status || "");
  const pMatch = re => pol.filter(p => re.test((p.policy_name || "") + " " + (p.category || "")));
  const polScore = (list) => !list.length ? 1 : !list.some(pAppr) ? 2 : (list.filter(pAppr).every(p => !p.review_date || new Date(p.review_date) > now) ? 4 : 3);
  const polNote = (list, what) => list.length ? `${list.length} ${what}: ${list.filter(pAppr).length} معتمدة نهائياً. جودة المحتوى تحتاج حكمك.` : `لا توجد ${what} مسجَّلة في المنصة.`;
  if(pol.length || true){
    const ch = pMatch(/ميثاق|لائحة حوكمة|حوكمة الشركات/); put("board_charters", polScore(ch), polNote(ch, "وثيقة ميثاق/لائحة حوكمة"));
    const g = pMatch(/تضارب|إفصاح|افصاح|سلوك|حوكمة/); put("governance_policies", polScore(g), polNote(g, "سياسة حوكمة"));
    const r = pMatch(/مخاطر/); put("risk_policies", polScore(r), polNote(r, "سياسة مخاطر"));
    const ic = pMatch(/رقابة|ضوابط|صلاحيات/); put("internal_control_policies", polScore(ic), polNote(ic, "سياسة رقابة/صلاحيات"));
    const cp = pMatch(/امتثال|مكافحة|فساد|التزام/); put("compliance_policies", polScore(cp), polNote(cp, "سياسة امتثال"));
    const wb = pMatch(/إبلاغ|ابلاغ|مخالفات|بلاغ/); put("whistleblowing", polScore(wb), polNote(wb, "سياسة إبلاغ"));
    const pc = pMatch(/سلوك|أخلاق|اخلاق/); put("professional_conduct", polScore(pc), polNote(pc, "سياسة سلوك مهني"));
    const coi = pMatch(/تضارب|نزاهة|فساد/);
    const discOk = active.length ? disc.length >= active.length : false;
    put("integrity_culture", Math.min(5, 1 + (coi.some(pAppr) ? 2 : coi.length ? 1 : 0) + (discOk ? 2 : disc.length ? 1 : 0)),
      `سياسة تضارب/نزاهة: ${coi.some(pAppr) ? "معتمدة" : coi.length ? "غير معتمدة بعد" : "غير موجودة"}؛ نماذج إفصاح الأعضاء: ${disc.length} من ${active.length}. الثقافة الفعلية تحتاج حكمك.`);
  }
  // ── Committees
  const comScore = re => {
    const c = com.find(x => re.test(x.committee_name || ""));
    if(!c) return null; // a committee may simply not be required for this company — leave it to the assessor
    const meets = mt.filter(m => String(m.committee_id) === String(c.id) && recent(m.meeting_date)).length;
    const s = 2 + (c.charter_approved_date ? 1 : 0) + (meets > 0 ? 1 : 0);
    return { s, n: `اللجنة موجودة؛ ${c.charter_approved_date ? "الميثاق معتمد" : "بلا ميثاق معتمد"}؛ ${meets} اجتماع خلال 12 شهراً. الاستقلالية والتقارير تحتاج حكمك.` };
  };
  [["audit_committee",/مراجعة/],["risk_committee",/مخاطر/],["nom_rem_committee",/ترشيح|مكافآت|مكافات/],["governance_committee",/حوكمة/]].forEach(([k, re]) => { const r = comScore(re); if(r) put(k, r.s, r.n); });
  // ── Risk
  if(risks.length){
    const share = f => Math.round(risks.filter(f).length / risks.length * 100);
    put("risk_identification", risks.length >= 10 ? 4 : risks.length >= 5 ? 3 : 2, `${risks.length} خطراً في السجل. الشمولية تحتاج حكمك.`);
    const asd = share(r => r.probability != null);
    put("risk_assessment", asd >= 80 ? 4 : asd >= 50 ? 3 : 2, `${asd}% من المخاطر مُقيَّمة الاحتمال والأثر.`);
    const pl = share(r => r.treatment_plan && r.owner);
    put("risk_response_plans", pl >= 80 ? 4 : pl >= 50 ? 3 : pl > 0 ? 2 : 1, `${pl}% من المخاطر لها خطة معالجة ومسؤول.`);
    put("risk_mgmt_systems", 3, "سجل المخاطر مُدار رقمياً في المنصة.");
  }
  // ── Control / audit
  if(perm.length){
    const withApprover = new Set(cells.filter(c => c.code === "ع").map(c => c.item_id)).size;
    const cov = Math.round(withApprover / perm.length * 100);
    const base = cov >= 80 ? 4 : cov >= 50 ? 3 : cov >= 20 ? 2 : 1;
    put("internal_control_system", base, `مصفوفة الصلاحيات: ${perm.length} بنداً، منها ${cov}% له جهة اعتماد محدّدة.`);
    put("controls_automation", Math.min(5, base + (sign.length ? 1 : 0)), `${cov}% من بنود الصلاحيات محددة الجهة، و${sign.length} مستند اعتُمد بالتوقيع الإلكتروني.`);
  }
  if(aud.length) put("internal_audit_role", 3, `${aud.length} طلب مراجعة داخلية مسجَّل. الاستقلال ونطاق العمل يحتاجان حكمك.`);
  // ── Disclosure & reporting
  const tl = ceo.map(r => r.timeliness_score).filter(x => x != null);
  if(tl.length){ const a = Math.round(tl.reduce((x,y) => x + y, 0) / tl.length); put("report_quality", a >= 85 ? 4 : a >= 70 ? 3 : a >= 50 ? 2 : 1, `${ceo.length} تقرير شهري للرئيس التنفيذي، متوسط الالتزام بالموعد ${a}%.`); }
  if(mt.some(m => m.show_on_public_site || m.invitation_published_at)) put("communication_channels", 3, "تُنشر دعوات الاجتماعات عبر الصفحة العامة للمنصة. باقي القنوات تحتاج حكمك.");
  // ── Self-evaluation
  const doneEv = perf.filter(p => p.status === "مكتمل" && recent(p.created_at));
  if(doneEv.length) put("board_self_eval", 3, `${doneEv.length} تقييم أداء مكتمل خلال 12 شهراً. عملية التقييم السنوي للمجلس تحتاج حكمك.`);
  // ── Platform adoption
  const used = [mt.length, pol.length, risks.length, cells.length, com.length, links.length, perf.length].filter(n => n > 0).length;
  put("grc_systems", Math.min(4, 1 + Math.round(used / 7 * 3)), `تستخدم الشركة ${used} من 7 وحدات رئيسية في المنصة.`);
  return ev;
}

async function gaApplyAutoEvidence(){
  const btn = document.getElementById("ga-auto-btn"); if(btn){ btn.disabled = true; btn.textContent = "جارِ قراءة بيانات المنصة…"; }
  try {
    const ev = await gaAutoEvidence();
    let filled = 0, kept = 0;
    document.querySelectorAll("#govassessAxesContainer tr[data-crit]").forEach(row => {
      const e = ev[row.dataset.crit]; if(!e) return;
      const sel = row.querySelector(".ga-score-select"), notes = row.querySelector(".ga-notes");
      if(sel.value){ kept++; return; }
      sel.value = String(e.score); sel.dispatchEvent(new Event("change"));
      if(!notes.value.trim()) notes.value = "[تلقائي] " + e.note;
      filled++;
    });
    const total = document.querySelectorAll("#govassessAxesContainer tr[data-crit]").length;
    const box = document.getElementById("gaAutoSummary");
    if(box) box.innerHTML = `<div style="background:#eef4fb;border:1px solid #cfe0f2;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.9;margin-bottom:14px">⚡ <b>عُبّئ ${filled} معياراً من أصل ${total} تلقائياً</b> من سجلات المنصة${kept ? ` (وتُرك ${kept} كما أدخلتَه)` : ""}.<br>الدرجات التلقائية مبنية على الأدلة المسجَّلة فقط وتحمل علامة <b>[تلقائي]</b> في الملاحظات — راجعها وعدّل ما تراه. أما المعايير الفارغة (الاستقلالية، جودة النقاش، المراجعة الخارجية، مؤشرات المخاطر…) فتحتاج حكمك أنت.</div>`;
  } catch(e){ alert("تعذّر قراءة البيانات: " + e.message); }
  if(btn){ btn.disabled = false; btn.textContent = "⚡ تعبئة تلقائية من بيانات المنصة"; }
}


/* ══ AGM QUORUM SETTINGS — default = Saudi Companies Law (Arts. 92–93); editable per company where the
   Articles of Association set a different (permitted) figure ══ */
const QUORUM_LAW = { agm_ordinary_quorum_1: 25, agm_ordinary_quorum_2: 0, agm_extraordinary_quorum_1: 50, agm_extraordinary_quorum_2: 25, agm_extraordinary_quorum_3: 0, board_quorum_percentage: 50 };
const QUORUM_FIELDS = { "qs-o1":"agm_ordinary_quorum_1", "qs-o2":"agm_ordinary_quorum_2", "qs-e1":"agm_extraordinary_quorum_1", "qs-e2":"agm_extraordinary_quorum_2", "qs-e3":"agm_extraordinary_quorum_3", "qs-b":"board_quorum_percentage" };
async function loadQuorumSettings(){
  const row = document.getElementById("quorumSettingsRow"); if(!row || !currentCompanyId) return;
  const { data, error } = await sb.from("companies").select("agm_ordinary_quorum_1,agm_ordinary_quorum_2,agm_extraordinary_quorum_1,agm_extraordinary_quorum_2,agm_extraordinary_quorum_3,board_quorum_percentage").eq("id", currentCompanyId).maybeSingle();
  if(error || !data){ row.style.display = "none"; return; }
  let custom = false;
  Object.entries(QUORUM_FIELDS).forEach(([id, col]) => {
    const v = data[col] != null ? Number(data[col]) : QUORUM_LAW[col];
    document.getElementById(id).value = v;
    if(v !== QUORUM_LAW[col]) custom = true;
  });
  const src = document.getElementById("quorumSettingsSrc");
  src.innerHTML = custom ? "المصدر الحالي: <b style=\"color:#b0701c\">النظام الأساس للشركة (قيم معدّلة)</b>" : "المصدر الحالي: <b style=\"color:var(--green)\">نظام الشركات (الافتراضي)</b>";
  row.style.display = "block";
}
async function saveQuorumSettings(){
  const upd = {}; const bad = [];
  Object.entries(QUORUM_FIELDS).forEach(([id, col]) => {
    const el = document.getElementById(id), v = Number(el.value);
    if(el.value === "" || isNaN(v) || v < Number(el.min) || v > Number(el.max)) bad.push(el.previousElementSibling.textContent + ` (من ${el.min} إلى ${el.max})`);
    upd[col] = v;
  });
  if(bad.length){ alert("قيمة خارج الحدود النظامية:\n- " + bad.join("\n- ")); return; }
  const { error } = await sb.from("companies").update(upd).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "إعداد الجمعية", "النصاب القانوني", Object.entries(upd).map(([k,v]) => `${k}=${v}`).join("، "));
  alert("تم حفظ النصاب ✅ — يسري على الجمعيات والاجتماعات القادمة.");
  loadQuorumSettings();
}
async function restoreQuorumDefaults(){
  if(!await uiConfirm("استعادة النصاب إلى ما نص عليه نظام الشركات؟")) return;
  const { error } = await sb.from("companies").update(QUORUM_LAW).eq("id", currentCompanyId);
  if(error){ alert("تعذّر الحفظ: " + error.message); return; }
  logActivity("تعديل", "إعداد الجمعية", "النصاب القانوني", "استعادة نظام الشركات");
  loadQuorumSettings();
}


/* ══ MAJORITY RULES FOR AGM RESOLUTIONS (Saudi Companies Law, Arts. 92–93) ══
   Ordinary: a majority (more than half) of the voting rights REPRESENTED at the meeting.
   Extraordinary: two-thirds of the represented rights — except capital increase/decrease, extending the
   company's term, dissolving it early, merging or splitting it: three-quarters. Abstentions count as
   represented, so they weigh against approval. A company's Articles may require more; use the
   per-topic override below when they do. */
const AGM_SPECIAL_RE = /زيادة\s*(رأس\s*)?المال|تخفيض\s*(رأس\s*)?المال|تخفيض\s*رأس|إطالة\s*مدة|تمديد\s*مدة|حل\s*الشركة|اندماج|الاندماج|دمج\s*الشركة|تقسيم\s*الشركة/;
function agmRequiredMajority(agmType, topicText){
  const ext = /غير\s*عادية/.test(agmType || "");
  if(!ext) return { pct: 50, strict: true, label: "أغلبية حقوق التصويت الممثلة في الاجتماع (أكثر من 50%)" };
  if(AGM_SPECIAL_RE.test(topicText || "")) return { pct: 75, strict: false, label: "ثلاثة أرباع حقوق التصويت الممثلة (75%) — قرار من القرارات الخاصة" };
  return { pct: 66.67, strict: false, label: "ثلثا حقوق التصويت الممثلة (66.67%)" };
}
function agmEvaluateTopic(agmType, topicText, yesShares, represented){
  const req = agmRequiredMajority(agmType, topicText);
  const yesPct = represented > 0 ? (yesShares / represented) * 100 : 0;
  const passed = represented > 0 && (req.strict ? yesPct > req.pct : yesPct + 1e-9 >= req.pct);
  return { passed, yesPct, req };
}

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
      ${circCanPrint() ? `<button class="btn-xs sec" onclick="circPrint(${r.id})">🖨 سجل القرار</button>` : ""}
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
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from("circulation_resolutions").insert([{ company_id: currentCompanyId, body: circTab, kind, title, resolution_text: (urgent ? "سبب الاستعجال: " + urgent + "\n\n" : "") + text,
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
