/* =============================================================================
 * Oh Jee!! — J/88 race data
 * All numbers are sourced from published J/88 one-design references.
 *  - Tuning: Quantum Sails J/88 Quick Tune Chart (turns-from-base + Loos PT-2),
 *            cross-checked vs North Sails J/88 Tuning Guide (Vince Brun).
 *  - Polars: Official ORC Speed Guide for the J/88 (VPP 2013), "Best Performance".
 *  - Tactics: North Sails / Quantum J/88 articles, class association, forums.
 * See SOURCES at the bottom of this file for URLs.
 * ===========================================================================*/

/* ---------------------------------------------------------------------------
 * POLAR — optimum beat (upwind) and run (downwind) VMG points per true wind
 * speed, straight from the ORC Speed Guide "Best Performance" table.
 *   upTWA  optimal upwind true wind angle (deg off the wind)
 *   upBSP  boat speed (kt) on that close-hauled angle
 *   upHeel target upwind heel angle (deg)
 *   dnTWA  optimal downwind VMG-running true wind angle (deg off the wind)
 *   dnBSP  boat speed (kt) at that gybing angle
 *   dnHeel target downwind heel angle (deg)
 * Speed/TWA match the ORC Speed Guide AND Oh Jee's own taped cockpit target card.
 * The HEEL targets are from that target card (the gauge the crew trims to live).
 * TWS=4 is extrapolated below the 6 kt floor (flagged est).
 * ------------------------------------------------------------------------- */
const POLAR_ANCHORS = [
  { tws: 4,  upTWA: 44.5, upBSP: 3.50, upHeel: 2.0,  dnTWA: 140.0, dnBSP: 3.50, dnHeel: 11.6 }, // est
  { tws: 6,  upTWA: 42.6, upBSP: 4.69, upHeel: 3.8,  dnTWA: 142.6, dnBSP: 4.74, dnHeel: 11.7 },
  { tws: 8,  upTWA: 41.4, upBSP: 5.61, upHeel: 8.9,  dnTWA: 144.3, dnBSP: 5.80, dnHeel: 11.8 },
  { tws: 10, upTWA: 39.1, upBSP: 6.19, upHeel: 21.4, dnTWA: 148.9, dnBSP: 6.38, dnHeel: 11.9 },
  { tws: 12, upTWA: 36.7, upBSP: 6.34, upHeel: 23.6, dnTWA: 157.8, dnBSP: 6.59, dnHeel: 11.7 },
  { tws: 14, upTWA: 35.2, upBSP: 6.42, upHeel: 24.5, dnTWA: 165.2, dnBSP: 6.78, dnHeel: 11.6 },
  { tws: 16, upTWA: 34.3, upBSP: 6.47, upHeel: 25.9, dnTWA: 167.7, dnBSP: 7.12, dnHeel: 11.6 },
  { tws: 20, upTWA: 34.8, upBSP: 6.53, upHeel: 24.7, dnTWA: 137.5, dnBSP: 10.93, dnHeel: 18.8 }, // planing
];

/* Dense polar: boat speed (kt) at fixed true wind angles, per TWS row.
 * Source: ORC Speed Guide J/88 full polar table. Filled from research; nulls
 * are interpolated at runtime. (Populated in data.dense.js if available,
 * otherwise geo.js synthesizes reach speeds from the anchors above.) */
const POLAR_DENSE = {
  twa: [52, 60, 70, 75, 80, 90, 110, 120, 135, 150, 165, 180],
  rows: [
    { tws: 6,  bsp: [5.26, 5.56, 5.77, 5.81, 5.81, 6.14, 6.08, 5.88, 5.23, 4.23, 3.39, 3.06] },
    { tws: 8,  bsp: [6.29, 6.52, 6.65, 6.67, 6.75, 6.92, 6.94, 6.89, 6.38, 5.35, 4.43, 4.03] },
    { tws: 10, bsp: [6.80, 6.96, 7.07, 7.09, 7.09, 7.15, 7.63, 7.46, 7.00, 6.31, 5.36, 4.92] },
    { tws: 12, bsp: [7.00, 7.22, 7.45, 7.51, 7.52, 7.43, 8.13, 8.16, 7.55, 6.90, 6.22, 5.77] },
    { tws: 14, bsp: [7.13, 7.38, 7.70, 7.85, 7.95, 7.90, 8.48, 8.72, 8.21, 7.36, 6.79, 6.47] },
    { tws: 16, bsp: [7.22, 7.50, 7.85, 8.02, 8.19, 8.38, 8.76, 9.12, 9.01, 7.92, 7.20, 6.92] },
    { tws: 20, bsp: [7.33, 7.64, 8.01, 8.22, 8.44, 8.88, 9.34, 9.96, 11.23, 9.30, 8.21, 7.79] },
  ],
};

