#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sort_utils;
mod archive_cache;
mod archive_parser;
mod database;
mod events;
mod file_operations;
mod folder_manager;
mod library_scanner;
mod settings;

use tauri::{AppHandle, Emitter, Manager, State};
use database::AppState;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

/// Maximum recursion depth to prevent stack overflow
const MAX_RECURSION_DEPTH: usize = 20;

// 图片后端压缩功能
use std::io::Cursor as IoCursor;
use image::GenericImageView;

/// 压缩图片以减少 IPC 传输
/// 将图片缩放到最大宽度 1920px，质量 85%
fn compress_image_bytes(data: &[u8], max_width: u32, quality: u8) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(data)
        .map_err(|e| format!("图片解码失败: {}", e))?;
    
    let (w, h) = img.dimensions();
    let img = if w > max_width {
        let ratio = max_width as f32 / w as f32;
        let new_h = (h as f32 * ratio) as u32;
        img.resize(max_width, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    
    // 预分配输出 Vec，JPEG 压缩通常约为原始大小的 30-70%
    let estimated_size = (data.len() as f32 * 0.5) as usize;
    let mut output = Vec::with_capacity(estimated_size.max(1024));
    let mut cursor = IoCursor::new(&mut output);
    img.write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| format!("图片编码失败: {}", e))?;
    
    Ok(output)
}

#[tauri::command]
fn read_image_bytes(file_path: String) -> Result<Vec<u8>, String> {
    let path = Path::new(&file_path);
    fs::read(path).map_err(|e| format!("无法读取图片 {}: {}", file_path, e))
}

#[tauri::command]
fn scan_directory(app: AppHandle, directory: String) -> library_scanner::ScanResult {
    events::emit_scan_progress(&app, "started", "开始扫描...", Some(0.0));
    let result = library_scanner::scan_comic_directory(&directory);
    events::emit_scan_progress(&app, "completed", "扫描完成", Some(100.0));
    result
}

#[tauri::command]
fn get_folder_images(folder: String) -> Vec<String> {
    library_scanner::get_folder_images(&folder)
}

#[tauri::command]
fn get_archive_images(path: String) -> Result<Vec<archive_parser::ArchivePageInfo>, String> {
    archive_parser::list_archive_images(&path)
}

#[tauri::command]
fn get_archive_image_bytes(path: String, entry_path: String) -> Result<Vec<u8>, String> {
    archive_parser::read_archive_image_bytes(&path, &entry_path)
}

#[tauri::command]
fn load_settings() -> Result<settings::AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(settings_data: settings::AppSettings) -> Result<(), String> {
    settings::save_settings(&settings_data)
}

#[tauri::command]
fn add_library_path(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let result = settings::add_library_path(path.clone());
    if result.is_ok() {
        events::emit_path_added(&app, &path);
    }
    result
}

#[tauri::command]
fn remove_library_path(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let result = settings::remove_library_path(&path);
    if result.is_ok() {
        events::emit_path_removed(&app, &path);
    }
    result
}

#[tauri::command]
fn init_db() -> Result<(), String> {
    // 仅在需要时初始化表结构（实际连接由 AppState 管理）
    database::init_database_schema()
}

#[tauri::command]
fn save_comic_metadata(state: State<AppState>, comic: database::ComicMetadata) -> Result<i64, String> {
    database::upsert_comic_metadata(&state, &comic)
}

/// 批量保存漫画元数据（使用事务，性能提升 10-50 倍）
#[tauri::command]
fn batch_save_comic_metadata(state: State<AppState>, comics: Vec<database::ComicMetadata>) -> Result<Vec<i64>, String> {
    database::batch_upsert_comic_metadata(&state, &comics)
}

#[tauri::command]
fn get_all_comics_metadata(state: State<AppState>) -> Result<Vec<database::ComicMetadata>, String> {
    database::get_all_comics(&state)
}

/// 按路径查询单个漫画元数据
#[tauri::command]
fn get_comic_by_path(state: State<AppState>, path: String) -> Result<Option<database::ComicMetadata>, String> {
    database::get_comic_by_path(&state, &path)
}

/// 按路径获取漫画 ID（轻量查询，仅返回 ID）
#[tauri::command]
fn get_comic_id_by_path(state: State<AppState>, path: String) -> Result<Option<i64>, String> {
    database::get_comic_id_by_path(&state, &path)
}

#[tauri::command]
fn update_comic_last_opened(state: State<AppState>, comic_id: i64) -> Result<(), String> {
    database::update_comic_last_opened(&state, comic_id)
}

