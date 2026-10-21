(() => {
  // src/js/config.js
  var W = 44;
  var H = 30;
  var N = W * H;
  var CX = Math.floor(W / 2);
  var CY = Math.floor(H / 2);
  var GRASS = 0;
  var WATER = 1;
  var FOREST = 2;
  var SOLVE_R = 3;
  var POP = [0, 4, 10, 24];
  var SVC = {
    water: { name: "Well", need: "Water", cost: 25, r: 4, unlock: 0, color: "#3f9bd1", key: "1" },
    food: { name: "Farm", need: "Food", cost: 40, r: 5, unlock: 0, color: "#c99a2e", key: "2" },
    work: { name: "Workshop", need: "Jobs", cost: 70, r: 5, unlock: 60, color: "#c4643f", key: "3" },
    health: { name: "Clinic", need: "Healthcare", cost: 110, r: 6, unlock: 160, color: "#d65a83", key: "4" },
    school: { name: "School", need: "Education", cost: 150, r: 6, unlock: 320, color: "#7e6fd6", key: "5" },
    power: { name: "Power station", need: "Power", cost: 220, r: 8, unlock: 650, color: "#d1b52a", key: "6" }
  };
  var TYPES = Object.keys(SVC);
  var RANKS = [[0, "Hamlet"], [80, "Village"], [300, "Town"], [900, "City"], [2200, "Metropolis"]];
  var ROOFS = [["#d9805f", "#ad5839"], ["#8493ad", "#5a6882"], ["#ddb35c", "#b38832"], ["#62aaa2", "#3e7d77"], ["#b884a3", "#8c5b77"], ["#e6dac8", "#bcab92"]];
  var ICON = {
    water: "M12 2.5c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11z",
    food: "M11 21v-6.6C7.2 14 4.6 11.2 4.6 6.6c4 0 6.6 2.4 7.2 5.6.7-3.9 3.4-6.9 7.6-6.9 0 4.6-2.8 7.8-6.4 8.5V21z",
    health: "M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z",
    school: "M2.5 5.4c3.2-1 6.4-.6 8.7 1.3V20c-2.3-1.7-5.5-2.2-8.7-1.3zM21.5 5.4c-3.2-1-6.4-.6-8.7 1.3V20c2.3-1.7 5.5-2.2 8.7-1.3z",
    power: "M13.5 2 5 13.5h5.5L9.5 22 19 9.8h-5.6z"
  };
  var DIRS = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];

  // src/js/util.js
  var $ = (id) => document.getElementById(id);
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  var at = (x, y) => y * W + x;
  var rnd = (a) => a[Math.random() * a.length | 0];
  var isLat = (x, y) => ((x - CX) % 4 + 4) % 4 === 0 || ((y - CY) % 4 + 4) % 4 === 0;
  function compass(x, y) {
    if (Math.hypot(x - CX, y - CY) < 2) return "in the centre";
    const a = Math.atan2(y - CY, x - CX);
    return "in the " + DIRS[(Math.round(a / (Math.PI / 4)) % 8 + 8) % 8];
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`;
  }
  function mix(a, b, t) {
    const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
    const r = Math.round((p >> 16) + ((q >> 16) - (p >> 16)) * t);
    const g = Math.round((p >> 8 & 255) + ((q >> 8 & 255) - (p >> 8 & 255)) * t);
    const bl = Math.round((p & 255) + ((q & 255) - (p & 255)) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  var now = () => performance.now();
  function dayOf(t) {
    return Math.floor(t / 20) + 1;
  }

  // src/js/noise.js
  function hash(ix, iy, s) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 982451653);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  var fbm = (x, y, s) => vnoise(x / 9, y / 9, s) * 0.6 + vnoise(x / 4.5, y / 4.5, s + 7) * 0.3 + vnoise(x / 2, y / 2, s + 13) * 0.1;

  // src/js/effects.js
  var particles = [];
  var floaters = [];
  function burst(x, y, color, n) {
    if (reduce) return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.6;
      particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 1, color, size: 0.08 + Math.random() * 0.1 });
    }
  }
  function floatText(x, y, text, color) {
    floaters.push({ x: x + 0.5, y: y + 0.2, text, color, life: 1 });
  }
  function stepEffects(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 1.8 * dt;
      p.life -= dt * 1.4;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) {
      f.y -= dt * 1.1;
      f.life -= dt * 0.8;
    }
    floaters = floaters.filter((f) => f.life > 0);
  }
  function clearEffects() {
    particles = [];
    floaters = [];
  }

  // src/js/growth.js
  function growStep() {
    const hc = [], rc = [], t = now();
    for (let y2 = 0; y2 < H; y2++) for (let x2 = 0; x2 < W; x2++) {
      const i2 = at(x2, y2);
      if (S.build[i2] || S.terrain[i2] === WATER || S.needs.some((n) => n.x === x2 && n.y === y2)) continue;
      if (isLat(x2, y2)) {
        if (isRoad(x2 + 1, y2) || isRoad(x2 - 1, y2) || isRoad(x2, y2 + 1) || isRoad(x2, y2 - 1)) rc.push(i2);
      } else {
        let road = false, full = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (isRoad(x2 + dx, y2 + dy)) road = true;
          const nb = inb(x2 + dx, y2 + dy) ? S.build[at(x2 + dx, y2 + dy)] : null;
          if (!nb || nb.k === "road") full = false;
        }
        if (road) hc.push(i2);
        else if (full) S.build[i2] = { k: "park", born: t };
      }
    }
    let list = hc.length && (!rc.length || Math.random() < 0.7) ? hc : rc;
    if (!list.length) return;
    let tot = 0;
    const w = list.map((i2) => {
      const x2 = i2 % W, y2 = i2 / W | 0;
      let s = 0.04 + attract(x2, y2) + 0.35 * Math.exp(-Math.hypot(x2 - CX, y2 - CY) / 7) + 0.06 * covCount(i2) - (S.terrain[i2] === FOREST ? 0.03 : 0);
      s = Math.max(5e-3, s);
      s = s * s * (0.6 + 0.8 * Math.random());
      tot += s;
      return s;
    });
    let r = Math.random() * tot, k = 0;
    while (k < list.length - 1 && (r -= w[k]) > 0) k++;
    const i = list[k], x = i % W, y = i / W | 0;
    if (list === hc) placeHouse(x, y, t);
    else setRoad(x, y, t);
  }
  function upgradeStep() {
    const hs = [];
    for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") hs.push(i);
    for (let n = 0; n < Math.min(6, hs.length); n++) {
      const i = rnd(hs), b = S.build[i], c = covCount(i);
      const target = c >= 4 ? 3 : c >= 2 ? 2 : 1;
      if (b.lvl < target && S.mood >= 35 && Math.random() < 0.45) {
        b.lvl++;
        b.born = now();
        burst(i % W, i / W | 0, "#fff4d6", 5);
      } else if (b.lvl > target && Math.random() < 0.12) b.lvl--;
    }
  }

  // src/js/sim.js
  function step(dt) {
    S.time += dt;
    for (const n of S.needs) n.age += dt;
    const expired = S.needs.filter((n) => n.age >= n.life);
    if (expired.length) {
      S.needs = S.needs.filter((n) => n.age < n.life);
      expired.forEach(expireNeed);
    }
    S.econT += dt;
    while (S.econT >= 1) {
      S.econT -= 1;
      S.coins += income();
      if (S.mood < 72) S.mood = Math.min(72, S.mood + 0.12);
      for (const n of S.needs) if (n.age > n.life / 2) S.mood = Math.max(0, S.mood - 0.05);
    }
    S.growT += dt;
    while (S.growT >= 0.7) {
      S.growT -= 0.7;
      const chance = S.mood < 20 ? 0.1 : 0.35 + S.mood / 100 * 0.65;
      const steps = Math.min(4, 1 + Math.floor(S.pop / 400) + (S.mood > 65 ? 1 : 0));
      for (let k = 0; k < steps; k++) if (Math.random() < chance) growStep();
      upgradeStep();
      for (const a of S.attr) a.s *= 0.99;
      S.attr = S.attr.filter((a) => Math.abs(a.s) > 0.05);
      recalc();
      checkProgress();
    }
    S.nextNeed -= dt;
    if (S.nextNeed <= 0) {
      spawnNeed();
      S.nextNeed = Math.max(6, 15 - S.pop / 120) * (0.75 + Math.random() * 0.5);
    }
    if (S.mood < 12) {
      S.leaveT += dt;
      if (S.leaveT > 4) {
        S.leaveT = 0;
        const hs = [];
        for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") hs.push(i);
        if (hs.length > 3) {
          const i = rnd(hs);
          S.build[i] = null;
          burst(i % W, i / W | 0, "#9a9384", 8);
          recalc();
          if (Math.random() < 0.4) pushLog("Morale is low. Families are packing up.", "bad");
        }
      }
    } else S.leaveT = 0;
  }
  var income = () => 0.5 + S.pop * 0.035;
  function checkProgress() {
    for (const t of TYPES) if (!S.unlocked.has(t) && S.pop >= SVC[t].unlock) {
      S.unlocked.add(t);
      toast(`${SVC[t].name} unlocked`);
      pushLog(`The town now asks for ${SVC[t].need.toLowerCase()}. ${SVC[t].name} unlocked.`, t);
      buildTools();
    }
    let r = 0;
    for (let k = 0; k < RANKS.length; k++) if (S.peak >= RANKS[k][0]) r = k;
    if (r > S.rankIdx) {
      S.rankIdx = r;
      toast(`Your settlement is now a ${RANKS[r][1].toLowerCase()}`);
      pushLog(`The settlement is now a ${RANKS[r][1].toLowerCase()}.`, null);
    }
    saveBest();
  }

  // src/js/ui.js
  var tool = null;
  var toastT = 0;
  function svgIcon(type, cls) {
    if (type === "work") {
      let teeth = "";
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        teeth += `<line x1="${(12 + Math.cos(a) * 6.4).toFixed(2)}" y1="${(12 + Math.sin(a) * 6.4).toFixed(2)}" x2="${(12 + Math.cos(a) * 10.4).toFixed(2)}" y2="${(12 + Math.sin(a) * 10.4).toFixed(2)}"/>`;
      }
      return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="3.6" stroke-linecap="round">${teeth}</g><circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="4.2"/></svg>`;
    }
    if (type === "clear") return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[type]}" fill="currentColor"/></svg>`;
  }
  var toolsEl = $("tools");
  function buildTools() {
    toolsEl.innerHTML = "";
    for (const t of [...TYPES, "clear"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool" + (t === "clear" ? " clear" : "");
      b.dataset.type = t;
      b.id = "tool-" + t;
      if (t === "clear") {
        b.innerHTML = `${svgIcon(t, "tool__icon")}<span class="tool__text"><b class="tool__name">Demolish <kbd class="tool__key">X</kbd></b><small class="tool__cost">half refund</small></span>`;
      } else {
        const d = SVC[t];
        b.style.setProperty("--c", d.color);
        b.innerHTML = `${svgIcon(t, "tool__icon")}<span class="tool__text"><b class="tool__name">${d.name} <kbd class="tool__key">${d.key}</kbd></b><small class="tool__cost"></small></span>`;
      }
      b.addEventListener("click", () => selectTool(tool === t ? null : t));
      toolsEl.appendChild(b);
    }
    updateTools();
  }
  function updateTools() {
    for (const b of toolsEl.children) {
      const t = b.dataset.type;
      b.setAttribute("aria-pressed", tool === t ? "true" : "false");
      if (t === "clear") continue;
      const d = SVC[t], locked = !S.unlocked.has(t);
      b.disabled = locked;
      b.classList.toggle("poor", !locked && S.coins < d.cost);
      const sm = b.querySelector(".tool__cost");
      const txt = locked ? `at ${d.unlock} people` : `${d.cost} coins \xB7 ${d.need.toLowerCase()}`;
      if (sm.textContent !== txt) sm.textContent = txt;
    }
  }
  function selectTool(t) {
    if (t && t !== "clear" && !S.unlocked.has(t)) {
      toast(`Unlocks at ${SVC[t].unlock} people`);
      return;
    }
    tool = t;
    updateTools();
  }
  var needsEl = $("needs");
  var needEls = /* @__PURE__ */ new Map();
  function updateNeeds() {
    const ids = new Set(S.needs.map((n) => n.id));
    for (const [id, li] of needEls) if (!ids.has(id)) {
      li.remove();
      needEls.delete(id);
    }
    for (const n of S.needs) {
      let li = needEls.get(n.id);
      const d = SVC[n.type];
      if (!li) {
        li = document.createElement("li");
        li.innerHTML = `<button type="button" class="need" style="--c:${d.color}">${svgIcon(n.type, "need__icon")}<b class="need__name">${d.need}</b><small class="need__info"></small><span class="need__timer"><i class="need__bar"></i></span></button>`;
        li.firstChild.addEventListener("click", () => selectTool(n.type));
        needsEl.appendChild(li);
        needEls.set(n.id, li);
      }
      const left = Math.max(0, Math.ceil(n.life - n.age)), frac = Math.max(0, 1 - n.age / n.life);
      li.querySelector(".need__info").textContent = `${compass(n.x, n.y).replace("in the ", "")} \xB7 ${d.name} \xB7 ${left}s`;
      li.querySelector(".need__bar").style.width = (frac * 100).toFixed(1) + "%";
      li.firstChild.classList.toggle("late", frac < 0.3);
    }
    $("noneeds").hidden = S.needs.length > 0;
  }
  function clearNeedList() {
    needEls.forEach((li) => li.remove());
    needEls.clear();
  }
  var logEl = $("log");
  function pushLog(text, type) {
    S.log.unshift({ d: dayOf(S.time), text, type });
    if (S.log.length > 40) S.log.length = 40;
    renderLog();
  }
  function renderLog() {
    logEl.innerHTML = "";
    for (const e of S.log) {
      const li = document.createElement("li");
      li.className = "log__item";
      const c = e.type === "bad" ? "var(--bad)" : e.type ? SVC[e.type].color : "var(--muted)";
      li.innerHTML = `<time class="log__day">Day ${e.d}</time><span class="log__dot" style="--c:${c}"></span><span></span>`;
      li.lastChild.textContent = e.text;
      logEl.appendChild(li);
    }
  }
  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(toastT);
    toastT = setTimeout(() => {
      el.style.opacity = 0;
    }, 2200);
  }
  function updateStats() {
    $("pop").textContent = S.pop;
    $("coins").textContent = Math.floor(S.coins);
    $("income").textContent = `+${income().toFixed(1)}/s`;
    $("day").textContent = dayOf(S.time);
    const m = $("mood");
    m.style.width = S.mood.toFixed(0) + "%";
    m.style.backgroundColor = S.mood > 55 ? "var(--good)" : S.mood > 25 ? "var(--amber)" : "var(--bad)";
    $("moodm").setAttribute("aria-valuenow", Math.round(S.mood));
    $("rank").textContent = RANKS[S.rankIdx][1];
    const p = $("pause");
    const label = !S.started ? "Start" : S.paused ? "Resume" : "Pause";
    if (p.textContent !== label) {
      p.textContent = label;
      p.classList.toggle("primary", S.paused);
    }
    $("speed").textContent = `Speed ${S.speed}\xD7`;
    $("startcard").hidden = S.started;
  }
  function loadBest() {
    try {
      return parseInt(localStorage.getItem("sprawl-best") || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  var best = loadBest();
  function saveBest() {
    if (S.peak > best) {
      best = S.peak;
      try {
        localStorage.setItem("sprawl-best", String(best));
      } catch (e) {
      }
    }
    $("best").textContent = best ? `Best town so far: ${best} people.` : "";
  }

  // src/js/needs.js
  function spawnNeed() {
    const maxN = Math.min(5, 2 + Math.floor(S.pop / 250));
    if (S.needs.length >= maxN) return;
    const types = TYPES.filter((t) => S.unlocked.has(t));
    const houses = [];
    for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") {
      const x = i % W, y = i / W | 0;
      houses.push({ x, y, d: Math.hypot(x - CX, y - CY) });
    }
    if (!houses.length) return;
    houses.sort((a, b) => b.d - a.d);
    const outer = houses.slice(0, Math.max(3, Math.ceil(houses.length * 0.35)));
    for (let tries = 0; tries < 30; tries++) {
      const h = rnd(outer);
      const ang = (h.d < 0.5 ? Math.random() * Math.PI * 2 : Math.atan2(h.y - CY, h.x - CX)) + (Math.random() - 0.5) * 1.3;
      const dist = 2 + Math.random() * 3;
      const x = Math.round(h.x + Math.cos(ang) * dist), y = Math.round(h.y + Math.sin(ang) * dist);
      if (!inb(x, y)) continue;
      const i = at(x, y);
      if (S.terrain[i] === WATER || S.build[i]) continue;
      if (S.needs.some((n) => Math.hypot(n.x - x, n.y - y) < 5)) continue;
      const hi = at(h.x, h.y);
      const lacking = types.filter((t) => !S.cov[t][hi] && !S.cov[t][i]);
      if (!lacking.length) continue;
      const type = rnd(lacking);
      const life = Math.max(24, 44 - S.pop / 70);
      S.needs.push({ id: S.nid++, x, y, type, age: 0, life });
      pushLog(`${SVC[type].need} wanted ${compass(x, y)}.`, type);
      return;
    }
  }
  function solveNeed(n) {
    const frac = 1 - n.age / n.life, reward = Math.round(12 + frac * 24);
    S.coins += reward;
    S.mood = Math.min(100, S.mood + 6);
    S.attr.push({ x: n.x, y: n.y, s: 1.4 });
    floatText(n.x, n.y, `+${reward}`, "#f0b44c");
    burst(n.x, n.y, SVC[n.type].color, 16);
    pushLog(`${SVC[n.type].need} delivered ${compass(n.x, n.y)}. The town reaches toward it.`, n.type);
  }
  function expireNeed(n) {
    S.mood = Math.max(0, S.mood - 10);
    S.attr.push({ x: n.x, y: n.y, s: -0.6 });
    const hs = [];
    for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") {
      const x = i % W, y = i / W | 0, d = Math.hypot(x - n.x, y - n.y);
      if (d <= 6) hs.push({ i, d, x, y });
    }
    hs.sort((a, b) => a.d - b.d);
    const gone = hs.slice(0, 2);
    for (const h of gone) {
      S.build[h.i] = null;
      burst(h.x, h.y, "#9a9384", 8);
    }
    recalc();
    const fam = gone.length === 1 ? "One family left." : gone.length ? `${gone.length} families left.` : "";
    pushLog(`Nobody answered the ${SVC[n.type].need.toLowerCase()} request ${compass(n.x, n.y)}. ${fam}`, "bad");
  }

  // src/js/actions.js
  function canPlace(x, y, t) {
    if (!inb(x, y)) return "Off the map";
    const i = at(x, y), b = S.build[i];
    if (t === "clear") return b && b.k !== "road" ? null : "Nothing to clear here";
    if (!S.unlocked.has(t)) return `Unlocks at ${SVC[t].unlock} people`;
    if (S.terrain[i] === WATER) return "You can't build on water";
    if (b) return "That tile is taken";
    if (S.coins < SVC[t].cost) return `Needs ${SVC[t].cost} coins`;
    return null;
  }
  function place(x, y) {
    const err = canPlace(x, y, tool);
    if (err) {
      toast(err);
      return;
    }
    const i = at(x, y);
    if (tool === "clear") {
      const b = S.build[i];
      if (b.k === "svc") {
        const back = Math.floor(SVC[b.type].cost / 2);
        S.coins += back;
        floatText(x, y, `+${back}`, "#f0b44c");
        pushLog(`${SVC[b.type].name} demolished ${compass(x, y)}.`, b.type);
      }
      S.build[i] = null;
      burst(x, y, "#9a9384", 8);
      recalc();
      return;
    }
    const def = SVC[tool];
    S.coins -= def.cost;
    clearForest(i);
    S.build[i] = { k: "svc", type: tool, born: now() };
    recalc();
    let solved = 0;
    S.needs = S.needs.filter((n) => {
      if (n.type === tool && Math.hypot(n.x - x, n.y - y) <= SOLVE_R) {
        solveNeed(n);
        solved++;
        return false;
      }
      return true;
    });
    if (!solved) {
      pushLog(`${def.name} built ${compass(x, y)}.`, tool);
      burst(x, y, def.color, 8);
    }
    floatText(x, y, `\u2212${def.cost}`, "#e8edf1");
  }

  // src/js/input.js
  var hover = null;
  var confirmT = 0;
  function tileFrom(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
    return inb(x, y) ? { x, y } : null;
  }
  function startGame() {
    S.started = true;
    S.paused = false;
  }
  function bindInput() {
    cv.addEventListener("pointermove", (e) => {
      hover = tileFrom(e);
    });
    cv.addEventListener("pointerdown", (e) => {
      hover = tileFrom(e);
    });
    cv.addEventListener("pointerleave", () => {
      hover = null;
    });
    cv.addEventListener("click", (e) => {
      const p = tileFrom(e);
      if (!p) return;
      if (!S.started) {
        startGame();
        return;
      }
      if (tool) {
        place(p.x, p.y);
        return;
      }
      const n = S.needs.find((n2) => Math.hypot(n2.x - p.x, n2.y - p.y) <= 1.5);
      if (n) selectTool(n.type);
    });
    $("startbtn").addEventListener("click", startGame);
    $("pause").addEventListener("click", () => {
      if (!S.started) startGame();
      else S.paused = !S.paused;
    });
    $("speed").addEventListener("click", () => {
      S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1;
    });
    $("newmap").addEventListener("click", () => {
      const b = $("newmap");
      if (!b.classList.contains("warn")) {
        b.classList.add("warn");
        b.textContent = "Tap again to restart";
        clearTimeout(confirmT);
        confirmT = setTimeout(() => {
          b.classList.remove("warn");
          b.textContent = "New map";
        }, 3e3);
        return;
      }
      clearTimeout(confirmT);
      b.classList.remove("warn");
      b.textContent = "New map";
      const sp = S.speed;
      newState(Math.random() * 1e9 | 0);
      S.speed = sp;
      clearNeedList();
      clearEffects();
      selectTool(null);
      buildTools();
      startGame();
    });
    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const t = TYPES.find((k) => SVC[k].key === e.key);
      if (t) {
        selectTool(tool === t ? null : t);
        return;
      }
      if (e.key === "x" || e.key === "X") {
        selectTool(tool === "clear" ? null : "clear");
        return;
      }
      if (e.key === "Escape") {
        selectTool(null);
        return;
      }
      if (e.key === " " && !(e.target && e.target.tagName === "BUTTON")) {
        e.preventDefault();
        if (!S.started) startGame();
        else S.paused = !S.paused;
      }
    });
  }

  // src/js/render.js
  var cv = $("cv");
  var ctx = cv.getContext("2d");
  var tc = document.createElement("canvas");
  var tctx = tc.getContext("2d");
  var ts = 16;
  var cssW = 0;
  var cssH = 0;
  var dpr = 1;
  var terrainDirty = true;
  var ICON2D = {};
  for (const k in ICON) ICON2D[k] = new Path2D(ICON[k]);
  function markTerrainDirty() {
    terrainDirty = true;
  }
  function resize() {
    const rect = cv.parentElement.getBoundingClientRect();
    cssW = rect.width;
    ts = cssW / W;
    cssH = ts * H;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + "px";
    terrainDirty = true;
  }
  function renderTerrain() {
    tc.width = cv.width;
    tc.height = cv.height;
    const g = tctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y), sh = S.shade[i], t = S.terrain[i];
      let c;
      if (t === WATER) {
        let deep = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) deep++;
        c = mix("#5b9cbf", "#3b7699", Math.min(1, deep / 9 * 0.8 + sh * 0.2));
      } else {
        let shore = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) shore = true;
        c = shore ? mix("#d7c995", "#c8b97f", sh) : t === FOREST ? mix("#6f9d5c", "#628f50", sh) : mix("#8dba73", "#78a862", sh);
      }
      g.fillStyle = c;
      g.fillRect(x * ts, y * ts, ts + 0.6, ts + 0.6);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (S.terrain[at(x, y)] !== FOREST) continue;
      for (let k = 0; k < 3; k++) {
        const ox = (0.22 + hash(x, y, k + 3) * 0.56) * ts, oy = (0.22 + hash(x, y, k + 9) * 0.56) * ts;
        const r = ts * (0.2 + hash(x, y, k + 17) * 0.1);
        g.fillStyle = "rgba(30,50,30,.28)";
        g.beginPath();
        g.arc(x * ts + ox + r * 0.25, y * ts + oy + r * 0.35, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#3f7046";
        g.beginPath();
        g.arc(x * ts + ox, y * ts + oy, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#57905a";
        g.beginPath();
        g.arc(x * ts + ox - r * 0.25, y * ts + oy - r * 0.25, r * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    terrainDirty = false;
  }
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function drawIcon(type, cx, cy, r, color, bg) {
    ctx.save();
    if (type === "work") {
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineWidth = r * 0.34;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
        ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      circle(cx, cy, r * 0.62);
      ctx.fill();
      ctx.fillStyle = bg;
      circle(cx, cy, r * 0.26);
      ctx.fill();
    } else {
      ctx.translate(cx - r, cy - r);
      ctx.scale(r / 12, r / 12);
      ctx.fillStyle = color;
      ctx.fill(ICON2D[type]);
    }
    ctx.restore();
  }
  function popScale(b, t, dur) {
    if (reduce || b.born < 0) return 1;
    const a = (t - b.born) / dur;
    return a >= 1 ? 1 : Math.max(0, easeOutBack(a));
  }
  function drawRoads() {
    for (const [wf, col] of [[0.66, "#8d8676"], [0.5, "#e2dac6"]]) {
      ctx.fillStyle = col;
      const hw = ts * wf / 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!isRoad(x, y)) continue;
        const cx = x * ts + ts / 2, cy = y * ts + ts / 2;
        ctx.fillRect(cx - hw, cy - hw, hw * 2, hw * 2);
        if (isRoad(x + 1, y)) ctx.fillRect(cx, cy - hw, ts, hw * 2);
        if (isRoad(x, y + 1)) ctx.fillRect(cx - hw, cy, hw * 2, ts);
      }
    }
  }
  function drawHouse(x, y, b, t) {
    const sz = [0, 0.5, 0.64, 0.78][b.lvl] * ts * popScale(b, t, 380);
    if (sz <= 0.5) return;
    const px = x * ts + ts / 2 - sz / 2, py = y * ts + ts / 2 - sz / 2;
    const [lt, dk] = ROOFS[b.hue];
    ctx.fillStyle = "rgba(25,40,28,.32)";
    ctx.fillRect(px + ts * 0.08, py + ts * 0.1, sz, sz);
    if (b.lvl < 3) {
      ctx.fillStyle = lt;
      if (b.rot) ctx.fillRect(px, py, sz / 2, sz);
      else ctx.fillRect(px, py, sz, sz / 2);
      ctx.fillStyle = dk;
      if (b.rot) ctx.fillRect(px + sz / 2, py, sz / 2, sz);
      else ctx.fillRect(px, py + sz / 2, sz, sz / 2);
      if (b.lvl === 2) {
        ctx.fillStyle = "rgba(255,255,255,.28)";
        ctx.fillRect(px + sz * 0.68, py + sz * 0.12, sz * 0.14, sz * 0.14);
      }
    } else {
      ctx.fillStyle = dk;
      ctx.fillRect(px, py, sz, sz);
      ctx.fillStyle = lt;
      ctx.fillRect(px + sz * 0.12, py + sz * 0.12, sz * 0.76, sz * 0.76);
      ctx.fillStyle = dk;
      ctx.fillRect(px + sz * 0.56, py + sz * 0.24, sz * 0.2, sz * 0.2);
    }
  }
  function drawSvc(x, y, b, t) {
    const def = SVC[b.type], sz = 0.86 * ts * popScale(b, t, 420);
    if (sz <= 0.5) return;
    const px = x * ts + ts / 2 - sz / 2, py = y * ts + ts / 2 - sz / 2;
    ctx.fillStyle = "rgba(25,40,28,.35)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px + ts * 0.08, py + ts * 0.1, sz, sz, sz * 0.22) : ctx.rect(px + ts * 0.08, py + ts * 0.1, sz, sz);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px, py, sz, sz, sz * 0.22) : ctx.rect(px, py, sz, sz);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    drawIcon(b.type, x * ts + ts / 2, y * ts + ts / 2, sz * 0.34, "#fffaf0", def.color);
  }
  function drawPark(x, y, b, t) {
    const s = popScale(b, t, 400), cx = x * ts + ts / 2, cy = y * ts + ts / 2;
    ctx.fillStyle = "#9cc77f";
    ctx.fillRect(cx - ts * 0.4 * s, cy - ts * 0.4 * s, ts * 0.8 * s, ts * 0.8 * s);
    for (const [ox, oy, r] of [[-0.14, -0.1, 0.2], [0.16, 0.12, 0.17]]) {
      ctx.fillStyle = "#3f7046";
      circle(cx + ox * ts * s, cy + oy * ts * s, r * ts * s);
      ctx.fill();
    }
  }
  function drawNeed(n, t) {
    const def = SVC[n.type], cx = (n.x + 0.5) * ts, cy = (n.y + 0.5) * ts;
    const R = Math.max(ts * 0.66, 10), frac = Math.max(0, 1 - n.age / n.life);
    if (tool === n.type) {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(def.color, 0.9);
      ctx.fillStyle = rgba(def.color, 0.1);
      circle(cx, cy, (SOLVE_R + 0.5) * ts);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!reduce) {
      const ph = (t / 1400 + n.id * 0.37) % 1;
      ctx.fillStyle = rgba(def.color, 0.4 * (1 - ph));
      circle(cx, cy, R * (1 + ph * 1.1));
      ctx.fill();
    }
    ctx.fillStyle = "#16202b";
    circle(cx, cy, R);
    ctx.fill();
    ctx.lineWidth = Math.max(2, R * 0.2);
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    circle(cx, cy, R * 0.86);
    ctx.stroke();
    ctx.strokeStyle = frac < 0.3 ? "#e8675a" : def.color;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    drawIcon(n.type, cx, cy, R * 0.5, def.color, "#16202b");
  }
  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (terrainDirty) renderTerrain();
    ctx.drawImage(tc, 0, 0, cssW, cssH);
    for (const a of S.attr) {
      if (a.s <= 0.05) continue;
      const cx = (a.x + 0.5) * ts, cy = (a.y + 0.5) * ts, r = ts * 6;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255,236,170,${Math.min(0.32, a.s * 0.22)})`);
      g.addColorStop(1, "rgba(255,236,170,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (tool && tool !== "clear") {
      ctx.fillStyle = rgba(SVC[tool].color, 0.16);
      const cov = S.cov[tool];
      for (let i = 0; i < N; i++) if (cov[i]) ctx.fillRect(i % W * ts, (i / W | 0) * ts, ts + 0.5, ts + 0.5);
    }
    drawRoads();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const b = S.build[at(x, y)];
      if (!b || b.k === "road") continue;
      if (b.k === "house") drawHouse(x, y, b, t);
      else if (b.k === "svc") drawSvc(x, y, b, t);
      else if (b.k === "park") drawPark(x, y, b, t);
    }
    for (const n of S.needs) drawNeed(n, t);
    if (hover && tool) {
      const err = canPlace(hover.x, hover.y, tool);
      const px = hover.x * ts, py = hover.y * ts;
      if (tool === "clear") {
        ctx.strokeStyle = err ? "rgba(255,255,255,.5)" : "#e8675a";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      } else {
        const def = SVC[tool];
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(def.color, 0.95);
        circle(px + ts / 2, py + ts / 2, def.r * ts);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = err ? "#e8675a" : def.color;
        ctx.fillRect(px + ts * 0.07, py + ts * 0.07, ts * 0.86, ts * 0.86);
        ctx.globalAlpha = 1;
        if (!err) drawIcon(tool, px + ts / 2, py + ts / 2, ts * 0.3, "#fffaf0", def.color);
      }
    }
    stepEffects(dt);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      circle(p.x * ts, p.y * ts, Math.max(1.5, p.size * ts));
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.max(12, ts * 0.8)}px Barlow, system-ui, sans-serif`;
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
      ctx.fillStyle = "rgba(15,22,30,.7)";
      ctx.fillText(f.text, f.x * ts + 1, f.y * ts + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * ts, f.y * ts);
    }
    ctx.globalAlpha = 1;
  }

  // src/js/world.js
  function genTerrain() {
    const s = S.seed, wv = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y), dc = Math.hypot(x - CX, y - CY);
      wv[i] = fbm(x, y, s) + Math.max(0, 7 - dc) * 0.045;
      S.shade[i] = vnoise(x / 3, y / 3, s + 31);
    }
    const th = Array.from(wv).sort((a, b) => a - b)[Math.floor(N * 0.15)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y), dc = Math.hypot(x - CX, y - CY);
      if (wv[i] < th && dc > 4) S.terrain[i] = WATER;
      else S.terrain[i] = fbm(x + 50, y + 50, s + 99) > 0.6 && dc > 5 ? FOREST : GRASS;
    }
  }
  function clearForest(i) {
    if (S.terrain[i] === FOREST) {
      S.terrain[i] = GRASS;
      markTerrainDirty();
    }
  }
  function setRoad(x, y, born) {
    if (!inb(x, y)) return;
    const i = at(x, y);
    if (S.terrain[i] === WATER || S.build[i]) return;
    clearForest(i);
    S.build[i] = { k: "road", born };
  }
  function placeHouse(x, y, born) {
    const i = at(x, y);
    if (S.terrain[i] === WATER || S.build[i]) return;
    clearForest(i);
    S.build[i] = { k: "house", lvl: 1, hue: Math.random() * ROOFS.length | 0, rot: Math.random() < 0.5, born };
  }
  function seedCity() {
    for (let d = -4; d <= 4; d++) {
      setRoad(CX + d, CY, -1e9);
      setRoad(CX, CY + d, -1e9);
    }
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, -1], [1, 2], [-1, -2], [-3, 1]]) placeHouse(CX + dx, CY + dy, -1e9);
  }

  // src/js/state.js
  var S = null;
  function newState(seed) {
    S = {
      seed,
      terrain: new Uint8Array(N),
      shade: new Float32Array(N),
      build: new Array(N).fill(null),
      needs: [],
      attr: [],
      coins: 120,
      mood: 70,
      time: 0,
      nextNeed: 4,
      growT: 0,
      econT: 0,
      leaveT: 0,
      nid: 1,
      rankIdx: 0,
      unlocked: /* @__PURE__ */ new Set(["water", "food"]),
      peak: 0,
      paused: true,
      speed: 1,
      log: [],
      started: false
    };
    genTerrain();
    seedCity();
    recalc();
    pushLog("A handful of families settle at the crossroads.", null);
    markTerrainDirty();
  }
  var isRoad = (x, y) => inb(x, y) && S.build[at(x, y)] && S.build[at(x, y)].k === "road";
  function recalc() {
    S.cov = {};
    for (const t of TYPES) S.cov[t] = new Uint8Array(N);
    S.svcList = [];
    let pop = 0;
    for (let i = 0; i < N; i++) {
      const b = S.build[i];
      if (!b) continue;
      if (b.k === "house") pop += POP[b.lvl];
      else if (b.k === "svc") {
        const x = i % W, y = i / W | 0, r = SVC[b.type].r;
        S.svcList.push({ x, y });
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r && inb(x + dx, y + dy)) S.cov[b.type][at(x + dx, y + dy)] = 1;
      }
    }
    S.pop = pop;
    S.peak = Math.max(S.peak, pop);
  }
  function covCount(i) {
    let c = 0;
    for (const t of TYPES) if (S.cov[t][i]) c++;
    return c;
  }
  function attract(x, y) {
    let a = 0;
    for (const t of S.attr) a += t.s * Math.exp(-Math.hypot(x - t.x, y - t.y) / 7);
    for (const b of S.svcList) a += 0.22 * Math.exp(-Math.hypot(x - b.x, y - b.y) / 5);
    return a;
  }
  function serialize() {
    return {
      seed: S.seed,
      terrain: Array.from(S.terrain),
      shade: Array.from(S.shade),
      build: S.build,
      needs: S.needs,
      attr: S.attr,
      coins: S.coins,
      mood: S.mood,
      time: S.time,
      nextNeed: S.nextNeed,
      nid: S.nid,
      rankIdx: S.rankIdx,
      unlocked: [...S.unlocked],
      peak: S.peak,
      paused: S.paused,
      speed: S.speed,
      log: S.log,
      started: S.started
    };
  }
  function restore(d) {
    S = Object.assign({}, d, {
      terrain: Uint8Array.from(d.terrain),
      shade: Float32Array.from(d.shade),
      unlocked: new Set(d.unlocked),
      growT: 0,
      econT: 0,
      leaveT: 0
    });
    for (const b of S.build) if (b) b.born = -1e9;
    recalc();
    renderLog();
    markTerrainDirty();
  }

  // src/js/main.js
  var last = 0;
  var uiT = 0;
  function frame(t) {
    const dt = Math.min(0.1, (t - (last || t)) / 1e3);
    last = t;
    if (S.started && !S.paused) step(dt * S.speed);
    draw(t, dt);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.15;
      updateStats();
      updateTools();
      updateNeeds();
    }
    requestAnimationFrame(frame);
  }
  function start(data) {
    if (data && data.state && data.state.terrain) {
      try {
        restore(data.state);
      } catch (e) {
        newState(Math.random() * 1e9 | 0);
      }
    } else newState(Math.random() * 1e9 | 0);
    buildTools();
    saveBest();
    resize();
    new ResizeObserver(resize).observe(cv.parentElement);
    updateStats();
    requestAnimationFrame(frame);
  }
  bindInput();
  try {
    window.claude?.hot?.snapshot?.(() => ({ state: serialize() }));
  } catch (e) {
  }
  var hot = window.claude?.hot;
  if (hot && hot.ready) hot.ready(start);
  else start(hot?.data ?? {});
})();
