<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { cpcEvents, cpcPeriods } from './data/cpcEvents';
import { historyEvents, historyPeriods, type HistoryEvent, type HistoryPeriod } from './data/historyEvents';
import { fetchWikiSummary, type WikiSummary } from './services/wiki';

type TimelineKey = 'civilization' | 'cpc';

interface TimelineConfig {
  key: TimelineKey;
  title: string;
  subtitle: string;
  events: HistoryEvent[];
  periods: HistoryPeriod[];
  stageWidth: number;
  initialEventId: string;
}

const timelines: Record<TimelineKey, TimelineConfig> = {
  civilization: {
    key: 'civilization',
    title: '中国历史长河',
    subtitle: '从文明初曙到现代中国',
    events: historyEvents,
    periods: historyPeriods,
    stageWidth: 8200,
    initialEventId: 'qin-unification',
  },
  cpc: {
    key: 'cpc',
    title: '党史长河',
    subtitle: '从红船启航到新时代征程',
    events: cpcEvents,
    periods: cpcPeriods,
    stageWidth: 6800,
    initialEventId: 'cpc-first-congress',
  },
};

const sidePanelWidth = 392;
const timelineStart = 180;
const timelineEndPadding = 460;

const activeTimelineKey = ref<TimelineKey>('civilization');
const selectedIds = ref<Record<TimelineKey, string>>({
  civilization: timelines.civilization.initialEventId,
  cpc: timelines.cpc.initialEventId,
});

const viewportRef = ref<HTMLElement | null>(null);
const position = ref(0);
const viewportWidth = ref(1200);
const wiki = ref<WikiSummary | null>(null);
const wikiLoading = ref(false);
const wikiFailed = ref(false);
const isDragging = ref(false);
const suppressClick = ref(false);

const activeTimeline = computed(() => timelines[activeTimelineKey.value]);
const stageWidth = computed(() => activeTimeline.value.stageWidth);
const timelineEnd = computed(() => stageWidth.value - timelineEndPadding);
const sortedEvents = computed(() => [...activeTimeline.value.events].sort((a, b) => a.sortYear - b.sortYear));
const activePeriods = computed(() => activeTimeline.value.periods);
const minYear = computed(() =>
  Math.min(...activePeriods.value.map((period) => period.startYear), ...sortedEvents.value.map((event) => event.sortYear)),
);
const maxYear = computed(() =>
  Math.max(...activePeriods.value.map((period) => period.endYear), ...sortedEvents.value.map((event) => event.sortYear)),
);
const selectedId = computed(() => selectedIds.value[activeTimelineKey.value]);
const selectedEvent = computed(
  () => sortedEvents.value.find((event) => event.id === selectedId.value) ?? sortedEvents.value[0],
);
const selectedIndex = computed(() => sortedEvents.value.findIndex((event) => event.id === selectedEvent.value.id));
const stageTravel = computed(() => Math.max(1, stageWidth.value - viewportWidth.value));
const progressRatio = computed(() => Math.min(1, Math.max(0, -position.value / stageTravel.value)));
const progressThumbStyle = computed(() => {
  const width = Math.max(9, (viewportWidth.value / stageWidth.value) * 100);
  const left = progressRatio.value * (100 - width);
  return { width: `${width}%`, left: `${left}%` };
});

const featuredImage = computed(() => {
  if (wiki.value?.thumbnail) {
    return wiki.value.thumbnail;
  }
  if (selectedEvent.value.imageFallback) {
    return selectedEvent.value.imageFallback;
  }
  return activeTimelineKey.value === 'cpc' ? '/images/cpc-fallback.svg' : '/images/history-fallback.svg';
});
const wikiExtract = computed(() => {
  const extract = wiki.value?.extract?.trim();
  if (!extract) {
    return '';
  }
  return extract.length > 210 ? `${extract.slice(0, 210)}...` : extract;
});

let resizeObserver: ResizeObserver | null = null;
let inertiaFrame = 0;
let dragState = {
  pointerId: -1,
  startX: 0,
  startPosition: 0,
  lastX: 0,
  lastTime: 0,
  velocity: 0,
  moved: false,
};

function normalizeYear(year: number) {
  return (year - minYear.value) / (maxYear.value - minYear.value);
}

function yearToX(year: number) {
  return timelineStart + Math.min(1, Math.max(0, normalizeYear(year))) * (timelineEnd.value - timelineStart);
}

function clampPosition(nextPosition: number) {
  const minPosition = Math.min(0, viewportWidth.value - stageWidth.value - sidePanelWidth);
  return Math.min(0, Math.max(minPosition, nextPosition));
}

function getEventX(event: HistoryEvent) {
  return yearToX(event.sortYear);
}

function eventStyle(event: HistoryEvent, index: number) {
  const lanes = activeTimelineKey.value === 'cpc' ? [35, 55, 43, 64, 48, 70] : [33, 54, 42, 63, 47, 70, 37];
  const wobble = Math.sin(index * 1.7) * 3;
  return {
    left: `${getEventX(event)}px`,
    top: `${lanes[index % lanes.length] + wobble}%`,
  };
}