/* ---------------------------------------------------------------------------
 * TUNING — Quantum J/88 Quick Tune Chart, organized by wind band.
 * Quantum publishes turns-from-base for the shrouds plus a base Loos PT-2 row.
 * North Sails PT-2 readings included as a cross-check.
 * BASE (10-14 kt, Loos PT-2): Uppers 22, Lowers 22, Intermediates 16.
 * ------------------------------------------------------------------------- */
const TUNING_BASE = {
  loosGauge: 'Loos PT-2',
  mast: 'Hall Spars',
  uppers: 22, lowers: 22, intermediates: 16,
  rakeRef: '~12–14 in mast rake; headstay ARC 1.682 m; rake number "39"',
  spreaderMarks: 'Lower spreader 800 mm off centerline, top spreader 550 mm',
  jibCarBase: 'L/M jib: 3 screws showing aft of the car',
  crewWeight: 'Class ideal crew weight ~1110 lb (504 kg) — stack the rail',
  note: 'Set headstay first, center the rig aloft, then set shrouds with NO ' +
        'backstay/halyard tension on the gauge. Mark every control line.',
};

// Columns transcribed verbatim from the Quantum J/88 Quick Tune Chart.
// Shroud turns are FROM the base 10–14 kt setting. Hall Spars mast.
const TUNING_BANDS = [
  {
    windRange: '0–6 kt', tws: [0, 6],
    uppers: '−4', lowers: '−1.5', intermediates: '−3',
    jibInhaul: 'Area 4', jibLead: 'AFT', outhaul: '6" off boom',
    traveler: 'Up 20"', vang: '0', backstay: 'None',
    jibFurl: 'In', jib: 'L/M', spin: 'A2',
    notes: 'Light — rig eased right off. Crew weight forward and to leeward. ' +
           'Sail for flow; target heel ~4°.',
  },
  {
    windRange: '6–10 kt', tws: [6, 10],
    uppers: '−2', lowers: '−1', intermediates: '−1.5',
    jibInhaul: 'Area 4', jibLead: 'AFT', outhaul: '4" off boom',
    traveler: 'Up 16"', vang: '0', backstay: '25%',
    jibFurl: 'In', jib: 'L/M', spin: 'A2',
    notes: 'Building — boat wants to be slightly powered. Weight forward. ' +
           'Target ~8 kt: BSP 5.6, TWA ~41°, heel ~9°.',
  },
  {
    windRange: '10–14 kt (BASE)', tws: [10, 14],
    uppers: 'BASE', lowers: 'BASE', intermediates: 'BASE',
    jibInhaul: 'Area 3', jibLead: 'BASE', outhaul: '2" off boom',
    traveler: 'Up 6"', vang: '30%', backstay: '50%',
    jibFurl: 'In', jib: 'L/M', spin: 'A2',
    notes: 'BASE band — everything at the dock-tune numbers. Backstay and ' +
           'vang come on. Heel 21–24°; hike hard.',
  },
  {
    windRange: '14–18 kt', tws: [14, 18],
    uppers: '+3', lowers: '+1', intermediates: '+2',
    jibInhaul: 'Area 2', jibLead: 'FWD', outhaul: '1" off boom',
    traveler: 'Up 4" to 0', vang: '50%', backstay: '75%',
    jibFurl: 'In', jib: 'L/M', spin: 'A2',
    notes: 'Backstay is the gear lever now — flatten main, kill forestay sag. ' +
           'Keep the L/M jib up; it is fast right through 18 kt.',
  },
  {
    windRange: '18–22 kt', tws: [18, 23],
    uppers: '+5', lowers: '+1.5', intermediates: '+3',
    jibInhaul: 'Area 2 or 1', jibLead: 'FWD', outhaul: '0 (max flat)',
    traveler: 'Center', vang: '75%', backstay: '85%',
    jibFurl: 'Out', jib: 'HVY', spin: 'A2',
    notes: 'Depowered: furl out, switch to the HVY jib. Traveler centred, ' +
           'drop it in the puffs. Rig and backstay very tight.',
  },
  {
    windRange: '23+ kt', tws: [23, 99],
    uppers: '+7', lowers: '+2.5', intermediates: '+4',
    jibInhaul: 'Area 1', jibLead: 'FWD', outhaul: '0 (max flat)',
    traveler: 'Center', vang: '95%', backstay: 'Max',
    jibFurl: 'Out', jib: 'HVY', spin: 'A3',
    notes: 'Survival trim — rig max, backstay max, vang 95%. HVY jib up, ' +
           'A3 reacher down. Keep her flat and on her feet.',
  },
];

