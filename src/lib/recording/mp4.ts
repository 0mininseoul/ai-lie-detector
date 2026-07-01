function boxTypeAt(bytes: Uint8Array, offset: number) {
  if (offset + 8 > bytes.byteLength) return "";
  return String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
}

export function hasStandaloneMp4Initialization(bytes: Uint8Array) {
  const scanLimit = Math.min(bytes.byteLength - 8, 4096);
  let hasFtyp = false;
  let hasMoov = false;

  for (let offset = 0; offset <= scanLimit; offset += 1) {
    const boxType = boxTypeAt(bytes, offset);
    if (boxType === "ftyp") hasFtyp = true;
    if (boxType === "moov") hasMoov = true;
    if (hasFtyp && hasMoov) return true;
  }

  return false;
}

export async function blobLooksLikeStandaloneMp4(blob: Blob) {
  if (!blob.type.toLowerCase().startsWith("video/mp4")) {
    return true;
  }

  const sample = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  return hasStandaloneMp4Initialization(sample);
}
