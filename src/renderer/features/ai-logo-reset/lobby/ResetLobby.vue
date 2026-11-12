<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ImagePlus, Plus, Search, Stamp, Upload } from '@lucide/vue'
import { resolveUiMotionTransitionName } from '../../../animation/motionPresets'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import ResetProjectCard from './ResetProjectCard.vue'
import ResetConfirmDialog from '../ui/ResetConfirmDialog.vue'
import { lobby, projectActions, projects } from '../state/projects'
import { pushToast } from '../state/toasts'
import type { ResetProjectSummary } from '../state/types'

const emit = defineEmits<{ open: [id: string] }>()

const query = ref('')
const sort = ref<'recent' | 'name'>('recent')
const deleting = ref<ResetProjectSummary | null>(null)

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
}

const totalPhotos = computed(() => projects.reduce((sum, project) => sum + project.photoCount, 0))
const SORTS = [['recent', '最近修改'], ['name', '名称']] as const
const sortIndex = computed(() => SORTS.findIndex(([key]) => key === sort.value))
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return projects
    .filter(project => project.name.toLowerCase().includes(q))
    .toSorted((a, b) => (Number(b.pinned) - Number(a.pinned)) || (sort.value === 'name' ? a.name.localeCompare(b.name, 'zh') : b.updatedAt - a.updatedAt))
})

const steps = [
  { icon: ImagePlus, title: '导入照片', detail: '文件或整个文件夹' },
  { icon: Stamp, title: '添加 LOGO', detail: '位置、阴影与透视' },
  { icon: Upload, title: '批量导出', detail: '保留原尺寸与格式' }
]

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const creating = ref(false)
const create = async () => {
  if (creating.value) return
  creating.value = true
  try {
    emit('open', (await projectActions.create()).id)
  } catch (error) {
    pushToast({ tone: 'error', title: '新建项目失败', detail: errorText(error) })
  } finally {
    creating.value = false
  }
}
const confirmDelete = async () => {
  const project = deleting.value
  if (!project) return
  deleting.value = null
  try {
    await projectActions.remove(project.id)
    pushToast({ tone: 'ok', title: `已删除「${project.name}」` })
  } catch (error) {
    pushToast({ tone: 'error', title: '删除失败', detail: errorText(error) })
  }
}

// Returning from a workspace refreshes counts and covers.
onMounted(() => { void projectActions.refresh() })
</script>

<template>
  <div class="lobby">
    <div aria-hidden="true" class="lobby-glow" />

    <header class="lobby-header">
      <span class="crumb">智能加LOGO</span>
      <span class="crumb-tag">重置版</span>
      <label class="search">
        <Search :size="14" />
        <input v-model="query" placeholder="搜索项目" aria-label="搜索项目" @keydown.stop />
      </label>
    </header>

    <main class="lobby-main alr-scroll">
      <!-- First run: one centred composition instead of an empty grid. -->
      <p v-if="lobby.error && !projects.length" class="load-error">{{ lobby.error }}</p>
      <section v-else-if="lobby.loaded && !projects.length" class="intro">
        <UiMotionTransition preset="panel" appear>
          <div class="intro-copy">
            <div class="kicker">Smart Logo</div>
            <h1 class="title">{{ greeting() }}，<span class="title-accent">把品牌落在每一张成片上</span></h1>
            <button class="alr-btn alr-btn--primary alr-btn--pill cta" @click="create"><Plus :size="16" />新建项目</button>
          </div>
        </UiMotionTransition>
        <TransitionGroup tag="ol" class="steps" :name="resolveUiMotionTransitionName('list')" appear>
          <li v-for="(step, index) in steps" :key="step.title" class="step" :style="{ transitionDelay: `calc(var(--duration-fast) * ${0.5 + index * 0.4})` }">
            <span class="step-icon"><component :is="step.icon" :size="18" /></span>
            <span class="step-index alr-num">0{{ index + 1 }}</span>
            <span class="step-title">{{ step.title }}</span>
            <span class="step-detail">{{ step.detail }}</span>
          </li>
        </TransitionGroup>
      </section>

      <div v-else-if="projects.length" class="inner">
        <UiMotionTransition preset="panel" appear>
          <section class="summary">
            <div class="summary-copy">
              <div class="kicker">Smart Logo</div>
              <h1 class="summary-title">{{ greeting() }}</h1>
            </div>
            <div class="stats">
              <div><div class="stat-value alr-num">{{ projects.length.toLocaleString() }}</div><div class="stat-label">个项目</div></div>
              <div><div class="stat-value alr-num">{{ totalPhotos.toLocaleString() }}</div><div class="stat-label">张照片</div></div>
            </div>
            <button class="alr-btn alr-btn--primary alr-btn--pill cta" @click="create"><Plus :size="16" />新建项目</button>
          </section>
        </UiMotionTransition>

        <section class="all">
          <div class="all-head">
            <h2>全部项目</h2>
            <span class="all-count alr-num">{{ shown.length }}</span>
            <div class="sort" role="radiogroup" aria-label="排序">
              <span class="alr-slide sort-thumb" :style="{ transform: `translateX(${sortIndex * 100}%)` }" aria-hidden="true" />
              <button v-for="[key, label] in SORTS" :key="key" role="radio" :aria-checked="sort === key" :class="{ on: sort === key }" @click="sort = key">{{ label }}</button>
            </div>
          </div>
          <TransitionGroup tag="div" class="cards" :name="resolveUiMotionTransitionName('list')" appear>
            <button v-if="!query" key="__new" class="new-card" @click="create">
              <div class="new-card-cover alr-finder">
                <span class="new-card-ring"><Plus :size="20" /></span>
                <span class="new-card-name">新建项目</span>
                <span>空白项目，之后添加照片和 LOGO</span>
              </div>
            </button>
            <ResetProjectCard v-for="project in shown" :key="project.id" :project="project" @open="emit('open', project.id)" @delete="deleting = project" />
          </TransitionGroup>
          <p v-if="!shown.length" class="no-match">没有找到「{{ query }}」相关的项目</p>
        </section>
      </div>
    </main>

    <ResetConfirmDialog
      :open="!!deleting"
      title="删除项目"
      :message="deleting ? `删除「${deleting.name}」？项目内的 LOGO 设置会一起删除，原图不受影响。` : ''"
      confirm-label="删除"
      danger
      @cancel="deleting = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.lobby { position: relative; display: flex; flex-direction: column; height: 100%; min-width: 0; overflow: hidden; background: var(--alr-bg); }
