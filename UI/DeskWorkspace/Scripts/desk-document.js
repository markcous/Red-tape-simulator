import { DeskItem } from './desk-item.js';
import { DeskDocumentTemplates } from './templates.js';
import { PersonData, VehicleData, PolicyData } from './document-data.js';

const SIZE_PRESETS = {
  Letter: { w: 280, h: 360 },
  HalfSheet: { w: 240, h: 280 },
  WalletCard: { w: 250, h: 170 }
};

export class DeskDocument extends DeskItem {
  constructor(workspace, config = {}) {
    const element = document.createElement('article');
    element.className = 'paper-sheet workspace-document';
    super(workspace, { ...config, element });
    this.template = config.template || 'title';
    this.sizePreset = config.sizePreset || 'Letter';
    this.data = config.data || {};
    this.logoUrl = config.logoUrl || '';
    this.wearTexture = config.wearTexture || '';
    this.stampTarget = Boolean(config.stampTarget);
    this.render();
  }

  render() {
    const { w, h } = SIZE_PRESETS[this.sizePreset] || SIZE_PRESETS.Letter;
    this.element.style.width = `${w}px`;
    this.element.style.minHeight = `${h}px`;
    this.element.dataset.dropzone = this.stampTarget ? 'application' : '';

    const tint = this.workspace.randomBetween(-4, 4);
    this.baseRotation = this.rotation;
    this.element.style.filter = `sepia(${Math.max(0, tint) * 0.01}) hue-rotate(${tint}deg)`;
    if (this.logoUrl) {
      this.element.style.setProperty('--doc-logo-url', `url('${this.logoUrl}')`);
    }
    if (this.wearTexture) {
      this.element.style.setProperty('--doc-wear-url', `url('${this.wearTexture}')`);
    }

    const person = new PersonData(this.data.person || {});
    const vehicle = new VehicleData(this.data.vehicle || {});
    const policy = new PolicyData(this.data.policy || {});

    const templateRenderer = DeskDocumentTemplates[this.template] || DeskDocumentTemplates.title;
    this.element.innerHTML = templateRenderer({
      person,
      vehicle,
      policy,
      dateValue: this.data.dateValue,
      id: this.id
    });

    this.updateOverlay();
  }

  updateOverlay() {
    if (!this.workspace.showDataOverlays) {
      this.element.querySelector('.workspace-overlay')?.remove();
      return;
    }

    const overlay = this.element.querySelector('.workspace-overlay') || document.createElement('div');
    overlay.className = 'workspace-overlay';
    overlay.innerHTML = `ID: ${this.id}<br>Sort: ${this.sortIndex}<br>${this.data?.person?.name || 'Unknown'}`;
    if (!overlay.parentElement) this.element.appendChild(overlay);
  }
}

export { SIZE_PRESETS };
