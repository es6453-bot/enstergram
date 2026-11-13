import sharp from "sharp";
import type { GameDatabase } from "./database";
import { MAX_RESPONSE_IMAGE_BYTES } from "./media-limits";

const MAX_PIXELS = 32_000_000;
const MAX_FRAMES = 120;

export async function processResponseImage(input: Uint8Array) {
  if (!input.length || input.length > MAX_RESPONSE_IMAGE_BYTES)
    throw new Error("Choose an image up to 2 MB.");

  // Check raster signatures before passing user input to a decoder.
  const bytes = Buffer.from(input);
  const validSignature =
    bytes.subarray(0, 6).toString() === "GIF89a" ||
    bytes.subarray(0, 6).toString() === "GIF87a" ||
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP");
  if (!validSignature) throw new Error("Choose a GIF, PNG, JPEG, or WebP file.");

  const decoder = sharp(bytes, { animated: true, limitInputPixels: MAX_PIXELS });
  try {
    const { format, width, height, pages = 1, pageHeight = height } =
      await decoder.metadata();
    if (pages > MAX_FRAMES || width * pageHeight * pages > MAX_PIXELS)
      throw new Error("Image dimensions or frame count exceed the limit.");
    // Re-encode to remove metadata and any bytes appended to the source file.
    const resized = decoder.resize(800, 800, { fit: "inside", withoutEnlargement: true });
    const image = await (format === "gif"
      ? resized.gif({ effort: 2 })
      : resized.webp({ quality: 82, effort: 2, nearLossless: format === "png" })
    ).toBuffer();
    if (image.length <= MAX_RESPONSE_IMAGE_BYTES)
      return { mime: format === "gif" ? "image/gif" : "image/webp", image };
  } catch {
    throw new Error("This image could not be processed. Try a smaller file or a shorter GIF.");
  }
  throw new Error("The processed image is larger than 2 MB. Choose a smaller file.");
}

export async function readResponseImage(
  db: GameDatabase,
  submissionId: string,
  userId?: string,
  now = Date.now(),
) {
  return db.prepare(
    `SELECT m.mime,m.image FROM submission_media m JOIN submissions s ON s.id=m.submission_id
     JOIN rounds r ON r.id=s.round_id WHERE s.id=? AND r.cancelled=0 AND (
       (r.finalized IS NOT NULL AND r.ends<=? AND EXISTS(
         SELECT 1 FROM results WHERE submission_id=s.id
       )) OR (? IS NOT NULL AND (
         s.user_id=? OR (r.closes<=? AND r.ends>?)
       ) AND NOT EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=?))
     )`,
  ).bind(submissionId, now, userId ?? null, userId ?? null, now, now, userId ?? null).first();
}
