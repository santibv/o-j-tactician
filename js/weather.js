/* =============================================================================
 * weather.js — forecast fetch via Open-Meteo (no API key, browser CORS OK).
 *  - Wind  : api.open-meteo.com  (wind_speed/direction/gusts @10m, in knots)
 *  - Current: marine-api.open-meteo.com (ocean current; coastal/ocean only —
 *             inland lakes return null, in which case we leave current manual)
 * Returns the forecast hour nearest the requested race time.
 * ===========================================================================*/
(function () {
  const KMH_TO_KN = 0.539957;

  // Wind models in fallback priority. HRRR first (3 km, resolves coastal sea-breeze).
  const WIND_MODELS = [
    { id: 'gfs_hrrr', label: 'HRRR 3km' },
    { id: 'ecmwf_ifs025', label: 'ECMWF' },
    { id: 'icon_seamless', label: 'ICON' },
    { id: 'gfs_global', label: 'GFS' },
  ];

  // circular spread (deg) covering all bearings = 360 − largest gap
  function circularSpread(dirs) {
    if (dirs.length < 2) return 0;
    const s = dirs.slice().sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 0; i < s.length; i++) {
      const next = i === s.length - 1 ? s[0] + 360 : s[i + 1];
      maxGap = Math.max(maxGap, next - s[i]);
    }
    return Math.round(360 - maxGap);
  }

  // model agreement → forecast confidence.
  // Judge agreement on the higher-resolution models (HRRR/ECMWF/ICON); coarse
  // global GFS is shown as a reference but kept out of the confidence metric.
  function computeSpread(models) {
    const skill = models.filter((m) => m.id !== 'gfs_global');
    const set = skill.length >= 2 ? skill : models;
    const speeds = set.map((m) => m.speed);
    const dirSpread = circularSpread(set.map((m) => m.dir));
    const speedMin = Math.min(...speeds), speedMax = Math.max(...speeds);
    const speedRange = speedMax - speedMin;
    const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    let confidence = 'Low';
    if (dirSpread <= 25 && speedRange <= 4) confidence = 'High';
    else if (dirSpread <= 55 && speedRange <= 8) confidence = 'Medium';
    // in light air, direction is inherently unstable — flag it, cap optimism
    const light = meanSpeed < 5;
    if (light && confidence === 'High') confidence = 'Medium';
    return {
      speedMin, speedMax, speedRange: Math.round(speedRange * 10) / 10,
      dirSpread, confidence, light, meanSpeed: Math.round(meanSpeed * 10) / 10, n: set.length,
    };
  }

  function nearestIndex(times, targetISO) {
    const target = new Date(targetISO).getTime();
    let best = 0, bestDiff = Infinity;
    times.forEach((t, i) => {
      const d = Math.abs(new Date(t).getTime() - target);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
  }

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // NOAA tidal-current prediction for a station, nearest the race time.
  // Velocity_Major is signed: + = flood (sets toward meanFloodDir), − = ebb.
  // Directions are TRUE. Returns drift (kt) + set (deg toward) + the day's series.
  async function fetchNoaaCurrent(stationId, raceTimeISO) {
    const date = raceTimeISO.slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=currents_predictions` +
      `&application=ohjee_tactician&begin_date=${date}&end_date=${date}&station=${stationId}` +
      `&time_zone=lst_ldt&units=english&interval=30&format=json`;
    const j = await getJSON(url);
    const cp = j.current_predictions || {};
    const arr = cp.cp || cp.CP;
    if (!arr || !arr.length) throw new Error('no prediction for this station/date');
    const series = arr.map((r) => {
      const vel = r.Velocity_Major, flooding = vel >= 0;
      return {
        time: r.Time,
        drift: Math.round(Math.abs(vel) * 100) / 100,
        set: Math.round(flooding ? r.meanFloodDir : r.meanEbbDir),
        flooding,
      };
    });
    const target = new Date(raceTimeISO).getTime();
    let best = series[0], bd = Infinity;
    series.forEach((r) => {
      const dd = Math.abs(new Date(r.time.replace(' ', 'T')).getTime() - target);
      if (dd < bd) { bd = dd; best = r; }
    });
    return { ...best, station: stationId, series };
  }

  // Live measured wind from the NOAA Kings Point CO-OPS station (8516945),
  // ~3 nm from the Can One start; updates every 6 minutes. Direction is TRUE.
  async function fetchLiveWind() {
    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind` +
      `&application=ohjee_tactician&station=8516945&date=latest&units=english&time_zone=lst_ldt&format=json`;
    const j = await getJSON(url);
    const d = j.data && j.data[0];
    if (!d) throw new Error('no observation');
    return {
      speed: Math.round(parseFloat(d.s) * 10) / 10,
      gust: Math.round(parseFloat(d.g) * 10) / 10,
      dir: Math.round(parseFloat(d.d)),
      time: d.t, station: 'Kings Point',
    };
  }

  // Sample HRRR (fallback ECMWF) at several points to reveal the spatial wind
  // gradient (shore vs offshore). One multi-location Open-Meteo call.
  async function fetchSpatialWind(points, raceTimeISO) {
    const lats = points.map((p) => p.lat).join(',');
    const lons = points.map((p) => p.lon).join(',');
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&hourly=wind_speed_10m,wind_direction_10m&models=gfs_hrrr,ecmwf_ifs025` +
      `&wind_speed_unit=kn&timezone=auto&forecast_days=7`;
    const data = await getJSON(url);
    const arr = Array.isArray(data) ? data : [data];
    const out = [];
    arr.forEach((loc, idx) => {
      const h = loc.hourly; if (!h) return;
      const i = nearestIndex(h.time, raceTimeISO);
      let sp = h.wind_speed_10m_gfs_hrrr?.[i], di = h.wind_direction_10m_gfs_hrrr?.[i], model = 'HRRR';
      if (sp == null || di == null) { sp = h.wind_speed_10m_ecmwf_ifs025?.[i]; di = h.wind_direction_10m_ecmwf_ifs025?.[i]; model = 'ECMWF'; }
      if (sp == null || di == null) return;
      out.push({ label: points[idx].label, lat: points[idx].lat, lon: points[idx].lon, speed: Math.round(sp * 10) / 10, dir: Math.round(di), model });
    });
    return out;
  }

  // Magnetic declination for a location from the BGS World Magnetic Model
  // (keyless, CORS-open, auto current date). Returns degrees: East +, West −,
  // which matches the app's variation convention (Larchmont ≈ −12.6).
  async function fetchDeclination(lat, lon) {
    const url = `https://geomag.bgs.ac.uk/web_service/GMModels/wmm/2025?latitude=${lat}&longitude=${lon}&altitude=0&format=json`;
    const j = await getJSON(url);
    const v = j['geomagnetic-field-model-result']?.['field-value']?.declination?.value;
    if (typeof v !== 'number') throw new Error('no declination in response');
    return Math.round(v * 10) / 10;
  }

  // raceTimeISO like "2026-07-02T18:30". lat/lon decimal degrees.
  // stationId (optional): NOAA tidal-current station for accurate tidal current.
  // samplePoints (optional): points for the spatial wind gradient.
  async function fetchForecast(lat, lon, raceTimeISO, stationId, samplePoints) {
    const result = { wind: null, windModels: [], windSpread: null, windTimeline: [], spatial: [], variation: null, current: null, currentSource: '', warnings: [], fetchedFor: raceTimeISO };

    // --- magnetic declination for this location (so headings are right anywhere) ---
    try { result.variation = await fetchDeclination(lat, lon); }
    catch (e) { result.warnings.push('Declination lookup failed — using the venue default variation.'); }

    // --- wind: pull several models so we can pick the high-res one AND show spread.
    // Priority order: HRRR (3km, best for coastal sea-breeze) → ECMWF → ICON → GFS global.
    // HRRR only runs ~48 h out, so for forecasts made earlier it falls back automatically.
    const ids = WIND_MODELS.map((m) => m.id).join(',');
    const windUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&models=${ids}&wind_speed_unit=kn&timezone=auto&forecast_days=7`;
    try {
      const w = await getJSON(windUrl);
      const h = w.hourly;
      const i = nearestIndex(h.time, raceTimeISO);
      WIND_MODELS.forEach((m) => {
        const sp = h[`wind_speed_10m_${m.id}`]?.[i];
        const di = h[`wind_direction_10m_${m.id}`]?.[i];
        if (sp == null || di == null) return;
        result.windModels.push({
          id: m.id, label: m.label,
          speed: Math.round(sp * 10) / 10,
          dir: Math.round(di),
          gust: Math.round((h[`wind_gusts_10m_${m.id}`]?.[i] ?? 0) * 10) / 10,
        });
      });
      const primary = result.windModels[0]; // already in priority order
      if (primary) {
        result.wind = { time: h.time[i], speed: primary.speed, dir: primary.dir, gust: primary.gust, model: primary.label, tz: w.timezone };
        result.windSpread = computeSpread(result.windModels);
        // race-window timeline from the primary model — captures the dying/building slope
        for (let k = i - 2; k <= i + 2; k++) {
          if (k < 0 || k >= h.time.length) continue;
          const sp = h[`wind_speed_10m_${primary.id}`]?.[k];
          const di = h[`wind_direction_10m_${primary.id}`]?.[k];
          if (sp == null || di == null) continue;
          result.windTimeline.push({ time: h.time[k], speed: Math.round(sp * 10) / 10, dir: Math.round(di), isRace: k === i });
        }
      } else {
        result.warnings.push('No wind data for that hour.');
      }
    } catch (e) {
      result.warnings.push('Wind forecast unavailable: ' + e.message);
    }

    // --- current: NOAA tidal-current prediction (preferred) ---
    if (stationId) {
      try {
        const c = await fetchNoaaCurrent(stationId, raceTimeISO);
        result.current = { drift: c.drift, set: c.set, time: c.time };
        result.currentSeries = c.series;
        result.currentSource =
          `NOAA ${stationId} · ${c.flooding ? 'flooding' : 'ebbing'} ${c.drift.toFixed(2)} kt at ${c.time.slice(11, 16)}`;
      } catch (e) {
        result.warnings.push('NOAA tidal current unavailable (' + e.message + ') — enter current manually.');
      }
    } else {
      // --- fallback: Open-Meteo ocean current (offshore only; nil in a Sound) ---
      const curUrl =
        `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
        `&hourly=ocean_current_velocity,ocean_current_direction&timezone=auto&forecast_days=7`;
      try {
        const c = await getJSON(curUrl);
        const h = c.hourly;
        if (h && h.time && h.ocean_current_velocity) {
          const i = nearestIndex(h.time, raceTimeISO);
          const velKmh = h.ocean_current_velocity[i];
          if (velKmh != null) {
            result.current = {
              time: h.time[i],
              drift: Math.round(velKmh * KMH_TO_KN * 100) / 100,
              set: Math.round(h.ocean_current_direction[i]),
            };
            result.currentSource = 'Open-Meteo ocean current';
          } else {
            result.warnings.push('No ocean-current data here (inland/lake) — enter current manually.');
          }
        }
      } catch (e) {
        result.warnings.push('Current forecast unavailable (likely inland) — enter current manually.');
      }
    }

    // --- spatial wind gradient (best-effort) ---
    if (samplePoints && samplePoints.length) {
      try { result.spatial = await fetchSpatialWind(samplePoints, raceTimeISO); }
      catch (e) { result.warnings.push('Spatial wind unavailable: ' + e.message); }
    }

    return result;
  }

  // Reverse the venue from a name via Open-Meteo's free geocoder.
  async function geocode(name) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5`;
    const r = await getJSON(url);
    return (r.results || []).map((p) => ({
      name: [p.name, p.admin1, p.country_code].filter(Boolean).join(', '),
      lat: p.latitude, lon: p.longitude,
    }));
  }

  window.JWX = { fetchForecast, geocode, computeSpread, circularSpread, fetchNoaaCurrent, fetchLiveWind };
})();
