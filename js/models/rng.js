// Deterministic seeded RNG (Mulberry32)
// Given the same seed, produces the same sequence of numbers
export class SeededRNG {
  constructor(seed) {
    this.seed = seed;
    this.state = seed;
  }

  // Returns float [0, 1)
  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in range [min, max] inclusive
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Returns float in range [min, max)
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  // Pick a random element from an array
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  // Pick with weighted probabilities { item: weight }
  pickWeighted(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [item, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  // Shuffle array (Fisher-Yates)
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Returns true with given probability [0, 1]
  chance(probability) {
    return this.next() < probability;
  }
}
