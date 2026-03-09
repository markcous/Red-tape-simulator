import { CaseRecord } from '../models/npc.js';
import { SeededRNG } from '../models/rng.js';

export class CaseGenerator {
  constructor(catalogs, balancing, photoLibrary = { photos: [] }) {
    this.catalogs = catalogs;
    this.balancing = balancing;
    this.photoLibrary = photoLibrary;
  }

  generateCase(npc, dept, shiftNumber, difficultyProfile = {}, options = {}) {
    const rng = new SeededRNG(npc.rng.masterSeed + shiftNumber * 31);
    const deptConfig = this.catalogs.departments[dept];
    const archetype = this.catalogs.archetypes.find(a => a.id === npc.archetype);
    const allowedRequestTypes = Array.isArray(options?.allowedRequestTypes) ? options.allowedRequestTypes : null;

    // Determine request type
    const requestType = this.pickRequestType(rng, archetype, deptConfig, allowedRequestTypes);
    const configuredRequiredDocs = deptConfig.requiredDocsByRequest[requestType] || [];
    const requiredDocs = this.getRequiredDocsForRequest(requestType, configuredRequiredDocs, npc);
    const fee = deptConfig.fees[requestType] || 0;

    // Generate the documents the NPC brings (some may be missing or forged)
    const documents = this.generateDocuments(rng, npc, archetype, requestType, requiredDocs, difficultyProfile);

    // Generate any special conditions
    const conditions = this.generateConditions(rng, npc, archetype, requestType, deptConfig, difficultyProfile);

    const caseRecord = new CaseRecord({
      npcId: npc.npcId,
      dept,
      shiftNumber,
      requestType,
      inputs: {
        requiredDocs,
        providedDocs: documents,
        fee,
        conditions,
        npcFlags: npc.flags.map(f => ({ ...f }))
      }
    });

    return {
      caseRecord,
      documents,
      correctAction: this.determineCorrectAction(documents, npc, conditions, requestType),
      possibleIssues: this.identifyIssues(documents, npc, conditions, requestType)
    };
  }

  getRequiredDocsForRequest(requestType, configuredRequiredDocs, npc) {
    const required = Array.isArray(configuredRequiredDocs)
      ? [...configuredRequiredDocs]
      : [];

    // Adults applying for a new license should not need parental consent.
    if (requestType === 'NewLicense' && Number(npc?.identity?.age || 0) >= 18) {
      return required.filter((docType) => docType !== 'parentalConsent');
    }

    return required;
  }

  pickRequestType(rng, archetype, deptConfig, allowedRequestTypes = null) {
    const configuredRequests = Array.isArray(deptConfig?.requestTypes) ? deptConfig.requestTypes : [];
    const deptRequests = Array.isArray(allowedRequestTypes) && allowedRequestTypes.length
      ? configuredRequests.filter((requestType) => allowedRequestTypes.includes(requestType))
      : configuredRequests;
    const preferredRequests = Array.isArray(archetype?.commonRequests)
      ? archetype.commonRequests.filter((requestType) => deptRequests.includes(requestType))
      : [];

    if (preferredRequests.length > 0) {
      // 70% chance to use archetype-preferred request
      if (rng.chance(0.7)) {
        return rng.pick(preferredRequests);
      }
    }
    return rng.pick(deptRequests);
  }

