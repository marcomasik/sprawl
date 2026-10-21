/* ---------- UI ---------- */
import { SVC, TYPES, RANKS, ICON } from "./config.js";
import { $, reduce, compass, dayOf } from "./util.js";
import { S } from "./state.js";
import { income } from "./sim.js";

export let tool = null;
let toastT = 0;

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
const toolsEl = $("tools");
export function buildTools() {
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
export function updateTools() {
  for (const b of toolsEl.children) {
    const t = b.dataset.type;
    b.setAttribute("aria-pressed", tool === t ? "true" : "false");
    if (t === "clear") continue;
    const d = SVC[t], locked = !S.unlocked.has(t);
    b.disabled = locked;
    b.classList.toggle("poor", !locked && S.coins < d.cost);
    const sm = b.querySelector(".tool__cost");
    const txt = locked ? `at ${d.unlock} people` : `${d.cost} coins · ${d.need.toLowerCase()}`;
    if (sm.textContent !== txt) sm.textContent = txt;
  }
}
export function selectTool(t) {
  if (t && t !== "clear" && !S.unlocked.has(t)) { toast(`Unlocks at ${SVC[t].unlock} people`); return; }
  tool = t;
  updateTools();
}
const needsEl = $("needs"), needEls = new Map();
export function updateNeeds() {
  const ids = new Set(S.needs.map(n => n.id));
  for (const [id, li] of needEls) if (!ids.has(id)) { li.remove(); needEls.delete(id); }
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
    li.querySelector(".need__info").textContent = `${compass(n.x, n.y).replace("in the ", "")} · ${d.name} · ${left}s`;
    li.querySelector(".need__bar").style.width = (frac * 100).toFixed(1) + "%";
    li.firstChild.classList.toggle("late", frac < 0.3);
  }
  $("noneeds").hidden = S.needs.length > 0;
}
export function clearNeedList() { needEls.forEach(li => li.remove()); needEls.clear(); }
const logEl = $("log");
export function pushLog(text, type) {
  S.log.unshift({ d: dayOf(S.time), text, type });
  if (S.log.length > 40) S.log.length = 40;
  renderLog();
  if (!reduce) $("tickertext").animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
}
export function renderLog() {
  logEl.innerHTML = "";
  for (const e of S.log) {
    const li = document.createElement("li");
    li.className = "log__item";
    const c = e.type === "bad" ? "var(--bad)" : e.type ? SVC[e.type].color : "var(--muted)";
    li.innerHTML = `<time class="log__day">Day ${e.d}</time><span class="log__dot" style="--c:${c}"></span><span></span>`;
    li.lastChild.textContent = e.text;
    logEl.appendChild(li);
  }
  const e = S.log[0];
  $("tickerday").textContent = e ? `Day ${e.d}` : "";
  $("tickertext").textContent = e ? e.text : "";
}
export function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.style.opacity = 0; }, 2200);
}
const speedEls = document.querySelectorAll(".speedbtn[data-speed]");
export function updateStats() {
  $("pop").textContent = S.pop;
  $("coins").textContent = Math.floor(S.coins);
  $("income").textContent = `+${income().toFixed(1)}/s`;
  $("day").textContent = dayOf(S.time);
  const m = $("mood");
  m.style.width = S.mood.toFixed(0) + "%";
  m.style.backgroundColor = S.mood > 55 ? "var(--good)" : S.mood > 25 ? "var(--amber)" : "var(--bad)";
  $("moodm").setAttribute("aria-valuenow", Math.round(S.mood));
  $("rank").textContent = RANKS[S.rankIdx][1];
  $("pause").setAttribute("aria-pressed", String(S.started && S.paused));
  for (const b of speedEls) b.setAttribute("aria-pressed", String(S.started && !S.paused && S.speed === +b.dataset.speed));
  $("startcard").hidden = S.started;
}
function loadBest() { try { return parseInt(localStorage.getItem("sprawl-best") || "0", 10) || 0; } catch (e) { return 0; } }
let best = loadBest();
export function saveBest() {
  if (S.peak > best) { best = S.peak; try { localStorage.setItem("sprawl-best", String(best)); } catch (e) {} }
  $("best").textContent = best ? `Best town so far: ${best} people.` : "";
}
