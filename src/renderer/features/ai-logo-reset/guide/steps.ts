import type { UiGuideStep } from '../../../components/uiGuideTour'
import { AI_LOGO_RESET_LIMITS } from '../../../../shared/aiLogoReset.ts'
import type { ResetInspectorTab } from '../state/types'

/** What the steps read from the open project to notice that the user tried something. */
export interface ResetGuideSource {
  photoCount: () => number
}

/** Stored once the tour has been finished or skipped, so it starts on its own only the first time. */
export const RESET_GUIDE_SEEN_KEY = 'gybox.ai-logo-reset.guide.v1'

/** One line per chapter on the opening route. */
export const RESET_GUIDE_CHAPTERS: Record<string, string> = {
  准备: '放入照片和 LOGO',
  摆放: '在画面上摆好，一键套用到全部',
  智能功能: '人脸避让、主体前置：打开会怎样，可能出什么问题',
  导出: '计费方式和导出设置'
}

/**
 * The tour follows the order of the work: bring photos and a logo in, place it, decide on the
 * recognition features (what turning each on does and what can go wrong), then export.
 */
export const resetGuideSteps = (source: ResetGuideSource): UiGuideStep[] => [
  {
    id: 'welcome', chapter: '准备', layout: 'intro',
    title: '第一次用智能加LOGO？',
    body: '按做图的顺序走一遍，大约 1 分钟。'
  },
  {
    id: 'photos', chapter: '准备', target: 'import',
    title: '添加照片',
    body: '选照片、选文件夹，或者直接拖进窗口。',
    notes: [
      { tone: 'effect', text: `支持 JPG、PNG、WEBP，一个项目最多 ${AI_LOGO_RESET_LIMITS.photos} 张` },
      { tone: 'effect', text: '原图只读，导出永远另存新文件' }
    ],
    done: () => source.photoCount() > 0,
    tryHint: '添加照片后会自动进入下一步'
  },
  {
    id: 'strip', chapter: '准备', target: 'strip',
    title: '照片列表',
    body: '点一张开始编辑。每张照片的 LOGO 设置互不影响。',
    shortcuts: [{ keys: ['PgUp', 'PgDn'], label: '切换照片' }]
  },
  {
    id: 'logo', chapter: '准备', target: 'library', fallback: 'inspector',
    title: 'LOGO 素材',
    body: `这个项目导入过的 LOGO 都在这里，点一下就加到当前照片，每张最多 ${AI_LOGO_RESET_LIMITS.layersPerPhoto} 个。`,
    notes: [
      { tone: 'effect', text: '还没有素材时，点末尾的上传按钮，或把文件拖到这里' },
      { tone: 'effect', text: '支持透明底的 PNG、WEBP、SVG' },
      { tone: 'caution', text: '带白底的 LOGO 会连底色一起盖上去，阴影也会变成方框' }
    ]
  },
  {
    id: 'stage', chapter: '摆放', target: 'stage',
    title: '在画面上摆',
    body: 'LOGO 直接摆在照片上，画面里看到的就是导出效果。',
    notes: [{ tone: 'effect', text: '第一次加上 LOGO 时，会再带你看一遍怎么调大小、旋转、阴影和透视' }],
    shortcuts: [
      { keys: ['\\'], label: '按住看原图' },
      { keys: ['Ctrl', 'Z'], label: '撤销' }
    ]
  },
  {
    id: 'sync', chapter: '摆放', target: 'sync',
    title: '应用到全部',
    body: '把当前照片的 LOGO、位置和效果，一次套到其余照片。',
    notes: [
      { tone: 'effect', text: '对齐九宫格的 LOGO，按每张照片的横竖重新定位' },
      { tone: 'caution', text: '其余照片原有的设置会被整套替换，不是追加' }
    ]
  },
  {
    id: 'face', chapter: '智能功能', target: 'face-avoid', effectTitle: '打开后',
    title: '人脸避让',
    body: 'LOGO 压到人脸时，自动挪到最近的不挡脸位置。',
    notes: [
      { tone: 'effect', text: '每张照片先识别人脸，第一次要多等一会儿' },
      { tone: 'caution', text: 'LOGO 可能不在你摆的位置，导出前逐张看一眼' },
      { tone: 'caution', text: '九个位置都挡脸时（LOGO 太大、合影），LOGO 留在原处' },
      { tone: 'caution', text: '侧脸、遮挡、很小的脸可能识别不到' }
    ]
  },
  {
    id: 'mode', chapter: '智能功能', target: 'render-mode', effectTitle: '打开后',
    title: '主体前置',
    body: '人物画在 LOGO 前面，像 LOGO 放在人身后。',
    notes: [
      { tone: 'effect', text: '每张照片先识别主体，比识别人脸更慢' },
      { tone: 'caution', text: '头发、头纱这类细边缘可能抠不干净' },
      { tone: 'caution', text: 'LOGO 整个压在人身上时会被完全挡住' }
    ]
  },
  {
    id: 'recognize', chapter: '智能功能', target: 'recognize',
    title: '提前识别',
    body: '画面左上角显示识别进度。点这里，一次把所有照片识别好。',
    notes: [{ tone: 'caution', text: '识别失败的照片照常导出，但按原位置出图，不避让、不前置' }]
  },
  {
    id: 'export', chapter: '导出', target: 'export',
    title: '导出',
    body: '选范围、格式和尺寸，可以顺便锐化。成品存到第一张照片旁的「LOGO导出」文件夹。',
    notes: [
      { tone: 'effect', text: '按张计费：开始时预扣，结束后退回没用到的' },
      { tone: 'effect', text: '可以放到后台继续；取消时已导出的照片保留' },
      { tone: 'caution', text: '没加 LOGO 的照片也会导出并计费，可打开「只导出已添加的」' },
      { tone: 'caution', text: '锐化只作用于照片，画面预览里看不到' }
    ]
  },
  {
    id: 'done', chapter: '导出', target: 'guide',
    title: '随时再看一遍',
    body: '引导结束。点这个按钮可以重新打开。'
  }
]

