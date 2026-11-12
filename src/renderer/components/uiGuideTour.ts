/** One line in a step's callouts. */
export interface UiGuideNote {
  /** `effect` lists what the feature does or what to know; `caution` lists what can go wrong. */
  tone: 'effect' | 'caution'
  text: string
}

export interface UiGuideShortcut {
  keys: string[]
  label: string
}

export interface UiGuideStep {
  id: string
  /** Steps of one chapter sit next to each other; the chapter row is built from these labels. */
  chapter: string
  title: string
  body: string
  /** `intro` shows the route through all chapters instead of a single step. */
  layout?: 'intro'
  /**
   * Value of the `data-guide` attribute to light; with several, the opening covers all of them that
   * are on screen. Without one the card sits in the middle of the screen.
   */
  target?: string | string[]
  /** Lit instead when the target is not on screen (e.g. a panel that only appears after a selection). */
  fallback?: string
  notes?: UiGuideNote[]
  /** Heading over the `effect` notes; “打开后” for a switch, “要点” otherwise. */
  effectTitle?: string
  shortcuts?: UiGuideShortcut[]
  /**
   * A real action the step asks for (“add a few photos”). Returns true once it is done. Until then
   * the step holds the tour: “next” waits, and the tour moves on by itself as soon as it happens.
   */
  done?: () => boolean
  /** Shown while `done` is still false. */
  tryHint?: string
  /** Runs each time the step shows, e.g. to open the page that holds its target. */
  enter?: () => void
}

export interface UiGuideRect { x: number, y: number, width: number, height: number }

export type UiGuideSide = 'bottom' | 'right' | 'left' | 'top' | 'inside' | 'centre'

export interface UiGuidePlacement { x: number, y: number, side: UiGuideSide }

const GAP = 18
const EDGE = 12

/**
 * Where the card goes: beside the lit area on the side with room, centred along it;
 * over a large area (most of the screen) it sits inside the area's lower edge.
 */
export const placeGuideCard = (
  hole: UiGuideRect | null,
  card: { width: number, height: number },
  viewport: { width: number, height: number }
): UiGuidePlacement => {
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), Math.max(EDGE, viewport.width - card.width - EDGE))
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, viewport.height - card.height - EDGE))
  if (!hole) return { x: clampX((viewport.width - card.width) / 2), y: clampY((viewport.height - card.height) / 2), side: 'centre' }

  const centreX = hole.x + hole.width / 2 - card.width / 2
  const centreY = hole.y + hole.height / 2 - card.height / 2
  const room = {
    right: viewport.width - (hole.x + hole.width) - GAP - EDGE,
    left: hole.x - GAP - EDGE,
    bottom: viewport.height - (hole.y + hole.height) - GAP - EDGE,
    top: hole.y - GAP - EDGE
  }
  if (room.bottom >= card.height) return { x: clampX(centreX), y: hole.y + hole.height + GAP, side: 'bottom' }
  if (room.right >= card.width) return { x: hole.x + hole.width + GAP, y: clampY(centreY), side: 'right' }
  if (room.left >= card.width) return { x: hole.x - GAP - card.width, y: clampY(centreY), side: 'left' }
  if (room.top >= card.height) return { x: clampX(centreX), y: hole.y - GAP - card.height, side: 'top' }
  return { x: clampX(centreX), y: clampY(hole.y + hole.height - card.height - GAP * 1.5), side: 'inside' }
}

/** Where the card's pointer sits along the edge that faces the lit area, in card coordinates. */
export const guideNotch = (
  place: UiGuidePlacement,
  hole: UiGuideRect | null,
  card: { width: number, height: number }
): { x: number, y: number } | null => {
  if (!hole || place.side === 'inside' || place.side === 'centre') return null
  const inset = 26
  const along = (value: number, length: number) => Math.min(Math.max(inset, value), length - inset)
  const centreX = along(hole.x + hole.width / 2 - place.x, card.width)
  const centreY = along(hole.y + hole.height / 2 - place.y, card.height)
  if (place.side === 'bottom') return { x: centreX, y: 0 }
  if (place.side === 'top') return { x: centreX, y: card.height }
  if (place.side === 'right') return { x: 0, y: centreY }
  return { x: card.width, y: centreY }
}

/** The chapters in step order, with how far the current step is through each. */
export const guideChapters = (steps: readonly UiGuideStep[], index: number) => {
  const chapters: Array<{ label: string, first: number, count: number }> = []
  steps.forEach((step, i) => {
    const last = chapters.at(-1)
    if (last && last.label === step.chapter) last.count += 1
    else chapters.push({ label: step.chapter, first: i, count: 1 })
  })
  return chapters.map(chapter => ({
    ...chapter,
    fill: index >= chapter.first + chapter.count ? 1 : index < chapter.first ? 0 : (index - chapter.first + 1) / chapter.count,
    current: index >= chapter.first && index < chapter.first + chapter.count,
    passed: index >= chapter.first + chapter.count
  }))
}
