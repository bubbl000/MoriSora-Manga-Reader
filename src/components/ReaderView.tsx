import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'
import * as databaseService from '../services/databaseService'
import { RxCross2 } from 'react-icons/rx'

/**
 * LRU 缓存实现
 * 支持容量限制，超出时自动淘汰最久未使用的条目
 * 淘汰时自动调用 onEvict 回调释放 Blob URL
 */
class LRUCache<K, V> {
  private cache: Map<K, V>
  private readonly maxSize: number
  private readonly onEvict?: (value: V) => void

  constructor(maxSize: number, onEvict?: (value: V) => void) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.onEvict = onEvict
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // 访问时将键移至最新位置
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // 如果键已存在，先删除再插入以更新位置
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    this.cache.set(key, value)
    // 超出容量时淘汰最旧条目
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        const oldestValue = this.cache.get(oldestKey)
        if (oldestValue) this.onEvict?.(oldestValue)
        this.cache.delete(oldestKey)
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    this.cache.forEach(value => this.onEvict?.(value))
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  keys(): K[] {
    return Array.from(this.cache.keys())
  }
}

/**
 * 图片压缩工具
 * 使用 Canvas 对大尺寸图片进行压缩，减少内存占用和渲染压力
 * 配置：maxWidth 1920, maxHeight 2880, jpegQuality 0.85
 * 图片尺寸小于阈值时跳过压缩，避免不必要的处理开销
 */
const COMPRESS_CONFIG = {
  maxWidth: 1920,
  maxHeight: 2880,
  jpegQuality: 0.85,
}

/**
 * 判断是否需要压缩
 * 尺寸小于阈值时不压缩，直接返回原始 Blob
 */
function needsCompression(width: number, height: number): boolean {
  return width > COMPRESS_CONFIG.maxWidth || height > COMPRESS_CONFIG.maxHeight
}

/**
 * 计算等比缩放后的尺寸
 * 保持宽高比，确保不超过最大宽高限制
 */
function calculateScaledSize(
  originalWidth: number,
  originalHeight: number,
): { width: number; height: number } {
  const { maxWidth, maxHeight } = COMPRESS_CONFIG
  let width = originalWidth
  let height = originalHeight

  if (width > maxWidth) {
    const ratio = maxWidth / width
    width = maxWidth
    height = Math.floor(height * ratio)
  }

  if (height > maxHeight) {
    const ratio = maxHeight / height
    height = maxHeight
    width = Math.floor(width * ratio)
  }

  return { width, height }
}

/**
 * 压缩图片并返回压缩后的 Blob
 * 流程：Uint8Array -> Blob -> ImageBitmap -> Canvas 绘制 -> toBlob(JPEG)
 * 使用 createImageBitmap 避免创建 DOM Image 元素，性能更好
 * 尺寸小于阈值时跳过压缩，直接返回原始 Blob
 */
async function compressImage(uint8Array: Uint8Array): Promise<Blob> {
  // 创建干净的 ArrayBuffer 副本，避免共享 buffer 的偏移问题
  const arrayBuffer = uint8Array.buffer.slice(
    uint8Array.byteOffset,
    uint8Array.byteOffset + uint8Array.byteLength,
  )

  // 通过 Blob 创建 ImageBitmap（TypeScript 要求 ImageBitmapSource 为 Blob/ImageData 等）
  const sourceBlob = new Blob([arrayBuffer])
  const bitmap = await createImageBitmap(sourceBlob)
  const { width, height } = bitmap

  // 尺寸未超限，直接转 Blob 避免不必要的压缩
  if (!needsCompression(width, height)) {
    bitmap.close()
    const blob = new Blob([arrayBuffer])
    return blob
  }

  // 计算缩放后尺寸
  const { width: scaledWidth, height: scaledHeight } = calculateScaledSize(width, height)

  // 使用 Canvas 绘制缩放后的图像
  const canvas = document.createElement('canvas')
  canvas.width = scaledWidth
  canvas.height = scaledHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('无法创建 Canvas 上下文')
  }

  ctx.drawImage(bitmap, 0, 0, scaledWidth, scaledHeight)
  bitmap.close()

  // 导出为 JPEG 格式
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', COMPRESS_CONFIG.jpegQuality)
  })

  if (!blob) {
    throw new Error('图片压缩失败：Canvas toBlob 返回空值')
  }

  return blob
}

