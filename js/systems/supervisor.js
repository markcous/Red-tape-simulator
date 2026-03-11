import { SeededRNG } from '../models/rng.js';

export class SupervisorSystem {
  constructor(balancing, dialogueData) {
    this.balancing = balancing;
    this.dialogueData = dialogueData;
    this.type = 'byTheBook';
    this.name = 'Supervisor';
    this.relationship = 50;
    this.rng = new SeededRNG(Date.now());
  }

  initialize(shiftNumber) {
    const types = this.balancing.supervisor.types;
    this.rng = new SeededRNG(shiftNumber * 997);
    if (shiftNumber <= 1) {
      this.type = 'byTheBook'; // Start with by-the-book supervisor
    }
    this.name = this.generateName();
  }

  generateName() {
    const names = {
      byTheBook: ['Director Hargrove', 'Supervisor Chen', 'Manager Kowalski'],
      politician: ['Director Suarez', 'Supervisor Blake', 'Manager O\'Brien'],
      pragmatist: ['Director Yamamoto', 'Supervisor Lewis', 'Manager Petrov'],
      corrupt: ['Director Fontaine', 'Supervisor Riggs', 'Manager DeLuca']
    };
    return this.rng.pick(names[this.type] || names.byTheBook);
  }

  evaluateCase(caseResult, playerDecision, correctAction, options = {}) {
    const evaluation = {
      correct: false,
      policyError: null,
      sentiment: 'neutral',
      feedback: '',
      penaltyType: null,
      reputationDelta: { towardPlayer: 0, towardAgency: 0 }
    };

    const difficultyId = String(options?.difficultyId || 'easy').toLowerCase();
    const requiresAllDenyReasons = ['hard', 'nightmare'].includes(difficultyId);

    const isActionMatch = playerDecision.action === correctAction.action;
    const expectedReasonSet = new Set(
      (Array.isArray(correctAction?.applicableReasonCodes) && correctAction.applicableReasonCodes.length
        ? correctAction.applicableReasonCodes
        : [correctAction?.reasonCode]
      )
        .map((code) => String(code || '').trim())
        .filter(Boolean)
    );
    const selectedReasonSet = new Set(
      (Array.isArray(playerDecision?.reasonCodes) && playerDecision.reasonCodes.length
        ? playerDecision.reasonCodes
        : [playerDecision?.reasonCode]
      )
        .map((code) => String(code || '').trim())
        .filter(Boolean)
    );

    const hasMatchingReasonSets = expectedReasonSet.size === selectedReasonSet.size
      && [...expectedReasonSet].every((code) => selectedReasonSet.has(code));
    const hasAnyExpectedReasonSelected = [...selectedReasonSet].some((code) => expectedReasonSet.has(code));
    const isDenyReasonMatch = !isActionMatch
      || playerDecision.action !== 'Deny'
      || (requiresAllDenyReasons ? hasMatchingReasonSets : hasAnyExpectedReasonSelected);
    const isCorrect = isActionMatch && isDenyReasonMatch;
    evaluation.correct = isCorrect;

    if (isCorrect) {
      // Correct decision
      if (playerDecision.action === 'Approve') {
        evaluation.sentiment = 'happy';
        evaluation.reputationDelta = { ...this.balancing.reputation.approveCorrect };
        evaluation.feedback = 'Correctly approved.';
      } else if (playerDecision.action === 'Deny') {
        // Denial makes customers less happy even when correct
        evaluation.sentiment = 'annoyed';
        evaluation.reputationDelta = { ...this.balancing.reputation.denyCorrect };
        evaluation.feedback = 'Correctly denied.';
      } else {
        evaluation.sentiment = 'neutral';
        evaluation.reputationDelta = { ...this.balancing.reputation.escalate };
        evaluation.feedback = 'Escalated to supervisor.';
      }
    } else {
      // Incorrect decision
      if (playerDecision.action === 'Deny' && correctAction.action === 'Deny') {
        // Denial was warranted, but the reason code was wrong.
        evaluation.policyError = 'minor';
        evaluation.sentiment = 'annoyed';
        evaluation.reputationDelta = { ...this.balancing.reputation.escalate };
        if (requiresAllDenyReasons) {
          const missingReasons = [...expectedReasonSet].filter((code) => !selectedReasonSet.has(code));
          const extraReasons = [...selectedReasonSet].filter((code) => !expectedReasonSet.has(code));
          const notes = [];
          if (missingReasons.length) notes.push(`missing: ${missingReasons.join(', ')}`);
          if (extraReasons.length) notes.push(`extra: ${extraReasons.join(', ')}`);
          evaluation.feedback = `Wrong deny reason set for hard+ (${notes.join(' | ')}). Expected ${[...expectedReasonSet].join(', ')}: ${correctAction.explanation}`;
        } else {
          const acceptableReasons = [...expectedReasonSet].join(', ');
          evaluation.feedback = `Wrong deny reason. Acceptable reason(s): ${acceptableReasons}. ${correctAction.explanation}`;
        }
      } else if (playerDecision.action === 'Approve' && correctAction.action === 'Deny') {
        // Approved something that should've been denied - major error
        evaluation.policyError = 'major';
        evaluation.sentiment = 'neutral'; // Customer is happy but it's wrong
        evaluation.reputationDelta = { ...this.balancing.reputation.approveIncorrect };
        evaluation.feedback = `Should have been denied: ${correctAction.explanation}`;
      } else if (playerDecision.action === 'Deny' && correctAction.action === 'Approve') {
        // Denied something that should've been approved - major error
        evaluation.policyError = 'major';
        evaluation.sentiment = 'angry';
        evaluation.reputationDelta = { ...this.balancing.reputation.denyIncorrect };
        evaluation.feedback = `Should have been approved: ${correctAction.explanation}`;
      } else if (playerDecision.action === 'Escalate') {
        // Escalation when not needed - minor error
        evaluation.policyError = 'minor';
        evaluation.sentiment = 'annoyed';
        evaluation.reputationDelta = { ...this.balancing.reputation.escalate };
        evaluation.feedback = 'Unnecessary escalation.';
      }
    }

    return evaluation;
  }

