<template>
  <div class="dash-wrapper">
    <!-- 工具栏 -->
    <div class="toolbar">
      <span class="table-title">
        <span v-if="props.tableIcon && !props.tableIcon.startsWith('ion:')" class="title-icon-emoji">{{ props.tableIcon }}</span>
        <ion-icon v-else-if="props.tableIcon" :name="props.tableIcon.slice(4)" :size="16" style="margin-right:5px;opacity:0.7;vertical-align:middle;" />
        {{ tableTitle || tableName }}
      </span>
      <span v-if="totalCount !== null" class="row-count">{{ totalCount }} records</span>
      <div style="flex:1" />
      <span v-if="loadingRecords" class="loading-hint">Loading…</span>
      <div class="view-switcher">
        <button class="view-btn" title="Grid view" @click="emit('switchView', 'grid')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="2.5" rx="0.5"/><rect x="8" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="5.5" width="5" height="2.5" rx="0.5"/><rect x="8" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="10" width="5" height="2.5" rx="0.5"/><rect x="8" y="10" width="5" height="2.5" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn" title="Gallery view" @click="emit('switchView', 'gallery')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/>
            <rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button class="view-btn" title="Kanban view" @click="emit('switchView', 'kanban')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="3" height="10" rx="0.5"/><rect x="5.5" y="1" width="3" height="7" rx="0.5"/><rect x="10" y="1" width="3" height="12" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn view-btn--active" title="Chart view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,11 4,6 7,9 10,3 13,6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Dashboard 内容 -->
    <div class="dash-body">
      <!-- 空状态 -->
      <div v-if="dashLoading" class="empty-state" style="color:#a3a19d;font-size:13px">Loading…</div>
      <div v-else-if="widgets.length === 0" class="empty-state">
        <svg width="40" height="40" viewBox="0 0 14 14" fill="none" stroke="#ccc" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px">
          <polyline points="1,11 4,6 7,9 10,3 13,6"/>
        </svg>
        <p class="empty-title">No widgets yet</p>
        <p class="empty-desc">Add a KPI card, bar chart, line chart, or pie chart to visualize your data.</p>
        <button class="empty-add-btn" @click.stop="showAddMenu = !showAddMenu">+ Add Widget
          <div v-if="showAddMenu" class="add-menu" @click.stop @mousedown.stop>
            <button v-for="t in WIDGET_TYPES" :key="t.key" class="add-menu-item"
              @click="addWidget(t.key); showAddMenu = false">
              <span class="add-menu-icon">{{ t.icon }}</span>
              <div>
                <div class="add-menu-name">{{ t.label }}</div>
                <div class="add-menu-desc">{{ t.desc }}</div>
              </div>
            </button>
          </div>
        </button>
      </div>

      <div v-else class="widget-grid">

        <div v-for="widget in widgets" :key="widget.id"
          class="widget-card"
          :class="[`widget-span-${widget.span}`, { 'widget-editing': editingId === widget.id }]"
        >
          <!-- 头部 -->
          <div class="widget-header">
            <span class="widget-title">{{ widget.title || defaultTitle(widget) }}</span>
            <div class="widget-actions">
              <button class="waction-btn" @click="toggleEdit(widget.id)" title="Configure">⚙</button>
              <button class="waction-btn waction-btn--danger" @click="removeWidget(widget.id)" title="Remove">×</button>
            </div>
          </div>

          <!-- 配置面板 -->
          <div v-if="editingId === widget.id" class="widget-config">
            <div class="cfg-row">
              <label class="cfg-label">Title</label>
              <input v-model="widget.title" class="cfg-input" placeholder="Auto" @input="persistWidgets()" />
            </div>
            <div class="cfg-row">
              <label class="cfg-label">Type</label>
              <div class="type-pills">
                <button v-for="t in WIDGET_TYPES" :key="t.key"
                  class="type-pill" :class="{ active: widget.type === t.key }"
                  @click="widget.type = t.key; persistWidgets()">
                  {{ t.icon }} {{ t.label }}
                </button>
              </div>
            </div>

            <template v-if="widget.type !== 'kpi'">
              <!-- Mode (line/bar only) -->
              <div v-if="widget.type === 'line' || widget.type === 'bar'" class="cfg-row">
                <label class="cfg-label">Mode</label>
                <div class="type-pills">
                  <button class="type-pill" :class="{ active: (widget.mode ?? 'aggregate') === 'aggregate' }"
                    @click="widget.mode = 'aggregate'; persistWidgets()">Aggregate</button>
                  <button class="type-pill" :class="{ active: widget.mode === 'raw' }"
                    @click="widget.mode = 'raw'; persistWidgets()">Raw data</button>
                </div>
              </div>

              <!-- Raw 模式 -->
              <template v-if="widget.mode === 'raw'">
                <div class="cfg-row">
                  <label class="cfg-label">X axis</label>
                  <select v-model="widget.groupByCol" class="cfg-select" @change="persistWidgets()">
                    <option value="">— record order —</option>
                    <option v-for="f in groupableFields" :key="f.column_name" :value="f.column_name">
                      {{ f.title || f.column_name }}
                    </option>
                  </select>
                </div>
                <div class="cfg-row cfg-row--top">
                  <label class="cfg-label">Y axis</label>
                  <div class="check-list">
                    <label v-for="f in numberFields" :key="f.column_name" class="check-item">
                      <input type="checkbox" :value="f.column_name"
                        :checked="widget.rawYCols.includes(f.column_name)"
                        @change="toggleYCol(widget, f.column_name, 'raw')" />
                      <span class="check-dot" :style="`background:${PALETTE[numberFields.indexOf(f) % PALETTE.length]}`" />
                      {{ f.title || f.column_name }}
                    </label>
                    <span v-if="numberFields.length === 0" class="cfg-hint">No number fields in this table</span>
                  </div>
                </div>
              </template>

              <!-- Aggregate 模式 -->
              <template v-else>
                <div class="cfg-row">
                  <label class="cfg-label">Group by</label>
                  <select v-model="widget.groupByCol" class="cfg-select" @change="autoChartType(widget); persistWidgets()">
                    <option v-for="f in groupableFields" :key="f.column_name" :value="f.column_name">
                      {{ f.title || f.column_name }}
                    </option>
                  </select>
                </div>
                <div v-if="isDateField(widget.groupByCol)" class="cfg-row">
                  <label class="cfg-label">By</label>
                  <select v-model="widget.dateGranularity" class="cfg-select" @change="persistWidgets()">
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
                <div class="cfg-row cfg-row--top">
                  <label class="cfg-label">Values</label>
                  <div class="check-list">
                    <label class="check-item">
                      <input type="checkbox" value="__count__"
                        :checked="widget.valueKeys.includes('__count__')"
                        @change="toggleYCol(widget, '__count__', 'agg')" />
                      <span class="check-dot" :style="`background:${PALETTE[0]}`" />
                      Count of records
                    </label>
                    <template v-for="f in numberFields" :key="f.column_name">
                      <label v-for="agg in ['sum','avg','max']" :key="`${agg}_${f.column_name}`" class="check-item">
                        <input type="checkbox" :value="`${agg}_${f.column_name}`"
                          :checked="widget.valueKeys.includes(`${agg}_${f.column_name}`)"
                          @change="toggleYCol(widget, `${agg}_${f.column_name}`, 'agg')" />
                        <span class="check-dot"
                          :style="`background:${PALETTE[allValueOptions(f.column_name, agg) % PALETTE.length]}`" />
                        {{ AGG_LABEL[agg] }} {{ f.title || f.column_name }}
                      </label>
                    </template>
                  </div>
                </div>
              </template>
            </template>

            <!-- KPI: 单选 Value -->
            <div v-if="widget.type === 'kpi'" class="cfg-row">
              <label class="cfg-label">Value</label>
              <select v-model="widget.kpiKey" class="cfg-select" @change="persistWidgets()">
                <option value="__count__">Count of records</option>
                <option v-for="f in numberFields" :key="'sum_'+f.column_name" :value="'sum_'+f.column_name">
                  Sum of {{ f.title || f.column_name }}
                </option>
                <option v-for="f in numberFields" :key="'avg_'+f.column_name" :value="'avg_'+f.column_name">
                  Avg of {{ f.title || f.column_name }}
                </option>
                <option v-for="f in numberFields" :key="'max_'+f.column_name" :value="'max_'+f.column_name">
                  Max of {{ f.title || f.column_name }}
                </option>
              </select>
            </div>

            <div class="cfg-row">
              <label class="cfg-label">Width</label>
              <div class="type-pills">
                <button class="type-pill" :class="{ active: widget.span === 1 }" @click="widget.span = 1; persistWidgets()">Half</button>
                <button class="type-pill" :class="{ active: widget.span === 2 }" @click="widget.span = 2; persistWidgets()">Full</button>
              </div>
            </div>
            <button class="cfg-done-btn" @click="editingId = null">Done</button>
          </div>

          <!-- KPI 内容 -->
          <div v-else-if="widget.type === 'kpi'" class="kpi-body">
            <div class="kpi-number">{{ formatKpi(computeKpi(widget)) }}</div>
            <div class="kpi-desc">{{ kpiDesc(widget) }}</div>
          </div>

          <!-- 图表内容 -->
          <div v-else class="chart-body">
            <div v-if="widget.mode === 'raw' && widget.rawYCols.length === 0" class="chart-empty">Click ⚙ to select Y axis fields</div>
            <div v-else-if="widget.mode !== 'raw' && widget.valueKeys.length === 0" class="chart-empty">Click ⚙ to select values</div>
            <div v-else-if="computeChartPayload(widget).labels.length === 0" class="chart-empty">No data</div>
            <ChartCanvas v-else :widget="widget" :payload="computeChartPayload(widget)" />
          </div>
        </div>

        <!-- Add Widget -->
        <div class="add-widget-card" @click.stop="showAddMenu = !showAddMenu">
          <span class="add-icon">+</span>
          <span class="add-label">Add Widget</span>
          <div v-if="showAddMenu" class="add-menu" @click.stop @mousedown.stop>
            <button v-for="t in WIDGET_TYPES" :key="t.key" class="add-menu-item"
              @click="addWidget(t.key); showAddMenu = false">
              <span class="add-menu-icon">{{ t.icon }}</span>
              <div>
                <div class="add-menu-name">{{ t.label }}</div>
                <div class="add-menu-desc">{{ t.desc }}</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, defineComponent, h, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { api, type FieldMeta, type RecordRow } from '@/api/client'