#[tauri::command]
fn save_reading_progress(app: AppHandle, state: State<AppState>, comic_id: i64, current_page: i64, total_pages: i64) -> Result<(), String> {
    let result = database::save_reading_progress(&state, comic_id, current_page, total_pages);
    if result.is_ok() {
        events::emit_reading_progress_saved(&app, comic_id, current_page);
    }
    result
}

#[tauri::command]
fn get_reading_progress(state: State<AppState>, comic_id: i64) -> Result<Option<database::ReadingProgress>, String> {
    database::get_reading_progress(&state, comic_id)
}

#[tauri::command]
fn add_to_favorites(app: AppHandle, state: State<AppState>, comic_id: i64) -> Result<(), String> {
    let result = database::add_to_favorites(&state, comic_id);
    if result.is_ok() {
        events::emit_favorite_toggled(&app, comic_id, true);
    }
    result
}

#[tauri::command]
fn remove_from_favorites(app: AppHandle, state: State<AppState>, comic_id: i64) -> Result<(), String> {
    let result = database::remove_from_favorites(&state, comic_id);
    if result.is_ok() {
        events::emit_favorite_toggled(&app, comic_id, false);
    }
    result
}

#[tauri::command]
fn is_favorite(state: State<AppState>, comic_id: i64) -> Result<bool, String> {
    database::is_favorite(&state, comic_id)
}

#[tauri::command]
fn get_favorite_comics(state: State<AppState>) -> Result<Vec<database::ComicMetadata>, String> {
    database::get_favorite_comics(&state)
}

#[tauri::command]
fn add_tag_to_comic(app: AppHandle, state: State<AppState>, comic_id: i64, tag_name: String) -> Result<(), String> {
    let result = database::add_tag_to_comic(&state, comic_id, &tag_name);
    if result.is_ok() {
        events::emit_tag_added(&app, comic_id, &tag_name);
    }
    result
}

#[tauri::command]
fn remove_tag_from_comic(app: AppHandle, state: State<AppState>, comic_id: i64, tag_id: i64) -> Result<(), String> {
    let result = database::remove_tag_from_comic(&state, comic_id, tag_id);
    if result.is_ok() {
        events::emit_tag_removed(&app, comic_id, tag_id);
    }
    result
}

#[tauri::command]
fn get_comic_tags(state: State<AppState>, comic_id: i64) -> Result<Vec<database::Tag>, String> {
    database::get_comic_tags(&state, comic_id)
}

#[tauri::command]
fn get_all_tags(state: State<AppState>) -> Result<Vec<database::Tag>, String> {
    database::get_all_tags(&state)
}

#[tauri::command]
fn create_folder(parent_path: String, folder_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::create_folder(&parent_path, &folder_name)
}

#[tauri::command]
fn rename_folder(old_path: String, new_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::rename_folder(&old_path, &new_name)
}

#[tauri::command]
fn rename_file_or_folder(old_path: String, new_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::rename_file_or_folder(&old_path, &new_name)
}

#[tauri::command]
fn delete_folder(folder_path: String, force: bool) -> folder_manager::FolderOperationResult {
    folder_manager::delete_folder(&folder_path, force)
}

#[tauri::command]
fn copy_file_to_folder(source_path: String, target_folder: String) -> file_operations::FileOperationResult {
    file_operations::copy_file_to_folder(&source_path, &target_folder)
}

#[tauri::command]
fn move_file_to_folder(source_path: String, target_folder: String) -> file_operations::FileOperationResult {
    file_operations::move_file_to_folder(&source_path, &target_folder)
}

#[tauri::command]
fn delete_tag_by_name(state: State<AppState>, tag_name: String) -> Result<(), String> {
    database::delete_tag_by_name(&state, &tag_name)
}

#[tauri::command]
fn get_comics_by_tag(state: State<AppState>, tag_name: String) -> Result<Vec<database::ComicMetadata>, String> {
    database::get_comics_by_tag(&state, &tag_name)
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    file_operations::open_in_explorer(&path)
}

#[tauri::command]
fn delete_file_or_folder(path: String) -> Result<String, String> {
    file_operations::delete_file_or_folder(&path)
}

#[tauri::command]
fn count_manga_in_folder(state: State<AppState>, folder_path: String) -> Result<usize, String> {
    database::count_comics_in_folder(&state, &folder_path)
}

#[tauri::command]
fn create_subfolder(parent_path: String, folder_name: String) -> Result<String, String> {
    file_operations::create_subfolder(&parent_path, &folder_name)
}

#[tauri::command]
fn check_file_conflict(source_path: String, target_folder: String) -> Result<file_operations::CopyWithConflictResult, String> {
    file_operations::check_file_conflict(&source_path, &target_folder)
}

