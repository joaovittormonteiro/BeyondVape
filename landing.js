const film = document.querySelector('.film');
const frame = document.querySelector('.frame');
const chapters = [...document.querySelectorAll('.chapter')];
const anchorContainer = document.querySelector('.anchors');
const chapterLinks = [...document.querySelectorAll('.top-links a, .chapter-nav a')];
const cue = document.querySelector('.scroll-cue');
const visual = document.querySelector('.visual');
const canvas = document.querySelector('#pod');
const ctx = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const anchors = chapters.slice(1).map(chapter => {
  const marker = document.createElement('span');
  anchorContainer.append(marker);
  return { chapter, marker, id: chapter.id };
});
const stops = [0, .17, .34, .53, .71, .91];
const thresholds = [0, .12, .28, .46, .64, .83];

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

let seed = 41;
function random() {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function rotate([x, y, z], [sx, cx, sy, cy, sz, cz]) {
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy;
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z1 * cy - x * sy];
}

function rotation(x, y, z) {
  return [Math.sin(x), Math.cos(x), Math.sin(y), Math.cos(y), Math.sin(z), Math.cos(z)];
}

// Rounded cross-sections form a solid mesh, with the mouthpiece and seams built into its profile.
const segments = 40;
const partDefinitions = [
  { profile: [[-2.16, .65, .26], [-2.12, .77, .34], [-1.99, .87, .42], [-1.92, .89, .43]], material: 'base' },
  { profile: [[-1.92, .89, .43], [-.91, .90, .44], [.1, .90, .44], [1.07, .89, .43], [1.23, .84, .40]], material: 'shell' },
  { profile: [[1.23, .84, .40], [1.25, .87, .41], [1.35, .87, .41], [1.37, .84, .39]], material: 'rim' },
  { profile: [[1.37, .84, .39], [1.48, .84, .38], [1.72, .74, .34], [2.06, .66, .26], [2.18, .58, .23], [2.24, .50, .18]], material: 'tip' }
];

function ring([y, halfWidth, halfDepth]) {
  const radius = halfDepth * .69;
  return Array.from({ length: segments }, (_, i) => {
    const a = (i + .5) / segments * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    return [Math.sign(x) * (halfWidth - radius) + x * radius, y, Math.sign(z) * (halfDepth - radius) + z * radius];
  });
}

function center(vertices) {
  return [0, 1, 2].map(axis => vertices.reduce((sum, vertex) => sum + vertex[axis], 0) / vertices.length);
}

function normal([a, b, c]) {
  const ab = b.map((value, i) => value - a[i]);
  const ac = c.map((value, i) => value - a[i]);
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const length = Math.hypot(...n) || 1;
  return n.map(value => value / length);
}

const faces = partDefinitions.flatMap(({ profile, material }, part) => {
  const rings = profile.map(ring);
  const result = [];
  const add = (vertices, cap = false) => {
    const origin = center(vertices);
    const direction = Math.atan2(origin[2], origin[0]) + (random() - .5) * 1.1;
    result.push({
      vertices, origin, part, material, cap, normal: normal(vertices),
      offset: [Math.cos(direction) * (1 + random() * 2.4), (random() - .5) * 4.4, Math.sin(direction) * (1 + random() * 2.2)],
      spin: [(random() - .5) * 4, (random() - .5) * 4, (random() - .5) * 4],
      lag: random() * .12
    });
  };
  for (let row = 0; row < rings.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      add([rings[row][i], rings[row + 1][i], rings[row + 1][j], rings[row][j]]);
    }
  }
  // Triangle fans keep the separated pieces closed.
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    add([[0, profile[0][0], 0], rings[0][i], rings[0][j]], true);
    add([[0, profile.at(-1)[0], 0], rings.at(-1)[j], rings.at(-1)[i]], true);
  }
  return result;
});

const colors = {
  shell: [113, 116, 123],
  tip: [36, 37, 40],
  rim: [132, 135, 141],
  base: [48, 49, 53]
};
const separation = [[-.25, -.8, .22], [-.24, -.12, 0], [.16, .38, -.12], [.32, .86, .08]];
const mark = [
  [[-.95, .50], [-.52, .50], [-.12, -.38], [-.56, -.38]],
  [[-.32, .50], [.03, .50], [.19, .16], [.03, -.19]],
  [[.25, .50], [.63, .50], [.13, -.52], [-.22, -.52]]
];