import IonIcon from './IonIcon.vue'

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const PALETTE = ['#4f6ef7','#18a058','#f0a020','#d03050','#8a2be2','#00adb5','#e91e8c','#ff6b35','#0ea5e9','#a16207']
const AGG_LABEL: Record<string, string> = { sum: 'Sum of', avg: 'Avg of', max: 'Max of' }

// ── ChartPayload 类型 ─────────────────────────────────────
interface SeriesData { name: string; data: number[]; color: string }
interface ChartPayload { labels: string[]; series: SeriesData[] }

// ── ChartCanvas 子组件 ────────────────────────────────────
const ChartCanvas = defineComponent({
  name: 'ChartCanvas',
  props: {
    widget: { type: Object, required: true },
    payload: { type: Object as () => ChartPayload, required: true },
  },
  setup(props) {
    const el = ref<HTMLElement>()
    let inst: echarts.ECharts | null = null

    function build() {
      if (!el.value) return
      if (!inst) inst = echarts.init(el.value)
      const { labels, series } = props.payload
      const isLine = props.widget.type === 'line'
      const showZoom = labels.length > 20
      const showLegend = series.length > 1

      if (props.widget.type === 'pie') {
        // 饼图只取第一个 series
        const s = series[0]
        inst.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11, color: '#787774' } },
          series: [{ type: 'pie', radius: ['38%','65%'], center: ['50%','44%'],
            data: labels.map((l, i) => ({ name: l, value: s?.data[i] ?? 0 })),
            label: { fontSize: 11 },
          }],
          color: PALETTE,
        }, true)
        return
      }

      inst.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: isLine ? 'line' : 'shadow' } },
        legend: showLegend ? {
          top: 4, type: 'scroll',
          textStyle: { fontSize: 11, color: '#787774' },
        } : undefined,
        grid: {
          left: 52, right: 12,
          top: showLegend ? 36 : 12,
          bottom: showZoom ? 52 : 24,
        },
        xAxis: {
          type: 'category', data: labels,
          axisLabel: { fontSize: 11, color: '#787774', rotate: labels.length > 8 ? 30 : 0, overflow: 'truncate', width: 70 },
          axisLine: { lineStyle: { color: '#e9e9e7' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { fontSize: 11, color: '#787774' },
          splitLine: { lineStyle: { color: '#f0f0ee' } },
        },
        ...(showZoom ? { dataZoom: [{ type: 'slider', bottom: 4, height: 18 }] } : {}),
        series: series.map(s => ({
          type: props.widget.type,
          name: s.name,
          data: s.data,
          smooth: isLine,
          itemStyle: { color: s.color, borderRadius: isLine ? 0 : [3,3,0,0] },
          lineStyle: isLine ? { color: s.color, width: 2 } : undefined,
          areaStyle: isLine && series.length === 1 ? {
            color: { type: 'linear', x:0,y:0,x2:0,y2:1,
              colorStops: [{ offset:0, color: s.color+'30' }, { offset:1, color: s.color+'00' }] },
          } : undefined,
        })),
      }, true)
    }

    watch(() => [props.payload, props.widget.type], () => nextTick(build), { deep: true })
    const ro = new ResizeObserver(() => inst?.resize())
    onMounted(() => { nextTick(build); if (el.value) ro.observe(el.value) })
    onUnmounted(() => { ro.disconnect(); inst?.dispose() })
    return () => h('div', { ref: el, style: 'width:100%;height:100%' })
  },
})