/* A single static safelight wash: no filter, so it costs nothing to composite. */
.lobby-glow {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(900px 520px at 18% -10%, rgb(var(--alr-accent-rgb) / .09), transparent 70%), radial-gradient(700px 420px at 100% 0%, rgb(255 255 255 / .025), transparent 70%);
}

.lobby-header {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 8px; flex: none; height: 54px; padding: 0 28px;
  box-shadow: inset 0 -1px 0 rgb(255 255 255 / .05);
}
.crumb { font-size: 14px; font-weight: 500; color: var(--alr-ink); }
.crumb-tag { padding: 0 7px; border-radius: 999px; font-size: 10.5px; line-height: 18px; color: var(--alr-accent); background: rgb(var(--alr-accent-rgb) / .1); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .25); }
.search {
  margin-left: auto; display: flex; align-items: center; gap: 8px; width: 260px; height: 34px; padding: 0 12px; border-radius: 10px;
  background: var(--alr-sunken); box-shadow: var(--alr-well); color: var(--alr-mute); transition: var(--alr-hover);
}
.search:focus-within { color: var(--alr-ink-2); box-shadow: var(--alr-well), 0 0 0 1px rgb(var(--alr-accent-rgb) / .55), 0 0 0 4px rgb(var(--alr-accent-rgb) / .1); }
.search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 12.5px; color: var(--alr-ink); }
.search input::placeholder { color: var(--alr-mute); }

.lobby-main { position: relative; z-index: 1; flex: 1; min-height: 0; overflow-y: auto; }
.kicker { font-size: 12px; font-weight: 500; letter-spacing: .04em; color: var(--alr-accent); }
.cta { height: 42px; padding: 0 26px; font-size: 13.5px; }

.intro { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 52px; min-height: 100%; padding: 48px 40px 72px; text-align: center; }
.intro-copy { display: flex; flex-direction: column; align-items: center; }
.title { margin: 14px 0 30px; font-size: 34px; font-weight: 600; line-height: 1.25; letter-spacing: -.01em; color: var(--alr-ink); }
.title-accent { display: block; color: var(--alr-ink-2); font-weight: 500; }
/* The three steps are a real sequence, so a hairline runs through them. */
.steps { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.steps::before { content: ''; position: absolute; left: 10%; right: 10%; top: 50%; height: 1px; background: linear-gradient(90deg, transparent, rgb(var(--alr-accent-rgb) / .3), transparent); }
.step {
  position: relative; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; row-gap: 2px; align-items: center;
  padding: 16px; border-radius: 14px; text-align: left; background: var(--alr-panel-sheen), var(--alr-panel); box-shadow: var(--alr-edge), var(--alr-bevel), var(--alr-lift-1);
}
.step-icon {
  grid-row: span 2; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; color: var(--alr-accent);
  background: radial-gradient(circle at 50% 30%, rgb(var(--alr-accent-rgb) / .2), rgb(var(--alr-accent-rgb) / .05)); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .2);
}
.step-index { display: none; }
.step-title { font-size: 13.5px; font-weight: 500; color: var(--alr-ink); }
.step-detail { font-size: 12px; color: var(--alr-mute); }

