import { PlayerState } from './models/player.js';
import { NPCGenerator } from './systems/npc-generator.js';
import { CaseGenerator } from './systems/case-generator.js';
import { SupervisorSystem } from './systems/supervisor.js';
import { ShiftManager } from './systems/shift-manager.js';
import { SeededRNG } from './models/rng.js';

export const GamePhase = Object.freeze({
  LOADING: 'loading',
  MENU: 'menu',
  SHIFT_START: 'shift_start',
  SERVING: 'serving',
  RESULT: 'result',
  BRIBE: 'bribe',
  REVIEW: 'review'
});

export class Game {
  constructor() {
    this.player = null;
    this.npcGenerator = null;
    this.caseGenerator = null;
    this.supervisor = null;
    this.shiftManager = null;
    this.catalogs = null;
    this.balancing = null;
    this.dialogueData = null;

    // Centralized game state
    this.gameState = {
      phase: GamePhase.LOADING,
      day: 1,
      shiftTimeRemaining: null,
      currentNPC: null,
      currentCase: null,
      currentDocReview: null,
      caseStartTime: 0,
      npcPool: [],
      auditRisk: 0,
      reputation: 0,
      eventLog: [],
      eventCounter: 0,
      seed: Date.now(),
      developmentMode: false,
      caseChecklist: {},
      manualOpen: true,
      pendingAppeals: [],
      auditHistory: []
    };

    this.runRng = new SeededRNG(this.gameState.seed);

    // UI callback
    this.onStateChange = null;
    this.onEvent = null;
  }

  get state() {
    return this.gameState.phase;
  }

  set state(phase) {
    this.gameState.phase = phase;
  }

  get currentNPC() {
    return this.gameState.currentNPC;
  }

  set currentNPC(npc) {
    this.gameState.currentNPC = npc;
  }

  get currentCase() {
    return this.gameState.currentCase;
  }

  set currentCase(caseData) {
    this.gameState.currentCase = caseData;
  }

  get caseStartTime() {
    return this.gameState.caseStartTime;
  }

  set caseStartTime(timestamp) {
    this.gameState.caseStartTime = timestamp;
  }

  get npcPool() {
    return this.gameState.npcPool;
  }

  set npcPool(pool) {
    this.gameState.npcPool = pool;
  }

  get developmentMode() {
    return this.gameState.developmentMode;
  }

  setDevelopmentMode(enabled) {
    this.gameState.developmentMode = Boolean(enabled);
    this.logEvent('DEVELOPMENT_MODE_CHANGED', { enabled: this.gameState.developmentMode });
    this.saveGame();
    this.emit('event', {
      type: 'devMode',
      enabled: this.gameState.developmentMode
    });
  }

  setManualOpen(isOpen) {
    this.gameState.manualOpen = Boolean(isOpen);
  }

  toggleChecklistItem(caseId, docType, checked) {
    if (!caseId || !docType) return;
    if (!this.gameState.caseChecklist[caseId]) this.gameState.caseChecklist[caseId] = {};
    this.gameState.caseChecklist[caseId][docType] = Boolean(checked);
  }

  getChecklistState(caseId) {
    return this.gameState.caseChecklist[caseId] || {};
  }

