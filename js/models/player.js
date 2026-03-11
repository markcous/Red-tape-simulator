export class PlayerState {
  constructor() {
    this.playerId = 'player_1';
    this.name = 'New Clerk';
    this.department = 'DMV';
    this.role = 'clerk'; // clerk -> senior_clerk -> supervisor -> director
    this.shiftNumber = 0;
    this.weekNumber = 0;
    this.money = 0;
    this.salary = 250; // per shift

    // Performance
    this.performance = {
      currentShift: this.newShiftPerformance(),
      weeklyScores: [],
      allTimeStats: {
        totalCasesProcessed: 0,
        totalCorrectDecisions: 0,
        totalIncorrectDecisions: 0,
        totalBribesAccepted: 0,
        totalBribesDeclined: 0,
        totalEscalations: 0,
        totalComplaints: 0
      }
    };

    // Streak tracking
    this.cleanShiftStreak = 0;
    this.streakBonus = 0;

    // Career
    this.writeUps = 0;
    this.totalWriteUps = 0;
    this.onProbation = false;
    this.promotionProgress = 0;
    this.progressionState = null;

    // Supervisor relationship
    this.supervisorType = 'byTheBook'; // will be assigned
    this.supervisorRelationship = 50; // 0-100

    // Achievements
    this.achievements = [];
    this.unlockedDepartments = ['DMV'];

    // NPC pool
    this.npcPool = [];

    // Progression flags
    this.tutorialCompleted = false;
    this.shiftsCompleted = 0;
  }

  newShiftPerformance() {
    return {
      casesProcessed: 0,
      correctDecisions: 0,
      incorrectDecisions: 0,
      customerSentiments: [],
      policyErrors: { minor: 0, major: 0 },
      complaints: 0,
      escalations: 0,
      bribesAccepted: 0,
      bribesDeclined: 0,
      processingTimes: [],
      accuracyScore: 100,
      throughputScore: 0,
      customerSentimentScore: 100,
      penalties: 0,
      events: []
    };
  }

  startNewShift() {
    this.shiftNumber++;
    if (this.shiftNumber % 5 === 1 && this.shiftNumber > 1) {
      this.weekNumber++;
    }
    this.performance.currentShift = this.newShiftPerformance();
  }

  recordCase(caseResult) {
    const perf = this.performance.currentShift;
    perf.casesProcessed++;
    perf.processingTimes.push(caseResult.processingTime);
    perf.customerSentiments.push(caseResult.sentiment);

    if (caseResult.correct) {
      perf.correctDecisions++;
      this.performance.allTimeStats.totalCorrectDecisions++;
    } else {
      perf.incorrectDecisions++;
      this.performance.allTimeStats.totalIncorrectDecisions++;
    }

    this.performance.allTimeStats.totalCasesProcessed++;

    if (caseResult?.caseId) {
      perf.events.push({
        type: 'case',
        caseId: String(caseResult.caseId),
        correct: Boolean(caseResult.correct),
        sentiment: String(caseResult.sentiment || 'neutral')
      });
    }
  }

  recordBribe(accepted) {
    if (accepted) {
      this.performance.currentShift.bribesAccepted++;
      this.performance.allTimeStats.totalBribesAccepted++;
    } else {
      this.performance.currentShift.bribesDeclined++;
      this.performance.allTimeStats.totalBribesDeclined++;
    }
  }

  recordComplaint() {
    this.performance.currentShift.complaints++;
    this.performance.allTimeStats.totalComplaints++;
  }

  recordEscalation() {
    this.performance.currentShift.escalations++;
    this.performance.allTimeStats.totalEscalations++;
  }

  calculateShiftScore(balancing) {
    const perf = this.performance.currentShift;
    const target = 7; // target cases per shift
    const safeNumber = (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };

    // Accuracy score
    const totalDecisions = perf.correctDecisions + perf.incorrectDecisions;
    const accuracyScore = totalDecisions > 0
      ? (perf.correctDecisions / totalDecisions) * 100
      : 100;

    // Throughput score (capped at 100)
    const throughputScore = Math.min(100, (perf.casesProcessed / target) * 100);

    // Customer sentiment score
    const sentimentMap = balancing?.sentiment || {};
    let sentimentTotal = 0;
    if (perf.customerSentiments.length > 0) {
      for (const s of perf.customerSentiments) {
        sentimentTotal += (sentimentMap[s] || 0);
      }
      sentimentTotal = Math.max(0, (sentimentTotal / perf.customerSentiments.length) * 100);
    } else {
      sentimentTotal = 50;
    }

    // Penalties
    let penalties = 0;
    penalties += safeNumber(perf.policyErrors.minor, 0) * safeNumber(balancing?.penalties?.minorError, 5);
    penalties += safeNumber(perf.policyErrors.major, 0) * safeNumber(balancing?.penalties?.majorError, 15);
    penalties += safeNumber(perf.complaints, 0) * safeNumber(balancing?.penalties?.complaint, 10);
    const bribePenaltyTable = balancing?.penalties?.bribe || {};
    const bribePenalty = safeNumber(bribePenaltyTable[this.supervisorType], 20);
    penalties += safeNumber(perf.bribesAccepted, 0) * bribePenalty;

    // Keep penalties meaningful without letting one rough shift collapse every score to zero.
    const normalizedPenalty = safeNumber(Math.min(80, penalties * 0.75), 0);

    // Streak bonus
    const streakBonus = this.streakBonus;

    // Final score
    const configuredWeights = balancing?.weights || {};
    const w = {
      accuracy: safeNumber(configuredWeights.accuracy, 0.5),
      throughput: safeNumber(configuredWeights.throughput, 0.2),
      customer: safeNumber(configuredWeights.customer, 0.3)
    };
    const baseScore =
      (accuracyScore * w.accuracy) +
      (throughputScore * w.throughput) +
      (sentimentTotal * w.customer);

    const rawFinalScore = safeNumber(baseScore, 0) + safeNumber(streakBonus, 0) - normalizedPenalty;
    let finalScore = Math.max(0, Math.min(100, safeNumber(rawFinalScore, 0)));

    const flawlessShift =
      totalDecisions > 0
      && safeNumber(perf.incorrectDecisions, 0) === 0
      && safeNumber(perf.policyErrors?.minor, 0) === 0
      && safeNumber(perf.policyErrors?.major, 0) === 0
      && safeNumber(perf.complaints, 0) === 0
      && safeNumber(perf.bribesAccepted, 0) === 0;

    // Correct denials can still reduce sentiment; keep flawless policy execution in top-tier grading.
    if (flawlessShift) {
      finalScore = Math.max(finalScore, 95);
    }

    perf.accuracyScore = accuracyScore;
    perf.throughputScore = throughputScore;
    perf.customerSentimentScore = sentimentTotal;
    perf.penalties = normalizedPenalty;

    return Math.round(safeNumber(finalScore, 0));
  }

  endShift(balancing, options = {}) {
    const hasForcedScore = options?.forcedScore !== null && options?.forcedScore !== undefined;
    const forcedScore = hasForcedScore ? Number(options.forcedScore) : NaN;
    const rawScore = Number.isFinite(forcedScore)
      ? Math.max(0, Math.min(100, Math.round(forcedScore)))
      : this.calculateShiftScore(balancing);
    const score = Number.isFinite(rawScore) ? rawScore : 0;
    this.performance.weeklyScores.push(score);
    this.money += this.salary;
    this.shiftsCompleted++;

    // Clean shift check
    const perf = this.performance.currentShift;
    const isClean = perf.policyErrors.minor === 0 &&
                    perf.policyErrors.major === 0 &&
                    perf.complaints === 0 &&
                    perf.bribesAccepted === 0;

    if (isClean) {
      this.cleanShiftStreak++;
      this.streakBonus = Math.min(balancing.streak.cap,
        this.cleanShiftStreak * balancing.streak.perCleanShift);
    } else {
      this.cleanShiftStreak = 0;
      this.streakBonus = Math.max(0, this.streakBonus - balancing.streak.decayPerDirtyShift);
    }

    return {
      score,
      isClean,
      streak: this.cleanShiftStreak,
      earnings: this.salary
    };
  }

  getWeeklyPerformance() {
    const last5 = this.performance.weeklyScores.slice(-5);
    if (last5.length === 0) return 0;
    return Math.round(last5.reduce((a, b) => a + b, 0) / last5.length);
  }

  checkAchievements() {
    const newAchievements = [];
    const stats = this.performance.allTimeStats;

    const checks = [
      { id: 'first_shift', name: 'First Day on the Job', condition: this.shiftsCompleted >= 1 },
      { id: 'by_the_book', name: 'By the Book', condition: this.cleanShiftStreak >= 10 },
      { id: 'machine_at_desk', name: 'Machine at the Desk', condition: stats.totalCasesProcessed >= 20 },
      { id: 'karen_whisperer', name: 'Karen Whisperer', condition: stats.totalEscalations === 0 && stats.totalCasesProcessed >= 10 },
      { id: 'incorruptible', name: "Can't Buy Me Love", condition: stats.totalBribesDeclined >= 10 },
      { id: 'looking_other_way', name: 'Looking the Other Way', condition: stats.totalBribesAccepted >= 3 },
      { id: 'perfect_week', name: 'Public Servant of the Month', condition: this.getWeeklyPerformance() >= 90 && this.performance.weeklyScores.length >= 5 },
    ];

    for (const check of checks) {
      if (check.condition && !this.achievements.includes(check.id)) {
        this.achievements.push(check.id);
        newAchievements.push(check);
      }
    }

    return newAchievements;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    const player = new PlayerState();
    Object.assign(player, data);
    if (!player.progressionState || typeof player.progressionState !== 'object') {
      player.progressionState = null;
    }
    return player;
  }
}