let pdfWorkerInitialized = false

const initPdfWorker = async () => {
  if (!pdfWorkerInitialized) {
    const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
    pdfWorkerInitialized = true
  }
  return pdfjsLib
}

type ReadMode = 'single' | 'double' | 'scroll'

interface ArchivePageInfo {
  page_number: number
  entry_path: string
  file_name: string
}

function ReaderView() {
  const [currentPage, setCurrentPage] = useState(1)
  const [mangaTitle, setMangaTitle] = useState('')
  const [mangaPath, setMangaPath] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [archivePages, setArchivePages] = useState<ArchivePageInfo[]>([])
  const [folderImages, setFolderImages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentImageSrc, setCurrentImageSrc] = useState('')
  const [zoomMode, setZoomMode] = useState(false)
  const [readMode, setReadMode] = useState<ReadMode>('single')
  const [doublePageRight, setDoublePageRight] = useState('')
  const [scrollImages, setScrollImages] = useState<{ path: string; url: string }[]>([])
  /**
   * Scroll 模式虚拟滚动实现
   * 只渲染可见区域 + 缓冲区的页面，减少 DOM 节点数量
   * 使用估算高度 + padding 保持正确的滚动位置
   */
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const estimatedPageHeight = useRef(800) // 估算每页高度（px）
  const VISIBLE_BUFFER = 3 // 上下各多渲染 3 页作为缓冲区
  // Scroll 模式按需加载：记录已加载的页码集合，避免重复加载
  const loadedScrollPagesRef = useRef<Set<number>>(new Set())
  // 正在加载中的页码集合，避免并发重复请求
  const loadingScrollPagesRef = useRef<Set<number>>(new Set())
  const [autoPage, setAutoPage] = useState(false)
  const [autoPageInterval, setAutoPageInterval] = useState(3000)
  const autoPageRef = useRef<number | null>(null)
  const [comicId, setComicId] = useState<number | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const [zoomLevelState, setZoomLevelState] = useState(100)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const initialLoadRef = useRef(false)
  const createdBlobUrlsRef = useRef<Set<string>>(new Set())
  // 用于追踪最新的翻页请求，防止竞态条件导致图片与页码不匹配
  const pageRequestSequenceRef = useRef(0)
  // PDF 文档缓存，避免每次翻页都重新加载和解析整个 PDF
  const pdfDocumentRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pdfFilePathRef = useRef<string>('')

  const MAX_CACHE_SIZE = 50

  const revokeBlobUrl = useCallback((url: string) => {
    if (url && createdBlobUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      createdBlobUrlsRef.current.delete(url)
    }
  }, [])

  const revokeAllBlobUrls = useCallback(() => {
    createdBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    createdBlobUrlsRef.current.clear()
  }, [])

  const addBlobUrl = useCallback((url: string) => {
    createdBlobUrlsRef.current.add(url)
  }, [])

  // 在 revokeBlobUrl 定义之后初始化 LRU 缓存
  // 使用 useMemo 确保缓存实例在组件生命周期内保持不变
  const imageCache = useRef(new LRUCache<number, string>(MAX_CACHE_SIZE, (url: string) => {
    if (url && createdBlobUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      createdBlobUrlsRef.current.delete(url)
    }
  })).current
  const folderImageCache = useRef(new LRUCache<string, string>(MAX_CACHE_SIZE, (url: string) => {
    if (url && createdBlobUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      createdBlobUrlsRef.current.delete(url)
    }
  })).current

  const totalPages = sourceType === 'archive' || sourceType === 'pdf' ? archivePages.length : folderImages.length

  const loadFolderImage = useCallback(async (filePath: string): Promise<string> => {
    const cachedUrl = folderImageCache.get(filePath)
    if (cachedUrl) {
      return cachedUrl
    }
    try {
      const bytes = await invoke<number[]>('read_image_bytes', { filePath })
      const uint8Array = new Uint8Array(bytes)
      // 使用压缩工具处理图片，大尺寸图片会自动压缩到 maxWidth/maxHeight 以内
      const blob = await compressImage(uint8Array)
      const url = URL.createObjectURL(blob)
      addBlobUrl(url)
      folderImageCache.set(filePath, url)
      return url
    } catch (error) {
      console.error('读取图片文件失败:', error)
      setErrorToast('读取图片文件失败')
      return ''
    }
  }, [addBlobUrl, folderImageCache])

  const loadArchivePage = useCallback(async (pageInfo: ArchivePageInfo) => {
    const cachedUrl = imageCache.get(pageInfo.page_number)
    if (cachedUrl) {
      return cachedUrl
    }
    try {
      const bytes = await invoke<number[]>('get_archive_image_bytes', {
        path: mangaPath,
        entryPath: pageInfo.entry_path,
      })
      const uint8Array = new Uint8Array(bytes)
      // 使用压缩工具处理图片，大尺寸图片会自动压缩到 maxWidth/maxHeight 以内
      const blob = await compressImage(uint8Array)
      const url = URL.createObjectURL(blob)
      addBlobUrl(url)
      imageCache.set(pageInfo.page_number, url)
      return url
    } catch (error) {
      console.error('加载压缩包页面失败:', error)
      setErrorToast('加载压缩包页面失败')
      return ''
    }
  }, [mangaPath, addBlobUrl, imageCache])

  const loadPdfPage = useCallback(async (pageNumber: number): Promise<string> => {
    try {
      const cachedUrl = imageCache.get(pageNumber)
      if (cachedUrl) {
        return cachedUrl
      }
      const pdfjsLibInstance = await initPdfWorker()

      // 如果文件路径变化或文档未加载，则重新加载 PDF
      if (!pdfDocumentRef.current || pdfFilePathRef.current !== mangaPath) {
        // 清理旧文档
        if (pdfDocumentRef.current) {
          try {
            await pdfDocumentRef.current.destroy()
          } catch {}
          pdfDocumentRef.current = null
        }

        const bytes = await invoke<number[]>('read_image_bytes', { filePath: mangaPath })
        const uint8Array = new Uint8Array(bytes)
        const loadingTask = pdfjsLibInstance.getDocument({ data: uint8Array })
        pdfDocumentRef.current = await loadingTask.promise
        pdfFilePathRef.current = mangaPath
      }

      const pdf = pdfDocumentRef.current
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建Canvas上下文')
      const renderTask = page.render({ canvasContext: context, viewport, canvas })
      await renderTask.promise
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      })
      if (!blob) throw new Error('PDF页面转Blob失败')
      // 使用 createObjectURL 替代 FileReader.readAsDataURL，避免 base64 33% 体积增加
      const url = URL.createObjectURL(blob)
      addBlobUrl(url)
      imageCache.set(pageNumber, url)
      // 清理单页渲染资源，但不销毁文档
      try { page.cleanup() } catch {}
      return url
    } catch (error) {
      console.error('加载PDF页面失败:', error)
      setErrorToast('加载PDF页面失败')
      return ''
    }
  }, [mangaPath, addBlobUrl, imageCache])

  const getPageUrl = useCallback(async (pageIndex: number): Promise<string> => {
    if (sourceType === 'pdf') return await loadPdfPage(pageIndex)
    if (sourceType === 'archive' && archivePages.length > 0) return await loadArchivePage(archivePages[pageIndex - 1])
    const imgPath = folderImages[pageIndex - 1]
    if (imgPath) return await loadFolderImage(imgPath)
    return ''
  }, [sourceType, archivePages, folderImages, loadPdfPage, loadArchivePage, loadFolderImage])

  const loadImages = useCallback(async (path: string, type: string) => {
    setIsLoading(true)
    try {
      if (type === 'archive') {
        const pages = await invoke<ArchivePageInfo[]>('get_archive_images', { path })
        setArchivePages(pages)
        setFolderImages([])
        if (pages.length > 0) {
          const bytes = await invoke<number[]>('get_archive_image_bytes', {
            path,
            entryPath: pages[0].entry_path,
          })
          const uint8Array = new Uint8Array(bytes)
          const blob = await compressImage(uint8Array)
          const url = URL.createObjectURL(blob)
          addBlobUrl(url)
          if (url) setCurrentImageSrc(url)
        }
      } else if (type === 'pdf') {
        const pages = await invoke<ArchivePageInfo[]>('get_archive_images', { path })
        setArchivePages(pages)
        setFolderImages([])
        if (pages.length > 0) {
          const url = await loadPdfPage(pages[0].page_number)
          if (url) setCurrentImageSrc(url)
        }
      } else {
        const images = await invoke<string[]>('get_folder_images', { folder: path })
        setFolderImages(images)
        setArchivePages([])
        if (images.length > 0) {
          const url = await loadFolderImage(images[0])
          if (url) setCurrentImageSrc(url)
        }
      }
    } catch (error) {
      console.error('加载图片失败:', error)
      setErrorToast('加载图片失败')
    } finally {
      setIsLoading(false)
    }
  }, [loadPdfPage, loadFolderImage, addBlobUrl])

  const restoreReadingProgress = useCallback(async (path: string) => {
    try {
      // 使用按路径查询，避免加载全部漫画元数据
      const comic = await databaseService.getComicByPath(path)
      if (comic && comic.id) {
        setComicId(comic.id)
        const progress = await databaseService.getReadingProgress(comic.id)
        if (progress && progress.current_page > 1) return progress.current_page
      }
    } catch (error) {
      console.error('恢复阅读进度失败:', error)
    }
    return 1
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    let id = ''
    let title = ''
    let path = ''
    let type = 'folder'
    if (hash.startsWith('#reader#')) {
      const parts = hash.replace('#reader#', '').split('#')
      id = parts[0] || ''
      title = parts[1] ? decodeURIComponent(parts[1]) : ''
      path = parts[2] ? decodeURIComponent(parts[2]) : ''
      type = parts[3] || 'folder'
    }
    if (title) setMangaTitle(title)
    else setMangaTitle('未知漫画')
    if (path && !initialLoadRef.current) {
      initialLoadRef.current = true
      setMangaPath(path)
      setSourceType(type)
      loadImages(path, type).then(async () => {
        const savedPage = await restoreReadingProgress(path)
        if (savedPage > 1) {
          setCurrentPage(savedPage)
          const url = await getPageUrl(savedPage)
          if (url) setCurrentImageSrc(url)
        }
      })
    }
  }, [])

  useEffect(() => {
    const saveProgress = async () => {
      if (!comicId || totalPages === 0) return
      try { await databaseService.saveReadingProgress(comicId, currentPage, totalPages) }
      catch (error) { console.error('保存阅读进度失败:', error) }
    }
    const timer = setTimeout(saveProgress, 1000)
    return () => clearTimeout(timer)
  }, [currentPage, comicId, totalPages])

  /**
   * Scroll 模式按需加载：加载指定范围的页码
   * 不一次性加载全部图片，而是根据可视区域动态加载
   */
  const loadScrollPageRange = useCallback(async (startPage: number, endPage: number) => {
    const newImages: { path: string; url: string }[] = []
    for (let page = startPage; page <= endPage; page++) {
      // 跳过已加载或正在加载的页
      if (loadedScrollPagesRef.current.has(page) || loadingScrollPagesRef.current.has(page)) continue
      
      loadingScrollPagesRef.current.add(page)
      try {
        const url = await getPageUrl(page)
        if (url) {
          newImages.push({ path: String(page), url })
          loadedScrollPagesRef.current.add(page)
        }
      } finally {
        loadingScrollPagesRef.current.delete(page)
      }
    }
    if (newImages.length > 0) {
      setScrollImages(prev => {
        // 合并新图片到已有列表，按页码排序
        const merged = [...prev, ...newImages].sort((a, b) => Number(a.path) - Number(b.path))
        return merged
      })
    }
  }, [getPageUrl])

  /**
   * Scroll 模式初始加载：只加载前 5 张 + 当前页附近
   */
  const initScrollImages = useCallback(async () => {
    loadedScrollPagesRef.current.clear()
    loadingScrollPagesRef.current.clear()
    setScrollImages([])
    
    const total = totalPages
    if (total === 0) return
    
    // 从第 1 页开始加载前 5 张
    const preloadCount = Math.min(5, total)
    await loadScrollPageRange(1, preloadCount)
  }, [totalPages, loadScrollPageRange])

  /**
   * Scroll 模式虚拟滚动 + 按需加载
   * 计算可见区域 + 缓冲区的页面范围，动态加载和渲染
   */
  const handleScrollUpdate = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || totalPages === 0) return

    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    setScrollTop(scrollTop)
    setContainerHeight(containerHeight)
    
    // 计算可见的起始和结束页码
    const startPage = Math.max(1, Math.floor(scrollTop / estimatedPageHeight.current) - VISIBLE_BUFFER)
    const visiblePages = Math.ceil(containerHeight / estimatedPageHeight.current)
    const endPage = Math.min(totalPages, startPage + visiblePages + VISIBLE_BUFFER * 2)
    
    loadScrollPageRange(startPage, endPage)
  }, [totalPages, loadScrollPageRange])

  useEffect(() => {
    return () => {
      revokeAllBlobUrls()
      // 组件卸载时清理 PDF 文档
      if (pdfDocumentRef.current) {
        try { pdfDocumentRef.current.destroy() } catch {}
        pdfDocumentRef.current = null
      }
    }
  }, [revokeAllBlobUrls])

  useEffect(() => {
    if (readMode === 'scroll' && (archivePages.length > 0 || folderImages.length > 0)) {
      // Scroll 模式：按需加载，不一次性加载全部
      initScrollImages()
    } else if (readMode !== 'scroll' && scrollImages.length > 0) {
      // 退出 scroll 模式时清理已加载的图片 URL
      scrollImages.forEach(img => revokeBlobUrl(img.url))
      loadedScrollPagesRef.current.clear()
      loadingScrollPagesRef.current.clear()
      setScrollImages([])
    }
    
    // 模式切换时清空 LRU 缓存，避免不同模式间的缓存污染
    if (readMode === 'scroll') {
      // Scroll 模式使用独立缓存策略，清空单页/双页模式的缓存
      imageCache.clear()
      folderImageCache.clear()
    }
  }, [readMode, archivePages.length, folderImages.length, initScrollImages, scrollImages, revokeBlobUrl, imageCache, folderImageCache])

  useEffect(() => {
    if (readMode === 'scroll' && scrollImages.length > 0 && currentPage > 1) {
      const imageIndex = currentPage - 1
      if (imageIndex >= 0 && imageIndex < scrollImages.length) {
        const container = scrollContainerRef.current
        if (container) {
          const targetImage = container.querySelector(`img[data-page-index="${imageIndex}"]`)
          if (targetImage) {
            targetImage.scrollIntoView({ behavior: 'instant', block: 'start' })
          }
        }
      }
    }
  }, [readMode, scrollImages.length, currentPage])

  // Scroll 模式下监听滚动事件，触发虚拟滚动更新
  useEffect(() => {
    if (readMode !== 'scroll') return
    
    const container = scrollContainerRef.current
    if (!container) return
    
    container.addEventListener('scroll', handleScrollUpdate, { passive: true })
    // 初始化时立即执行一次
    handleScrollUpdate()
    return () => container.removeEventListener('scroll', handleScrollUpdate)
  }, [readMode, handleScrollUpdate])

  const handleClose = async () => {
    try {
      revokeAllBlobUrls()
      const currentWindow = getCurrentWindow()
      await currentWindow.close()
    } catch (error) {
      console.error('关闭窗口失败:', error)
    }
  }

  const switchToPage = useCallback(async (page: number) => {
    const sequence = ++pageRequestSequenceRef.current
    const url = await getPageUrl(page)
    if (sequence === pageRequestSequenceRef.current && url) {
      setCurrentImageSrc(url)
    }
  }, [getPageUrl])

  const loadDoublePage = useCallback(async (page: number) => {
    const sequence = ++pageRequestSequenceRef.current
    const leftUrl = await getPageUrl(page)
    if (sequence !== pageRequestSequenceRef.current) return
    setCurrentImageSrc(leftUrl)
    if (page + 1 <= totalPages) {
      const rightUrl = await getPageUrl(page + 1)
      if (sequence === pageRequestSequenceRef.current) {
        setDoublePageRight(rightUrl)
      }
    } else {
      setDoublePageRight('')
    }
  }, [getPageUrl, totalPages])

  const handleRestoreProgress = useCallback(async () => {
    const savedPage = await restoreReadingProgress(mangaPath)
    if (savedPage > 1) {
      setCurrentPage(savedPage)
    }
  }, [mangaPath, restoreReadingProgress])

  const handleDoublePrev = useCallback(() => {
    if (autoPage) setAutoPage(false)
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.max(1, currentPage - step)
    setCurrentPage(newPage)
  }, [currentPage, readMode, autoPage])

  const handleDoubleNext = useCallback(() => {
    if (autoPage) setAutoPage(false)
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.min(totalPages, currentPage + step)
    setCurrentPage(newPage)
  }, [currentPage, totalPages, readMode, autoPage])

  useEffect(() => {
    if (readMode === 'scroll') return
    if (autoPage && currentPage >= totalPages) setAutoPage(false)
  }, [currentPage, autoPage, totalPages, readMode])

  // 统一页面加载入口：currentPage 或 readMode 变化时自动加载对应页面
  // 使用请求序号防止快速翻页时的竞态条件
  useEffect(() => {
    if (readMode === 'scroll') return
    if (!(archivePages.length > 0 || folderImages.length > 0)) return
    const sequence = ++pageRequestSequenceRef.current
    const loadCurrentPage = async () => {
      if (readMode === 'double') {
        const leftUrl = await getPageUrl(currentPage)
        if (sequence !== pageRequestSequenceRef.current) return
        setCurrentImageSrc(leftUrl)
        if (currentPage + 1 <= totalPages) {
          const rightUrl = await getPageUrl(currentPage + 1)
          if (sequence === pageRequestSequenceRef.current) {
            setDoublePageRight(rightUrl)
          }
        } else {
          setDoublePageRight('')
        }
      } else {
        const url = await getPageUrl(currentPage)
        if (sequence === pageRequestSequenceRef.current && url) {
          setCurrentImageSrc(url)
        }
      }
    }
    loadCurrentPage()
  }, [currentPage, readMode, archivePages.length, folderImages.length, getPageUrl, totalPages])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readMode === 'scroll') return
      if (e.key === 'ArrowLeft' || e.key === 'Left') { e.preventDefault(); handleDoublePrev() }
      else if (e.key === 'ArrowRight' || e.key === 'Right') { e.preventDefault(); handleDoubleNext() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDoublePrev, handleDoubleNext, readMode])

  useEffect(() => {
    if (readMode === 'scroll') return
    if (!autoPage) return
    autoPageRef.current = window.setInterval(() => {
      setCurrentPage(prev => {
        const step = readMode === 'double' ? 2 : 1
        if (prev >= totalPages) return prev
        return Math.min(totalPages, prev + step)
      })
    }, autoPageInterval)
    return () => { if (autoPageRef.current) { clearInterval(autoPageRef.current); autoPageRef.current = null } }
  }, [autoPage, autoPageInterval, readMode, totalPages])

  useEffect(() => {
    if (readMode === 'scroll') return
    let wheelTimer: number | null = null
    const WHEEL_THROTTLE_MS = 100
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelTimer) return
      wheelTimer = window.setTimeout(() => { wheelTimer = null }, WHEEL_THROTTLE_MS)
      if (zoomMode) {
        setZoomLevelState(prev => {
          const delta = e.deltaY > 0 ? -10 : 10
          return Math.min(320, Math.max(120, prev + delta))
        })
      } else {
        if (e.deltaY > 0) handleDoubleNext()
        else if (e.deltaY < 0) handleDoublePrev()
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => { window.removeEventListener('wheel', handleWheel); if (wheelTimer) clearTimeout(wheelTimer) }
  }, [handleDoublePrev, handleDoubleNext, zoomMode, readMode])

  const cycleReadMode = () => {
    const modes: ReadMode[] = ['single', 'double', 'scroll']
    const currentIndex = modes.indexOf(readMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    pageRequestSequenceRef.current++
    setReadMode(nextMode)
    setZoomMode(false)
    setDoublePageRight('')
  }

  const scrollToTop = () => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const getZoomTransform = () => {
    if (!zoomMode) return undefined
    const scale = zoomLevelState / 100
    return `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`
  }

  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (!zoomMode || zoomLevelState <= 100) return
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }
  }

  const handleImageMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    setPanOffset({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y })
  }, [isDragging])

  const handleImageMouseUp = useCallback(() => { setIsDragging(false) }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleImageMouseMove)
      window.addEventListener('mouseup', handleImageMouseUp)
      return () => { window.removeEventListener('mousemove', handleImageMouseMove); window.removeEventListener('mouseup', handleImageMouseUp) }
    }
  }, [isDragging, handleImageMouseMove, handleImageMouseUp])

  const resetPan = useCallback(() => { setPanOffset({ x: 0, y: 0 }) }, [])

  const readModeLabels: Record<ReadMode, string> = { single: '单页', double: '双页', scroll: '滚动' }

  const imageStyle = {
    transform: getZoomTransform(),
    cursor: zoomMode && zoomLevelState > 100 ? (isDragging ? 'grabbing' : 'grab') : undefined,
  }

  const renderSinglePage = () => (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto relative">
      {isLoading ? (
        <p className="text-text-secondary">加载中...</p>
      ) : currentImageSrc ? (
        <img src={currentImageSrc} alt={`第 ${currentPage} 页`}
          className="max-w-full max-h-full object-contain transition-transform duration-150 select-none"
          style={imageStyle} onMouseDown={handleImageMouseDown} />
      ) : (
        <div className="text-center">
          <span className="text-6xl mb-4 block">📄</span>
          <p className="text-text-primary text-lg">暂无图片</p>
        </div>
      )}
    </div>
  )

  const renderDoublePage = () => (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto gap-2 relative">
      {isLoading ? (
        <p className="text-text-secondary">加载中...</p>
      ) : (
        <>
          {currentImageSrc && (
            <img src={currentImageSrc} alt={`第 ${currentPage} 页`}
              className="max-w-full max-h-full object-contain transition-transform duration-150 select-none"
              style={imageStyle} onMouseDown={handleImageMouseDown} />
          )}
          {doublePageRight && (
            <img src={doublePageRight} alt={`第 ${currentPage + 1} 页`}
              className="max-w-full max-h-full object-contain transition-transform duration-150 select-none"
              style={imageStyle} onMouseDown={handleImageMouseDown} />
          )}
          {!currentImageSrc && !doublePageRight && (
            <div className="text-center">
              <span className="text-6xl mb-4 block">📄</span>
              <p className="text-text-primary text-lg">暂无图片</p>
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderScrollMode = () => {
    if (totalPages === 0) {
      return (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 relative">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📄</span>
              <p className="text-text-primary text-lg">暂无图片</p>
            </div>
          </div>
        </div>
      )
    }

    // 虚拟滚动计算
    const startPage = Math.max(1, Math.floor(scrollTop / estimatedPageHeight.current) - VISIBLE_BUFFER)
    const visiblePages = containerHeight > 0 ? Math.ceil(containerHeight / estimatedPageHeight.current) : 3
    const endPage = Math.min(totalPages, startPage + visiblePages + VISIBLE_BUFFER * 2)
    
    // 总高度
    const totalHeight = totalPages * estimatedPageHeight.current
    // 偏移量
    const offsetY = (startPage - 1) * estimatedPageHeight.current
    
    // 已加载页面的 URL 映射
    const loadedUrlMap = new Map<string, string>()
    scrollImages.forEach(img => loadedUrlMap.set(img.path, img.url))

    const elements: React.ReactNode[] = []
    for (let page = startPage; page <= endPage; page++) {
      const pageKey = String(page)
      const imageUrl = loadedUrlMap.get(pageKey)
      
      if (imageUrl) {
        elements.push(
          <img 
            key={page} 
            src={imageUrl} 
            alt={`第 ${page} 页`} 
            className="max-w-full mx-auto block"
            style={{ width: '100%', minHeight: `${estimatedPageHeight.current}px` }}
            onLoad={(e) => {
              // 图片加载完成后更新估算高度
              const imgElement = e.target as HTMLImageElement
              const actualHeight = imgElement.offsetHeight
              if (actualHeight > 0 && actualHeight !== estimatedPageHeight.current) {
                estimatedPageHeight.current = actualHeight
              }
            }}
          />
        )
      } else {
        elements.push(
          <div 
            key={page}
            className="w-full flex items-center justify-center border border-border-1 rounded bg-bg-card"
            style={{ height: `${estimatedPageHeight.current}px` }}
          >
            <div className="text-center">
              <p className="text-text-muted text-sm">第 {page} 页</p>
              <p className="text-text-muted text-xs mt-1">加载中...</p>
            </div>
          </div>
        )
      }
    }

    return (
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-y-auto p-4 relative"
        style={{ position: 'relative' }}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {elements}
          </div>
        </div>
        <button onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 w-10 h-10 bg-accent text-accent-text rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors text-lg font-bold">
          ↑
        </button>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-bg-main flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-bg-panel border-b border-border-1">
        <button onClick={handleClose} className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm">关闭</button>
        <span className="text-text-primary text-sm font-medium">{mangaTitle}</span>
        {readMode !== 'scroll' && totalPages > 0 && (
          <span className="text-text-secondary text-sm">
            {readMode === 'double' && doublePageRight ? `第 ${currentPage}-${currentPage + 1} / ${totalPages} 页` : `第 ${currentPage} / ${totalPages} 页`}
          </span>
        )}
        {readMode !== 'scroll' && zoomMode && (
          <span className="text-text-secondary text-sm">{zoomLevelState}%</span>
        )}
        <div className="flex gap-2">
          <button onClick={cycleReadMode} className="px-3 py-1 bg-accent text-accent-text rounded text-sm font-medium hover:bg-accent-hover transition-colors">
            {readModeLabels[readMode]}
          </button>
          <button onClick={handleRestoreProgress}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm"
            title="恢复上次阅读进度">
            恢复进度
          </button>
          {readMode !== 'scroll' && (
            <button onClick={() => setAutoPage(!autoPage)}
              className={`px-3 py-1 rounded text-sm transition-colors ${autoPage ? 'bg-accent text-accent-text font-medium' : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'}`}>
              {autoPage ? '自动关' : '自动开'}
            </button>
          )}
          {autoPage && readMode !== 'scroll' && (
            <div className="flex items-center gap-1">
              <button onClick={() => setAutoPageInterval(prev => Math.max(500, prev - 500))} className="px-2 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-xs">-</button>
              <span className="text-text-secondary text-xs min-w-[40px] text-center">{(autoPageInterval / 1000).toFixed(1)}s</span>
              <button onClick={() => setAutoPageInterval(prev => Math.min(10000, prev + 500))} className="px-2 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-xs">+</button>
            </div>
          )}
          {readMode !== 'scroll' && (
            <button onClick={() => { setZoomMode(!zoomMode); if (!zoomMode) { setZoomLevelState(100); resetPan() } }}
              className={`px-3 py-1 rounded text-sm transition-colors ${zoomMode ? 'bg-accent text-accent-text font-medium' : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'}`}>
              {zoomMode ? '缩放开' : '缩放关'}
            </button>
          )}
          {readMode !== 'scroll' && zoomMode && (
            <>
              <button onClick={() => { setZoomLevelState(100); resetPan() }}
                className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm">
                适应窗口
              </button>
              <input
                type="range"
                className="zoom-slider"
                min={120}
                max={320}
                value={zoomLevelState}
                onChange={(e) => setZoomLevelState(Number(e.target.value))}
                style={{ '--slider-fill': `${((zoomLevelState - 120) / (320 - 120)) * 100}%` } as React.CSSProperties}
                aria-label="缩放级别"
              />
              <span className="text-text-secondary text-sm min-w-[45px]">{zoomLevelState}%</span>
            </>
          )}
          {readMode !== 'scroll' && (
            <button onClick={handleDoublePrev} disabled={currentPage === 1}
              className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50">上一页</button>
          )}
          {readMode !== 'scroll' && (
            <button onClick={handleDoubleNext} disabled={currentPage >= totalPages || totalPages === 0}
              className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50">下一页</button>
          )}
        </div>
      </div>
      {readMode === 'single' && renderSinglePage()}
      {readMode === 'double' && renderDoublePage()}
      {readMode === 'scroll' && renderScrollMode()}

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 rounded-lg shadow-xl px-4 py-2 text-sm text-red-100 max-w-md">
          {errorToast}
          <button
            onClick={() => setErrorToast(null)}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            <RxCross2 className="w-4 h-4 inline" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ReaderView