.inner { max-width: 1320px; margin: 0 auto; padding: 32px 44px 72px; }
.summary { display: flex; align-items: flex-end; gap: 40px; padding-bottom: 26px; box-shadow: inset 0 -1px 0 rgb(255 255 255 / .05); }
.summary-copy { flex: 1; min-width: 0; }
.summary-title { margin: 8px 0 0; font-size: 30px; font-weight: 600; letter-spacing: -.01em; color: var(--alr-ink); }
.stats { display: flex; gap: 28px; padding: 0 4px 4px; }
.stat-value { font-size: 20px; font-weight: 500; color: var(--alr-ink); }
.stat-label { margin-top: 1px; font-size: 11.5px; color: var(--alr-mute); }

.all { margin-top: 28px; }
.all-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.all-head h2 { margin: 0; font-size: 15px; font-weight: 500; color: var(--alr-ink); }
.all-count { border-radius: 999px; padding: 0 8px; font-size: 11px; line-height: 18px; color: var(--alr-mute); background: rgb(255 255 255 / .05); }
.sort { position: relative; margin-left: auto; display: grid; grid-template-columns: repeat(2, 1fr); padding: 2px; border-radius: 9px; background: var(--alr-sunken); box-shadow: var(--alr-well); }
.sort-thumb { top: 2px; left: 2px; height: calc(100% - 4px); width: calc((100% - 4px) / 2); border-radius: 7px; background: linear-gradient(180deg, rgb(255 255 255 / .1), rgb(255 255 255 / .06)), var(--alr-raise); box-shadow: var(--alr-edge), var(--alr-bevel), 0 1px 3px rgb(0 0 0 / .4); }
.sort button { position: relative; z-index: 1; height: 26px; padding: 0 14px; border-radius: 7px; font-size: 12px; color: var(--alr-mute); transition: color var(--duration-fast) var(--easing-standard); }
.sort button:hover { color: var(--alr-ink-2); }
.sort button.on { color: var(--alr-ink); }

.cards { display: grid; gap: 22px; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
/* As tall as a project card beside it. */
.new-card { display: flex; min-height: 300px; text-align: left; transition: var(--alr-press); }
.new-card:active { transform: scale(.98); }
.new-card-cover {
  display: grid; place-content: center; justify-items: center; gap: 8px; flex: 1; border-radius: 14px; color: var(--alr-mute); font-size: 12px;
  background: radial-gradient(circle at 50% 40%, rgb(255 255 255 / .03), transparent 70%), rgb(255 255 255 / .015); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .05);
  transition: var(--alr-hover);
}
.new-card-cover::before { inset: 12px; --alr-finder-size: 18px; transition: opacity var(--duration-base) var(--easing-standard); }
.new-card:hover .new-card-cover { color: var(--alr-accent); background: radial-gradient(circle at 50% 40%, rgb(var(--alr-accent-rgb) / .1), transparent 70%), rgb(255 255 255 / .02); }
.new-card:hover .new-card-cover::before { --alr-finder-color: rgb(var(--alr-accent-rgb) / .7); }
.new-card-ring { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; transition: transform var(--duration-page) var(--easing-emphasized); }
.new-card:hover .new-card-ring { transform: rotate(90deg); }
.new-card-name { margin-top: 4px; font-size: 14px; font-weight: 500; color: var(--alr-ink-2); }
.new-card:hover .new-card-name { color: var(--alr-ink); }
.load-error { margin: 96px auto 0; max-width: 420px; text-align: center; font-size: 12.5px; line-height: 1.7; color: var(--alr-danger); }
.no-match { margin-top: 48px; text-align: center; font-size: 12.5px; color: var(--alr-mute); }

@media (max-width: 1080px) { .steps { grid-template-columns: 1fr; } .steps::before { display: none; } .summary { flex-wrap: wrap; } }
</style>