  runAuditAndAppeals() {
    const currentShift = this.player?.shiftNumber || 0;
    const cases = this.gameState.eventLog.filter(e => e.shift === currentShift && e.type === 'CASE_RESOLVED');
    const sampleSize = Math.min(cases.length, Math.max(1, Math.floor(cases.length * 0.35)));
    const sampled = this.runRng.shuffle(cases).slice(0, sampleSize);

    const auditFindings = sampled.map(event => ({
      caseId: event.payload.caseId,
      result: event.payload.correct ? 'cleared' : 'violation',
      decision: event.payload.decision?.action || 'Unknown'
    }));

    const violations = auditFindings.filter(f => f.result === 'violation').length;
    if (violations > 0) {
      this.player.writeUps += violations;
      this.player.totalWriteUps += violations;
    }

    const appealsFromShift = cases
      .filter(e => e.payload.decision?.action === 'Deny' && this.runRng.chance(0.4))
      .slice(0, 3)
      .map(e => ({
        caseId: e.payload.caseId,
        npcId: e.payload.npcId,
        filedAtShift: currentShift,
        status: 'pending'
      }));

    this.gameState.pendingAppeals.push(...appealsFromShift);
    if (this.gameState.pendingAppeals.length > 30) {
      this.gameState.pendingAppeals = this.gameState.pendingAppeals.slice(-30);
    }

    const complianceReport = {
      audited: sampled.length,
      violations,
      cleared: sampled.length - violations,
      newAppeals: appealsFromShift.length,
      pendingAppeals: this.gameState.pendingAppeals.length,
      findings: auditFindings.slice(0, 5)
    };

    this.gameState.auditHistory.push({ shift: currentShift, ...complianceReport });
    if (this.gameState.auditHistory.length > 20) this.gameState.auditHistory.shift();

    return complianceReport;
  }

  setSeed(seed) {
    this.gameState.seed = seed;
    this.runRng = new SeededRNG(seed);
  }

  getDeterministicRng(salt = 0) {
    return new SeededRNG(this.gameState.seed + this.gameState.eventCounter++ + salt);
  }

  logEvent(type, payload = {}) {
    this.gameState.eventLog.push({
      at: new Date().toISOString(),
      shift: this.player?.shiftNumber ?? 0,
      type,
      payload
    });
    if (this.gameState.eventLog.length > 500) {
      this.gameState.eventLog.shift();
    }
  }

  async init() {
    // Load data files
    const [catalogs, balancing, dialogue] = await Promise.all([
      fetch('data/catalogs.json').then(r => r.json()),
      fetch('data/balancing.json').then(r => r.json()),
      fetch('data/dialogue.json').then(r => r.json())
    ]);

    this.catalogs = catalogs;
    this.balancing = balancing;
    this.dialogueData = dialogue;

    // Initialize systems
    this.player = new PlayerState();
    this.npcGenerator = new NPCGenerator(catalogs, balancing);
    this.caseGenerator = new CaseGenerator(catalogs, balancing);
    this.supervisor = new SupervisorSystem(balancing, dialogue);
    this.shiftManager = new ShiftManager(balancing, dialogue);

    // Try to load saved game
    this.loadGame();

    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
  }

  emit(event, data) {
    if (this.onStateChange && event === 'stateChange') {
      this.onStateChange(data);
    }
    if (this.onEvent) {
      this.onEvent(event, data);
    }
  }

  // Start a new shift
  startShift() {
    this.player.startNewShift();
    this.supervisor.initialize(this.player.shiftNumber);

    // Generate customer queue
    const customerCount = this.runRng.nextInt(
      this.balancing.shift.customersPerShift[0],
      this.balancing.shift.customersPerShift[1]
    );

    const queue = this.npcGenerator.generateShiftQueue(
      customerCount,
      this.player.department,
      this.npcPool
    );

    this.shiftManager.startShift(this.player.shiftNumber, queue);
    this.state = GamePhase.SHIFT_START;
    this.logEvent('SHIFT_STARTED', {
      shiftNumber: this.player.shiftNumber,
      customerCount,
      supervisor: this.supervisor.name
    });
    this.emit('stateChange', {
      state: this.state,
      shiftNumber: this.player.shiftNumber,
      customerCount,
      supervisorName: this.supervisor.name,
      supervisorType: this.supervisor.type,
      pendingAppeals: this.gameState.pendingAppeals.length,
      time: this.shiftManager.getTimeString()
    });
  }

