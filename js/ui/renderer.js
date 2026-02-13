export class UIRenderer {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.currentDocTab = null;
  }

  init() {
    this.cacheElements();
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
      notificationArea: document.getElementById('notification-area')
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
    this.elements.gameScreen.classList.remove('hidden');

    // Update HUD
    this.updateHUD(data.queueStatus);

    // Customer panel
    this.renderCustomer(data);

    // System records in left pane (below request details)
    if (this.elements.queueDisplay) {
      this.elements.queueDisplay.innerHTML = this.renderSystemRecords(data.caseRecord);
    }

    // Documents presented on desk
    this.renderDocuments(data.documents, data.caseRecord, data.issues);

    // Right pane: employee manual + conditions
    this.renderFlags(data.conditions, data.npc.flags, data.caseRecord);

    // Decision panel
    this.renderDecisionPanel(data);

    // Hide overlays
    this.hideOverlay();
    this.hideBribeOverlay();
  }

  updateHUD(queueStatus) {
    if (this.elements.clockDisplay) {
      this.elements.clockDisplay.textContent = queueStatus.time;
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

  renderCustomer(data) {
    const npc = data.npc;
    const archetype = data.archetype;

    // Generate portrait
    if (this.elements.customerPortrait) {
      this.elements.customerPortrait.innerHTML = this.generatePortrait(npc);
    }

    if (this.elements.customerName) {
      this.elements.customerName.innerHTML = `
        <span class="name">${npc.fullName}</span>
        <span class="archetype-badge ${archetype?.id || ''}">${archetype?.name || 'Customer'}</span>
      `;
    }

    if (this.elements.customerGreeting) {
      this.elements.customerGreeting.innerHTML = `
        <div class="speech-bubble">
          <p>"${data.greeting}"</p>
        </div>
      `;
    }

    if (this.elements.customerInfo) {
      const requestName = data.caseRecord.requestType.replace(/([A-Z])/g, ' $1').trim();
      this.elements.customerInfo.innerHTML = `
        <div class="info-grid">
          <div class="info-item"><span class="label">Request:</span> <span class="value highlight">${requestName}</span></div>
          <div class="info-item"><span class="label">Age:</span> <span class="value">${npc.age}</span></div>
          <div class="info-item"><span class="label">Address:</span> <span class="value">${npc.identity.address}</span></div>
          <div class="info-item"><span class="label">Patience:</span> <span class="value">${this.renderPatienceBar(npc.personality.patience)}</span></div>
          <div class="info-item"><span class="label">Temperament:</span> <span class="value">${npc.personality.temperament}</span></div>
          <div class="info-item"><span class="label">Fee:</span> <span class="value">$${data.caseRecord.inputs.fee}</span></div>
          ${npc.isReturning ? '<div class="info-item returning"><span class="label">RETURNING CUSTOMER</span></div>' : ''}
        </div>
      `;
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
          <span class="paperwork-subtitle">Documents physically submitted by applicant</span>
        </div>
      `;
    }

    if (!this.elements.documentContent) return;

    if (providedDocs.length === 0) {
      this.elements.documentContent.innerHTML = `
        <div class="paper-stack-empty">
          <p>No documents were handed over at the desk.</p>
          <p class="doc-subtle">Use the system records and employee manual to determine required paperwork.</p>
        </div>
      `;
      return;
    }

    const stackHtml = providedDocs.map(({ docType, doc }, index) => {
      const tilt = ((index % 5) - 2) * 0.9;
      return `
        <article class="paper-sheet" style="--sheet-tilt:${tilt}deg; --sheet-layer:${index};">
          ${this.renderDocumentDetail(doc, docType, caseRecord)}
        </article>
      `;
    }).join('');

    this.elements.documentContent.innerHTML = `<div class="paper-stack">${stackHtml}</div>`;
  }

  renderSystemRecords(caseRecord) {
    const npc = this.game.currentNPC;
    const flags = npc.flags;
    const requiredDocs = caseRecord.inputs.requiredDocs || [];
    const providedDocs = Object.values(caseRecord.inputs.providedDocs || {}).filter(d => d.present).map(d => d.type);

    const checklistRows = requiredDocs.map(docType => {
      const label = this.game.caseGenerator.formatDocName(docType);
      const provided = providedDocs.includes(docType);
      return `
        <div class="record-check-item">
          <span>${label}</span>
          <span class="record-check-status ${provided ? 'provided' : 'missing'}">${provided ? 'Received' : 'Not Received'}</span>
        </div>
      `;
    }).join('');

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

    return `
      <div class="system-records left-system-records">
        <h4>System Records</h4>
        <div class="record-grid">
          <div><span class="label">Request:</span> ${this.game.caseGenerator.formatRequestType(caseRecord.requestType)}</div>
          <div><span class="label">Name:</span> ${npc.fullName}</div>
          <div><span class="label">DOB:</span> ${npc.identity.dob}</div>
          <div><span class="label">Address:</span> ${npc.identity.address}</div>
          <div><span class="label">Prior Visits:</span> ${npc.caseHistory.length}</div>
        </div>
        <div class="record-checklist">
          <h4>Required Checklist</h4>
          ${checklistRows || '<p class="no-flags">No required docs listed for this request.</p>'}
        </div>
        ${flagsHTML || '<p class="no-flags">No active flags on record.</p>'}
      </div>
    `;
  }

  renderDocumentDetail(doc, docType, caseRecord = null) {
    if (!doc || !doc.present) {
      return this.renderMissingDocumentDetail(docType, caseRecord);
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
        ${forgeryHints}
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

    const currentDocs = currentRequired.length > 0
      ? `<p><strong>Current case requires:</strong> ${currentRequired.map(d => this.game.caseGenerator.formatDocName(d)).join(', ')}.</p>`
      : '<p><strong>Current case requires:</strong> No supporting documents.</p>';

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

    const manualSection = caseRecord
      ? `<div class="manual-panel">${this.renderEmployeeManual(caseRecord)}</div>`
      : '';

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

    this.elements.flagsPanel.innerHTML = `
      ${manualSection}
      <div class="conditions-panel">
        <h3>Conditions & Alerts</h3>
        ${conditionsSection}
      </div>
    `;
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
