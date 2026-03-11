import { DateFormatters } from './document-data.js';

const fallbackValue = (value, fallback = 'On file') => {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  return normalized || fallback;
};

const field = (label, value) => `<div class="doc-field"><span class="field-label">${label}:</span><span class="field-value">${fallbackValue(value)}</span></div>`;

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '$0.00';
  return `$${numericValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const normalizeSyntheticSsnLabel = (value, fallback = 'XXX-XX-X000') => {
  const cleaned = String(value || fallback).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = cleaned.replace(/[A-Z]/g, '');
  const letters = cleaned.replace(/[0-9]/g, '');
  const paddedDigits = `${digits}00000000`.slice(0, 8);
  const marker = letters[0] || 'X';
  return `${paddedDigits.slice(0, 3)}-${paddedDigits.slice(3, 5)}-${marker}${paddedDigits.slice(5, 8)}`;
};

const atlasMarkup = (asset, className, alt = 'Photo') => {
  if (!asset || asset.type !== 'atlas' || !asset.image) return '';
  const columns = Math.max(1, Number(asset.columns || 1));
  const rows = Math.max(1, Number(asset.rows || 1));
  const col = Math.max(0, Number(asset.col || 0));
  const row = Math.max(0, Number(asset.row || 0));
  const posX = columns > 1 ? (col / (columns - 1)) * 100 : 0;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  const sizeX = columns * 100;
  const sizeY = rows * 100;
  return `<span role="img" aria-label="${alt}" class="atlas-photo ${className}" style="background-image:url('${asset.image}');background-position:${posX}% ${posY}%;background-size:${sizeX}% ${sizeY}%;"></span>`;
};

const normalizeList = (items = [], fallback = 'None listed') => {
  if (!Array.isArray(items)) return [fallback];
  const normalized = items
    .map((item) => fallbackValue(item, ''))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [fallback];
};

const normalizeChecklistItems = (items = [], fallback = 'None listed') => {
  if (!Array.isArray(items)) {
    return [{ label: fallback, checked: false }];
  }

  const normalized = items
    .map((item) => {
      if (item && typeof item === 'object') {
        return {
          label: fallbackValue(item.label, ''),
          checked: Boolean(item.checked)
        };
      }
      return {
        label: fallbackValue(item, ''),
        checked: false
      };
    })
    .filter((item) => Boolean(item.label));

  return normalized.length > 0 ? normalized : [{ label: fallback, checked: false }];
};

const checklistMarkup = (items = [], className = '', showChecks = false) => normalizeChecklistItems(items).map((item) => `
  <div class="request-check ${className}">
    <span class="request-check-box ${showChecks && item.checked ? 'checked' : ''}" aria-hidden="true">${showChecks && item.checked ? '&#10003;' : ''}</span>
    <span class="request-check-label">${item.label}</span>
  </div>