/** What the logo tour reads and changes in the open project. */
export interface ResetLayerGuideSource {
  hasSelection: () => boolean
  openTab: (tab: ResetInspectorTab) => void
}

export const RESET_LAYER_GUIDE_SEEN_KEY = 'gybox.ai-logo-reset.guide.layer.v1'

export const RESET_LAYER_GUIDE_CHAPTERS: Record<string, string> = {
  画面: '选中 LOGO，拖动、缩放、旋转',
  位置: '九宫格对齐、边距、大小、安全边界',
  外观: '不透明度和阴影',
  透视: '让 LOGO 贴合斜面'
}

/**
 * Shown once, after the first logo lands on a photo: first what the box on the photo does, then the
 * three pages on the right, each opened as its step shows.
 */
export const resetLayerGuideSteps = (source: ResetLayerGuideSource): UiGuideStep[] => [
  {
    id: 'layer-welcome', chapter: '画面', layout: 'intro',
    title: 'LOGO 加好了',
    body: '接下来看看怎么调它，大约 30 秒。'
  },
  {
    id: 'layer-select', chapter: '画面', target: 'layer', fallback: 'stage',
    title: '选中 LOGO',
    body: '点画面上的 LOGO，出现金色边框就是选中了。点照片外的空白处取消选中。',
    done: source.hasSelection,
    tryHint: '点一下画面上的 LOGO'
  },
  {
    id: 'layer-handles', chapter: '画面', target: 'layer', fallback: 'stage',
    title: '拖动、缩放、旋转',
    body: '选中后直接在画面上调。',
    notes: [
      { tone: 'effect', text: '拖 LOGO 本身：移到任意位置' },
      { tone: 'effect', text: '拖四个角的方块：等比放大、缩小' },
      { tone: 'effect', text: '拖顶部的圆点：旋转' },
      { tone: 'caution', text: '在画面上拖动后变成「自由位置」，不再贴着九宫格对齐' }
    ],
    shortcuts: [
      { keys: ['Shift'], label: '旋转按 15° 吸附' },
      { keys: ['←', '→', '↑', '↓'], label: '微调位置' },
      { keys: ['Delete'], label: '删除' }
    ],
    enter: () => source.openTab('place')
  },
  {
    id: 'layer-align', chapter: '位置', target: 'align', fallback: 'adjust',
    title: '对齐和边距',
    body: '点九宫格里的一个点，LOGO 就贴到照片对应的角、边或正中。',
    notes: [
      { tone: 'effect', text: '边距：LOGO 离照片边缘留多少空，按照片短边的百分比算' },
      { tone: 'effect', text: '对齐的 LOGO 在横图、竖图上都贴同一个角，应用到全部时按这个重新定位' },
      { tone: 'caution', text: '自由位置下拖动边距，会先对齐到右下角' }
    ],
    enter: () => source.openTab('place')
  },
  {
    id: 'layer-size', chapter: '位置', target: 'size', fallback: 'adjust',
    title: '大小和旋转',
    body: '和画面上拖控制点是同一组设置，这里能调到精确数值。',
    notes: [
      { tone: 'effect', text: '大小：LOGO 宽度占照片短边的百分比，横图竖图上看起来一样大' },
      { tone: 'effect', text: '旋转：-180° 到 180°' },
      { tone: 'effect', text: '双击滑块恢复默认值' }
    ],
    enter: () => source.openTab('place')
  },
  {
    id: 'layer-safe', chapter: '位置', target: 'safe-edge',
    title: '安全边界',
    body: '默认打开：LOGO 的图案始终完整留在照片里，拖到边上会停住。',
    notes: [
      { tone: 'effect', text: '按图案本身算，四周透明的部分可以出界' },
      { tone: 'effect', text: '放大、旋转或拉透视后超出照片时，自动往里挪' },
      { tone: 'effect', text: '自由位置离边缘至少留照片短边的 2%；九宫格对齐按你设的边距' },
      { tone: 'caution', text: '关掉后 LOGO 可以拖出一部分，照片外的部分不会导出' }
    ],
    enter: () => source.openTab('place')
  },
  {
    id: 'layer-look', chapter: '外观', target: ['tabs', 'page-look'],
    title: '不透明度和阴影',
    body: '不透明度调低，LOGO 更淡，像水印。打开「阴影」开关，下面展开阴影的设置。',
    notes: [
      { tone: 'effect', text: '模糊管阴影边缘的软硬，距离管阴影偏出多远' },
      { tone: 'effect', text: '角度管阴影往哪边偏，45° 是右下方' },
      { tone: 'caution', text: '模糊和距离按 LOGO 大小算，缩放 LOGO 时阴影跟着变' },
      { tone: 'caution', text: '页签上的小圆点亮起，表示这一页改过' }
    ],
    enter: () => source.openTab('look')
  },
  {
    id: 'layer-warp', chapter: '透视', target: ['tabs', 'page-warp'],
    title: '贴合斜面',
    body: '打开「透视变形」，画面上的 LOGO 四角出现圆点，拖动它们让 LOGO 贴合墙面、桌面或招牌。',
    notes: [
      { tone: 'effect', text: '点「完成编辑」回到缩放、旋转的控制框' },
      { tone: 'effect', text: '「复位」回到原来的矩形' },
      { tone: 'caution', text: '四个点要围成凸四边形，拖过头时角点会停住' }
    ],
    enter: () => source.openTab('warp')
  },
  {
    id: 'layer-done', chapter: '透视', target: 'sync',
    title: '调好一张，套用到全部',
    body: '点「应用到全部」，把这张的 LOGO 和设置套到其余照片。这段说明可以从 ? 按钮再打开。',
    enter: () => source.openTab('place')
  }
]
