/** Isolates a failed preference restore so the host can start with defaults. */
export function loadPreference<T>(load: () => T | null): T | null {
  try {
    return load()
  } catch (error) {
    console.error('[Preferences] Restore failed', error instanceof Error ? error.message : error)
    return null
  }
}
