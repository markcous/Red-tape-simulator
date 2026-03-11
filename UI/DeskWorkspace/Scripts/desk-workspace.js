import { DeskSpawner } from './desk-spawner.js';

export class DeskWorkspace {
  constructor({ root, onStamp = null, onOpenHandbook = null, onTerminalCommand = null, seed = 1337, debugMode = false }) {
    this.root = root;
    this.onStamp = onStamp;
    this.onOpenHandbook = onOpenHandbook;
    this.onTerminalCommand = onTerminalCommand;
    this.items = [];
    this.activeItem = null;
    this.sortCounter = 20;
    this.showDataOverlays = false;
    this.seed = seed;
    this._rngState = seed;
    this.debugMode = Boolean(debugMode);
    this.terminalScreen = 'personLookup';
    this.terminalOpen = false;
    this.terminalContext = null;
    this.systemCrashLockCaseId = null;
    this.terminalLookupState = {
      personQuery: '',
      vinQuery: '',
      personResult: null,
      vinResult: null
    };
    this.terminalCommandState = {
      input: '',
      history: [],
      outputLines: ['Developer command console ready.']
    };
    this.terminalDatabaseState = {
      selectedNpcId: '',
      query: '',
      page: 1,
      pageSize: 8
    };
    this.spawner = new DeskSpawner(this, seed);
    this.animationHandle = null;
    this.ensureShell();
    this.bindRootEvents();
    this.startLoop();
  }

  ensureShell() {
    const terminalImageSrc = new URL('../../../assets/Terminal.png', import.meta.url).href;
    const employeeManualImageSrc = new URL('../../../assets/Employee Manual.png', import.meta.url).href;
    this.root.innerHTML = `
      <div class="desk-surface workspace-surface">
        <button class="desk-terminal-computer" type="button" aria-label="Open DMV terminal">
          <img src="${terminalImageSrc}" alt="DMV terminal computer">
          <span class="terminal-tooltip">DMV Terminal</span>
        </button>
        <button class="desk-manual-book" type="button" aria-label="Open employee handbook">
          <img src="${employeeManualImageSrc}" alt="Employee manual">
          <span class="manual-tooltip">Employee Handbook</span>
        </button>
        <div class="paper-stack workspace-stack"></div>
      </div>
      <aside class="dmv-terminal-panel hidden" aria-hidden="true">
        <div class="dmv-terminal-shell">
          <div class="dmv-terminal-head">
            <div class="dmv-terminal-title">DMV TERMINAL</div>
            <div class="dmv-terminal-controls">
              <button type="button" class="dmv-terminal-dev-toggle" aria-label="Toggle developer mode" aria-pressed="false">Turn Dev On</button>
              <button type="button" class="dmv-terminal-close" aria-label="Close DMV terminal">Close</button>
            </div>
          </div>
          <div class="dmv-terminal-nav">
            <button type="button" class="dmv-terminal-nav-btn" data-screen="personLookup">Person Lookup</button>
            <button type="button" class="dmv-terminal-nav-btn" data-screen="vinLookup">VIN Lookup</button>
            <button type="button" class="dmv-terminal-nav-btn" data-screen="case">Case</button>
            <button type="button" class="dmv-terminal-nav-btn" data-screen="actions">Actions</button>
            <button type="button" class="dmv-terminal-nav-btn dmv-terminal-nav-btn-dev" data-screen="commands">Dev</button>
          </div>
          <div class="dmv-terminal-body"></div>
        </div>
      </aside>
    `;
    this.surface = this.root.querySelector('.workspace-surface');
    this.stack = this.root.querySelector('.workspace-stack');
    this.terminalComputer = this.root.querySelector('.desk-terminal-computer');
    this.manualBook = this.root.querySelector('.desk-manual-book');
    this.terminalPanel = this.root.querySelector('.dmv-terminal-panel');
    this.terminalBody = this.root.querySelector('.dmv-terminal-body');
    this.deskRect = this.surface.getBoundingClientRect();
    this.ensureDebugPanel();
    this.bindTerminalEvents();
    this.renderTerminalScreen();
    this.applyDebugState();
  }

