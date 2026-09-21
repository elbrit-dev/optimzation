'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

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
 *
 * `subtreeToggle` adds a DEPTH to the choice, and with it MULTI-SELECT.
 * Picking a node in a hierarchy is really two questions — which nodes, and
 * whether you mean the branches under them — and answering the second
 * somewhere else on the page leaves two controls to keep in step.
 *
 * With the toggle on, `value` is an array of `{ id, includeSubtree }` and
 * each row cycles: unticked → that node ALONE (`–`) → its whole branch
 * (`✓`) → unticked. `onChange` fires with the next array. The three-step
 * cycle is what single-select could not have: with one slot, "off" is not
 * a state you can leave the control in.
 *
 * The LAST remaining selection cannot be cleared — it cycles back to `–`
 * instead. An empty picker reports on nobody, which is a screen of zeroes
 * that looks like a data fault rather than like a choice; but REFUSING the
 * click is worse still, because the sole selection is the row most likely
 * to be pressed first and a control that does nothing reads as broken.
 * Wrapping gives it somewhere to go.
 *
 * A NODE UNDER A TICKED BRANCH IS ALREADY IN. It renders as included —
 * muted, and labelled "included via <ancestor>" — rather than as an empty
 * box, because an empty box next to a ticked parent says the opposite of
 * what the selection means. It is not separately clickable: the way to
 * report on it alone is to untick the branch that swallowed it, and the
 * alternative (an exclusion list) is a second concept for the reader to
 * hold for a case two clicks already answer.
 *
 * Widening a node to its branch PRUNES any picks underneath it, so the
 * value never carries an entry the union already covers. Without that the
 * panel fills with dashes that change nothing — which is what it did, and
 * is how this was found.
 *
 * `mixed` in ARIA terms is exactly "this node but not its descendants", so
 * the dash is not decoration — a screen reader gets the same three states a
 * sighted reader does.
 *
 * THE PANEL STAYS OPEN in this mode. It closes on a pick when there is one
 * question to answer; closing after the first of two would make the second
 * click impossible to reach.
 *
 * Depth is NOT inferred from whether a node has children here. The tree it
 * is given may be a filtered view of a deeper org — ScopeSelect shows only
 * managers, so its leaves are ABMs who very much have people under them —
 * and a childless-looking row is not a childless node. Every row gets both
 * states; a caller for whom that is genuinely wrong should leave the toggle
 * off.
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

/* Every id strictly BELOW `id`. Used both to prune picks a widened branch
   has absorbed, and to mark the rows that branch now covers. */
