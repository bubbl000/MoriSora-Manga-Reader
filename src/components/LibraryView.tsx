import { useEffect, useState } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMangaStore } from '../stores/mangaStore'
import SettingsDialog from './SettingsDialog'
import { RxGear } from 'react-icons/rx'

function LibraryView() {
  const { mangaList, isLoading, scanAndLoad, loadLibrary } = useMangaStore()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    loadLibrary()
  }, [])

  const handleDoubleClick = async (manga: typeof mangaList[0]) => {
    try {
      const label = `reader-${manga.id}-${Date.now()}`
      const url = `/#reader#${manga.id}#${encodeURIComponent(manga.title)}#${encodeURIComponent(manga.path)}#${manga.sourceType}`

      const webview = new WebviewWindow(label, {
        url,
        title: `${manga.title} - Manga Reader`,
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        resizable: true,
      })

      webview.once('tauri://error', (e) => {
        console.error('Failed to create window:', e)
      })
    } catch (error) {
      console.error('打开阅读器窗口失败:', error)
    }
  }

  const handleSettingsClick = () => {
    setIsSettingsOpen(true)
  }

  const handleSettingsClose = () => {
    setIsSettingsOpen(false)
    scanAndLoad()
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-bg-panel border-b border-border-1">
        <h2 className="text-xl font-bold text-text-primary">书库</h2>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="text-text-secondary text-sm">加载中...</span>
          )}
          <button
            onClick={handleSettingsClick}
            className="p-2 hover:bg-bg-hover rounded text-text-secondary hover:text-text-primary transition-colors"
            title="设置"
          >
            <RxGear className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {mangaList.length > 0 ? (
          <>
            <p className="text-text-secondary text-sm mb-4">
              共 {mangaList.length} 部漫画，双击打开阅读器
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {mangaList.map((manga) => (
                <div
                  key={manga.id}
                  onDoubleClick={() => handleDoubleClick(manga)}
                  className="bg-bg-card rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent transition-all"
                >
                  <div className="aspect-[3/4] bg-bg-hover flex items-center justify-center">
                    <span className="text-text-muted text-4xl">📖</span>
                  </div>
                  <div className="p-2">
                    <p className="text-text-primary text-sm truncate" title={manga.title}>
                      {manga.title}
                    </p>
                    <p className="text-text-muted text-xs mt-1 truncate" title={manga.path}>
                      {manga.sourceType === 'folder' ? '文件夹' : manga.sourceType === 'pdf' ? 'PDF' : '压缩包'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-6xl mb-4">📚</span>
            <p className="text-text-secondary text-lg mb-2">书库为空</p>
            <p className="text-text-muted text-sm mb-4">请点击上方设置按钮添加漫画仓库路径</p>
            <button
              onClick={handleSettingsClick}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-accent-text text-sm font-medium"
            >
              打开设置
            </button>
          </div>
        )}
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
      />
    </div>
  )
}

export default LibraryView
