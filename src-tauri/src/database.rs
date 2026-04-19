use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::fs;

const DATABASE_VERSION: u32 = 1;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicTag {
    pub id: Option<i64>,
    pub comic_id: i64,
    pub tag_id: i64,
}

lazy_static::lazy_static! {
    static ref DB_INSTANCE: Mutex<Option<Connection>> = Mutex::new(None);
}

pub fn init_database() -> Result<(), String> {
    let db_path = get_database_path();
    
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建数据库目录: {}", e))?;
    }
    
    let conn = Connection::open(&db_path).map_err(|e| format!("无法打开数据库: {}", e))?;
    
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
    
    let mut db_lock = DB_INSTANCE.lock().unwrap();
    *db_lock = Some(conn);
    
    Ok(())
}

fn get_database_path() -> PathBuf {
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

fn get_connection() -> Result<&'static mut Connection, String> {
    let mut db_lock = DB_INSTANCE.lock().unwrap();
    match db_lock.as_mut() {
        Some(conn) => Ok(unsafe { &mut **(conn as *mut Connection) }),
        None => {
            init_database()?;
            let conn = db_lock.as_mut().unwrap();
            Ok(unsafe { &mut **(conn as *mut Connection) })
        }
    }
}

pub fn upsert_comic_metadata(comic: &ComicMetadata) -> Result<i64, String> {
    let conn = get_connection()?;
    
    let stmt = "
        INSERT INTO comic_metadata (path, title, source_type, page_count, last_opened, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(path) DO UPDATE SET
            title = excluded.title,
            source_type = excluded.source_type,
            page_count = excluded.page_count,
            updated_at = excluded.updated_at
    ";
    
    conn.execute(
        stmt,
        params![
            comic.path,
            comic.title,
            comic.source_type,
            comic.page_count,
            comic.last_opened,
            comic.created_at,
            comic.updated_at,
        ],
    ).map_err(|e| format!("无法插入漫画元数据: {}", e))?;
    
    let id: i64 = conn.query_row(
        "SELECT id FROM comic_metadata WHERE path = ?1",
        params![comic.path],
        |row| row.get(0),
    ).map_err(|e| format!("无法获取漫画ID: {}", e))?;
    
    Ok(id)
}

pub fn get_comic_by_path(path: &str) -> Result<Option<ComicMetadata>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, path, title, source_type, page_count, last_opened, created_at, updated_at 
         FROM comic_metadata WHERE path = ?1"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let comic = stmt.query_row(params![path], |row| {
        Ok(ComicMetadata {
            id: Some(row.get(0)?),
            path: row.get(1)?,
            title: row.get(2)?,
            source_type: row.get(3)?,
            page_count: row.get(4)?,
            last_opened: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).ok();
    
    Ok(comic)
}

pub fn get_all_comics() -> Result<Vec<ComicMetadata>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, path, title, source_type, page_count, last_opened, created_at, updated_at 
         FROM comic_metadata ORDER BY title ASC"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let comics = stmt.query_map(params![], |row| {
        Ok(ComicMetadata {
            id: Some(row.get(0)?),
            path: row.get(1)?,
            title: row.get(2)?,
            source_type: row.get(3)?,
            page_count: row.get(4)?,
            last_opened: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("无法查询漫画数据: {}", e))?
     .filter_map(|r| r.ok())
     .collect();
    
    Ok(comics)
}

pub fn update_comic_last_opened(comic_id: i64) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "UPDATE comic_metadata SET last_opened = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![comic_id],
    ).map_err(|e| format!("无法更新最后打开时间: {}", e))?;
    
    Ok(())
}

pub fn delete_comic_by_path(path: &str) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "DELETE FROM comic_metadata WHERE path = ?1",
        params![path],
    ).map_err(|e| format!("无法删除漫画数据: {}", e))?;
    
    Ok(())
}

pub fn save_reading_progress(comic_id: i64, current_page: i64, total_pages: i64) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "INSERT INTO reading_progress (comic_id, current_page, total_pages, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(comic_id) DO UPDATE SET
            current_page = excluded.current_page,
            total_pages = excluded.total_pages,
            updated_at = excluded.updated_at",
        params![comic_id, current_page, total_pages],
    ).map_err(|e| format!("无法保存阅读进度: {}", e))?;
    
    Ok(())
}

