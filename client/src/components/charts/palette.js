// Fixed slot order from the validated categorical palette. Assigned by entity,
// never cycled — a filter that hides a category must not repaint the others.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const DEFAULT_CATEGORY_COLOR = {
  Food: SERIES[0],
  Utilities: SERIES[1],
  Travel: SERIES[2],
  Shopping: SERIES[3],
  Healthcare: SERIES[4],
  Housing: SERIES[5],
  Misc: SERIES[6],
};

/**
 * Colour follows the entity, never its rank — so a custom category hashes to a
 * fixed slot by name. The same category keeps the same colour in every chart,
 * whatever else is on screen.
 */
export function categoryColor(name) {
  if (DEFAULT_CATEGORY_COLOR[name]) return DEFAULT_CATEGORY_COLOR[name];

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 2147483647;
  return SERIES[hash % SERIES.length];
}

export const CATEGORY_COLOR = DEFAULT_CATEGORY_COLOR;

export const AXIS = { stroke: '#94a3b8', fontSize: 11 };
export const GRID = '#e2e8f0';