  generateDocuments(rng, npc, archetype, requestType, requiredDocs, difficultyProfile = {}) {
    const documents = {};
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const missingMultiplier = Number(difficultyProfile.missingDocMultiplier || 1);
    const fraudMultiplier = Number(difficultyProfile.fraudMultiplier || 1);
    const documentErrorMultiplier = Number(difficultyProfile.documentErrorMultiplier || 1);
    const inconsistencyMultiplier = Number(difficultyProfile.inconsistencyMultiplier || 1);
    const missingDocChance = (archetype ? archetype.missingDocChance : 0.2) * missingMultiplier;
    const fraudChance = (archetype ? archetype.fraudChance : 0.05) * fraudMultiplier;
    const requestContext = this.buildRequestContext(rng, npc, requestType);

    for (const docType of requiredDocs) {
      const doc = {
        type: docType,
        present: true,
        expired: false,
        forged: false,
        errors: [],
        data: {}
      };

      // Check if document is missing
      if (rng.chance(clamp(missingDocChance * 0.5, 0.02, 0.65))) {
        doc.present = false;
        documents[docType] = doc;
        continue;
      }

      // Fill in document data
      doc.data = this.generateDocumentData(rng, npc, docType, requestType, requestContext);

      // Check if document is expired (some document types never expire)
      if (this.isNonExpiringDocument(docType)) {
        doc.expired = false;
      } else if (rng.chance(0.15)) {
        doc.expired = true;
        doc.data.expirationDate = this.generatePastDate(rng);
        doc.errors.push('expired');
      } else {
        doc.data.expirationDate = this.generateFutureDate(rng);
      }

      // Check for forgery
      if (rng.chance(clamp(fraudChance, 0.01, 0.55))) {
        doc.forged = true;
        const forgeryTypes = this.generateForgeryErrors(rng, doc, npc);
        doc.errors.push(...forgeryTypes);
      }

      // Random data inconsistencies
      const inconsistencyChance = this.balancing.difficulty.documentErrorChance
        * 0.3
        * documentErrorMultiplier
        * inconsistencyMultiplier;
      if (rng.chance(clamp(inconsistencyChance, 0.01, 0.45))) {
        const inconsistency = this.generateInconsistency(rng, doc, npc);
        if (inconsistency) doc.errors.push(inconsistency);
      }

      documents[docType] = doc;
    }

    return documents;
  }

  buildRequestContext(rng, npc, requestType) {
    const context = {
      nameChange: null
    };

    if (requestType !== 'NameChange') {
      return context;
    }

    const currentName = `${npc.identity.firstName} ${npc.identity.lastName}`;
    let priorFirstName = rng.pick(this.catalogs.names.first);
    if (priorFirstName === npc.identity.firstName) {
      priorFirstName = rng.pick(this.catalogs.names.first.filter((name) => name !== npc.identity.firstName));
    }

    const previousName = `${priorFirstName} ${npc.identity.lastName}`;
    context.nameChange = {
      previousName,
      newName: currentName
    };

    return context;
  }

