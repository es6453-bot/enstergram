/* eslint-disable @next/next/no-img-element */
export function ResponseImage({ id, alt = "Submitted GIF or image" }: { id: string; alt?: string }) {
  return (
    <img
      className="response-image"
      src={`/api/response-image/${encodeURIComponent(id)}`}
      alt={alt}
      loading="lazy"
    />
  );
}