`).join('');

const requestTypeCode = (requestTypeLabel = '', formNumber = '') => {
  const typeCode = String(requestTypeLabel)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18) || 'GENERAL-SERVICE';
  const numeric = String(formNumber).replace(/[^0-9]/g, '').slice(-4) || '0000';
  return `${typeCode}-${numeric}`;
};

const titleCaseFromKey = (value = '') => String(value)
  .replace(/([A-Z])/g, ' $1')
  .replace(/[_-]/g, ' ')
  .replace(/^./, (char) => char.toUpperCase())
  .trim();

const genericFieldRows = (documentData = {}) => {
  const ignored = new Set([
    'licensePhotoUrl',
    'licensePhotoAsset',
    'photo',
    'docType',
    'holderName',
    'fullName',
    'address',
    'dob'
  ]);

  const rows = Object.entries(documentData)
    .filter(([key, value]) => !ignored.has(key) && value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, 8)
    .map(([key, value]) => `<div class="record-line"><span>${titleCaseFromKey(key)}</span><strong>${fallbackValue(value)}</strong></div>`)
    .join('');

  return rows || `<div class="record-line"><span>Record Status</span><strong>No additional data listed</strong></div>`;
};

export const DeskDocumentTemplates = {
  requestForm: ({ person, vehicle, policy, dateValue, form = {} }) => {
    const formNumber = fallbackValue(form.formNumber, 'DMV-000');
    const formTitle = fallbackValue(form.title, 'Department Service Request Form');
    const requestLabel = fallbackValue(form.requestTypeLabel, 'General Service');
    const applicantName = fallbackValue(person.name, 'Applicant on file');
    const applicantDob = DateFormatters.usShort(person.dob || dateValue);
    const declaredLicense = fallbackValue(form.declaredLicenseId || policy.policyNumber, 'Pending verification');
    const declaredVin = fallbackValue(form.declaredVin || vehicle.vin, 'Pending verification');
    const declaredAddress = fallbackValue(form.declaredAddress || person.address, 'Pending verification');
    const oldLegalName = fallbackValue(form.oldLegalName, 'Not provided');
    const newLegalName = fallbackValue(form.newLegalName, 'Not provided');
    const submissionDate = DateFormatters.monthName(form.submittedAt || dateValue);
    const feeAmount = fallbackValue(form.feeLabel || policy.policyNumber, '$0');
    const requiredProof = normalizeChecklistItems(form.requiredProof, 'No additional proof listed');
    const includeSupportingChecklist = form.includeSupportingChecklist !== false;
    const includeVehicleSection = form.includeVehicleSection !== false;
    const includeNameChangeSection = Boolean(form.oldLegalName || form.newLegalName);
    const devMode = Boolean(form.devMode);
    const focusFields = new Set(Array.isArray(form.devFocusFields) ? form.devFocusFields : []);
    const focusClass = (fieldKey) => (devMode && focusFields.has(fieldKey) ? ' dev-focus' : '');
    const trackingId = `RT-${requestTypeCode(requestLabel, formNumber)}`;
    const checklistSection = includeSupportingChecklist ? `
        <div class="request-section checklist${focusClass('required_proof')}">
          <div class="request-section-title">4. Supporting Documents Checklist</div>
          <div class="request-checklist-list">
            <div class="request-list-title">Required Proof</div>
            ${checklistMarkup(requiredProof, 'required', devMode)}
          </div>
        </div>
    ` : '';
    const vehicleSection = includeVehicleSection ? `
        <div class="request-section">
          <div class="request-section-title">3. Vehicle Information</div>
          <div class="request-line"><span class="request-key">Vehicle Identification Number</span><span class="request-value request-mono${focusClass('vehicle_vin')}">${declaredVin}</span></div>
        </div>
    ` : '';
    const nameChangeSection = includeNameChangeSection ? `
        <div class="request-section">
          <div class="request-section-title">3. Name Change Details</div>
          <div class="request-line"><span class="request-key">Prior Legal Name</span><span class="request-value${focusClass('name_change_old_name')}">${oldLegalName}</span></div>
          <div class="request-line"><span class="request-key">Requested New Legal Name</span><span class="request-value${focusClass('name_change_new_name')}">${newLegalName}</span></div>
        </div>
    ` : '';

    return `
      <div class="doc-detail template-request-form">
        <div class="request-form-security" aria-hidden="true">NOT VALID WITHOUT AUTHORIZED REVIEW STAMP</div>

        <div class="request-form-header">
          <div>
            <div class="request-agency">Department of Motor Vehicles</div>
            <h4>${formTitle}</h4>
            <div class="request-revision">Form ${formNumber} | Revision 03-2026</div>
          </div>
          <div class="request-office-box">
            <span>OFFICE USE ONLY</span>
            <strong>${trackingId}</strong>
            <small>Received: ${submissionDate}</small>
          </div>
        </div>

        <div class="request-section">
          <div class="request-section-title">1. Filing Details</div>
          <div class="request-transaction-grid">
            <div class="request-txn-line"><span class="request-key">Filing Fee</span><span class="request-value${focusClass('filing_fee')}">${feeAmount}</span></div>
            <div class="request-txn-line"><span class="request-key">Date Submitted</span><span class="request-value${focusClass('date_submitted')}">${submissionDate}</span></div>
          </div>
        </div>

        <div class="request-section">
          <div class="request-section-title">2. Applicant Information</div>
          <div class="request-line"><span class="request-key">Full Legal Name</span><span class="request-value${focusClass('applicant_name')}">${applicantName}</span></div>
          <div class="request-line split">
            <span><span class="request-key">Date of Birth</span><span class="request-value${focusClass('applicant_dob')}">${applicantDob}</span></span>
            <span><span class="request-key">License / ID</span><span class="request-value${focusClass('applicant_license_id')}">${declaredLicense}</span></span>
          </div>
          <div class="request-line"><span class="request-key">Residence Address</span><span class="request-value${focusClass('applicant_address')}">${declaredAddress}</span></div>
        </div>

        ${nameChangeSection}

        ${vehicleSection}

        ${checklistSection}

        <div class="request-certification">
          I certify under penalty of perjury that the statements and evidence submitted in this application are true and correct.
        </div>

        <div class="request-signatures">
          <div class="request-sign-line"><span>Applicant Signature</span><strong>${applicantName}</strong></div>
          <div class="request-sign-line"><span>Date</span><strong>${submissionDate}</strong></div>
          <div class="request-sign-line"><span>Clerk Initials</span><strong>Pending</strong></div>
        </div>
      </div>`;
  },

  title: ({ person, vehicle, dateValue }) => {
    const ownerName = fallbackValue(person.name, 'Registered owner on file');
    const ownerAddress = fallbackValue(person.address, 'Address on file');
    const vin = fallbackValue(vehicle.vin, 'Pending verification');
    const make = fallbackValue(vehicle.make, 'Make on file');
    const model = fallbackValue(vehicle.model, 'Model on file');
    const year = fallbackValue(vehicle.year, String(new Date().getFullYear()));
    const issueDate = DateFormatters.monthName(dateValue);
    const titleSuffix = vin.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase() || '00000000';

    return `
      <div class="doc-detail template-title workspace-vehicle-title with-background-art">
        <div class="title-watermark" aria-hidden="true">CERTIFICATE OF TITLE</div>

        <div class="title-header-row">
          <div>
            <div class="title-agency">STATE VEHICLE REGISTRY</div>
            <h4>CERTIFICATE OF TITLE</h4>
          </div>
          <div class="title-id-block">
            <span class="title-id-label">TITLE NO.</span>
            <span class="title-id-value">RT-${titleSuffix}</span>
          </div>
        </div>

        <div class="title-owner-block">
          <div class="title-block-label">REGISTERED OWNER</div>
          <div class="title-owner-name">${ownerName}</div>
          <div class="title-owner-address">${ownerAddress}</div>
        </div>

        <div class="title-vehicle-grid">
          <div class="title-cell"><span>VIN</span><strong>${vin}</strong></div>
          <div class="title-cell"><span>YEAR</span><strong>${year}</strong></div>
          <div class="title-cell"><span>MAKE</span><strong>${make}</strong></div>
          <div class="title-cell"><span>MODEL</span><strong>${model}</strong></div>
        </div>

        <div class="title-footer-row">
          <div class="title-issued">ISSUE DATE: <strong>${issueDate}</strong></div>
          <div class="title-seal" aria-hidden="true">OFFICIAL RECORD</div>
        </div>
      </div>`;
  },

  birthCertificate: ({ person, dateValue, documentData = {} }) => {
    const fullName = fallbackValue(person.name, 'Record Name');
    const dob = DateFormatters.usShort(person.dob || documentData.dob);
    const birthPlace = documentData.birthPlace || 'County General';
    const certNumber = documentData.certificateNumber || 'BC-00000';
    const issuedDate = DateFormatters.monthName(dateValue || documentData.dateIssued);

    return `
      <div class="doc-detail workspace-birth-certificate with-background-art">
        <div class="birth-cert-header">
          <div class="birth-cert-agency">BUREAU OF VITAL RECORDS</div>
          <h4>CERTIFICATE OF LIVE BIRTH</h4>
          <div class="birth-cert-subtitle">STATE FILED RECORD</div>
        </div>

        <div class="birth-cert-main">
          <div class="birth-cert-line"><span>CHILD NAME</span><strong>${fullName}</strong></div>
          <div class="birth-cert-line split"><span>DATE OF BIRTH</span><strong>${dob}</strong></div>
          <div class="birth-cert-line"><span>PLACE OF BIRTH</span><strong>${birthPlace}</strong></div>
        </div>

        <div class="birth-cert-footer">
          <div class="birth-cert-meta">
            <span>CERTIFICATE NO.</span>
            <strong>${certNumber}</strong>
          </div>
          <div class="birth-cert-meta">
            <span>DATE FILED</span>
            <strong>${issuedDate}</strong>
          </div>
          <div class="birth-cert-signoff" aria-hidden="true">Registrar Signature on File</div>
        </div>
      </div>`;
  },

  odometerDisclosure: ({ person, vehicle, dateValue, documentData = {} }) => {
    const ownerName = fallbackValue(person.name, 'Transferor on file');
    const vin = fallbackValue(documentData.vin || vehicle.vin, 'Pending verification');
    const reading = fallbackValue(documentData.odometerReading, 'Recorded');
    const readingUnit = documentData.readingUnit || 'Miles';
    const disclosureDate = DateFormatters.monthName(documentData.disclosureDate || dateValue);
    const transferType = documentData.transferType || 'Sale';

    return `
      <div class="doc-detail workspace-odometer-disclosure">
        <div class="odo-header">
          <div class="odo-agency">STATE DMV</div>
          <h4>ODOMETER DISCLOSURE STATEMENT</h4>
          <span class="odo-form-id">FORM ODO-103</span>
        </div>

        <div class="odo-line"><span>TRANSFEROR</span><strong>${ownerName}</strong></div>
        <div class="odo-line"><span>VEHICLE IDENTIFICATION NUMBER</span><strong>${vin}</strong></div>
        <div class="odo-line split">
          <span><span>ODOMETER READING</span><strong>${reading}</strong></span>
          <span><span>UNIT</span><strong>${readingUnit}</strong></span>
        </div>
        <div class="odo-line split">
          <span><span>DISCLOSURE DATE</span><strong>${disclosureDate}</strong></span>
          <span><span>TRANSFER TYPE</span><strong>${transferType}</strong></span>
        </div>

        <div class="odo-attest">I certify to the best of my knowledge that the odometer reading reflects the actual mileage unless otherwise noted by law.</div>
      </div>`;
  },

  billOfSale: ({ person, vehicle, dateValue, documentData = {} }) => {
    const buyerName = fallbackValue(person.name, 'Buyer on file');
    const buyerAddress = fallbackValue(person.address, 'Residence on file');
    const sellerName = fallbackValue(documentData.sellerName, 'Seller on file');
    const vin = fallbackValue(documentData.vin || vehicle.vin, 'Pending verification');
    const vehicleLabel = fallbackValue(
      `${documentData.year || vehicle.year} ${documentData.make || vehicle.make} ${documentData.model || vehicle.model}`.trim(),
      'Vehicle on file'
    );
    const salePrice = formatCurrency(documentData.salePrice);
    const odometerReading = fallbackValue(documentData.odometerReading, 'Verified at transfer');
    const saleCity = fallbackValue(documentData.saleCity, 'Filed Location');
    const saleDate = DateFormatters.monthName(dateValue);
    const recordSuffix = vin.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase() || 'ONFILE';

    return `
      <div class="doc-detail template-bill workspace-bill-of-sale with-background-art">
        <div class="bill-header">
          <div>
            <div class="bill-agency">STATE VEHICLE REGISTRY</div>
            <h4>BILL OF SALE</h4>
          </div>
          <span class="doc-status status-received">FILED</span>
        </div>

        <div class="bill-meta-row">
          <span>FORM BOS-17</span>
          <span>RECORD NO. BOS-${recordSuffix}</span>
        </div>

        <div class="bill-party-grid">
          <div class="bill-line"><span>Buyer (Transferee)</span><strong>${buyerName}</strong></div>
          <div class="bill-line"><span>Seller (Transferor)</span><strong>${sellerName}</strong></div>
          <div class="bill-line full"><span>Buyer Residence Address</span><strong>${buyerAddress}</strong></div>
        </div>

        <div class="bill-vehicle-grid">
          <div class="bill-line"><span>Vehicle Identification Number</span><strong>${vin}</strong></div>
          <div class="bill-line"><span>Vehicle Description</span><strong>${vehicleLabel}</strong></div>
          <div class="bill-line"><span>Sale Amount</span><strong>${salePrice}</strong></div>
          <div class="bill-line"><span>Odometer Reading at Transfer</span><strong>${odometerReading}</strong></div>
          <div class="bill-line"><span>Date of Sale</span><strong>${saleDate}</strong></div>
          <div class="bill-line"><span>City of Sale</span><strong>${saleCity}</strong></div>
        </div>

        <p class="bill-cert">The seller certifies that the above vehicle is transferred to the buyer for the amount shown and that all information entered is true and complete to the best of their knowledge.</p>

        <div class="bill-signatures">
          <div class="bill-signature-line"><span>Seller Signature</span><strong>${sellerName}</strong></div>
          <div class="bill-signature-line"><span>Buyer Signature</span><strong>${buyerName}</strong></div>
          <div class="bill-signature-line"><span>Date Signed</span><strong>${saleDate}</strong></div>
        </div>
      </div>`;
  },

  insuranceCard: ({ person, vehicle, policy, dateValue }) => {
      const insuredName = fallbackValue(person.name, 'Insured on file');
    const provider = policy.provider || 'General Mutual';
      const policyNumber = fallbackValue(policy.policyNumber, 'POL-ONFILE');
    const effectiveDate = DateFormatters.usShort(dateValue);
    const expirationDate = DateFormatters.usShort(policy.expDate);
    const vehicleLabel = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Vehicle on file';
      const vin = fallbackValue(vehicle.vin, 'Pending verification');
    const naic = String(provider)
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, 'X');

    return `
      <div class="doc-detail workspace-insurance-card">
        <div class="insurance-header-band">
          <div class="insurance-provider">${provider}</div>
          <div class="insurance-card-label">ID CARD</div>
        </div>

        <div class="insurance-policy-row">
          <span>POLICY NO.</span>
          <strong>${policyNumber}</strong>
        </div>

        <div class="insurance-grid">
          <div class="insurance-block">
            <span>INSURED</span>
            <strong>${insuredName}</strong>
          </div>
          <div class="insurance-block">
            <span>NAIC</span>
            <strong>${naic}-102</strong>
          </div>
          <div class="insurance-block">
            <span>EFFECTIVE</span>
            <strong>${effectiveDate}</strong>
          </div>
          <div class="insurance-block">
            <span>EXPIRES</span>
            <strong>${expirationDate}</strong>
          </div>
        </div>

        <div class="insurance-vehicle-row">
          <span>AUTO</span>
          <strong>${vehicleLabel}</strong>
        </div>

        <div class="insurance-vehicle-row compact">
          <span>VIN</span>
          <strong>${vin}</strong>
        </div>

        <div class="insurance-footer">Carry this card in vehicle at all times.</div>
      </div>`;
  },

  socialSecurityCard: ({ person, documentData = {} }) => {
    const holderName = fallbackValue(person.name, 'Card holder on file');
    const maskedSsn = normalizeSyntheticSsnLabel(documentData.ssn || person.ssn || 'XXX-XX-X000');
    const issueCode = `SSA-${DateFormatters.usShort(documentData.issueDate || new Date()).replace(/\//g, '')}`;

    return `
      <div class="doc-detail workspace-ssn-card">
        <div class="ssn-pattern" aria-hidden="true"></div>
        <div class="ssn-watermark" aria-hidden="true">SOCIAL SECURITY</div>
        <div class="ssn-header">SOCIAL SECURITY ADMINISTRATION</div>
        <h4>SOCIAL SECURITY CARD</h4>
        <div class="ssn-holder-line"><span>NAME</span><strong>${holderName}</strong></div>
        <div class="ssn-number">${maskedSsn}</div>
        <div class="ssn-issue-code">ISSUED UNDER AUTHORITY CODE ${issueCode}</div>
        <div class="ssn-footer">FOR SOCIAL SECURITY PURPOSES - NOT FOR IDENTIFICATION</div>
      </div>`;
  },

  registrationCard: ({ person, vehicle, dateValue, documentData = {} }) => {
    const ownerName = fallbackValue(person.name, 'Registered owner');
    const address = fallbackValue(person.address, 'Address on file');
    const plate = fallbackValue(documentData.plateNumber, 'PLATE ON FILE');
    const vin = fallbackValue(vehicle.vin, 'Pending verification');
    const vehicleYear = fallbackValue(documentData.vehicleYear || vehicle.year, String(new Date().getFullYear()));
    const makeModel = fallbackValue(`${vehicle.make || ''} ${vehicle.model || ''}`.trim(), 'Vehicle on file');
    const issueDate = DateFormatters.monthName(dateValue);

    return `
      <div class="doc-detail workspace-registration-card">
        <div class="registration-head">
          <div>
            <div class="registration-agency">STATE DMV</div>
            <h4>VEHICLE REGISTRATION CARD</h4>
          </div>
          <div class="registration-plate">${plate}</div>
        </div>
        <div class="registration-line"><span>REGISTERED OWNER</span><strong>${ownerName}</strong></div>
        <div class="registration-line"><span>RESIDENCE</span><strong>${address}</strong></div>
        <div class="registration-grid">
          <div class="registration-cell"><span>YEAR</span><strong>${vehicleYear}</strong></div>
          <div class="registration-cell"><span>MAKE / MODEL</span><strong>${makeModel}</strong></div>
          <div class="registration-cell full"><span>VIN</span><strong>${vin}</strong></div>
        </div>
        <div class="registration-issued">ISSUED: <strong>${issueDate}</strong></div>
      </div>`;
  },

  courtOrder: ({ person, dateValue, documentData = {} }) => {
    const subjectName = fallbackValue(person.name, 'Subject on file');
    const orderType = fallbackValue(documentData.orderType, 'Court Order');
    const caseNumber = fallbackValue(documentData.caseNumber, 'CO-0000-0000');
    const judge = fallbackValue(documentData.judge, 'Hon. Presiding Judge');
    const oldName = fallbackValue(documentData.oldName, 'Not specified');
    const newName = fallbackValue(documentData.newName, 'Not specified');
    const filedDate = DateFormatters.monthName(dateValue);
    const showNameChangeFields = String(orderType).trim().toLowerCase() === 'name change';
    const nameChangeLines = showNameChangeFields ? `
      <div class="court-line"><span>PRIOR LEGAL NAME</span><strong>${oldName}</strong></div>
      <div class="court-line"><span>NEW LEGAL NAME</span><strong>${newName}</strong></div>
    ` : '';

    return `
      <div class="doc-detail workspace-court-order">
        <div class="court-header">
          <div class="court-label">SUPERIOR COURT ORDER</div>
          <h4>${orderType.toUpperCase()}</h4>
        </div>
        <div class="court-line"><span>CASE NUMBER</span><strong>${caseNumber}</strong></div>
        <div class="court-line"><span>SUBJECT</span><strong>${subjectName}</strong></div>
        <div class="court-line"><span>PRESIDING JUDGE</span><strong>${judge}</strong></div>
        ${nameChangeLines}
        <div class="court-body">This certified order is issued under authority of the court and is effective immediately unless stayed by subsequent order.</div>
        <div class="court-signoff">
          <span>FILED DATE: <strong>${filedDate}</strong></span>
          <span class="court-seal" aria-hidden="true">CERTIFIED COPY</span>
        </div>
      </div>`;
  },

  parentalConsent: ({ person, dateValue, documentData = {} }) => {
    const minorName = fallbackValue(person.name, 'Minor applicant');
    const parentName = fallbackValue(documentData.parentName, 'Parent/Guardian on file');
    const notarized = documentData.notarized ? 'YES' : 'NO';
    const signedDate = DateFormatters.monthName(dateValue);

    return `
      <div class="doc-detail workspace-parental-consent">
        <div class="consent-header">
          <div class="consent-agency">DEPARTMENT OF MOTOR VEHICLES</div>
          <h4>PARENTAL CONSENT STATEMENT</h4>
        </div>
        <div class="consent-line"><span>MINOR APPLICANT</span><strong>${minorName}</strong></div>
        <div class="consent-line"><span>PARENT / LEGAL GUARDIAN</span><strong>${parentName}</strong></div>
        <div class="consent-line split">
          <span><span>NOTARIZED</span><strong>${notarized}</strong></span>
          <span><span>DATE SIGNED</span><strong>${signedDate}</strong></span>
        </div>
        <div class="consent-attest">I affirm that I am the lawful parent or guardian and consent to the named minor applicant obtaining DMV services requested.</div>
      </div>`;
  },

  leaseAgreement: ({ person, dateValue, documentData = {} }) => {
    const tenantName = fallbackValue(person.name, 'Tenant on file');
    const leaseId = fallbackValue(documentData.leaseId, 'LA-0000-00000');
    const serviceAddress = fallbackValue(documentData.address || person.address, 'Property address on file');
    const landlordName = fallbackValue(documentData.landlordName, 'Landlord on file');
    const managerName = fallbackValue(documentData.managementCompany, 'Property manager on file');
    const unitNumber = fallbackValue(documentData.unitNumber, 'N/A');
    const leaseStart = DateFormatters.monthName(documentData.leaseStartDate || dateValue);
    const leaseEnd = DateFormatters.monthName(documentData.leaseEndDate || documentData.expirationDate || dateValue);
    const signedDate = DateFormatters.monthName(documentData.dateOnDocument || dateValue);
    const monthlyRent = formatCurrency(documentData.monthlyRent);
    const deposit = formatCurrency(documentData.securityDeposit);
    const dueDay = fallbackValue(documentData.paymentDueDay, '1');
    const tenantCount = fallbackValue(documentData.tenantCount, '1');
    const notarized = documentData.notarized ? 'NOTARIZED' : 'NOTARY NOT REQUIRED';

    return `
      <div class="doc-detail workspace-lease-agreement">
        <div class="lease-head">
          <div>
            <div class="lease-agency">Residential Tenancy Contract</div>
            <h4>LEASE AGREEMENT</h4>
          </div>
          <div class="lease-id-block">
            <span>LEASE ID</span>
            <strong>${leaseId}</strong>
          </div>
        </div>

        <div class="lease-line"><span>TENANT</span><strong>${tenantName}</strong></div>
        <div class="lease-line"><span>LANDLORD</span><strong>${landlordName}</strong></div>
        <div class="lease-line"><span>PROPERTY MANAGER</span><strong>${managerName}</strong></div>
        <div class="lease-line"><span>RENTAL ADDRESS</span><strong>${serviceAddress}</strong></div>

        <div class="lease-grid">
          <div class="lease-cell"><span>UNIT</span><strong>${unitNumber}</strong></div>
          <div class="lease-cell"><span>OCCUPANTS</span><strong>${tenantCount}</strong></div>
          <div class="lease-cell"><span>MONTHLY RENT</span><strong>${monthlyRent}</strong></div>
          <div class="lease-cell"><span>SECURITY DEPOSIT</span><strong>${deposit}</strong></div>
          <div class="lease-cell"><span>DUE DAY</span><strong>${dueDay}</strong></div>
          <div class="lease-cell"><span>TERM</span><strong>${leaseStart} - ${leaseEnd}</strong></div>
        </div>

        <div class="lease-attest">
          The tenant agrees to maintain residency at the listed premises and remit rent on the payment schedule established by this contract.
        </div>

        <div class="lease-signoff">
          <span>EXECUTED: <strong>${signedDate}</strong></span>
          <span class="lease-notary">${notarized}</span>
        </div>
      </div>`;
  },

  utilityBill: ({ person, dateValue, documentData = {} }) => {
    const accountHolder = fallbackValue(person.name, 'Account holder on file');
    const serviceAddress = fallbackValue(person.address, 'Service address on file');
    const billType = fallbackValue(documentData.documentType, 'Utility Statement');
    const statementDate = DateFormatters.monthName(documentData.dateOnDocument || dateValue);

    return `
      <div class="doc-detail workspace-utility-bill">
        <div class="utility-head">
          <div>
            <div class="utility-provider">METRO CIVIC UTILITIES</div>
            <h4>${billType.toUpperCase()}</h4>
          </div>
          <div class="utility-status">ADDRESS PROOF</div>
        </div>
        <div class="utility-line"><span>ACCOUNT HOLDER</span><strong>${accountHolder}</strong></div>
        <div class="utility-line"><span>SERVICE ADDRESS</span><strong>${serviceAddress}</strong></div>
        <div class="utility-line"><span>STATEMENT DATE</span><strong>${statementDate}</strong></div>
      </div>`;
  },

  bankStatement: ({ person, dateValue, documentData = {} }) => {
    const accountHolder = fallbackValue(person.name, 'Account holder on file');
    const serviceAddress = fallbackValue(person.address, 'Address on file');
    const institutionName = fallbackValue(documentData.institutionName, 'Bank on file');
    const accountLast4 = fallbackValue(documentData.accountLast4, '0000');
    const periodStart = DateFormatters.monthName(documentData.statementPeriodStart || dateValue);
    const periodEnd = DateFormatters.monthName(documentData.statementPeriodEnd || documentData.dateOnDocument || dateValue);
    const openingBalance = formatCurrency(documentData.openingBalance);
    const closingBalance = formatCurrency(documentData.closingBalance);
    const transactionCount = fallbackValue(documentData.transactionCount, '0');

    return `
      <div class="doc-detail workspace-bank-statement">
        <div class="bank-head">
          <div>
            <div class="bank-institution">${institutionName}</div>
            <h4>Account Statement</h4>
            <div class="bank-account">Account ending ${accountLast4}</div>
          </div>
          <div class="bank-proof">ADDRESS RECORD</div>
        </div>

        <div class="bank-line"><span>Account holder</span><strong>${accountHolder}</strong></div>
        <div class="bank-line"><span>Mailing address</span><strong>${serviceAddress}</strong></div>
        <div class="bank-line"><span>Statement period</span><strong>${periodStart} - ${periodEnd}</strong></div>

        <div class="bank-grid">
          <div class="bank-cell"><span>Opening balance</span><strong>${openingBalance}</strong></div>
          <div class="bank-cell"><span>Closing balance</span><strong>${closingBalance}</strong></div>
          <div class="bank-cell full"><span>Posted transactions</span><strong>${transactionCount}</strong></div>
        </div>
      </div>`;
  },

  taxReturn: ({ person, dateValue, documentData = {} }) => {
    const taxpayerName = fallbackValue(person.name, 'Taxpayer on file');
    const taxpayerAddress = fallbackValue(person.address, 'Address on file');
    const taxYear = fallbackValue(documentData.taxYear, new Date().getFullYear() - 1);
    const formId = fallbackValue(documentData.formId, '1040');
    const filingStatus = fallbackValue(documentData.filingStatus, 'Single');
    const agi = formatCurrency(documentData.adjustedGrossIncome);
    const taxableIncome = formatCurrency(documentData.taxableIncome);
    const accountAdjustment = Number(documentData.accountAdjustment);
    const settlementLabel = Number.isFinite(accountAdjustment)
      ? (accountAdjustment >= 0 ? `Refund: ${formatCurrency(accountAdjustment)}` : `Amount You Owe: ${formatCurrency(Math.abs(accountAdjustment))}`)
      : 'Refund / Amount Due: On file';
    const controlNumber = fallbackValue(documentData.returnControlNumber, `TR-${taxYear}-000000`);
    const preparerId = fallbackValue(documentData.preparerId, 'PTIN-ONFILE');
    const signedDate = DateFormatters.monthName(documentData.dateOnDocument || dateValue);

    return `
      <div class="doc-detail workspace-tax-return">
        <div class="tax-head">
          <div>
            <div class="tax-agency">Department of Treasury - Internal Revenue Service</div>
            <h4>U.S. Individual Income Tax Return</h4>
            <div class="tax-subhead">Form ${formId} | Tax Year ${taxYear}</div>
          </div>
          <div class="tax-control">${controlNumber}</div>
        </div>

        <div class="tax-line"><span>Taxpayer name</span><strong>${taxpayerName}</strong></div>
        <div class="tax-line"><span>Home address</span><strong>${taxpayerAddress}</strong></div>
        <div class="tax-line"><span>Filing status</span><strong>${filingStatus}</strong></div>

        <div class="tax-grid">
          <div class="tax-cell"><span>Adjusted gross income</span><strong>${agi}</strong></div>
          <div class="tax-cell"><span>Taxable income</span><strong>${taxableIncome}</strong></div>
          <div class="tax-cell full"><span>Account summary</span><strong>${settlementLabel}</strong></div>
        </div>

        <div class="tax-signoff">
          <span>Preparer PTIN: <strong>${preparerId}</strong></span>
          <span>Date signed: <strong>${signedDate}</strong></span>
        </div>
      </div>`;
  },

  genericGovRecord: ({ person, dateValue, documentData = {} }) => {
    const docType = fallbackValue(documentData.docType, 'Government Record');
    const docTitle = titleCaseFromKey(docType).toUpperCase();
    const holderName = fallbackValue(documentData.holderName || documentData.fullName || person.name, 'Name on file');
    const issuedDate = DateFormatters.monthName(documentData.dateIssued || dateValue);
    const recordCode = `REC-${String(docType).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'GEN'}-${String(issuedDate).replace(/[^0-9]/g, '').slice(-4) || '0000'}`;

    return `
      <div class="doc-detail workspace-gov-record">
        <div class="record-head">
          <div class="record-agency">STATE RECORDS DIVISION</div>
          <h4>${docTitle}</h4>
          <div class="record-code">${recordCode}</div>
        </div>
        <div class="record-line"><span>NAME ON RECORD</span><strong>${holderName}</strong></div>
        ${genericFieldRows(documentData)}
        <div class="record-issued">ISSUED: <strong>${issuedDate}</strong></div>
      </div>`;
  },

  driversLicense: ({ person, policy, dateValue, documentData = {} }) => {
    const fullName = fallbackValue(person.name, 'Name on file');
    const rawLicenseId = (policy.policyNumber || '').trim();
    const normalizedLicenseId = rawLicenseId
      ? (rawLicenseId.toUpperCase().startsWith('DL') ? rawLicenseId : `DL${rawLicenseId}`)
      : 'DL-ONFILE';
    const initials = fullName
      .split(' ')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0].toUpperCase())
      .join('') || 'ID';
    const atlasPhoto = atlasMarkup(documentData.licensePhotoAsset, 'license-photo-atlas', 'License holder photo');
    const licensePhotoMarkup = atlasPhoto || (documentData.licensePhotoUrl
      ? `<img class="license-photo-image" src="${documentData.licensePhotoUrl}" alt="License holder photo">`
      : `<div class="license-photo-placeholder">${initials}</div>`);
    const dobLabel = DateFormatters.usShort(documentData.dob || person.dob);
    const addressLabel = fallbackValue(documentData.address || person.address, 'Address on file');
    const sexLabel = fallbackValue(documentData.sex, 'X');
    const eyeLabel = fallbackValue(documentData.eyeColor, 'Brown');
    const hairLabel = fallbackValue(documentData.hairColor, 'Brown');
    const donorLabel = fallbackValue(documentData.organDonor, 'Yes');
    const heightInches = Number(documentData.heightIn || 0);
    const heightLabel = Number.isFinite(heightInches) && heightInches > 0
      ? `${Math.floor(heightInches / 12)}'${String(heightInches % 12).padStart(2, '0')}"`
      : fallbackValue(documentData.height, `5'08"`);
    const weightLbs = Number(documentData.weightLbs || 0);
    const weightLabel = Number.isFinite(weightLbs) && weightLbs > 0
      ? `${weightLbs} lb`
      : fallbackValue(documentData.weight, '165 lb');
    const ssnLabel = normalizeSyntheticSsnLabel(documentData.ssn || person.ssn || 'XXX-XX-X000');
    const expLabel = DateFormatters.monthName(dateValue || policy.expDate);
    const categoryLabel = fallbackValue(documentData.category, 'C');
    const restrictionsLabel = fallbackValue(documentData.restrictions, 'None');
    const ertcLabel = fallbackValue(documentData.ertc, 'E0-00-R0-00-T0-00');
    const showForgeryHint = Boolean(documentData.showForgeryHint);
    const forged = Boolean(documentData.forged);
    const hintErrors = Array.isArray(documentData.errors) ? documentData.errors : [];
    const showTamperHints = showForgeryHint && forged;
    const hasError = (key) => showTamperHints && hintErrors.includes(key);
    const fieldSmudge = (key) => hasError(key) ? '<span class="license-field-smudge" aria-hidden="true"></span>' : '';
    const titleText = hasError('wrong_font') ? 'DRIVRE LICESNSE' : 'DRIVER LICENSE';
    const cardClasses = [
      'doc-detail',
      'workspace-license-card',
      'with-background-art',
      hasError('photo_mismatch') ? 'forgery-photo-peel' : '',
      hasError('ink_inconsistency') ? 'forgery-ink-smudge' : '',
      hasError('suspicious_seal') ? 'forgery-seal-missing' : '',
      hasError('altered_date') ? 'forgery-date-scratch' : ''
    ].filter(Boolean).join(' ');
    const expValueClass = hasError('altered_date') ? 'license-value exp-overwritten' : 'license-value';
    const tamperOverlay = hasError('ink_inconsistency')
      ? '<span class="license-ink-smudge" aria-hidden="true"></span>'
      : '';

    return `
      <div class="${cardClasses}">
        <div class="license-header-band">
          <div class="license-authority">STATE OF RED TAPE</div>
          <div class="license-class">CLASS ${categoryLabel}</div>
        </div>

        <div class="license-title-row">
          <h4>${titleText}</h4>
          <span class="license-id-number">${normalizedLicenseId}</span>
        </div>

        <div class="license-grid">
          <div class="license-photo-block" aria-hidden="true">
            ${licensePhotoMarkup}
          </div>

          <div class="license-fields-block">
            <div class="license-line"><span class="license-key">NAME</span><span class="license-value${hasError('name_mismatch') ? ' tampered-field' : ''}">${fullName}${fieldSmudge('name_mismatch')}</span></div>
            <div class="license-line"><span class="license-key">DOB</span><span class="license-value">${dobLabel}</span></div>
            <div class="license-line"><span class="license-key">ADDRESS</span><span class="license-value${hasError('wrong_address') ? ' tampered-field' : ''}">${addressLabel}${fieldSmudge('wrong_address')}</span></div>
            <div class="license-line split"><span><span class="license-key">SEX</span><span class="license-value">${sexLabel}</span></span><span><span class="license-key">EYES</span><span class="license-value">${eyeLabel}</span></span></div>
            <div class="license-line split"><span><span class="license-key">HAIR</span><span class="license-value${hasError('physical_mismatch') ? ' tampered-field' : ''}">${hairLabel}${fieldSmudge('physical_mismatch')}</span></span><span><span class="license-key">DONOR</span><span class="license-value">${donorLabel}</span></span></div>
            <div class="license-line split"><span><span class="license-key">HGT</span><span class="license-value">${heightLabel}</span></span><span><span class="license-key">WGT</span><span class="license-value">${weightLabel}</span></span></div>
            <div class="license-line"><span class="license-key">SSN</span><span class="license-value">${ssnLabel}</span></div>
            <div class="license-line split"><span><span class="license-key">RSTR</span><span class="license-value">${restrictionsLabel}</span></span><span><span class="license-key">ERTC</span><span class="license-value">${ertcLabel}</span></span></div>
            <div class="license-line split"><span><span class="license-key">ISS</span><span class="license-value">STATE DMV</span></span><span><span class="license-key">EXP</span><span class="${expValueClass}">${expLabel}${fieldSmudge('altered_date')}</span></span></div>
          </div>
        </div>

        ${tamperOverlay}

        <div class="license-footer">
          <div class="license-signature">
            <span class="license-key">SIGNATURE</span>
            <span class="license-script">${fullName}</span>
          </div>
          <div class="license-barcode" aria-hidden="true">||| |||| ||| || |||| |||</div>
        </div>
      </div>`;
  }
};