// ── Props / Emits ─────────────────────────────────────────
const props = defineProps<{
  tableName: string
  fields: FieldMeta[]
  tableTitle: string | null
  tableIcon?: string | null
  totalCount: number | null
}>()
const emit = defineEmits<{ switchView: [view: string] }>()

// ── Widget types ──────────────────────────────────────────
const WIDGET_TYPES = [
  { key: 'kpi',  icon: '🔢', label: 'KPI Card',   desc: 'A single big number' },
  { key: 'bar',  icon: '▌',  label: 'Bar Chart',  desc: 'Compare categories' },
  { key: 'line', icon: '〜', label: 'Line Chart', desc: 'Trends over time' },
  { key: 'pie',  icon: '◉',  label: 'Pie Chart',  desc: 'Part-to-whole' },
] as const
type WidgetType = 'kpi' | 'bar' | 'line' | 'pie'

interface Widget {
  id: string
  type: WidgetType
  title: string
  span: 1 | 2
  mode: 'aggregate' | 'raw'
  groupByCol: string
  rawYCols: string[]        // raw 模式：多个 Y 轴字段
  valueKeys: string[]       // aggregate 模式：多个聚合指标
  kpiKey: string            // KPI 单值
  dateGranularity: 'day' | 'week' | 'month' | 'year'
}

