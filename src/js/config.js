/* ---------- game constants ---------- */
export const W = 64, H = 64, N = W * H, CX = Math.floor(W / 2), CY = Math.floor(H / 2);
export const GRASS = 0, WATER = 1, FOREST = 2;
export const SOLVE_R = 3;
// residents per house level; a house's level is 1 + the number of service types covering it
export const POP = [0, 4, 8, 14, 22, 34, 50, 70];
export const MAX_LVL = POP.length - 1;
export const SVC = {
  water:  { name: "Well",          need: "Water",      cost: 25,  r: 4, unlock: 0,   color: "#3f9bd1", key: "1" },
  food:   { name: "Farm",          need: "Food",       cost: 40,  r: 5, unlock: 0,   color: "#c99a2e", key: "2" },
  work:   { name: "Workshop",      need: "Jobs",       cost: 70,  r: 5, unlock: 60,  color: "#c4643f", key: "3" },
  health: { name: "Clinic",        need: "Healthcare", cost: 110, r: 6, unlock: 160, color: "#d65a83", key: "4" },
  school: { name: "School",        need: "Education",  cost: 150, r: 6, unlock: 320, color: "#7e6fd6", key: "5" },
  power:  { name: "Power station", need: "Power",      cost: 220, r: 8, unlock: 650, color: "#d1b52a", key: "6" },
};
export const TYPES = Object.keys(SVC);
export const RANKS = [[0, "Hamlet"], [80, "Village"], [300, "Town"], [900, "City"], [2200, "Metropolis"]];
export const ROOFS = [["#d9805f", "#ad5839"], ["#8493ad", "#5a6882"], ["#ddb35c", "#b38832"], ["#62aaa2", "#3e7d77"], ["#b884a3", "#8c5b77"], ["#e6dac8", "#bcab92"]];
export const ICON = {
  water: "M12 2.5c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11z",
  food: "M11 21v-6.6C7.2 14 4.6 11.2 4.6 6.6c4 0 6.6 2.4 7.2 5.6.7-3.9 3.4-6.9 7.6-6.9 0 4.6-2.8 7.8-6.4 8.5V21z",
  health: "M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z",
  school: "M2.5 5.4c3.2-1 6.4-.6 8.7 1.3V20c-2.3-1.7-5.5-2.2-8.7-1.3zM21.5 5.4c-3.2-1-6.4-.6-8.7 1.3V20c2.3-1.7 5.5-2.2 8.7-1.3z",
  power: "M13.5 2 5 13.5h5.5L9.5 22 19 9.8h-5.6z",
};
export const DIRS = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
