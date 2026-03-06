import { SeededRNG } from '../models/rng.js';

export class ShiftManager {
  constructor(balancing, dialogueData) {
    this.balancing = balancing;
    this.dialogueData = dialogueData;
    this.rng = new SeededRNG(Date.now());

    // Shift state
    this.currentShift = 0;
    this.inGameTime = 480; // 8:00 AM in minutes
    this.shiftStart = 480;
    this.shiftEnd = 960; // 4:00 PM
    this.isActive = false;

    // Queue
    this.customerQueue = [];
    this.currentCustomerIndex = 0;
    this.totalCustomersThisShift = 0;

    // Events
    this.activeEvents = [];
    this.eventLog = [];
  }

  startShift(shiftNumber, queue) {
    this.currentShift = shiftNumber;
    this.inGameTime = this.shiftStart;
    this.isActive = true;
    this.customerQueue = queue;
    this.currentCustomerIndex = 0;
    this.totalCustomersThisShift = queue.length;
    this.activeEvents = [];
    this.eventLog = [];
    this.rng = new SeededRNG(shiftNumber * 1337);

    // Roll for chaos events
    this.rollForEvents();
  }

  getTimeString() {
    const hours = Math.floor(this.inGameTime / 60);
    const minutes = this.inGameTime % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  getTimePeriod() {
    if (this.inGameTime < 600) return 'morning';    // before 10 AM
    if (this.inGameTime < 720) return 'midday';      // 10 AM - noon
    if (this.inGameTime < 870) return 'rush';         // noon - 2:30 PM
    return 'afternoon';                                // after 2:30 PM
  }

  advanceTime(minutes) {
    this.inGameTime += minutes;
    this.checkEventTimers();

    if (this.inGameTime >= this.shiftEnd) {
      this.isActive = false;
    }
  }

  getNextCustomer() {
    if (this.currentCustomerIndex >= this.customerQueue.length) {
      return null;
    }
    const customer = this.customerQueue[this.currentCustomerIndex];
    this.currentCustomerIndex++;
    return customer;
  }

  sendCustomerToBack(customer) {
    if (!customer) return;

    const servedWindow = Math.max(0, this.currentCustomerIndex);
    let foundIndex = -1;
    for (let i = servedWindow - 1; i >= 0; i--) {
      const queued = this.customerQueue[i];
      if (queued?.npcId && queued.npcId === customer.npcId) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      this.customerQueue.push(customer);
      return;
    }

    const [entry] = this.customerQueue.splice(foundIndex, 1);
    this.customerQueue.push(entry);
    this.currentCustomerIndex = Math.max(0, this.currentCustomerIndex - 1);
  }

  getQueueStatus() {
    return {
      total: this.totalCustomersThisShift,
      served: this.currentCustomerIndex,
      remaining: this.customerQueue.length - this.currentCustomerIndex,
      time: this.getTimeString(),
      period: this.getTimePeriod(),
      progress: this.currentCustomerIndex / this.totalCustomersThisShift,
      shiftProgress: (this.inGameTime - this.shiftStart) / (this.shiftEnd - this.shiftStart)
    };
  }

  isShiftOver() {
    return !this.isActive ||
      this.currentCustomerIndex >= this.customerQueue.length ||
      this.inGameTime >= this.shiftEnd;
  }

  rollForEvents() {
    const events = this.dialogueData.chaosEvents;
    // 30% chance of an event per shift
    if (this.rng.chance(0.3)) {
      const event = this.rng.pick(events);
      const triggerAtCustomer = this.rng.nextInt(1, Math.max(1, this.totalCustomersThisShift - 1));
      this.activeEvents.push({
        ...event,
        triggerAtCustomer,
        remainingDuration: event.duration,
        triggered: false
      });
    }
  }

  checkForEvent(customerNumber) {
    const triggeredEvents = [];
    for (const event of this.activeEvents) {
      if (!event.triggered && customerNumber >= event.triggerAtCustomer) {
        event.triggered = true;
        this.eventLog.push({
          ...event,
          triggeredAt: this.getTimeString(),
          customerNumber
        });
        triggeredEvents.push(event);
      }
    }
    return triggeredEvents;
  }

  checkEventTimers() {
    for (const event of this.activeEvents) {
      if (event.triggered && event.remainingDuration > 0) {
        event.remainingDuration--;
      }
    }
  }

  getActiveEffects() {
    const effects = {
      processingTimeMultiplier: 1,
      accuracyModifier: 0,
      patienceModifier: 0,
      scrutinyModifier: 0,
      moraleModifier: 0
    };

    for (const event of this.activeEvents) {
      if (event.triggered && event.remainingDuration > 0) {
        switch (event.effect) {
          case 'processingTimeIncrease':
            effects.processingTimeMultiplier += event.magnitude;
            break;
          case 'accuracyDecrease':
            effects.accuracyModifier -= event.magnitude;
            break;
          case 'scrutinyIncrease':
            effects.scrutinyModifier += event.magnitude;
            break;
          case 'patienceBoost':
            effects.patienceModifier += event.magnitude;
            break;
          case 'moraleDecrease':
            effects.moraleModifier -= event.magnitude;
            break;
        }
      }
    }

    return effects;
  }

  getActiveChaosEvents() {
    return this.activeEvents
      .filter((event) => event.triggered && event.remainingDuration > 0)
      .map((event) => ({
        id: event.id,
        name: event.name,
        description: event.description,
        effect: event.effect,
        magnitude: event.magnitude,
        remainingDuration: event.remainingDuration
      }));
  }

  getShiftSummary() {
    return {
      shiftNumber: this.currentShift,
      totalCustomers: this.totalCustomersThisShift,
      customersServed: this.currentCustomerIndex,
      endTime: this.getTimeString(),
      events: this.eventLog.map(e => ({
        name: e.name,
        description: e.description,
        time: e.triggeredAt
      }))
    };
  }
}