// ── 字段分类 ──────────────────────────────────────────────
const groupableFields = computed(() =>
  props.fields.filter(f => !f.isPrimaryKey &&
    ['text','select','date','datetime','email','checkbox'].includes(f.field_type))
)
const numberFields = computed(() =>
  props.fields.filter(f => ['number','currency','percent'].includes(f.field_type))
)

function isDateField(col: string) {
  const f = props.fields.find(x => x.column_name === col)
  return f?.field_type === 'date' || f?.field_type === 'datetime'
}

// 用于给 value 选项分配颜色索引
function allValueOptions(colName: string, agg: string): number {
  const opts = ['__count__', ...numberFields.value.flatMap(f => ['sum','avg','max'].map(a => `${a}_${f.column_name}`))]
  return opts.indexOf(`${agg}_${colName}`)
}

// ── Widgets 状态（存后端，所有用户共享）─────────────────────
const widgets = ref<Widget[]>([])
const dashLoading = ref(true)

async function loadWidgets() {
  dashLoading.value = true
  try {
    const config = await api.getDashboard(props.tableName)
    widgets.value = (config ?? []) as Widget[]
  } catch { widgets.value = [] }
  finally { dashLoading.value = false }
}

watch(() => props.tableName, loadWidgets, { immediate: true })