const particles = Array.from({ length: 900 }, (_, index) => {
  const a = random() * Math.PI * 2;
  const spread = Math.sqrt(random()) * 3.9;
  const face = faces[Math.floor(random() * faces.length)];
  const [a0, b0, c0, d0 = c0] = mark[index % 3];
  const t = random();
  const u = random();
  const target = a0.map((coordinate, axis) => lerp(lerp(coordinate, b0[axis], t), lerp(d0[axis], c0[axis], t), u));
  return {
    origin: face.origin,
    cloud: [Math.cos(a) * spread * 1.17, Math.sin(a) * spread * .81, (random() - .5) * 4],
    target: [(target[0] + .16) * 2.7, target[1] * 2.7, (random() - .5) * .29],
    lag: random() * .16,
    size: .5 + random() ** 3 * 2.2,
    phase: random() * Math.PI * 2,
    hue: 199 + random() * 24,
    saturation: index % 5 === 0 ? 90 : 3,
    light: 52 + random() * 35
  };
});

let width = 0;
let height = 0;
let scale = 1;

function sizeCanvas() {
  if (!ctx) return;
  const box = canvas.getBoundingClientRect();
  const density = Math.min(devicePixelRatio || 1, 2);
  width = box.width;
  height = box.height;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  ctx.setTransform(density, 0, 0, density, 0, 0);
  scale = Math.min(width * .175, height * .157);
}

function project([x, y, z]) {
  const perspective = 9 / (9 - z);
  return [width * .5 + x * scale * perspective, height * .49 - y * scale * perspective, z];
}

function path(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.closePath();
}

