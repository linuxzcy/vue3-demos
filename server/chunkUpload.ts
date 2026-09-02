import { Router } from 'express'
import multer from 'multer'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK_ROOT = join(ROOT, 'uploads', 'chunks')
const FILE_ROOT = join(ROOT, 'uploads', 'files')
const META_ROOT = join(ROOT, 'uploads', 'meta')

mkdirSync(CHUNK_ROOT, { recursive: true })
mkdirSync(FILE_ROOT, { recursive: true })
mkdirSync(META_ROOT, { recursive: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 单片上限略大于前端 5MB
})

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function chunkDir(hash: string) {
  return join(CHUNK_ROOT, hash)
}

function metaPath(hash: string) {
  return join(META_ROOT, `${hash}.json`)
}

function finalPath(hash: string, fileName: string) {
  const ext = extname(fileName)
  return join(FILE_ROOT, `${hash}${ext || ''}`)
}

function publicUrl(hash: string, fileName: string) {
  const ext = extname(fileName)
  return `/uploads/files/${hash}${ext || ''}`
}

function listUploadedChunks(hash: string): number[] {
  const dir = chunkDir(hash)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b)
}

function readMeta(hash: string) {
  const p = metaPath(hash)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as {
      hash: string
      fileName: string
      fileSize: number
      chunkSize: number
      totalChunks: number
      url?: string
      done?: boolean
    }
  } catch {
    return null
  }
}

function writeMeta(data: Record<string, unknown>) {
  writeFileSync(metaPath(String(data.hash)), JSON.stringify(data, null, 2))
}

export function createChunkUploadRouter() {
  const router = Router()

  /** 秒传 / 断点：查询已上传分片 */
  router.post('/check', (req, res) => {
    const { hash, fileName, fileSize, chunkSize, totalChunks } = req.body as {
      hash?: string
      fileName?: string
      fileSize?: number
      chunkSize?: number
      totalChunks?: number
    }

    if (!hash || !fileName || !fileSize || !chunkSize || !totalChunks) {
      res.status(400).json({ error: '缺少 hash/fileName/fileSize/chunkSize/totalChunks' })
      return
    }

    const final = finalPath(hash, fileName)
    const meta = readMeta(hash)

    // 秒传：完整文件已存在
    if (existsSync(final) && statSync(final).size === Number(fileSize)) {
      const url = publicUrl(hash, fileName)
      writeMeta({
        hash,
        fileName: safeName(fileName),
        fileSize,
        chunkSize,
        totalChunks,
        url,
        done: true,
      })
      res.json({
        uploaded: true,
        instant: true,
        url,
        uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i),
      })
      return
    }

    writeMeta({
      hash,
      fileName: safeName(fileName),
      fileSize,
      chunkSize,
      totalChunks,
      done: false,
      ...(meta || {}),
    })

    const uploadedChunks = listUploadedChunks(hash)
    res.json({
      uploaded: false,
      instant: false,
      uploadedChunks,
      url: null,
    })
  })

  /** 上传单个分片 */
  router.post('/upload', upload.single('chunk'), (req, res) => {
    const hash = String(req.body.hash || '')
    const index = Number(req.body.index)
    if (!hash || !Number.isInteger(index) || index < 0 || !req.file) {
      res.status(400).json({ error: '缺少 hash/index/chunk' })
      return
    }

    const dir = chunkDir(hash)
    mkdirSync(dir, { recursive: true })
    const target = join(dir, String(index))
    writeFileSync(target, req.file.buffer)

    res.json({
      ok: true,
      index,
      size: req.file.size,
      uploadedChunks: listUploadedChunks(hash),
    })
  })

  /** 合并分片 */
  router.post('/merge', async (req, res) => {
    const { hash, fileName, totalChunks } = req.body as {
      hash?: string
      fileName?: string
      totalChunks?: number
    }

    if (!hash || !fileName || !totalChunks) {
      res.status(400).json({ error: '缺少 hash/fileName/totalChunks' })
      return
    }

    const dir = chunkDir(hash)
    if (!existsSync(dir)) {
      res.status(400).json({ error: '分片目录不存在' })
      return
    }

    const uploaded = listUploadedChunks(hash)
    if (uploaded.length < totalChunks) {
      res.status(400).json({
        error: '分片不完整',
        uploadedChunks: uploaded,
        totalChunks,
      })
      return
    }

    const final = finalPath(hash, fileName)
    const tmp = `${final}.merging`
    mkdirSync(FILE_ROOT, { recursive: true })

    try {
      const ws = createWriteStream(tmp)
      for (let i = 0; i < totalChunks; i++) {
        const part = join(dir, String(i))
        if (!existsSync(part)) {
          ws.destroy()
          res.status(400).json({ error: `缺少分片 ${i}` })
          return
        }
        await new Promise<void>((resolve, reject) => {
          const rs = createReadStream(part)
          rs.on('error', reject)
          rs.on('end', resolve)
          rs.pipe(ws, { end: false })
        })
      }
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve())
        ws.on('error', reject)
      })

      renameSync(tmp, final)
      const url = publicUrl(hash, fileName)
      const meta = readMeta(hash)
      writeMeta({
        ...(meta || {}),
        hash,
        fileName: safeName(fileName),
        totalChunks,
        url,
        done: true,
      })

      res.json({ ok: true, url, size: statSync(final).size })
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : '合并失败',
      })
    }
  })

  return router
}
