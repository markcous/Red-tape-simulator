const nonEmpty = (value, fallback) => {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  return normalized || fallback;
};

const parseDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export class PersonData {
  constructor({ name = '', dob = '', address = '' } = {}) {
    this.name = nonEmpty(name, 'Name on file');
    this.dob = nonEmpty(dob, new Date().toISOString().slice(0, 10));
    this.address = nonEmpty(address, 'Address on file');
  }
}

export class VehicleData {
  constructor({ vin = '', make = '', model = '', year = '' } = {}) {
    this.vin = nonEmpty(vin, 'Pending verification');
    this.make = nonEmpty(make, 'Make on file');
    this.model = nonEmpty(model, 'Model on file');
    this.year = nonEmpty(year, String(new Date().getFullYear()));
  }
}

export class PolicyData {
  constructor({ policyNumber = '', provider = '', expDate = '' } = {}) {
    this.policyNumber = nonEmpty(policyNumber, 'POL-ONFILE');
    this.provider = nonEmpty(provider, 'Carrier on file');
    this.expDate = nonEmpty(expDate, new Date().toISOString().slice(0, 10));
  }
}

export const DateFormatters = {
  usShort: (value) => parseDate(value).toLocaleDateString('en-US'),
  monthName: (value) => {
    const parsed = parseDate(value);
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  iso: (value) => parseDate(value).toISOString().slice(0, 10)
};