  // Serve the next customer
  nextCustomer() {
    if (this.shiftManager.isShiftOver()) {
      this.endShift();
      return;
    }

    const npc = this.shiftManager.getNextCustomer();
    if (!npc) {
      this.endShift();
      return;
    }

    this.currentNPC = npc;
    this.caseStartTime = Date.now();

    // Check for chaos events
    const events = this.shiftManager.checkForEvent(this.shiftManager.currentCustomerIndex);
    if (events.length > 0) {
      this.emit('event', { type: 'chaos', events });
    }

    // Generate the case
    const caseData = this.caseGenerator.generateCase(
      npc,
      this.player.department,
      this.player.shiftNumber
    );

    this.currentCase = caseData;
    this.gameState.caseChecklist[caseData.caseRecord.caseId] = this.gameState.caseChecklist[caseData.caseRecord.caseId] || Object.fromEntries((caseData.caseRecord.inputs.requiredDocs || []).map(d => [d, false]));

    // Advance time
    this.shiftManager.advanceTime(
      Math.floor(this.balancing.difficulty.baseTimePerCustomer / this.balancing.shift.clockSpeedMultiplier * 10)
    );

    // Get NPC dialogue
    const archetype = this.catalogs.archetypes.find(a => a.id === npc.archetype);
    const dialogueStyle = archetype ? archetype.dialogueStyle : 'nervous';
    const greetingPool = this.dialogueData.greetings[dialogueStyle] || this.dialogueData.greetings.nervous;
    const rng = this.getDeterministicRng(npc.rng.masterSeed + this.player.shiftNumber);
    let greeting = rng.pick(greetingPool);
    greeting = greeting
      .replace('{{requestType}}', this.caseGenerator.formatRequestType(caseData.caseRecord.requestType))
      .replace('{{supervisorName}}', this.supervisor.name);

    this.state = GamePhase.SERVING;
    this.emit('stateChange', {
      state: this.state,
      npc: {
        ...npc.toJSON(),
        fullName: npc.fullName,
        age: npc.identity.age
      },
      caseRecord: caseData.caseRecord,
      documents: caseData.documents,
      issues: caseData.possibleIssues,
      greeting,
      queueStatus: this.shiftManager.getQueueStatus(),
      activeEffects: this.shiftManager.getActiveEffects(),
      archetype: archetype ? { id: archetype.id, name: archetype.name } : null,
      conditions: caseData.caseRecord.inputs.conditions
    });
  }

