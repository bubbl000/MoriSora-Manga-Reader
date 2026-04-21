use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use lazy_static::lazy_static;

static SETTINGS_PATH: &str = "manga-reader-settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub library_paths: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            library_paths: Vec::new(),
        }
    }
}

// 设置缓存，避免频繁读写文件
lazy_static! {
    static ref CACHED_SETTINGS: Mutex<Option<AppSettings>> = Mutex::new(None);
}

pub fn get_settings_path() -> PathBuf {
    let mut path = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("manga-reader");
    path.push(SETTINGS_PATH);
    path
}

pub fn load_settings() -> Result<AppSettings, String> {
    // 先检查缓存
    {
        let cache = CACHED_SETTINGS.lock().unwrap();
        if let Some(settings) = cache.as_ref() {
            return Ok(settings.clone());
        }
    }
    
    // 缓存未命中，从磁盘加载
    let path = get_settings_path();
    
    if !path.exists() {
        let settings = AppSettings::default();
        save_settings_internal(&settings)?;
        // 更新缓存
        let mut cache = CACHED_SETTINGS.lock().unwrap();
        *cache = Some(settings.clone());
        return Ok(settings);
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("无法读取设置文件: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("设置文件格式错误: {}", e))?;
    
    // 更新缓存
    let mut cache = CACHED_SETTINGS.lock().unwrap();
    *cache = Some(settings.clone());
    
    Ok(settings)
}

fn save_settings_internal(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建设置目录: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("无法序列化设置: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("无法写入设置文件: {}", e))?;
    
    Ok(())
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    save_settings_internal(settings)?;
    // 更新缓存
    let mut cache = CACHED_SETTINGS.lock().unwrap();
    *cache = Some(settings.clone());
    Ok(())
}

pub fn add_library_path(path: String) -> Result<Vec<String>, String> {
    let mut settings = load_settings()?;
    
    if !settings.library_paths.contains(&path) {
        settings.library_paths.push(path);
        save_settings(&settings)?;
    }
    
    Ok(settings.library_paths)
}

pub fn remove_library_path(path: &str) -> Result<Vec<String>, String> {
    let mut settings = load_settings()?;
    let initial_len = settings.library_paths.len();
    settings.library_paths.retain(|p| p != path);
    if settings.library_paths.len() == initial_len {
        return Err(format!("路径不存在: {}", path));
    }
    save_settings(&settings)?;
    Ok(settings.library_paths)
}

pub fn get_library_paths() -> Result<Vec<String>, String> {
    let settings = load_settings()?;
    Ok(settings.library_paths)
}
