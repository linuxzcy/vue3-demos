<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  InboxOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons-vue'
import {
  buildTableColumns,
  parseExcelFile,
  rowsToTableData,
  type WorkbookParseResult,
} from '../utils/excelParse'

const loading = ref(false)
const fillMerged = ref(true)
const result = ref<WorkbookParseResult | null>(null)
const activeSheet = ref('')
const previewMode = ref<'table' | 'json' | 'merges'>('table')

const currentSheet = computed(() =>
  result.value?.sheets.find((s) => s.name === activeSheet.value) ?? null,
)

const columns = computed(() =>
  currentSheet.value ? buildTableColumns(currentSheet.value.rows) : [],
)

const tableData = computed(() =>
  currentSheet.value ? rowsToTableData(currentSheet.value.rows, true) : [],
)

const jsonPreview = computed(() => {
  if (!currentSheet.value) return ''
  return JSON.stringify(currentSheet.value.json.slice(0, 50), null, 2)
})

const mergeColumns = [
  { title: '范围', dataIndex: 'range', key: 'range', width: 120 },
  { title: '起始(行,列)', key: 'start' },
  { title: '结束(行,列)', key: 'end' },
  { title: '主单元格值', dataIndex: 'value', key: 'value', ellipsis: true },
]

async function handleFile(file: File) {
  const okExt = /\.(xlsx|xls|csv)$/i.test(file.name)
  if (!okExt) {
    message.error('请上传 .xlsx / .xls / .csv 文件')
    return false
  }

  loading.value = true
  try {
    const parsed = await parseExcelFile(file, {
      fillMergedCells: fillMerged.value,
    })
    result.value = parsed
    activeSheet.value = parsed.sheetNames[0] || ''
    previewMode.value = 'table'
    message.success(
      `解析成功：${parsed.sheetNames.length} 个 Sheet，共 ${parsed.sheets.reduce((n, s) => n + s.rowCount, 0)} 行`,
    )
  } catch (e) {
    console.error(e)
    message.error(e instanceof Error ? e.message : '解析失败')
    result.value = null
  } finally {
    loading.value = false
  }
  return false
}

function beforeUpload(file: File) {
  handleFile(file)
  return false
}

function clearAll() {
  result.value = null
  activeSheet.value = ''
}
</script>

<template>
  <div class="excel-page">
    <a-row :gutter="16">
      <a-col :xs="24" :lg="8">
        <a-card title="上传 Excel 解析" size="small">
          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 12px"
            message="前端解析（SheetJS / xlsx）"
            description="支持多 Sheet、合并单元格。合并区默认把左上角值填充到整个区域，便于业务读取。"
          />

          <a-form layout="vertical" size="small">
            <a-form-item label="合并单元格处理">
              <a-switch
                v-model:checked="fillMerged"
                checked-children="填充主值"
                un-checked-children="仅记录范围"
              />
            </a-form-item>
          </a-form>

          <a-upload-dragger
            accept=".xlsx,.xls,.csv"
            :multiple="false"
            :show-upload-list="false"
            :before-upload="beforeUpload"
            :disabled="loading"
          >
            <p class="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p class="ant-upload-text">点击或拖拽 Excel 到此处</p>
            <p class="ant-upload-hint">.xlsx / .xls / .csv，解析在浏览器本地完成</p>
          </a-upload-dragger>

          <a-spin :spinning="loading" tip="解析中...">
            <div v-if="result" class="summary">
              <a-descriptions size="small" :column="1" bordered>
                <a-descriptions-item label="文件">
                  <FileExcelOutlined /> {{ result.fileName }}
                </a-descriptions-item>
                <a-descriptions-item label="Sheet 数量">
                  {{ result.sheetNames.length }}
                </a-descriptions-item>
                <a-descriptions-item label="Sheet 列表">
                  <a-tag v-for="n in result.sheetNames" :key="n" color="blue">{{ n }}</a-tag>
                </a-descriptions-item>
              </a-descriptions>
              <a-button block danger style="margin-top: 12px" @click="clearAll">清空</a-button>
            </div>
          </a-spin>
        </a-card>

        <a-card title="能力说明" size="small" class="mt">
          <a-descriptions :column="1" size="small" bordered>
            <a-descriptions-item label="多 Sheet">
              <CheckCircleOutlined style="color: #52c41a" /> 全部解析，可切换查看
            </a-descriptions-item>
            <a-descriptions-item label="合并单元格">
              <CheckCircleOutlined style="color: #52c41a" /> 可读 !merges，并可填充主值
            </a-descriptions-item>
            <a-descriptions-item label="输出">
              二维表 rows + 对象数组 json + merges 元数据
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="16">
        <a-card size="small" title="解析结果">
          <a-empty v-if="!result" description="请先上传 Excel" />

          <template v-else>
            <div class="toolbar">
              <a-radio-group v-model:value="activeSheet" button-style="solid" size="small">
                <a-radio-button v-for="s in result.sheets" :key="s.name" :value="s.name">
                  {{ s.name }}
                  <a-badge
                    v-if="s.merges.length"
                    :count="s.merges.length"
                    :number-style="{ backgroundColor: '#fa8c16' }"
                    title="合并单元格数"
                  />
                </a-radio-button>
              </a-radio-group>

              <a-segmented
                v-model:value="previewMode"
                size="small"
                :options="[
                  { label: '表格预览', value: 'table' },
                  { label: 'JSON', value: 'json' },
                  { label: '合并信息', value: 'merges' },
                ]"
              />
            </div>

            <div v-if="currentSheet" class="sheet-meta">
              范围 {{ currentSheet.ref || '-' }} ·
              {{ currentSheet.rowCount }} 行 × {{ currentSheet.colCount }} 列 ·
              合并区 {{ currentSheet.merges.length }} 个
            </div>

            <div v-if="previewMode === 'table' && currentSheet">
              <a-table
                size="small"
                :columns="columns"
                :data-source="tableData"
                :scroll="{ x: true, y: 480 }"
                :pagination="{ pageSize: 20, showSizeChanger: true }"
                bordered
              />
            </div>

            <div v-else-if="previewMode === 'json'">
              <pre class="code">{{ jsonPreview }}</pre>
              <p class="hint">仅预览前 50 条对象（首行作表头的 sheet_to_json）</p>
            </div>

            <div v-else-if="previewMode === 'merges' && currentSheet">
              <a-empty v-if="!currentSheet.merges.length" description="当前 Sheet 无合并单元格" />
              <a-table
                v-else
                size="small"
                :pagination="false"
                :data-source="currentSheet.merges.map((m, i) => ({ ...m, key: i }))"
                :columns="mergeColumns"
                bordered
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'start'">
                    {{ record.s.r }}, {{ record.s.c }}
                  </template>
                  <template v-else-if="column.key === 'end'">
                    {{ record.e.r }}, {{ record.e.c }}
                  </template>
                </template>
              </a-table>
            </div>
          </template>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.excel-page {
  padding: 16px 0;
}

.mt {
  margin-top: 12px;
}

.summary {
  margin-top: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sheet-meta {
  margin-bottom: 8px;
  font-size: 12px;
  color: #888;
}

.code {
  max-height: 520px;
  overflow: auto;
  background: #f6f8fa;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  margin: 0;
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}
</style>
