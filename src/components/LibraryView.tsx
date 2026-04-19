import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

interface MangaItem {
  id: string
  title: string
  cover?: string
}

const mockMangaList: MangaItem[] = [
  { id: '1', title: '漫画示例 1' },
  { id: '2', title: '漫画示例 2' },
  { id: '3', title: '漫画示例 3' },
  { id: '4', title: '漫画示例 4' },
  { id: '5', title: '漫画示例 5' },
  { id: '6', title: '漫画示例 6' },
]

function LibraryView() {
  const handleDoubleClick = async (manga: MangaItem) => {
    try {
      // 参考 comic-shelf-main 的前端窗口创建方式
      // URL格式: /#/reader#{id}#{title} - 确保hash包含#/reader用于App.tsx检测
      const label = `reader-${manga.id}-${Date.now()}`
      const url = `/#reader#${manga.id}#${encodeURIComponent(manga.title)}`

      console.log(`Opening new window: ${label} with URL: ${url}`)

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

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="text-2xl font-bold text-text-primary mb-4">书库</h2>
      <p className="text-text-secondary text-sm mb-4">双击漫画打开阅读器</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {mockMangaList.map((manga) => (
          <div
            key={manga.id}
            onDoubleClick={() => handleDoubleClick(manga)}
            className="bg-bg-card rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent transition-all"
          >
            <div className="aspect-[3/4] bg-bg-hover flex items-center justify-center">
              <span className="text-text-muted text-4xl">📖</span>
            </div>
            <div className="p-2">
              <p className="text-text-primary text-sm truncate">{manga.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LibraryView
