import { useEffect, useState, useRef, useCallback } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMangaStore, MangaItem, FolderNode, setDropCallback, initDragDropListener } from '../stores/mangaStore'
import SettingsDialog from './SettingsDialog'
import {
  RxGear,
  RxMagnifyingGlass,
  RxCross2,
  RxPlus,
  RxChevronRight,
  RxChevronDown,
  RxReader,
  RxStar,
  RxStarFilled,
} from 'react-icons/rx'
import { HiFunnel, HiTag, HiOutlineTag } from 'react-icons/hi2'
import { invoke } from '@tauri-apps/api/core'

// Folder tree node component
function FolderTreeNode({ node, depth, onSelect, onDragStart, onDragOver, onDrop }: {
  node: FolderNode
  depth: number
  onSelect: (path: string) => void
  onDragStart: (path: string, e: React.MouseEvent) => void
  onDragOver: (path: string, e: React.DragEvent | React.MouseEvent) => void
  onDrop: (targetPath: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(node.isExpanded)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCreateSubfolder, setShowCreateSubfolder] = useState(false)
  const [newSubfolderName, setNewSubfolderName] = useState('')
  const [deleteMangaCount, setDeleteMangaCount] = useState(0)
  const [isDragOverFolder, setIsDragOverFolder] = useState(false)

  useEffect(() => {
    setIsExpanded(node.isExpanded)
  }, [node.isExpanded])

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleOpenInExplorer = async () => {
    setContextMenu(null)
    try {
      await invoke('open_in_explorer', { path: node.path })
    } catch (err) {
      console.error('打开资源管理器失败:', err)
    }
  }

  const handleDeleteClick = async () => {
    setContextMenu(null)
    try {
      const count = await invoke<number>('count_manga_in_folder', { folderPath: node.path })
      setDeleteMangaCount(count)
      setShowDeleteConfirm(true)
    } catch (err) {
      console.error('统计漫画数量失败:', err)
    }
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    try {
      await invoke('delete_file_or_folder', { path: node.path })
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  const handleCreateSubfolder = async () => {
    setContextMenu(null)
    setShowCreateSubfolder(true)
  }

  const handleRefresh = async () => {
    setContextMenu(null)
    useMangaStore.getState().scanAndLoad()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(node.path, e)
    }
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    onDragOver(node.path, e)
    setIsDragOverFolder(true)
  }

  const handleMouseLeave = () => {
    setIsDragOverFolder(false)
  }

  const handleConfirmCreateSubfolder = async () => {
    if (!newSubfolderName.trim()) {
      setShowCreateSubfolder(false)
      return
    }
    try {
      await invoke('create_subfolder', { parentPath: node.path, folderName: newSubfolderName.trim() })
      setNewSubfolderName('')
      setShowCreateSubfolder(false)
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('创建子文件夹失败:', err)
    }
  }

  return (
    <>
      <div
        data-folder-path={node.path}
        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer hover:bg-bg-hover transition-colors text-sm ${
          node.isSelected ? 'bg-bg-hover text-accent' : 'text-text-primary'
        } ${isDragOverFolder ? 'bg-accent/10 border-l-2 border-accent' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.children.length > 0) {
            setIsExpanded(!isExpanded)
          }
          onSelect(node.path)
        }}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {node.children.length > 0 ? (
          isExpanded ? (
            <RxChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          ) : (
            <RxChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-text-muted text-xs">{node.count}</span>
      </div>
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-bg-card border border-border-1 rounded shadow-xl py-1 min-w-40"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleRefresh}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              刷新
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleOpenInExplorer}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              在资源管理器中打开
            </button>
            <button
              onClick={handleCreateSubfolder}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              新增子文件夹
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-bg-hover transition-colors"
            >
              删除
            </button>
          </div>
        </>
      )}

      {showCreateSubfolder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">新增子文件夹</h3>
            <p className="text-text-secondary text-xs mb-2">
              在 "{node.name}" 下创建新子文件夹
            </p>
            <input
              type="text"
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              placeholder="输入文件夹名称"
              className="w-full px-2 py-1.5 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateSubfolder()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreateSubfolder(false); setNewSubfolderName(''); }}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCreateSubfolder}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">确认删除</h3>
            <p className="text-text-secondary text-xs mb-2">
              确定要删除 "{node.name}" 吗？
            </p>
            {deleteMangaCount > 0 && (
              <p className="text-red-400 text-xs mb-2">
                ⚠️ 此操作将影响 {deleteMangaCount} 部漫画，它们的数据库记录将被清除。
              </p>
            )}
            <p className="text-text-muted text-xs mb-4">
              此操作将删除资源管理器中的文件或文件夹，无法撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Manga cover card component
function MangaCard({ manga, onClick, isSelected, onDragStart }: {
  manga: MangaItem
  onClick: () => void
  isSelected: boolean
  onDragStart: (path: string, name: string, e: React.MouseEvent) => void
}) {
  const coverSize = useMangaStore((s) => s.coverSize)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(manga.path, manga.title, e)
    }
  }

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleOpenInExplorer = async () => {
    setContextMenu(null)
    try {
      const folderPath = manga.sourceType === 'folder' ? manga.path : manga.folderPath
      await invoke('open_in_explorer', { path: folderPath })
    } catch (err) {
      console.error('打开资源管理器失败:', err)
    }
  }

  const handleDeleteClick = async () => {
    setContextMenu(null)
    setShowDeleteConfirm(true)
  }

  const handleRefresh = async () => {
    setContextMenu(null)
    useMangaStore.getState().scanAndLoad()
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    try {
      await invoke('delete_file_or_folder', { path: manga.path })
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  return (
    <>
      <div
        className={`flex flex-col cursor-pointer transition-all rounded overflow-hidden ${
          isSelected ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-accent/50'
        }`}
        style={{ width: coverSize }}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
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
        }}
      >
        <div
          className="bg-bg-hover flex items-center justify-center relative"
          style={{ width: coverSize, height: coverSize * 1.4 }}
        >
          {manga.coverThumbnail ? (
            <img src={manga.coverThumbnail} alt={manga.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-text-muted text-3xl">📖</span>
          )}
          {manga.progressPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60">
              <div
                className="h-0.5 bg-accent"
                style={{ width: `${manga.progressPercentage}%` }}
              />
            </div>
          )}
          {manga.isFavorite && (
            <RxStarFilled className="absolute top-1.5 right-1.5 w-4 h-4 text-accent drop-shadow" />
          )}
        </div>
        <div className="p-2 bg-bg-card">
          <p className="text-text-primary text-xs truncate" title={manga.title}>
            {manga.title}
          </p>
          <p className="text-text-muted text-[10px] mt-0.5">
            {manga.formatText}{manga.totalPages > 0 ? ` · ${manga.totalPages}P` : ''}
          </p>
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-bg-card border border-border-1 rounded shadow-xl py-1 min-w-40"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleRefresh}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              刷新
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleOpenInExplorer}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              在资源管理器中打开
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-bg-hover transition-colors"
            >
              删除
            </button>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">确认删除</h3>
            <p className="text-text-secondary text-xs mb-2">
              确定要删除 "{manga.title}" 吗？
            </p>
            <p className="text-text-muted text-xs mb-4">
              此操作将删除资源管理器中的文件，无法撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function LibraryView() {
  const {
    pagedMangaList,
    folderTree,
    isLoading,
    isScanning,
    scanAndLoad,
    loadLibrary,
    searchQuery,
    currentViewMode,
    showTagCloud,
    allTags,
    mangaTags,
    selectedManga,
    selectedTag,
    totalFilteredCount,
    totalPages,
    currentPage,
    sortBy,
    coverSize,
    selectFolder,
    selectManga,
    setSearchQuery,
    setViewMode,
    toggleTagCloud,
    setSortBy,
    setPage,
    setCoverSize,
    toggleFavorite,
    addTag,
    removeTag,
    selectTag,
    loadAllTags,
    libraryPaths,
  } = useMangaStore()

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isDragOverLibrary, setIsDragOverLibrary] = useState(false)
  const [showTagManagement, setShowTagManagement] = useState(false)

  const [leftPanelWidth, setLeftPanelWidth] = useState(256)
  const [rightPanelWidth, setRightPanelWidth] = useState(288)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [globalContextMenu, setGlobalContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingDropFiles, setPendingDropFiles] = useState<string[]>([])
  const [pendingTargetFolder, setPendingTargetFolder] = useState('')
  const [conflictFileName, setConflictFileName] = useState('')

  const [draggedFolderPath, setDraggedFolderPath] = useState<string | null>(null)
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null)
  const [draggedFolderName, setDraggedFolderName] = useState<string>('')
  const [draggedMangaPath, setDraggedMangaPath] = useState<string | null>(null)
  const [draggedMangaName, setDraggedMangaName] = useState<string>('')
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragIcon, setDragIcon] = useState<string>('📁')
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const draggedFolderPathRef = useRef<string | null>(null)
  const draggedMangaPathRef = useRef<string | null>(null)
  const dragOverFolderPathRef = useRef<string | null>(null)

  useEffect(() => {
    draggedFolderPathRef.current = draggedFolderPath
  }, [draggedFolderPath])

  useEffect(() => {
    draggedMangaPathRef.current = draggedMangaPath
  }, [draggedMangaPath])

  useEffect(() => {
    dragOverFolderPathRef.current = dragOverFolderPath
  }, [dragOverFolderPath])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(180, Math.min(400, e.clientX))
        setLeftPanelWidth(newWidth)
      } else if (isResizingRight) {
        const windowWidth = window.innerWidth
        const newWidth = Math.max(200, Math.min(500, windowWidth - e.clientX))
        setRightPanelWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizingLeft(false)
      setIsResizingRight(false)
    }

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (isResizingLeft || isResizingRight) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizingLeft, isResizingRight])

  const handleGlobalContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setGlobalContextMenu({ x: e.clientX, y: e.clientY })
  }

  const showFolderTree = currentViewMode === 'library'

  useEffect(() => {
    console.log('LibraryView: loadLibrary called')
    loadLibrary().catch(e => {
      console.error('LibraryView: loadLibrary failed:', e)
    })
  }, [])

  const handleOpenReader = async (manga: MangaItem) => {
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

  const handleClearSearch = () => {
    setSearchQuery('')
  }

  const handleSearch = () => {
    setViewMode('library')
  }

  const handleAddTag = async () => {
    if (newTagName.trim() && selectedManga) {
      await addTag(selectedManga, newTagName.trim())
      setNewTagName('')
      setShowTagInput(false)
    }
  }

  const handleRemoveTag = async (tagId: number) => {
    if (selectedManga) {
      await removeTag(selectedManga, tagId)
    }
  }

  const sortOptions = [
    { value: 'name', label: '按名称' },
    { value: 'date', label: '按添加时间' },
    { value: 'type', label: '按类型' },
  ]

  useEffect(() => {
    initDragDropListener()
    
    setDropCallback(async (paths: string[]) => {
      setIsDragOverLibrary(false)
      if (libraryPaths.length === 0) {
        setStatusMessage('请先在设置中添加漫画库路径')
        return
      }
      
      const targetFolder = libraryPaths[0]
      const conflicts: string[] = []
      const noConflicts: string[] = []
      
      for (const file of paths) {
        try {
          const result = await invoke<any>('check_file_conflict', { sourcePath: file, targetFolder })
          if (result.has_conflict) {
            conflicts.push(file)
          } else {
            noConflicts.push(file)
          }
        } catch {
          noConflicts.push(file)
        }
      }
      
      if (noConflicts.length > 0) {
        for (const file of noConflicts) {
          try {
            await invoke('copy_file_to_folder', { sourcePath: file, targetFolder })
          } catch (err) {
            console.error('复制文件失败:', err)
          }
        }
      }
      
      if (conflicts.length > 0) {
        const fileName = conflicts[0].split(/[\\/]/).pop() || conflicts[0]
        setConflictFileName(fileName)
        setPendingDropFiles(conflicts)
        setPendingTargetFolder(targetFolder)
        setShowConflictDialog(true)
      } else if (noConflicts.length > 0) {
        scanAndLoad()
      }
    })
    
    return () => {
      setDropCallback(null)
    }
  }, [libraryPaths])

  const handleConfirmCopyWithSuffix = async () => {
    setShowConflictDialog(false)
    for (const file of pendingDropFiles) {
      try {
        await invoke('copy_file_to_folder_with_suffix', { sourcePath: file, targetFolder: pendingTargetFolder })
      } catch (err) {
        console.error('复制文件失败:', err)
      }
    }
    scanAndLoad()
  }

  const handleCancelCopy = async () => {
    setShowConflictDialog(false)
    scanAndLoad()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverLibrary(true)
  }

  const handleTagSelect = (tagName: string) => {
    selectTag(tagName)
  }

  const handleDeleteTagGlobally = async (tagName: string) => {
    try {
      await invoke('delete_tag_by_name', { tagName })
      setStatusMessage(`标签 "${tagName}" 已删除`)
      await loadAllTags()
    } catch (err) {
      setStatusMessage(`删除标签失败: ${err}`)
    }
  }

  const handleFolderDragStart = (path: string, e: React.MouseEvent) => {
    const name = path.split(/[\\/]/).pop() || path
    setDraggedFolderPath(path)
    setDraggedFolderName(name)
    setDraggedMangaPath(null)
    setDragIcon('📁')
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(false)
    window.addEventListener('mousemove', handleDragMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = ''
  }

  const handleMangaDragStart = (path: string, name: string, e: React.MouseEvent) => {
    setDraggedMangaPath(path)
    setDraggedMangaName(name)
    setDraggedFolderPath(null)
    setDragIcon('📖')
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(false)
    window.addEventListener('mousemove', handleDragMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = ''
  }

  const handleDragMouseMove = (e: MouseEvent) => {
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 5 && !isDraggingRef.current) {
        setIsDragging(true)
        isDraggingRef.current = true
        document.body.style.cursor = 'move'
      }
    }
    if (isDraggingRef.current) {
      setDragPosition({ x: e.clientX + 12, y: e.clientY + 12 })

      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (el) {
        const folderEl = el.closest('[data-folder-path]')
        if (folderEl) {
          const targetPath = folderEl.getAttribute('data-folder-path')
          if (targetPath) {
            setDragOverFolderPath(targetPath)
            dragOverFolderPathRef.current = targetPath
          }
        } else {
          setDragOverFolderPath(null)
          dragOverFolderPathRef.current = null
        }
      }
    }
  }

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleDragMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    const draggedFolder = draggedFolderPathRef.current
    const draggedManga = draggedMangaPathRef.current
    const target = dragOverFolderPathRef.current
    if (isDraggingRef.current && target) {
      if (draggedFolder) {
        handleFolderDrop(target)
      } else if (draggedManga) {
        handleMangaDrop(target)
      }
    } else {
      setDraggedFolderPath(null)
      setDraggedMangaPath(null)
      setDragOverFolderPath(null)
    }
    setDragPosition(null)
    setIsDragging(false)
    isDraggingRef.current = false
    dragStartRef.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const handleFolderDragOver = (path: string, _e: React.DragEvent | React.MouseEvent) => {
    setDragOverFolderPath(path)
  }

  const handleFolderDrop = async (targetPath: string) => {
    const dragged = draggedFolderPathRef.current
    if (!dragged) {
      return
    }

    if (dragged === targetPath) {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
      return
    }

    if (targetPath.startsWith(dragged + '/') || targetPath === dragged) {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
      return
    }

    try {
      await invoke('move_folder', { sourcePath: dragged, targetParentPath: targetPath })
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('移动文件夹失败:', err)
    } finally {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
    }
  }

  const handleMangaDrop = async (targetPath: string) => {
    const mangaPath = draggedMangaPathRef.current
    if (!mangaPath) {
      return
    }

    try {
      await invoke('move_file_to_folder', { sourcePath: mangaPath, targetFolder: targetPath })
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('移动漫画文件失败:', err)
    } finally {
      setDraggedMangaPath(null)
      setDragOverFolderPath(null)
    }
  }

  return (
    <>
      <div
        className="flex-1 flex overflow-hidden"
        onContextMenu={handleGlobalContextMenu}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          setIsDragOverLibrary(true)
        }
      }}
      onDragEnter={() => setIsDragOverLibrary(true)}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOverLibrary(false)
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          setIsDragOverLibrary(false)
        }
      }}
    >
      {isDragOverLibrary && (
        <div className="absolute inset-0 z-40 bg-accent bg-opacity-10 border-2 border-dashed border-accent flex items-center justify-center pointer-events-none">
          <div className="bg-bg-panel border border-accent rounded-xl px-8 py-4 text-center">
            <p className="text-accent text-lg font-medium">释放文件到书库</p>
            <p className="text-text-muted text-sm mt-1">文件将被复制到默认漫画库</p>
          </div>
        </div>
      )}

      {/* Left Panel - Sidebar */}
      <div className="flex-shrink-0 bg-bg-panel border-r border-border-1 flex flex-col overflow-hidden" style={{ width: leftPanelWidth }}>
        {/* Search Box */}
        <div className="p-2 border-b border-border-1">
          <div className="relative">
            <RxMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  handleSearch()
                }
              }}
              placeholder="搜索漫画..."
              className="w-full pl-8 pr-8 py-1.5 bg-bg-input border border-border-1 rounded text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent"
            />
            {searchQuery ? (
              <>
                <button
                  onClick={handleClearSearch}
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 hover:bg-bg-hover rounded text-text-muted"
                >
                  <RxCross2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 hover:bg-accent/20 rounded text-text-muted hover:text-accent transition-colors"
                >
                  <RxMagnifyingGlass className="w-3.5 h-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* View Mode Buttons */}
        <div className="flex border-b border-border-1">
          <button
            onClick={() => setViewMode('library')}
            className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
              currentViewMode === 'library'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <RxReader className="w-3.5 h-3.5" />
            书库
          </button>
          <button
            onClick={() => setViewMode('favorites')}
            className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
              currentViewMode === 'favorites'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <RxStar className="w-3.5 h-3.5" />
            收藏
          </button>
          <button
            onClick={() => setViewMode('tags')}
            className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
              currentViewMode === 'tags'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <HiOutlineTag className="w-3.5 h-3.5" />
            标签
          </button>
        </div>

        {/* Folder Tree (only in library mode) */}
        {currentViewMode === 'library' && (
          <>
            {/* Folder Tree Header */}
            <div className="px-3 py-2 border-b border-border-1">
              <span className="text-text-muted text-[10px] font-bold">
                文件夹 <span className="text-[#404040]">{folderTree[0]?.count || 0}</span>
              </span>
            </div>

            {/* Folder Tree */}
            <div className="flex-1 overflow-auto">
              {folderTree.length > 0 ? (
                folderTree.map((node) => (
                  <FolderTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    onSelect={selectFolder}
                    onDragStart={handleFolderDragStart}
                    onDragOver={handleFolderDragOver}
                    onDrop={handleFolderDrop}
                  />
                ))
              ) : (
                <div className="p-4 text-center">
                  <span className="text-4xl block mb-2">📂</span>
                  <p className="text-text-muted text-xs">
                    请在设置中添加漫画库路径
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Settings Button */}
        <div className="p-2 border-t border-border-1">
          <button
            onClick={handleSettingsClick}
            className="w-full py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary hover:text-text-primary text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <RxGear className="w-3.5 h-3.5" />
            设置
          </button>
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        className={`w-1 cursor-col-resize hover:bg-accent/50 transition-colors ${isResizingLeft ? 'bg-accent/50' : 'bg-transparent'}`}
        onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
      />

      {/* Middle Panel - Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tag Cloud View */}
        {currentViewMode === 'tags' && !selectedTag ? (
          <>
            {/* Tag Toolbar */}
            <div className="h-10 flex-shrink-0 bg-bg-panel border-b border-border-1 flex items-center px-3 gap-2">
              <span className="text-text-muted text-xs font-bold">全部标签</span>
              <div className="flex-1" />
              <button
                onClick={() => setShowTagManagement(!showTagManagement)}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  showTagManagement
                    ? 'bg-[#2A3010] border-accent text-accent'
                    : 'bg-[#252525] border-border-1 text-text-secondary hover:text-accent hover:border-accent'
                }`}
              >
                {showTagManagement ? '完成管理' : '管理标签'}
              </button>
            </div>

            {/* Tag List */}
            <div className="flex-1 overflow-auto p-4">
              {allTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    showTagManagement ? (
                      <div
                        key={tag.id}
                        className="px-3 py-1.5 bg-[#252525] border border-border-1 rounded text-sm text-text-secondary flex items-center gap-2"
                      >
                        <span>{tag.name}</span>
                        <button
                          onClick={() => handleDeleteTagGlobally(tag.name)}
                          className="text-text-muted hover:text-red-400 transition-colors"
                        >
                          <RxCross2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        key={tag.id}
                        onClick={() => handleTagSelect(tag.name)}
                        className="px-3 py-1.5 bg-[#252525] border border-border-1 rounded text-sm text-text-secondary hover:text-accent hover:border-accent transition-colors"
                      >
                        {tag.name} <span className="text-text-muted text-xs">({tag.count})</span>
                      </button>
                    )
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <HiTag className="w-12 h-12 text-text-muted opacity-30 mb-4" />
                  <p className="text-text-secondary text-sm mb-2">暂无标签</p>
                  <p className="text-text-muted text-xs">在右侧漫画详情面板为漫画添加标签</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Manga Toolbar (library / favorites / tag-comics view) */}
            <div className="h-10 flex-shrink-0 bg-bg-panel border-b border-border-1 flex items-center px-3 gap-2">
              <span className="text-text-secondary text-xs">
                {isScanning ? '扫描中...' : selectedTag ? `标签 "${selectedTag}"：${totalFilteredCount} 部漫画` : `${totalFilteredCount} 部漫画`}
              </span>

              {selectedTag && (
                <button
                  onClick={() => {
                    selectTag(null)
                    loadAllTags()
                  }}
                  className="px-2 py-1 bg-[#252525] border border-border-1 rounded text-xs text-text-secondary hover:text-accent hover:border-accent transition-colors"
                >
                  <RxCross2 className="w-3 h-3 inline mr-1" />
                  清除标签
                </button>
              )}

              <div className="flex-1" />

              {/* Sort Button */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="px-2 py-1 bg-bg-input border border-border-1 rounded text-text-secondary hover:text-text-primary hover:border-accent text-xs flex items-center gap-1 transition-colors"
                >
                  <HiFunnel className="w-3.5 h-3.5" />
                  {sortOptions.find((s) => s.value === sortBy)?.label || '排序'}
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute top-full right-0 mt-1 bg-bg-card border border-border-1 rounded shadow-lg z-20 min-w-28">
                      {sortOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSortBy(option.value)
                            setShowSortMenu(false)
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-bg-hover transition-colors ${
                            sortBy === option.value ? 'text-accent' : 'text-text-primary'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Cover Size Slider */}
              <div className="flex items-center gap-1.5 text-text-muted text-xs">
                <span>封面</span>
                <input
                  type="range"
                  min="120"
                  max="280"
                  value={coverSize}
                  onChange={(e) => setCoverSize(Number(e.target.value))}
                  className="w-16 accent-accent"
                />
              </div>
            </div>

            {/* Manga Grid Content */}
            <div className="flex-1 overflow-auto p-3">
              {pagedMangaList.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {pagedMangaList.map((manga) => (
                    <MangaCard
                      key={manga.id}
                      manga={manga}
                      onClick={() => selectManga(manga)}
                      isSelected={selectedManga?.id === manga.id}
                      onDragStart={handleMangaDragStart}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <span className="text-6xl mb-4">📚</span>
                  <p className="text-text-secondary text-lg mb-2">
                    {currentViewMode === 'favorites' ? '暂无收藏漫画' : searchQuery ? '没有找到匹配的漫画' : '书库为空'}
                  </p>
                  <p className="text-text-muted text-sm">
                    {currentViewMode === 'favorites'
                      ? '点击漫画卡片的星号图标添加收藏'
                      : searchQuery
                      ? '请尝试调整搜索条件'
                      : '请点击设置按钮添加漫画库路径'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="h-8 flex-shrink-0 bg-bg-panel border-t border-border-1 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-0.5 text-xs text-text-secondary disabled:text-text-muted hover:text-text-primary transition-colors"
                >
                  上一页
                </button>
                <span className="text-text-muted text-xs">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-0.5 text-xs text-text-secondary disabled:text-text-muted hover:text-text-primary transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right Resize Handle */}
      <div
        className={`w-1 cursor-col-resize hover:bg-accent/50 transition-colors ${isResizingRight ? 'bg-accent/50' : 'bg-transparent'}`}
        onMouseDown={(e) => { e.preventDefault(); setIsResizingRight(true); }}
      />

      {/* Right Panel - Details */}
      {selectedManga ? (
        <div className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden" style={{ width: rightPanelWidth }}>
          {/* Header */}
          <div className="p-3 border-b border-border-1 flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary">漫画详情</h3>
            <button
              onClick={() => selectManga(null)}
              className="p-1 hover:bg-bg-hover rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <RxCross2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {/* Cover */}
            <div className="p-4 flex justify-center">
              <div
                className="bg-bg-card rounded overflow-hidden"
                style={{ width: 160, height: 224 }}
              >
                {selectedManga.coverThumbnail ? (
                  <img
                    src={selectedManga.coverThumbnail}
                    alt={selectedManga.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-text-muted text-4xl">📖</span>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="px-4 pb-3">
              <h2 className="text-text-primary text-sm font-medium truncate" title={selectedManga.title}>
                {selectedManga.title}
              </h2>
            </div>

            {/* Info Table */}
            <div className="px-4 pb-3">
              <div className="space-y-1.5">
                <div className="flex text-xs">
                  <span className="text-text-muted w-16">格式</span>
                  <span className="text-text-primary">{selectedManga.formatText}</span>
                </div>
                <div className="flex text-xs">
                  <span className="text-text-muted w-16">页数</span>
                  <span className="text-text-primary">
                    {selectedManga.totalPages > 0 ? `${selectedManga.totalPages} 页` : '-'}
                  </span>
                </div>
                <div className="flex text-xs">
                  <span className="text-text-muted w-16">进度</span>
                  <span className="text-text-primary">
                    {selectedManga.currentPage > 0
                      ? `第 ${selectedManga.currentPage} 页`
                      : '未阅读'}
                  </span>
                </div>
                <div className="flex text-xs">
                  <span className="text-text-muted w-16">路径</span>
                  <span className="text-text-primary truncate ml-1" title={selectedManga.path}>
                    {selectedManga.path}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 pb-3 flex gap-2">
              <button
                onClick={() => handleOpenReader(selectedManga)}
                className="flex-1 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <RxReader className="w-3.5 h-3.5" />
                开始阅读
              </button>
              <button
                onClick={() => toggleFavorite(selectedManga)}
                className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                  selectedManga.isFavorite
                    ? 'bg-accent text-accent-text'
                    : 'bg-bg-card text-text-secondary border border-border-1 hover:text-accent hover:border-accent'
                }`}
              >
                {selectedManga.isFavorite ? (
                  <RxStarFilled className="w-3.5 h-3.5" />
                ) : (
                  <RxStar className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Tags */}
            <div className="px-4 pb-4 border-t border-border-1 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                  <HiTag className="w-3.5 h-3.5" />
                  标签
                </h4>
                {!showTagInput ? (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="p-0.5 hover:bg-bg-hover rounded text-text-muted hover:text-accent transition-colors"
                  >
                    <RxPlus className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>

              {showTagInput && (
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="输入标签名称"
                    className="flex-1 px-2 py-1 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-2 py-1 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => {
                      setShowTagInput(false)
                      setNewTagName('')
                    }}
                    className="p-1 hover:bg-bg-hover rounded text-text-muted transition-colors"
                  >
                    <RxCross2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {mangaTags.length > 0 ? (
                  mangaTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-0.5 bg-bg-card border border-border-1 rounded text-xs text-text-secondary flex items-center gap-1"
                    >
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        className="text-text-muted hover:text-red-400 transition-colors"
                      >
                        <RxCross2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="text-text-muted text-xs">暂无标签</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex items-center justify-center" style={{ width: rightPanelWidth }}>
          <div className="text-center p-4">
            <RxReader className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-text-muted text-sm">选择漫画查看详情</p>
          </div>
        </div>
      )}

      {/* Status Toast */}
      {statusMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-bg-card border border-border-1 rounded-lg shadow-xl px-4 py-2 text-sm text-text-primary max-w-md">
          {statusMessage}
          <button
            onClick={() => setStatusMessage('')}
            className="ml-2 text-text-muted hover:text-text-primary"
          >
            <RxCross2 className="w-4 h-4 inline" />
          </button>
        </div>
      )}

      {/* File Conflict Dialog */}
      {showConflictDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">文件名称冲突</h3>
            <p className="text-text-secondary text-xs mb-2">
              目标文件夹中已存在同名文件：
            </p>
            <p className="text-accent text-xs mb-2 font-mono bg-bg-input px-2 py-1 rounded">
              {conflictFileName}
            </p>
            <p className="text-text-muted text-xs mb-4">
              是否自动添加后缀（如 _1, _2）后导入？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelCopy}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                取消（不导入）
              </button>
              <button
                onClick={handleConfirmCopyWithSuffix}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
              >
                自动添加后缀并导入
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog isOpen={isSettingsOpen} onClose={handleSettingsClose} />
    </div>

      {dragPosition && isDragging && (
        <div
          className="fixed z-[9999] pointer-events-none px-3 py-2 bg-bg-panel border-2 border-accent rounded-lg shadow-2xl flex items-center gap-2 transition-opacity duration-150"
          style={{
            left: dragPosition.x,
            top: dragPosition.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="text-lg">{dragIcon}</span>
          <span className="text-text-primary text-sm font-medium truncate max-w-40">
            {draggedFolderName || draggedMangaName}
          </span>
        </div>
      )}
    </>
  )
}

export default LibraryView