/* ---------------------------------------------------------------------------
 * TUNE_INFO — "what it is + how to tune it" for each control on the Tune card.
 * Keyed to the tune-chart columns. Plain English, J/88-specific.
 * ------------------------------------------------------------------------- */
const TUNE_INFO = {
  uppers: {
    title: 'Uppers (V1) — cap shrouds',
    text: 'WHERE: the longest, outermost wires. They run from near the masthead, over the tips of BOTH spreaders, down to the chainplates at the rail. Their turnbuckles are the outboard ones at the rail.\n\nWHAT THEY DO: the spreaders sweep aft, so tightening the uppers pulls the mast tip aft — which tightens the HEADSTAY. Less jib-luff sag = a flatter jib that points higher. Your main power-vs-point lever.\n\nHOW: the value above is FULL TURNS of the turnbuckle from your taped base marks. "−2" = unscrew both sides two full turns from the marks; "+3" = tighten three. Always the same on port and starboard so the mast stays centred, and re-pin when done.',
  },
  lowers: {
    title: 'Lowers (D1) — lower shrouds',
    text: 'WHERE: the shortest wires — from the deck near the mast up to the underside of the LOWER spreader. Their turnbuckles are the inboard ones.\n\nWHAT THEY DO: they control the bottom third of the mast. Tighter = a stiffer, straighter lower mast (flatter main, less power); looser = the mast can bow forward low down (fuller main, more power).\n\nHOW: the value above is full turns from your base marks, both sides equal. Check your work: sight up the mast groove from behind — the bottom section should be dead straight side-to-side under load.',
  },
  intermediates: {
    title: 'Intermediates (D2) — middle diagonals',
    text: 'WHERE: the middle wires — from the TIP of the lower spreader up to the mast at the upper spreader.\n\nWHAT THEY DO: they hold the middle of the mast in column, stopping it sagging sideways to leeward as the rig loads up.\n\nHOW: the value above is full turns from your base marks, both sides equal. Check your work while sailing upwind: sight up the back of the mast — if the middle bows away to leeward, tighten; if it pokes up to windward, ease.',
  },
  base: {
    title: 'Turns "from base"',
    text: 'The three shroud values are turns FROM your base setting — not absolute readings.\n\nSet base ONCE at the dock with a Loos PT-2 tension gauge: Uppers 22, Lowers 22, Intermediates 16. Then mark every turnbuckle stud (tape or paint pen) at that setting.\n\nFrom then on you never need the gauge on the water: the card just says how many full turns to add (+) or remove (−) from your marks for today’s wind. Count whole turns, keep port and starboard identical, re-pin the turnbuckles when done.',
  },
  jibInhaul: {
    title: 'Jib inhaul (Area)',
    text: 'WHERE: the jib has a back corner (the clew) where the sheet attaches. The inhaul is a second, smaller line on that same corner. The sheet pulls the corner backward — the inhaul pulls it sideways, in toward the middle of the boat.\n\nWHAT IT DOES: it sets how close to the centreline the jib sits. Pulled in = the jib trims tighter = you can steer closer to the wind. Let out = the jib sits wider = faster and easier to sail when it’s windy.\n\nHOW: the corner’s position is marked in zones — Area 4, 3, 2, 1. The value above tells you which zone for today’s wind. Simple rule: light wind = pull it in (pointing), strong wind = let it out (speed).',
  },
  jibLead: {
    title: 'Jib lead (sheet car position)',
    text: 'WHERE: the jib-sheet car on its fore-and-aft track on the side deck.\n\nWHAT IT DOES: it balances the top of the jib against the bottom. Car FORWARD = sheet pulls down more = tight leech, deep foot: power and point. Car AFT = sheet pulls back more = the top twists open, flat foot: less power, more forgiving.\n\nHOW: set the car to the position above — AFT in light air (let the top twist for flow), BASE mid-range, FWD as it builds to drive through chop. Watch the luff telltales up the sail: if the top ones break long before the bottom, move the car forward.',
  },
  outhaul: {
    title: 'Outhaul',
    text: 'WHERE: the line that stretches the bottom edge of the mainsail back along the boom (the control is led back to the cockpit).\n\nWHAT IT DOES: it sets how much belly the bottom of the main has. Ease it and the sail bags away from the boom into a deep pocket = more power, for light wind. Pull it tight and the sail stretches flat against the boom = less power and less heel, for strong wind.\n\nHOW: the value above is the gap between the sail’s bottom edge and the boom, at the middle of the boom. 6" = about a hand’s width of gap; 0 = stretched flat, touching the boom. More wind → smaller gap.',
  },
  traveler: {
    title: 'Traveler (upwind)',
    text: 'WHERE: the mainsheet car on the athwartships track across the cockpit.\n\nWHAT IT DOES: moves the whole boom to windward or leeward WITHOUT changing leech tension — angle of attack on demand.\n\nHOW: the value above is where to carry the car upwind — "Up 16"" = 16 inches to windward of centreline. Play it constantly: drop it to leeward in the puffs to hold target heel, pull it back up in the lulls. If you’re dumping traveler all the time, you’re under-depowered — add backstay or a rig step.',
  },
  vang: {
    title: 'Vang (upwind)',
    text: 'WHERE: the boom vang — the tackle from the base of the mast diagonally up to the boom.\n\nWHAT IT DOES: pulls the boom down, tensioning the mainsail leech and stopping the top of the main twisting open. With vang on, easing the sheet in a puff depowers without the top going sloppy ("vang-sheeting").\n\nHOW: the value above is how hard to carry it upwind (0 = slack → 95% = nearly max). Rule of thumb: none in light air (let the top twist and flow), progressively harder as the breeze builds.',
  },
  backstay: {
    title: 'Backstay (upwind)',
    text: 'WHERE: the adjustable stay from the masthead to the stern — the purchase tail lives at the back of the cockpit.\n\nWHAT IT DOES: two things at once — bends the mast (flattens the main) and tightens the headstay (flattens the jib). It’s the gear lever you play most: on in the puffs, off in the lulls.\n\nHOW: the value above is % of full purchase. Mark the tail once at fully OFF and fully ON; the percentage is how far between your two marks. 25% = just snug, Max = everything.',
  },
  jibFurl: {
    title: 'Jib furl (downwind)',
    text: 'WHAT: whether the jib is rolled away or left flying on the kite legs.\n\nIN (furled) — light and medium air: a limp jib hanging in front of the spinnaker chokes the airflow feeding it. Roll it away and the kite breathes.\n\nOUT (flying) — 18 kt and up: there’s plenty of wind for both sails, the jib adds speed and balance, and it’s already out for a fast drop at the leeward mark.\n\n(Double-check this matches your crew’s convention the first time.)',
  },
  jib: {
    title: 'Jib (upwind sail choice)',
    text: 'Which headsail to rig for the beats: the L/M (light-medium, all-purpose) jib in everything up to ~18 kt, then the smaller, flatter HVY (heavy-air) jib above that.\n\nThe tell: switch to the HVY when you’re fully depowered (max backstay, rig stepped up) and still can’t keep the main full and the boat on its feet.',
  },
  spin: {
    title: 'Spin (downwind sail choice)',
    text: 'Which asymmetric to hoist for the downwind legs: the A2 — the full, round running kite — in almost everything, or the smaller, flatter A3 reacher when it’s survival-windy (23 kt+).\n\nBelow 23 kt the A2 is always the call; the A3 exists so you can still send it when the A2 would round you up.',
  },
};

