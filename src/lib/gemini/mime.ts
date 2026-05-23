const supportedGeminiVideoMimeTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function normalizeGeminiVideoMimeType(mimeType: string | null | undefined): string {
  const baseType = (mimeType ?? "").split(";")[0]?.trim().toLowerCase();
  if (baseType && supportedGeminiVideoMimeTypes.has(baseType)) {
    return baseType;
  }

  if (baseType?.includes("mp4")) return "video/mp4";
  if (baseType?.includes("webm")) return "video/webm";
  if (baseType?.includes("quicktime") || baseType?.includes("mov")) return "video/quicktime";

  return "video/mp4";
}
