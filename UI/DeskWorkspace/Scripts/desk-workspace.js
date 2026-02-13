import { DeskSpawner } from './desk-spawner.js';

export class DeskWorkspace {
  constructor({ root, onStamp = null, seed = 1337, debugMode = false }) {
    this.root = root;
    this.onStamp = onStamp;
    this.items = [];
    this.activeItem = null;
    this.sortCounter = 20;
    this.showDataOverlays = false;
    this.seed = seed;
    this._rngState = seed;
    this.debugMode = Boolean(debugMode);
    this.spawner = new DeskSpawner(this, seed);
    this.animationHandle = null;
    this.ensureShell();
    this.bindRootEvents();
    this.startLoop();
  }

  ensureShell() {
    this.root.innerHTML = '<div class="desk-surface workspace-surface"><div class="paper-stack workspace-stack"></div></div>';
    this.surface = this.root.querySelector('.workspace-surface');
    this.stack = this.root.querySelector('.workspace-stack');
    this.deskRect = this.surface.getBoundingClientRect();
    this.ensureDebugPanel();
    this.applyDebugState();
  }

  ensureDebugPanel() {
    const panel = document.createElement('div');
    panel.className = 'workspace-debug-panel';
    panel.innerHTML = `
      <label>Seed <input type="number" value="${this.seed}" class="workspace-seed"></label>
      <button type="button" data-action="spawn">Spawn Case Packet</button>
      <button type="button" data-action="clear">Clear Desk</button>
      <button type="button" data-action="overlay">Toggle Data Overlay</button>
    `;
    this.root.appendChild(panel);
    this.debugPanel = panel;

    panel.addEventListener('click', (event) => {
      if (!this.debugMode) return;
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'spawn') {
        const seedValue = Number(panel.querySelector('.workspace-seed').value || this.seed);
        this.setSeed(seedValue);
        this.spawner.spawnCasePacket();
      }
      if (action === 'clear') this.clear();
      if (action === 'overlay') this.toggleOverlays();
    });

    window.addEventListener('keydown', (event) => {
      if (!this.debugMode) return;
      if (event.key.toLowerCase() === 'p') this.spawner.spawnCasePacket();
      if (event.key.toLowerCase() === 'k') this.clear();
      if (event.key.toLowerCase() === 'o') this.toggleOverlays();
    });
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
  }

  bindRootEvents() {
    window.addEventListener('resize', () => {
      this.deskRect = this.surface.getBoundingClientRect();
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
