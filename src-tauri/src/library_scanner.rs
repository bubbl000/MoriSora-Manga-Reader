use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use crate::sort_utils::natural_cmp;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];
const COMIC_EXTENSIONS: &[&str] = &["cbz", "zip", "cbr", "rar"];
const PDF_EXTENSION: &str = "pdf";

/// Maximum recursion depth to prevent stack overflow from symlink cycles
const MAX_SCAN_DEPTH: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicCandidate {
    pub path: String,
    pub title: String,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub comics: Vec<ComicCandidate>,
    pub error: Option<String>,
}

pub fn scan_comic_directory(directory: &str) -> ScanResult {
    let path = PathBuf::from(directory);
    
    if !path.exists() || !path.is_dir() {
        return ScanResult {
            comics: Vec::new(),
            error: Some(format!("目录不存在或无效: {}", directory)),
        };
    }

    let mut comics = Vec::new();
    let mut visited = HashSet::new();
    
    if let Err(e) = scan_directory_recursive(&path, &mut comics, &mut visited, 0) {
        return ScanResult {
            comics,
            error: Some(format!("扫描出错: {}", e)),
        };
    }

    ScanResult {
        comics,
        error: None,
    }
}

fn scan_directory_recursive(
    dir: &Path,
    comics: &mut Vec<ComicCandidate>,
    visited: &mut HashSet<String>,
    current_depth: usize,
) -> Result<(), String> {
    // Prevent stack overflow by limiting recursion depth
    if current_depth >= MAX_SCAN_DEPTH {
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
    visited.insert(canonical);

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => return Err(format!("无法读取目录: {}", e)),
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        
        // Skip symlinks to avoid following external links or cycles
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if metadata.file_type().is_symlink() {
                continue;
            }
        }
        
        if path.is_dir() {
            scan_directory_recursive(&path, comics, visited, current_depth + 1)?;
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                
                if COMIC_EXTENSIONS.contains(&ext_lower.as_str()) {
                    let title = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    
                    comics.push(ComicCandidate {
                        path: path.to_string_lossy().to_string(),
                        title,
                        source_type: "archive".to_string(),
                    });
                } else if ext_lower == PDF_EXTENSION {
                    let title = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    
                    comics.push(ComicCandidate {
                        path: path.to_string_lossy().to_string(),
                        title,
                        source_type: "pdf".to_string(),
                    });
                } else if IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
                    // Check if this image is alone in its parent directory
                    let parent = path.parent().unwrap_or(Path::new(""));
                    let has_comic_archive = folder_has_comic_archives(parent);
                    
                    if !has_comic_archive {
                        // Check if we haven't already added this folder as an image folder
                        let already_added = comics.iter().any(|c| {
                            PathBuf::from(&c.path).parent() == Some(parent) && c.source_type == "folder"
                        });
                        
                        if !already_added {
                            let title = parent
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_default();
                            
                            comics.push(ComicCandidate {
                                path: parent.to_string_lossy().to_string(),
                                title,
                                source_type: "folder".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

fn folder_has_comic_archives(folder: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if COMIC_EXTENSIONS.contains(&ext_lower.as_str()) {
                    return true;
                }
            }
        }
    }
    false
}

pub fn get_folder_images(folder: &str) -> Vec<String> {
    let path = PathBuf::from(folder);
    let mut images = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.is_file() {
                if let Some(ext) = file_path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    if IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
                        images.push(file_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    
    images.sort_by(|a, b| {
        let filename_a = Path::new(a).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let filename_b = Path::new(b).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        natural_cmp(&filename_a, &filename_b)
    });
    
    images
}
