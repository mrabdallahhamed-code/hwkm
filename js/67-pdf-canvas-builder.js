/* ══════════ SHARED: multi-page canvas→PDF builder with Arabic text wrapping ══════════
   All 4 official AGM documents (invitation, minutes, vote-count minutes, attendance sheet) are
   long, formally-worded, and need to render correctly regardless of length — so instead of a
   fixed single canvas, this tracks a running Y position across as many pages as needed. */
class CanvasPDFBuilder {
  constructor(){
    this.scale = 2;
    this.W = 595*this.scale; this.H = 842*this.scale;
    this.sigImageCache = {};
    this.margin = 50*this.scale;
    this.pages = [];
    this.letterheadImg = null;
    this.headerHeight = 0;
  }
  // Loads the company's letterhead once (if they've uploaded one) so every page of every
  // document — announcements, minutes, disclosure forms, all of it — gets it automatically,
  // instead of each document generator needing its own letterhead logic.
  static async create(companyId){
    const b = new CanvasPDFBuilder();
    if(companyId){
      try{
        const { data: company } = await sb.from("companies").select("letterhead_url").eq("id", companyId).single();
        if(company && company.letterhead_url){
          const img = await new Promise((resolve) => {
            const im = new Image();
            im.crossOrigin = "anonymous";
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = company.letterhead_url;
          });
          if(img){ b.letterheadImg = img; b.headerHeight = 110*b.scale; }
        }
      }catch(e){ /* no letterhead configured or failed to load — proceed without one */ }
    }
    b.newPage();
    return b;
  }
  newPage(){
    const canvas = document.createElement("canvas");
    canvas.width = this.W; canvas.height = this.H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,this.W,this.H);
    ctx.direction = "rtl";
    this.ctx = ctx; this.canvas = canvas;
    if(this.letterheadImg){
      const headerDrawH = this.headerHeight - 10*this.scale;
      const headerDrawW = headerDrawH * (this.letterheadImg.width/this.letterheadImg.height);
      ctx.drawImage(this.letterheadImg, (this.W-headerDrawW)/2, 8*this.scale, headerDrawW, headerDrawH);
    }
    this.y = this.margin + this.headerHeight;
    this.pages.push(canvas);
  }
  ensureSpace(neededH){
    if(this.y + neededH > this.H - this.margin) this.newPage();
  }
  // Wraps `text` to fit within maxWidth (in scaled px), drawing each line right-aligned,
  // advancing this.y as it goes; returns nothing, just mutates state.
  wrapAndDraw(text, opts={}){
    const { font = `${11*this.scale}px Tajawal, Arial`, color = "#0D2447", lineHeight = 18*this.scale, maxWidth = this.W - this.margin*2, align = "right", x } = opts;
    this.ctx.font = font; this.ctx.fillStyle = color; this.ctx.textAlign = align;
    const drawX = x !== undefined ? x : (align === "right" ? this.W - this.margin : (align === "center" ? this.W/2 : this.margin));
    const words = String(text||"").split(" ");
    let line = "";
    const lines = [];
    for(const w of words){
      const test = line ? line + " " + w : w;
      if(this.ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
      else line = test;
    }
    if(line) lines.push(line);
    lines.forEach(l => {
      this.ensureSpace(lineHeight);
      this.ctx.fillText(l, drawX, this.y + lineHeight*0.7);
      this.y += lineHeight;
    });
  }
  spacer(h){ this.y += h*this.scale; }
  // Preloads every provided signature data-URL into an Image ahead of time (drawImage needs a
  // loaded image, and awaiting mid-draw would complicate the synchronous drawing flow below).
  async preloadSignatures(signaturesMap){
    const entries = Object.entries(signaturesMap||{}).filter(([,v]) => v && v.image);
    await Promise.all(entries.map(([role, v]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.sigImageCache[role] = img; res(); };
      img.onerror = () => res();
      img.src = v.image;
    })));
  }
  // Draws one signature slot: role label above, then either the actual signature image (if
  // this role has signed) or a plain dotted line — plus the expected signer's name either way.
  drawSigSlot(role, expectedName, x, y, signaturesMap){
    const sig = (signaturesMap||{})[role];
    this.ctx.textAlign = "center";
    this.ctx.font = `bold ${11*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#0D2447";
    this.ctx.fillText(role, x, y);
    const img = this.sigImageCache[role];
    if(sig && img){
      const sigW = 120*this.scale, sigH = sigW * (img.height/img.width);
      this.ctx.drawImage(img, x - sigW/2, y + 8*this.scale, sigW, sigH);
      this.ctx.font = `${9*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#8B95A5";
      this.ctx.fillText(sig.name || expectedName || "", x, y + sigH + 22*this.scale);
    } else {
      this.ctx.font = `${11*this.scale}px Tajawal, Arial`; this.ctx.fillStyle = "#8B95A5";
      this.ctx.fillText(expectedName || "..........................", x, y + 20*this.scale);
    }
  }
  // Stamps the company seal onto a specific page at its configured fixed position — called
  // from the signing UI's "🔖 إضافة الختم" button, separate from the signature-slot drawing
  // since a seal isn't tied to any one signer's role.
  drawSeal(sealImg, position, pageIndex){
    const canvas = this.pages[pageIndex] || this.pages[this.pages.length-1];
    const ctx = canvas.getContext("2d");
    const sealSize = 90*this.scale;
    const positions = {
      "أسفل يمين الصفحة": [this.W - this.margin - sealSize, this.H - this.margin - sealSize],
      "أسفل يسار الصفحة": [this.margin, this.H - this.margin - sealSize],
      "أسفل وسط الصفحة": [(this.W - sealSize)/2, this.H - this.margin - sealSize],
      "بجانب أول توقيع": [this.W/2 - sealSize - 20*this.scale, this.H - this.margin - sealSize*1.6]
    };
    const [x, y] = positions[position] || positions["أسفل يمين الصفحة"];
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sealImg, x, y, sealSize, sealSize);
    ctx.globalAlpha = 1;
  }
  async toPDFBytes(){
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    for(const canvas of this.pages){
      const png = canvas.toDataURL("image/png");
      const bytes = await (await fetch(png)).arrayBuffer();
      const img = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([595, 842]);
      page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    }
    return await pdfDoc.save();
  }
}

// Shared final step for all 4 generators: upload the finished PDF to storage and create a
// signing_documents row with the correct required signer count, plumbing straight into the
// e-signing system already built (and fixed) earlier today — no separate signature system needed.
async function uploadOfficialDocForSigning(pdfBytes, fileName, docName, docType, signersTotal){
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const file_url = await uploadBlobToStorage(blob, "official-documents", fileName);
  if(!file_url){ alert("تعذّر رفع الملف"); return null; }
  const { data, error } = await sb.from("signing_documents").insert([{
    company_id: currentCompanyId, document_name: docName, doc_type: docType,
    file_url, signers_total: signersTotal, due_date: null
  }]).select().single();
  if(error){ alert("تعذّر إنشاء طلب التوقيع: " + error.message); return null; }
  return data;
}
