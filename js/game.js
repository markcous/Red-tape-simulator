import { PlayerState } from './models/player.js';
import { NPCGenerator } from './systems/npc-generator.js';
import { CaseGenerator } from './systems/case-generator.js';
import { SupervisorSystem } from './systems/supervisor.js';
import { ShiftManager } from './systems/shift-manager.js';
import { SeededRNG } from './models/rng.js';

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

    // Current state
    this.state = 'loading'; // loading, menu, shift_start, serving, decision, result, bribe, shift_end, review
    this.currentNPC = null;
    this.currentCase = null;
    this.currentDocReview = null;
    this.caseStartTime = 0;
    this.npcPool = [];

    // UI callback
    this.onStateChange = null;
    this.onEvent = null;
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

    this.state = 'menu';
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
    const customerCount = new SeededRNG(this.player.shiftNumber).nextInt(
      this.balancing.shift.customersPerShift[0],
      this.balancing.shift.customersPerShift[1]
    );

    const queue = this.npcGenerator.generateShiftQueue(
      customerCount,
      this.player.department,
      this.npcPool
    );

    this.shiftManager.startShift(this.player.shiftNumber, queue);
    this.state = 'shift_start';
    this.emit('stateChange', {
      state: this.state,
      shiftNumber: this.player.shiftNumber,
      customerCount,
      supervisorName: this.supervisor.name,
      supervisorType: this.supervisor.type,
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

    // Advance time
    this.shiftManager.advanceTime(
      Math.floor(this.balancing.difficulty.baseTimePerCustomer / this.balancing.shift.clockSpeedMultiplier * 10)
    );

    // Get NPC dialogue
    const archetype = this.catalogs.archetypes.find(a => a.id === npc.archetype);
    const dialogueStyle = archetype ? archetype.dialogueStyle : 'nervous';
    const greetingPool = this.dialogueData.greetings[dialogueStyle] || this.dialogueData.greetings.nervous;
    const rng = new SeededRNG(npc.rng.masterSeed + this.player.shiftNumber);
    let greeting = rng.pick(greetingPool);
    greeting = greeting
      .replace('{{requestType}}', this.caseGenerator.formatRequestType(caseData.caseRecord.requestType))
      .replace('{{supervisorName}}', this.supervisor.name);

    this.state = 'serving';
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
    const rng = new SeededRNG(this.currentNPC.rng.masterSeed + processingTime);
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
      this.state = 'bribe';
      this.emit('stateChange', {
        state: 'bribe',
        npc: this.currentNPC.toJSON(),
        bribeAmount: bribeCondition.bribeAmount,
        dialogue: rng.pick(this.dialogueData.reactions.bribeAttempt)
      });
      return;
    }

    this.state = 'result';
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

    this.state = 'result';
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

    this.state = 'review';
    this.emit('stateChange', {
      state: 'review',
      shiftResult,
      review,
      shiftSummary,
      newAchievements,
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
    this.npcGenerator.setGlobalSeed(Date.now());
    this.state = 'menu';
    this.emit('stateChange', { state: this.state });
  }

  getGameState() {
    return {
      state: this.state,
      player: this.player,
      shiftNumber: this.player.shiftNumber,
      department: this.player.department
    };
  }
}
