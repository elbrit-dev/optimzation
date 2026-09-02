"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { PICTURE_ACCEPT } from "./cropper";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

/**
 * The avatar and its change-picture control. Both the desktop header and the
 * mobile card render one, so the sizing comes in as classes rather than being
 * baked in - the two layouts use different dimensions.
 */
export default function ProfileAvatar({
  initials,
  pictureUrl,
  canEdit,
  saving,
  onPick,
  className = "",
  initialsClassName = "",
  badgeClassName = "",
  iconClassName = "",
}) {
  const inputRef = useRef(null);
  const [broken, setBroken] = useState(false);

  // A fresh URL deserves a fresh attempt, even if the last one 404'd.
  useEffect(() => setBroken(false), [pictureUrl]);

  const showImage = Boolean(pictureUrl) && !broken;
  const label = canEdit ? "Change profile picture" : "Profile picture cannot be changed here";

  return (
    <div className={cx("relative shrink-0 rounded-full bg-[#e8f3ff] text-[#0b7cff]", className)}>
      {showImage ? (
        <img
          src={pictureUrl}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className={cx("flex h-full w-full items-center justify-center font-bold leading-none", initialsClassName)}>
          {initials}
        </span>
      )}

      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={!canEdit || saving}
        onClick={() => inputRef.current?.click()}
        className={cx(
          "absolute inline-flex items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#333333] shadow-sm transition",
          canEdit && !saving
            ? "hover:bg-[#f8fafc] active:translate-y-px"
            : "cursor-not-allowed opacity-60",
          badgeClassName
        )}
      >
        {saving ? (
          <Loader2 aria-hidden className={cx("animate-spin", iconClassName)} strokeWidth={2} />
        ) : (
          <Camera aria-hidden className={iconClassName} strokeWidth={1.7} />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={PICTURE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}
