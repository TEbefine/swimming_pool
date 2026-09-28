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
};

export function npcName(id: string): string {
  return NPC_NAMES[id] ?? id;
}
