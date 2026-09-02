"use client";

import React from "react";

/**
 * The bar above the profile page, in the usual three-zone app-bar shape:
 * logo at the left corner, page title centred, actions at the right.
 *
 * The centre is centred against the bar, not against whatever the side zones
 * happen to contain — the outer columns are equal-width tracks, so a long logo
 * or an extra action icon never nudges the title off centre.
 *
 * The bell is a slot rather than a built-in icon: the real one is NovuInbox,
 * which carries its own state and popover. The slot wrapper gives whatever is
 * dropped in a consistent 36px hit target.
 */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function ProfileHeader({
  title = "My profile",
  subtitle = "",
  logoUrl = "",
  logoAlt = "Company logo",
  logoHeight = 30,
  logoHref = "",
  actions,
  onBack,
  sticky = false,
  bordered = true,
  className = "",
}) {
  const hasActions = React.Children.count(actions) > 0;

  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt={logoAlt}
      style={{ height: logoHeight }}
      className="w-auto max-w-[150px] shrink-0 object-contain"
    />
  ) : null;

  return (
    <header
      className={cx(
        "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 bg-white px-3 font-sans sm:px-5 lg:px-6",
        "h-14 sm:h-16",
        bordered && "border-b border-[#e6e6e6]",
        sticky && "sticky top-0 z-30 shadow-[0_1px_3px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      {/* Left — logo, with an optional back affordance ahead of it. */}
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#666666] transition hover:bg-[#f2f4f7] hover:text-[#162653] active:translate-y-px"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}

        {logoHref && logo ? (
          <a href={logoHref} target="_blank" rel="noreferrer" className="flex shrink-0 items-center">
            {logo}
          </a>
        ) : (
          logo
        )}
      </div>

      {/* Centre — the page title. */}
      <div className="min-w-0 justify-self-center text-center">
        <h1 className="truncate text-[16px] font-bold leading-tight text-[#162653] sm:text-[19px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 hidden truncate text-[11px] leading-tight text-[#8a8a8a] sm:block sm:text-[12px]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {/* Right — the bell and anything beside it. */}
      <div className="flex min-w-0 items-center justify-end gap-1 justify-self-end">
        {hasActions ? (
          // Each direct child gets the same centred target, so a bare <svg> and
          // a button-wrapped icon line up identically.
          <div className="flex items-center gap-1 [&>*]:flex [&>*]:min-h-9 [&>*]:min-w-9 [&>*]:items-center [&>*]:justify-center [&>*]:rounded-full [&>*]:text-[#3b3b3b] [&>*]:transition hover:[&>*]:bg-[#f2f4f7]">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
