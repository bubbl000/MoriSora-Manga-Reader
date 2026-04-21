import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'
import * as databaseService from '../services/databaseService'

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
  const [readMode, setReadMode] = useState<ReadMode>('single')
  const [doublePageRight, setDoublePageRight] = useState('')
  const [scrollImages, setScrollImages] = useState<{ path: string; url: string }[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [autoPage, setAutoPage] = useState(false)
  const [autoPageInterval, setAutoPageInterval] = useState(3000)
  const autoPageRef = useRef<number | null>(null)
  const [comicId, setComicId] = useState<number | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const [zoomLevelState, setZoomLevelState] = useState(100)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const initialLoadRef = useRef(false)

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
      if (!context) throw new Error('无法创建Canvas上下文')
      const renderTask = page.render({ canvasContext: context, viewport, canvas })
      await renderTask.promise
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      })
      if (!blob) throw new Error('PDF页面转Blob失败')
      const reader = new FileReader()
      const url = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result)
          else reject(new Error('转换PDF为DataURL失败'))
        }
        reader.onerror = () => reject(new Error('读取PDF Blob失败'))
        reader.readAsDataURL(blob)
      })
      setImageCache(prev => ({ ...prev, [pageNumber]: url }))
      try { page.cleanup(); pdf.cleanup(); await pdf.destroy(); await loadingTask.destroy() } catch {}
      return url
    } catch (error) {
      console.error('加载PDF页面失败:', error)
      return ''
    }
  }, [mangaPath, imageCache])

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
          const blob = new Blob([uint8Array])
          const url = URL.createObjectURL(blob)
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
    } finally {
      setIsLoading(false)
    }
  }, [loadPdfPage, loadFolderImage])

  const restoreReadingProgress = useCallback(async (path: string) => {
    try {
      const comics = await databaseService.getAllComicsMetadata()
      const comic = comics.find(c => c.path === path)
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

  const loadScrollImages = useCallback(async () => {
    const images: { path: string; url: string }[] = []
    const sourceList = sourceType === 'archive' || sourceType === 'pdf'
      ? archivePages.map((_, i) => i + 1)
      : folderImages
    for (let i = 0; i < sourceList.length; i++) {
      const url = await getPageUrl(i + 1)
      if (url) images.push({ path: String(i + 1), url })
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
    if (autoPage) setAutoPage(false)
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.max(1, currentPage - step)
    setCurrentPage(newPage)
    if (readMode === 'double') await loadDoublePage(newPage)
    else await switchToPage(newPage)
  }, [currentPage, readMode, loadDoublePage, switchToPage, autoPage])

  const handleDoubleNext = useCallback(async () => {
    if (autoPage) setAutoPage(false)
    const step = readMode === 'double' ? 2 : 1
    const newPage = Math.min(totalPages, currentPage + step)
    setCurrentPage(newPage)
    if (readMode === 'double') await loadDoublePage(newPage)
    else await switchToPage(newPage)
  }, [currentPage, totalPages, readMode, loadDoublePage, switchToPage, autoPage])

  useEffect(() => {
    if (readMode === 'scroll') return
    if (autoPage && currentPage >= totalPages) setAutoPage(false)
  }, [currentPage, autoPage, totalPages, readMode])

  useEffect(() => {
    if (readMode === 'scroll') return
    if (!(archivePages.length > 0 || folderImages.length > 0)) return
    if (readMode === 'double') loadDoublePage(currentPage)
  }, [readMode, currentPage, archivePages.length, folderImages.length, loadDoublePage])

  useEffect(() => {
    if (readMode === 'single' && (archivePages.length > 0 || folderImages.length > 0)) {
      switchToPage(currentPage)
    }
  }, [currentPage, readMode, archivePages.length, folderImages.length, switchToPage])

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
          return Math.min(500, Math.max(10, prev + delta))
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
    setReadMode(nextMode)
    setZoomMode(false)
    if (nextMode === 'double') loadDoublePage(currentPage)
    else if (nextMode === 'single') switchToPage(currentPage)
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

  const renderScrollMode = () => (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 relative">
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
        <>
          {scrollImages.map((img, index) => (
            <img key={index} src={img.url} alt={`第 ${index + 1} 页`} className="max-w-full mx-auto block" />
          ))}
          <button onClick={scrollToTop}
            className="fixed bottom-8 right-8 w-10 h-10 bg-accent text-accent-text rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors text-lg font-bold">
            ↑
          </button>
        </>
      )}
    </div>
  )

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
            <button onClick={() => { setZoomLevelState(100); resetPan() }}
              className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm">
              适应窗口
            </button>
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
    </div>
  )
}

export default ReaderView
