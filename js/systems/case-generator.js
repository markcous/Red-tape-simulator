import { CaseRecord } from '../models/npc.js';
import { SeededRNG } from '../models/rng.js';

export class CaseGenerator {
  constructor(catalogs, balancing) {
    this.catalogs = catalogs;
    this.balancing = balancing;
  }

  generateCase(npc, dept, shiftNumber) {
    const rng = new SeededRNG(npc.rng.masterSeed + shiftNumber * 31);
    const deptConfig = this.catalogs.departments[dept];
    const archetype = this.catalogs.archetypes.find(a => a.id === npc.archetype);

    // Determine request type
    const requestType = this.pickRequestType(rng, archetype, deptConfig);
    const requiredDocs = deptConfig.requiredDocsByRequest[requestType] || [];
    const fee = deptConfig.fees[requestType] || 0;

    // Generate the documents the NPC brings (some may be missing or forged)
    const documents = this.generateDocuments(rng, npc, archetype, requiredDocs);

    // Generate any special conditions
    const conditions = this.generateConditions(rng, npc, archetype, requestType);

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
      possibleIssues: this.identifyIssues(documents, npc, conditions)
    };
  }

  pickRequestType(rng, archetype, deptConfig) {
    if (archetype && archetype.commonRequests && archetype.commonRequests.length > 0) {
      // 70% chance to use archetype-preferred request
      if (rng.chance(0.7)) {
        return rng.pick(archetype.commonRequests);
      }
    }
    return rng.pick(deptConfig.requestTypes);
  }

  generateDocuments(rng, npc, archetype, requiredDocs) {
    const documents = {};
    const missingDocChance = archetype ? archetype.missingDocChance : 0.2;
    const fraudChance = archetype ? archetype.fraudChance : 0.05;

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
      if (rng.chance(missingDocChance * 0.5)) {
        doc.present = false;
        documents[docType] = doc;
        continue;
      }

      // Fill in document data
      doc.data = this.generateDocumentData(rng, npc, docType);

      // Check if document is expired
      if (rng.chance(0.15)) {
        doc.expired = true;
        doc.data.expirationDate = this.generatePastDate(rng);
        doc.errors.push('expired');
      } else {
        doc.data.expirationDate = this.generateFutureDate(rng);
      }

      // Check for forgery
      if (rng.chance(fraudChance)) {
        doc.forged = true;
        const forgeryTypes = this.generateForgeryErrors(rng, doc, npc);
        doc.errors.push(...forgeryTypes);
      }

      // Random data inconsistencies
      if (rng.chance(this.balancing.difficulty.documentErrorChance * 0.3)) {
        const inconsistency = this.generateInconsistency(rng, doc, npc);
        if (inconsistency) doc.errors.push(inconsistency);
      }

      documents[docType] = doc;
    }

    return documents;
  }

  generateDocumentData(rng, npc, docType) {
    const baseData = {
      holderName: `${npc.identity.firstName} ${npc.identity.lastName}`,
      address: npc.identity.address,
      dateIssued: this.generatePastDate(rng, 1, 5),
    };

    switch (docType) {
      case 'driversLicense':
        return {
          ...baseData,
          licenseNumber: `DL${rng.nextInt(100000, 999999)}`,
          dob: npc.identity.dob,
          photo: true,
          category: rng.pick(['A', 'B', 'C']),
          restrictions: rng.chance(0.2) ? 'Corrective Lenses' : 'None'
        };
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
        return {
          ...baseData,
          documentType: rng.pick(['Utility Bill', 'Bank Statement', 'Lease Agreement', 'Tax Return']),
          address: npc.identity.address,
          dateOnDocument: this.generatePastDate(rng, 0, 1),
        };
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
          sellerName: `${rng.pick(this.catalogs.names.first)} ${rng.pick(this.catalogs.names.last)}`,
          salePrice: rng.nextInt(2000, 45000),
          saleDate: this.generatePastDate(rng, 0, 1),
        };
      case 'courtOrder':
        return {
          ...baseData,
          caseNumber: `CO-${rng.nextInt(2020, 2025)}-${rng.nextInt(1000, 9999)}`,
          orderType: rng.pick(['Name Change', 'Custody', 'Restraining Order']),
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
        } else if (error === 'wrong_address') {
          doc.data.address = rng.pick(this.catalogs.addresses);
        } else if (error === 'altered_date') {
          doc.data.dateIssued = this.generatePastDate(rng, 5, 10);
        }
      }
    }

    return errors;
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

  generateConditions(rng, npc, archetype, requestType) {
    const conditions = [];

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

    return conditions;
  }

  determineCorrectAction(documents, npc, conditions, requestType) {
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

    // Check for expired documents
    const expiredDocs = Object.values(documents).filter(d => d.expired);
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
      'vision_test': 'SupervisorRequired',
      'fraud_alert': 'FraudSuspected'
    };
    return map[condition.type] || 'SupervisorRequired';
  }

  identifyIssues(documents, npc, conditions) {
    const issues = [];

    for (const [docType, doc] of Object.entries(documents)) {
      if (!doc.present) {
        issues.push({ type: 'missing', doc: docType, severity: 'high', description: `${this.formatDocName(docType)} not provided` });
      }
      if (doc.expired) {
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
    }

    for (const condition of conditions) {
      if (condition.blocksApproval) {
        issues.push({ type: 'condition', severity: 'high', description: condition.detail });
      }
    }

    return issues;
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
      proofOfOwnership: 'Proof of Ownership'
    };
    return names[docType] || docType;
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
