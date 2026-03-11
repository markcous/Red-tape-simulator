import {
  cloneVisionTestSession,
  shouldCitizenPassVisionTest
} from './logic.js';

function updateMessage(session, message) {
  session.message = message;
  return {
    session,
    outcome: 'in_progress',
    message
  };
}

export function revealNextVisionLine(session) {
  const next = cloneVisionTestSession(session);
  if (next.status !== 'active') {
    return updateMessage(next, next.message || 'Vision test already resolved.');
  }

  if (next.canVerdict) {
    return updateMessage(next, 'Issue a final Pass or Fail verdict.');
  }

  const totalLines = next.lines.length;
  next.revealedLineCount = Math.min(totalLines, Number(next.revealedLineCount || 0) + 1);

  if (next.revealedLineCount >= totalLines) {
    next.canVerdict = true;
    next.message = 'All lines reviewed. Issue your verdict.';
    return {
      session: next,
      outcome: 'awaiting_verdict',
      message: next.message
    };
  }

  next.message = `Proceed to line ${next.revealedLineCount + 1}.`;
  return {
    session: next,
    outcome: 'line_revealed',
    message: next.message
  };
}

export function advanceVisionTestTimer(session) {
  const next = cloneVisionTestSession(session);
  if (next.status !== 'active') {
    return { session: next, timerExpired: false };
  }

  next.elapsedSeconds += 1;
  if (next.elapsedSeconds < next.durationSeconds) {
    return { session: next, timerExpired: false };
  }

  next.elapsedSeconds = next.durationSeconds;
  if (!next.canVerdict) {
    next.canVerdict = true;
    next.message = 'Time expired. Issue a final Pass or Fail verdict now.';
    return { session: next, timerExpired: true };
  }

  return { session: next, timerExpired: false };
}

export function issueVisionVerdict(session, verdict) {
  const next = cloneVisionTestSession(session);
  if (next.status !== 'active') {
    return updateMessage(next, next.message || 'Vision test already complete.');
  }

  if (!next.canVerdict) {
    return updateMessage(next, 'Review more lines before issuing a verdict.');
  }

  const normalizedVerdict = String(verdict || '').trim().toLowerCase();
  if (normalizedVerdict !== 'pass' && normalizedVerdict !== 'fail') {
    return updateMessage(next, 'Invalid verdict. Choose Pass or Fail.');
  }

  const citizenShouldPass = shouldCitizenPassVisionTest(next);
  const clerkPassedCitizen = normalizedVerdict === 'pass';
  const correct = clerkPassedCitizen === citizenShouldPass;

  next.status = 'complete';
  next.verdict = normalizedVerdict;

  if (correct) {
    next.message = citizenShouldPass
      ? 'Correct verdict: citizen qualifies for driving vision standards.'
      : 'Correct verdict: citizen does not meet minimum driving vision standards.';
    return {
      session: next,
      outcome: 'success',
      severity: 'none',
      message: next.message,
      correct,
      citizenShouldPass
    };
  }

  if (clerkPassedCitizen && !citizenShouldPass) {
    next.message = 'Critical error: unsafe driver approved despite insufficient vision.';
    return {
      session: next,
      outcome: 'wrong_verdict',
      severity: 'critical',
      message: next.message,
      correct,
      citizenShouldPass
    };
  }

  next.message = 'Minor complaint: qualified citizen was incorrectly failed.';
  return {
    session: next,
    outcome: 'wrong_verdict',
    severity: 'minor',
    message: next.message,
    correct,
    citizenShouldPass
  };
}
