/* ══════════ MEETING REQUESTS (board approves the proposed date) ══════════ */
let newRequestTopics = [];
function addNewRequestTopic(){
  const input = document.getElementById("mtr-new-topic");
  const text = input.value.trim();
  if(!text) return;
  newRequestTopics.push(text);
  input.value = "";
  renderNewRequestTopics();
}
function removeNewRequestTopic(i){
  newRequestTopics.splice(i,1);
  renderNewRequestTopics();
}
function renderNewRequestTopics(){
  const box = document.getElementById("mtr-topics-list");
  if(!box) return;
  if(newRequestTopics.length === 0){ box.innerHTML = '<div style="font-size:11px;color:var(--gray3)">لا توجد بنود إضافية بعد.</div>'; return; }
  box.innerHTML = newRequestTopics.map((t,i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;border-bottom:1px solid var(--gray1)">
    <span>${i+1}. ${t}</span>
    <button type="button" onclick="removeNewRequestTopic(${i})" style="background:none;border:none;color:var(--gray3);cursor:pointer;font-size:11px"><span class="ico ico-trash" style="width:16px;height:16px"></span></button>
  </div>`).join("");
}

async function submitMeetingRequest(){
  const title = document.getElementById("mtr-title").value.trim();
  if(!title){ alert("الرجاء إدخال عنوان الاجتماع"); return; }
  const meeting_type = document.getElementById("mtr-type").value;
  const proposed_date = document.getElementById("mtr-date").value || null;
  const proposed_time = document.getElementById("mtr-time").value || null;
  const proposed_time_end = document.getElementById("mtr-time-end").value || null;
  const method = document.getElementById("mtr-method").value;
  const meeting_link = document.getElementById("mtr-link").value.trim() || null;
  const notes = document.getElementById("mtr-notes").value.trim();
  const committee_id = (meeting_type === "اجتماع لجنة" && document.getElementById("mtr-committee-id").value)
    ? Number(document.getElementById("mtr-committee-id").value) : null;
  if(!proposed_date){ alert("الرجاء تحديد الموعد المقترح"); return; }
  if(meeting_type === "اجتماع لجنة" && !committee_id){ alert("الرجاء اختيار اللجنة"); return; }

  const responseDays = Number(document.getElementById("mtr-response-days").value) || 2;
  const response_deadline = new Date(Date.now() + responseDays*24*60*60*1000).toISOString();

  const { data: newReq, error } = await sb.from("meeting_requests").insert([{
    title, meeting_type, proposed_date, proposed_time, proposed_time_end, method, meeting_link, notes,
    committee_id, proposed_topics: newRequestTopics, status: "قيد الموافقة", response_deadline, company_id: currentCompanyId
  }]).select().single();
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }

  document.getElementById("mtr-title").value = "";
  document.getElementById("mtr-notes").value = "";
  document.getElementById("mtr-time-end").value = "";
  document.getElementById("mtr-link").value = "";
  document.getElementById("mtr-committee-field").style.display = "none";
  newRequestTopics = [];
  renderNewRequestTopics();
  closeM("m-meeting-request");
  loadMeetingsAll();
  alert("تم إرسال طلب الاجتماع " + (committee_id ? "لأعضاء اللجنة" : "لأعضاء المجلس") + " للموافقة على الموعد ✅");

  notifyBoardOfMeetingRequest(newReq);
}

/* Auto-emails every board member who's linked to a login (the only ones who can actually
   respond) the moment a meeting request is submitted — so the requester never has to go
   message each member individually just to ask them to log in and approve. */
async function notifyBoardOfMeetingRequest(req){
  let members;
  if(req.committee_id){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", req.committee_id);
    const memberIds = (links||[]).map(l => l.member_id);
    const { data } = memberIds.length
      ? await sb.from("board_members").select("name,claimed_by_email").in("id", memberIds).not("claimed_by_email","is",null)
      : { data: [] };
    members = data;
  } else {
    const { data } = await sb.from("board_members").select("name,claimed_by_email")
      .eq("company_id", currentCompanyId).not("claimed_by_email", "is", null);
    members = data;
  }
  const emails = [...new Set((members||[]).map(m => m.claimed_by_email))];
  if(emails.length === 0) return;

  const { data: profiles } = await sb.from("user_profiles").select("email,full_name").in("email", emails);
  const nameByEmail = {};
  (profiles||[]).forEach(p => { nameByEmail[p.email] = p.full_name; });

  const { data: company } = await sb.from("companies").select("name").eq("id", currentCompanyId).single();
  const requesterName = currentUserProfile ? (currentUserProfile.full_name || "") : "";
  const appLink = `${window.location.origin}${window.location.pathname}`;
  const timeRange = req.proposed_time ? (`من الساعة ${req.proposed_time}` + (req.proposed_time_end ? ` إلى ${req.proposed_time_end}` : "")) : "";

  const subject = `🗳️ طلب اجتماع جديد يحتاج موافقتك — ${req.title||""}`;
  for(const email of emails){
    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:20px">
        <h2 style="color:#1A3A6B"><span class="ico-i ico-ballot"></span>طلب اجتماع جديد يحتاج رأيك</h2>
        <p>مرحبًا ${orgEsc(nameByEmail[email]||"")}،</p>
        <p>${requesterName ? `طلب ${requesterName}` : "تم تقديم طلب"} عقد اجتماع بشركة ${orgEsc(company?.name||"")}، ويحتاج موافقتك على الموعد المقترح:</p>
        <p><b>العنوان:</b> ${orgEsc(req.title||"")}<br/>
           <b>النوع:</b> ${req.meeting_type||""}<br/>
           <b>الموعد المقترح:</b> ${req.proposed_date||""} ${timeRange}<br/>
           <b>طريقة الانعقاد:</b> ${req.method||""}</p>
        ${req.notes ? `<p><b>ملاحظات:</b> ${orgEsc(req.notes)}</p>` : ""}
        <p><a href="${appLink}" target="_blank" style="background:#B8972A;color:#0D2447;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">افتح المنصة للرد على الطلب</a></p>
        <p style="color:#8B95A5;font-size:12px;margin-top:20px">هذه رسالة تلقائية من منصّة حوكم.</p>
      </div>`;
    await sendNotificationEmail(email, subject, html);
  }
}

async function openMeetingRequestPopup(requestId){
  const body = document.getElementById("mrqModalBody");
  if(!body) return;
  body.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-meeting-request-view");

  const { data: req, error } = await sb.from("meeting_requests").select("*").eq("id", requestId).single();
  if(error || !req){ body.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const { data: responses } = await sb.from("meeting_request_responses").select("*").eq("request_id", requestId);
  const revs = responses || [];
  const mine = myEmail ? revs.find(r=>r.reviewer_email===myEmail) : null;
  const approvedCount = revs.filter(r=>r.response==="موافقة").length;
  const altCount = revs.filter(r=>r.response==="تعديل الموعد").length;
  const altList = revs.filter(r=>r.response==="تعديل الموعد").map(r=>
    `<div style="font-size:10.5px;color:var(--gray3)">↳ ${orgEsc(r.reviewer_name||r.reviewer_email)}: يقترح ${r.alt_date||"—"}${r.alt_time?(' — '+r.alt_time):''}${r.notes?(' ('+r.notes+')'):''}</div>`
  ).join("");
  const timeRange = req.proposed_time ? (' — من '+req.proposed_time+(req.proposed_time_end?(' إلى '+req.proposed_time_end):'')) : '';
  let deadlineHTML = "";
  if(req.response_deadline){
    const isOver = new Date(req.response_deadline) < new Date();
    const deadlineStr = new Date(req.response_deadline).toLocaleString('ar-SA-u-ca-gregory', {dateStyle:'medium', timeStyle:'short'});
    deadlineHTML = `<div style="font-size:11px;font-weight:800;padding:6px 10px;border-radius:6px;margin-bottom:8px;background:${isOver?'#FDE8E8':'#FDF5DC'};color:${isOver?'var(--red)':'var(--gold)'}">
      ${isOver ? '⌛ انتهت مهلة الرد المحددة' : '⏰ آخر موعد للرد: '+deadlineStr}
    </div>`;
  }

  body.innerHTML = `
    <div style="font-weight:800;font-size:15px;color:var(--dark)">${orgEsc(req.title||"")}</div>
    <div style="font-size:11px;color:var(--gray3);font-weight:600;margin-bottom:10px">${req.meeting_type||""}</div>
    ${deadlineHTML}
    <div style="font-size:13px;color:var(--dark);margin:6px 0"><span class="ico-i ico-calendar"></span>الموعد المقترح: <b>${req.proposed_date||"—"}</b>${timeRange} &nbsp;·&nbsp; 📍 ${req.method||"—"}</div>
    ${req.notes ? `<div style="font-size:12px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-edit"></span>${orgEsc(req.notes)}</div>` : ""}
    <div style="font-size:11.5px;color:var(--gray3);margin-bottom:8px"><span class="ico-i ico-check"></span>موافقون: ${approvedCount} &nbsp;·&nbsp; 🔁 مقترحون موعدًا آخر: ${altCount}</div>
    ${altList}
    <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
      <button class="btn-xs" style="background:${mine&&mine.response==='موافقة'?'linear-gradient(135deg,var(--primary),var(--accent))':'#E8F8EF'};color:${mine&&mine.response==='موافقة'?'#fff':'var(--green)'};border:none;border-radius:6px;padding:7px 14px;font-size:11.5px;cursor:pointer" onclick="respondMeetingRequest(${req.id},'موافقة')"><span class="ico-i ico-check"></span>موافقة على الموعد</button>
      <button class="btn-xs" style="background:var(--offwhite);color:var(--dark);border:1px solid var(--gray1);border-radius:6px;padding:7px 14px;font-size:11.5px;cursor:pointer" onclick="toggleAltDateForm(${req.id})"><span class="ico-i ico-refresh"></span>اقتراح موعد بديل</button>
    </div>
    <div id="alt-form-${req.id}" style="display:none;margin-top:10px;padding:10px;background:var(--offwhite);border-radius:8px">
      <div class="row2">
        <div class="fg"><label style="font-size:11px">الموعد البديل</label><input type="date" class="fi" id="alt-date-${req.id}"/></div>
        <div class="fg"><label style="font-size:11px">الوقت البديل</label><input type="time" class="fi" id="alt-time-${req.id}"/></div>
      </div>
      <textarea id="alt-notes-${req.id}" placeholder="سبب التعديل (اختياري)" rows="2" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-top:6px"></textarea>
      <button class="btn-xs primary" style="margin-top:8px" onclick="respondMeetingRequest(${req.id},'تعديل الموعد')"><span class="ico-i ico-send"></span>إرسال الاقتراح</button>
    </div>
  `;
}

function toggleAltDateForm(requestId){
  const el = document.getElementById("alt-form-"+requestId);
  if(el) el.style.display = el.style.display === "none" ? "block" : "none";
}

async function respondMeetingRequest(requestId, response){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;

  let alt_date = null, alt_time = null, notes = null;
  if(response === "تعديل الموعد"){
    alt_date = document.getElementById("alt-date-"+requestId).value || null;
    if(!alt_date){ alert("الرجاء تحديد الموعد البديل"); return; }
    alt_time = document.getElementById("alt-time-"+requestId).value || null;
    notes = document.getElementById("alt-notes-"+requestId).value.trim();
  }

  await sb.from("meeting_request_responses").delete().eq("request_id", requestId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("meeting_request_responses").insert([{
    request_id: requestId, reviewer_email: myEmail, reviewer_name, response, alt_date, alt_time, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ ردّك: " + error.message); return; }

  await recomputeMeetingRequestStatus(requestId);
  closeM("m-meeting-request-view");
  loadMeetingsAll();
}

/* Only becomes a confirmed real meeting once every board member who responded approved
   unanimously (no one proposed an alternate date), and all board members have responded. */
async function recomputeMeetingRequestStatus(requestId){
  const { data: revs, error } = await sb.from("meeting_request_responses").select("*").eq("request_id", requestId);
  if(error || !revs || revs.length===0) return;
  const anyAlt = revs.some(r => r.response === "تعديل الموعد");
  if(anyAlt) return; // stays pending — needs discussion/a new proposed date

  const { data: req } = await sb.from("meeting_requests").select("*").eq("id", requestId).single();
  if(!req) return;

  // Only members actually linked to a login account (claimed_by_email) can ever respond to a
  // request through the platform — counting unlinked roster entries here would make consensus
  // permanently impossible to reach whenever even one member hasn't been "🔗 ربط بحساب" yet.
  // A committee-scoped request only needs that committee's own members to agree, not the
  // whole board — same eligibility rule used for committee decision voting.
  let totalMembers;
  if(req.committee_id){
    const { data: links } = await sb.from("committee_members").select("member_id").eq("committee_id", req.committee_id);
    const memberIds = (links||[]).map(l => l.member_id);
    const { count } = memberIds.length
      ? await sb.from("board_members").select("*", { count:'exact', head:true }).in("id", memberIds).not("claimed_by_email","is",null)
      : { count: 0 };
    totalMembers = count || 0;
  } else {
    const { count } = await sb.from("board_members").select("*", { count: 'exact', head: true })
      .eq("company_id", currentCompanyId).not("claimed_by_email", "is", null);
    totalMembers = count || 0;
  }
  const approvedEmails = new Set(revs.filter(r=>r.response==="موافقة").map(r=>r.reviewer_email));
  if(totalMembers > 0 && approvedEmails.size < totalMembers) return; // not everyone linked has responded yet

  const { data: newMeeting, error: insErr } = await sb.from("meetings").insert([{
    title: req.title, meeting_type: req.meeting_type, meeting_date: req.proposed_date,
    meeting_time: req.proposed_time, time_end: req.proposed_time_end, method: req.method,
    meeting_link: req.meeting_link, committee_id: req.committee_id, notes: req.notes, company_id: currentCompanyId
  }]).select().single();
  if(insErr) return;

  // Agenda: fixed opening + whatever the requester listed + fixed closing — same rule as
  // meetings created directly, so a request-approved meeting is never missing its agenda.
  const customTopics = Array.isArray(req.proposed_topics) ? req.proposed_topics : [];
  const finalTopics = withAgendaBookends(customTopics);
  const topicRows = finalTopics.map((topic_text, i) => ({ meeting_id: newMeeting.id, topic_text, sort_order: i, company_id: currentCompanyId }));
  await sb.from("vote_topics").insert(topicRows);
  // Same automatic conversion: every real agenda item becomes a votable decision.
  if(customTopics.length){
    const decisionRows = customTopics.map(topic_text => ({ meeting_id: newMeeting.id, decision_text: topic_text, company_id: currentCompanyId }));
    await sb.from("board_decisions").insert(decisionRows);
  }

  await sb.from("meeting_requests").update({ status: "معتمد" }).eq("id", requestId);
  await generateAndUploadMeetingInvitation(newMeeting.id);
}

/* ══════════ POLICIES (governance) ══════════ */
let policiesCache = [];
const POLICY_STAGES = ["مسودة", "معتمدة من لجنة الحوكمة", "مرفوعة لمجلس الإدارة", "مرفوعة للجمعية العامة", "معتمدة نهائيًا"];

/* The stage sequence isn't one-size-fits-all: a company with no governance committee can't
   realistically pass through "معتمدة من لجنة الحوكمة", and a policy that only needs board
   sign-off shouldn't be stuck waiting on an AGM step it was never marked as needing. Both
   checks are cached per page-load in policyStageContext to avoid refetching committees on
   every single card render. */
let policyStageContext = { hasGovernanceCommittee: false, loaded: false };

async function loadPolicyStageContext(){
  const { data } = await sb.from("committees").select("committee_name,category").eq("company_id", currentCompanyId);
  policyStageContext.hasGovernanceCommittee = (data||[]).some(c => (c.committee_name||"").includes("حوكمة") || (c.category||"").includes("حوكمة"));
  policyStageContext.loaded = true;
}

function getPolicyStageSequence(policy){
  return POLICY_STAGES.filter(s => {
    if(s === "معتمدة من لجنة الحوكمة" && !policyStageContext.hasGovernanceCommittee) return false;
    if(s === "مرفوعة للجمعية العامة" && policy.approval_level !== "جمعية عامة") return false;
    return true;
  });
}

const POLICY_CATEGORY_ICONS = {
  "سياسات الجمعية العامة": "🤝",
  "سياسات ولوائح المجلس": "🏛️",
  "سياسات ولوائح اللجان": "👥",
  "سياسات الموارد البشرية": "🧑‍💼",
  "السياسات المالية": "💰",
  "سياسة المشتريات": "🛒",
  "سياسة المبيعات وخدمة العملاء": "🤝",
  "لوائح داخلية": "🗂️",
  // Categories for limited-liability companies and sole proprietorships
  "سياسات الحوكمة والصلاحيات": "🏛️",
  "السياسات التجارية والتعاقدات": "📑",
  "سياسات المشتريات": "🛒",
  "سياسات التشغيل والجودة والسلامة": "🏭",
  "السياسات المالية والمحاسبية": "💰",
  "سياسات الموارد البشرية وشؤون الموظفين": "🧑‍💼",
  "سياسات أمن المعلومات وحماية البيانات": "🔐"
};
// One shared list for limited-liability companies and sole proprietorships.
const SME_POLICY_CATEGORIES = [
  "سياسات الحوكمة والصلاحيات",
  "السياسات التجارية والتعاقدات",
  "سياسات المشتريات",
  "سياسات التشغيل والجودة والسلامة",
  "السياسات المالية والمحاسبية",
  "سياسات الموارد البشرية وشؤون الموظفين",
  "سياسات أمن المعلومات وحماية البيانات"
];
// The 4 operational categories are visually grouped under one "سياسات تشغيلية" section header
// wherever policies are displayed — they remain individually selectable leaf categories on each
// policy itself (so filtering/workflow-routing per category still works exactly as before).
const OPERATIONAL_POLICY_CATEGORIES = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];

function policyStageStepper(status, policy){
  const stages = policy ? getPolicyStageSequence(policy) : POLICY_STAGES;
  const idx = stages.indexOf(status);
  const currentIdx = idx === -1 ? 0 : idx;
  return `<div style="display:flex;align-items:center;margin:10px 0">
    ${stages.map((stage, i) => {
      const done = i < currentIdx;
      const active = i === currentIdx;
      const dotColor = done ? "var(--green)" : active ? "var(--primary)" : "var(--gray1)";
      const lineColor = i < currentIdx ? "var(--green)" : "var(--gray1)";
      return `<div style="display:flex;align-items:center;flex:${i<stages.length-1?'1':'0'}">
        <div title="${displayStageLabel(stage)}" style="width:${active?'14px':'10px'};height:${active?'14px':'10px'};border-radius:50%;background:${dotColor};${active?'box-shadow:0 0 0 4px rgba(15,33,56,0.15)':''};flex-shrink:0"></div>
        ${i<stages.length-1 ? `<div style="flex:1;height:3px;background:${lineColor};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div>
  <div style="font-size:10px;color:var(--gray3);text-align:center;font-weight:700">${displayStageLabel(status||"مسودة")}</div>`;
}

let policyActiveCategory = "الكل";
let currentCompanyPolicyDeadlineDays = 14;
async function loadPolicies(){
  const wrap = document.getElementById("policiesCards");
  const [{ data, error }, { data: companyRow }] = await Promise.all([
    sb.from("policies").select("*").eq("company_id", currentCompanyId).order("id", { ascending: true }),
    sb.from("companies").select("policy_stage_deadline_days").eq("id", currentCompanyId).single()
  ]);
  if(error){
    wrap.innerHTML = '<div style="text-align:center;color:var(--red);font-size:12px;padding:14px">تعذّر تحميل السياسات: '+error.message+'</div>';
    return;
  }
  currentCompanyPolicyDeadlineDays = companyRow?.policy_stage_deadline_days ?? 14;
  await loadPolicyStageContext();
  policiesCache = data || [];

  // Position-based visibility: مدير المشتريات only sees سياسة المشتريات, etc. Full-access
  // roles (مدير النظام / رئيس مجلس / سكرتير المجلس) and anyone with no restriction configured
  // still see everything — the restriction only kicks in once an admin has actually set it.
  const myRole = getCurrentRole();
  if(!isFullAccessRole(myRole)){
    const { data: userData } = await sb.auth.getUser();
    const myEmail = userData?.user?.email;
    const { data: membership } = await sb.from("user_company_memberships").select("allowed_policy_categories")
      .eq("company_id", currentCompanyId).eq("email", myEmail).maybeSingle();
    const allowed = membership?.allowed_policy_categories;
    if(Array.isArray(allowed) && allowed.length > 0){
      policiesCache = policiesCache.filter(p => allowed.includes(p.category));
    }
  }

  renderPolicyPills();
  renderPoliciesFiltered();
}

/* Policy categories aren't one-size-fits-all: every company (regardless of type) runs HR,
   finance, procurement, and sales/customer operations, so those stay universal. Governance-
   specific categories (board/AGM/committee policies) only make sense — and only get added —
   for company types that actually have those bodies. */
function getPolicyCategoriesForCompany(){
  const operational = ["سياسات الموارد البشرية", "السياسات المالية", "سياسة المشتريات", "سياسة المبيعات وخدمة العملاء"];
  // Sole proprietorships and limited-liability companies (single or multiple owners/managers)
  // share one practical category list covering governance, commercial, procurement,
  // operations, finance, HR and information security.
  if(currentCompanyType === "مؤسسة فردية" || currentCompanyType === "ذات مسؤولية محدودة") return [...SME_POLICY_CATEGORIES];

  return ["سياسات الجمعية العامة", "سياسات ولوائح المجلس", "سياسات ولوائح اللجان", ...operational, "لوائح داخلية"];
}

function renderPolicyPills(){
  const box = document.getElementById("policyCategoryPills");
  if(!box) return;
  const categoryOrder = getPolicyCategoriesForCompany();
  const present = [...new Set(policiesCache.map(p => p.category || "لوائح داخلية"))];
  const cats = categoryOrder.filter(c => present.includes(c)).concat(present.filter(c => !categoryOrder.includes(c)));

  const pill = (label, key, count, icon) => {
    const active = policyActiveCategory === key;
    return `<button onclick="setPolicyCategory('${key}')" style="font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;border:none;background:${active?'#fff':'rgba(255,255,255,0.18)'};color:${active?'var(--primary)':'#fff'};transition:.15s">${icon?icon+' ':''}${label}${count!=null?` <span style="opacity:.75">(${count})</span>`:''}</button>`;
  };

  let html = pill("الكل", "الكل", policiesCache.length, "📚");
  cats.forEach(c => {
    const count = policiesCache.filter(p => (p.category||"لوائح داخلية")===c).length;
    html += pill(c, c, count, POLICY_CATEGORY_ICONS[c] || "📁");
  });
  box.innerHTML = html;
}

function setPolicyCategory(cat){
  policyActiveCategory = cat;
  renderPolicyPills();
  renderPoliciesFiltered();
}

function renderPoliciesFiltered(){
  loadPolicyReviewSection();
  const wrap = document.getElementById("policiesCards");
  if(!wrap) return;
  const searchEl = document.getElementById("policySearchInput");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";

  let list = policiesCache;
  if(policyActiveCategory !== "الكل") list = list.filter(p => (p.category||"لوائح داخلية") === policyActiveCategory);
  if(search) list = list.filter(p => (p.policy_name||"").toLowerCase().includes(search));

  if(policiesCache.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بعد. اضغط "+ إضافة سياسة" للبدء.</div>';
    return;
  }
  if(list.length === 0){
    wrap.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات مطابقة لبحثك.</div>';
    return;
  }

  const statusBadge = (s) => {
    if(s === "معتمدة نهائيًا") return '<span class="badge done">معتمدة نهائيًا ✅</span>';
    if(s === "تجديد مطلوب") return '<span class="badge urgent">تجديد مطلوب</span>';
    if(s === "مسودة") return '<span class="badge pending">مسودة</span>';
    return '<span class="badge info">'+ displayStageLabel(s || "مسودة") +'</span>';
  };
  // Group the filtered policies by category so cards of the same category sit together
  const categoryOrder = getPolicyCategoriesForCompany();
  const groups = {};
  list.forEach(p => {
    const cat = p.category || "لوائح داخلية";
    if(!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  const allCats = Object.keys(groups).sort((a,b)=>{
    const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b,'ar');
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });

  let html = "";
  let operationalHeaderShown = false;
  allCats.forEach(cat => {
    // Show one shared "سياسات تشغيلية" header right before the first operational sub-category
    // encountered — only makes sense when browsing everything together, not while a single
    // category pill is already selected (the category's own header covers that case).
    if(policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat) && !operationalHeaderShown){
      operationalHeaderShown = true;
      html += `<div style="display:flex;align-items:center;gap:8px;margin:30px 0 4px">
        <span style="font-size:17px">🏭</span>
        <span style="font-weight:900;font-size:15px;color:var(--dark)">سياسات تشغيلية</span>
        <span style="flex:1;height:2px;background:var(--primary);opacity:0.15"></span>
      </div>`;
    }
    const icon = POLICY_CATEGORY_ICONS[cat] || "📁";
    const indent = (policyActiveCategory === "الكل" && OPERATIONAL_POLICY_CATEGORIES.includes(cat)) ? "padding-right:16px" : "";
    html += `<div style="display:flex;align-items:center;gap:8px;margin:22px 0 12px;${indent}">
      <span style="font-size:16px">${icon}</span>
      <span style="font-weight:900;font-size:14px;color:var(--primary)">${cat}</span>
      <span style="flex:1;height:1px;background:var(--gray1)"></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:stretch;${indent}">`;

    groups[cat].forEach(p => {
      html += `<div class="card pcard">
        <div class="pcard-top">
          <div class="pcard-title">${orgEsc(p.policy_name||"")}</div>
          <div class="pcard-badge">${statusBadge(p.status)}</div>
        </div>
        <div class="pcard-type">${orgEsc(p.policy_type||"—")}${p.approval_level === "جمعية عامة" ? ' · <span style="color:var(--gold)">تحتاج الجمعية العامة</span>' : p.approval_level === "داخلية" ? ' · داخلية' : ""}</div>
        <div class="pcard-dates">
          <div><small>رُفعت</small><b>${p.submission_date||"—"}</b></div>
          ${p.approval_date
            ? `<div><small>اعتُمدت</small><b style="color:var(--green)">${p.approval_date}</b></div>`
            : `<div><small>متوقّع</small><b>${p.target_approval_date||"—"}</b></div>`}
          <div><small>المراجعة</small><b>${p.review_date||"—"}</b></div>
        </div>
        <div class="pcard-actions">
          ${downloadBtn(p.file_url)}
          <button class="btn-xs sec" onclick="editPolicy(${p.id})"><span class="ico-i ico-edit"></span>تعديل</button>
          <button class="btn-xs sec" onclick="openPolicyHistoryModal(${p.id})"><span class="ico-i ico-clock"></span>السجل</button>
          <button class="btn-xs sec" onclick="openPolComments(${p.id})">الملاحظات <span id="polcom-n-${p.id}"></span></button>
          <button class="btn-xs sec" onclick="openGovLinkPicker('policy',${p.id})">🔗 ربط</button>
        </div>
        <div class="glinks" id="glk-policy-${p.id}" data-glinks="policy:${p.id}"></div>
        <button class="btn-xs gold pol-cta" onclick="startPolicyGovernanceApproval(${p.id})"><span class="ico-i ico-upload"></span>بدء دورة اعتماد وتوقيع</button>
        <div id="policy-gov-status-${p.id}"></div>
        <button class="pcard-del" onclick="deletePolicy(${p.id})" title="حذف السياسة"><span class="ico-i ico-trash"></span>حذف</button>
      </div>`;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;
  list.forEach(p => { loadPolicyApprovalStatus(p.id, `policy-gov-status-${p.id}`); renderGovLinks(`glk-policy-${p.id}`, 'policy', p.id); });
  polLoadBadges(list);
}


/* ══════════ BOARD MEMBER REVIEW ON POLICIES AT "مرفوعة لمجلس الإدارة" STAGE ══════════ */
async function loadPolicyReviewSection(){
  const card = document.getElementById("policyReviewCard");
  const box = document.getElementById("policyReviewBody");
  if(!box || !card) return;
  const role = getCurrentRole();
  const hasNoBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(role === 'مساهم' || hasNoBoard){ card.style.display = "none"; return; }
  card.style.display = "block";
  const bodyLabel = getGovernanceBodyLabel();
  setText("policyReviewTitle", `سياسات تتطلب اعتماد المجلس`);

  const pending = policiesCache.filter(p => p.status === "مرفوعة لمجلس الإدارة");
  if(pending.length===0){ box.innerHTML = `<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد سياسات بانتظار اعتماد المجلس.</div>`; return; }

  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const ids = pending.map(p=>p.id);
  const { data: reviews } = await sb.from("policy_reviews").select("*").in("policy_id", ids);
  const reviewsByPolicy = {};
  (reviews||[]).forEach(rv => {
    if(!reviewsByPolicy[rv.policy_id]) reviewsByPolicy[rv.policy_id] = [];
    reviewsByPolicy[rv.policy_id].push(rv);
  });

  box.innerHTML = pending.map(p => {
    const revs = reviewsByPolicy[p.id] || [];
    const yes = revs.filter(v=>v.decision==="موافق").length;
    const no = revs.filter(v=>v.decision==="معارض").length;
    const abst = revs.filter(v=>v.decision==="متحفظ").length;
    const mine = myEmail ? revs.find(v => v.reviewer_email === myEmail) : null;
    return `<div style="border:1px solid var(--gray1);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-weight:800;font-size:13px;color:var(--dark)">${orgEsc(p.policy_name||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin:4px 0 8px">${orgEsc(p.category||"")} · ${orgEsc(p.policy_type||"")}</div>
      <div style="font-size:11px;color:var(--gray3);margin-bottom:8px">آراء ${getGovernanceMemberLabel()} حتى الآن: <span style="color:var(--green)"><span class="ico-i ico-check"></span>${yes}</span> · <span style="color:var(--red)"><span class="ico-i ico-xcircle"></span>${no}</span> · <span style="color:var(--orange)"><span class="ico-i ico-warning"></span>${abst}</span></div>
      <textarea id="policy-review-notes-${p.id}" placeholder="ملاحظاتك (اختياري)" style="width:100%;border:1px solid var(--gray1);border-radius:8px;padding:8px;font-family:'Tajawal',sans-serif;font-size:12px;resize:none;margin-bottom:8px" rows="2">${orgEsc(mine ? (mine.notes||"") : "")}</textarea>
      <div style="display:flex;gap:6px">
        <button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='موافق'?'900':'600'}" onclick="submitPolicyReview(${p.id},'موافق')"><span class="ico-i ico-check"></span>موافقة</button>
        <button class="btn-xs" style="background:#FDE8E8;color:var(--red);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='معارض'?'900':'600'}" onclick="submitPolicyReview(${p.id},'معارض')"><span class="ico-i ico-xcircle"></span>معارض</button>
        <button class="btn-xs" style="background:#FEF3E2;color:var(--orange);border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:${mine&&mine.decision==='متحفظ'?'900':'600'}" onclick="submitPolicyReview(${p.id},'متحفظ')"><span class="ico-i ico-warning"></span>تحفظ</button>
      </div>
      ${mine ? `<div style="font-size:10.5px;color:var(--gray3);margin-top:6px">رأيك المسجّل حاليًا: ${orgEsc(mine.decision)}</div>` : ""}
    </div>`;
  }).join("");
}

async function submitPolicyReview(policyId, decision){
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  if(!myEmail){ alert("تعذّر تحديد هويتك، الرجاء تسجيل الدخول من جديد"); return; }
  const reviewer_name = currentUserProfile ? (currentUserProfile.full_name || myEmail) : myEmail;
  const notesEl = document.getElementById("policy-review-notes-"+policyId);
  const notes = notesEl ? notesEl.value.trim() : "";

  await sb.from("policy_reviews").delete().eq("policy_id", policyId).eq("reviewer_email", myEmail);
  const { error } = await sb.from("policy_reviews").insert([{
    policy_id: policyId, reviewer_email: myEmail, reviewer_name, decision, notes, company_id: currentCompanyId
  }]);
  if(error){ alert("تعذّر حفظ رأيك: " + error.message); return; }

  await recomputePolicyStage(policyId);
  loadPolicies();
}

/* If every board member who reviewed approved unanimously, auto-advance the policy to the
   next stage. Any single objection or reservation keeps it pending at the same stage. */
/* Real timeline tracking: every stage transition (auto or manual) is logged with who and when */
async function logPolicyStageChange(policyId, fromStatus, toStatus){
  if(fromStatus === toStatus) return;
  const { data: userData } = await sb.auth.getUser();
  const myEmail = userData && userData.user ? userData.user.email : null;
  const changed_by = currentUserProfile ? (currentUserProfile.full_name || myEmail) : (myEmail || "النظام");
  await sb.from("policy_stage_history").insert([{ policy_id: policyId, from_status: fromStatus, to_status: toStatus, changed_by, company_id: currentCompanyId }]);
}

async function advancePolicyToStatus(policyId, currentStatus, nextStatus, policyRow){
  await sb.from("policies").update({ status: nextStatus, stage_entered_at: new Date().toISOString() }).eq("id", policyId);
  await logPolicyStageChange(policyId, currentStatus, nextStatus);
  if(nextStatus === "معتمدة نهائيًا"){
    const p = policyRow || policiesCache.find(x => x.id === policyId);
    if(p && p.file_url){
      const { data: board } = await sb.from("user_profiles").select("*").eq("company_id", currentCompanyId).or("role.ilike.%مجلس%,role.eq.مدير النظام,role.in.(مالك,ممثل المالك)");
      await sb.from("signing_documents").insert([{
        document_name: `اعتماد نهائي — ${p.policy_name}`, doc_type: "اعتماد سياسة",
        signers_total: (board||[]).length, signers_done: 0, status: "قيد التوقيع", file_url: p.file_url, company_id: currentCompanyId
      }]);
      logActivity("موافقة", "سياسة", p.policy_name, "اعتمدت نهائيًا — انتقلت تلقائيًا للتوقيع الإلكتروني");
    }
  }
}

async function recomputePolicyStage(policyId){
  const { data: revs, error } = await sb.from("policy_reviews").select("*").eq("policy_id", policyId);
  if(error || !revs || revs.length===0) return;
  const allApprove = revs.every(v => v.decision === "موافق");
  if(!allApprove) return; // stays at the current board/committee/AGM stage until unanimous approval
  const p = policiesCache.find(x => x.id === policyId);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(policyId, p.status, nextStatus, p);
}

async function deletePolicy(id){
  if(!await uiConfirm("هل أنت متأكد من حذف هذه السياسة؟")) return;
  const p = policiesCache.find(x=>x.id===id);
  const { error } = await sb.from("policies").delete().eq("id", id);
  if(error){ alert("تعذّر الحذف: " + error.message); return; }
  logActivity("حذف", "سياسة", p?p.policy_name:"", "");
  loadPolicies();
}

async function advancePolicyStage(id){
  if(await polBlockIfOpen(id)) return;
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  const stages = getPolicyStageSequence(p);
  const idx = stages.indexOf(p.status);
  if(idx === -1 || idx >= stages.length-1) return;
  const nextStatus = stages[idx+1];
  await advancePolicyToStatus(id, p.status, nextStatus, p);
  loadPolicies();
}

async function openPolicyHistoryModal(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("ph-title").textContent = "🕒 السجل الزمني — " + (p.policy_name||"");
  const box = document.getElementById("ph-timeline");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">جارِ التحميل...</div>';
  openM("m-policy-history");

  const [{ data: history }, { data: reviews }] = await Promise.all([
    sb.from("policy_stage_history").select("*").eq("policy_id", id).order("created_at",{ascending:true}),
    sb.from("policy_reviews").select("*").eq("policy_id", id).order("created_at",{ascending:true})
  ]);

  const events = [];
  (history||[]).forEach(h => events.push({
    date: h.created_at,
    text: h.from_status ? `انتقلت من "${h.from_status}" إلى "${h.to_status}"` : `أُنشئت بحالة "${h.to_status}"`,
    by: h.changed_by, type: "stage"
  }));
  (reviews||[]).forEach(r => events.push({
    date: r.created_at,
    text: `${r.reviewer_name||r.reviewer_email} — ${r.decision}${r.notes ? (' ("'+r.notes+'")') : ''}`,
    by: null, type: "review"
  }));
  events.sort((a,b) => new Date(a.date) - new Date(b.date));

  if(events.length===0){
    box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:10px">لا يوجد سجل حركة بعد لهذه السياسة.</div>';
    return;
  }
  box.innerHTML = events.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray1)">
      <div style="width:8px;height:8px;border-radius:50%;background:${e.type==='stage'?'var(--primary)':'var(--gold)'};margin-top:5px;flex-shrink:0"></div>
      <div>
        <div style="font-size:12px;color:var(--dark);font-weight:600">${e.text}</div>
        <div style="font-size:10.5px;color:var(--gray3);margin-top:2px">${e.by?e.by+' — ':''}${new Date(e.date).toLocaleString('ar-SA-u-ca-gregory')}</div>
      </div>
    </div>`).join("");
}

function populatePolicyCategorySelect(selected){
  const sel = document.getElementById("mp-category");
  if(!sel) return;
  const cats = getPolicyCategoriesForCompany();
  sel.innerHTML = cats.map(c => `<option ${c===selected?"selected":""}>${c}</option>`).join("");
  // A policy might already be filed under a governance category the company no longer has
  // (e.g. after a company-type change) — keep it selectable so editing doesn't silently
  // reassign it to the wrong bucket.
  if(selected && !cats.includes(selected)){
    sel.insertAdjacentHTML("beforeend", `<option selected>${selected}</option>`);
  }
}

// Same principle as the category list: a company with no board and no general assembly has
// nothing for "تحتاج اعتماد مجلس الإدارة" / "تحتاج اعتماد الجمعية العامة" to actually mean —
// offering them anyway invites picking an approval level that maps to nobody real.
function getApprovalLevelsForCompany(){
  const noBoard = currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleManager || currentCompanyLLCSingleOwner;
  if(noBoard){
    const approverWord = (currentCompanyType === "مؤسسة فردية" || currentCompanyLLCSingleOwner) ? "المالك" : "المدير";
    return [
      { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
      { value: "مجلس الإدارة", label: `تحتاج اعتماد ${approverWord}` },
    ];
  }
  return [
    { value: "داخلية", label: "داخلية — الحوكمة والرئيس التنفيذي فقط" },
    { value: "مجلس الإدارة", label: `تحتاج اعتماد ${getGovernanceBodyLabel()}` },
    { value: "جمعية عامة", label: "تحتاج اعتماد الجمعية العامة" },
  ];
}

function populateApprovalLevelSelect(selected){
  const sel = document.getElementById("mp-approval-level");
  if(!sel) return;
  const levels = getApprovalLevelsForCompany();
  sel.innerHTML = levels.map(l => `<option value="${l.value}" ${l.value===selected?"selected":""}>${l.label}</option>`).join("");
  if(selected && !levels.some(l=>l.value===selected)){
    sel.insertAdjacentHTML("beforeend", `<option value="${selected}" selected>${selected}</option>`);
  }
}

function editPolicy(id){
  const p = policiesCache.find(x => x.id === id);
  if(!p) return;
  document.getElementById("mp-id").value = p.id;
  document.getElementById("mp-title-h").textContent = "✏️ تعديل السياسة";
  document.getElementById("mp-name").value = p.policy_name || "";
  document.getElementById("mp-type").value = p.policy_type || "";
  document.getElementById("mp-submission").value = p.submission_date || "";
  document.getElementById("mp-target-approval").value = p.target_approval_date || "";
  const approvalWrap = document.getElementById("mp-approval-wrap");
  if(p.approval_date){
    approvalWrap.style.display = "block";
    document.getElementById("mp-approval").value = p.approval_date;
  } else {
    approvalWrap.style.display = "none";
  }
  document.getElementById("mp-review").value = p.review_date || "";
  document.getElementById("mp-status").value = p.status || "مسودة";
  populatePolicyCategorySelect(p.category || "لوائح داخلية");
  populateApprovalLevelSelect(p.approval_level || "مجلس الإدارة");
  openM("m-policy");
}

/* ══════════ POLICY GOVERNANCE WORKFLOW (reuses the same sequential-sign engine) ══════════
   Every real policy category (the 8 in POLICY_CATEGORY_ICONS) gets its own fully independent,
   admin-configurable approval sequence — not 4 broad buckets that silently override each
   other. A policy's docType is derived directly from its own category, so what you configure
   for "سياسة المشتريات" only ever applies to سياسة المشتريات policies. */
function openPolicyWorkflowPicker(){
  const box = document.getElementById("policyWorkflowCategoryList");
  box.innerHTML = getPolicyCategoriesForCompany().map(cat => [cat, POLICY_CATEGORY_ICONS[cat] || "📁"]).map(([cat, icon]) =>
    `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px;text-align:right" onclick="closeM('m-policy-workflow-picker');openWorkflowTemplateModal('${policyCategoryToDocType(cat)}')">${icon} ${cat}</button>`
  ).join("");
  openM("m-policy-workflow-picker");
}

function policyCategoryToDocType(category){
  return "policy_" + (category || "بدون فئة");
}

function getPolicyWorkflowType(policy){
  return policyCategoryToDocType(policy.category);
}

const POLICY_WORKFLOW_LABELS = Object.fromEntries(
  Object.keys(POLICY_CATEGORY_ICONS).map(cat => [policyCategoryToDocType(cat), cat])
);

async function buildPolicyCanvasPages(policy, signaturesMap, orderedRoles){
  const b = await CanvasPDFBuilder.create(currentCompanyId);
  b.wrapAndDraw(policy.policy_name || "سياسة", { align:"center", font:`bold ${16*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
  b.spacer(6);
  b.wrapAndDraw(getMatrixCompanyName(), { align:"center", font:`bold ${12*b.scale}px Tajawal, Arial` });
  b.spacer(20);

  b.wrapAndDraw(`الفئة: ${policy.category||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`النوع: ${policy.policy_type||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`تاريخ الاعتماد: ${policy.approval_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`موعد المراجعة القادمة: ${policy.review_date||"—"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.wrapAndDraw(`مستوى الاعتماد: ${policy.approval_level||"مجلس الإدارة"}`, { font:`${11.5*b.scale}px Tajawal, Arial`, lineHeight:20*b.scale });
  b.spacer(14);
  if(policy.file_url){
    b.wrapAndDraw("📎 نص السياسة الكامل مرفق كملف منفصل عند تحميلها من المنصة — هذه الوثيقة سجل اعتماد وتوقيع رسمي، وليست بديلاً عن نص السياسة.", { font:`${10.5*b.scale}px Tajawal, Arial`, color:"#8B95A5", lineHeight:18*b.scale });
  }

  if(orderedRoles && orderedRoles.length){
    b.spacer(30);
    b.wrapAndDraw("توقيعات الاعتماد", { align:"center", font:`bold ${13*b.scale}px Tajawal, Arial`, color:"#1A3A6B" });
    b.spacer(16);
    await b.preloadSignatures(signaturesMap);
    orderedRoles.forEach((role) => {
      b.ensureSpace(65*b.scale);
      b.drawSigSlot(role, (signaturesMap[role]&&signaturesMap[role].name)||"", b.W/2, b.y, signaturesMap);
      b.spacer(70);
    });
  }
  return b;
}

async function startPolicyGovernanceApproval(policyId){
  if(await polBlockIfOpen(policyId)) return;
  const policy = policiesCache.find(p => p.id === policyId);
  if(!policy){ alert("تعذّر تحميل السياسة"); return; }
  const docType = getPolicyWorkflowType(policy);
  await startGovernanceApproval(docType, policyId);
}

async function loadPolicyApprovalStatus(policyId, containerId){
  const box = document.getElementById(containerId);
  if(!box) return;
  const { data: approvals } = await sb.from("governance_approvals").select("*").eq("company_id", currentCompanyId).eq("document_ref_id", policyId).order("created_at",{ascending:false}).limit(1);
  const current = (approvals||[])[0];
  if(!current){ box.innerHTML = ""; return; }
  if(current.status === "مكتملة" || current.status === "مرفوضة"){
    const isDone = current.status === "مكتملة";
    box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:700;padding:6px 12px;border-radius:20px;background:${isDone?'#E8F8EF':'#FBEAEA'};color:${isDone?'var(--green)':'var(--red)'};border:1.5px solid ${isDone?'var(--green)':'var(--red)'}"><span class="ico ico-${isDone?'check':'xcircle'}" style="width:13px;height:13px"></span>${current.status}</span>`;
    return;
  }
  const deadlineDays = Number(currentCompanyPolicyDeadlineDays ?? 14);
  const daysPassed = Math.floor((Date.now() - new Date(current.created_at).getTime()) / 86400000);
  const daysLeft = deadlineDays - daysPassed;
  const isLate = daysLeft < 0;
  const deadlineNote = isLate
    ? `<span style="font-size:10.5px;color:var(--red);font-weight:800">متأخرة ${Math.abs(daysLeft)} يوم</span>`
    : `<span style="font-size:10.5px;color:var(--gray3)">متبقٍ ${daysLeft} يوم</span>`;
  box.innerHTML = `<span onclick="openGovernanceApprovalModal(${current.id})" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:800;padding:6px 12px;border-radius:20px;background:#FEF3E2;color:var(--gold);border:1.5px solid var(--gold)"><span class="ico ico-dot" style="width:11px;height:11px"></span>${current.status}</span> ${deadlineNote}`;
}

async function savePolicy(){
  const id = document.getElementById("mp-id").value;
  const policy_name = document.getElementById("mp-name").value.trim();
  const policy_type = document.getElementById("mp-type").value.trim();
  const submission_date = document.getElementById("mp-submission").value || new Date().toISOString().slice(0,10);
  const target_approval_date = document.getElementById("mp-target-approval").value || null;
  const approval_date = document.getElementById("mp-approval").value || null; // read-only field; only ever set automatically once the approval cycle completes
  const review_date = document.getElementById("mp-review").value || null;
  const status = document.getElementById("mp-status").value;
  const category = document.getElementById("mp-category").value;
  const approval_level = document.getElementById("mp-approval-level").value;
  if(!policy_name){ alert("الرجاء إدخال اسم السياسة"); return; }

  const previous = id ? policiesCache.find(x => x.id === Number(id)) : null;
  if(id && previous && previous.status !== status && status !== "مسودة" && await polBlockIfOpen(Number(id))) return;
  const fileInput = document.getElementById("mp-file");
  const file_url = await uploadFile(fileInput, "policies");

  const payload = { policy_name, policy_type, submission_date, target_approval_date, approval_date, review_date, status, category, approval_level, company_id: currentCompanyId };
  if(file_url) payload.file_url = file_url;
  if(!id || (previous && previous.status !== status)) payload.stage_entered_at = new Date().toISOString();

  const { error } = id
    ? await sb.from("policies").update(payload).eq("id", id)
    : await sb.from("policies").insert([payload]);
  if(error){ alert("خطأ أثناء الحفظ: " + error.message); return; }
  if(id && file_url){ try{ await polRegisterVersion(Number(id), file_url, previous ? previous.file_url : null); }catch(e){} }

  if(id && previous && previous.status !== status){
    await logPolicyStageChange(Number(id), previous.status, status);
  } else if(!id){
    const { data: created } = await sb.from("policies").select("id").eq("company_id", currentCompanyId).eq("policy_name", policy_name).order("id",{ascending:false}).limit(1).single();
    if(created) await logPolicyStageChange(created.id, null, status);
  }

  document.getElementById("mp-id").value = "";
  document.getElementById("mp-title-h").textContent = "🏛️ إضافة سياسة جديدة";
  document.getElementById("mp-name").value = "";
  document.getElementById("mp-type").value = "";
  document.getElementById("mp-submission").value = "";
  document.getElementById("mp-target-approval").value = "";
  document.getElementById("mp-approval").value = "";
  document.getElementById("mp-review").value = "";
  fileInput.value = "";
  closeM("m-policy");
  loadPolicies();
}

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

/* ══════════ RISK SERVICES (client-facing: browse, request, track, respond, rate) ══════════ */
const RISK_STATUS_ORDER = ["تم الاستلام","بانتظار رد العميل","قيد التحليل","قيد المراجعة الميدانية","تقرير نهائي جاهز","مغلق"];
const RISK_STATUS_COLOR = { "تم الاستلام":"var(--primary)", "بانتظار رد العميل":"#D9822B", "قيد التحليل":"var(--gold)", "قيد المراجعة الميدانية":"#8B2FC9", "تقرير نهائي جاهز":"var(--green)", "مغلق":"var(--gray3)" };

function riskLevelInfo(likelihood, impact){
  if(likelihood==null || impact==null) return { label:"—", color:"var(--gray3)" };
  const score = likelihood * impact;
  if(score >= 16) return { label:"عالٍ جداً", color:"#C0392B" };
  if(score >= 10) return { label:"عالٍ", color:"#E67E22" };
  if(score >= 5) return { label:"متوسط", color:"#F1C40F" };
  return { label:"منخفض", color:"#27AE60" };
}

async function loadRisks(){
  const grid = document.getElementById("riskServicesGrid");
  const tbody = document.getElementById("riskRequestsTbody");
  if(!grid || !tbody) return;

  const [{ data: services, error: svcErr }, { data: requests, error: reqErr }] = await Promise.all([
    sb.from("risk_service_types").select("*").order("id",{ascending:true}),
    sb.from("risk_requests").select("*").eq("company_id", currentCompanyId).order("created_at",{ascending:false})
  ]);

  if(svcErr){ grid.innerHTML = `<div style="color:var(--red);font-size:12px;grid-column:1/-1">${svcErr.message}</div>`; }
  else if(!services || services.length===0){ grid.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px;grid-column:1/-1">لا توجد خدمات متاحة حاليًا.</div>'; }
  else {
    grid.innerHTML = services.map(s => `<div class="card" style="margin:0;display:flex;flex-direction:column">
      <div class="card-body" style="display:flex;flex-direction:column;flex:1">
        <div style="font-weight:800;font-size:13.5px;color:var(--dark)">${orgEsc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--gray3);margin-top:6px;line-height:1.6;flex:1">${orgEsc(s.description||"")}</div>
        ${s.duration_estimate ? `<div style="font-size:11px;color:var(--primary);margin-top:8px">⏱️ ${s.duration_estimate}</div>` : ""}
        <button class="btn btn-gold" style="width:100%;margin-top:12px;font-size:11.5px" onclick="openNewRiskRequest(${s.id},'${orgEsc(s.name.replace(/'/g,""))}')">🚀 ابدأ تقييم المخاطر</button>
      </div>
    </div>`).join("");
  }

  if(reqErr){ tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);font-size:12px">${reqErr.message}</td></tr>`; return; }
  if(!requests || requests.length===0){ tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray3);font-size:12px;padding:14px">لا توجد طلبات بعد.</td></tr>'; return; }
  const svcNameById = {}; (services||[]).forEach(s=>{ svcNameById[s.id]=s.name; });
  tbody.innerHTML = requests.map(r => `<tr style="cursor:pointer" onclick="openRiskRequestDetail(${r.id})">
    <td>${svcNameById[r.service_type_id]||"—"}</td>
    <td>${new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</td>
    <td><span style="color:${RISK_STATUS_COLOR[r.status]||'var(--gray3)'};font-weight:700;font-size:11.5px">${r.status}</span></td>
    <td><button class="btn-xs primary" onclick="event.stopPropagation();openRiskRequestDetail(${r.id})">عرض</button></td>
  </tr>`).join("");
}

function openNewRiskRequest(serviceId, serviceName){
  document.getElementById("rnr-service-id").value = serviceId;
  document.getElementById("rnr-service-name").textContent = serviceName;
  document.getElementById("rnr-client-name").value = currentUserProfile ? (currentUserProfile.full_name||"") : "";
  document.getElementById("rnr-sector").value = "";
  document.getElementById("rnr-scope").value = "";
  document.getElementById("rnr-date").value = "";
  document.getElementById("rnr-files").value = "";
  document.querySelectorAll(".rnr-risktype-chk").forEach(c=>{ c.checked = false; });
  openM("m-risk-new-request");
}

async function submitRiskRequest(){
  const service_type_id = Number(document.getElementById("rnr-service-id").value);
  const client_name = document.getElementById("rnr-client-name").value.trim();
  if(!client_name){ alert("الرجاء إدخال اسم مقدّم الطلب"); return; }
  const sector = document.getElementById("rnr-sector").value.trim();
  const scope = document.getElementById("rnr-scope").value.trim();
  const preferred_date = document.getElementById("rnr-date").value || null;
  const risk_types_needed = [...document.querySelectorAll(".rnr-risktype-chk:checked")].map(c=>c.value).join("، ");
  if(!sector){ alert("الرجاء إدخال قطاع الشركة"); return; }
  if(scope.length < 15){ alert("الرجاء وصف نطاق التقييم بوضوح (قسم أو عملية أو مشروع) في سطر أو سطرين على الأقل، ليتمكّن المستشار من فهم طلبك"); return; }
  if(!risk_types_needed){ alert("الرجاء اختيار نوع واحد على الأقل من أنواع المخاطر المطلوب تحليلها"); return; }

  const filesInput = document.getElementById("rnr-files");
  const file_urls = [];
  if(filesInput.files && filesInput.files.length){
    for(const f of filesInput.files){
      const fakeInput = { files: [f] };
      const url = await uploadFile(fakeInput, "risk-requests");
      if(url) file_urls.push({ name: f.name, url });
    }
  }

  const { data: userData } = await sb.auth.getUser();
  const requested_by_email = userData && userData.user ? userData.user.email : null;

  const { error } = await sb.from("risk_requests").insert([{
    company_id: currentCompanyId, service_type_id, requested_by_email, client_name, sector, scope,
    risk_types_needed, file_urls, preferred_date, status: "تم الاستلام"
  }]);
  if(error){ alert("تعذّر إرسال الطلب: " + error.message); return; }
  logActivity("إنشاء", "طلب تقييم مخاطر", client_name, "");
  await notifyOwnerNewRequest("طلب تقييم مخاطر جديد", [["اسم مقدّم الطلب", client_name],["القطاع", sector],["نطاق التقييم", scope],["أنواع المخاطر", risk_types_needed],["عدد الملفات المرفقة", file_urls.length]]);
  alert("تم إرسال طلبك بنجاح ✅ — سيتواصل معك فريق المخاطر قريبًا.");
  closeM("m-risk-new-request");
  loadRisks();
}

// A simple 5×5 likelihood × impact grid — each risk item is plotted as a small numbered marker
// in its cell, colored by severity, with a legend mapping numbers back to the risk description.
function renderRiskHeatMap(items){
  const scored = (items||[]).filter(it => it.likelihood!=null && it.impact!=null);
  if(scored.length === 0) return '<div style="font-size:11px;color:var(--gray3);text-align:center;padding:10px">لا توجد مخاطر مقيَّمة بعد لعرضها بالمصفوفة.</div>';

  const cells = {};
  scored.forEach((it, idx) => {
    const key = `${it.likelihood}-${it.impact}`;
    if(!cells[key]) cells[key] = [];
    cells[key].push(idx+1);
  });

  let grid = '<div style="display:grid;grid-template-columns:24px repeat(5,1fr);gap:3px;direction:ltr">';
  grid += '<div></div>';
  for(let impact=1; impact<=5; impact++){ grid += `<div style="text-align:center;font-size:9px;color:var(--gray3)">${impact}</div>`; }
  for(let likelihood=5; likelihood>=1; likelihood--){
    grid += `<div style="display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gray3)">${likelihood}</div>`;
    for(let impact=1; impact<=5; impact++){
      const info = riskLevelInfo(likelihood, impact);
      const key = `${likelihood}-${impact}`;
      const markers = cells[key] || [];
      grid += `<div style="background:${info.color};min-height:40px;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:2px;padding:2px">
        ${markers.map(n=>`<span style="background:#fff;color:${info.color};font-weight:900;font-size:10px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center">${n}</span>`).join("")}
      </div>`;
    }
  }
  grid += '</div><div style="text-align:center;font-size:9px;color:var(--gray3);margin-top:4px">التأثير →</div>';

  const legend = scored.map((it,idx) => `<div style="font-size:10.5px;padding:3px 0;display:flex;gap:6px"><b>${idx+1}.</b><span>${orgEsc(it.description||"—")}</span></div>`).join("");
  return `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:220px">${grid}</div>
    <div style="flex:1;min-width:200px">${legend}</div>
  </div>`;
}

async function openRiskRequestDetail(requestId){
  const box = document.getElementById("rrd-body");
  box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">جارِ التحميل...</div>';
  openM("m-risk-request-detail");

  const [{ data: r }, { data: items }, { data: messages }, { data: rating }] = await Promise.all([
    sb.from("risk_requests").select("*").eq("id", requestId).single(),
    sb.from("risk_items").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_messages").select("*").eq("request_id", requestId).order("created_at",{ascending:true}),
    sb.from("risk_ratings").select("*").eq("request_id", requestId).limit(1)
  ]);
  if(!r){ box.innerHTML = '<div style="color:var(--red);font-size:12px">تعذّر تحميل الطلب</div>'; return; }

  document.getElementById("rrd-title-h").textContent = "⚠️ " + (r.client_name||"طلب تقييم مخاطر");
  const existingRating = (rating||[])[0];

  const statusIdx = RISK_STATUS_ORDER.indexOf(r.status);
  const timeline = `<div style="display:flex;align-items:center;margin:14px 0">
    ${RISK_STATUS_ORDER.slice(0,5).map((st,i) => {
      const done = i <= statusIdx;
      return `<div style="display:flex;align-items:center;flex:${i<4?'1':'0'}">
        <div title="${st}" style="width:${i===statusIdx?'14px':'10px'};height:${i===statusIdx?'14px':'10px'};border-radius:50%;background:${done?RISK_STATUS_COLOR[st]:'var(--gray1)'};flex-shrink:0"></div>
        ${i<4 ? `<div style="flex:1;height:3px;background:${i<statusIdx?'var(--green)':'var(--gray1)'};margin:0 2px"></div>` : ""}
      </div>`;
    }).join("")}
  </div><div style="text-align:center;font-size:11px;font-weight:700;color:${RISK_STATUS_COLOR[r.status]}">${r.status}</div>`;

  const itemsHtml = (items||[]).length ? items.map(it => {
    const lvl = riskLevelInfo(it.likelihood, it.impact);
    return `<div style="background:var(--offwhite);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-size:12px;color:var(--dark);font-weight:700">${orgEsc(it.description||"")}</div>
        <span style="background:${lvl.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${lvl.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">الفئة: ${orgEsc(it.category||"—")} · المصدر: ${it.source||"—"} · الاحتمالية: ${it.likelihood??"—"}/5 · التأثير: ${it.impact??"—"}/5</div>
      ${it.treatment_plan ? `<div style="font-size:11px;color:var(--teal);margin-top:6px"><b>خطة المعالجة:</b> ${it.treatment_plan}</div>` : ""}
      <div style="font-size:10.5px;color:var(--gray3);margin-top:4px">المسؤول: ${it.responsible_person||"—"} · الموعد المستهدف: ${it.target_close_date||"—"} · الحالة: <b style="color:${it.action_status==='مكتمل'?'var(--green)':'var(--gold)'}">${it.action_status}</b></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><button class="btn-xs sec" onclick="openGovLinkPicker('risk',${it.id})">🔗 ربط بسياسة أو قرار</button><div class="glinks" id="glk-risk-${it.id}" data-glinks="risk:${it.id}"></div></div>
    </div>`;
  }).join("") : '<div style="font-size:11.5px;color:var(--gray3)">لا توجد مخاطر مسجَّلة بعد.</div>';

  const filesHtml = (r.file_urls||[]).length ? r.file_urls.map(f => `<a href="${f.url}" target="_blank" style="display:block;font-size:11.5px;color:var(--primary);margin-bottom:4px"><span class="ico-i ico-paperclip"></span>${orgEsc(f.name)}</a>`).join("") : '<div style="font-size:11px;color:var(--gray3)">لا توجد ملفات مرفوعة.</div>';

  const chatHtml = (messages||[]).length ? messages.map(m => `<div style="margin-bottom:8px;text-align:${m.sender_email===r.requested_by_email?'left':'right'}">
    <div style="display:inline-block;max-width:80%;background:${m.sender_email===r.requested_by_email?'var(--primary)':'var(--offwhite)'};color:${m.sender_email===r.requested_by_email?'#fff':'var(--dark)'};border-radius:10px;padding:8px 12px;font-size:11.5px">
      <b style="font-size:10px;opacity:0.8">${orgEsc(m.sender_name||m.sender_email)}</b><br><span style="white-space:pre-line">${orgEsc(m.message)}</span>
    </div>
  </div>`).join("") : '<div style="font-size:11px;color:var(--gray3);text-align:center">لا توجد رسائل بعد.</div>';

  const awaitHtml = r.status === "بانتظار رد العميل" ? `<div style="background:#FFF4D6;border:1px solid #E6C766;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.9"><b>⏳ بانتظار ردّك</b><br>أرسل لك المستشار أسئلة أو طلبات في «التواصل مع فريق المخاطر» بالأسفل. نرجو الرد عليها ليبدأ العمل على تقييمك.</div>` : "";

  const ratingHtml = (r.status === "تقرير نهائي جاهز" || r.status === "مغلق") ? `
    <div class="sec-title" style="font-size:13px;margin-top:16px">⭐ تقييم الخدمة</div>
    <div class="card"><div class="card-body">
      ${existingRating ? `<div style="text-align:center;font-size:20px;color:var(--gold)">${"⭐".repeat(existingRating.rating)}</div><div style="font-size:11.5px;color:var(--gray3);text-align:center;margin-top:4px">${orgEsc(existingRating.comment||"")}</div>`
        : `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px" id="risk-rating-stars">
             ${[1,2,3,4,5].map(n=>`<span onclick="setRiskRatingValue(${n})" id="risk-star-${n}" style="font-size:24px;cursor:pointer;color:var(--gray1)">⭐</span>`).join("")}
           </div>
           <textarea class="fi" id="risk-rating-comment" rows="2" placeholder="ملاحظاتك على الخدمة (اختياري)"></textarea>
           <button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="submitRiskRating(${requestId})">إرسال التقييم</button>`}
    </div></div>` : "";

  box.innerHTML = `
    ${awaitHtml}
    ${timeline}
    <div class="sec-title" style="font-size:13px">🌡️ المصفوفة الحرارية لهذا الطلب</div>
    <div class="card"><div class="card-body">${renderRiskHeatMap(items)}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-pin"></span>المخاطر المسجَّلة وخطط المعالجة</div>
    ${itemsHtml}
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-paperclip"></span>الملفات</div>
    <div class="card"><div class="card-body">${filesHtml}${r.final_report_url ? `<a href="${r.final_report_url}" target="_blank" style="display:block;font-size:12px;color:var(--green);font-weight:700;margin-top:8px"><span class="ico-i ico-document"></span>تحميل التقرير النهائي</a>` : ""}</div></div>
    <div class="sec-title" style="font-size:13px;margin-top:14px"><span class="ico-i ico-message"></span>التواصل مع فريق المخاطر</div>
    <div class="card"><div class="card-body">
      <div id="risk-chat-box" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${chatHtml}</div>
      <div style="display:flex;gap:6px">
        <textarea class="fi" id="risk-chat-input" rows="3" placeholder="اكتب رسالتك..." style="flex:1;margin:0"></textarea>
        <button class="btn-xs primary" onclick="sendRiskMessage(${requestId})">إرسال</button>
      </div>
    </div></div>
    ${ratingHtml}
  `;
  window.currentRiskRatingValue = 0;
  (items||[]).forEach(it => renderGovLinks(`glk-risk-${it.id}`, 'risk', it.id));
}

async function sendRiskMessage(requestId){
  const input = document.getElementById("risk-chat-input");
  const message = input.value.trim();
  if(!message) return;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : "";
  const { error } = await sb.from("risk_messages").insert([{
    request_id: requestId, sender_email: email, sender_name: currentUserProfile?currentUserProfile.full_name:email, message
  }]);
  if(error){ alert("تعذّر إرسال الرسالة: " + error.message); return; }
  input.value = "";
  await notifyOwnerNewRequest("رد جديد من العميل على طلب تقييم المخاطر", [["الرسالة", message.slice(0,300)]]);
  openRiskRequestDetail(requestId);
}

function setRiskRatingValue(n){
  window.currentRiskRatingValue = n;
  for(let i=1;i<=5;i++){ document.getElementById(`risk-star-${i}`).style.color = i<=n ? "var(--gold)" : "var(--gray1)"; }
}

async function submitRiskRating(requestId){
  const rating = window.currentRiskRatingValue || 0;
  if(!rating){ alert("الرجاء اختيار عدد النجوم"); return; }
  const comment = document.getElementById("risk-rating-comment").value.trim();
  const { error } = await sb.from("risk_ratings").insert([{ request_id: requestId, rating, comment }]);
  if(error){ alert("تعذّر إرسال التقييم: " + error.message); return; }
  alert("شكرًا لتقييمك ✅");
  openRiskRequestDetail(requestId);
}

