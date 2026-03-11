export const BILL_DENOMINATIONS = Object.freeze([1, 5, 10, 20, 50]);

const FINE_INCREMENTS = Object.freeze([5, 10, 15, 25]);

function toSafeCurrency(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export function formatCurrency(amount) {
  return `$${toSafeCurrency(amount)}`;
}

export function generateFineAmount(rng) {
  let amount = 15;
  while (amount < 150) {
    if (amount > 15 && rng.chance(0.22)) break;
    const increment = rng.pick(FINE_INCREMENTS) || 5;
    if (amount + increment > 150) break;
    amount += increment;
  }
  return Math.max(15, Math.min(150, toSafeCurrency(amount)));
}

function makeTargetCoverage(fineAmount, rng) {
  const extra = rng.chance(0.55) ? (rng.pick([0, 0, 5, 10, 15, 20, 25, 30]) || 0) : 0;
  return fineAmount + extra;
}

function pickBillForRemaining(remaining, rng) {
  const valid = BILL_DENOMINATIONS.filter((denom) => denom <= remaining);
  if (valid.length === 0) return null;

  const weighted = [];
  valid.forEach((denom) => {
    const weight = denom <= 10 ? 4 : denom === 20 ? 3 : 2;
    for (let i = 0; i < weight; i++) weighted.push(denom);
  });
  return rng.pick(weighted) || valid[valid.length - 1];
}

export function generateCitizenWallet(fineAmount, rng) {
  const wallet = [];
  let remaining = makeTargetCoverage(fineAmount, rng);

  while (remaining > 0) {
    const bill = pickBillForRemaining(remaining, rng);
    if (!bill) {
      wallet.push(1);
      remaining -= 1;
      continue;
    }
    wallet.push(bill);
    remaining -= bill;
  }

  const clutterCount = rng.nextInt(0, 3);
  for (let i = 0; i < clutterCount; i++) {
    wallet.push(rng.pick([1, 1, 5, 10]) || 1);
  }

  return rng.shuffle(wallet);
}

export function generatePlayerDrawer(rng) {
  const drawer = [];
  const config = [
    { denom: 1, min: 8, max: 16 },
    { denom: 5, min: 6, max: 12 },
    { denom: 10, min: 5, max: 10 },
    { denom: 20, min: 4, max: 8 },
    { denom: 50, min: 2, max: 4 }
  ];

  config.forEach((entry) => {
    const count = rng.nextInt(entry.min, entry.max);
    for (let i = 0; i < count; i++) {
      drawer.push(entry.denom);
    }
  });

  return rng.shuffle(drawer);
}

export function buildParkingFinePaymentSession({ rng, fineAmount = null } = {}) {
  const resolvedFine = fineAmount === null || fineAmount === undefined
    ? generateFineAmount(rng)
    : Math.max(15, Math.min(150, toSafeCurrency(fineAmount)));

  return {
    fineAmount: resolvedFine,
    amountCollected: 0,
    changeDue: 0,
    amountReturned: 0,
    citizenWallet: generateCitizenWallet(resolvedFine, rng),
    playerDrawer: generatePlayerDrawer(rng),
    collectedBills: [],
    returnedBills: [],
    phase: 'collecting',
    elapsedSeconds: 0,
    impatienceVisible: false,
    autoSubmitted: false,
    status: 'active',
    message: 'Collect payment from the citizen wallet.'
  };
}

export function cloneSession(session) {
  return {
    ...session,
    citizenWallet: Array.isArray(session?.citizenWallet) ? [...session.citizenWallet] : [],
    playerDrawer: Array.isArray(session?.playerDrawer) ? [...session.playerDrawer] : [],
    collectedBills: Array.isArray(session?.collectedBills) ? [...session.collectedBills] : [],
    returnedBills: Array.isArray(session?.returnedBills) ? [...session.returnedBills] : []
  };
}
