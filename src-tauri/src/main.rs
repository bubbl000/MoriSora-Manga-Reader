#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive_parser;
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
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            main_window.set_title("Manga Reader - 书库")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
