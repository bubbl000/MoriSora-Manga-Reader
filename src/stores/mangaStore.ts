import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { saveComicMetadata, batchSaveComicMetadata, getComicIdByPath, getComicByPath, ComicMetadata, ReadingProgress, Tag } from '../services/databaseService'
import { SourceType, isValidSourceType, getSourceTypeDisplayName, inferSourceType } from '../types/sourceType'

// 全局拖拽文件回调
let globalDropCallback: ((paths: string[]) => void) | null = null

export function setDropCallback(cb: (paths: string[]) => void) {
  globalDropCallback = cb
}

// 初始化拖拽事件监听（只调用一次）
let dragDropInitialized = false
export function initDragDropListener() {
  if (dragDropInitialized) return
  dragDropInitialized = true
  
  listen<string[]>('tauri://file-drop', (event) => {
    if (globalDropCallback) {
      globalDropCallback(event.payload)
    }
  })
}

export interface FolderNode {
  id: string
  name: string
  path: string
  isExpanded: boolean
  isSelected: boolean
  count: number
  children: FolderNode[]
}

export interface MangaItem {
  id: string
  title: string
  path: string
  folderPath: string
  sourceType: SourceType
  isFavorite: boolean
  currentPage: number
  totalPages: number
  addedDate: string
  lastOpened: string
  formatText: string
  fileSizeText: string
  progressPercentage: number
  coverThumbnail: string | null
}

interface MangaStore {
  mangaList: MangaItem[]
  filteredMangaList: MangaItem[]
  pagedMangaList: MangaItem[]
  folderTree: FolderNode[]
  libraryPaths: string[]
  isLoading: boolean
  isScanning: boolean
  error: string | null
  searchQuery: string
  currentViewMode: 'library' | 'favorites' | 'tags'
  showTagCloud: boolean
  showTagManagement: boolean
  selectedFolder: string | null
  selectedFolderName: string
  selectedManga: MangaItem | null
  selectedTag: string | null
  mangaTags: Tag[]
  allTags: Tag[]
  currentPage: number
  pageSize: number
  totalCount: number
  totalFilteredCount: number
  totalPages: number
  sortBy: string
  coverSize: number

  loadLibrary: () => Promise<void>
  addLibraryPath: (path: string) => Promise<void>
  removeLibraryPath: (path: string) => Promise<void>
  scanAndLoad: () => Promise<void>
  saveToDatabase: (manga: MangaItem) => Promise<void>
  updateReadingProgress: (mangaId: string, currentPage: number, totalPages: number) => Promise<void>
  toggleFavorite: (manga: MangaItem) => Promise<void>
  selectFolder: (folderPath: string) => void
  selectManga: (manga: MangaItem | null) => Promise<void>
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'library' | 'favorites' | 'tags') => void
  toggleTagCloud: () => void
  toggleTagManagement: () => void
  setSortBy: (sortBy: string) => void
  setPage: (page: number) => void
  setCoverSize: (size: number) => void
  applyFilters: () => Promise<void>
  loadMangaTags: (manga: MangaItem) => Promise<void>
  addTag: (manga: MangaItem, tagName: string) => Promise<void>
  removeTag: (manga: MangaItem, tagId: number) => Promise<void>
  loadAllTags: () => Promise<void>
  selectTag: (tagName: string | null) => Promise<void>
  loadFavorites: () => Promise<void>
}

