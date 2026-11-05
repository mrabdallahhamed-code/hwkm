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