  bindTerminalEvents() {
    this.terminalComputer?.addEventListener('click', () => {
      this.openTerminal();
    });

    this.manualBook?.addEventListener('click', () => {
      if (typeof this.onOpenHandbook !== 'function') return;
      this.onOpenHandbook(this.terminalContext?.caseRecord || null);
    });

    this.terminalPanel?.querySelector('.dmv-terminal-close')?.addEventListener('click', () => {
      this.closeTerminal();
    });

    this.terminalPanel?.querySelector('.dmv-terminal-dev-toggle')?.addEventListener('click', () => {
      if (typeof this.onTerminalCommand !== 'function') return;
      const response = this.onTerminalCommand({ command: 'toggle_dev_mode' }) || { ok: false, enabled: this.debugMode };
      if (typeof response.enabled === 'boolean') {
        this.setDebugMode(response.enabled);
      }
      if (response.message) {
        this.terminalCommandState.outputLines = [response.message];
      }
      this.renderTerminalScreen();
    });

    this.terminalPanel?.querySelectorAll('.dmv-terminal-nav-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.terminalScreen = button.dataset.screen || 'personLookup';
        this.renderTerminalScreen();
      });
    });

    this.terminalBody?.addEventListener('submit', (event) => {
      const commandForm = event.target.closest('form[data-terminal-command-form]');
      if (commandForm) {
        event.preventDefault();
        const input = commandForm.querySelector('input[name="terminal-command"]');
        const rawInput = (input?.value || '').trim();
        this.terminalCommandState.input = rawInput;
        this.runDevTerminalCommand(rawInput);
        this.renderTerminalScreen();
        return;
      }

      const form = event.target.closest('form[data-lookup-form]');
      const databaseSearchForm = event.target.closest('form[data-database-search-form]');
      if (databaseSearchForm) {
        event.preventDefault();
        const input = databaseSearchForm.querySelector('input[name="database-query"]');
        this.terminalDatabaseState.query = String(input?.value || '').trim();
        this.terminalDatabaseState.page = 1;
        this.renderTerminalScreen();
        return;
      }

      const databaseEditForm = event.target.closest('form[data-database-edit-form]');
      if (databaseEditForm) {
        event.preventDefault();
        if (!this.debugMode) {
          this.renderTerminalScreen();
          return;
        }
        const npcId = String(databaseEditForm.querySelector('input[name="database-npc-id"]')?.value || '').trim();
        if (!npcId) {
          this.renderTerminalScreen();
          return;
        }

        const payload = {
          name: databaseEditForm.querySelector('input[name="name"]')?.value || '',
          firstName: databaseEditForm.querySelector('input[name="firstName"]')?.value || '',
          lastName: databaseEditForm.querySelector('input[name="lastName"]')?.value || '',
          dob: databaseEditForm.querySelector('input[name="dob"]')?.value || '',
          sex: databaseEditForm.querySelector('input[name="sex"]')?.value || '',
          eyeColor: databaseEditForm.querySelector('input[name="eyeColor"]')?.value || '',
          hairColor: databaseEditForm.querySelector('input[name="hairColor"]')?.value || '',
          organDonor: databaseEditForm.querySelector('input[name="organDonor"]')?.value || '',
          height: databaseEditForm.querySelector('input[name="height"]')?.value || '',
          weight: databaseEditForm.querySelector('input[name="weight"]')?.value || '',
          ssn: databaseEditForm.querySelector('input[name="ssn"]')?.value || '',
          dlNumber: databaseEditForm.querySelector('input[name="dlNumber"]')?.value || '',
          address: databaseEditForm.querySelector('input[name="address"]')?.value || '',
          phone: databaseEditForm.querySelector('input[name="phone"]')?.value || '',
          email: databaseEditForm.querySelector('input[name="email"]')?.value || '',
          restrictions: databaseEditForm.querySelector('input[name="restrictions"]')?.value || '',
          ertc: databaseEditForm.querySelector('input[name="ertc"]')?.value || '',
          tickets: databaseEditForm.querySelector('input[name="tickets"]')?.value || '0',
          fines: databaseEditForm.querySelector('input[name="fines"]')?.value || '0',
          impound: databaseEditForm.querySelector('select[name="impound"]')?.value === 'yes'
        };

        if (typeof this.onTerminalCommand === 'function') {
          const response = this.onTerminalCommand({
            command: 'database_update',
            target: 'person',
            id: npcId,
            payload,
            context: this.terminalContext
          }) || { ok: false, message: 'Database update failed.' };

          if (response.ok) {
            this.terminalDatabaseState.selectedNpcId = npcId;
            if (response.database) {
              this.terminalContext = {
                ...(this.terminalContext || {}),
                agencyDatabase: response.database
              };
            }
          }
          this.terminalCommandState.outputLines = [response.message || (response.ok ? 'Database updated.' : 'Database update failed.')];
        }

        this.renderTerminalScreen();
        return;
      }

      if (!form) return;
      event.preventDefault();
      const type = form.dataset.lookupForm;
      const input = form.querySelector('input[name="lookup-query"]');
      const query = (input?.value || '').trim();

      if (type === 'person') {
        this.terminalLookupState.personQuery = query;
        this.terminalLookupState.personResult = this.searchPersonRecords(query);
      }

      if (type === 'vin') {
        this.terminalLookupState.vinQuery = query;
        this.terminalLookupState.vinResult = this.searchVehicleRecords(query);
      }

      this.renderTerminalScreen();
    });

    this.terminalBody?.addEventListener('click', (event) => {
      const databasePageButton = event.target.closest('button[data-database-page-action]');
      if (databasePageButton) {
        const action = String(databasePageButton.dataset.databasePageAction || '').toLowerCase();
        if (action === 'prev') {
          this.terminalDatabaseState.page = Math.max(1, Number(this.terminalDatabaseState.page || 1) - 1);
        } else if (action === 'next') {
          this.terminalDatabaseState.page = Math.max(1, Number(this.terminalDatabaseState.page || 1) + 1);
        }
        this.renderTerminalScreen();
        return;
      }

      const databaseSelectButton = event.target.closest('button[data-database-select-id]');
      if (databaseSelectButton) {
        this.terminalDatabaseState.selectedNpcId = String(databaseSelectButton.dataset.databaseSelectId || '').trim();
        this.renderTerminalScreen();
        return;
      }

      const commandButton = event.target.closest('button[data-command]');
      if (commandButton) {
        const command = String(commandButton.dataset.command || '').trim();
        if (command) {
          this.terminalCommandState.input = command;
          this.runDevTerminalCommand(command);
          this.renderTerminalScreen();
        }
        return;
      }

      const btn = event.target.closest('button[data-prefill-query]');
      if (!btn) return;

      const lookupType = btn.dataset.prefillType;
      const query = btn.dataset.prefillQuery || '';

      if (lookupType === 'person') {
        this.terminalLookupState.personQuery = query;
        this.terminalLookupState.personResult = this.searchPersonRecords(query);
      }

      if (lookupType === 'vin') {
        this.terminalLookupState.vinQuery = query;
        this.terminalLookupState.vinResult = this.searchVehicleRecords(query);
      }

      this.renderTerminalScreen();
    });
  }

  openTerminal() {
    this.terminalOpen = true;
    this.terminalPanel?.classList.remove('hidden');
    this.terminalPanel?.setAttribute('aria-hidden', 'false');
    this.renderTerminalScreen();
  }

  closeTerminal() {
    this.terminalOpen = false;
    this.terminalPanel?.classList.add('hidden');
    this.terminalPanel?.setAttribute('aria-hidden', 'true');
  }

  setTerminalContext(context = {}, options = {}) {
    const previousCaseId = this.terminalContext?.caseRecord?.caseId || null;
    const nextCaseId = context?.caseRecord?.caseId || null;
    const shouldResetCommandState = options.resetCommandState !== undefined
      ? Boolean(options.resetCommandState)
      : previousCaseId !== nextCaseId;
    const shouldResetLookupState = options.resetLookupState !== undefined
      ? Boolean(options.resetLookupState)
      : previousCaseId !== nextCaseId;

    this.terminalContext = context;

    if (typeof context?.devMode === 'boolean' && context.devMode !== this.debugMode) {
      this.setDebugMode(context.devMode);
    }

    if (previousCaseId !== nextCaseId) {
      this.systemCrashLockCaseId = null;
    }

    // Latch crash state to the active case so the terminal stays down for the full interaction.
    const contextCrashEvent = this.getContextSystemCrashEvent();
    if (contextCrashEvent && nextCaseId) {
      this.systemCrashLockCaseId = nextCaseId;
    }

    if (shouldResetLookupState) {
      this.terminalLookupState.personResult = null;
      this.terminalLookupState.vinResult = null;
      this.terminalLookupState.personQuery = '';
      this.terminalLookupState.vinQuery = '';
    }

    if (shouldResetCommandState) {
      this.terminalCommandState.history = [];
      this.terminalCommandState.outputLines = ['Context refreshed.'];
    }

    if (this.isTerminalLockedByCrash()) {
      this.terminalCommandState.outputLines = ['SYSTEM OFFLINE: Database cluster unreachable.'];
    }

    this.renderTerminalScreen();
  }

  getContextSystemCrashEvent() {
    const chaosEvents = Array.isArray(this.terminalContext?.activeChaosEvents)
      ? this.terminalContext.activeChaosEvents
      : [];
    return chaosEvents.find((event) => event?.id === 'system_crash') || null;
  }

  getActiveSystemCrashEvent() {
    const contextEvent = this.getContextSystemCrashEvent();
    if (contextEvent) {
      return { ...contextEvent, lockReason: 'active_event' };
    }

    const currentCaseId = this.terminalContext?.caseRecord?.caseId || null;
    if (this.systemCrashLockCaseId && currentCaseId && this.systemCrashLockCaseId === currentCaseId) {
      return {
        id: 'system_crash',
        name: 'Computer System Crash',
        description: 'Crash remains active for the current customer.',
        lockReason: 'case_latched',
        remainingDuration: null
      };
    }

    return null;
  }

  isTerminalLockedByCrash() {
    return Boolean(this.getActiveSystemCrashEvent());
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  normalizeVin(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  isPlaceholderVin(vin) {
    const normalized = this.normalizeVin(vin);
    if (!normalized) return true;
    const placeholders = new Set([
      'VINONFILE',
      'PENDINGVERIFICATION',
      'APPLICATIONFILE',
      'UNKNOWN',
      'NA'
    ]);
    return placeholders.has(normalized);
  }

  normalizeQuery(value) {
    return String(value || '').trim().toLowerCase();
  }

  hashString(value) {
    const input = String(value || '0');
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  createDeterministicGenerator(seed) {
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
        if (!Array.isArray(items) || !items.length) return null;
        const index = this.nextInt(0, items.length - 1);
        return items[index];
      }
    };
  }

  formatHeightInches(inchesValue) {
    const inches = Math.max(48, Math.min(84, Number(inchesValue || 0)));
    const feet = Math.floor(inches / 12);
    const remainder = inches % 12;
    return `${feet}'${String(remainder).padStart(2, '0')}"`;
  }

  toVehicleAge(yearValue) {
    const year = Number(yearValue);
    if (!Number.isFinite(year) || year <= 0) return 'Unknown';
    const currentYear = new Date().getFullYear();
    return Math.max(0, currentYear - year);
  }

  extractPresentDocs(caseRecord) {
    return Object.values(caseRecord?.inputs?.providedDocs || {}).filter((doc) => doc?.present);
  }

  normalizeVehicleRecord(record = {}) {
    const vin = this.normalizeVin(record.vin || record.vehicleVIN || record.vehicleId);
    if (!vin || this.isPlaceholderVin(vin)) return null;

    const year = Number(record.year || record.vehicleYear);
    return {
      vin,
      make: String(record.make || record.vehicleMake || 'Unknown').trim() || 'Unknown',
      model: String(record.model || record.vehicleModel || 'Unknown').trim() || 'Unknown',
      year: Number.isFinite(year) ? year : 'Unknown',
      color: String(record.color || record.vehicleColor || 'Unknown').trim() || 'Unknown'
    };
  }

  buildFallbackRegistryVehicles(npc, knownVehicles = []) {
    if (knownVehicles.length) return knownVehicles;

    const seed = Number(npc?.rng?.masterSeed || this.hashString(npc?.npcId || npc?.fullName || 'npc'));
    const rng = this.createDeterministicGenerator(seed);
    const makes = ['Toyota', 'Ford', 'Honda', 'Chevrolet', 'Nissan', 'Hyundai', 'Kia', 'BMW', 'Mazda', 'Subaru'];
    const models = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Minivan', 'Wagon'];
    const colors = ['Black', 'White', 'Gray', 'Silver', 'Blue', 'Red', 'Green', 'Brown'];
    const vinChars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    const count = rng.nextInt(1, 2);
    const vehicles = [];

    for (let index = 0; index < count; index++) {
      let vin = '';
      for (let i = 0; i < 17; i++) {
        vin += vinChars.charAt(rng.nextInt(0, vinChars.length - 1));
      }
      const year = rng.nextInt(2006, new Date().getFullYear());
      vehicles.push({
        vin,
        make: rng.pick(makes) || 'Unknown',
        model: rng.pick(models) || 'Unknown',
        year,
        color: rng.pick(colors) || 'Unknown',
        source: 'Registry profile'
      });
    }

    return vehicles;
  }

  buildRegistryPersonRecord(npc, observations = {}) {
    const seed = Number(npc?.rng?.masterSeed || this.hashString(npc?.npcId || npc?.fullName || 'npc'));
    const rng = this.createDeterministicGenerator(seed + 17);
    const eyeColors = ['Brown', 'Hazel', 'Blue', 'Green', 'Gray'];
    const sexes = ['F', 'M', 'X'];
    const flags = Array.isArray(npc?.flags) ? npc.flags : [];
    const unpaidTicketsFlag = flags.find((flag) => flag?.flagId === 'UNPAID_TICKETS');
    const tickets = Number(unpaidTicketsFlag?.data?.count || 0);
    const fines = Number(unpaidTicketsFlag?.data?.amountDue || 0);
    const impoundHold = flags.some((flag) => flag?.flagId === 'IMPOUND_HOLD');
    const dlFromObservation = String(observations.licenseNumber || '').trim();
    const dlFromSeed = `DL${String((seed % 900000) + 100000)}`;
    const ssnMarker = rng.pick(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']) || 'X';
    const generatedSsn = `${rng.nextInt(100, 899)}-${rng.nextInt(10, 99)}-${ssnMarker}${String(rng.nextInt(100, 999)).padStart(3, '0')}`;
    const heightInches = rng.nextInt(58, 78);
    const weightLbs = rng.nextInt(110, 280);
    const firstName = String(npc?.identity?.firstName || '').trim();
    const lastName = String(npc?.identity?.lastName || '').trim();

    return {
      npcId: npc?.npcId || 'N/A',
      name: npc?.fullName || `${npc?.identity?.firstName || ''} ${npc?.identity?.lastName || ''}`.trim() || 'Unknown',
      firstName,
      lastName,
      dob: observations.dob || npc?.identity?.dob || 'On file',
      height: this.formatHeightInches(heightInches),
      weight: `${weightLbs} lb`,
      sex: String(observations.sex || npc?.identity?.sex || rng.pick(sexes) || 'U'),
      eyeColor: String(observations.eyeColor || npc?.appearance?.eyeColor || rng.pick(eyeColors) || 'Unknown'),
      hairColor: String(npc?.identity?.hairColor || npc?.appearance?.hair?.color || rng.pick(['Black', 'Brown', 'Blonde', 'Gray', 'Red']) || 'Brown'),
      organDonor: observations.organDonor !== undefined
        ? (observations.organDonor ? 'Yes' : 'No')
        : (rng.next() > 0.42 ? 'Yes' : 'No'),
      ssn: observations.ssn || npc?.identity?.ssn || npc?.identity?.ssnMasked || generatedSsn,
      dlNumber: dlFromObservation || dlFromSeed,
      address: observations.address || npc?.identity?.address || 'On file',
      phone: npc?.identity?.phone || 'On file',
      email: npc?.identity?.email || 'On file',
      ticketsFinesImpound: `tickets:${tickets} | fines:$${fines} | impound:${impoundHold ? 'yes' : 'no'}`,
      riskFlags: flags.map((flag) => flag?.flagId).filter(Boolean)
    };
  }

  mergeNpcRegistryIntoTerminalRecords(people = [], vehicles = []) {
    const caseRecord = this.terminalContext?.caseRecord || {};
    const currentNpc = this.terminalContext?.npc || null;
    const registryNpcs = Array.isArray(this.terminalContext?.npcRegistry) ? this.terminalContext.npcRegistry : [];

    const npcMap = new Map();
    const addNpc = (entry) => {
      if (!entry?.npcId || npcMap.has(entry.npcId)) return;
      npcMap.set(entry.npcId, entry);
    };

    registryNpcs.forEach(addNpc);
    addNpc(currentNpc);

    if (!npcMap.size) {
      return { people, vehicles };
    }

    const personMap = new Map();
    people.forEach((entry) => {
      const id = String(entry?.npcId || '').trim();
      if (!id || personMap.has(id)) return;
      personMap.set(id, entry);
    });

    const vehicleMap = new Map();
    vehicles.forEach((entry) => {
      const vin = this.normalizeVin(entry?.vin);
      if (!vin || this.isPlaceholderVin(vin) || vehicleMap.has(vin)) return;
      vehicleMap.set(vin, { ...entry, vin });
    });

    npcMap.forEach((npc) => {
      const npcId = String(npc?.npcId || '').trim();
      if (!npcId || personMap.has(npcId)) return;

      const observations = {
        dob: npc?.identity?.dob || '',
        address: npc?.identity?.address || '',
        ssn: npc?.identity?.ssnMasked || '',
        licenseNumber: '',
        eyeColor: '',
        organDonor: undefined,
        sex: npc?.identity?.sex || ''
      };

      const observedVehicles = [];
      const caseHistory = Array.isArray(npc?.caseHistory) ? npc.caseHistory : [];
      const relevantCases = [...caseHistory];
      if (npcId && caseRecord?.npcId === npcId) {
        relevantCases.push(caseRecord);
      }

      relevantCases.forEach((record) => {
        this.extractPresentDocs(record).forEach((doc) => {
          const data = doc?.data || {};
          if (!observations.licenseNumber && data.licenseNumber) observations.licenseNumber = data.licenseNumber;
          if (data.address) observations.address = data.address;
          if (data.ssn) observations.ssn = data.ssn;

          const normalizedVehicle = this.normalizeVehicleRecord({
            vin: data.vin || data.vehicleVIN || data.vehicleId,
            make: data.make || data.vehicleMake,
            model: data.model || data.vehicleModel,
            year: data.year || data.vehicleYear,
            color: data.color || data.vehicleColor
          });
          if (normalizedVehicle) {
            observedVehicles.push({
              ...normalizedVehicle,
              source: `${doc?.type || 'document'} record`
            });
          }
        });
      });

      const personRecord = this.buildRegistryPersonRecord(npc, observations);
      const ownedVehicles = this.buildFallbackRegistryVehicles(npc, observedVehicles)
        .map((vehicle) => ({
          ...vehicle,
          ownerName: personRecord.name,
          ownerNpcId: personRecord.npcId,
          age: this.toVehicleAge(vehicle.year)
        }));

      personRecord.vehicles = ownedVehicles;
      personRecord.matchKeys = [
        personRecord.npcId,
        personRecord.name,
        personRecord.ssn,
        personRecord.dlNumber,
        personRecord.address,
        personRecord.phone,
        personRecord.email
      ].filter(Boolean);

      personMap.set(personRecord.npcId, personRecord);
      people.push(personRecord);

      ownedVehicles.forEach((vehicle) => {
        const vin = this.normalizeVin(vehicle.vin);
        if (!vin || this.isPlaceholderVin(vin) || vehicleMap.has(vin)) return;
        vehicleMap.set(vin, vehicle);
        vehicles.push(vehicle);
      });
    });

    return { people, vehicles };
  }

  collectTerminalRecords() {
    const caseRecord = this.terminalContext?.caseRecord || {};
    const currentNpc = this.terminalContext?.npc || null;
    const agencyDatabase = this.terminalContext?.agencyDatabase;
    if (agencyDatabase && Array.isArray(agencyDatabase.people) && Array.isArray(agencyDatabase.vehicles)) {
      const people = [...agencyDatabase.people];
      const vehicles = [...agencyDatabase.vehicles];

      return this.mergeNpcRegistryIntoTerminalRecords(people, vehicles);
    }

    const registryNpcs = Array.isArray(this.terminalContext?.npcRegistry) ? this.terminalContext.npcRegistry : [];
    const npcMap = new Map();
    registryNpcs.forEach((entry) => {
      if (entry?.npcId && !npcMap.has(entry.npcId)) npcMap.set(entry.npcId, entry);
    });
    if (currentNpc?.npcId && !npcMap.has(currentNpc.npcId)) {
      npcMap.set(currentNpc.npcId, currentNpc);
    }

    const personMap = new Map();
    const vehicleMap = new Map();

    npcMap.forEach((npc) => {
      const observations = {
        dob: npc?.identity?.dob || '',
        address: npc?.identity?.address || '',
        ssn: npc?.identity?.ssnMasked || '',
        licenseNumber: '',
        eyeColor: '',
        organDonor: undefined,
        sex: npc?.identity?.sex || ''
      };

      const observedVehicles = [];
      const caseHistory = Array.isArray(npc?.caseHistory) ? npc.caseHistory : [];
      const relevantCases = [...caseHistory];
      if (npc?.npcId && caseRecord?.npcId === npc.npcId) {
        relevantCases.push(caseRecord);
      }

      relevantCases.forEach((record) => {
        this.extractPresentDocs(record).forEach((doc) => {
          const data = doc?.data || {};
          if (!observations.licenseNumber && data.licenseNumber) observations.licenseNumber = data.licenseNumber;
          if (data.address) observations.address = data.address;
          if (data.ssn) observations.ssn = data.ssn;

          const normalizedVehicle = this.normalizeVehicleRecord({
            vin: data.vin || data.vehicleVIN || data.vehicleId,
            make: data.make || data.vehicleMake,
            model: data.model || data.vehicleModel,
            year: data.year || data.vehicleYear,
            color: data.color || data.vehicleColor
          });
          if (normalizedVehicle) {
            observedVehicles.push({
              ...normalizedVehicle,
              source: `${doc?.type || 'document'} record`
            });
          }
        });
      });

      const personRecord = this.buildRegistryPersonRecord(npc, observations);
      const ownedVehicles = this.buildFallbackRegistryVehicles(npc, observedVehicles)
        .map((vehicle) => ({
          ...vehicle,
          ownerName: personRecord.name,
          ownerNpcId: personRecord.npcId,
          age: this.toVehicleAge(vehicle.year)
        }));

      personRecord.vehicles = ownedVehicles;
      personRecord.matchKeys = [
        personRecord.npcId,
        personRecord.name,
        personRecord.ssn,
        personRecord.dlNumber,
        personRecord.address,
        personRecord.phone,
        personRecord.email
      ].filter(Boolean);

      personMap.set(personRecord.npcId, personRecord);
      ownedVehicles.forEach((vehicle) => {
        const vin = this.normalizeVin(vehicle.vin);
        if (!vin || this.isPlaceholderVin(vin)) return;
        if (vehicleMap.has(vin)) return;
        vehicleMap.set(vin, vehicle);
      });
    });

    return {
      people: Array.from(personMap.values()),
      vehicles: Array.from(vehicleMap.values())
    };
  }

  searchPersonRecords(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return { query: '', matches: [], searched: false };
    }

    const normalizedQuery = this.normalizeQuery(trimmed);
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const records = this.collectTerminalRecords().people;
    const matches = records.filter((record) => {
      const searchable = [
        ...(record.matchKeys || []),
        record.name,
        record.firstName,
        record.lastName
      ]
        .filter(Boolean)
        .map((entry) => String(entry).toLowerCase());

      if (searchable.some((entry) => entry.includes(normalizedQuery))) {
        return true;
      }

      if (!queryTokens.length) return false;
      return queryTokens.every((token) => searchable.some((entry) => entry.includes(token)));
    });

    return {
      query: trimmed,
      matches,
      searched: true
    };
  }

  searchVehicleRecords(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return { query: '', matches: [], searched: false };
    }

    const normalizedVin = this.normalizeVin(trimmed);
    const records = this.collectTerminalRecords().vehicles;
    const matches = records.filter((record) => {
      const vin = this.normalizeVin(record.vin);
      const owner = String(record.ownerName || '').toLowerCase();
      const make = String(record.make || '').toLowerCase();
      const model = String(record.model || '').toLowerCase();
      return vin.includes(normalizedVin)
        || owner.includes(this.normalizeQuery(trimmed))
        || make.includes(this.normalizeQuery(trimmed))
        || model.includes(this.normalizeQuery(trimmed));
    });

    return {
      query: trimmed,
      matches,
      searched: true
    };
  }

  renderPersonLookupResults(result) {
    if (!result?.searched) {
      return `<p class="dmv-terminal-note">Search by name, NPC ID, SSN, license number, address, phone, or email.</p>`;
    }

    if (!result.matches.length) {
      return `<div class="dmv-terminal-empty">No people matched "${this.escapeHtml(result.query)}".</div>`;
    }

    return `
      <div class="dmv-terminal-results-meta">${result.matches.length} matching record${result.matches.length === 1 ? '' : 's'}</div>
      ${result.matches.map((entry) => `
        <div class="dmv-terminal-result-card">
          <div class="dmv-terminal-line"><span>Name</span><strong>${this.escapeHtml(entry.name)}</strong></div>
          <div class="dmv-terminal-line"><span>NPC ID</span><strong>${this.escapeHtml(entry.npcId)}</strong></div>
          <div class="dmv-terminal-line"><span>DOB</span><strong>${this.escapeHtml(entry.dob)}</strong></div>
          <div class="dmv-terminal-line"><span>Height</span><strong>${this.escapeHtml(entry.height)}</strong></div>
          <div class="dmv-terminal-line"><span>Weight</span><strong>${this.escapeHtml(entry.weight)}</strong></div>
          <div class="dmv-terminal-line"><span>Sex</span><strong>${this.escapeHtml(entry.sex)}</strong></div>
          <div class="dmv-terminal-line"><span>Eye Color</span><strong>${this.escapeHtml(entry.eyeColor)}</strong></div>
          <div class="dmv-terminal-line"><span>Hair Color</span><strong>${this.escapeHtml(entry.hairColor || 'Brown')}</strong></div>
          <div class="dmv-terminal-line"><span>Organ Donor</span><strong>${this.escapeHtml(entry.organDonor)}</strong></div>
          <div class="dmv-terminal-line"><span>SSN</span><strong>${this.escapeHtml(entry.ssn)}</strong></div>
          <div class="dmv-terminal-line"><span>DL Number</span><strong>${this.escapeHtml(entry.dlNumber)}</strong></div>
          <div class="dmv-terminal-line"><span>Address</span><strong>${this.escapeHtml(entry.address)}</strong></div>
          <div class="dmv-terminal-line"><span>Phone</span><strong>${this.escapeHtml(entry.phone)}</strong></div>
          <div class="dmv-terminal-line"><span>Email</span><strong>${this.escapeHtml(entry.email)}</strong></div>
          <div class="dmv-terminal-line"><span>Tickets/Fines/Impound</span><strong>${this.escapeHtml(entry.ticketsFinesImpound)}</strong></div>
          <div class="dmv-terminal-line"><span>Flags</span><strong>${this.escapeHtml((entry.riskFlags || []).join(', ') || 'None')}</strong></div>
          <div class="dmv-terminal-subtitle">Registered Vehicles</div>
          <ul class="dmv-terminal-list">
            ${(entry.vehicles || []).map((vehicle) => `
              <li>${this.escapeHtml(vehicle.vin)} | ${this.escapeHtml(`${vehicle.make} ${vehicle.model}`)} | year ${this.escapeHtml(vehicle.year)} | color ${this.escapeHtml(vehicle.color)} | age ${this.escapeHtml(vehicle.age)}</li>
            `).join('') || '<li>No vehicles on record.</li>'}
          </ul>
        </div>
      `).join('')}
    `;
  }

  renderVinLookupResults(result) {
    if (!result?.searched) {
      return `<p class="dmv-terminal-note">Search by full VIN or partial VIN fragments found on submitted forms.</p>`;
    }

    if (!result.matches.length) {
      return `<div class="dmv-terminal-empty">No vehicle matched VIN "${this.escapeHtml(result.query)}".</div>`;
    }

    return `
      <div class="dmv-terminal-results-meta">${result.matches.length} VIN match${result.matches.length === 1 ? '' : 'es'}</div>
      ${result.matches.map((entry) => `
        <div class="dmv-terminal-result-card">
          <div class="dmv-terminal-line"><span>VIN</span><strong>${this.escapeHtml(entry.vin)}</strong></div>
          <div class="dmv-terminal-line"><span>Vehicle</span><strong>${this.escapeHtml(`${entry.year} ${entry.make} ${entry.model}`)}</strong></div>
          <div class="dmv-terminal-line"><span>Color</span><strong>${this.escapeHtml(entry.color)}</strong></div>
          <div class="dmv-terminal-line"><span>Vehicle Age</span><strong>${this.escapeHtml(entry.age)}</strong></div>
          <div class="dmv-terminal-line"><span>Owner On Record</span><strong>${this.escapeHtml(entry.ownerName)}</strong></div>
          <div class="dmv-terminal-line"><span>Owner NPC ID</span><strong>${this.escapeHtml(entry.ownerNpcId)}</strong></div>
          <div class="dmv-terminal-line"><span>Record Source</span><strong>${this.escapeHtml(entry.source)}</strong></div>
        </div>
      `).join('')}
    `;
  }

  getCommandCatalog() {
    const devTerminal = this.terminalContext?.devTerminal || {};
    const requestForms = Array.isArray(devTerminal.requestForms) ? devTerminal.requestForms : [];
    const documentForms = Array.isArray(devTerminal.documentForms) ? devTerminal.documentForms : [];
    const miniGames = Array.isArray(devTerminal.miniGames) ? devTerminal.miniGames : [];
    return {
      requestForms,
      documentForms,
      miniGames,
      lines: [
        'OPEN DATABASE',
        'END SHIFT NOW',
        'END SHIFT GRADE <S|A|B|C|D|F>',
        'SKIP NEXT WEEK',
        'LAUNCH MINIGAME <MiniGameId>',
        'SPAWN CASE PACKET',
        'CLEAR DESK',
        'SPAWN REQUEST <RequestType>',
        'SPAWN DOC <DocType>',
        'CLEAR LOG'
      ]
    };
  }

  getDatabasePeople() {
    const records = this.collectTerminalRecords();
    const people = Array.isArray(records.people) ? [...records.people] : [];
    people.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    return people;
  }

  getDatabaseFilteredPeople(people = this.getDatabasePeople()) {
    const query = String(this.terminalDatabaseState.query || '').trim().toLowerCase();
    if (!query) return people;

    const tokens = query.split(/\s+/).filter(Boolean);
    return people.filter((entry) => {
      const haystack = [
        entry?.name,
        entry?.npcId,
        entry?.firstName,
        entry?.lastName,
        entry?.ssn,
        entry?.dlNumber,
        entry?.address,
        entry?.phone,
        entry?.email
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return tokens.every((token) => haystack.some((fieldValue) => fieldValue.includes(token)));
    });
  }

  getDatabasePageState(filteredPeople = this.getDatabaseFilteredPeople()) {
    const pageSize = Math.max(1, Number(this.terminalDatabaseState.pageSize || 8));
    const totalItems = filteredPeople.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.max(1, Math.min(totalPages, Number(this.terminalDatabaseState.page || 1)));
    this.terminalDatabaseState.page = page;

    const start = (page - 1) * pageSize;
    const items = filteredPeople.slice(start, start + pageSize);
    return {
      page,
      pageSize,
      totalItems,
      totalPages,
      items,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }

  getDatabaseSelectedPerson(people = this.getDatabaseFilteredPeople()) {
    if (!people.length) return null;

    const activeId = String(this.terminalDatabaseState.selectedNpcId || '').trim();
    const activeApplicantId = String(this.terminalContext?.npc?.npcId || '').trim();
    const selected = people.find((entry) => String(entry?.npcId || '') === activeId)
      || people.find((entry) => String(entry?.npcId || '') === activeApplicantId)
      || people[0];

    if (selected?.npcId) {
      this.terminalDatabaseState.selectedNpcId = selected.npcId;
    }
    return selected;
  }

  setCommandOutput(rawInput, lines) {
    const outputLines = Array.isArray(lines) ? lines.filter(Boolean) : [String(lines || '')];
    this.terminalCommandState.outputLines = outputLines;
    this.terminalCommandState.history.unshift({
      command: rawInput,
      output: outputLines.join(' | ')
    });
    if (this.terminalCommandState.history.length > 12) {
      this.terminalCommandState.history = this.terminalCommandState.history.slice(0, 12);
    }
  }

  runDevTerminalCommand(rawInput) {
    if (this.isTerminalLockedByCrash()) {
      this.setCommandOutput(rawInput, ['SYSTEM OFFLINE: Commands are disabled during a computer system crash.']);
      return;
    }

    if (!this.debugMode) {
      this.setCommandOutput(rawInput, ['Developer mode is required for terminal commands.']);
      return;
    }

    const input = String(rawInput || '').trim();
    if (!input) {
      this.setCommandOutput(input, ['No command entered.']);
      return;
    }

    const normalized = input.toLowerCase();
    const tokens = input.split(/\s+/).filter(Boolean);
    const command = String(tokens[0] || '').toLowerCase();
    const subcommand = String(tokens[1] || '').toLowerCase();
    const argument = tokens.slice(2).join(' ').trim();
    const catalog = this.getCommandCatalog();

    if (normalized === 'open database' || normalized === 'database') {
      this.terminalScreen = 'database';
      this.setCommandOutput(input, ['Opening database editor...']);
      return;
    }

    if (normalized === 'clear' || normalized === 'clear log' || normalized === 'clearlog') {
      this.terminalCommandState.history = [];
      this.setCommandOutput(input, ['Command log cleared.']);
      return;
    }

    if (normalized === 'clear desk') {
      this.clear();
      this.setCommandOutput(input, ['Desk cleared.']);
      return;
    }

    if (normalized === 'spawn case packet') {
      this.spawnCasePacketFromActiveScenario({ rawInput: input, writeOutput: true });
      return;
    }

    const endShiftMatch = normalized.match(/^(?:end shift(?: now)?|skip to shift end)(?: grade ([sabcdf]))?$/);
    if (endShiftMatch) {
      if (typeof this.onTerminalCommand !== 'function') {
        this.setCommandOutput(input, ['Terminal command handler is not available.']);
        return;
      }

      const forcedGrade = endShiftMatch[1] ? endShiftMatch[1].toUpperCase() : null;

      const response = this.onTerminalCommand({
        command: 'end_shift',
        forcedGrade,
        context: this.terminalContext
      }) || { ok: false, message: 'Command failed.' };

      const output = Array.isArray(response.outputLines) && response.outputLines.length
        ? response.outputLines
        : [response.message || (response.ok ? 'Command completed.' : 'Command failed.')];
      this.setCommandOutput(input, output);
      return;
    }

    if (normalized === 'skip next week' || normalized === 'skip week') {
      if (typeof this.onTerminalCommand !== 'function') {
        this.setCommandOutput(input, ['Terminal command handler is not available.']);
        return;
      }

      const response = this.onTerminalCommand({
        command: 'skip_week',
        context: this.terminalContext
      }) || { ok: false, message: 'Command failed.' };

      const output = Array.isArray(response.outputLines) && response.outputLines.length
        ? response.outputLines
        : [response.message || (response.ok ? 'Command completed.' : 'Command failed.')];
      this.setCommandOutput(input, output);
      return;
    }

    if (command === 'launch' && (subcommand === 'minigame' || subcommand === 'mini-game')) {
      if (!argument) {
        this.setCommandOutput(input, ['Missing mini-game id. Example: LAUNCH MINIGAME parking_fine_payment']);
        return;
      }

      if (typeof this.onTerminalCommand !== 'function') {
        this.setCommandOutput(input, ['Terminal command handler is not available.']);
        return;
      }

      const response = this.onTerminalCommand({
        command: 'launch_minigame',
        id: argument,
        context: this.terminalContext
      }) || { ok: false, message: 'Command failed.' };
      const output = Array.isArray(response.outputLines) && response.outputLines.length
        ? response.outputLines
        : [response.message || (response.ok ? 'Command completed.' : 'Command failed.')];
      this.setCommandOutput(input, output);
      return;
    }

    if (command === 'spawn' && (subcommand === 'request' || subcommand === 'doc')) {
      if (!argument) {
        this.setCommandOutput(input, ['Missing form id. Example: SPAWN REQUEST LicenseRenewal']);
        return;
      }

      if (typeof this.onTerminalCommand !== 'function') {
        this.setCommandOutput(input, ['Terminal command handler is not available.']);
        return;
      }

      const response = this.onTerminalCommand({
        command: 'spawn',
        target: subcommand,
        id: argument,
        context: this.terminalContext
      }) || { ok: false, message: 'Command failed.' };
      const output = Array.isArray(response.outputLines) && response.outputLines.length
        ? response.outputLines
        : [response.message || (response.ok ? 'Command completed.' : 'Command failed.')];
      this.setCommandOutput(input, output);
      return;
    }

    this.setCommandOutput(input, ['Unknown command.']);
  }

  spawnCasePacketFromActiveScenario({ rawInput = 'SPAWN CASE PACKET', writeOutput = false } = {}) {
    if (typeof this.onTerminalCommand === 'function') {
      const response = this.onTerminalCommand({
        command: 'spawn',
        target: 'case_packet',
        context: this.terminalContext
      }) || { ok: false, message: 'Command failed.' };

      if (writeOutput) {
        this.setCommandOutput(rawInput, [response.message || (response.ok ? 'Spawned case packet.' : 'Command failed.')]);
      }

      if (response.ok) {
        return true;
      }
    }

    this.spawner.spawnCasePacket();
    if (writeOutput) {
      this.setCommandOutput(rawInput, ['No active scenario context found. Spawned generic sample packet.']);
    }
    return false;
  }

  renderTerminalScreen() {
    if (!this.terminalBody) return;
    this.updateDevToggleButton();

    const systemCrashEvent = this.getActiveSystemCrashEvent();
    const terminalLocked = Boolean(systemCrashEvent);

    const caseRecord = this.terminalContext?.caseRecord || {};
    const npc = this.terminalContext?.npc || {};
    const caseType = caseRecord?.requestType || 'No active case';
    const applicant = npc?.fullName || 'No applicant loaded';
    const records = this.collectTerminalRecords();
    const applicantQuery = applicant === 'No applicant loaded' ? '' : applicant;
    const firstVin = records.vehicles[0]?.vin || '';
    const applicantRecord = records.people.find((entry) => String(entry.name || '').toLowerCase() === String(applicant || '').toLowerCase()) || records.people[0] || null;
    const verifiedLicense = applicantRecord?.dlNumber || 'On file';
    const verifiedAddress = applicantRecord?.address || 'On file';
    const verifiedVin = applicantRecord?.vehicles?.[0]?.vin || records.vehicles[0]?.vin || 'On file';

    this.terminalPanel?.querySelectorAll('.dmv-terminal-nav-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.screen || 'personLookup') === this.terminalScreen);
      btn.disabled = terminalLocked;
    });

    this.terminalPanel?.classList.toggle('system-crash', terminalLocked);

    if (terminalLocked) {
      const hasDurationEstimate = Number.isFinite(Number(systemCrashEvent?.remainingDuration));
      const estimatedRecovery = hasDurationEstimate ? Number(systemCrashEvent?.remainingDuration) : 0;
      const customerLabel = estimatedRecovery === 1 ? 'customer' : 'customers';
      const etaLabel = hasDurationEstimate
        ? `~${estimatedRecovery} ${customerLabel} remaining`
        : 'Until current customer is resolved';
      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block dmv-terminal-crash-block" role="alert" aria-live="assertive">
          <div class="dmv-terminal-subtitle">System Error</div>
          <div class="dmv-terminal-crash-title">Computer System Crash</div>
          <p class="dmv-terminal-note">The DMV database is currently offline. Terminal actions are locked until service is restored.</p>
          <div class="dmv-terminal-line"><span>Status</span><strong>OFFLINE</strong></div>
          <div class="dmv-terminal-line"><span>Error Code</span><strong>DMV-DB-CRASH</strong></div>
          <div class="dmv-terminal-line"><span>ETA</span><strong>${etaLabel}</strong></div>
          <div class="dmv-terminal-empty">No lookups, case actions, or command tools are available during this outage.</div>
        </div>
      `;
      return;
    }

    if (!this.debugMode && this.terminalScreen === 'commands') {
      this.terminalScreen = 'case';
    }
    if (!this.debugMode && this.terminalScreen === 'database') {
      this.terminalScreen = 'case';
    }

    if (this.terminalScreen === 'personLookup') {
      const personResultMarkup = this.renderPersonLookupResults(this.terminalLookupState.personResult);

      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-subtitle">Person Database Lookup</div>
          <p class="dmv-terminal-note">Full agency database is always available. Pull complete identity and ownership records for any known person.</p>
          <form data-lookup-form="person" class="dmv-terminal-form">
            <input type="text" name="lookup-query" value="${this.escapeHtml(this.terminalLookupState.personQuery)}" placeholder="Name, NPC ID, SSN, DL number, address, phone, email">
            <button type="submit">Search Person</button>
          </form>
          <div class="dmv-terminal-quick-actions">
            <button type="button" data-prefill-type="person" data-prefill-query="${this.escapeHtml(applicantQuery)}">Use Applicant</button>
          </div>
          <div class="dmv-terminal-results">${personResultMarkup}</div>
        </div>
      `;
      return;
    }

    if (this.terminalScreen === 'vinLookup') {
      const vinResultMarkup = this.renderVinLookupResults(this.terminalLookupState.vinResult);

      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-subtitle">VIN Database Lookup</div>
          <p class="dmv-terminal-note">Search all known VIN records at any time, independent of submitted forms.</p>
          <div class="dmv-terminal-line"><span>VINs indexed</span><strong>${records.vehicles.length}</strong></div>
          <form data-lookup-form="vin" class="dmv-terminal-form">
            <input type="text" name="lookup-query" value="${this.escapeHtml(this.terminalLookupState.vinQuery)}" placeholder="Full or partial VIN, make, model, or owner name">
            <button type="submit">Search VIN</button>
          </form>
          <div class="dmv-terminal-quick-actions">
            <button type="button" data-prefill-type="vin" data-prefill-query="${this.escapeHtml(firstVin)}">Use First VIN On File</button>
          </div>
          <div class="dmv-terminal-results">${vinResultMarkup}</div>
        </div>
      `;
      return;
    }

    if (this.terminalScreen === 'case') {
      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-line"><span>Applicant</span><strong>${applicant}</strong></div>
          <div class="dmv-terminal-line"><span>Case Type</span><strong>${caseType}</strong></div>
          <div class="dmv-terminal-line"><span>Case ID</span><strong>${caseRecord?.caseId || 'N/A'}</strong></div>
          <div class="dmv-terminal-line"><span>Fee</span><strong>$${caseRecord?.inputs?.fee || 0}</strong></div>
          <div class="dmv-terminal-subtitle">Verified Registry Snapshot</div>
          <div class="dmv-terminal-line"><span>License / ID On File</span><strong>${this.escapeHtml(verifiedLicense)}</strong></div>
          <div class="dmv-terminal-line"><span>Residence On File</span><strong>${this.escapeHtml(verifiedAddress)}</strong></div>
          <div class="dmv-terminal-line"><span>VIN On File</span><strong>${this.escapeHtml(verifiedVin)}</strong></div>
        </div>
      `;
      return;
    }

    if (this.terminalScreen === 'actions') {
      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-subtitle">Workflow Actions</div>
          <div class="dmv-terminal-actions">
            <button type="button" class="dmv-action-btn" data-action="refresh-record">Refresh Registry Snapshot</button>
            <button type="button" class="dmv-action-btn" data-action="mark-reviewed">Mark Packet As Reviewed</button>
            <button type="button" class="dmv-action-btn" data-action="print-transaction">Print Transaction Receipt</button>
          </div>
          <p class="dmv-terminal-note">Actions are simulated but mirror common clerk workflow controls.</p>
          <div class="dmv-terminal-action-log">Awaiting action...</div>
        </div>
      `;

      this.terminalBody.querySelectorAll('.dmv-action-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.action || 'action';
          const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const log = this.terminalBody.querySelector('.dmv-terminal-action-log');
          if (!log) return;
          log.textContent = `[${stamp}] ${action.replace('-', ' ')} complete`;
        });
      });
      return;
    }

    if (this.terminalScreen === 'commands') {
      const catalog = this.getCommandCatalog();
      const requestButtons = catalog.requestForms
        .slice(0, 8)
        .map((entry) => `<button type="button" data-command="SPAWN REQUEST ${this.escapeHtml(entry.id)}">${this.escapeHtml(entry.id)}</button>`)
        .join('');
      const docButtons = catalog.documentForms
        .slice(0, 8)
        .map((entry) => `<button type="button" data-command="SPAWN DOC ${this.escapeHtml(entry.id)}">${this.escapeHtml(entry.id)}</button>`)
        .join('');
      const miniGameButtons = catalog.miniGames
        .map((entry) => `<button type="button" data-command="LAUNCH MINIGAME ${this.escapeHtml(entry.id)}">${this.escapeHtml(entry.label || entry.id)}</button>`)
        .join('');

      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-subtitle">Dev Quick Actions</div>
          <div class="dmv-terminal-quick-actions dev-top-grid">
            <button type="button" data-command="END SHIFT NOW">END SHIFT NOW</button>
            <button type="button" data-command="SKIP NEXT WEEK">SKIP NEXT WEEK</button>
            <button type="button" data-command="OPEN DATABASE">OPEN DATABASE</button>
            <button type="button" data-command="SPAWN CASE PACKET">SPAWN CASE PACKET</button>
            <button type="button" data-command="CLEAR DESK">CLEAR DESK</button>
          </div>

          <div class="dmv-terminal-subtitle">End Shift With Grade</div>
          <div class="dmv-terminal-quick-actions dev-grade-grid">
            <button type="button" data-command="END SHIFT GRADE S">GRADE S</button>
            <button type="button" data-command="END SHIFT GRADE A">GRADE A</button>
            <button type="button" data-command="END SHIFT GRADE B">GRADE B</button>
            <button type="button" data-command="END SHIFT GRADE C">GRADE C</button>
            <button type="button" data-command="END SHIFT GRADE D">GRADE D</button>
            <button type="button" data-command="END SHIFT GRADE F">GRADE F</button>
          </div>

          <div class="dmv-terminal-subtitle">Mini-Game Launchers</div>
          <div class="dmv-terminal-quick-actions wrap">${miniGameButtons || '<span class="dmv-terminal-empty">No mini-games indexed.</span>'}</div>

          <div class="dmv-terminal-subtitle">Quick Spawn Request Forms</div>
          <div class="dmv-terminal-quick-actions wrap">${requestButtons || '<span class="dmv-terminal-empty">No request forms indexed.</span>'}</div>

          <div class="dmv-terminal-subtitle">Quick Spawn Document Forms</div>
          <div class="dmv-terminal-quick-actions wrap">${docButtons || '<span class="dmv-terminal-empty">No document forms indexed.</span>'}</div>
        </div>
      `;
      return;
    }

    if (this.terminalScreen === 'database') {
      const people = this.getDatabasePeople();
      const filteredPeople = this.getDatabaseFilteredPeople(people);
      const pageState = this.getDatabasePageState(filteredPeople);
      const selectedPerson = this.getDatabaseSelectedPerson(filteredPeople);

      this.terminalBody.innerHTML = `
        <div class="dmv-terminal-block">
          <div class="dmv-terminal-subtitle">Database Editor (Dev)</div>
          <p class="dmv-terminal-note">Edit source-of-truth person records used by forms and lookups.</p>

          <form data-database-search-form class="dmv-terminal-form">
            <input type="text" name="database-query" value="${this.escapeHtml(this.terminalDatabaseState.query || '')}" placeholder="Search name, NPC ID, SSN, DL, address, phone, email">
            <button type="submit">Search</button>
          </form>

          <div class="dmv-terminal-results-meta">Showing ${pageState.items.length} of ${filteredPeople.length} match${filteredPeople.length === 1 ? '' : 'es'} | Page ${pageState.page} of ${pageState.totalPages}</div>
          <div class="dmv-terminal-quick-actions wrap">
            ${pageState.items.map((entry) => {
              const npcId = String(entry?.npcId || '');
              const isActive = selectedPerson?.npcId === npcId;
              const activeClass = isActive ? ' active' : '';
              return `<button type="button" class="dmv-db-person-btn${activeClass}" data-database-select-id="${this.escapeHtml(npcId)}">${this.escapeHtml(entry?.name || npcId)} (${this.escapeHtml(npcId)})</button>`;
            }).join('') || '<span class="dmv-terminal-empty">No database records match this search.</span>'}
          </div>

          <div class="dmv-terminal-quick-actions">
            <button type="button" data-database-page-action="prev" ${pageState.hasPrev ? '' : 'disabled'}>Previous</button>
            <button type="button" data-database-page-action="next" ${pageState.hasNext ? '' : 'disabled'}>Next</button>
          </div>

          ${selectedPerson ? `
            <form data-database-edit-form class="dmv-terminal-form dmv-terminal-db-form">
              <input type="hidden" name="database-npc-id" value="${this.escapeHtml(selectedPerson.npcId)}">
              <div class="dmv-terminal-subtitle">Identity</div>
              <label class="dmv-terminal-db-field"><span>Full Name</span><input type="text" name="name" value="${this.escapeHtml(selectedPerson.name || '')}" placeholder="Full name"></label>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>First Name</span><input type="text" name="firstName" value="${this.escapeHtml(selectedPerson.firstName || '')}" placeholder="First name"></label></section>
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Last Name</span><input type="text" name="lastName" value="${this.escapeHtml(selectedPerson.lastName || '')}" placeholder="Last name"></label></section>
              </div>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Date Of Birth</span><input type="text" name="dob" value="${this.escapeHtml(selectedPerson.dob || '')}" placeholder="DOB YYYY-MM-DD"></label></section>
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Sex</span><input type="text" name="sex" value="${this.escapeHtml(selectedPerson.sex || '')}" placeholder="Sex"></label></section>
              </div>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Height</span><input type="text" name="height" value="${this.escapeHtml(selectedPerson.height || '')}" placeholder="Height e.g. 5'10\""></label></section>
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Weight</span><input type="text" name="weight" value="${this.escapeHtml(selectedPerson.weight || '')}" placeholder="Weight e.g. 170 lb"></label></section>
              </div>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Eye Color</span><input type="text" name="eyeColor" value="${this.escapeHtml(selectedPerson.eyeColor || '')}" placeholder="Eye color"></label></section>
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Hair Color</span><input type="text" name="hairColor" value="${this.escapeHtml(selectedPerson.hairColor || '')}" placeholder="Hair color"></label></section>
              </div>
              <label class="dmv-terminal-db-field"><span>Organ Donor</span><input type="text" name="organDonor" value="${this.escapeHtml(selectedPerson.organDonor || '')}" placeholder="Yes/No"></label>
              <label class="dmv-terminal-db-field"><span>SSN</span><input type="text" name="ssn" value="${this.escapeHtml(selectedPerson.ssn || '')}" placeholder="SSN"></label>
              <label class="dmv-terminal-db-field"><span>DL Number</span><input type="text" name="dlNumber" value="${this.escapeHtml(selectedPerson.dlNumber || '')}" placeholder="DL number"></label>
              <label class="dmv-terminal-db-field"><span>Restrictions</span><input type="text" name="restrictions" value="${this.escapeHtml(selectedPerson.restrictions || '')}" placeholder="Restrictions"></label>
              <label class="dmv-terminal-db-field"><span>ERTC</span><input type="text" name="ertc" value="${this.escapeHtml(selectedPerson.ertc || '')}" placeholder="ERTC"></label>

              <div class="dmv-terminal-subtitle">Contact</div>
              <label class="dmv-terminal-db-field"><span>Address</span><input type="text" name="address" value="${this.escapeHtml(selectedPerson.address || '')}" placeholder="Address"></label>
              <label class="dmv-terminal-db-field"><span>Phone</span><input type="text" name="phone" value="${this.escapeHtml(selectedPerson.phone || '')}" placeholder="Phone"></label>
              <label class="dmv-terminal-db-field"><span>Email</span><input type="text" name="email" value="${this.escapeHtml(selectedPerson.email || '')}" placeholder="Email"></label>

              <div class="dmv-terminal-subtitle">Enforcement</div>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Tickets</span><input type="number" name="tickets" value="${this.escapeHtml(String(selectedPerson.tickets ?? 0))}" placeholder="Tickets"></label></section>
                <section class="dmv-terminal-lookup-section"><label class="dmv-terminal-db-field"><span>Fines</span><input type="number" name="fines" value="${this.escapeHtml(String(selectedPerson.fines ?? 0))}" placeholder="Fines"></label></section>
              </div>
              <div class="dmv-terminal-lookup-grid">
                <section class="dmv-terminal-lookup-section">
                  <label class="dmv-terminal-db-field"><span>Impound Hold</span>
                  <select name="impound">
                    <option value="no" ${selectedPerson.impound ? '' : 'selected'}>Impound: No</option>
                    <option value="yes" ${selectedPerson.impound ? 'selected' : ''}>Impound: Yes</option>
                  </select>
                  </label>
                </section>
                <section class="dmv-terminal-lookup-section"><button type="submit">Save Database Record</button></section>
              </div>
            </form>
          ` : '<div class="dmv-terminal-empty">No people are currently indexed.</div>'}
        </div>
      `;
      return;
    }

    this.terminalScreen = 'personLookup';
    this.renderTerminalScreen();
  }

  ensureDebugPanel() {
    // Debug controls now live in the DMV terminal Commands screen.
    this.debugPanel = null;

    window.addEventListener('keydown', (event) => {
      if (!this.debugMode) return;
      if (event.key.toLowerCase() === 'p') this.spawnCasePacketFromActiveScenario({ writeOutput: false });
      if (event.key.toLowerCase() === 'k') this.clear();
    });
  }

  updateDevToggleButton() {
    const button = this.terminalPanel?.querySelector('.dmv-terminal-dev-toggle');
    if (!button) return;
    button.textContent = this.debugMode ? 'Turn Dev Off' : 'Turn Dev On';
    button.setAttribute('aria-pressed', this.debugMode ? 'true' : 'false');
    button.setAttribute('aria-label', this.debugMode ? 'Turn developer mode off' : 'Turn developer mode on');
    button.classList.toggle('active', this.debugMode);
  }

  setDebugMode(enabled) {
    this.debugMode = Boolean(enabled);
    this.applyDebugState();
    if (!this.debugMode && this.showDataOverlays) {
      this.showDataOverlays = false;
      this.items.forEach((item) => item.updateOverlay?.());
    }
  }

  applyDebugState() {
    this.debugPanel?.classList.toggle('hidden', !this.debugMode);
    this.terminalPanel?.querySelectorAll('.dmv-terminal-nav-btn-dev').forEach((button) => {
      button.classList.toggle('hidden', !this.debugMode);
    });
    this.updateDevToggleButton();
    if (!this.debugMode && this.terminalScreen === 'commands') {
      this.terminalScreen = 'case';
    }
    if (!this.debugMode && this.terminalScreen === 'database') {
      this.terminalScreen = 'case';
    }
    this.renderTerminalScreen();
  }

  bindRootEvents() {
    window.addEventListener('resize', () => {
      this.deskRect = this.surface.getBoundingClientRect();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.terminalOpen) {
        this.closeTerminal();
      }
    });

    document.addEventListener('pointermove', (event) => {
      if (!this.activeItem) return;
      this.activeItem.dragTo(event);
    });

    document.addEventListener('pointerup', () => {
      if (!this.activeItem) return;
      const released = this.activeItem;
      released.endDrag();
      if (released.element.dataset.dropzone === 'application' && typeof this.onStamp === 'function') {
        const stamp = document.querySelector('.stamp-token.dragging-stamp');
        if (stamp?.dataset?.action) {
          this.onStamp(stamp.dataset.action);
          stamp.classList.remove('dragging-stamp');
        }
      }
      this.activeItem = null;
    });
  }

  addItem(item) {
    this.items.push(item);
    this.stack.appendChild(item.element);
    if (item.element.dataset.dropzone === 'application') {
      item.element.addEventListener('dragover', (event) => {
        event.preventDefault();
      });
      item.element.addEventListener('drop', (event) => {
        event.preventDefault();
        if (typeof this.onStamp !== 'function') return;
        const action = event.dataTransfer?.getData('text/stamp-action');
        if (action) this.onStamp(action);
      });
      item.element.addEventListener('click', () => {
        if (typeof this.onStamp !== 'function') return;
        const selectedStamp = document.querySelector('.stamp-token.dragging-stamp');
        if (selectedStamp?.dataset?.action) {
          this.onStamp(selectedStamp.dataset.action);
          selectedStamp.classList.remove('dragging-stamp');
        }
      });
    }
    this.bringToFront(item);
    item.updateOverlay?.();
    return item;
  }

  clear() {
    this.items.forEach((item) => item.element.remove());
    this.items = [];
    this.activeItem = null;
  }

  beginInteraction(item, event) {
    this.deskRect = this.surface.getBoundingClientRect();
    this.activeItem = item;
    this.bringToFront(item);
    item.startDrag(event);
  }

  bringToFront(item) {
    item.sortIndex = ++this.sortCounter;
    item.updateOverlay?.();
  }

  setSeed(seed) {
    this.seed = Number(seed) || 1337;
    this._rngState = this.seed;
    this.spawner.setSeed(this.seed);
  }

  randomBetween(min, max) {
    this._rngState = (1664525 * this._rngState + 1013904223) % 4294967296;
    const t = this._rngState / 4294967296;
    return min + (max - min) * t;
  }

  toggleOverlays() {
    if (!this.debugMode) return;
    this.showDataOverlays = !this.showDataOverlays;
    this.items.forEach((item) => item.updateOverlay?.());
  }

  startLoop() {
    const tick = () => {
      this.items.forEach((item) => item.tick());
      this.animationHandle = requestAnimationFrame(tick);
    };
    tick();
  }
}
