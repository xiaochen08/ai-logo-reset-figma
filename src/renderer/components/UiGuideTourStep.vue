<script setup lang="ts">
import { computed } from 'vue'
import { Check, TriangleAlert } from '@lucide/vue'
import type { UiGuideStep } from './uiGuideTour'

const props = defineProps<{
  step: UiGuideStep
  done: boolean
  chapters: Array<{ label: string, summary: string }>
  titleId?: string
}>()

const effects = computed(() => props.step.notes?.filter(note => note.tone === 'effect') ?? [])
const cautions = computed(() => props.step.notes?.filter(note => note.tone === 'caution') ?? [])
// Blocks rise one after another; the index is the order they arrive in.
const order = computed(() => {
  let i = 2
  return {
    effects: effects.value.length ? i++ : 0,
    cautions: cautions.value.length ? i++ : 0,
    keys: props.step.shortcuts?.length ? i++ : 0,
    try: props.step.done ? i++ : 0
  }
})
const rise = (i: number) => ({ '--i': i })
</script>

<template>
  <div v-if="step.layout === 'intro'" class="ui-guide-intro">
    <h3 :id="titleId" class="ui-guide-title is-large ui-guide-rise" :style="rise(0)">{{ step.title }}</h3>
    <p class="ui-guide-text ui-guide-rise" :style="rise(1)">{{ step.body }}</p>
    <ol class="ui-guide-route">
      <li v-for="(chapter, i) in chapters" :key="chapter.label" class="ui-guide-rise" :style="rise(2 + i)">
        <span class="ui-guide-route-mark">{{ i + 1 }}</span>
        <span class="ui-guide-route-text">
          <b>{{ chapter.label }}</b>
          <span>{{ chapter.summary }}</span>
        </span>
      </li>
    </ol>
  </div>

  <div v-else class="ui-guide-step">
    <h3 :id="titleId" class="ui-guide-title ui-guide-rise" :style="rise(0)">{{ step.title }}</h3>
    <p class="ui-guide-text ui-guide-rise" :style="rise(1)">{{ step.body }}</p>

    <section v-if="effects.length" class="ui-guide-group ui-guide-rise" :style="rise(order.effects)">
      <h4>{{ step.effectTitle ?? '要点' }}</h4>
      <ul>
        <li v-for="note in effects" :key="note.text"><span class="ui-guide-dot" aria-hidden="true" />{{ note.text }}</li>
      </ul>
    </section>
    <section v-if="cautions.length" class="ui-guide-group is-caution ui-guide-rise" :style="rise(order.cautions)">
      <h4>注意</h4>
      <ul>
        <li v-for="note in cautions" :key="note.text"><TriangleAlert :size="13" class="ui-guide-alert" aria-hidden="true" />{{ note.text }}</li>
      </ul>
    </section>

    <div v-if="step.shortcuts?.length" class="ui-guide-keys ui-guide-rise" :style="rise(order.keys)">
      <span v-for="shortcut in step.shortcuts" :key="shortcut.label" class="ui-guide-key">
        <kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd>{{ shortcut.label }}
      </span>
    </div>

    <p v-if="step.done" class="ui-guide-try ui-guide-rise" :class="{ 'is-done': done }" :style="rise(order.try)">
      <span class="ui-guide-try-mark" aria-hidden="true"><Check v-if="done" :size="11" :stroke-width="3" /></span>
      {{ done ? '已完成' : step.tryHint }}
    </p>
  </div>
</template>
