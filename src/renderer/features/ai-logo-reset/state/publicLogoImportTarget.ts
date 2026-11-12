export type PublicLogoImportTarget = {
  photoId: string | null
  layerId: string | null
  mode: 'add' | 'replace'
}

export type ResolvedPublicLogoImportTarget = {
  photoId: string
  layerId?: string
  mode: 'add' | 'replace'
}

export const capturePublicLogoImportTarget = (
  photoId: string | null,
  layerId: string | null,
  replace: boolean
): PublicLogoImportTarget => ({
  photoId,
  layerId: replace ? layerId : null,
  mode: replace ? 'replace' : 'add'
})

export const resolvePublicLogoImportTarget = (
  target: PublicLogoImportTarget,
  photos: readonly { id: string }[],
  scenes: Record<string, { layers: readonly { id: string, locked: boolean }[] | undefined } | undefined>
): ResolvedPublicLogoImportTarget | null => {
  if (!target.photoId || !photos.some(photo => photo.id === target.photoId)) return null
  if (target.mode === 'add') return { photoId: target.photoId, mode: 'add' }
  if (!target.layerId) return null
  const layer = scenes[target.photoId]?.layers?.find(item => item.id === target.layerId)
  return layer && !layer.locked
    ? { photoId: target.photoId, layerId: target.layerId, mode: 'replace' }
    : null
}
