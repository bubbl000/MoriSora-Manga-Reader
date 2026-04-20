import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'

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
  const [imageCache, setImageCache] = useState<Record<number, string>>({})
  const [folderImageCache, setFolderImageCache] = useState<Record<string, string>>({})
  const [zoomMode, setZoomMode] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [readMode, setReadMode] = useState<ReadMode>('single')
  const [doublePageRight, setDoublePageRight] = useState('')
  const [scrollImages, setScrollImages] = useState<{ path: string; url: string }[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const totalPages = sourceType === 'archive' || sourceType === 'pdf' ? archivePages.length : folderImages.length

  const loadFolderImage = useCallback(async (filePath: string): Promise<string> => {
    const cacheKey = filePath
    if (folderImageCache[cacheKey]) {
      return folderImageCache[cacheKey]
    }

    try {
      const bytes = await invoke<number[]>('read_image_bytes', { filePath })
      const uint8Array = new Uint8Array(bytes)
      const blob = new Blob([uint8Array])
      const url = URL.createObjectURL(blob)

      setFolderImageCache(prev => ({ ...prev, [cacheKey]: url }))
      return url
    } catch (error) {
      console.error('读取图片文件失败:', error)
      return ''
    }
  }, [folderImageCache])

  const loadArchivePage = useCallback(async (pageInfo: ArchivePageInfo) => {
    if (imageCache[pageInfo.page_number]) {
      return imageCache[pageInfo.page_number]
    }

    try {
      const bytes = await invoke<number[]>('get_archive_image_bytes', {
        path: mangaPath,
        entryPath: pageInfo.entry_path,
      })

      const uint8Array = new Uint8Array(bytes)
      const blob = new Blob([uint8Array])
      const url = URL.createObjectURL(blob)

      setImageCache(prev => ({ ...prev, [pageInfo.page_number]: url }))
      return url
    } catch (error) {
      console.error('加载压缩包页面失败:', error)
      return ''
    }
  }, [mangaPath, imageCache])

  const loadPdfPage = useCallback(async (pageNumber: number): Promise<string> => {
    try {
      if (imageCache[pageNumber]) {
        return imageCache[pageNumber]
      }

      const pdfjsLibInstance = await initPdfWorker()
      const bytes = await invoke<number[]>('read_image_bytes', { filePath: mangaPath })
      const uint8Array = new Uint8Array(bytes)

      const loadingTask = pdfjsLibInstance.getDocument({ data: uint8Array })
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('无法创建Canvas上下文')
      }

      const renderTask = page.render({ canvasContext: context, viewport, canvas })
      await renderTask.promise

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      })

      if (!blob) {
        throw new Error('PDF页面转Blob失败')
      }

      const reader = new FileReader()
      const url = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result)
          } else {
            reject(new Error('转换PDF为DataURL失败'))
          }
        }
        reader.onerror = () => reject(new Error('读取PDF Blob失败'))
        reader.readAsDataURL(blob)
      })

      setImageCache(prev => ({ ...prev, [pageNumber]: url }))

      try {
        page.cleanup()
        pdf.cleanup()
        await pdf.destroy()
        await loadingTask.destroy()
      } catch {
        // ignore cleanup errors
      }

      return url
    } catch (error) {
      console.error('加载PDF页面失败:', error)
      return ''
    }
  }, [mangaPath, imageCache])

  const getPageUrl = useCallback(async (pageIndex: number): Promise<string> => {
    if (sourceType === 'pdf') {
      return await loadPdfPage(pageIndex)
    } else if (sourceType === 'archive' && archivePages.length > 0) {
      return await loadArchivePage(archivePages[pageIndex - 1])
    } else {
      const imgPath = folderImages[pageIndex - 1]
      if (imgPath) {
        return await loadFolderImage(imgPath)
      }
      return ''
    }
  }, [sourceType, archivePages, folderImages, loadPdfPage, loadArchivePage, loadFolderImage])

  const loadImages = useCallback(async (path: string, type: string) => {
    setIsLoading(true)
    try {
      if (type === 'archive') {
        const pages = await invoke<ArchivePageInfo[]>('get_archive_images', { path })
        setArchivePages(pages)
        setFolderImages([])
        if (pages.length > 0) {
          const url = await loadArchivePage(pages[0])
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
          if (url) {
            setCurrentImageSrc(url)
          }
        }
      }
    } catch (error) {
      console.error('加载图片失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [loadArchivePage, loadFolderImage, loadPdfPage])

  useEffect(() => {
    const hash = window.location.hash
    console.log('ReaderView hash:', hash)

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

    console.log('ReaderView parsed:', { id, title, path, type })

    if (title) setMangaTitle(title)
    else setMangaTitle('未知漫画')

    if (path) {
      setMangaPath(path)
      setSourceType(type)
      loadImages(path, type)
    }
  }, [loadImages])

  const loadScrollImages = useCallback(async () => {
    const images: { path: string; url: string }[] = []
    const sourceList = sourceType === 'archive' || sourceType === 'pdf'
      ? archivePages.map((_, i) => i + 1)
      : folderImages

    for (let i = 0; i < sourceList.length; i++) {
      const url = await getPageUrl(i + 1)
      if (url) {
        images.push({ path: sourceType === 'archive' || sourceType === 'pdf' ? String(i + 1) : sourceList[i], url })
      }
    }
    setScrollImages(images)
  }, [sourceType, archivePages, folderImages, getPageUrl])

  useEffect(() => {
    if (readMode === 'scroll' && (archivePages.length > 0 || folderImages.length > 0)) {
      loadScrollImages()
    }
  }, [readMode, archivePages.length, folderImages.length, loadScrollImages])

  const handleClose = async () => {
    try {
      Object.values(imageCache).forEach(url => URL.revokeObjectURL(url))
      Object.values(folderImageCache).forEach(url => URL.revokeObjectURL(url))
      const currentWindow = getCurrentWindow()
      await currentWindow.close()
    } catch (error) {
      console.error('关闭窗口失败:', error)
    }
  }

  const switchToPage = useCallback(async (page: number) => {
    const url = await getPageUrl(page)
    if (url) setCurrentImageSrc(url)
  }, [getPageUrl])

  const handlePrevPage = useCallback(async () => {
    const newPage = Math.max(1, currentPage - 1)
    setCurrentPage(newPage)
    await switchToPage(newPage)
  }, [currentPage, switchToPage])

  const handleNextPage = useCallback(async () => {
    const newPage = Math.min(totalPages, currentPage + 1)
    setCurrentPage(newPage)
    await switchToPage(newPage)
  }, [currentPage, totalPages, switchToPage])

  const loadDoublePage = useCallback(async (page: number) => {
    const leftUrl = await getPageUrl(page)
    setCurrentImageSrc(leftUrl)

    if (page + 1 <= totalPages) {
      const rightUrl = await getPageUrl(page + 1)
      setDoublePageRight(rightUrl)
    } else {
      setDoublePageRight('')
    }
  }, [getPageUrl, totalPages])

  const handleDoublePrev = useCallback(async () => {
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.max(1, currentPage - step)
    setCurrentPage(newPage)
    if (readMode === 'double') {
      await loadDoublePage(newPage)
    } else {
      await switchToPage(newPage)
    }
  }, [currentPage, readMode, loadDoublePage, switchToPage])

  const handleDoubleNext = useCallback(async () => {
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.min(totalPages, currentPage + step)
    setCurrentPage(newPage)
    if (readMode === 'double') {
      await loadDoublePage(newPage)
    } else {
      await switchToPage(newPage)
    }
  }, [currentPage, totalPages, readMode, loadDoublePage, switchToPage])

  useEffect(() => {
    if (readMode === 'double' && (archivePages.length > 0 || folderImages.length > 0)) {
      loadDoublePage(currentPage)
    }
  }, [readMode, currentPage, archivePages.length, folderImages.length, loadDoublePage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readMode === 'scroll') return

      if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault()
        handleDoublePrev()
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault()
        handleDoubleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleDoublePrev, handleDoubleNext, readMode])

  useEffect(() => {
    if (readMode === 'scroll') return

    let wheelTimer: number | null = null
    const WHEEL_THROTTLE_MS = 100

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (wheelTimer) return

      wheelTimer = window.setTimeout(() => {
        wheelTimer = null
      }, WHEEL_THROTTLE_MS)

      if (zoomMode) {
        setZoomLevel(prev => {
          const delta = e.deltaY > 0 ? -10 : 10
          return Math.min(500, Math.max(10, prev + delta))
        })
      } else {
        if (e.deltaY > 0) {
          handleDoubleNext()
        } else if (e.deltaY < 0) {
          handleDoublePrev()
        }
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (wheelTimer) clearTimeout(wheelTimer)
    }
  }, [handleDoublePrev, handleDoubleNext, zoomMode, readMode])

  const cycleReadMode = () => {
    const modes: ReadMode[] = ['single', 'double', 'scroll']
    const currentIndex = modes.indexOf(readMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    setReadMode(nextMode)
    setZoomMode(false)
    setZoomLevel(100)
    if (nextMode === 'double') {
      loadDoublePage(currentPage)
    } else if (nextMode === 'single') {
      switchToPage(currentPage)
    }
  }

  const readModeLabels: Record<ReadMode, string> = {
    single: '单页',
    double: '双页',
    scroll: '滚动',
  }

  const renderSinglePage = () => (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
      {isLoading ? (
        <p className="text-text-secondary">加载中...</p>
      ) : currentImageSrc ? (
        <img
          src={currentImageSrc}
          alt={`第 ${currentPage} 页`}
          className="max-w-full max-h-full object-contain transition-transform duration-150"
          style={{ transform: zoomMode ? `scale(${zoomLevel / 100})` : undefined }}
        />
      ) : (
        <div className="text-center">
          <span className="text-6xl mb-4 block">📄</span>
          <p className="text-text-primary text-lg">暂无图片</p>
        </div>
      )}
    </div>
  )

  const renderDoublePage = () => (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto gap-2">
      {isLoading ? (
        <p className="text-text-secondary">加载中...</p>
      ) : (
        <>
          {currentImageSrc && (
            <img
              src={currentImageSrc}
              alt={`第 ${currentPage} 页`}
              className="max-w-full max-h-full object-contain transition-transform duration-150"
              style={{ transform: zoomMode ? `scale(${zoomLevel / 100})` : undefined }}
            />
          )}
          {doublePageRight && (
            <img
              src={doublePageRight}
              alt={`第 ${currentPage + 1} 页`}
              className="max-w-full max-h-full object-contain transition-transform duration-150"
              style={{ transform: zoomMode ? `scale(${zoomLevel / 100})` : undefined }}
            />
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

  const renderScrollMode = () => (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-4 space-y-2"
    >
      {scrollImages.length === 0 && isLoading ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-text-secondary">加载中...</p>
        </div>
      ) : scrollImages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <span className="text-6xl mb-4 block">📄</span>
            <p className="text-text-primary text-lg">暂无图片</p>
          </div>
        </div>
      ) : (
        scrollImages.map((img, index) => (
          <img
            key={index}
            src={img.url}
            alt={`第 ${index + 1} 页`}
            className="max-w-full mx-auto block"
          />
        ))
      )}
    </div>
  )

  return (
    <div className="h-full w-full bg-bg-main flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-bg-panel border-b border-border-1">
        <button
          onClick={handleClose}
          className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm"
        >
          关闭
        </button>
        <span className="text-text-primary text-sm font-medium">{mangaTitle}</span>
        {readMode !== 'scroll' && totalPages > 0 && (
          <span className="text-text-secondary text-sm">
            {readMode === 'double' && doublePageRight
              ? `第 ${currentPage}-${currentPage + 1} / ${totalPages} 页`
              : `第 ${currentPage} / ${totalPages} 页`
            }
          </span>
        )}
        {readMode !== 'scroll' && (
          <span className="text-text-secondary text-sm">
            {zoomLevel}%
          </span>
        )}
        <div className="flex gap-2">
          <button
            onClick={cycleReadMode}
            className="px-3 py-1 bg-accent text-accent-text rounded text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            {readModeLabels[readMode]}
          </button>
          {readMode !== 'scroll' && (
            <button
              onClick={() => {
                setZoomMode(!zoomMode)
                if (!zoomMode) setZoomLevel(100)
              }}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                zoomMode
                  ? 'bg-accent text-accent-text font-medium'
                  : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
              }`}
            >
              {zoomMode ? '缩放开' : '缩放关'}
            </button>
          )}
          {readMode !== 'scroll' && (
            <button
              onClick={handleDoublePrev}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
            >
              上一页
            </button>
          )}
          {readMode !== 'scroll' && (
            <button
              onClick={handleDoubleNext}
              disabled={currentPage >= totalPages || totalPages === 0}
              className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
            >
              下一页
            </button>
          )}
        </div>
      </div>

      {readMode === 'single' && renderSinglePage()}
      {readMode === 'double' && renderDoublePage()}
      {readMode === 'scroll' && renderScrollMode()}
    </div>
  )
}

export default ReaderView
