use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use parking_lot::Mutex;

// ================== Tauri State 管理 ==================

/// 执行 EXPLAIN QUERY PLAN 并打印结果（用于性能分析）
pub fn explain_query(conn: &Connection, sql: &str) {
    let explain_sql = format!("EXPLAIN QUERY PLAN {}", sql);
    if let Ok(mut stmt) = conn.prepare(&explain_sql) {
        if let Ok(rows) = stmt.query_map([], |row| {
            let detail: String = row.get(3)?;
            Ok(detail)
        }) {
            eprintln!("[QUERY PLAN] {}", sql);
            for row_result in rows {
                if let Ok(detail) = row_result {
                    eprintln!("  -> {}", detail);
                }
            }
        }
    }
}

/// 数据库连接状态，通过 Tauri State 管理单一长连接
pub struct AppState {
    pub db_conn: Mutex<Connection>,
}

impl AppState {
    /// 创建新的数据库连接（应用启动时调用一次）
    pub fn new(db_path: &PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建数据库目录: {}", e))?;
        }
        
        let conn = Connection::open(db_path)
            .map_err(|e| format!("无法打开数据库: {}", e))?;
        
        // 启用 WAL 模式和外键约束
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("设置 PRAGMA 失败: {}", e))?;
        
        Ok(Self {
            db_conn: Mutex::new(conn),
        })
    }
    
    /// 执行数据库操作的辅助方法（自动加锁）
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self.db_conn.lock();
        f(&conn).map_err(|e| format!("数据库操作失败: {}", e))
    }
    
    /// 在事务中执行数据库操作（批量插入时使用）
    pub fn with_transaction<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&rusqlite::Transaction) -> Result<T, rusqlite::Error>,
    {
        let mut conn = self.db_conn.lock();
        let tx = conn.transaction()
            .map_err(|e| format!("开启事务失败: {}", e))?;
        
        let result = f(&tx);
        match result {
            Ok(val) => {
                tx.commit().map_err(|e| format!("提交事务失败: {}", e))?;
                Ok(val)
            }
            Err(e) => {
                let _ = tx.rollback();
                Err(format!("事务执行失败: {}", e))
            }
        }
    }
}

// ================== 数据结构定义 ==================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicMetadata {
    pub id: Option<i64>,
    pub path: String,
    pub title: String,
    pub source_type: String,
    pub page_count: Option<i64>,
    pub last_opened: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub current_page: i64,
    #[serde(default)]
    pub total_pages: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub id: Option<i64>,
    pub comic_id: i64,
    pub current_page: i64,
    pub total_pages: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteEntry {
    pub id: Option<i64>,
    pub comic_id: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Option<i64>,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicTag {
    pub id: Option<i64>,
    pub comic_id: i64,
    pub tag_id: i64,
}

// ================== 数据库初始化 ==================

/// 获取数据库路径（供 main.rs 初始化 AppState 使用）
pub fn get_db_path() -> PathBuf {
    let app_data = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else if cfg!(target_os = "macos") {
        format!("{}/Library/Application Support", dirs::home_dir().unwrap_or_default().to_string_lossy())
    } else {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    };
    
    PathBuf::from(app_data).join("manga-reader").join("manga.db")
}

/// 初始化数据库表结构（仅在应用首次启动或版本升级时调用）
pub fn init_database_schema() -> Result<(), String> {
    let db_path = get_db_path();
    
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建数据库目录: {}", e))?;
    }
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库: {}", e))?;
    
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        PRAGMA user_version=1;
        
        CREATE TABLE IF NOT EXISTS comic_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL,
            page_count INTEGER,
            last_opened TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comic_id INTEGER NOT NULL UNIQUE,
            current_page INTEGER NOT NULL DEFAULT 0,
            total_pages INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (comic_id) REFERENCES comic_metadata(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comic_id INTEGER NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (comic_id) REFERENCES comic_metadata(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS comic_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comic_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            UNIQUE(comic_id, tag_id),
            FOREIGN KEY (comic_id) REFERENCES comic_metadata(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        ",
    ).map_err(|e| format!("无法创建表: {}", e))?;
    
    // 数据库版本管理（用于安全迁移）
    let current_version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("查询数据库版本失败: {}", e))?;
    
    // 版本 1: 初始表结构 + 基础索引
    if current_version < 1 {
        conn.execute_batch(
            "
            -- 优化标题排序查询（高频使用）
            CREATE INDEX IF NOT EXISTS idx_comic_metadata_title ON comic_metadata(title);
            
            -- 优化按来源类型过滤
            CREATE INDEX IF NOT EXISTS idx_comic_metadata_source_type ON comic_metadata(source_type);
            
            -- 优化收藏列表按时间倒序查询
            CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC);
            
            -- 更新数据库版本
            PRAGMA user_version=1;
            ",
        ).map_err(|e| format!("版本 1 迁移失败: {}", e))?;
    }
    
    // 版本 2: 添加复合索引和部分索引
    if current_version < 2 {
        conn.execute_batch(
            "
            -- 优化按更新时间查询（最近更新的漫画）
            CREATE INDEX IF NOT EXISTS idx_comic_metadata_updated_at ON comic_metadata(updated_at DESC);
            
            -- 优化按最后打开时间查询（最近打开的漫画）
            CREATE INDEX IF NOT EXISTS idx_comic_metadata_last_opened ON comic_metadata(last_opened DESC) 
            WHERE last_opened IS NOT NULL;
            
            -- 更新数据库版本
            PRAGMA user_version=2;
            ",
        ).map_err(|e| format!("版本 2 迁移失败: {}", e))?;
    }
    
    Ok(())
}