  generateShiftReview(player, options = {}) {
    const perf = player.performance.currentShift;
    const hasForcedScoreOption = options?.forcedScore !== null && options?.forcedScore !== undefined;
    const forcedScore = hasForcedScoreOption ? Number(options.forcedScore) : NaN;
    const score = Number.isFinite(forcedScore)
      ? Math.max(0, Math.min(100, Math.round(forcedScore)))
      : player.calculateShiftScore(this.balancing);
    const comments = this.dialogueData.supervisorComments[this.type];

    const review = {
      score,
      grade: this.getGrade(score),
      supervisorType: this.type,
      supervisorName: this.name,
      comment: '',
      detailedFeedback: [],
      consequences: [],
      streakStatus: player.cleanShiftStreak
    };

    // Generate main comment
    if (score >= 85) {
      review.comment = this.rng.pick(comments.praise);
    } else {
      const latestCaseEvent = Array.isArray(perf?.events)
        ? [...perf.events].reverse().find((event) => event?.caseId)
        : null;
      const resolvedCaseId = String(latestCaseEvent?.caseId || 'N/A');
      review.comment = this.rng.pick(comments.criticism)
        .replace('{{errorCount}}', perf.policyErrors.minor + perf.policyErrors.major)
        .replace('{{complaintCount}}', perf.complaints)
        .replace('{{caseId}}', resolvedCaseId)
        .replace(/\{\{[^}]+\}\}/g, 'N/A');
    }

    // Detailed feedback
    review.detailedFeedback.push(`Cases Processed: ${perf.casesProcessed}`);
    review.detailedFeedback.push(`Accuracy: ${Math.round(perf.accuracyScore)}%`);
    review.detailedFeedback.push(`Customer Satisfaction: ${Math.round(perf.customerSentimentScore)}%`);

    if (perf.policyErrors.major > 0) {
      review.detailedFeedback.push(`Major Policy Errors: ${perf.policyErrors.major}`);
    }
    if (perf.policyErrors.minor > 0) {
      review.detailedFeedback.push(`Minor Policy Errors: ${perf.policyErrors.minor}`);
    }
    if (perf.complaints > 0) {
      review.detailedFeedback.push(`Customer Complaints: ${perf.complaints}`);
    }
    if (perf.bribesAccepted > 0) {
      review.detailedFeedback.push(`Bribes Accepted: ${perf.bribesAccepted} (!!)`);
    }

    // Consequences
    const bands = this.balancing.weeklyBands;
    if (score >= bands.promo) {
      review.consequences.push('Excellent performance! Promotion consideration noted.');
    } else if (score >= bands.solid) {
      review.consequences.push('Solid work. Keep it up.');
    } else if (score >= bands.coaching) {
      review.consequences.push('Needs improvement. Reduced quota tomorrow.');
    } else {
      review.consequences.push('FORMAL WARNING ISSUED. Improve immediately or face probation.');
      player.writeUps++;
      player.totalWriteUps++;
    }

    if (perf.bribesAccepted > 0) {
      const bribePenalty = this.handleBribeDiscovery(player, perf.bribesAccepted);
      if (bribePenalty) review.consequences.push(bribePenalty);
    }

    return review;
  }

  handleBribeDiscovery(player, count) {
    const detectionChance = {
      byTheBook: 0.8,
      politician: 0.5,
      pragmatist: 0.6,
      corrupt: 0.2
    };

    if (this.rng.chance(detectionChance[this.type] || 0.5)) {
      if (this.type === 'corrupt' && this.relationship > 60) {
        return "I noticed some... irregularities. Just make sure I get my cut next time.";
      } else if (this.type === 'corrupt') {
        return "Word of advice: be more careful about that sort of thing.";
      } else {
        player.writeUps++;
        player.totalWriteUps++;
        return "MISCONDUCT REPORT: Acceptance of unauthorized gratuities. Written warning issued.";
      }
    }
    return null;
  }

  getGrade(score) {
    if (score >= 95) return 'S';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  getInterventionDecision(event) {
    // Supervisor personality affects how they handle interventions
    switch (this.type) {
      case 'byTheBook':
        return { action: 'enforce_rules', leniency: 0 };
      case 'politician':
        return { action: 'appease_customer', leniency: 0.7 };
      case 'pragmatist':
        return { action: 'balanced', leniency: 0.4 };
      case 'corrupt':
        return { action: 'whatever_works', leniency: 0.8 };
      default:
        return { action: 'balanced', leniency: 0.5 };
    }
  }
}
