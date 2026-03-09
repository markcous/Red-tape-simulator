import { DeskWorkspace } from '../../UI/DeskWorkspace/Scripts/desk-workspace.js';
import { DeskDocument } from '../../UI/DeskWorkspace/Scripts/desk-document.js';

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
      this.renderFlags(currentConditions, currentFlags);
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
    this.elements.denyReasonList?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-reason]');
      if (!button) return;
      this.hideDenyReasonOverlay();
      this.closeDeskTerminal();
      this.finalizeDecisionWithStamp('Deny', button.dataset.reason);
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
                  <tr><td>Deny</td><td>Missing/expired/failed verification or blocking legal condition.</td><td>MissingDocument, ExpiredDocument, FailedVerification, FraudSuspected</td></tr>
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
    const hasContinueData = Boolean(this.game.hasSaveData?.());
    if (this.elements.menuContinueBtn) {
      this.elements.menuContinueBtn.disabled = !hasContinueData;
      this.elements.menuContinueBtn.textContent = 'Continue';
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
        <div class="menu-slot-row">
          <div class="menu-slot-header">
            <strong>Slot ${slot.slot}</strong>
          </div>
          ${status}
          ${actionHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="menu-section">
        <h4>Save Slots</h4>
        <div class="menu-slot-list">${rows}</div>
        <div class="menu-action-row">
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
    const ok = this.game.loadMostRecentSave?.({ startGame: true });
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
      }
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
    this.renderFlags(data.conditions, data.npc.flags);

    // Decision panel
    this.renderDecisionPanel(data);

    // Hide overlays
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

    const meta = outcomeMeta[outcome] || outcomeMeta.return_queue;
    if (this.elements.docRequestContent) {
      this.elements.docRequestContent.innerHTML = `
        <div class="doc-request-card">
          <h3>${meta.title}</h3>
          <p>${meta.body}</p>
        </div>
      `;
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

  finalizeDecisionWithStamp(action, reasonCode) {
    this.applyVisualStamp(action);
    setTimeout(() => {
      this.game.makeDecision(action, reasonCode);
    }, 220);
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

    stack.querySelectorAll('.dev-relevant-field').forEach((element) => {
      element.classList.remove('dev-relevant-field');
    });

    if (!this.game.developmentMode) return;

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
        'vehicle identification number',
        'vin'
      ];

      return phrases.some((phrase) => text.includes(phrase));
    };

    stack.querySelectorAll(`.workspace-document ${candidateSelector}`).forEach((node) => {
      const labelNode = node.querySelector('span, .field-label, .request-key, .license-key') || node;
      if (isRelevantLabel(labelNode.textContent)) {
        node.classList.add('dev-relevant-field');
      }
    });

    explicitSelectors.forEach((selector) => {
      stack.querySelectorAll(`.workspace-document ${selector}`).forEach((node) => {
        node.classList.add('dev-relevant-field');
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

    this.elements.decisionPanel.querySelectorAll('.doc-request-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
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
      const response = this.game.skipToShiftEndSimulated?.() || { ok: false, message: 'Shift-end command is unavailable.' };
      if (response.ok) {
        this.closeDeskTerminal();
      }
      this.refreshDeskTerminalContext();
      return {
        ok: Boolean(response.ok),
        message: response.message || (response.ok ? 'Shift ended.' : 'Unable to end shift.'),
        outputLines: [response.message || (response.ok ? 'Shift ended.' : 'Unable to end shift.')]
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
      documentForms: this.getAllDocumentTypesForDevTerminal()
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
    const formDef = this.getScenarioFormDefinition(caseRecord.requestType);
    const difficultyProfile = this.game.getDifficultyProfile();
    const checklistMode = difficultyProfile.checklistMode || 'none';
    const requiredProof = requiredDocTypes.map((docType) => ({
      label: checklistMode === 'category'
        ? this.getChecklistCategoryLabel(docType)
        : this.game.caseGenerator.formatDocName(docType),
      checked: Boolean(providedDocs?.[docType]?.present)
    }));
    const difficultyId = difficultyProfile.id;
    const blankFieldValue = '________________';
    const vehicleRequestTypes = new Set(['VehicleRegistration', 'PlateRenewal', 'TitleTransfer', 'PermitApplication', 'PermitRenewal', 'VehicleRelease']);

    const currentAddress = licenseDoc?.data?.address || this.game.currentNPC?.identity?.address || 'PENDING VERIFICATION';
    const requestedAddress = caseRecord?.requestType === 'AddressChange'
      ? this.getAddressChangeTargetAddress(caseRecord, currentAddress, addressDoc?.data?.address)
      : (addressDoc?.data?.address || currentAddress);

    const formValues = {
      declaredLicenseId: licenseDoc?.data?.licenseNumber || insuranceDoc?.data?.policyNumber || 'PENDING VERIFICATION',
      declaredVin: titleDoc?.data?.vin || insuranceDoc?.data?.vin || registrationDoc?.data?.vin || 'PENDING VERIFICATION',
      declaredAddress: requestedAddress || 'PENDING VERIFICATION'
    };

    if (caseRecord?.requestType === 'NameChange') {
      formValues.oldLegalName = courtOrderDoc?.data?.oldName || licenseDoc?.data?.holderName || 'PENDING VERIFICATION';
      formValues.newLegalName = courtOrderDoc?.data?.newName || this.game.currentNPC?.fullName || 'PENDING VERIFICATION';
    }

    if (difficultyId === 'medium') {
      const omissions = this.getMediumFormOmissions(caseRecord);
      omissions.forEach((fieldKey) => {
        if (Object.prototype.hasOwnProperty.call(formValues, fieldKey)) {
          formValues[fieldKey] = blankFieldValue;
        }
      });
    }

    return {
      ...formDef,
      requestTypeLabel: this.game.caseGenerator.formatRequestType(caseRecord.requestType),
      submittedFormLabel: this.game.caseGenerator.formatRequestType(submittedFormType || caseRecord.requestType),
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
    const showHints = this.game.developmentMode;
    const holder = doc.data?.holderName || this.game.currentNPC?.fullName || 'Unknown';
    const licensePhotoId = doc.data?.licensePhotoId || this.game.currentNPC?.appearance?.photoId || null;
    const localPhotoAsset = this.game.getPhotoAsset(licensePhotoId, 'license');
    const seed = encodeURIComponent(`${holder}-${doc.data?.licenseNumber || 'dl'}`);
    const fallbackPhoto = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
    const photoMarkup = localPhotoAsset
      ? this.renderPhotoAssetMarkup(localPhotoAsset, { alt: 'License photo', className: 'license-photo-asset' })
      : `<img src="${fallbackPhoto}" alt="License photo" class="license-photo-asset">`;
    const statusText = showHints && doc.expired ? 'EXPIRED' : 'ON FILE';
    const statusClass = showHints && doc.expired ? 'status-expired' : 'status-received';

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
        <li><strong>Deny</strong> when blocking conditions are present (e.g. unpaid tickets threshold, suspension, impound hold, required vision test).</li>
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

  renderFlags(conditions, flags) {
    if (!this.elements.flagsPanel) return;

    let conditionsSection = '<p class="no-flags">No special conditions.</p>';
    if (conditions.length > 0 || flags.length > 0) {
      conditionsSection = conditions.map(c => `
        <div class="condition-item condition-${c.severity}">
          <span class="condition-icon">${c.blocksApproval ? '&#128683;' : '&#9888;'}</span>
          <div class="condition-detail">
            <strong>${c.type.replace(/_/g, ' ').toUpperCase()}</strong>
            <p>${c.detail}</p>
            ${c.blocksApproval ? '<span class="blocks-badge">BLOCKS APPROVAL</span>' : ''}
          </div>
        </div>
      `).join('') || '<p class="no-flags">No special conditions.</p>';
    }

    const conditionsHtml = this.game.developmentMode ? `
      <div class="conditions-panel">
        <h3>Conditions & Alerts (Dev)</h3>
        ${conditionsSection}
      </div>
    ` : '';

    this.elements.flagsPanel.innerHTML = `${conditionsHtml}`;
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

  showDenyReasonOverlay() {
    const denyCodes = this.game.catalogs?.reasonCodes?.Deny || {};
    if (!this.elements.denyReasonOverlay || !this.elements.denyReasonList) return;

    const correctAction = this.game.currentCase?.correctAction;
    const correctDenyReason = correctAction?.action === 'Deny'
      ? String(correctAction.reasonCode || '')
      : '';

    this.elements.denyReasonList.innerHTML = Object.entries(denyCodes)
      .map(([code, desc]) => {
        const isCorrect = this.game.developmentMode && correctDenyReason && code === correctDenyReason;
        const checkMarkup = isCorrect ? ' <span class="dev-checkmark" aria-hidden="true">&#10003;</span>' : '';
        const classes = `deny-reason-btn${isCorrect ? ' dev-correct-reason' : ''}`;
        return `<button type="button" class="${classes}" data-reason="${code}" title="${desc}">${code.replace(/([A-Z])/g, ' $1').trim()}${checkMarkup}</button>`;
      })
      .join('');

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
    const revealExplanations = this.game.developmentMode || behavior.shiftFeedbackMode === 'detailed';
    const revealExpectedDecision = this.game.developmentMode || behavior.shiftFeedbackMode !== 'score_only';

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
    const expectedReasonLabel = this.formatReasonCodeLabel(expectedAction, expectedReasonCode);
    const expectedDecisionLabel = expectedAction === 'Deny'
      ? `${expectedAction} (${expectedReasonLabel})`
      : expectedAction;

    const devDecisionCompare = this.game.developmentMode
      ? `
        <div class="result-decision-compare">
          <p><strong>Selected:</strong> ${selectedAction} (${selectedReasonLabel})</p>
          <p><strong>Expected:</strong> ${expectedAction} (${expectedReasonLabel})</p>
        </div>
      `
      : '';

    const correctActionHTML = data.correctAction && revealExpectedDecision
      ? `
        <div class="correct-action ${resultClass}">
          <strong>Correct action was:</strong> ${expectedDecisionLabel}
          ${revealExplanations ? `<p>${data.correctAction.explanation}</p>` : ''}
          ${devDecisionCompare}
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

    this.elements.resultContent.innerHTML = `
      <div class="result-card ${resultClass}">
        <div class="result-icon">${icon}</div>
        <h3>${data.npcName}</h3>
        <p class="result-action">Decision: <strong>${selectedDecisionLabel}</strong></p>
        ${bribeHTML}
        ${scenarioSummaryHtml}
        <div class="result-sentiment">
          <span class="sentiment-label">Customer Mood:</span>
          <span class="sentiment-value sentiment-${data.sentiment}">${data.sentiment}</span>
        </div>
        <div class="reaction-bubble">
          <p>"${data.reaction}"</p>
        </div>
        ${correctActionHTML}
        <div class="result-meta">
          <span>Processing Time: ${data.processingTime}s</span>
          <span>Queue: ${data.queueStatus.served}/${data.queueStatus.total}</span>
        </div>
      </div>
    `;

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

    const gradeColors = { S: '#FFD700', A: '#4CAF50', B: '#2196F3', C: '#FF9800', D: '#f44336', F: '#9C27B0' };
    const weeklyTierLabel = {
      promotion: 'Promotion Track',
      solid: 'Solid Week',
      coaching: 'Coaching Week',
      warning: 'Formal Warning',
      standard: 'Standard Week'
    };

    const isWeeklyReview = Boolean(weekly);

    if (feedbackMode === 'score_only') {
      if (this.elements.continueBtn) {
        this.elements.continueBtn.textContent = resignation.triggered ? '[ RETURN TO TITLE ]' : '[ CONTINUE ]';
      }
      this.elements.reviewScreen.classList.remove('dev-review-screen');
      this.elements.reviewContent.innerHTML = `
        <div class="review-card review-card-narrative review-report">
          <h2>SHIFT #${summary.shiftNumber} COMPLETE</h2>
          <p class="review-report-separator">--------------------------------</p>
          <p class="review-headline" style="color:${gradeColors[review.grade] || '#fff'}">Performance Score: ${review.score} / 100</p>
          ${morale ? `<p class="review-report-line">Morale: ${morale.value}% (${morale.band})</p>` : ''}
          ${morale?.commentary ? `<p class="review-report-quote">"${morale.commentary}"</p>` : ''}
          ${resignation.triggered ? `<p class="review-report-line">${resignation.message}</p>` : ''}
        </div>
      `;
      return;
    }

    const departmentLabel = this.game.catalogs?.departments?.[this.game.player.department]?.name || 'Department of Citizen Processing';
    const violations = compliance?.violations ?? 0;
    const warningsIssued = Math.max(0, Number(this.game.player?.performance?.currentShift?.policyErrors?.minor ?? 0));
    const appealsTriggered = compliance?.newAppeals ?? 0;
    const earnedAchievements = Array.isArray(data.newAchievements) ? data.newAchievements : [];
    const isDevMode = Boolean(this.game.developmentMode);
    const shiftPerf = this.game.player?.performance?.currentShift || {};
    const cleanBreakReasons = [];
    if (Number(shiftPerf?.policyErrors?.major || 0) > 0 || Number(shiftPerf?.policyErrors?.minor || 0) > 0) {
      cleanBreakReasons.push('policy errors');
    }
    if (Number(shiftPerf?.complaints || 0) > 0) {
      cleanBreakReasons.push('customer complaints');
    }
    if (Number(shiftPerf?.bribesAccepted || 0) > 0) {
      cleanBreakReasons.push('accepted bribe');
    }

    const performanceNotes = [];
    if (summary.customersServed >= summary.totalCustomers) {
      performanceNotes.push('Perfect Completion Rate');
    }
    if (careerProgression) {
      performanceNotes.push(`Clean Shift Streak: ${Number(careerProgression.cleanConsecutiveAtRank || 0)}`);
    }
    if (data.shiftResult.isClean) {
      // The streak value is already shown above.
    }
    if (departmentPromotion && isDevMode) {
      performanceNotes.push(`Promotion Active: ${this.game.catalogs?.departments?.[departmentPromotion]?.name || departmentPromotion}`);
    }
    if (careerPromotion?.promotedWithinDepartment) {
      performanceNotes.push(`Rank Promotion: ${careerPromotion.fromRankTitle} -> ${careerPromotion.toRankTitle}`);
    }
    if (careerPromotion?.transferredDepartment) {
      performanceNotes.push(`Transfer Memo: ${careerPromotion.toDepartmentLabel} assignment begins next shift.`);
    }
    if (progressionMetrics && Number.isFinite(progressionMetrics.weightedScore)) {
      performanceNotes.push(`Promotion Evaluation Score: ${progressionMetrics.weightedScore}`);
    }
    if (careerProgression) {
      const successDone = Number(careerProgression.successfulShiftsAtRank || 0);
      const successNeeded = Number(careerProgression.requiredSuccessfulShifts || 0);
      if (isDevMode && successNeeded > 0 && successDone < successNeeded) {
        performanceNotes.push(`Promotion Blocker: Successful shifts ${successDone}/${successNeeded}`);
      }

      const cleanDone = Number(careerProgression.cleanConsecutiveAtRank || 0);
      const cleanNeeded = Number(careerProgression.requiredCleanConsecutive || 0);
      if (!isDevMode && cleanDone === 0 && cleanNeeded > 0 && cleanBreakReasons.length) {
        performanceNotes.push(`Streak reset this shift due to ${cleanBreakReasons.join(', ')}.`);
      }

      if (isDevMode && careerProgression.requireBribeHandled && !careerProgression.bribeHandledAtRank) {
        performanceNotes.push('Promotion Blocker: Bribe situation must be handled correctly at least once.');
      }
    }
    if (isDevMode && progressionMetrics?.meetsMisconductRequirement === false) {
      performanceNotes.push('Promotion Blocker: Open misconduct/write-ups must be cleared.');
    }
    if (isWeeklyReview && weekly?.nextWeekDirective?.memo) {
      performanceNotes.push(`Weekly Directive: ${weekly.nextWeekDirective.memo}`);
    }
    if (!performanceNotes.length) {
      performanceNotes.push('Standard throughput maintained.');
    }

    let feedbackSection = '';
    if (feedbackMode === 'detailed') {
      feedbackSection = mistakeFeedback.length
        ? `
          <h3 class="review-report-section">Mistake Breakdown</h3>
          <ul class="review-report-list">
            ${mistakeFeedback.map((entry) => `<li>Case ${entry.caseId}: selected ${entry.selectedAction}${entry.selectedReason ? ` (${entry.selectedReason})` : ''}; expected ${entry.expectedAction}${entry.expectedReason ? ` (${entry.expectedReason})` : ''}. ${entry.explanation || ''}</li>`).join('')}
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
          <ul class="review-report-list">
            ${mistakeFeedback.map((entry) => `<li>Case ${entry.caseId}: ${entry.selectedAction}${entry.selectedReason ? ` (${entry.selectedReason})` : ''} -> expected ${entry.expectedAction}${entry.expectedReason ? ` (${entry.expectedReason})` : ''}.</li>`).join('')}
          </ul>
        `
        : '';
    }

    const regularReviewHtml = `
      <div class="review-card review-card-narrative review-report">
        <h2>SHIFT #${summary.shiftNumber} COMPLETE</h2>
        <p class="review-report-department">${departmentLabel}</p>
        <p class="review-report-separator">--------------------------------</p>

        <p class="review-headline" style="color:${gradeColors[review.grade] || '#fff'}">
          Grade: ${review.grade} (${review.score} / 100)
        </p>

        <p class="review-report-line">Citizens Processed: ${summary.customersServed} / ${summary.totalCustomers}</p>
        <p class="review-report-line">Revenue Generated: $${data.shiftResult.earnings}</p>

        <h3 class="review-report-section">Compliance Report</h3>
        <ul class="review-report-list">
          <li>Violations: ${violations}</li>
          <li>Warnings Issued: ${warningsIssued}</li>
          <li>Appeals Triggered: ${appealsTriggered}</li>
        </ul>

        <h3 class="review-report-section">Performance Notes</h3>
        <ul class="review-report-list">
          ${performanceNotes.map((note) => `<li>${note}</li>`).join('')}
        </ul>

        <h3 class="review-report-section">Supervisor Evaluation</h3>
        <p class="review-report-quote">"${review.comment}"</p>

        ${feedbackSection}
        ${morale ? `<p class="review-report-line"><strong>Morale:</strong> ${morale.value}% (${morale.band})</p>` : ''}
        ${morale?.commentary ? `<p class="review-report-quote">"${morale.commentary}"</p>` : ''}
        ${resignation.triggered ? `<p class="review-report-line">${resignation.message}</p>` : ''}

        ${earnedAchievements.length > 0
          ? `
            <h3 class="review-report-section">Achievements</h3>
            <ul class="review-report-list">
              ${earnedAchievements.map((achievement) => `<li>${achievement.name}</li>`).join('')}
            </ul>
          `
          : ''}
      </div>
    `;

    if (this.elements.continueBtn) {
      this.elements.continueBtn.textContent = resignation.triggered ? '[ RETURN TO TITLE ]' : '[ CONTINUE ]';
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

      const devAuditLines = compliance
        ? [
          `Audited: ${compliance.audited}`,
          `Violations: ${compliance.violations}`,
          `Cleared: ${compliance.cleared}`,
          `New Appeals: ${compliance.newAppeals}`,
          `Pending Appeals: ${compliance.pendingAppeals}`
        ]
        : ['No audit report generated for this shift.'];

      const devWeeklyLines = weekly
        ? [
          `Week #${weekly.weekNumber}`,
          `Tier: ${weeklyTierLabel[weekly.tier] || weekly.tier}`,
          `Directive: ${weekly.nextWeekDirective?.memo || 'Standard operations.'}`
        ]
        : ['Not an end-of-week resolution shift.'];

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
              <h4>Audit & Appeals</h4>
              <div class="review-dev-list">
                ${devAuditLines.map((line) => `<p>${line}</p>`).join('')}
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

  hideDenyReasonOverlay() {
    if (this.elements.denyReasonOverlay) {
      this.elements.denyReasonOverlay.classList.add('hidden');
    }
  }
}
