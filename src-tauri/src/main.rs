#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive_parser;
mod database;
mod library_scanner;
mod settings;

use tauri::Manager;
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
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            main_window.set_title("Manga Reader - 书库")?;
            if let Err(e) = database::init_database() {
                eprintln!("数据库初始化失败: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
