import { describe, expect, it } from 'vitest';
import { designSystemRegistry } from '../plasmic';
import * as barrel from '../index';

/* The registry is metadata with no type checking and no runtime that fails
   loudly — a typo surfaces as a component silently missing from Studio, or as
   a duplicate-name warning nobody reads. These assertions are cheap and catch
   both. */

describe('design-system Plasmic registry', () => {
  it('pairs every entry with a component and a meta', () => {
    for (const entry of designSystemRegistry) {
      const [component, meta] = entry;
      /* Not `toBeTypeOf('function')`: a forwardRef component — Button, Field,
         Select — is an object, and asserting on the callable form would have
         failed three correct entries. */
      expect(component, `component for ${meta?.name}`).toBeTruthy();
      expect(['function', 'object'], `component for ${meta?.name}`).toContain(typeof component);
      expect(meta?.name, 'meta.name').toBeTruthy();
      expect(meta?.importPath, `importPath for ${meta?.name}`).toBeTruthy();
      expect(meta?.importName, `importName for ${meta?.name}`).toBeTruthy();
    }
  });

  it('has no duplicate registration names', () => {
    // Re-registering a name warns in Studio and the second one wins silently.
    const names = designSystemRegistry.map(([, meta]) => meta.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('registers every primitive the barrel exports', () => {
    // The barrel is the public API; anything in it that is not registered is
    // invisible to Studio, which is how a primitive gets rebuilt by hand.
    const registered = new Set(designSystemRegistry.map(([, meta]) => meta.importName));
    const exported = Object.entries(barrel)
      .filter(([name, value]) => {
        if (!/^[A-Z][a-z]/.test(name)) return false; // TONES etc. are not components
        return typeof value === 'function' || typeof value === 'object';
      })
      .map(([name]) => name);

    const missing = exported.filter((name) => !registered.has(name));
    expect(missing).toEqual([]);
  });

  it('points importPath at a real file name', () => {
    for (const [, meta] of designSystemRegistry) {
      expect(meta.importPath.endsWith(`/${meta.importName}`), meta.name).toBe(true);
    }
  });
});