let saveTimer: ReturnType<typeof setTimeout> | null = null
function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    api.saveDashboard(props.tableName, widgets.value)
  }
}
function persistWidgets() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    api.saveDashboard(props.tableName, widgets.value)
  }, 600)
}

const editingId = ref<string | null>(null)
const showAddMenu = ref(false)

function uid() { return Math.random().toString(36).slice(2, 9) }

function addWidget(type: WidgetType) {
  widgets.value.push({
    id: uid(), type,
    title: '',
    span: type === 'kpi' ? 1 : 2,
    mode: 'aggregate',
    groupByCol: groupableFields.value[0]?.column_name ?? '',
    rawYCols: numberFields.value.slice(0, 1).map(f => f.column_name),
    valueKeys: ['__count__'],
    kpiKey: '__count__',
    dateGranularity: 'month',
  })
  editingId.value = widgets.value[widgets.value.length - 1].id
  persistWidgets()
}

function removeWidget(id: string) {
  widgets.value = widgets.value.filter(w => w.id !== id)
  persistWidgets()
}

function toggleEdit(id: string) {
  editingId.value = editingId.value === id ? null : id
}

function autoChartType(widget: Widget) {
  if (isDateField(widget.groupByCol)) widget.type = 'line'
  else if (widget.type === 'line') widget.type = 'bar'
}

function toggleYCol(widget: Widget, key: string, mode: 'raw' | 'agg') {
  if (mode === 'raw') {
    const idx = widget.rawYCols.indexOf(key)
    if (idx >= 0) widget.rawYCols.splice(idx, 1)
    else widget.rawYCols.push(key)
  } else {
    const idx = widget.valueKeys.indexOf(key)
    if (idx >= 0) widget.valueKeys.splice(idx, 1)
    else widget.valueKeys.push(key)
  }
  persistWidgets()
}

// ── 数据加载 ──────────────────────────────────────────────
const allRecords = ref<RecordRow[]>([])
const loadingRecords = ref(false)
let fetchVersion = 0

async function fetchAllRecords() {
  const thisVersion = ++fetchVersion
  loadingRecords.value = true
  allRecords.value = []
  let cursor: string | null = null
  try {
    do {
      if (thisVersion !== fetchVersion) return // 表已切换，丢弃旧请求
      const res = await api.getRecords(props.tableName, { page_size: 500, ...(cursor ? { cursor } : {}) })
      if (thisVersion !== fetchVersion) return
      allRecords.value.push(...res.data)
      cursor = res.meta.next_cursor
      if (allRecords.value.length >= 10000) break
    } while (cursor)
  } finally { if (thisVersion === fetchVersion) loadingRecords.value = false }
}
watch(() => props.tableName, fetchAllRecords, { immediate: true })

