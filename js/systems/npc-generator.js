import { NPC, Flag } from '../models/npc.js';
import { SeededRNG } from '../models/rng.js';

export class NPCGenerator {
  constructor(catalogs, balancing, photoLibrary = { photos: [] }) {
    this.catalogs = catalogs;
    this.balancing = balancing;
    this.photoLibrary = photoLibrary;
    this.globalSeed = Date.now();
    this.generationCount = 0;
  }

  setGlobalSeed(seed) {
    this.globalSeed = seed;
  }

  generate(constraints = {}) {
    this.generationCount++;
    const seed = constraints.seed || (this.globalSeed + this.generationCount * 7919);
    const rng = new SeededRNG(seed);

    // Pick archetype
    const archetype = constraints.archetype
      ? this.catalogs.archetypes.find(a => a.id === constraints.archetype)
      : this.pickArchetype(rng);

    // Generate identity
    const identity = this.generateIdentity(rng, archetype);

    // Generate appearance
    const appearance = this.generateAppearance(rng, archetype, identity);

    // Generate personality from archetype
    const personality = this.generatePersonality(rng, archetype);

    // Socioeconomic
    const socioEconomic = this.generateSocioEconomic(rng, archetype);

    // Build NPC
    const npc = new NPC({
      npcId: `npc_${seed.toString(16).padStart(6, '0').slice(0, 6)}`,
      identity,
      appearance,
      personality,
      socioEconomic,
      archetype: archetype.id,
      reputation: { towardPlayer: 0, towardAgency: rng.nextInt(-10, 10) },
      flags: [],
      routing: {
        nextEligibleDepts: constraints.dept ? [constraints.dept] : ['DMV'],
        cooldowns: {}
      },
      rng: { masterSeed: seed, lastUpdatedShift: 0 }
    });

    // Apply baseline flags based on archetype
    this.applyBaselineFlags(rng, npc, archetype);

    return npc;
  }

  pickArchetype(rng) {
    const weights = this.balancing.difficulty.archetypeWeights;
    const id = rng.pickWeighted(weights);
    return this.catalogs.archetypes.find(a => a.id === id)
      || this.catalogs.archetypes[0];
  }

