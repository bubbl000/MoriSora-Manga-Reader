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
- **路由**：React Router

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
| react-router-dom | 6 | 路由管理 |
| zustand | 5 | 状态管理 |
| react-icons | 5 | 图标库 |
| framer-motion | 11 | 动画效果 |

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
│   ├── hooks/              # 自定义Hooks
│   ├── services/           # 服务层
│   ├── stores/             # 状态管理
│   ├── types/              # TypeScript类型定义
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── src-tauri/              # Rust后端
│   ├── src/                # Rust源码
│   │   ├── main.rs         # 主入口
│   │   └── lib.rs          # 核心库
│   ├── capabilities/       # Tauri权限配置
│   ├── Cargo.toml          # Rust依赖
│   └── tauri.conf.json     # Tauri配置
├── public/                 # 静态资源
├── package.json            # 前端依赖配置
├── tsconfig.json           # TypeScript配置
├── tailwind.config.js      # TailwindCSS配置
└── vite.config.ts          # Vite配置
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
- 🔄 **阶段5：阅读器优化** - 进行中
  - 阅读器体验优化
  - UI改进

### 架构说明

**多窗口架构**：
- **主窗口**：书库管理界面
- **阅读器窗口**：双击漫画卡片打开独立窗口
- **多窗口支持**：可同时打开多个阅读器窗口

**窗口创建方式**：前端通过 `WebviewWindow` API 创建（参考 [Comic Shelf](https://github.com/lukasbach/comic-shelf) 项目）

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

## 📄 许可证

本项目采用 MIT 许可证。