/* ---------------------------------------------------------------------------
 * TACTICS — J/88-specific coaching, surfaced by race phase.
 * ------------------------------------------------------------------------- */
const TIPS = {
  start: [
    'Shoot head-to-wind off the committee boat to read line bias before the gun.',
    'J/88 likes being slightly overpowered — bias toward a full-power start.',
    'Need clean acceleration: ease backstay/sheet to power up off the line.',
    'ID leeward-boat threats ~60 s out; hook a stern or double-tack to clear.',
    'Adverse current at the line risks barging — approach with extra speed and room.',
  ],
  upwind: [
    'Backstay is the all-conditions lever: flattens main, controls forestay sag.',
    'Keep the light/medium (AP) jib up to ~18 kt — heavy jib is slow 14–18 kt.',
    'Set jib lead + inhauler before the start; hard to fix mid-beat.',
    'Chop: rig a touch looser for power. Flat water: tighter to point.',
    'Deep transom-hung rudder feels dinghy-like — modulate, don\'t over-steer.',
    'Boat warns before it overpowers; ease the rail down gradually in puffs.',
  ],
  downwind: [
    'Heat up to build speed, soak low once fast, reheat when you slow down.',
    'Sub-planing, sail VMG angles ~140–150° TWA — don\'t sail too high.',
    'Once the kite really loads, sail higher and get it planing (~16 kt+).',
    'Planing? Footing pays huge — chase puffs and stay on the plane.',
    'Gybe is simple: blow one sheet, sheet on the other across the sprit.',
    'In >12 kt, heel to windward to project the kite and cut wetted surface.',
  ],
  maneuvers: [
    'Mark the spin halyard at full hoist so the mast crew clears the job fast.',
    'Move the spin turning block forward so sheets clear the jib winch.',
    'Pick the leeward gate that sets up the favored side of the next beat.',
    'Pre-race: hoist the kite and run several practice gybes for crew polish.',
    'Engine to full revs before shutdown so the prop closes — less drag.',
  ],
  current: [
    'Both laylines shift with current — recompute, don\'t eyeball them.',
    'Favor the course side where current helps, not just the wind shift.',
    'Don\'t hit the layline early in current; you overstand and lose shifts.',
    'Current under the line moves the favored end — re-check bias near the gun.',
    'Below 5 kt the current runs the race: on a foul ebb work toward shore for relief; on flood, anticipate the push at mark roundings.',
  ],
  twilight: [
    'Watch the 17:00→21:00 wind slope, not just the 19:00 number — know WHEN the sea breeze collapses.',
    'Dying breeze: tune for the lowest expected wind, not the puff at the gun. Soften the rig, ease backstay to power up.',
    'The sea breeze fades shore-first — avoid the Larchmont shoreline on the first beat; pressure holds further out in the Sound.',
    'Transition glass-out: where a dying SW meets a new N drainage breeze there\'s a dead band. Spot the boundary; don\'t park in it.',
    'A new land breeze fills from the N/NW shore at sunset — if it\'s coming, boats nearest that shore get it first.',
    'Crew weight low and forward to lift the wide transom out of the water and cut drag in the light twilight air.',
  ],
};

