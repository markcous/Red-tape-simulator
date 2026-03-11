import { calculateVisionLineBlurPx } from './blur.js';

function renderReferenceLines(lines, revealedLineCount) {
  return lines.map((line) => {
    const mutedClass = line.lineNumber > revealedLineCount ? 'dmv-vision-line-muted' : '';
    const thresholdClass = line.isPassingThreshold ? 'passing-threshold' : '';

    return `
      <div class="dmv-vision-line ${mutedClass}" style="font-size: ${line.sizePx}px;">
        <span class="dmv-vision-rating ${thresholdClass}">${line.rating}</span>
        <span class="dmv-vision-letters">${line.letters}</span>
      </div>
    `;
  }).join('');
}

function renderCitizenLines(lines, revealedLineCount, visionLimitLine) {
  return lines.map((line) => {
    const hidden = line.lineNumber > revealedLineCount;
    const blurPx = calculateVisionLineBlurPx(line.lineNumber, visionLimitLine);
    const hiddenClass = hidden ? 'dmv-vision-line-hidden' : '';

    return `
      <div class="dmv-vision-line citizen ${hiddenClass}" style="font-size: ${line.sizePx}px; filter: blur(${blurPx}px);">
        <span class="dmv-vision-letters">${line.letters}</span>
      </div>
    `;
  }).join('');
}

export function renderDMVVisionTest(session) {
  const lines = Array.isArray(session?.lines) ? session.lines : [];
  const totalLines = lines.length;
  const revealedLineCount = Math.max(1, Math.min(totalLines, Number(session?.revealedLineCount || 1)));
  const elapsed = Number(session?.elapsedSeconds || 0);
  const duration = Number(session?.durationSeconds || 60);
  const timeLeft = Math.max(0, duration - elapsed);
  const canVerdict = Boolean(session?.canVerdict);
  const status = String(session?.status || 'active');
  const limitLine = Number(session?.citizen?.visionLimitLine || 4);

  const timerClass = timeLeft <= 0
    ? 'expired'
    : timeLeft <= 15
      ? 'warning'
      : 'normal';

  return `
    <div class="dmv-vision-shell">
      <div class="dmv-vision-header-row">
        <div class="dmv-vision-title-wrap">
          <p class="dmv-vision-kicker">Dept. of Motor Vehicles</p>
          <h3>Vision Examination</h3>
        </div>
        <div class="dmv-vision-timer ${timerClass}">
          <span>Timer:</span>
          <strong>${timeLeft}s</strong>
        </div>
      </div>

      <div class="dmv-vision-citizen-bar">
        <div class="dmv-vision-citizen-identity">
          <div class="dmv-vision-citizen-avatar" aria-hidden="true">&#128100;</div>
          <div class="dmv-vision-citizen-meta">
            <strong>${String(session?.citizen?.name || 'Unknown')}, age ${Number(session?.citizen?.age || 0)}</strong>
            <span>${String(session?.citizen?.trait || 'Unremarkable behavior')}</span>
          </div>
        </div>
        <div class="dmv-vision-progress">
          <span>Line ${Math.min(revealedLineCount, totalLines)} of ${totalLines}</span>
        </div>
      </div>

      <div class="dmv-vision-instruction">
        <strong>Your Job:</strong> The left chart is the reference, sharp and correct. The right panel shows what the citizen sees. Judge each line by what you observe, then issue your verdict.
      </div>

      <div class="dmv-vision-panels">
        <section class="dmv-vision-panel reference">
          <h4>- Reference -</h4>
          <div class="dmv-vision-chart">
            ${renderReferenceLines(lines, revealedLineCount)}
          </div>
        </section>

        <section class="dmv-vision-panel citizen-view">
          <h4>- Citizen View -</h4>
          <div class="dmv-vision-chart">
            ${renderCitizenLines(lines, revealedLineCount, limitLine)}
          </div>
        </section>
      </div>

      <div class="dmv-vision-actions">
        <button type="button" class="btn" data-vision-action="next_line" ${canVerdict || status !== 'active' ? 'disabled' : ''}>
          Reveal Next Line
        </button>
      </div>

      <div class="dmv-vision-verdict ${canVerdict ? '' : 'hidden'}">
        <button type="button" class="btn btn-success" data-vision-action="verdict" data-vision-verdict="pass" ${status !== 'active' ? 'disabled' : ''}>Pass</button>
        <button type="button" class="btn btn-danger" data-vision-action="verdict" data-vision-verdict="fail" ${status !== 'active' ? 'disabled' : ''}>Fail</button>
      </div>

      <div class="dmv-vision-message">${String(session?.message || '')}</div>
    </div>
  `;
}
