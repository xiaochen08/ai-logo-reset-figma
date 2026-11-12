/// <reference lib="webworker" />
// Decodes a photo off the main thread and returns a downscaled JPEG (EXIF orientation applied).
// With a mask it returns the photo cut out by the mask's luminance as a transparent WEBP:
// the subject the export composites back over the logos.

interface ScaleRequest { id: number, source: Blob | string, mask?: string, longEdge: number, quality: number }

const scope = self as unknown as DedicatedWorkerGlobalScope

const blobOf = async (source: Blob | string) => {
  if (typeof source !== 'string') return source
  const response = await fetch(source)
  if (!response.ok) throw new Error(`PHOTO_UNAVAILABLE_${response.status}`)
  return response.blob()
}

const draw = (bitmap: ImageBitmap, width: number, height: number, alpha: boolean) => {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { alpha, willReadFrequently: alpha })
  if (!context) throw new Error('CANVAS_UNAVAILABLE')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return { canvas, context }
}

scope.onmessage = async (event: MessageEvent<ScaleRequest>) => {
  const { id, source, mask, longEdge, quality } = event.data
  const bitmaps: ImageBitmap[] = []
  try {
    const bitmap = await createImageBitmap(await blobOf(source), { imageOrientation: 'from-image' })
    bitmaps.push(bitmap)
    const width = bitmap.width, height = bitmap.height
    const ratio = Math.min(1, longEdge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * ratio)), targetHeight = Math.max(1, Math.round(height * ratio))
    let blob: Blob
    if (mask) {
      const maskBitmap = await createImageBitmap(await blobOf(mask))
      bitmaps.push(maskBitmap)
      const photo = draw(bitmap, targetWidth, targetHeight, true)
      const matte = draw(maskBitmap, targetWidth, targetHeight, true)
      const pixels = photo.context.getImageData(0, 0, targetWidth, targetHeight)
      const coverage = matte.context.getImageData(0, 0, targetWidth, targetHeight).data
      for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = coverage[index - 3]
      photo.context.putImageData(pixels, 0, 0)
      blob = await photo.canvas.convertToBlob({ type: 'image/webp', quality: 0.92 })
    } else {
      blob = await draw(bitmap, targetWidth, targetHeight, false).canvas.convertToBlob({ type: 'image/jpeg', quality })
    }
    scope.postMessage({ id, ok: true, blob, width, height })
  } catch (error) {
    scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    for (const item of bitmaps) item.close()
  }
}
