'use client';

/* Living specimen page for the design system. Route: /design-system
   Every primitive rendered densely, in every state that matters — not one
   default render per component. This is the page to open when reviewing a
   token change, and the page a visual-regression baseline should cover. */

import { useState } from 'react';
import { Button as PrimeButton } from 'primereact/button';
import {
  Avatar,
  Button,
  Card,
  ChipRow,
  DisclosureRow,
  Eyebrow,
  Field,
  Icon,
  LegendChip,
  ListRow,
  Metric,
  ProgressBar,
  SectionLabel,
  Sheet,
  SegmentedControl,
  Select,
  StackedBar,
  CountBadge,
  ProgressRing,
  RingNav,
  StatusPill,
  Switch,
  Tabs,
  Tag,
  TONES,
} from '@/design-system';

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-line-subtle last:border-0">
      <div className="w-[192px] shrink-0 type-app-label text-ds-secondary">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-6">
      <h2 className="type-section text-heading mb-1">{title}</h2>
      {subtitle ? <p className="type-app-body text-ds-secondary mb-3">{subtitle}</p> : null}
      <Card variant="hairline" padding="console">
        {children}
      </Card>
    </section>
  );
}

const SWATCHES = [
  ['--brand-primary', 'brand / base'],
  ['--brand-primary-hover', 'brand / hover — lighter'],
  ['--brand-primary-active', 'brand / press — darker'],
  ['--brand-mark', 'brand mark — reserved'],
  ['--status-approved', 'approved'],
  ['--status-pending', 'pending'],
  ['--status-rejected', 'rejected'],
  ['--status-draft', 'draft'],
];

const TYPE_ROLES = [
  ['type-app-label', '10 / 20 Roboto — field labels, table cells, nav'],
  ['type-app-body', '12 / 20 Roboto — app body, list rows'],
  ['type-table-head', '12 / 20 medium — table header cells'],
  ['type-console-body', '14 / 20 Roboto — console body'],
  ['type-chip', '12 Work Sans — chips and tags'],
  ['type-section', '16 semibold Work Sans — section titles'],
  ['type-doc-head', '24 semibold — document and page headers'],
];

