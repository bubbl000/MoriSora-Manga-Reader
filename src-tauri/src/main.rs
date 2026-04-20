#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive_parser;
mod database;
mod file_operations;
mod folder_manager;
mod library_scanner;
mod settings;

use tauri::{Emitter, Manager};
use std::fs;
use std::path::Path;

#[tauri::command]
fn read_image_bytes(file_path: String) -> Result<Vec<u8>, String> {
    let path = Path::new(&file_path);
    fs::read(path).map_err(|e| format!("无法读取图片 {}: {}", file_path, e))
}

#[tauri::command]
fn scan_directory(directory: String) -> library_scanner::ScanResult {
    library_scanner::scan_comic_directory(&directory)
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
fn add_library_path(path: String) -> Result<Vec<String>, String> {
    settings::add_library_path(path)
}

#[tauri::command]
fn remove_library_path(index: usize) -> Result<Vec<String>, String> {
    settings::remove_library_path(index)
}

#[tauri::command]
fn init_db() -> Result<(), String> {
    database::init_database()
}

#[tauri::command]
fn save_comic_metadata(comic: database::ComicMetadata) -> Result<i64, String> {
    database::upsert_comic_metadata(&comic)
}

#[tauri::command]
fn get_all_comics_metadata() -> Result<Vec<database::ComicMetadata>, String> {
    database::get_all_comics()
}

#[tauri::command]
fn update_comic_last_opened(comic_id: i64) -> Result<(), String> {
    database::update_comic_last_opened(comic_id)
}

#[tauri::command]
fn save_reading_progress(comic_id: i64, current_page: i64, total_pages: i64) -> Result<(), String> {
    database::save_reading_progress(comic_id, current_page, total_pages)
}

#[tauri::command]
fn get_reading_progress(comic_id: i64) -> Result<Option<database::ReadingProgress>, String> {
    database::get_reading_progress(comic_id)
}

#[tauri::command]
fn add_to_favorites(comic_id: i64) -> Result<(), String> {
    database::add_to_favorites(comic_id)
}

#[tauri::command]
fn remove_from_favorites(comic_id: i64) -> Result<(), String> {
    database::remove_from_favorites(comic_id)
}

#[tauri::command]
fn is_favorite(comic_id: i64) -> Result<bool, String> {
    database::is_favorite(comic_id)
}

#[tauri::command]
fn get_favorite_comics() -> Result<Vec<database::ComicMetadata>, String> {
    database::get_favorite_comics()
}

#[tauri::command]
fn add_tag_to_comic(comic_id: i64, tag_name: String) -> Result<(), String> {
    database::add_tag_to_comic(comic_id, &tag_name)
}

#[tauri::command]
fn remove_tag_from_comic(comic_id: i64, tag_id: i64) -> Result<(), String> {
    database::remove_tag_from_comic(comic_id, tag_id)
}

#[tauri::command]
fn get_comic_tags(comic_id: i64) -> Result<Vec<database::Tag>, String> {
    database::get_comic_tags(comic_id)
}

#[tauri::command]
fn get_all_tags() -> Result<Vec<database::Tag>, String> {
    database::get_all_tags()
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
fn delete_tag_by_name(tag_name: String) -> Result<(), String> {
    database::delete_tag_by_name(&tag_name)
}

#[tauri::command]
fn get_comics_by_tag(tag_name: String) -> Result<Vec<database::ComicMetadata>, String> {
    database::get_comics_by_tag(&tag_name)
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
fn count_manga_in_folder(folder_path: String) -> Result<usize, String> {
    let all_comics = database::get_all_comics().map_err(|e| format!("无法获取漫画列表: {}", e))?;
    Ok(file_operations::count_manga_in_folder(&folder_path, &all_comics))
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
    fn collect_folders(dir: &Path, result: &mut Vec<String>) -> Result<(), String> {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(s) = path.to_str() {
                        result.push(s.to_string());
                    }
                    collect_folders(&path, result)?;
                }
            }
        }
        Ok(())
    }
    
    let mut folders = Vec::new();
    collect_folders(Path::new(&root_path), &mut folders)?;
    Ok(folders)
}

fn main() {
    tauri::Builder::default()
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
            get_all_comics_metadata,
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
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) = event {
                    let paths_str: Vec<String> = paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
                    let _ = app_handle.emit("tauri://file-drop", &paths_str);
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { paths, position }) = event {
                    let _ = app_handle.emit("tauri://file-drop-enter", ());
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Leave) = event {
                    let _ = app_handle.emit("tauri://file-drop-leave", ());
                }
            });
            
            if let Err(e) = database::init_database() {
                eprintln!("数据库初始化失败: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
