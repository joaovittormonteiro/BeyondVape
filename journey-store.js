// A local calendar day expressed as an integer, independent of daylight-saving changes.
const DAY_MS = 86400000;
const JOURNEY_LENGTH = 30;
const STORAGE_KEY = 'bv_journey_v2';

function calendarDay(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function getTarget(day) {
  return Math.round(30 * (JOURNEY_LENGTH - day) / (JOURNEY_LENGTH - 1));
}

function inRange(value, max, min = 0) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const journeyStore = (() => {
  let persistent = true;
  let notice = '';
  let state;

  function read(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      useMemory();
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      notice = 'O navegador encontrou um registro ilegível. Os dados válidos continuam disponíveis.';
      return null;
    }
  }

  function useMemory() {
    persistent = false;
    notice = 'O armazenamento deste navegador está indisponível. Os registros desta sessão podem ser perdidos ao sair.';
  }

  function write() {
    if (!persistent) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      useMemory();
    }
  }

  function fromLegacy() {
    const legacy = read('bv_puffs');
    const days = {};
    for (let day = 1; day <= JOURNEY_LENGTH; day++) {
      if (isRecord(legacy) && inRange(legacy[day], Number.MAX_SAFE_INTEGER)) {
        days[day] = { used: legacy[day], closed: false };
      }
    }
    // The older counter saved day numbers, with no start date or completion state.
    const last = Math.max(1, ...Object.keys(days).map(Number));
    if (Object.keys(days).length && persistent) {
      notice = 'Histórico recuperado. Como os registros antigos não tinham datas, o último dia com registro foi associado a hoje. Confira os dias anteriores e conclua os que estiverem completos.';
    }
    return { start: calendarDay() - last + 1, days, notes: [], settings: null };
  }

  function sanitize(raw) {
    if (!isRecord(raw) || !inRange(raw.start, 1000000, -1000000)) return null;
    const days = {};
    for (let day = 1; day <= JOURNEY_LENGTH; day++) {
      const entry = raw.days?.[day];
      if (isRecord(entry) && inRange(entry.used, Number.MAX_SAFE_INTEGER)) {
        days[day] = { used: entry.used, closed: entry.closed === true };
      }
    }
    const notes = Array.isArray(raw.notes) ? raw.notes.filter(note =>
      isRecord(note) && typeof note.id === 'string' && typeof note.text === 'string'
      && note.text.trim() && inRange(note.time, 8640000000000000)
    ) : [];
    const config = raw.settings;
    let settings = null;
    if (isRecord(config) && inRange(config.baseline, 100000, 1)) {
      const hasCost = Number.isFinite(config.price) && config.price > 0 && config.price <= 100000
        && inRange(config.capacity, 1000000, 1);
      settings = { baseline: config.baseline, price: hasCost ? config.price : null, capacity: hasCost ? config.capacity : null };
    }
    return { start: raw.start, days, notes, settings };
  }

  function refresh() {
    if (!persistent) return;
    const saved = sanitize(read(STORAGE_KEY));
    if (persistent) state = saved ?? fromLegacy();
  }

  state = sanitize(read(STORAGE_KEY));
  if (!state) {
    state = fromLegacy();
    write();
  }

  function update(change) {
    const commit = () => {
      refresh();
      change(state);
      write();
    };
    // Serialize the read/modify/write cycle when the browser supports Web Locks.
    if (persistent && navigator.locks) return navigator.locks.request(STORAGE_KEY, commit);
    commit();
    return Promise.resolve();
  }

  return {
    get state() { return state; },
    get notice() { return notice; },
    get persistent() { return persistent; },
    update, refresh
  };
})();
