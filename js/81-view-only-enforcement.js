/* ══════════ VIEW-ONLY ENFORCEMENT (عضو مجلس) ══════════ */
function isMutatingOnclick(val){
  if(!val) return false;
  return /^openM\(\s*'m-/.test(val)
    || /^openPermItemModal\(/.test(val)
    || /^triggerPermMatrixImport\(/.test(val)
    || /^openPermHoldersManager\(/.test(val)
    || /^openPermItemsManager\(/.test(val)
    || /^openPermItemEditModal\(/.test(val)
    || /^linkMeetingToSigningDoc\(/.test(val)
    || /^addAGMTopic\(/.test(val)
    || /^addBoardDecision\(/.test(val)
    || /^saveAGMVotingDates\(/.test(val)
    || /^saveMeetingAttendance\(/.test(val)
    || /^openNewCommitteeModal\(/.test(val)
    || /^openNewGovEvalModal\(/.test(val)
    || /^generateBaseStructure\(/.test(val)
    || /^openNewShareholderModal\(/.test(val)
    || /^openTransferModal\(/.test(val)
    || /^saveShareholder\(/.test(val)
    || /^executeShareTransfer\(/.test(val)
    || /^openPdfImportModal\(/.test(val)
    || /^confirmPdfImport\(/.test(val)
    || /^openNewCompanyModal\(/.test(val)
    || /^openInviteModal\(/.test(val)
    || /^openEditCompanyModal\(/.test(val)
    || /^edit[A-Z]/.test(val)
    || /^delete[A-Z]/.test(val)
    || /^saveCompany/.test(val)
    || /^switchCompany/.test(val);
}
function isMutatingOnchange(val){
  if(!val) return false;
  return /^uploadFile\(/.test(val)
    || /^uploadMeetingFile\(/.test(val)
    || /^uploadAGMSupportingDoc\(/.test(val)
    || /^uploadDocumentTemplate\(/.test(val)
    || /^handlePdfFileSelect\(/.test(val)
    || /^handleIndicatorsUpload\(/.test(val)
    || /^handleShareholdersExcelUpload\(/.test(val)
    || /^exportIndicatorsPDF\(/.test(val)
    || /^checkInAttendee\(/.test(val)
    || /^deleteCheckin\(/.test(val)
    || /^toggleTemplateDefault\(/.test(val)
    || /^openActivateSubModal\(/.test(val)
    || /^exportAllCompanyData\(/.test(val)
    || /^saveGovAssessment\(/.test(val)
    || /^finalApproveAuditRequest\(/.test(val)
    || /^finalApproveRiskRequest\(/.test(val)
    || /^finalApproveSubscription\(/.test(val)
    || /^openNewGovAssessment\(/.test(val)
    || /^activateSubscription\(/.test(val)
    || /^openMySubscription\(/.test(val)
    || /^dismissTrialBanner\(/.test(val)
    || /^pdShowList\(/.test(val)
    || /^crTab\(/.test(val)
    || /^crWathqCheck\(/.test(val)
    || /^saveTrialDays\(/.test(val)
    || /^setTrialQuick\(/.test(val)
    || /^startTrialForCompany\(/.test(val)
    || /^renewSubscription\(/.test(val)
    || /^cancelTrial\(/.test(val)
    || /^openCharterModal\(/.test(val)
    || /^saveCharter\(/.test(val)
    || /^sendMeetingReminderEmails\(/.test(val)
    || /^sendPolicyApprovalReminder\(/.test(val)
    || /^sendPermissionItemNotification\(/.test(val)
    || /^sendPermissionItemWhatsApp\(/.test(val)
    || /^requestBoardApproval\(/.test(val)
    || /^openWorkflowTemplateModal\(/.test(val)
    || /^saveWorkflowTemplate\(/.test(val)
    || /^startGovernanceApproval\(/.test(val)
    || /^startPolicyGovernanceApproval\(/.test(val)
    || /^openUserPermissionOverridesModal\(/.test(val)
    || /^sendApprovalReminder\(/.test(val)
    || /^requestCharterApproval\(/.test(val)
    || /^updateUserRole\(/.test(val)
    || /^updateRequestStatus\(/.test(val)
    || /^savePermCell\(/.test(val);
}

function restrictMutatingButtons(){
  // Per-user, per-page override takes precedence over the role-based default: 'edit' forces
  // full access on this page even if the role wouldn't normally allow it, 'view' forces
  // read-only even if the role would normally allow editing. No override → fall back to role.
  const pageOverride = myPermissionOverrides[currentPageId] || myPermissionOverrides['*'];
  let restricted;
  if(pageOverride === 'edit') restricted = false;
  else if(pageOverride === 'view') restricted = true;
  else restricted = FULL_ACCESS_ROLES.indexOf(getCurrentRole()) === -1 && getCurrentRole() !== 'مساهم';
  // Reset first (in case role changed to a full-access one after a prior restriction pass)
  document.querySelectorAll('[data-role-hidden="1"]').forEach(el=>{
    el.style.display = '';
    el.removeAttribute('data-role-hidden');
  });
  if(!restricted) return;

  document.querySelectorAll('[onclick]').forEach(el=>{
    if(isMutatingOnclick(el.getAttribute('onclick'))){
      el.style.display = 'none';
      el.setAttribute('data-role-hidden','1');
    }
  });
  document.querySelectorAll('input[onchange], select[onchange]').forEach(el=>{
    if(isMutatingOnchange(el.getAttribute('onchange'))){
      const target = el.closest('label') || el;
      target.style.display = 'none';
      target.setAttribute('data-role-hidden','1');
    }
  });
}

let mutationGuardStarted = false;
function startMutationGuard(){
  if(mutationGuardStarted) return;
  mutationGuardStarted = true;
  const main = document.querySelector('.main');
  if(!main) return;
  const observer = new MutationObserver(()=>{ restrictMutatingButtons(); });
  observer.observe(main, { childList: true, subtree: true });
}