function periodStyle(period: HistoryPeriod) {
  const left = yearToX(period.startYear);
  const right = yearToX(period.endYear);
  return {
    left: `${left}px`,
    width: `${Math.max(120, right - left)}px`,
  };
}

function tickLabel(year: number) {
  return year < 0 ? `前${Math.abs(year)}` : `${Math.floor(year)}`;
}

const yearTicks = computed(() => {
  const years =
    activeTimelineKey.value === 'cpc'
      ? [1921, 1927, 1935, 1945, 1949, 1956, 1978, 1992, 2001, 2012, 2017, 2021, 2025]
      : [-5000, -3000, -1600, -1046, -770, -221, 0, 220, 589, 907, 1200, 1368, 1644, 1840, 1911, 1949, 2001];
  return years.map((year) => ({ year, x: yearToX(year), label: tickLabel(year) }));
});

function setTimeline(key: TimelineKey) {
  if (activeTimelineKey.value === key) {
    return;
  }
  cancelAnimationFrame(inertiaFrame);
  activeTimelineKey.value = key;
  nextTick(() => centerEvent(selectedEvent.value));
}

function selectEvent(event: HistoryEvent, shouldCenter = true) {
  if (suppressClick.value) {
    return;
  }
  selectedIds.value = { ...selectedIds.value, [activeTimelineKey.value]: event.id };
  if (shouldCenter) {
    centerEvent(event);
  }
}

function centerEvent(event: HistoryEvent) {
  const availableCenter = viewportWidth.value > 820 ? viewportWidth.value - sidePanelWidth : viewportWidth.value;
  position.value = clampPosition(-(getEventX(event) - availableCenter * 0.5));
}

function selectSibling(direction: -1 | 1) {
  const nextIndex = Math.min(sortedEvents.value.length - 1, Math.max(0, selectedIndex.value + direction));
  selectEvent(sortedEvents.value[nextIndex]);
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  position.value = clampPosition(position.value - delta * 1.2);
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType === 'mouse') {
    return;
  }
  cancelAnimationFrame(inertiaFrame);
  isDragging.value = true;
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startPosition: position.value,
    lastX: event.clientX,
    lastTime: performance.now(),
    velocity: 0,
    moved: false,
  };
  viewportRef.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value || dragState.pointerId !== event.pointerId) {
    return;
  }
  const now = performance.now();
  const delta = event.clientX - dragState.startX;
  const elapsed = Math.max(8, now - dragState.lastTime);
  dragState.velocity = ((event.clientX - dragState.lastX) / elapsed) * 16;
  dragState.lastX = event.clientX;
  dragState.lastTime = now;
  dragState.moved = dragState.moved || Math.abs(delta) > 6;
  position.value = clampPosition(dragState.startPosition + delta);
}

function onPointerUp(event: PointerEvent) {
  if (!isDragging.value || dragState.pointerId !== event.pointerId) {
    return;
  }
  isDragging.value = false;
  viewportRef.value?.releasePointerCapture(event.pointerId);
  if (dragState.moved) {
    suppressClick.value = true;
    window.setTimeout(() => {
      suppressClick.value = false;
    }, 80);
  }
  startInertia(dragState.velocity);
}

function startInertia(initialVelocity: number) {
  let velocity = initialVelocity;
  const step = () => {
    if (Math.abs(velocity) < 0.08) {
      return;
    }
    const nextPosition = clampPosition(position.value + velocity);
    if (nextPosition === position.value) {
      return;
    }
    position.value = nextPosition;
    velocity *= 0.92;
    inertiaFrame = requestAnimationFrame(step);
  };
  inertiaFrame = requestAnimationFrame(step);
}

function onProgressPointer(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  position.value = clampPosition(-stageTravel.value * ratio);
}

watch(
  selectedEvent,
  async (event) => {
    wiki.value = null;
    wikiFailed.value = false;
    wikiLoading.value = true;
    const summary = await fetchWikiSummary(event.wikiTitle);
    wiki.value = summary;
    wikiFailed.value = !summary;
    wikiLoading.value = false;
  },
  { immediate: true },
);

watch(activeTimelineKey, async () => {
  wiki.value = null;
  await nextTick();
  centerEvent(selectedEvent.value);
});

onMounted(async () => {
  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(([entry]) => {
      viewportWidth.value = entry.contentRect.width;
      position.value = clampPosition(position.value);
    });
    resizeObserver.observe(viewportRef.value);
  }

  await nextTick();
  centerEvent(selectedEvent.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(inertiaFrame);
});
</script>