  generateDocumentData(rng, npc, docType, requestType, requestContext = {}) {
    const baseData = {
      holderName: `${npc.identity.firstName} ${npc.identity.lastName}`,
      address: npc.identity.address,
      dateIssued: this.generatePastDate(rng, 1, 5),
    };

    switch (docType) {
      case 'driversLicense':
        if (requestType === 'NameChange' && requestContext?.nameChange?.previousName) {
          baseData.holderName = requestContext.nameChange.previousName;
        }
        {
          const organDonor = npc?.identity?.organDonor;
          const donorLabel = organDonor === true ? 'Yes' : organDonor === false ? 'No' : (rng.chance(0.58) ? 'Yes' : 'No');
          const heightIn = Number(npc?.identity?.heightIn || rng.nextInt(58, 78));
          const weightLbs = Number(npc?.identity?.weightLbs || rng.nextInt(105, 295));
          const eyeColor = String(npc?.identity?.eyeColor || npc?.appearance?.eyeColor || rng.pick(['Brown', 'Hazel', 'Blue', 'Green', 'Gray']));
          const hairColor = String(npc?.appearance?.hair?.color || rng.pick(['Black', 'Brown', 'Blonde', 'Gray', 'Red']));

          return {
            ...baseData,
            licenseNumber: `DL${rng.nextInt(100000, 999999)}`,
            dob: npc.identity.dob,
            photo: true,
            licensePhotoId: npc?.appearance?.photoId || null,
            category: rng.pick(['A', 'B', 'C']),
            restrictions: rng.chance(0.2) ? 'Corrective Lenses' : 'None',
            endorsements: rng.chance(0.18) ? rng.pick(['M', 'T', 'H', 'N']) : 'NONE',
            sex: String(npc?.identity?.sex || rng.pick(['F', 'M', 'X'])),
            heightIn,
            weightLbs,
            eyeColor,
            hairColor,
            organDonor: donorLabel,
            ssn: npc?.identity?.ssn || npc?.identity?.ssnMasked || 'XXX-XX-X0000',
            ertc: `${rng.pick(['E0', 'E1', 'E2'])}${rng.nextInt(10, 99)}-${rng.pick(['R0', 'R1', 'R2'])}${rng.nextInt(10, 99)}-${rng.pick(['T0', 'T1', 'T2'])}${rng.nextInt(10, 99)}`
          };
        }
      case 'birthCertificate':
        return {
          ...baseData,
          certificateNumber: `BC-${rng.nextInt(10000, 99999)}`,
          dob: npc.identity.dob,
          birthPlace: rng.pick(['City Hospital', 'County General', 'St. Mary\'s', 'Memorial Hospital']),
        };
      case 'socialSecurityCard':
        return {
          ...baseData,
          ssn: npc.identity.ssnMasked,
        };
      case 'proofOfResidence':
        if (requestType === 'NameChange' && requestContext?.nameChange?.previousName) {
          baseData.holderName = requestContext.nameChange.previousName;
        }
        return this.generateProofOfResidenceData(rng, npc, baseData);
      case 'insuranceProof':
        return {
          ...baseData,
          policyNumber: `INS-${rng.nextInt(100000, 999999)}`,
          provider: rng.pick(['StateFarm', 'Geico', 'AllState', 'Progressive', 'Liberty Mutual']),
          coverageType: rng.pick(['Full', 'Liability Only', 'Comprehensive']),
        };
      case 'titleDocument':
        return {
          ...baseData,
          vin: this.generateVIN(rng),
          make: rng.pick(['Toyota', 'Ford', 'Honda', 'Chevrolet', 'Nissan', 'BMW', 'Hyundai']),
          model: rng.pick(['Sedan', 'SUV', 'Truck', 'Compact', 'Coupe', 'Minivan']),
          year: rng.nextInt(2005, 2025),
          lienHolder: rng.chance(0.3) ? rng.pick(['Chase Bank', 'Capital One', 'Credit Union']) : 'None',
        };
      case 'registrationCard':
        return {
          ...baseData,
          plateNumber: `${rng.pick(['A','B','C','D','X','J','K','M'])}${rng.pick(['A','B','C','J','K','R','S'])}${rng.pick(['H','J','K','L','M'])}` +
                      `-${rng.nextInt(1000, 9999)}`,
          vehicleYear: rng.nextInt(2005, 2025),
        };
      case 'billOfSale':
        return {
          ...baseData,
          vin: this.generateVIN(rng),
          make: rng.pick(['Toyota', 'Ford', 'Honda', 'Chevrolet', 'Nissan', 'BMW', 'Hyundai']),
          model: rng.pick(['Sedan', 'SUV', 'Truck', 'Compact', 'Coupe', 'Minivan']),
          year: rng.nextInt(2005, 2025),
          sellerName: `${rng.pick(this.catalogs.names.first)} ${rng.pick(this.catalogs.names.last)}`,
          salePrice: rng.nextInt(2000, 45000),
          saleDate: this.generatePastDate(rng, 0, 1),
        };
      case 'odometerDisclosure':
        return {
          ...baseData,
          vin: this.generateVIN(rng),
          odometerReading: rng.nextInt(1200, 240000),
          readingUnit: 'Miles',
          disclosureDate: this.generatePastDate(rng, 0, 1),
          transferType: rng.pick(['Sale', 'Gift', 'Inheritance'])
        };
      case 'courtOrder':
        if (requestType === 'NameChange' && requestContext?.nameChange) {
          baseData.holderName = requestContext.nameChange.previousName;
          return {
            ...baseData,
            caseNumber: `CO-${rng.nextInt(2020, 2025)}-${rng.nextInt(1000, 9999)}`,
            orderType: 'Name Change',
            judge: `Hon. ${rng.pick(this.catalogs.names.last)}`,
            oldName: requestContext.nameChange.previousName,
            newName: requestContext.nameChange.newName,
          };
        }
        return {
          ...baseData,
          caseNumber: `CO-${rng.nextInt(2020, 2025)}-${rng.nextInt(1000, 9999)}`,
          orderType: rng.pick(['Name Change', 'Guardianship', 'Estate Administration']),
          judge: `Hon. ${rng.pick(this.catalogs.names.last)}`,
        };
      case 'parentalConsent':
        return {
          ...baseData,
          parentName: `${rng.pick(this.catalogs.names.first)} ${npc.identity.lastName}`,
          parentSignature: true,
          notarized: rng.chance(0.7),
        };
      default:
        return baseData;
    }
  }

