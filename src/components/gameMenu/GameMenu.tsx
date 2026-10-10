import React from 'react';
import type { PlayerState } from '../../game/types';
import { topView } from './menuModel';
import type { GameMenuApi } from './useGameMenu';
import { DescriptionBox } from './DescriptionBox';
import { HintBar, hintsFor } from './HintBar';
import { StartMenu, fieldDescription } from '../startMenu/StartMenu';
import { EmoteScreen, getEmoteItems } from '../startMenu/EmoteScreen';
import { OptionsScreen } from '../startMenu/OptionsScreen';
import { OPTION_ROWS } from '../startMenu/optionRows';
import { BagScreen } from '../bag/BagScreen';

interface GameMenuProps {
  menu: GameMenuApi;
  playerName: string;
  playerState: PlayerState;
  /** True inside the Game Boy screen (small), false in the desktop arcade screen. */
  compact: boolean;
}

/**
 * Everything the menu draws inside the game screen: the field menu (START), Emotes, Options and
 * the Bag. It has no input code of its own: see gameMenu/useGameMenu.ts and menuInput.ts.
 */
export const GameMenu: React.FC<GameMenuProps> = ({ menu, playerName, playerState, compact }) => {
  const { state } = menu;
  if (!state.open) return null;
  const view = topView(state);
  const h = hintsFor(compact);

  if (view === 'bag') {
    return (
      <BagScreen
        state={state}
        playerName={playerName}
        compact={compact}
        onPress={menu.press}
        onPoint={menu.point}
        onPocket={menu.setPocket}
      />
    );
  }

  const emotes = getEmoteItems(playerState);
  let panel: React.ReactNode;
  let description = '';
  let hints = [h.move, h.select, h.back, h.close];

  if (view === 'emotes') {
    const i = Math.min(state.emotes, emotes.length - 1);
    panel = <EmoteScreen items={emotes} active={i} onPoint={menu.point} />;
    description = emotes[i]?.description ?? '';
  } else if (view === 'options') {
    const i = Math.min(state.options, OPTION_ROWS.length - 1);
    panel = <OptionsScreen active={i} onPoint={menu.point} />;
    description = OPTION_ROWS[i]?.description ?? '';
    hints = [h.move, h.change, h.back, h.close];
  } else {
    panel = <StartMenu playerName={playerName} active={state.field} onPoint={menu.point} />;
    description = fieldDescription(state.field);
  }

  return (
    <div className="gm-root" data-compact={compact}>
      {/* Clicking the world behind the menu goes back one level, like ✕. */}
      <div className="gm-scrim" onClick={() => menu.press('back')} />
      {panel}
      <DescriptionBox className="gm-field-desc" text={description} />
      <HintBar hints={hints} onPress={menu.press} />
    </div>
  );
};
