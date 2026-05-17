export const candidateMimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4"
] as const;

export function pickSupportedMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string {
  return candidateMimeTypes.find((mimeType) => isTypeSupported(mimeType)) ?? "";
}