export default function DesignSystemPage() {
  const [view, setView] = useState('cards');
  const [notify, setNotify] = useState(true);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('today');
  const [hq, setHq] = useState('hubballi');
  const [scope, setScope] = useState('e1');
  const [open, setOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickedCard, setPickedCard] = useState('Hubballi');

  return (
    <main data-surface="console" className="min-h-screen bg-page p-6">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6">
          <h1 className="type-doc-head text-heading">Elbrit Design System</h1>
          <p className="type-app-body text-ds-secondary mt-1">
            Blue is the product, red is the brand. Density before comfort. Flat surfaces only.
            Hover lighter, press darker, focus is a ring.
          </p>
        </header>

        <Section
          title="Colour"
          subtitle="Two identities that never blend. Red appears in exactly three places: the centre nav action, the active-tab underline, and destructive intent."
        >
          <div className="flex flex-wrap gap-3">
            {SWATCHES.map(([token, label]) => (
              <div key={token} className="w-[148px]">
                <div
                  className="h-[46px] rounded-md"
                  style={{
                    background: `var(${token})`,
                    boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
                  }}
                />
                <div className="type-app-label text-ds-secondary mt-1">{label}</div>
                <code className="block font-mono text-8 text-ds-secondary">{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Type"
          subtitle="20px is the workhorse line-height, applied at 10, 12, 13 and 14px alike. It is what makes rows align."
        >
          {TYPE_ROLES.map(([cls, note]) => (
            <div
              key={cls}
              className="flex flex-wrap items-baseline gap-3 py-1.5 border-b border-line-subtle last:border-0"
            >
              <span className={`${cls} text-body w-[280px]`}>Tour plan approved</span>
              <code className="font-mono text-8 text-ds-secondary w-[140px]">.{cls}</code>
              <span className="type-app-label text-ds-secondary">{note}</span>
            </div>
          ))}
        </Section>

        <Section title="Button" subtitle="Five types. ghost and danger are orthogonal flags, not types.">
          <Row label="type">
            <Button type="primary">Submit</Button>
            <Button type="default">Cancel</Button>
            <Button type="dashed">Add row</Button>
            <Button type="text">Reset</Button>
            <Button type="link">View report</Button>
          </Row>
          <Row label="size — 24 / 32 / 40">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="app">App 22px</Button>
          </Row>
          <Row label="danger">
            <Button type="primary" danger>
              Delete
            </Button>
            <Button type="default" danger>
              Delete
            </Button>
            <Button type="text" danger>
              Delete
            </Button>
          </Row>
          <Row label="ghost / round / block">
            <Button type="primary" ghost>
              Ghost
            </Button>
            <Button shape="round">Round</Button>
          </Row>
          <Row label="with icon">
            <Button icon={<Icon name="download" />}>Export</Button>
            <Button type="default" icon={<Icon name="filter" />} iconPosition="end">
              Filter
            </Button>
            <Button type="default" icon={<Icon name="cog" label="Settings" />} />
          </Row>
          <Row label="disabled">
            <Button disabled>Primary</Button>
            <Button type="default" disabled>
              Default
            </Button>
            <Button type="text" disabled>
              Text
            </Button>
          </Row>
        </Section>

        <Section
          title="Field"
          subtitle="No border — the shadow ring supplies both the hairline and the focus ring. Inline padding is 11px, not 12."
        >
          <Row label="sizes">
            <div className="w-[180px]">
              <Field size="sm" placeholder="Small..." />
            </div>
            <div className="w-[180px]">
              <Field size="default" placeholder="Default..." />
            </div>
            <div className="w-[180px]">
              <Field size="lg" placeholder="Large..." />
            </div>
          </Row>
          <Row label="label + affix">
            <div className="w-[240px]">
              <Field
                label="Search doctors"
                placeholder="Doctor name..."
                prefix={<Icon name="search" />}
                value={query}
                onChange={setQuery}
              />
            </div>
          </Row>
          <Row label="hint / error / disabled">
            <div className="w-[200px]">
              <Field label="Period" placeholder="Choose period..." hint="Sentence case, no period" />
            </div>
            <div className="w-[200px]">
              <Field label="Quantity" defaultValue="-4" error="Must be a positive number" />
            </div>
            <div className="w-[200px]">
              <Field label="Territory" placeholder="Locked..." disabled />
            </div>
          </Row>
        </Section>

        <Section title="Status, tags and switches">
          <Row label="StatusPill — semantic">
            <StatusPill status="approved">Approved</StatusPill>
            <StatusPill status="pending">Pending</StatusPill>
            <StatusPill status="rejected">Rejected</StatusPill>
            <StatusPill status="draft">Draft</StatusPill>
            <StatusPill status="info">Submitted</StatusPill>
          </Row>
          <Row label="Tag — categorical">
            <Tag>Neutral</Tag>
            <Tag tone="blue">Cardiology</Tag>
            <Tag tone="magenta">Diabetology</Tag>
            <Tag tone="violet">Nephrology</Tag>
            <Tag tone="plum">Oncology</Tag>
            <Tag tone="cyan" variant="outline">
              Outline
            </Tag>
          </Row>
          <Row label="Switch">
            <Switch checked={notify} onChange={setNotify} label="Notifications" />
            <Switch size="lg" defaultChecked label="Large" />
            <Switch disabled label="Disabled" />
            <span className="type-app-body text-ds-secondary">
              Notifications {notify ? 'on' : 'off'}
            </span>
          </Row>
          <Row label="SegmentedControl">
            <SegmentedControl
              items={[
                { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
                { id: 'table', label: 'Table', icon: 'pi pi-table' },
              ]}
              value={view}
              onChange={setView}
            />
            <SegmentedControl items={['Day', 'Week', 'Month']} shape="pill" />
          </Row>
        </Section>

        <Section
          title="Card"
          subtitle="Shadow or hairline, never both. There is no left-accent-border card — status goes in a pill inside the card."
        >
          <div className="flex flex-wrap gap-5">
            <Card padding="app" className="w-[240px]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="type-app-body text-body">Dr. Anand Kumar</div>
                  <div className="type-app-label text-ds-secondary">Chennai · Cardiology</div>
                </div>
                <StatusPill status="approved">Done</StatusPill>
              </div>
            </Card>
            <Card variant="hairline" padding="app" className="w-[240px]">
              <div className="type-app-label text-ds-secondary">Hairline card</div>
              <div className="type-hero-numeral text-heading">32,032</div>
              <div className="type-app-label text-ds-secondary">Units dispatched</div>
            </Card>
            <Card padding="app" title="With header" actions={<Button type="text" size="sm">Edit</Button>} className="w-[240px]">
              <div className="type-app-body text-ds-secondary">Header slot takes actions on the right.</div>
            </Card>
          </div>
        </Section>

        <Section
          title="PrimeReact under DS tokens"
          subtitle="PrimeReact's Button is used at 75 call sites, and lara-light-cyan themes it CYAN — a colour absent from this palette. These now render unstyled through design-system/primereact/buttonPreset.js, not through CSS overrides, so this row is what verifies the preset."
        >
          <Row label="severity">
            <PrimeButton unstyled label="Apply" icon="pi pi-check" />
            <PrimeButton unstyled label="Clear" icon="pi pi-times" className="ds-button-outlined" />
            <PrimeButton unstyled label="Reset" className="ds-button-text" />
            <PrimeButton unstyled label="Cancel" className="ds-button-secondary" />
            <PrimeButton unstyled label="Delete" icon="pi pi-trash" className="ds-button-danger" />
          </Row>
          <Row label="size — 24 / 32 / 40">
            <PrimeButton unstyled label="Small" className="ds-button-sm" />
            <PrimeButton unstyled label="Default" />
            <PrimeButton unstyled label="Large" className="ds-button-lg" />
          </Row>
          <Row label="icon-only / disabled">
            <PrimeButton unstyled icon="pi pi-cog" />
            <PrimeButton unstyled icon="pi pi-cog" className="ds-button-outlined" />
            <PrimeButton unstyled label="Disabled" disabled />
            <PrimeButton unstyled label="Disabled" className="ds-button-outlined" disabled />
          </Row>
        </Section>

        <Section
          title="Tabs, chips and segments"
          subtitle="Three controls that look similar and are not interchangeable. Tabs change WHAT you are looking at; ChipRow selects from an open data-driven list; SegmentedControl switches how the same data renders."
        >
          <Row label="Tabs — page structure">
            <div className="w-[320px]">
              <Tabs
                value={period}
                onChange={setPeriod}
                ariaLabel="Period"
                items={[
                  { id: 'today', label: 'Today' },
                  { id: 'mtd', label: 'Month till date' },
                ]}
              />
            </div>
          </Row>
          <Row label="…with counts">
            <div className="w-[320px]">
              <Tabs
                value={period}
                onChange={setPeriod}
                ariaLabel="Period with counts"
                items={[
                  { id: 'today', label: 'Open', count: 46 },
                  { id: 'mtd', label: 'Closed', count: 278751 },
                ]}
              />
            </div>
          </Row>
          <Row label="…one disabled">
            <div className="w-[320px]">
              <Tabs
                value="today"
                ariaLabel="Period with a disabled tab"
                items={[
                  { id: 'today', label: 'Today' },
                  { id: 'mtd', label: 'Month till date', disabled: true },
                ]}
              />
            </div>
          </Row>
          <Row label="ChipRow — open list">
            <div className="w-[320px]">
              <ChipRow
                value={hq}
                onChange={setHq}
                ariaLabel="Headquarters"
                items={[
                  { key: 'hubballi', label: 'Hubballi', count: 136 },
                  { key: 'hyderabad', label: 'Hyderabad', count: 63 },
                  { key: 'erode', label: 'Erode', count: 15 },
                  { key: 'ayodhya', label: 'Ayodhya', count: 9 },
                ]}
              />
            </div>
          </Row>
          <Row label="RingNav — links to work items">
            {/* Overdue with a badge, due today, done, two-part, and one with
                no href — every state a tile has, in one strip. Links are
                cancelled here so pressing one does not leave the page. */}
            <div data-surface="app" className="w-[420px] bg-surface">
              <RingNav
                onItemClick={(id, href, event) => event.preventDefault()}
                ariaLabel="Daily tasks"
                items={[
                  {
                    id: 'secondary', label: 'Secondary', href: '#secondary', icon: 'calendar-clock', caption: '5 Aug',
                    captionTone: 'danger', count: 14, statusIcon: 'pencil',
                    segments: [{ key: 'd', value: 6, tone: 'success' }, { key: 'o', value: 14, tone: 'danger' }],
                  },
                  {
                    id: 'support', label: 'Support', href: '#support', icon: 'file-check', caption: 'Today', captionTone: 'warning',
                    count: 120, statusIcon: 'check-square', statusTone: 'neutral',
                    segments: [{ key: 'o', value: 1, tone: 'danger' }],
                  },
                  {
                    id: 'leave', label: 'Leave', href: '#leave', icon: 'calendar', iconTone: 'success', statusIcon: 'check-square',
                    statusTone: 'neutral', segments: [{ key: 'd', value: 1, tone: 'success' }],
                  },
                  {
                    id: 'updates', label: 'Updates', href: '#updates', icon: 'megaphone', count: 2, countTone: 'brand',
                    statusIcon: 'megaphone', statusTone: 'warning',
                    segments: [{ key: 'a', value: 1, tone: 'danger' }, { key: 'b', value: 1, tone: 'danger' }],
                  },
                  { id: 'survey', label: 'Survey', icon: 'comments' },
                ]}
              />
            </div>
          </Row>
          <Row label="ProgressRing / CountBadge">
            <ProgressRing segments={[{ key: 'd', value: 6, tone: 'success' }, { key: 'o', value: 14, tone: 'danger' }]} />
            <ProgressRing segments={[{ key: 'd', value: 1, tone: 'success' }]} />
            {/* All zero: the neutral track, no arcs. */}
            <ProgressRing segments={[{ key: 'd', value: 0, tone: 'success' }]} />
            <CountBadge value={1} />
            <CountBadge value={14} />
            <CountBadge value={140} />
            <CountBadge value={3} tone="brand" />
          </Row>
          <Row label="SegmentedControl — render">
            <SegmentedControl
              value={view}
              onChange={setView}
              items={[
                { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
                { id: 'table', label: 'Table', icon: 'pi pi-table' },
              ]}
            />
          </Row>
        </Section>

        <Section
          title="Select"
          subtitle="A native <select> in the Field box. Defaults to the 40px size — 22px fails the 44px tap target for a primary choice."
        >
          <Row label="sizes">
            <div className="w-[220px]">
              <Select
                label="Team scope"
                size="lg"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'e1', label: 'Santosh Kumar · SM' },
                  { value: 'e2', label: 'Bishnu Charan Behera · RBM' },
                ]}
              />
            </div>
            <div className="w-[180px]">
              <Select label="Default" size="default" options={['One', 'Two']} />
            </div>
            <div className="w-[150px]">
              <Select label="App" size="app" options={['One', 'Two']} />
            </div>
          </Row>
          <Row label="states">
            <div className="w-[200px]">
              <Select label="With hint" options={['One']} hint="Managers only." />
            </div>
            <div className="w-[200px]">
              <Select label="Invalid" options={['One']} error="Pick a manager." />
            </div>
            <div className="w-[200px]">
              <Select label="Disabled" options={['One']} disabled />
            </div>
          </Row>
          <Row label="placeholder">
            <div className="w-[220px]">
              <Select label="Unset" placeholder="Choose a manager…" value="" options={['One', 'Two']} />
            </div>
          </Row>
        </Section>

        <Section
          title="Quantities"
          subtitle="One tone vocabulary (lib/tone.js). The saturated value fills a bar; the deeper twin carries a label — green is 2.28:1 as text and amber 1.93:1."
        >
          <Row label="ProgressBar / tone">
            <div className="flex w-[420px] flex-col gap-2">
              {TONES.map((tone) => (
                <ProgressBar key={tone} tone={tone} value={62} label={tone} />
              ))}
            </div>
          </Row>
          <Row label="ProgressBar / size">
            <div className="flex w-[420px] flex-col gap-3">
              {['sm', 'md', 'lg'].map((size) => (
                <ProgressBar key={size} size={size} tone="brand" value={62} label={size} />
              ))}
            </div>
          </Row>
          <Row label="ProgressBar / clamped">
            <div className="w-[420px]">
              {/* 14 of 12 is a real thing that happens; the bar must not overflow. */}
              <ProgressBar tone="success" value={14} max={12} label="14 of 12" />
            </div>
          </Row>
          <Row label="StackedBar">
            <div className="flex w-[420px] flex-col gap-3">
              <StackedBar
                segments={[
                  { key: 'w', value: 17, tone: 'success', label: 'Working' },
                  { key: 'n', value: 1, tone: 'danger', label: 'Not reporting' },
                  { key: 'l', value: 1, tone: 'warning', label: 'On leave' },
                  { key: 'v', value: 3, tone: 'neutral', label: 'Vacant' },
                ]}
              />
              {/* A zero segment renders nothing — no 1px sliver for a category
                  that is not there. */}
              <StackedBar
                segments={[
                  { key: 'w', value: 20, tone: 'success', label: 'Working' },
                  { key: 'n', value: 0, tone: 'danger', label: 'Not reporting' },
                ]}
              />
            </div>
          </Row>
          <Row label="LegendChip">
            <LegendChip label="Working" value={17} tone="success" onClick={() => {}} />
            <LegendChip label="Not reporting" value={1} tone="danger" onClick={() => {}} />
            <LegendChip label="On leave" value={1} tone="warning" />
            <LegendChip label="Vacant" value={3} tone="neutral" />
          </Row>
          <Row label="Metric">
            <div className="grid w-[560px] grid-cols-3 gap-3">
              <Card>
                <Metric label="Visit plans today" value="232" caption="planned across 19 reps" tone="brand" dot />
              </Card>
              <Card>
                <Metric
                  label="Visits happened"
                  value="122"
                  caption="53% of plan"
                  tone="warning"
                  dot
                  progress={{ value: 122, max: 232 }}
                />
              </Card>
              <Card>
                <Metric
                  label="Call average"
                  value="7.2"
                  caption="calls ÷ reps working · std 12"
                  tone="danger"
                  dot
                  progress={{ value: 7.2, max: 12 }}
                />
              </Card>
            </div>
          </Row>
        </Section>

        <Section
          title="Rows, disclosure and avatars"
          subtitle="A row is a <button> when it has an onClick and a <div> when it does not — never a div with a click handler."
        >
          <Row label="Avatar">
            <Avatar name="Santosh Kumar" size="sm" />
            <Avatar name="Bishnu Charan Behera" size="md" />
            <Avatar name="Deekshith" size="lg" />
            <Avatar name="Medisemmy Anil Kumar" size="md" />
          </Row>
          <Row label="Eyebrow / SectionLabel">
            <div className="w-[280px]">
              <SectionLabel>Where the visits happened</SectionLabel>
              <Eyebrow>Visit plans today</Eyebrow>
            </div>
          </Row>
          <Row label="Card / selectable">
            {/* A card used as a CHOICE rather than a link: it stays on the
                page, one of the group is always on, so the state is
                persistent and it carries aria-pressed. */}
            {['All HQs', 'Hubballi', 'Hyderabad'].map((name) => (
              <Card
                key={name}
                onClick={() => setPickedCard(name)}
                selected={pickedCard === name}
                className="w-[136px]"
              >
                <div className="text-11 font-medium text-ds-secondary">{name}</div>
                <div className="text-16 font-semibold tabular-nums text-heading">58</div>
                <ProgressBar size="sm" tone="warning" value={58} max={99} label={name} />
              </Card>
            ))}
          </Row>
          <Row label="ListRow">
            <Card className="w-[420px]">
              <ListRow
                title="Hubballi"
                subtitle="8/9 reps active · 4 force"
                onClick={() => {}}
                trailing={
                  <>
                    <span className="text-16 font-semibold text-heading">58</span>
                    <span className="text-10 text-ds-secondary">of 99</span>
                  </>
                }
              />
              <ListRow
                title="Hyderabad"
                subtitle="7/7 reps active · 8 force"
                onClick={() => {}}
                trailing={
                  <>
                    <span className="text-16 font-semibold text-heading">49</span>
                    <span className="text-10 text-ds-secondary">of 90</span>
                  </>
                }
              />
            </Card>
          </Row>
          <Row label="DisclosureRow">
            <Card className="w-[420px]">
              <DisclosureRow
                depth={0}
                expanded={open}
                onToggle={() => setOpen((v) => !v)}
                /* The action slot: a second destination off the same row.
                   It has to live here and not inside `header`, which is
                   itself a <button> when the row expands. */
                action={
                  <Button type="default" size="sm" onClick={() => setSheetOpen(true)}>
                    Dr plan
                  </Button>
                }
                header={
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-13 font-semibold text-heading">
                        Bishnu Charan Behera
                      </span>
                      <span className="block text-10 text-ds-secondary">RBM · 10/12 working</span>
                    </span>
                    <span className="text-13 font-semibold tabular-nums text-heading">73/142</span>
                  </div>
                }
              >
                <DisclosureRow
                  depth={1}
                  header={
                    <span>
                      <span className="block text-13 font-semibold text-heading">Umesh A M</span>
                      <span className="block text-10 text-ds-secondary">BE · plan 9</span>
                    </span>
                  }
                />
                <DisclosureRow
                  depth={1}
                  header={
                    <span>
                      <span className="block text-13 font-semibold text-heading">
                        Chandrashekar V
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-10 text-ds-secondary">
                        BE
                        <StatusPill status="danger">Not reporting</StatusPill>
                      </span>
                    </span>
                  }
                />
              </DisclosureRow>
            </Card>
          </Row>
          <Row label="Sheet">
            <Button type="default" size="sm" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
            <span className="text-10 text-ds-secondary">
              Portals to document.body, takes focus, locks the page behind it. Escape, the
              close button or the scrim all dismiss it.
            </span>
            <Sheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              surface="app"
              title="Working today"
              subtitle="3 people in this scope"
            >
              {[
                { name: 'Fayaque Ahmed Qazi', sub: 'Hubballi · reports to Mohammed Tousif · 14/15 visits done', calls: 14 },
                { name: 'Kukatla Rakesh', sub: 'Hyderabad · reports to Nagunoori Anil · 13/13 visits done', calls: 13 },
                { name: 'Umesh A M', sub: 'Hubballi · reports to Arunkumar M · 9/15 visits done', calls: 9 },
              ].map((p) => (
                <ListRow
                  key={p.name}
                  dense
                  title={p.name}
                  subtitle={p.sub}
                  trailing={
                    <StatusPill status={p.calls > 10 ? 'success' : 'warning'} showDot={false}>
                      {p.calls} calls
                    </StatusPill>
                  }
                />
              ))}
            </Sheet>
          </Row>
        </Section>

        <Section title="Elevation" subtitle="Four shadows. Depth comes from nothing else.">
          <div className="flex flex-wrap gap-6">
            {['hairline', 'field', 'card', 'pop'].map((name) => (
              <div key={name} className="flex flex-col items-center gap-tight">
                <div
                  className="w-[120px] h-[56px] rounded-md bg-surface"
                  style={{ boxShadow: `var(--ds-shadow-${name})` }}
                />
                <code className="font-mono text-8 text-ds-secondary">--ds-shadow-{name}</code>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}
