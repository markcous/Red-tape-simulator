import { PlayerState } from './models/player.js';
import { NPCGenerator } from './systems/npc-generator.js';
import { CaseGenerator } from './systems/case-generator.js';
import { SupervisorSystem } from './systems/supervisor.js';
import { ShiftManager } from './systems/shift-manager.js';
import { SeededRNG } from './models/rng.js';
import { NPC, Flag } from './models/npc.js';

export const GamePhase = Object.freeze({
  LOADING: 'loading',
  MENU: 'menu',
  SHIFT_START: 'shift_start',
  SERVING: 'serving',
  DOC_REQUEST: 'doc_request',
  RESULT: 'result',
  BRIBE: 'bribe',
  REVIEW: 'review'
});

const DIFFICULTY_CONFIG = Object.freeze({
  easy: {
    id: 'easy',
    label: 'Easy',
    includeSupportingChecklist: true,
    missingDocMultiplier: 0.8,
    fraudMultiplier: 0.75,
    documentErrorMultiplier: 0.7,
    wrongFormMultiplier: 0.75,
    inconsistencyMultiplier: 0.75,
    casePatienceMultiplier: 1.2,
    timePerCustomerMultiplier: 1.0
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    includeSupportingChecklist: false,
    missingDocMultiplier: 1.0,
    fraudMultiplier: 1.0,
    documentErrorMultiplier: 1.0,
    wrongFormMultiplier: 1.0,
    inconsistencyMultiplier: 1.0,
    casePatienceMultiplier: 1.0,
    timePerCustomerMultiplier: 1.0
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    includeSupportingChecklist: false,
    missingDocMultiplier: 1.25,
    fraudMultiplier: 1.35,
    documentErrorMultiplier: 1.4,
    wrongFormMultiplier: 1.45,
    inconsistencyMultiplier: 1.35,
    casePatienceMultiplier: 0.78,
    timePerCustomerMultiplier: 1.25
  }
});

export class Game {
  static SAVE_SLOT_COUNT = 4;
  static LEGACY_SAVE_KEY = 'redTapeSave';
  static SAVE_SLOT_KEY_PREFIX = 'redTapeSave.slot.';

  constructor() {
    this.player = null;
    this.npcGenerator = null;
    this.caseGenerator = null;
    this.supervisor = null;
    this.shiftManager = null;
    this.catalogs = null;
    this.balancing = null;
    this.dialogueData = null;
    this.photoLibrary = { photos: [] };
    this.photoLibraryById = new Map();
    this.activeSaveSlot = null;

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
      difficulty: 'easy',
      developmentMode: false,
      caseChecklist: {},
      manualOpen: true,
      pendingAppeals: [],
      auditHistory: [],
      caseWaitRemaining: 0,
      caseWaitTotal: 0,
      casePatienceEscalated: false,
      pendingDocumentReturns: {},
      pendingDocRequest: null,
      agencyDatabase: {
        peopleByNpcId: {},
        vehiclesByVin: {}
      },
      weeklyDirective: {
        customerDelta: 0,
        memo: 'Standard operations this week.',
        sourceWeek: 0
      },
      settings: this.getDefaultSettings()
    };

    this.runRng = new SeededRNG(this.gameState.seed);
    this.serviceTicker = null;