// ================== 辅助函数：从行数据解析 ComicMetadata ==================

fn row_to_comic_metadata(row: &rusqlite::Row) -> rusqlite::Result<ComicMetadata> {
    Ok(ComicMetadata {
        id: Some(row.get(0)?),
        path: row.get(1)?,
        title: row.get(2)?,
        source_type: row.get(3)?,
        page_count: row.get(4)?,
        last_opened: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        current_page: row.get(8).unwrap_or(0),
        total_pages: row.get(9).unwrap_or(0),
    })
}

// ================== 漫画元数据操作 ==================

/// 批量插入/更新漫画元数据（使用事务 + RETURNING，性能提升 10-50 倍）
pub fn batch_upsert_comic_metadata(state: &AppState, comics: &[ComicMetadata]) -> Result<Vec<i64>, String> {
    state.with_transaction(|tx| {
        // 使用 SQLite 3.35+ 支持的 RETURNING 子句，避免额外的 SELECT 查询
        let mut stmt = tx.prepare(
            "INSERT INTO comic_metadata (path, title, source_type, page_count, last_opened, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(path) DO UPDATE SET
                 title = excluded.title,
                 source_type = excluded.source_type,
                 page_count = excluded.page_count,
                 updated_at = excluded.updated_at
             RETURNING id"
        )?;
        
        let mut ids = Vec::with_capacity(comics.len());
        
        for comic in comics {
            let id: i64 = stmt.query_row(params![
                comic.path,
                comic.title,
                comic.source_type,
                comic.page_count,
                comic.last_opened,
                comic.created_at,
                comic.updated_at,
            ], |row| row.get(0))?;
            ids.push(id);
        }
        
        Ok(ids)
    })
}

/// 插入/更新单条漫画元数据
pub fn upsert_comic_metadata(state: &AppState, comic: &ComicMetadata) -> Result<i64, String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO comic_metadata (path, title, source_type, page_count, last_opened, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(path) DO UPDATE SET
                 title = excluded.title,
                 source_type = excluded.source_type,
                 page_count = excluded.page_count,
                 updated_at = excluded.updated_at",
            params![
                comic.path,
                comic.title,
                comic.source_type,
                comic.page_count,
                comic.last_opened,
                comic.created_at,
                comic.updated_at,
            ],
        )?;
        
        conn.query_row(
            "SELECT id FROM comic_metadata WHERE path = ?1",
            params![comic.path],
            |row| row.get(0),
        )
    })
}