const PLANING_THRESHOLD_KT = 16;

/* ---------------------------------------------------------------------------
 * VENUE — the Can One Evening Race (COERA), hosted by Larchmont YC.
 * Western Long Island Sound; first warning 19:00 Thursdays; VHF 71.
 * Start area is by Mark A (inflatable, near Execution Rocks). Tidal water,
 * so current matters. Magnetic variation ~12.6°W (2026, NOAA WMM).
 * ------------------------------------------------------------------------- */
const VENUE = {
  name: 'Can One — Western LIS (Larchmont)',
  series: '2026 Can One Thursday Night Series',
  startLat: 40.87814, startLon: -73.73786, // Execution Rocks area (Mark A)
  variationDeg: -12.6,                      // magnetic variation, West = negative
  currentStation: 'LIS1036',                // NOAA tidal-current station: Execution Rocks
  currentStationName: 'Execution Rocks',
  // 3 wind-sample points across the cross-Sound axis, ~3 nm apart so each lands
  // in a distinct HRRR (3 km) cell — reveals the shore-vs-offshore pressure gradient.
  windSamplePoints: [
    { label: 'Shore', lat: 40.920, lon: -73.775 },     // NW, Westchester/Larchmont side
    { label: 'Mid', lat: 40.878, lon: -73.738 },       // Execution Rocks / start
    { label: 'Offshore', lat: 40.836, lon: -73.701 },  // SE, toward mid-Sound
  ],
  vhf: 71,
  firstWarning: '19:00 Thursdays',
  timeLimitMin: 90,
  sailflow: 'https://sailflow.com/spot/1498',
  eventUrl: 'https://www.yachtscoring.com/emenu/50707',
  fleetNote: 'Oh Jee (USA 25) races the J/88 one-design class — 6 rivals: ' +
    'Albondigas, Deviation YCC, One Too Many, Sibling Rivalry, Whirlwind, Wild Thing. ' +
    'One-design = boat-for-boat, so these polar targets are exactly the bar to beat.',
};