<template>
  <main class="app-shell" :class="`timeline-${activeTimelineKey}`">
    <header class="topbar">
      <div>
        <p class="eyebrow">{{ activeTimeline.subtitle }}</p>
        <h1>{{ activeTimeline.title }}</h1>
        <div class="timeline-switch" aria-label="线路切换">
          <button
            type="button"
            :class="{ active: activeTimelineKey === 'civilization' }"
            @click="setTimeline('civilization')"
          >
            通史长河
          </button>
          <button type="button" :class="{ active: activeTimelineKey === 'cpc' }" @click="setTimeline('cpc')">
            党史长河
          </button>
        </div>
      </div>
      <nav class="top-actions" aria-label="事件导航">
        <button class="nav-button" :disabled="selectedIndex === 0" @click="selectSibling(-1)">上一事件</button>
        <span class="event-count">{{ selectedIndex + 1 }} / {{ sortedEvents.length }}</span>
        <button class="nav-button" :disabled="selectedIndex === sortedEvents.length - 1" @click="selectSibling(1)">
          下一事件
        </button>
      </nav>
    </header>

    <section
      ref="viewportRef"
      class="river-viewport"
      :class="{ dragging: isDragging }"
      :aria-label="`${activeTimeline.title}横向时间轴`"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="viewport-vignette"></div>
      <div class="stage" :style="{ width: `${stageWidth}px`, transform: `translate3d(${position}px, 0, 0)` }">
        <div class="stars-layer"></div>
        <div class="period-bands" aria-hidden="true">
          <div
            v-for="period in activePeriods"
            :key="period.name"
            class="period-band"
            :class="`tone-${period.tone}`"
            :style="periodStyle(period)"
          >
            <span>{{ period.name }}</span>
          </div>
        </div>

        <div class="river-body" aria-hidden="true">
          <div class="river-glow"></div>
          <div class="river-current river-current-a"></div>
          <div class="river-current river-current-b"></div>
          <div class="river-shore river-shore-top"></div>
          <div class="river-shore river-shore-bottom"></div>
        </div>

        <div class="ticks" aria-hidden="true">
          <div v-for="tick in yearTicks" :key="tick.year" class="year-tick" :style="{ left: `${tick.x}px` }">
            <span>{{ tick.label }}</span>
          </div>
        </div>

        <button
          v-for="(event, index) in sortedEvents"
          :key="event.id"
          class="event-node"
          :class="{ active: event.id === selectedEvent.id }"
          :style="eventStyle(event, index)"
          type="button"
          @click.stop="selectEvent(event)"
        >
          <span class="node-pin"></span>
          <span class="node-year">{{ event.yearLabel }}</span>
          <span class="node-title">{{ event.title }}</span>
          <span class="node-category">{{ event.category }}</span>
        </button>
      </div>
    </section>

    <aside class="detail-panel" aria-live="polite">
      <div class="detail-media" :class="{ empty: !featuredImage }">
        <img v-if="featuredImage" :src="featuredImage" :alt="selectedEvent.title" />
        <div v-else class="media-mark">
          <span>{{ selectedEvent.period }}</span>
        </div>
      </div>

      <div class="detail-content">
        <div class="detail-kicker">
          <span>{{ selectedEvent.period }}</span>
          <span>{{ selectedEvent.category }}</span>
        </div>
        <h2>{{ selectedEvent.title }}</h2>
        <p class="detail-year">{{ selectedEvent.yearLabel }}</p>
        <p class="detail-summary">{{ selectedEvent.summary }}</p>

        <div class="info-block">
          <h3>事件脉络</h3>
          <p>{{ selectedEvent.details }}</p>
        </div>
        <div class="info-block">
          <h3>为什么重要</h3>
          <p>{{ selectedEvent.impact }}</p>
        </div>

        <div class="keywords" aria-label="关键词">
          <span v-for="keyword in selectedEvent.keywords" :key="keyword">{{ keyword }}</span>
        </div>

        <div v-if="selectedEvent.sourceUrl" class="source-box">
          <span>权威校验来源</span>
          <a :href="selectedEvent.sourceUrl" target="_blank" rel="noreferrer">{{ selectedEvent.sourceName }}</a>
        </div>

        <div class="wiki-box">
          <div class="wiki-head">
            <span>Wikimedia 接口摘要</span>
            <small v-if="wikiLoading">连接中</small>
            <small v-else-if="wikiFailed">使用本地稿</small>
            <small v-else>已增强</small>
          </div>
          <p v-if="wikiExtract">{{ wikiExtract }}</p>
          <p v-else>当前节点保留本地科普内容；接口不可用时仍可完整阅读。</p>
          <a v-if="wiki?.pageUrl" :href="wiki.pageUrl" target="_blank" rel="noreferrer">查看接口来源条目</a>
        </div>
      </div>
    </aside>

    <div class="progress-wrap">
      <button class="progress-track" type="button" :aria-label="`${activeTimeline.title}进度`" @pointerdown="onProgressPointer">
        <span class="progress-rail"></span>
        <span class="progress-thumb" :style="progressThumbStyle"></span>
      </button>
    </div>
  </main>
</template>
