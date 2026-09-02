/**
 * Square-crop geometry and the canvas export for the profile picture editor.
 *
 * One model, shared by the preview and the export so what you drag is what gets
 * saved: the image is laid over a `viewport`-sized square at `scale`, with
 * `offset` giving the image's top-left corner relative to the square's. The
 * export reads back the square's slice of the image at its own resolution.
 */

export const OUTPUT_SIZE = 512;
export const MIN_OUTPUT_SIZE = 96;
export const MAX_ZOOM = 4;

export const PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";
export const PICTURE_MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED_TYPES = new Set(PICTURE_ACCEPT.split(","));

export function describeFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message, or null when the file can be used. */
export function validatePicture(file) {
  if (!file) return "No image selected.";
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Choose a PNG, JPG or WebP image.";
  }
  if (file.size > PICTURE_MAX_BYTES) {
    return `That image is ${describeFileSize(file.size)} — the limit is ${describeFileSize(PICTURE_MAX_BYTES)}.`;
  }
  return null;
}

/**
 * Decodes a picked file into something `drawImage` accepts. `createImageBitmap`
 * is preferred because it applies the EXIF orientation phone cameras write, so
 * a portrait photo does not land on its side; the <img> path is the fallback.
 */
export async function decodeImageFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // Safari < 15 and older Firefox reject the options bag - fall back.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That file could not be read as an image."));
      element.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      // The URL has to outlive the decode, so it is released with the editor.
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Smallest scale at which the image still covers the whole square. */
export function coverScale(width, height, viewport) {
  if (!width || !height || !viewport) return 1;
  return Math.max(viewport / width, viewport / height);
}

/** Keeps the square filled: the image may not be dragged past its own edges. */
export function clampOffset(offset, displayedSize, viewport) {
  const min = Math.min(0, viewport - displayedSize);
  return Math.min(0, Math.max(min, offset));
}

export function clampOffsets(offset, width, height, viewport, scale) {
  return {
    x: clampOffset(offset.x, width * scale, viewport),
    y: clampOffset(offset.y, height * scale, viewport),
  };
}

export function centeredOffsets(width, height, viewport, scale) {
  return {
    x: (viewport - width * scale) / 2,
    y: (viewport - height * scale) / 2,
  };
}

/** Zooms about the middle of the square, so the framing does not jump. */
export function zoomAroundCenter(offset, viewport, previousScale, nextScale) {
  const focus = viewport / 2;
  const ratio = nextScale / previousScale;
  return {
    x: focus - (focus - offset.x) * ratio,
    y: focus - (focus - offset.y) * ratio,
  };
}

/**
 * Paints the live preview. An ImageBitmap cannot be an <img> src, so the editor
 * draws rather than positions - which also means the preview and the export run
 * the same geometry instead of two implementations that can drift apart.
 */
export function drawPreview(canvas, { source, width, height, viewport, scale, offset }) {
  if (!canvas || !source) return;

  const ratio = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const pixels = Math.round(viewport * ratio);

  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }

  const context = canvas.getContext("2d");
  if (!context) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, viewport, viewport);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, viewport, viewport);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, offset.x, offset.y, width * scale, height * scale);
}

/**
 * Renders the square currently framed by the editor to a JPEG data URL.
 * White is painted first: JPEG carries no alpha, so a transparent PNG would
 * otherwise come out on a black background.
 */
export function cropToDataUrl({ source, width, height, viewport, scale, offset }) {
  if (!source || !width || !height || !scale) {
    throw new Error("There is no image to crop.");
  }

  const sourceSize = viewport / scale;
  const maxX = Math.max(0, width - sourceSize);
  const maxY = Math.max(0, height - sourceSize);
  const sourceX = Math.min(maxX, Math.max(0, -offset.x / scale));
  const sourceY = Math.min(maxY, Math.max(0, -offset.y / scale));

  // Never upscale - a small photo stays small rather than being blown up.
  const outputSize = Math.max(MIN_OUTPUT_SIZE, Math.round(Math.min(OUTPUT_SIZE, sourceSize)));

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    sourceX,
    sourceY,
    Math.min(sourceSize, width),
    Math.min(sourceSize, height),
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}
