export const RODS = Object.freeze([
 { id: 'rod_bamboo', name: 'Bamboo rod', price: 0, netSize: .20 },
 { id: 'rod_fiberglass', name: 'Fiberglass rod', price: 600, netSize: .24 },
 { id: 'rod_carbon', name: 'Carbon rod', price: 1800, netSize: .27 },
 { id: 'rod_master', name: 'Master rod', price: 4500, netSize: .30 },
].map(rod => Object.freeze(rod)));
export const rodLevelOf = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.floor(value))) : 0;
export const rodOf = (level: unknown) => RODS[rodLevelOf(level)];
