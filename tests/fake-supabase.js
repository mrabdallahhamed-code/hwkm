// قاعدة بيانات وهمية تعمل في الذاكرة لاختبار المسارات الكاملة (تُحقن في الصفحة قبل تحميل الكود).
// تدعم: select/insert/update/delete/upsert + eq/neq/in/ilike/gte/lte/gt/lt/is + order/limit + single/maybeSingle،
// وقيود الفرادة (مثل: صوت واحد لكل مستخدم في القرار). ما عداها (auth/storage/rpc/functions) يُرجع نجاحًا فارغًا.
(function () {
  const db = (window.__db = {});
  window.__fakeUser = null; // { email }
  const UNIQUE = { circulation_votes: ["resolution_id", "voter_email"], push_subscriptions: ["endpoint"], user_company_memberships: ["email", "company_id"] };
  // القيم الافتراضية التي تضعها القاعدة الحقيقية عند الإدراج
  const DEFAULTS = { circulation_resolutions: { status: "مفتوح" }, audit_questions: { sent: false }, company_invites: { used: false } };
  const seq = {};
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const tbl = (n) => (db[n] = db[n] || []);
  const like = (v, pat) => {
    const re = new RegExp("^" + String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
    return re.test(String(v == null ? "" : v));
  };
  function builder(name) {
    const st = { count: false, op: "select", filters: [], order: null, limit: null, rows: null, patch: null, single: null, upsertKey: null };
    const run = () => {
      const t = tbl(name);
      const match = (r) => st.filters.every((f) => f(r));
      if (st.op === "insert" || st.op === "upsert") {
        const out = [];
        for (const row of st.rows) {
          const uq = UNIQUE[name];
          if (uq) {
            const dup = t.find((r) => uq.every((k) => String(r[k]).toLowerCase() === String(row[k]).toLowerCase()));
            if (dup) {
              if (st.op === "upsert") { Object.assign(dup, clone(row)); out.push(clone(dup)); continue; }
              return { data: null, error: { message: 'duplicate key value violates unique constraint "' + name + '_unique"' } };
            }
          }
          seq[name] = (seq[name] || 0) + 1;
          const n = Object.assign({ id: seq[name], created_at: new Date().toISOString() }, clone(DEFAULTS[name] || {}), clone(row));
          if (row.id != null) { n.id = row.id; seq[name] = Math.max(seq[name], row.id); }
          t.push(n); out.push(clone(n));
        }
        return { data: out, error: null };
      }
      if (st.op === "update") {
        const hit = t.filter(match); hit.forEach((r) => Object.assign(r, clone(st.patch)));
        return { data: hit.map(clone), error: null };
      }
      if (st.op === "delete") {
        const hit = t.filter(match); hit.forEach((r) => t.splice(t.indexOf(r), 1));
        return { data: hit.map(clone), error: null };
      }
      let rows = t.filter(match).map(clone);
      const total = rows.length;
      if (st.order) rows.sort((a, b) => (a[st.order.c] > b[st.order.c] ? 1 : a[st.order.c] < b[st.order.c] ? -1 : 0) * (st.order.asc ? 1 : -1));
      if (st.limit != null) rows = rows.slice(0, st.limit);
      return st.count ? { data: rows, count: total, error: null } : { data: rows, error: null };
    };
    const finish = () => {
      const r = run();
      if (st.single && !r.error) {
        const arr = r.data || [];
        if (st.single === "single" && arr.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
        return { data: arr[0] || null, error: null };
      }
      return r;
    };
    const api = {
      select(c, o) { if (o && o.count) st.count = true; return api; },
      insert(rows) { st.op = "insert"; st.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      upsert(rows) { st.op = "upsert"; st.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      update(p) { st.op = "update"; st.patch = p; return api; },
      delete() { st.op = "delete"; return api; },
      eq(c, v) { st.filters.push((r) => r[c] === v || (r[c] != null && v != null && String(r[c]) === String(v))); return api; },
      neq(c, v) { st.filters.push((r) => String(r[c]) !== String(v)); return api; },
      in(c, a) { st.filters.push((r) => a.some((v) => String(v) === String(r[c]))); return api; },
      ilike(c, p) { st.filters.push((r) => like(r[c], p)); return api; },
      gte(c, v) { st.filters.push((r) => r[c] >= v); return api; },
      lte(c, v) { st.filters.push((r) => r[c] <= v); return api; },
      gt(c, v) { st.filters.push((r) => r[c] > v); return api; },
      lt(c, v) { st.filters.push((r) => r[c] < v); return api; },
      is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api; },
      order(c, o) { st.order = { c, asc: !(o && o.ascending === false) }; return api; },
      limit(n) { st.limit = n; return api; },
      single() { st.single = "single"; return Promise.resolve(finish()); },
      maybeSingle() { st.single = "maybe"; return Promise.resolve(finish()); },
      then(res, rej) { return Promise.resolve(finish()).then(res, rej); },
    };
    return api;
  }
  const mk = () => new Proxy(function () {}, { get: (t, k) => (k === "then" ? (res) => res({ data: null, error: null, count: 0 }) : mk()), apply: () => mk() });
  const client = {
    from: (n) => builder(n),
    auth: new Proxy({}, {
      get: (t, k) => {
        if (k === "getUser") return async () => ({ data: { user: window.__fakeUser }, error: null });
        if (k === "getSession") return async () => ({ data: { session: window.__fakeUser ? { access_token: "t", user: window.__fakeUser } : null }, error: null });
        return mk()[k] || mk();
      },
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        createSignedUrl: async (p) => ({ data: { signedUrl: "https://files.test/" + p }, error: null }),
        getPublicUrl: (p) => ({ data: { publicUrl: "https://files.test/" + p } }),
      }),
    },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => client };
})();
