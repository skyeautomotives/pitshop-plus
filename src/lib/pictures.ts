// Shrinks a picture to fit a box and returns it as a data URL, small enough to keep with the settings.

const MAX_CHARS = 380_000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("not a picture"));
    img.src = src;
  });
}

/** Draws `source` at most `maxW` x `maxH` and returns a PNG (or a JPEG if the PNG is too big). */
export function shrinkToDataUrl(source: CanvasImageSource & { width: number; height: number }, maxW: number, maxH: number): string {
  const scale = Math.min(1, maxW / source.width, maxH / source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the picture.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_CHARS) return png;
  // Photos: JPEG on white is much smaller.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext("2d");
  if (!fctx) throw new Error("Couldn't draw the picture.");
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  for (const quality of [0.85, 0.7, 0.5]) {
    const jpeg = flat.toDataURL("image/jpeg", quality);
    if (jpeg.length <= MAX_CHARS) return jpeg;
  }
  throw new Error("The picture is too big.");
}

/** A picture file the person chose, shrunk to fit. Throws if it isn't a picture. */
export async function pictureFromFile(file: File, maxW: number, maxH: number): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not a picture");
  const url = URL.createObjectURL(file);
  try {
    return shrinkToDataUrl(await loadImage(url), maxW, maxH);
  } finally {
    URL.revokeObjectURL(url);
  }
}
