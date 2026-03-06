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
  AuctionInquiry: { formNumber: 'IMP-110', title: 'Impound Auction Information Request' }
};

export class UIRenderer {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.currentDocTab = null;
    this.handbookPageIndex = 0;
    this.handbookPages = [];
    this.showDevControls = false;
    this.devControlsStorageKey = 'redTapeShowDevControls';
    this.lastResultData = null;
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

    try {
      const enabled = localStorage.getItem(this.devControlsStorageKey) === '1';
      this.setDevControlsVisibility(enabled, { persist: false, notify: false });
    } catch (_err) {
      this.setDevControlsVisibility(false, { persist: false, notify: false });
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
  }

  cacheElements() {
    this.elements = {
      // Screens
      loadingScreen: document.getElementById('loading-screen'),
      menuScreen: document.getElementById('menu-screen'),
      gameScreen: document.getElementById('game-screen'),
      shiftStartScreen: document.getElementById('shift-start-screen'),
      reviewScreen: document.getElementById('review-screen'),

      // Menu
      startShiftBtn: document.getElementById('start-shift-btn'),
      newGameBtn: document.getElementById('new-game-btn'),
      menuStats: document.getElementById('menu-stats'),

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
    this.elements.startShiftBtn?.addEventListener('click', () => this.game.startShift());
    this.elements.newGameBtn?.addEventListener('click', () => {
      this.game.newGame();
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
      this.game.state = 'menu';
      this.handleStateChange({ state: 'menu' });
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
      'PlateRenewal'
    ];

    const parkingOrder = [
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

    const orderByDept = {
      DMV: dmvOrder,
      Parking: parkingOrder,
      Impound: impoundOrder
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
    const requestEntries = this.orderRequestEntries(dept, Object.entries(deptConfig.requiredDocsByRequest));
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
    const player = this.game.player;
    const stats = this.elements.menuStats;
    const settings = this.game.getSettings ? this.game.getSettings() : {
      autoSave: true,
      reducedMotion: false,
      highContrast: false
    };
    const hasSaveData = this.game.hasSaveData ? this.game.hasSaveData() : false;

    if (stats) {
      const summaryHtml = player.shiftsCompleted > 0 ? `
        <div class="stat-grid">
          <div class="stat-item"><span class="stat-label">Shifts Completed</span><span class="stat-value">${player.shiftsCompleted}</span></div>
          <div class="stat-item"><span class="stat-label">Department</span><span class="stat-value">${player.department}</span></div>
          <div class="stat-item"><span class="stat-label">Money</span><span class="stat-value">$${player.money}</span></div>
          <div class="stat-item"><span class="stat-label">Weekly Rating</span><span class="stat-value">${player.getWeeklyPerformance()}%</span></div>
          <div class="stat-item"><span class="stat-label">Clean Streak</span><span class="stat-value">${player.cleanShiftStreak}</span></div>
          <div class="stat-item"><span class="stat-label">Write-ups</span><span class="stat-value">${player.writeUps}</span></div>
        </div>
      ` : '';

      const devModeStatusHtml = this.game.developmentMode
        ? '<p class="menu-note dev-mode-status">Developer Mode: ON</p>'
        : '';

      const difficultyOptions = this.game.getDifficultyOptions().map((option) => {
        const selected = this.game.getDifficultyProfile().id === option.id ? 'selected' : '';
        return `<option value="${option.id}" ${selected}>${option.label}</option>`;
      }).join('');

      const difficultyHtml = `
        <label class="menu-select" title="Controls helper visibility and case complexity.">
          <span>Difficulty</span>
          <select id="difficulty-select">
            ${difficultyOptions}
          </select>
        </label>
      `;

      let devToolsHtml = '';
      if (this.showDevControls) {
        const deptOptions = (player.unlockedDepartments || ['DMV']).map(dept => {
          const deptName = this.game.catalogs?.departments?.[dept]?.name || dept;
          const selected = player.department === dept ? 'selected' : '';
          return `<option value="${dept}" ${selected}>${deptName}</option>`;
        }).join('');

        devToolsHtml = `
          <label class="menu-select" title="Select active department from unlocked departments.">
            <span>Department</span>
            <select id="department-select">
              ${deptOptions}
            </select>
          </label>
        `;
      }

      const persistenceHtml = `
        <div class="menu-section">
          <h4>Save Data</h4>
          <div class="menu-action-row">
            <button id="save-game-btn" type="button" class="btn btn-sm btn-primary">Save Now</button>
            <button id="load-game-btn" type="button" class="btn btn-sm" ${hasSaveData ? '' : 'disabled'}>Load Save</button>
          </div>
          <p class="menu-note">${hasSaveData ? 'A save file is available in browser storage.' : 'No save data found yet.'}</p>
        </div>
      `;

      const settingsHtml = `
        <div class="menu-section">
          <h4>Settings</h4>
          <label class="menu-checkbox">
            <input id="autosave-toggle" type="checkbox" ${settings.autoSave ? 'checked' : ''}>
            <span>Enable Auto Save</span>
          </label>
          <label class="menu-checkbox">
            <input id="reduced-motion-toggle" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}>
            <span>Reduce Motion</span>
          </label>
          <label class="menu-checkbox">
            <input id="high-contrast-toggle" type="checkbox" ${settings.highContrast ? 'checked' : ''}>
            <span>High Contrast UI</span>
          </label>
        </div>
      `;

      const menuStatsHtml = `${summaryHtml}${devModeStatusHtml}${difficultyHtml}${devToolsHtml}${persistenceHtml}${settingsHtml}`.trim();
      stats.innerHTML = menuStatsHtml;
      stats.classList.toggle('hidden', !menuStatsHtml);

      const difficultySelect = stats.querySelector('#difficulty-select');
      if (difficultySelect) {
        difficultySelect.addEventListener('change', () => {
          this.game.setDifficulty(difficultySelect.value);
          this.showNotification(`Difficulty set to ${this.game.getDifficultyLabel()}.`);
        });
      }

      const deptSelect = stats.querySelector('#department-select');
      if (deptSelect) {
        deptSelect.addEventListener('change', () => {
          const ok = this.game.setDepartment(deptSelect.value);
          if (!ok) {
            this.showNotification('Department selection failed.', 'error');
            deptSelect.value = this.game.player.department;
          }
        });
      }

      const saveButton = stats.querySelector('#save-game-btn');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          const ok = this.game.saveNow ? this.game.saveNow() : this.game.saveGame({ force: true });
          this.showNotification(ok ? 'Game saved.' : 'Unable to save game in this browser context.', ok ? 'success' : 'error');
          this.showMenu();
        });
      }

      const loadButton = stats.querySelector('#load-game-btn');
      if (loadButton) {
        loadButton.addEventListener('click', () => {
          const ok = this.game.loadFromSave ? this.game.loadFromSave() : this.game.loadGame();
          if (!ok) {
            this.showNotification('No save data to load.', 'warning');
          }
        });
      }

      const autoSaveToggle = stats.querySelector('#autosave-toggle');
      if (autoSaveToggle) {
        autoSaveToggle.addEventListener('change', () => {
          this.game.setSetting?.('autoSave', autoSaveToggle.checked);
          this.showNotification(`Auto save ${autoSaveToggle.checked ? 'enabled' : 'disabled'}.`);
          this.showMenu();
        });
      }

      const reducedMotionToggle = stats.querySelector('#reduced-motion-toggle');
      if (reducedMotionToggle) {
        reducedMotionToggle.addEventListener('change', () => {
          this.game.setSetting?.('reducedMotion', reducedMotionToggle.checked);
          this.applyVisualSettings();
        });
      }

      const highContrastToggle = stats.querySelector('#high-contrast-toggle');
      if (highContrastToggle) {
        highContrastToggle.addEventListener('change', () => {
          this.game.setSetting?.('highContrast', highContrastToggle.checked);
          this.applyVisualSettings();
        });
      }
    }

    this.elements.startShiftBtn.textContent = player.shiftsCompleted > 0 ? 'Start Next Shift' : 'Start First Shift';
  }

  showShiftStart(data) {
    this.elements.shiftStartScreen.classList.remove('hidden');
    this.elements.shiftStartContent.innerHTML = `
      <div class="shift-briefing">
        <h2>Shift #${data.shiftNumber}</h2>
        <div class="briefing-details">
          <p><strong>Department:</strong> ${data.departmentName || data.department || 'Department of Motor Vehicles'}</p>
          <p><strong>Difficulty:</strong> ${data.difficultyLabel || this.game.getDifficultyLabel()}</p>
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>Customers in Queue:</strong> ${data.customerCount}</p>
          <p><strong>Supervisor:</strong> ${data.supervisorName}</p>
          <p><strong>Pending Appeals:</strong> ${data.pendingAppeals ?? 0}</p>
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
      this.elements.performanceDisplay.innerHTML = `
        <span class="label">${this.game.player.department}</span>
        <span class="value">Clerk</span>
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

    const uniqueDocTypes = new Set();
    Object.values(deptConfig.requiredDocsByRequest).forEach((docs) => {
      (docs || []).forEach((docType) => uniqueDocTypes.add(docType));
    });
    return Array.from(uniqueDocTypes);
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
    if (!this.game.developmentMode) {
      return { ok: false, message: 'Developer mode is required.' };
    }

    const { command, target, id, payload } = commandPayload;
    const normalizedCommand = String(command || '').toLowerCase();
    const normalizedTarget = String(target || '').toLowerCase();
    const requestedId = String(id || '').trim();

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
    const requiredProof = requiredDocTypes.map((docType) => ({
      label: this.game.caseGenerator.formatDocName(docType),
      checked: Boolean(providedDocs?.[docType]?.present)
    }));
    const difficultyProfile = this.game.getDifficultyProfile();
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
      includeSupportingChecklist: Boolean(difficultyProfile.includeSupportingChecklist),
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
    const showHints = this.game.developmentMode;
    let statusClass = showHints ? 'valid' : 'received';
    let statusText = showHints ? 'VALID' : 'ON FILE';
    if (showHints && doc.forged) {
      statusClass = 'forged';
      statusText = 'SUSPICIOUS';
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

    const correctActionHTML = data.correctAction
      ? `
        <div class="correct-action ${resultClass}">
          <strong>Correct action was:</strong> ${expectedDecisionLabel}
          <p>${data.correctAction.explanation}</p>
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
    this.elements.gameScreen.classList.remove('hidden');
    this.elements.bribeOverlay.classList.remove('hidden');
    this.elements.bribeContent.innerHTML = `
      <div class="bribe-card">
        <div class="bribe-icon">&#128176;</div>
        <h3>Bribe Attempt!</h3>
        <p class="bribe-dialogue">"${data.dialogue}"</p>
        <p class="bribe-amount">Offer: <strong>$${data.bribeAmount}</strong></p>
        <p class="bribe-warning">Accepting bribes is a serious offense. If caught, you will receive a write-up.</p>
      </div>
    `;
  }

  showReview(data) {
    this.elements.reviewScreen.classList.remove('hidden');
    const review = data.review;
    const summary = data.shiftSummary;
    const stats = data.playerStats;
    const weekly = data.weeklySummary || null;

    let achievementsHTML = '';
    if (data.newAchievements.length > 0) {
      achievementsHTML = `
        <div class="achievements-section">
          <h3>New Achievements!</h3>
          ${data.newAchievements.map(a => `
            <div class="achievement-item">
              <span class="achievement-icon">&#127942;</span>
              <span class="achievement-name">${a.name}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    let eventsHTML = '';
    if (summary.events.length > 0) {
      eventsHTML = `
        <div class="events-section">
          <h3>Shift Events</h3>
          ${summary.events.map(e => `
            <div class="event-item">
              <span class="event-time">${e.time}</span>
              <span class="event-name">${e.name}</span>
              <p>${e.description}</p>
            </div>
          `).join('')}
        </div>
      `;
    }

    const compliance = data.complianceReport || null;
    let complianceHTML = '';
    if (compliance) {
      complianceHTML = `
        <div class="review-details">
          <h3>Audit & Appeals</h3>
          <div class="detail-grid">
            <div class="detail-item">Audited Cases: ${compliance.audited}</div>
            <div class="detail-item">Violations: ${compliance.violations}</div>
            <div class="detail-item">Cleared: ${compliance.cleared}</div>
            <div class="detail-item">New Appeals: ${compliance.newAppeals}</div>
            <div class="detail-item">Pending Appeals: ${compliance.pendingAppeals}</div>
          </div>
        </div>
      `;
    }

    const gradeColors = { S: '#FFD700', A: '#4CAF50', B: '#2196F3', C: '#FF9800', D: '#f44336', F: '#9C27B0' };
    const weeklyTierLabel = {
      promotion: 'Promotion Track',
      solid: 'Solid Week',
      coaching: 'Coaching Week',
      warning: 'Formal Warning',
      standard: 'Standard Week'
    };

    let weeklyHTML = '';
    if (weekly) {
      const adjustmentRows = [
        { label: 'Money', value: weekly.adjustments?.money || 0, format: (v) => `${v > 0 ? '+' : ''}$${v}` },
        { label: 'Promotion Progress', value: weekly.adjustments?.promotionProgress || 0, format: (v) => `${v > 0 ? '+' : ''}${v}` },
        { label: 'Supervisor Relationship', value: weekly.adjustments?.supervisorRelationship || 0, format: (v) => `${v > 0 ? '+' : ''}${v}` },
        { label: 'Write-ups', value: weekly.adjustments?.writeUps || 0, format: (v) => `${v > 0 ? '+' : ''}${v}` },
        { label: 'Audit Risk', value: weekly.adjustments?.auditRisk || 0, format: (v) => `${v > 0 ? '+' : ''}${v}` }
      ];

      weeklyHTML = `
        <div class="review-details">
          <h3>End of Week #${weekly.weekNumber}</h3>
          <div class="detail-grid">
            <div class="detail-item">Weekly Performance: ${weekly.weeklyPerf}%</div>
            <div class="detail-item">Tier: ${weeklyTierLabel[weekly.tier] || weekly.tier}</div>
            <div class="detail-item">Probation: ${weekly.probationStatus?.after ? 'Active' : 'No'}</div>
            <div class="detail-item">Next Week Directive: ${weekly.nextWeekDirective?.memo || 'Standard operations.'}</div>
          </div>
          <div class="detail-grid">
            ${adjustmentRows.map((item) => `<div class="detail-item">${item.label}: ${item.format(item.value)}</div>`).join('')}
          </div>
          <div class="consequences-section">
            ${(weekly.outcomes || []).map((outcome) => `<p class="consequence">${outcome}</p>`).join('')}
          </div>
        </div>
      `;
    }

    this.elements.reviewContent.innerHTML = `
      <div class="review-card">
        <h2>End of Shift #${summary.shiftNumber}</h2>

        <div class="score-display">
          <div class="score-grade" style="color:${gradeColors[review.grade] || '#fff'}">${review.grade}</div>
          <div class="score-number">${review.score}/100</div>
        </div>

        <div class="supervisor-comment">
          <div class="supervisor-avatar">&#128100;</div>
          <div class="comment-bubble">
            <p class="commenter">${review.supervisorName}:</p>
            <p>"${review.comment}"</p>
          </div>
        </div>

        <div class="review-details">
          <h3>Performance Breakdown</h3>
          <div class="detail-grid">
            ${review.detailedFeedback.map(f => `<div class="detail-item">${f}</div>`).join('')}
          </div>
        </div>

        <div class="shift-stats">
          <h3>Shift Summary</h3>
          <div class="stat-grid">
            <div class="stat-item"><span class="stat-label">Customers Served</span><span class="stat-value">${summary.customersServed}/${summary.totalCustomers}</span></div>
            <div class="stat-item"><span class="stat-label">End Time</span><span class="stat-value">${summary.endTime}</span></div>
            <div class="stat-item"><span class="stat-label">Earnings</span><span class="stat-value">+$${data.shiftResult.earnings}</span></div>
            <div class="stat-item"><span class="stat-label">Clean Streak</span><span class="stat-value">${data.shiftResult.streak}</span></div>
          </div>
        </div>

        ${eventsHTML}

        ${complianceHTML}

        ${weeklyHTML}

        <div class="consequences-section">
          <h3>Outcomes</h3>
          ${review.consequences.map(c => `<p class="consequence">${c}</p>`).join('')}
        </div>

        ${achievementsHTML}

        <div class="career-stats">
          <h3>Career Overview</h3>
          <div class="stat-grid">
            <div class="stat-item"><span class="stat-label">Total Money</span><span class="stat-value">$${stats.money}</span></div>
            <div class="stat-item"><span class="stat-label">Shifts Completed</span><span class="stat-value">${stats.shiftsCompleted}</span></div>
            <div class="stat-item"><span class="stat-label">Weekly Rating</span><span class="stat-value">${stats.weeklyPerf}%</span></div>
            <div class="stat-item"><span class="stat-label">Write-ups</span><span class="stat-value">${stats.writeUps}</span></div>
            <div class="stat-item"><span class="stat-label">Promotion Progress</span><span class="stat-value">${stats.promotionProgress || 0}</span></div>
            <div class="stat-item"><span class="stat-label">Supervisor Relationship</span><span class="stat-value">${stats.supervisorRelationship || 0}</span></div>
            <div class="stat-item"><span class="stat-label">Probation</span><span class="stat-value">${stats.onProbation ? 'Active' : 'No'}</span></div>
          </div>
        </div>
      </div>
    `;
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