// ── 计算图表数据 ───────────────────────────────────────────
function formatDateKey(val: unknown, gran: string): string {
  if (!val) return '(empty)'
  const d = new Date(typeof val === 'number' ? val * 1000 : String(val))
  if (isNaN(d.getTime())) return String(val)
  if (gran === 'year') return String(d.getFullYear())
  if (gran === 'month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  if (gran === 'week') {
    const dd = new Date(d); const day = dd.getDay()
    dd.setDate(dd.getDate() - day + (day === 0 ? -6 : 1))
    return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function computeChartPayload(widget: Widget): ChartPayload {
  if (allRecords.value.length === 0) return { labels: [], series: [] }

  // ── Raw 模式 ──
  if (widget.mode === 'raw') {
    const xCol = widget.groupByCol
    const yCols = widget.rawYCols
    if (yCols.length === 0) return { labels: [], series: [] }

    const records = allRecords.value
      .filter(r => !xCol || (r[xCol] != null && r[xCol] !== ''))
      .sort((a, b) => {
        if (!xCol) return 0
        const av = xCol ? String(a[xCol]) : ''
        const bv = xCol ? String(b[xCol]) : ''
        return av.localeCompare(bv)
      })

    const labels = records.map((r, i) => {
      if (!xCol) return String(i + 1)
      const xRaw = r[xCol]
      if (isDateField(xCol)) {
        const dd = new Date(typeof xRaw === 'number' ? xRaw * 1000 : String(xRaw))
        return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
      }
      return String(xRaw)
    })

    const series: SeriesData[] = yCols.map((col, i) => {
      const f = props.fields.find(x => x.column_name === col)
      return {
        name: f?.title || col,
        color: PALETTE[i % PALETTE.length],
        data: records.map(r => Math.round((parseFloat(String(r[col] ?? 0)) || 0) * 100) / 100),
      }
    })

    return { labels, series }
  }

  // ── Aggregate 模式 ──
  const col = widget.groupByCol
  if (!col) return { labels: [], series: [] }
  const isDate = isDateField(col)
  const valueKeys = widget.valueKeys ?? ['__count__']
  if (valueKeys.length === 0) return { labels: [], series: [] }

  // 收集所有标签
  const labelSet = new Map<string, Map<string, number[]>>()
  for (const row of allRecords.value) {
    const raw = row[col]
    const key = isDate ? formatDateKey(raw, widget.dateGranularity)
      : raw == null || raw === '' ? '(empty)' : String(raw)
    if (!labelSet.has(key)) labelSet.set(key, new Map())
    const byKey = labelSet.get(key)!
    for (const vk of valueKeys) {
      if (!byKey.has(vk)) byKey.set(vk, [])
      if (vk === '__count__') {
        byKey.get(vk)!.push(1)
      } else {
        const fieldCol = vk.replace(/^(sum|avg|max|__count)_/, '')
        const v = parseFloat(String(row[fieldCol] ?? 0))
        byKey.get(vk)!.push(isNaN(v) ? 0 : v)
      }
    }
  }

  const allLabels = [...labelSet.keys()]
  const sortedLabels = isDate
    ? allLabels.sort((a, b) => a.localeCompare(b))
    : allLabels.sort((a, b) => {
        const sumA = [...(labelSet.get(a)?.values() ?? [])].flat().reduce((x,y)=>x+y,0)
        const sumB = [...(labelSet.get(b)?.values() ?? [])].flat().reduce((x,y)=>x+y,0)
        return sumB - sumA
      })

  const allOpts = ['__count__', ...numberFields.value.flatMap(f => ['sum','avg','max'].map(a => `${a}_${f.column_name}`))]

  const series: SeriesData[] = valueKeys.map((vk, i) => {
    const colorIdx = allOpts.indexOf(vk)
    const color = PALETTE[(colorIdx >= 0 ? colorIdx : i) % PALETTE.length]
    let name = 'Count'
    if (vk !== '__count__') {
      const match = vk.match(/^(sum|avg|max)_(.+)$/)
      if (match) {
        const [, agg, fieldCol] = match
        const f = props.fields.find(x => x.column_name === fieldCol)
        name = `${AGG_LABEL[agg] ?? agg} ${f?.title || fieldCol}`
      }
    }
    const data = sortedLabels.map(label => {
      const byKey = labelSet.get(label)
      const nums = byKey?.get(vk) ?? []
      if (vk === '__count__' || vk.startsWith('sum_')) return nums.reduce((a,b)=>a+b,0)
      if (vk.startsWith('avg_')) return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length*100)/100 : 0
      if (vk.startsWith('max_')) return nums.length ? Math.max(...nums) : 0
      return 0
    })
    return { name, color, data }
  })

  return { labels: sortedLabels, series }
}

// ── KPI ───────────────────────────────────────────────────
function computeKpi(widget: Widget): number {
  const vk = widget.kpiKey ?? '__count__'
  if (allRecords.value.length === 0) return 0
  if (vk === '__count__') return allRecords.value.length
  const col = vk.replace(/^(sum|avg|max|__count)_/, '')
  const nums = allRecords.value.map(r => parseFloat(String(r[col] ?? 0))).filter(n => !isNaN(n))
  if (vk.startsWith('sum_')) return Math.round(nums.reduce((a,b)=>a+b,0)*100)/100
  if (vk.startsWith('avg_')) return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length*100)/100 : 0
  if (vk.startsWith('max_')) return nums.length ? Math.max(...nums) : 0
  return 0
}

