export function calculateVisionLineBlurPx(lineNumber, visionLimitLine) {
  const line = Number(lineNumber || 0);
  const limit = Number(visionLimitLine || 0);
  const delta = line - limit;

  if (delta <= -1) return 0;
  if (delta === 0) return 1.3;
  if (delta === 1) return 4.2;
  if (delta === 2) return 6.8;
  return 8.6;
}
