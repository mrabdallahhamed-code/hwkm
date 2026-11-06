
/* Build a real parent → child tree from parent_position text-matching, and render it as
   a classic top-down org chart: the CEO/root at the top, each generation of subordinates
   in its own centered row below, connected with simple vertical lines — not a stacked list. */
function renderOrgTree(rows, opts){
  opts = opts || {};
  const isStatic = !!opts.static, expandAll = !!opts.expandAll;
  const byTitle = {};
  rows.forEach(r => { if(r.position_title) byTitle[r.position_title] = r; });
  const hasKids = {};
  rows.forEach(r => { if(r.parent_position && byTitle[r.parent_position]) hasKids[r.parent_position] = true; });
  const childrenOf = {}, sideOf = {}, roots = [];
  rows.forEach(r => {
    const p = r.parent_position && byTitle[r.parent_position] ? r.parent_position : null;
    if(p){
      if(orgIsSideRaw(r) && !hasKids[r.position_title]){ (sideOf[p] = sideOf[p] || []).push(r); }
      else { (childrenOf[p] = childrenOf[p] || []).push(r); }
    } else {
      roots.push(r);
    }
  });
  const byLevel = (a,b) => (a.level ?? 99) - (b.level ?? 99) || a.id - b.id;
  roots.sort(byLevel);
  Object.keys(childrenOf).forEach(k => childrenOf[k].sort(byLevel));
  Object.keys(sideOf).forEach(k => sideOf[k].sort(byLevel));

  const hangWidth = d => Math.max(110, 170 - 20 * d);
  const estH = n => (!n.is_body && n.holder_name) ? 52 : 34;

  // w = fixed width (departments and everything below them); null = natural width (governance / management levels)
  function box(s, depth, hiddenCount, isOpen, w){
    const small = depth > 0;
    const pad = small ? "7px 14px" : "9px 20px";
    const fs = small ? "11px" : "13px";
    const ring = s.is_body ? "box-shadow:inset 0 0 0 2px rgba(255,255,255,.55);" : "";
    const icon = s.is_body ? '<span class="ico ico-columns" style="width:14px;height:14px;vertical-align:-2px;margin-inline-end:5px"></span>' : "";
    const holder = (!s.is_body && s.holder_name) ? `<div style="font-size:${small ? "10px" : "11px"};font-weight:600;opacity:.92;margin-top:2px;${w ? "" : "white-space:nowrap"}">${orgEsc(s.holder_name)}</div>` : "";
    let chip = "";
    if(hiddenCount > 0 || isOpen){
      if(isStatic){ chip = hiddenCount > 0 ? `<div style="font-size:10px;font-weight:700;opacity:.9;margin-top:3px">+${hiddenCount}</div>` : ""; }
      else { chip = `<span onclick="event.stopPropagation();toggleOrgNode(${s.id})" title="${isOpen ? "طي" : "عرض الأقسام والوحدات التابعة"}" style="cursor:pointer;display:inline-block;margin-top:4px;background:rgba(255,255,255,.25);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${isOpen ? "−" : "+" + hiddenCount}</span>`; }
    }
    const click = isStatic ? "" : `onclick="editStructure(${s.id})" title="اضغط للتعديل أو الحذف" `;
    const sizing = w ? `width:${w}px;box-sizing:border-box;` : `min-width:${small ? 120 : 130}px;`;
    return `<div ${click}style="${isStatic ? "" : "cursor:pointer;"}display:inline-block;background:${orgLevelColor(s.level)};color:#fff;border-radius:6px;padding:${pad};font-size:${fs};font-weight:800;${sizing}text-align:center;${ring}"><div style="${w ? "word-break:break-word" : "white-space:nowrap"}">${icon}${orgEsc(s.position_title)}</div>${holder}${chip}</div>`;
  }

  // Which sub-positions are shown for a node, honouring the fold state (default: sections and units start folded).
  function visibleKids(s){
    const all = childrenOf[s.position_title] || [];
    const collapsible = all.filter(k => (k.level ?? 0) >= ORG_COLLAPSE_FROM_LEVEL);
    const ov = (isStatic || expandAll) ? undefined : orgOverride.get(s.id);
    let kids;
    if(expandAll) kids = all;
    else if(ov === true) kids = [];
    else if(ov === false) kids = all;
    else kids = collapsible.length ? all.filter(k => (k.level ?? 0) < ORG_COLLAPSE_FROM_LEVEL) : all;
    const hidden = all.length - kids.length;
    orgNodeCollapsed[s.id] = hidden > 0;
    return { kids, hidden, isOpen: !isStatic && !expandAll && all.length > 0 && hidden === 0 };
  }

  // Everything below a department hangs vertically: one list under the parent, each level indented 20px,
  // with a spine and a tick per item (like a folder tree). Departments themselves stay in one horizontal row.
  function hangList(kids, pd, extraTop){
    return `<div style="width:${hangWidth(pd)}px;margin-top:${8 + (extraTop || 0)}px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">${kids.map((k, i) => hangChild(k, pd + 1, i === kids.length - 1)).join("")}</div>`;
  }
  function hangChild(k, d, isLast){
    const w = hangWidth(d);
    const vk = visibleKids(k);
    const sub = vk.kids.concat(sideOf[k.position_title] || []);
    const tickY = Math.round(estH(k) / 2);
    const spine = `<span style="position:absolute;right:-11px;top:-8px;width:2px;background:var(--gray2);height:${isLast ? (8 + tickY) + "px" : "calc(100% + 8px)"}"></span>`;
    const tick = `<span style="position:absolute;right:-10px;top:${tickY}px;width:10px;border-top:2px solid var(--gray2)"></span>`;
    return `<div style="position:relative;width:${w}px;margin-right:20px">${spine}${tick}${box(k, 1, vk.hidden, vk.isOpen, w)}${sub.length ? hangList(sub, d) : ""}</div>`;
  }

  // Real org-chart connectors for the upper levels: a stem drops from the parent to a horizontal bus line
  // spanning exactly the width of its children, then a stem drops from that bus to each child
  // (the standard CSS "family tree" trick: half-border on first/last child).
  function renderNode(s, depth){
    const allKids = childrenOf[s.position_title] || [];
    // A node hangs its children vertically when it is a department (level 6+), or when everything under it is a section / unit (level 7+) — even if the department itself was saved at level 4 or 5.
    const hangRoot = (s.level ?? 0) >= 6 || (allKids.length > 0 && allKids.every(k => (k.level ?? 0) >= 7));
    const vk = visibleKids(s);
    const kids = vk.kids;
    const sides = sideOf[s.position_title] || [];
    let html = `<div style="display:flex;flex-direction:column;align-items:center">`;
    let head = box(s, depth, vk.hidden, vk.isOpen, hangRoot ? hangWidth(0) : null);
    if(sides.length){
      head = `<div style="padding:0 ${ORG_SIDE_WIDTH}px"><div style="position:relative;display:inline-block">${head}<div style="position:absolute;right:100%;top:0;display:flex;flex-direction:column;gap:6px">${sides.map(k => `<div style="display:flex;align-items:center;direction:rtl"><span style="display:block;width:26px;border-top:2px dashed #7A8794"></span>${box(k, Math.max(depth,1), 0, false, null)}</div>`).join("")}</div></div></div>`;
    }
    html += head;
    // Several side units stack downwards; lengthen the space below so they never touch the connector bus.
    const sideExtra = sides.length ? Math.max(0, sides.reduce((a, k) => a + estH(k), 0) + (sides.length - 1) * 6 - estH(s)) : 0;
    if(kids.length && hangRoot){
      html += hangList(kids, 0, sideExtra);
    } else if(kids.length){
      html += `<div style="width:2px;height:${18 + sideExtra}px;background:var(--gray2)"></div>`;
      html += `<div style="display:flex;flex-direction:row;align-items:flex-start">`;
      kids.forEach((k, i) => {
        const isFirst = i === 0, isLast = i === kids.length-1, isOnly = kids.length === 1;
        // The page is RTL, so the first markup half renders on the right and the second on the left.
        // A child only draws the half reaching toward a sibling that actually exists on that side.
        const rightHalf = (isOnly || isFirst) ? "transparent" : "var(--gray2)";
        const leftHalf = (isOnly || isLast) ? "transparent" : "var(--gray2)";
        html += `<div style="flex:1;padding:0 16px;position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="position:absolute;top:0;right:0;left:0;height:2px;display:flex">
            <div style="flex:1;background:${rightHalf}"></div>
            <div style="flex:1;background:${leftHalf}"></div>
          </div>
          <div style="width:2px;height:16px;background:var(--gray2)"></div>
          ${renderNode(k, depth+1)}
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Phone layout: one vertical, indented list (every level under its parent) — no sideways scrolling.
  function mobNode(n, d){
    const vk = visibleKids(n);
    const sides = sideOf[n.position_title] || [];
    const all = vk.kids.concat(sides);
    const chip = (vk.hidden > 0 || vk.isOpen) ? `<span onclick="event.stopPropagation();toggleOrgNode(${n.id})" style="cursor:pointer;margin-inline-start:8px;background:rgba(255,255,255,.28);border-radius:10px;padding:1px 10px;font-size:11px;font-weight:800">${vk.isOpen ? "−" : "+" + vk.hidden}</span>` : "";
    const dashed = orgIsSideRaw(n) && !(childrenOf[n.position_title] || []).length ? "outline:2px dashed rgba(255,255,255,.7);outline-offset:-4px;" : "";
    const holder = (!n.is_body && n.holder_name) ? `<div style="font-size:11px;font-weight:600;opacity:.92;margin-top:2px">${orgEsc(n.holder_name)}</div>` : "";
    const card = `<div onclick="editStructure(${n.id})" style="background:${orgLevelColor(n.level)};color:#fff;border-radius:8px;padding:9px 12px;font-size:12.5px;font-weight:800;${dashed}display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span>${orgEsc(n.position_title)}</span>${chip}</div>${holder}</div>`;
    const kidsHtml = all.length ? `<div style="margin:6px 6px 0 0;padding-right:8px;border-right:2px solid var(--gray2);display:flex;flex-direction:column;gap:6px">${all.map(k => mobNode(k, d + 1)).join("")}</div>` : "";
    return `<div>${card}${kidsHtml}</div>`;
  }
  if(opts.mobile && !isStatic && roots.length){
    return `<div style="display:flex;flex-direction:column;gap:8px">${roots.map(r => mobNode(r, 0)).join("")}</div>`;
  }

  if(roots.length===0) return '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">تعذّر رسم الهيكل — تحقق من ربط "يتبع لـ" لكل منصب.</div>';
  return `<div style="display:flex;justify-content:center;gap:50px;align-items:flex-start">${roots.map(r => renderNode(r, 0)).join("")}</div>`;
}

/* Colour legend + the structure type, shown under the tree on screen and inside every PDF page. */
function orgLegendHTML(rows){
  const levels = [...new Set(rows.map(r => r.level).filter(l => l != null))].sort((a,b) => a-b);
  const titles = new Set(rows.map(r => r.position_title));
  const hasSide = rows.some(r => orgIsSideRaw(r) && r.parent_position && titles.has(r.parent_position));
  const item = "display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#0D2447;margin:2px 9px";
  const swatches = levels.map(l => `<span style="${item}"><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${orgLevelColor(l)}"></i>${orgEsc((currentLang === "en" && (ORG_LABELS_EN[orgLevelKind()] || {})[l]) || orgLabels()[l] || orgLevelLabels[l] || ("مستوى " + l))}</span>`).join("");
  const side = hasSide ? `<span style="${item}"><i style="display:inline-block;width:22px;border-top:2px dashed #7A8794"></i>وحدة جانبية (داعمة / رقابية)</span>` : "";
  return `<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e0d0;text-align:center"><div>${swatches}${side}</div><div style="font-size:11px;color:#5b6678;margin-top:6px">نوع الهيكل: هرمي وظيفي مع وحدات جانبية (Line &amp; Staff)</div></div>`;
}
/* Tree rows = positions marked "show in tree" + every position above them, so a hidden owner / CEO never leaves its departments floating without a head. */
function orgTreeRows(all){
  all = all || [];
  const bt = {}; all.forEach(r => { if(r.position_title) bt[r.position_title] = r; });
  const keep = new Set();
  all.filter(r => r.is_leadership !== false).forEach(r => {
    let cur = r, n = 0;
    while(cur && !keep.has(cur.id) && n++ < 12){ keep.add(cur.id); cur = cur.parent_position ? bt[cur.parent_position] : null; }
  });
  return all.filter(r => keep.has(r.id));
}
function rerenderOrgTree(){
  const c = document.getElementById("orgTreeContainer");
  if(!c || !structureCache || !structureCache.length) return;
  const rows = orgTreeRows(structureCache);
  c.innerHTML = renderOrgTree(rows, { mobile: window.innerWidth <= 700 && orgMobileList }) + orgLegendHTML(rows);
  orgFitPhone();
}
/* الجوال: نعرض نفس مخطط الكمبيوتر مصغّرًا ليناسب العرض (لا أصغر من 55% حتى يبقى مقروءًا)،
   ويمكن تحريكه يمينًا ويسارًا، وزر «عرض كقائمة» يبدّل إلى القائمة العمودية. */
let orgMobileList = false;
function orgFitPhone(){
  const c = document.getElementById("orgTreeContainer");
  if(!c) return;
  c.style.zoom = "";
  const btn = document.getElementById("orgViewBtn");
  const phone = window.innerWidth <= 700;
  if(btn) btn.textContent = orgMobileList ? "عرض كمخطط" : "عرض كقائمة";
  if(!phone || orgMobileList) return;
  const inner = c.firstElementChild, sc = c.parentElement;
  if(!inner || !sc) return;
  const need = inner.scrollWidth, have = sc.clientWidth;
  if(need > have && have > 0) c.style.zoom = String(Math.max(0.55, have / need));
  orgCenterScroll();
}
function orgToggleView(){ orgMobileList = !orgMobileList; rerenderOrgTree(); }
/* على الشاشات العريضة: افتح الشجرة وجذرها في منتصف منطقة العرض بدل أن تبدأ من طرف واحد. */
function orgCenterScroll(){
  const c = document.getElementById("orgTreeContainer");
  const sc = c && c.parentElement;
  if(!sc || sc.scrollWidth <= sc.clientWidth + 4) return;
  const d = sc.scrollWidth - sc.clientWidth;
  sc.scrollLeft = getComputedStyle(sc).direction === "rtl" ? -d / 2 : d / 2;
}
let __orgMob = null;
window.addEventListener("resize", () => { const m = window.innerWidth <= 700; if(__orgMob !== null && m !== __orgMob && document.getElementById("orgTreeContainer")) rerenderOrgTree(); __orgMob = m; });
function toggleOrgNode(id){ orgOverride.set(id, !orgNodeCollapsed[id]); rerenderOrgTree(); }
function orgExpandAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, false)); rerenderOrgTree(); }
function orgCollapseAll(){ (structureCache || []).forEach(s => orgOverride.set(s.id, true)); rerenderOrgTree(); }
