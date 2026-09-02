/**
 * 管道并发：最多 concurrency 个在飞请求，任意一个结束立刻补上下一个
 */
export async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<T[]> {
  const total = tasks.length
  const results: T[] = new Array(total)
  let nextIndex = 0
  let doneCount = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= total) return
      results[i] = await tasks[i]()
      doneCount++
      onProgress?.(doneCount, total)
    }
  }

  const n = Math.min(concurrency, Math.max(1, total))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

export function calcFileHash(
  file: File,
  chunkSize: number,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/md5.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data
      if (data.type === 'progress') {
        onProgress?.(data.percent)
      } else if (data.type === 'done') {
        worker.terminate()
        resolve(data.hash as string)
      } else if (data.type === 'error') {
        worker.terminate()
        reject(new Error(data.message))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }

    worker.postMessage({ file, chunkSize })
  })
}

export interface ChunkCheckResult {
  uploaded: boolean
  instant: boolean
  uploadedChunks: number[]
  url: string | null
}

export interface UploadOptions {
  chunkSize?: number
  concurrency?: number
  onHashProgress?: (percent: number) => void
  onUploadProgress?: (percent: number, uploaded: number, total: number) => void
  signal?: AbortSignal
}

export interface UploadResult {
  hash: string
  url: string
  instant: boolean
  skippedChunks: number
  uploadedChunks: number
}

const DEFAULT_CHUNK = 2 * 1024 * 1024 // 2MB
const DEFAULT_CONCURRENCY = 6

export async function uploadLargeFile(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const totalChunks = Math.ceil(file.size / chunkSize) || 1

  const hash = await calcFileHash(file, chunkSize, options.onHashProgress)

  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const checkRes = await fetch('/api/chunk/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hash,
      fileName: file.name,
      fileSize: file.size,
      chunkSize,
      totalChunks,
    }),
    signal: options.signal,
  })
  const check = (await checkRes.json()) as ChunkCheckResult
  if (!checkRes.ok) throw new Error((check as unknown as { error: string }).error || 'check 失败')

  // 秒传
  if (check.uploaded && check.url) {
    options.onUploadProgress?.(100, totalChunks, totalChunks)
    return {
      hash,
      url: check.url,
      instant: true,
      skippedChunks: totalChunks,
      uploadedChunks: 0,
    }
  }

  const uploadedSet = new Set(check.uploadedChunks || [])
  const pending = Array.from({ length: totalChunks }, (_, i) => i).filter(
    (i) => !uploadedSet.has(i),
  )

  let finished = uploadedSet.size
  options.onUploadProgress?.(
    Math.round((finished / totalChunks) * 100),
    finished,
    totalChunks,
  )

  const tasks = pending.map((index) => async () => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const start = index * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const blob = file.slice(start, end)

    const form = new FormData()
    form.append('hash', hash)
    form.append('index', String(index))
    form.append('chunk', blob, `${file.name}.part${index}`)

    const res = await fetch('/api/chunk/upload', {
      method: 'POST',
      body: form,
      signal: options.signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `分片 ${index} 上传失败`)

    finished++
    options.onUploadProgress?.(
      Math.round((finished / totalChunks) * 100),
      finished,
      totalChunks,
    )
    return index
  })

  await runPool(tasks, concurrency)

  const mergeRes = await fetch('/api/chunk/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hash,
      fileName: file.name,
      totalChunks,
    }),
    signal: options.signal,
  })
  const merge = await mergeRes.json()
  if (!mergeRes.ok) throw new Error(merge.error || '合并失败')

  return {
    hash,
    url: merge.url as string,
    instant: false,
    skippedChunks: uploadedSet.size,
    uploadedChunks: pending.length,
  }
}
