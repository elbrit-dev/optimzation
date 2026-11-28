import React from "react";

/* A Plasmic version can use a code component this build does not register — e.g.
   a uat-only component in a version tagged `prod` by mistake (28 Nov 2026: live
   loaded 97.0.0, whose Homepage held Home Overview inside the uat-only "Surveys"
   slot, and the page body went blank). Plasmic draws an empty fragment for a
   missing component, and with it everything placed in its slots.

   This fills every missing code component with a stand-in that draws only its
   slot content (any prop that is a React element), so the rest of the page stays. */

const isNode = (v) =>
  React.isValidElement(v) || (Array.isArray(v) && v.some(React.isValidElement));

function MissingCodeComponent(props) {
  const slots = Object.entries(props).filter(([k, v]) => k !== "className" && isNode(v));
  if (!slots.length) return null;
  return React.createElement(
    React.Fragment,
    null,
    ...slots.map(([k, v]) => React.createElement(React.Fragment, { key: k }, v))
  );
}

export function fillMissingCodeComponents(components, bundleComponents) {
  const filled = [];
  for (const c of bundleComponents || []) {
    if (c && c.isCode && c.id && !components[c.id]) {
      components[c.id] = MissingCodeComponent;
      filled.push(c.displayName || c.name);
    }
  }
  return filled;
}

export function installMissingComponentFallback(loader) {
  const internal = loader && loader.__internal;
  if (!internal || typeof internal.refreshRegistry !== "function") return;
  const original = internal.refreshRegistry.bind(internal);
  internal.refreshRegistry = function refreshRegistryWithFallback() {
    original();
    try {
      const runtime = internal.registry?.getRegisteredModule?.("@plasmicapp/loader-runtime-registry");
      if (!runtime || !runtime.components) return;
      const filled = fillMissingCodeComponents(runtime.components, internal.getBundle?.()?.components);
      if (filled.length) {
        console.warn(`Plasmic: not in this build, showing slot content only: ${filled.join(", ")}`);
      }
    } catch {
      // never let the fallback break page rendering
    }
  };
}

export { MissingCodeComponent };
