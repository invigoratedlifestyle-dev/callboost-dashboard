import "server-only";

import sharp from "sharp";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const BRANDING_TARGET_BYTES = 2000 * 1024;

export type ProcessedBrandingImage = {
  bytes: Buffer;
  contentType: string;
  extension: string;
  sizeBytes: number;
  dataUrl: string;
};

function getImageContentType(value: string) {
  const contentType = value.split(";")[0].trim().toLowerCase();

  return contentType.startsWith("image/") ? contentType : "";
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";

  return "webp";
}

function getDataUrl(buffer: Buffer, contentType: string) {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export function getImageResult(buffer: Buffer, contentType: string) {
  return {
    bytes: buffer,
    contentType,
    extension: extensionForContentType(contentType),
    sizeBytes: buffer.length,
    dataUrl: getDataUrl(buffer, contentType),
  };
}

export async function getImageBufferFromRequest(formData: FormData) {
  const file = formData.get("file");
  const imageUrl = String(formData.get("imageUrl") || "").trim();
  const imageData = String(formData.get("imageData") || "").trim();

  if (file instanceof File) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image uploads are supported.");
    }

    if (file.size > MAX_INPUT_BYTES) {
      throw new Error("Image upload is too large.");
    }

    return {
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      fileName: file.name || "image",
    };
  }

  if (imageData) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error("Image data must be a valid data URL.");
    }

    const contentType = getImageContentType(match[1] || "");

    if (!contentType) {
      throw new Error("Image data must be an image.");
    }

    const bytes = Buffer.from(match[2] || "", "base64");

    if (bytes.length > MAX_INPUT_BYTES) {
      throw new Error("Image data is too large.");
    }

    return { bytes, contentType, fileName: "image" };
  }

  if (imageUrl) {
    const response = await fetch(imageUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Image URL could not be fetched.");
    }

    const contentType = getImageContentType(
      response.headers.get("content-type") || ""
    );

    if (!contentType) {
      throw new Error("Image URL must return an image.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length > MAX_INPUT_BYTES) {
      throw new Error("Image URL is too large.");
    }

    return { bytes, contentType, fileName: "remote-image" };
  }

  return null;
}

export async function cropImageWhitespace(buffer: Buffer) {
  return sharp(buffer, { animated: false })
    .rotate()
    .trim({ threshold: 10 })
    .toBuffer();
}

export async function normalizeGeneratedImage(args: {
  buffer: Buffer;
  transparent?: boolean;
  cropWhitespace?: boolean;
  square?: boolean;
  maxBytes?: number;
}) {
  let pipeline = sharp(args.buffer, { animated: false }).rotate();

  if (args.cropWhitespace) {
    pipeline = pipeline.trim({ threshold: 10 });
  }

  if (args.square) {
    pipeline = pipeline.resize(512, 512, {
      fit: "contain",
      background: args.transparent === false ? "#ffffff" : { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    });
  } else {
    pipeline = pipeline.resize({
      width: 1800,
      height: 900,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return compressImageUnderBytes(await pipeline.toBuffer(), {
    maxBytes: args.maxBytes || BRANDING_TARGET_BYTES,
    transparent: args.transparent,
  });
}

export async function compressImageUnderBytes(
  buffer: Buffer,
  args: { maxBytes?: number; transparent?: boolean } = {}
): Promise<ProcessedBrandingImage> {
  const maxBytes = args.maxBytes || BRANDING_TARGET_BYTES;
  const usePng = args.transparent === true;

  if (usePng) {
    const png = await sharp(buffer, { animated: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    if (png.length <= maxBytes) return getImageResult(png, "image/png");
  }

  for (const quality of [92, 84, 76, 68, 60, 52, 44, 36]) {
    const webp = await sharp(buffer, { animated: false })
      .webp({ quality, effort: 5 })
      .toBuffer();

    if (webp.length <= maxBytes || quality === 36) {
      return getImageResult(webp, "image/webp");
    }
  }

  const fallback = await sharp(buffer, { animated: false })
    .webp({ quality: 36, effort: 5 })
    .toBuffer();

  return getImageResult(fallback, "image/webp");
}
