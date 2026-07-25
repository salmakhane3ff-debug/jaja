/**
 * src/lib/fakeOrderData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, dependency-free data + helpers for generating realistic Moroccan
 * customer identities on fake orders. No DB, no side effects — trivially unit
 * testable. This is DATA (names/cities) + formatting, never business logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Gender-neutral pool is fine here — a fake order's "customer" is not an affiliate.
export const MA_FIRST_NAMES = [
  'Youssef', 'Hamza', 'Omar', 'Amine', 'Karim', 'Mehdi', 'Rachid', 'Samir',
  'Nabil', 'Khalid', 'Hassan', 'Bilal', 'Hicham', 'Soufiane', 'Adil', 'Zakaria',
  'Ismail', 'Younes', 'Ayoub', 'Walid', 'Othmane', 'Reda', 'Sara', 'Nadia',
  'Fatima', 'Samira', 'Leila', 'Meryem', 'Houda', 'Zineb', 'Hajar', 'Imane',
  'Chaimae', 'Yasmina', 'Sanaa', 'Karima', 'Siham', 'Asmaa', 'Nawal', 'Salma',
];

export const MA_LAST_NAMES = [
  'Benaissa', 'El Amrani', 'Chaabi', 'Benali', 'Ouarrach', 'Bennis', 'Filali',
  'Berrada', 'Essaidi', 'Lazrak', 'Tahiri', 'Ziani', 'Bennani', 'Alaoui',
  'Skali', 'Chraibi', 'Benkirane', 'Tazi', 'Hajji', 'Fassi', 'Mansouri',
  'Sentissi', 'Kadiri', 'Idrissi', 'Sebti', 'Belhaj', 'Naciri', 'Ouazzani',
];

// Major Moroccan cities (matches the store's typical shipping destinations).
export const MA_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès',
  'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Nador', 'Mohammedia', 'El Jadida',
  'Béni Mellal', 'Safi', 'Khouribga', 'Settat', 'Berrechid', 'Taza',
];

// Real Moroccan mobile prefixes (Maroc Telecom / Orange / Inwi ranges).
const MA_MOBILE_PREFIXES = ['061', '062', '063', '064', '065', '066', '067', '068', '070', '071', '072', '073', '077', '078'];

const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max, rng = Math.random) => Math.floor(rng() * (max - min + 1)) + min;

/** A realistic Moroccan mobile number, e.g. "0612345678". */
export function randomMoroccanPhone(rng = Math.random) {
  const prefix = pick(MA_MOBILE_PREFIXES, rng);
  let rest = '';
  for (let i = 0; i < 7; i++) rest += randInt(0, 9, rng);
  return prefix + rest;
}

/** A random Moroccan full name, e.g. "Sara Alaoui". */
export function randomMoroccanName(rng = Math.random) {
  return `${pick(MA_FIRST_NAMES, rng)} ${pick(MA_LAST_NAMES, rng)}`;
}

export function randomMoroccanCity(rng = Math.random) {
  return pick(MA_CITIES, rng);
}

/**
 * A complete fake customer identity for one order.
 * @param {() => number} [rng]  injectable RNG for deterministic tests
 */
export function randomMoroccanCustomer(rng = Math.random) {
  const name = randomMoroccanName(rng);
  const city = randomMoroccanCity(rng);
  return {
    name,
    phone: randomMoroccanPhone(rng),
    city,
    shippingAddress: { city, address: { city } },
  };
}

export const _fakeOrderDataInternals = { pick, randInt };
