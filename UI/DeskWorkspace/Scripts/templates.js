import { DateFormatters } from './document-data.js';

const field = (label, value) => `<div class="doc-field"><span class="field-label">${label}:</span><span class="field-value">${value || 'N/A'}</span></div>`;

export const DeskDocumentTemplates = {
  title: ({ person, vehicle }) => `
    <div class="doc-detail template-title">
      <div class="doc-header"><h4>Vehicle Title</h4><span class="doc-status status-received">TITLE</span></div>
      ${field('Owner', person.name)}
      ${field('Address', person.address)}
      ${field('VIN', vehicle.vin)}
      ${field('Make / Model', `${vehicle.make} ${vehicle.model}`.trim())}
      ${field('Year', vehicle.year)}
    </div>`,

  billOfSale: ({ person, vehicle, dateValue }) => `
    <div class="doc-detail template-bill">
      <div class="doc-header"><h4>Bill of Sale</h4><span class="doc-status status-received">FILED</span></div>
      ${field('Buyer', person.name)}
      ${field('Buyer Residence', person.address)}
      ${field('Vehicle Serial', vehicle.vin)}
      ${field('Auto', `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim())}
      ${field('Sale Date', DateFormatters.monthName(dateValue))}
    </div>`,

  insuranceCard: ({ person, vehicle, policy }) => `
    <div class="doc-detail template-insurance">
      <div class="doc-header"><h4>Insurance Card</h4><span class="doc-status status-received">ACTIVE</span></div>
      ${field('Insured', person.name)}
      ${field('Provider', policy.provider)}
      ${field('Policy #', policy.policyNumber)}
      ${field('Covered Auto VIN', vehicle.vin)}
      ${field('Exp', DateFormatters.usShort(policy.expDate))}
    </div>`,

  utilityBill: ({ person, dateValue }) => `
    <div class="doc-detail template-utility">
      <div class="doc-header"><h4>Utility Bill</h4><span class="doc-status status-review">PROOF OF ADDRESS</span></div>
      ${field('Account Holder', person.name)}
      ${field('Service Address', person.address)}
      ${field('Statement Date', DateFormatters.iso(dateValue))}
    </div>`,

  driversLicense: ({ person, policy, dateValue }) => `
    <div class="doc-detail license-card workspace-license-card">
      <div class="license-banner">STATE DMV</div>
      <div class="license-main">
        <div class="license-photo">👤</div>
        <div class="license-text">
          ${field('NAME', person.name)}
          ${field('DOB', DateFormatters.usShort(person.dob))}
          ${field('ADDRESS', person.address)}
          ${field('ID', policy.policyNumber || 'N/A')}
          ${field('EXP', DateFormatters.monthName(dateValue || policy.expDate))}
        </div>
      </div>
    </div>`
};
