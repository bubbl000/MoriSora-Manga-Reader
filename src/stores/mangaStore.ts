import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { saveComicMetadata, ComicMetadata } from '../services/databaseService'

export interface MangaItem {
  id: string
  title: string
  path: string
  sourceType: string
  isFavorite?: boolean
  currentPage?: number
  totalPages?: number
}

interface MangaStore {
  mangaList: MangaItem[]
  libraryPaths: string[]
  isLoading: boolean
  isScanning: boolean
  error: string | null

  loadLibrary: () => Promise<void>
  addLibraryPath: (path: string) => Promise<void>
  removeLibraryPath: (index: number) => Promise<void>
  scanAndLoad: () => Promise<void>
  saveToDatabase: (manga: MangaItem) => Promise<void>
  updateReadingProgress: (mangaId: string, currentPage: number, totalPages: number) => Promise<void>
  toggleFavorite: (mangaId: string) => Promise<void>
}

export const useMangaStore = create<MangaStore>((set, get) => ({
  mangaList: [],
  libraryPaths: [],
  isLoading: false,
  isScanning: false,
  error: null,

  loadLibrary: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await invoke< { library_paths: string[] }>('load_settings')
      const paths = settings.library_paths || []
      set({ libraryPaths: paths })

      const allManga: MangaItem[] = []
      let id = 1

      for (const path of paths) {
        try {
          const result = await invoke<{ comics: Array<{ path: string; title: string; source_type: string }>; error: string | null }>('scan_directory', { directory: path })
          
          if (result.comics) {
            for (const comic of result.comics) {
              const mangaItem: MangaItem = {
                id: String(id++),
                title: comic.title,
                path: comic.path,
                sourceType: comic.source_type,
              }
              allManga.push(mangaItem)
              
              await get().saveToDatabase(mangaItem)
            }
          }
        } catch (e) {
          console.error(`扫描目录 ${path} 失败:`, e)
        }
      }

      set({ mangaList: allManga, isLoading: false })
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

  removeLibraryPath: async (index: number) => {
    try {
      const paths = await invoke<string[]>('remove_library_path', { index })
      set({ libraryPaths: paths })
      await get().scanAndLoad()
    } catch (e) {
      set({ error: `移除路径失败: ${e}` })
    }
  },

  scanAndLoad: async () => {
    set({ isScanning: true, error: null })
    try {
      const allManga: MangaItem[] = []
      let id = 1
      const paths = get().libraryPaths

      for (const path of paths) {
        try {
          const result = await invoke<{ comics: Array<{ path: string; title: string; source_type: string }>; error: string | null }>('scan_directory', { directory: path })
          
          if (result.comics) {
            for (const comic of result.comics) {
              const mangaItem: MangaItem = {
                id: String(id++),
                title: comic.title,
                path: comic.path,
                sourceType: comic.source_type,
              }
              allManga.push(mangaItem)
              
              await get().saveToDatabase(mangaItem)
            }
          }
        } catch (e) {
          console.error(`扫描目录 ${path} 失败:`, e)
        }
      }

      set({ mangaList: allManga, isScanning: false })
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
        page_count: manga.totalPages || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await saveComicMetadata(metadata)
    } catch (e) {
      console.error(`保存漫画元数据失败:`, e)
    }
  },

  updateReadingProgress: async (mangaId: string, currentPage: number, totalPages: number) => {
    try {
      const manga = get().mangaList.find(m => m.id === mangaId)
      if (manga) {
        set(state => ({
          mangaList: state.mangaList.map(m => 
            m.id === mangaId 
              ? { ...m, currentPage, totalPages }
              : m
          )
        }))
        
        await invoke('save_reading_progress', { 
          comicId: parseInt(mangaId), 
          currentPage, 
          totalPages 
        })
      }
    } catch (e) {
      console.error(`保存阅读进度失败:`, e)
    }
  },

  toggleFavorite: async (mangaId: string) => {
    try {
      const manga = get().mangaList.find(m => m.id === mangaId)
      if (manga) {
        const isFav = await invoke<boolean>('is_favorite', { comicId: parseInt(mangaId) })
        
        if (isFav) {
          await invoke('remove_from_favorites', { comicId: parseInt(mangaId) })
        } else {
          await invoke('add_to_favorites', { comicId: parseInt(mangaId) })
        }
        
        set(state => ({
          mangaList: state.mangaList.map(m => 
            m.id === mangaId 
              ? { ...m, isFavorite: !isFav }
              : m
          )
        }))
      }
    } catch (e) {
      console.error(`切换收藏状态失败:`, e)
    }
  },
}))
