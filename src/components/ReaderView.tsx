import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function ReaderView() {
  const [currentPage, setCurrentPage] = useState(1)
  const [mangaTitle, setMangaTitle] = useState('')
  const [mangaId, setMangaId] = useState('')
  const totalPages = 10

  useEffect(() => {
    // 从 hash 路由解析参数
    // 格式: #reader#{id}#{title} 或 #/reader/{id}/{title}
    const hash = window.location.hash
    console.log('ReaderView hash:', hash)

    let id = ''
    let title = ''

    if (hash.startsWith('#reader#')) {
      // 格式: #reader#{id}#{title}
      const parts = hash.replace('#reader#', '').split('#')
      id = parts[0] || ''
      title = parts[1] ? decodeURIComponent(parts[1]) : ''
    } else if (hash.startsWith('#/reader/')) {
      // 格式: #/reader/{id}/{title}
      const readerPath = hash.replace('#/reader/', '')
      const parts = readerPath.split('/')
      id = parts[0] || ''
      title = parts.slice(1).join('/') ? decodeURIComponent(parts.slice(1).join('/')) : ''
    }

    console.log('ReaderView parsed:', { id, title })

    if (id) setMangaId(id)
    if (title) setMangaTitle(title)
    else setMangaTitle('未知漫画')
  }, [])

  const handleClose = async () => {
    try {
      console.log('Closing window via getCurrentWindow().close()')
      const currentWindow = getCurrentWindow()
      await currentWindow.close()
    } catch (error) {
      console.error('关闭窗口失败:', error)
      alert(`关闭窗口失败: ${error}`)
    }
  }

  return (
    <div className="h-full w-full bg-bg-main flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-bg-panel border-b border-border-1">
        <button
          onClick={handleClose}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
        >
          关闭
        </button>
        <span className="text-text-primary text-sm font-medium">{mangaTitle}</span>
        <span className="text-text-secondary text-sm">
          第 {currentPage} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-bg-card rounded-lg p-8 text-center">
          <span className="text-6xl mb-4 block">📄</span>
          <p className="text-text-primary text-lg">漫画页面 {currentPage}</p>
          <p className="text-text-secondary text-sm mt-2">（图片加载功能待实现）</p>
          <p className="text-text-muted text-xs mt-4">
            Debug: ID={mangaId || 'none'}, Title={mangaTitle}
          </p>
        </div>
      </div>
    </div>
  )
}

export default ReaderView
