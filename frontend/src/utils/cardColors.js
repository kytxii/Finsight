// A small set of distinct premium card gradients. Index 0 (green) is the
// default look, used for the "New Credit Card Balance" form where there's
// no real id yet to assign a color from.
export const CARD_GRADIENTS = [
  "linear-gradient(135deg, #1c3b2c 0%, #0f2118 45%, #060f0c 100%)", // green (default)
  "linear-gradient(135deg, #16233f 0%, #0c1526 45%, #050a12 100%)", // navy
  "linear-gradient(135deg, #2e1c3f 0%, #1a1026 45%, #0c0714 100%)", // purple
  "linear-gradient(135deg, #3a1620 0%, #200b12 45%, #0f0509 100%)", // wine
  "linear-gradient(135deg, #2a2a2e 0%, #17171a 45%, #0a0a0b 100%)", // graphite
  "linear-gradient(135deg, #103a3a 0%, #081f1f 45%, #040f0f 100%)", // teal
  "linear-gradient(135deg, #3a2a10 0%, #201708 45%, #0f0b04 100%)", // bronze
  "linear-gradient(135deg, #1e2a3f 0%, #101826 45%, #080c12 100%)", // slate
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Deterministic per-card color: same id always lands on the same gradient,
// but within one render of a list, colliding cards step to the next unused
// slot so every balance on screen reads as visually distinct (#54).
export function assignCardColors(ids) {
  const used = new Set();
  const byId = {};
  for (const id of ids) {
    let idx = hashString(id) % CARD_GRADIENTS.length;
    let tries = 0;
    while (used.has(idx) && tries < CARD_GRADIENTS.length) {
      idx = (idx + 1) % CARD_GRADIENTS.length;
      tries++;
    }
    used.add(idx);
    byId[id] = idx;
  }
  return byId;
}

// Single-card variant (no collision set needed) - used wherever only one
// balance's color is needed, e.g. the individual balance page.
export function cardColorIndex(id) {
  return hashString(id) % CARD_GRADIENTS.length;
}
