/* ══════════ ENGLISH TRANSLATION LAYER ══════════
   Rather than rewrite every function that builds Arabic HTML (hundreds of them), we translate
   the rendered DOM after the fact: a dictionary of exact Arabic phrases → English, applied to
   every text node (and placeholder/title attributes) on load and again via MutationObserver
   whenever new content renders (page navigation, data loading, modals opening). Any Arabic
   string with no dictionary entry is simply left as-is — a safe fallback, never a broken UI. */
let currentLang = localStorage.getItem('hawkim_lang') || 'ar';

let TRANSLATIONS = {}, TRANSLATION_PATTERNS = [], TRANSLATION_INDEX = {};
/* The English dictionary lives in i18n-en.js and is fetched only when English is actually used,
   so Arabic users (almost everyone) do not download or parse it. */
let i18nLoading = null;
function adoptI18n(){ const p = window.__I18N_EN; if(p){ TRANSLATIONS = p.dict; TRANSLATION_PATTERNS = p.patterns; TRANSLATION_INDEX = p.index; return true; } return false; }
function loadI18n(){
  if(adoptI18n()) return Promise.resolve();
  if(i18nLoading) return i18nLoading;
  i18nLoading = new Promise((resolve, reject) => {
    const sc = document.createElement("script"); sc.src = "i18n-en.js?v=944ecdad";
    sc.onload = () => { adoptI18n(); resolve(); };
    sc.onerror = () => { i18nLoading = null; reject(new Error("i18n load failed")); };
    document.head.appendChild(sc);
  });
  return i18nLoading;
}
adoptI18n(); // English users get the dictionary from the early synchronous tag below

// Index of dictionary keys by their first Arabic word so mixed strings (fixed text + dynamic
// numbers/names) can be translated phrase-by-phrase, longest phrase first.
const AR_LETTER = /[؀-ۿ]/;

function translatePhrases(text){
  let out = "", i = 0, changed = false;
  const n = text.length;
  while(i < n){
    const ch = text[i];
    if(AR_LETTER.test(ch) && (i === 0 || !AR_LETTER.test(text[i-1]))){
      let j = i;
      while(j < n && /[؀-ۿً-ٟ‏]/.test(text[j])) j++;
      const cands = TRANSLATION_INDEX[text.slice(i, j)];
      let hit = null;
      if(cands){
        for(const k of cands){
          if(k.length < 4) continue; // never swap tiny function words inside longer sentences
          if(text.startsWith(k, i)){
            const nx = text[i + k.length];
            if(nx === undefined || !AR_LETTER.test(nx)){ hit = k; break; }
          }
        }
      }
      if(hit){ out += TRANSLATIONS[hit]; i += hit.length; changed = true; continue; }
      out += text.slice(i, j); i = j; continue;
    }
    out += ch; i++;
  }
  return changed ? out : text;
}

function translateText(text){
  if(!text || !AR_LETTER.test(text)) return text;
  const trimmed = text.trim();
  if(!trimmed) return text;
  if(TRANSLATIONS[trimmed]) return text.replace(trimmed, TRANSLATIONS[trimmed]);
  const collapsed = trimmed.replace(/\s+/g, ' ');
  if(collapsed !== trimmed && TRANSLATIONS[collapsed]) return text.replace(trimmed, TRANSLATIONS[collapsed]);
  for(const [pattern, fn] of TRANSLATION_PATTERNS){
    const m = trimmed.match(pattern);
    if(m) return text.replace(trimmed, fn(m));
  }
  return translatePhrases(text);
}

const TRANSLATABLE_ATTRS = ['placeholder','title','aria-label','alt'];
function translateAttrs(el){
  TRANSLATABLE_ATTRS.forEach(a => {
    const v = el.getAttribute && el.getAttribute(a);
    if(v && AR_LETTER.test(v)){ const t = translateText(v); if(t !== v) el.setAttribute(a, t); }
  });
  if(el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && AR_LETTER.test(el.value||'')){
    const t = translateText(el.value); if(t !== el.value) el.value = t;
  }
}

function translateSubtree(root){
  if(!root) return;
  if(root.nodeType === Node.TEXT_NODE){
    const t = translateText(root.textContent); if(t !== root.textContent) root.textContent = t;
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while((n = walker.nextNode())){
    const p = n.parentNode && n.parentNode.nodeName;
    if(p === 'SCRIPT' || p === 'STYLE') continue;
    nodes.push(n);
  }
  nodes.forEach(node => {
    const t = translateText(node.textContent);
    if(t !== node.textContent) node.textContent = t;
  });
  if(root.nodeType === Node.ELEMENT_NODE) translateAttrs(root);
  root.querySelectorAll?.('[placeholder],[title],[aria-label],[alt],input[type=button],input[type=submit]').forEach(translateAttrs);
}

// Observer shared by every entry point: new nodes, edited text, and changed attributes.
function makeLangObserver(){
  return new MutationObserver((mutations) => {
    for(const m of mutations){
      if(m.type === 'childList'){
        m.addedNodes.forEach(node => {
          if(node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) translateSubtree(node);
        });
      } else if(m.type === 'characterData'){
        translateSubtree(m.target);
      } else if(m.type === 'attributes'){
        translateAttrs(m.target);
      }
    }
  });
}
const LANG_OBSERVER_OPTS = { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:TRANSLATABLE_ATTRS };

// alert / confirm / prompt messages are not DOM text, so translate them at call time.
(function(){
  ['alert','confirm','prompt'].forEach(fn => {
    const orig = window[fn].bind(window);
    window[fn] = function(msg, ...rest){
      if(typeof currentLang !== 'undefined' && currentLang === 'en' && typeof msg === 'string') msg = translateText(msg);
      return orig(msg, ...rest);
    };
  });
})();

let langObserver = null;
function applyTranslation(){
  if(currentLang !== 'en') return;
  translateSubtree(document.body);
}

function toggleLanguage(){
  setLanguage(currentLang === 'ar' ? 'en' : 'ar');
}

function setLanguage(lang){
  if(lang === 'en'){ loadI18n().then(() => setLanguageNow(lang)).catch(() => alert("تعذّر تحميل اللغة الإنجليزية الآن، تحقق من الاتصال وأعد المحاولة.")); }
  else setLanguageNow(lang);
}
function setLanguageNow(lang){
  currentLang = lang;
  localStorage.setItem('hawkim_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  const btn = document.getElementById('btnLangToggle');
  if(btn) btn.textContent = lang === 'en' ? 'AR' : 'EN';
  if(lang === 'en'){
    applyTranslation();
    if(!langObserver){
      langObserver = makeLangObserver();
    }
    langObserver.observe(document.body, LANG_OBSERVER_OPTS);
  } else if(langObserver){
    langObserver.disconnect();
    location.reload(); // simplest reliable way back to full Arabic without stale translated text lingering
  }
}
