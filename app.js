const byId = id => document.getElementById(id);
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const fullDateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
const noteFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const countFormat = new Intl.NumberFormat('pt-BR');
const pullCount = count => countFormat.format(count) + (count === 1 ? ' puxada' : ' puxadas');

let today = calendarDay();
const journeyDay = () => today - journeyStore.state.start + 1;
const closestDay = day => Math.min(JOURNEY_LENGTH, Math.max(1, day));
let selected = closestDay(journeyDay());
let activeSection;

function announce(message) {
  byId('announcement').textContent = message;
}

function showSection(moveFocus = false) {
  const hash = location.hash.slice(1).replace(/^pane-/, '');
  const section = hash === 'metodo' ? 'metodo' : ['diario', 'comunidade'].includes(hash) ? 'diario' : 'jornada';
  document.querySelectorAll('.nav a').forEach(link => {
    const active = link.hash === '#' + section;
    byId(link.hash.slice(1)).hidden = !active;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const heading = byId(section).querySelector('h1');
  document.title = heading.textContent + ' — BeyondVape';
  if (moveFocus && section !== activeSection) {
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  activeSection = section;
}

function renderNotice() {
  byId('storageNotice').textContent = journeyStore.notice;
  byId('storageNotice').hidden = !journeyStore.notice;
}

function renderDay() {
  const { start, days } = journeyStore.state;
  const entry = days[selected];
  const used = entry?.used ?? 0;
  const closed = entry?.closed === true;
  const future = selected > journeyDay();
  const target = getTarget(selected);
  const date = (start + selected - 1) * DAY_MS;
  const dateLabel = dayFormat.format(date);
  const onDate = journeyDay() === selected;
  byId('dayDate').textContent = onDate ? 'Hoje · ' + dateLabel : dateLabel;
  byId('todayDate').textContent = fullDateFormat.format(today * DAY_MS);
  byId('dayTitle').firstChild.textContent = 'Dia ' + selected + ' ';
  byId('dayMeta').textContent = 'Meta de ' + pullCount(target);
  byId('counterVal').textContent = future ? '—' : countFormat.format(used);
  byId('counterVal').classList.toggle('long-value', used > 999);
  byId('counterLabel').textContent = used === 1 ? 'puxada registrada' : 'puxadas registradas';
  const amount = target ? Math.min(100, used * 100 / target) : (used > 0 || closed ? 100 : 0);
  byId('dial').style.setProperty('--amount', amount + '%');
  document.querySelector('.instrument').classList.toggle('over-target', used > target);
  let status;
  if (future) status = 'O registro abre em ' + dateLabel + '.';
  else if (used > target) status = pullCount(used - target) + ' acima da meta.';
  else if (closed) status = 'Dia concluído dentro da meta.';
  else if (!target) status = 'Conclua o dia para registrar seu resultado.';
  else if (used === target) status = 'Você chegou à meta do dia.';
  else status = pullCount(target - used) + ' abaixo do limite do dia.';
  if (closed && used > target) status = 'Dia concluído. ' + status;
  byId('counterRemaining').textContent = status;
  byId('btnPrevDay').disabled = selected === 1;
  byId('btnNextDay').disabled = selected === JOURNEY_LENGTH;
  byId('btnAddPuff').disabled = future || closed || used === Number.MAX_SAFE_INTEGER;
  byId('btnUndoPuff').disabled = future || closed || !used;
  byId('btnFinishDay').disabled = future;
  byId('btnFinishDay').textContent = closed ? 'Reabrir dia' : !used && !future ? 'Concluir com zero' : 'Concluir dia';
  byId('btnToday').disabled = selected === closestDay(journeyDay());
  byId('btnToday').textContent = journeyDay() > JOURNEY_LENGTH ? 'Ir para o último dia' : 'Ir para hoje';
}

function renderMetrics() {
  const { days, settings } = journeyStore.state;
  const closed = Object.entries(days).filter(([, entry]) => entry.closed);
  const total = closed.reduce((sum, [, entry]) => sum + entry.used, 0);
  const avoided = settings && Math.max(0, closed.length * settings.baseline - total);
  byId('sumDays').textContent = closed.length;
  byId('sumDaysSuccess').textContent = closed.filter(([day, entry]) => entry.used <= getTarget(Number(day))).length;
  byId('sumPuffsAvoided').textContent = settings ? countFormat.format(avoided) : '—';
  byId('sumMoneySaved').textContent = settings?.capacity ? moneyFormat.format(avoided * settings.price / settings.capacity) : '—';
  byId('openSettings').textContent = settings ? 'Editar estimativas' : 'Configurar estimativas';
}

const chart = byId('daysList');
const dayButtons = Array.from({ length: JOURNEY_LENGTH }, (_, index) => {
  const button = document.createElement('button');
  const bar = document.createElement('span');
  bar.className = 'chart-bar';
  bar.setAttribute('aria-hidden', 'true');
  button.type = 'button';
  button.dataset.day = index + 1;
  button.append(bar, String(index + 1));
  chart.append(button);
  return button;
});

function renderChart() {
  const { days } = journeyStore.state;
  const scale = Math.max(30, ...Object.values(days).map(entry => entry.used));
  dayButtons.forEach((button, index) => {
    const day = index + 1;
    const entry = days[day];
    const target = getTarget(day);
    let description = 'Dia ' + day + ', meta de ' + pullCount(target);
    if (entry) description += ', ' + pullCount(entry.used) + (entry.closed ? ', concluído' : ', em aberto');
    else description += day > journeyDay() ? ', futuro' : ', sem registro';
    button.setAttribute('aria-label', description);
    button.title = description;
    button.setAttribute('aria-pressed', String(day === selected));
    if (day === journeyDay()) button.setAttribute('aria-current', 'date');
    else button.removeAttribute('aria-current');
    button.style.setProperty('--used', (entry?.used ?? 0) / scale * 100 + '%');
    button.style.setProperty('--target', target / scale * 100 + '%');
    button.classList.toggle('closed', Boolean(entry?.closed));
  });
}

function selectDay(day) {
  selected = closestDay(day);
  renderDay();
  renderChart();
  announce(dayButtons[selected - 1].title);
}

function renderNotes() {
  const list = byId('postsList');
  const fragment = document.createDocumentFragment();
  for (const note of journeyStore.state.notes) {
    const item = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'note-head';
    const time = document.createElement('time');
    time.dateTime = new Date(note.time).toISOString();
    time.textContent = noteFormat.format(note.time);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-btn';
    remove.textContent = 'Excluir';
    remove.dataset.note = note.id;
    remove.setAttribute('aria-label', 'Excluir anotação de ' + time.textContent);
    const body = document.createElement('p');
    body.textContent = note.text;
    head.append(time, remove);
    item.append(head, body);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
  byId('emptyNotes').hidden = list.childElementCount > 0;
}

function renderTracker() {
  renderNotice();
  renderDay();
  renderChart();
  renderMetrics();
}

async function changeDay(action) {
  const day = selected;
  await journeyStore.update(state => {
    if (day > calendarDay() - state.start + 1) return;
    const entry = state.days[day] ?? { used: 0, closed: false };
    if (action === 'close') entry.closed = true;
    else if (action === 'reopen') entry.closed = false;
    else if (entry.closed) return;
    else if (action === 'add' && entry.used < Number.MAX_SAFE_INTEGER) entry.used++;
    else if (action === 'undo' && entry.used > 0) entry.used--;
    if (entry.used || entry.closed) state.days[day] = entry;
    else delete state.days[day];
  });
  renderTracker();
  announce(dayButtons[day - 1].title);
}

byId('btnAddPuff').addEventListener('click', () => changeDay('add'));
byId('btnUndoPuff').addEventListener('click', () => changeDay('undo'));
byId('btnFinishDay').addEventListener('click', () => changeDay(journeyStore.state.days[selected]?.closed ? 'reopen' : 'close'));
byId('btnPrevDay').addEventListener('click', () => selectDay(selected - 1));
byId('btnNextDay').addEventListener('click', () => selectDay(selected + 1));
byId('btnToday').addEventListener('click', () => selectDay(journeyDay()));
chart.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  selectDay(Number(button.dataset.day));
  byId('dayTitle').focus();
});
chart.addEventListener('keydown', event => {
  const day = Number(event.target.dataset.day);
  const next = { ArrowLeft: day - 1, ArrowRight: day + 1, Home: 1, End: JOURNEY_LENGTH }[event.key];
  if (!day || next === undefined) return;
  event.preventDefault();
  dayButtons[closestDay(next) - 1].focus();
});

const noteInput = byId('postInput');
noteInput.addEventListener('input', () => { byId('btnSendPost').disabled = !noteInput.value.trim(); });
byId('noteForm').addEventListener('submit', async event => {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text || byId('btnSendPost').disabled) return;
  byId('btnSendPost').disabled = true;
  const note = { id: crypto.randomUUID?.() ?? Date.now() + '-' + Math.random(), text, time: Date.now() };
  await journeyStore.update(state => { state.notes.unshift(note); });
  if (noteInput.value.trim() === text) noteInput.value = '';
  byId('btnSendPost').disabled = !noteInput.value.trim();
  renderNotes();
  renderNotice();
  announce(journeyStore.persistent ? 'Anotação salva.' : 'Anotação guardada nesta sessão.');
  noteInput.focus();
});

byId('postsList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-note]');
  if (!button || !confirm('Excluir esta anotação do diário?')) return;
  await journeyStore.update(state => { state.notes = state.notes.filter(note => note.id !== button.dataset.note); });
  renderNotes();
  renderNotice();
  announce('Anotação excluída.');
  noteInput.focus();
});

