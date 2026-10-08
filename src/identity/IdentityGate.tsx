import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GameBoyMobile } from '../components/GameBoyMobile';
import { COMBO_LENGTH } from './policy';
import type { ComboInput } from './policy';
import { readIdentity, requestPersistence, saveIdentity, markFirebaseSession } from './storage';
import { authSession } from './authSession';
import type { Session } from './authSession';
import type { Vault, WalletSecret } from './vault';
import './identity.css';

type Stage = 'loading' | 'welcome' | 'backup' | 'check' | 'create-code' | 'confirm-code' | 'unlock' | 'restore' | 'saved' | 'settings' | 'reveal' | 'closed' | 'error';
type Purpose = 'enter' | 'reveal' | 'change';
const noop = () => {};
const cryptoModule = () => import('./vault');


function IdentityButton({ children, onClick, disabled, secondary }: { children: ReactNode; onClick: () => void; disabled: boolean; secondary: boolean }) {
  return <button type="button" className={`identity-button ${secondary ? 'identity-secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function IdentityGate({ children }: { children: (options: { onOpenIdentity: () => void; identityPaused: boolean }) => ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [vault, setVault] = useState<Vault | null>(null);
  const [entered, setEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [combo, setCombo] = useState<ComboInput[]>([]);
  const [phrase, setPhrase] = useState('');
  const [answers, setAnswers] = useState(['', '', '']);
  const [positions, setPositions] = useState<number[]>([]);
  const [backedUp, setBackedUp] = useState(false);
  const [restoreAcknowledged, setRestoreAcknowledged] = useState(false);
  const [unlockMs, setUnlockMs] = useState<number | null>(null);
  const [persistence, setPersistence] = useState('');
  const secret = useRef<WalletSecret | null>(null);
  const firstCombo = useRef<ComboInput[]>([]);
  const session = useRef<Session | null>(null);
  const loginRequest = useRef<AbortController | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('enter');
  const changeCode = useRef(false);
  const epoch = useRef(0);
  const working = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const perf = new URLSearchParams(location.search).has('perf');

  const clearSensitive = useCallback(() => {
    loginRequest.current?.abort();
    loginRequest.current = null;
    secret.current = null;
    firstCombo.current = [];
    setCombo([]); setPhrase(''); setAnswers(['', '', '']); setBackedUp(false);
    setRestoreAcknowledged(false);
  }, []);

  const run = async (operation: (ticket: number) => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    const ticket = epoch.current;
    try { await operation(ticket); }
    catch (err) { if (ticket === epoch.current) setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { if (ticket === epoch.current) { working.current = false; setBusy(false); } }
  };

  const refresh = useCallback(async (settings = false) => {
    const ticket = ++epoch.current;
    clearSensitive(); setError(''); setStage('loading');
    working.current = false; setBusy(false);
    try {
      const stored = await readIdentity();
      if (ticket !== epoch.current) return;
      // Keep even a damaged envelope as the expected value for explicit recovery.
      setVault(stored.vault); session.current = null;
      if (!stored.vault) { setStage('welcome'); return; }
      const module: typeof import('./vault') = await cryptoModule();
      if (ticket !== epoch.current) return;
      module.validateVault(stored.vault);
      if (stored.sessionAddress === stored.vault.address) {
        const controller = new AbortController(); loginRequest.current = controller;
        const verified = await authSession.resume(stored.vault.address, controller.signal);
        if (ticket !== epoch.current) return;
        session.current = verified;
      }
      if (ticket !== epoch.current) return;
      const recent = session.current !== null;
      if (recent) {
        if (settings) setStage('settings');
        else { setEntered(true); setStage('closed'); }
      } else { setPurpose('enter'); setStage('unlock'); }
    } catch (err) {
      if (ticket === epoch.current) { setError(err instanceof Error ? err.message : 'Device storage could not be read.'); setStage('error'); }
    }
  }, [clearSensitive]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    // These are secret/lifecycle refs, not DOM refs; clear their latest values at disposal.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { disposed = true; epoch.current++; loginRequest.current?.abort(); secret.current = null; firstCombo.current = []; };
  }, [refresh]);

  useEffect(() => {
    const hide = () => {
      epoch.current++; clearSensitive(); working.current = false; setBusy(false);
      if (stage !== 'closed') { setPurpose('enter'); setStage(vault ? 'unlock' : 'welcome'); }
    };
    const visibility = () => {
      if (document.hidden) hide();
      else void refresh(stage !== 'closed');
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    const sensitive = ['backup', 'check', 'create-code', 'confirm-code', 'reveal', 'restore'].includes(stage);
    const timer = sensitive ? setTimeout(() => { hide(); setError('For your privacy, this screen timed out. Please start again.'); }, 120_000) : undefined;
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide); clearTimeout(timer); };
  }, [stage, vault, clearSensitive, refresh]);

  useEffect(() => { screenRef.current?.scrollTo(0, 0); }, [stage]);

  useEffect(() => {
    if (stage !== 'closed' || !session.current) return;
    const remaining = session.current.walletSignedInAt + 48 * 60 * 60 * 1000 - Date.now();
    const timer = setTimeout(() => void refresh(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [stage, refresh]);

  const create = () => void run(async ticket => {
    const module = await cryptoModule();
    if (ticket !== epoch.current) return;
    changeCode.current = false;
    secret.current = module.createSecret();
    setPositions(module.backupPositions()); setPhrase(secret.current.mnemonic); setStage('backup');
  });
  const checkBackup = () => {
    const words = secret.current?.mnemonic.split(' ');
    if (!words || positions.some((position, i) => answers[i].trim().toLowerCase() !== words[position])) {
      setAnswers(['', '', '']); setError('Check your written backup and try those three words again.'); return;
    }
    setAnswers(['', '', '']); setError(''); setStage('create-code');
  };
  const restore = () => void run(async ticket => {
    if (!restoreAcknowledged) return;
    const module = await cryptoModule();
    if (ticket !== epoch.current) return;
    secret.current = module.restoreSecret(phrase);
    setPhrase(''); changeCode.current = false; setStage('create-code');
  });
  const stepUp = (next: Purpose) => {
    clearSensitive(); setError(''); setPurpose(next); setStage('unlock');
  };
  const confirmCombo = () => {
    if (combo.length !== COMBO_LENGTH || working.current) return;
    const submitted = [...combo]; setCombo([]);
    if (stage === 'create-code') { firstCombo.current = submitted; setStage('confirm-code'); return; }
    if (stage === 'confirm-code') {
      if (submitted.some((input, i) => input !== firstCombo.current[i])) {
        firstCombo.current = []; setError('The two codes did not match. Choose seven presses again.'); setStage('create-code'); return;
      }
      firstCombo.current = [];
      void run(async ticket => {
        const module = await cryptoModule();
        if (ticket !== epoch.current || !secret.current) return;
        const wallet = secret.current;
        const next = await module.encryptVault(wallet, submitted);
        if (ticket !== epoch.current) return;
        await saveIdentity(next, vault);
        if (ticket !== epoch.current) return;
        setVault(next);
        clearSensitive();
        if (!changeCode.current) {
          setPurpose('enter'); setStage('unlock');
          const controller = new AbortController(); loginRequest.current = controller;
          const { privateKeyToAccount } = await import('viem/accounts');
          if (ticket !== epoch.current) return;
          const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
          const verified = await authSession.login(next.address, message => account.signMessage({ message }), controller.signal);
          if (ticket !== epoch.current) return;
          session.current = verified;
          await markFirebaseSession(next.address, next);
        }
        if (ticket !== epoch.current) return;
        setVault(next); clearSensitive();
        const result = await requestPersistence();
        if (ticket !== epoch.current) return;
        setPersistence(result); setStage('saved');
      });
    } else if (stage === 'unlock' && vault) {
      void run(async ticket => {
        const module = await cryptoModule();
        if (ticket !== epoch.current) return;
        const result = await module.decryptVault(vault, submitted);
        if (ticket !== epoch.current) return;
        const current = await readIdentity();
        if (ticket !== epoch.current) return;
        if (JSON.stringify(current.vault) !== JSON.stringify(vault)) throw new Error('Your identity changed in another tab. Reload before continuing.');
        setUnlockMs(result.elapsedMs);
        if (purpose === 'enter') {
          const controller = new AbortController(); loginRequest.current = controller;
          const { privateKeyToAccount } = await import('viem/accounts');
          if (ticket !== epoch.current) return;
          const account = privateKeyToAccount(result.secret.privateKey as `0x${string}`);
          const verified = await authSession.login(vault.address, message => account.signMessage({ message }), controller.signal);
          if (ticket !== epoch.current) return;
          session.current = verified;
          await markFirebaseSession(vault.address, vault);
          if (ticket === epoch.current) setStage('settings');
        } else if (purpose === 'reveal') { setPhrase(result.secret.mnemonic); setStage('reveal'); }
        else { secret.current = result.secret; changeCode.current = true; setStage('create-code'); }
      });
    }
  };

  const entryStage = stage === 'create-code' || stage === 'confirm-code' || stage === 'unlock';
  const title = stage === 'create-code' ? 'Choose your secret code' : stage === 'confirm-code' ? 'Repeat your seven presses' :
    stage === 'unlock' ? (purpose === 'enter' ? 'Welcome back' : 'One quick security check') : '';
  const leave = () => { clearSensitive(); void refresh(); };
  const startRestore = () => { clearSensitive(); changeCode.current = false; setError(''); setStage('restore'); };
  const wordGrid = () => <ol className="identity-words">{phrase.split(' ').map((word, i) => <li key={i}><span>{i + 1}</span>{word}</li>)}</ol>;

  return <>
    {entered && <div inert={stage !== 'closed'} style={stage === 'closed' ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}>
      {children({ onOpenIdentity: () => void refresh(true), identityPaused: stage !== 'closed' })}
    </div>}
    {stage !== 'closed' && <div className="identity-cover">
      <GameBoyMobile canvasRef={canvasRef} playerState="land" currentAction="idle" playerName="Player ID" floatColor="red" playerCount={0} chatLog={[]}
        onDirectionChange={noop} onToggleState={noop} onActionA={noop} onTriggerEmote={noop} onSendMessage={noop}
        onOpenFloatPicker={noop} onOpenNameModal={noop} onOpenHelpModal={noop} statusLabel="LUMEN BAY · PLAYER ID" hideStatusBadge
        identityControls={{ disabled: busy || !entryStage, onInput: input => { setError(''); setCombo(previous => previous.length < COMBO_LENGTH ? [...previous, input] : previous); },
          onDelete: () => setCombo(previous => previous.slice(0, -1)), onConfirm: confirmCombo }}
        screenOverlay={<section className="identity-screen" ref={screenRef} aria-label="Player identity" aria-busy={busy}>
          <div className="identity-kicker">YOUR LITTLE PLACE IN THE WORLD</div>
          {stage === 'loading' && <><h1>Finding your identity…</h1><p>This stays on your device.</p></>}
          {stage === 'welcome' && <>
            <div className="identity-emblem" aria-hidden="true">◇</div>
            <h1>Welcome to<br />Lumen Bay</h1>
            <p>No identity is saved in this browser. Already been here? Your written words bring you back.</p>
            {<IdentityButton onClick={startRestore} disabled={busy || (false)} secondary={false}>{'Restore with your 12 words'}</IdentityButton>}
            {<IdentityButton onClick={create} disabled={busy || (false)} secondary={true}>{"I’m new — create an identity"}</IdentityButton>}
            <p className="identity-note">A new identity has its own Player ID. Nothing will be created until you choose.</p>
          </>}
          {stage === 'backup' && <>
            <div className="identity-step">01 / BACK UP</div><h1>Write these down</h1>
            <p>These 12 words recover your identity if this device loses its data. Keep them private and in order.</p>
            {wordGrid()}
            <label className="identity-check"><input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} />I wrote all 12 words on paper.</label>
            {<IdentityButton onClick={() => { setPhrase(''); setStage('check'); }} disabled={busy || (!backedUp)} secondary={false}>{'Check my backup'}</IdentityButton>}
          </>}
          {stage === 'check' && <>
            <div className="identity-step">02 / CHECK</div><h1>A little backup check</h1><p>Use your paper to fill in these three words.</p>
            <form onSubmit={e => { e.preventDefault(); checkBackup(); }} autoComplete="off">
              {positions.map((position, i) => <label key={position}>Word {position + 1}<input type="password" value={answers[i]} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={12}
                onChange={e => setAnswers(previous => previous.map((answer, j) => i === j ? e.target.value : answer))} /></label>)}
              <button className="identity-button" type="submit">My backup is ready</button>
            </form>
          </>}
          {entryStage && <>
            <div className="identity-step">{stage === 'unlock' ? 'PRIVATE ENTRY' : '03 / YOUR CODE'}</div>
            <h1>{title}</h1>
            <p>Press any mix of the D-pad and four face buttons below. Exactly seven presses.</p>
            <div className="identity-dots" role="status" aria-label={`${combo.length} of 7 presses entered`}>
              {Array.from({ length: 7 }, (_, i) => <span className={i < combo.length ? 'filled' : ''} key={i} />)}
            </div>
            {<IdentityButton onClick={confirmCombo} disabled={busy || (combo.length !== 7)} secondary={false}>{busy ? 'Opening your identity…' : stage === 'create-code' ? 'Use this code' : 'Confirm'}</IdentityButton>}
            {<IdentityButton onClick={() => setCombo(previous => previous.slice(0, -1))} disabled={busy || (combo.length === 0)} secondary={true}>{'Delete last press'}</IdentityButton>}
            <p className="identity-keyboard">Keyboard: arrows · T △ · O ◯ · X ✕ · Q ▢<br />SELECT / Backspace = delete · START / Enter = confirm</p>
            <p className="identity-note">A short code can be guessed if someone steals the encrypted file. Your written backup is essential.</p>
            {stage === 'unlock' && <IdentityButton onClick={startRestore} disabled={busy || (false)} secondary={true}>{'Forgot code? Restore with 12 words'}</IdentityButton>}
          </>}
          {stage === 'restore' && <>
            <div className="identity-step">RECOVERY</div><h1>Restore with your 12 words</h1>
            <p>Enter your written words in order. They are checked only on this device.</p>
            <form autoComplete="off" onSubmit={e => { e.preventDefault(); restore(); }}>
              <label>Your recovery words<textarea aria-label="Your recovery words" value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={180} rows={4} /></label>
              <label className="identity-check"><input type="checkbox" checked={restoreAcknowledged} onChange={e => setRestoreAcknowledged(e.target.checked)} />{vault ? 'Replace this device’s saved identity using my written backup.' : 'I have kept these 12 words safely on paper.'}</label>
              <button type="submit" className="identity-button" disabled={busy || !restoreAcknowledged}>Recover my Player ID</button>
            </form>
            <p className="identity-note">Next, choose a new controller code. Server data recovery comes in a later step.</p>
          </>}
          {stage === 'saved' && <>
            <div className="identity-emblem" aria-hidden="true">◇</div><h1>Ready for Lumen Bay</h1>
            <p>Your encrypted identity is saved on this device. Keep your paper backup: browsers can clear their storage.</p>
            <div className="identity-tip"><strong>Add to Home Screen</strong><p>On iPhone: Safari → Share → Add to Home Screen. Open the game from that icon next time.</p></div>
            <p className="identity-note">{persistence === 'granted' ? 'Persistent storage was granted. Your backup is still required.' : 'Persistent storage was not granted or is unavailable. Keep your backup.'}</p>
            {<IdentityButton onClick={leave} disabled={busy || (false)} secondary={false}>{'Continue to Lumen Bay'}</IdentityButton>}
          </>}
          {stage === 'settings' && <>
            <div className="identity-step">YOUR PLAYER ID</div><h1>A place that’s yours</h1>
            <p className="identity-address">{vault?.address}</p>
            <p>Your code stays private. Returning within 48 hours does not ask for it again.</p>
            {<IdentityButton onClick={leave} disabled={busy || (false)} secondary={false}>{'Continue to Lumen Bay'}</IdentityButton>}
            {<IdentityButton onClick={() => stepUp('reveal')} disabled={busy || (false)} secondary={true}>{'Show my 12 words'}</IdentityButton>}
            {<IdentityButton onClick={() => stepUp('change')} disabled={busy || (false)} secondary={true}>{'Change my controller code'}</IdentityButton>}
            <p className="identity-note">Signed in to Lumen Bay. Owned-item saves arrive in the next step.</p>
          </>}
          {stage === 'reveal' && <>
            <div className="identity-step">PRIVATE BACKUP</div><h1>Only for your eyes</h1><p>Anyone with these words can recover your identity. Keep them off chat and screenshots.</p>
            {wordGrid()}{<IdentityButton onClick={() => { clearSensitive(); setStage('settings'); }} disabled={busy || (false)} secondary={false}>{'Hide words'}</IdentityButton>}
          </>}
          {stage === 'error' && <><h1>Your identity needs a moment</h1><p>We have not created or replaced anything.</p>{<IdentityButton onClick={() => void refresh()} disabled={busy || (false)} secondary={false}>{'Try reading storage again'}</IdentityButton>}{<IdentityButton onClick={startRestore} disabled={busy || (false)} secondary={true}>{'Restore with your 12 words'}</IdentityButton>}</>}
          {error && <p role="alert" className="identity-error">{error}</p>}
          {busy && <p role="status">Signing in securely…</p>}
          {perf && unlockMs !== null && <p className="identity-note" data-testid="unlock-time">Last local unlock: {unlockMs} ms · this device</p>}
          {!['welcome', 'loading', 'closed', 'saved', 'settings', 'error'].includes(stage) && <IdentityButton onClick={() => void refresh(entered)} disabled={busy || (false)} secondary={true}>{'Cancel'}</IdentityButton>}
        </section>}
      />
    </div>}
  </>;
}
