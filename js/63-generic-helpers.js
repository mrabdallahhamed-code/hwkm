/* ══════════ GENERIC HELPERS ══════════ */

/* ── Private-file links ──
   Uploaded files live in a private bucket and the DB stores a signed URL for each. Old rows hold
   links valid for 10 years; new uploads get a shorter one. Either way, whenever a person OPENS a
   file we mint a fresh one-hour link from the file's path, so a stored link never needs to stay
   valid and a link copied out of the browser stops working within the hour. */
const DOC_FILE_OPEN_TTL = 3600;          // seconds a freshly opened link works
const DOC_FILE_STORED_TTL = 31536000;    // seconds a link saved in the DB works (1 year; was 10 years)
const DOC_SIGN_RE = /\/storage\/v1\/object\/(?:sign|public)\/documents\/([^?#]+)/;
async function freshDocUrl(url){
  try{
    const m = DOC_SIGN_RE.exec(String(url || ""));
    if(!m) return url;
    const { data, error } = await sb.storage.from("documents").createSignedUrl(decodeURIComponent(m[1]), DOC_FILE_OPEN_TTL);
    return (!error && data && data.signedUrl) ? data.signedUrl : url;
  }catch(e){ return url; }
}
/* SHA-256 fingerprint of the exact file a person signed (stored with the signature as evidence). Best effort: returns null rather than blocking a signature. */
async function docFileSha256(url){
  try{
    if(!url || !window.crypto || !crypto.subtle) return null;
    const res = await fetch(await freshDocUrl(url));
    if(!res.ok) return null;
    if(Number(res.headers.get("content-length") || 0) > 60 * 1024 * 1024) return null;
    const digest = await crypto.subtle.digest("SHA-256", await res.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }catch(e){ return null; }
}
document.addEventListener("click", function(ev){
  const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
  if(!a || ev.button > 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
  if(!DOC_SIGN_RE.test(a.getAttribute("href") || "")) return;
  ev.preventDefault();
  const href = a.href, dl = a.getAttribute("download");
  const w = dl === null ? window.open("", "_blank") : null;   // opened right now so popup blockers allow it
  if(w){ try{ w.opener = null; }catch(e){} }
  freshDocUrl(href).then(function(u){
    if(dl !== null){
      const t = document.createElement("a"); t.href = u; t.download = dl; t.rel = "noopener";
      document.body.appendChild(t); t.click(); t.remove();
    } else if(w){ w.location.href = u; }
    else { window.location.href = u; }
  });
}, true);
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
