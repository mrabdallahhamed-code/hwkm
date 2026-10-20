// بناء نسخة مصغّرة وجاهزة للنشر في مجلد dist (لا يغيّر الملفات الأصلية).
// الترتيب محفوظ: كل ملفات js تُدمج بنفس ترتيب index.html في ملف واحد مصغّر.
const fs = require("fs"), path = require("path");
let esbuild;
try { esbuild = require("esbuild"); } catch (e) { esbuild = require("/opt/npm-tools/node_modules/esbuild"); }
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tags = [...html.matchAll(/<script src="(js\/[^"?]+)(\?[^"]*)?"><\/script>/g)];
const files = tags.map(m => m[1]);
if (!files.length) { console.error("لا ملفات js في index.html"); process.exit(1); }

const joined = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
const js = esbuild.transformSync(joined, { minify: true, target: "es2020", legalComments: "none", charset: "utf8" }).code;
fs.writeFileSync(path.join(DIST, "app.js"), js);
const css = esbuild.transformSync(fs.readFileSync(path.join(ROOT, "style.css"), "utf8"), { loader: "css", minify: true, charset: "utf8" }).code;
fs.writeFileSync(path.join(DIST, "style.css"), css);

const stamp = Date.now().toString(36);
let first = true;
html = html.replace(/<script src="js\/[^"]+"><\/script>\n?/g, () => { if (first) { first = false; return `<script src="app.js?v=${stamp}"></script>\n`; } return ""; });
html = html.replace(/style\.css\?v=\d+/, `style.css?v=${stamp}`);
fs.writeFileSync(path.join(DIST, "index.html"), html);

for (const f of fs.readdirSync(ROOT)) {
  if (["index.html", "style.css", "package.json", "package-lock.json"].includes(f)) continue;
  const p = path.join(ROOT, f);
  if (fs.statSync(p).isFile() && !f.startsWith(".")) fs.copyFileSync(p, path.join(DIST, f));
}
const kb = n => (fs.statSync(path.join(DIST, n)).size / 1024).toFixed(0) + "KB";
console.log(`✔ بُني dist: app.js ${kb("app.js")} (من ${(Buffer.byteLength(joined) / 1024).toFixed(0)}KB)، style.css ${kb("style.css")}`);
