"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, ZoomIn } from "lucide-react";

import {
  MAX_ZOOM,
  centeredOffsets,
  clampOffsets,
  coverScale,
  cropToDataUrl,
  drawPreview,
  zoomAroundCenter,
} from "./cropper";

// Fixed so the crop geometry is one number the preview and the export agree on.
// 224px leaves margin inside the dialog on a 320px-wide phone.
const VIEWPORT = 224;
const NUDGE = 8;

export default function ProfilePictureEditor({ image, saving, error, onCancel, onSave }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  const cover = useMemo(() => coverScale(image?.width, image?.height, VIEWPORT), [image]);
  const scale = cover * zoom;

  // A newly picked image starts filling the square, centred.
  useEffect(() => {
    if (!image) return;
    const base = coverScale(image.width, image.height, VIEWPORT);
    setZoom(1);
    setOffset(centeredOffsets(image.width, image.height, VIEWPORT, base));
  }, [image]);

  useEffect(() => {
    if (!image) return;
    drawPreview(canvasRef.current, {
      source: image.source,
      width: image.width,
      height: image.height,
      viewport: VIEWPORT,
      scale,
      offset,
    });
  }, [image, scale, offset]);

  const moveBy = useCallback(
    (deltaX, deltaY) => {
      if (!image) return;
      setOffset((current) =>
        clampOffsets(
          { x: current.x + deltaX, y: current.y + deltaY },
          image.width,
          image.height,
          VIEWPORT,
          scale
        )
      );
    },
    [image, scale]
  );

  const handleZoom = useCallback(
    (nextZoom) => {
      if (!image) return;
      const clamped = Math.min(MAX_ZOOM, Math.max(1, Number(nextZoom) || 1));
      const nextScale = cover * clamped;
      setOffset((current) =>
        clampOffsets(
          zoomAroundCenter(current, VIEWPORT, cover * zoom, nextScale),
          image.width,
          image.height,
          VIEWPORT,
          nextScale
        )
      );
      setZoom(clamped);
    },
    [cover, image, zoom]
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (saving) return;
      dragRef.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [saving]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const start = dragRef.current;
      if (!start) return;
      // Dragging on a touch screen must pan the crop, not scroll the page.
      event.preventDefault();
      moveBy(event.clientX - start.x, event.clientY - start.y);
      dragRef.current = { x: event.clientX, y: event.clientY };
    },
    [moveBy]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (event) => {
      const steps = {
        ArrowLeft: [NUDGE, 0],
        ArrowRight: [-NUDGE, 0],
        ArrowUp: [0, NUDGE],
        ArrowDown: [0, -NUDGE],
      };
      const step = steps[event.key];
      if (!step || saving) return;
      event.preventDefault();
      moveBy(step[0], step[1]);
    },
    [moveBy, saving]
  );

  useEffect(() => {
    if (!image) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [image, onCancel, saving]);

  const handleSave = useCallback(() => {
    if (!image) return;
    try {
      onSave(
        cropToDataUrl({
          source: image.source,
          width: image.width,
          height: image.height,
          viewport: VIEWPORT,
          scale,
          offset,
        })
      );
    } catch (cropError) {
      // Surfaced through the hook's error state by the caller's onSave.
      console.error("Profile picture: crop failed", cropError);
    }
  }, [image, offset, onSave, scale]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change profile picture"
        className="w-full max-w-[320px] rounded-[8px] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight text-[#162653]">Profile picture</h2>
            <p className="mt-0.5 text-[11px] leading-tight text-[#aaaaaa]">
              Drag to reposition, then save to the ERP.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#aaaaaa] transition hover:bg-[#f3f4f6] hover:text-[#333333] disabled:opacity-40"
          >
            <X aria-hidden className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>

        <div className="mt-3 flex justify-center">
          <div
            tabIndex={0}
            role="group"
            aria-label="Crop preview. Drag or use the arrow keys to reposition."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={handleKeyDown}
            style={{ width: VIEWPORT, height: VIEWPORT }}
            className="relative touch-none overflow-hidden rounded-full bg-[#f5f6f8] outline-none ring-1 ring-[#e2e5ea] focus-visible:ring-2 focus-visible:ring-[#1d73f8]"
          >
            <canvas
              ref={canvasRef}
              style={{ width: VIEWPORT, height: VIEWPORT }}
              className={saving ? "cursor-wait" : "cursor-grab active:cursor-grabbing"}
            />
            {saving ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[rgba(255,255,255,0.7)]">
                <Loader2 aria-hidden className="h-5 w-5 animate-spin text-[#1d73f8]" strokeWidth={2} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <ZoomIn aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#aaaaaa]" strokeWidth={1.7} />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={saving}
            aria-label="Zoom"
            onChange={(event) => handleZoom(event.target.value)}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[#e2e5ea] accent-[#1d73f8] disabled:cursor-not-allowed"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[12px] leading-snug text-[#c02026]">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-[4px] border border-[#d9d9d9] py-2 text-[13px] font-medium text-[#333333] transition hover:bg-[#f8fafc] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-[4px] bg-[#1d73f8] py-2 text-[13px] font-medium text-white transition hover:bg-[#1265e4] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save to ERP"}
          </button>
        </div>
      </div>
    </div>
  );
}
