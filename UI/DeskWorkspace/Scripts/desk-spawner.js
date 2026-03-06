import { DeskDocument } from './desk-document.js';

const mulberry32 = (a) => () => {
  let t = a += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

export class DeskSpawner {
  constructor(workspace, seed = 1337) {
    this.workspace = workspace;
    this.setSeed(seed);
  }

  setSeed(seed) {
    this.seed = Number(seed) || 1337;
    this.rand = mulberry32(this.seed);
  }

  pick(list) {
    return list[Math.floor(this.rand() * list.length)];
  }

  spawnCasePacket() {
    this.workspace.clear();

    const person = {
      name: this.pick(['Jordan Pike', 'Casey Romero', 'Avery Blake', 'Morgan Vega']),
      dob: this.pick(['1988-03-11', '1991-07-28', '1979-01-04']),
      address: this.pick(['22 Elm St, Redwood', '801 Pine Ave, Lakeside', '144 Harbor Way, Northview'])
    };

    const vehicle = {
      vin: this.pick(['1HGBH41JXMN109186', '1FDXF46S12EC46920', '2T1BURHE0KC218443']),
      make: this.pick(['Toyota', 'Ford', 'Honda']),
      model: this.pick(['Civic', 'Corolla', 'Focus']),
      year: this.pick(['2018', '2020', '2016'])
    };

    const policy = {
      policyNumber: `POL-${Math.floor(this.rand() * 900000 + 100000)}`,
      provider: this.pick(['Mutual Shield', 'Civic Guard', 'RoadSafe']),
      expDate: this.pick(['2027-12-01', '2026-06-19', '2028-02-14'])
    };

    const docs = [
      { id: 'application', template: 'title', sizePreset: 'Letter', stampTarget: true, y: 34, x: 120 },
      { id: 'bill-sale', template: 'billOfSale', sizePreset: 'Letter', y: 96, x: 220 },
      { id: 'ins-card', template: 'insuranceCard', sizePreset: 'WalletCard', y: 165, x: 380 },
      { id: 'utility', template: 'utilityBill', sizePreset: 'HalfSheet', y: 190, x: 170 },
      { id: 'license', template: 'driversLicense', sizePreset: 'WalletCard', y: 250, x: 420 }
    ];

    const packetDate = this.pick(['2024-01-02', '2024-02-17', '2024-03-03']);
    const billOfSaleData = {
      sellerName: this.pick(['Atlas Auto Sales', 'Northview Motors', 'Harborline Auto Group']),
      salePrice: Math.floor(this.rand() * 26000 + 4000),
      odometerReading: `${Math.floor(this.rand() * 110000 + 5000).toLocaleString('en-US')} miles`,
      saleCity: this.pick(['Redwood', 'Lakeside', 'Northview'])
    };

    docs.forEach((doc) => {
      this.workspace.addItem(new DeskDocument(this.workspace, {
        ...doc,
        rotation: this.workspace.randomBetween(-3, 3),
        data: {
          person,
          vehicle,
          policy,
          dateValue: packetDate,
          documentData: doc.template === 'billOfSale' ? billOfSaleData : {}
        }
      }));
    });
  }
}
