import { cloneSession } from './logic.js';

function successResult(session, message) {
  return {
    session,
    outcome: 'success',
    message
  };
}

function updateMessage(session, message) {
  session.message = message;
  return {
    session,
    outcome: 'in_progress',
    message
  };
}

export function clickCitizenBill(session, billIndex) {
  const next = cloneSession(session);
  if (next.phase !== 'collecting' || next.status !== 'active') {
    return updateMessage(next, 'Payment is no longer accepting citizen bills.');
  }

  const index = Number(billIndex);
  if (!Number.isInteger(index) || index < 0 || index >= next.citizenWallet.length) {
    return updateMessage(next, 'Invalid bill selection.');
  }

  const bill = Number(next.citizenWallet[index]);
  if (!Number.isFinite(bill) || bill <= 0) {
    return updateMessage(next, 'That bill slot is already empty.');
  }

  next.citizenWallet[index] = null;
  next.collectedBills.push(bill);
  next.amountCollected += bill;

  if (next.amountCollected === next.fineAmount) {
    next.status = 'complete';
    next.message = 'Payment Complete';
    return successResult(next, next.message);
  }

  if (next.amountCollected > next.fineAmount) {
    next.message = `Overpayment collected. Submit to make $${next.amountCollected - next.fineAmount} change.`;
    return updateMessage(next, next.message);
  }

  const remaining = Math.max(0, next.fineAmount - next.amountCollected);
  next.message = `$${remaining} still due.`;
  return updateMessage(next, next.message);
}

export function clickDrawerBill(session, billIndex) {
  const next = cloneSession(session);
  if (next.phase !== 'change' || next.status !== 'active') {
    return updateMessage(next, 'You can only return change during the change phase.');
  }

  const index = Number(billIndex);
  if (!Number.isInteger(index) || index < 0 || index >= next.playerDrawer.length) {
    return updateMessage(next, 'Invalid drawer bill selection.');
  }

  const bill = Number(next.playerDrawer[index]);
  if (!Number.isFinite(bill) || bill <= 0) {
    return updateMessage(next, 'That drawer slot is already empty.');
  }

  const projected = next.amountReturned + bill;

  if (projected > next.changeDue) {
    return updateMessage(next, `Too much change. You still owe $${next.changeDue - next.amountReturned}.`);
  }

  next.playerDrawer[index] = null;
  next.returnedBills.push(bill);
  next.amountReturned = projected;

  if (next.amountReturned === next.changeDue) {
    next.status = 'complete';
    next.message = 'Payment Complete';
    return successResult(next, next.message);
  }

  return updateMessage(next, `$${next.changeDue - next.amountReturned} change remaining.`);
}

export function submitPayment(session, { auto = false } = {}) {
  const next = cloneSession(session);
  if (next.status !== 'active') {
    return updateMessage(next, next.message || 'Payment already resolved.');
  }

  if (next.phase === 'collecting') {
    if (next.amountCollected === next.fineAmount) {
      next.status = 'complete';
      next.message = 'Payment Complete';
      return successResult(next, next.message);
    }

    if (next.amountCollected < next.fineAmount) {
      next.status = 'failed_underpay';
      next.message = auto
        ? 'Timer expired. Citizen complains about incorrect payment handling.'
        : 'Insufficient payment collected. Citizen is upset.';
      return {
        session: next,
        outcome: 'underpay',
        message: next.message
      };
    }

    next.phase = 'change';
    next.changeDue = next.amountCollected - next.fineAmount;
    next.message = `Return $${next.changeDue} in change.`;
    return {
      session: next,
      outcome: 'change_required',
      message: next.message
    };
  }

  if (next.phase === 'change') {
    if (next.amountReturned === next.changeDue) {
      next.status = 'complete';
      next.message = 'Payment Complete';
      return successResult(next, next.message);
    }

    next.status = 'failed_change';
    next.message = 'Change was not returned correctly.';
    return {
      session: next,
      outcome: 'bad_change',
      message: next.message
    };
  }

  return updateMessage(next, 'Unknown payment state.');
}

export function advancePaymentTimer(session) {
  const next = cloneSession(session);
  if (next.status !== 'active') {
    return { session: next, impatienceTriggered: false, autoSubmit: false };
  }

  next.elapsedSeconds += 1;
  let impatienceTriggered = false;
  let autoSubmit = false;

  if (next.elapsedSeconds >= 30 && !next.impatienceVisible) {
    next.impatienceVisible = true;
    impatienceTriggered = true;
  }

  if (next.elapsedSeconds >= 45 && !next.autoSubmitted) {
    autoSubmit = true;
    next.autoSubmitted = true;
  }

  return { session: next, impatienceTriggered, autoSubmit };
}
