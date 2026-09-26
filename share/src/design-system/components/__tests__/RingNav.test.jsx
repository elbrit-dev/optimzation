import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RingNav } from '../RingNav';
import { CountBadge } from '../CountBadge';
import { ProgressRing, ringArcs } from '../ProgressRing';

describe('ringArcs', () => {
  it('draws nothing for zero segments, so an empty category leaves no sliver', () => {
    const arcs = ringArcs([
      { key: 'd', value: 3, tone: 'success' },
      { key: 'o', value: 0, tone: 'danger' },
    ]);
    expect(arcs.map((a) => a.key)).toEqual(['d']);
  });

  it('closes a single segment into a full ring, with no gap', () => {
    const [arc] = ringArcs([{ key: 'd', value: 1 }]);
    expect(arc.start).toBe(0);
    expect(arc.length).toBeCloseTo(2 * Math.PI * 45.5);
  });

  it('splits by share of the total and gaps between segments', () => {
    const [a, b] = ringArcs([{ key: 'a', value: 1 }, { key: 'b', value: 3 }]);
    const c = 2 * Math.PI * 45.5;
    expect(a.length).toBeLessThan(c / 4);
    expect(b.start).toBeGreaterThan(c / 4);
    expect(a.length + b.length).toBeLessThan(c);
  });

  it('returns no arcs when everything is zero (the track shows instead)', () => {
    expect(ringArcs([{ value: 0 }])).toEqual([]);
  });
});

describe('ProgressRing colours', () => {
  it('draws any number of segments, a color overriding the tone', () => {
    const { container } = render(
      <ProgressRing
        segments={[
          { value: 4, tone: 'success' },
          { value: 2, tone: 'warning' },
          { value: 1, color: '#7c3aed', tone: 'danger' },
          { value: 3, tone: 'danger' },
        ]}
      />,
    );
    const strokes = [...container.querySelectorAll('.ds-ring__arc')].map((c) => c.style.stroke);
    expect(strokes).toHaveLength(4);
    expect(strokes[2]).toBe('#7c3aed');
    expect(strokes[3]).toBe('var(--status-rejected)');
  });
});

describe('CountBadge', () => {
  it('disappears at zero', () => {
    const { container } = render(<CountBadge value={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('caps at max', () => {
    render(<CountBadge value={140} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});

describe('RingNav', () => {
  const items = [
    { id: 'secondary', label: 'Secondary', href: '/secondary', caption: '5 Aug', count: 14 },
    { id: 'leave', label: 'Leave', href: '/leave' },
    { id: 'docs', label: 'Docs', href: 'https://example.com', target: '_blank' },
    { id: 'survey', label: 'Survey' },
    { id: 'off', label: 'Off', href: '/off', disabled: true },
  ];

  it('renders each tile with an href as a link, named with what it carries', () => {
    render(<RingNav items={items} />);
    expect(screen.getByRole('navigation', { name: 'Shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Secondary, 5 Aug, 14 pending' })).toHaveAttribute('href', '/secondary');
    expect(screen.getByRole('link', { name: 'Leave' })).toHaveAttribute('href', '/leave');
  });

  it('never marks a tile selected or current — these are shortcuts, not tabs', () => {
    render(<RingNav items={items} />);
    expect(screen.queryByRole('tab')).toBeNull();
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
      expect(link).not.toHaveAttribute('aria-selected');
    }
  });

  it('opens a new-tab link without handing it this window', () => {
    render(<RingNav items={items} />);
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a tile with no href, or disabled, but does not make it a link', () => {
    render(<RingNav items={items} />);
    expect(screen.queryByRole('link', { name: 'Survey' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Off' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Survey' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('reports the pressed id and href, and lets the caller cancel navigation', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn((id, href, event) => event.preventDefault());
    render(<RingNav items={items} onItemClick={onItemClick} />);
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(onItemClick).toHaveBeenCalledWith('leave', '/leave', expect.anything());
    expect(onItemClick.mock.calls[0][2].defaultPrevented).toBe(true);
  });

  it('never cancels navigation itself — only a caller\'s onItemClick can', () => {
    /* The /ring-nav harness emulates navigation by cancelling the click in
       ITS OWN handler. This pins that the component does no such thing: a
       tile with no handler is an ordinary link and really navigates. */
    render(<RingNav items={items} />);
    const link = screen.getByRole('link', { name: 'Leave' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('renders through linkAs, so an app can route with its own link', () => {
    function FakeLink({ href, children, ...rest }) {
      return (
        <a data-fake="1" href={href} {...rest}>
          {children}
        </a>
      );
    }
    render(<RingNav items={items} linkAs={FakeLink} />);
    expect(screen.getByRole('link', { name: 'Leave' })).toHaveAttribute('data-fake', '1');
  });
});
