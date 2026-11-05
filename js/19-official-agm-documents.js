/* ══════════ 1) دعوة الجمعية العامة — موقّع واحد: رئيس مجلس الإدارة ══════════ */
/* ══════════ OFFICIAL AGM DOCUMENTS — regenerate-on-each-signature architecture ══════════
   Each doc type below is split into prepareData() (fetch everything needed from the DB, once)
   and draw() (pure canvas drawing, called both at first creation with empty signatures AND
   again after every single signature, with the FULL set of signatures collected so far — this
   is what lets each signature land in its correct spot on the actual document, not a bolted-on
   certificate page, matching how regulators expect these to look). */
const OFFICIAL_DOC_TYPES = {
  "دعوة جمعية عامة": {
    roles: ["رئيس مجلس الإدارة"],
    async prepareData(meetingId){
      const [{ data: m }, { data: topics }, { data: companyRow }] = await Promise.all([
        sb.from("meetings").select("*").eq("id", meetingId).single(),
        sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("id",{ascending:true}),
        sb.from("companies").select("name").eq("id", currentCompanyId).single()
      ]);
      return { m, topics: topics||[], companyName: companyRow?.name || "الشركة" };
    },
    async draw(b, data, signaturesMap, roleNames){
      const { m, topics, companyName } = data;
      const callLabel = { 1:"الأول", 2:"الثاني", 3:"الثالث" }[m.call_number||1] || "الأول";
      const todayStr = new Date().toLocaleDateString("ar-SA-u-ca-gregory");
      b.wrapAndDraw(`التاريخ: ${todayStr}`, { align:"left", x: b.margin, font:`${10*b.scale}px Tajawal, Arial` });
      b.spacer(20);
      b.wrapAndDraw(`دعوة لانعقاد ${m.title||"الجمعية العامة"} ${m.agm_type||"العادية"}`, { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
      b.spacer(24);
      b.wrapAndDraw(
        `يتشرف مجلس إدارة ${companyName} بدعوة السادة مساهمي الشركة الكرام لحضور اجتماع ${m.title||"الجمعية العامة"} ${m.agm_type||"العادية"} ${callLabel} للشركة، والذي سينعقد إن شاء الله ${m.method||""} في تمام الساعة (${m.meeting_time||""}) مساءً بتاريخ ${m.meeting_date||""} وذلك للنظر في جدول الأعمال التالي:`,
        { font:`${12*b.scale}px Tajawal, Arial`, lineHeight: 22*b.scale }
      );
      b.spacer(18);
      topics.forEach(t => b.wrapAndDraw(`- ${t.topic_text||t.topic||""}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale }));
      b.spacer(40);
      b.wrapAndDraw("وتقبلوا خالص تحياتي.", { font:`${12*b.scale}px Tajawal, Arial` });
      b.spacer(30);
      await b.preloadSignatures(signaturesMap);
      b.ensureSpace(50*b.scale);
      b.drawSigSlot("رئيس مجلس الإدارة", roleNames["رئيس مجلس الإدارة"], b.W/2, b.y, signaturesMap);
    }
  },

  "محضر جمعية عامة": {
    roles: ["سكرتير الجمعية", "رئيس الجمعية"],
    async prepareData(meetingId){
      const [{ data: m }, { data: company }, { data: topics }, { data: votes }] = await Promise.all([
        sb.from("meetings").select("*").eq("id", meetingId).single(),
        sb.from("companies").select("name,total_shares").eq("id", currentCompanyId).single(),
        sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("id",{ascending:true}),
        sb.from("votes").select("*").eq("meeting_id", meetingId).not("shareholder_name","is",null)
      ]);
      const { list: attendees } = await getAttendeesList(meetingId);
      return { m, company, topics: topics||[], votes: votes||[], attendees: attendees||[] };
    },
    async draw(b, data, signaturesMap, roleNames, extra){
      const { m, company, topics, votes, attendees } = data;
      const companyName = company?.name || "الشركة";
      const companyTotalShares = Number(company?.total_shares)||0;
      // A listed company's real attendance/quorum figures come from Tadawul (entered manually
      // after the meeting), not our own check-in system — use them when present, otherwise fall
      // back to the platform's own attendee list exactly as before for private companies.
      const attendee_count = m.manual_attendee_count != null ? Number(m.manual_attendee_count) : attendees.length;
      const attendee_shares = m.manual_attendee_shares != null ? Number(m.manual_attendee_shares) : attendees.reduce((s,a)=>s+(Number(a.shares)||0),0);
      const attendance_pct = companyTotalShares ? Math.round(attendee_shares/companyTotalShares*100) : 0;
      const quorum_threshold = extra?.quorum_threshold || 50;
      const quorum_status = attendance_pct >= quorum_threshold ? "مكتمل النصاب" : "غير مكتمل النصاب";
      const committee1 = extra?.committee1 || "....................", committee2 = extra?.committee2 || "....................";
      const chairman_name = roleNames["رئيس الجمعية"], secretary_name = roleNames["سكرتير الجمعية"];
      const isListed = !!m.is_listed_agm;

      const topicResults = topics.map(t => {
        const topicText = t.topic_text || t.topic || "";
        let yes_pct, no_pct, abs_pct, exactYes = null;
        if(t.manual_yes_pct != null || t.manual_no_pct != null || t.manual_abs_pct != null){
          yes_pct = Math.round(Number(t.manual_yes_pct)||0);
          no_pct = Math.round(Number(t.manual_no_pct)||0);
          abs_pct = Math.round(Number(t.manual_abs_pct)||0);
        } else {
          const relevant = votes.filter(v => v.topic === topicText);
          const sh = v => Number(v.shares_count) || 0;
          const yesS = relevant.filter(v=>v.result==="موافق").reduce((x,v)=>x+sh(v),0);
          const noS = relevant.filter(v=>v.result==="معارض").reduce((x,v)=>x+sh(v),0);
          const absS = relevant.filter(v=>v.result==="ممتنع").reduce((x,v)=>x+sh(v),0);
          const votedS = yesS + noS + absS;
          const repS = Math.max(attendee_shares || 0, votedS) || 1;
          yes_pct = Math.round(yesS/repS*100); no_pct = Math.round(noS/repS*100); abs_pct = Math.max(0, 100 - yes_pct - no_pct);
          exactYes = yesS/repS*100;
        }
        const req = agmRequiredMajority(m.agm_type, topicText);
        const yy = exactYes != null ? exactYes : yes_pct;
        const ok = req.strict ? yy > req.pct : yy + 1e-9 >= req.pct;
        return { topic_text: topicText, yes_pct, no_pct, abs_pct, decision: ok ? "تمت الموافقة" : "لم تتم الموافقة" };
      });

      b.wrapAndDraw(`محضر اجتماع الجمعية العامة ${m.agm_type||"العادية"}`, { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
      b.spacer(6);
      b.wrapAndDraw(`لشركة ${companyName}`, { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial` });
      b.spacer(4);
      b.wrapAndDraw(`(${m.title||""})`, { align:"center", font:`${11*b.scale}px Tajawal, Arial`, color:"#8B95A5" });
      b.spacer(6);
      b.wrapAndDraw(`يوم .................. بتاريخ ${m.meeting_date||""} الموافق ${m.meeting_date||""}م`, { align:"center", font:`${11*b.scale}px Tajawal, Arial` });
      b.spacer(20);
      b.wrapAndDraw(`بناءً على الدعوة التي وجهها مجلس إدارة شركة ${companyName} إلى المساهمين على عناوينهم المعتمدة لعقد اجتماع الجمعية العامة ${m.agm_type||"العادية"} لشركة ${companyName} ${m.method||""} في تمام الساعة (${m.meeting_time||""}) من مساء يوم .................. بتاريخ ${m.meeting_date||""}.`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      b.spacer(14);
      b.wrapAndDraw(`عليه عقد الاجتماع برئاسة الأستاذ ${chairman_name||".................................."} (رئيس مجلس إدارة الشركة).`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      b.spacer(14);
      b.wrapAndDraw(`افتتح رئيس الجمعية – رئيس مجلس الإدارة الأستاذ ${chairman_name||".................................."} الاجتماع، ورحب بجميع السادة المساهمين الحضور. ومن ثم سأل رئيس الجمعية السادة المساهمين الحضور فيما إذا رغب أحدهم الترشح ليكون سكرتيرًا للجمعية أو المشاركة في لجنة جمع وفرز الأصوات، وباعتذار المساهمين عن الترشيح قام رئيس الجمعية بتعيين ${secretary_name||".................................."} سكرتيرًا للجمعية، كما تم تعيين كلٍّ من الأستاذ ${committee1} والأستاذ ${committee2} أعضاءً في لجنة جمع وفرز الأصوات.`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      b.spacer(14);
      b.wrapAndDraw(`وبعد التأكد من الحضور أعلن رئيس الاجتماع بأن النصاب مكتمل والجلسة نظامية وفقًا للمادة الرابعة والتسعين من نظام الشركات، حيث بلغت الأسهم الحاضرة والممثلة بالاجتماع عدد (${attendee_shares}) سهمًا بحضور (${attendee_count}) مساهمًا، وبنسبة (${attendance_pct}%) من إجمالي أسهم رأس مال الشركة — ${quorum_status} (الحد الأدنى النظامي: ${quorum_threshold}%)، ومن ثم بدأت مناقشة جدول الأعمال.`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      b.spacer(14);
      if(isListed){
        b.wrapAndDraw("عقب ذلك طلب رئيس الجمعية من المساهمين أن يتفضلوا بالاستفسار عن أي نقاط أو أسئلة عن بنود الجمعية، وقد أجاب رئيس مجلس الإدارة عن كافة الأسئلة والاستفسارات.", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
        b.spacer(14);
        b.wrapAndDraw("بعد ذلك تم التصويت على بنود جدول الأعمال إلكترونيًا عبر منظومة التصويت الآلي المقدَّمة من شركة السوق المالية السعودية (تداول)، والمتاحة لجميع المساهمين عن بُعد وفي مقر انعقاد الجمعية.", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
        b.spacer(14);
        b.wrapAndDraw("وعليه، وردت نتائج التصويت رسميًا من شركة تداول، وكانت نتائج التصويت على البنود المدرجة في جدول أعمال الجمعية كما يلي:", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      } else {
        b.wrapAndDraw("عقب ذلك طلب رئيس الجمعية من المساهمين أن يتفضلوا بالاستفسار عن أي نقاط أو أسئلة عن بنود الجمعية، وقد أجاب رئيس مجلس الإدارة عن كافة الأسئلة والاستفسارات.", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
        b.spacer(14);
        b.wrapAndDraw("بعد ذلك طلب سكرتير الجمعية من المساهمين الإدلاء بأصواتهم على البنود في بطاقة التصويت التي وُزّعت عليهم. وبعد انتهاء عملية التصويت قام عضوا لجنة جمع وفرز الأصوات بجمع بطاقات التصويت وفرزها.", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
        b.spacer(14);
        b.wrapAndDraw("وعليه تم فرز نتائج التصويت وإعداد المحضر المرفق بنتائج التصويت، حيث كانت نتائج التصويت على البنود المدرجة في جدول أعمال الجمعية كما يلي:", { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      }
      b.spacer(16);
      topicResults.forEach(r => {
        b.wrapAndDraw(`القرار — ${r.topic_text}:`, { font:`bold ${11.5*b.scale}px Tajawal, Arial`, color:"#1A3A6B", lineHeight: 20*b.scale });
        b.wrapAndDraw(`الموافقة بنسبة (${r.yes_pct}%) من الحضور، مقابل (${r.no_pct}%) غير موافق و(${r.abs_pct}%) ممتنع — النتيجة: ${r.decision}.`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
        b.spacer(10);
      });
      b.spacer(10);
      b.wrapAndDraw(`وبانتهاء جدول أعمال الجمعية العامة ${m.agm_type||"العادية"} بتاريخ ${m.meeting_date||""} وبالتصديق على قراراتها، رُفعت بحمد الله الجلسة، ونُظم هذا المحضر بكل ما سبق ووُقّع من قبل رئيس الجمعية والسكرتير.`, { font:`${11*b.scale}px Tajawal, Arial`, lineHeight: 20*b.scale });
      b.spacer(10);
      b.wrapAndDraw("والله ولي التوفيق", { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
      b.spacer(45);
      await b.preloadSignatures(signaturesMap);
      b.ensureSpace(70*b.scale);
      b.drawSigSlot("سكرتير الجمعية", secretary_name, b.W*0.28, b.y, signaturesMap);
      b.drawSigSlot("رئيس الجمعية", chairman_name, b.W*0.72, b.y, signaturesMap);
    }
  },

  "محضر فرز الأصوات": {
    roles: ["سكرتير الجمعية", "رئيس الجمعية", "عضو اللجنة 1", "عضو اللجنة 2"],
    async prepareData(meetingId){
      const [{ data: m }, { data: companyRow }, { data: topics }, { data: votes }] = await Promise.all([
        sb.from("meetings").select("*").eq("id", meetingId).single(),
        sb.from("companies").select("name").eq("id", currentCompanyId).single(),
        sb.from("vote_topics").select("*").eq("meeting_id", meetingId).order("id",{ascending:true}),
        sb.from("votes").select("*").eq("meeting_id", meetingId).not("shareholder_name","is",null)
      ]);
      const { list: attendees } = await getAttendeesList(meetingId);
      return { m, companyName: companyRow?.name||"الشركة", topics: topics||[], votes: votes||[], attendees: attendees||[] };
    },
    async draw(b, data, signaturesMap, roleNames){
      const { m, companyName, topics, votes, attendees } = data;
      const total_attendees = attendees.length;
      const total_shares = attendees.reduce((s,a)=>s+(Number(a.shares)||0),0);
      const results = topics.map(t => {
        const topicText = t.topic_text || t.topic || "";
        const relevant = votes.filter(v => v.topic === topicText);
        const totalVotes = relevant.length || 1;
        const yes = relevant.filter(v=>v.result==="موافق").length;
        const no = relevant.filter(v=>v.result==="معارض").length;
        const abs = relevant.filter(v=>v.result==="ممتنع").length;
        return { topic: topicText, yes_pct: Math.round(yes/totalVotes*100), no_pct: Math.round(no/totalVotes*100), abs_pct: Math.round(abs/totalVotes*100) };
      });

      b.wrapAndDraw("محضر فرز الأصوات", { align:"center", font:`bold ${17*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
      b.spacer(22);
      b.wrapAndDraw(`لقد تم انعقاد الجمعية العامة العادية لشركة ${companyName} في يوم .................. الموافق ${m.meeting_date||""}، وفي تمام الساعة (${m.meeting_time||"—"}) مساءً، وتم جمع بطاقات التصويت البالغة (${total_attendees}) بطاقة، واجتمعت لجنة الفرز واتضح أن الأصوات الممثلة في الاجتماع بلغت (${total_shares}) سهم، وبفرز الأصوات كانت النتائج على النحو التالي:`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight: 21*b.scale });
      b.spacer(20);

      const tableW = b.W - b.margin*2;
      const wNo = tableW*0.06, wCol = tableW*0.18, wItem = tableW - wNo - wCol*3;
      const xNoStart = (b.W-b.margin) - wNo;
      const xItemStart = xNoStart - wItem;
      const xAgreeStart = xItemStart - wCol;
      const xDisagreeStart = xAgreeStart - wCol;
      const xAbstainStart = xDisagreeStart - wCol;
      const cols = [ {s:xNoStart,e:b.W-b.margin,l:"م"}, {s:xItemStart,e:xNoStart,l:"البند"}, {s:xAgreeStart,e:xItemStart,l:"موافق"}, {s:xDisagreeStart,e:xAgreeStart,l:"غير موافق"}, {s:xAbstainStart,e:xDisagreeStart,l:"ممتنع"} ];
      b.ensureSpace(30*b.scale);
      const headerH = 26*b.scale;
      b.ctx.strokeStyle="#333"; b.ctx.lineWidth=1*b.scale; b.ctx.font=`bold ${10*b.scale}px Tajawal, Arial`; b.ctx.textAlign="center";
      cols.forEach(c => { b.ctx.strokeRect(c.s, b.y, c.e-c.s, headerH); b.ctx.fillText(c.l, (c.s+c.e)/2, b.y+17*b.scale); });
      b.y += headerH;
      b.ctx.font=`${10*b.scale}px Tajawal, Arial`;
      (results.length?results:[{topic:"",yes_pct:0,no_pct:0,abs_pct:0}]).forEach((r,i) => {
        b.ensureSpace(30*b.scale);
        const rowH = 30*b.scale;
        cols.forEach(c => b.ctx.strokeRect(c.s, b.y, c.e-c.s, rowH));
        b.ctx.textAlign="center"; b.ctx.fillText(String(i+1), (xNoStart+b.W-b.margin)/2, b.y+rowH/2+4*b.scale);
        b.ctx.textAlign="right";
        const t = r.topic.length>26 ? r.topic.slice(0,26)+"…" : r.topic;
        b.ctx.fillText(t, xNoStart-6*b.scale, b.y+rowH/2+4*b.scale);
        b.ctx.textAlign="center";
        b.ctx.fillText(`${r.yes_pct}%`, (xAgreeStart+xItemStart)/2, b.y+rowH/2+4*b.scale);
        b.ctx.fillText(`${r.no_pct}%`, (xDisagreeStart+xAgreeStart)/2, b.y+rowH/2+4*b.scale);
        b.ctx.fillText(`${r.abs_pct}%`, (xAbstainStart+xDisagreeStart)/2, b.y+rowH/2+4*b.scale);
        b.y += rowH;
      });
      b.spacer(24);
      b.wrapAndDraw("ويتضح موافقة الحاضرين على جميع بنود جدول الأعمال بالإجماع / بالأغلبية.", { font:`${11.5*b.scale}px Tajawal, Arial` });
      b.spacer(50);

      await b.preloadSignatures(signaturesMap);
      b.ensureSpace(70*b.scale);
      b.drawSigSlot("سكرتير الجمعية", roleNames["سكرتير الجمعية"], b.W*0.28, b.y, signaturesMap);
      b.drawSigSlot("رئيس الجمعية", roleNames["رئيس الجمعية"], b.W*0.72, b.y, signaturesMap);
      b.spacer(55);
      b.wrapAndDraw("لجنة فرز الأصوات", { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
      b.spacer(35);
      b.ensureSpace(70*b.scale);
      b.drawSigSlot("عضو اللجنة 1", roleNames["عضو اللجنة 1"], b.W*0.28, b.y, signaturesMap);
      b.drawSigSlot("عضو اللجنة 2", roleNames["عضو اللجنة 2"], b.W*0.72, b.y, signaturesMap);
    }
  },

  "كشف حضور": {
    roles: ["سكرتير الجمعية", "رئيس الجمعية"],
    async prepareData(meetingId){
      const [{ data: m }, { data: companyRow }] = await Promise.all([
        sb.from("meetings").select("*").eq("id", meetingId).single(),
        sb.from("companies").select("name").eq("id", currentCompanyId).single()
      ]);
      const { list: attendees } = await getAttendeesList(meetingId);
      return { m, companyName: companyRow?.name||"الشركة", attendees: attendees||[] };
    },
    async draw(b, data, signaturesMap, roleNames){
      const { m, companyName, attendees: rows } = data;
      const totalShares = rows.reduce((s,a)=>s+(Number(a.shares)||0),0);

      b.wrapAndDraw("كشف الحضور", { align:"center", font:`bold ${17*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
      b.spacer(6);
      b.wrapAndDraw(`الجمعية العامة ${m.agm_type||"العادية"} لشركة ${companyName}`, { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial` });
      b.spacer(4);
      b.wrapAndDraw(`المنعقدة ${m.method||""} في يوم .................. الموافق ${m.meeting_date||""} في تمام الساعة (${m.meeting_time||"—"}) مساءً.`, { align:"center", font:`${11*b.scale}px Tajawal, Arial` });
      b.spacer(20);

      const tableW = b.W - b.margin*2;
      const widths = { no:0.05, name:0.25, asalah:0.11, wakala:0.11, total:0.13, card:0.15, sh:0.20 };
      const RM = b.W - b.margin;
      const xNoS = RM - tableW*widths.no;
      const xNameS = xNoS - tableW*widths.name;
      const xAsalahS = xNameS - tableW*widths.asalah;
      const xWakalaS = xAsalahS - tableW*widths.wakala;
      const xTotalS = xWakalaS - tableW*widths.total;
      const xCardS = xTotalS - tableW*widths.card;
      const xShS = b.margin;
      const cols = [
        {s:xNoS,e:RM,l:"م"}, {s:xNameS,e:xNoS,l:"الاسم"}, {s:xAsalahS,e:xNameS,l:"أصالة"}, {s:xWakalaS,e:xAsalahS,l:"وكالة"},
        {s:xTotalS,e:xWakalaS,l:"المجموع"}, {s:xCardS,e:xTotalS,l:"رقم البطاقة"}, {s:xShS,e:xCardS,l:"رقم المساهم"}
      ];
      b.ensureSpace(30*b.scale);
      const headerH = 26*b.scale;
      b.ctx.strokeStyle="#333"; b.ctx.lineWidth=1*b.scale; b.ctx.font=`bold ${9.5*b.scale}px Tajawal, Arial`; b.ctx.textAlign="center";
      cols.forEach(c => { b.ctx.strokeRect(c.s, b.y, c.e-c.s, headerH); b.ctx.fillText(c.l, (c.s+c.e)/2, b.y+17*b.scale); });
      b.y += headerH;
      b.ctx.font=`${9.5*b.scale}px Tajawal, Arial`;
      (rows.length?rows:[{name:"",sharesAsalah:0,sharesWakala:0,shares:0,shareholderNo:""}]).forEach((r,i) => {
        b.ensureSpace(26*b.scale);
        const rowH = 26*b.scale;
        cols.forEach(c => b.ctx.strokeRect(c.s, b.y, c.e-c.s, rowH));
        const cy = b.y + rowH/2 + 3.5*b.scale;
        b.ctx.textAlign="center";
        b.ctx.fillText(String(i+1), (xNoS+RM)/2, cy);
        const nm = (r.name||"").length>18 ? r.name.slice(0,18)+"…" : (r.name||"");
        b.ctx.fillText(nm, (xNameS+xNoS)/2, cy);
        b.ctx.fillText(String(r.sharesAsalah ?? r.shares ?? 0), (xAsalahS+xNameS)/2, cy);
        b.ctx.fillText(String(r.sharesWakala ?? 0), (xWakalaS+xAsalahS)/2, cy);
        b.ctx.fillText(String(r.shares ?? 0), (xTotalS+xWakalaS)/2, cy);
        b.ctx.fillText(String(r.cardNo || r.shareholderNo || i+1), (xCardS+xTotalS)/2, cy);
        b.ctx.fillText(String(r.shareholderNo ?? ""), (xShS+xCardS)/2, cy);
        b.y += rowH;
      });
      b.ensureSpace(26*b.scale);
      const rowH = 26*b.scale;
      cols.forEach(c => b.ctx.strokeRect(c.s, b.y, c.e-c.s, rowH));
      b.ctx.textAlign="center"; b.ctx.font=`bold ${10*b.scale}px Tajawal, Arial`;
      b.ctx.fillText("الإجمالي", (xTotalS+xNoS)/2, b.y+rowH/2+3.5*b.scale);
      b.ctx.fillText(String(totalShares), (xTotalS+xWakalaS)/2, b.y+rowH/2+3.5*b.scale);
      b.ctx.fillText(String(rows.length), (xShS+xCardS)/2, b.y+rowH/2+3.5*b.scale);
      b.y += rowH;

      b.spacer(50);
      await b.preloadSignatures(signaturesMap);
      b.ensureSpace(70*b.scale);
      b.drawSigSlot("سكرتير الجمعية", roleNames["سكرتير الجمعية"], b.W*0.28, b.y, signaturesMap);
      b.drawSigSlot("رئيس الجمعية", roleNames["رئيس الجمعية"], b.W*0.72, b.y, signaturesMap);
    }
  }
};
