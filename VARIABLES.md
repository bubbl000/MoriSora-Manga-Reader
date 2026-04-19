# 变量索引

| 变量名 | 类型 | 描述 | 出现位置 | 频率 |
|--------|------|------|----------|------|
| `library_paths` | Vec\<String\> | 用户添加的漫画库目录路径列表 | settings.rs, SettingsDialog.tsx, mangaStore.ts | 高频 |
| `mangaList` | MangaItem[] | 扫描到的漫画列表 | mangaStore.ts, LibraryView.tsx | 高频 |
| `MangaItem.id` | string | 漫画唯一标识 | mangaStore.ts, ReaderView.tsx | 高频 |
| `MangaItem.title` | string | 漫画标题 | mangaStore.ts, LibraryView.tsx | 高频 |
| `MangaItem.path` | string | 漫画文件/文件夹完整路径 | mangaStore.ts, ReaderView.tsx | 高频 |
| `MangaItem.sourceType` | string | 来源类型：folder/cbz/zip/cbr/rar/pdf | mangaStore.ts, LibraryView.tsx, ReaderView.tsx | 高频 |
| `MangaItem.isFavorite` | bool | 是否收藏 | mangaStore.ts | 中频 |
| `MangaItem.currentPage` | number | 当前阅读页码 | mangaStore.ts | 中频 |
| `MangaItem.totalPages` | number | 总页数 | mangaStore.ts | 中频 |
| `imageCache` | Record\<number, string\> | 已加载图片的页码到URL缓存 | ReaderView.tsx | 高频 |
| `currentImageSrc` | string | 当前显示的图片URL | ReaderView.tsx | 高频 |
| `currentPage` | number | 当前显示的页码 | ReaderView.tsx | 高频 |
| `mangaPath` | string | 当前打开的漫画路径 | ReaderView.tsx | 高频 |
| `mangaType` | string | 当前漫画类型：folder/archive/pdf | ReaderView.tsx | 高频 |
| `ComicMetadata.path` | string | 数据库中的漫画路径（唯一键） | database.rs, databaseService.ts | 高频 |
| `ComicMetadata.title` | string | 数据库中的漫画标题 | database.rs, databaseService.ts | 高频 |
| `ComicMetadata.source_type` | string | 数据库中的来源类型 | database.rs, databaseService.ts | 高频 |
| `ComicMetadata.page_count` | number | 数据库中的页数 | database.rs, databaseService.ts | 中频 |
| `ComicMetadata.last_opened` | string | 最后打开时间 | database.rs | 中频 |
| `ReadingProgress.comic_id` | number | 阅读进度关联的漫画ID | database.rs, databaseService.ts | 中频 |
| `ReadingProgress.current_page` | number | 当前阅读页 | database.rs, databaseService.ts | 中频 |
| `ReadingProgress.total_pages` | number | 总页数 | database.rs, databaseService.ts | 中频 |
| `Tag.name` | string | 标签名称 | database.rs, databaseService.ts | 低频 |
| `ArchivePageInfo.page_number` | number | 压缩包内页面序号 | archive_parser.rs, ReaderView.tsx | 高频 |
| `ArchivePageInfo.entry_path` | string | 压缩包内条目路径 | archive_parser.rs, ReaderView.tsx | 高频 |
| `ArchivePageInfo.file_name` | string | 压缩包内文件名 | archive_parser.rs, ReaderView.tsx | 高频 |
| `ComicCandidate.path` | string | 扫描候选项的文件路径 | library_scanner.rs | 中频 |
| `ComicCandidate.title` | string | 扫描候选项的标题 | library_scanner.rs | 中频 |
| `ComicCandidate.source_type` | string | 扫描候选项的类型 | library_scanner.rs | 中频 |
| `AppSettings` | object | 应用设置对象 | settings.rs | 中频 |
| `DATABASE_VERSION` | u32 | 数据库版本号 | database.rs | 低频 |

## 常量

| 常量名 | 值 | 描述 | 出现位置 |
|--------|-----|------|----------|
| `IMAGE_EXTENSIONS` | jpg/jpeg/png/webp/bmp/gif | 支持的图片格式 | library_scanner.rs |
| `COMIC_EXTENSIONS` | cbz/zip/cbr/rar | 支持的压缩包格式 | library_scanner.rs |
| `PDF_EXTENSION` | pdf | PDF格式扩展名 | library_scanner.rs |
| `DATABASE_VERSION` | 1 | 数据库版本 | database.rs |

## 数据库表

| 表名 | 描述 | 关键字段 |
|------|------|----------|
| `comic_metadata` | 漫画元数据 | id, path(UNIQUE), title, source_type, page_count |
| `reading_progress` | 阅读进度 | comic_id(UNIQUE), current_page, total_pages |
| `favorites` | 收藏记录 | comic_id(UNIQUE) |
| `tags` | 标签定义 | id, name(UNIQUE) |
| `comic_tags` | 漫画-标签关联 | comic_id, tag_id(UNIQUE组合) |