function descendantIds(nodes, id, inside = false, out = []) {
  for (const node of nodes) {
    const within = inside || node.id === id;
    if (within && node.id !== id) out.push(node.id);
    if (node.children) descendantIds(node.children, id, within, out);
  }
  return out;
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

function TreeSelectNode({ node, depth, value, subtreeToggle, covers, onPick, expanded, toggle }) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);
  const entry = subtreeToggle ? value?.find((v) => v.id === node.id) : null;
  const coveredBy = !entry ? covers?.get(node.id) : null;
  const isSelected = subtreeToggle ? Boolean(entry) || Boolean(coveredBy) : node.id === value;
  const checked = entry
    ? (entry.includeSubtree ? true : 'mixed')
    : coveredBy
      ? true
      : false;

  return (
    <div className="ds-disclosure" style={{ '--ds-disclosure-depth': depth }}>
      <div className="ds-disclosure__header ds-disclosure__header--interactive">
        {hasChildren ? (
          <button
            type="button"
            className="ds-treeselect__caret"
            aria-expanded={isOpen}
            /* Named, not just "Expand": in a panel of twenty rows a
               screen reader otherwise hears the same two words twenty
               times with nothing to tell them apart. */
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={() => toggle(node.id)}
          >
            <Icon name="chevron-right" size="sm" />
          </button>
        ) : (
          <span className="ds-treeselect__caret-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className={cx(
            'ds-treeselect__option',
            isSelected && 'ds-treeselect__option--selected',
            coveredBy && 'ds-treeselect__option--covered',
          )}
          role={subtreeToggle ? 'checkbox' : undefined}
          aria-checked={subtreeToggle ? checked : undefined}
          aria-disabled={coveredBy ? true : undefined}
          title={coveredBy ? `Already included via ${coveredBy}` : undefined}
          aria-current={!subtreeToggle && isSelected ? true : undefined}
          onClick={() => (coveredBy ? undefined : onPick(node.id))}
        >
          {subtreeToggle ? (
            <span
              className={cx(
                'ds-treeselect__mark',
                checked === true && 'ds-treeselect__mark--all',
                checked === 'mixed' && 'ds-treeselect__mark--self',
                coveredBy && 'ds-treeselect__mark--covered',
              )}
              aria-hidden="true"
            >
              {checked === 'mixed' ? '–' : '✓'}
            </span>
          ) : null}
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
              subtreeToggle={subtreeToggle}
              covers={covers}
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
  /* An id when `subtreeToggle` is off; an array of { id, includeSubtree }
     when it is on. Two shapes for one prop rather than two props, because
     the depth and the id are one answer and splitting them lets a caller
     hold half of it. */
  value,
  subtreeToggle = false,
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
    const ids = subtreeToggle ? (value ?? []).map((v) => v.id) : [value];
    /* Each selected node AND its ancestors. The node itself because it is
       the row whose branch the widening click is about, so opening it
       collapsed would hide exactly what widening would add. */
    const want = [];
    for (const id of ids) {
      const trail = pathTo(tree, id);
      if (trail) want.push(...trail, id);
    }
    if (!want.length) return;
    setExpanded((prev) => {
      /* Bail out by RETURNING prev, not by skipping the call: a fresh Set
         every render is a new identity, which re-runs this effect through
         `tree` and spins. */
      if (want.every((id) => prev.has(id))) return prev;
      return new Set([...prev, ...want]);
    });
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

  /* id -> the label of the ticked branch that already contains it. Built
     once per render off the picks, so a row does not have to walk the tree
     to find out whether it is in. */
  const covers = useMemo(() => {
    const out = new Map();
    if (!subtreeToggle) return out;
    for (const pick of value ?? []) {
      if (!pick.includeSubtree) continue;
      const label = findLabel(tree, pick.id) ?? pick.id;
      for (const id of descendantIds(tree, pick.id)) out.set(id, label);
    }
    return out;
  }, [value, tree, subtreeToggle]);

  const toggle = (nodeId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const pick = (nodeId) => {
    if (!subtreeToggle) {
      onChange?.(nodeId);
      setOpen(false);
      return;
    }
    const list = value ?? [];
    const at = list.findIndex((v) => v.id === nodeId);
    /* Unticked -> that node ALONE. Widening is a second click, so drilling
       into somebody never silently drags their whole branch along. */
    if (at === -1) {
      onChange?.([...list, { id: nodeId, includeSubtree: false }]);
      return;
    }
    if (!list[at].includeSubtree) {
      /* Widening absorbs everything below, so any pick down there stops
         meaning anything and is dropped. Leaving them would show dashes
         under a tick that change no number if you clear them. */
      const absorbed = new Set(descendantIds(tree, nodeId));
      const next = list
        .filter((v) => v.id === nodeId || !absorbed.has(v.id))
        .map((v) => (v.id === nodeId ? { id: nodeId, includeSubtree: true } : v));
      onChange?.(next);
      return;
    }
    /* Third click clears it -- unless it is the last one standing, which
       cycles back to "this node alone" instead. A dead click is the worst
       of the three options here: refusing to clear is correct, but a
       control that does NOTHING when pressed reads as broken, and the row
       most likely to be pressed first is the sole default selection. */
    if (list.length === 1) {
      onChange?.([{ id: nodeId, includeSubtree: false }]);
      return;
    }
    onChange?.(list.filter((v) => v.id !== nodeId));
  };

  /* "Arunkumar M · ABM +2". The first pick names the report and the count
     says how much else is in it -- listing three names in a 260px trigger
     truncates all three and identifies none. */
  const picked = subtreeToggle ? (value ?? []).map((v) => v.id) : [value];
  const firstLabel = picked.length ? findLabel(tree, picked[0]) : null;
  const selectedLabel =
    firstLabel != null
      ? picked.length > 1
        ? `${firstLabel} +${picked.length - 1}`
        : firstLabel
      /* Something IS selected, it just is not in this tree -- a caller can
         default to a node the picker does not offer (see ScopeSelect with a
         non-manager viewer). Saying "Select…" there would claim nothing is
         chosen while the page behind is clearly reporting on something. */
      : picked.length
        ? `${picked.length} selected`
        : null;

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
                subtreeToggle={subtreeToggle}
                covers={covers}
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
