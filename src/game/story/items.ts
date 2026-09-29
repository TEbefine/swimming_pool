import type { ItemId } from './storyStore';

export interface ItemDef {
  name: string;
  /** Short line shown in the bag. */
  note: string;
  /** Colour of the little swatch in the bag (until pixel item icons exist). */
  color: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  small_net: { name: 'Small net', note: 'Father\'s old net. "Big fish are for big hands."', color: '#C9A56B' },
  mackerel: { name: 'Mackerel', note: 'Fresh from the river mouth. Master Gu pays 2 coins.', color: '#7C93A8' },
  dried_mackerel: { name: 'Dried mackerel', note: 'A day on the rack. Worth more than fresh.', color: '#9C7A55' },
  yeot: { name: 'Yeot', note: 'Sticky rice candy. Sticks to your teeth, sticks to your heart.', color: '#E3B66B' },
};
