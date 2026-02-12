import { SeededRNG } from './rng.js';

let npcCounter = 0;

export class NPC {
  constructor(data = {}) {
    this.npcId = data.npcId || `npc_${(++npcCounter).toString(16).padStart(6, '0')}`;
    this.version = 1;
    this.identity = data.identity || {};
    this.appearance = data.appearance || {};
    this.personality = data.personality || {};
    this.socioEconomic = data.socioEconomic || {};
    this.archetype = data.archetype || null;
    this.relationships = data.relationships || [];
    this.reputation = data.reputation || { towardPlayer: 0, towardAgency: 0 };
    this.flags = data.flags || [];
    this.caseHistory = data.caseHistory || [];
    this.routing = data.routing || { nextEligibleDepts: ['DMV'], cooldowns: {} };
    this.rng = data.rng || { masterSeed: 0, lastUpdatedShift: 0 };
    this.metadata = data.metadata || {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  get fullName() {
    return `${this.identity.firstName} ${this.identity.lastName}`;
  }

  get age() {
    if (!this.identity.dob) return 0;
    const dob = new Date(this.identity.dob);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    if (now.getMonth() < dob.getMonth() ||
        (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  hasFlag(flagId) {
    return this.flags.some(f => f.flagId === flagId);
  }

  addFlag(flag) {
    if (!this.hasFlag(flag.flagId)) {
      this.flags.push(flag);
    }
  }

  clearFlag(flagId) {
    this.flags = this.flags.filter(f => f.flagId !== flagId);
  }

  addCase(caseRecord) {
    this.caseHistory.push(caseRecord);
    this.metadata.updatedAt = new Date().toISOString();
  }

  updateReputation(delta) {
    this.reputation.towardPlayer = Math.max(-100, Math.min(100,
      this.reputation.towardPlayer + (delta.towardPlayer || 0)));
    this.reputation.towardAgency = Math.max(-100, Math.min(100,
      this.reputation.towardAgency + (delta.towardAgency || 0)));
  }

  getDialogueContext() {
    const lastCase = this.caseHistory[this.caseHistory.length - 1] || null;
    return {
      npcId: this.npcId,
      name: this.fullName,
      firstName: this.identity.firstName,
      temperament: this.personality.temperament,
      patience: this.personality.patience,
      archetype: this.archetype,
      lastEncounter: lastCase ? {
        dept: lastCase.dept,
        shiftNumber: lastCase.shiftNumber,
        decision: lastCase.decision?.action,
        reasonCode: lastCase.decision?.reasonCode
      } : null,
      topFlags: this.flags
        .sort((a, b) => {
          const sev = { high: 3, med: 2, low: 1 };
          return (sev[b.severity] || 0) - (sev[a.severity] || 0);
        })
        .slice(0, 3),
      reputation: { ...this.reputation }
    };
  }

  toJSON() {
    return {
      npcId: this.npcId,
      version: this.version,
      identity: this.identity,
      appearance: this.appearance,
      personality: this.personality,
      socioEconomic: this.socioEconomic,
      archetype: this.archetype,
      relationships: this.relationships,
      reputation: this.reputation,
      flags: this.flags,
      caseHistory: this.caseHistory,
      routing: this.routing,
      rng: this.rng,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    return new NPC(data);
  }
}

export class CaseRecord {
  constructor(data = {}) {
    this.caseId = data.caseId || `case_${Date.now().toString(36)}`;
    this.npcId = data.npcId || '';
    this.dept = data.dept || 'DMV';
    this.shiftNumber = data.shiftNumber || 0;
    this.requestType = data.requestType || '';
    this.inputs = data.inputs || {};
    this.decision = data.decision || { action: null, reasonCode: null, feeDelta: 0, notes: '' };
    this.outcomes = data.outcomes || {
      newFlags: [],
      clearedFlags: [],
      reputationDelta: { towardPlayer: 0, towardAgency: 0 },
      crossDeptTriggers: []
    };
    this.audit = data.audit || {
      clerkId: 'player_1',
      accuracyScore: 0,
      processingTimeSec: 0
    };
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

export class Flag {
  constructor(flagId, severity, sourceDept, shift, data = {}) {
    this.flagId = flagId;
    this.severity = severity;
    this.sourceDept = sourceDept;
    this.createdShift = shift;
    this.data = data;
    this.expiresShift = data.expiresShift || null;
  }
}
