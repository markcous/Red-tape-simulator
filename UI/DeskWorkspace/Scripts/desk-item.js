export class DeskItem {
  constructor(workspace, config = {}) {
    this.workspace = workspace;
    this.id = config.id || `item-${Math.random().toString(16).slice(2)}`;
    this.element = config.element;
    this.position = { x: config.x ?? 0, y: config.y ?? 0 };
    this.targetPosition = { ...this.position };
    this.rotation = config.rotation ?? 0;
    this.baseRotation = this.rotation;
    this.sortIndex = 0;
    this.dragging = false;
    this.pointerOffset = { x: 0, y: 0 };
    this.wobbleT = 0;
    this.followLerp = config.followLerp ?? 0.28;
    this.enable();
  }

  enable() {
    this.element.classList.add('desk-item');
    this.element.dataset.deskItemId = this.id;
    this.bindPointerEvents();
    this.applyTransform(true);
  }

  bindPointerEvents() {
    this.element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.workspace.beginInteraction(this, event);
    });
  }

  startDrag(event) {
    const rect = this.element.getBoundingClientRect();
    const deskRect = this.workspace.deskRect;
    this.dragging = true;
    this.element.classList.add('held');
    this.pointerOffset.x = event.clientX - rect.left;
    this.pointerOffset.y = event.clientY - rect.top;
    this.targetPosition.x = rect.left - deskRect.left;
    this.targetPosition.y = rect.top - deskRect.top;
  }

  dragTo(event) {
    this.targetPosition.x = event.clientX - this.workspace.deskRect.left - this.pointerOffset.x;
    this.targetPosition.y = event.clientY - this.workspace.deskRect.top - this.pointerOffset.y;
  }

  endDrag() {
    this.dragging = false;
    this.element.classList.remove('held');
  }

  tick() {
    const lerp = this.dragging ? this.followLerp : 0.22;
    this.position.x += (this.targetPosition.x - this.position.x) * lerp;
    this.position.y += (this.targetPosition.y - this.position.y) * lerp;

    if (this.dragging) {
      this.wobbleT += 0.18;
      this.rotation = this.baseRotation + Math.sin(this.wobbleT) * 1.4;
    } else {
      this.rotation += (this.baseRotation - this.rotation) * 0.2;
    }

    this.applyTransform();
  }

  applyTransform(initial = false) {
    if (initial) {
      this.element.style.left = `${this.position.x}px`;
      this.element.style.top = `${this.position.y}px`;
    } else {
      this.element.style.left = `${this.position.x.toFixed(2)}px`;
      this.element.style.top = `${this.position.y.toFixed(2)}px`;
    }
    this.element.style.transform = `translate3d(0, 0, ${this.sortIndex * 0.1}px) rotate(${this.rotation.toFixed(2)}deg)`;
    this.element.style.zIndex = String(this.sortIndex);
  }
}