pub fn get_reading_progress(comic_id: i64) -> Result<Option<ReadingProgress>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, comic_id, current_page, total_pages, updated_at 
         FROM reading_progress WHERE comic_id = ?1"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let progress = stmt.query_row(params![comic_id], |row| {
        Ok(ReadingProgress {
            id: Some(row.get(0)?),
            comic_id: row.get(1)?,
            current_page: row.get(2)?,
            total_pages: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }).ok();
    
    Ok(progress)
}

pub fn add_to_favorites(comic_id: i64) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "INSERT INTO favorites (comic_id, created_at) VALUES (?1, datetime('now'))
         ON CONFLICT(comic_id) DO NOTHING",
        params![comic_id],
    ).map_err(|e| format!("无法添加到收藏: {}", e))?;
    
    Ok(())
}

pub fn remove_from_favorites(comic_id: i64) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "DELETE FROM favorites WHERE comic_id = ?1",
        params![comic_id],
    ).map_err(|e| format!("无法从收藏移除: {}", e))?;
    
    Ok(())
}

pub fn is_favorite(comic_id: i64) -> Result<bool, String> {
    let conn = get_connection()?;
    
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM favorites WHERE comic_id = ?1",
        params![comic_id],
        |row| row.get(0),
    ).map_err(|e| format!("无法查询收藏状态: {}", e))?;
    
    Ok(count > 0)
}

pub fn get_favorite_comics() -> Result<Vec<ComicMetadata>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.path, c.title, c.source_type, c.page_count, c.last_opened, c.created_at, c.updated_at 
         FROM comic_metadata c
         INNER JOIN favorites f ON c.id = f.comic_id
         ORDER BY f.created_at DESC"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let comics = stmt.query_map(params![], |row| {
        Ok(ComicMetadata {
            id: Some(row.get(0)?),
            path: row.get(1)?,
            title: row.get(2)?,
            source_type: row.get(3)?,
            page_count: row.get(4)?,
            last_opened: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("无法查询收藏数据: {}", e))?
     .filter_map(|r| r.ok())
     .collect();
    
    Ok(comics)
}

pub fn add_tag_to_comic(comic_id: i64, tag_name: &str) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        params![tag_name],
    ).map_err(|e| format!("无法创建标签: {}", e))?;
    
    let tag_id: i64 = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        params![tag_name],
        |row| row.get(0),
    ).map_err(|e| format!("无法获取标签ID: {}", e))?;
    
    conn.execute(
        "INSERT INTO comic_tags (comic_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
        params![comic_id, tag_id],
    ).map_err(|e| format!("无法关联标签: {}", e))?;
    
    Ok(())
}

pub fn remove_tag_from_comic(comic_id: i64, tag_id: i64) -> Result<(), String> {
    let conn = get_connection()?;
    
    conn.execute(
        "DELETE FROM comic_tags WHERE comic_id = ?1 AND tag_id = ?2",
        params![comic_id, tag_id],
    ).map_err(|e| format!("无法移除标签: {}", e))?;
    
    Ok(())
}

pub fn get_comic_tags(comic_id: i64) -> Result<Vec<Tag>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name 
         FROM tags t
         INNER JOIN comic_tags ct ON t.id = ct.tag_id
         WHERE ct.comic_id = ?1
         ORDER BY t.name ASC"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let tags = stmt.query_map(params![comic_id], |row| {
        Ok(Tag {
            id: Some(row.get(0)?),
            name: row.get(1)?,
        })
    }).map_err(|e| format!("无法查询标签数据: {}", e))?
     .filter_map(|r| r.ok())
     .collect();
    
    Ok(tags)
}

pub fn get_all_tags() -> Result<Vec<Tag>, String> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name FROM tags ORDER BY name ASC"
    ).map_err(|e| format!("无法准备查询语句: {}", e))?;
    
    let tags = stmt.query_map(params![], |row| {
        Ok(Tag {
            id: Some(row.get(0)?),
            name: row.get(1)?,
        })
    }).map_err(|e| format!("无法查询标签数据: {}", e))?
     .filter_map(|r| r.ok())
     .collect();
    
    Ok(tags)
}
