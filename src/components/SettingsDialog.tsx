import { useState } from 'react'
import { useMangaStore } from '../stores/mangaStore'
import { open } from '@tauri-apps/plugin-dialog'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { libraryPaths, addLibraryPath, removeLibraryPath, scanAndLoad, isScanning } = useMangaStore()
  const [newPath, setNewPath] = useState('')

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择漫画仓库目录',
      })
      if (selected && typeof selected === 'string') {
        setNewPath(selected)
      }
    } catch (error) {
      console.error('选择文件夹失败:', error)
    }
  }

  const handleAddPath = async () => {
    if (newPath.trim()) {
      await addLibraryPath(newPath.trim())
      setNewPath('')
    }
  }

  const handleRemovePath = async (path: string) => {
    await removeLibraryPath(path)
  }

  const handleSaveAndScan = async () => {
    await scanAndLoad()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-bg-card rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border-1">
          <h2 className="text-lg font-semibold text-text-primary">设置</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-hover rounded text-text-secondary"
          >
            ×
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">漫画仓库路径</h3>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddPath()
                  }
                }}
                placeholder="输入或选择漫画仓库路径"
                className="flex-1 px-3 py-2 bg-bg-input border border-border-1 rounded text-text-primary text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={async () => {
                  await handleSelectFolder()
                  if (newPath.trim()) {
                    await handleAddPath()
                  }
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-accent-text text-sm font-medium whitespace-nowrap"
              >
                添加
              </button>
            </div>

            {libraryPaths.length > 0 ? (
              <div className="space-y-2">
                {libraryPaths.map((path, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-bg-panel rounded border border-border-1"
                  >
                    <span className="text-text-secondary text-sm truncate flex-1 mr-2">
                      {path}
                    </span>
                    <button
                      onClick={() => handleRemovePath(path)}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors"
                      title="移除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm text-center py-4">
                暂无漫画仓库路径，请添加一个目录开始扫描
              </p>
            )}

            {isScanning && (
              <p className="text-accent text-sm mt-2">正在扫描...</p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border-1 flex justify-end">
          <button
            onClick={handleSaveAndScan}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-accent-text text-sm font-medium"
          >
            保存设置并扫描
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
