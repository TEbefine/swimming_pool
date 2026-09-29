export const NPC_NAMES: Record<string, string> = {
  barista: 'Barista',
  server: 'Sun',
  dj: 'DJ',
  lifeguard: 'Lifeguard',
  tycoon: 'Sir Ledger',
  nova: 'Nova',
  clara: 'Clara',
  envoy: 'Envoy',
  spirit: 'Spirit',
  mother: 'Mother',
  father: 'Father',
  yunseul: 'Yunseul',
};

export function npcName(id: string): string {
  return NPC_NAMES[id] ?? id;
}