  generateForgeryErrors(rng, doc, npc) {
    const errors = [];
    const forgeryTypes = [
      'name_mismatch',
      'photo_mismatch',
      'altered_date',
      'wrong_address',
      'suspicious_seal',
      'ink_inconsistency',
      'wrong_font'
    ];

    const numErrors = rng.nextInt(1, 3);
    for (let i = 0; i < numErrors; i++) {
      const error = rng.pick(forgeryTypes);
      if (!errors.includes(error)) {
        errors.push(error);

        // Apply the forgery to the data
        if (error === 'name_mismatch') {
          doc.data.holderName = `${rng.pick(this.catalogs.names.first)} ${npc.identity.lastName}`;
        } else if (error === 'photo_mismatch') {
          doc.data.licensePhotoId = this.pickDifferentPhotoId(rng, npc?.appearance?.photoId);
        } else if (error === 'wrong_address') {
          doc.data.address = rng.pick(this.catalogs.addresses);
        } else if (error === 'altered_date') {
          doc.data.dateIssued = this.generatePastDate(rng, 5, 10);
        }
      }
    }

    return errors;
  }

  generateProofOfResidenceData(rng, npc, baseData) {
    const documentType = rng.pick(['Utility Bill', 'Bank Statement', 'Lease Agreement', 'Tax Return']);
    const issuedAt = this.generatePastDate(rng, 0, 1);
    const normalizedAddress = String(npc?.identity?.address || 'Address on file').trim();

    if (documentType === 'Bank Statement') {
      const statementDate = this.generatePastDate(rng, 0, 1);
      const periodStart = this.generatePastDate(rng, 1, 2);
      const openingBalance = rng.nextInt(400, 18000);
      const delta = rng.nextInt(-2200, 2600);
      const closingBalance = Math.max(0, openingBalance + delta);

      return {
        ...baseData,
        documentType,
        address: normalizedAddress,
        dateOnDocument: statementDate,
        institutionName: rng.pick(['First Civic Bank', 'Union Savings & Trust', 'Harbor National Bank', 'Metro Federal Credit Union']),
        accountLast4: String(rng.nextInt(0, 9999)).padStart(4, '0'),
        statementPeriodStart: periodStart,
        statementPeriodEnd: statementDate,
        openingBalance,
        closingBalance,
        transactionCount: rng.nextInt(8, 46)
      };
    }

    if (documentType === 'Tax Return') {
      const taxYear = rng.nextInt(2022, 2025);
      const filingStatus = rng.pick(['Single', 'Married filing jointly', 'Head of household']);
      const agi = rng.nextInt(28000, 128000);
      const taxableIncome = Math.max(0, agi - rng.nextInt(12000, 21000));
      const accountAdjustment = rng.nextInt(-2400, 2200);

      return {
        ...baseData,
        documentType,
        address: normalizedAddress,
        dateOnDocument: issuedAt,
        taxYear,
        filingStatus,
        adjustedGrossIncome: agi,
        taxableIncome,
        accountAdjustment,
        formId: '1040',
        returnControlNumber: `TR-${taxYear}-${rng.nextInt(100000, 999999)}`,
        preparerId: `PTIN-${rng.nextInt(100000, 999999)}`
      };
    }

    if (documentType !== 'Lease Agreement') {
      return {
        ...baseData,
        documentType,
        address: normalizedAddress,
        dateOnDocument: issuedAt
      };
    }

    const leaseStartDate = this.generatePastDate(rng, 2, 16);
    const leaseTermMonths = rng.pick([6, 12, 18, 24]);
    const leaseEndDate = this.addMonthsToDate(leaseStartDate, leaseTermMonths);
    const securityDeposit = rng.nextInt(700, 3200);
    const monthlyRent = rng.nextInt(950, 3400);
    const unitSuffix = rng.pick(['A', 'B', 'C', 'D', 'E', 'F']);
    const buildingCode = rng.nextInt(1, 34);

    return {
      ...baseData,
      documentType,
      address: normalizedAddress,
      dateOnDocument: issuedAt,
      leaseId: `LA-${rng.nextInt(2021, 2026)}-${rng.nextInt(10000, 99999)}`,
      leaseStartDate,
      leaseEndDate,
      leaseTermMonths,
      monthlyRent,
      securityDeposit,
      paymentDueDay: rng.nextInt(1, 10),
      landlordName: `${rng.pick(this.catalogs.names.first)} ${rng.pick(this.catalogs.names.last)}`,
      managementCompany: rng.pick(['Oak Street Property Group', 'Union Residential', 'Pinecrest Leasing Co.', 'Metro Housing Partners']),
      unitNumber: `${buildingCode}${unitSuffix}`,
      tenantCount: rng.pick([1, 1, 2, 2, 3]),
      signedByTenant: true,
      signedByLandlord: rng.chance(0.92),
      notarized: rng.chance(0.35)
    };
  }