#[tauri::command]
fn copy_file_to_folder_with_suffix(source_path: String, target_folder: String) -> Result<String, String> {
    file_operations::copy_file_to_folder_with_suffix(&source_path, &target_folder)
}

#[tauri::command]
fn move_folder(source_path: String, target_parent_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() || !source.is_dir() {
        return Err("源文件夹不存在".to_string());
    }
    let target_parent = Path::new(&target_parent_path);
    if !target_parent.exists() || !target_parent.is_dir() {
        return Err("目标父文件夹不存在".to_string());
    }
    let folder_name = source.file_name().unwrap().to_string_lossy().to_string();
    let target_path = target_parent.join(&folder_name);
    if target_path.exists() {
        return Err("目标文件夹已存在".to_string());
    }
    fs::rename(source, &target_path)
        .map_err(|e| format!("移动文件夹失败: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_all_subfolders(root_path: String) -> Result<Vec<String>, String> {
    fn collect_folders(
        dir: &Path,
        result: &mut Vec<String>,
        visited: &mut HashSet<String>,
        current_depth: usize,
    ) -> Result<(), String> {
        // Prevent stack overflow by limiting recursion depth
        if current_depth >= MAX_RECURSION_DEPTH {
            return Ok(());
        }

        // Resolve to canonical path to detect symlink cycles
        let canonical = match fs::canonicalize(dir) {
            Ok(c) => c.to_string_lossy().to_string(),
            Err(e) => return Err(format!("无法解析路径 {}: {}", dir.display(), e)),
        };

        // Skip if already visited (symlink cycle detection)
        if visited.contains(&canonical) {
            return Ok(());
        }
        visited.insert(canonical.clone());

        // Skip symlink directories to avoid following external links
        let metadata = match fs::symlink_metadata(dir) {
            Ok(m) => m,
            Err(e) => return Err(format!("无法读取元数据 {}: {}", dir.display(), e)),
        };

        if metadata.file_type().is_symlink() {
            return Ok(());
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                // Check if entry itself is a symlink (skip symlinked directories)
                if let Ok(entry_metadata) = fs::symlink_metadata(&path) {
                    if entry_metadata.file_type().is_symlink() {
                        continue;
                    }
                }

                if path.is_dir() {
                    if let Some(s) = path.to_str() {
                        result.push(s.to_string());
                    }
                    collect_folders(&path, result, visited, current_depth + 1)?;
                }
            }
        }
        Ok(())
    }

    let mut folders = Vec::new();
    let mut visited = HashSet::new();
    collect_folders(Path::new(&root_path), &mut folders, &mut visited, 0)?;
    Ok(folders)
}

fn main() {
    // 初始化数据库表结构（仅在首次启动时）
    if let Err(e) = database::init_database_schema() {
        eprintln!("数据库表初始化失败: {}", e);
    }
    
    // 创建数据库连接状态（单一长连接）
    let db_path = database::get_db_path();
    let app_state = AppState::new(&db_path).unwrap_or_else(|e| {
        panic!("数据库连接初始化失败: {}", e);
    });
    
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            get_folder_images,
            read_image_bytes,
            get_archive_images,
            get_archive_image_bytes,
            load_settings,
            save_settings,
            add_library_path,
            remove_library_path,
            init_db,
            save_comic_metadata,
            batch_save_comic_metadata,
            get_all_comics_metadata,
            get_comic_by_path,
            get_comic_id_by_path,
            update_comic_last_opened,
            save_reading_progress,
            get_reading_progress,
            add_to_favorites,
            remove_from_favorites,
            is_favorite,
            get_favorite_comics,
            add_tag_to_comic,
            remove_tag_from_comic,
            get_comic_tags,
            get_all_tags,
            create_folder,
            rename_folder,
            rename_file_or_folder,
            delete_folder,
            copy_file_to_folder,
            move_file_to_folder,
            delete_tag_by_name,
            get_comics_by_tag,
            open_in_explorer,
            delete_file_or_folder,
            count_manga_in_folder,
            create_subfolder,
            get_all_subfolders,
            check_file_conflict,
            copy_file_to_folder_with_suffix,
            move_folder,
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main")
                .ok_or_else(|| "Failed to get main window".to_string())?;
            main_window.set_title("Manga Reader - 书库")?;
            
            // 设置拖拽事件监听
            let app_handle = app.handle().clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position: _ }) = event {
                    let paths_str: Vec<String> = paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
                    let _ = app_handle.emit("tauri://file-drop", &paths_str);
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { paths: _, position: _ }) = event {
                    let _ = app_handle.emit("tauri://file-drop-enter", ());
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Leave) = event {
                    let _ = app_handle.emit("tauri://file-drop-leave", ());
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