  // Player makes a decision
  makeDecision(action, reasonCode = null, notes = '') {
    if (!this.currentCase || !this.currentNPC) return;

    const processingTime = (Date.now() - this.caseStartTime) / 1000;
    const playerDecision = { action, reasonCode: reasonCode || 'AllDocumentsValid', notes };
    const correctAction = this.currentCase.correctAction;

    // Evaluate the decision
    const evaluation = this.supervisor.evaluateCase(
      this.currentCase.caseRecord,
      playerDecision,
      correctAction
    );

    // Update case record
    this.currentCase.caseRecord.decision = {
      action: playerDecision.action,
      reasonCode: playerDecision.reasonCode,
      feeDelta: action === 'Approve' ? (this.currentCase.caseRecord.inputs.fee || 0) : 0,
      notes
    };
    this.currentCase.caseRecord.audit.processingTimeSec = processingTime;
    this.currentCase.caseRecord.audit.accuracyScore = evaluation.correct ? 1.0 : 0.0;

    // Update NPC
    this.currentNPC.updateReputation(evaluation.reputationDelta);
    this.currentNPC.addCase(this.currentCase.caseRecord);

    // Update player performance
    this.player.recordCase({
      processingTime,
      sentiment: evaluation.sentiment,
      correct: evaluation.correct
    });

    if (evaluation.policyError === 'major') {
      this.player.performance.currentShift.policyErrors.major++;
    } else if (evaluation.policyError === 'minor') {
      this.player.performance.currentShift.policyErrors.minor++;
    }

    // Determine customer reaction
    const rng = this.getDeterministicRng(this.currentNPC.rng.masterSeed + Math.floor(processingTime * 1000));
    let reaction = '';
    if (action === 'Approve') {
      const pool = this.dialogueData.reactions.approved[evaluation.sentiment === 'happy' ? 'happy' : 'neutral'];
      reaction = rng.pick(pool);
    } else if (action === 'Deny') {
      const mood = evaluation.sentiment === 'angry' ? 'angry' : 'sad';
      const pool = this.dialogueData.reactions.denied[mood];
      reaction = rng.pick(pool);
    } else {
      reaction = rng.pick(this.dialogueData.reactions.escalated);
      this.player.recordEscalation();
    }

    // Check if customer complains
    if (evaluation.sentiment === 'angry' || evaluation.sentiment === 'insulted') {
      if (rng.chance(0.5)) {
        this.player.recordComplaint();
      }
    }

    // Add NPC to pool for recurrence
    if (!this.npcPool.find(n => n.npcId === this.currentNPC.npcId)) {
      this.npcPool.push(this.currentNPC);
      if (this.npcPool.length > 50) this.npcPool.shift(); // Keep pool manageable
    }

    // Check for bribe attempt
    const bribeCondition = this.currentCase.caseRecord.inputs.conditions.find(c => c.type === 'bribe_attempt');
    if (bribeCondition && action === 'Deny') {
      this.state = GamePhase.BRIBE;
      this.logEvent('BRIBE_OFFERED', {
        caseId: this.currentCase.caseRecord.caseId,
        npcId: this.currentNPC.npcId,
        amount: bribeCondition.bribeAmount
      });
      this.emit('stateChange', {
        state: 'bribe',
        npc: this.currentNPC.toJSON(),
        bribeAmount: bribeCondition.bribeAmount,
        dialogue: rng.pick(this.dialogueData.reactions.bribeAttempt)
      });
      return;
    }

    this.state = GamePhase.RESULT;
    this.logEvent('CASE_RESOLVED', {
      caseId: this.currentCase.caseRecord.caseId,
      npcId: this.currentNPC.npcId,
      decision: playerDecision,
      correct: evaluation.correct,
      sentiment: evaluation.sentiment
    });
    this.emit('stateChange', {
      state: 'result',
      evaluation,
      correctAction,
      playerDecision,
      reaction,
      npcName: this.currentNPC.fullName,
      sentiment: evaluation.sentiment,
      processingTime: Math.round(processingTime),
      queueStatus: this.shiftManager.getQueueStatus()
    });
  }

  // Handle bribe response
  respondToBribe(accepted) {
    this.player.recordBribe(accepted);

    let feedback;
    if (accepted) {
      this.player.money += this.currentCase.caseRecord.inputs.conditions.find(c => c.type === 'bribe_attempt').bribeAmount;
      feedback = "You pocketed the cash. Let's hope nobody saw that...";
    } else {
      feedback = "You firmly declined. The customer looks disappointed but moves on.";
    }

    this.state = GamePhase.RESULT;
    this.logEvent('BRIBE_RESPONSE', {
      caseId: this.currentCase?.caseRecord?.caseId,
      npcId: this.currentNPC?.npcId,
      accepted
    });
    this.emit('stateChange', {
      state: 'result',
      evaluation: { correct: !accepted, sentiment: accepted ? 'neutral' : 'annoyed' },
      correctAction: this.currentCase.correctAction,
      playerDecision: { action: accepted ? 'Approve' : 'Deny' },
      reaction: feedback,
      npcName: this.currentNPC.fullName,
      sentiment: accepted ? 'neutral' : 'annoyed',
      processingTime: Math.round((Date.now() - this.caseStartTime) / 1000),
      queueStatus: this.shiftManager.getQueueStatus(),
      bribeResult: accepted ? 'accepted' : 'declined'
    });
  }