  addMonthsToDate(isoDate, monthsToAdd) {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return isoDate;
    }
    parsed.setMonth(parsed.getMonth() + monthsToAdd);
    return parsed.toISOString().slice(0, 10);
  }

  pickDifferentPhotoId(rng, currentPhotoId) {
    const photos = Array.isArray(this.photoLibrary?.photos) ? this.photoLibrary.photos : [];
    const ids = photos.map(entry => entry?.id).filter(Boolean);
    if (ids.length === 0) return currentPhotoId || null;

    const alternatives = currentPhotoId ? ids.filter(id => id !== currentPhotoId) : ids;
    if (alternatives.length === 0) return currentPhotoId || ids[0];
    return rng.pick(alternatives);
  }

  generateInconsistency(rng, doc, npc) {
    if (rng.chance(0.5)) {
      // Address mismatch between doc and NPC record
      if (doc.data.address && doc.data.address === npc.identity.address) {
        doc.data.address = rng.pick(this.catalogs.addresses);
        return 'address_inconsistency';
      }
    }
    return null;
  }

  generateConditions(rng, npc, archetype, requestType, deptConfig, difficultyProfile = {}) {
    const conditions = [];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // Check flags
    if (npc.hasFlag('UNPAID_TICKETS')) {
      const flag = npc.flags.find(f => f.flagId === 'UNPAID_TICKETS');
      conditions.push({
        type: 'unpaid_tickets',
        severity: flag.severity,
        detail: `${flag.data.count || 1} unpaid ticket(s), $${flag.data.amountDue || 0} owed`,
        blocksApproval: flag.data.count >= 3
      });
    }

    if (npc.hasFlag('SUSPENDED_LICENSE')) {
      conditions.push({
        type: 'suspended_license',
        severity: 'high',
        detail: 'License currently suspended',
        blocksApproval: true
      });
    }

    if (npc.hasFlag('INSURANCE_LAPSE')) {
      conditions.push({
        type: 'insurance_lapse',
        severity: 'med',
        detail: 'Insurance coverage has lapsed',
        blocksApproval: ['VehicleRegistration', 'PlateRenewal'].includes(requestType)
      });
    }

    if (npc.hasFlag('IMPOUND_HOLD')) {
      conditions.push({
        type: 'impound_hold',
        severity: 'high',
        detail: 'Vehicle under impound hold',
        blocksApproval: true
      });
    }

    if (npc.hasFlag('FRAUD_ALERT')) {
      conditions.push({
        type: 'fraud_alert',
        severity: 'high',
        detail: 'Previous fraud attempt on record - extra scrutiny required',
        blocksApproval: false
      });
    }

    if (npc.hasFlag('VISION_TEST_REQUIRED')) {
      conditions.push({
        type: 'vision_test',
        severity: 'low',
        detail: 'Must complete vision test for license renewal',
        blocksApproval: requestType === 'LicenseRenewal'
      });
    }

    // Bribe attempt based on archetype
    if (archetype && rng.chance(archetype.fraudChance * 0.5)) {
      conditions.push({
        type: 'bribe_attempt',
        severity: 'high',
        detail: 'Customer may attempt to offer a bribe',
        bribeAmount: rng.nextInt(20, 100)
      });
    }

    // Karen escalation check
    if (archetype && archetype.id === 'karen' && rng.chance(0.4)) {
      conditions.push({
        type: 'escalation_risk',
        severity: 'med',
        detail: 'High risk of demanding supervisor'
      });
    }

    const requestOptions = (deptConfig?.requestTypes || []).filter(type => type !== requestType);
    const wrongFormMultiplier = Number(difficultyProfile.wrongFormMultiplier || 1);
    const wrongFormChance = clamp(((archetype?.missingDocChance || 0.15) * 0.6) * wrongFormMultiplier, 0.08, 0.45);
    if (requestOptions.length > 0 && rng.chance(wrongFormChance)) {
      const submittedForm = rng.pick(requestOptions);
      conditions.push({
        type: 'wrong_form',
        severity: 'med',
        detail: `Submitted form ${submittedForm} instead of ${requestType}`,
        expectedForm: requestType,
        submittedForm,
        blocksApproval: true
      });
    }

    return conditions;
  }

  determineCorrectAction(documents, npc, conditions, requestType) {
        if (requestType === 'NameChange') {
          const nameChangeValidationError = this.validateNameChangeDocuments(documents);
          if (nameChangeValidationError) {
            return {
              action: 'Deny',
              reasonCode: 'FailedVerification',
              explanation: nameChangeValidationError
            };
          }
        }

    // Check for blocking conditions
    const blockingConditions = conditions.filter(c => c.blocksApproval);
    if (blockingConditions.length > 0) {
      return {
        action: 'Deny',
        reasonCode: this.getBlockingReasonCode(blockingConditions[0]),
        explanation: blockingConditions[0].detail
      };
    }

    // Check for missing documents
    const missingDocs = Object.values(documents).filter(d => !d.present);
    if (missingDocs.length > 0) {
      return {
        action: 'Deny',
        reasonCode: 'MissingDocument',
        explanation: `Missing: ${missingDocs.map(d => this.formatDocName(d.type)).join(', ')}`
      };
    }

    // Check for missing critical fields on present docs (for example VIN on transfer records).
    const docFieldIssues = this.findCriticalFieldIssues(documents);
    if (docFieldIssues.length > 0) {
      const firstIssue = docFieldIssues[0];
      return {
        action: 'Deny',
        reasonCode: 'FailedVerification',
        explanation: `${this.formatDocName(firstIssue.docType)} missing required field: ${firstIssue.fieldLabel}`
      };
    }

    // Check for expired documents
    const expiredDocs = Object.values(documents).filter(d => d.expired && !this.isNonExpiringDocument(d.type));
    if (expiredDocs.length > 0) {
      return {
        action: 'Deny',
        reasonCode: 'ExpiredDocument',
        explanation: `Expired: ${expiredDocs.map(d => this.formatDocName(d.type)).join(', ')}`
      };
    }

    // Check for forged documents
    const forgedDocs = Object.values(documents).filter(d => d.forged);
    if (forgedDocs.length > 0) {
      return {
        action: 'Deny',
        reasonCode: 'FraudSuspected',
        explanation: 'Document authenticity could not be verified'
      };
    }

    // Check for high-severity flags that don't block but warrant escalation
    const highFlags = npc.flags.filter(f => f.severity === 'high');
    if (highFlags.length > 0 && !blockingConditions.length) {
      return {
        action: 'Approve',
        reasonCode: 'AllDocumentsValid',
        explanation: 'Documents valid (note: flags on record require attention)',
        hasWarnings: true
      };
    }

    // All clear
    return {
      action: 'Approve',
      reasonCode: 'AllDocumentsValid',
      explanation: 'All documents present, valid, and verified'
    };
  }

  getBlockingReasonCode(condition) {
    const map = {
      'unpaid_tickets': 'OutstandingViolations',
      'suspended_license': 'SuspendedLicense',
      'insurance_lapse': 'InsuranceLapse',
      'impound_hold': 'ImpoundHold',
      'wrong_form': 'FailedVerification',
      'vision_test': 'SupervisorRequired',
      'fraud_alert': 'FraudSuspected'
    };
    return map[condition.type] || 'SupervisorRequired';
  }

  identifyIssues(documents, npc, conditions, requestType = null) {
    const issues = [];

    for (const [docType, doc] of Object.entries(documents)) {
      if (!doc.present) {
        issues.push({ type: 'missing', doc: docType, severity: 'high', description: `${this.formatDocName(docType)} not provided` });
      }
      if (doc.expired && !this.isNonExpiringDocument(docType)) {
        issues.push({ type: 'expired', doc: docType, severity: 'high', description: `${this.formatDocName(docType)} is expired` });
      }
      if (doc.forged) {
        issues.push({ type: 'forgery', doc: docType, severity: 'critical', description: `${this.formatDocName(docType)} appears forged`, details: doc.errors });
      }
      if (doc.errors.includes('address_inconsistency')) {
        issues.push({ type: 'inconsistency', doc: docType, severity: 'medium', description: `Address on ${this.formatDocName(docType)} doesn't match records` });
      }
      if (doc.errors.includes('name_mismatch')) {
        issues.push({ type: 'mismatch', doc: docType, severity: 'high', description: `Name on ${this.formatDocName(docType)} doesn't match` });
      }

      const missingFields = this.getMissingCriticalFields(docType, doc?.data || {});
      for (const field of missingFields) {
        issues.push({
          type: 'missing_field',
          doc: docType,
          severity: 'high',
          description: `${this.formatDocName(docType)} missing required field: ${field.label}`
        });
      }
    }

    for (const condition of conditions) {
      if (condition.blocksApproval) {
        issues.push({ type: 'condition', severity: 'high', description: condition.detail });
      }
    }

    if (requestType === 'NameChange') {
      const nameChangeValidationError = this.validateNameChangeDocuments(documents);
      if (nameChangeValidationError) {
        issues.push({
          type: 'name_change_validation',
          severity: 'high',
          description: nameChangeValidationError
        });
      }
    }

    return issues;
  }

  validateNameChangeDocuments(documents) {
    const licenseDoc = documents?.driversLicense;
    const courtOrderDoc = documents?.courtOrder;

    if (!licenseDoc?.present || !courtOrderDoc?.present) {
      return null;
    }

    const orderType = String(courtOrderDoc?.data?.orderType || '').trim().toLowerCase();
    if (orderType !== 'name change') {
      return 'Court order type does not authorize a legal name change';
    }

    const priorName = String(courtOrderDoc?.data?.oldName || '').trim();
    const requestedName = String(courtOrderDoc?.data?.newName || '').trim();
    const licenseName = String(licenseDoc?.data?.holderName || '').trim();

    if (!priorName || !requestedName) {
      return 'Court order missing old/new legal name details';
    }

    if (priorName !== licenseName) {
      return 'Old legal name on court order does not match name on current license';
    }

    if (priorName === requestedName) {
      return 'Requested new name must differ from prior legal name';
    }

    return null;
  }

  findCriticalFieldIssues(documents) {
    const issues = [];
    for (const [docType, doc] of Object.entries(documents || {})) {
      if (!doc?.present) continue;

      const missingFields = this.getMissingCriticalFields(docType, doc?.data || {});
      for (const field of missingFields) {
        issues.push({
          docType,
          fieldKey: field.key,
          fieldLabel: field.label
        });
      }
    }
    return issues;
  }

  getMissingCriticalFields(docType, data) {
    const requiredByDoc = {
      billOfSale: [{ key: 'vin', label: 'Vehicle Identification Number (VIN)' }],
      titleDocument: [{ key: 'vin', label: 'Vehicle Identification Number (VIN)' }],
      odometerDisclosure: [{ key: 'vin', label: 'Vehicle Identification Number (VIN)' }]
    };

    const requiredFields = requiredByDoc[docType] || [];
    return requiredFields.filter((field) => !this.hasMeaningfulFieldValue(data?.[field.key]));
  }

  hasMeaningfulFieldValue(value) {
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim();
    if (!normalized) return false;

    // Placeholder text should not pass required field verification.
    const placeholders = ['vin on file', 'pending verification', 'application file'];
    return !placeholders.includes(normalized.toLowerCase());
  }

  formatDocName(docType) {
    const names = {
      driversLicense: "Driver's License",
      birthCertificate: 'Birth Certificate',
      socialSecurityCard: 'Social Security Card',
      proofOfResidence: 'Proof of Residence',
      insuranceProof: 'Insurance Proof',
      titleDocument: 'Title Document',
      registrationCard: 'Registration Card',
      billOfSale: 'Bill of Sale',
      courtOrder: 'Court Order',
      parentalConsent: 'Parental Consent Form',
      odometerDisclosure: 'Odometer Disclosure',
      ticketCitation: 'Ticket Citation',
      evidencePhotos: 'Evidence Photos',
      vehicleRegistration: 'Vehicle Registration',
      parkingPermit: 'Parking Permit',
      releaseForm: 'Release Form',
      policeReport: 'Police Report',
      proofOfOwnership: 'Proof of Ownership',
      sitePlan: 'Site Plan',
      zoningClearance: 'Zoning Clearance',
      businessRegistration: 'Business Registration',
      taxClearance: 'Tax Clearance',
      eventPlan: 'Event Plan',
      neighborhoodConsent: 'Neighborhood Consent',
      propertyDeed: 'Property Deed',
      inspectionChecklist: 'Inspection Checklist'
    };
    return names[docType] || docType;
  }

  isNonExpiringDocument(docType) {
    return docType === 'birthCertificate' || docType === 'socialSecurityCard';
  }

  formatRequestType(requestType) {
    return requestType.replace(/([A-Z])/g, ' $1').trim();
  }

  generateVIN(rng) {
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    let vin = '';
    for (let i = 0; i < 17; i++) {
      vin += chars[rng.nextInt(0, chars.length - 1)];
    }
    return vin;
  }

  generatePastDate(rng, minYearsAgo = 0, maxYearsAgo = 3) {
    const now = new Date();
    const daysAgo = rng.nextInt(minYearsAgo * 365, maxYearsAgo * 365);
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  generateFutureDate(rng) {
    const now = new Date();
    const daysAhead = rng.nextInt(30, 365 * 5);
    const date = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
}