function buildFolderTree(paths: string[], mangaList: MangaItem[], allFolderPaths: string[] = []): FolderNode[] {
  if (paths.length === 0) return []
  
  const rootName = paths[0]
  
  const mangaCountMap = new Map<string, number>()
  mangaList.forEach(m => {
    mangaCountMap.set(m.folderPath, (mangaCountMap.get(m.folderPath) || 0) + 1)
  })
  
  const folderSet = new Set(allFolderPaths)
  mangaCountMap.forEach((_, folder) => folderSet.add(folder))
  
  const nodes: FolderNode[] = []
  const pathToNode = new Map<string, FolderNode>()
  
  const validFolders = Array.from(folderSet)
    .filter(f => f.startsWith(rootName) && f !== rootName)
    .sort((a, b) => {
      const aDepth = a.split(/[\\/]/).length
      const bDepth = b.split(/[\\/]/).length
      if (aDepth !== bDepth) return aDepth - bDepth
      return a.localeCompare(b)
    })
  
  validFolders.forEach(folderPath => {
    const relativePath = folderPath.substring(rootName.length).replace(/^[\\/]/, '')
    const parts = relativePath.split(/[\\/]/)
    const folderName = parts[parts.length - 1]
    
    const parentRelativePath = parts.slice(0, -1).join('\\')
    const parentFullPath = rootName + '\\' + parentRelativePath
    const parentNode = pathToNode.get(parentFullPath)
    
    const node: FolderNode = {
      id: folderPath,
      name: folderName,
      path: folderPath,
      isExpanded: false,
      isSelected: false,
      count: mangaCountMap.get(folderPath) || 0,
      children: [],
    }
    
    if (parentNode) {
      parentNode.children.push(node)
    } else {
      nodes.push(node)
    }
    
    pathToNode.set(folderPath, node)
  })
  
  const lastSepIndex = Math.max(rootName.lastIndexOf('\\'), rootName.lastIndexOf('/'))
  const rootFolderName = lastSepIndex >= 0 ? rootName.substring(lastSepIndex + 1) : rootName
  
  return [{
    id: rootName,
    name: rootFolderName,
    path: rootName,
    isExpanded: true,
    isSelected: true,
    count: mangaList.length,
    children: nodes.sort((a, b) => a.name.localeCompare(b.name)),
  }]
}

interface ScanAndBuildParams {
  paths: string[]
  setLoading: (loading: boolean) => void
  onComplete: () => void
}

interface ScanBuildResult {
  mangaList: MangaItem[]
  comicMetadataList: ComicMetadata[]
  folderTree: FolderNode[]
  totalCount: number
  totalPages: number
  pagedMangaList: MangaItem[]
}

