/* =============================================================================
 * app.js — UI controller for the Oh Jee!! J/88 Tactician.
 * Wires state <-> views, weather fetch, course building, and rendering.
 * ===========================================================================*/
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const G = window.JGEO, DATA = window.JDATA, WX = window.JWX;
  const DEFAULT_VARIATION = DATA.VENUE.variationDeg; // fallback if the live lookup fails

  /* ---------------- state ---------------- */
  const DEFAULTS = {
    venueName: '', lat: '', lon: '', raceTime: nextThursday1800(),
    tws: 10, wdir: 240, drift: 0, set: 0,
    variation: DEFAULT_VARIATION,               // auto-updated from location on fetch
    marks: [], courseType: 'WL2', wwBearing: '', legLen: 0.8,
    canOneMode: false, courseLetters: '', coLaps: '1', coRound: 'port',
    spatialWind: null, currentSeries: null,
    liveOverride: null, // null = auto (arms in race window), true = forced on, false = paused
  };
  let S = load();

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('ohjee') || '{}')); }
    catch { return { ...DEFAULTS }; }
  }
  function save() { localStorage.setItem('ohjee', JSON.stringify(S)); }

  function localISO(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function nextThursday1800() {
    const d = new Date(); d.setSeconds(0, 0);
    const add = (4 - d.getDay() + 7) % 7 || 7; // 4 = Thursday
    d.setDate(d.getDate() + add); d.setHours(18, 0);
    return localISO(d);
  }

  /* ---------------- heading formatting (magnetic-only) ---------------- */
  // The app is magnetic-only: boat compass + RC course board are magnetic.
  // Internal math stays in TRUE; we convert for display/entry using S.variation,
  // which is pulled live from the venue location (BGS WMM) on each fetch.
  const magOf = (trueDeg) => G.toMag(trueDeg, S.variation);   // true → magnetic
  const trueOf = (magDeg) => G.norm360(magDeg + S.variation); // magnetic → true
  function head(trueDeg) { return { num: Math.round(magOf(trueDeg)), unit: '°M' }; }
  const num = (x) => { const n = parseFloat(x); return isFinite(n) ? n : 0; };

  /* ============================================================ NAV */
  document.querySelectorAll('nav button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('nav button').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      b.classList.add('active');
      $('view-' + b.dataset.view).classList.add('active');
      stopLLWatch(); // stop live GPS whenever we leave/switch tabs
      if (b.dataset.view === 'plan') renderPlan();
      if (b.dataset.view === 'tune') renderTune();
      if (b.dataset.view === 'start') refreshBias();
      if (b.dataset.view === 'layline') { showLayline(pendingTarget); pendingTarget = null; }
      window.scrollTo(0, 0);
    });
  });

  /* ============================================================ NIGHT MODE */
  if (localStorage.getItem('ohjee-night') === '1') document.body.classList.add('night');
  $('nightBtn').addEventListener('click', () => {
    document.body.classList.toggle('night');
    localStorage.setItem('ohjee-night', document.body.classList.contains('night') ? '1' : '0');
    $('nightBtn').textContent = document.body.classList.contains('night') ? '☀️' : '🌙';
  });

  /* ============================================================ CONDITIONS */
  // magnitude sliders (no frame): TWS, current drift
  [['tws', 'twsVal', 0], ['drift', 'driftVal', 1]].forEach(([id, valId, dp]) => {
    const s = $(id); s.value = S[id];
    s.addEventListener('input', () => {
      S[id] = num(s.value);
      $(valId).textContent = dp ? S[id].toFixed(dp) : Math.round(S[id]);
      pauseLive(); // manual override wins — stop live from stomping it
      save(); renderCondStrip();
    });
    $(valId).textContent = dp ? num(S[id]).toFixed(dp) : Math.round(S[id]);
  });
  // direction sliders operate in °MAGNETIC; S.wdir / S.set stay TRUE for the math
  [['wdir', 'wdirVal', 'wdirCompass'], ['set', 'setVal', 'setCompass']].forEach(([id, valId, compId]) => {
    const s = $(id);
    s.addEventListener('input', () => {
      const magv = num(s.value);
      S[id] = trueOf(magv);
      $(valId).textContent = Math.round(magv);
      $(compId).textContent = G.compass(magv);
      pauseLive(); // manual override wins — stop live from stomping it
      save(); renderCondStrip();
    });
  });
  syncDirSliders();

  ['lat', 'lon', 'raceTime', 'wwBearing', 'legLen', 'courseType'].forEach((id) => {
    const e = $(id); if (e == null) return; e.value = S[id];
    e.addEventListener('input', () => { S[id] = e.value; save(); });
  });

  // push S.wdir/S.set (true) onto the magnetic direction sliders + labels
  function syncDirSliders() {
    [['wdir', 'wdirVal', 'wdirCompass'], ['set', 'setVal', 'setCompass']].forEach(([id, valId, compId]) => {
      const m = Math.round(magOf(S[id]));
      $(id).value = m; $(valId).textContent = m; $(compId).textContent = G.compass(magOf(S[id]));
    });
  }

  /* ---- venue search / gps ---- */
  $('geoBtn').addEventListener('click', async () => {
    const q = $('geoSearch').value.trim(); if (!q) return;
    $('geoResults').innerHTML = '<div class="muted">Searching…</div>';
    try {
      const res = await WX.geocode(q);
      if (!res.length) { $('geoResults').innerHTML = '<div class="muted">No matches.</div>'; return; }
      $('geoResults').innerHTML = '';
      res.forEach((p) => {
        const d = el('div', 'geo-result', `<b>${p.name}</b><br><span class="muted">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</span>`);
        d.addEventListener('click', () => {
          S.lat = p.lat.toFixed(4); S.lon = p.lon.toFixed(4); S.venueName = p.name;
          $('lat').value = S.lat; $('lon').value = S.lon; $('geoResults').innerHTML = `<div class="muted">📍 ${p.name}</div>`;
          save();
        });
        $('geoResults').appendChild(d);
      });
    } catch (e) { $('geoResults').innerHTML = `<div class="note warn">Search failed: ${e.message}</div>`; }
  });
  $('useGps').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('No geolocation on this device.');
    $('useGps').textContent = '📍 locating…';
    navigator.geolocation.getCurrentPosition((pos) => {
      S.lat = pos.coords.latitude.toFixed(4); S.lon = pos.coords.longitude.toFixed(4);
      $('lat').value = S.lat; $('lon').value = S.lon; $('useGps').textContent = '📍 Use my location'; save();
    }, () => { $('useGps').textContent = '📍 Use my location'; alert('Could not get location.'); });
  });

  /* ---- forecast fetch ---- */
  $('fetchBtn').addEventListener('click', async () => {
    const lat = num($('lat').value), lon = num($('lon').value);
    if (!lat || !lon) { $('fetchHint').innerHTML = '<span class="note warn" style="display:block">Set a venue / lat-lon first.</span>'; return; }
    S.lat = $('lat').value; S.lon = $('lon').value; S.raceTime = $('raceTime').value || S.raceTime; save();
    $('fetchBtn').textContent = '⏳ Fetching…';
    try {
      // use the venue's NOAA tidal-current station if we're racing near it
      const V = DATA.VENUE;
      const nearVenue = G.distanceNm({ lat, lon }, { lat: V.startLat, lon: V.startLon }) < 15;
      const station = nearVenue ? V.currentStation : null;
      const samplePts = nearVenue ? V.windSamplePoints : null;
      const fc = await WX.fetchForecast(lat, lon, S.raceTime, station, samplePts);
      if (fc.variation != null) S.variation = fc.variation; // live declination for this location
      S.spatialWind = (fc.spatial && fc.spatial.length >= 3) ? fc.spatial : null;
      if (fc.wind) {
        S.tws = fc.wind.speed; S.wdir = fc.wind.dir;
        $('tws').value = Math.round(S.tws); $('twsVal').textContent = S.tws.toFixed(0);
        syncDirSliders();
        $('gustVal').textContent = fc.wind.gust ? `gust ${fc.wind.gust} kt` : '';
        $('windSrc').textContent = `· ${fc.wind.model} · ${fmtTime(fc.wind.time)}`;
      }
      renderWindTimeline(fc.windTimeline);
      renderWindModels(fc.windModels, fc.windSpread, fc.wind);
      if (fc.current) {
        S.drift = fc.current.drift; S.set = fc.current.set;
        $('drift').value = S.drift; $('driftVal').textContent = S.drift.toFixed(1);
        syncDirSliders();
      }
      if (fc.currentSeries) { S.currentSeries = fc.currentSeries; S.currentSeriesCenter = S.raceTime; renderCurrentTimeline(S.raceTime); }
      $('curSrc').textContent = fc.currentSource || '';
      save(); renderCondStrip();
      const warn = fc.warnings.length ? `<span class="note warn" style="display:block;margin-top:6px">${fc.warnings.join(' ')}</span>` : '';
      const vtxt = `headings °M · var ${Math.abs(S.variation).toFixed(1)}°${S.variation < 0 ? 'W' : 'E'} (auto)`;
      $('fetchHint').innerHTML = `Loaded forecast for ${fmtTime(S.raceTime)} · ${vtxt}.${warn}`;
    } catch (e) {
      $('fetchHint').innerHTML = `<span class="note warn" style="display:block">Fetch failed: ${e.message}. Enter conditions manually.</span>`;
    }
    $('fetchBtn').textContent = '⛅ Fetch wind & current forecast';
  });

  /* ---- LIVE mode: measured wind (Kings Point) + tide at this minute.
   * Arms itself around race time (start −1 h → +2.5 h), refreshes every 6 min
   * (the station's cadence), and pauses on any manual slider override so it
   * never fights the tactician. liveOverride: null=auto, true=on, false=paused. */
  let liveLast = 0, liveBusy = false;
  function inRaceWindow() {
    const rt = new Date(S.raceTime.replace(' ', 'T')).getTime();
    if (!isFinite(rt)) return false;
    const now = Date.now();
    return now >= rt - 60 * 60000 && now <= rt + 150 * 60000;
  }
  function liveIsOn() {
    if (S.liveOverride === true) return true;
    if (S.liveOverride === false) return false;
    return inRaceWindow();
  }
  function pauseLive() { if (liveIsOn()) { S.liveOverride = false; save(); liveTick(); } }
  async function updateToNow() {
    if (liveBusy) return; liveBusy = true; liveLast = Date.now();
    const nowISO = localISO(new Date());
    try {
      const w = await WX.fetchLiveWind();
      S.tws = w.speed; S.wdir = w.dir; // observation is TRUE "from"
      $('tws').value = Math.round(S.tws); $('twsVal').textContent = S.tws.toFixed(0);
      syncDirSliders();
      $('gustVal').textContent = w.gust ? `gust ${w.gust} kt` : '';
      $('windSrc').textContent = `· 🔴 LIVE ${w.station} · ${w.time.slice(11, 16)}`;
    } catch (e) { $('windSrc').textContent = '· ⚠ live wind unavailable'; }
    try {
      const c = await WX.fetchNoaaCurrent(DATA.VENUE.currentStation, nowISO);
      S.drift = c.drift; S.set = c.set; S.currentSeries = c.series; S.currentSeriesCenter = nowISO;
      $('drift').value = S.drift; $('driftVal').textContent = S.drift.toFixed(1);
      syncDirSliders();
      $('curSrc').textContent = `NOAA ${c.station} · 🔴 ${c.flooding ? 'flooding' : 'ebbing'} ${c.drift.toFixed(2)} kt at ${c.time.slice(11, 16)}`;
      renderCurrentTimeline(nowISO);
    } catch (e) { /* keep the last tide reading */ }
    save(); renderCondStrip();
    liveBusy = false; liveTick();
  }
  function liveTick() {
    const b = $('liveBtn'); if (!b) return;
    if (liveIsOn()) {
      b.textContent = '🔴 LIVE — auto-updating every 6 min · tap to pause';
      if (Date.now() - liveLast > 5.5 * 60000) updateToNow();
    } else {
      b.textContent = inRaceWindow() ? '⏸ Live paused — tap to resume' : '📡 Live wind & tide — tap to turn on';
    }
  }
  $('liveBtn').addEventListener('click', () => {
    S.liveOverride = liveIsOn() ? false : true;
    save(); liveTick();
  });
  setInterval(liveTick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) liveTick(); });

  /* ---- tide timeline through the race window (from the NOAA series) ---- */
  function renderCurrentTimeline(centerISO) {
    const box = $('curTimeline'); if (!box) return; box.innerHTML = '';
    const ser = S.currentSeries; if (!ser || ser.length < 2) return;
    const center = new Date((centerISO || S.raceTime).replace(' ', 'T')).getTime();
    const tOf = (r) => new Date(r.time.replace(' ', 'T')).getTime();
    const win = ser.filter((r) => tOf(r) >= center - 45 * 60000 && tOf(r) <= center + 3 * 3600000);
    if (!win.length) return;
    const hd = el('div', 'muted');
    hd.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px';
    hd.textContent = 'Tide through the race';
    box.appendChild(hd);
    let bi = 0, bd = Infinity;
    win.forEach((r, i) => { const dd = Math.abs(tOf(r) - center); if (dd < bd) { bd = dd; bi = i; } });
    const row = el('div', 'cond-strip'); row.style.marginTop = '0';
    win.forEach((r, i) => {
      const cell = el('div', 'chip'); cell.style.textAlign = 'center';
      if (i === bi) { cell.style.borderColor = 'var(--accent)'; cell.style.color = 'var(--txt)'; }
      cell.innerHTML =
        `<div style="font-size:10px;color:var(--dim)">${r.time.slice(11, 16)}</div>` +
        `<div style="font-size:16px;font-weight:800">${r.drift.toFixed(1)}<span style="font-size:10px;color:var(--dim)"> kt</span></div>` +
        `<div style="font-size:10px;color:var(--dim)">${r.flooding ? 'flood' : 'ebb'} <span style="display:inline-block;transform:rotate(${Math.round(magOf(r.set))}deg)">↑</span></div>`;
      row.appendChild(cell);
    });
    box.appendChild(row);
    let turn = null;
    for (let i = 0; i < ser.length - 1; i++) {
      const t1 = tOf(ser[i]);
      if (t1 < center - 30 * 60000) continue;
      if (t1 > center + 3 * 3600000) break;
      if (ser[i].flooding !== ser[i + 1].flooding) {
        turn = `↕ Tide turns to ${ser[i + 1].flooding ? 'flood' : 'ebb'} ~${ser[i + 1].time.slice(11, 16)} — the current flips mid-race; plan the later legs for it.`;
        break;
      }
    }
    box.appendChild(turn ? el('div', 'note', turn)
      : el('div', 'muted', `No turn in the race window — ${win[bi].flooding ? 'flooding' : 'ebbing'} throughout.`));
  }

  // race-window wind timeline — shows the dying/building slope through the start window
  function renderWindTimeline(tl) {
    const box = $('windTimeline'); if (!box) return; box.innerHTML = '';
    if (!tl || tl.length < 2) return;
    const hd = el('div', 'muted');
    hd.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px';
    hd.textContent = 'Race window';
    box.appendChild(hd);
    const row = el('div', 'cond-strip'); row.style.marginTop = '0';
    tl.forEach((p) => {
      const h = head(p.dir);
      const cell = el('div', 'chip'); cell.style.textAlign = 'center';
      if (p.isRace) { cell.style.borderColor = 'var(--accent)'; cell.style.color = 'var(--txt)'; }
      cell.innerHTML =
        `<div style="font-size:10px;color:var(--dim)">${p.time.slice(11, 16)}</div>` +
        `<div style="font-size:18px;font-weight:800">${p.speed}<span style="font-size:10px;color:var(--dim)"> kt</span></div>` +
        `<div style="font-size:10px;color:var(--dim)"><span style="display:inline-block;transform:rotate(${(p.dir + 180) % 360}deg)">↑</span> ${h.num}${h.unit}</div>`;
      row.appendChild(cell);
    });
    box.appendChild(row);
    const first = tl[0], last = tl[tl.length - 1], d = Math.round((last.speed - first.speed) * 10) / 10;
    let note;
    if (d <= -3) note = `↘ Dying ${first.speed}→${last.speed} kt across the window — tune for the lulls and hunt the last pressure (hold offshore).`;
    else if (d >= 3) note = `↗ Building ${first.speed}→${last.speed} kt — don't over-depower early.`;
    else note = `→ Roughly steady (${Math.min(first.speed, last.speed)}–${Math.max(first.speed, last.speed)} kt) through the window.`;
    box.appendChild(el('div', 'muted', note));
  }

  // single passive confidence readout (HRRR is the wind; spread judges trust)
  function renderWindModels(models, spread, primary) {
    const box = $('windModels'); if (!box) return; box.innerHTML = '';
    if (!spread) return;
    const conf = spread.confidence;
    const cc = { High: 'var(--ok)', Medium: 'var(--warn)', Low: 'var(--beat)' }[conf] || 'var(--dim)';
    const line = el('div', '');
    line.style.cssText = 'display:flex;align-items:center;gap:8px;margin:14px 0 0';
    line.innerHTML = `<span class="muted" style="font-size:12px">Forecast confidence</span>` +
      `<span style="margin-left:auto;font-weight:800;color:${cc}">${conf}</span>`;
    box.appendChild(line);
    let note, warn = true;
    if (spread.light)
      note = `🌬 Light & variable (${spread.meanSpeed} kt) — direction is unreliable below ~5 kt; treat side calls as a coin-toss.`;
    else if (conf === 'Low')
      note = '⚠ Models disagree — likely a sea-breeze / transitional setup. Keep options open; don\'t commit hard to one side.';
    else if (conf === 'High') { note = '✓ Models agree — a settled gradient breeze. You can commit to your plan.'; warn = false; }
    else { note = 'Broad agreement with some spread — sail your shifts as usual.'; warn = false; }
    box.appendChild(el('div', warn ? 'note warn' : 'note', note));
  }

  /* ============================================================ COND STRIP */
  function renderCondStrip() {
    const strip = $('condStrip'); strip.innerHTML = '';
    const wd = head(S.wdir);
    strip.appendChild(el('div', 'chip', `Wind <b>${Math.round(S.tws)} kt</b> @ ${wd.num}${wd.unit} ${G.compass(S.wdir)}`));
    strip.appendChild(el('div', S.drift > 0.05 ? 'chip' : 'chip', S.drift > 0.05
      ? `Current <b>${S.drift.toFixed(1)} kt</b> → ${G.compass(S.set)}` : `Current <b>none</b>`));
    const tg = G.targets(S.tws);
    strip.appendChild(el('div', 'chip', `Beat <b>${tg.upBSP.toFixed(1)} kt</b> @${tg.upTWA.toFixed(0)}° · ${tg.upHeel.toFixed(0)}° heel`));
    strip.appendChild(el('div', 'chip', `Run <b>${tg.dnBSP.toFixed(1)} kt</b> @${tg.dnTWA.toFixed(0)}° · ${tg.dnHeel.toFixed(0)}° heel`));
    const active = getActiveMarks();
    const nm = S.canOneMode && active.length ? ('A ' + (S.courseLetters || '').toUpperCase().trim()).trim() + (+S.coLaps > 1 ? ' ×' + S.coLaps : '')
      : active.length ? `${active.length} marks` : 'no course';
    strip.appendChild(el('div', active.length ? 'chip' : 'chip empty', `Course <b>${nm}</b>`));
  }

  /* ============================================================ COURSE */
  $('genCourse').addEventListener('click', () => {
    const lat = num($('lat').value), lon = num($('lon').value);
    if (!lat || !lon) return alert('Set venue lat/lon on the Conditions tab first.');
    const start = { lat, lon };
    const ww = $('wwBearing').value === '' ? S.wdir : trueOf(num($('wwBearing').value)); // input °M
    const len = num($('legLen').value) || 0.8;
    const W = G.destination(start, ww, len);
    const marks = [];
    const push = (name, p) => marks.push({ name, lat: p.lat, lon: p.lon });
    const type = $('courseType').value;
    push('Start', start);
    if (type.startsWith('WL')) {
      const laps = +type.slice(2);
      for (let i = 0; i < laps; i++) { push('W' + (i + 1), W); push(i === laps - 1 ? 'Finish' : 'L' + (i + 1), start); }
    } else { // triangle
      const wing = G.destination(start, ww - 55, len * 0.9);
      push('W1', W); push('Wing', wing); push('L1', start); push('W2', W); push('Finish', start);
    }
    S.marks = marks; S.wwBearing = $('wwBearing').value; S.legLen = len; S.canOneMode = false; save();
    renderMarks(); renderCondStrip();
  });

  $('addMark').addEventListener('click', () => {
    const name = $('mkName').value.trim() || ('M' + (S.marks.length));
    const magBrng = $('mkBrng').value === '' ? null : num($('mkBrng').value); // entered in °M
    const dist = num($('mkDist').value);
    let base;
    if (S.marks.length) { const last = S.marks[S.marks.length - 1]; base = { lat: last.lat, lon: last.lon }; }
    else { const lat = num($('lat').value), lon = num($('lon').value); if (!lat && !lon) return alert('Set venue lat/lon or generate a course first.'); base = { lat, lon }; }
    const p = (magBrng != null || dist) ? G.destination(base, magBrng == null ? 0 : trueOf(magBrng), dist) : base;
    if (S.canOneMode) { S.canOneMode = false; S.marks = []; }
    S.marks.push({ name, lat: p.lat, lon: p.lon });
    $('mkName').value = $('mkBrng').value = $('mkDist').value = '';
    save(); renderMarks(); renderCondStrip();
  });
  $('clearMarks').addEventListener('click', () => { S.marks = []; S.canOneMode = false; save(); renderMarks(); renderCondStrip(); });

  /* ---- Can One course engine (driven by the SI Appendix A2 matrix) ---- */
  const CO = DATA.CAN_ONE_MARKS;
  const aRow = (code) => CO.matrix.A[code];           // [magBrng, nm] from start
  const isTableMark = (code) => code === 'A' || !!CO.matrix[code];

  function startMark() {
    const lat = num($('lat').value) || DATA.VENUE.startLat, lon = num($('lon').value) || DATA.VENUE.startLon;
    return { code: 'A', name: 'Start (A)', lat, lon };
  }
  // build the live marks array from the signaled letters + laps (W computed upwind)
  function buildCanOneMarks() {
    const letters = (S.courseLetters || '').toUpperCase().replace(/[^A-Z]/g, ' ').split(/\s+/).filter(Boolean);
    const start = startMark();
    const pos = G.reconstructMarks(CO, start, S.variation); // {A:{lat,lon}, B:{...}, ...}
    const lookup = (L) => {
      if (L === 'A') return start;
      if (pos[L]) return { code: L, name: 'Mark ' + L, lat: pos[L].lat, lon: pos[L].lon };
      return null;
    };
    const seq = letters.map(lookup).filter(Boolean);
    if (!seq.length) return [];
    const laps = Math.max(1, +S.coLaps || 1);
    const out = [start];
    for (let i = 0; i < laps; i++) { seq.forEach((m) => out.push(m)); if (i < laps - 1) out.push(start); }
    out.push(Object.assign({}, start, { name: 'Finish (A)' }));
    return out;
  }
  // authoritative leg override from the matrix when both ends are fixed marks
  function coLegPre(a, b) {
    if (S.canOneMode && a.code && b.code && a.code !== 'W' && b.code !== 'W'
        && isTableMark(a.code) && isTableMark(b.code) && a.code !== b.code) {
      return G.matrixLeg(CO, a.code, b.code, S.variation);
    }
    return null;
  }
  function getActiveMarks() { return S.canOneMode ? buildCanOneMarks() : S.marks; }

  const courseSeq = () => (S.courseLetters || '').toUpperCase().split(/\s+/).filter(Boolean);
  function toggleMark(code) {
    const seq = courseSeq(); const i = seq.indexOf(code);
    if (i >= 0) seq.splice(i, 1); else seq.push(code); // tap order = course order
    S.courseLetters = seq.join(' '); save();
    renderCoChips(); renderCondStrip();
  }
  function renderCoChips() {
    const box = $('coChips'); box.innerHTML = '';
    const seq = courseSeq();
    CO.codes.filter((c) => c !== 'A').forEach((code) => {
      const idx = seq.indexOf(code), sel = idx >= 0;
      const c = el('div', 'chip' + (sel ? ' chip-sel' : ''),
        code + (sel ? `<span class="ord">${idx + 1}</span>` : ''));
      c.title = 'Mark ' + code;
      c.addEventListener('click', () => toggleMark(code));
      box.appendChild(c);
    });
    const sq = $('coSeq');
    if (sq) sq.innerHTML = seq.length
      ? `Course: <b style="color:var(--txt)">A → ${seq.join(' → ')} → A</b>`
      : 'Tap marks in race order; tap again to remove.';
  }
  $('coBuild').addEventListener('click', () => {
    S.coLaps = $('coLaps').value; S.coRound = $('coRound').value;
    S.canOneMode = true; save();
    const m = buildCanOneMarks();
    if (m.length < 2) { alert('Tap at least one mark (e.g. W, then a leeward mark).'); return; }
    renderMarks(); renderCondStrip();
    document.querySelector('nav button[data-view="plan"]').click();
  });
  ['coLaps', 'coRound'].forEach((id) => {
    const e = $(id); if (!e) return; e.value = S[id] || e.value;
    e.addEventListener('input', () => { S[id] = e.value; save(); });
  });
  $('useCanOne').addEventListener('click', () => {
    const V = DATA.VENUE;
    S.lat = V.startLat.toFixed(4); S.lon = V.startLon.toFixed(4); S.venueName = V.name; S.raceTime = nextThursday1800();
    $('lat').value = S.lat; $('lon').value = S.lon; $('raceTime').value = S.raceTime;
    save(); renderCondStrip();
    $('venueHint').innerHTML = `📍 ${V.name} · headings in °M (var ${Math.abs(V.variationDeg)}°W) · VHF ${V.vhf} · first warning ${V.firstWarning}.`;
  });
  renderCoChips();

  function renderMarks() {
    const box = $('markList'); box.innerHTML = '';
    const active = getActiveMarks();
    $('markCount').textContent = active.length ? `(${active.length})` : '';
    if (S.canOneMode) {
      const b = el('div', 'note', `⚓ Can One course <b>${(S.courseLetters || '').toUpperCase().trim()}</b>${(+S.coLaps > 1) ? ' ×' + S.coLaps : ''} · round to <b>${S.coRound === 'stbd' ? 'starboard' : 'port'}</b>. W re-computes with the wind. <a href="#" id="exitCo" style="color:var(--accent)">edit / clear</a>`);
      box.appendChild(b);
      box.querySelector('#exitCo').addEventListener('click', (e) => { e.preventDefault(); S.canOneMode = false; save(); renderMarks(); renderCondStrip(); });
    }
    if (!active.length) { box.appendChild(el('div', 'empty-state', '<div class="em">🗺️</div>Build tonight\'s Can One course above, or add marks below.')); return; }
    active.forEach((m, i) => {
      const row = el('div', 'mark', `<div class="idx">${m.code || i}</div>
        <div><div class="nm">${m.name}</div><div class="co">${coordLine(m)}</div></div>`);
      if (!S.canOneMode) {
        const del = el('button', 'del', '×'); del.addEventListener('click', () => { S.marks.splice(i, 1); save(); renderMarks(); renderCondStrip(); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  function coordLine(m) {
    if (S.canOneMode) {
      if (m.code === 'A') return 'Start / Finish';
      if (m.code === 'W') return `windward · ${DATA.CAN_ONE_MARKS.windwardLegNm} nm upwind of A`;
      const r = aRow(m.code);
      if (r) return `from A: ${r[0]}°M · ${r[1]} nm`;
    }
    return `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`;
  }

  // shore/offshore pressure-gradient call (lite spatial wind).
  // Returns {text, actionable} when data is loaded, or null when none fetched.
  // actionable=false (dimmed) when the gradient is within model noise — so the
  // feature is always visible after a fetch, but only nudges a side when real.
  function spatialNote(pts, windDir, startMarkObj) {
    if (!pts || pts.length < 3) return null;
    const speeds = pts.map((p) => p.speed);
    const grad = Math.round((Math.max(...speeds) - Math.min(...speeds)) * 10) / 10;
    const dirs = pts.map((p) => p.dir); let bendDeg = 0;
    const sep2 = (x, y) => { const d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
    for (let a = 0; a < dirs.length; a++) for (let b = a + 1; b < dirs.length; b++) {
      bendDeg = Math.max(bendDeg, sep2(dirs[a], dirs[b]));
    }
    // direction is meaningless in light air — only flag a bend in a real breeze
    const bend = (Math.max(...speeds) >= 6 && bendDeg >= 25)
      ? ` Wind bends ~${Math.round(bendDeg)}° across the area — expect a geographic shift.` : '';
    if (grad < 2) return { text: `🧭 Pressure even across the course (${grad} kt spread) — no side favored.${bend}`, actionable: false };
    const hi = pts.find((p) => p.speed === Math.max(...speeds));
    if (hi.label === 'Mid') return { text: `🧭 Pressure peaks mid-course (~${grad} kt over the edges) — no strong side bias.${bend}`, actionable: true };
    const start = startMarkObj || { lat: DATA.VENUE.startLat, lon: DATA.VENUE.startLon };
    const side = G.signed(windDir, G.bearing(start, { lat: hi.lat, lon: hi.lon })) > 0 ? 'right' : 'left';
    return { text: `🧭 Pressure: ~${grad} kt more ${hi.label.toLowerCase()} — favor the ${side} of the first beat.${bend}`, actionable: true };
  }

  /* ============================================================ PLAN */
  function renderPlan() {
    const body = $('planBody'); body.innerHTML = '';
    const wd = head(S.wdir);
    $('planCond').textContent = `· ${Math.round(S.tws)} kt @ ${wd.num}${wd.unit}${S.drift > 0.05 ? ` · cur ${S.drift.toFixed(1)} kt` : ''}`;
    $('planTotals').innerHTML = '';
    const marks = getActiveMarks();
    if (marks.length < 2) {
      body.appendChild(el('div', 'empty-state', '<div class="em">🧭</div>Build tonight\'s course on the Course tab to get a plan.'));
      return;
    }
    if (S.canOneMode) {
      const round = S.coRound === 'stbd' ? 'STARBOARD (green placard)' : 'PORT';
      body.appendChild(el('div', 'note', `⚓ <b>${(S.courseLetters || '').toUpperCase().trim()}</b>${(+S.coLaps > 1) ? ' ×' + S.coLaps : ''} · round marks to <b>${round}</b> · start/finish at A. Time limit ${DATA.VENUE.timeLimitMin} min.`));
    }
    const sn = spatialNote(S.spatialWind, S.wdir, marks[0]);
    if (sn) {
      const e = el('div', 'note', sn.text);
      if (!sn.actionable) e.style.opacity = '0.55';
      body.appendChild(e);
    }
    const env = { windDir: S.wdir, tws: S.tws, set: S.set, drift: S.drift };
    let totalDist = 0, totalMin = 0, unknown = false;
    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i], b = marks[i + 1];
      const leg = G.solveLeg(a, b, env, coLegPre(a, b));
      totalDist += leg.distanceNm;
      if (leg.etaMin) totalMin += leg.etaMin; else unknown = true;
      body.appendChild(renderLeg(i + 1, codeName(a), codeName(b), leg, b, marks));
    }
    const over = totalMin > DATA.VENUE.timeLimitMin;
    $('planTotals').innerHTML =
      `<div><b>${totalDist.toFixed(2)}</b> nm</div><div style="${over ? 'color:var(--warn)' : ''}"><b>${fmtDur(totalMin)}</b>${unknown ? '+' : ''} est.</div><div><b>${marks.length - 1}</b> legs</div>`;
    if (S.canOneMode && over)
      body.appendChild(el('div', 'note warn', `⚠ Estimated ${fmtDur(totalMin)} exceeds the 90-min limit at ${Math.round(S.tws)} kt — RC may shorten course.`));
  }
  function codeName(m) {
    if (!m.code) return m.name;
    if (m.name === m.code || m.name === 'Mark ' + m.code) return 'Mark ' + m.code;
    if (m.name && m.name.indexOf(m.code) >= 0) return m.name;
    return `${m.code} · ${m.name}`;
  }

  function renderLeg(n, fromName, toName, leg, toMark, allMarks) {
    const cls = leg.type;
    const badge = { beat: 'badge-beat', reach: 'badge-reach', run: 'badge-run' }[leg.type];
    const card = el('div', `card leg ${cls}`);
    const bh = head(leg.bearing);
    card.appendChild(el('div', 'leg-head', `
      <div class="leg-num">${n}</div>
      <div class="leg-title">${fromName} → ${toName}</div>
      <div class="leg-badge ${badge}">${leg.type}</div>`));
    card.appendChild(el('div', 'leg-meta', `
      <span>Rhumb <b>${bh.num}${bh.unit}</b></span>
      <span><b>${leg.distanceNm.toFixed(2)}</b> nm</span>
      <span>TWA <b>${Math.round(leg.twaRhumb)}°</b></span>
      <span>Heel <b>${Math.round(leg.targetHeel)}°</b></span>
      <span>Sail <b>${leg.sail}</b></span>
      ${leg.etaMin ? `<span>~<b>${fmtDur(leg.etaMin)}</b></span>` : ''}`));

    if (leg.type === 'beat' || leg.type === 'run') {
      const heads = el('div', 'heads');
      leg.options.forEach((o) => {
        const h = head(o.headingTrue), cog = head(o.cogTrue);
        const card2 = el('div', 'head' + (o.favored ? ' fav' : ''), `
          <div class="lab"><span>${o.tack} ${leg.type === 'beat' ? 'tack' : 'gybe'}</span>${o.favored ? '<span class="star">★ go</span>' : ''}</div>
          <div class="hd">${h.num}<span class="deg">${h.unit}</span></div>
          <div class="sub2">${o.boatSpeed.toFixed(1)} kt · COG ${cog.num}${cog.unit} · VMG→mark ${o.vmgMark.toFixed(1)} kt</div>`);
        heads.appendChild(card2);
      });
      card.appendChild(heads);
      // layline calls — lead with the operative sequence (sail the favored/long tack,
      // then tack/gybe onto the OTHER tack at ITS layline bearing = its current-adjusted COG)
      const verb = leg.type === 'run' ? 'gybe' : 'tack';
      const fav = leg.options[0], other = leg.options[1];
      const note = el('div', 'note');
      note.innerHTML =
        `📐 <b>Layline (current-adjusted):</b> sail the ${fav.tack.toLowerCase()} ${verb} (favored), then ` +
        `${verb} to <b>${other.tack.toLowerCase()}</b> when ${toName} bears <b>${head(other.cogTrue).num}°M</b>.` +
        `<div class="muted" style="margin-top:4px">Mirror — if on ${other.tack.toLowerCase()}: ${verb} to ${fav.tack.toLowerCase()} when ${toName} bears ${head(fav.cogTrue).num}°M.</div>`;
      card.appendChild(note);
      if (toMark && toMark.lat != null) {
        const llBtn = el('button', 'btn ghost small', '📐 Live layline assist');
        llBtn.style.marginTop = '10px';
        llBtn.addEventListener('click', () => { pendingTarget = toMark; document.querySelector('nav button[data-view="layline"]').click(); });
        card.appendChild(llBtn);
      }
    } else {
      const o = leg.options[0]; const h = head(o.headingTrue);
      const heads = el('div', 'heads');
      heads.appendChild(el('div', 'head fav', `
        <div class="lab"><span>Steer (${o.tack})</span><span class="star">★</span></div>
        <div class="hd">${h.num}<span class="deg">${h.unit}</span></div>
        <div class="sub2">${o.boatSpeed.toFixed(1)} kt boat · SOG ${o.sog.toFixed(1)} kt · TWA ${Math.round(o.twa)}°</div>`));
      card.appendChild(heads);
    }
    (leg.notes || []).forEach((nte) => card.appendChild(el('div', 'note' + (nte.startsWith('⚠') ? ' warn' : ''), nte)));
    return card;
  }

  /* ============================================================ TUNE */
  function renderTune() {
    const body = $('tuneBody'); body.innerHTML = '';
    const tws = S.tws;
    const band = DATA.TUNING_BANDS.find((b) => tws >= b.tws[0] && tws < b.tws[1]) || DATA.TUNING_BANDS[DATA.TUNING_BANDS.length - 1];
    const tg = G.targets(tws);

    const top = el('div', 'card');
    top.appendChild(el('div', '', `<span class="band-pill">${band.windRange}</span>
      <span class="muted" style="margin-left:8px">@ ${Math.round(tws)} kt TWS</span>`));
    const grid = el('div', 'tune-grid'); grid.style.marginTop = '12px';
    const cells = [
      ['Uppers V1 (turns)', band.uppers, 'uppers'], ['Lowers D1 (turns)', band.lowers, 'lowers'],
      ['Intermediates D2', band.intermediates, 'intermediates'], ['Jib inhaul', band.jibInhaul, 'jibInhaul'],
      ['Jib lead', band.jibLead, 'jibLead'], ['Outhaul', band.outhaul, 'outhaul'],
      ['Traveler (up)', band.traveler, 'traveler'], ['Vang (up)', band.vang, 'vang'],
      ['Backstay (up)', band.backstay, 'backstay'], ['Jib furl (dn)', band.jibFurl, 'jibFurl'],
      ['Jib (up)', band.jib, 'jib'], ['Spin (dn)', band.spin, 'spin'],
    ];
    cells.forEach(([k, v, key]) => grid.appendChild(el('div', 'tune-cell',
      `<div class="k">${k}${key ? ` <button class="cell-info" data-info="${key}" aria-label="How to tune ${k}">i</button>` : ''}</div><div class="v">${v}</div>`)));
    top.appendChild(grid);
    top.appendChild(el('div', 'note', band.notes));
    body.appendChild(top);

    const tcard = el('div', 'card');
    tcard.appendChild(el('h2', 'section', 'Targets')); tcard.firstChild.style.margin = '0 0 8px';
    const tgrid = el('div', 'tune-grid');
    [['Upwind speed', tg.upBSP.toFixed(1) + ' kt'], ['Upwind TWA', tg.upTWA.toFixed(0) + '°'],
     ['Upwind heel', tg.upHeel.toFixed(0) + '°'], ['Downwind heel', tg.dnHeel.toFixed(0) + '°'],
     ['Downwind speed', tg.dnBSP.toFixed(1) + ' kt'], ['Downwind TWA', tg.dnTWA.toFixed(0) + '°']]
      .forEach(([k, v]) => tgrid.appendChild(el('div', 'tune-cell', `<div class="k">${k}</div><div class="v">${v}</div>`)));
    tcard.appendChild(tgrid);
    if (tws >= DATA.PLANING_THRESHOLD_KT) tcard.appendChild(el('div', 'note', `🔥 ${Math.round(tws)} kt — planing breeze. Downwind, heat it up and send it; footing pays huge.`));
    body.appendChild(tcard);

    const base = DATA.TUNING_BASE;
    const bcard = el('div', 'card');
    bcard.appendChild(el('h2', 'section', 'Base dock-tune reference <button class="cell-info" data-info="base" aria-label="What base means">i</button>')); bcard.firstChild.style.margin = '0 0 8px';
    bcard.appendChild(el('div', 'muted', `${base.loosGauge} · ${base.mast} mast · base (10–14 kt): Uppers <b style="color:var(--txt)">${base.uppers}</b>, Lowers <b style="color:var(--txt)">${base.lowers}</b>, Intermediates <b style="color:var(--txt)">${base.intermediates}</b>`));
    bcard.appendChild(el('div', 'note', `${base.rakeRef}. ${base.spreaderMarks}. ${base.jibCarBase}.`));
    bcard.appendChild(el('div', 'note', base.note));
    bcard.appendChild(el('div', 'note', '👥 ' + base.crewWeight));
    body.appendChild(bcard);
  }

  /* ============================================================ TIPS */
  function renderTips() {
    const body = $('tipsBody'); body.innerHTML = '';
    const V = DATA.VENUE;
    const vcard = el('div', 'card tight');
    vcard.appendChild(el('h2', 'section', '⚓ Can One — race rules')); vcard.firstChild.style.margin = '0 0 4px';
    vcard.appendChild(el('div', 'muted', `${V.series} · Larchmont YC · W. Long Island Sound · VHF ${V.vhf} · first warning ${V.firstWarning}`));
    DATA.COURSE_RULES.forEach((t) => vcard.appendChild(el('div', 'tip', `<span class="dot">▸</span><span>${t}</span>`)));
    vcard.appendChild(el('div', 'note', '🏆 ' + V.fleetNote));
    body.appendChild(vcard);
    const phases = [['twilight', '🌆 Twilight / dying breeze'], ['start', '🏁 Starts'], ['upwind', '⬆️ Upwind'], ['downwind', '⬇️ Downwind'],
      ['maneuvers', '🔄 Maneuvers'], ['current', '🌊 Current']];
    phases.forEach(([key, title]) => {
      const c = el('div', 'card tight');
      c.appendChild(el('h2', 'section', title)); c.firstChild.style.margin = '0 0 4px';
      DATA.TIPS[key].forEach((t) => c.appendChild(el('div', 'tip', `<span class="dot">▸</span><span>${t}</span>`)));
      body.appendChild(c);
    });
    const src = $('srcBody'); src.innerHTML = '';
    DATA.SOURCES.forEach((s) => src.appendChild(el('div', 'tip', `<span class="dot">▸</span><a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)));
  }

  /* ---------------- formatters ---------------- */
  function fmtTime(iso) { try { return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
  function fmtDur(min) { if (min == null) return '—'; const m = Math.round(min); if (m < 60) return m + 'm'; return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }

  /* ============================================================ START
   * Countdown with "sync to gun" (snaps to nearest minute) + audio cues,
   * and a line-bias calculator (GPS-ping both ends, or sight the bearing). */
  let stRunning = false, stEndTs = 0, stSeq = 300, stPaused = 300, stLastSec = null;
  let stMuted = localStorage.getItem('ohjee-mute') === '1';
  let stAudio = null, rcPos = null, stLineBrgT = null, stLineLenM = null;
  const BOAT_LEN_M = 8.84; // J/88 LOA

  // Air-horn blast at max output. Loudness within the phone's hardware ceiling:
  // detuned sawtooth stack (harmonically rich ≫ sine), sub-octave for body,
  // compressor to maximize density, gain 1.0, hard attack.
  function beep(freq, dur, vol) {
    if (stMuted) return;
    try {
      stAudio = stAudio || new (window.AudioContext || window.webkitAudioContext)();
      if (stAudio.state === 'suspended') stAudio.resume();
      const t0 = stAudio.currentTime;
      const comp = stAudio.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 14;
      comp.attack.value = 0.002; comp.release.value = 0.08;
      const master = stAudio.createGain();
      master.gain.setValueAtTime(vol, t0);
      comp.connect(master); master.connect(stAudio.destination);
      const env = stAudio.createGain(); env.connect(comp);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(1, t0 + 0.015);            // hard attack
      env.gain.setValueAtTime(1, t0 + Math.max(0.05, dur - 0.05));     // full sustain
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);         // quick tail
      // horn voicing: two detuned saws (beating grit) + sub-octave square + bright 2nd
      [[freq, 'sawtooth', 0.5], [freq * 1.006, 'sawtooth', 0.5],
       [freq / 2, 'square', 0.35], [freq * 2.01, 'sawtooth', 0.18]].forEach(([f, type, g]) => {
        const o = stAudio.createOscillator(), og = stAudio.createGain();
        o.type = type; o.frequency.value = f; og.gain.value = g;
        o.connect(og); og.connect(env);
        o.start(t0); o.stop(t0 + dur + 0.05);
      });
    } catch (e) { /* no audio */ }
  }
  function fmtClock(rem) {
    const sign = rem < 0 ? '+' : ''; const a = Math.abs(rem);
    return `${sign}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`;
  }
  function stTick() {
    const el = $('startClock'); if (!el) return;
    const rem = stRunning ? (stEndTs - Date.now()) / 1000 : stPaused;
    el.textContent = fmtClock(rem);
    el.style.color = rem <= 0 ? 'var(--run)' : rem <= 60 ? 'var(--warn)' : 'var(--txt)';
    if (!stRunning) return;
    const sec = Math.ceil(rem - 0.0001);
    if (sec !== stLastSec) {
      stLastSec = sec;
      if (sec > 0 && [60, 30, 20, 10].includes(sec)) beep(520, 0.45, 1);  // short horn blast
      else if (sec > 0 && sec <= 5) beep(680, 0.22, 1);                   // rapid final blips
      else if (sec === 0) beep(440, 1.8, 1);                              // the gun — long blast
    }
  }

  function setupStart() {
    $('seqLen').value = String(stSeq); stPaused = stSeq;
    $('muteBtn').textContent = stMuted ? '🔇 Muted' : '🔊 Sound on';
    $('syncBtn').addEventListener('click', () => {
      if (!stAudio) { try { stAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (stAudio && stAudio.state === 'suspended') stAudio.resume();
      if (!stRunning) { stRunning = true; stEndTs = Date.now() + stSeq * 1000; stLastSec = null; }
      else { const rem = (stEndTs - Date.now()) / 1000; stEndTs = Date.now() + Math.round(rem / 60) * 60000; }
      stTick();
    });
    $('resetBtn').addEventListener('click', () => { stRunning = false; stPaused = stSeq; stLastSec = null; stTick(); });
    $('seqLen').addEventListener('change', () => { stSeq = +$('seqLen').value; if (!stRunning) { stPaused = stSeq; stTick(); } });
    $('muteBtn').addEventListener('click', () => {
      stMuted = !stMuted; localStorage.setItem('ohjee-mute', stMuted ? '1' : '0');
      $('muteBtn').textContent = stMuted ? '🔇 Muted' : '🔊 Sound on';
    });
    $('lineBrg').addEventListener('input', () => {
      const v = $('lineBrg').value; stLineBrgT = v === '' ? null : trueOf(num(v)); stLineLenM = null; refreshBias();
    });
    $('pingRC').addEventListener('click', stPing);
    setInterval(stTick, 100); stTick();
  }

  // The Can One start line is committee boat → Mark A (known position), so a single
  // committee-boat ping is all that's needed.
  function stPing() {
    if (!navigator.geolocation) return alert('No GPS on this device.');
    $('pingState').textContent = '📍 getting position…';
    navigator.geolocation.getCurrentPosition((pos) => {
      rcPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const a = startMark();
      stLineBrgT = G.bearing(rcPos, a);
      stLineLenM = G.distanceNm(rcPos, a) * 1852;
      $('lineBrg').value = head(stLineBrgT).num;
      $('pingState').textContent = 'Committee boat ✓ pinged · line → Mark A.';
      refreshBias();
    }, () => { $('pingState').textContent = 'Could not get GPS fix.'; }, { enableHighAccuracy: true, timeout: 8000 });
  }

  // favored end = the one further upwind; bias° = how far off square the line is
  function refreshBias() {
    const box = $('biasOut'); if (!box) return;
    if (stLineBrgT == null) { box.innerHTML = ''; return; }
    const rel = G.signed(S.wdir, stLineBrgT);          // line bearing relative to wind-from
    const cosRel = Math.cos(rel * Math.PI / 180);      // >0 ⇒ pin (line "to" end) is upwind
    const biasDeg = Math.abs(Math.abs(rel) - 90);      // 0 = square
    if (Math.abs(cosRel) < 0.035 || biasDeg < 2) {
      box.innerHTML = `<div class="bias-big">Square line <span class="muted" style="font-size:13px">(${biasDeg.toFixed(0)}° off)</span></div><div class="muted">No end bias — start for clear air and speed.</div>`;
      return;
    }
    const favored = cosRel > 0 ? 'Mark A' : 'Committee-boat';
    const bl = stLineLenM ? ` · ~${(stLineLenM * Math.abs(cosRel) / BOAT_LEN_M).toFixed(1)} boat lengths` : '';
    box.innerHTML = `<div class="bias-big" style="color:var(--accent)">${favored} end favored</div>` +
      `<div class="muted">${biasDeg.toFixed(0)}° off square${bl} — line ${G.compass(magOf(stLineBrgT))} (${head(stLineBrgT).num}°M), wind ${head(S.wdir).num}°M.</div>`;
  }

  /* ============================================================ LIVE LAYLINE ASSIST
   * Full-screen overlay: live GPS + a target mark → real-time bearing to the mark,
   * the two current-adjusted layline bearings, "° to go" / TACK NOW / OVERSTOOD. */
  let llWatchId = null, llTarget = null, llMarks = [], llBoat = null, llPrev = null, llCog = null, llAcc = null, pendingTarget = null;
  let llTrk = { ema: null, n: 0, hist: [] }; // GPS-derived wind (shift tracker)

  function setupLayline() {
    $('llMark').addEventListener('change', () => { llTarget = llMarks[+$('llMark').value] || llTarget; renderLive(); });
    // "Apply tracked wind" button is re-rendered each fix — use a delegated handler
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'llApply' && llTrk.ema != null) {
        S.wdir = Math.round(llTrk.ema * 10) / 10;
        S.liveOverride = false; // tracked wind beats the shore station — pause live
        syncDirSliders(); save(); renderCondStrip(); renderLive();
        $('windSrc').textContent = '· 🧭 tracked from your tacks';
      }
    });
  }
  // entering the Layline tab: build the mark list from the current course, target `target`
  function showLayline(target) {
    const seen = new Set(); llMarks = [];
    getActiveMarks().forEach((m) => { if (m.lat == null) return; const k = m.code || m.name; if (seen.has(k)) return; seen.add(k); llMarks.push(m); });
    const sel = $('llMark'); sel.innerHTML = '';
    if (!llMarks.length) { $('llBody').innerHTML = '<div class="ll-markline">Build a course on the Course tab, then pick a mark to lay.</div>'; return; }
    llMarks.forEach((m, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = m.code ? `${m.code} · ${m.name}` : m.name; sel.appendChild(o); });
    let idx = target ? llMarks.findIndex((m) => m.code ? m.code === target.code : m.name === target.name) : -1;
    if (idx < 0) idx = llMarks.findIndex((m) => m.code && m.code !== 'A'); // default: first non-start mark
    if (idx < 0) idx = 0;
    sel.value = String(idx); llTarget = llMarks[idx];
    llBoat = null; llPrev = null; llCog = null; llAcc = null;
    llTrk = { ema: null, n: 0, hist: [] };
    startLLWatch(); renderLive();
  }
  function stopLLWatch() { if (llWatchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(llWatchId); llWatchId = null; } }
  function startLLWatch() {
    if (!navigator.geolocation) { $('llBody').innerHTML = '<div class="ll-markline">No GPS on this device.</div>'; return; }
    stopLLWatch();
    llWatchId = navigator.geolocation.watchPosition((pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      llAcc = pos.coords.accuracy;
      if (!llPrev) llPrev = p;
      else if (G.distanceNm(llPrev, p) * 1852 > 4) { llCog = G.bearing(llPrev, p); llPrev = p; }
      if (pos.coords.heading != null && pos.coords.speed != null && pos.coords.speed > 0.7) llCog = pos.coords.heading;
      llBoat = p; trackWind(pos.coords); renderLive();
    }, (e) => { $('llBody').innerHTML = `<div class="ll-markline">GPS error: ${e.message}. Enable location.</div>`; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
  }
  function renderLive() {
    const body = $('llBody'); if (!llTarget) return;
    const env = { windDir: S.wdir, tws: S.tws, set: S.set, drift: S.drift };
    const lays = G.laylines(env);
    const stbd = lays.find((l) => l.tack === 'Starboard'), port = lays.find((l) => l.tack === 'Port');
    const markName = llTarget.code ? `${llTarget.code} · ${llTarget.name}` : llTarget.name;
    if (!llBoat) { body.innerHTML = `<div class="ll-markline">Waiting for GPS fix… make sure location is allowed.</div>`; return; }
    const B = G.bearing(llBoat, llTarget), dist = G.distanceNm(llBoat, llTarget);
    const toGoStbd = G.signed(stbd.cog, B);   // + = still to go, − = overstood
    const toGoPort = G.signed(B, port.cog);
    let activeTack = llCog != null ? (G.signed(env.windDir, llCog) < 0 ? 'Starboard' : 'Port') : null;
    // the layline you're approaching is the OPPOSITE tack's (the one you'll tack onto)
    let active = activeTack === 'Port' ? { tack: 'Starboard', toGo: toGoStbd }
      : activeTack === 'Starboard' ? { tack: 'Port', toGo: toGoPort } : null;
    let callHtml;
    if (active) {
      const tg = active.toGo;
      if (tg <= 3 && tg >= -3) callHtml = `<div class="ll-call go"><div class="verb">TACK TO ${active.tack.toUpperCase()}</div><div class="big">NOW</div></div>`;
      else if (tg < -3) callHtml = `<div class="ll-call over"><div class="verb">OVERSTOOD the ${active.tack.toLowerCase()} layline</div><div class="big">${Math.abs(Math.round(tg))}°</div><div class="verb">past — you can bear off to the mark</div></div>`;
      else callHtml = `<div class="ll-call"><div class="verb">Tack to ${active.tack.toLowerCase()} in</div><div class="big">${Math.round(tg)}°</div></div>`;
    } else callHtml = `<div class="ll-call"><div class="verb">Get moving to read your tack — laylines below</div></div>`;
    const togoTxt = (t) => t >= 0 ? `${Math.round(t)}° to go` : `${Math.abs(Math.round(t))}° over`;
    const rows = `<div class="ll-rows">` +
      `<div class="ll-row ${active && active.tack === 'Starboard' ? 'active' : ''}"><div class="k">Stbd layline</div><div class="cog">${head(stbd.cog).num}°M</div><div class="togo">${togoTxt(toGoStbd)}</div></div>` +
      `<div class="ll-row ${active && active.tack === 'Port' ? 'active' : ''}"><div class="k">Port layline</div><div class="cog">${head(port.cog).num}°M</div><div class="togo">${togoTxt(toGoPort)}</div></div>` +
      `</div>`;
    const accWarn = llAcc && llAcc > 25;
    const acc = `<div class="ll-acc ${accWarn ? 'warn' : ''}">GPS ±${Math.round(llAcc || 0)} m${accWarn ? ' — low accuracy' : ''}${activeTack ? ` · on ${activeTack.toLowerCase()} tack` : ''}</div>`;
    // shift tracker readout — the boat as wind sensor
    let trk;
    if (llTrk.n >= 8 && llTrk.ema != null) {
      const shift = G.signed(S.wdir, llTrk.ema);
      const mag = Math.abs(Math.round(shift));
      const old = llTrk.hist.find((h) => Date.now() - h.t > 8 * 60000);
      const trend = old ? ` · was ${head(old.w).num}°M ${Math.round((Date.now() - old.t) / 60000)}m ago` : '';
      const verdict = mag < 3
        ? `matches the plan wind${trend}`
        : `<b>${mag}° ${shift > 0 ? 'RIGHT' : 'LEFT'}</b> of plan → <b>${shift > 0 ? 'starboard' : 'port'} tack lifted</b>${trend}`;
      trk = `<div class="note" style="text-align:center">🧭 Tracked wind <b>${head(llTrk.ema).num}°M</b> — ${verdict}<br>` +
        `<button class="btn sec small" id="llApply" style="margin-top:8px">Apply ${head(llTrk.ema).num}°M to plan</button></div>`;
    } else {
      trk = `<div class="ll-acc">🧭 Shift tracker: sail close-hauled for a minute to lock the wind…</div>`;
    }
    body.innerHTML = `<div class="ll-markline"><b>${markName}</b> · ${dist.toFixed(2)} nm · bears <b>${head(B).num}°M</b></div>` + callHtml + rows + trk + acc;
  }

  // Derive the true wind from GPS while beating: convert ground velocity to the
  // water frame (subtract current), then implied wind = heading ± target TWA by tack.
  function trackWind(c) {
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const sogKt = (c.speed != null ? c.speed : 0) * 1.9438;
    const cog = (c.heading != null && c.speed != null && c.speed > 0.7) ? c.heading : llCog;
    if (cog == null || sogKt < 1.5) return;
    const vgE = sogKt * Math.sin(cog * D2R), vgN = sogKt * Math.cos(cog * D2R);
    const cE = (S.drift || 0) * Math.sin(S.set * D2R), cN = (S.drift || 0) * Math.cos(S.set * D2R);
    const vwE = vgE - cE, vwN = vgN - cN;
    if (Math.hypot(vwE, vwN) < 1.5) return;
    const hdg = G.norm360(Math.atan2(vwE, vwN) * R2D);
    const stbd = G.signed(S.wdir, hdg) < 0;
    const implied = G.norm360(hdg + (stbd ? 1 : -1) * G.targets(S.tws).upTWA);
    if (Math.abs(G.signed(S.wdir, implied)) > 30) return; // not close-hauled → ignore
    llTrk.ema = llTrk.ema == null ? implied : G.norm360(llTrk.ema + 0.12 * G.signed(llTrk.ema, implied));
    llTrk.n++;
    const now = Date.now();
    if (!llTrk.hist.length || now - llTrk.hist[llTrk.hist.length - 1].t > 5000) llTrk.hist.push({ t: now, w: llTrk.ema });
    while (llTrk.hist.length && now - llTrk.hist[0].t > 15 * 60000) llTrk.hist.shift();
  }

  /* ============================================================ INFO POPOVER
   * Tap an ⓘ (data-info="key") anywhere → explanation modal from DATA.TUNE_INFO. */
  function openInfo(key) {
    const info = DATA.TUNE_INFO[key]; if (!info) return;
    $('infoTitle').textContent = info.title;
    $('infoText').textContent = info.text;
    $('infoModal').hidden = false;
  }
  function closeInfo() { $('infoModal').hidden = true; }
  function setupInfo() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.cell-info');
      if (b && b.dataset.info) openInfo(b.dataset.info);
    });
    $('infoClose').addEventListener('click', closeInfo);
    $('infoModal').addEventListener('click', (e) => { if (e.target.id === 'infoModal') closeInfo(); });
  }

  /* ---------------- init ---------------- */
  $('nightBtn').textContent = document.body.classList.contains('night') ? '☀️' : '🌙';
  renderCondStrip(); renderMarks(); renderTips(); setupStart(); setupLayline(); setupInfo();
  renderCurrentTimeline(S.currentSeriesCenter || S.raceTime); // restore the tide timeline
  liveTick(); // set the LIVE button state (self-arms if we're already in the race window)
})();
