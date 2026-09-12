// Fixed slot order from the validated categorical palette. Assigned by entity,
// never cycled — a filter that hides a category must not repaint the others.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const CATEGORY_COLOR = {
  Food: SERIES[0],
  Utilities: SERIES[1],
  Travel: SERIES[2],
  Shopping: SERIES[3],
  Healthcare: SERIES[4],
  Housing: SERIES[5],
  Misc: SERIES[6],
};

export const AXIS = { stroke: '#94a3b8', fontSize: 11 };
export const GRID = '#e2e8f0';
