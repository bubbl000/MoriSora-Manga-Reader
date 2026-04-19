import { useState, useEffect, useCallback } from 'react'
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
      setCurrentImageSrc(imageCache[pageInfo.page_number])
      return
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
      setCurrentImageSrc(url)
    } catch (error) {
      console.error('加载压缩包页面失败:', error)
    }
  }, [mangaPath, imageCache])

  const loadPdfPage = useCallback(async (pageNumber: number) => {
    try {
      console.log('[PDF] Starting to load page:', { mangaPath, pageNumber })
      
      const pdfjsLibInstance = await initPdfWorker()
      console.log('[PDF] Worker initialized')
      
      const bytes = await invoke<number[]>('read_image_bytes', { filePath: mangaPath })
      console.log('[PDF] File read successfully, size:', bytes.length, 'bytes')
      
      const uint8Array = new Uint8Array(bytes)
      console.log('[PDF] Uint8Array created')
      
      const loadingTask = pdfjsLibInstance.getDocument({ data: uint8Array })
      console.log('[PDF] Loading task created')
      
      const pdf = await loadingTask.promise
      console.log('[PDF] Document loaded, numPages:', pdf.numPages)
      
      const page = await pdf.getPage(pageNumber)
      console.log('[PDF] Page retrieved')
      
      const viewport = page.getViewport({ scale: 1.5 })
      console.log('[PDF] Viewport:', viewport.width, 'x', viewport.height)
      
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('无法创建Canvas上下文')
      }
      console.log('[PDF] Canvas created')

      const renderTask = page.render({ canvasContext: context, viewport, canvas })
      await renderTask.promise
      console.log('[PDF] Page rendered to canvas')
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      })

      if (!blob) {
        throw new Error('PDF页面转Blob失败')
      }
      console.log('[PDF] Blob created, size:', blob.size, 'bytes')

      const reader = new FileReader()
      const url = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            console.log('[PDF] DataURL created, length:', reader.result.length)
            resolve(reader.result)
          } else {
            reject(new Error('转换PDF为DataURL失败'))
          }
        }
        reader.onerror = () => reject(new Error('读取PDF Blob失败'))
        reader.readAsDataURL(blob)
      })

      setImageCache(prev => ({ ...prev, [pageNumber]: url }))
      setCurrentImageSrc(url)
      console.log('[PDF] Image cache and currentImageSrc updated')

      try {
        page.cleanup()
        pdf.cleanup()
        await pdf.destroy()
        await loadingTask.destroy()
      } catch {
        // ignore cleanup errors
      }
    } catch (error) {
      console.error('[PDF] 加载PDF页面失败:', error)
      if (error instanceof Error) {
        console.error('[PDF] Error name:', error.name)
        console.error('[PDF] Error message:', error.message)
        console.error('[PDF] Error stack:', error.stack)
      }
    }
  }, [mangaPath])

  const loadImages = useCallback(async (path: string, type: string) => {
    setIsLoading(true)
    try {
      if (type === 'archive') {
        const pages = await invoke<ArchivePageInfo[]>('get_archive_images', { path })
        setArchivePages(pages)
        setFolderImages([])
        if (pages.length > 0) {
          await loadArchivePage(pages[0])
        }
      } else if (type === 'pdf') {
        const pages = await invoke<ArchivePageInfo[]>('get_archive_images', { path })
        setArchivePages(pages)
        setFolderImages([])
        if (pages.length > 0) {
          await loadPdfPage(pages[0].page_number)
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

  const handlePrevPage = async () => {
    const newPage = Math.max(1, currentPage - 1)
    setCurrentPage(newPage)

    if (sourceType === 'pdf') {
      await loadPdfPage(newPage)
    } else if (sourceType === 'archive' && archivePages.length > 0) {
      await loadArchivePage(archivePages[newPage - 1])
    } else {
      const imgPath = folderImages[newPage - 1]
      if (imgPath) {
        const url = await loadFolderImage(imgPath)
        if (url) {
          setCurrentImageSrc(url)
        }
      }
    }
  }

  const handleNextPage = async () => {
    const totalPages = sourceType === 'archive' || sourceType === 'pdf' ? archivePages.length : folderImages.length
    const newPage = Math.min(totalPages, currentPage + 1)
    setCurrentPage(newPage)

    if (sourceType === 'pdf') {
      await loadPdfPage(newPage)
    } else if (sourceType === 'archive' && archivePages.length > 0) {
      await loadArchivePage(archivePages[newPage - 1])
    } else {
      const imgPath = folderImages[newPage - 1]
      if (imgPath) {
        const url = await loadFolderImage(imgPath)
        if (url) {
          setCurrentImageSrc(url)
        }
      }
    }
  }

  const totalPages = sourceType === 'archive' || sourceType === 'pdf' ? archivePages.length : folderImages.length

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
        {totalPages > 0 && (
          <span className="text-text-secondary text-sm">
            第 {currentPage} / {totalPages} 页
          </span>
        )}
        <div className="flex gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {isLoading ? (
          <p className="text-text-secondary">加载中...</p>
        ) : currentImageSrc ? (
          <img
            src={currentImageSrc}
            alt={`第 ${currentPage} 页`}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-center">
            <span className="text-6xl mb-4 block">📄</span>
            <p className="text-text-primary text-lg">暂无图片</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReaderView
