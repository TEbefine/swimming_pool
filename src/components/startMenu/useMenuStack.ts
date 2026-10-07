import { useState, useCallback } from 'react';

export type MenuScreenId = 'root' | 'emote' | 'option' | 'idCard';

export function useMenuStack(initialScreen: MenuScreenId = 'root') {
  const [stack, setStack] = useState<MenuScreenId[]>([initialScreen]);

  const currentScreen = stack[stack.length - 1];

  const push = useCallback((screen: MenuScreenId) => {
    setStack((prev) => [...prev, screen]);
  }, []);

  const pop = useCallback((): boolean => {
    if (stack.length <= 1) return false;
    setStack((prev) => prev.slice(0, -1));
    return true;
  }, [stack.length]);

  const reset = useCallback(() => {
    setStack([initialScreen]);
  }, [initialScreen]);

  return {
    stack,
    currentScreen,
    push,
    pop,
    reset,
    isRoot: stack.length === 1,
  };
}
