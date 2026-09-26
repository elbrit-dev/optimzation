import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoctorCard } from '../DoctorCard';

/* Every field here is optional in the data — a doctor may be ungraded, have
   no town recorded, or both — so the card is mostly about what it does NOT
   render. */

describe('DoctorCard', () => {
  it('shows the doctor, the grade, the territory and the town', () => {
    render(
      <DoctorCard name="Dr G.Narayanan" code="DR-55992" hq="HQ-Erode" city="Gobi" specialty="CARDIO" categories={["C","LILR","EC10"]} />,
    );
    expect(screen.getByText('Dr G.Narayanan')).toBeInTheDocument();
    expect(screen.getByText('DR-55992')).toBeInTheDocument();
    expect(screen.getByText('CARDIO')).toBeInTheDocument();
    expect(screen.getByText('C · LILR · EC10')).toBeInTheDocument();
    expect(screen.getByText('Erode · Gobi')).toBeInTheDocument();
  });

  it('strips the HQ- prefix, which is a naming convention not information', () => {
    render(<DoctorCard name="Dr One" hq="HQ-Erode" />);
    expect(screen.getByText('Erode')).toBeInTheDocument();
    expect(screen.queryByText('HQ-Erode')).not.toBeInTheDocument();
  });

  it('renders no badge and no tag when the doctor has neither', () => {
    // '' is a real value on the live data, not a gap in the fixture.
    const { container } = render(<DoctorCard name="Dr One" code="DR-1" specialty="" categories={[]} />);
    expect(container.querySelector('.bg-brand-tint-weak')).toBeNull();
  });

  it('carries a long specialty and a campaign category’s ampersand', () => {
    // Category List really does hold 'KA E FOCUS 20'.
    render(<DoctorCard name="Dr One" specialty="Chest Phy" categories={["A&P FOCUS 20"]} />);
    expect(screen.getByText('Chest Phy')).toBeInTheDocument();
    expect(screen.getByText('A&P FOCUS 20')).toBeInTheDocument();
  });

  it('omits the town and the code when there are none', () => {
    render(<DoctorCard name="Dr One" city="" code="" />);
    expect(screen.getByText('Dr One')).toBeInTheDocument();
  });

  it('does not announce the doctor twice', () => {
    /* Avatar carries its own visually-hidden label so it can stand alone
       elsewhere; beside the name it depicts that would read as "Dr One
       Dr One", so it is aria-hidden here. */
    render(<DoctorCard name="Dr One" />);
    const avatar = document.querySelector('.ds-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('DoctorCard initials', () => {
  it('drops the salutation so the avatar reads S, not DS', () => {
    // Avatar takes first + last initial, which is right for a person and
    // wrong for a title: every doctor here would otherwise start with D.
    render(<DoctorCard name="Dr Sabesan" />);
    expect(document.querySelector('.ds-avatar').textContent).toBe('S');
  });

  it('still uses two initials for a full doctor name', () => {
    render(<DoctorCard name="Dr G.Narayanan Iyer" />);
    expect(document.querySelector('.ds-avatar').textContent).toBe('GI');
  });

  it('shows the salutation in the visible name', () => {
    render(<DoctorCard name="Dr Sabesan" />);
    expect(screen.getByText('Dr Sabesan')).toBeInTheDocument();
  });
});

describe('DoctorCard place', () => {
  it('does not print the town twice when it is the territory', () => {
    // Most doctors sit in their HQ's own town, so this was every card:
    // "Coimbatore" over "Coimbatore", which reads as a rendering fault.
    render(<DoctorCard name="Dr Anandhi" hq="HQ-Coimbatore" city="Coimbatore" />);
    expect(screen.getAllByText('Coimbatore')).toHaveLength(1);
  });

  it('still shows a town that differs from the territory', () => {
    render(<DoctorCard name="Dr X" hq="HQ-Erode" city="Gobi" />);
    // One line, one pin: the town narrows the territory, it is not a
    // second place.
    expect(screen.getByText('Erode · Gobi')).toBeInTheDocument();
  });

  it('ignores case and padding when comparing the two', () => {
    render(<DoctorCard name="Dr X" hq="HQ-Erode" city="  erode " />);
    expect(screen.getAllByText(/erode/i)).toHaveLength(1);
  });
});

describe('DoctorCard expander', () => {
  it('shows no chevron when the card does not expand', () => {
    const { container } = render(<DoctorCard name="Dr One" note="12:31 PM" />);
    expect(container.querySelector('svg.rotate-180')).toBeNull();
    // Only the location pin, and only when there is an hq.
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('points the chevron down when collapsed and up when open', () => {
    const { container: closed } = render(<DoctorCard name="Dr One" note="2 attended" expandable />);
    expect(closed.querySelector('svg').getAttribute('class')).not.toContain('rotate-180');

    const { container: open } = render(<DoctorCard name="Dr One" note="2 attended" expandable expanded />);
    expect(open.querySelector('svg').getAttribute('class')).toContain('rotate-180');
  });

  it('puts the chevron on the attendee line, not in a column of its own', () => {
    // The affordance sits on the thing it reveals; a caret parked at the far
    // left of the card says nothing about what opening will show.
    const { container } = render(<DoctorCard name="Dr One" note="3 attended" expandable />);
    const line = [...container.querySelectorAll('span')].find((s) => s.textContent.trim() === '3 attended');
    expect(line.parentElement.querySelector('svg')).not.toBeNull();
  });
});

describe('DoctorCard role group', () => {
  const roles = [
    { label: 'BE', tone: 'success', status: 'Geo' },
    { label: 'ABM', tone: 'danger', status: 'Force' },
    { label: 'RBM', tone: 'neutral', status: 'Pending' },
  ];

  it('shows one segment per attendee, labelled by rung', () => {
    render(<DoctorCard name="Dr One" roles={roles} />);
    for (const label of ['BE', 'ABM', 'RBM']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('tints each rung by that PERSON, not by the call', () => {
    // The whole point: a joint call's two halves can differ, and the old
    // "2 attended · 1 forced" never said which of them was the problem.
    const { container } = render(<DoctorCard name="Dr One" roles={roles} />);
    const seg = (t) => [...container.querySelectorAll('span')].find((s) => s.textContent === t).parentElement;
    expect(seg('BE').className).toContain('text-success');
    expect(seg('ABM').className).toContain('text-danger');
    expect(seg('RBM').className).toContain('text-ds-muted');
  });

  it('says the status in words, not only in colour', () => {
    // Red/green alone is invisible to a screen reader and to roughly one
    // man in twelve.
    render(<DoctorCard name="Dr One" roles={[roles[1]]} />);
    expect(screen.getByText(/ABM Force/)).toBeInTheDocument();
  });

  it('renders nothing when no rung resolved', () => {
    const { container } = render(<DoctorCard name="Dr One" roles={[]} />);
    expect(container.querySelector('.rounded-chip.border')).toBeNull();
  });
});
