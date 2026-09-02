/// <reference lib="webworker" />
import SparkMD5 from 'spark-md5'

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (ev: MessageEvent<{ file: File; chunkSize: number }>) => {
  const { file, chunkSize } = ev.data
  const spark = new SparkMD5.ArrayBuffer()
  const total = Math.ceil(file.size / chunkSize) || 1

  try {
    for (let i = 0; i < total; i++) {
      const start = i * chunkSize
      const end = Math.min(file.size, start + chunkSize)
      const buf = await file.slice(start, end).arrayBuffer()
      spark.append(buf)
      ctx.postMessage({
        type: 'progress',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      })
    }
    ctx.postMessage({ type: 'done', hash: spark.end() })
  } catch (e) {
    ctx.postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    })
  }
}

export {}
