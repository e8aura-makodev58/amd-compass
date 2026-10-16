/**
 * Shared v4 mode seam. Live and Offline retain their own event sources, but
 * callers use this adapter for state/reset rather than treating them as two
 * separate applications. Assignment/recommendation adapters join this seam in
 * later work packages after the persistent live transaction service exists.
 */
export function createModeService({ liveStore, offlineRuntime }) {
  if (!liveStore || !offlineRuntime) throw new Error("Live and Offline stores are required");
  return {
    async getState(mode) {
      if (mode === "LIVE") return liveStore.publicSnapshot();
      if (mode === "OFFLINE") return offlineRuntime.snapshot();
      throw new Error(`Unsupported Compass mode: ${mode}`);
    },
    async reset(mode) {
      if (mode === "LIVE") return liveStore.reset();
      if (mode === "OFFLINE") return offlineRuntime.reset();
      throw new Error(`Unsupported Compass mode: ${mode}`);
    },
  };
}
