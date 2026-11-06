const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Input hygiene (defence in depth) ──────────────────────────────────────────────────────────
   Text typed by users is later shown inside HTML. Before anything is written to the database we turn tag-like
   "<x" and the quote characters that could break out of an HTML attribute into harmless look-alike characters.
   Fields that must stay byte-exact (emails, links, keys, signatures, JSON text) are left untouched.
   This is a safety net on top of escaping at display time, not a replacement for it. */
const HYGIENE_SKIP_KEY = /(^|_)(email|url|urls|link|password|token|signature|key|hash|path|file|html|json|data)$|^draft_content$|^national_id$|^phone(_number)?$|^id$|_id$/i;
function hygieneClean(v, key){
  if(typeof v === "string"){
    if(key && HYGIENE_SKIP_KEY.test(key)) return v;
    return v.replace(/<(?=[a-zA-Z\/!?])/g, "\uFF1C").replace(/"/g, "\u201D").replace(/'/g, "\u2019");
  }
  if(Array.isArray(v)) return v.map(x => hygieneClean(x, key));
  if(v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype){
    const o = {}; Object.keys(v).forEach(k => { o[k] = hygieneClean(v[k], k); }); return o;
  }
  return v;
}
(function(){
  const origFrom = sb.from.bind(sb);
  sb.from = function(table){
    const q = origFrom(table);
    ["insert","update","upsert"].forEach(m => {
      if(typeof q[m] === "function"){ const orig = q[m].bind(q); q[m] = function(values, opts){ return orig(hygieneClean(values), opts); }; }
    });
    return q;
  };
})();

/* ══════════ FILE UPLOAD HELPER ══════════ */
async function uploadFile(inputEl, folder){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return null;
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB — current plan's hard limit
  if(file.size > MAX_SIZE){
    alert(`تعذّر الرفع: حجم الملف (${(file.size/1024/1024).toFixed(1)} ميجا) أكبر من الحد المسموح حاليًا (٥٠ ميجا). الرجاء ضغط الملف أو تصغير حجمه والمحاولة مجددًا.`);
    inputEl.value = "";
    return null;
  }
  const safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = (currentCompanyId ? currentCompanyId : "unassigned") + "/" + folder + "/" + safeName;
  const { error } = await sb.storage.from("documents").upload(path, file);
  if(error){ alert("تعذّر رفع الملف: " + error.message); return null; }
  // The bucket is private now — generate a long-lived signed URL (10 years) instead of a
  // permanent public one, so the same stored file_url string keeps working everywhere in the
  // app exactly as before, but is no longer openly accessible to anyone off the internet.
  const { data, error: signErr } = await sb.storage.from("documents").createSignedUrl(path, 315360000);
  if(signErr || !data){ alert("تعذّر إنشاء رابط آمن للملف: " + (signErr?.message||"")); return null; }
  return data.signedUrl;
}
function downloadBtn(url){
  return url
    ? `<a class="btn-xs primary" href="${url}" target="_blank" rel="noopener"><span class="ico-i ico-inbox"></span>تحميل</a>`
    : `<button class="btn-xs primary" disabled style="opacity:0.5;cursor:not-allowed"><span class="ico-i ico-inbox"></span>لا يوجد ملف</button>`;
}