async function scanAndBuildMangaList(params: ScanAndBuildParams): Promise<ScanBuildResult> {
  const { paths, setLoading, onComplete } = params
  setLoading(true)

  try {
    const allManga: MangaItem[] = []
    const allComics: ComicMetadata[] = []
    let id = 1

    for (const path of paths) {
      try {
        const result = await invoke<{
          comics: Array<{ path: string; title: string; source_type: string }>
          error: string | null
        }>('scan_directory', { directory: path })

        if (result.comics) {
          for (const comic of result.comics) {
            const folderPath =
              comic.source_type === 'folder'
                ? comic.path
                : comic.path.substring(0, Math.max(comic.path.lastIndexOf('\\'), comic.path.lastIndexOf('/')))

            const formatText =
              comic.source_type === 'folder'
                ? '文件夹'
                : comic.source_type === 'pdf'
                ? 'PDF'
                : comic.source_type.toUpperCase()

            const mangaItem: MangaItem = {
              id: String(id++),
              title: comic.title,
              path: comic.path,
              folderPath,
              sourceType: comic.source_type,
              isFavorite: false,
              currentPage: 0,
              totalPages: 0,
              addedDate: new Date().toISOString(),
              lastOpened: '',
              formatText,
              fileSizeText: '',
              progressPercentage: 0,
              coverThumbnail: null,
            }
            allManga.push(mangaItem)

            allComics.push({
              path: comic.path,
              title: comic.title,
              source_type: comic.source_type,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }
        }
      } catch (e) {
        console.error(`扫描目录 ${path} 失败:`, e)
        set({ error: `扫描目录 "${path}" 失败: ${e}` })
      }
    }

    if (allComics.length > 0) {
      await batchSaveComicMetadata(allComics)
    }

    let allSubfolders: string[] = []
    if (paths.length > 0) {
      try {
        allSubfolders = await invoke<string[]>('get_all_subfolders', { rootPath: paths[0] })
      } catch (e) {
        console.error('获取子文件夹列表失败:', e)
        set({ error: '获取子文件夹列表失败' })
      }
    }

    const folderTree = buildFolderTree(paths, allManga, allSubfolders)

    const favComics = await invoke<ComicMetadata[]>('get_favorite_comics')
    const favPaths = new Set(favComics.map(c => c.path))
    const updatedManga = allManga.map(m => ({
      ...m,
      isFavorite: favPaths.has(m.path),
    }))

    const totalCount = updatedManga.length
    const totalPages = Math.max(1, Math.ceil(totalCount / 50))
    const paged = updatedManga.slice(0, 50)

    setLoading(false)
    onComplete()

    return {
      mangaList: updatedManga,
      comicMetadataList: allComics,
      folderTree,
      totalCount,
      totalPages,
      pagedMangaList: paged,
    }
  } catch (e) {
    setLoading(false)
    throw e
  }
}

export const useMangaStore = create<MangaStore>((set, get) => ({
  mangaList: [],
  filteredMangaList: [],
  pagedMangaList: [],
  folderTree: [],
  libraryPaths: [],
  isLoading: false,
  isScanning: false,
  error: null,
  searchQuery: '',
  currentViewMode: 'library',
  showTagCloud: false,
  showTagManagement: false,
  selectedFolder: null,
  selectedFolderName: '',
  selectedManga: null,
  selectedTag: null,
  mangaTags: [],
  allTags: [],
  currentPage: 1,
  pageSize: 50,
  totalCount: 0,
  totalFilteredCount: 0,
  totalPages: 0,
  sortBy: 'name',
  coverSize: 180,

  loadLibrary: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await invoke<{ library_paths: string[] }>('load_settings')
      const paths = settings.library_paths || []
      set({ libraryPaths: paths })

      if (paths.length > 0) {
        set({ selectedFolder: paths[0], selectedFolderName: paths[0] })
      }

      const result = await scanAndBuildMangaList({
        paths,
        setLoading: (loading) => set({ isLoading: loading }),
        onComplete: () => get().loadAllTags(),
      })

      set({ 
        mangaList: result.mangaList, 
        filteredMangaList: result.mangaList,
        pagedMangaList: result.pagedMangaList,
        folderTree: result.folderTree,
        totalCount: result.totalCount,
        totalFilteredCount: result.totalCount,
        totalPages: result.totalPages,
        isLoading: false 
      })
    } catch (e) {
      set({ error: `加载书库失败: ${e}`, isLoading: false })
    }
  },

  addLibraryPath: async (path: string) => {
    try {
      const paths = await invoke<string[]>('add_library_path', { path })
      set({ libraryPaths: paths })
      await get().scanAndLoad()
    } catch (e) {
      set({ error: `添加路径失败: ${e}` })
    }
  },

  removeLibraryPath: async (path: string) => {
    try {
      const paths = await invoke<string[]>('remove_library_path', { path })
      set({ libraryPaths: paths })
      await get().scanAndLoad()
    } catch (e) {
      set({ error: `移除路径失败: ${e}` })
    }
  },

  scanAndLoad: async () => {
    set({ isScanning: true, error: null })
    try {
      const paths = get().libraryPaths

      const result = await scanAndBuildMangaList({
        paths,
        setLoading: (loading) => set({ isScanning: loading }),
        onComplete: () => get().applyFilters(),
      })

      set({ 
        mangaList: result.mangaList, 
        filteredMangaList: result.mangaList,
        pagedMangaList: result.pagedMangaList,
        folderTree: result.folderTree,
        totalCount: result.totalCount,
        totalFilteredCount: result.totalCount,
        totalPages: result.totalPages,
        isScanning: false 
      })
    } catch (e) {
      set({ error: `扫描失败: ${e}`, isScanning: false })
    }
  },

  saveToDatabase: async (manga: MangaItem) => {
    try {
      const metadata: ComicMetadata = {
        path: manga.path,
        title: manga.title,
        source_type: manga.sourceType,
        page_count: manga.totalPages || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await saveComicMetadata(metadata)
    } catch (e) {
      console.error(`保存漫画元数据失败:`, e)
      set({ error: '保存漫画元数据失败' })
    }
  },

  updateReadingProgress: async (mangaId: string, currentPage: number, totalPages: number) => {
    try {
      const manga = get().mangaList.find(m => m.id === mangaId)
      if (manga) {
        set(state => ({
          mangaList: state.mangaList.map(m => 
            m.id === mangaId 
              ? { ...m, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
              : m
          ),
          selectedManga: state.selectedManga && state.selectedManga.id === mangaId
            ? { ...state.selectedManga, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
            : state.selectedManga
        }))
        
        await invoke('save_reading_progress', { 
          comicId: parseInt(mangaId), 
          currentPage, 
          totalPages 
        })
      }
    } catch (e) {
      console.error(`保存阅读进度失败:`, e)
      set({ error: '保存阅读进度失败' })
    }
  },

  toggleFavorite: async (manga: MangaItem) => {
    try {
      const comicId = await getComicIdByPath(manga.path)
      
      if (!comicId) return
      
      const isFav = await invoke<boolean>('is_favorite', { comicId })
      
      if (isFav) {
        await invoke('remove_from_favorites', { comicId })
      } else {
        await invoke('add_to_favorites', { comicId })
      }
      
      const newFavState = !isFav
      
      set(state => ({
        mangaList: state.mangaList.map(m => 
          m.id === manga.id ? { ...m, isFavorite: newFavState } : m
        ),
        filteredMangaList: state.filteredMangaList.map(m => 
          m.id === manga.id ? { ...m, isFavorite: newFavState } : m
        ),
        selectedManga: state.selectedManga && state.selectedManga.id === manga.id
          ? { ...state.selectedManga, isFavorite: newFavState }
          : state.selectedManga
      }))
    } catch (e) {
      console.error(`切换收藏状态失败:`, e)
      set({ error: '切换收藏状态失败' })
    }
  },

  selectFolder: (folderPath: string) => {
    set({ 
      selectedFolder: folderPath,
      selectedFolderName: folderPath,
      currentPage: 1,
    })
    get().applyFilters()
  },

  selectManga: async (manga: MangaItem | null) => {
    set({ selectedManga: manga })
    if (manga) {
      await get().loadMangaTags(manga)
      try {
        const comic = await getComicByPath(manga.path)
        if (comic) {
          const updatedManga = {
            ...manga,
            addedDate: comic.created_at || manga.addedDate,
            lastOpened: comic.last_opened || manga.lastOpened,
          }
          set({ selectedManga: updatedManga })
        }
      } catch (e) {
        console.error('加载漫画元数据失败:', e)
        set({ error: '加载漫画元数据失败' })
      }
    } else {
      set({ mangaTags: [] })
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, selectedTag: null, currentPage: 1 })
    get().applyFilters()
  },

  setViewMode: (mode: 'library' | 'favorites' | 'tags') => {
    set({ currentViewMode: mode, showTagCloud: mode === 'tags' })
    get().applyFilters()
  },

  toggleTagCloud: () => {
    set(state => ({ 
      showTagCloud: !state.showTagCloud,
      currentViewMode: !state.showTagCloud ? 'tags' : 'library'
    }))
  },

  toggleTagManagement: () => {
    set(state => ({ showTagManagement: !state.showTagManagement }))
  },

  setSortBy: (sortBy: string) => {
    set({ sortBy, currentPage: 1 })
    get().applyFilters()
  },

  setPage: (page: number) => {
    set({ currentPage: page })
  },

  setCoverSize: (size: number) => {
    set({ coverSize: size })
  },

  applyFilters: async () => {
    const { mangaList, searchQuery, selectedFolder, selectedTag, currentViewMode, sortBy, currentPage, pageSize } = get()
    
    let filtered = [...mangaList]
    
    if (currentViewMode === 'favorites') {
      filtered = filtered.filter(m => m.isFavorite)
    } else if (currentViewMode === 'tags' && !selectedTag) {
      // 标签模式且未选择标签时，显示标签列表（由前端组件处理）
      const totalCount = filtered.length
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
      const start = (currentPage - 1) * pageSize
      const paged = filtered.slice(start, start + pageSize)
      
      set({ 
        filteredMangaList: filtered,
        pagedMangaList: paged,
        totalFilteredCount: totalCount,
        totalPages,
      })
      return
    }
    
    if (selectedFolder && !selectedTag) {
      filtered = filtered.filter(m => m.folderPath.startsWith(selectedFolder))
    }
    
    if (selectedTag) {
      const comics = await invoke<ComicMetadata[]>('get_comics_by_tag', { tagName: selectedTag })
      const comicPaths = new Set(comics.map(c => c.path))
      filtered = filtered.filter(m => comicPaths.has(m.path))
    } else if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => m.title.toLowerCase().includes(query))
    }
    
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title)
        case 'date':
          return b.addedDate.localeCompare(a.addedDate)
        case 'type':
          return a.sourceType.localeCompare(b.sourceType)
        default:
          return 0
      }
    })
    
    const totalCount = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const start = (currentPage - 1) * pageSize
    const paged = filtered.slice(start, start + pageSize)
    
    set({ 
      filteredMangaList: filtered,
      pagedMangaList: paged,
      totalFilteredCount: totalCount,
      totalPages,
    })
  },

  loadMangaTags: async (manga: MangaItem) => {
    try {
      const comicId = await getComicIdByPath(manga.path)
      if (comicId) {
        const tags = await invoke<Tag[]>('get_comic_tags', { comicId })
        set({ mangaTags: tags })
      }
    } catch (e) {
      console.error(`加载标签失败:`, e)
      set({ error: '加载标签失败' })
    }
  },

  addTag: async (manga: MangaItem, tagName: string) => {
    try {
      const comicId = await getComicIdByPath(manga.path)
      if (comicId) {
        await invoke('add_tag_to_comic', { comicId, tagName })
        await get().loadMangaTags(manga)
        await get().loadAllTags()
      }
    } catch (e) {
      console.error(`添加标签失败:`, e)
      set({ error: '添加标签失败' })
    }
  },

  removeTag: async (manga: MangaItem, tagId: number) => {
    try {
      const comicId = await getComicIdByPath(manga.path)
      if (comicId) {
        await invoke('remove_tag_from_comic', { comicId, tagId })
        await get().loadMangaTags(manga)
        await get().loadAllTags()
      }
    } catch (e) {
      console.error(`移除标签失败:`, e)
      set({ error: '移除标签失败' })
    }
  },

  loadAllTags: async () => {
    try {
      const tags = await invoke<Tag[]>('get_all_tags')
      set({ allTags: tags })
    } catch (e) {
      console.error(`加载所有标签失败:`, e)
      set({ error: '加载所有标签失败' })
    }
  },

  selectTag: async (tagName: string | null) => {
    set({ 
      selectedTag: tagName,
      currentPage: 1,
    })
    await get().applyFilters()
  },

  loadFavorites: async () => {
    try {
      const favComics = await invoke<ComicMetadata[]>('get_favorite_comics')
      const favPaths = new Set(favComics.map(c => c.path))
      
      set(state => ({
        mangaList: state.mangaList.map(m => ({
          ...m,
          isFavorite: favPaths.has(m.path),
        })),
      }))
      get().applyFilters()
    } catch (e) {
      console.error(`加载收藏失败:`, e)
      set({ error: '加载收藏失败' })
    }
  },
}))
