'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Music2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { MusicEngine, type MusicStatus } from '@/lib/audio/engine';
import { TITLE } from '@/lib/audio/score';
import {
  getPreferences,
  parsePreferences,
  serverPreferences,
  subscribePreferences,
  updatePreferences,
} from '@/lib/audio/preferences';
import styles from './music-player.module.css';

export default function MusicPlayer() {
  const engine = useRef<MusicEngine | null>(null);
  const [status, setStatus] = useState<MusicStatus>({ state: 'idle' });
  const preferences = useSyncExternalStore(
    subscribePreferences,
    getPreferences,
    serverPreferences,
  );
  const { volume, muted } = parsePreferences(preferences);
  const labelId = useId();
  const volumeId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden')
        engine.current?.pause('Paused while you were away.', true);
    };
    const pauseOnPageHide = () =>
      engine.current?.pause('Paused while you were away.', true);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    window.addEventListener('pagehide', pauseOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      window.removeEventListener('pagehide', pauseOnPageHide);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setVolume(volume / 100);
    engine.current?.setMuted(muted);
  }, [volume, muted]);

  const loading = status.state === 'loading';
  const playing = status.state === 'playing';
  const active = playing || loading;
  const description =
    status.message ??
    (loading
      ? `Preparing music… ${Math.round((status.progress ?? 0) * 100)}%`
      : playing
        ? muted || volume === 0
          ? 'Playing silently'
          : 'Harbor ensemble · 2 minute loop'
        : status.state === 'paused'
          ? 'Music paused'
          : 'An original harbor tune');

  const toggle = () => {
    if (active) {
      engine.current?.pause();
      return;
    }
    engine.current ??= new MusicEngine(setStatus);
    engine.current.setVolume(volume / 100);
    engine.current.setMuted(muted);
    void engine.current.play();
  };

  return (
    <aside className={styles.player} aria-labelledby={labelId}>
      <Music2 className={styles.emblem} aria-hidden="true" size={20} />
      <div className={styles.track}>
        <span id={labelId} className={styles.title}>
          {TITLE}
        </span>
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.play}
          onClick={toggle}
          aria-label={
            loading
              ? 'Cancel music loading'
              : playing
                ? 'Pause music'
                : 'Play music'
          }
          aria-describedby={descriptionId}
        >
          {loading ? (
            <X size={16} aria-hidden="true" />
          ) : playing ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
          <span>{loading ? 'Cancel' : playing ? 'Pause' : 'Play'}</span>
        </button>
        <button
          type="button"
          className={styles.mute}
          onClick={() => updatePreferences({ muted: !muted })}
          aria-label="Mute music"
          aria-pressed={muted}
          title={muted ? 'Unmute music' : 'Mute music'}
        >
          {muted ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
        </button>
        <label className={styles.volume} htmlFor={volumeId}>
          <span className={styles.srOnly}>Music volume</span>
          <input
            id={volumeId}
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            aria-valuetext={`${volume}%${muted ? ', muted' : ''}`}
            onChange={(event) =>
              updatePreferences({ volume: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <output className={styles.srOnly}>
        {status.state === 'error'
          ? description
          : loading
            ? 'Preparing music'
            : playing
              ? 'Music playing'
              : status.state === 'paused'
                ? description
                : ''}
      </output>
    </aside>
  );
}
