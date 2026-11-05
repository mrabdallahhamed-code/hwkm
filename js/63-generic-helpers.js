/* ══════════ GENERIC HELPERS ══════════ */
function emptyRowHTML(cols, text){
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">${text}</td></tr>`;
}
function errorRowHTML(cols, msg){
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--red);font-size:12px;padding:14px">تعذّر التحميل: ${msg}</td></tr>`;
}

/* ══════════ RISKS ══════════ */
let risksCache = [];
const RISK_IMPACT_ROW = { "عالٍ": 0, "متوسط": 1, "منخفض": 2 }; // top to bottom in the grid
function riskProbCol(p){ return p==null ? 1 : (p>=67 ? 2 : (p>=34 ? 1 : 0)); } // left→right: low/med/high (LTR grid)
function riskSeverityColor(impact, probability){
  const highImpact = impact === "عالٍ";
  const highProb = (probability||0) >= 67;
  if(highImpact && highProb) return "var(--primary)";
  if(highImpact || highProb) return "var(--gold)";
  if(impact === "منخفض" && (probability||0) < 34) return "var(--teal)";
  return "#8B6F1F";
}
