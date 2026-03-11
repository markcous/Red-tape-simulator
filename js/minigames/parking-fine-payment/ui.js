import { formatCurrency } from './logic.js';

function getDenominationClass(bill) {
  switch (Number(bill)) {
    case 1:
      return 'denom-1';
    case 5:
      return 'denom-5';
    case 10:
      return 'denom-10';
    case 20:
      return 'denom-20';
    case 50:
      return 'denom-50';
    default:
      return 'denom-generic';
  }
}

function renderBills(bills, source) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return '<p class="fine-payment-empty">No bills available.</p>';
  }

  const hasSelectableBill = bills.some((bill) => Number.isFinite(Number(bill)) && Number(bill) > 0);
  if (!hasSelectableBill) {
    return bills.map(() => '<div class="fine-payment-empty-slot" aria-hidden="true"></div>').join('');
  }

  return bills.map((bill, index) => {
    const numericBill = Number(bill);
    if (!Number.isFinite(numericBill) || numericBill <= 0) {
      return '<div class="fine-payment-empty-slot" aria-hidden="true"></div>';
    }

    return `
      <button type="button" class="fine-payment-bill ${source === 'drawer' ? 'drawer-bill' : 'wallet-bill'} ${getDenominationClass(numericBill)}" data-payment-action="pick_bill" data-payment-source="${source}" data-bill-index="${index}">
        <span class="fine-payment-corner top-left">$${numericBill}</span>
        <span class="fine-payment-corner bottom-right">$${numericBill}</span>
        <span class="fine-payment-bill-label">$${numericBill}</span>
        <span class="fine-payment-bill-meta">${source === 'drawer' ? 'Drawer' : 'Wallet'} #${String(index + 1).padStart(2, '0')}</span>
      </button>
    `;
  }).join('');
}

export function renderParkingFinePayment(session) {
  const phase = String(session?.phase || 'collecting');
  const due = Number(session?.fineAmount || 0);
  const collected = Number(session?.amountCollected || 0);
  const changeDue = Number(session?.changeDue || 0);
  const returned = Number(session?.amountReturned || 0);
  const elapsed = Number(session?.elapsedSeconds || 0);
  const timeLeft = Math.max(0, 45 - elapsed);

  const timerClass = elapsed >= 45
    ? 'expired'
    : elapsed >= 30
      ? 'warning'
      : 'normal';

  const phaseTitle = phase === 'change' ? 'Return Change' : 'Collect Payment';
  const helperLine = phase === 'change'
    ? `Return exact change to complete the transaction. Due back: ${formatCurrency(changeDue)} | Returned: ${formatCurrency(returned)}`
    : 'Accept bills from the citizen wallet until the exact fine is covered.';

  return `
    <div class="fine-payment-shell">
      <div class="fine-payment-header">
        <div class="fine-payment-header-copy">
          <p class="fine-payment-kicker">Municipal Parking Bureau</p>
          <h3>Citation Settlement Desk</h3>
        </div>
        <div class="fine-payment-timer ${timerClass}">
          <span>Citizen Patience</span>
          <strong>${timeLeft}s</strong>
        </div>
      </div>

      <div class="fine-payment-ribbon">
        <span class="fine-payment-ribbon-code">Form PK-100</span>
        <span class="fine-payment-ribbon-status">Live Counter Transaction</span>
      </div>

      <div class="fine-payment-stats">
        <div class="fine-payment-stat">
          <span class="label">Amount Due</span>
          <strong>${formatCurrency(due)}</strong>
        </div>
        <div class="fine-payment-stat">
          <span class="label">Collected</span>
          <strong>${formatCurrency(collected)}</strong>
        </div>
      </div>

      <div class="fine-payment-phase-title">${phaseTitle}</div>
      <p class="fine-payment-helper">${helperLine}</p>

      <div class="fine-payment-columns">
        <section class="fine-payment-panel">
          <h4>Citizen Wallet</h4>
          <div class="fine-payment-bill-grid">
            ${renderBills(session?.citizenWallet, 'citizen')}
          </div>
        </section>

        <section class="fine-payment-panel ${phase === 'change' ? '' : 'disabled'}">
          <h4>Player Drawer</h4>
          <div class="fine-payment-bill-grid">
            ${renderBills(session?.playerDrawer, 'drawer')}
          </div>
        </section>
      </div>

      <div class="fine-payment-actions">
        <button type="button" class="btn btn-primary" data-payment-action="submit">Submit</button>
      </div>

      <div class="fine-payment-message${session?.impatienceVisible ? ' impatient' : ''}">
        ${String(session?.message || '')}
      </div>
    </div>
  `;
}
