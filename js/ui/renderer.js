export class UIRenderer {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.currentDocTab = null;
    this.handbookPageIndex = 0;
    this.handbookPages = [];
    this.paperDragZ = 250;
  }

  init() {
    this.cacheElements();
    this.ensureHandbookOverlay();
    this.bindEvents();

    this.game.onStateChange = (data) => this.handleStateChange(data);
    this.game.onEvent = (event, data) => this.handleEvent(event, data);

    // Render current game state immediately in case init happened before UI hooks were attached.
    this.handleStateChange({ state: this.game.state });
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

      // Event banner
      eventBanner: document.getElementById('event-banner'),
      eventText: document.getElementById('event-text'),

      // Shift start
      shiftStartContent: document.getElementById('shift-start-content'),
      beginShiftBtn: document.getElementById('begin-shift-btn'),

      // Review
      reviewContent: document.getElementById('review-content'),
      continueBtn: document.getElementById('continue-btn'),

      // Queue display
      queueDisplay: document.getElementById('queue-display'),

      // Notification area
      notificationArea: document.getElementById('notification-area'),

      // Handbook overlay (created dynamically if missing)
      handbookOverlay: document.getElementById('handbook-overlay'),
      handbookContent: document.getElementById('handbook-content'),
      closeHandbookBtn: document.getElementById('close-handbook-btn'),
      handbookPrevBtn: document.getElementById('handbook-prev-btn'),
      handbookNextBtn: document.getElementById('handbook-next-btn'),
      handbookPageIndicator: document.getElementById('handbook-page-indicator'),

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
    this.elements.approveBtn?.addEventListener('click', () => this.game.makeDecision('Approve', 'AllDocumentsValid'));
    this.elements.escalateBtn?.addEventListener('click', () => this.game.makeDecision('Escalate', 'SupervisorRequired'));
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
    this.elements.continueBtn?.addEventListener('click', () => {
      this.game.state = 'menu';
      this.handleStateChange({ state: 'menu' });
    });

    this.elements.closeHandbookBtn?.addEventListener('click', () => this.closeHandbook());
    this.elements.handbookOverlay?.addEventListener('click', (e) => {
      if (e.target === this.elements.handbookOverlay) this.closeHandbook();
    });

    this.elements.handbookPrevBtn?.addEventListener('click', () => this.turnHandbookPage(-1));
    this.elements.handbookNextBtn?.addEventListener('click', () => this.turnHandbookPage(1));
  }

  ensureHandbookOverlay() {
    if (this.elements.handbookOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'handbook-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="handbook-shell">
        <div class="handbook-toolbar">
          <button id="close-handbook-btn" class="btn btn-sm">Close Handbook</button>
          <div class="handbook-nav">
            <button id="handbook-prev-btn" class="btn btn-sm">&#9664; Prev</button>
            <span id="handbook-page-indicator">Page 1/1</span>
            <button id="handbook-next-btn" class="btn btn-sm">Next &#9654;</button>
          </div>
        </div>
        <div id="handbook-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    this.elements.handbookOverlay = overlay;
    this.elements.handbookContent = overlay.querySelector('#handbook-content');
    this.elements.closeHandbookBtn = overlay.querySelector('#close-handbook-btn');
    this.elements.handbookPrevBtn = overlay.querySelector('#handbook-prev-btn');
    this.elements.handbookNextBtn = overlay.querySelector('#handbook-next-btn');
    this.elements.handbookPageIndicator = overlay.querySelector('#handbook-page-indicator');
  }

  openHandbook(caseRecord) {
    if (!this.elements.handbookOverlay || !caseRecord) return;
    this.handbookPages = this.getHandbookPages(caseRecord);
    this.handbookPageIndex = 0;
    this.renderHandbookPage();
    this.elements.handbookOverlay.classList.remove('hidden');
  }

  closeHandbook() {
    this.elements.handbookOverlay?.classList.add('hidden');
  }

  turnHandbookPage(direction) {
    if (!this.handbookPages.length) return;
    const next = this.handbookPageIndex + direction;
    if (next < 0 || next >= this.handbookPages.length) return;
    this.handbookPageIndex = next;
    this.renderHandbookPage();
  }

  getHandbookPages(caseRecord) {
    const dept = this.game.player.department;
    const deptConfig = this.game.catalogs.departments[dept];
    const requestType = caseRecord.requestType;
    const requestRows = Object.entries(deptConfig.requiredDocsByRequest).map(([type, docs]) =>
      `<tr><td>${this.game.caseGenerator.formatRequestType(type)}</td><td>${docs.map(d => this.game.caseGenerator.formatDocName(d)).join(', ')}</td><td>$${deptConfig.fees[type] ?? 0}</td></tr>`
    ).join('');

    return [
      {
        title: 'General Policy',
        body: `
          <div class="system-records employee-manual">
            <h4>Employee Manual — ${dept}</h4>
            <p><strong>Current request:</strong> ${this.game.caseGenerator.formatRequestType(requestType)}</p>
            <h5>Disposition rules</h5>
            <ul>
              <li>Deny if any required document is missing.</li>
              <li>Deny if any required document is expired.</li>
              <li>Deny if authenticity cannot be verified.</li>
              <li>Escalate when policy is ambiguous or special handling applies.</li>
              <li>Approve only when required materials are complete and valid.</li>
            </ul>
          </div>`
      },
      {
        title: 'Required Documents',
        body: `
          <div class="system-records employee-manual">
            <h4>Required Documents by Request Type</h4>
            <div class="manual-table-wrap"><table class="manual-table"><thead><tr><th>Request Type</th><th>Required Docs</th><th>Fee</th></tr></thead><tbody>${requestRows}</tbody></table></div>
          </div>`
      },
      {
        title: 'Fraud & Exception Handling',
        body: `
          <div class="system-records employee-manual">
            <h4>Fraud & Exceptions</h4>
            <ul>
              <li>Seal or print anomalies require denial or escalation.</li>
              <li>Mismatch with terminal records is treated as high risk.</li>
              <li>Outstanding blocking conditions supersede submitted documents.</li>
              <li>Document your reason code before stamping.</li>
            </ul>
          </div>`
      }
    ];
  }

  renderHandbookPage() {
    if (!this.elements.handbookContent) return;
    if (!this.handbookPages.length) {
      this.elements.handbookContent.innerHTML = '<p>No handbook pages available.</p>';
      return;
    }

    const page = this.handbookPages[this.handbookPageIndex];
    this.elements.handbookContent.innerHTML = `<div class="handbook-page"><h3>${page.title}</h3>${page.body}</div>`;
    if (this.elements.handbookPageIndicator) {
      this.elements.handbookPageIndicator.textContent = `Page ${this.handbookPageIndex + 1}/${this.handbookPages.length}`;
    }
    if (this.elements.handbookPrevBtn) this.elements.handbookPrevBtn.disabled = this.handbookPageIndex === 0;
    if (this.elements.handbookNextBtn) this.elements.handbookNextBtn.disabled = this.handbookPageIndex === this.handbookPages.length - 1;
  }

  handleStateChange(data) {
    this.hideAllScreens();

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
    if (event === 'chaos' || (data && data.type === 'chaos')) {
      const events = data.events || [];
      for (const evt of events) {
        this.showEventBanner(evt);
      }
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
      ` : '<p class="menu-note">Enable development hints for QA/testing visibility.</p>';

      stats.innerHTML = `
        ${summaryHtml}
        <label class="dev-mode-toggle" title="Enable additional UI hints for balancing and QA testing.">
          <input type="checkbox" id="dev-mode-toggle" ${this.game.developmentMode ? 'checked' : ''}>
          Development hints
        </label>
      `;
      stats.classList.remove('hidden');

      const toggle = stats.querySelector('#dev-mode-toggle');
      if (toggle) {
        toggle.addEventListener('change', () => {
          this.game.setDevelopmentMode(toggle.checked);
          this.showNotification(`Development hints ${toggle.checked ? 'enabled' : 'disabled'}.`);
          if (this.game.state === 'serving' && this.game.currentCase) {
            this.renderDocuments(this.game.currentCase.documents, this.game.currentCase.caseRecord, this.game.currentCase.possibleIssues);
          }
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
          <p><strong>Department:</strong> Department of Motor Vehicles</p>
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

    // Customer panel
    this.renderCustomer(data);

    // System records in left pane (below request details)
    if (this.elements.queueDisplay) {
      this.elements.queueDisplay.innerHTML = this.renderSystemRecords(data.caseRecord, data.conditions || []);
      this.bindRecordChecklist(data.caseRecord);
    }

    // Documents presented on desk
    this.renderDocuments(data.documents, data.caseRecord, data.issues);
    this.renderCustomerAcrossDesk(data);

    // Right pane: employee manual + conditions
    this.renderFlags(data.conditions, data.npc.flags, data.caseRecord);

    // Decision panel
    this.renderDecisionPanel(data);

    // Hide overlays
    this.hideOverlay();
    this.hideBribeOverlay();
  }

  renderCustomerAcrossDesk(data) {
    const npc = data.npc;
    if (this.elements.deskCustomerAvatar) {
      const initials = npc.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      this.elements.deskCustomerAvatar.innerHTML = `<span>${initials}</span>`;
    }
    if (this.elements.deskCustomerChat) {
      this.elements.deskCustomerChat.innerHTML = `<p>"${data.greeting}"</p>`;
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
  }

  getCurrentDateLabel() {
    const shift = Math.max(1, this.game.player?.shiftNumber || 1);
    const baseDate = new Date('1998-01-05T08:00:00');
    baseDate.setDate(baseDate.getDate() + shift - 1);
    return baseDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  renderCustomer(data) {
    const npc = data.npc;

    if (this.elements.customerPortrait) {
      this.elements.customerPortrait.innerHTML = '';
    }

    if (this.elements.customerName) {
      this.elements.customerName.innerHTML = `<span class="name">DMV TERMINAL</span><span class="archetype-badge">AS400</span>`;
    }

    if (this.elements.customerGreeting) {
      this.elements.customerGreeting.innerHTML = `
        <div class="speech-bubble terminal-log">
          <p>&gt; QUERY RESIDENT: ${npc.fullName.toUpperCase()}</p>
          <p>&gt; MATCH FOUND · FILE READY</p>
        </div>
      `;
    }

    if (this.elements.customerInfo) {
      const requestName = data.caseRecord.requestType.replace(/([A-Z])/g, ' $1').trim();
      const devDiagnostics = this.game.developmentMode ? `
        <div class="dev-diagnostics">
          <h4>Development Diagnostics</h4>
          <p>Temperament: <strong>${npc.personality.temperament}</strong></p>
          <p>Patience: ${this.renderPatienceBar(npc.personality.patience)}</p>
        </div>
      ` : '';

      const missionHtml = this.game.developmentMode ? `
        <details class="mission-card" open>
          <summary>Mission Briefing (Dev)</summary>
          <div class="mission-body">
            <p>Process a <strong>${requestName}</strong> request. Compare claims on paper with terminal truth and policy.</p>
            <p class="mission-secondary">Final authority comes from policy and on-file records, not customer claims.</p>
            <p><strong>Fee at stake:</strong> $${data.caseRecord.inputs.fee}</p>
          </div>
        </details>
      ` : '';

      this.elements.customerInfo.innerHTML = `${missionHtml}${devDiagnostics}`;
    }
  }

  generatePortrait(npc) {
    const appearance = npc.appearance;
    const colors = {
      black: '#2c2c2c', brown: '#8B4513', blonde: '#DAA520', red: '#CD5C5C',
      gray: '#808080', white: '#DCDCDC', 'dyed-blue': '#4169E1', 'dyed-pink': '#FF69B4'
    };
    const hairColor = colors[appearance.hair?.color] || '#6B4226';
    const bodyColors = { slim: '#FFE4C4', average: '#FFDAB9', heavy: '#F4A460', athletic: '#DEB887' };
    const skinColor = bodyColors[appearance.bodyType] || '#FFDAB9';

    let accessoryHTML = '';
    if (appearance.accessories?.includes('glasses')) {
      accessoryHTML += '<div class="portrait-glasses"></div>';
    }
    if (appearance.accessories?.includes('hat')) {
      accessoryHTML += '<div class="portrait-hat"></div>';
    }

    return `
      <div class="pixel-portrait" style="--hair-color: ${hairColor}; --skin-color: ${skinColor};">
        <div class="portrait-body"></div>
        <div class="portrait-head"></div>
        <div class="portrait-hair portrait-hair-${appearance.hair?.style || 'short'}"></div>
        <div class="portrait-eyes"></div>
        ${appearance.facialHair ? `<div class="portrait-facial-hair portrait-fh-${appearance.facialHair}"></div>` : ''}
        ${accessoryHTML}
        <div class="portrait-mood portrait-mood-neutral"></div>
      </div>
    `;
  }

  renderPatienceBar(patience) {
    const color = patience > 60 ? '#4CAF50' : patience > 30 ? '#FF9800' : '#f44336';
    return `<div class="patience-bar"><div class="patience-fill" style="width:${patience}%;background:${color}"></div></div>`;
  }

  renderDocuments(documents, caseRecord, issues) {
    const requiredDocs = caseRecord.inputs.requiredDocs;

    // Middle panel should represent paperwork physically provided by the NPC.
    const providedDocs = requiredDocs
      .map(docType => ({ docType, doc: documents[docType] }))
      .filter(entry => entry.doc && entry.doc.present);

    if (this.elements.documentTabs) {
      this.elements.documentTabs.innerHTML = `
        <div class="paperwork-header">
          <span class="paperwork-title">Desk Paperwork</span>
          <span class="paperwork-subtitle">Application + customer-submitted documents</span>
        </div>
      `;
    }

    if (!this.elements.documentContent) return;

    if (providedDocs.length === 0) {
      this.elements.documentContent.innerHTML = `
        <div class="desk-surface">
          <div class="paper-stack-empty">
            <p>No documents were handed over at the desk.</p>
            <p class="doc-subtle">Use the system records and employee manual to determine required paperwork.</p>
          </div>
        </div>
      `;
      return;
    }

    const applicationSheet = `<article class="paper-sheet application-sheet draggable-paper" data-paper-id="application" data-dropzone="application" style="--sheet-tilt:-1.2deg; --sheet-layer:0; left:14%; top:12%;">${this.renderApplicationForm(caseRecord)}</article>`;

    const stackHtml = applicationSheet + providedDocs.map(({ docType, doc }, index) => {
      const tilt = ((index % 5) - 2) * 0.9;
      return `
        <article class="paper-sheet doc-sheet doc-${docType} draggable-paper" data-paper-id="${docType}-${index}" style="--sheet-tilt:${tilt}deg; --sheet-layer:${index + 1}; left:${18 + ((index * 9) % 45)}%; top:${18 + ((index * 8) % 38)}%;">
          ${this.renderDocumentDetail(doc, docType, caseRecord)}
        </article>
      `;
    }).join('');

    this.elements.documentContent.innerHTML = `<div class="desk-surface"><div class="paper-stack">${stackHtml}</div></div>`;
    this.bindDraggablePapers();
  }

  bindDraggablePapers() {
    const root = this.elements.documentContent;
    if (!root) return;

    root.querySelectorAll('.draggable-paper').forEach(card => {
      const onPointerMove = (ev) => {
        card.style.left = `${ev.clientX - root.getBoundingClientRect().left - card.offsetWidth / 2}px`;
        card.style.top = `${ev.clientY - root.getBoundingClientRect().top - 20}px`;
      };

      const onPointerUp = (ev) => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        const stamp = document.querySelector('.stamp-token.dragging-stamp');
        if (stamp && card.dataset.dropzone === 'application') {
          this.applyStampDecision(stamp.dataset.action);
          stamp.classList.remove('dragging-stamp');
        }
      };

      card.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        card.style.zIndex = String(++this.paperDragZ);
        card.classList.add('drag-active');
        onPointerMove(ev);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', (e) => {
          card.classList.remove('drag-active');
          onPointerUp(e);
        }, { once: true });
      });
    });

    const appCard = root.querySelector('[data-dropzone="application"]');
    if (appCard) {
      appCard.addEventListener('dragover', (e) => e.preventDefault());
      appCard.addEventListener('drop', (e) => {
        e.preventDefault();
        const action = e.dataTransfer?.getData('text/stamp-action');
        if (action) this.applyStampDecision(action);
      });
      appCard.addEventListener('click', () => {
        const selected = document.querySelector('.stamp-token.dragging-stamp');
        if (selected) this.applyStampDecision(selected.dataset.action);
      });
    }
  }

  applyStampDecision(action) {
    if (!action) return;
    const denyReasons = Object.keys(this.game.catalogs.reasonCodes.Deny || {});
    const reason = action === 'Deny'
      ? (denyReasons[0] || 'MissingDocument')
      : (action === 'Escalate' ? 'SupervisorRequired' : 'AllDocumentsValid');
    this.game.makeDecision(action, reason);
  }

  renderSystemRecords(caseRecord, conditions = []) {
    const npc = this.game.currentNPC;
    const flags = npc.flags;
    const conditionRows = conditions.map(c => `<div class="record-check-item"><span>${c.type.replace(/_/g, ' ').toUpperCase()}</span><span class="record-check-status ${c.blocksApproval ? 'missing' : 'provided'}">${c.blocksApproval ? 'BLOCKING' : 'NOTICE'}</span></div>`).join('');
    const requiredDocs = caseRecord.inputs.requiredDocs || [];
    const providedDocs = Object.values(caseRecord.inputs.providedDocs || {}).filter(d => d.present).map(d => d.type);

    let flagsHTML = '';
    if (flags.length > 0) {
      flagsHTML = `
        <div class="system-flags compact-flags">
          <h4>Active Flags</h4>
          ${flags.map(f => `
            <div class="flag-item flag-${f.severity}">
              <span class="flag-icon">${f.severity === 'high' ? '!!!' : f.severity === 'med' ? '!!' : '!'}</span>
              <span class="flag-id">${f.flagId}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    const checklistState = this.game.getChecklistState(caseRecord.caseId || caseRecord.caseRecord?.caseId || caseRecord.caseId);
    const checklistBoxes = requiredDocs.map(docType => {
      const checked = Boolean(checklistState[docType]);
      return `
        <label class="record-checkbox-item ${checked ? 'is-checked' : ''}">
          <input type="checkbox" class="record-checkbox" data-case-id="${caseRecord.caseId}" data-doc-type="${docType}" ${checked ? 'checked' : ''}>
          <span>${this.game.caseGenerator.formatDocName(docType)}</span>
        </label>
      `;
    }).join('');

    const devCounts = this.game.developmentMode ? `
      <div class="record-grid dev-only-grid">
        <div><span class="label">Required Docs:</span> ${requiredDocs.length}</div>
        <div><span class="label">Submitted Docs:</span> ${providedDocs.length}</div>
      </div>
    ` : '';

    return `
      <div class="system-records left-system-records terminal-screen">
        <h4>Records Queue Entry</h4>
        <div class="record-grid">
          <div><span class="label">Case Type:</span> ${this.game.caseGenerator.formatRequestType(caseRecord.requestType)}</div>
          <div><span class="label">Prior Visits:</span> ${npc.caseHistory.length}</div>
        </div>
        ${devCounts}
        <div class="record-checklist">
          <h4>Verification Checklist</h4>
          <div class="record-checkbox-list">
            ${checklistBoxes || '<p class="no-flags">No required docs listed for this request.</p>'}
          </div>
        </div>
        ${flagsHTML || '<p class="no-flags">No active flags on record.</p>'}
        <div class="record-checklist">
          <h4>Terminal Alerts</h4>
          ${conditionRows || '<p class="no-flags">No special conditions.</p>'}
        </div>
      </div>
    `;
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

  bindRecordChecklist(caseRecord) {
    const root = this.elements.queueDisplay;
    if (!root || !caseRecord?.caseId) return;

    root.querySelectorAll('.record-checkbox').forEach(input => {
      input.addEventListener('change', () => {
        this.game.toggleChecklistItem(caseRecord.caseId, input.dataset.docType, input.checked);
        input.closest('.record-checkbox-item')?.classList.toggle('is-checked', input.checked);
      });
    });
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
    const seed = encodeURIComponent(`${holder}-${doc.data?.licenseNumber || 'dl'}`);
    const photoUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
    const statusText = showHints && doc.expired ? 'EXPIRED' : 'ON FILE';
    const statusClass = showHints && doc.expired ? 'status-expired' : 'status-received';

    return `
      <div class="doc-detail doc-drivers-license">
        <div class="license-topbar">
          <span>STATE DMV LICENSE</span>
          <span class="doc-status ${statusClass}">${statusText}</span>
        </div>
        <div class="license-body">
          <div class="license-photo"><img src="${photoUrl}" alt="License photo"></div>
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

        <h5>Disposition rules</h5>
        ${blockingRules}
      </div>
    `;
  }

  renderFlags(conditions, flags, caseRecord = null) {
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

    this.elements.flagsPanel.innerHTML = `
      <div class="handbook-shelf">
        <button id="open-handbook-btn" class="manual-toggle" type="button">Open Employee Handbook</button>
      </div>
      ${conditionsHtml}
    `;

    const openBtn = this.elements.flagsPanel.querySelector('#open-handbook-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openHandbook(caseRecord));
    }
  }

  renderDecisionPanel(data) {
    // Build deny reasons dropdown
    if (this.elements.denyReasons) {
      const reasons = this.game.catalogs.reasonCodes.Deny;
      this.elements.denyReasons.innerHTML = Object.entries(reasons).map(([code, desc]) =>
        `<button class="deny-reason-btn" data-reason="${code}" title="${desc}">${code.replace(/([A-Z])/g, ' $1').trim()}</button>`
      ).join('');

      this.elements.denyReasons.querySelectorAll('.deny-reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.game.makeDecision('Deny', btn.dataset.reason);
        });
      });
    }

    // Show/hide deny dropdown
    if (this.elements.denyBtn) {
      this.elements.denyBtn.onclick = () => {
        this.elements.denyReasons.classList.toggle('expanded');
      };
    }

    if (this.elements.decisionPanel && !this.elements.decisionPanel.querySelector('.stamp-tray')) {
      this.elements.decisionPanel.insertAdjacentHTML('afterbegin', `
        <div class="stamp-tray">
          <div class="stamp-token stamp-approve" draggable="true" data-action="Approve">APPROVE</div>
          <div class="stamp-token stamp-deny" draggable="true" data-action="Deny">DENY</div>
          <div class="stamp-token stamp-escalate" draggable="true" data-action="Escalate">ESCALATE</div>
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
  }

  showResult(data) {
    this.elements.gameScreen.classList.remove('hidden');
    this.elements.resultOverlay.classList.remove('hidden');

    const isCorrect = data.evaluation.correct;
    const icon = isCorrect ? '&#10004;' : '&#10008;';
    const resultClass = isCorrect ? 'correct' : 'incorrect';

    let correctActionHTML = '';
    if (!isCorrect && data.correctAction) {
      correctActionHTML = `
        <div class="correct-action">
          <strong>Correct action was:</strong> ${data.correctAction.action}
          <p>${data.correctAction.explanation}</p>
        </div>
      `;
    }

    let bribeHTML = '';
    if (data.bribeResult) {
      bribeHTML = `<div class="bribe-result bribe-${data.bribeResult}">
        ${data.bribeResult === 'accepted' ? 'Bribe Accepted' : 'Bribe Declined'}
      </div>`;
    }

    this.elements.resultContent.innerHTML = `
      <div class="result-card ${resultClass}">
        <div class="result-icon">${icon}</div>
        <h3>${data.npcName}</h3>
        <p class="result-action">Decision: <strong>${data.playerDecision.action}</strong></p>
        ${bribeHTML}
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
}