/// 根据路径查询漫画（包含阅读进度）
pub fn get_comic_by_path(state: &AppState, path: &str) -> Result<Option<ComicMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.path, c.title, c.source_type, c.page_count, c.last_opened, c.created_at, c.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM comic_metadata c
             LEFT JOIN reading_progress r ON c.id = r.comic_id
             WHERE c.path = ?1"
        )?;
        
        Ok(stmt.query_row(params![path], row_to_comic_metadata)
            .ok())
    })
}

/// 按路径获取漫画 ID（轻量查询，只返回 ID）
pub fn get_comic_id_by_path(state: &AppState, path: &str) -> Result<Option<i64>, String> {
    state.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT id FROM comic_metadata WHERE path = ?1",
            params![path],
            |row| row.get(0),
        ).ok())
    })
}

/// 使用 SQL LIKE 直接统计文件夹中的漫画数量（优化版本）
pub fn count_comics_in_folder(state: &AppState, folder_path: &str) -> Result<usize, String> {
    let conn_guard = state.db_conn.lock();
    
    // 标准化路径分隔符
    let normalized_path = folder_path.replace('/', "\\");
    let pattern = format!("{}%", normalized_path.trim_end_matches('\\').trim_end_matches('/'));
    
    let count: i64 = conn_guard.query_row(
        "SELECT COUNT(*) FROM comic_metadata WHERE path LIKE ?1",
        params![pattern],
        |row| row.get(0),
    ).map_err(|e| format!("统计漫画失败: {}", e))?;
    
    Ok(count as usize)
}

/// 查询所有漫画（包含阅读进度）
pub fn get_all_comics(state: &AppState) -> Result<Vec<ComicMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.path, c.title, c.source_type, c.page_count, c.last_opened, c.created_at, c.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM comic_metadata c
             LEFT JOIN reading_progress r ON c.id = r.comic_id
             ORDER BY c.title ASC"
        )?;
        
        let comics: Vec<ComicMetadata> = stmt.query_map(params![], row_to_comic_metadata)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(comics)
    })
}

/// 更新漫画最后打开时间
pub fn update_comic_last_opened(state: &AppState, comic_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "UPDATE comic_metadata SET last_opened = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![comic_id],
        )?;
        Ok(())
    })
}

/// 根据路径删除漫画
pub fn delete_comic_by_path(state: &AppState, path: &str) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "DELETE FROM comic_metadata WHERE path = ?1",
            params![path],
        )?;
        Ok(())
    })
}

// ================== 阅读进度操作 ==================

/// 保存阅读进度
pub fn save_reading_progress(state: &AppState, comic_id: i64, current_page: i64, total_pages: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO reading_progress (comic_id, current_page, total_pages, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(comic_id) DO UPDATE SET
                current_page = excluded.current_page,
                total_pages = excluded.total_pages,
                updated_at = excluded.updated_at",
            params![comic_id, current_page, total_pages],
        )?;
        Ok(())
    })
}

/// 获取阅读进度
pub fn get_reading_progress(state: &AppState, comic_id: i64) -> Result<Option<ReadingProgress>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, comic_id, current_page, total_pages, updated_at 
             FROM reading_progress WHERE comic_id = ?1"
        )?;
        
        Ok(stmt.query_row(params![comic_id], |row| {
            Ok(ReadingProgress {
                id: Some(row.get(0)?),
                comic_id: row.get(1)?,
                current_page: row.get(2)?,
                total_pages: row.get(3)?,
                updated_at: row.get(4)?,
            })
        }).ok())
    })
}

// ================== 收藏操作 ==================

/// 添加到收藏
pub fn add_to_favorites(state: &AppState, comic_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO favorites (comic_id, created_at) VALUES (?1, datetime('now'))
             ON CONFLICT(comic_id) DO NOTHING",
            params![comic_id],
        )?;
        Ok(())
    })
}