function drawDecal(turn, open, alpha) {
  const shift = separation[1].map(value => value * open);
  const point = (x, y) => project(rotate([x + shift[0], y + shift[1], .445 + shift[2]], turn));
  if (rotate([0, 0, 1], turn)[2] < .12) return;
  const [x, y] = point(0, 0);
  const [x1, y1] = point(.1, 0);
  const [x2, y2] = point(0, -.1);
  ctx.save();
  ctx.transform((x1 - x) * 10, (y1 - y) * 10, (x2 - x) * 10, (y2 - y) * 10, x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e9eaed';
  for (const polygon of mark) {
    path(polygon.map(([mx, my]) => [(mx + .16) * .39, -my * .39 + .38]));
    ctx.fill();
  }
  ctx.fillStyle = '#d7d9de';
  ctx.font = '.091px "SF Pro Text", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('B E Y O N D', 0, .69);
  ctx.fillStyle = '#75caff';
  ctx.fillRect(-.115, 1.41, .23, .027);
  ctx.restore();
}

function faceColor(face, shade, shine, fracture, y) {
  const tint = face.material === 'shell' ? .83 + (y + 2) * .115 : 1;
  const rgb = colors[face.material].map((value, i) => Math.min(255, Math.round(value * shade * tint + shine * (i === 2 ? 90 : 114) + fracture * 34)));
  return 'rgb(' + rgb.join(',') + ')';
}

function drawSchedule(story) {
  const appear = smooth(.61, .70, story);
  const leave = smooth(.77, .85, story);
  if (!appear || leave === 1) return;

  const turn = rotation(.17, lerp(-.42, .30, smooth(.61, .84, story)), -.14);
  const cards = [[1, 30], [7, 24], [14, 17], [21, 9], [30, 0]].map(([day, goal], i) => {
    const slot = i - 2;
    const enter = smooth(.61 + i * .009, .69 + i * .009, story);
    const origin = [slot * (1.16 + leave * .18), -.30 * slot - (1 - enter) * 1.5 + leave * .7, -.27 * slot];
    const point = (x, y, z = 0) => project(rotate([origin[0] + x, origin[1] + y, origin[2] + z], turn));
    return { day, goal, enter, point, depth: point(0, 0)[2] };
  }).sort((a, b) => a.depth - b.depth);

  for (const { day, goal, enter, point } of cards) {
    if (!enter) continue;
    const front = [point(-.64, .80), point(.64, .80), point(.64, -.80), point(-.64, -.80)];
    const edge = [point(.64, .80, -.14), point(.64, -.80, -.14), point(-.64, -.80, -.14)];
    ctx.globalAlpha = enter * (1 - leave);
    ctx.fillStyle = '#141518';
    path([front[1], edge[0], edge[1], edge[2], front[3], front[2]]);
    ctx.fill();
    const fill = ctx.createLinearGradient(front[0][0], front[0][1], front[3][0], front[3][1]);
    fill.addColorStop(0, '#393c43');
    fill.addColorStop(1, '#232428');
    ctx.fillStyle = fill;
    ctx.strokeStyle = day === 30 ? '#68b2ff' : '#777b83';
    ctx.lineWidth = 1;
    path(front);
    ctx.fill();
    ctx.stroke();

    const [x, y] = point(0, 0, .003);
    const [x1, y1] = point(.1, 0, .003);
    const [x2, y2] = point(0, -.1, .003);
    ctx.save();
    ctx.transform((x1 - x) * 10, (y1 - y) * 10, (x2 - x) * 10, (y2 - y) * 10, x, y);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c8cbd1';
    ctx.font = '.14px "SF Pro Text", sans-serif';
    ctx.fillText('DIA ' + day, 0, -.39);
    ctx.fillText('META', 0, .50);
    ctx.fillStyle = day === 30 ? '#75baff' : '#f3f4f6';
    ctx.font = '.56px "SF Pro", sans-serif';
    ctx.fillText(goal, 0, .24);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawScene(story) {
  if (!ctx || !width || !height) return;
  ctx.clearRect(0, 0, width, height);

  // Each pose is sampled from scroll progress, so scrolling back retraces every fragment.
  const progress = Math.min(.66, story * 1.82);
  const open = smooth(.07, .33, progress);
  const burst = smooth(.24, .53, progress);
  const dissolve = smooth(.33, .56, progress);
  const loop = smooth(.40, .51, story) * (1 - smooth(.58, .69, story));
  const reform = smooth(.77, .95, story);
  const schedule = smooth(.59, .69, story) * (1 - smooth(.78, .89, story));
  const turn = rotation(.20 - open * .30, -.43 + open * 1.14, -.33 - open * .16);
  const loopTurn = rotation(.63 + story * .8, -.23, -.26 + story * .5);

  if (dissolve < 1) {
    const geometry = [];
    for (const face of faces) {
      if (face.cap && open < .005 && face.origin[1] > -2.15 && face.origin[1] < 2.23) continue;
      const fracture = smooth(face.lag * .5, .8 + face.lag, burst);
      const spin = fracture > 0 ? rotation(...face.spin.map(value => value * fracture)) : null;
      const direction = rotate(spin ? rotate(face.normal, spin) : face.normal, turn);
      if (direction[2] < -.16) continue;
      const position = face.vertices.map(vertex => {
        const rotated = spin ? rotate(vertex.map((value, i) => value - face.origin[i]), spin) : null;
        return rotate(vertex.map((value, i) =>
          (rotated ? rotated[i] + face.origin[i] : value) +
          separation[face.part][i] * open + face.offset[i] * fracture
        ), turn);
      });
      const shade = clamp(.49 + direction[0] * -.24 + direction[1] * .30 + direction[2] * .45, .23, 1.12);
      const shine = Math.max(0, -.57 * direction[0] + .37 * direction[1] + .68 * direction[2]) ** 12;
      geometry.push({ face, points: position.map(project), depth: center(position)[2], shade, shine, fracture });
    }
    geometry.sort((a, b) => a.depth - b.depth);
    for (const { face, points, shade, shine, fracture } of geometry) {
      let paint = faceColor(face, shade, shine, fracture, face.origin[1]);
      if (face.material === 'shell' && !face.cap) {
        paint = ctx.createLinearGradient(points[0][0], points[0][1], points[1][0], points[1][1]);
        paint.addColorStop(0, faceColor(face, shade, shine, fracture, face.vertices[0][1]));
        paint.addColorStop(1, faceColor(face, shade, shine, fracture, face.vertices[1][1]));
      }
      ctx.globalAlpha = 1 - dissolve;
      ctx.fillStyle = ctx.strokeStyle = paint;
      ctx.lineWidth = .65;
      path(points);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (burst < .48) drawDecal(turn, open, 1 - smooth(0, .48, burst));
  }

  if (progress > .20) {
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of particles) {
      const flight = smooth(.20 + particle.lag, .49 + particle.lag, progress);
      const alpha = smooth(0, .49, flight) * (.27 + particle.size * .22) * (1 - schedule * .94);
      if (alpha < .005) continue;
      const origin = rotate(particle.origin, turn);
      const cloud = particle.cloud.map((value, axis) => value + Math.sin(story * 12 + particle.phase + axis) * .22);
      const a = particle.phase + story * 11;
      const tube = particle.cloud[2] * .20;
      const r = 2.28 + Math.cos(a * 3) * .16 + tube;
      const orbit = rotate([Math.cos(a) * r, Math.sin(a) * r, Math.sin(a * 3) * .38 + tube], loopTurn);
      const world = cloud.map((value, axis) => lerp(lerp(lerp(origin[axis], value, flight), orbit[axis], loop), particle.target[axis], reform));
      const [x, y, z] = project(world);
      const radius = particle.size * (.78 + z * .085) * lerp(1, .84, reform);
      ctx.fillStyle = 'hsla(' + particle.hue + ',' + particle.saturation + '%,' + particle.light + '%,' + alpha + ')';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawSchedule(story);
}

let enabled = false;
let travel = 0;
let current = 0;
let progress = 0;
let painted = -1;
let animation = 0;
let previousTime = 0;
let focusChapter = null;
let hasLayout = false;

function setChapter(index) {
  current = index;
  chapters.forEach((chapter, i) => {
    chapter.classList.toggle('is-current', i === index);
    chapter.inert = enabled && i !== index;
  });
  chapterLinks.forEach(link => {
    if (link.hash === '#' + chapters[index].dataset.anchor) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('#visual-label').textContent = chapters[index].dataset.label;
  document.querySelector('#chapter-count').textContent = String(index + 1).padStart(2, '0');
  const next = chapters[index + 1];
  cue.href = next ? '#' + next.dataset.anchor : '#inicio';
  document.querySelector('#cue-label').textContent = next ? (index ? 'Continue rolando' : 'Role para explorar') : 'Voltar ao início';
  cue.querySelector('.scroll-icon').textContent = next ? '↓' : '↑';
  if (focusChapter === index) {
    chapters[index].tabIndex = -1;
    chapters[index].focus({ preventScroll: true });
    focusChapter = null;
  }
}

function render(time) {
  animation = 0;
  if (!enabled) return;
  const target = clamp(-film.getBoundingClientRect().top / travel);
  const dt = previousTime ? Math.min(time - previousTime, 36) : 16;
  previousTime = time;
  progress = lerp(progress, target, 1 - Math.exp(-dt / 57));
  if (Math.abs(target - progress) < .0004) progress = target;
  const index = thresholds.findLastIndex(value => progress >= value);
  if (index !== current || index === focusChapter) setChapter(index);
  if (painted !== progress) {
    drawScene(progress);
    visual.style.setProperty('--optic-angle', progress * 55 + 'deg');
    painted = progress;
  }
  if (progress !== target) animation = requestAnimationFrame(render);
  else previousTime = 0;
}

function queueRender() {
  if (enabled && !animation) animation = requestAnimationFrame(render);
}

function layout() {
  const nextMode = Boolean(ctx) && !motion.matches && innerHeight >= (innerWidth <= 600 ? 710 : 580);
  const switching = nextMode !== enabled;
  const keepPlace = hasLayout && switching && scrollY > 0;
  let chapterToKeep = current;
  if (keepPlace && !enabled) {
    chapterToKeep = Math.max(0, chapters.findLastIndex(chapter => chapter.getBoundingClientRect().top <= innerHeight * .35));
  }
  hasLayout = true;
  document.documentElement.classList.toggle('has-static-pod', Boolean(ctx) && !nextMode);
  if (switching) {
    enabled = nextMode;
    document.documentElement.classList.toggle('is-film', enabled);
    for (const { chapter, marker, id } of anchors) {
      if (enabled) {
        chapter.removeAttribute('id');
        marker.id = id;
      } else {
        marker.removeAttribute('id');
        chapter.id = id;
      }
    }
    focusChapter = null;
    setChapter(keepPlace ? chapterToKeep : 0);
    if (enabled) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (enabled) document.documentElement.classList.add('is-ready');
      }));
    } else {
      document.documentElement.classList.remove('is-ready');
    }
  }
  if (!enabled) {
    visual.style.removeProperty('--optic-angle');
    if (ctx) {
      sizeCanvas();
      drawScene(0);
    }
    document.querySelector('#visual-label').textContent = chapters[0].dataset.label;
    if (keepPlace) chapters[chapterToKeep].scrollIntoView({ behavior: 'instant' });
    return;
  }
  travel = Math.round(frame.clientHeight * 4.15);
  film.style.setProperty('--travel', travel + 'px');
  anchors.forEach(({ marker }, i) => { marker.style.top = travel * stops[i + 1] + 'px'; });
  if (keepPlace) {
    progress = stops[chapterToKeep];
    const destination = chapterToKeep ? anchors[chapterToKeep - 1].marker : film;
    destination.scrollIntoView({ behavior: 'instant' });
  }
  sizeCanvas();
  painted = -1;
  queueRender();
}

layout();
if (enabled && location.hash) {
  const marker = anchors.find(({ id }) => '#' + id === location.hash);
  if (marker) {
    marker.marker.scrollIntoView({ behavior: 'instant' });
    progress = stops[anchors.indexOf(marker) + 1];
  }
}

addEventListener('scroll', queueRender, { passive: true });
addEventListener('resize', layout, { passive: true });
motion.addEventListener('change', layout);

// Keep native fragment navigation and history. Move focus to the actual content,
// since the film uses invisible markers to locate each chapter on the scroll track.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!enabled || !link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const index = chapters.findIndex(chapter => '#' + chapter.dataset.anchor === link.hash);
  if (index < 0) return;
  focusChapter = index;
  if (link.matches('.skip')) {
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    anchors[index - 1].marker.scrollIntoView({ behavior: 'instant' });
  }
  queueRender();
});
