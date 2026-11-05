function openStandaloneAnnouncementForm(){
  document.getElementById("annTypeSearch").value = "";
  renderAnnouncementTypeList();
  openM("m-announcement-type-picker");
}

async function pickAgmAnnouncementType(type){
  pendingAnnouncementType = type;
  closeM("m-announcement-type-picker");
  const { data: meetings } = await sb.from("meetings").select("id,title,meeting_date")
    .eq("company_id", currentCompanyId).eq("meeting_type","الجمعية العامة").eq("is_listed_agm", true)
    .order("meeting_date",{ascending:false});
  const sel = document.getElementById("agmPickerSelect");
  if(!meetings || meetings.length===0){
    sel.innerHTML = '<option value="">لا توجد جمعيات مدرجة بعد — أنشئ جمعية أولًا من صفحة "الجمعية العامة"</option>';
  } else {
    sel.innerHTML = meetings.map(m => `<option value="${m.id}">${orgEsc(m.title||"جمعية")} — ${m.meeting_date||""}</option>`).join("");
  }
  document.getElementById("agmPickerTitle").textContent =
    `اختر الجمعية العامة — إعلان ${type}`;
  openM("m-agm-picker-for-announcement");
}

function confirmAgmPickerForAnnouncement(){
  const meetingId = Number(document.getElementById("agmPickerSelect").value);
  if(!meetingId){ alert("اختر جمعية أولًا"); return; }
  currentAGMModalMeetingId = meetingId;
  closeM("m-agm-picker-for-announcement");
  openTadawulAnnouncementForm(pendingAnnouncementType);
}

async function loadAnnouncementsPageList(){
  const box = document.getElementById("announcementsPageList");
  const intro = document.getElementById("announcementsPageIntro");
  if(intro){
    intro.textContent = currentCompanyType === "مساهمة مدرجة"
      ? 'تولّد مسودة PDF بالصياغة الرسمية المطلوبة — ترسلها لموظف تداول المختص لاعتمادها ونشرها؛ منصتنا لا تنشر مباشرة على تداول.'
      : 'مستندات رسمية احترافية بصياغة معتمدة — تُستخدم للتواصل مع مساهميك ومستثمريك، أو كأرشيف رسمي داخلي، حتى لو شركتك غير مدرجة حاليًا.';
  }
  const { data, error } = await sb.from("tadawul_announcements").select("*, meetings(title,meeting_date)")
    .eq("company_id", currentCompanyId).order("created_at",{ascending:false});
  if(error){ box.innerHTML = `<div style="color:var(--red);font-size:12px">${error.message}</div>`; return; }
  if(!data || data.length===0){ box.innerHTML = '<div style="text-align:center;color:var(--gray3);font-size:12px;padding:20px">لا توجد إعلانات مولَّدة بعد.</div>'; return; }
  box.innerHTML = data.map(a => {
    const isListedCo = currentCompanyType === "مساهمة مدرجة";
    const needsTadawulConfirm = isListedCo && !a.confirmed_on_tadawul;
    return `<div class="card" style="margin-bottom:10px">
    <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:800;font-size:12.5px">${a.announcement_type}${a.meetings?` — ${a.meetings.title||''}`:''}</div>
        <div style="font-size:11px;color:var(--gray3)">${new Date(a.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}
          ${isListedCo ? (a.confirmed_on_tadawul ? '<span style="color:var(--green)"> · ✅ مؤكَّد بتداول</span>' : '<span style="color:var(--gray3)"> · ⏳ بانتظار التأكيد</span>') : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <a href="${a.file_url}" target="_blank" class="btn-xs primary"><span class="ico-i ico-inbox"></span>عرض</a>
        ${needsTadawulConfirm ? `<button class="btn-xs" style="background:#E8F8EF;color:var(--green);border:none;border-radius:6px;padding:5px 10px;font-size:10.5px;cursor:pointer" onclick="confirmTadawulAnnouncement(${a.id});setTimeout(loadAnnouncementsPageList,400)"><span class="ico-i ico-check"></span>تأكيد النشر</button>` : `<label style="font-size:10.5px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${a.show_on_public_site?'checked':''} onchange="toggleAnnouncementPublicSite(${a.id},this.checked)"/> 🌐 عام</label>`}
      </div>
    </div>
  </div>`;
  }).join("");
}
