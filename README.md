# 📚 Manga Reader - 漫画阅读器

基于 **Rust + Tauri + React** 技术栈的跨平台漫画阅读器，支持本地漫画文件管理和阅读，提供现代化的用户体验。

## 🎯 项目目标

开发一个跨平台漫画阅读器，支持本地漫画文件管理和阅读，提供现代化的用户体验。

### 非目标
- 不支持在线漫画抓取
- 不支持云端同步
- 不支持社交分享

## 🛠️ 技术栈

- **前端**：React 18 + TypeScript + TailwindCSS
- **后端**：Rust + Tauri 2
- **数据存储**：SQLite
- **构建工具**：Vite 6
- **状态管理**：Zustand

## 📦 依赖库

### Rust 后端
| 依赖 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | Tauri框架核心 |
| serde | 1 | 序列化/反序列化 |
| zip | 0.6 | CBZ/ZIP漫画文件解析 |
| image | 0.24 | 图片处理 |
| rusqlite | 0.31 | SQLite数据库操作 |

### 前端
| 依赖 | 版本 | 用途 |
|------|------|------|
| @tauri-apps/api | 2 | Tauri前端API |
| react | 18 | UI框架 |
| react-dom | 18 | React DOM渲染 |
| zustand | 5 | 状态管理 |
| react-icons | 5 | 图标库 |
| pdfjs-dist | 5 | PDF渲染引擎 |

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- Rust >= 1.70
- npm 或 pnpm

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run tauri dev
```

### 构建发布版本
```bash
npm run tauri build
```

## 📁 项目结构

```
manga-reader/
├── src/                    # React前端源码
│   ├── components/         # UI组件
│   │   ├── LibraryView.tsx # 书库管理界面
│   │   ├── ReaderView.tsx  # 阅读器界面
│   │   └── SettingsDialog.tsx
│   ├── hooks/              # 自定义Hooks
│   ├── services/           # 服务层
│   │   ├── databaseService.ts
│   │   └── eventService.ts
│   ├── stores/             # 状态管理
│   │   └── mangaStore.ts   # Zustand 状态存储
│   ├── types/              # TypeScript类型定义
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── src-tauri/              # Rust后端
│   ├── src/                # Rust源码
│   │   ├── main.rs         # 主入口
│   │   ├── lib.rs          # 核心库声明
│   │   ├── archive_cache.rs # ZIP/CBR 缓存模块
│   │   ├── archive_parser.rs # 档案解析器
│   │   ├── database.rs     # 数据库操作
│   │   ├── events.rs       # 事件系统
│   │   ├── file_operations.rs # 文件操作
│   │   ├── folder_manager.rs  # 文件夹管理
│   │   ├── library_scanner.rs # 目录扫描
│   │   ├── perf.rs         # 性能监控
│   │   ├── settings.rs     # 设置管理
│   │   └── sort_utils.rs   # 排序算法
│   ├── capabilities/       # Tauri权限配置
│   ├── Cargo.toml          # Rust依赖
│   └── tauri.conf.json     # Tauri配置
├── public/                 # 静态资源
├── package.json            # 前端依赖配置
├── tsconfig.json           # TypeScript配置
├── tailwind.config.js      # TailwindCSS配置
├── vite.config.ts          # Vite配置
├── PERFORMANCE_REPORT.md   # 性能分析报告
└── 迭代信息.md              # 迭代记录
```

## 🎨 UI设计

### 颜色系统
参考 MangaReader 项目的界面风格：

| 资源键 | 颜色值 | 用途 |
|--------|--------|------|
| AccentBrush | #CBE93A | 主题色（亮绿） |
| AccentHoverBrush | #B5D033 | 主题色悬停 |
| BgMainBrush | #1A1A1A | 主背景 |
| BgPanelBrush | #212121 | 面板背景 |
| BgCardBrush | #272727 | 卡片背景 |
| TextPrimaryBrush | #E0E0E0 | 主要文字 |
| TextSecBrush | #909090 | 次要文字 |

## 📋 开发计划

详见 [迭代信息.md](./迭代信息.md)

### 当前阶段
- ✅ **阶段1：项目初始化** - 已完成
- ✅ **阶段2：多窗口架构** - 已完成
- ✅ **阶段3：文件解析系统** - 已完成
  - ✅ CBZ/ZIP格式支持
  - ✅ CBR/RAR格式支持
  - ✅ PDF格式支持
  - ✅ 目录扫描功能
  - ✅ 自然排序算法
- ✅ **阶段4：数据持久化** - 已完成
  - ✅ SQLite数据库设计
  - ✅ 漫画元数据存储
  - ✅ 阅读进度记录
  - ✅ 收藏和标签系统
- ✅ **阶段5：书库管理** - 已完成
  - ✅ 三栏可拖拽布局
  - ✅ 文件夹树导航
  - ✅ 漫画封面网格展示
  - ✅ 搜索和过滤
  - ✅ 排序（名称/时间/类型）
  - ✅ 拖拽导入
  - ✅ 右键菜单系统
  - ✅ 标签管理和筛选
  - ✅ 收藏系统
- ✅ **阶段6：拖放交互优化** - 已完成
  - ✅ 文件夹拖入文件夹
  - ✅ 漫画卡片拖入文件夹
  - ✅ 浮动拖拽提示效果
  - ✅ 拖拽高亮反馈
- ✅ **阶段7：阅读器优化** - 已完成
  - ✅ 键盘快捷键支持
  - ✅ 鼠标滚轮翻页
  - ✅ 缩放模式
  - ✅ 三种阅读模式（单页/双页/滚动）
  - ✅ 自动翻页功能
- ✅ **阶段8：性能优化与稳定性** - 已完成
  - ✅ Blob URL 内存泄漏修复
  - ✅ 快速翻页竞态条件修复
  - ✅ 数据库连接池优化
  - ✅ 批量数据插入优化
  - ✅ 符号链接循环防护
  - ✅ 递归深度限制
- ✅ **阶段9：深度性能优化与事件系统** - 已完成
  - ✅ 设置按路径值删除（安全删除）
  - ✅ 移除未使用依赖（react-router-dom, framer-motion）
  - ✅ 事件通知机制（events.rs + eventService.ts）
  - ✅ 图片压缩功能（Canvas 压缩，maxWidth 1920）
  - ✅ Scroll 模式虚拟滚动（按需加载）
  - ✅ LRU 缓存淘汰策略完善
- ✅ **阶段10：性能分析与优化实施** - 已完成
  - ✅ 性能分析工具安装（flamegraph, call-stack）
  - ✅ 自定义性能监控模块（perf.rs）
  - ✅ SQLite 查询计划分析（EXPLAIN QUERY PLAN）
  - ✅ natural_cmp 正则缓存（LazyLock）
  - ✅ count_manga_in_folder SQL LIKE 优化
  - ✅ batch_upsert RETURNING 子句优化
  - ✅ 前端性能监控（mangaStore.ts）
- ✅ **阶段11：剩余性能优化** - 已完成
  - ✅ ZIP/CBR 压缩包缓存（archive_cache.rs）
  - ✅ CBR 解压缓存（O(N) → O(1)）
  - ✅ 图片后端压缩（image crate）
  - ✅ restoreReadingProgress 按路径查询
  - ✅ PDF createObjectURL 替代 FileReader
  - ✅ sort_utils 提前返回优化
  - ✅ 事件日志静默处理
  - ✅ 设置缓存避免频繁读写
- ✅ **阶段12：性能监控完善与测试验证** - 已完成
  - ✅ perf.rs 图片大小统计（record_image_size / get_image_size_stats）
  - ✅ archive_cache.rs 缓存命中率统计（CacheStats / print_cache_stats）
  - ✅ read_image_bytes 图片大小记录与日志输出
  - ✅ 应用退出时汇总输出（print_summary / print_cache_stats）
  - ✅ get_or_load_zip / get_or_extract_cbr 性能计时

### 架构说明

**多窗口架构**：
- **主窗口**：书库管理界面
- **阅读器窗口**：双击漫画卡片打开独立窗口
- **多窗口支持**：可同时打开多个阅读器窗口

**窗口创建方式**：前端通过 `WebviewWindow` API 创建（参考 [Comic Shelf](https://github.com/lukasbach/comic-shelf) 项目）

### 右键菜单功能

**文件夹右键菜单**：
- 在资源管理器中打开
- 新增子文件夹
- 刷新书库
- 删除（弹窗提示影响的漫画数量）

**漫画卡片右键菜单**：
- 在资源管理器中打开（高亮选中文件）
- 刷新书库
- 删除（确认弹窗）

### 拖放功能

**文件夹拖放**：
- 长按文件夹拖动到另一个文件夹上
- 浮动提示卡片跟随鼠标显示文件夹名称
- 目标文件夹高亮显示（绿色边框）
- 防止将文件夹拖入自身或子文件夹

**漫画卡片拖放**：
- 长按漫画卡片拖动到左侧目录树文件夹
- 浮动提示显示漫画名称和图标
- 释放后漫画文件移动到目标文件夹

### 标签系统

**标签云视图**：
- 显示所有标签及漫画数量
- 点击标签筛选该标签的漫画
- 清除标签返回标签列表
- 标签管理：删除标签

**添加标签**：
- 右侧详情面板为漫画添加/移除标签

## 🙏 开源项目感谢

本项目得益于以下开源项目的启发和参考：

### 核心框架
- **[Tauri](https://github.com/tauri-apps/tauri)** - 轻量级跨平台桌面应用框架，让我们能用Web技术构建高性能原生应用
- **[Rust](https://www.rust-lang.org/)** - 安全高效的系统编程语言

### 前端生态
- **[React](https://react.dev/)** - 用于构建用户界面的JavaScript库
- **[TailwindCSS](https://tailwindcss.com/)** - 实用优先的CSS框架
- **[Zustand](https://github.com/pmndrs/zustand)** - 轻量级状态管理库

### 参考项目
- **[YACReader](https://github.com/MaoTouHU/yacreader-develop)** - 经典的C++漫画阅读器，为文件解析和阅读体验设计提供参考
- **[Comic Shelf](https://github.com/MaoTouHU/comic-shelf-main)** - 基于Tauri的漫画阅读器，为项目架构和代码组织提供参考

感谢这些优秀的开源项目为社区做出的贡献！

## 🔧 性能优化记录

本项目经过全面性能优化，包含性能分析、P0/P1/P2/P3 级别优化。主要优化项如下：

### 性能分析工具
- ✅ cargo-flamegraph / cargo-call-stack 安装
- ✅ 自定义 perf.rs 性能监控模块（start_timer / stop_timer）
- ✅ SQLite EXPLAIN QUERY PLAN 查询计划分析
- ✅ 前端性能监控（printPerfMetrics()）

### 核心性能优化

| 优化项 | 优化前 | 优化后 | 提升倍数 |
|--------|--------|--------|---------|
| 数据库连接 | 每次操作新建连接 | 单一长连接 + 事务 | 10-20x |
| 批量数据插入 | 循环单条插入 + SELECT | 批量事务 + RETURNING | 50-100x |
| N+1 查询 | 每次操作加载全部漫画 | 按路径查询单条 | 99.98% 数据传输减少 |
| Blob URL 内存 | 旧 URL 不释放 | LRU 缓存 + 统一释放 | 消除泄漏 |
| 快速翻页 | 图片与页码不匹配 | 请求序号机制 | 消除竞态 |
| PDF 翻页 | 每页重新解析整个文件 | 缓存文档对象 | 100x (100页PDF) |
| 图片缓存 | 无上限，内存持续增长 | LRU 淘汰策略 (50张) | 控制内存占用 |
| 符号链接循环 | 无限递归栈溢出 | 三层防护机制 | 消除崩溃 |
| natural_cmp 排序 | 每次比较编译正则 | LazyLock 静态缓存 | 排序时间 ↓60-80% |
| count_manga_in_folder | 全量获取 + Rust 过滤 | SQL LIKE 统计 | ↑100-1000x |
| ZIP 翻页 | 每次重新打开文件 | LRU 缓存 (50个) | 响应时间 ↓50-70% |
| CBR 翻页 | O(N) 顺序遍历 | 解压缓存 (10个) | O(N) → O(1) |
| restoreReadingProgress | 加载全部漫画元数据 | 按路径查询 | 数据传输 ↓90% |
| PDF 渲染 | FileReader base64 (+33%) | createObjectURL | 内存 ↓33% |
| 文件夹扫描 | 同目录 N 次 read_dir | HashMap 缓存 | ↑3-10x |
| MangaCard 渲染 | 全量重渲染 | React.memo | 渲染 ↓80-90% |
| 设置读写 | 每次操作读写文件 | 静态缓存 | I/O ↓90%+ |

## 🔨 代码质量优化

本项目进行了全面代码质量提升，主要优化项如下：

| 优化项 | 优化前 | 优化后 | 效果 |
|--------|--------|--------|------|
| 代码重复 | natural_cmp 在两处重复 | 提取到 sort_utils.rs | 消除92行重复 |
| 代码重复 | loadLibrary/scanAndLoad 80%重复 | 提取 scanAndBuildMangaList | 消除140行重复 |
| 组件职责 | LibraryView 1600行 | 提供拆分方案（待实施） | 方案已规划 |
| 组件职责 | ReaderView 577行 | 提供拆分方案（待实施） | 方案已规划 |
| UI 规范 | ZoomSlider 不符合规范 | 符合项目UI规范 | 完全符合 |

## 📄 许可证

本项目采用 MIT 许可证。
