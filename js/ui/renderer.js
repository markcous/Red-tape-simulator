import { DeskWorkspace } from '../../UI/DeskWorkspace/Scripts/desk-workspace.js';
import { DeskDocument } from '../../UI/DeskWorkspace/Scripts/desk-document.js';
import { renderParkingFinePayment } from '../minigames/parking-fine-payment/ui.js';
import { renderDMVVisionTest } from '../minigames/dmv-vision-test/ui.js';

const SCENARIO_FORM_DEFINITIONS = {
  LicenseRenewal: { formNumber: 'DL-117', title: 'Driver License Renewal Application' },
  NewLicense: { formNumber: 'DL-101', title: 'Original Driver License Application' },
  VehicleRegistration: { formNumber: 'REG-343', title: 'Application for Vehicle Registration' },
  PlateRenewal: { formNumber: 'REG-201', title: 'Registration / Plate Renewal Notice' },
  TitleTransfer: { formNumber: 'REG-227', title: 'Application for Duplicate or Transfer of Title' },
  DuplicateLicense: { formNumber: 'DL-102', title: 'Replacement Driver License Application' },
  AddressChange: { formNumber: 'DMV-14', title: 'Change of Address Request' },
  NameChange: { formNumber: 'DL-44C', title: 'Driver License Name Correction Form' },
  TicketPayment: { formNumber: 'PK-100', title: 'Parking Citation Payment Form' },
  TicketAppeal: { formNumber: 'PK-220', title: 'Parking Citation Appeal Request' },
  PermitApplication: { formNumber: 'PK-300', title: 'Residential Parking Permit Application' },
  PermitRenewal: { formNumber: 'PK-301', title: 'Parking Permit Renewal Form' },
  VehicleRelease: { formNumber: 'IMP-501', title: 'Impounded Vehicle Release Request' },
  PropertyClaim: { formNumber: 'IMP-320', title: 'Impound Property Claim Form' },
  AuctionInquiry: { formNumber: 'IMP-110', title: 'Impound Auction Information Request' },
  BuildingPermit: { formNumber: 'PMT-410', title: 'Building Permit Application' },
  BusinessLicense: { formNumber: 'PMT-220', title: 'Business License Application' },
  NoiseVariance: { formNumber: 'PMT-330', title: 'Noise Variance Request' },
  CodeComplianceInspection: { formNumber: 'PMT-140', title: 'Code Compliance Inspection Request' }
};

