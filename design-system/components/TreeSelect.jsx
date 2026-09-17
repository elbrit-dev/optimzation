'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../lib/cx';

/* TreeSelect — one choice from a HIERARCHY, not a list.
 *
 * `Select` is a native <select> deliberately, because the platform picker
 * already solves a flat list perfectly. It cannot solve this one: there is no
 * native control that shows parent/child structure, and a flat 100+ option
 * <select> of managers reduces "ABM under RBM under SM" to alphabetical noise
 * — Select's own comment already calls that case out as unusable.
 *
 * So this is the one picker in the system that is NOT a native input: a
 * field-box trigger (the same shadow ring every other control uses) opening a
 * panel built from the same primitive the team tree already renders with —
 * `.ds-disclosure`. Tapping a caret expands a branch; tapping a row selects it
 * and closes the panel. Nothing here invents a new interaction; it reuses the
 * one this app already teaches on the Team tree card.
 *
 * Controlled only, like DisclosureRow: `value` is the selected id, `onChange`
 * fires with the picked id. `tree` is nested nodes, `{ id, label, children? }`
 * — building that shape from a flat roster (and deciding which levels count
 * as choosable) is the caller's job; see ScopeSelect.
 */

const SIZE_CLASS = {
  sm: 'ds-field-box--sm',
  default: 'ds-field-box--default',
  lg: 'ds-field-box--lg',
  app: 'ds-field-box--app',
};

function findLabel(nodes, value) {
  for (const node of nodes) {
    if (node.id === value) return node.label;
    if (node.children) {
      const found = findLabel(node.children, value);
      if (found != null) return found;
    }
  }
  return null;
}

/* Every ancestor id of `value`, so the panel can open already expanded to the
   current selection instead of hiding it three carets deep. */
function pathTo(nodes, value, trail = []) {
  for (const node of nodes) {
    if (node.id === value) return trail;
    if (node.children) {
      const found = pathTo(node.children, value, [...trail, node.id]);
      if (found) return found;
    }
  }
  return null;
}

function TreeSelectNode({ node, depth, value, onPick, expanded, toggle }) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === value;

  return (
    <div className="ds-disclosure" style={{ '--ds-disclosure-depth': depth }}>
      <div className="ds-disclosure__header ds-disclosure__header--interactive">
        {hasChildren ? (
          <button
            type="button"
            className="ds-disclosure__marker ds-treeselect__caret"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={() => toggle(node.id)}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="ds-disclosure__marker" aria-hidden="true">·</span>
        )}
        <button
          type="button"
          className={cx('ds-treeselect__option', isSelected && 'ds-treeselect__option--selected')}
          aria-current={isSelected || undefined}
          onClick={() => onPick(node.id)}
        >
          {node.label}
        </button>
      </div>
      {hasChildren && isOpen ? (
        <div className="ds-disclosure__children">
          {node.children.map((kid) => (
            <TreeSelectNode
              key={kid.id}
              node={kid}
              depth={depth + 1}
              value={value}
              onPick={onPick}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TreeSelect({
  label,
  hideLabel = false,
  size = 'lg',
  tree = [],
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  block = true,
  id,
  className,
  style,
}) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set(pathTo(tree, value) ?? []));
  const rootRef = useRef(null);

  /* Re-expand to the current value whenever it changes -- including from
     OUTSIDE, e.g. another control on the page reassigning scope -- so the
     panel never opens collapsed on top of the thing it is meant to show. */
  useEffect(() => {
    const trail = pathTo(tree, value);
    if (trail?.length) setExpanded((prev) => new Set([...prev, ...trail]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tree]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (nodeId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const pick = (nodeId) => {
    onChange?.(nodeId);
    setOpen(false);
  };

  const selectedLabel = findLabel(tree, value);

  return (
    <div
      ref={rootRef}
      className={cx('ds-field-wrap', block && 'ds-field-wrap--block', 'ds-treeselect', className)}
      style={style}
    >
      {label ? (
        <label className={cx('ds-field-label', hideLabel && 'ds-visually-hidden')} htmlFor={triggerId}>
          {label}
        </label>
      ) : null}

      <button
        type="button"
        id={triggerId}
        className={cx(
          'ds-field-box',
          SIZE_CLASS[size] ?? SIZE_CLASS.lg,
          'ds-treeselect__trigger',
          disabled && 'ds-field-box--disabled',
        )}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={cx('ds-treeselect__value', selectedLabel == null && 'ds-treeselect__value--placeholder')}
        >
          {selectedLabel ?? placeholder}
        </span>
        <span className="ds-treeselect__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div className="ds-treeselect__panel">
          {tree.length === 0 ? (
            <p className="ds-treeselect__empty">No options.</p>
          ) : (
            tree.map((node) => (
              <TreeSelectNode
                key={node.id}
                node={node}
                depth={0}
                value={value}
                onPick={pick}
                expanded={expanded}
                toggle={toggle}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
