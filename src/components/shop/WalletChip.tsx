import React, { useEffect, useState } from 'react';
import { coolerSlots } from '../../game/economy/wallet';
import { refreshWallet, useWallet } from '../../game/economy/walletStore';
import './shop.css';

// A small chip in the corner at Quiet Bay and the fish shop: your coins and how full the cooler is
// (ECO-01). Only rendered where the money system is on (App checks ECONOMY_ON).
export const WalletChip: React.FC<{ compact: boolean }> = ({ compact }) => {
  const w = useWallet();
  // fish spoil while you walk around: re-check every 10 s
  const [, tick] = useState(0);
  useEffect(() => {
    refreshWallet();
    const t = window.setInterval(() => { refreshWallet(); tick((n) => n + 1); }, 10_000);
    return () => window.clearInterval(t);
  }, []);
  const cap = coolerSlots(w);
  const full = w.cooler.length >= cap;
  return (
    <div className="sp-chip" data-compact={compact ? 'true' : 'false'} aria-label={`${w.coins} coins, cooler ${w.cooler.length} of ${cap}`}>
      <span><span className="sp-coin" aria-hidden="true" />{w.coins.toLocaleString('en-US')}</span>
      <span className={full ? 'is-full' : ''}>🧊 {w.cooler.length}/{cap}</span>
    </div>
  );
};
