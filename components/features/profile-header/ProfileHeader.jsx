"use client";

import React from "react";

/**
 * The bar that sits above the profile page: the company logo in the left
 * corner, the page title centred, and an actions slot (the notification bell
 * lives here) in the right corner.
 *
 * The three zones are grid columns rather than a flex row, so the title stays
 * centred on the HEADER - not on whatever space the logo and bell leave over.
 * With a flex row it would drift left or right as either side changed width.
 *
 * The bell is deliberately a slot rather than a built-in icon - the real one is
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
  logoHeight = 30,
  logoHref = "",
  actions,
  sticky = false,
  bordered = true,
  className = "",
}) {
  const hasActions = React.Children.count(actions) > 0;
  const hasHeading = Boolean(title) || Boolean(subtitle);

  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt={logoAlt}
      // Capped so an oversized upload cannot eat the centre column and squeeze
      // the title to nothing.
      style={{ height: logoHeight, maxWidth: 150 }}
      className="w-auto shrink-0 object-contain"
    />
  ) : null;

  return (
    <header
      className={cx(
        "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 bg-white px-3 py-2.5 font-sans sm:gap-3 sm:px-4 lg:px-6",
        bordered && "border-b border-[#e6e6e6]",
        sticky && "sticky top-0 z-30",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        {logoHref && logo ? (
          <a href={logoHref} target="_blank" rel="noreferrer" className="flex shrink-0 items-center">
            {logo}
          </a>
        ) : (
          logo
        )}
      </div>

      {hasHeading ? (
        <div className="min-w-0 text-center">
          <h1 className="truncate text-[17px] font-bold leading-tight text-[#162653] sm:text-[19px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-[#aaaaaa] sm:text-[12px]">
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : (
        // Keeps the three-column grid intact, so the logo and bell stay pinned
        // to their corners when there is no title.
        <span />
      )}

      <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end">
        {hasActions ? actions : null}
      </div>
    </header>
  );
}