/// 从收藏移除
pub fn remove_from_favorites(state: &AppState, comic_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "DELETE FROM favorites WHERE comic_id = ?1",
            params![comic_id],
        )?;
        Ok(())
    })
}

/// 查询是否在收藏中
pub fn is_favorite(state: &AppState, comic_id: i64) -> Result<bool, String> {
    state.with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE comic_id = ?1",
            params![comic_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

/// 获取所有收藏的漫画（包含阅读进度）
pub fn get_favorite_comics(state: &AppState) -> Result<Vec<ComicMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.path, c.title, c.source_type, c.page_count, c.last_opened, c.created_at, c.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM comic_metadata c
             INNER JOIN favorites f ON c.id = f.comic_id
             LEFT JOIN reading_progress r ON c.id = r.comic_id
             ORDER BY f.created_at DESC"
        )?;
        
        let comics: Vec<ComicMetadata> = stmt.query_map(params![], row_to_comic_metadata)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(comics)
    })
}

// ================== 标签操作 ==================

/// 为漫画添加标签
pub fn add_tag_to_comic(state: &AppState, comic_id: i64, tag_name: &str) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            params![tag_name],
        )?;
        
        let tag_id: i64 = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |row| row.get(0),
        )?;
        
        conn.execute(
            "INSERT INTO comic_tags (comic_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            params![comic_id, tag_id],
        )?;
        
        Ok(())
    })
}

/// 从漫画移除标签
pub fn remove_tag_from_comic(state: &AppState, comic_id: i64, tag_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "DELETE FROM comic_tags WHERE comic_id = ?1 AND tag_id = ?2",
            params![comic_id, tag_id],
        )?;
        Ok(())
    })
}

/// 获取漫画的所有标签
pub fn get_comic_tags(state: &AppState, comic_id: i64) -> Result<Vec<Tag>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name 
             FROM tags t
             INNER JOIN comic_tags ct ON t.id = ct.tag_id
             WHERE ct.comic_id = ?1
             ORDER BY t.name ASC"
        )?;
        
        let tags: Vec<Tag> = stmt.query_map(params![comic_id], |row| {
            Ok(Tag {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                count: 0,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        
        Ok(tags)
    })
}

/// 获取所有标签及其使用次数
pub fn get_all_tags(state: &AppState) -> Result<Vec<Tag>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, COUNT(ct.comic_id) as count 
             FROM tags t
             LEFT JOIN comic_tags ct ON t.id = ct.tag_id
             GROUP BY t.id, t.name
             ORDER BY name ASC"
        )?;
        
        let tags: Vec<Tag> = stmt.query_map(params![], |row| {
            Ok(Tag {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                count: row.get(2)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        
        Ok(tags)
    })
}

/// 删除标签（同时删除关联关系）
pub fn delete_tag_by_name(state: &AppState, tag_name: &str) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "DELETE FROM comic_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = ?1)",
            params![tag_name],
        )?;
        
        conn.execute(
            "DELETE FROM tags WHERE name = ?1",
            params![tag_name],
        )?;
        
        Ok(())
    })
}

/// 根据标签查询漫画（包含阅读进度）
pub fn get_comics_by_tag(state: &AppState, tag_name: &str) -> Result<Vec<ComicMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.path, c.title, c.source_type, c.page_count,
                    c.last_opened, c.created_at, c.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM comic_metadata c
             INNER JOIN comic_tags ct ON c.id = ct.comic_id
             INNER JOIN tags t ON ct.tag_id = t.id
             LEFT JOIN reading_progress r ON c.id = r.comic_id
             WHERE t.name = ?1
             ORDER BY c.title ASC"
        )?;
        
        let comics: Vec<ComicMetadata> = stmt.query_map(params![tag_name], row_to_comic_metadata)?
            .filter_map(|r| r.ok())
            .collect();
        
        Ok(comics)
    })
}
