/* =============================================================================
 * geo.js — navigation + polar + routing math for the J/88 tactician.
 * Pure functions, no DOM. All bearings are degrees TRUE unless noted.
 * Wind direction = the direction the wind blows FROM (met convention).
 * Current "set" = the direction the current flows TOWARD (oceanographic).
 * ===========================================================================*/
(function () {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const EARTH_NM = 3440.065; // nautical miles

  const norm360 = (d) => ((d % 360) + 360) % 360;
  // signed shortest angle a→b in (-180,180]
  const signed = (a, b) => { let x = norm360(b - a); return x > 180 ? x - 360 : x; };
  // unsigned separation 0..180
  const sep = (a, b) => Math.abs(signed(a, b));

  /* ---- spherical helpers (short legs, but exact enough for any course) ---- */
  function bearing(from, to) {
    const φ1 = from.lat * D2R, φ2 = to.lat * D2R;
    const Δλ = (to.lon - from.lon) * D2R;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return norm360(Math.atan2(y, x) * R2D);
  }
  function distanceNm(from, to) {
    const φ1 = from.lat * D2R, φ2 = to.lat * D2R;
    const Δφ = (to.lat - from.lat) * D2R, Δλ = (to.lon - from.lon) * D2R;
    const a = Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return EARTH_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  // project a mark from a start point along bearing/distance (course builder)
  function destination(from, brngDeg, distNm) {
    const δ = distNm / EARTH_NM, θ = brngDeg * D2R;
    const φ1 = from.lat * D2R, λ1 = from.lon * D2R;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
      Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return { lat: φ2 * R2D, lon: norm360((λ2 * R2D) + 180) - 180 };
  }

  /* ---- polar lookups ----------------------------------------------------- */
  const A = window.JDATA.POLAR_ANCHORS;
  const DENSE = window.JDATA.POLAR_DENSE;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // optimum beat/run angles + speeds at a given TWS (linear between anchors)
  function targets(tws) {
    if (tws <= A[0].tws) return { ...A[0], extrap: tws < A[0].tws };
    if (tws >= A[A.length - 1].tws) return { ...A[A.length - 1], extrap: tws > A[A.length - 1].tws };
    for (let i = 0; i < A.length - 1; i++) {
      if (tws >= A[i].tws && tws <= A[i + 1].tws) {
        const t = (tws - A[i].tws) / (A[i + 1].tws - A[i].tws);
        return {
          tws,
          upTWA: lerp(A[i].upTWA, A[i + 1].upTWA, t),
          upBSP: lerp(A[i].upBSP, A[i + 1].upBSP, t),
          upHeel: lerp(A[i].upHeel, A[i + 1].upHeel, t),
          dnTWA: lerp(A[i].dnTWA, A[i + 1].dnTWA, t),
          dnBSP: lerp(A[i].dnBSP, A[i + 1].dnBSP, t),
          dnHeel: lerp(A[i].dnHeel, A[i + 1].dnHeel, t),
          extrap: false,
        };
      }
    }
    return { ...A[A.length - 1] };
  }

  // boat speed (kt) at any TWA/TWS, bilinear over the dense ORC grid,
  // with the beat point grafted in at the low-angle end.
  function boatSpeed(tws, twa) {
    twa = clamp(Math.abs(twa), 0, 180);
    const tgt = targets(tws);
    const rows = DENSE.rows;
    const twsC = clamp(tws, rows[0].tws, rows[rows.length - 1].tws);

    // interpolate one dense row to the requested TWS
    let lo = rows[0], hi = rows[rows.length - 1];
    for (let i = 0; i < rows.length - 1; i++) {
      if (twsC >= rows[i].tws && twsC <= rows[i + 1].tws) { lo = rows[i]; hi = rows[i + 1]; break; }
    }
    const tw = hi.tws === lo.tws ? 0 : (twsC - lo.tws) / (hi.tws - lo.tws);
    const angles = [tgt.upTWA, ...DENSE.twa];
    const speeds = DENSE.twa.map((_, j) => lerp(lo.bsp[j], hi.bsp[j], tw));
    const full = [tgt.upBSP, ...speeds];

    if (twa <= angles[0]) return full[0];
    if (twa >= angles[angles.length - 1]) return full[full.length - 1];
    for (let j = 0; j < angles.length - 1; j++) {
      if (twa >= angles[j] && twa <= angles[j + 1]) {
        const t = (twa - angles[j]) / (angles[j + 1] - angles[j]);
        return lerp(full[j], full[j + 1], t);
      }
    }
    return full[full.length - 1];
  }

  /* ---- current vector math ----------------------------------------------- */
  // velocity components (east, north) for a speed along a TRUE bearing
  function vec(brng, spd) {
    return { e: spd * Math.sin(brng * D2R), n: spd * Math.cos(brng * D2R) };
  }
  function vecBrngSpd(v) {
    return { brng: norm360(Math.atan2(v.e, v.n) * R2D), spd: Math.hypot(v.e, v.n) };
  }
  // resultant course/speed over ground given heading+boatspeed and a current
  function overGround(headingT, boatSpd, set, drift) {
    const b = vec(headingT, boatSpd), c = vec(set || 0, drift || 0);
    return vecBrngSpd({ e: b.e + c.e, n: b.n + c.n });
  }

  /* ---- the core: solve a single leg -------------------------------------- */
  // env = { windDir, tws, set, drift }   (set/drift optional)
  // pre = { bearing, distanceNm } optional — use authoritative SI matrix values
  // instead of deriving from lat/lon (bearing must already be TRUE).
  function solveLeg(from, to, env, pre) {
    const brng = pre ? pre.bearing : bearing(from, to);
    const dist = pre ? pre.distanceNm : distanceNm(from, to);
    const twaRhumb = sep(env.windDir, brng); // 0=upwind .. 180=downwind
    const tgt = targets(env.tws);
    const set = env.set || 0, drift = env.drift || 0;
    const hasCurrent = drift > 0.05;

    let type;
    if (twaRhumb < tgt.upTWA - 1) type = 'beat';
    else if (twaRhumb > tgt.dnTWA + 1) type = 'run';
    else type = 'reach';

    const out = {
      bearing: brng, distanceNm: dist, twaRhumb, type, target: tgt,
      targetHeel: type === 'run' ? tgt.dnHeel : tgt.upHeel, // reaches heel like upwind
      hasCurrent, options: [], notes: [],
    };

    // starboard tack = wind over the starboard (right) side = wind source is to the
    // right of the bow ⇒ windDir is clockwise of heading ⇒ signed(windDir,heading) < 0.
    const tackName = (headingT) => signed(env.windDir, headingT) < 0 ? 'Starboard' : 'Port';
    const jib = env.tws >= 18 ? 'HVY jib' : 'L/M jib';   // crossover per tune chart
    const spin = env.tws >= 23 ? 'A3' : 'A2';

    if (type === 'beat' || type === 'run') {
      const twa = type === 'beat' ? tgt.upTWA : tgt.dnTWA;
      const bsp = type === 'beat' ? tgt.upBSP : tgt.dnBSP;
      // the two headings the helm can sail (boat sails to fixed TWA)
      [-1, +1].forEach((s) => {
        const headingT = norm360(env.windDir + s * twa);
        const og = overGround(headingT, bsp, set, drift);
        const vmgMark = og.spd * Math.cos(signed(brng, og.brng) * D2R);
        out.options.push({
          tack: tackName(headingT), headingTrue: headingT, twa, boatSpeed: bsp,
          cogTrue: og.brng, sog: og.spd, vmgMark,
        });
      });
      // favored = best made-good toward the mark over ground
      out.options.sort((a, b) => b.vmgMark - a.vmgMark);
      out.options[0].favored = true;
      const fav = out.options[0];
      out.etaMin = fav.vmgMark > 0.1 ? (dist / fav.vmgMark) * 60 : null;
      out.sail = type === 'beat' ? jib : `${spin} asymmetric on the sprit`;
      if (type === 'beat')
        out.notes.push(`Beat — point at ~${tgt.upTWA.toFixed(0)}° TWA on the jib telltales, not a compass number.`);
      else
        out.notes.push(`Run — gybe downwind at ~${tgt.dnTWA.toFixed(0)}° TWA. Sailing dead-down is slower than soaking these angles.`);
      if (hasCurrent) {
        const lay = signed(brng, set); // which way current pushes vs rhumb
        out.notes.push(`Current sets ${compass(set)} — it favors the ${fav.tack.toLowerCase()} ${type === 'beat' ? 'tack' : 'gybe'} and shifts both laylines. Don't overstand.`);
      }
    } else {
      // reach / fetch — steer a heading to make good the rhumb line through current
      let headingT = brng, V = boatSpeed(env.tws, twaRhumb), canHold = true;
      for (let it = 0; it < 4; it++) {
        const rhs = -(drift / V) * Math.sin((set - brng) * D2R);
        if (Math.abs(rhs) > 1) { canHold = false; headingT = norm360(brng + Math.sign(rhs || 1) * -60); break; }
        headingT = norm360(brng + Math.asin(rhs) * R2D);
        const twa2 = sep(env.windDir, headingT);
        V = boatSpeed(env.tws, twa2);
      }
      const og = overGround(headingT, V, set, drift);
      const twaSteer = sep(env.windDir, headingT);
      out.steerHeadingTrue = headingT;
      out.twaSteer = twaSteer;
      out.boatSpeed = V;
      out.sog = og.spd;
      out.canHoldCourse = canHold;
      // kite carryable on the J/88 from ~70° TWA up in breeze
      const kite = twaSteer >= 70;
      out.sail = kite ? `${spin} kite reachable` : `${jib} reach (too tight for kite)`;
      out.options.push({
        tack: tackName(headingT), headingTrue: headingT, twa: twaSteer,
        boatSpeed: V, cogTrue: og.brng, sog: og.spd, vmgMark: og.spd, favored: true,
      });
      out.etaMin = og.spd > 0.1 ? (dist / og.spd) * 60 : null;
      out.notes.push(`Reach — lay the mark in one. ${kite ? 'Carry the kite.' : 'Jib only, too tight for the A2.'}`);
      if (!canHold)
        out.notes.push(`⚠ Current (${drift.toFixed(1)} kt) is too strong to hold this line at speed — pinch up-current and expect to crab.`);
      else if (hasCurrent)
        out.notes.push(`Steering up-current of the rhumb to hold the line through ${drift.toFixed(1)} kt of current — expect to crab.`);
    }
    return out;
  }

  // 16-point compass for a true bearing
  function compass(deg) {
    const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return pts[Math.round(norm360(deg) / 22.5) % 16];
  }
  const toMag = (trueDeg, variation) => norm360(trueDeg - (variation || 0));

  /* ---- Can One matrix helpers --------------------------------------------- */
  // authoritative leg from the SI Appendix A2 matrix; bearing returned in TRUE.
  function matrixLeg(CO, fromCode, toCode, variationDeg) {
    const row = CO.matrix[fromCode];
    if (!row || !row[toCode]) return null;
    const [magBrng, nm] = row[toCode];
    const brng = CO.bearingsAreMagnetic ? norm360(magBrng + (variationDeg || 0)) : magBrng;
    return { bearing: brng, distanceNm: nm };
  }
  // reconstruct each mark's lat/lon from the A-row, anchored at the start point.
  function reconstructMarks(CO, anchor, variationDeg) {
    const pos = { A: { lat: anchor.lat, lon: anchor.lon } };
    const aRow = CO.matrix.A;
    Object.keys(aRow).forEach((code) => {
      const [magBrng, nm] = aRow[code];
      const brng = CO.bearingsAreMagnetic ? norm360(magBrng + (variationDeg || 0)) : magBrng;
      pos[code] = destination(anchor, brng, nm);
    });
    return pos;
  }

  // the two close-hauled layline bearings (current-adjusted COGs) for a wind/current.
  // Independent of boat position — these are the bearings that fetch the mark on each tack.
  function laylines(env) {
    const tgt = targets(env.tws);
    return [-1, 1].map((s) => {
      const headingT = norm360(env.windDir + s * tgt.upTWA);
      const og = overGround(headingT, tgt.upBSP, env.set || 0, env.drift || 0);
      return { tack: signed(env.windDir, headingT) < 0 ? 'Starboard' : 'Port', cog: og.brng, heading: headingT };
    });
  }

  window.JGEO = {
    norm360, signed, sep, bearing, distanceNm, destination,
    targets, boatSpeed, overGround, solveLeg, compass, toMag,
    matrixLeg, reconstructMarks, laylines,
  };
})();
