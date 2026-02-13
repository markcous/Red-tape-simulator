export class PersonData {
  constructor({ name = '', dob = '', address = '' } = {}) {
    this.name = name;
    this.dob = dob;
    this.address = address;
  }
}

export class VehicleData {
  constructor({ vin = '', make = '', model = '', year = '' } = {}) {
    this.vin = vin;
    this.make = make;
    this.model = model;
    this.year = year;
  }
}

export class PolicyData {
  constructor({ policyNumber = '', provider = '', expDate = '' } = {}) {
    this.policyNumber = policyNumber;
    this.provider = provider;
    this.expDate = expDate;
  }
}

export const DateFormatters = {
  usShort: (value) => value || 'N/A',
  monthName: (value) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  iso: (value) => value || 'N/A'
};