    // UI callback
    this.onStateChange = null;
    this.onEvent = null;
  }

  static CURRENT_SAVE_VERSION = 6;

  getDefaultSettings() {
    return {
      masterVolume: 100,
      musicVolume: 80,
      sfxVolume: 80,
      fullscreen: false,
      uiScale: 100,
      textSize: 100,
      confirmBeforeQuitting: true,
      autoSave: true,
      tooltips: true,
      developerMode: false,
      reducedMotion: false,
      highContrast: false
    };
  }

  initializeSettings(rawSettings = null) {
    const defaults = this.getDefaultSettings();
    const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : this.gameState.settings;
    const normalized = {
      masterVolume: Math.max(0, Math.min(100, Number(source?.masterVolume ?? defaults.masterVolume) || defaults.masterVolume)),
      musicVolume: Math.max(0, Math.min(100, Number(source?.musicVolume ?? defaults.musicVolume) || defaults.musicVolume)),
      sfxVolume: Math.max(0, Math.min(100, Number(source?.sfxVolume ?? defaults.sfxVolume) || defaults.sfxVolume)),
      fullscreen: Boolean(source?.fullscreen),
      uiScale: Math.max(80, Math.min(140, Number(source?.uiScale ?? defaults.uiScale) || defaults.uiScale)),
      textSize: Math.max(80, Math.min(140, Number(source?.textSize ?? defaults.textSize) || defaults.textSize)),
      confirmBeforeQuitting: source?.confirmBeforeQuitting !== false,
      autoSave: source?.autoSave !== false,
      tooltips: source?.tooltips !== false,
      developerMode: Boolean(source?.developerMode ?? this.gameState.developmentMode),
      reducedMotion: Boolean(source?.reducedMotion),
      highContrast: Boolean(source?.highContrast)
    };
    this.gameState.settings = {
      ...defaults,
      ...normalized
    };
    this.gameState.developmentMode = this.gameState.settings.developerMode;
    return this.gameState.settings;
  }

  getSettings() {
    return { ...this.gameState.settings };
  }

  setSetting(key, value) {
    if (!key || typeof key !== 'string') return false;
    this.initializeSettings();

    const schema = {
      masterVolume: { type: 'number', min: 0, max: 100 },
      musicVolume: { type: 'number', min: 0, max: 100 },
      sfxVolume: { type: 'number', min: 0, max: 100 },
      fullscreen: { type: 'boolean' },
      uiScale: { type: 'number', min: 80, max: 140 },
      textSize: { type: 'number', min: 80, max: 140 },
      confirmBeforeQuitting: { type: 'boolean' },
      autoSave: { type: 'boolean' },
      tooltips: { type: 'boolean' },
      developerMode: { type: 'boolean' },
      reducedMotion: { type: 'boolean' },
      highContrast: { type: 'boolean' }
    };

    const settingRule = schema[key];
    if (!settingRule) return false;

    let normalizedValue;
    if (settingRule.type === 'number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return false;
      normalizedValue = Math.max(settingRule.min, Math.min(settingRule.max, Math.round(numericValue)));
    } else {
      normalizedValue = Boolean(value);
    }

    if (this.gameState.settings[key] === normalizedValue) return true;

    this.gameState.settings[key] = normalizedValue;
    if (key === 'developerMode') {
      this.gameState.developmentMode = normalizedValue;
    }
    this.logEvent('SETTING_CHANGED', { key, value: normalizedValue });

    if (key === 'autoSave' && normalizedValue) {
      this.saveGame({ force: true });
    } else {
      this.saveGame();
    }

    this.emit('event', {
      type: 'settingsChanged',
      settings: this.getSettings()
    });
    return true;
  }

  normalizeSaveSlot(slotIndex) {
    const parsed = Number(slotIndex);
    if (!Number.isInteger(parsed)) return null;
    if (parsed < 1 || parsed > Game.SAVE_SLOT_COUNT) return null;
    return parsed;
  }

  getSaveSlotKey(slotIndex) {
    const normalizedSlot = this.normalizeSaveSlot(slotIndex);
    if (!normalizedSlot) return null;
    return `${Game.SAVE_SLOT_KEY_PREFIX}${normalizedSlot}`;
  }

  getLegacySaveData() {
    try {
      const data = localStorage.getItem(Game.LEGACY_SAVE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return this.migrateSave(parsed);
    } catch (_error) {
      return null;
    }
  }

  getSaveDataFromSlot(slotIndex) {
    const key = this.getSaveSlotKey(slotIndex);
    if (!key) return null;
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return this.migrateSave(parsed);
    } catch (_error) {
      return null;
    }
  }

  getSaveSlotSummary(slotIndex) {
    const normalizedSlot = this.normalizeSaveSlot(slotIndex);
    if (!normalizedSlot) return null;
    const save = this.getSaveDataFromSlot(normalizedSlot);
    if (!save) {
      return {
        slot: normalizedSlot,
        isEmpty: true,
        careerName: 'Empty Slot',
        shiftNumber: 0,
        difficulty: 'easy',
        difficultyLabel: this.getDifficultyProfile('easy').label,
        lastPlayedAt: null
      };
    }

    const careerName = String(save?.player?.name || '').trim() || 'Unnamed Career';
    const shiftNumber = Math.max(0, Number(save?.player?.shiftNumber || 0));
    const difficulty = this.normalizeDifficulty(save?.gameState?.difficulty || 'easy');
    const lastPlayedAt = save?.gameState?.lastPlayedAt || null;

    return {
      slot: normalizedSlot,
      isEmpty: false,
      careerName,
      shiftNumber,
      difficulty,
      difficultyLabel: this.getDifficultyProfile(difficulty).label,
      lastPlayedAt
    };
  }

  getSaveSlots() {
    const slots = [];
    for (let slot = 1; slot <= Game.SAVE_SLOT_COUNT; slot++) {
      slots.push(this.getSaveSlotSummary(slot));
    }
    return slots;
  }

  getMostRecentSaveSlot() {
    const savedSlots = this.getSaveSlots().filter((slot) => !slot.isEmpty);
    if (!savedSlots.length) return null;

    savedSlots.sort((a, b) => {
      const timeA = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0;
      const timeB = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0;
      return timeB - timeA;
    });

    return savedSlots[0].slot;
  }

  ensureLegacySlotMigration() {
    const hasSlotSave = this.getSaveSlots().some((slot) => !slot.isEmpty);
    if (hasSlotSave) return;

    const legacySave = this.getLegacySaveData();
    if (!legacySave) return;

    const slotKey = this.getSaveSlotKey(1);
    if (!slotKey) return;

    try {
      localStorage.setItem(slotKey, JSON.stringify(legacySave));
    } catch (_error) {
      // Ignore migration errors in restricted storage contexts.
    }
  }

  hasAnySaveData() {
    if (this.getMostRecentSaveSlot()) return true;
    return Boolean(this.getLegacySaveData());
  }

  hasSaveData() {
    return this.hasAnySaveData();
  }

  saveNow() {
    return this.saveGame({ force: true });
  }

  loadFromSave() {
    const loaded = this.loadGame();
    if (!loaded) return false;

    this.stopServiceTicker();
    this.currentNPC = null;
    this.currentCase = null;
    this.gameState.currentNPC = null;
    this.gameState.currentCase = null;
    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
    this.emit('event', {
      type: 'saveLoaded',
      hasSaveData: true,
      settings: this.getSettings()
    });
    return true;
  }

  loadFromSlot(slotIndex, options = {}) {
    const normalizedSlot = this.normalizeSaveSlot(slotIndex);
    if (!normalizedSlot) return false;
    const loaded = this.loadGame({ slotIndex: normalizedSlot });
    if (!loaded) return false;

    if (options.startGame) {
      this.startShift();
      return true;
    }

    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
    return true;
  }

  loadMostRecentSave(options = {}) {
    const slot = this.getMostRecentSaveSlot();
    if (!slot) {
      const loadedLegacy = this.loadGame();
      if (!loadedLegacy) return false;
      if (options.startGame) {
        this.startShift();
      }
      return true;
    }
    return this.loadFromSlot(slot, options);
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

  normalizeDifficulty(difficulty) {
    const normalized = String(difficulty || '').trim().toLowerCase();
    return DIFFICULTY_CONFIG[normalized] ? normalized : 'easy';
  }

  getDifficultyProfile(difficulty = this.gameState.difficulty) {
    const normalized = this.normalizeDifficulty(difficulty);
    return DIFFICULTY_CONFIG[normalized] || DIFFICULTY_CONFIG.easy;
  }

  getDifficultyOptions() {
    return Object.values(DIFFICULTY_CONFIG).map((entry) => ({
      id: entry.id,
      label: entry.label
    }));
  }

  getDifficultyLabel() {
    return this.getDifficultyProfile().label;
  }

  setDifficulty(difficulty) {
    const normalized = this.normalizeDifficulty(difficulty);
    if (this.gameState.difficulty === normalized) return;
    this.gameState.difficulty = normalized;
    this.logEvent('DIFFICULTY_CHANGED', { difficulty: normalized });
    this.saveGame();
    this.emit('event', {
      type: 'difficultyChanged',
      difficulty: normalized,
      label: this.getDifficultyProfile(normalized).label
    });
  }

  setDevelopmentMode(enabled) {
    this.gameState.developmentMode = Boolean(enabled);
    this.initializeSettings();
    this.gameState.settings.developerMode = this.gameState.developmentMode;
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

  setDepartment(department) {
    if (!department) return false;
    if (!this.catalogs?.departments?.[department]) return false;
    if (!this.player.unlockedDepartments.includes(department)) return false;
    this.player.department = department;
    this.saveGame();
    this.emit('event', {
      type: 'departmentChanged',
      department,
      departmentName: this.catalogs.departments[department].name
    });
    return true;
  }

  getDisplayTime() {
    return this.shiftManager?.getTimeString?.() || '8:00 AM';
  }

  getArchetype(npc) {
    return this.catalogs?.archetypes?.find((entry) => entry.id === npc?.archetype) || null;
  }

  normalizeDatabaseVin(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  isPlaceholderDatabaseVin(value) {
    const normalized = this.normalizeDatabaseVin(value);
    if (!normalized) return true;
    const placeholders = new Set(['VINONFILE', 'PENDINGVERIFICATION', 'APPLICATIONFILE', 'UNKNOWN', 'NA']);
    return placeholders.has(normalized);
  }

  initializeAgencyDatabase() {
    if (!this.gameState.agencyDatabase || typeof this.gameState.agencyDatabase !== 'object') {
      this.gameState.agencyDatabase = { peopleByNpcId: {}, vehiclesByVin: {} };
      return;
    }
    if (!this.gameState.agencyDatabase.peopleByNpcId || typeof this.gameState.agencyDatabase.peopleByNpcId !== 'object') {
      this.gameState.agencyDatabase.peopleByNpcId = {};
    }
    if (!this.gameState.agencyDatabase.vehiclesByVin || typeof this.gameState.agencyDatabase.vehiclesByVin !== 'object') {
      this.gameState.agencyDatabase.vehiclesByVin = {};
    }
  }

  getDefaultWeeklyDirective() {
    return {
      customerDelta: 0,
      memo: 'Standard operations this week.',
      sourceWeek: 0
    };
  }

  initializeWeeklyDirective() {
    const defaults = this.getDefaultWeeklyDirective();
    const raw = this.gameState.weeklyDirective && typeof this.gameState.weeklyDirective === 'object'
      ? this.gameState.weeklyDirective
      : {};

    this.gameState.weeklyDirective = {
      customerDelta: Math.max(-2, Math.min(2, Number(raw.customerDelta ?? defaults.customerDelta) || 0)),
      memo: String(raw.memo || defaults.memo),
      sourceWeek: Math.max(0, Number(raw.sourceWeek ?? defaults.sourceWeek) || 0)
    };
  }

  createDatabaseRng(seed) {
    let state = Number(seed || 1) >>> 0;
    return {
      next() {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      },
      nextInt(min, max) {
        const low = Math.ceil(Number(min || 0));
        const high = Math.floor(Number(max || 0));
        if (high <= low) return low;
        return low + Math.floor(this.next() * (high - low + 1));
      },
      pick(items = []) {
        if (!Array.isArray(items) || !items.length) return '';
        return items[this.nextInt(0, items.length - 1)];
      }
    };
  }

  formatHeightInches(inchesValue) {
    const inches = Math.max(48, Math.min(84, Number(inchesValue || 0)));
    const feet = Math.floor(inches / 12);
    const remainder = inches % 12;
    return `${feet}'${String(remainder).padStart(2, '0')}"`;
  }

  ensureAgencyPersonRecord(npc) {
    if (!npc?.npcId) return null;
    this.initializeAgencyDatabase();

    const existing = this.gameState.agencyDatabase.peopleByNpcId[npc.npcId] || {};
    const rng = this.createDatabaseRng(Number(npc?.rng?.masterSeed || 1) + 97);
    const fallbackHeightIn = rng.nextInt(58, 78);
    const fallbackWeightLbs = rng.nextInt(105, 295);
    const fallbackEyeColor = rng.pick(['Brown', 'Hazel', 'Blue', 'Green', 'Gray']) || 'Brown';
    const fallbackHairColor = rng.pick(['Black', 'Brown', 'Blonde', 'Gray', 'Red']) || 'Brown';
    const fallbackDonor = rng.next() > 0.42 ? 'Yes' : 'No';
    const fallbackSex = rng.pick(['F', 'M', 'X']) || 'X';

    const identityHeightIn = Number(npc?.identity?.heightIn || 0);
    const identityWeightLbs = Number(npc?.identity?.weightLbs || 0);
    const resolvedHeightIn = Number.isFinite(identityHeightIn) && identityHeightIn > 0 ? identityHeightIn : fallbackHeightIn;
    const resolvedWeightLbs = Number.isFinite(identityWeightLbs) && identityWeightLbs > 0 ? identityWeightLbs : fallbackWeightLbs;
    const resolvedEyeColor = String(existing.eyeColor || npc?.identity?.eyeColor || npc?.appearance?.eyeColor || fallbackEyeColor);
    const resolvedHairColor = String(existing.hairColor || npc?.identity?.hairColor || npc?.appearance?.hair?.color || fallbackHairColor);
    const resolvedOrganDonor = npc?.identity?.organDonor === true
      ? 'Yes'
      : npc?.identity?.organDonor === false
        ? 'No'
        : (existing.organDonor || fallbackDonor);
    const resolvedSex = String(existing.sex || npc?.identity?.sex || fallbackSex);
    const resolvedSsn = String(existing.ssn || npc?.identity?.ssn || npc?.identity?.ssnMasked || 'XXX-XX-0000');

    const fullName = npc.fullName || `${npc?.identity?.firstName || ''} ${npc?.identity?.lastName || ''}`.trim() || existing.name || 'Unknown';
    const next = {
      npcId: npc.npcId,
      name: existing.name || fullName,
      firstName: existing.firstName || npc?.identity?.firstName || '',
      lastName: existing.lastName || npc?.identity?.lastName || '',
      dob: existing.dob || npc?.identity?.dob || 'On file',
      age: existing.age ?? npc?.identity?.age ?? null,
      ssn: resolvedSsn,
      address: existing.address || npc?.identity?.address || 'On file',
      phone: existing.phone || npc?.identity?.phone || 'On file',
      email: existing.email || npc?.identity?.email || 'On file',
      dlNumber: existing.dlNumber || '',
      eyeColor: resolvedEyeColor,
      hairColor: resolvedHairColor,
      sex: resolvedSex,
      organDonor: resolvedOrganDonor,
      height: existing.height || this.formatHeightInches(resolvedHeightIn),
      weight: existing.weight || `${resolvedWeightLbs} lb`,
      tickets: Number(existing.tickets || 0),
      fines: Number(existing.fines || 0),
      impound: Boolean(existing.impound),
      riskFlags: Array.isArray(existing.riskFlags) ? existing.riskFlags : [],
      ertc: existing.ertc || '',
      restrictions: existing.restrictions || 'None'
    };

    const ticketFlag = (npc.flags || []).find((flag) => flag?.flagId === 'UNPAID_TICKETS');
    const impoundFlag = (npc.flags || []).find((flag) => flag?.flagId === 'IMPOUND_HOLD');
    next.tickets = Number(ticketFlag?.data?.count || next.tickets || 0);
    next.fines = Number(ticketFlag?.data?.amountDue || next.fines || 0);
    next.impound = Boolean(impoundFlag || next.impound);
    next.riskFlags = Array.from(new Set((npc.flags || []).map((flag) => flag?.flagId).filter(Boolean)));

    this.gameState.agencyDatabase.peopleByNpcId[npc.npcId] = next;
    return next;
  }

  applyAgencyPersonToNpc(npc, person) {
    if (!npc || !person) return;

    const [firstName, ...rest] = String(person.name || '').trim().split(/\s+/).filter(Boolean);
    const derivedFirst = person.firstName || firstName || npc?.identity?.firstName || '';
    const derivedLast = person.lastName || rest.join(' ') || npc?.identity?.lastName || '';
    npc.identity.firstName = derivedFirst;
    npc.identity.lastName = derivedLast;
    npc.identity.dob = person.dob || npc.identity.dob;
    npc.identity.address = person.address || npc.identity.address;
    npc.identity.phone = person.phone || npc.identity.phone;
    npc.identity.email = person.email || npc.identity.email;
    npc.identity.ssn = person.ssn || npc.identity.ssn;
    npc.identity.ssnMasked = String(person.ssn || npc.identity.ssnMasked || 'XXX-XX-0000').replace(/^\d{3}-\d{2}-(\d{4})$/, 'XXX-XX-$1');
    npc.identity.sex = person.sex || npc.identity.sex;
    npc.identity.eyeColor = person.eyeColor || npc.identity.eyeColor;
    npc.identity.hairColor = person.hairColor || npc.identity.hairColor;
    npc.identity.organDonor = String(person.organDonor || '').toLowerCase() === 'yes';

    const heightMatch = String(person.height || '').match(/(\d+)'(\d+)/);
    if (heightMatch) {
      npc.identity.heightIn = Number(heightMatch[1]) * 12 + Number(heightMatch[2]);
    }
    const weightMatch = String(person.weight || '').match(/(\d+)/);
    if (weightMatch) {
      npc.identity.weightLbs = Number(weightMatch[1]);
    }

    npc.appearance = npc.appearance || {};
    npc.appearance.eyeColor = person.eyeColor || npc.appearance.eyeColor;
    npc.appearance.hair = npc.appearance.hair || {};
    npc.appearance.hair.color = person.hairColor || npc.appearance.hair.color;
  }

  updateAgencyPersonRecord(npcId, updates = {}) {
    const id = String(npcId || '').trim();
    if (!id) return { ok: false, message: 'Missing NPC id.' };

    this.initializeAgencyDatabase();
    const existing = this.gameState.agencyDatabase.peopleByNpcId[id];
    if (!existing) {
      return { ok: false, message: `No database person found for ${id}.` };
    }

    const normalizeBooleanLike = (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (['1', 'true', 'yes', 'y'].includes(normalized)) return 'Yes';
      if (['0', 'false', 'no', 'n'].includes(normalized)) return 'No';
      return value;
    };

    const next = {
      ...existing,
      ...updates
    };

    next.name = String(next.name || '').trim() || existing.name;
    next.firstName = String(next.firstName || '').trim() || existing.firstName;
    next.lastName = String(next.lastName || '').trim() || existing.lastName;
    next.dob = String(next.dob || '').trim() || existing.dob;
    next.ssn = String(next.ssn || '').trim() || existing.ssn;
    next.address = String(next.address || '').trim() || existing.address;
    next.phone = String(next.phone || '').trim() || existing.phone;
    next.email = String(next.email || '').trim() || existing.email;
    next.dlNumber = String(next.dlNumber || '').trim() || existing.dlNumber;
    next.sex = String(next.sex || '').trim() || existing.sex;
    next.eyeColor = String(next.eyeColor || '').trim() || existing.eyeColor;
    next.hairColor = String(next.hairColor || '').trim() || existing.hairColor;
    next.organDonor = normalizeBooleanLike(next.organDonor) || existing.organDonor;
    next.height = String(next.height || '').trim() || existing.height;
    next.weight = String(next.weight || '').trim() || existing.weight;
    next.ertc = String(next.ertc || '').trim() || existing.ertc || '';
    next.restrictions = String(next.restrictions || '').trim() || existing.restrictions || 'None';
    next.tickets = Number(next.tickets ?? existing.tickets ?? 0);
    next.fines = Number(next.fines ?? existing.fines ?? 0);
    next.impound = Boolean(next.impound);

    this.gameState.agencyDatabase.peopleByNpcId[id] = next;

    const applyToNpc = (npc) => {
      if (npc?.npcId !== id) return;
      this.applyAgencyPersonToNpc(npc, next);
    };

    (this.npcPool || []).forEach(applyToNpc);
    (this.shiftManager?.customerQueue || []).forEach(applyToNpc);
    applyToNpc(this.currentNPC);

    this.saveGame();
    return { ok: true, message: `Database updated for ${next.name}.`, person: next };
  }

  absorbCaseIntoAgencyDatabase(npc, caseRecord) {
    if (!npc?.npcId || !caseRecord) return;

    const person = this.ensureAgencyPersonRecord(npc);
    if (!person) return;

    const providedDocs = Object.values(caseRecord?.inputs?.providedDocs || {}).filter((doc) => doc?.present);
    providedDocs.forEach((doc) => {
      const data = doc?.data || {};
      if (!person.dlNumber && data.licenseNumber) person.dlNumber = String(data.licenseNumber);
      if (data.address) person.address = String(data.address);
      if (data.ssn) person.ssn = String(data.ssn);
      if (data.sex) person.sex = String(data.sex);
      if (data.eyeColor) person.eyeColor = String(data.eyeColor);
      if (data.hairColor) person.hairColor = String(data.hairColor);
      if (data.organDonor) person.organDonor = String(data.organDonor);
      if (data.ertc) person.ertc = String(data.ertc);
      if (data.restrictions) person.restrictions = String(data.restrictions);
      if (Number.isFinite(Number(data.heightIn)) && Number(data.heightIn) > 0) {
        person.height = this.formatHeightInches(Number(data.heightIn));
      }
      if (Number.isFinite(Number(data.weightLbs)) && Number(data.weightLbs) > 0) {
        person.weight = `${Number(data.weightLbs)} lb`;
      }

      const vin = this.normalizeDatabaseVin(data.vin || data.vehicleVIN || data.vehicleId);
      if (!vin || this.isPlaceholderDatabaseVin(vin)) return;

      const vehicleExisting = this.gameState.agencyDatabase.vehiclesByVin[vin] || {};
      this.gameState.agencyDatabase.vehiclesByVin[vin] = {
        vin,
        ownerNpcId: npc.npcId,
        ownerName: person.name,
        make: String(data.make || data.vehicleMake || vehicleExisting.make || 'Unknown'),
        model: String(data.model || data.vehicleModel || vehicleExisting.model || 'Unknown'),
        year: Number(data.year || data.vehicleYear || vehicleExisting.year || 0) || 'Unknown',
        color: String(data.color || data.vehicleColor || vehicleExisting.color || 'Unknown'),
        sourceDept: caseRecord?.dept || vehicleExisting.sourceDept || 'DMV',
        sourceRequestType: caseRecord?.requestType || vehicleExisting.sourceRequestType || 'Unknown'
      };
    });
  }

  rebuildAgencyDatabase() {
    this.initializeAgencyDatabase();

    const registry = new Map();
    const addNpc = (entry) => {
      if (!entry?.npcId || registry.has(entry.npcId)) return;
      registry.set(entry.npcId, entry);
    };

    (this.npcPool || []).forEach(addNpc);
    (this.shiftManager?.customerQueue || []).forEach(addNpc);
    addNpc(this.currentNPC);

    registry.forEach((npc) => {
      this.ensureAgencyPersonRecord(npc);
      (npc.caseHistory || []).forEach((record) => this.absorbCaseIntoAgencyDatabase(npc, record));
      if (this.currentCase?.caseRecord?.npcId === npc.npcId) {
        this.absorbCaseIntoAgencyDatabase(npc, this.currentCase.caseRecord);
      }

      const person = this.gameState.agencyDatabase.peopleByNpcId[npc.npcId];
      this.applyAgencyPersonToNpc(npc, person);
    });
  }

  getPrimaryVehicleForPerson(person) {
    const list = Object.values(this.gameState.agencyDatabase.vehiclesByVin || {})
      .filter((entry) => entry?.ownerNpcId === person?.npcId);
    return list[0] || null;
  }

  applyDatabaseToCaseData(caseData, npc) {
    if (!caseData || !npc?.npcId) return caseData;

    this.rebuildAgencyDatabase();
    const person = this.gameState.agencyDatabase.peopleByNpcId[npc.npcId] || this.ensureAgencyPersonRecord(npc);
    if (!person) return caseData;

    const primaryVehicle = this.getPrimaryVehicleForPerson(person);
    const isNameChangeCase = caseData?.caseRecord?.requestType === 'NameChange';
    const docs = caseData.documents || {};
    Object.values(docs).forEach((doc) => {
      if (!doc?.present || !doc?.data) return;

      // Preserve generated old/new legal identity continuity for name-change scenarios.
      if (!isNameChangeCase) {
        doc.data.holderName = person.name;
        doc.data.fullName = person.name;
      }

      doc.data.address = person.address;
      doc.data.dob = person.dob;
      doc.data.ssn = person.ssn;
      doc.data.licenseNumber = doc.data.licenseNumber || person.dlNumber;
      doc.data.sex = person.sex;
      doc.data.eyeColor = person.eyeColor;
      doc.data.hairColor = person.hairColor;
      doc.data.organDonor = person.organDonor;
      doc.data.ertc = doc.data.ertc || person.ertc || '';
      doc.data.restrictions = doc.data.restrictions || person.restrictions || 'None';

      const h = String(person.height || '').match(/(\d+)'(\d+)/);
      if (h) {
        doc.data.heightIn = Number(h[1]) * 12 + Number(h[2]);
      }
      const w = String(person.weight || '').match(/(\d+)/);
      if (w) {
        doc.data.weightLbs = Number(w[1]);
      }

      if (primaryVehicle) {
        doc.data.vin = doc.data.vin || primaryVehicle.vin;
        doc.data.vehicleVIN = doc.data.vehicleVIN || primaryVehicle.vin;
        doc.data.make = doc.data.make || primaryVehicle.make;
        doc.data.vehicleMake = doc.data.vehicleMake || primaryVehicle.make;
        doc.data.model = doc.data.model || primaryVehicle.model;
        doc.data.vehicleModel = doc.data.vehicleModel || primaryVehicle.model;
        doc.data.year = doc.data.year || primaryVehicle.year;
        doc.data.vehicleYear = doc.data.vehicleYear || primaryVehicle.year;
        doc.data.color = doc.data.color || primaryVehicle.color;
        doc.data.vehicleColor = doc.data.vehicleColor || primaryVehicle.color;
      }
    });

    const providedDocs = caseData.caseRecord?.inputs?.providedDocs || {};
    Object.keys(providedDocs).forEach((docType) => {
      if (docs[docType]) {
        providedDocs[docType] = docs[docType];
      }
    });

    return caseData;
  }

  getAgencyDatabaseSnapshot() {
    this.rebuildAgencyDatabase();

    const people = Object.values(this.gameState.agencyDatabase.peopleByNpcId || {}).map((person) => {
      const ownedVehicles = Object.values(this.gameState.agencyDatabase.vehiclesByVin || {})
        .filter((vehicle) => vehicle?.ownerNpcId === person.npcId)
        .map((vehicle) => ({
          ...vehicle,
          age: Number.isFinite(Number(vehicle.year)) ? Math.max(0, new Date().getFullYear() - Number(vehicle.year)) : 'Unknown'
        }));

      return {
        ...person,
        vehicles: ownedVehicles,
        ticketsFinesImpound: `tickets:${Number(person.tickets || 0)} | fines:$${Number(person.fines || 0)} | impound:${person.impound ? 'yes' : 'no'}`,
        matchKeys: [
          person.npcId,
          person.name,
          person.firstName,
          person.lastName,
          person.ssn,
          person.dlNumber,
          person.address,
          person.phone,
          person.email
        ].filter(Boolean)
      };
    });

    const vehicles = Object.values(this.gameState.agencyDatabase.vehiclesByVin || {}).map((vehicle) => ({
      ...vehicle,
      age: Number.isFinite(Number(vehicle.year)) ? Math.max(0, new Date().getFullYear() - Number(vehicle.year)) : 'Unknown'
    }));

    return { people, vehicles };
  }

  calculateCasePatienceWindow(npc) {
    const base = 28;
    const patienceStat = Number(npc?.personality?.patience || 50);
    const difficultyProfile = this.getDifficultyProfile();
    const scaledPatience = Math.round((base + patienceStat * 1.2) * difficultyProfile.casePatienceMultiplier);
    return Math.max(18, Math.min(160, scaledPatience));
  }

  stopServiceTicker() {
    if (this.serviceTicker) {
      clearInterval(this.serviceTicker);
      this.serviceTicker = null;
    }
  }

  startServiceTicker() {
    this.stopServiceTicker();
    this.serviceTicker = setInterval(() => {
      if (this.state !== GamePhase.SERVING || !this.currentNPC || !this.currentCase) {
        this.stopServiceTicker();
        return;
      }

      this.shiftManager.advanceTime(1);
      this.gameState.caseWaitRemaining = Math.max(0, (this.gameState.caseWaitRemaining || 0) - 1);
      const waitRemaining = this.gameState.caseWaitRemaining;
      const waitTotal = Math.max(1, this.gameState.caseWaitTotal || 1);

      this.emit('event', {
        type: 'serviceTick',
        queueStatus: this.shiftManager.getQueueStatus(),
        waitRemaining,
        waitTotal,
        patiencePercent: waitRemaining / waitTotal
      });

      if (waitRemaining <= 0) {
        if (!this.gameState.casePatienceEscalated) {
          this.gameState.casePatienceEscalated = true;
          this.gameState.caseWaitRemaining = 10;
          this.player.recordComplaint();
          this.emit('event', {
            type: 'patienceWarning',
            message: 'Customer is losing patience. Resolve soon or they will escalate.'
          });
          return;
        }
        this.makeDecision('Escalate', 'CustomerEscalation', 'Customer ran out of patience at the counter.');
        return;
      }

      if (this.shiftManager.isShiftOver()) {
        this.makeDecision('Escalate', 'SupervisorRequired', 'Shift ended while case was in progress.');
      }
    }, 3000);
  }

  rollDocumentRequestResponse(npc, rng, isRequiredDoc) {
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const patience = clamp(Number(npc?.personality?.patience || 50), 0, 100);
    const persuasion = clamp(Number(npc?.personality?.persuasion || 50), 0, 100);
    const patienceRatio = patience / 100;
    const impatience = 1 - patienceRatio;

    // Rare by design: doc-request bribes should happen occasionally, not routinely.
    const bribeChance = clamp(0.006 + Math.max(0, persuasion - 70) / 800, 0.006, 0.03);
    const weights = {
      offer_bribe: bribeChance,
      return_queue: 0,
      refuse_leave: 0,
      refuse_escalate: 0
    };

    if (isRequiredDoc) {
      // Required form requests are frustrating but still mostly resolved by fetching docs.
      weights.return_queue = clamp(0.52 + patienceRatio * 0.33, 0.52, 0.85);
      weights.refuse_escalate = clamp(0.14 + impatience * 0.2, 0.14, 0.34);
      weights.refuse_leave = clamp(0.06 + impatience * 0.12, 0.06, 0.18);
    } else {
      // Unnecessary form requests are much more likely to trigger complaints/escalation.
      weights.return_queue = clamp(0.05 + patienceRatio * 0.09, 0.05, 0.14);
      weights.refuse_escalate = clamp(0.5 + impatience * 0.26, 0.5, 0.76);
      weights.refuse_leave = clamp(0.2 + impatience * 0.14, 0.2, 0.34);
    }

    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
    let roll = rng.next() * totalWeight;
    for (const [outcome, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) {
        const frustrationPenalty = outcome === 'return_queue'
          ? Math.round(clamp((isRequiredDoc ? 12 : 20) + impatience * 16, 10, 36))
          : 0;
        return { outcome, frustrationPenalty };
      }
    }

    return { outcome: 'refuse_escalate', frustrationPenalty: 0 };
  }

  buildDocumentReturnCase(caseData, npc, docType, rng) {
    const updatedDocuments = { ...(caseData?.documents || {}) };
    const requestedDoc = {
      type: docType,
      present: true,
      expired: false,
      forged: false,
      errors: [],
      data: this.caseGenerator.generateDocumentData(rng, npc, docType)
    };
    if (!this.caseGenerator.isNonExpiringDocument(docType) && !requestedDoc.data.expirationDate) {
      requestedDoc.data.expirationDate = this.caseGenerator.generateFutureDate(rng);
    }
    updatedDocuments[docType] = requestedDoc;

    const updatedCaseRecord = JSON.parse(JSON.stringify(caseData.caseRecord));
    updatedCaseRecord.inputs.providedDocs = updatedDocuments;

    const conditions = updatedCaseRecord.inputs.conditions || [];
    return {
      caseRecord: updatedCaseRecord,
      documents: updatedDocuments,
      correctAction: this.caseGenerator.determineCorrectAction(updatedDocuments, npc, conditions, updatedCaseRecord.requestType),
      possibleIssues: this.caseGenerator.identifyIssues(updatedDocuments, npc, conditions),
      returnedWithRequestedDoc: true,
      requestedDocType: docType
    };
  }

  beginDocumentReturnFlow({ docType, isRequiredDoc, frustrationPenalty = 0 }) {
    const rng = this.getDeterministicRng(this.currentNPC.rng.masterSeed + this.player.shiftNumber * 17);
    const queuedCase = this.buildDocumentReturnCase(this.currentCase, this.currentNPC, docType, rng);
    queuedCase.requestFrustrationPenalty = Math.max(0, Number(frustrationPenalty || 0));
    queuedCase.requestedDocWasRequired = Boolean(isRequiredDoc);
    this.gameState.pendingDocumentReturns[this.currentNPC.npcId] = queuedCase;

    this.shiftManager.sendCustomerToBack(this.currentNPC);
    this.logEvent('DOC_REQUESTED', {
      caseId: this.currentCase.caseRecord.caseId,
      npcId: this.currentNPC.npcId,
      docType,
      outcome: 'return_queue',
      required: isRequiredDoc,
      frustrationPenalty: queuedCase.requestFrustrationPenalty
    });

    this.currentCase = null;
    this.currentNPC = null;
    this.gameState.pendingDocRequest = null;
    this.nextCustomer();
    return { ok: true, outcome: 'return_queue' };
  }

  completeCurrentCaseWithEscalation(reasonCode = 'CustomerEscalation', notes = '') {
    this.gameState.pendingDocRequest = null;
    this.makeDecision('Escalate', reasonCode, notes);
    return { ok: true, outcome: 'escalated' };
  }

  completeCurrentCaseWithDenial(reasonCode = 'MissingDocument', notes = '') {
    this.gameState.pendingDocRequest = null;
    this.makeDecision('Deny', reasonCode, notes);
    return { ok: true, outcome: 'denied' };
  }

  dismissCurrentCustomerAfterDocRefusal(docType, isRequiredDoc) {
    this.logEvent('DOC_REQUESTED', {
      caseId: this.currentCase.caseRecord.caseId,
      npcId: this.currentNPC.npcId,
      docType,
      outcome: 'refuse_leave',
      required: isRequiredDoc
    });
    this.gameState.pendingDocRequest = null;
    this.currentCase = null;
    this.currentNPC = null;
    this.nextCustomer();
    return { ok: true, outcome: 'refuse_leave' };
  }

  requestAdditionalDocument(docType) {
    if (this.state !== GamePhase.SERVING || !this.currentCase || !this.currentNPC || !docType) {
      return { ok: false, reason: 'no-active-case' };
    }

    const docName = this.caseGenerator.formatDocName(docType);
    const requiredDocs = new Set(this.currentCase?.caseRecord?.inputs?.requiredDocs || []);
    const isRequiredDoc = requiredDocs.has(docType);
    const rng = this.getDeterministicRng(this.currentNPC.rng.masterSeed + this.player.shiftNumber * 17);
    const response = this.rollDocumentRequestResponse(this.currentNPC, rng, isRequiredDoc);

    this.stopServiceTicker();
    const bribeAmount = response.outcome === 'offer_bribe' ? rng.nextInt(20, 140) : 0;

    this.gameState.pendingDocRequest = {
      docType,
      docName,
      isRequiredDoc,
      outcome: response.outcome,
      frustrationPenalty: response.frustrationPenalty,
      bribeAmount,
      npcId: this.currentNPC.npcId,
      npcName: this.currentNPC.fullName,
      caseId: this.currentCase.caseRecord.caseId
    };

    this.state = GamePhase.DOC_REQUEST;
    this.emit('stateChange', {
      state: 'doc_request',
      requestDecision: { ...this.gameState.pendingDocRequest },
      queueStatus: this.shiftManager.getQueueStatus(),
      npc: {
        ...this.currentNPC.toJSON(),
        fullName: this.currentNPC.fullName,
        age: this.currentNPC.identity.age
      },
      caseRecord: this.currentCase.caseRecord,
      documents: this.currentCase.documents,
      issues: this.currentCase.possibleIssues
    });
    return { ok: true, outcome: response.outcome };
  }

  resolveDocumentRequest(action) {
    const pending = this.gameState.pendingDocRequest;
    if (!pending || !this.currentNPC || !this.currentCase) {
      return { ok: false, reason: 'no-pending-doc-request' };
    }

    const { outcome, docType, isRequiredDoc, bribeAmount, docName } = pending;

    if (outcome === 'return_queue') {
      if (action !== 'send_to_back') return { ok: false, reason: 'invalid-action' };
      return this.beginDocumentReturnFlow({
        docType,
        isRequiredDoc,
        frustrationPenalty: pending.frustrationPenalty
      });
    }

    if (outcome === 'offer_bribe') {
      if (action === 'accept_bribe') {
        const preScenarioSnapshot = this.captureScenarioStatsSnapshot();
        this.player.recordBribe(true);
        this.player.money += Math.max(0, Number(bribeAmount || 0));
        this.logEvent('BRIBE_RESPONSE', {
          caseId: this.currentCase.caseRecord.caseId,
          npcId: this.currentNPC.npcId,
          accepted: true,
          source: 'doc_request',
          amount: bribeAmount
        });
        this.gameState.pendingDocRequest = null;
        this.makeDecision('Approve', 'AllDocumentsValid', `Accepted bribe to waive requested ${docName}.`, preScenarioSnapshot);
        return { ok: true, outcome: 'accept_bribe' };
      }

      if (action === 'escalate_supervisor') {
        return this.completeCurrentCaseWithEscalation('CustomerEscalation', `Customer offered a bribe when asked for ${docName}.`);
      }

      if (action === 'decline_bribe') {
        this.player.recordBribe(false);
        this.logEvent('BRIBE_RESPONSE', {
          caseId: this.currentCase.caseRecord.caseId,
          npcId: this.currentNPC.npcId,
          accepted: false,
          source: 'doc_request',
          amount: bribeAmount
        });
        if (isRequiredDoc) {
          return this.beginDocumentReturnFlow({
            docType,
            isRequiredDoc,
            frustrationPenalty: Math.max(8, Number(pending.frustrationPenalty || 0))
          });
        }
        return this.dismissCurrentCustomerAfterDocRefusal(docType, isRequiredDoc);
      }

      return { ok: false, reason: 'invalid-action' };
    }

    if (outcome === 'refuse_leave') {
      if (isRequiredDoc && action === 'deny_missing_document') {
        return this.completeCurrentCaseWithDenial('MissingDocument', `Customer refused to provide required ${docName}.`);
      }
      if (action === 'escalate_supervisor') {
        return this.completeCurrentCaseWithEscalation('CustomerEscalation', `Customer refused to provide ${docName}.`);
      }
      if (!isRequiredDoc && action === 'let_leave') {
        return this.dismissCurrentCustomerAfterDocRefusal(docType, isRequiredDoc);
      }
      return { ok: false, reason: 'invalid-action' };
    }

    if (outcome === 'refuse_escalate') {
      if (isRequiredDoc && action === 'deny_missing_document') {
        return this.completeCurrentCaseWithDenial('MissingDocument', `Customer refused required ${docName} and demanded supervisor.`);
      }
      if (action === 'escalate_supervisor') {
        // If this was an unnecessary request, escalation is forced by customer behavior
        // and should not be graded as an incorrect policy decision.
        if (!isRequiredDoc && this.currentCase?.correctAction) {
          this.currentCase.correctAction = {
            action: 'Escalate',
            reasonCode: 'CustomerEscalation',
            explanation: `Customer demanded supervisor after unnecessary ${docName} request.`
          };
        }
        return this.completeCurrentCaseWithEscalation('CustomerEscalation', `Customer demanded supervisor after ${docName} request.`);
      }
      return { ok: false, reason: 'invalid-action' };
    }

    return { ok: false, reason: 'unknown-outcome' };
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

  decrementNpcCooldowns() {
    for (const npc of this.npcPool) {
      if (!npc?.routing?.cooldowns) continue;
      for (const [dept, remaining] of Object.entries(npc.routing.cooldowns)) {
        npc.routing.cooldowns[dept] = Math.max(0, Number(remaining || 0) - 1);
      }
      npc.routing.nextEligibleDepts = this.computeNextEligibleDepartments(npc);
    }
  }

  computeNextEligibleDepartments(npc) {
    const departments = Object.keys(this.catalogs?.departments || {});
    const cooldowns = npc?.routing?.cooldowns || {};
    const eligible = departments.filter(dept => (cooldowns[dept] || 0) <= 0);

    if (npc.hasFlag('IMPOUND_HOLD') && !eligible.includes('Impound')) {
      eligible.unshift('Impound');
    }
    if (npc.hasFlag('UNPAID_TICKETS') && !eligible.includes('Parking')) {
      eligible.unshift('Parking');
    }

    return [...new Set(eligible)].slice(0, 5);
  }

  buildCaseOutcomes(caseRecord, playerDecision, evaluation, correctAction) {
    const outcomes = {
      newFlags: [],
      clearedFlags: [],
      reputationDelta: { ...evaluation.reputationDelta },
      crossDeptTriggers: []
    };

    if (playerDecision.action === 'Deny') {
      if (playerDecision.reasonCode === 'OutstandingViolations') {
        outcomes.newFlags.push(new Flag('UNPAID_TICKETS', 'med', caseRecord.dept, caseRecord.shiftNumber, {
          count: 3,
          amountDue: 150
        }));
        outcomes.crossDeptTriggers.push('UNPAID_GT_3');
      }
      if (playerDecision.reasonCode === 'FraudSuspected') {
        outcomes.newFlags.push(new Flag('FRAUD_ALERT', 'high', caseRecord.dept, caseRecord.shiftNumber, {}));
        outcomes.crossDeptTriggers.push('FRAUD_REVIEW');
      }
      if (playerDecision.reasonCode === 'ImpoundHold') {
        outcomes.newFlags.push(new Flag('IMPOUND_HOLD', 'high', caseRecord.dept, caseRecord.shiftNumber, {}));
        outcomes.crossDeptTriggers.push('ROUTE_TO_IMPOUND');
      }
      if (playerDecision.reasonCode === 'InsuranceLapse') {
        outcomes.newFlags.push(new Flag('INSURANCE_LAPSE', 'med', caseRecord.dept, caseRecord.shiftNumber, {}));
      }
      if (playerDecision.reasonCode === 'SuspendedLicense') {
        outcomes.newFlags.push(new Flag('SUSPENDED_LICENSE', 'high', caseRecord.dept, caseRecord.shiftNumber, {}));
      }
    }

    if (playerDecision.action === 'Approve') {
      outcomes.clearedFlags.push('OUTSTANDING_FEES');
      if (correctAction?.reasonCode === 'AllDocumentsValid') {
        outcomes.clearedFlags.push('ADDRESS_MISMATCH');
      }
    }

    return outcomes;
  }

  applyCaseConsequences(npc, caseRecord, playerDecision, evaluation, correctAction) {
    const outcomes = this.buildCaseOutcomes(caseRecord, playerDecision, evaluation, correctAction);
    caseRecord.outcomes = outcomes;

    npc.updateReputation(outcomes.reputationDelta);

    for (const flag of outcomes.newFlags) {
      npc.addFlag(flag);
    }
    for (const clearedId of outcomes.clearedFlags) {
      npc.clearFlag(clearedId);
    }

    if (!npc.routing.cooldowns) npc.routing.cooldowns = {};
    const minCooldown = this.balancing?.recurrence?.minShifts || 2;
    npc.routing.cooldowns[caseRecord.dept] = minCooldown;
    npc.routing.nextEligibleDepts = this.computeNextEligibleDepartments(npc);
    npc.rng.lastUpdatedShift = this.player.shiftNumber;
  }

  updateDepartmentUnlocks() {
    const unlocked = new Set(this.player.unlockedDepartments || ['DMV']);
    if (this.player.shiftsCompleted >= 5) unlocked.add('Parking');
    if (this.player.shiftsCompleted >= 10) unlocked.add('Impound');
    this.player.unlockedDepartments = Array.from(unlocked);
  }

  resolveEndOfWeek() {
    if (this.player.shiftNumber <= 0 || this.player.shiftNumber % 5 !== 0) {
      return null;
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
    const weeklyPerf = this.player.getWeeklyPerformance();
    const weekNumber = Math.max(1, Math.ceil(this.player.shiftNumber / 5));
    const weeklyScores = this.player.performance.weeklyScores.slice(-5);
    const bands = this.balancing?.weeklyBands || { promo: 90, solid: 75, coaching: 60 };
    const probationWriteUps = Number(this.balancing?.supervisor?.probationWriteUps || 2);

    const summary = {
      weekNumber,
      weeklyPerf,
      weeklyScores,
      tier: 'standard',
      outcomes: [],
      adjustments: {
        money: 0,
        promotionProgress: 0,
        supervisorRelationship: 0,
        writeUps: 0,
        auditRisk: 0
      },
      nextWeekDirective: this.getDefaultWeeklyDirective(),
      probationStatus: {
        before: Boolean(this.player.onProbation),
        after: Boolean(this.player.onProbation)
      }
    };

    if (weeklyPerf >= bands.promo) {
      summary.tier = 'promotion';
      summary.adjustments.money += 250;
      summary.adjustments.promotionProgress += 20;
      summary.adjustments.supervisorRelationship += 6;
      if (this.player.writeUps > 0) summary.adjustments.writeUps -= 1;
      summary.adjustments.auditRisk -= 8;
      summary.outcomes.push('Promotion track: bonus pay awarded and promotion progress increased.');
      summary.outcomes.push('Next week intake increased by 1 customer per shift.');
      summary.nextWeekDirective = {
        customerDelta: 1,
        memo: 'High performance week. Intake quota increased.',
        sourceWeek: weekNumber
      };
    } else if (weeklyPerf >= bands.solid) {
      summary.tier = 'solid';
      summary.adjustments.money += 100;
      summary.adjustments.promotionProgress += 10;
      summary.adjustments.supervisorRelationship += 3;
      if (this.player.writeUps > 0) summary.adjustments.writeUps -= 1;
      summary.adjustments.auditRisk -= 4;
      summary.outcomes.push('Solid week: modest bonus and better supervisor trust.');
      summary.outcomes.push('Next week remains on standard intake targets.');
      summary.nextWeekDirective = {
        customerDelta: 0,
        memo: 'Steady results. Standard intake maintained.',
        sourceWeek: weekNumber
      };
    } else if (weeklyPerf >= bands.coaching) {
      summary.tier = 'coaching';
      summary.adjustments.supervisorRelationship -= 4;
      summary.adjustments.auditRisk += 3;
      summary.outcomes.push('Coaching week: no bonus and higher compliance monitoring.');
      summary.outcomes.push('Next week intake reduced by 1 customer per shift to focus on accuracy.');
      summary.nextWeekDirective = {
        customerDelta: -1,
        memo: 'Coaching protocol active. Reduced intake for quality focus.',
        sourceWeek: weekNumber
      };
    } else {
      summary.tier = 'warning';
      summary.adjustments.writeUps += 1;
      summary.adjustments.supervisorRelationship -= 8;
      summary.adjustments.auditRisk += 12;
      summary.adjustments.money -= 75;
      summary.outcomes.push('Formal warning week: disciplinary write-up issued.');
      summary.outcomes.push('Compliance scrutiny increased for next week.');
      summary.nextWeekDirective = {
        customerDelta: 0,
        memo: 'Formal warning on file. Compliance scrutiny increased.',
        sourceWeek: weekNumber
      };
    }

    if (summary.adjustments.money !== 0) {
      this.player.money = Math.max(0, this.player.money + summary.adjustments.money);
    }
    if (summary.adjustments.promotionProgress !== 0) {
      this.player.promotionProgress = clamp(this.player.promotionProgress + summary.adjustments.promotionProgress, 0, 100);
    }
    if (summary.adjustments.supervisorRelationship !== 0) {
      this.player.supervisorRelationship = clamp(this.player.supervisorRelationship + summary.adjustments.supervisorRelationship, 0, 100);
    }
    if (summary.adjustments.writeUps > 0) {
      this.player.writeUps += summary.adjustments.writeUps;
      this.player.totalWriteUps += summary.adjustments.writeUps;
    } else if (summary.adjustments.writeUps < 0) {
      this.player.writeUps = Math.max(0, this.player.writeUps + summary.adjustments.writeUps);
    }
    if (summary.adjustments.auditRisk !== 0) {
      this.gameState.auditRisk = clamp(this.gameState.auditRisk + summary.adjustments.auditRisk, 0, 100);
    }

    if (this.player.writeUps >= probationWriteUps) {
      this.player.onProbation = true;
      summary.outcomes.push('Probation active: further issues may trigger harsher discipline.');
    } else if (this.player.onProbation && weeklyPerf >= bands.solid && this.player.cleanShiftStreak >= 2) {
      this.player.onProbation = false;
      summary.outcomes.push('Probation cleared after sustained clean performance.');
    }

    summary.probationStatus.after = Boolean(this.player.onProbation);
    this.gameState.weeklyDirective = { ...summary.nextWeekDirective };

    this.logEvent('WEEK_RESOLVED', {
      weekNumber,
      weeklyPerf,
      tier: summary.tier,
      adjustments: { ...summary.adjustments },
      probation: summary.probationStatus.after
    });

    return summary;
  }

  migrateSave(save) {
    if (!save || typeof save !== 'object') return null;
    const version = Number(save.version || 1);
    const migrated = { ...save };

    if (version < 2) {
      if (!migrated.gameState) migrated.gameState = {};
      if (!Array.isArray(migrated.gameState.pendingAppeals)) migrated.gameState.pendingAppeals = [];
      if (!Array.isArray(migrated.gameState.auditHistory)) migrated.gameState.auditHistory = [];
      migrated.version = 2;
    }

    if (version < 3) {
      if (!migrated.gameState) migrated.gameState = {};
      migrated.gameState.difficulty = this.normalizeDifficulty(migrated.gameState.difficulty || 'easy');
      migrated.version = 3;
    }

    if (version < 4) {
      if (!migrated.gameState) migrated.gameState = {};
      if (!migrated.gameState.agencyDatabase || typeof migrated.gameState.agencyDatabase !== 'object') {
        migrated.gameState.agencyDatabase = { peopleByNpcId: {}, vehiclesByVin: {} };
      }
      migrated.version = 4;
    }

    if (version < 5) {
      if (!migrated.gameState) migrated.gameState = {};
      if (!migrated.gameState.weeklyDirective || typeof migrated.gameState.weeklyDirective !== 'object') {
        migrated.gameState.weeklyDirective = this.getDefaultWeeklyDirective();
      }
      migrated.version = 5;
    }

    if (version < 6) {
      if (!migrated.gameState) migrated.gameState = {};
      if (!migrated.gameState.settings || typeof migrated.gameState.settings !== 'object') {
        migrated.gameState.settings = this.getDefaultSettings();
      }
      migrated.version = 6;
    }

    return migrated;
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
    const [catalogs, balancing, dialogue, photoLibrary] = await Promise.all([
      fetch('data/catalogs.json').then(r => r.json()),
      fetch('data/balancing.json').then(r => r.json()),
      fetch('data/dialogue.json').then(r => r.json()),
      fetch('data/photo-library.json').then(r => r.json()).catch(() => ({ photos: [] }))
    ]);

    this.catalogs = catalogs;
    this.balancing = balancing;
    this.dialogueData = dialogue;
    this.setPhotoLibrary(photoLibrary);

    // Initialize systems
    this.player = new PlayerState();
    this.npcGenerator = new NPCGenerator(catalogs, balancing, this.photoLibrary);
    this.caseGenerator = new CaseGenerator(catalogs, balancing, this.photoLibrary);
    this.supervisor = new SupervisorSystem(balancing, dialogue);
    this.shiftManager = new ShiftManager(balancing, dialogue);

    // Try to load saved game
    this.ensureLegacySlotMigration();
    this.loadGame();
    this.initializeSettings();

    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
  }

  setPhotoLibrary(rawLibrary) {
    const atlasSource = rawLibrary?.atlas && typeof rawLibrary.atlas === 'object'
      ? rawLibrary.atlas
      : null;
    const atlas = atlasSource ? {
      image: typeof atlasSource.image === 'string' ? atlasSource.image : '',
      tileWidth: Math.max(1, Number(atlasSource.tileWidth) || 0),
      tileHeight: Math.max(1, Number(atlasSource.tileHeight) || 0),
      columns: Math.max(1, Number(atlasSource.columns) || 0)
    } : null;

    const normalizeAtlasCell = (cell) => {
      if (!cell || typeof cell !== 'object') return null;
      const hasGrid = Number.isFinite(Number(cell.col)) && Number.isFinite(Number(cell.row));
      if (hasGrid) {
        return {
          col: Math.max(0, Math.floor(Number(cell.col))),
          row: Math.max(0, Math.floor(Number(cell.row)))
        };
      }

      const index = Number(cell.index);
      if (!Number.isFinite(index) || !atlas?.columns) return null;
      const safeIndex = Math.max(0, Math.floor(index));
      return {
        col: safeIndex % atlas.columns,
        row: Math.floor(safeIndex / atlas.columns)
      };
    };

    const photos = Array.isArray(rawLibrary?.photos)
      ? rawLibrary.photos
        .filter(entry => entry && typeof entry.id === 'string' && entry.id.trim())
        .map(entry => ({
          id: entry.id,
          customerImage: typeof entry.customerImage === 'string' ? entry.customerImage : '',
          licenseImage: typeof entry.licenseImage === 'string' ? entry.licenseImage : '',
          customerAtlas: normalizeAtlasCell(entry.customerAtlas || entry.atlas),
          licenseAtlas: normalizeAtlasCell(entry.licenseAtlas || entry.atlas),
          tags: entry.tags && typeof entry.tags === 'object' ? entry.tags : {}
        }))
      : [];

    // Derive atlas row count from configured rows or from highest referenced row index.
    const configuredRows = Number(atlasSource?.rows);
    const maxReferencedRow = photos.reduce((maxRow, entry) => {
      const rows = [entry.customerAtlas?.row, entry.licenseAtlas?.row]
        .filter(value => Number.isFinite(value));
      if (!rows.length) return maxRow;
      return Math.max(maxRow, ...rows);
    }, -1);
    const derivedRows = maxReferencedRow >= 0 ? maxReferencedRow + 1 : 1;
    if (atlas) {
      atlas.rows = Math.max(1, Number.isFinite(configuredRows) ? Math.floor(configuredRows) : derivedRows);
    }

    this.photoLibrary = { photos, atlas };
    this.photoLibraryById = new Map(photos.map(entry => [entry.id, entry]));
  }

  getPhotoRecord(photoId) {
    if (!photoId) return null;
    return this.photoLibraryById.get(photoId) || null;
  }

  getPhotoPath(photoId, kind = 'customer') {
    const asset = this.getPhotoAsset(photoId, kind);
    return asset?.type === 'image' ? asset.src : null;
  }

  getPhotoAsset(photoId, kind = 'customer') {
    const record = this.getPhotoRecord(photoId);
    if (!record) return null;

    const preferredImage = kind === 'license'
      ? (record.licenseImage || record.customerImage)
      : (record.customerImage || record.licenseImage);
    if (preferredImage) {
      return { type: 'image', src: preferredImage };
    }

    const preferredAtlasCell = kind === 'license'
      ? (record.licenseAtlas || record.customerAtlas)
      : (record.customerAtlas || record.licenseAtlas);
    const atlas = this.photoLibrary?.atlas;
    if (!preferredAtlasCell || !atlas?.image || !atlas.tileWidth || !atlas.tileHeight || !atlas.columns) {
      return null;
    }

    return {
      type: 'atlas',
      image: atlas.image,
      tileWidth: atlas.tileWidth,
      tileHeight: atlas.tileHeight,
      columns: atlas.columns,
      rows: atlas.rows || 1,
      col: preferredAtlasCell.col,
      row: preferredAtlasCell.row
    };
  }

  getNpcPhotoPath(npc, kind = 'customer') {
    const photoId = npc?.appearance?.photoId;
    if (!photoId) return null;
    return this.getPhotoPath(photoId, kind);
  }

  getNpcPhotoAsset(npc, kind = 'customer') {
    const photoId = npc?.appearance?.photoId;
    if (!photoId) return null;
    return this.getPhotoAsset(photoId, kind);
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
    this.stopServiceTicker();
    this.decrementNpcCooldowns();
    this.player.startNewShift();
    this.supervisor.initialize(this.player.shiftNumber);

    // Generate customer queue
    const customerCount = this.runRng.nextInt(
      this.balancing.shift.customersPerShift[0],
      this.balancing.shift.customersPerShift[1]
    );
    const weeklyCustomerDelta = Math.max(-2, Math.min(2,
      Number(this.gameState?.weeklyDirective?.customerDelta || 0)
    ));
    const adjustedCustomerCount = Math.max(4, Math.min(12, customerCount + weeklyCustomerDelta));

    const queue = this.npcGenerator.generateShiftQueue(
      adjustedCustomerCount,
      this.player.department,
      this.npcPool
    );

    this.shiftManager.startShift(this.player.shiftNumber, queue);
    this.state = GamePhase.SHIFT_START;
    this.logEvent('SHIFT_STARTED', {
      shiftNumber: this.player.shiftNumber,
      customerCount: adjustedCustomerCount,
      supervisor: this.supervisor.name
    });
    this.emit('stateChange', {
      state: this.state,
      shiftNumber: this.player.shiftNumber,
      department: this.player.department,
      departmentName: this.catalogs.departments[this.player.department]?.name || this.player.department,
      difficulty: this.gameState.difficulty,
      difficultyLabel: this.getDifficultyLabel(),
      customerCount: adjustedCustomerCount,
      supervisorName: this.supervisor.name,
      supervisorType: this.supervisor.type,
      pendingAppeals: this.gameState.pendingAppeals.length,
      weeklyDirective: { ...this.gameState.weeklyDirective },
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

    const resumedCase = this.gameState.pendingDocumentReturns[npc.npcId];
    if (resumedCase) {
      delete this.gameState.pendingDocumentReturns[npc.npcId];
    }

    const basePatienceWindow = this.calculateCasePatienceWindow(npc);
    const frustrationPenalty = Number(resumedCase?.requestFrustrationPenalty || 0);
    this.gameState.caseWaitTotal = Math.max(12, basePatienceWindow - frustrationPenalty);
    this.gameState.caseWaitRemaining = this.gameState.caseWaitTotal;
    this.gameState.casePatienceEscalated = false;

    // Check for chaos events
    const events = this.shiftManager.checkForEvent(this.shiftManager.currentCustomerIndex);
    if (events.length > 0) {
      this.emit('event', { type: 'chaos', events });
    }

    // Generate the case (or resume a customer returning with requested paperwork)
    const caseData = resumedCase || this.caseGenerator.generateCase(
      npc,
      this.player.department,
      this.player.shiftNumber,
      this.getDifficultyProfile()
    );

    this.applyDatabaseToCaseData(caseData, npc);

    this.currentCase = caseData;
    this.gameState.caseChecklist[caseData.caseRecord.caseId] = this.gameState.caseChecklist[caseData.caseRecord.caseId] || Object.fromEntries((caseData.caseRecord.inputs.requiredDocs || []).map(d => [d, false]));

    // Advance time
    const difficultyProfile = this.getDifficultyProfile();
    const scaledBaseTime = this.balancing.difficulty.baseTimePerCustomer * difficultyProfile.timePerCustomerMultiplier;
    this.shiftManager.advanceTime(
      Math.floor(scaledBaseTime / this.balancing.shift.clockSpeedMultiplier * 10)
    );

    // Get NPC dialogue
    const archetype = this.getArchetype(npc);
    const dialogueStyle = archetype ? archetype.dialogueStyle : 'nervous';
    const greetingPool = this.dialogueData.greetings[dialogueStyle] || this.dialogueData.greetings.nervous;
    const rng = this.getDeterministicRng(npc.rng.masterSeed + this.player.shiftNumber);
    let greeting = rng.pick(greetingPool);
    greeting = greeting
      .replace('{{requestType}}', this.caseGenerator.formatRequestType(caseData.caseRecord.requestType))
      .replace('{{supervisorName}}', this.supervisor.name);

    if (resumedCase?.returnedWithRequestedDoc && resumedCase.requestedDocType) {
      const requestedDocName = this.caseGenerator.formatDocName(resumedCase.requestedDocType);
      greeting = `I'm back from the records line with the ${requestedDocName}.`;
      if (frustrationPenalty >= 18) {
        greeting += ' This already took too long.';
      }
    }

    const wrongFormCondition = caseData.caseRecord.inputs.conditions.find(c => c.type === 'wrong_form');
    if (wrongFormCondition) {
      greeting += ` I already filled out the ${this.caseGenerator.formatRequestType(wrongFormCondition.submittedForm)} form, so this should be fine, right?`;
    }

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
      waitRemaining: this.gameState.caseWaitRemaining,
      waitTotal: this.gameState.caseWaitTotal,
      activeEffects: this.shiftManager.getActiveEffects(),
      activeChaosEvents: this.shiftManager.getActiveChaosEvents(),
      archetype: archetype ? { id: archetype.id, name: archetype.name } : null,
      conditions: caseData.caseRecord.inputs.conditions
    });
    this.startServiceTicker();
  }

  getCustomerSatisfactionPoints(sentiments = []) {
    const sentimentMap = this.balancing?.sentiment || {};
    return sentiments.reduce((total, sentiment) => total + ((sentimentMap[sentiment] || 0) * 100), 0);
  }

  captureScenarioStatsSnapshot() {
    const perf = this.player?.performance?.currentShift || {};
    return {
      money: Number(this.player?.money || 0),
      writeUps: Number(this.player?.writeUps || 0),
      supervisorRelationship: Number(this.player?.supervisorRelationship || 0),
      promotionProgress: Number(this.player?.promotionProgress || 0),
      complaints: Number(perf?.complaints || 0),
      escalations: Number(perf?.escalations || 0),
      bribesAccepted: Number(perf?.bribesAccepted || 0),
      bribesDeclined: Number(perf?.bribesDeclined || 0),
      policyMajor: Number(perf?.policyErrors?.major || 0),
      policyMinor: Number(perf?.policyErrors?.minor || 0),
      customerSatisfactionScore: this.getCustomerSatisfactionPoints(perf?.customerSentiments || [])
    };
  }

  buildScenarioSummary(beforeStats, afterStats, playerDecision, correctAction) {
    const before = beforeStats || this.captureScenarioStatsSnapshot();
    const after = afterStats || before;
    const keys = [
      'money',
      'writeUps',
      'supervisorRelationship',
      'promotionProgress',
      'complaints',
      'escalations',
      'bribesAccepted',
      'bribesDeclined',
      'policyMajor',
      'policyMinor',
      'customerSatisfactionScore'
    ];

    const deltas = Object.fromEntries(keys.map((key) => [key, (after[key] || 0) - (before[key] || 0)]));

    return {
      selectedAction: playerDecision?.action || 'Unknown',
      selectedReason: playerDecision?.reasonCode || 'N/A',
      expectedAction: correctAction?.action || 'N/A',
      expectedReason: correctAction?.reasonCode || 'N/A',
      deltas,
      before,
      after
    };
  }

  // Player makes a decision
  makeDecision(action, reasonCode = null, notes = '', preScenarioSnapshot = null) {
    if (!this.currentCase || !this.currentNPC) return;
    this.stopServiceTicker();

    const beforeScenarioStats = preScenarioSnapshot || this.captureScenarioStatsSnapshot();
    const caseFee = Math.max(0, Number(this.currentCase?.caseRecord?.inputs?.fee || 0));

    const processingTime = (Date.now() - this.caseStartTime) / 1000;
    const playerDecision = { action, reasonCode: reasonCode || 'AllDocumentsValid', notes };
    const correctAction = this.currentCase.correctAction;

    // Evaluate the decision
    const evaluation = this.supervisor.evaluateCase(
      this.currentCase.caseRecord,
      playerDecision,
      correctAction
    );

    const creditedFee = action === 'Approve' && evaluation.correct ? caseFee : 0;
    if (creditedFee > 0) {
      this.player.money += creditedFee;
    }

    // Update case record
    this.currentCase.caseRecord.decision = {
      action: playerDecision.action,
      reasonCode: playerDecision.reasonCode,
      feeDelta: creditedFee,
      notes
    };
    this.currentCase.caseRecord.audit.processingTimeSec = processingTime;
    this.currentCase.caseRecord.audit.accuracyScore = evaluation.correct ? 1.0 : 0.0;

    // Update NPC + case outcomes/routing
    this.applyCaseConsequences(
      this.currentNPC,
      this.currentCase.caseRecord,
      playerDecision,
      evaluation,
      correctAction
    );
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

    const afterScenarioStats = this.captureScenarioStatsSnapshot();
    const scenarioSummary = this.buildScenarioSummary(beforeScenarioStats, afterScenarioStats, playerDecision, correctAction);

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
      queueStatus: this.shiftManager.getQueueStatus(),
      scenarioSummary
    });
  }

  // Handle bribe response
  respondToBribe(accepted) {
    this.stopServiceTicker();
    const beforeScenarioStats = this.captureScenarioStatsSnapshot();
    this.player.recordBribe(accepted);

    let feedback;
    let evaluation;
    let bribeResult;
    if (accepted) {
      this.player.money += this.currentCase.caseRecord.inputs.conditions.find(c => c.type === 'bribe_attempt').bribeAmount;
      const caught = this.rollImmediateBribeDetection();

      if (caught) {
        // Immediate bust: mark as incorrect and apply a serious conduct hit.
        this.player.performance.currentShift.policyErrors.major++;
        this.player.writeUps++;
        this.player.totalWriteUps++;
        feedback = 'You pocketed the cash, but compliance flagged it immediately. You got caught.';
        evaluation = { correct: false, policyError: 'major', sentiment: 'angry' };
        bribeResult = 'accepted_caught';
      } else {
        feedback = 'You pocketed the cash and pushed it through. No one stopped you... this time.';
        evaluation = { correct: true, sentiment: 'happy' };
        bribeResult = 'accepted_got_away';
      }
    } else {
      feedback = "You firmly declined. The customer looks disappointed but moves on.";
      evaluation = { correct: true, sentiment: 'annoyed' };
      bribeResult = 'declined';
    }

    this.state = GamePhase.RESULT;
    this.logEvent('BRIBE_RESPONSE', {
      caseId: this.currentCase?.caseRecord?.caseId,
      npcId: this.currentNPC?.npcId,
      accepted,
      caught: bribeResult === 'accepted_caught'
    });
    this.emit('stateChange', {
      state: 'result',
      evaluation,
      correctAction: this.currentCase.correctAction,
      playerDecision: {
        action: accepted ? 'Approve' : 'Deny',
        reasonCode: accepted ? 'AcceptedBribe' : 'DeclinedBribe'
      },
      reaction: feedback,
      npcName: this.currentNPC.fullName,
      sentiment: evaluation.sentiment,
      processingTime: Math.round((Date.now() - this.caseStartTime) / 1000),
      queueStatus: this.shiftManager.getQueueStatus(),
      bribeResult,
      scenarioSummary: this.buildScenarioSummary(
        beforeScenarioStats,
        this.captureScenarioStatsSnapshot(),
        { action: accepted ? 'Approve' : 'Deny', reasonCode: accepted ? 'AcceptedBribe' : 'DeclinedBribe' },
        this.currentCase.correctAction
      )
    });
  }

  rollImmediateBribeDetection() {
    const chanceBySupervisor = {
      byTheBook: 0.62,
      politician: 0.4,
      pragmatist: 0.46,
      corrupt: 0.15
    };

    const caseId = String(this.currentCase?.caseRecord?.caseId || '');
    const caseSeed = Number(caseId.replace(/\D/g, '').slice(-6)) || 0;
    const seed = (this.currentNPC?.rng?.masterSeed || 0) + (this.player.shiftNumber * 53) + caseSeed;
    const rng = this.getDeterministicRng(seed);
    const chance = chanceBySupervisor[this.supervisor?.type] ?? 0.45;
    return rng.chance(chance);
  }

  // End the shift
  endShift() {
    this.stopServiceTicker();
    const shiftResult = this.player.endShift(this.balancing);
    this.updateDepartmentUnlocks();
    const review = this.supervisor.generateShiftReview(this.player);
    const shiftSummary = this.shiftManager.getShiftSummary();
    const newAchievements = this.player.checkAchievements();
    const complianceReport = this.runAuditAndAppeals();
    const weeklySummary = this.resolveEndOfWeek();

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
      weeklySummary,
      playerStats: {
        money: this.player.money,
        shiftsCompleted: this.player.shiftsCompleted,
        weeklyPerf: this.player.getWeeklyPerformance(),
        writeUps: this.player.writeUps,
        streak: this.player.cleanShiftStreak,
        promotionProgress: this.player.promotionProgress,
        supervisorRelationship: this.player.supervisorRelationship,
        onProbation: this.player.onProbation,
        unlockedDepartments: [...this.player.unlockedDepartments]
      }
    });

    this.saveGame();
  }

  // Save/Load
  buildSaveData(slotIndex = this.activeSaveSlot) {
    this.gameState.lastPlayedAt = new Date().toISOString();
    return {
      player: this.player.toJSON(),
      npcPool: this.npcPool.map((n) => n.toJSON()),
      globalSeed: this.npcGenerator.globalSeed,
      gameState: {
        seed: this.gameState.seed,
        eventLog: this.gameState.eventLog,
        eventCounter: this.gameState.eventCounter,
        difficulty: this.gameState.difficulty,
        developmentMode: this.gameState.developmentMode,
        caseChecklist: this.gameState.caseChecklist,
        manualOpen: this.gameState.manualOpen,
        pendingAppeals: this.gameState.pendingAppeals,
        auditHistory: this.gameState.auditHistory,
        pendingDocumentReturns: this.gameState.pendingDocumentReturns,
        pendingDocRequest: this.gameState.pendingDocRequest,
        agencyDatabase: this.gameState.agencyDatabase,
        weeklyDirective: this.gameState.weeklyDirective,
        settings: this.gameState.settings,
        lastPlayedAt: this.gameState.lastPlayedAt,
        slotIndex: slotIndex || null
      },
      version: Game.CURRENT_SAVE_VERSION
    };
  }

  saveGame(options = {}) {
    const force = Boolean(options?.force);
    const requestedSlot = this.normalizeSaveSlot(options?.slotIndex);
    this.initializeSettings();
    if (!force && this.gameState.settings.autoSave === false) {
      return false;
    }

    const targetSlot = requestedSlot || this.activeSaveSlot || this.getMostRecentSaveSlot() || 1;
    const slotKey = this.getSaveSlotKey(targetSlot);
    if (!slotKey) return false;

    const saveData = this.buildSaveData(targetSlot);
    try {
      localStorage.setItem(slotKey, JSON.stringify(saveData));
      // Maintain legacy key for backward compatibility with existing tooling and old builds.
      localStorage.setItem(Game.LEGACY_SAVE_KEY, JSON.stringify(saveData));
      this.activeSaveSlot = targetSlot;
      return true;
    } catch (e) {
      console.warn('Failed to save game:', e);
      return false;
    }
  }

  applyLoadedSave(save) {
    if (!save) return false;

    this.player = PlayerState.fromJSON(save.player);
    this.updateDepartmentUnlocks();
    this.npcGenerator.setGlobalSeed(save.globalSeed || Date.now());

    if (save.gameState?.seed) {
      this.setSeed(save.gameState.seed);
      this.gameState.eventLog = save.gameState.eventLog || [];
      this.gameState.eventCounter = save.gameState.eventCounter || 0;
      this.gameState.difficulty = this.normalizeDifficulty(save.gameState.difficulty || 'easy');
      this.gameState.developmentMode = Boolean(save.gameState.developmentMode);
      this.gameState.caseChecklist = save.gameState.caseChecklist || {};
      this.gameState.manualOpen = save.gameState.manualOpen !== false;
      this.gameState.pendingAppeals = save.gameState.pendingAppeals || [];
      this.gameState.auditHistory = save.gameState.auditHistory || [];
      this.gameState.pendingDocumentReturns = save.gameState.pendingDocumentReturns || {};
      this.gameState.pendingDocRequest = save.gameState.pendingDocRequest || null;
      this.gameState.agencyDatabase = save.gameState.agencyDatabase || { peopleByNpcId: {}, vehiclesByVin: {} };
      this.gameState.weeklyDirective = save.gameState.weeklyDirective || this.getDefaultWeeklyDirective();
      this.gameState.settings = save.gameState.settings || this.getDefaultSettings();
      this.gameState.lastPlayedAt = save.gameState.lastPlayedAt || null;
    }

    this.initializeWeeklyDirective();
    this.initializeSettings();

    this.npcPool = Array.isArray(save.npcPool)
      ? save.npcPool.map((n) => NPC.fromJSON(n))
      : [];
    for (const npc of this.npcPool) {
      if (!npc.routing) npc.routing = { nextEligibleDepts: ['DMV'], cooldowns: {} };
      if (!npc.routing.cooldowns) npc.routing.cooldowns = {};
      npc.routing.nextEligibleDepts = this.computeNextEligibleDepartments(npc);
    }

    return true;
  }

  loadGame(options = {}) {
    const requestedSlot = this.normalizeSaveSlot(options?.slotIndex);

    try {
      let save = null;
      let sourceSlot = null;

      if (requestedSlot) {
        save = this.getSaveDataFromSlot(requestedSlot);
        sourceSlot = requestedSlot;
      } else {
        const preferredSlot = this.activeSaveSlot || this.getMostRecentSaveSlot();
        if (preferredSlot) {
          save = this.getSaveDataFromSlot(preferredSlot);
          sourceSlot = preferredSlot;
        }

        if (!save) {
          save = this.getLegacySaveData();
        }
      }

      if (!save) return false;
      const applied = this.applyLoadedSave(save);
      if (!applied) return false;

      this.activeSaveSlot = sourceSlot;
      return true;
    } catch (e) {
      console.warn('Failed to load save:', e);
      return false;
    }
  }

  deleteSaveSlot(slotIndex) {
    const normalizedSlot = this.normalizeSaveSlot(slotIndex);
    if (!normalizedSlot) return false;

    const key = this.getSaveSlotKey(normalizedSlot);
    if (!key) return false;

    try {
      localStorage.removeItem(key);
      if (this.activeSaveSlot === normalizedSlot) {
        this.activeSaveSlot = this.getMostRecentSaveSlot();
      }

      const mostRecentSlot = this.getMostRecentSaveSlot();
      if (!mostRecentSlot) {
        localStorage.removeItem(Game.LEGACY_SAVE_KEY);
      } else {
        const newestSave = this.getSaveDataFromSlot(mostRecentSlot);
        if (newestSave) {
          localStorage.setItem(Game.LEGACY_SAVE_KEY, JSON.stringify(newestSave));
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  resetCareerState({ careerName = 'New Clerk', difficulty = 'easy' } = {}) {
    this.stopServiceTicker();
    this.player = new PlayerState();
    this.player.name = String(careerName || 'New Clerk').trim() || 'New Clerk';
    this.npcPool = [];
    const freshSeed = Date.now();
    this.npcGenerator.setGlobalSeed(freshSeed);
    this.setSeed(freshSeed);
    this.gameState.eventLog = [];
    this.gameState.eventCounter = 0;
    this.gameState.difficulty = this.normalizeDifficulty(difficulty);
    this.gameState.developmentMode = false;
    this.gameState.caseChecklist = {};
    this.gameState.manualOpen = true;
    this.gameState.pendingAppeals = [];
    this.gameState.auditHistory = [];
    this.gameState.pendingDocumentReturns = {};
    this.gameState.pendingDocRequest = null;
    this.gameState.agencyDatabase = { peopleByNpcId: {}, vehiclesByVin: {} };
    this.gameState.weeklyDirective = this.getDefaultWeeklyDirective();
    this.gameState.settings = this.getDefaultSettings();
    this.initializeSettings();
  }

  startNewCareer({ slotIndex = 1, careerName = 'New Clerk', difficulty = 'easy' } = {}) {
    const normalizedSlot = this.normalizeSaveSlot(slotIndex);
    if (!normalizedSlot) return false;

    this.activeSaveSlot = normalizedSlot;
    this.resetCareerState({ careerName, difficulty });
    this.saveGame({ force: true, slotIndex: normalizedSlot });
    this.startShift();
    return true;
  }

  newGame() {
    // Backward-compatible default behavior: replace slot 1 and start at menu.
    this.activeSaveSlot = 1;
    this.resetCareerState({ careerName: 'New Clerk', difficulty: 'easy' });
    this.saveGame({ force: true, slotIndex: 1 });
    this.state = GamePhase.MENU;
    this.emit('stateChange', { state: this.state });
  }

  getGameState() {
    return {
      state: this.state,
      seed: this.gameState.seed,
      difficulty: this.gameState.difficulty,
      developmentMode: this.gameState.developmentMode,
      manualOpen: this.gameState.manualOpen,
      settings: this.getSettings(),
      pendingAppeals: this.gameState.pendingAppeals,
      eventLog: this.gameState.eventLog,
      player: this.player,
      shiftNumber: this.player.shiftNumber,
      department: this.player.department
    };
  }
}
