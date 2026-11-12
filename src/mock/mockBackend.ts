import {
  emptyAiLogoResetScene,
  normalizeAiLogoResetScenes,
  type AiLogoResetApi,
  type AiLogoResetExportStatus,
  type AiLogoResetLayer,
  type AiLogoResetLogoView,
  type AiLogoResetPhotoView,
  type AiLogoResetProjectSummary,
  type AiLogoResetProjectView,
  type AiLogoResetResponse,
  type AiLogoResetRecognition
} from '../shared/aiLogoReset'
import { buildAiLogoResetPreset, type AiLogoResetPresetView } from '../shared/aiLogoResetPresets'
import type { LogoAssetRecord } from '../shared/logoTypes'

/**
 * Figma Make only. This file contains a local, deterministic simulation of the
 * desktop app's IPC contract. No server, paid export, AI model, filesystem
 * access, or privileged Electron API is used.
 */
const STORAGE_KEY = 'logo-reset-figma-demo-v1'
type Project = AiLogoResetProjectView
const ok = <T>(data: T): AiLogoResetResponse<T> => ({ success: true, data })
const fail = <T>(error: string, code?: string, currentRevision?: number): AiLogoResetResponse<T> => ({
  success: false, error, ...(code ? { code } : {}), ...(currentRevision ? { currentRevision } : {})
})
const copy = <T>(value: T): T => structuredClone(value)
const id = () => crypto.randomUUID()
const now = () => Date.now()
const demoNames = ['窗边仪式', '婚礼合影', '户外人像', '宴会现场', '细节特写', '夕阳人像', '婚礼现场', '室内人像']
const demoSize = [
  [1600, 1000], [1000, 1600], [1600, 1000], [1600, 1000],
  [1000, 1600], [1600, 1000], [1600, 1000], [1000, 1600]
] as const
const demoPhotoPath = (index: number) => '/demo/photos/demo-' + String(index + 1).padStart(2, '0') + '.svg'
const demoPhotos: AiLogoResetPhotoView[] = demoNames.map((name, i) => ({
  id: 'demo-' + String(i + 1).padStart(2, '0'),
  name: name + '.jpg',
  width: demoSize[i][0],
  height: demoSize[i][1],
  orientation: demoSize[i][0] > demoSize[i][1] ? 'landscape' : 'portrait',
  sizeBytes: 1200000 + i * 170000
}))
const logoUrls: Record<string, string> = {
  'public-white': '/demo/logos/studio-white.svg',
  'public-gold': '/demo/logos/studio-gold.svg',
  'public-monogram': '/demo/logos/studio-monogram.svg'
}
const publicLogos: LogoAssetRecord[] = [
  { id: 'public-white', originalName: 'WHITE STUDIO', localPath: 'demo:public-white', sizeBytes: 6000, width: 800, height: 220, hasAlpha: true, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() },
  { id: 'public-gold', originalName: 'GOLD STUDIO', localPath: 'demo:public-gold', sizeBytes: 6000, width: 800, height: 220, hasAlpha: true, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() },
  { id: 'public-monogram', originalName: 'MONOGRAM', localPath: 'demo:public-monogram', sizeBytes: 5000, width: 320, height: 320, hasAlpha: true, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() }
]
const presetLogo = (which: string): AiLogoResetLogoView => ({
  id: which, name: which === 'public-white' ? 'WHITE STUDIO' : 'GOLD STUDIO',
  file: which + '.svg', width: 800, height: 220, url: logoUrls[which]
})
const makeLayer = (logoId: string, x = .5, y = .91): AiLogoResetLayer => ({
  id: id(), logoId, visible: true, x, y, size: 18, rotation: 0,
  opacity: 100, anchor: 'bc', margin: 4,
  shadow: { enabled: false, color: '#000000', opacity: 65, blur: 2.5, distance: 2.5, angle: 45 },
  warp: { enabled: false, corners: [{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}] },
  locked: false, groupId: null
})
const sources = new Map<string, string>()
for (let index = 0; index < demoPhotos.length; index++) sources.set(demoPhotos[index].id, demoPhotoPath(index))
const uploads = new Map<string, File>()
const sourceUrl = (photoId: string) => sources.get(photoId) || ''
const coverUrls = (project: Project) => project.photos.slice(0, 4).map(photo => sourceUrl(photo.id)).filter(Boolean)
const summary = (project: Project): AiLogoResetProjectSummary => ({
  id: project.id, revision: project.revision, name: project.name, pinned: project.pinned,
  createdAt: project.createdAt, updatedAt: project.updatedAt,
  photoCount: project.photos.length, coverUrls: coverUrls(project)
})
const blankProject = (name: string): Project => ({
  id: id(), revision: 1, name, pinned: false, createdAt: now(), updatedAt: now(),
  photos: [], logos: [], scenes: {}, exports: [], originalsBase: '/demo/photos'
})
const makeSeed = (): Project => {
  const project = blankProject('婚礼品牌 · UI 演示')
  project.id = 'demo-wedding'
  project.pinned = true
  project.createdAt = now() - 86400000 * 4
  project.photos = copy(demoPhotos)
  project.logos = [presetLogo('public-white'), presetLogo('public-gold')]
  for (const photo of project.photos) project.scenes[photo.id] = emptyAiLogoResetScene()
  for (const photo of project.photos.slice(0, 4)) project.scenes[photo.id].layers = [makeLayer('public-white')]
  project.scenes[project.photos[5].id].layers = [makeLayer('public-gold')]
  return project
}
let projects: Project[] = []
let presets: AiLogoResetPresetView[] = []
let exporting: AiLogoResetExportStatus | null = null
let exportTimer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(value: AiLogoResetExportStatus) => void>()
const emit = () => { if (exporting) for (const cb of listeners) cb(copy(exporting)) }
const persist = () => {
  try {
    const sanitizedProjects = projects.map(project => {
      const photos = project.photos.filter(photo => photo.id.startsWith('demo-'))
      const logos = project.logos.filter(logo => !logo.url.startsWith('blob:'))
      return { ...project, photos, logos,
        scenes: Object.fromEntries(photos.map(photo => [photo.id, project.scenes[photo.id] || emptyAiLogoResetScene()])) }
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: sanitizedProjects, presets }))
  } catch { /* storage can be unavailable inside preview iframe */ }
}
const restore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as {projects?: Project[], presets?: AiLogoResetPresetView[]} | null
    if (parsed?.projects?.length) {
      projects = parsed.projects.map(project => ({
        ...project, originalsBase: '/demo/photos',
        photos: project.photos.filter(photo => sources.has(photo.id)),
        logos: project.logos.filter(logo => !logo.url.startsWith('blob:'))
      }))
      for (const project of projects) {
        project.scenes = normalizeAiLogoResetScenes(project.scenes,
          project.photos.map(photo => photo.id), new Set(project.logos.map(logo => logo.id)))
      }
      presets = (parsed.presets || []).filter(preset => preset.logos.every(logo => !logo.url.startsWith('blob:')))
      return
    }
  } catch { /* fall back to seed */ }
  projects = [makeSeed()]
  presets = []
}
const find = (projectId: string) => projects.find(project => project.id === projectId)
const mutate = async <T>(projectId: string, expectedRevision: number, work: (project: Project) => T | Promise<T>): Promise<AiLogoResetResponse<T>> => {
  const project = find(projectId)
  if (!project) return fail('项目不存在。', 'AI_LOGO_RESET_NOT_FOUND')
  if (project.revision !== expectedRevision) return fail('项目版本已变化，请刷新。', 'AI_LOGO_RESET_REVISION_CONFLICT', project.revision)
  try {
    const result = await work(project)
    project.revision += 1
    project.updatedAt = now()
    persist()
    return ok(result)
  } catch (error) { return fail(error instanceof Error ? error.message : String(error), 'AI_LOGO_RESET_INVALID') }
}
const revision = (project: Project) => ({ revision: project.revision + 1, updatedAt: now() })
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const api: AiLogoResetApi = {
  async listProjects() { return ok(projects.map(summary)) },
  async createProject({name}) {
    const project = blankProject(name)
    projects.unshift(project)
    persist()
    return ok(summary(project))
  },
  async openProject(projectId) {
    const project = find(projectId)
    return project ? ok(copy(project)) : fail('项目不存在。', 'AI_LOGO_RESET_NOT_FOUND')
  },
  renameProject({projectId,expectedRevision,name}) {
    return mutate(projectId,expectedRevision,project => { project.name = name.slice(0,60); return revision(project) })
  },
  setPinned({projectId,expectedRevision,pinned}) {
    return mutate(projectId,expectedRevision,project => { project.pinned = pinned; return revision(project) })
  },
  deleteProject({projectId,expectedRevision}) {
    return mutate(projectId,expectedRevision,() => {
      projects = projects.filter(project => project.id !== projectId)
      return true as const
    })
  },
  saveScenes({projectId,expectedRevision,scenesJson}) {
    return mutate(projectId,expectedRevision,project => {
      project.scenes = normalizeAiLogoResetScenes(JSON.parse(scenesJson),
        project.photos.map(photo => photo.id), new Set(project.logos.map(logo => logo.id)))
      return revision(project)
    })
  },
  importPhotos({projectId,expectedRevision,paths}) {
    return mutate(projectId,expectedRevision, async project => {
      const rejected: Array<{name:string,reason:string}> = []
      let duplicates = 0
      let added = 0
      for (const path of paths) {
        const file = uploads.get(path)
        if (!file || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
          rejected.push({ name: file?.name || path, reason: '演示版仅导入 JPG、PNG 和 WEBP。' })
          continue
        }
        if (project.photos.some(photo => photo.name === file.name && photo.sizeBytes === file.size)) {
          duplicates++
          continue
        }
        try {
          const bitmap = await createImageBitmap(file)
          const width = bitmap.width, height = bitmap.height
          bitmap.close()
          const photoId = id()
          const photo: AiLogoResetPhotoView = {
            id: photoId, name: file.name, width, height,
            orientation: width > height ? 'landscape' : width < height ? 'portrait' : 'square',
            sizeBytes: file.size
          }
          project.photos.push(photo)
          project.scenes[photoId] = emptyAiLogoResetScene()
          sources.set(photoId, URL.createObjectURL(file))
          added++
        } catch { rejected.push({name:file.name,reason:'浏览器无法解码该图片。'}) }
      }
      window.__aiLogoDemoPhotoUrls = Object.fromEntries(sources)
      const view = copy(project)
      view.revision = project.revision + 1
      return { project: view, added, duplicates, rejected }
    })
  },
  removePhotos({projectId,expectedRevision,photoIds}) {
    return mutate(projectId,expectedRevision,project => {
      const removing = new Set(photoIds)
      project.photos = project.photos.filter(photo => !removing.has(photo.id))
      for (const photoId of removing) {
        delete project.scenes[photoId]
        const url = sources.get(photoId)
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
        sources.delete(photoId)
      }
      window.__aiLogoDemoPhotoUrls = Object.fromEntries(sources)
      return revision(project)
    })
  },
  importLogo({projectId,expectedRevision,name,png}) {
    return mutate(projectId,expectedRevision,project => {
      const logo: AiLogoResetLogoView = {
        id: id(), name, file: name + '.png',
        width: 512, height: 512, url: URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}))
      }
      project.logos.push(logo)
      return { logo, revision: project.revision + 1 }
    })
  },
  importLogoAsset({projectId,expectedRevision,assetId}) {
    return mutate(projectId,expectedRevision,project => {
      if (!logoUrls[assetId]) throw Error('公共 LOGO 素材不存在')
      const already = project.logos.find(logo => logo.id === assetId)
      const logo = already || presetLogo(assetId)
      if (!already) project.logos.push(logo)
      return {logo,revision:project.revision + 1}
    })
  },
  async recognize({photoId,kind}): Promise<AiLogoResetResponse<AiLogoResetRecognition>> {
    await wait(160)
    return ok({photoId,kind,faces:[{x:.41,y:.25,width:.16,height:.2}],maskUrl:null})
  },
  async startExport({projectId,expectedRevision,photoIds}) {
    const project = find(projectId)
    if (!project) return fail('项目不存在。')
    if (project.revision !== expectedRevision) return fail('项目版本已变化。','AI_LOGO_RESET_REVISION_CONFLICT',project.revision)
    if (exporting && ['preparing','running','cancelling'].includes(exporting.phase)) return fail('已有任务正在运行。','AI_LOGO_RESET_BUSY')
    exporting = {
      exportId:id(), projectId, phase:'preparing', total:photoIds.length,
      prepared:0, success:0, failed:0, degraded:0, outputDir:null, failures:[]
    }
    emit()
    if (exportTimer) clearInterval(exportTimer)
    exportTimer = setInterval(() => {
      if (!exporting || !['preparing','running'].includes(exporting.phase)) return
      if (exporting.phase === 'preparing') {
        exporting.prepared = Math.min(exporting.total,exporting.prepared+2)
        if (exporting.prepared >= exporting.total) exporting.phase = 'running'
      } else {
        exporting.success = Math.min(exporting.total,exporting.success+1)
        if (exporting.success >= exporting.total) {
          exporting.phase = 'completed'
          if (exportTimer) clearInterval(exportTimer)
          exportTimer = null
        }
      }
      emit()
    },240)
    return ok(copy(exporting))
  },
  async cancelExport(exportId) {
    if (exporting?.exportId !== exportId) return fail('任务已结束')
    exporting.phase = 'cancelled'
    if (exportTimer) clearInterval(exportTimer)
    exportTimer = null
    emit()
    return ok(true as const)
  },
  async getExportStatus() { return ok(exporting ? copy(exporting) : null) },
  async openExportFolder() { return fail('演示模式不会写入真实照片。') },
  onExportProgress(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  async listPresets() { return ok(copy(presets)) },
  async savePreset({projectId,name,sceneJson,includeBanner}) {
    const project = find(projectId)
    if (!project) return fail('项目不存在')
    try {
      const stored = buildAiLogoResetPreset({ id:id(), name, now:now(), scene:JSON.parse(sceneJson),
        logos:project.logos, includeBanner })
      const view: AiLogoResetPresetView = { ...stored, logos:stored.logos.map(logo => ({
        ...logo, url:project.logos.find(item => item.id === logo.id)?.url || ''
      })) }
      presets.push(view)
      persist()
      return ok(copy(view))
    } catch(error) { return fail(error instanceof Error ? error.message : String(error)) }
  },
  async updatePreset({presetId,name,pinned,source}) {
    const preset = presets.find(item => item.id === presetId)
    if (!preset) return fail('预设不存在')
    if (source) {
      const project = find(source.projectId)
      if (!project) return fail('项目不存在')
      try {
        const stored = buildAiLogoResetPreset({
          id:presetId,name:name || preset.name,now:now(),createdAt:preset.createdAt,
          scene:JSON.parse(source.sceneJson), logos:project.logos,
          includeBanner:source.includeBanner,pinned:preset.pinned
        })
        Object.assign(preset,{...stored,logos:stored.logos.map(logo => ({
          ...logo,url:project.logos.find(item => item.id === logo.id)?.url || ''
        }))})
      } catch(error) { return fail(error instanceof Error ? error.message : String(error)) }
    }
    if (name !== undefined) preset.name = name
    if (pinned !== undefined) preset.pinned = pinned
    preset.updatedAt = now()
    persist()
    return ok(copy(preset))
  },
  async deletePreset({presetId}) { presets = presets.filter(item => item.id !== presetId); persist(); return ok(true as const) },
  async reorderPresets({presetIds}) {
    const byId = new Map(presets.map(item => [item.id,item]))
    presets = presetIds.map(key => byId.get(key)).filter((item): item is AiLogoResetPresetView => !!item)
    persist()
    return ok(true as const)
  },
  usePreset({projectId,expectedRevision,presetId}) {
    return mutate(projectId,expectedRevision,project => {
      const preset = presets.find(item => item.id === presetId)
      if (!preset) throw Error('预设不存在')
      const added: AiLogoResetLogoView[] = []
      for (const logo of preset.logos) if (!project.logos.some(item => item.id === logo.id)) {
        project.logos.push(copy(logo))
        added.push(copy(logo))
      }
      return { revision:project.revision+1, scene:copy(preset.scene), added, missing:0 }
    })
  },
  getPathForFile(file) {
    const token = 'demo-upload:' + id()
    uploads.set(token,file)
    return token
  }
}

export function installDemoBackend() {
  restore()
  window.__aiLogoDemoPhotoUrls = Object.fromEntries(sources)
  window.photoToolboxAiLogoReset = api
  window.photoToolboxLogoAssets = { async listLogoAssets() { return { success: true as const, data: publicLogos } } }
  window.photoToolboxFiles = { async createLogoPreview(localPath: string) {
    const key = localPath.replace('demo:','')
    return { success: true as const, data: { previewDataUrl: logoUrls[key] || '' } }
  } }
}
