/* ══════════ تقرير الفجوات والتوصيات ══════════
   يُبنى من تقييم محفوظ فقط (قراءة): يعرض المعايير التي لم تبلغ مستوى «متقدمة» (4)، مرتبة بحجم الفجوة،
   مع ملاحظات المقيِّم والإجراء المقترح وحالة الإجراءات التصحيحية المسجَّلة. لا يغيّر أي بيانات. */
const GAP_TARGET = 4;
function gapPriority(score){ return score <= 2 ? { label: "عالية", color: "#C0392B", rank: 0 } : { label: "متوسطة", color: "#B7791F", rank: 1 }; }
function buildGapModel(a, axesList){
  const gaps = [], strengths = [], axisRows = [];
  axesList.forEach(axis => {
    const items = (a[axis.key] || []).filter(c => c && c.score != null);
    const avg = items.length ? items.reduce((x, c) => x + c.score, 0) / items.length : null;
    const title = axis.title.replace(/^المحور [^:]+:\s*/, "");
    axisRows.push({ key: axis.key, title, icon: axis.icon, avg, n: items.length });
    items.forEach(c => {
      const row = { axisKey: axis.key, axis: title, key: c.key, label: c.label, score: c.score, notes: c.notes || "", actions: c.actions || "", auto: /^\s*\[تلقائي\]/.test(c.notes || "") };
      if(c.score < GAP_TARGET) gaps.push({ ...row, gap: GAP_TARGET - c.score, pr: gapPriority(c.score) });
      else strengths.push(row);
    });
  });
  gaps.sort((x, y) => x.pr.rank - y.pr.rank || y.gap - x.gap || x.axis.localeCompare(y.axis, "ar"));
  return { gaps, strengths, axisRows };
}
function gapFetchAssessment(id){ return sb.from("governance_assessments").select("*").eq("id", id).single(); }
async function govGapReport(id){
  const { data: a, error } = await gapFetchAssessment(id);
  if(error || !a){ alert("تعذّر تحميل التقييم"); return; }
  const axesList = (typeof currentGovAxes !== "undefined" && currentGovAxes && currentGovAxes.length) ? currentGovAxes : GOVERNANCE_AXES;
  const { gaps, strengths, axisRows } = buildGapModel(a, axesList);
  const { finalScore } = computeGovScores(a);
  const interp = finalScore != null ? maturityInterpretation(finalScore) : null;
  let acts = [];
  try{ const r = await sb.from("governance_actions").select("criterion_key,status,target_date").eq("assessment_id", id); acts = r.data || []; }catch(e){}
  const actByCrit = {}; acts.forEach(x => { (actByCrit[x.criterion_key] = actByCrit[x.criterion_key] || []).push(x); });
  const E = orgEsc;
  const high = gaps.filter(g => g.pr.rank === 0).length, mid = gaps.length - high;
  const weakest = axisRows.filter(r => r.avg != null).sort((x, y) => x.avg - y.avg).slice(0, 3);
  const company = (typeof gaCompanyName === "function" ? gaCompanyName() : "") || "";
  const th = "background:#042552;color:#fff;padding:7px 8px;font-size:11px;text-align:right";
  const td = "border:1px solid #D5DCE6;padding:7px 8px;font-size:11px;vertical-align:top";
  const sug = g => g.actions.trim() ? E(g.actions) : "وضع خطة تحسين لمعيار «" + E(g.label) + "» ورفعه إلى المستوى " + GAP_TARGET + " على الأقل، مع تحديد مسؤول وموعد ودليل إنجاز.";
  const actState = g => { const l = actByCrit[g.key]; if(!l || !l.length) return '<span style="color:#9A3412">لم يُسجَّل إجراء</span>'; return l.map(x => E(x.status) + (x.target_date ? " · " + E(x.target_date) : "")).join("<br>"); };
  const html = `<div style="font-family:Arial,Tahoma,sans-serif;color:#0B1F3A;line-height:1.7">
    <div style="border-bottom:3px solid #CC8422;padding-bottom:8px;margin-bottom:14px">
      <div style="font-size:11px;color:#245FBB;font-weight:700">حوكم · تقرير الفجوات والتوصيات</div>
      <div style="font-size:20px;font-weight:800;color:#042552">${E(company) || "تقييم فعالية الحوكمة"}</div>
      <div style="font-size:12px;color:#555">الفترة: ${E(a.period || "—")} · المقيِّم: ${E(a.assessed_by_type || "—")} · التاريخ: ${E(a.assessment_date || "—")}</div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:130px;border:1px solid #D5DCE6;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#042552">${finalScore != null ? finalScore.toFixed(1) : "—"} / 5</div><div style="font-size:11px;color:#555">النتيجة النهائية</div></div>
      <div style="flex:1;min-width:130px;border:1px solid #D5DCE6;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#C0392B">${high}</div><div style="font-size:11px;color:#555">فجوات أولوية عالية</div></div>
      <div style="flex:1;min-width:130px;border:1px solid #D5DCE6;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#B7791F">${mid}</div><div style="font-size:11px;color:#555">فجوات أولوية متوسطة</div></div>
      <div style="flex:1;min-width:130px;border:1px solid #D5DCE6;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#1B7F4B">${strengths.length}</div><div style="font-size:11px;color:#555">نقاط قوة (مستوى ${GAP_TARGET} فأعلى)</div></div>
    </div>
    ${interp ? `<p style="font-size:12.5px"><b>التوصيف العام:</b> ${E(interp.label)}.</p>` : ""}
    ${weakest.length ? `<p style="font-size:12.5px"><b>أضعف المحاور:</b> ${weakest.map(r => E(r.title) + " (" + r.avg.toFixed(1) + ")").join("، ")}.</p>` : ""}
    <h3 style="font-size:14px;color:#042552;margin:16px 0 6px">1. درجات المحاور</h3>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">المحور</th><th style="${th}">المتوسط / 5</th><th style="${th}">عدد المعايير المقيّمة</th></tr></thead><tbody>
    ${axisRows.map(r => `<tr><td style="${td}">${r.icon} ${E(r.title)}</td><td style="${td}">${r.avg != null ? r.avg.toFixed(1) : "—"}</td><td style="${td}">${r.n}</td></tr>`).join("")}
    </tbody></table>
    <h3 style="font-size:14px;color:#042552;margin:16px 0 6px">2. الفجوات والتوصيات (مرتبة بالأولوية)</h3>
    ${gaps.length ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">#</th><th style="${th}">المحور / المعيار</th><th style="${th}">الدرجة</th><th style="${th}">الأولوية</th><th style="${th}">الملاحظة</th><th style="${th}">التوصية / الإجراء</th><th style="${th}">حالة الإجراء</th></tr></thead><tbody>
    ${gaps.map((g, i) => `<tr><td style="${td}">${i + 1}</td><td style="${td}"><b>${E(g.label)}</b><div style="color:#666">${E(g.axis)}</div></td><td style="${td}">${g.score}/5<div style="color:#666">الفجوة ${g.gap}</div></td><td style="${td};font-weight:700;color:${g.pr.color}">${g.pr.label}</td><td style="${td}">${g.auto ? '<div style="color:#245FBB;font-weight:700;margin-bottom:2px">درجة مقترحة من بيانات المنصة، تحتاج مراجعة المقيِّم</div>' : ""}${E(g.notes.replace(/^\s*\[تلقائي\]\s*/, "")) || "—"}</td><td style="${td}">${sug(g)}</td><td style="${td}">${actState(g)}</td></tr>`).join("")}
    </tbody></table>` : '<p style="font-size:12.5px;color:#1B7F4B">لا توجد فجوات: كل المعايير المقيّمة بلغت المستوى ' + GAP_TARGET + ' فأعلى.</p>'}
    ${strengths.length ? `<h3 style="font-size:14px;color:#042552;margin:16px 0 6px">3. نقاط القوة</h3><ul style="font-size:12px;margin:0;padding-inline-start:18px">${strengths.map(s => "<li>" + E(s.label) + " — " + E(s.axis) + " (" + s.score + "/5)</li>").join("")}</ul>` : ""}
    ${gaps.some(g => g.auto) || strengths.some(x => x.auto) ? '<p style="font-size:11px;color:#245FBB;margin-top:10px">بعض الدرجات في هذا التقرير اقتُرحت تلقائيًا من بيانات المنصة (موسومة في عمود الملاحظة) ولم يغيّرها المقيِّم. تُراجع قبل الاعتماد.</p>' : ""}
    <p style="font-size:10.5px;color:#777;margin-top:18px">مستوى الاستهداف في هذا التقرير هو ${GAP_TARGET} (حوكمة متقدمة). الأولوية العالية للدرجتين 1 و2، والمتوسطة للدرجة 3. أُعدّ التقرير آليًا من التقييم المحفوظ ولا يغيّر أي بيانات.</p>
  </div>`;
  printDocument("تقرير الفجوات والتوصيات - " + (a.period || ""), html, false);
}
