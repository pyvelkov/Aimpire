export type DestroyableGame = {
  destroy: () => void;
};

/**
 * Owns at most one game instance across an async boot.
 * React Strict Mode disposes the first effect before the import resolves;
 * a late instance is destroyed instead of left running beside the remount.
 */
export function createGameLifecycle() {
  let disposed = false;
  let current: DestroyableGame | null = null;

  return {
    get disposed() {
      return disposed;
    },
    attach<T extends DestroyableGame>(instance: T): T | null {
      if (disposed) {
        instance.destroy();
        return null;
      }

      if (current && current !== instance) {
        current.destroy();
      }

      current = instance;
      return instance;
    },
    dispose() {
      disposed = true;

      if (!current) {
        return;
      }

      const instance = current;
      current = null;
      instance.destroy();
    },
  };
}