export class UIRenderer {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.menuView = 'main';
    this.currentDocTab = null;
    this.handbookPageIndex = 0;
    this.handbookPages = [];
    this.showDevControls = false;
    this.devControlsStorageKey = 'redTapeShowDevControls';
    this.pendingDeleteSlot = null;
    this.selectedNewCareerSlot = null;
    this.lastResultData = null;
    this.lastReviewData = null;
    this.lastGameplayStateSnapshot = null;
    this.pausedGameplaySnapshot = null;
    this.requestedFormFieldsByCase = {};
  }

  init() {
    this.cacheElements();
    this.ensureHandbookOverlay();
    this.initializeDevControlsVisibility();
    this.applyVisualSettings();
    this.bindEvents();

    this.game.onStateChange = (data) => this.handleStateChange(data);
    this.game.onEvent = (event, data) => this.handleEvent(event, data);

    // Render current game state immediately in case init happened before UI hooks were attached.
    this.handleStateChange({ state: this.game.state });
  }

  getScenarioFormDefinition(requestType) {
    const key = String(requestType || '').trim();
    return SCENARIO_FORM_DEFINITIONS[key] || {
      formNumber: 'N/A',
      title: this.game.caseGenerator?.formatRequestType?.(key || 'Unknown Request') || 'Unknown Request'
    };
  }

  async copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) return false; // Early exit if no text to copy

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_err) {
        // Fall through to legacy copy path.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_err) {
      copied = false;
    }

    textarea.remove();
    return copied;
  }

  buildDevLogicIssuePayload({ source = 'unknown', note = '', extra = {} } = {}) {
    const currentCase = this.game.currentCase || {};
    const caseRecord = currentCase.caseRecord || null;
    const documents = currentCase.documents || {};
    const conditions = caseRecord?.inputs?.conditions || [];
    const requiredDocs = caseRecord?.inputs?.requiredDocs || [];
    const presentDocs = Object.entries(documents)
      .filter(([, doc]) => Boolean(doc?.present))
      .map(([docType]) => docType);
    const missingDocs = requiredDocs.filter((docType) => !presentDocs.includes(docType));

    const requestType = caseRecord?.requestType || '';
    const expectedForm = this.getScenarioFormDefinition(requestType);
    const wrongForm = conditions.find((condition) => condition?.type === 'wrong_form') || null;
    const submittedFormType = wrongForm?.submittedForm || requestType;
    const submittedForm = this.getScenarioFormDefinition(submittedFormType);
    const pendingDocRequest = this.game.gameState?.pendingDocRequest || null;

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source,
      note: String(note || '').trim(),
      gameState: this.game.state,
      case: {
        caseId: caseRecord?.caseId || null,
        department: this.game.player?.department || null,
        shiftNumber: this.game.player?.shiftNumber || null,
        requestType,
        expectedForm,
        submittedForm: {
          requestType: submittedFormType,
          ...submittedForm
        },
        requiredDocs,
        presentDocs,
        missingDocs,
        conditions: conditions.map((condition) => ({
          type: condition?.type || '',
          severity: condition?.severity || '',
          detail: condition?.detail || '',
          blocksApproval: Boolean(condition?.blocksApproval),
          expectedForm: condition?.expectedForm || null,
          submittedForm: condition?.submittedForm || null
        })),
        correctAction: currentCase.correctAction || null,
        possibleIssues: Array.isArray(currentCase.possibleIssues) ? currentCase.possibleIssues : []
      },
      npc: {
        id: this.game.currentNPC?.npcId || null,
        name: this.game.currentNPC?.fullName || null,
        flags: Array.isArray(this.game.currentNPC?.flags)
          ? this.game.currentNPC.flags.map((flag) => ({
            flagId: flag?.flagId || null,
            severity: flag?.severity || null,
            data: flag?.data || null
          }))
          : []
      },
      docRequest: pendingDocRequest ? {
        docType: pendingDocRequest.docType,
        docName: pendingDocRequest.docName,
        isRequiredDoc: Boolean(pendingDocRequest.isRequiredDoc),
        outcome: pendingDocRequest.outcome,
        frustrationPenalty: pendingDocRequest.frustrationPenalty,
        bribeAmount: pendingDocRequest.bribeAmount
      } : null,
      extra
    };
  }

  buildDevLogicIssueReportText(payload) {
    return [
      'RTS_DEV_LOGIC_REPORT',
      JSON.stringify(payload, null, 2)
    ].join('\n');
  }

  reportLogicIssue({ source, extra = {}, promptText } = {}) {
    if (!this.game.developmentMode) {
      this.showNotification('Enable Developer mode to report logic issues.', 'warning');
      return;
    }

    const note = window.prompt(
      promptText || 'Describe what was illogical. Include what happened and what should have happened.',
      ''
    );
    if (note === null) return;

    const payload = this.buildDevLogicIssuePayload({ source, note, extra });
    const reportText = this.buildDevLogicIssueReportText(payload);

    this.copyTextToClipboard(reportText).then((copied) => {
      if (copied) {
        this.showNotification('Logic report copied. Paste it into chat for a targeted fix.', 'success');
      } else {
        this.showNotification('Could not copy automatically. Open console and copy RTS_DEV_LOGIC_REPORT payload.', 'warning');
      }
    });
  }

  initializeDevControlsVisibility() {
    const urlParams = new URLSearchParams(window.location.search);
    const devParam = (urlParams.get('dev') || '').toLowerCase();

    if (devParam === '1' || devParam === 'true') {
      this.setDevControlsVisibility(true, { persist: true, notify: false });
      return;
    }

    if (devParam === '0' || devParam === 'false') {
      this.setDevControlsVisibility(false, { persist: true, notify: false });
      return;
    }

    const settings = this.game.getSettings?.() || {};
    const settingsEnabled = Boolean(settings.developerMode);

    try {
      const persisted = localStorage.getItem(this.devControlsStorageKey);
      const enabled = persisted === null ? settingsEnabled : persisted === '1';
      this.setDevControlsVisibility(enabled, { persist: false, notify: false });
    } catch (_err) {
      this.setDevControlsVisibility(settingsEnabled, { persist: false, notify: false });
    }
  }

  setDevControlsVisibility(visible, { persist = true, notify = true } = {}) {
    this.showDevControls = Boolean(visible);
    this.game.setDevelopmentMode(this.showDevControls);

    if (persist) {
      try {
        localStorage.setItem(this.devControlsStorageKey, this.showDevControls ? '1' : '0');
      } catch (_err) {
        // Ignore persistence failures in restricted browsing contexts.
      }
    }

    if (this.game.state === 'menu') {
      this.showMenu();
    }

    if (this.game.state === 'serving' && this.game.currentCase) {
      const currentConditions = this.game.currentCase.caseRecord?.inputs?.conditions || [];
      const currentFlags = Array.isArray(this.game.currentNPC?.flags) ? this.game.currentNPC.flags : [];

      this.renderDocuments(
        this.game.currentCase.documents,
        this.game.currentCase.caseRecord,
        this.game.currentCase.possibleIssues,
        this.game.shiftManager?.getActiveChaosEvents?.() || []
      );
      this.renderFlags(currentConditions, currentFlags, this.game.currentCase.possibleIssues || []);
      this.renderDecisionPanel({
        caseRecord: this.game.currentCase.caseRecord,
        documents: this.game.currentCase.documents,
        issues: this.game.currentCase.possibleIssues,
        npc: this.game.currentNPC
      });
    }

    if (this.game.state === 'result' && this.lastResultData) {
      this.showResult(this.lastResultData);
    }

    if (notify) {
      this.showNotification(`Developer mode ${this.showDevControls ? 'on' : 'off'}.`);
    }
  }

  toggleDevControlsVisibility() {
    this.setDevControlsVisibility(!this.showDevControls);
  }

  applyVisualSettings() {
    const settings = this.game.getSettings?.() || {};
    document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    document.body.classList.toggle('high-contrast', Boolean(settings.highContrast));

    const uiScale = Math.max(80, Math.min(140, Number(settings.uiScale ?? 100) || 100));
    const textSize = Math.max(80, Math.min(140, Number(settings.textSize ?? 100) || 100));
    document.documentElement.style.setProperty('--ui-scale', String(uiScale / 100));
    document.documentElement.style.setProperty('--text-scale', String(textSize / 100));
  }

  cacheElements() {
    this.elements = {
      // Screens
      loadingScreen: document.getElementById('loading-screen'),
      menuScreen: document.getElementById('menu-screen'),
      menuContainer: document.querySelector('#menu-screen .menu-container'),
      gameScreen: document.getElementById('game-screen'),
      shiftStartScreen: document.getElementById('shift-start-screen'),
      reviewScreen: document.getElementById('review-screen'),

      // Menu
      menuContinueBtn: document.getElementById('menu-continue-btn'),
      menuLoadFileBtn: document.getElementById('menu-load-file-btn'),
      menuNewFileBtn: document.getElementById('menu-new-file-btn'),
      menuSettingsBtn: document.getElementById('menu-settings-btn'),
      menuCreditsBtn: document.getElementById('menu-credits-btn'),
      menuExitBtn: document.getElementById('menu-exit-btn'),
      menuPanel: document.getElementById('menu-panel'),

      // Game HUD
      clockDisplay: document.getElementById('clock-display'),
      queueCounter: document.getElementById('queue-counter'),
      shiftProgress: document.getElementById('shift-progress'),
      moneyDisplay: document.getElementById('money-display'),
      performanceDisplay: document.getElementById('performance-indicator'),
      overtimeIndicator: document.getElementById('overtime-indicator'),

      // Customer area
      customerPanel: document.getElementById('customer-panel'),
      customerPortrait: document.getElementById('customer-portrait'),
      customerName: document.getElementById('customer-name'),
      customerGreeting: document.getElementById('customer-greeting'),
      customerInfo: document.getElementById('customer-info'),

      // Document area
      documentPanel: document.getElementById('document-panel'),
      documentTabs: document.getElementById('document-tabs'),
      documentContent: document.getElementById('document-content'),
      flagsPanel: document.getElementById('flags-panel'),

      // Decision area
      decisionPanel: document.getElementById('decision-panel'),
      approveBtn: document.getElementById('approve-btn'),
      denyBtn: document.getElementById('deny-btn'),
      escalateBtn: document.getElementById('escalate-btn'),
      denyReasons: document.getElementById('deny-reasons'),

      // Result overlay
      resultOverlay: document.getElementById('result-overlay'),
      resultContent: document.getElementById('result-content'),
      nextCustomerBtn: document.getElementById('next-customer-btn'),

      // Bribe overlay
      bribeOverlay: document.getElementById('bribe-overlay'),
      bribeContent: document.getElementById('bribe-content'),
      acceptBribeBtn: document.getElementById('accept-bribe-btn'),
      declineBribeBtn: document.getElementById('decline-bribe-btn'),

      // Document request decision overlay
      docRequestOverlay: document.getElementById('doc-request-overlay'),
      docRequestContent: document.getElementById('doc-request-content'),
      docRequestActions: document.getElementById('doc-request-actions'),

      // Parking fine payment mini-game overlay
      finePaymentOverlay: document.getElementById('fine-payment-overlay'),
      finePaymentContent: document.getElementById('fine-payment-content'),

      // Deny reason overlay
      denyReasonOverlay: document.getElementById('deny-reason-overlay'),
      denyReasonList: document.getElementById('deny-reason-list'),
      cancelDenyReasonBtn: document.getElementById('cancel-deny-reason-btn'),

      // Event banner
      eventBanner: document.getElementById('event-banner'),
      eventText: document.getElementById('event-text'),

      // Shift start
      shiftStartContent: document.getElementById('shift-start-content'),
      beginShiftBtn: document.getElementById('begin-shift-btn'),

      // Review
      reviewContent: document.getElementById('review-content'),
      continueBtn: document.getElementById('continue-btn'),

      // Notification area
      notificationArea: document.getElementById('notification-area'),

      // Handbook overlay (created dynamically if missing)
      handbookOverlay: document.getElementById('handbook-overlay'),
      handbookContent: document.getElementById('handbook-content'),
      handbookTabs: document.getElementById('handbook-tabs'),
      closeHandbookBtn: document.getElementById('close-handbook-btn'),

      // Across-desk customer strip
      deskCustomerAvatar: document.getElementById('desk-customer-avatar'),
      deskCustomerChat: document.getElementById('desk-customer-chat')
    };
  }

  bindEvents() {
    this.elements.menuContinueBtn?.addEventListener('click', () => this.handleContinueFromMenu());
    this.elements.menuLoadFileBtn?.addEventListener('click', () => {
      this.menuView = 'load';
      this.showMenu();
    });
    this.elements.menuNewFileBtn?.addEventListener('click', () => {
      this.menuView = 'new';
      this.selectedNewCareerSlot = this.getDefaultNewCareerSlot();
      this.showMenu();
    });
    this.elements.menuSettingsBtn?.addEventListener('click', () => {
      this.menuView = 'settings';
      this.showMenu();
    });
    this.elements.menuCreditsBtn?.addEventListener('click', () => {
      this.menuView = 'credits';
      this.showMenu();
    });
    this.elements.menuExitBtn?.addEventListener('click', () => this.handleExitFromMenu());

    this.elements.menuPanel?.addEventListener('click', (event) => {
      const actionButton = event.target.closest('button[data-menu-action]');
      if (!actionButton) return;
      this.handleMenuPanelAction(actionButton);
    });

    this.elements.menuPanel?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      this.handleMenuPanelChange(target);
    });

    this.elements.beginShiftBtn?.addEventListener('click', () => this.game.nextCustomer());
    this.elements.approveBtn?.addEventListener('click', () => {
      this.closeDeskTerminal();
      this.finalizeDecisionWithStamp('Approve', 'AllDocumentsValid');
    });
    this.elements.nextCustomerBtn?.addEventListener('click', () => {
      this.hideOverlay();
      this.game.nextCustomer();
    });
    this.elements.acceptBribeBtn?.addEventListener('click', () => {
      this.hideBribeOverlay();
      this.game.respondToBribe(true);
    });
    this.elements.declineBribeBtn?.addEventListener('click', () => {
      this.hideBribeOverlay();
      this.game.respondToBribe(false);
    });
    this.elements.docRequestActions?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      this.hideDocRequestOverlay();
      this.game.resolveDocumentRequest(button.dataset.action);
    });
    this.elements.finePaymentContent?.addEventListener('click', (event) => {
      const visionActionButton = event.target.closest('button[data-vision-action]');
      if (visionActionButton) {
        const visionAction = String(visionActionButton.dataset.visionAction || '').trim();
        if (visionAction === 'next_line') {
          this.game.handleDMVVisionTestAction?.('next_line');
          return;
        }

        if (visionAction === 'verdict') {
          const verdict = String(visionActionButton.dataset.visionVerdict || '').trim();
          this.game.handleDMVVisionTestAction?.('verdict', { verdict });
          return;
        }
      }

      const actionButton = event.target.closest('button[data-payment-action]');
      if (!actionButton) return;

      const action = String(actionButton.dataset.paymentAction || '').trim();
      if (action === 'submit') {
        this.game.handleParkingFinePaymentAction?.('submit');
        return;
      }

      if (action === 'pick_bill') {
        const source = String(actionButton.dataset.paymentSource || '').trim();
        const billIndex = Number(actionButton.dataset.billIndex);
        this.game.handleParkingFinePaymentAction?.('pick_bill', {
          source,
          billIndex
        });
      }
    });
    this.elements.denyReasonList?.addEventListener('click', (event) => {
      const confirmButton = event.target.closest('button[data-confirm-deny="true"]');
      if (confirmButton) {
        if (this.isHardPlusDifficulty()) {
          const selectedReasons = this.getSelectedDenyReasons();
          if (!selectedReasons.length) {
            this.showNotification('Select at least one deny reason.', 'warning');
            return;
          }
          this.hideDenyReasonOverlay();
          this.closeDeskTerminal();
          this.finalizeDecisionWithStamp('Deny', selectedReasons[0], { reasonCodes: selectedReasons });
          return;
        }
      }

      const button = event.target.closest('button[data-reason]');
      if (!button) return;

      if (this.isHardPlusDifficulty()) {
        button.classList.toggle('selected');
        button.setAttribute('aria-pressed', button.classList.contains('selected') ? 'true' : 'false');
        this.syncHardPlusDenySelectionSummary();
        return;
      }

      this.hideDenyReasonOverlay();
      this.closeDeskTerminal();
      this.finalizeDecisionWithStamp('Deny', button.dataset.reason, { reasonCodes: [button.dataset.reason] });
    });
    this.elements.cancelDenyReasonBtn?.addEventListener('click', () => {
      this.hideDenyReasonOverlay();
    });
    this.elements.denyReasonOverlay?.addEventListener('click', (event) => {
      if (event.target === this.elements.denyReasonOverlay) {
        this.hideDenyReasonOverlay();
      }
    });
    this.elements.continueBtn?.addEventListener('click', () => {
      if (this.lastReviewData?.resignation?.triggered) {
        this.game.returnToMenu?.();
        return;
      }
      this.game.startShift();
    });

    this.elements.closeHandbookBtn?.addEventListener('click', () => this.closeHandbook());
    this.elements.handbookOverlay?.addEventListener('click', (e) => {
      if (e.target === this.elements.handbookOverlay) this.closeHandbook();
    });
    this.elements.handbookTabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('.handbook-tab');
      if (!tab) return;
      const index = Number(tab.dataset.pageIndex);
      if (Number.isInteger(index)) this.selectHandbookPage(index);
    });

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );

      if (!isTypingTarget && event.key === 'Escape') {
        const gameplayStates = new Set(['shift_start', 'serving', 'doc_request', 'parking_fine_payment', 'dmv_vision_test', 'result', 'bribe', 'review']);
        if (gameplayStates.has(this.game.state)) {
          event.preventDefault();
          if (this.lastGameplayStateSnapshot && this.lastGameplayStateSnapshot.state === this.game.state) {
            this.pausedGameplaySnapshot = {
              state: this.lastGameplayStateSnapshot.state,
              data: this.lastGameplayStateSnapshot.data
            };
          }
          this.menuView = 'main';
          this.pendingDeleteSlot = null;
          this.selectedNewCareerSlot = null;
          this.game.returnToMenu?.();
          return;
        }
      }

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        this.toggleDevControlsVisibility();
      }
    });
  }

  ensureHandbookOverlay() {
    if (this.elements.handbookOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'handbook-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="handbook-shell">
        <button id="close-handbook-btn" class="handbook-close-btn" aria-label="Close handbook">&times;</button>
        <div class="handbook-body">
          <div id="handbook-content"></div>
          <div id="handbook-tabs" class="handbook-tabs" aria-label="Handbook sections"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    this.elements.handbookOverlay = overlay;
    this.elements.handbookContent = overlay.querySelector('#handbook-content');
    this.elements.handbookTabs = overlay.querySelector('#handbook-tabs');
    this.elements.closeHandbookBtn = overlay.querySelector('#close-handbook-btn');
  }

  openHandbook(caseRecord) {
    if (!this.elements.handbookOverlay || !caseRecord) return;
    this.handbookPages = this.getHandbookPages(caseRecord);
    this.handbookPageIndex = 0;
    this.renderHandbookTabs();
    this.renderHandbookPage();
    this.elements.handbookOverlay.classList.remove('hidden');
  }

  closeHandbook() {
    this.elements.handbookOverlay?.classList.add('hidden');
  }

  selectHandbookPage(index) {
    if (!this.handbookPages.length) return;
    if (index < 0 || index >= this.handbookPages.length) return;
    this.handbookPageIndex = index;
    this.renderHandbookPage();
  }

  getDocumentPolicyProfile(docType) {
    const defaultProfile = {
      acceptable: 'Names, dates, and identifiers are complete, legible, and internally consistent with the submitted request.',
      redFlags: 'Crossed-out fields, mismatched identifiers, altered dates, or layout/format that differs from standard forms.'
    };

    const policyProfiles = {
      driversLicense: {
        acceptable: 'Photo matches the applicant, license number format is valid, and expiration date is current for request eligibility.',
        redFlags: 'Photo mismatch, wrong issue/expiry sequence, inconsistent signature, or barcode/ID number pattern that looks edited.'
      },
      proofOfResidence: {
        acceptable: 'Current address (usually within 60 days) with applicant name matching primary ID or approved household linkage.',
        redFlags: 'Address text appears patched, utility issuer looks fake, or address conflicts with other submitted records.'
      },
      birthCertificate: {
        acceptable: 'Registrar seal/number present, full legal name and DOB are clear, and document condition suggests authentic issuance.',
        redFlags: 'Missing registrar details, unusual paper texture/print quality, or date fields with inconsistent typography.'
      },
      socialSecurityCard: {
        acceptable: 'Name and number are readable, no visible tampering, and number format aligns with federal card standards.',
        redFlags: 'Misaligned type, smeared printing, suspicious font spacing, or signs that the number area was replaced.'
      },
      parentalConsent: {
        acceptable: 'Guardian identity is verified, signatures are complete, and date is current with supporting guardian documentation.',
        redFlags: 'Signature style mismatch, missing guardian identifiers, or consent date preceding key case events by implausible margins.'
      },
      titleDocument: {
        acceptable: 'VIN, owner name, and title number match records; endorsement fields are complete when transfer is requested.',
        redFlags: 'VIN character substitutions, erasure around owner fields, missing transfer blocks, or non-standard title formatting.'
      },
      insuranceProof: {
        acceptable: 'Policy is active on review date, VIN or vehicle descriptors match, and insurer details are verifiable.',
        redFlags: 'Policy dates overlap incorrectly, insurer contact details are invalid, or coverage class does not match vehicle use.'
      },
      billOfSale: {
        acceptable: 'Buyer/seller names, transaction date, sale amount, and vehicle identifiers are complete and consistent.',
        redFlags: 'Conflicting sale dates, missing signatures, overwritten sale amount, or seller information that cannot be corroborated.'
      },
      registrationCard: {
        acceptable: 'Plate, VIN, registered owner, and expiration status align with system records for the active vehicle.',
        redFlags: 'Plate and VIN mismatch, altered expiration field, or registration class inconsistent with request type.'
      },
      odometerDisclosure: {
        acceptable: 'Mileage reading is plausible, disclosure date is current, and both transfer parties acknowledged the statement.',
        redFlags: 'Mileage roll-back patterns, impossible mileage jumps, or unsigned disclosure language on transfer requests.'
      },
      courtOrder: {
        acceptable: 'Court name/case number present, judge or clerk authorization visible, and effective date is enforceable.',
        redFlags: 'Missing docket reference, unofficial stamp style, or legal wording that does not match order type.'
      },
      ticketCitation: {
        acceptable: 'Citation number, officer ID, and violation date/location are present and traceable to department systems.',
        redFlags: 'Citation ID not found, penalty amount altered, or officer/precinct details inconsistent with citation template.'
      },
      evidencePhotos: {
        acceptable: 'Images are relevant to cited violation, timestamps are plausible, and sequence supports applicant narrative.',
        redFlags: 'Metadata gaps, obvious digital manipulation artifacts, or photos unrelated to location/vehicle in case file.'
      },
      vehicleRegistration: {
        acceptable: 'Registration is active for the listed vehicle and matches applicant or authorized representative details.',
        redFlags: 'Inactive registration presented as current, owner mismatch without authorization, or altered class/plate fields.'
      },
      parkingPermit: {
        acceptable: 'Permit ID is valid, zone designation matches requested area, and expiration has not passed.',
        redFlags: 'Permit zone overwritten, duplicate permit ID usage, or anti-counterfeit markings absent from permit face.'
      },
      releaseForm: {
        acceptable: 'Release authorization references correct impound case, includes signatures, and confirms fee/payment prerequisites.',
        redFlags: 'Case number mismatch, unauthorized signer, or release approval line appears copied from another form.'
      },
      policeReport: {
        acceptable: 'Report/case number is valid, incident summary matches claim context, and issuing officer details are complete.',
        redFlags: 'Missing case metadata, narrative conflicts with request facts, or agency insignia appears unofficial.'
      },
      proofOfOwnership: {
        acceptable: 'Ownership chain supports applicant claim through title, bill of sale, receipts, or adjudicated transfer records.',
        redFlags: 'Ownership gap with no supporting transfer, conflicting owner names, or fabricated-looking supporting receipts.'
      }
    };

    return policyProfiles[docType] || defaultProfile;
  }

  renderDocumentStandardsTable(docTypes, _options = {}) {
    const toSentenceCase = (value) => {
      const text = String(value || '').trim();
      if (!text) return '';

      const acronyms = new Set(['VIN', 'ID', 'DOB', 'SSN', 'DMV', 'URL']);
      const lower = text.toLowerCase();
      const normalized = `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;

      return normalized.replace(/\b(vin|id|dob|ssn|dmv|url)\b/gi, (match) => {
        const upper = match.toUpperCase();
        return acronyms.has(upper) ? upper : match;
      });
    };

    const toBulletItems = (text) => {
      const value = String(text || '').trim().replace(/\.$/, '');
      if (!value) return ['No guidance listed.'];

      const parts = value
        .split(/,\s+/)
        .map((item) => item.trim())
        .filter(Boolean);

      const source = parts.length ? parts : [value];
      return source.map((item) => {
        const stripped = String(item || '').trim().replace(/^(and|or)\s+/i, '');
        return toSentenceCase(stripped);
      });
    };

    const renderBulletList = (items, type) => `<ul class="manual-cell-list ${type}">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

    const uniqueDocTypes = [...new Set(docTypes)];
    const rows = uniqueDocTypes.map((docType) => {
      const docName = this.game.caseGenerator.formatDocName(docType);
      const policy = this.getDocumentPolicyProfile(docType);
      const acceptableItems = toBulletItems(policy.acceptable);
      const redFlagItems = toBulletItems(policy.redFlags);
      return `
        <tr>
          <td>${docName}</td>
          <td>${renderBulletList(acceptableItems, 'acceptable')}</td>
          <td>${renderBulletList(redFlagItems, 'red-flags')}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="manual-table-wrap">
        <table class="manual-table doc-standards-table">
          <thead>
            <tr><th>Document</th><th>Acceptable Criteria</th><th>Fraud / Red Flag Indicators</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  orderRequestEntries(dept, requestEntries) {
    if (!Array.isArray(requestEntries)) return [];

    const dmvOrder = [
      'NewLicense',
      'LicenseRenewal',
      'DuplicateLicense',
      'AddressChange',
      'NameChange',
      'VehicleRegistration',
      'TitleTransfer',
      'PlateRenewal',
      'TicketPayment',
      'TicketAppeal',
      'PermitApplication',
      'PermitRenewal'
    ];

    const impoundOrder = [
      'VehicleRelease',
      'PropertyClaim',
      'AuctionInquiry'
    ];

    const permitsOrder = [
      'BuildingPermit',
      'BusinessLicense',
      'NoiseVariance',
      'CodeComplianceInspection'
    ];

    const orderByDept = {
      DMV: dmvOrder,
      Impound: impoundOrder,
      BuildingPermits: permitsOrder
    };

    const preferredOrder = orderByDept[dept] || [];
    if (!preferredOrder.length) return requestEntries;

    const rank = new Map(preferredOrder.map((type, index) => [type, index]));
    return [...requestEntries].sort(([a], [b]) => {
      const aRank = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });
  }

  getHandbookPages(caseRecord) {
    const dept = this.game.player.department;
    const deptConfig = this.game.catalogs.departments[dept];
    const requestTypeLabel = this.game.caseGenerator.formatRequestType(caseRecord.requestType);
    const issueDate = this.getCurrentDateLabel();
    const allowedRequests = new Set(
      this.game.getAllowedRequestTypesForDepartment?.(dept)
      || Object.keys(deptConfig.requiredDocsByRequest)
    );
    const requestEntries = this.orderRequestEntries(
      dept,
      Object.entries(deptConfig.requiredDocsByRequest).filter(([requestType]) => allowedRequests.has(requestType))
    );
    const pages = [
      {
        title: 'General Policy',
        tabLabel: 'General Policy',
        body: `
          <div class="handbook-gov-sheet">
            <p class="gov-kicker">${deptConfig.name} - Counter Operations Manual</p>
            <h4>General Processing Policy</h4>
            <div class="gov-meta-row"><span>Effective Date: ${issueDate}</span><span>Current Queue Request: ${requestTypeLabel}</span></div>
            <h5>Standard review sequence</h5>
            <ol class="manual-process-list">
              <li>Confirm request type and associated fee schedule.</li>
              <li>Verify all required documents are present and legible.</li>
              <li>Validate dates, identifiers, and record consistency.</li>
              <li>Check active conditions and enforcement flags.</li>
              <li>Finalize disposition using the correct reason code.</li>
            </ol>
          </div>`
      },
      {
        title: 'Disposition Standards',
        body: `
          <div class="handbook-gov-sheet">
            <p class="gov-kicker">Clerk Decision Matrix</p>
            <h4>Disposition Standards</h4>
            <div class="manual-table-wrap">
              <table class="manual-table">
                <thead><tr><th>Decision</th><th>Use When</th><th>Required Code</th></tr></thead>
                <tbody>
                  <tr><td>Approve</td><td>All required documents are valid and no blocking conditions exist.</td><td>AllDocumentsValid</td></tr>
                  <tr><td>Deny</td><td>Missing/expired/failed verification or blocking legal condition (including unpaid violations and wrong submitted form).</td><td>MissingDocument, ExpiredDocument, FailedVerification, WrongForm, OutstandingViolations, SuspendedLicense, InsuranceLapse, FraudSuspected, ImpoundHold</td></tr>
                  <tr><td>Escalate</td><td>Policy exception, supervisor-only matter, or unresolved dispute.</td><td>SupervisorRequired, PolicyException, CustomerEscalation</td></tr>
                </tbody>
              </table>
            </div>
          </div>`
      }
    ];

    requestEntries.forEach(([type, docs]) => {
      const requestName = this.game.caseGenerator.formatRequestType(type);
      const docsList = docs.map((docType) => this.game.caseGenerator.formatDocName(docType)).join(', ');

      pages.push(
        {
          title: requestName,
          tabLabel: requestName,
          body: `
            <div class="handbook-gov-sheet">
              <p class="gov-kicker">Request Specification</p>
              <h4>${requestName}</h4>
              <div class="manual-table-wrap">
                <table class="manual-table">
                  <thead><tr><th>Request Type</th><th>Required Documents</th><th>Fee</th></tr></thead>
                  <tbody><tr><td>${requestName}</td><td>${docsList || 'No documents required'}</td><td>$${deptConfig.fees[type] ?? 0}</td></tr></tbody>
                </table>
              </div>
              <h5>Clerk handling notes</h5>
              <ul>
                <li>Reject processing when any required item is absent.</li>
                <li>Use failed verification when identifiers conflict.</li>
                <li>Escalate if request falls outside standard policy.</li>
              </ul>
            </div>`
        },
        {
          title: `${requestName} Standards`,
          body: `
            <div class="handbook-gov-sheet">
              <p class="gov-kicker">Document Verification Appendix</p>
              <h4>${requestName} - Acceptable Standards</h4>
              ${this.renderDocumentStandardsTable(docs, { compact: true })}
            </div>`
        }
      );
    });

    pages.push(
      {
        title: 'Valid License Reference',
        tabLabel: 'Good License',
        body: `
          <div class="handbook-gov-sheet">
            <p class="gov-kicker">Reference Card</p>
            <h4>What a Valid Driver License Should Look Like</h4>
            <div class="manual-license-reference">
              <p class="manual-reference-note">Use this sample as your baseline when checking license authenticity.</p>
              <div class="manual-license-card" aria-label="Reference sample of a valid driver's license">
                <div class="manual-license-head">
                  <span>STATE OF RED TAPE</span>
                  <span>CLASS C</span>
                </div>
                <div class="manual-license-title-row">
                  <strong>DRIVER LICENSE</strong>
                  <span>DL526471</span>
                </div>
                <div class="manual-license-grid">
                  <div class="manual-license-photo" aria-hidden="true"></div>
                  <div class="manual-license-fields">
                    <div><span>NAME</span><strong>Zoe Lee</strong></div>
                    <div><span>DOB</span><strong>4/20/1993</strong></div>
                    <div><span>ADDRESS</span><strong>612 Lakeview Terrace</strong></div>
                    <div class="split"><span><span>SEX</span><strong>X</strong></span><span><span>EYES</span><strong>Blue</strong></span></div>
                    <div class="split"><span><span>HAIR</span><strong>Red</strong></span><span><span>DONOR</span><strong>No</strong></span></div>
                    <div class="split"><span><span>HGT</span><strong>5'01&quot;</strong></span><span><span>WGT</span><strong>230 lb</strong></span></div>
                    <div><span>SSN</span><strong>477-20-M309</strong></div>
                    <div class="split"><span><span>RSTR</span><strong>None</strong></span><span><span>ERTC</span><strong>E062-R069-T120</strong></span></div>
                    <div class="split"><span><span>ISS</span><strong>STATE DMV</strong></span><span><span>EXP</span><strong>Jan 14, 2032</strong></span></div>
                  </div>
                </div>
                <div class="manual-license-foot">
                  <span>SIGNATURE: Zoe Lee</span>
                  <span>||| |||| ||| || |||| |||</span>
                </div>
              </div>
              <ul class="manual-license-checklist">
                <li>Header text and labels are crisp and correctly spelled.</li>
                <li>Photo corners sit flat with no peeling or glue residue.</li>
                <li>Physical descriptors (hair/eyes) match database lookup.</li>
                <li>Watermark/seal are visible and consistent with template quality.</li>
              </ul>
            </div>
          </div>`
      },
      {
        title: 'Fraud Indicators',
        tabLabel: 'Fraud',
        body: `
          <div class="handbook-gov-sheet">
            <p class="gov-kicker">Fraud Detection Bulletin</p>
            <h4>High-Risk Indicators</h4>
            <ul>
              <li>Identity fields conflict across documents.</li>
              <li>Fonts, seals, or barcode zones differ from approved templates.</li>
              <li>Date timeline is inconsistent with filing history.</li>
              <li>Smudged or overwritten fields that conflict with terminal lookup records.</li>
              <li>VIN, plate, permit, or citation cannot be reconciled to records.</li>
            </ul>
          </div>`
      },
      {
        title: 'Fraud Response',
        body: `
          <div class="handbook-gov-sheet">
            <p class="gov-kicker">Enforcement Workflow</p>
            <h4>Fraud Response Protocol</h4>
            <ol class="manual-process-list">
              <li>Pause action and re-verify identifiers in all submitted records.</li>
              <li>Check current enforcement flags and blocking conditions.</li>
              <li>Deny when authenticity is not verifiable.</li>
              <li>Escalate when supervisor review is required by policy.</li>
              <li>Log concise notes to preserve audit traceability.</li>
            </ol>
          </div>`
      }
    );

    return pages;
  }

  renderHandbookTabs() {
    if (!this.elements.handbookTabs) return;
    const activeSpreadStart = Math.floor(this.handbookPageIndex / 2) * 2;
    const tabPages = this.handbookPages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => Boolean(page.tabLabel));

    this.elements.handbookTabs.innerHTML = tabPages.map(({ page, index }) => {
      const spreadStart = Math.floor(index / 2) * 2;
      const activeClass = spreadStart === activeSpreadStart ? ' active' : '';
      return `<button type="button" class="handbook-tab${activeClass}" data-page-index="${spreadStart}">${page.tabLabel}</button>`;
    }).join('');
  }

  renderHandbookPage() {
    if (!this.elements.handbookContent) return;
    if (!this.handbookPages.length) {
      this.elements.handbookContent.innerHTML = '<p>No handbook pages available.</p>';
      return;
    }

    // Keep spreads stable: each tab belongs to a fixed two-page spread pair.
    const spreadStart = Math.floor(this.handbookPageIndex / 2) * 2;
    const leftPage = this.handbookPages[spreadStart] || null;
    const rightPage = this.handbookPages[spreadStart + 1] || null;

    const leftPageMarkup = leftPage 
      ? `<div class="handbook-page spread-left" data-page-title="${leftPage.title || ''}">${leftPage.body}</div>`
      : '<div class="handbook-page spread-left handbook-page-empty"></div>';

    const rightPageMarkup = rightPage
      ? `<div class="handbook-page spread-right" data-page-title="${rightPage.title || ''}">${rightPage.body}</div>`
      : '<div class="handbook-page spread-right handbook-page-empty"></div>';

    this.elements.handbookContent.innerHTML = `
      <div class="handbook-spread">
        ${leftPageMarkup}
        ${rightPageMarkup}
      </div>
    `;
    this.renderHandbookTabs();
  }

  handleStateChange(data) {
    this.hideAllScreens();
    this.applyVisualSettings();

    const gameplayStates = new Set(['shift_start', 'serving', 'doc_request', 'parking_fine_payment', 'dmv_vision_test', 'result', 'bribe', 'review']);
    if (gameplayStates.has(data.state)) {
      this.lastGameplayStateSnapshot = {
        state: data.state,
        data
      };
    }

    switch (data.state) {
      case 'menu':
        this.menuView = 'main';
        this.showMenu();
        break;
      case 'shift_start':
        this.showShiftStart(data);
        break;
      case 'serving':
        this.showServing(data);
        break;
      case 'doc_request':
        this.showDocRequestDecision(data);
        break;
      case 'parking_fine_payment':
        this.showParkingFinePayment(data);
        break;
      case 'dmv_vision_test':
        this.showDMVVisionTest(data);
        break;
      case 'result':
        this.showResult(data);
        break;
      case 'bribe':
        this.showBribe(data);
        break;
      case 'review':
        this.showReview(data);
        break;
    }
  }

  handleEvent(event, data) {
    if (event === 'event' && data?.type === 'settingsChanged') {
      this.applyVisualSettings();
      return;
    }

    if (event === 'event' && data?.type === 'saveLoaded') {
      this.applyVisualSettings();
      this.showNotification('Save loaded. Returning to main menu.', 'success');
      return;
    }

    if (event === 'chaos' || (data && data.type === 'chaos')) {
      const events = data.events || [];
      for (const evt of events) {
        this.showEventBanner(evt);
      }
      return;
    }

    if (event === 'event' && data?.type === 'serviceTick') {
      if (data.queueStatus) this.updateHUD(data.queueStatus);
      this.refreshDeskTerminalContext({
        queueStatus: data.queueStatus,
        waitRemaining: data.waitRemaining,
        waitTotal: data.waitTotal,
        patiencePercent: data.patiencePercent
      });
      return;
    }

    if (event === 'event' && data?.type === 'docRequestOutcome') {
      if (data.outcome === 'return_queue') {
        const note = data.required ? '' : ' (even though it was not required)';
        this.showNotification(`${data.npcName} went to the back of the line to fetch ${data.docName}${note}.`, 'warning');
      } else if (data.outcome === 'refuse_leave') {
        const reason = data.required ? '' : ' because the request was unnecessary';
        this.showNotification(`${data.npcName} refused to provide ${data.docName}${reason} and left the window.`, 'error');
      } else if (data.outcome === 'refuse_escalate') {
        const reason = data.required ? '' : ' and complained that the request was unnecessary';
        this.showNotification(`${data.npcName} refused to provide ${data.docName}${reason} and demanded a manager.`, 'error');
      }
      return;
    }

    if (event === 'event' && data?.type === 'patienceWarning') {
      this.refreshDeskTerminalContext();
      this.showNotification(data.message || 'Customer is losing patience.', 'warning');
      return;
    }

    if (event === 'event' && data?.type === 'finePaymentImpatience') {
      this.showNotification(data.message || 'Customer is getting impatient.', 'warning');
      return;
    }

    if (event === 'event' && data?.type === 'visionTestTimerExpired') {
      this.showNotification(data.message || 'Vision test timer expired.', 'warning');
      return;
    }

    if (event === 'event' && data?.type === 'receiptPrinter') {
      this.playReceiptPrinterSound();
      this.showNotification('Receipt printed.', 'success');
      return;
    }

    if (event === 'event' && data?.type === 'shiftOverGrace') {
      this.refreshDeskTerminalContext();
      this.showNotification(data.message || 'Shift time is over. Finish the current customer to end the shift.', 'warning');
    }
  }

  hideAllScreens() {
    const screens = ['loadingScreen', 'menuScreen', 'gameScreen', 'shiftStartScreen', 'reviewScreen'];
    for (const screen of screens) {
      if (this.elements[screen]) {
        this.elements[screen].classList.add('hidden');
      }
    }
  }

  showMenu() {
    this.elements.menuScreen.classList.remove('hidden');
    const continueSlot = this.game.activeSaveSlot || this.game.getMostRecentSaveSlot?.() || null;
    const continueSummary = continueSlot ? this.game.getSaveSlotSummary?.(continueSlot) : null;
    const canResumePausedSession = Boolean(this.pausedGameplaySnapshot);
    const hasContinueData = canResumePausedSession || Boolean(continueSlot && continueSummary && !continueSummary.isEmpty);
    if (this.elements.menuContinueBtn) {
      this.elements.menuContinueBtn.disabled = !hasContinueData;
      this.elements.menuContinueBtn.textContent = canResumePausedSession
        ? 'Continue (Resume Current Session)'
        : hasContinueData
          ? `Continue (Slot ${continueSlot})`
          : 'Continue';
      this.elements.menuContinueBtn.title = canResumePausedSession
        ? 'Resume exactly where you left off before opening the menu.'
        : hasContinueData
          ? `${continueSummary.careerName} | ${continueSummary.rankTitle || 'Clerk Trainee'} | Week ${Math.max(1, Number(continueSummary.weekNumber || 0))}`
          : '';
    }
    this.renderMenuPanel();
  }

  renderMenuPanel() {
    const panel = this.elements.menuPanel;
    const menuContainer = this.elements.menuContainer;
    if (!panel) return;

    if (this.menuView === 'main') {
      menuContainer?.classList.remove('menu-panel-active');
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    menuContainer?.classList.add('menu-panel-active');
    panel.classList.remove('hidden');

    if (this.menuView !== 'load') {
      this.pendingDeleteSlot = null;
    }

    switch (this.menuView) {
      case 'load':
        panel.innerHTML = this.renderSaveSlotPanel();
        break;
      case 'new':
        panel.innerHTML = this.renderNewCareerPanel();
        break;
      case 'settings':
        panel.innerHTML = this.renderSettingsPanel();
        break;
      case 'credits':
        panel.innerHTML = this.renderCreditsPanel();
        break;
      case 'exit_confirm':
        panel.innerHTML = this.renderExitConfirmPanel();
        break;
      default:
        this.menuView = 'main';
        panel.classList.add('hidden');
        panel.innerHTML = '';
        break;
    }
  }

  renderSaveSlotPanel() {
    const slots = this.game.getSaveSlots?.() || [];
    const rows = slots.map((slot) => {
      const status = slot.isEmpty
        ? '<span class="menu-note">Empty Slot</span>'
        : `
          <div class="menu-slot-meta">
            <span>Career: ${slot.careerName}</span>
            <span>Rank: ${slot.rankTitle || 'Clerk Trainee'}</span>
            <span>Week: ${Math.max(1, Number(slot.weekNumber || 0))}</span>
            <span>Shift: ${Math.max(1, Number(slot.shiftNumber || 0))}</span>
            <span>Difficulty: ${this.getCareerDifficultyLabel(slot.difficulty)}</span>
            <span>Last Played: ${this.formatSaveDate(slot.lastPlayedAt)}</span>
          </div>
        `;

      const isPendingDelete = this.pendingDeleteSlot === slot.slot;
      const actionHtml = isPendingDelete
        ? `
          <div class="menu-delete-confirm">
            <p class="menu-note menu-delete-confirm-text">Delete Slot ${slot.slot}? This cannot be undone.</p>
            <div class="menu-action-row">
              <button type="button" class="btn btn-sm btn-danger" data-menu-action="confirm-delete-slot" data-slot="${slot.slot}">Confirm Delete</button>
              <button type="button" class="btn btn-sm" data-menu-action="cancel-delete-slot" data-slot="${slot.slot}">Cancel</button>
            </div>
          </div>
        `
        : `
          <div class="menu-action-row">
            <button type="button" class="btn btn-sm btn-primary" data-menu-action="load-slot" data-slot="${slot.slot}" ${slot.isEmpty ? 'disabled' : ''}>Load</button>
            <button type="button" class="btn btn-sm btn-danger" data-menu-action="delete-slot" data-slot="${slot.slot}" ${slot.isEmpty ? 'disabled' : ''}>Delete</button>
          </div>
        `;

      return `
        <div class="menu-slot-row menu-slot-choice">
          <div class="menu-slot-header">
            <strong>Slot ${slot.slot}</strong>
          </div>
          ${status}
          ${actionHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="menu-section menu-new-game-layout">
        <h4>Load Game</h4>
        <div class="menu-slot-list menu-slot-list-select">${rows}</div>
        <div class="menu-action-row menu-new-game-footer-actions">
          <button type="button" class="btn btn-sm" data-menu-action="back">Back</button>
        </div>
      </div>
    `;
  }

  renderNewCareerPanel() {
    const slots = this.game.getSaveSlots?.() || [];
    const availableSlots = slots.map((slot) => slot.slot);
    const defaultSlot = this.getDefaultNewCareerSlot();

    if (this.selectedNewCareerSlot === null && defaultSlot) {
      this.selectedNewCareerSlot = defaultSlot;
    }

    if (!availableSlots.includes(this.selectedNewCareerSlot)) {
      this.selectedNewCareerSlot = defaultSlot;
    }

    const slotRows = slots.map((slot) => {
      const isSelected = this.selectedNewCareerSlot === slot.slot;
      const slotState = slot.isEmpty
        ? '<span class="menu-note menu-slot-state">Empty Slot</span>'
        : '<span class="menu-note menu-slot-state menu-slot-state-warning">Existing save will be overwritten</span>';

      const slotMeta = slot.isEmpty
        ? ''
        : `
          <div class="menu-slot-meta">
            <span>Career: ${slot.careerName}</span>
            <span>Rank: ${slot.rankTitle || 'Clerk Trainee'}</span>
            <span>Week: ${Math.max(1, Number(slot.weekNumber || 0))}</span>
            <span>Shift: ${Math.max(1, Number(slot.shiftNumber || 0))}</span>
            <span>Difficulty: ${this.getCareerDifficultyLabel(slot.difficulty)}</span>
            <span>Last Played: ${this.formatSaveDate(slot.lastPlayedAt)}</span>
          </div>
        `;

      const slotEditor = isSelected
        ? `
          <div class="menu-slot-editor">
            <div class="menu-slot-editor-grid">
              <label class="menu-select menu-field-block menu-slot-field-compact">
                <span>Career Name</span>
                <input id="new-career-name" class="menu-text-input" type="text" maxlength="40" value="New Clerk">
              </label>
              <label class="menu-select menu-field-block menu-slot-field-compact">
                <span>Difficulty</span>
                <select id="new-career-difficulty">
                  <option value="easy">Small Town Government</option>
                  <option value="medium" selected>County Seat</option>
                  <option value="hard">State Capital</option>
                  <option value="nightmare">DOGE Is Watching</option>
                </select>
              </label>
            </div>
            <div class="menu-action-row menu-slot-inline-actions">
              <button type="button" class="btn btn-sm btn-primary" data-menu-action="start-career-slot" data-slot="${slot.slot}">Start Career</button>
            </div>
          </div>
        `
        : `
          <div class="menu-action-row menu-slot-inline-actions">
            <button type="button" class="btn btn-sm" data-menu-action="select-new-career-slot" data-slot="${slot.slot}">Select Slot ${slot.slot}</button>
          </div>
        `;

      return `
        <div class="menu-slot-row menu-slot-choice ${isSelected ? 'menu-slot-selected' : ''}">
          <div class="menu-slot-choice-header">
            <strong>Slot ${slot.slot}</strong>
            ${isSelected ? '<span class="menu-note menu-slot-selected-tag">Selected</span>' : ''}
          </div>
          ${slotState}
          ${slotMeta}
          ${slotEditor}
        </div>
      `;
    }).join('');

    return `
      <div class="menu-section menu-new-game-layout">
        <h4>New Game Setup</h4>
        ${this.selectedNewCareerSlot ? '' : '<p class="menu-note">All slots are currently occupied. Select a slot to overwrite.</p>'}
        <div class="menu-slot-list menu-slot-list-select">${slotRows}</div>
        <div class="menu-action-row menu-new-game-footer-actions">
          <button type="button" class="btn btn-sm" data-menu-action="back">Back</button>
        </div>
      </div>
    `;
  }

  renderSettingsPanel() {
    const settings = this.game.getSettings?.() || {};

    return `
      <div class="menu-section">
        <h4>Settings</h4>

        <div class="menu-subsection">
          <h5>Audio</h5>
          ${this.renderRangeSetting('Master Volume', 'masterVolume', settings.masterVolume ?? 100)}
          ${this.renderRangeSetting('Music Volume', 'musicVolume', settings.musicVolume ?? 80)}
          ${this.renderRangeSetting('SFX Volume', 'sfxVolume', settings.sfxVolume ?? 80)}
        </div>

        <div class="menu-subsection">
          <h5>Display</h5>
          ${this.renderToggleSetting('Fullscreen', 'fullscreen', Boolean(settings.fullscreen))}
          ${this.renderRangeSetting('UI Scale', 'uiScale', settings.uiScale ?? 100, '%')}
          ${this.renderRangeSetting('Text Size', 'textSize', settings.textSize ?? 100, '%')}
        </div>

        <div class="menu-subsection">
          <h5>Gameplay</h5>
          ${this.renderToggleSetting('Confirm Before Quitting', 'confirmBeforeQuitting', settings.confirmBeforeQuitting !== false)}
          ${this.renderToggleSetting('Autosave', 'autoSave', settings.autoSave !== false)}
          ${this.renderToggleSetting('Tooltips', 'tooltips', settings.tooltips !== false)}
        </div>

        <div class="menu-subsection">
          <h5>Developer</h5>
          ${this.renderToggleSetting('Developer Mode', 'developerMode', Boolean(settings.developerMode))}
        </div>

        <div class="menu-action-row">
          <button type="button" class="btn btn-sm" data-menu-action="back">Back</button>
        </div>
      </div>
    `;
  }

  renderCreditsPanel() {
    return `
      <div class="menu-section menu-credits-section">
        <h4>Credits</h4>
        <div class="menu-credits-copy">
          <p class="menu-note"><strong>Red Tape Simulator</strong></p>
          <p class="menu-note">An interactive tribute to fluorescent lighting, queue numbers, and the sacred power of Form 27-B.</p>
          <p class="menu-note">Design and development by public servants of the imaginary Department of Administrative Momentum.</p>
          <p class="menu-note">Special thanks to:</p>
          <p class="menu-note">- The Committee for Reviewing Last Week's Committee Notes</p>
          <p class="menu-note">- The Office of Mandatory Optional Signatures</p>
          <p class="menu-note">- The Task Force on Stapler Alignment and Desk Geometry</p>
          <p class="menu-note">Built with vanilla JavaScript, paper-grade persistence, and policies revised moments before your shift.</p>
          <p class="menu-note">No citizens were harmed during processing, though several did experience moderate waiting-room fatigue.</p>
          <p class="menu-note">Remember: the line is always longest at whichever window you choose.</p>
        </div>
        <div class="menu-action-row menu-credits-actions">
          <button type="button" class="btn btn-sm" data-menu-action="back">Back</button>
        </div>
      </div>
    `;
  }

  renderExitConfirmPanel() {
    return `
      <div class="menu-section">
        <h4>Exit</h4>
        <p class="menu-note">Return to the title screen?</p>
        <div class="menu-action-row menu-exit-confirm-actions">
          <button type="button" class="btn btn-sm btn-danger" data-menu-action="confirm-exit">Exit</button>
          <button type="button" class="btn btn-sm" data-menu-action="cancel-exit">Cancel</button>
        </div>
      </div>
    `;
  }

  renderToggleSetting(label, key, enabled) {
    return `
      <label class="menu-checkbox">
        <input type="checkbox" data-setting-key="${key}" ${enabled ? 'checked' : ''}>
        <span>${label}</span>
      </label>
    `;
  }

  renderRangeSetting(label, key, value, suffix = '') {
    const min = key === 'uiScale' || key === 'textSize' ? 80 : 0;
    const max = key === 'uiScale' || key === 'textSize' ? 140 : 100;
    const fallback = key === 'uiScale' || key === 'textSize' ? 100 : 0;
    const numericValue = Math.max(min, Math.min(max, Number(value) || fallback));
    return `
      <label class="menu-select menu-field-block">
        <span>${label} <strong>${numericValue}${suffix}</strong></span>
        <input type="range" min="${min}" max="${max}" data-setting-key="${key}" value="${numericValue}">
      </label>
    `;
  }

  formatSaveDate(value) {
    if (!value) return 'Never';
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return 'Unknown';
    return new Date(parsed).toLocaleString();
  }

  getCareerDifficultyLabel(difficultyId) {
    const map = {
      easy: 'Small Town Government',
      medium: 'County Seat',
      hard: 'State Capital',
      nightmare: 'DOGE Is Watching'
    };
    return map[difficultyId] || 'County Seat';
  }

  mapCareerDifficultyToGame(difficultyId) {
    const map = {
      easy: 'easy',
      medium: 'medium',
      hard: 'hard',
      nightmare: 'nightmare'
    };
    return map[difficultyId] || 'medium';
  }

  getDefaultNewCareerSlot() {
    const slots = this.game.getSaveSlots?.() || [];
    const emptySlot = slots.find((slot) => slot.isEmpty);
    return emptySlot ? emptySlot.slot : null;
  }

  handleContinueFromMenu() {
    if (this.pausedGameplaySnapshot) {
      const snapshot = this.pausedGameplaySnapshot;
      this.pausedGameplaySnapshot = null;
      this.menuView = 'main';
      this.pendingDeleteSlot = null;
      this.selectedNewCareerSlot = null;

      this.game.state = snapshot.state;
      this.handleStateChange(snapshot.data);
      if (snapshot.state === 'serving') {
        this.game.startServiceTicker?.();
      }
      return;
    }

    const continueSlot = this.game.activeSaveSlot || this.game.getMostRecentSaveSlot?.() || null;
    const ok = continueSlot
      ? this.game.loadFromSlot?.(continueSlot, { startGame: true })
      : this.game.loadMostRecentSave?.({ startGame: true });
    if (!ok) {
      this.showNotification('No save data found for Continue.', 'warning');
      this.showMenu();
    }
  }

  handleExitFromMenu() {
    const settings = this.game.getSettings?.() || {};
    if (settings.confirmBeforeQuitting !== false) {
      this.menuView = 'exit_confirm';
      this.renderMenuPanel();
      return;
    }

    this.game.stopServiceTicker?.();
    window.location.reload();
  }

  handleMenuPanelAction(button) {
    const action = button.dataset.menuAction;
    const slot = Number(button.dataset.slot);

    if (action === 'back') {
      this.menuView = 'main';
      this.showMenu();
      return;
    }

    if (action === 'cancel-exit') {
      this.menuView = 'main';
      this.showMenu();
      return;
    }

    if (action === 'confirm-exit') {
      this.game.stopServiceTicker?.();
      window.location.reload();
      return;
    }

    if (action === 'load-slot') {
      this.pendingDeleteSlot = null;
      this.pausedGameplaySnapshot = null;
      const ok = this.game.loadFromSlot?.(slot, { startGame: true });
      if (!ok) {
        this.showNotification(`Unable to load Slot ${slot}.`, 'error');
      }
      return;
    }

    if (action === 'delete-slot') {
      this.pendingDeleteSlot = slot;
      this.renderMenuPanel();
      return;
    }

    if (action === 'select-new-career-slot') {
      this.selectedNewCareerSlot = Number(slot || 1);
      this.renderMenuPanel();
      return;
    }

    if (action === 'cancel-delete-slot') {
      this.pendingDeleteSlot = null;
      this.renderMenuPanel();
      return;
    }

    if (action === 'confirm-delete-slot') {
      const ok = this.game.deleteSaveSlot?.(slot);
      this.pendingDeleteSlot = null;
      this.showNotification(ok ? `Slot ${slot} deleted.` : `Failed to delete Slot ${slot}.`, ok ? 'success' : 'error');
      this.showMenu();
      return;
    }

    if (action === 'start-career-slot') {
      const nameInput = this.elements.menuPanel?.querySelector('#new-career-name');
      const difficultyInput = this.elements.menuPanel?.querySelector('#new-career-difficulty');
      const selectedSlot = Number(slot || 1);
      const careerName = String(nameInput?.value || 'New Clerk').trim() || 'New Clerk';
      const difficulty = this.mapCareerDifficultyToGame(difficultyInput?.value || 'medium');

      const ok = this.game.startNewCareer?.({
        slotIndex: selectedSlot,
        careerName,
        difficulty
      });
      if (!ok) {
        this.showNotification('Unable to start a new career with the selected options.', 'error');
        return;
      }

      this.pausedGameplaySnapshot = null;

      // New careers should jump straight into active play.
      this.game.nextCustomer?.();
    }
  }

  handleMenuPanelChange(target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const key = target.dataset.settingKey;
    if (!key) return;

    const isToggle = target instanceof HTMLInputElement && target.type === 'checkbox';
    const settingValue = isToggle ? target.checked : target.value;
    const ok = this.game.setSetting?.(key, settingValue);
    if (!ok) return;

    if (key === 'developerMode') {
      const enabled = Boolean(settingValue);
      this.game.setDevelopmentMode?.(enabled);
      this.setDevControlsVisibility(enabled, { persist: true, notify: true });
    }

    if (key === 'fullscreen') {
      this.applyFullscreenSetting(Boolean(settingValue));
    }

    this.applyVisualSettings();
    this.renderMenuPanel();
  }

  applyFullscreenSetting(enabled) {
    if (enabled) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      return;
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  showShiftStart(data) {
    this.elements.shiftStartScreen.classList.remove('hidden');
    const unlockedDepartments = Array.isArray(data.unlockedDepartments)
      ? data.unlockedDepartments
      : [this.game.player.department];
    const showDepartmentSelector = this.game.developmentMode && unlockedDepartments.length > 1;
    const nightmareMemo = data?.nightmareModifiers?.memo ? `<p><strong>Memo:</strong> ${data.nightmareModifiers.memo}</p>` : '';
    const moraleLine = data?.morale
      ? `<p><strong>Morale:</strong> ${data.morale.value}% (${data.morale.band})</p><p class="menu-note">${data.morale.commentary}</p>`
      : '';
    const departmentOptions = unlockedDepartments
      .map((deptId) => {
        const deptName = this.game.catalogs?.departments?.[deptId]?.name || deptId;
        const isSelected = deptId === this.game.player.department ? ' selected' : '';
        return `<option value="${deptId}"${isSelected}>${deptName}</option>`;
      })
      .join('');

    this.elements.shiftStartContent.innerHTML = `
      <div class="shift-briefing">
        <h2>Shift #${data.shiftNumber}</h2>
        <div class="briefing-details">
          <p><strong>Department:</strong> ${data.departmentName || data.department || 'Department of Motor Vehicles'}</p>
          <p><strong>Rank:</strong> ${data.rankTitle || data.careerProgression?.rankTitle || 'Clerk'}</p>
          ${showDepartmentSelector
            ? `<label class="shift-department-selector"><strong>Dev Department Select:</strong>
                <select id="shift-department-select">${departmentOptions}</select>
              </label>`
            : ''}
          <p><strong>Difficulty:</strong> ${data.difficultyLabel || this.game.getDifficultyLabel()}</p>
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>Customers in Queue:</strong> ${data.customerCount}</p>
          <p><strong>Supervisor:</strong> ${data.supervisorName}</p>
          <p><strong>Pending Appeals:</strong> ${data.pendingAppeals ?? 0}</p>
          ${nightmareMemo}
          ${moraleLine}
          <p class="supervisor-type">${this.getSupervisorDescription(data.supervisorType)}</p>
        </div>
        <div class="shift-tips">
          <h3>Reminders</h3>
          <ul>
            <li>Check ALL documents before making a decision</li>
            <li>Look for expired dates, name mismatches, and missing papers</li>
            <li>Flags in the system may block certain approvals</li>
            <li>Your accuracy and customer satisfaction both count</li>
          </ul>
        </div>
      </div>
    `;

    const departmentSelect = this.elements.shiftStartContent.querySelector('#shift-department-select');
    if (departmentSelect) {
      departmentSelect.addEventListener('change', (event) => {
        const selectedDept = event.target?.value;
        if (!selectedDept) return;
        const switched = this.game.setDepartment(selectedDept);
        if (!switched) {
          this.showNotification('Unable to switch department.', 'error');
          return;
        }

        const selectedName = this.game.catalogs?.departments?.[selectedDept]?.name || selectedDept;
        this.showNotification(`Department switched to ${selectedName}.`, 'success');
        this.showShiftStart({
          ...data,
          department: selectedDept,
          departmentName: selectedName,
          unlockedDepartments: [...unlockedDepartments]
        });
      });
    }
  }

  getSupervisorDescription(type) {
    const descriptions = {
      byTheBook: 'A strict rule-follower. Accuracy is everything. No tolerance for mistakes.',
      politician: 'Cares most about customer satisfaction and public image.',
      pragmatist: 'A balanced approach. Gets things done efficiently.',
      corrupt: 'Plays fast and loose with the rules. Open to "creative" solutions.'
    };
    return descriptions[type] || '';
  }

  showServing(data) {
    this.currentServingData = data;
    this.elements.gameScreen.classList.remove('hidden');

    // Update HUD
    this.updateHUD(data.queueStatus);

    // Documents presented on desk
    this.renderDocuments(data.documents, data.caseRecord, data.issues, data.activeChaosEvents || []);
    this.renderCustomerAcrossDesk(data);

    // Right pane: employee manual + conditions
    this.renderFlags(data.conditions, data.npc.flags, data.issues || []);

    // Decision panel
    this.renderDecisionPanel(data);

    // Hide overlays
    this.hideOverlay();
    this.hideBribeOverlay();
    this.hideDocRequestOverlay();
    this.hideFinePaymentOverlay();
    this.hideDenyReasonOverlay();
  }

  showParkingFinePayment(data) {
    this.elements.gameScreen.classList.remove('hidden');

    if (data.queueStatus) {
      this.updateHUD(data.queueStatus);
    }

    if (this.elements.finePaymentContent) {
      this.elements.finePaymentContent.innerHTML = renderParkingFinePayment(data.paymentState || {});
    }

    this.elements.finePaymentOverlay?.classList.remove('hidden');
    this.hideOverlay();
    this.hideBribeOverlay();
    this.hideDocRequestOverlay();
    this.hideDenyReasonOverlay();
  }

  showDMVVisionTest(data) {
    this.elements.gameScreen.classList.remove('hidden');

    if (data.queueStatus) {
      this.updateHUD(data.queueStatus);
    }

    if (this.elements.finePaymentContent) {
      this.elements.finePaymentContent.innerHTML = renderDMVVisionTest(data.visionState || {});
    }

    this.elements.finePaymentOverlay?.classList.remove('hidden');
    this.hideOverlay();
    this.hideBribeOverlay();
    this.hideDocRequestOverlay();
    this.hideDenyReasonOverlay();
  }

  showDocRequestDecision(data) {
    this.elements.gameScreen.classList.remove('hidden');

    if (data.queueStatus) {
      this.updateHUD(data.queueStatus);
    }

    const decision = data.requestDecision || {};
    const outcome = decision.outcome || 'return_queue';
    const npcName = decision.npcName || data.npc?.fullName || 'Customer';
    const docName = decision.docName || this.game.caseGenerator.formatDocName(decision.docType || 'document');
    const isRequired = Boolean(decision.isRequiredDoc);
    const requestKind = String(decision.requestKind || 'document_request');
    const isFormCorrection = requestKind === 'form_correction';
    const expectedFormLabel = this.game.caseGenerator.formatRequestType(decision.expectedForm || data.caseRecord?.requestType || 'Request');
    const submittedFormLabel = decision.submittedForm
      ? this.game.caseGenerator.formatRequestType(decision.submittedForm)
      : expectedFormLabel;

    const outcomeMeta = {
      return_queue: {
        title: 'Document Request Accepted',
        body: `${npcName} will go to records and return with ${docName}.`,
        actions: [
          { action: 'send_to_back', label: 'Send To Back Of Line', className: 'btn btn-primary' }
        ]
      },
      offer_bribe: {
        title: 'Bribe Offer During Document Request',
        body: `${npcName} offered $${decision.bribeAmount || 0} to skip ${docName}.`,
        actions: [
          { action: 'accept_bribe', label: 'Accept Bribe', className: 'btn btn-warning' },
          { action: 'decline_bribe', label: 'Decline And Continue Process', className: 'btn btn-success' },
          { action: 'escalate_supervisor', label: 'Escalate To Supervisor', className: 'btn btn-danger' }
        ]
      },
      refuse_leave: {
        title: 'Customer Refused Request',
        body: `${npcName} refused to provide ${docName}${isRequired ? '' : ' because it is not required for this case'}.`,
        actions: isRequired
          ? [
            { action: 'deny_missing_document', label: 'Deny: Missing Required Document', className: 'btn btn-danger' },
            { action: 'escalate_supervisor', label: 'Escalate To Supervisor', className: 'btn btn-warning' }
          ]
          : [
            { action: 'let_leave', label: 'Let Customer Leave', className: 'btn btn-primary' },
            { action: 'escalate_supervisor', label: 'Escalate To Supervisor', className: 'btn btn-danger' }
          ]
      },
      refuse_escalate: {
        title: 'Customer Demanded Supervisor',
        body: `${npcName} refused to provide ${docName} and demanded supervisor intervention.`,
        actions: isRequired
          ? [
            { action: 'deny_missing_document', label: 'Deny: Missing Required Document', className: 'btn btn-danger' },
            { action: 'escalate_supervisor', label: 'Escalate To Supervisor', className: 'btn btn-warning' }
          ]
          : [
            { action: 'escalate_supervisor', label: 'Escalate To Supervisor', className: 'btn btn-danger' }
          ]
      }
    };

    if (isFormCorrection && outcome === 'return_queue') {
      outcomeMeta.return_queue = {
        title: 'Correct Form Requested',
        body: `${npcName} submitted ${submittedFormLabel} but needs ${expectedFormLabel}. Send them to complete the correct form.`,
        actions: [
          { action: 'send_to_back', label: 'Send To Back Of Line', className: 'btn btn-primary' }
        ]
      };
    }

    const meta = outcomeMeta[outcome] || outcomeMeta.return_queue;
    if (this.elements.docRequestContent) {
      this.elements.docRequestContent.innerHTML = `
        <div class="doc-request-card">
          <h3>${meta.title}</h3>
          <p>${meta.body}</p>
          ${this.game.developmentMode
            ? '<div class="dev-report-actions"><button type="button" class="btn btn-sm dev-report-btn" data-dev-report-doc-request="true">Report Logic Issue</button></div>'
            : ''}
        </div>
      `;
    }

    if (this.game.developmentMode && this.elements.docRequestContent) {
      const reportBtn = this.elements.docRequestContent.querySelector('[data-dev-report-doc-request="true"]');
      reportBtn?.addEventListener('click', () => {
        this.reportLogicIssue({
          source: 'doc_request_overlay',
          promptText: 'Describe why this document-request outcome is illogical.',
          extra: {
            decision,
            displayedTitle: meta.title,
            displayedBody: meta.body,
            availableActions: meta.actions.map((entry) => entry.action)
          }
        });
      });
    }

    if (this.elements.docRequestActions) {
      this.elements.docRequestActions.className = `doc-request-actions count-${meta.actions.length}`;
      this.elements.docRequestActions.innerHTML = meta.actions
        .map((entry) => `<button type="button" class="${entry.className} action-${entry.action}" data-action="${entry.action}">${entry.label}</button>`)
        .join('');
    }

    this.elements.docRequestOverlay?.classList.remove('hidden');
    this.hideOverlay();
    this.hideBribeOverlay();
  }

  finalizeDecisionWithStamp(action, reasonCode, options = {}) {
    this.applyVisualStamp(action);
    setTimeout(() => {
      this.game.makeDecision(action, reasonCode, '', null, options);
    }, 220);
  }

  isHardPlusDifficulty() {
    const difficultyId = String(this.game.getDifficultyProfile?.()?.id || this.game.difficulty || '').toLowerCase();
    return difficultyId === 'hard' || difficultyId === 'nightmare';
  }

  getSelectedDenyReasons() {
    if (!this.elements.denyReasonList) return [];
    return Array.from(this.elements.denyReasonList.querySelectorAll('.deny-reason-btn.selected[data-reason]'))
      .map((button) => String(button.dataset.reason || '').trim())
      .filter(Boolean);
  }

  syncHardPlusDenySelectionSummary() {
    if (!this.elements.denyReasonList) return;
    const selectedCount = this.getSelectedDenyReasons().length;
    const summary = this.elements.denyReasonList.querySelector('[data-deny-selection-summary="true"]');
    if (summary) {
      summary.textContent = `${selectedCount} reason${selectedCount === 1 ? '' : 's'} selected`;
    }
  }

  applyVisualStamp(action) {
    const application = this.elements.documentContent?.querySelector('.paper-sheet[data-dropzone="application"] .template-request-form');
    if (!application) return;

    application.querySelector('.request-form-stamp')?.remove();
    const stamp = document.createElement('div');
    const normalized = String(action || '').toUpperCase();
    const classSuffix = normalized === 'DENY' ? 'deny' : 'approve';
    stamp.className = `request-form-stamp stamp-${classSuffix}`;
    stamp.textContent = normalized === 'DENY' ? 'DENIED' : 'APPROVED';
    application.appendChild(stamp);
  }

  renderCustomerAcrossDesk(data) {
    const npc = data.npc;
    if (this.elements.deskCustomerAvatar) {
      const customerPhotoAsset = this.game.getNpcPhotoAsset(npc, 'customer');
      if (customerPhotoAsset) {
        this.elements.deskCustomerAvatar.innerHTML = this.renderPhotoAssetMarkup(customerPhotoAsset, {
          alt: `${npc.fullName} portrait`,
          className: 'desk-avatar-photo'
        });
      } else {
        const initials = npc.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        this.elements.deskCustomerAvatar.innerHTML = `<span>${initials}</span>`;
      }
    }
    if (this.elements.deskCustomerChat) {
      const acrossDeskLine = data.greeting || data.npc?.dialogue?.greeting || data.npc?.dialogue?.smallTalk ||
        `I'm here for ${this.game.caseGenerator.formatRequestType(data.caseRecord?.requestType || 'service')}.`;
      this.elements.deskCustomerChat.innerHTML = `<p>"${acrossDeskLine}"</p>`;
    }

    if (this.elements.customerInfo) {
      const morale = data?.morale;
      this.elements.customerInfo.textContent = morale?.commentary
        ? `Inner Voice: ${morale.commentary}`
        : '';
    }
  }

  updateHUD(queueStatus) {
    if (this.elements.clockDisplay) {
      this.elements.clockDisplay.textContent = `${queueStatus.time} • ${this.getCurrentDateLabel()}`;
    }
    if (this.elements.queueCounter) {
      this.elements.queueCounter.textContent = `${queueStatus.served}/${queueStatus.total}`;
    }
    if (this.elements.shiftProgress) {
      this.elements.shiftProgress.style.width = `${queueStatus.shiftProgress * 100}%`;
    }
    if (this.elements.moneyDisplay) {
      this.elements.moneyDisplay.textContent = `$${this.game.player.money}`;
    }
    if (this.elements.performanceDisplay) {
      const career = this.game.getCareerProgressionSnapshot?.() || null;
      this.elements.performanceDisplay.innerHTML = `
        <span class="label">${this.game.player.department}</span>
        <span class="value">${career?.rankTitle || 'Clerk'}</span>
      `;
    }

    if (this.elements.overtimeIndicator) {
      const inCaseFlow = this.game.state === 'serving' || this.game.state === 'doc_request';
      const hasActiveCase = Boolean(this.game.currentCase && this.game.currentNPC);
      const isOvertime = inCaseFlow && hasActiveCase && Boolean(this.game.shiftManager?.isShiftTimeOver?.());
      this.elements.overtimeIndicator.classList.toggle('hidden', !isOvertime);
    }
  }

  getCurrentDateLabel() {
    return this.getCurrentInGameDate().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getCurrentInGameDate() {
    const shift = Math.max(1, this.game.player?.shiftNumber || 1);
    const baseDate = new Date('2026-01-05T08:00:00');
    baseDate.setDate(baseDate.getDate() + shift - 1);
    return baseDate;
  }

  getCurrentInGameDateIso() {
    return this.getCurrentInGameDate().toISOString().slice(0, 10);
  }

  renderPatienceBar(patience) {
    const color = patience > 60 ? '#4CAF50' : patience > 30 ? '#FF9800' : '#f44336';
    return `<div class="patience-bar"><div class="patience-fill" style="width:${patience}%;background:${color}"></div></div>`;
  }

  renderPhotoAssetMarkup(asset, { alt = 'Photo', className = '' } = {}) {
    if (!asset) return '';

    if (asset.type === 'image' && asset.src) {
      return `<img src="${asset.src}" alt="${alt}" class="${className}">`;
    }

    if (asset.type === 'atlas' && asset.image) {
      const columns = Math.max(1, Number(asset.columns || 1));
      const rows = Math.max(1, Number(asset.rows || 1));
      const col = Math.max(0, Number(asset.col || 0));
      const row = Math.max(0, Number(asset.row || 0));
      const posX = columns > 1 ? (col / (columns - 1)) * 100 : 0;
      const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
      const sizeX = columns * 100;
      const sizeY = rows * 100;
      return `<span role="img" aria-label="${alt}" class="atlas-photo ${className}" style="background-image:url('${asset.image}');background-position:${posX}% ${posY}%;background-size:${sizeX}% ${sizeY}%;"></span>`;
    }

    return '';
  }

  renderDocuments(documents, caseRecord, issues, activeChaosEvents = []) {
    const providedDocs = Object.entries(documents || {})
      .map(([docType, doc]) => ({ docType, doc }))
      .filter(entry => entry.doc && entry.doc.present);

    if (this.elements.documentTabs) {
      this.elements.documentTabs.innerHTML = '';
    }

    if (!this.elements.documentContent) return;
    this.ensureDeskWorkspace();
    this.deskWorkspace?.setDebugMode(this.game.developmentMode);
    this.refreshDeskTerminalContext({ activeChaosEvents, caseRecord });

    const packet = this.buildWorkspacePacket(caseRecord, providedDocs, issues);
    this.deskWorkspace.clear();
    packet.forEach((docConfig) => this.deskWorkspace.addItem(new DeskDocument(this.deskWorkspace, docConfig)));
    this.applyDevRelevantFieldHighlights();
    this.renderFormRequestTray(caseRecord, documents);
    this.renderFormFieldRequestTray(caseRecord, documents);
  }

  buildDeskTerminalNpcRegistry() {
    const registry = new Map();
    const addNpc = (npc) => {
      if (!npc?.npcId || registry.has(npc.npcId)) return;
      registry.set(npc.npcId, npc);
    };

    (this.game.npcPool || []).forEach(addNpc);
    (this.game.shiftManager?.customerQueue || []).forEach(addNpc);
    addNpc(this.game.currentNPC);

    return Array.from(registry.values());
  }

  buildDeskTerminalContext(overrides = {}) {
    const queueStatus = overrides.queueStatus || this.game.shiftManager?.getQueueStatus?.() || null;
    const waitTotal = Number(overrides.waitTotal ?? this.game.gameState?.caseWaitTotal ?? 0);
    const waitRemaining = Number(overrides.waitRemaining ?? this.game.gameState?.caseWaitRemaining ?? 0);
    const resolvedPatiencePercent = Number.isFinite(Number(overrides.patiencePercent))
      ? Number(overrides.patiencePercent)
      : (waitTotal > 0 ? waitRemaining / waitTotal : 0);

    return {
      caseRecord: overrides.caseRecord || this.game.currentCase?.caseRecord || null,
      npc: this.game.currentNPC || null,
      devMode: Boolean(this.game.developmentMode),
      npcRegistry: this.buildDeskTerminalNpcRegistry(),
      activeChaosEvents: overrides.activeChaosEvents || this.game.shiftManager?.getActiveChaosEvents?.() || [],
      agencyDatabase: this.game.getAgencyDatabaseSnapshot?.() || { people: [], vehicles: [] },
      devTerminal: this.buildDevTerminalCatalog(),
      serviceState: {
        queueStatus,
        waitRemaining,
        waitTotal,
        patiencePercent: Math.max(0, Math.min(1, resolvedPatiencePercent)),
        hasEscalated: Boolean(this.game.gameState?.casePatienceEscalated)
      }
    };
  }

  refreshDeskTerminalContext(overrides = {}) {
    if (!this.deskWorkspace) return;
    this.deskWorkspace.setTerminalContext(this.buildDeskTerminalContext(overrides), { resetCommandState: false });
  }

  applyDevRelevantFieldHighlights() {
    const stack = this.deskWorkspace?.stack;
    if (!stack) return;

    stack.querySelectorAll('.dev-relevant-field, .dev-relevant-field-good, .dev-relevant-field-bad').forEach((element) => {
      element.classList.remove('dev-relevant-field');
      element.classList.remove('dev-relevant-field-good');
      element.classList.remove('dev-relevant-field-bad');
    });

    if (!this.game.developmentMode) return;

    const currentCase = this.game.currentCase || {};
    const documents = currentCase.documents || {};
    const conditions = currentCase.caseRecord?.inputs?.conditions || [];
    const issues = Array.isArray(currentCase.possibleIssues) ? currentCase.possibleIssues : [];
    const correctAction = currentCase.correctAction || null;

    const candidateSelector = [
      '.doc-field',
      '.request-txn-line',
      '.request-line',
      '.request-section.checklist',
      '.title-cell',
      '.title-owner-name',
      '.title-owner-address',
      '.birth-cert-line',
      '.odo-line',
      '.bill-line',
      '.insurance-policy-row',
      '.insurance-block',
      '.insurance-vehicle-row',
      '.ssn-holder-line',
      '.registration-line',
      '.registration-cell',
      '.court-line',
      '.consent-line',
      '.lease-line',
      '.lease-cell',
      '.utility-line',
      '.bank-line',
      '.bank-cell',
      '.tax-line',
      '.tax-cell',
      '.record-line',
      '.license-line',
      '.license-line > span',
      '.license-id-number'
    ].join(', ');

    const explicitSelectors = [
      '.template-request-form .request-section.checklist',
      '.workspace-license-card .license-id-number',
      '.workspace-vehicle-title .title-owner-name',
      '.workspace-vehicle-title .title-owner-address'
    ];

    const normalize = (value) => String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const extractTerms = (value) => normalize(value)
      .split(/[^a-z0-9]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3);

    const isRelevantLabel = (labelText) => {
      const text = normalize(labelText);
      if (!text) return false;

      const phrases = [
        'full legal name',
        'applicant',
        'registered owner',
        'owner',
        'holder',
        'insured',
        'taxpayer name',
        'subject',
        'tenant',
        'buyer',
        'transferor',
        'date of birth',
        'dob',
        'residence address',
        'service address',
        'mailing address',
        'home address',
        'address',
        'license / id',
        'license no',
        'license number',
        'exp',
        'expires',
        'expiration',
        'expiry',
        'vehicle identification number',
        'vin'
      ];

      return phrases.some((phrase) => text.includes(phrase));
    };

    const denyTerms = new Set();
    const addDenyTerms = (...values) => {
      values.forEach((value) => {
        extractTerms(value).forEach((term) => denyTerms.add(term));
      });
    };

    const conditionTerms = {
      wrong_form: ['request', 'form', 'application', 'checklist'],
      unpaid_tickets: ['ticket', 'citation'],
      suspended_license: ['license'],
      insurance_lapse: ['insurance', 'policy'],
      impound_hold: ['impound', 'release'],
      fraud_alert: ['forged', 'verification']
    };

    const issueTypeTerms = {
      missing: ['missing', 'required', 'checklist', 'not', 'provided'],
      expired: ['expired', 'expires', 'expiration', 'exp'],
      forgery: ['forged', 'fraud', 'authenticity', 'verification'],
      inconsistency: ['address', 'residence', 'mailing', 'service'],
      mismatch: ['name', 'holder', 'owner', 'applicant', 'insured'],
      missing_field: ['missing', 'required', 'field', 'vin'],
      condition: ['condition', 'hold', 'suspended', 'ticket', 'citation'],
      name_change_validation: ['name', 'legal', 'court', 'order'],
      timeline_validation: ['timeline', 'transfer', 'disclosure', 'sale', 'date']
    };

    const reasonCodeTerms = {
      ExpiredDocument: ['expired', 'expires', 'expiration', 'exp'],
      MissingDocument: ['missing', 'required', 'checklist', 'not', 'provided'],
      FraudSuspected: ['forged', 'fraud', 'authenticity', 'verification'],
      OutstandingViolations: ['ticket', 'citation', 'violation'],
      SuspendedLicense: ['license', 'suspended'],
      InsuranceLapse: ['insurance', 'policy'],
      ImpoundHold: ['impound', 'release']
    };

    Object.entries(documents).forEach(([docType, doc]) => {
      if (!doc) return;
      if (!doc.present) {
        addDenyTerms('missing', 'required', 'checklist', 'not provided');
      }
      if (doc.expired) {
        addDenyTerms('expired', 'expires', 'expiration', 'exp');
      }
      if (doc.forged) {
        addDenyTerms('forged', 'fraud', 'authenticity', 'verification');
      }
      if ((doc.errors || []).includes('address_inconsistency')) {
        addDenyTerms('address', 'residence', 'mailing', 'service');
      }
      if ((doc.errors || []).includes('name_mismatch')) {
        addDenyTerms('name', 'holder', 'owner', 'applicant', 'insured');
      }
    });

    issues.forEach((issue) => {
      addDenyTerms(issue?.description || '');
      addDenyTerms(...(issueTypeTerms[issue?.type] || []));
    });

    conditions.forEach((condition) => {
      if (!condition?.blocksApproval) return;
      addDenyTerms(condition?.detail || '');
      addDenyTerms(...(conditionTerms[condition?.type] || []));
    });

    addDenyTerms(correctAction?.reasonCode || '', correctAction?.explanation || '');
    addDenyTerms(...(reasonCodeTerms[correctAction?.reasonCode] || []));

    if (String(correctAction?.action || '').toLowerCase() !== 'deny') {
      denyTerms.clear();
    }

    const isDenyRelevantField = (labelText) => {
      if (!denyTerms.size) return false;
      const normalized = normalize(labelText);
      if (!normalized) return false;
      return Array.from(denyTerms).some((term) => normalized.includes(term));
    };

    stack.querySelectorAll(`.workspace-document ${candidateSelector}`).forEach((node) => {
      const labelNode = node.querySelector('span, .field-label, .request-key, .license-key') || node;
      if (isRelevantLabel(labelNode.textContent)) {
        node.classList.add('dev-relevant-field');
        node.classList.add(isDenyRelevantField(labelNode.textContent) ? 'dev-relevant-field-bad' : 'dev-relevant-field-good');
      }
    });

    explicitSelectors.forEach((selector) => {
      stack.querySelectorAll(`.workspace-document ${selector}`).forEach((node) => {
        node.classList.add('dev-relevant-field');
        const referenceText = node.textContent || node.getAttribute('aria-label') || '';
        node.classList.add(isDenyRelevantField(referenceText) ? 'dev-relevant-field-bad' : 'dev-relevant-field-good');
      });
    });
  }

  getStandardRequestDocList() {
    const dept = this.game.player.department;
    const deptConfig = this.game.catalogs?.departments?.[dept];
    if (!deptConfig?.requiredDocsByRequest) return [];
    const allowedRequests = new Set(
      this.game.getAllowedRequestTypesForDepartment?.(dept)
      || Object.keys(deptConfig.requiredDocsByRequest)
    );

    const uniqueDocTypes = new Set();
    Object.entries(deptConfig.requiredDocsByRequest).forEach(([requestType, docs]) => {
      if (!allowedRequests.has(requestType)) return;
      (docs || []).forEach((docType) => uniqueDocTypes.add(docType));
    });
    return Array.from(uniqueDocTypes);
  }

  getChecklistCategoryLabel(docType) {
    const categoryMap = {
      driversLicense: 'Proof of Identity',
      birthCertificate: 'Proof of Identity',
      socialSecurityCard: 'Identity Number Verification',
      proofOfResidence: 'Proof of Residence',
      insuranceProof: 'Insurance Verification',
      titleDocument: 'Ownership Record',
      registrationCard: 'Vehicle Registration Record',
      vehicleRegistration: 'Vehicle Registration Record',
      billOfSale: 'Ownership Transfer Record',
      odometerDisclosure: 'Vehicle Mileage Disclosure',
      courtOrder: 'Legal Order Documentation',
      parentalConsent: 'Guardian Authorization',
      ticketCitation: 'Citation Record',
      evidencePhotos: 'Supporting Evidence',
      parkingPermit: 'Permit Record',
      releaseForm: 'Release Authorization',
      policeReport: 'Incident Report',
      proofOfOwnership: 'Ownership Record',
      sitePlan: 'Property/Project Plan',
      zoningClearance: 'Zoning Clearance',
      businessRegistration: 'Business Registration',
      taxClearance: 'Tax Compliance',
      eventPlan: 'Event Plan Documentation',
      neighborhoodConsent: 'Community Consent',
      propertyDeed: 'Property Record',
      inspectionChecklist: 'Inspection Checklist'
    };
    return categoryMap[docType] || 'Supporting Documentation';
  }

  renderFormRequestTray(caseRecord, documents = {}) {
    if (!this.elements.decisionPanel) return;

    const existing = this.elements.decisionPanel.querySelector('.doc-request-tray');
    if (existing) existing.remove();

    const requestableDocTypes = this.getStandardRequestDocList();
    if (!requestableDocTypes.length) return;

    const requiredDocs = new Set(caseRecord?.inputs?.requiredDocs || []);
    const requestHtml = requestableDocTypes.map((docType) => {
      const isOnFile = Boolean(documents?.[docType]?.present);
      const isRequired = requiredDocs.has(docType);
      const showRequiredHint = this.game.developmentMode && isRequired;
      const cssClass = `doc-request-btn${isOnFile ? ' on-file' : ''}${showRequiredHint ? ' required' : ''}`;
      return `<button class="${cssClass}" type="button" data-doc-type="${docType}">Request ${this.game.caseGenerator.formatDocName(docType)}</button>`;
    }).join('');

    this.elements.decisionPanel.insertAdjacentHTML('beforeend', `
      <div class="doc-request-tray">
        <h4>Request Form From Customer</h4>
        <div class="doc-request-list">${requestHtml}</div>
      </div>
    `);

    const wrongFormCondition = (caseRecord?.inputs?.conditions || []).find((condition) => condition?.type === 'wrong_form') || null;
    const wrongRequestTypeLabel = this.game.caseGenerator.formatRequestType(wrongFormCondition?.submittedForm || caseRecord.requestType);
    const requestList = this.elements.decisionPanel.querySelector('.doc-request-list');
    if (requestList) {
      requestList.insertAdjacentHTML('afterbegin', `
        <button class="doc-request-btn correct-form-request-btn${wrongFormCondition ? '' : ' on-file'}" type="button" data-request-correct-form="true" title="${wrongFormCondition ? `Submitted: ${wrongRequestTypeLabel}` : 'Use only when customer submitted the wrong service form.'}">
          Request New DMV Form
        </button>
      `);
    }

    this.elements.decisionPanel.querySelectorAll('.doc-request-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.requestCorrectForm === 'true') {
          this.closeDeskTerminal();
          const response = this.game.requestCorrectForm();
          if (!response?.ok) {
            const message = response?.reason === 'no-wrong-form-condition'
              ? 'Customer submitted the correct service form for this case.'
              : 'No active case available for form correction.';
            this.showNotification(message, 'warning');
          }
          return;
        }

        const docType = btn.dataset.docType;
        if (!docType) return;
        const docName = this.game.caseGenerator.formatDocName(docType);
        if (documents?.[docType]?.present) {
          this.showNotification(`${docName} is already on file.`);
          return;
        }
        this.closeDeskTerminal();
        this.game.requestAdditionalDocument(docType);
      });
    });
  }

  ensureDeskWorkspace() {
    if (this.deskWorkspace || !this.elements.documentContent) return;
    this.deskWorkspace = new DeskWorkspace({
      root: this.elements.documentContent,
      onStamp: (action) => this.applyStampDecision(action),
      onOpenHandbook: (caseRecord) => this.openHandbook(caseRecord),
      onTerminalCommand: (commandPayload) => this.handleDeskTerminalCommand(commandPayload),
      seed: 1337,
      debugMode: this.game.developmentMode
    });
  }

  getWorkspaceTemplateForDoc(docType, doc = null) {
    const templateMap = {
      title: 'title',
      vehicleTitle: 'title',
      birthCertificate: 'birthCertificate',
      odometerDisclosure: 'odometerDisclosure',
      billOfSale: 'billOfSale',
      socialSecurityCard: 'socialSecurityCard',
      parentalConsent: 'parentalConsent',
      courtOrder: 'courtOrder',
      proofOfResidence: 'utilityBill',
      registrationCard: 'registrationCard',
      vehicleRegistration: 'registrationCard',
      ticketCitation: 'genericGovRecord',
      evidencePhotos: 'genericGovRecord',
      parkingPermit: 'genericGovRecord',
      releaseForm: 'genericGovRecord',
      policeReport: 'genericGovRecord',
      proofOfOwnership: 'genericGovRecord',
      insuranceProof: 'insuranceCard',
      insuranceCard: 'insuranceCard',
      utilityBill: 'utilityBill',
      driversLicense: 'driversLicense'
    };

    let template = templateMap[docType] || 'genericGovRecord';
    const residenceType = doc?.data?.documentType;
    if (docType === 'proofOfResidence' && residenceType === 'Lease Agreement') {
      template = 'leaseAgreement';
    } else if (docType === 'proofOfResidence' && residenceType === 'Bank Statement') {
      template = 'bankStatement';
    } else if (docType === 'proofOfResidence' && residenceType === 'Tax Return') {
      template = 'taxReturn';
    }
    return template;
  }

  getSizePresetForTemplate(template) {
    if (template === 'driversLicense' || template === 'insuranceCard' || template === 'socialSecurityCard') {
      return 'WalletCard';
    }
    if (template === 'utilityBill' || template === 'bankStatement' || template === 'taxReturn' || template === 'odometerDisclosure' || template === 'registrationCard' || template === 'parentalConsent') {
      return 'HalfSheet';
    }
    return 'Letter';
  }

  getSpawnPositionForSize(sizePreset) {
    const presets = {
      Letter: { w: 378, h: 486 },
      HalfSheet: { w: 324, h: 378 },
      WalletCard: { w: 338, h: 230 }
    };
    const size = presets[sizePreset] || presets.Letter;
    const surface = this.deskWorkspace?.surface;
    const width = Math.max(surface?.clientWidth || 0, 760);
    const height = Math.max(surface?.clientHeight || 0, 520);
    const padding = 18;
    const minX = padding;
    const maxX = Math.max(minX, width - size.w - padding);
    const minY = padding;
    const maxY = Math.max(minY, height - size.h - padding);
    return {
      x: Math.round(this.deskWorkspace.randomBetween(minX, maxX)),
      y: Math.round(this.deskWorkspace.randomBetween(minY, maxY))
    };
  }

  handleDeskTerminalCommand(commandPayload = {}) {
    const { command, target, id, payload } = commandPayload;
    const normalizedCommand = String(command || '').toLowerCase();
    const normalizedTarget = String(target || '').toLowerCase();
    const requestedId = String(id || '').trim();

    if (normalizedCommand === 'toggle_dev_mode') {
      const enabled = !this.game.developmentMode;
      this.setDevControlsVisibility(enabled, { persist: true, notify: true });
      this.refreshDeskTerminalContext();
      return {
        ok: true,
        message: `Developer mode ${enabled ? 'enabled' : 'disabled'}.`,
        enabled
      };
    }

    if (!this.game.developmentMode) {
      return { ok: false, message: 'Developer mode is required.' };
    }

    if (normalizedCommand === 'database_update' && normalizedTarget === 'person' && requestedId) {
      const response = this.game.updateAgencyPersonRecord(requestedId, payload || {});
      if (response.ok && this.game.currentCase?.documents && this.game.currentCase?.caseRecord) {
        this.game.applyDatabaseToCaseData(this.game.currentCase, this.game.currentNPC);
        this.renderDocuments(
          this.game.currentCase.documents,
          this.game.currentCase.caseRecord,
          this.game.currentCase.possibleIssues || [],
          this.game.shiftManager?.getActiveChaosEvents?.() || []
        );
      }
      const database = this.game.getAgencyDatabaseSnapshot();
      this.refreshDeskTerminalContext();
      return {
        ...response,
        database
      };
    }

    if (normalizedCommand === 'skip_week') {
      const response = this.game.skipToNextWeekSimulated?.() || { ok: false, message: 'Skip-week command is unavailable.' };
      if (response.ok) {
        this.closeDeskTerminal();
      }

      const outputLines = [];
      if (response.message) outputLines.push(response.message);
      if (response.ok) {
        const weekly = response.weeklySummary || null;
        if (weekly) {
          outputLines.push(`Weekly summary: ${weekly.weeklyPerf}% (${weekly.tier})`);
          (weekly.outcomes || []).slice(0, 3).forEach((line) => outputLines.push(`- ${line}`));
        }
      }

      this.refreshDeskTerminalContext();
      return {
        ok: Boolean(response.ok),
        message: response.message || (response.ok ? 'Week skipped.' : 'Skip failed.'),
        outputLines
      };
    }

    if (normalizedCommand === 'end_shift') {
      const response = this.game.skipToShiftEndSimulated?.({
        forcedGrade: commandPayload?.forcedGrade || null
      }) || { ok: false, message: 'Shift-end command is unavailable.' };
      if (response.ok) {
        this.closeDeskTerminal();
      }
      this.refreshDeskTerminalContext();
      const resolvedMessage = response.message || (response.ok ? 'Shift ended.' : 'Unable to end shift.');
      return {
        ok: Boolean(response.ok),
        message: resolvedMessage,
        outputLines: [resolvedMessage]
      };
    }

    if (normalizedCommand === 'launch_minigame') {
      if (!requestedId) {
        return { ok: false, message: 'Missing mini-game id. Example: LAUNCH MINIGAME parking_fine_payment' };
      }

      const launchers = this.game.getMiniGameLaunchers?.() || [];
      const launcher = launchers.find((entry) => entry.id === requestedId);
      const response = this.game.launchMiniGame?.(requestedId, {
        forceDevelopmentLaunch: this.game.developmentMode
      }) || { ok: false, message: 'Mini-game launch is unavailable.' };

      if (response.ok) {
        this.closeDeskTerminal();
      }

      this.refreshDeskTerminalContext();

      const successMessage = launcher
        ? `Launched mini-game: ${launcher.label}`
        : `Launched mini-game: ${requestedId}`;
      const failedMessage = launcher?.unavailableMessage || response.message || 'Unable to launch mini-game.';
      const resolvedMessage = response.ok ? successMessage : failedMessage;

      return {
        ok: Boolean(response.ok),
        message: resolvedMessage,
        outputLines: [resolvedMessage]
      };
    }

    if (normalizedCommand !== 'spawn' || !requestedId) {
      return { ok: false, message: 'Unsupported command payload.' };
    }

    if (normalizedTarget === 'request') {
      return this.spawnDevRequestForm(requestedId);
    }

    if (normalizedTarget === 'doc') {
      return this.spawnDevDocumentForm(requestedId);
    }

    if (normalizedTarget === 'case_packet') {
      return this.spawnCurrentCasePacket(commandPayload.context);
    }

    return { ok: false, message: 'Unsupported spawn target.' };
  }

  spawnCurrentCasePacket(commandContext = null) {
    this.ensureDeskWorkspace();
    if (!this.deskWorkspace) {
      return { ok: false, message: 'Desk workspace is not ready.' };
    }

    const activeCase = this.game.currentCase;
    if (activeCase?.caseRecord && activeCase?.documents) {
      this.renderDocuments(activeCase.documents, activeCase.caseRecord, activeCase.possibleIssues || []);
      return { ok: true, message: `Spawned current case packet: ${this.game.caseGenerator.formatRequestType(activeCase.caseRecord.requestType)}` };
    }

    const contextCaseRecord = commandContext?.caseRecord || this.deskWorkspace?.terminalContext?.caseRecord || null;
    if (!contextCaseRecord) {
      return { ok: false, message: 'No active case context found for packet spawn.' };
    }

    const providedDocs = Object.values(contextCaseRecord?.inputs?.providedDocs || {})
      .filter((doc) => doc?.present)
      .map((doc) => ({ docType: doc.type, doc }));
    const packet = this.buildWorkspacePacket(contextCaseRecord, providedDocs, []);

    this.deskWorkspace.clear();
    packet.forEach((docConfig) => this.deskWorkspace.addItem(new DeskDocument(this.deskWorkspace, docConfig)));
    this.applyDevRelevantFieldHighlights();

    return { ok: true, message: `Spawned packet from loaded context: ${this.game.caseGenerator.formatRequestType(contextCaseRecord.requestType)}` };
  }

  spawnDevRequestForm(requestType) {
    this.ensureDeskWorkspace();
    if (!this.deskWorkspace) {
      return { ok: false, message: 'Desk workspace is not ready.' };
    }

    const requestCatalog = this.getAllRequestTypesForDevTerminal();
    const match = requestCatalog.find((entry) => entry.id.toLowerCase() === String(requestType || '').toLowerCase());
    if (!match) {
      return { ok: false, message: `Unknown request form: ${requestType}` };
    }

    const activeCase = this.game.currentCase?.caseRecord;
    const fallbackCase = {
      caseId: `dev_case_${Date.now()}`,
      requestType: match.id,
      inputs: {
        fee: 0,
        requiredDocs: [],
        providedDocs: {}
      }
    };
    const sourceCase = activeCase || fallbackCase;
    const simulatedCase = {
      ...sourceCase,
      requestType: match.id,
      inputs: {
        ...(sourceCase.inputs || {}),
        fee: sourceCase?.inputs?.fee || 0,
        requiredDocs: sourceCase?.inputs?.requiredDocs || [],
        providedDocs: sourceCase?.inputs?.providedDocs || {}
      }
    };
    const npc = this.game.currentNPC;
    const person = {
      name: npc?.fullName || 'Unknown Applicant',
      dob: npc?.identity?.dob || '',
      address: npc?.identity?.address || ''
    };
    const formData = this.buildScenarioRequestForm(simulatedCase, match.id);
    const position = this.getSpawnPositionForSize('Letter');

    this.deskWorkspace.addItem(new DeskDocument(this.deskWorkspace, {
      id: `dev-request-${match.id}-${Date.now()}`,
      template: 'requestForm',
      sizePreset: 'Letter',
      x: position.x,
      y: position.y,
      rotation: this.deskWorkspace.randomBetween(-5, 5),
      data: {
        person,
        vehicle: {
          vin: 'APPLICATION FILE',
          make: this.game.caseGenerator.formatRequestType(match.id),
          model: this.game.caseGenerator.formatRequestType(match.id),
          year: ''
        },
        policy: { policyNumber: `FEE-$${simulatedCase?.inputs?.fee || 0}`, provider: 'DMV', expDate: '' },
        dateValue: this.getCurrentInGameDateIso(),
        form: formData
      }
    }));

    this.applyDevRelevantFieldHighlights();

    return { ok: true, message: `Spawned request form preview: ${match.label}` };
  }

  spawnDevDocumentForm(docType) {
    this.ensureDeskWorkspace();
    if (!this.deskWorkspace) {
      return { ok: false, message: 'Desk workspace is not ready.' };
    }

    const docCatalog = this.getAllDocumentTypesForDevTerminal();
    const match = docCatalog.find((entry) => entry.id.toLowerCase() === String(docType || '').toLowerCase());
    if (!match) {
      return { ok: false, message: `Unknown document form: ${docType}` };
    }

    const npc = this.game.currentNPC;
    if (!npc) {
      return { ok: false, message: 'No active customer. Start a scenario to spawn document previews.' };
    }

    const rng = this.game.getDeterministicRng((npc?.rng?.masterSeed || 0) + this.game.player.shiftNumber * 31);
    const generatedData = this.game.caseGenerator.generateDocumentData(rng, npc, match.id) || {};
    if (!this.game.caseGenerator.isNonExpiringDocument(match.id) && !generatedData.expirationDate) {
      generatedData.expirationDate = this.game.caseGenerator.generateFutureDate(rng);
    }
    const tempDoc = {
      type: match.id,
      present: true,
      data: generatedData
    };
    const showForgeryHint = true;
    const template = this.getWorkspaceTemplateForDoc(match.id, tempDoc);
    const sizePreset = this.getSizePresetForTemplate(template);
    const position = this.getSpawnPositionForSize(sizePreset);
    const licensePhotoId = generatedData.licensePhotoId || npc?.appearance?.photoId || null;
    const licensePhotoAsset = template === 'driversLicense'
      ? this.game.getPhotoAsset(licensePhotoId, 'license')
      : null;
    const licensePhotoUrl = licensePhotoAsset?.type === 'image' ? licensePhotoAsset.src : null;

    this.deskWorkspace.addItem(new DeskDocument(this.deskWorkspace, {
      id: `dev-doc-${match.id}-${Date.now()}`,
      template,
      sizePreset,
      x: position.x,
      y: position.y,
      rotation: this.deskWorkspace.randomBetween(-5, 5),
      data: {
        person: {
          name: generatedData.holderName || generatedData.fullName || npc.fullName,
          dob: generatedData.dob || npc.identity?.dob || '',
          address: generatedData.address || npc.identity?.address || ''
        },
        vehicle: {
          vin: generatedData.vin || generatedData.vehicleVIN || generatedData.vehicleId || '',
          make: generatedData.make || generatedData.vehicleMake || '',
          model: generatedData.model || generatedData.vehicleModel || '',
          year: generatedData.year || generatedData.vehicleYear || ''
        },
        policy: {
          policyNumber: generatedData.policyNumber || generatedData.licenseNumber || '',
          provider: generatedData.provider || generatedData.insuranceProvider || 'Carrier on file',
          expDate: generatedData.expirationDate || generatedData.expDate || ''
        },
        dateValue: generatedData.dateIssued || generatedData.issueDate || generatedData.expirationDate || this.getCurrentInGameDateIso(),
        documentData: {
          ...generatedData,
          docType: match.id,
          forged: false,
          errors: [],
          showForgeryHint,
          licensePhotoUrl,
          licensePhotoAsset
        }
      }
    }));

    this.applyDevRelevantFieldHighlights();

    return { ok: true, message: `Spawned document form preview: ${match.label}` };
  }

  getScenarioFormDefinition(requestType) {
    return SCENARIO_FORM_DEFINITIONS[requestType] || { formNumber: 'DMV-000', title: 'Department Service Request Form' };
  }

  getAllRequestTypesForDevTerminal() {
    return Object.keys(SCENARIO_FORM_DEFINITIONS)
      .sort((a, b) => a.localeCompare(b))
      .map((requestType) => ({
        id: requestType,
        label: this.game.caseGenerator.formatRequestType(requestType)
      }));
  }

  getAllDocumentTypesForDevTerminal() {
    const allTypes = new Set();
    const departments = this.game.catalogs?.departments || {};
    Object.values(departments).forEach((deptConfig) => {
      Object.values(deptConfig?.requiredDocsByRequest || {}).forEach((docs) => {
        (docs || []).forEach((docType) => allTypes.add(docType));
      });
    });

    return Array.from(allTypes)
      .sort((a, b) => a.localeCompare(b))
      .map((docType) => ({
        id: docType,
        label: this.game.caseGenerator.formatDocName(docType)
      }));
  }

  buildDevTerminalCatalog() {
    return {
      requestForms: this.getAllRequestTypesForDevTerminal(),
      documentForms: this.getAllDocumentTypesForDevTerminal(),
      miniGames: this.game.getMiniGameLaunchers?.() || []
    };
  }

  getMediumFormOmissions(caseRecord) {
    const caseId = String(caseRecord?.caseId || '');
    // Keep omissions deterministic per case so fields do not shift during rerenders.
    const hash = Array.from(caseId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const omissions = new Set(['declaredVin']);
    if (hash % 2 === 0) {
      omissions.add(hash % 4 === 0 ? 'declaredAddress' : 'declaredLicenseId');
    }
    return omissions;
  }

  isMediumPlusDifficulty() {
    const difficultyId = String(this.game.getDifficultyProfile?.()?.id || this.game.difficulty || '').toLowerCase();
    return ['medium', 'hard', 'nightmare'].includes(difficultyId);
  }

  getResolvedFormFieldsForCase(caseId) {
    const key = String(caseId || '');
    if (!key) return new Set();
    const existing = this.requestedFormFieldsByCase[key] || [];
    return new Set(existing);
  }

  markFormFieldResolved(caseId, fieldKey) {
    const key = String(caseId || '');
    if (!key) return;
    const resolved = this.getResolvedFormFieldsForCase(key);
    resolved.add(fieldKey);
    this.requestedFormFieldsByCase[key] = Array.from(resolved);
  }

  isMeaningfulRequestFormValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const blocked = new Set(['PENDING VERIFICATION', 'APPLICATION FILE', 'UNKNOWN', 'N/A', '________________']);
    return !blocked.has(normalized.toUpperCase());
  }

  getFormFieldCandidates(caseRecord, documents = {}) {
    const providedDocs = caseRecord?.inputs?.providedDocs || documents || {};
    const firstPresent = (docType) => {
      const doc = providedDocs[docType];
      return doc?.present ? doc : null;
    };

    const licenseDoc = firstPresent('driversLicense');
    const insuranceDoc = firstPresent('insuranceProof');
    const titleDoc = firstPresent('titleDocument');
    const registrationDoc = firstPresent('registrationCard') || firstPresent('vehicleRegistration');
    const addressDoc = firstPresent('proofOfResidence');
    const anyDocWithLicenseNumber = Object.values(providedDocs)
      .find((doc) => doc?.present && doc?.data?.licenseNumber);
    const agencyPersonRecord = this.game.gameState?.agencyDatabase?.peopleByNpcId?.[this.game.currentNPC?.npcId || ''] || null;
    const currentAddress = licenseDoc?.data?.address || this.game.currentNPC?.identity?.address || '';

    return {
      declaredLicenseId:
        licenseDoc?.data?.licenseNumber
        || anyDocWithLicenseNumber?.data?.licenseNumber
        || agencyPersonRecord?.dlNumber
        || insuranceDoc?.data?.policyNumber
        || '',
      declaredVin: titleDoc?.data?.vin || insuranceDoc?.data?.vin || registrationDoc?.data?.vin || '',
      declaredAddress: caseRecord?.requestType === 'AddressChange'
        ? this.getAddressChangeTargetAddress(caseRecord, currentAddress, addressDoc?.data?.address)
        : (addressDoc?.data?.address || currentAddress || '')
    };
  }

  getAddressChangeTargetAddress(caseRecord, currentAddress, proofAddress) {
    const normalizedCurrent = String(currentAddress || '').trim();
    const normalizedProof = String(proofAddress || '').trim();

    // If residence proof already shows a different address, use it as the requested new address.
    if (normalizedProof && normalizedProof !== normalizedCurrent) {
      return normalizedProof;
    }

    const catalogAddresses = Array.isArray(this.game?.catalogs?.addresses)
      ? this.game.catalogs.addresses
      : [];
    const alternatives = catalogAddresses
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry && entry !== normalizedCurrent);

    if (!alternatives.length) {
      return normalizedProof || normalizedCurrent || 'PENDING VERIFICATION';
    }

    // Deterministic choice per case so rerenders stay stable.
    const caseId = String(caseRecord?.caseId || '');
    const hash = Array.from(caseId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return alternatives[hash % alternatives.length];
  }

  buildScenarioRequestForm(caseRecord, submittedFormType) {
    const providedDocs = caseRecord?.inputs?.providedDocs || {};
    const requiredDocTypes = caseRecord?.inputs?.requiredDocs || [];

    const firstPresent = (docType) => {
      const doc = providedDocs[docType];
      return doc?.present ? doc : null;
    };

    const licenseDoc = firstPresent('driversLicense');
    const insuranceDoc = firstPresent('insuranceProof');
    const titleDoc = firstPresent('titleDocument');
    const registrationDoc = firstPresent('registrationCard') || firstPresent('vehicleRegistration');
    const addressDoc = firstPresent('proofOfResidence');
    const courtOrderDoc = firstPresent('courtOrder');
    const anyDocWithLicenseNumber = Object.values(providedDocs)
      .find((doc) => doc?.present && doc?.data?.licenseNumber);
    const agencyPersonRecord = this.game.gameState?.agencyDatabase?.peopleByNpcId?.[this.game.currentNPC?.npcId || ''] || null;
    const resolvedSubmittedFormType = submittedFormType || caseRecord.requestType;
    const formDef = this.getScenarioFormDefinition(resolvedSubmittedFormType);
    const difficultyProfile = this.game.getDifficultyProfile();
    const checklistMode = difficultyProfile.checklistMode || 'none';
    const requiredProof = requiredDocTypes.map((docType) => ({
      label: checklistMode === 'category'
        ? this.getChecklistCategoryLabel(docType)
        : this.game.caseGenerator.formatDocName(docType),
      checked: Boolean(providedDocs?.[docType]?.present)
    }));
    const vehicleRequestTypes = new Set(['VehicleRegistration', 'PlateRenewal', 'TitleTransfer', 'PermitApplication', 'PermitRenewal', 'VehicleRelease']);

    const candidates = this.getFormFieldCandidates(caseRecord, providedDocs);
    const formValues = {
      declaredLicenseId: candidates.declaredLicenseId || 'PENDING VERIFICATION',
      declaredVin: candidates.declaredVin || 'PENDING VERIFICATION',
      declaredAddress: candidates.declaredAddress || 'PENDING VERIFICATION'
    };

    if (caseRecord?.requestType === 'NameChange') {
      formValues.oldLegalName = courtOrderDoc?.data?.oldName || licenseDoc?.data?.holderName || 'PENDING VERIFICATION';
      formValues.newLegalName = courtOrderDoc?.data?.newName || this.game.currentNPC?.fullName || 'PENDING VERIFICATION';
    }

    if (this.isMediumPlusDifficulty() && !this.game.developmentMode) {
      const omissions = this.getMediumFormOmissions(caseRecord);
      const resolved = this.getResolvedFormFieldsForCase(caseRecord?.caseId);
      omissions.forEach((fieldKey) => {
        if (!resolved.has(fieldKey) && Object.prototype.hasOwnProperty.call(formValues, fieldKey)) {
          formValues[fieldKey] = '________________';
        }
      });
    }

    return {
      ...formDef,
      requestTypeLabel: this.game.caseGenerator.formatRequestType(caseRecord.requestType),
      submittedFormLabel: this.game.caseGenerator.formatRequestType(resolvedSubmittedFormType),
      declaredLicenseId: formValues.declaredLicenseId,
      declaredVin: formValues.declaredVin,
      declaredAddress: formValues.declaredAddress,
      oldLegalName: formValues.oldLegalName,
      newLegalName: formValues.newLegalName,
      feeLabel: `$${caseRecord?.inputs?.fee || 0}`,
      submittedAt: this.getCurrentInGameDateIso(),
      requiredProof,
      includeVehicleSection: vehicleRequestTypes.has(caseRecord.requestType),
      includeSupportingChecklist: checklistMode !== 'none',
      devMode: this.game.developmentMode,
      devFocusFields: [
        'applicant_name',
        'applicant_dob',
        'applicant_license_id',
        'applicant_address',
        'vehicle_vin',
        'name_change_old_name',
        'name_change_new_name',
        'required_proof'
      ]
    };
  }

  renderFormFieldRequestTray(caseRecord, documents = {}) {
    if (!this.elements.decisionPanel) return;

    const existing = this.elements.decisionPanel.querySelector('.form-field-request-tray');
    if (existing) existing.remove();

    if (!this.isMediumPlusDifficulty() || this.game.developmentMode) return;

    const omissions = this.getMediumFormOmissions(caseRecord);
    const resolved = this.getResolvedFormFieldsForCase(caseRecord?.caseId);
    const unresolved = Array.from(omissions).filter((fieldKey) => !resolved.has(fieldKey));
    if (!unresolved.length) return;

    const candidates = this.getFormFieldCandidates(caseRecord, caseRecord?.inputs?.providedDocs || documents || {});
    const labels = {
      declaredLicenseId: 'Request License / ID Number',
      declaredVin: 'Request VIN',
      declaredAddress: 'Request Residence Address'
    };

    const requestHtml = unresolved.map((fieldKey) => `
      <button class="doc-request-btn form-field-request-btn" type="button" data-form-field="${fieldKey}">${labels[fieldKey] || `Request ${fieldKey}`}</button>
    `).join('');

    this.elements.decisionPanel.insertAdjacentHTML('beforeend', `
      <div class="doc-request-tray form-field-request-tray">
        <h4>Request Form Field From Customer</h4>
        <div class="doc-request-list">${requestHtml}</div>
      </div>
    `);

    this.elements.decisionPanel.querySelectorAll('.form-field-request-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fieldKey = String(btn.dataset.formField || '');
        if (!fieldKey) return;

        const value = candidates[fieldKey];
        if (!this.isMeaningfulRequestFormValue(value)) {
          this.showNotification('Customer could not provide that field value.', 'warning');
          return;
        }

        this.markFormFieldResolved(caseRecord?.caseId, fieldKey);
        this.showNotification('Customer filled the requested field on the form.', 'success');

        if (this.game.currentCase?.documents && this.game.currentCase?.caseRecord) {
          this.renderDocuments(
            this.game.currentCase.documents,
            this.game.currentCase.caseRecord,
            this.game.currentCase.possibleIssues || [],
            this.game.shiftManager?.getActiveChaosEvents?.() || []
          );
        }
      });
    });
  }

  buildWorkspacePacket(caseRecord, providedDocs, issues = []) {
    const npc = this.game.currentNPC;
    const conditions = caseRecord?.inputs?.conditions || [];
    const wrongFormCondition = conditions.find(c => c.type === 'wrong_form');
    const submittedFormType = wrongFormCondition?.submittedForm || caseRecord.requestType;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const sizeByPreset = {
      Letter: { w: 378, h: 486 },
      HalfSheet: { w: 324, h: 378 },
      WalletCard: { w: 338, h: 230 }
    };
    const surface = this.deskWorkspace?.surface;
    const deskWidth = Math.max(surface?.clientWidth || 0, 760);
    const deskHeight = Math.max(surface?.clientHeight || 0, 520);
    const centerX = deskWidth / 2;
    const centerY = deskHeight / 2;
    const margin = 16;
    const placeAt = (sizePreset, offsetX = 0, offsetY = 0) => {
      const size = sizeByPreset[sizePreset] || sizeByPreset.Letter;
      return {
        x: clamp(Math.round(centerX - (size.w / 2) + offsetX), margin, deskWidth - size.w - margin),
        y: clamp(Math.round(centerY - (size.h / 2) + offsetY), margin, deskHeight - size.h - margin)
      };
    };

    const scenarioForm = this.buildScenarioRequestForm(caseRecord, submittedFormType);

    const firstProvidedDocByType = (targetType) => {
      const entry = providedDocs.find(({ docType, doc }) => docType === targetType && doc?.present);
      return entry?.doc || null;
    };

    const licenseDoc = firstProvidedDocByType('driversLicense');
    const proofDoc = firstProvidedDocByType('proofOfResidence');
    const isNameChangeCase = caseRecord?.requestType === 'NameChange';

    const basePerson = {
      name: isNameChangeCase
        ? (scenarioForm.oldLegalName || licenseDoc?.data?.holderName || npc?.fullName || 'Unknown')
        : (npc?.fullName || 'Unknown'),
      dob: licenseDoc?.data?.dob || npc?.identity?.dob || '',
      address: proofDoc?.data?.address || licenseDoc?.data?.address || npc?.identity?.address || ''
    };

    const applicationPosition = placeAt('Letter', 0, 0);

    const vehicleFromData = (doc) => ({
      vin: doc?.data?.vin || doc?.data?.vehicleVIN || doc?.data?.vehicleId || '',
      make: doc?.data?.make || doc?.data?.vehicleMake || '',
      model: doc?.data?.model || doc?.data?.vehicleModel || '',
      year: doc?.data?.year || doc?.data?.vehicleYear || ''
    });

    const policyFromData = (doc) => ({
      policyNumber: doc?.data?.policyNumber || doc?.data?.licenseNumber || '',
      provider: doc?.data?.provider || doc?.data?.insuranceProvider || 'Carrier on file',
      expDate: doc?.data?.expirationDate || doc?.data?.expDate || ''
    });
    const showForgeryHint = true;

    const packet = [];

    const receivedOffsets = [
      { x: -140, y: 72 },
      { x: 156, y: 74 },
      { x: 204, y: 186 },
      { x: -176, y: 190 },
      { x: 12, y: 212 },
      { x: -10, y: 288 }
    ];

    providedDocs.forEach(({ docType, doc }, index) => {
      const template = this.getWorkspaceTemplateForDoc(docType, doc);
      const sizePreset = this.getSizePresetForTemplate(template);
      const offset = receivedOffsets[index % receivedOffsets.length];
      const docPosition = placeAt(sizePreset, offset.x, offset.y);
      const licensePhotoId = doc?.data?.licensePhotoId || npc?.appearance?.photoId || null;
      const licensePhotoAsset = template === 'driversLicense'
        ? this.game.getPhotoAsset(licensePhotoId, 'license')
        : null;
      const licensePhotoUrl = licensePhotoAsset?.type === 'image' ? licensePhotoAsset.src : null;

      packet.push({
        id: `${docType}-${index}`,
        template,
        sizePreset,
        x: docPosition.x,
        y: docPosition.y,
        rotation: this.deskWorkspace.randomBetween(-3, 3),
        data: {
          person: {
            name: doc?.data?.holderName || doc?.data?.fullName || basePerson.name,
            dob: doc?.data?.dob || basePerson.dob,
            address: doc?.data?.address || basePerson.address
          },
          vehicle: vehicleFromData(doc),
          policy: policyFromData(doc),
          dateValue: doc?.data?.dateIssued || doc?.data?.issueDate || doc?.data?.expirationDate || '',
          documentData: {
            ...(doc?.data || {}),
            docType,
            forged: Boolean(doc?.forged),
            errors: Array.isArray(doc?.errors) ? [...doc.errors] : [],
            showForgeryHint,
            licensePhotoUrl,
            licensePhotoAsset
          }
        }
      });
    });

    // Add the request form last so it renders on top of the received packet.
    packet.push({
      id: 'application',
      template: 'requestForm',
      sizePreset: 'Letter',
      stampTarget: true,
      x: applicationPosition.x,
      y: applicationPosition.y,
      rotation: this.deskWorkspace.randomBetween(-2, 2),
      data: {
        person: basePerson,
        vehicle: {
          vin: 'APPLICATION FILE',
          make: this.game.caseGenerator.formatRequestType(caseRecord.requestType),
          model: this.game.caseGenerator.formatRequestType(submittedFormType),
          year: ''
        },
        policy: { policyNumber: `FEE-$${caseRecord.inputs.fee || 0}`, provider: 'DMV', expDate: '' },
        dateValue: this.getCurrentInGameDateIso(),
        form: scenarioForm
      }
    });

    return packet;
  }

  pickFallbackTemplate(index) {
    const templates = ['title', 'billOfSale', 'insuranceCard', 'utilityBill', 'driversLicense'];
    return templates[index % templates.length];
  }

  closeDeskTerminal() {
    this.deskWorkspace?.closeTerminal?.();
  }

  applyStampDecision(action) {
    if (!action) return;
    if (action === 'Escalate') {
      this.showNotification('Escalation is only available during document-request resolution.', 'warning');
      return;
    }
    if (action === 'Deny') {
      this.showDenyReasonOverlay();
      return;
    }

    const reason = 'AllDocumentsValid';
    this.closeDeskTerminal();
    this.finalizeDecisionWithStamp(action, reason);
  }

  renderApplicationForm(caseRecord) {
    return `
      <div class="doc-detail application-form">
        <div class="doc-header">
          <h4>DMV Application Form</h4>
          <span class="doc-status status-received">RECEIVED</span>
        </div>
        <div class="doc-fields">
          <div class="doc-field"><span class="field-label">Requested Action:</span><span class="field-value">${this.game.caseGenerator.formatRequestType(caseRecord.requestType)}</span></div>
          <div class="doc-field"><span class="field-label">Applicant:</span><span class="field-value">${this.game.currentNPC?.fullName || 'Unknown'}</span></div>
          <div class="doc-field"><span class="field-label">Fee:</span><span class="field-value">$${caseRecord.inputs.fee || 0}</span></div>
          <div class="doc-field"><span class="field-label">Declared Address:</span><span class="field-value">${this.game.currentNPC?.identity?.address || 'N/A'}</span></div>
        </div>
        <div class="application-note">Anchor document — compare supporting papers + terminal records before stamping.</div>
      </div>
    `;
  }

  renderDocumentDetail(doc, docType, caseRecord = null) {
    if (!doc || !doc.present) {
      return this.renderMissingDocumentDetail(docType, caseRecord);
    }

    if (docType === 'driversLicense') {
      return this.renderDriversLicenseCard(doc, caseRecord);
    }

    const docName = this.game.caseGenerator.formatDocName(docType);
    const behavior = this.game.getCurrentDifficultyBehavior?.() || {};
    const easySubtleHints = behavior.forgedHintMode === 'subtle';
    const showHints = this.game.developmentMode || easySubtleHints;
    let statusClass = showHints ? 'valid' : 'received';
    let statusText = showHints ? 'VALID' : 'ON FILE';
    const hasInconsistency = Array.isArray(doc.errors) && doc.errors.includes('address_inconsistency');
    if (showHints && (doc.forged || hasInconsistency)) {
      statusClass = 'forged';
      statusText = this.game.developmentMode ? 'SUSPICIOUS' : 'FLAGGED';
    } else if (showHints && doc.expired) {
      statusClass = 'expired';
      statusText = 'EXPIRED';
    } else if (showHints && doc.errors.length > 0) {
      statusClass = 'issue';
      statusText = 'ISSUE FOUND';
    }

    const dataEntries = Object.entries(doc.data || {}).map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      const isError = doc.errors.some(e =>
        (e === 'name_mismatch' && key === 'holderName') ||
        (e === 'wrong_address' && key === 'address') ||
        (e === 'altered_date' && key === 'dateIssued') ||
        (key === 'expirationDate' && doc.expired)
      );
      return `<div class="doc-field ${isError && this.game.developmentMode ? 'field-error' : ''}">
        <span class="field-label">${label}:</span>
        <span class="field-value">${value}</span>
        ${isError && this.game.developmentMode ? '<span class="error-indicator">&#9888;</span>' : ''}
      </div>`;
    }).join('');

    // Forgery hints
    let forgeryHints = '';
    if (doc.forged && this.game.developmentMode) {
      const hintMap = {
        'name_mismatch': 'Name does not match citizen records',
        'photo_mismatch': 'Photo does not appear to match the person',
        'altered_date': 'Date appears to have been altered',
        'wrong_address': 'Address does not match records on file',
        'physical_mismatch': 'Physical descriptors differ from records',
        'suspicious_seal': 'Official seal looks questionable',
        'ink_inconsistency': 'Ink color/quality is inconsistent',
        'wrong_font': 'Font does not match standard issue documents'
      };
      const hints = doc.errors
        .filter(e => hintMap[e])
        .map(e => `<li class="forgery-hint">${hintMap[e]}</li>`);
      if (hints.length > 0) {
        forgeryHints = `<div class="forgery-hints"><h5>Observations:</h5><ul>${hints.join('')}</ul></div>`;
      }
    }

    return `
      <div class="doc-detail doc-${statusClass}">
        <div class="doc-header">
          <h4>${docName}</h4>
          <span class="doc-status status-${statusClass}">${statusText}</span>
        </div>
        <div class="doc-fields">${dataEntries}</div>
        ${doc.errors.includes('suspicious_seal') ? '<div class="tampered-seal">SEAL TAMPERED</div>' : ''}
        ${forgeryHints}
      </div>
    `;
  }

  renderDriversLicenseCard(doc, caseRecord = null) {
    const behavior = this.game.getCurrentDifficultyBehavior?.() || {};
    const easySubtleHints = behavior.forgedHintMode === 'subtle';
    const showHints = this.game.developmentMode || easySubtleHints;
    const holder = doc.data?.holderName || this.game.currentNPC?.fullName || 'Unknown';
    const licensePhotoId = doc.data?.licensePhotoId || this.game.currentNPC?.appearance?.photoId || null;
    const localPhotoAsset = this.game.getPhotoAsset(licensePhotoId, 'license');
    const seed = encodeURIComponent(`${holder}-${doc.data?.licenseNumber || 'dl'}`);
    const fallbackPhoto = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
    const photoMarkup = localPhotoAsset
      ? this.renderPhotoAssetMarkup(localPhotoAsset, { alt: 'License photo', className: 'license-photo-asset' })
      : `<img src="${fallbackPhoto}" alt="License photo" class="license-photo-asset">`;
    let statusText = 'ON FILE';
    let statusClass = 'status-received';
    if (showHints && (doc.forged || (Array.isArray(doc.errors) && doc.errors.includes('address_inconsistency')))) {
      statusText = this.game.developmentMode ? 'SUSPICIOUS' : 'FLAGGED';
      statusClass = 'status-forged';
    } else if (showHints && doc.expired) {
      statusText = 'EXPIRED';
      statusClass = 'status-expired';
    } else if (showHints && Array.isArray(doc.errors) && doc.errors.length > 0) {
      statusText = 'ISSUE FOUND';
      statusClass = 'status-issue';
    }

    const easyHintNote = !this.game.developmentMode && easySubtleHints && doc.forged
      ? '<p class="doc-subtle">Clerk alert: this license has irregular authenticity markers.</p>'
      : '';

    return `
      <div class="doc-detail doc-drivers-license">
        <div class="license-topbar">
          <span>STATE DMV LICENSE</span>
          <span class="doc-status ${statusClass}">${statusText}</span>
        </div>
        <div class="license-body">
          <div class="license-photo">${photoMarkup}</div>
          <div class="license-fields">
            <div><span>NAME</span><strong>${holder}</strong></div>
            <div><span>DOB</span><strong>${doc.data?.dob || 'N/A'}</strong></div>
            <div><span>ADDRESS</span><strong>${doc.data?.address || 'N/A'}</strong></div>
            <div><span>LIC #</span><strong>${doc.data?.licenseNumber || 'N/A'}</strong></div>
            <div><span>CLASS</span><strong>${doc.data?.category || 'N/A'}</strong></div>
            <div><span>EXP</span><strong>${doc.data?.expirationDate || 'N/A'}</strong></div>
          </div>
          <div class="license-seal ${doc.errors.includes('suspicious_seal') ? 'tampered' : ''}">DMV OFFICIAL SEAL</div>
        </div>
        ${doc.errors.includes('suspicious_seal') ? '<div class="tampered-seal">SEAL TAMPERED</div>' : ''}
        ${easyHintNote}
      </div>
    `;
  }

  renderMissingDocumentDetail(docType, caseRecord) {
    const docName = this.game.caseGenerator.formatDocName(docType);
    const requestType = caseRecord?.requestType?.replace(/([A-Z])/g, ' $1').trim() || 'Request';

    return `
      <div class="doc-detail doc-review-note">
        <div class="doc-header">
          <h4>${docName}</h4>
          <span class="doc-status status-review">PENDING VERIFICATION</span>
        </div>
        <div class="doc-placeholder">
          <p><strong>Clerk note:</strong> Applicant states this document is unavailable at the window.</p>
          <p>Case type: ${requestType}</p>
          <p>Action required: confirm whether this document is mandatory before approval.</p>
          <p class="doc-subtle">No digital copy is attached to this case file.</p>
        </div>
      </div>
    `;
  }

  renderEmployeeManual(caseRecord) {
    const dept = this.game.player.department;
    const deptConfig = this.game.catalogs.departments[dept];
    const requestType = caseRecord.requestType;
    const currentRequired = deptConfig.requiredDocsByRequest[requestType] || [];

    const requestRows = Object.entries(deptConfig.requiredDocsByRequest).map(([type, docs]) => {
      const docsText = docs.map(d => this.game.caseGenerator.formatDocName(d)).join(', ');
      return `
        <tr class="${type === requestType ? 'active-request' : ''}">
          <td>${this.game.caseGenerator.formatRequestType(type)}</td>
          <td>${docsText || 'No documents required'}</td>
          <td>$${deptConfig.fees[type] ?? 0}</td>
        </tr>
      `;
    }).join('');

    const blockingRules = `
      <ul>
        <li><strong>Deny</strong> if any required document is missing.</li>
        <li><strong>Deny</strong> if a required document is expired.</li>
        <li><strong>Deny</strong> if authenticity cannot be verified (suspected fraud).</li>
        <li><strong>Deny</strong> with reason <strong>OutstandingViolations</strong> when unpaid tickets/violations block approval.</li>
        <li><strong>Deny</strong> when other blocking conditions are present (e.g. suspension, impound hold, required vision test).</li>
        <li><strong>Approve</strong> only when all required documents are present/valid and no blocking condition exists.</li>
      </ul>
    `;

    const processChecklist = `
      <ol class="manual-process-list">
        <li>Confirm request type and fee before reviewing any evidence.</li>
        <li>Check all required documents are present and currently valid.</li>
        <li>Cross-verify identifiers across documents and system records.</li>
        <li>Inspect formatting, dates, signatures, and seals for tampering indicators.</li>
        <li>Finalize with approve, deny, or escalate using the proper reason code.</li>
      </ol>
    `;

    const fraudChecklist = `
      <ul>
        <li>Mismatch in legal name, date of birth, address, VIN, plate, or citation identifiers.</li>
        <li>Signs of alteration such as overwritten values, inconsistent fonts, or low-quality seal/print marks.</li>
        <li>Issue and expiration dates that conflict with request timelines.</li>
        <li>Supporting evidence that does not match the request context or department records.</li>
      </ul>
    `;

    const licenseReference = `
      <div class="manual-license-reference">
        <p class="manual-reference-note">Use this as a baseline for an untampered state license card.</p>
        <div class="manual-license-card" aria-label="Reference sample of a valid driver's license">
          <div class="manual-license-head">
            <span>STATE OF RED TAPE</span>
            <span>CLASS C</span>
          </div>
          <div class="manual-license-title-row">
            <strong>DRIVER LICENSE</strong>
            <span>DL526471</span>
          </div>
          <div class="manual-license-grid">
            <div class="manual-license-photo" aria-hidden="true"></div>
            <div class="manual-license-fields">
              <div><span>NAME</span><strong>Zoe Lee</strong></div>
              <div><span>DOB</span><strong>4/20/1993</strong></div>
              <div><span>ADDRESS</span><strong>612 Lakeview Terrace</strong></div>
              <div><span>EXP</span><strong>Jan 14, 2032</strong></div>
            </div>
          </div>
          <div class="manual-license-foot">
            <span>SIGNATURE: Zoe Lee</span>
            <span>DMV OFFICIAL SEAL</span>
          </div>
        </div>
        <ul class="manual-license-checklist">
          <li>Header text and field labels should be crisp, evenly spaced, and correctly spelled.</li>
          <li>Photo area should sit flat with no lifted corners, tearing, or glue artifacts.</li>
          <li>Background watermark and seal should be present and consistently printed.</li>
        </ul>
      </div>
    `;

    const currentDocs = this.game.developmentMode
      ? (currentRequired.length > 0
        ? `<p><strong>Current case requires:</strong> ${currentRequired.map(d => this.game.caseGenerator.formatDocName(d)).join(', ')}.</p>`
        : '<p><strong>Current case requires:</strong> No supporting documents.</p>')
      : ''; 

    return `
      <div class="system-records employee-manual">
        <h4>Employee Manual — ${dept}</h4>
        ${currentDocs}
        <p><strong>Current request:</strong> ${this.game.caseGenerator.formatRequestType(requestType)}</p>

        <h5>Reference: Valid Driver License Mockup</h5>
        ${licenseReference}

        <h5>Required documents by request type</h5>
        <div class="manual-table-wrap">
          <table class="manual-table">
            <thead>
              <tr><th>Request Type</th><th>Required Documents</th><th>Fee</th></tr>
            </thead>
            <tbody>${requestRows}</tbody>
          </table>
        </div>

        <h5>Standard process</h5>
        ${processChecklist}

        <h5>Acceptable standards for current required documents</h5>
        ${this.renderDocumentStandardsTable(currentRequired)}

        <h5>Forgery/Fraud signs to check</h5>
        ${fraudChecklist}

        <h5>Disposition rules</h5>
        ${blockingRules}
      </div>
    `;
  }

  renderFlags(conditions, flags, issues = []) {
    if (!this.elements.flagsPanel) return;

    let conditionsSection = '<p class="no-flags">No special conditions.</p>';
    if (conditions.length > 0 || flags.length > 0) {
      conditionsSection = conditions.map((c, index) => `
        <div class="condition-item condition-${c.severity}">
          <span class="condition-icon">${c.blocksApproval ? '&#128683;' : '&#9888;'}</span>
          <div class="condition-detail">
            <strong>${c.type.replace(/_/g, ' ').toUpperCase()}</strong>
            <p>${c.detail}</p>
            ${c.blocksApproval ? '<span class="blocks-badge">BLOCKS APPROVAL</span>' : ''}
            ${this.game.developmentMode ? `<button type="button" class="btn btn-sm dev-report-btn" data-dev-report="condition" data-condition-index="${index}">Report Logic Issue</button>` : ''}
          </div>
        </div>
      `).join('') || '<p class="no-flags">No special conditions.</p>';
    }

    const conditionsHtml = this.game.developmentMode ? `
      <div class="conditions-panel">
        <h3>Conditions & Alerts (Dev)</h3>
        <div class="dev-report-actions">
          <button type="button" class="btn btn-sm dev-report-btn" data-dev-report="case">Report Case Logic</button>
        </div>
        ${conditionsSection}
        ${this.renderDevCaseFindings(issues)}
      </div>
    ` : '';

    this.elements.flagsPanel.innerHTML = `${conditionsHtml}`;

    if (this.game.developmentMode) {
      this.elements.flagsPanel.querySelectorAll('[data-dev-report]').forEach((button) => {
        button.addEventListener('click', () => {
          const reportType = String(button.dataset.devReport || 'case');
          const conditionIndex = Number(button.dataset.conditionIndex);
          const selectedCondition = Number.isInteger(conditionIndex) ? conditions[conditionIndex] : null;
          this.reportLogicIssue({
            source: reportType === 'condition' ? 'conditions_panel_condition' : 'conditions_panel_case',
            extra: {
              conditionIndex: Number.isInteger(conditionIndex) ? conditionIndex : null,
              selectedCondition: selectedCondition || null
            }
          });
        });
      });
    }
  }

  renderDevCaseFindings(issues = []) {
    if (!this.game.developmentMode) return '';

    const activeIssues = Array.isArray(issues) && issues.length
      ? issues
      : (Array.isArray(this.game.currentCase?.possibleIssues) ? this.game.currentCase.possibleIssues : []);
    const expected = this.game.currentCase?.correctAction || null;

    const issueRows = activeIssues.length
      ? activeIssues.map((issue) => {
        const severity = String(issue?.severity || 'info').toLowerCase();
        const docLabel = issue?.doc ? ` (${this.game.caseGenerator.formatDocName(issue.doc)})` : '';
        const text = issue?.description || issue?.type || 'Issue detected';
        return `<li class="case-finding-item severity-${severity}"><strong>${severity.toUpperCase()}</strong> ${text}${docLabel}</li>`;
      }).join('')
      : '<li class="case-finding-item severity-info">No detected issues in current case.</li>';

    const expectedLine = expected
      ? `${expected.action} / ${expected.reasonCode}: ${expected.explanation || 'No explanation provided.'}`
      : 'Unavailable.';

    return `
      <div class="case-findings-panel">
        <h4>Case Findings (Dev)</h4>
        <p class="case-findings-expected"><strong>Expected Decision:</strong> ${expectedLine}</p>
        <ul class="case-findings-list">${issueRows}</ul>
      </div>
    `;
  }

  renderDecisionPanel(data) {
    if (this.elements.escalateBtn) {
      this.elements.escalateBtn.style.display = 'none';
      this.elements.escalateBtn.disabled = true;
    }

    if (this.elements.denyBtn) {
      this.elements.denyBtn.onclick = () => {
        this.showDenyReasonOverlay();
      };
    }

    if (this.elements.decisionPanel && !this.elements.decisionPanel.querySelector('.stamp-tray')) {
      this.elements.decisionPanel.insertAdjacentHTML('afterbegin', `
        <div class="stamp-tray">
          <div class="stamp-token stamp-approve" draggable="true" data-action="Approve">APPROVE</div>
          <div class="stamp-token stamp-deny" draggable="true" data-action="Deny">DENY</div>
          <p class="stamp-help">Drag stamp onto application form to finalize.</p>
        </div>
      `);
    }

    this.elements.decisionPanel?.querySelectorAll('.stamp-token').forEach(stamp => {
      if (stamp.dataset.bound === 'true') return;
      stamp.dataset.bound = 'true';
      stamp.addEventListener('dragstart', (e) => {
        stamp.classList.add('dragging-stamp');
        e.dataTransfer?.setData('text/stamp-action', stamp.dataset.action || '');
      });
      stamp.addEventListener('dragend', () => stamp.classList.remove('dragging-stamp'));
      stamp.addEventListener('pointerdown', () => {
        document.querySelectorAll('.stamp-token').forEach(s => s.classList.remove('dragging-stamp'));
        stamp.classList.add('dragging-stamp');
      });
      stamp.addEventListener('click', () => {
        document.querySelectorAll('.stamp-token').forEach(s => s.classList.remove('dragging-stamp'));
        stamp.classList.add('dragging-stamp');
      });
    });

    this.updateDecisionDebugHints();
  }

  playReceiptPrinterSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const now = audioCtx.currentTime;

    const burst = (start, frequency, duration, gainValue) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    burst(now, 620, 0.06, 0.08);
    burst(now + 0.07, 540, 0.05, 0.07);
    burst(now + 0.13, 760, 0.08, 0.09);
  }

  showDenyReasonOverlay() {
    const catalogDenyCodes = this.game.catalogs?.reasonCodes?.Deny || {};
    const fallbackDenyCodes = {
      MissingDocument: 'Required document not provided',
      ExpiredDocument: 'One or more documents are expired',
      FailedVerification: 'Document verification failed',
      WrongForm: 'Submitted request form does not match requested service',
      OutstandingViolations: 'Unresolved violations on record',
      SuspendedLicense: 'License is currently suspended',
      InsuranceLapse: 'No valid insurance on file',
      FraudSuspected: 'Suspected fraudulent documentation',
      ImpoundHold: 'Vehicle under impound hold'
    };
    const denyCodes = {
      ...fallbackDenyCodes,
      ...catalogDenyCodes
    };
    const fixedDenyCodeOrder = [
      'ExpiredDocument',
      'FailedVerification',
      'FraudSuspected',
      'ImpoundHold',
      'InsuranceLapse',
      'MissingDocument',
      'OutstandingViolations',
      'SuspendedLicense',
      'WrongForm'
    ];
    if (!this.elements.denyReasonOverlay || !this.elements.denyReasonList) return;

    const correctAction = this.game.currentCase?.correctAction;
    const correctDenyReason = correctAction?.action === 'Deny'
      ? String(correctAction.reasonCode || '')
      : '';
    const correctReasonSet = new Set(
      (Array.isArray(correctAction?.applicableReasonCodes) && correctAction.applicableReasonCodes.length
        ? correctAction.applicableReasonCodes
        : [correctDenyReason]
      )
        .map((code) => String(code || '').trim())
        .filter(Boolean)
    );

    const reasonEntries = fixedDenyCodeOrder
      .map((code) => [code, denyCodes[code]])
      .filter(([, desc]) => typeof desc === 'string' && desc.trim().length > 0);

    const buildReasonButton = (code, desc) => {
      const isCorrect = this.game.developmentMode && correctReasonSet.has(code);
      const checkMarkup = isCorrect ? ' <span class="dev-checkmark" aria-hidden="true">&#10003;</span>' : '';
      const classes = `deny-reason-btn${isCorrect ? ' dev-correct-reason' : ''}`;

      return `
        <button type="button" class="${classes}" data-reason="${code}" title="${desc}">
          <span class="deny-reason-code">${code.replace(/([A-Z])/g, ' $1').trim()}</span>
          <span class="deny-reason-desc">${desc}</span>
          ${checkMarkup}
        </button>
      `;
    };

    const hardPlus = this.isHardPlusDifficulty();
    const titleEl = this.elements.denyReasonOverlay.querySelector('.deny-reason-card h3');
    const subtitleEl = this.elements.denyReasonOverlay.querySelector('.deny-reason-card p');
    if (titleEl) {
      titleEl.textContent = hardPlus ? 'Select All Denial Reasons' : 'Select Denial Reason';
    }
    if (subtitleEl) {
      subtitleEl.textContent = hardPlus
        ? 'Hard+ requires selecting every applicable deny reason before applying the DENY stamp.'
        : 'Choose the policy reason before applying the DENY stamp.';
    }

    const actionRow = hardPlus
      ? `
        <div class="deny-reason-select-actions">
          <span class="deny-selection-summary" data-deny-selection-summary="true">0 reasons selected</span>
          <button type="button" class="btn btn-primary" data-confirm-deny="true">Confirm Deny Reasons</button>
        </div>
      `
      : '';

    this.elements.denyReasonList.innerHTML = `
      <div class="deny-reason-grid">
        ${reasonEntries.map(([code, desc]) => buildReasonButton(code, desc)).join('')}
      </div>
      ${actionRow}
    `;

    this.elements.denyReasonOverlay.classList.remove('hidden');
  }

  updateDecisionDebugHints() {
    const applyLabel = (button, fallbackLabel, isCorrect) => {
      if (!button) return;
      if (!button.dataset.baseLabel) {
        button.dataset.baseLabel = fallbackLabel;
      }
      const base = button.dataset.baseLabel || fallbackLabel;
      button.classList.remove('dev-correct-decision');
      if (!this.game.developmentMode || !isCorrect) {
        button.textContent = base;
        return;
      }
      button.classList.add('dev-correct-decision');
      button.innerHTML = `${base} <span class="dev-checkmark" aria-hidden="true">&#10003;</span>`;
    };

    const correctAction = this.game.currentCase?.correctAction?.action;
    applyLabel(this.elements.approveBtn, 'Approve', correctAction === 'Approve');
    applyLabel(this.elements.denyBtn, 'Deny', correctAction === 'Deny');
  }

  formatSignedDelta(value, { plus = '+', minus = '-' } = {}) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric === 0) return '0';
    const absValue = Math.abs(numeric);
    return `${numeric > 0 ? plus : minus}${absValue}`;
  }

  formatReasonCodeLabel(action, reasonCode) {
    const normalizedCode = String(reasonCode || '').trim();
    if (!normalizedCode) return 'N/A';

    const actionReasons = this.game.catalogs?.reasonCodes?.[action] || {};
    const description = actionReasons[normalizedCode];
    const title = normalizedCode.replace(/([A-Z])/g, ' $1').trim();

    return description ? `${title} - ${description}` : title;
  }

  renderScenarioDeltaList(scenarioSummary = {}) {
    const deltas = scenarioSummary?.deltas || {};

    const rows = [
      { label: 'Customer Satisfaction', value: this.formatSignedDelta(deltas.customerSatisfactionScore, { plus: '+', minus: '-' }) },
      { label: 'Money', value: this.formatSignedDelta(deltas.money, { plus: '+$', minus: '-$' }) },
      { label: 'Manager Relationship', value: this.formatSignedDelta(deltas.supervisorRelationship, { plus: '+', minus: '-' }) },
      { label: 'EXP (Promotion Progress)', value: this.formatSignedDelta(deltas.promotionProgress, { plus: '+', minus: '-' }) },
      { label: 'Write-ups', value: this.formatSignedDelta(deltas.writeUps, { plus: '+', minus: '-' }) },
      { label: 'Complaints', value: this.formatSignedDelta(deltas.complaints, { plus: '+', minus: '-' }) },
      { label: 'Escalations', value: this.formatSignedDelta(deltas.escalations, { plus: '+', minus: '-' }) },
      { label: 'Major Errors', value: this.formatSignedDelta(deltas.policyMajor, { plus: '+', minus: '-' }) },
      { label: 'Minor Errors', value: this.formatSignedDelta(deltas.policyMinor, { plus: '+', minus: '-' }) }
    ];

    const statRows = rows
      .map((row) => `<div class="result-scenario-line"><span>${row.label}</span><strong>${row.value}</strong></div>`)
      .join('');

    return `
      <div class="result-scenario-summary">
        ${statRows}
      </div>
    `;
  }

  showResult(data) {
    this.lastResultData = data;
    const behavior = data?.difficultyBehavior || this.game.getCurrentDifficultyBehavior?.() || {};
    const difficultyId = String(this.game.getDifficultyProfile?.()?.id || this.game.difficulty || '').toLowerCase();
    const hardPlusStrict = difficultyId === 'hard' || difficultyId === 'nightmare';
    const playerRevealExplanations = behavior.shiftFeedbackMode === 'detailed';
    const playerRevealExpectedDecision = behavior.shiftFeedbackMode !== 'score_only';
    const revealExplanations = this.game.developmentMode || playerRevealExplanations;
    const revealExpectedDecision = this.game.developmentMode || playerRevealExpectedDecision;

    this.elements.gameScreen.classList.remove('hidden');
    this.elements.resultOverlay.classList.remove('hidden');

    const isCorrect = data.evaluation.correct;
    const icon = isCorrect ? '&#10004;' : '&#10008;';
    const resultClass = isCorrect ? 'correct' : 'incorrect';

    const selectedAction = String(data.playerDecision?.action || 'N/A');
    const selectedReasonCode = String(data.playerDecision?.reasonCode || '');
    const selectedReasonLabel = this.formatReasonCodeLabel(selectedAction, selectedReasonCode);
    const selectedDecisionLabel = selectedAction === 'Deny'
      ? `${selectedAction} (${selectedReasonLabel})`
      : selectedAction;

    const expectedAction = String(data.correctAction?.action || 'N/A');
    const expectedReasonCode = String(data.correctAction?.reasonCode || '');
    const expectedReasonCodes = Array.isArray(data.correctAction?.applicableReasonCodes)
      ? data.correctAction.applicableReasonCodes
      : [];
    const expectedReasonLabel = expectedAction === 'Deny' && !hardPlusStrict && expectedReasonCodes.length > 1
      ? `Any of: ${expectedReasonCodes.map((code) => code.replace(/([A-Z])/g, ' $1').trim()).join(', ')}`
      : this.formatReasonCodeLabel(expectedAction, expectedReasonCode);
    const expectedDecisionLabel = expectedAction === 'Deny'
      ? `${expectedAction} (${expectedReasonLabel})`
      : expectedAction;

    const playerCorrectActionHTML = data.correctAction && playerRevealExpectedDecision
      ? `
        <div class="correct-action ${resultClass}">
          <strong>Correct action was:</strong> ${expectedDecisionLabel}
          ${playerRevealExplanations ? `<p>${data.correctAction.explanation}</p>` : ''}
        </div>
      `
      : '';

    const scenarioSummaryHtml = this.game.developmentMode
      ? this.renderScenarioDeltaList(data.scenarioSummary)
      : '';

    let bribeHTML = '';
    if (data.bribeResult) {
      const bribeLabelMap = {
        accepted_got_away: 'Bribe Accepted (Got Away)',
        accepted_caught: 'Bribe Accepted (Caught)',
        declined: 'Bribe Declined'
      };
      const bribeLabel = bribeLabelMap[data.bribeResult] || 'Bribe Outcome';
      bribeHTML = `<div class="bribe-result bribe-${data.bribeResult}">
        ${bribeLabel}
      </div>`;
    }

    const playerFacingCardHtml = `
      <div class="result-card ${resultClass}">
        <div class="result-icon">${icon}</div>
        <h3>${data.npcName}</h3>
        <p class="result-action">Decision: <strong>${selectedDecisionLabel}</strong></p>
        ${bribeHTML}
        <div class="result-sentiment">
          <span class="sentiment-label">Customer Mood:</span>
          <span class="sentiment-value sentiment-${data.sentiment}">${data.sentiment}</span>
        </div>
        <div class="reaction-bubble">
          <p>"${data.reaction}"</p>
        </div>
        ${playerCorrectActionHTML}
        <div class="result-meta">
          <span>Processing Time: ${data.processingTime}s</span>
          <span>Queue: ${data.queueStatus.served}/${data.queueStatus.total}</span>
        </div>
      </div>
    `;

    if (this.game.developmentMode) {
      const decisionMatch = isCorrect ? 'MATCH' : 'MISMATCH';
      const debugExplanationHtml = data.correctAction && revealExpectedDecision && revealExplanations
        ? `<p class="result-dev-explainer">${data.correctAction.explanation}</p>`
        : '';

      this.elements.resultContent.innerHTML = `
        <div class="result-dialog-split ${resultClass}">
          <aside class="result-dev-panel">
            <h4>Dev Panel</h4>
            <div class="result-dev-status result-dev-status-${isCorrect ? 'match' : 'mismatch'}">${decisionMatch}</div>
            <div class="result-dev-block">
              <p><strong>Selected:</strong> ${selectedDecisionLabel}</p>
              <p><strong>Expected:</strong> ${expectedDecisionLabel}</p>
            </div>
            ${debugExplanationHtml}
            <div class="result-dev-block">
              <p><strong>Sentiment:</strong> ${data.sentiment}</p>
              <p><strong>Bribe Result:</strong> ${data.bribeResult || 'none'}</p>
              <p><strong>Processing Time:</strong> ${data.processingTime}s</p>
              <p><strong>Queue:</strong> ${data.queueStatus.served}/${data.queueStatus.total}</p>
            </div>
            ${scenarioSummaryHtml}
          </aside>
          <section class="result-player-panel">
            <h4>Player View</h4>
            ${playerFacingCardHtml}
          </section>
        </div>
      `;
    } else {
      this.elements.resultContent.innerHTML = playerFacingCardHtml;
    }

    this.elements.nextCustomerBtn.textContent =
      data.queueStatus.remaining > 0 ? 'Next Customer' : 'End Shift';
  }

  showBribe(data) {
    const tone = data?.difficultyBehavior?.bribeTone || this.game.getCurrentDifficultyBehavior?.().bribeTone || 'natural';
    const title = tone === 'obvious'
      ? 'Bribe Attempt!'
      : tone === 'disguised'
        ? 'Suspicious "Gift" Offer'
        : 'Improper Offer';
    const warningText = tone === 'obvious'
      ? 'This is a direct bribe attempt. Accepting can trigger immediate disciplinary action.'
      : tone === 'disguised'
        ? 'This may be framed as a harmless favor. Accepting still counts as bribery if discovered.'
        : 'Accepting money or favors to alter a decision is a serious conduct violation.';

    this.elements.gameScreen.classList.remove('hidden');
    this.elements.bribeOverlay.classList.remove('hidden');
    this.elements.bribeContent.innerHTML = `
      <div class="bribe-card">
        <div class="bribe-icon">&#128176;</div>
        <h3>${title}</h3>
        <p class="bribe-dialogue">"${data.dialogue}"</p>
        <p class="bribe-amount">Offer: <strong>$${data.bribeAmount}</strong></p>
        <p class="bribe-warning">${warningText}</p>
      </div>
    `;
  }

  showReview(data) {
    this.lastReviewData = data;
    this.elements.reviewScreen.classList.remove('hidden');
    const review = data.review;
    const summary = data.shiftSummary;
    const stats = data.playerStats;
    const weekly = data.weeklySummary || null;
    const feedbackMode = data.feedbackMode || 'summary';
    const mistakeFeedback = Array.isArray(data.mistakeFeedback) ? data.mistakeFeedback : [];
    const resignation = data.resignation || { triggered: false, message: '' };
    const morale = data.morale || null;
    const departmentPromotion = data.departmentPromotion || null;
    const careerProgression = data.careerProgression || this.game.getCareerProgressionSnapshot?.() || null;
    const careerPromotion = data.careerPromotion || null;
    const progressionMetrics = data.progressionMetrics || null;

    const compliance = data.complianceReport || null;
    const violations = compliance?.violations ?? 0;
    const warningsIssued = Math.max(0, Number(this.game.player?.performance?.currentShift?.policyErrors?.minor ?? 0));

    const gradeColors = { S: '#1f8f3b', A: '#2a7f3b', B: '#1c5fa8', C: '#a36212', D: '#a33a2e', F: '#8d3f91' };
    const weeklyTierLabel = {
      promotion: 'Promotion Track',
      solid: 'Solid Week',
      coaching: 'Coaching Week',
      warning: 'Formal Warning',
      standard: 'Standard Week'
    };

    const nextShiftNumber = Number(summary.shiftNumber || 0) + 1;
    const gotPromotion = Boolean(
      careerPromotion?.promotedWithinDepartment
      || careerPromotion?.transferredDepartment
      || departmentPromotion
    );
    const successfulDone = Number(careerProgression?.successfulShiftsAtRank || 0);
    const successfulNeeded = Number(careerProgression?.requiredSuccessfulShifts || 0);
    const qualifyingDone = Math.max(0, successfulDone);
    const qualifyingTarget = Math.max(0, successfulNeeded);
    const promotionBarPct = gotPromotion
      ? 100
      : (qualifyingTarget > 0 ? Math.min(100, Math.round((qualifyingDone / qualifyingTarget) * 100)) : 0);

    const resolvedReviewScore = Number.isFinite(Number(review?.score))
      ? Number(review.score)
      : Number(data?.shiftResult?.score || 0);
    const score = resolvedReviewScore;
    const baseStars = Math.max(1, Math.min(5, Math.round(score / 20)));
    const starRollSeed = ((Number(summary.shiftNumber || 0) * 13) + score + (warningsIssued * 7) + (data.shiftResult.isClean ? 9 : 0)) % 100;
    const bonusStar = starRollSeed > 84 && baseStars < 5 ? 1 : 0;
    const starCount = Math.min(5, baseStars + bonusStar);
    const starMarkup = Array.from({ length: 5 }, (_, idx) => `<span class="review-star${idx < starCount ? ' filled' : ''}">&#9733;</span>`).join('');

    const gradeSeed = (
      (Number(summary.shiftNumber || 0) * 97)
      + (resolvedReviewScore * 13)
      + String(review?.grade || 'F').charCodeAt(0)
    );
    const seededRange = (salt, min, max) => {
      const raw = Math.sin((gradeSeed + salt) * 12.9898) * 43758.5453;
      const normalized = raw - Math.floor(raw);
      return min + (normalized * (max - min));
    };
    const gradeStampStyle = [
      `--stamp-rot:${seededRange(3, -10, 10).toFixed(1)}deg`,
      `--stamp-skew:${seededRange(4, -7, 7).toFixed(1)}deg`
    ].join(';');

    const promotionHint = gotPromotion
      ? `Promotion approved: ${careerPromotion?.toRankTitle || careerProgression?.rankTitle || 'Advancement cleared'}.`
      : `${qualifyingDone} of ${qualifyingTarget || 0} qualifying shifts completed.`;

    const shiftMetrics = [
      { label: 'Citizens Processed', value: `${summary.customersServed} of ${summary.totalCustomers}` },
      { label: 'Revenue Generated', value: `$${data.shiftResult.earnings}` },
      { label: 'Violations', value: violations === 0 ? 'None - clean record' : `${violations}` },
      { label: 'Warnings Issued', value: `${warningsIssued}` }
    ];

    const typedMetricMarkup = shiftMetrics
      .map((entry, index) => `
        <p class="review-form-line review-typed-line" style="--line-order:${index};">
          <span>${entry.label}:</span>
          <strong>${entry.value}</strong>
        </p>
      `)
      .join('');

    if (feedbackMode === 'score_only') {
      if (this.elements.continueBtn) {
        this.elements.continueBtn.textContent = resignation.triggered ? '[ RETURN TO TITLE ]' : `BEGIN SHIFT #${nextShiftNumber} ->`;
      }
      this.elements.reviewScreen.classList.remove('dev-review-screen');
      this.elements.reviewContent.innerHTML = `
        <article class="review-card review-dmv-form ${gotPromotion ? 'is-promoted' : ''}">
          <div class="review-paper-holes" aria-hidden="true"></div>
          <div class="review-paper-coffee" aria-hidden="true"></div>
          <header class="review-form-header">
            <p class="review-form-kicker">FOR OFFICIAL USE ONLY</p>
            <h2>DEPT. OF MOTOR VEHICLES</h2>
            <p>Employee Performance Evaluation | Form DMV-3300B</p>
          </header>

          <section class="review-form-scoreband">
            <div class="review-grade-wrap">
              <span class="review-grade-label">GRADE</span>
              <div class="review-grade-box" style="--grade-ink:${gradeColors[review.grade] || '#2b2b2b'};">
                <strong class="review-grade-stamp" style="${gradeStampStyle}">${review.grade}</strong>
              </div>
            </div>
            <div class="review-score-main">
              <p>Performance Score: <strong>${resolvedReviewScore} / 100</strong></p>
              <p class="review-stars" aria-label="Star rating">${starMarkup}</p>
            </div>
          </section>

          <section class="review-form-section">
            <h3>Section A - Shift Metrics</h3>
            ${typedMetricMarkup}
            ${morale ? `<p class="review-form-line review-typed-line" style="--line-order:5;"><span>Morale:</span><strong>${morale.value}% (${morale.band})</strong></p>` : ''}
          </section>

          <section class="review-form-section">
            <h3>Section B - Promotion Status</h3>
            <div class="review-progress-row">
              <span>Promotion Queue</span>
              <strong>${qualifyingDone}/${qualifyingTarget || 0}</strong>
            </div>
            <div class="review-progress-track"><div class="review-progress-fill" style="width:${promotionBarPct}%;"></div></div>
            <p class="review-form-note">${promotionHint}</p>
          </section>

        </article>
      `;
      return;
    }

    const earnedAchievements = Array.isArray(data.newAchievements) ? data.newAchievements : [];
    const isDevMode = Boolean(this.game.developmentMode);
    const shiftPerf = this.game.player?.performance?.currentShift || {};
    const minorErrors = Number(shiftPerf?.policyErrors?.minor || 0);
    const majorErrors = Number(shiftPerf?.policyErrors?.major || 0);
    const complaints = Number(shiftPerf?.complaints || 0);
    const bribesAccepted = Number(shiftPerf?.bribesAccepted || 0);

    const cleanGateChecks = [
      {
        label: 'Minor policy errors must be 0',
        value: minorErrors,
        pass: minorErrors === 0
      },
      {
        label: 'Major policy errors must be 0',
        value: majorErrors,
        pass: majorErrors === 0
      },
      {
        label: 'Customer complaints must be 0',
        value: complaints,
        pass: complaints === 0
      },
      {
        label: 'Accepted bribes must be 0',
        value: bribesAccepted,
        pass: bribesAccepted === 0
      }
    ];
    const cleanGatePass = cleanGateChecks.every((entry) => entry.pass);

    const compactMistakes = mistakeFeedback.slice(0, 3);
    const hiddenMistakeCount = Math.max(0, mistakeFeedback.length - compactMistakes.length);
    const compactAchievements = earnedAchievements.slice(0, 2);
    const hiddenAchievementCount = Math.max(0, earnedAchievements.length - compactAchievements.length);
    const formatCaseLabel = (rawCaseId) => {
      const text = String(rawCaseId || '').trim();
      if (!text || text.includes('{{caseId}}')) return 'Case ?';
      return `Case ${text.replace(/^case[_-]/i, '')}`;
    };

    let feedbackSection = '';
    if (feedbackMode === 'detailed') {
      feedbackSection = mistakeFeedback.length
        ? `
          <h3 class="review-report-section">Mistake Breakdown</h3>
          <ul class="review-report-list review-mistake-list">
            ${compactMistakes.map((entry) => `<li>${formatCaseLabel(entry.caseId)}: ${entry.selectedAction}${entry.selectedReason ? ` (${entry.selectedReason})` : ''} -> ${entry.expectedAction}${entry.expectedReason ? ` (${entry.expectedReason})` : ''}</li>`).join('')}
            ${hiddenMistakeCount > 0 ? `<li>+${hiddenMistakeCount} more cases logged in record archive.</li>` : ''}
          </ul>
        `
        : `
          <h3 class="review-report-section">Mistake Breakdown</h3>
          <p class="review-report-line">No mistakes recorded this shift.</p>
        `;
    } else if (feedbackMode === 'summary') {
      feedbackSection = mistakeFeedback.length
        ? `
          <h3 class="review-report-section">Incorrect Decisions</h3>
          <ul class="review-report-list review-mistake-list">
            ${compactMistakes.map((entry) => `<li>${formatCaseLabel(entry.caseId)}: ${entry.selectedAction}${entry.selectedReason ? ` (${entry.selectedReason})` : ''} -> ${entry.expectedAction}${entry.expectedReason ? ` (${entry.expectedReason})` : ''}</li>`).join('')}
            ${hiddenMistakeCount > 0 ? `<li>+${hiddenMistakeCount} more cases logged in record archive.</li>` : ''}
          </ul>
        `
        : '';
    }

    const regularReviewHtml = `
      <article class="review-card review-dmv-form ${gotPromotion ? 'is-promoted' : ''}">
        <div class="review-paper-holes" aria-hidden="true"></div>
        <div class="review-paper-coffee" aria-hidden="true"></div>
        <header class="review-form-header">
          <p class="review-form-kicker">FOR OFFICIAL USE ONLY</p>
          <h2>DEPT. OF MOTOR VEHICLES</h2>
          <p>Employee Performance Evaluation | Form DMV-3300B</p>
        </header>

        <section class="review-form-scoreband">
          <div class="review-grade-wrap">
            <span class="review-grade-label">GRADE</span>
            <div class="review-grade-box" style="--grade-ink:${gradeColors[review.grade] || '#2b2b2b'};">
              <strong class="review-grade-stamp" style="${gradeStampStyle}">${review.grade}</strong>
            </div>
          </div>
          <div class="review-score-main">
            <p>Performance Score: <strong>${resolvedReviewScore} / 100</strong></p>
            <p class="review-stars" aria-label="Star rating">${starMarkup}</p>
          </div>
        </section>

        <section class="review-form-section">
          <h3>Section A - Shift Metrics</h3>
          ${typedMetricMarkup}
        </section>

        <section class="review-form-section">
          <h3>Section B - Promotion Status</h3>
          <div class="review-progress-row">
            <span>Qualifying Shifts Completed</span>
            <strong>${qualifyingDone}/${qualifyingTarget || 0}</strong>
          </div>
          <div class="review-progress-track"><div class="review-progress-fill" style="width:${promotionBarPct}%;"></div></div>
          <p class="review-form-note">${promotionHint}</p>
        </section>

        <section class="review-form-section">
          <h3>Section C - Supervisor Notes</h3>
          <p class="review-report-quote">"${review.comment}"</p>
          ${morale?.commentary ? `<p class="review-form-note">"${morale.commentary}"</p>` : ''}
          ${resignation.triggered ? `<p class="review-form-note">${resignation.message}</p>` : ''}
        </section>

        ${feedbackSection
          ? `<section class="review-form-section">${feedbackSection}</section>`
          : ''}

        ${earnedAchievements.length > 0
          ? `
            <section class="review-form-section review-achievement-box">
              <h3>Bonus Unlocked</h3>
              <ul class="review-report-list">
                ${compactAchievements.map((achievement) => `<li>${achievement.name}</li>`).join('')}
                ${hiddenAchievementCount > 0 ? `<li>+${hiddenAchievementCount} more commendation(s) filed.</li>` : ''}
              </ul>
            </section>
          `
          : ''}

      </article>
    `;

    if (this.elements.continueBtn) {
      this.elements.continueBtn.textContent = resignation.triggered ? '[ RETURN TO TITLE ]' : `BEGIN SHIFT #${nextShiftNumber} ->`;
    }

    this.elements.reviewScreen.classList.toggle('dev-review-screen', isDevMode);

    if (isDevMode) {
      const escapeForPre = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const debugSummary = {
        shiftNumber: summary.shiftNumber,
        department: this.game.player.department,
        rank: careerProgression?.rankTitle || null,
        unlockedDepartments: stats?.unlockedDepartments || [],
        score: review.score,
        grade: review.grade,
        shiftResult: data.shiftResult,
        weeklySummary: weekly,
        complianceReport: compliance,
        promotion: departmentPromotion || null,
        careerPromotion,
        progressionMetrics
      };

      const devKpis = [
        { label: 'Rank', value: careerProgression?.rankTitle || 'Clerk' },
        { label: 'Rank Progress', value: careerProgression ? `${careerProgression.shiftsAtRank}/${careerProgression.rankShiftTarget}` : 'N/A' },
        { label: 'Promotion-ready', value: careerProgression ? `${careerProgression.successfulShiftsAtRank}/${careerProgression.requiredSuccessfulShifts}` : 'N/A' },
        { label: 'Clean Streak To Promotion', value: careerProgression ? `${careerProgression.cleanConsecutiveAtRank}/${careerProgression.requiredCleanConsecutive || 0}` : 'N/A' },
        { label: 'Probation', value: stats.onProbation ? 'Active' : 'No' }
      ];

      const probationWriteUpsThreshold = Number(this.game.balancing?.supervisor?.probationWriteUps || 2);
      const warningSignals = [
        `Warnings issued (minor policy errors): ${warningsIssued}`,
        `Major policy errors: ${majorErrors}`,
        `Customer complaints: ${complaints}`,
        `Accepted bribes: ${bribesAccepted}`
      ];

      const probationReasons = [];
      if (stats.onProbation) {
        if (Number(stats.writeUps || 0) >= probationWriteUpsThreshold) {
          probationReasons.push(`Write-ups ${stats.writeUps}/${probationWriteUpsThreshold} meet probation threshold.`);
        }
        if (weekly?.probationStatus?.before === false && weekly?.probationStatus?.after === true) {
          probationReasons.push(`Entered probation this week during ${weeklyTierLabel[weekly?.tier] || weekly?.tier || 'weekly'} resolution.`);
        }
        if (progressionMetrics?.meetsMisconductRequirement === false) {
          probationReasons.push('Misconduct gate still failing; unresolved discipline flags remain.');
        }
        if (!probationReasons.length) {
          probationReasons.push('Probation flag carried from prior week. Check write-up history and weekly outcomes.');
        }
      } else {
        probationReasons.push(`Not on probation. Write-ups ${Number(stats.writeUps || 0)}/${probationWriteUpsThreshold}.`);
      }

      const devWeeklyLines = weekly
        ? [
          `Week #${weekly.weekNumber}`,
          `Tier: ${weeklyTierLabel[weekly.tier] || weekly.tier}`,
          `Directive: ${weekly.nextWeekDirective?.memo || 'Standard operations.'}`
        ]
        : ['Not an end-of-week resolution shift.'];

      const cleanStreakNeeded = Number(careerProgression?.requiredCleanConsecutive || 0);
      const cleanStreakCurrent = Number(careerProgression?.cleanConsecutiveAtRank || 0);
      const cleanStreakLines = cleanGateChecks.map((entry) => {
        const status = entry.pass ? 'PASS' : 'FAIL';
        const cssClass = entry.pass ? 'ok' : 'fail';
        return `<p class="${cssClass}">${status}: ${entry.label} (actual ${entry.value})</p>`;
      });
      const cleanStreakOutcomeLine = cleanGatePass
        ? `Incremented this shift. Current streak ${cleanStreakCurrent}${cleanStreakNeeded > 0 ? ` / ${cleanStreakNeeded} required for promotion gate` : ''}.`
        : `Did not increment. Failed checks: ${cleanGateChecks.filter((entry) => !entry.pass).map((entry) => entry.label).join('; ')}.`;

      this.elements.reviewContent.innerHTML = `
        <div class="review-dev-layout">
          <aside class="review-dev-panel">
            <h3>Dev Diagnostics</h3>
            <p class="review-dev-meta">Technical signals only. Player-facing metrics are shown in the report panel.</p>

            <div class="review-dev-kpi-grid">
              ${devKpis.map((entry) => `
                <div class="review-dev-kpi">
                  <span>${entry.label}</span>
                  <strong>${entry.value}</strong>
                </div>
              `).join('')}
            </div>

            <div class="review-dev-section">
              <h4>Weekly Resolution</h4>
              <div class="review-dev-list">
                ${devWeeklyLines.map((line) => `<p>${line}</p>`).join('')}
              </div>
            </div>

            <div class="review-dev-section">
              <h4>Warning Signals</h4>
              <div class="review-dev-list">
                ${warningSignals.map((line) => `<p>${line}</p>`).join('')}
              </div>
            </div>

            <div class="review-dev-section">
              <h4>Probation Reasoning</h4>
              <div class="review-dev-list">
                ${probationReasons.map((line) => `<p>${line}</p>`).join('')}
              </div>
            </div>

            <div class="review-dev-section">
              <h4>Promotion Gate: Clean Streak</h4>
              <div class="review-dev-list">
                <p><strong>Shift clean result:</strong> ${data.shiftResult.isClean ? 'YES' : 'NO'}</p>
                <p><strong>Gate outcome:</strong> ${cleanStreakOutcomeLine}</p>
                ${cleanStreakLines.join('')}
              </div>
            </div>

            <div class="review-dev-section">
              <h4>Generated Achievements</h4>
              <div class="review-dev-list">
                ${(earnedAchievements.length > 0
                  ? earnedAchievements.map((achievement) => `<p>${achievement.id}: ${achievement.name}</p>`)
                  : ['<p>No achievements generated this shift.</p>'])
                  .join('')}
              </div>
            </div>

            <details class="review-dev-raw">
              <summary>Raw payload</summary>
              <pre class="review-dev-pre">${escapeForPre(JSON.stringify(debugSummary, null, 2))}</pre>
            </details>
          </aside>
          <section class="review-main-panel">
            ${regularReviewHtml}
          </section>
        </div>
      `;
      return;
    }

    this.elements.reviewContent.innerHTML = regularReviewHtml;
  }

  showEventBanner(event) {
    if (this.elements.eventBanner && this.elements.eventText) {
      this.elements.eventText.innerHTML = `<strong>${event.name}:</strong> ${event.description}`;
      this.elements.eventBanner.classList.remove('hidden');
      this.elements.eventBanner.classList.add('animate-in');
      setTimeout(() => {
        this.elements.eventBanner.classList.add('hidden');
        this.elements.eventBanner.classList.remove('animate-in');
      }, 5000);
    }
  }

  showNotification(message, type = 'info') {
    if (!this.elements.notificationArea) return;
    const notif = document.createElement('div');
    notif.className = `notification notification-${type}`;
    notif.textContent = message;
    this.elements.notificationArea.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }

  hideOverlay() {
    if (this.elements.resultOverlay) {
      this.elements.resultOverlay.classList.add('hidden');
    }
  }

  hideBribeOverlay() {
    if (this.elements.bribeOverlay) {
      this.elements.bribeOverlay.classList.add('hidden');
    }
  }

  hideDocRequestOverlay() {
    if (this.elements.docRequestOverlay) {
      this.elements.docRequestOverlay.classList.add('hidden');
    }
  }

  hideFinePaymentOverlay() {
    if (this.elements.finePaymentOverlay) {
      this.elements.finePaymentOverlay.classList.add('hidden');
    }
  }

  hideDenyReasonOverlay() {
    if (this.elements.denyReasonOverlay) {
      this.elements.denyReasonOverlay.classList.add('hidden');
    }
  }
}