  // End the shift
  endShift() {
    const shiftResult = this.player.endShift(this.balancing);
    const review = this.supervisor.generateShiftReview(this.player);
    const shiftSummary = this.shiftManager.getShiftSummary();
    const newAchievements = this.player.checkAchievements();
    const complianceReport = this.runAuditAndAppeals();

    this.state = GamePhase.REVIEW;
    this.logEvent('SHIFT_COMPLETED', {
      shiftNumber: this.player.shiftNumber,
      score: shiftResult.score,
      writeUps: this.player.writeUps
    });
    this.emit('stateChange', {
      state: 'review',
      shiftResult,
      review,
      shiftSummary,
      newAchievements,
      complianceReport,
      playerStats: {
        money: this.player.money,
        shiftsCompleted: this.player.shiftsCompleted,
        weeklyPerf: this.player.getWeeklyPerformance(),
        writeUps: this.player.writeUps,
        streak: this.player.cleanShiftStreak
      }
    });

    this.saveGame();
  }

  // Save/Load
  saveGame() {
    const saveData = {
      player: this.player.toJSON(),
      npcPool: this.npcPool.map(n => n.toJSON()),
      globalSeed: this.npcGenerator.globalSeed,
      gameState: {
        seed: this.gameState.seed,
        eventLog: this.gameState.eventLog,
        eventCounter: this.gameState.eventCounter,
        developmentMode: this.gameState.developmentMode,
        caseChecklist: this.gameState.caseChecklist,
        manualOpen: this.gameState.manualOpen,
        pendingAppeals: this.gameState.pendingAppeals,
        auditHistory: this.gameState.auditHistory
      },
      version: 1
    };
    try {
      localStorage.setItem('redTapeSave', JSON.stringify(saveData));
    } catch (e) {
      console.warn('Failed to save game:', e);
    }
  }

  loadGame() {
    try {
      const data = localStorage.getItem('redTapeSave');
      if (data) {
        const save = JSON.parse(data);
        if (save.version === 1) {
          this.player = PlayerState.fromJSON(save.player);
          this.npcGenerator.setGlobalSeed(save.globalSeed);
          if (save.gameState?.seed) {
            this.setSeed(save.gameState.seed);
            this.gameState.eventLog = save.gameState.eventLog || [];
            this.gameState.eventCounter = save.gameState.eventCounter || 0;
            this.gameState.developmentMode = Boolean(save.gameState.developmentMode);
            this.gameState.caseChecklist = save.gameState.caseChecklist || {};
            this.gameState.manualOpen = save.gameState.manualOpen !== false;
            this.gameState.pendingAppeals = save.gameState.pendingAppeals || [];
            this.gameState.auditHistory = save.gameState.auditHistory || [];
          }
          // NPC pool would need proper NPC.fromJSON reconstruction
          return true;
        }
      }
    } catch (e) {
      console.warn('Failed to load save:', e);
    }
    return false;
  }

  newGame() {
    localStorage.removeItem('redTapeSave');
    this.player = new PlayerState();
    this.npcPool = [];
    const freshSeed = Date.now();
    this.npcGenerator.setGlobalSeed(freshSeed);
    this.setSeed(freshSeed);
    this.gameState.eventLog = [];
    this.gameState.eventCounter = 0;
    this.gameState.developmentMode = false;
    this.gameState.caseChecklist = {};
    this.gameState.manualOpen = true;
    this.gameState.pendingAppeals = [];
    this.gameState.auditHistory = [];
    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
  }

  getGameState() {
    return {
      state: this.state,
      seed: this.gameState.seed,
      developmentMode: this.gameState.developmentMode,
      manualOpen: this.gameState.manualOpen,
      pendingAppeals: this.gameState.pendingAppeals,
      eventLog: this.gameState.eventLog,
      player: this.player,
      shiftNumber: this.player.shiftNumber,
      department: this.player.department
    };
  }
}
