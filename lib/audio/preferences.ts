const KEY = 'minebreak:music:v1';
const DEFAULT = '{"volume":55,"muted":false}';
let memory = DEFAULT;
let storageFailed = false;
const listeners = new Set<() => void>();

export function parsePreferences(value: string): {
  volume: number;
  muted: boolean;
} {
  try {
    const data = JSON.parse(value);
    return {
      volume:
        typeof data?.volume === 'number' && Number.isFinite(data.volume)
          ? Math.round(Math.min(100, Math.max(0, data.volume)))
          : 55,
      muted: typeof data?.muted === 'boolean' ? data.muted : false,
    };
  } catch {
    return { volume: 55, muted: false };
  }
}

export const serverPreferences = () => DEFAULT;
export function getPreferences() {
  if (storageFailed) return memory;
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    storageFailed = true;
    return memory;
  }
}

export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function updatePreferences(
  patch: Partial<{ volume: number; muted: boolean }>,
) {
  memory = JSON.stringify(
    parsePreferences(
      JSON.stringify({ ...parsePreferences(getPreferences()), ...patch }),
    ),
  );
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    storageFailed = true;
    /* In-memory controls still work with blocked storage. */
  }
  listeners.forEach((listener) => listener());
}
