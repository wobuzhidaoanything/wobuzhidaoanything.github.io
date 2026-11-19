export interface CompressedPhoto {
  file: File;
  width: number;
  height: number;
}

export interface NormalizedCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_SIDE = 1600;
const PNG_KEEP_BYTES = 1_500_000;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function sanitizeStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return stem || "photo";
}

export async function cropImageToFile(
  img: HTMLImageElement,
  crop: NormalizedCrop,
  baseName: string,
  sourceMime?: string,
): Promise<File> {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH) {
    throw new Error("Image is not loaded yet.");
  }

  const sx = Math.max(0, Math.min(natW - 1, Math.round(crop.x * natW)));
  const sy = Math.max(0, Math.min(natH - 1, Math.round(crop.y * natH)));
  const sw = Math.max(1, Math.min(natW - sx, Math.round(crop.w * natW)));
  const sh = Math.max(1, Math.min(natH - sy, Math.round(crop.h * natH)));

  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare crop canvas.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  const stem = `${sanitizeStem(baseName)}-cropped`;
  if (sourceMime === "image/png") {
    const png = await canvasToBlob(canvas, "image/png");
    if (png && png.size <= PNG_KEEP_BYTES) {
      return new File([png], `${stem}.png`, { type: "image/png" });
    }
  }

  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.9);
  if (!jpeg) {
    throw new Error("Could not encode cropped image.");
  }
  return new File([jpeg], `${stem}.jpg`, { type: "image/jpeg" });
}

/**
 * Downscale to 1600px and re-encode. PNGs with alpha stay PNG when small;
 * everything else becomes JPEG composited over white (JPEG has no alpha,
 * and an untouched transparent background would otherwise turn black).
 */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const original: CompressedPhoto = { file, width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const stem = file.name.replace(/\.[^.]+$/, "");
    if (file.type === "image/png") {
      const png = await canvasToBlob(canvas, "image/png");
      if (png && png.size <= PNG_KEEP_BYTES && (scale < 1 || png.size < file.size)) {
        return { file: new File([png], `${stem}.png`, { type: "image/png" }), width, height };
      }
    }
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
    if (!jpeg || (scale === 1 && jpeg.size >= file.size)) return original;
    return { file: new File([jpeg], `${stem}.jpg`, { type: "image/jpeg" }), width, height };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}