const settingsDialog = byId('settings');
const baseline = byId('baseline');
const price = byId('price');
const capacity = byId('capacity');
byId('openSettings').addEventListener('click', () => {
  const settings = journeyStore.state.settings;
  baseline.value = settings?.baseline ?? '';
  price.value = settings?.price ?? '';
  capacity.value = settings?.capacity ?? '';
  price.required = Boolean(capacity.value);
  capacity.required = Boolean(price.value);
  settingsDialog.showModal();
});
byId('cancelSettings').addEventListener('click', () => settingsDialog.close());
byId('settingsForm').addEventListener('input', () => {
  price.required = Boolean(capacity.value);
  capacity.required = Boolean(price.value);
});
byId('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const settings = { baseline: baseline.valueAsNumber, price: price.valueAsNumber || null, capacity: capacity.valueAsNumber || null };
  await journeyStore.update(state => { state.settings = settings; });
  settingsDialog.close();
  renderTracker();
  announce('Estimativas atualizadas.');
});

function sync() {
  const wasToday = selected === closestDay(journeyDay());
  journeyStore.refresh();
  today = calendarDay();
  if (wasToday) selected = closestDay(journeyDay());
  renderTracker();
  renderNotes();
}

let midnightTimer;
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  midnightTimer = setTimeout(() => { sync(); scheduleMidnight(); }, Math.max(100, midnight - Date.now()));
}

window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) sync(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { sync(); scheduleMidnight(); }
});
window.addEventListener('pageshow', sync);
window.addEventListener('hashchange', () => showSection(true));
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  byId(activeSection).querySelector('h1').focus();
});

showSection();
renderTracker();
renderNotes();
scheduleMidnight();
