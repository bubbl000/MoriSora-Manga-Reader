// Manga Reader Library
// This file will contain the core functionality for manga reading

pub mod archive_cache;
mod sort_utils;
pub mod archive_parser;
pub mod database;
pub mod file_operations;
pub mod folder_manager;
pub mod library_scanner;
pub mod settings;

pub fn setup() {
    println!("Manga Reader initialized");
}
