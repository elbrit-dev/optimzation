"use client";

import React from "react";

/**
 * The bar that sits above the profile page: a title on the left, and on the
 * right an actions slot (the notification bell lives here) followed by the
 * company logo.
 *
 * The bell is deliberately a slot rather than a built-in icon — the real one is
 * NovuInbox, which carries its own state and popover, so it gets dropped in
 * from Plasmic instead of being reimplemented here.
 */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function ProfileHeader({
  title = "My profile",
  subtitle = "",
  logoUrl = "",
  logoAlt = "Company logo",
  logoHeight = 28,
  logoHref = "",
  actions,
  sticky = false,
  bordered = true,
  className = "",
}) {
  // Only worth a divider when there is something on both sides of it.
  const hasActions = React.Children.count(actions) > 0;
  const showDivider = hasActions && Boolean(logoUrl);

  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt={logoAlt}
      style={{ height: logoHeight }}
      className="w-auto shrink-0 object-contain"
    />
  ) : null;

  return (
    <header
      className={cx(
        "flex w-full items-center justify-between gap-3 bg-white px-3 py-2.5 font-sans sm:px-4 lg:px-6",
        bordered && "border-b border-[#e6e6e6]",
        sticky && "sticky top-0 z-30",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold leading-tight text-[#162653] sm:text-[19px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] leading-tight text-[#aaaaaa] sm:text-[12px]">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {hasActions ? <div className="flex items-center gap-2">{actions}</div> : null}
        {showDivider ? <span className="h-6 w-px bg-[#e6e6e6]" /> : null}
        {logoHref && logo ? (
          <a href={logoHref} target="_blank" rel="noreferrer" className="flex shrink-0 items-center">
            {logo}
          </a>
        ) : (
          logo
        )}
      </div>
    </header>
  );
}