function formatKpi(n: number): string {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M'
  if (n >= 10_000) return (n/1_000).toFixed(1) + 'K'
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function kpiDesc(widget: Widget): string {
  const vk = widget.kpiKey ?? '__count__'
  if (vk === '__count__') return 'Total records'
  const col = vk.replace(/^(sum|avg|max|__count)_/, '')
  const f = props.fields.find(x => x.column_name === col)
  const fname = f?.title || col
  if (vk.startsWith('sum_')) return `Sum of ${fname}`
  if (vk.startsWith('avg_')) return `Avg of ${fname}`
  if (vk.startsWith('max_')) return `Max of ${fname}`
  return ''
}

function defaultTitle(widget: Widget): string {
  if (widget.type === 'kpi') return kpiDesc(widget)
  const t = WIDGET_TYPES.find(x => x.key === widget.type)?.label ?? ''
  const f = groupableFields.value.find(x => x.column_name === widget.groupByCol)
  return f ? `${t} by ${f.title || f.column_name}` : t
}

// 关闭 add menu
function onDocClick() { showAddMenu.value = false }
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  flushSave()
})
</script>

<style scoped>
.dash-wrapper { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f7f7f5; }

.toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 0 16px; height: 48px;
  border-bottom: 1px solid #e9e9e7; flex-shrink: 0; background: #fff;
}
.table-title { font-size: 15px; font-weight: 600; color: #37352f; display: flex; align-items: center; gap: 5px; }
.title-icon-emoji { font-size: 16px; line-height: 1; }
.row-count, .loading-hint { font-size: 12px; color: #a3a19d; }

.dash-body { flex: 1; overflow-y: auto; padding: 20px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; text-align: center; padding: 40px;
}
.empty-title { font-size: 15px; font-weight: 600; color: #37352f; margin: 0 0 8px; }
.empty-desc { font-size: 13px; color: #a3a19d; margin: 0 0 20px; max-width: 300px; line-height: 1.6; }
.empty-add-btn {
  position: relative;
  padding: 7px 18px; font-size: 14px; font-weight: 500;
  background: #37352f; color: #fff; border: none; border-radius: 3px;
  cursor: pointer; font-family: inherit; transition: background 0.12s;
}
.empty-add-btn:hover { background: #2f2d28; }
.empty-add-btn .add-menu { top: 44px; left: 50%; transform: translateX(-50%); }

.widget-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: start;
}
.widget-span-1 { grid-column: span 1; }
.widget-span-2 { grid-column: span 2; }

.widget-card {
  background: #fff; border: 1px solid #e9e9e7; border-radius: 6px;
  overflow: hidden; transition: box-shadow 0.15s;
}
.widget-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.widget-editing { border-color: #b3b0ab; }

.widget-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 8px;
}
.widget-title { font-size: 13px; font-weight: 600; color: #37352f; }
.widget-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.widget-card:hover .widget-actions { opacity: 1; }
.waction-btn {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: #a3a19d; padding: 2px 5px; border-radius: 3px;
  transition: color 0.12s, background 0.12s;
}
.waction-btn:hover { color: #37352f; background: rgba(55,53,47,0.06); }
.waction-btn--danger:hover { color: #eb5757; background: #fdf2f2; }

/* 配置面板 */
.widget-config {
  padding: 12px 16px 16px;
  border-top: 1px solid #f0f0ee;
  display: flex; flex-direction: column; gap: 10px;
}
.cfg-row { display: flex; align-items: center; gap: 8px; }
.cfg-row--top { align-items: flex-start; }
.cfg-label { font-size: 12px; color: #787774; width: 56px; flex-shrink: 0; padding-top: 2px; }
.cfg-input {
  flex: 1; padding: 4px 8px; font-size: 13px; color: #37352f;
  border: 1px solid #e9e9e7; border-radius: 3px; outline: none; font-family: inherit;
}
.cfg-input:focus { border-color: #b3b0ab; }
.cfg-select {
  flex: 1; padding: 4px 8px; font-size: 13px; color: #37352f;
  border: 1px solid #e9e9e7; border-radius: 3px; outline: none;
  background: #fff; cursor: pointer; font-family: inherit;
}
.cfg-select:focus { border-color: #b3b0ab; }
.cfg-hint { font-size: 12px; color: #a3a19d; }

/* 复选框列表 */
.check-list { display: flex; flex-direction: column; gap: 5px; flex: 1; }
.check-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #37352f; cursor: pointer;
  user-select: none;
}
.check-item input[type="checkbox"] { cursor: pointer; accent-color: #37352f; }
.check-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.type-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.type-pill {
  padding: 3px 10px; font-size: 12px; border: 1px solid #e9e9e7;
  border-radius: 20px; background: #fff; cursor: pointer; color: #787774;
  transition: all 0.12s; font-family: inherit;
}
.type-pill:hover { border-color: #b3b0ab; color: #37352f; }
.type-pill.active { background: #37352f; color: #fff; border-color: #37352f; }
.cfg-done-btn {
  align-self: flex-end; padding: 5px 16px; font-size: 13px;
  background: #37352f; color: #fff; border: none; border-radius: 3px;
  cursor: pointer; font-family: inherit; transition: background 0.12s;
}
.cfg-done-btn:hover { background: #2f2d28; }

/* KPI */
.kpi-body { padding: 8px 16px 24px; text-align: center; }
.kpi-number { font-size: 48px; font-weight: 700; color: #37352f; line-height: 1.1; letter-spacing: -1px; }
.kpi-desc { font-size: 12px; color: #a3a19d; margin-top: 6px; }

/* Chart */
.chart-body { height: 240px; padding: 4px 12px 12px; }
.chart-empty { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #a3a19d; }

/* Add Widget */
.add-widget-card {
  position: relative; grid-column: span 1;
  height: 80px; border: 2px dashed #e9e9e7; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; color: #a3a19d; font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}
.add-widget-card:hover { border-color: #b3b0ab; color: #37352f; }
.add-icon { font-size: 20px; line-height: 1; }
.add-menu {
  position: absolute; top: 90px; left: 0; width: 240px; z-index: 100;
  background: #fff; border: 1px solid #e9e9e7; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1); padding: 4px;
  display: flex; flex-direction: column; gap: 2px;
}
.add-menu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border: none; background: none;
  cursor: pointer; text-align: left; border-radius: 4px;
  font-family: inherit; transition: background 0.1s;
}
.add-menu-item:hover { background: rgba(55,53,47,0.06); }
.add-menu-icon { font-size: 16px; width: 24px; text-align: center; }
.add-menu-name { font-size: 13px; color: #37352f; font-weight: 500; }
.add-menu-desc { font-size: 11px; color: #a3a19d; margin-top: 1px; }

/* 视图切换 */
.view-switcher { display: flex; gap: 2px; }
.view-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 3px; background: none; cursor: pointer; color: #787774;
  transition: all 0.12s;
}
.view-btn:hover { background: rgba(55,53,47,0.06); color: #37352f; }
.view-btn--active { background: rgba(55,53,47,0.08); color: #37352f; border-color: #e9e9e7; }
</style>