/* Can One marks — driven by the SIs' OWN Appendix A2 matrix (the table the RC
 * course board uses): magnetic bearing + distance (nm) between every pair of
 * marks. This is the authoritative geometry, so fixed-mark legs use it directly.
 * Mark A is the start/finish (near Execution Rocks). W is the nightly windward
 * inflatable, computed live 1 nm upwind. Mark lat/lon are reconstructed from the
 * A-row at runtime (anchored at A) only for current lookups + the W legs.
 * Bearings here are MAGNETIC (variation 12.6°W); the heading math converts to
 * true, and the °M display toggle converts back so the board numbers match. */
const CAN_ONE_MARKS = {
  bearingsAreMagnetic: true,
  windwardLegNm: 1.0,
  codes: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'U'],
  // matrix[FROM][TO] = [bearingMagnetic, distanceNm]
  matrix: {
    A: { B: [136, 1.1], C: [224, 2.4], D: [196, 1.4], E: [207, 2.0], F: [2, 0.7], G: [33, 2.0], H: [210, 3.1], J: [282, 0.9], K: [50, 2.5], M: [90, 4.6], N: [115, 3.6], U: [157, 0.6] },
    B: { A: [316, 1.1], C: [248, 2.6], D: [244, 1.3], E: [238, 2.0], F: [334, 1.6], G: [8, 2.4], H: [230, 3.0], J: [300, 1.9], K: [27, 2.6], M: [79, 4.0], N: [108, 2.6], U: [292, 0.6] },
    C: { A: [44, 2.4], B: [68, 2.6], D: [72, 1.3], E: [98, 0.7], F: [35, 3.0], G: [39, 4.4], H: [173, 1.0], J: [21, 2.1], K: [47, 4.9], M: [75, 6.5], N: [88, 4.9], U: [58, 2.2] },
    D: { A: [16, 1.4], B: [64, 1.3], C: [252, 1.3], E: [227, 0.8], F: [12, 2.1], G: [26, 3.3], H: [220, 1.8], J: [340, 1.6], K: [38, 3.7], M: [75, 5.2], N: [94, 3.6], U: [38, 1.0] },
    E: { A: [27, 2.0], B: [58, 2.0], C: [278, 0.7], D: [47, 0.8], F: [21, 2.7], G: [30, 4.0], H: [215, 1.1], J: [0, 2.1], K: [40, 4.5], M: [72, 5.8], N: [86, 4.2], U: [42, 1.7] },
    F: { A: [182, 0.7], B: [154, 1.6], C: [215, 3.0], D: [192, 2.1], E: [201, 2.7], G: [48, 1.4], H: [205, 3.8], J: [241, 1.1], K: [65, 2.1], M: [99, 4.7], N: [113, 4.5], U: [171, 1.3] },
    G: { A: [213, 2.0], B: [188, 2.4], C: [219, 4.4], D: [206, 3.3], E: [210, 4.0], F: [228, 1.4], H: [211, 5.4], J: [234, 2.5], K: [93, 0.9], M: [115, 3.9], N: [146, 3.9], U: [201, 2.4] },
    H: { A: [30, 3.1], B: [50, 3.0], C: [353, 1.0], D: [40, 1.8], E: [35, 1.1], F: [25, 3.8], G: [31, 5.4], J: [12, 3.0], K: [39, 5.5], M: [66, 6.7], N: [77, 4.9], U: [39, 2.8] },
    J: { A: [102, 0.9], B: [120, 1.9], C: [201, 2.1], D: [160, 1.6], E: [180, 2.1], F: [61, 1.1], G: [54, 2.5], H: [192, 3.0], K: [64, 3.2], M: [92, 5.6], N: [113, 4.5], U: [122, 1.4] },
    K: { A: [230, 2.5], B: [207, 2.6], C: [227, 4.9], D: [218, 3.7], E: [220, 4.5], F: [245, 2.1], G: [273, 0.9], H: [219, 5.5], J: [244, 3.2], M: [121, 3.1], N: [157, 3.4], U: [218, 2.7] },
    M: { A: [270, 4.6], B: [259, 4.0], C: [255, 6.5], D: [255, 5.2], E: [252, 5.8], F: [279, 4.7], G: [295, 3.9], H: [246, 6.7], J: [272, 5.6], K: [301, 3.1], N: [222, 2.1], U: [263, 4.4] },
    N: { A: [295, 3.6], B: [288, 2.6], C: [268, 4.9], D: [274, 3.6], E: [266, 4.2], F: [293, 4.5], G: [326, 3.9], H: [257, 4.9], J: [293, 4.5], K: [337, 3.4], M: [42, 2.1], U: [288, 3.2] },
    U: { A: [337, 0.6], B: [112, 0.6], C: [238, 2.2], D: [218, 1.0], E: [222, 1.7], F: [351, 1.3], G: [21, 2.4], H: [219, 2.8], J: [302, 1.4], K: [38, 2.7], M: [83, 4.4], N: [108, 3.2] },
  },
};

