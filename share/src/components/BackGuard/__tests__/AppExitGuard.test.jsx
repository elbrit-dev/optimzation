import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppExitGuard } from '../AppExitGuard';
import { __resetBackStack } from '../backStack';

/* The shell mount. What matters here is which route counts as the root and
   that the hint is what the first press produces — the mechanism itself is
   covered in backStack.test.js and useExitGuard.test.js. */

function pressBack() {
  const beneath = { page: 'home' };
  window.history.replaceState(beneath, '');
  window.dispatchEvent(new PopStateEvent('popstate', { state: beneath, cancelable: true }));
}

describe('AppExitGuard', () => {
  beforeEach(() => {
    __resetBackStack();
    window.history.replaceState({ page: 'home' }, '');
  });

  afterEach(() => __resetBackStack());

  it('answers the first press at the root with the hint', () => {
    render(<AppExitGuard pathname="/home" rootPaths={['/home']} />);

    act(() => pressBack());

    expect(screen.getByRole('status')).toHaveTextContent('Press back again to exit');
  });

  it('says nothing anywhere else', () => {
    render(<AppExitGuard pathname="/doctor" rootPaths={['/home']} />);

    act(() => pressBack());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reads a trailing slash, a query and a hash as the same route', () => {
    // Otherwise the guard silently stops existing on /home?tab=2.
    render(<AppExitGuard pathname="/home/?tab=2#top" rootPaths={['/home']} />);

    act(() => pressBack());

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('takes the wording from the host', () => {
    render(<AppExitGuard pathname="/" hintText="Tap back again to close" />);

    act(() => pressBack());

    expect(screen.getByRole('status')).toHaveTextContent('Tap back again to close');
  });
});
