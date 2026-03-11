const METRIC_WEIGHTS_BY_DEPARTMENT = Object.freeze({
  DMV: { accuracy: 0.5, throughput: 0.2, customer: 0.3, integrity: 0.0 },
  BuildingPermits: { accuracy: 0.45, throughput: 0.2, customer: 0.25, integrity: 0.1 },
  Impound: { accuracy: 0.4, throughput: 0.15, customer: 0.2, integrity: 0.25 }
});

const PROGRESSION_TRACKS = Object.freeze([
  {
    id: 'DMV',
    displayName: 'Driver and Vehicle Services',
    gameplayDepartment: 'DMV',
    ranks: [
      {
        id: 'dmv_r1',
        title: 'Clerk Trainee',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 70,
        requiredSuccessfulShifts: 3,
        requireConsecutiveCleanShifts: 3,
        minAccuracy: 80,
        requestTypes: ['NewLicense', 'AddressChange'],
        customerRange: { min: 6, max: 8 }
      },
      {
        id: 'dmv_r2',
        title: 'Clerk I',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 72,
        requiredSuccessfulShifts: 3,
        minAccuracy: 78,
        requestTypes: ['LicenseRenewal', 'VehicleRegistration', 'NameChange'],
        customerRange: { min: 7, max: 9 }
      },
      {
        id: 'dmv_r3',
        title: 'Clerk II',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 75,
        requiredSuccessfulShifts: 3,
        requireBribeHandled: true,
        noOpenMisconduct: true,
        minAccuracy: 78,
        requestTypes: ['TitleTransfer', 'LicenseRenewal', 'VehicleRegistration', 'DuplicateLicense'],
        customerRange: { min: 8, max: 10 }
      },
      {
        id: 'dmv_r4',
        title: 'Senior Clerk',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 78,
        requiredSuccessfulShifts: 3,
        noOpenMisconduct: true,
        requestTypes: ['LicenseRenewal', 'VehicleRegistration', 'TitleTransfer', 'PermitRenewal'],
        customerRange: { min: 9, max: 11 }
      }
    ]
  },
  {
    id: 'BuildingPermits',
    displayName: 'Building Permits',
    gameplayDepartment: 'BuildingPermits',
    ranks: [
      {
        id: 'permits_r1',
        title: 'Permits Assistant',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 76,
        requiredSuccessfulShifts: 3,
        minAccuracy: 80,
        requestTypes: ['BuildingPermit'],
        customerRange: { min: 7, max: 9 }
      },
      {
        id: 'permits_r2',
        title: 'Permits Clerk',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 78,
        requiredSuccessfulShifts: 3,
        minAccuracy: 80,
        requestTypes: ['BuildingPermit', 'BusinessLicense'],
        customerRange: { min: 8, max: 10 }
      },
      {
        id: 'permits_r3',
        title: 'Permits Officer',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 80,
        requiredSuccessfulShifts: 3,
        requireBribeHandled: true,
        noOpenMisconduct: true,
        requestTypes: ['BuildingPermit', 'BusinessLicense', 'NoiseVariance'],
        customerRange: { min: 9, max: 11 }
      },
      {
        id: 'permits_r4',
        title: 'Senior Permits Officer',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 82,
        requiredSuccessfulShifts: 3,
        noOpenMisconduct: true,
        requestTypes: ['BuildingPermit', 'BusinessLicense', 'NoiseVariance', 'CodeComplianceInspection'],
        customerRange: { min: 10, max: 12 }
      }
    ]
  },
  {
    id: 'CodeEnforcement',
    displayName: 'Code Enforcement',
    gameplayDepartment: 'Impound',
    ranks: [
      {
        id: 'code_r1',
        title: 'Code Inspector Trainee',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 80,
        requiredSuccessfulShifts: 3,
        minAccuracy: 82,
        requestTypes: ['VehicleRelease'],
        customerRange: { min: 7, max: 9 }
      },
      {
        id: 'code_r2',
        title: 'Code Inspector I',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 82,
        requiredSuccessfulShifts: 3,
        minAccuracy: 83,
        requestTypes: ['VehicleRelease', 'PropertyClaim'],
        customerRange: { min: 8, max: 10 }
      },
      {
        id: 'code_r3',
        title: 'Code Inspector II',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 84,
        requiredSuccessfulShifts: 3,
        requireBribeHandled: true,
        noOpenMisconduct: true,
        requestTypes: ['VehicleRelease', 'PropertyClaim', 'AuctionInquiry'],
        customerRange: { min: 9, max: 11 }
      },
      {
        id: 'code_r4',
        title: 'Senior Code Inspector',
        minShifts: 3,
        maxShifts: 5,
        thresholdScore: 86,
        requiredSuccessfulShifts: 3,
        noOpenMisconduct: true,
        requestTypes: ['VehicleRelease', 'PropertyClaim', 'AuctionInquiry'],
        customerRange: { min: 10, max: 12 }
      }
    ]
  }
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function pickTargetShifts(seed, departmentIndex, rankIndex, minShifts, maxShifts) {
  const min = Math.max(1, Number(minShifts) || 3);
  const max = Math.max(min, Number(maxShifts) || min);
  if (max <= min) return min;

  const base = (Math.imul((Number(seed) || 1) + 17, 2654435761) >>> 0);
  const salt = (departmentIndex + 1) * 131 + (rankIndex + 1) * 521;
  const mixed = (base + salt) >>> 0;
  const span = max - min + 1;
  return min + (mixed % span);
}

export function getProgressionTracks() {
  return PROGRESSION_TRACKS;
}

export function getTrackByIndex(index) {
  return PROGRESSION_TRACKS[Math.max(0, Math.min(PROGRESSION_TRACKS.length - 1, Number(index) || 0))] || PROGRESSION_TRACKS[0];
}

export function createInitialProgressionState(seed = Date.now()) {
  const firstTrack = PROGRESSION_TRACKS[0];
  const firstRank = firstTrack.ranks[0];
  return {
    version: 1,
    departmentIndex: 0,
    rankIndex: 0,
    shiftsAtRank: 0,
    successfulShiftsAtRank: 0,
    cleanConsecutiveAtRank: 0,
    bribeHandledAtRank: false,
    lastPromotionShift: 0,
    totalPromotions: 0,
    rankShiftTarget: pickTargetShifts(seed, 0, 0, firstRank.minShifts, firstRank.maxShifts),
    lastEvaluation: null
  };
}

export function normalizeProgressionState(rawState, seed = Date.now()) {
  const defaults = createInitialProgressionState(seed);
  const state = rawState && typeof rawState === 'object' ? rawState : {};

  const departmentIndex = clamp(state.departmentIndex, 0, PROGRESSION_TRACKS.length - 1);
  const track = getTrackByIndex(departmentIndex);
  const rankIndex = clamp(state.rankIndex, 0, track.ranks.length - 1);
  const rank = track.ranks[rankIndex];

  const target = clamp(
    state.rankShiftTarget || pickTargetShifts(seed, departmentIndex, rankIndex, rank.minShifts, rank.maxShifts),
    rank.minShifts,
    rank.maxShifts
  );

  return {
    version: 1,
    departmentIndex,
    rankIndex,
    shiftsAtRank: Math.max(0, Number(state.shiftsAtRank) || 0),
    successfulShiftsAtRank: Math.max(0, Number(state.successfulShiftsAtRank) || 0),
    cleanConsecutiveAtRank: Math.max(0, Number(state.cleanConsecutiveAtRank) || 0),
    bribeHandledAtRank: Boolean(state.bribeHandledAtRank),
    lastPromotionShift: Math.max(0, Number(state.lastPromotionShift) || 0),
    totalPromotions: Math.max(0, Number(state.totalPromotions) || 0),
    rankShiftTarget: target,
    lastEvaluation: state.lastEvaluation && typeof state.lastEvaluation === 'object'
      ? { ...state.lastEvaluation }
      : null
  };
}

export function getCurrentProgressionContext(state) {
  const normalized = normalizeProgressionState(state);
  const track = getTrackByIndex(normalized.departmentIndex);
  const rank = track.ranks[normalized.rankIndex] || track.ranks[0];
  const weights = METRIC_WEIGHTS_BY_DEPARTMENT[track.gameplayDepartment] || METRIC_WEIGHTS_BY_DEPARTMENT.DMV;

  return {
    track,
    rank,
    weights,
    isFinalDepartment: normalized.departmentIndex >= PROGRESSION_TRACKS.length - 1,
    isFinalRank: normalized.rankIndex >= track.ranks.length - 1
  };
}

export function buildCareerSnapshot(state) {
  const normalized = normalizeProgressionState(state);
  const { track, rank, weights, isFinalDepartment, isFinalRank } = getCurrentProgressionContext(normalized);

  return {
    departmentId: track.id,
    departmentLabel: track.displayName,
    gameplayDepartment: track.gameplayDepartment,
    rankId: rank.id,
    rankTitle: rank.title,
    rankIndex: normalized.rankIndex + 1,
    rankCount: track.ranks.length,
    shiftsAtRank: normalized.shiftsAtRank,
    rankShiftTarget: normalized.rankShiftTarget,
    successfulShiftsAtRank: normalized.successfulShiftsAtRank,
    requiredSuccessfulShifts: rank.requiredSuccessfulShifts,
    cleanConsecutiveAtRank: normalized.cleanConsecutiveAtRank,
    requiredCleanConsecutive: rank.requireConsecutiveCleanShifts || 0,
    bribeHandledAtRank: normalized.bribeHandledAtRank,
    requireBribeHandled: Boolean(rank.requireBribeHandled),
    noOpenMisconduct: Boolean(rank.noOpenMisconduct),
    thresholdScore: rank.thresholdScore,
    minAccuracy: rank.minAccuracy || 0,
    weights,
    requestTypes: [...(rank.requestTypes || [])],
    customerRange: { ...(rank.customerRange || { min: 6, max: 8 }) },
    isFinalDepartment,
    isFinalRank,
    readyForPromotion: normalized.shiftsAtRank >= normalized.rankShiftTarget &&
      normalized.successfulShiftsAtRank >= rank.requiredSuccessfulShifts
  };
}

export function evaluateShiftForProgression(state, input = {}) {
  const normalized = normalizeProgressionState(state, input.seed);
  const context = getCurrentProgressionContext(normalized);
  const snapshotBefore = buildCareerSnapshot(normalized);
  const perf = input.currentShiftPerformance || {};

  const accuracy = clamp(perf.accuracyScore, 0, 100);
  const throughput = clamp(perf.throughputScore, 0, 100);
  const customer = clamp(perf.customerSentimentScore, 0, 100);
  const integrity = perf.bribesAccepted > 0 ? 0 : 100;

  const weightedScore = Math.round(
    (accuracy * context.weights.accuracy) +
    (throughput * context.weights.throughput) +
    (customer * context.weights.customer) +
    (integrity * context.weights.integrity)
  );

  const isCleanShift = Boolean(input.isCleanShift);
  const writeUps = Math.max(0, Number(input.writeUps) || 0);
  const hasMisconduct = context.rank.noOpenMisconduct ? writeUps > 0 : false;
  const bribeHandledThisShift = (Number(perf.bribesAccepted || 0) + Number(perf.bribesDeclined || 0)) > 0;

  normalized.shiftsAtRank += 1;
  normalized.cleanConsecutiveAtRank = isCleanShift ? normalized.cleanConsecutiveAtRank + 1 : 0;
  normalized.bribeHandledAtRank = normalized.bribeHandledAtRank || bribeHandledThisShift;

  const meetsThreshold = weightedScore >= Number(context.rank.thresholdScore || 0);
  const meetsAccuracy = accuracy >= Number(context.rank.minAccuracy || 0);
  const meetsCleanRequirement = Number(context.rank.requireConsecutiveCleanShifts || 0) <= 0 ||
    normalized.cleanConsecutiveAtRank >= Number(context.rank.requireConsecutiveCleanShifts || 0);
  const meetsBribeRequirement = !context.rank.requireBribeHandled || normalized.bribeHandledAtRank;
  const meetsMisconductRequirement = !hasMisconduct;

  // Count qualifying shifts from performance targets so rank progress is visible
  // even while promotion gates (for example open misconduct) are temporarily blocking promotion.
  const isQualifyingShift = meetsThreshold && meetsAccuracy;
  const isSuccessfulShift = isQualifyingShift && meetsMisconductRequirement;
  if (isQualifyingShift) {
    normalized.successfulShiftsAtRank += 1;
  }

  const meetsShiftTarget = normalized.shiftsAtRank >= normalized.rankShiftTarget;
  const meetsSuccessTarget = normalized.successfulShiftsAtRank >= Number(context.rank.requiredSuccessfulShifts || 0);
  const shouldPromote = meetsShiftTarget && meetsSuccessTarget && meetsCleanRequirement && meetsBribeRequirement && meetsMisconductRequirement;

  const promotion = {
    promoted: false,
    promotedWithinDepartment: false,
    transferredDepartment: false,
    becameSupervisor: false,
    fromDepartmentId: context.track.id,
    fromDepartmentLabel: context.track.displayName,
    fromRankTitle: context.rank.title,
    toDepartmentId: context.track.id,
    toDepartmentLabel: context.track.displayName,
    toRankTitle: context.rank.title,
    plaqueAwarded: false,
    transferMemo: false
  };

  if (shouldPromote) {
    promotion.promoted = true;
    normalized.totalPromotions += 1;
    normalized.lastPromotionShift = Math.max(0, Number(input.shiftNumber) || 0);

    const currentTrack = context.track;
    const currentRank = context.rank;

    if (!context.isFinalRank) {
      normalized.rankIndex += 1;
      promotion.promotedWithinDepartment = true;
      promotion.toDepartmentId = currentTrack.id;
      promotion.toDepartmentLabel = currentTrack.displayName;
      promotion.toRankTitle = currentTrack.ranks[normalized.rankIndex].title;
    } else if (!context.isFinalDepartment) {
      normalized.departmentIndex += 1;
      normalized.rankIndex = 0;
      const nextTrack = getTrackByIndex(normalized.departmentIndex);
      promotion.transferredDepartment = true;
      promotion.transferMemo = true;
      promotion.toDepartmentId = nextTrack.id;
      promotion.toDepartmentLabel = nextTrack.displayName;
      promotion.toRankTitle = nextTrack.ranks[0].title;
      if (currentTrack.id === 'CodeEnforcement') {
        promotion.becameSupervisor = true;
        promotion.plaqueAwarded = true;
      }
    } else {
      promotion.becameSupervisor = true;
      promotion.plaqueAwarded = true;
    }

    const newContext = getCurrentProgressionContext(normalized);
    const newRank = newContext.rank;
    normalized.shiftsAtRank = 0;
    normalized.successfulShiftsAtRank = 0;
    normalized.cleanConsecutiveAtRank = 0;
    normalized.bribeHandledAtRank = false;
    normalized.rankShiftTarget = pickTargetShifts(input.seed, normalized.departmentIndex, normalized.rankIndex, newRank.minShifts, newRank.maxShifts);
  }

  normalized.lastEvaluation = {
    weightedScore,
    accuracy,
    throughput,
    customer,
    integrity,
    isQualifyingShift,
    isSuccessfulShift,
    meetsThreshold,
    meetsAccuracy,
    meetsCleanRequirement,
    meetsBribeRequirement,
    meetsMisconductRequirement,
    hasMisconduct,
    bribeHandledThisShift,
    evaluatedShiftNumber: Math.max(0, Number(input.shiftNumber) || 0)
  };

  return {
    state: normalized,
    promotion,
    metrics: normalized.lastEvaluation,
    before: snapshotBefore,
    after: buildCareerSnapshot(normalized)
  };
}