/* Course conventions from the 2026 SIs. */
const COURSE_RULES = [
  'Marks rounded in the order signaled, left to PORT by default.',
  'GREEN placard on the course board → round ALL marks to STARBOARD.',
  'Course-letter suffix "2" → sail it twice around, through the start line each lap.',
  'Mark A is the start AND the finish; windward mark W is set ~1 nm upwind.',
  'First warning 19:00. Code flag F up 5 min before, down (sound) 1 min before warning.',
  'Check in by the RC stern (name + sail no.) before your start — not by VHF.',
  'Time limit: 90 min for first boat; +30 min then TLE. VHF 71 for RC broadcasts.',
];

/* ---------------------------------------------------------------------------
 * SOURCES
 * ------------------------------------------------------------------------- */
const SOURCES = [
  { label: 'Quantum J/88 Quick Tune Chart',
    url: 'https://www.quantumsails.com/en/sails/one-design/documents/j88/j88_quicktunechart.aspx' },
  { label: 'Quantum J/88 Targets',
    url: 'https://www.quantumsails.com/en/sails/one-design/documents/j88/j88_targets.aspx' },
  { label: 'North Sails J/88 Tuning Guide (PDF)',
    url: 'https://j88class.org/wp-content/uploads/2020/12/US-Tuning-Guide_J88_6.15.17.pdf' },
  { label: 'ORC J/88 Speed Guide polar (PDF)',
    url: 'https://j88class.org/wp-content/uploads/2020/12/Speed-Guide-Polar-Diagram.pdf' },
  { label: 'J/88 Class Association',
    url: 'https://j88class.org/' },
  { label: 'Can One Series (YachtScoring · NOR · SIs · marks)',
    url: 'https://www.yachtscoring.com/emenu/50707' },
  { label: 'SailFlow — Western LIS forecast (spot 1498)',
    url: 'https://sailflow.com/spot/1498' },
];

window.JDATA = {
  POLAR_ANCHORS, POLAR_DENSE,
  TUNING_BASE, TUNING_BANDS, TUNE_INFO,
  TIPS, PLANING_THRESHOLD_KT, SOURCES,
  VENUE, CAN_ONE_MARKS, COURSE_RULES,
};
