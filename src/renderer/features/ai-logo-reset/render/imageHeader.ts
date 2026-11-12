/** Reads display dimensions (EXIF orientation applied) from the first bytes of a JPEG, PNG or WEBP. */
export interface ImageHeader { width: number, height: number, orientation: number }

const HEADER_BYTES = 256 * 1024

const jpeg = (view: DataView): ImageHeader | null => {
  let offset = 2, orientation = 1
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) { offset += 1; continue }
    const marker = view.getUint8(offset + 1)
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue }
    if (marker === 0xd9 || marker === 0xda) break
    const length = view.getUint16(offset + 2)
    if (length < 2) return null
    if (marker === 0xe1 && offset + 10 < view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      orientation = exifOrientation(view, offset + 10, Math.min(view.byteLength, offset + 2 + length)) ?? orientation
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof && offset + 9 <= view.byteLength) {
      const height = view.getUint16(offset + 5), width = view.getUint16(offset + 7)
      if (!width || !height) return null
      return orientation >= 5 && orientation <= 8 ? { width: height, height: width, orientation } : { width, height, orientation }
    }
    offset += 2 + length
  }
  return null
}

const exifOrientation = (view: DataView, tiff: number, end: number): number | null => {
  if (tiff + 8 > end) return null
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (at: number) => view.getUint16(at, little)
  const u32 = (at: number) => view.getUint32(at, little)
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return null
  const count = u16(ifd)
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

const png = (view: DataView): ImageHeader | null => (
  view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452
    ? { width: view.getUint32(16), height: view.getUint32(20), orientation: 1 }
    : null
)

const webp = (view: DataView): ImageHeader | null => {
  if (view.byteLength < 30 || view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) return null
  const chunk = view.getUint32(12)
  const u24 = (at: number) => view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16)
  if (chunk === 0x56503858) return { width: u24(24) + 1, height: u24(27) + 1, orientation: 1 } // VP8X
  if (chunk === 0x56503820) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, orientation: 1 } // VP8
  if (chunk === 0x5650384c) { // VP8L
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, orientation: 1 }
  }
  return null
}

export const parseImageHeader = (buffer: ArrayBuffer): ImageHeader | null => {
  const view = new DataView(buffer)
  if (view.byteLength < 4) return null
  try {
    if (view.getUint16(0) === 0xffd8) return jpeg(view)
    return png(view) ?? webp(view)
  } catch {
    return null
  }
}

export const readImageHeader = async (file: Blob) => parseImageHeader(await file.slice(0, HEADER_BYTES).arrayBuffer())
