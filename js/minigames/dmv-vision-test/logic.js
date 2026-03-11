const VISION_RATINGS = Object.freeze([
  '20/200',
  '20/100',
  '20/70',
  '20/50',
  '20/40',
  '20/25',
  '20/20'
]);

const LINE_SIZES_PX = Object.freeze([56, 44, 36, 30, 25, 21, 18]);
const LETTER_POOL = Object.freeze(['E', 'F', 'P', 'T', 'O', 'Z', 'L', 'D', 'C', 'H', 'N', 'R', 'S', 'U']);
const LETTER_COUNTS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export const PASSING_LINE_INDEX = 5;

const CITIZEN_PROFILES = Object.freeze([
  { name: 'Martha Yeung', age: 74, trait: 'Squints under fluorescent lights', visionLimitLine: 3 },
  { name: 'Tomas Reed', age: 52, trait: 'Forgot his backup glasses', visionLimitLine: 4 },
  { name: 'Ari Patel', age: 19, trait: 'Night-shift gamer reflexes', visionLimitLine: 5 },
  { name: 'Nadia Santos', age: 31, trait: 'Laser-focused and calm', visionLimitLine: 6 },
  { name: 'Glenn Mercer', age: 46, trait: 'Claims perfect eyesight every year', visionLimitLine: 2 },
  { name: 'Bianca Morales', age: 27, trait: 'Reads tiny footnotes for fun', visionLimitLine: 7 },
  { name: 'Howard Pike', age: 63, trait: 'Tension headache from long wait', visionLimitLine: 4 }
]);

function pickLetters(count, rng) {
  const letters = [];
  for (let i = 0; i < count; i++) {
    letters.push(rng.pick(LETTER_POOL) || 'E');
  }
  return letters.join(' ');
}

function buildVisionLines(rng) {
  return VISION_RATINGS.map((rating, index) => ({
    lineNumber: index + 1,
    rating,
    letters: pickLetters(LETTER_COUNTS[index] || 3, rng),
    sizePx: LINE_SIZES_PX[index] || 18,
    isPassingThreshold: index + 1 === PASSING_LINE_INDEX
  }));
}

function cloneCitizen(citizen) {
  return {
    name: String(citizen?.name || 'Unknown Citizen'),
    age: Number(citizen?.age || 0),
    trait: String(citizen?.trait || 'No distinguishing behavior noted.'),
    visionLimitLine: Math.max(1, Math.min(7, Number(citizen?.visionLimitLine || 4)))
  };
}

export function buildDMVVisionTestSession({ rng } = {}) {
  const selectedCitizen = cloneCitizen(rng.pick(CITIZEN_PROFILES) || CITIZEN_PROFILES[0]);

  return {
    lines: buildVisionLines(rng),
    citizen: selectedCitizen,
    revealedLineCount: 1,
    elapsedSeconds: 0,
    durationSeconds: 60,
    canVerdict: false,
    verdict: null,
    status: 'active',
    message: 'Observe only the citizen-view panel. You cannot ask what they see.'
  };
}

export function cloneVisionTestSession(session) {
  return {
    ...session,
    lines: Array.isArray(session?.lines)
      ? session.lines.map((line) => ({ ...line }))
      : [],
    citizen: cloneCitizen(session?.citizen || {})
  };
}

export function shouldCitizenPassVisionTest(session) {
  const limitLine = Number(session?.citizen?.visionLimitLine || 0);
  return limitLine >= PASSING_LINE_INDEX;
}
