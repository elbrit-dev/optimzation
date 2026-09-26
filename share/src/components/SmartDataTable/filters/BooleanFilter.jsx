'use client';

export function BooleanFilter({ field, value, onFilter }) {
  const current = value?.value ?? null; // null | true | false

  function handleClick() {
    let next;
    if (current === null)  next = true;
    else if (current === true)  next = false;
    else next = null;

    onFilter(field, next === null ? null : { type: 'boolean', value: next });
  }

  return (
    <div
      onClick={handleClick}
      className="w-5 h-5 border-2 rounded cursor-pointer flex items-center justify-center transition-colors"
      style={{
        borderColor:     current === null ? 'var(--ds-text-muted)' : current ? 'var(--intent-success)' : 'var(--intent-danger)',
        backgroundColor: current === null ? 'transparent' : current ? 'var(--intent-success)' : 'var(--intent-danger)',
      }}
      title={current === null ? 'All' : current ? 'Yes only' : 'No only'}
    >
      {current === true  && <i className="pi pi-check text-on-brand text-xs" />}
      {current === false && <i className="pi pi-times text-on-brand text-xs" />}
      {current === null  && <i className="pi pi-minus text-ds-muted text-xs" />}
    </div>
  );
}
