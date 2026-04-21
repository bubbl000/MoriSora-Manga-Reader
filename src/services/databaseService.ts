import { invoke } from '@tauri-apps/api/core'
import { SourceType } from '../types/sourceType'

export interface ComicMetadata {
  id?: number
  path: string
  title: string
  source_type: string
  page_count?: number
  last_opened?: string
  created_at?: string
  updated_at?: string
}

export interface ReadingProgress {
  id?: number
  comic_id: number
  current_page: number
  total_pages: number
  updated_at?: string
}

export interface Tag {
  id?: number
  name: string
}

export const initDatabase = async (): Promise<void> => {
  await invoke('init_db')
}

export const saveComicMetadata = async (comic: ComicMetadata): Promise<number> => {
  return await invoke<number>('save_comic_metadata', { comic })
}

export const batchSaveComicMetadata = async (comics: ComicMetadata[]): Promise<number[]> => {
  return await invoke<number[]>('batch_save_comic_metadata', { comics })
}

export const getAllComicsMetadata = async (): Promise<ComicMetadata[]> => {
  return await invoke<ComicMetadata[]>('get_all_comics_metadata')
}

export const getComicIdByPath = async (path: string): Promise<number | null> => {
  return await invoke<number | null>('get_comic_id_by_path', { path })
}

export const getComicByPath = async (path: string): Promise<ComicMetadata | null> => {
  return await invoke<ComicMetadata | null>('get_comic_by_path', { path })
}

export const updateComicLastOpened = async (comicId: number): Promise<void> => {
  await invoke('update_comic_last_opened', { comicId })
}

export const saveReadingProgress = async (
  comicId: number,
  currentPage: number,
  totalPages: number
): Promise<void> => {
  await invoke('save_reading_progress', { comicId, currentPage, totalPages })
}

export const getReadingProgress = async (comicId: number): Promise<ReadingProgress | null> => {
  return await invoke<ReadingProgress | null>('get_reading_progress', { comicId })
}

export const addToFavorites = async (comicId: number): Promise<void> => {
  await invoke('add_to_favorites', { comicId })
}

export const removeFromFavorites = async (comicId: number): Promise<void> => {
  await invoke('remove_from_favorites', { comicId })
}

export const isFavorite = async (comicId: number): Promise<boolean> => {
  return await invoke<boolean>('is_favorite', { comicId })
}

export const getFavoriteComics = async (): Promise<ComicMetadata[]> => {
  return await invoke<ComicMetadata[]>('get_favorite_comics')
}

export const addTagToComic = async (comicId: number, tagName: string): Promise<void> => {
  await invoke('add_tag_to_comic', { comicId, tagName })
}

export const removeTagFromComic = async (comicId: number, tagId: number): Promise<void> => {
  await invoke('remove_tag_from_comic', { comicId, tagId })
}

export const getComicTags = async (comicId: number): Promise<Tag[]> => {
  return await invoke<Tag[]>('get_comic_tags', { comicId })
}

export const getAllTags = async (): Promise<Tag[]> => {
  return await invoke<Tag[]>('get_all_tags')
}