  generateIdentity(rng, archetype) {
    const age = rng.nextInt(archetype.ageRange[0], archetype.ageRange[1]);
    const birthYear = new Date().getFullYear() - age;
    const birthMonth = rng.nextInt(1, 12);
    const birthDay = rng.nextInt(1, 28);
    const dob = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    const firstName = rng.pick(this.catalogs.names.first);
    const lastName = rng.pick(this.catalogs.names.last);
    const ssnArea = rng.nextInt(100, 899);
    const ssnGroup = rng.nextInt(10, 99);
    const ssnSerial = rng.nextInt(1000, 9999);
    const ssn = `${ssnArea}-${ssnGroup}-${ssnSerial}`;
    const address = rng.pick(this.catalogs.addresses);
    const phone = `555-${rng.nextInt(100, 999).toString().padStart(3, '0')}-${rng.nextInt(1000, 9999)}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
    const sex = rng.pick(['F', 'M', 'X']);
    const heightIn = rng.nextInt(58, 78);
    const weightLbs = rng.nextInt(105, 295);
    const eyeColor = rng.pick(['Brown', 'Hazel', 'Blue', 'Green', 'Gray']);
    const organDonor = rng.chance(0.58);

    return {
      firstName,
      lastName,
      dob,
      age,
      sex,
      heightIn,
      weightLbs,
      eyeColor,
      organDonor,
      ssn,
      ssnMasked: `XXX-XX-${String(ssnSerial).padStart(4, '0')}`,
      address,
      phone,
      email
    };
  }

  generateAppearance(rng, archetype, identity) {
    const traits = this.catalogs.personalityTraits;
    const bodyType = rng.pick(traits.bodyTypes);
    const hairStyle = rng.pick(traits.hairStyles);

    // Hair color biased by age
    let hairColor;
    if (identity.age > 65 && rng.chance(0.6)) {
      hairColor = rng.pick(['gray', 'white']);
    } else {
      hairColor = rng.pick(traits.hairColors);
    }

    const numAccessories = rng.nextInt(0, 2);
    const accessories = [];
    for (let i = 0; i < numAccessories; i++) {
      const acc = rng.pick(traits.accessories);
      if (!accessories.includes(acc)) accessories.push(acc);
    }
    if (identity.age > 55 && rng.chance(0.5) && !accessories.includes('glasses')) {
      accessories.push('glasses');
    }

    return {
      bodyType,
      hair: { style: hairStyle, color: hairColor },
      eyeColor: identity.eyeColor,
      facialHair: rng.chance(0.3) ? rng.pick(['stubble', 'beard', 'mustache', 'goatee']) : null,
      accessories,
      portraitSeed: rng.nextInt(0, 999999),
      photoId: this.pickPhotoId(rng, {
        age: identity.age,
        hairStyle,
        hairColor,
        accessories
      })
    };
  }

  pickPhotoId(rng, traits = {}) {
    const photos = Array.isArray(this.photoLibrary?.photos) ? this.photoLibrary.photos : [];
    if (photos.length === 0) return null;

    const desiredAgeBand = this.toAgeBand(traits.age);
    const accessories = Array.isArray(traits.accessories) ? traits.accessories : [];

    const scored = photos.map((entry) => {
      const tags = entry?.tags || {};
      let score = 0;
      if (tags.ageBand && tags.ageBand === desiredAgeBand) score += 3;
      if (tags.hairStyle && tags.hairStyle === traits.hairStyle) score += 2;
      if (tags.hairColor && tags.hairColor === traits.hairColor) score += 2;

      const taggedAccessories = Array.isArray(tags.accessories) ? tags.accessories : [];
      const matchingAccessories = taggedAccessories.filter(acc => accessories.includes(acc)).length;
      score += matchingAccessories;

      return { id: entry.id, score };
    });

    const bestScore = Math.max(...scored.map(item => item.score));
    const best = scored.filter(item => item.score === bestScore);
    return rng.pick(best).id;
  }

  toAgeBand(age) {
    if (age <= 17) return '16-17';
    if (age <= 24) return '18-24';
    if (age <= 34) return '25-34';
    if (age <= 44) return '35-44';
    if (age <= 54) return '45-54';
    if (age <= 64) return '55-64';
    return '65+';
  }

  generatePersonality(rng, archetype) {
    const temperament = rng.pickWeighted(archetype.temperamentWeights);
    const patience = rng.nextInt(archetype.patience[0], archetype.patience[1]);
    const honesty = rng.nextInt(archetype.honesty[0], archetype.honesty[1]);
    const compliance = rng.nextInt(archetype.compliance[0], archetype.compliance[1]);
    const persuasion = rng.nextInt(archetype.persuasion[0], archetype.persuasion[1]);

    return { temperament, patience, honesty, compliance, persuasion };
  }

  generateSocioEconomic(rng, archetype) {
    const brackets = ['low', 'mid', 'high'];
    const statuses = ['unemployed', 'employed', 'contractor', 'student', 'retired'];

    let incomeBracket = rng.pick(brackets);
    let employmentStatus = rng.pick(statuses);

    // Archetype-specific adjustments
    if (archetype.id === 'teen_driver') {
      employmentStatus = rng.pick(['student', 'unemployed']);
      incomeBracket = 'low';
    } else if (archetype.id === 'elderly_driver') {
      employmentStatus = rng.chance(0.7) ? 'retired' : 'employed';
    } else if (archetype.id === 'vip_insider') {
      incomeBracket = rng.chance(0.7) ? 'high' : 'mid';
    }

    return {
      incomeBracket,
      employmentStatus,
      householdSize: rng.nextInt(1, 6)
    };
  }

  applyBaselineFlags(rng, npc, archetype) {
    // Chronic procrastinator likely has unpaid tickets or expired registration
    if (archetype.id === 'chronic_procrastinator') {
      if (rng.chance(0.5)) {
        npc.addFlag(new Flag('UNPAID_TICKETS', 'med', 'Parking', 0, {
          count: rng.nextInt(1, 4),
          amountDue: rng.nextInt(50, 300)
        }));
      }
      if (rng.chance(0.4)) {
        npc.addFlag(new Flag('EXPIRED_REGISTRATION', 'low', 'DMV', 0, {}));
      }
    }

    // Shady applicant might have fraud alert
    if (archetype.id === 'shady_applicant') {
      if (rng.chance(0.2)) {
        npc.addFlag(new Flag('FRAUD_ALERT', 'high', 'DMV', 0, {}));
      }
    }

    // Elderly might need vision test
    if (archetype.id === 'elderly_driver') {
      if (rng.chance(0.6)) {
        npc.addFlag(new Flag('VISION_TEST_REQUIRED', 'low', 'DMV', 0, {}));
      }
    }

    // Random chance for any NPC to have insurance issues
    if (rng.chance(0.1)) {
      npc.addFlag(new Flag('INSURANCE_LAPSE', 'med', 'DMV', 0, {}));
    }
  }

  // Generate a batch of NPCs for a shift queue
  generateShiftQueue(count, dept = 'DMV', existingNpcs = []) {
    const queue = [];
    const returningCount = Math.floor(count * this.balancing.recurrence.returningNpcPerShift);
    const maxReturning = Math.min(returningCount, this.balancing.recurrence.maxRegularsPerShift, existingNpcs.length);

    // Add returning NPCs
    const rng = new SeededRNG(this.globalSeed + this.generationCount);
    const shuffledExisting = rng.shuffle(existingNpcs);
    for (let i = 0; i < maxReturning; i++) {
      const returning = shuffledExisting[i];
      returning.isReturning = true;
      queue.push(returning);
    }

    // Fill remaining with fresh NPCs
    const remaining = count - queue.length;
    for (let i = 0; i < remaining; i++) {
      queue.push(this.generate({ dept }));
    }

    return rng.shuffle(queue);
  }
}
