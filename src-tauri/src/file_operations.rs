use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
pub fn open_in_explorer(path: &str) -> Result<(), String> {
    let target = Path::new(path);
    
    if !target.exists() {
        return Err(format!("目标不存在: {}", path));
    }
    
    if target.is_file() {
        // 使用 explorer /select 打开资源管理器并选中文件
        // 注意：Windows 11 深色主题下高亮颜色可能较浅，这是系统级问题
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("无法打开资源管理器: {}", e))?;
    } else {
        Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开资源管理器: {}", e))?;
    }
    
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn open_in_explorer(path: &str) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map_err(|e| format!("无法打开访达: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn open_in_explorer(path: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|e| format!("无法打开文件管理器: {}", e))?;
    Ok(())
}

pub fn delete_file_or_folder(path: &str) -> Result<String, String> {
    let target = Path::new(path);

    if !target.exists() {
        return Err(format!("目标不存在: {}", path));
    }

    let name = target.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    if target.is_file() {
        fs::remove_file(target)
            .map_err(|e| format!("无法删除文件: {}", e))?;
        Ok(format!("已删除文件: {}", name))
    } else if target.is_dir() {
        fs::remove_dir_all(target)
            .map_err(|e| format!("无法删除文件夹: {}", e))?;
        Ok(format!("已删除文件夹: {}", name))
    } else {
        Err(format!("不支持的文件类型: {}", path))
    }
}

pub fn create_subfolder(parent_path: &str, folder_name: &str) -> Result<String, String> {
    let parent = Path::new(parent_path);
    if !parent.exists() || !parent.is_dir() {
        return Err(format!("父文件夹不存在: {}", parent_path));
    }

    let new_folder = parent.join(folder_name);
    if new_folder.exists() {
        return Err(format!("子文件夹已存在: {}", folder_name));
    }

    std::fs::create_dir_all(&new_folder)
        .map_err(|e| format!("无法创建文件夹: {}", e))?;

    Ok(new_folder.to_string_lossy().to_string())
}

pub fn count_manga_in_folder(folder_path: &str, all_comics: &[crate::database::ComicMetadata]) -> usize {
    all_comics.iter()
        .filter(|c| c.path.starts_with(folder_path))
        .count()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationResult {
    pub success: bool,
    pub message: String,
    pub target_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyWithConflictResult {
    pub success: bool,
    pub message: String,
    pub target_path: String,
    pub has_conflict: bool,
}

pub fn check_file_conflict(source_path: &str, target_folder: &str) -> Result<CopyWithConflictResult, String> {
    let source = Path::new(source_path);
    let target_dir = Path::new(target_folder);
    
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }
    
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err(format!("目标文件夹不存在: {}", target_folder));
    }
    
    let file_name = source.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let target_path = target_dir.join(&file_name);
    
    if target_path.exists() {
        Ok(CopyWithConflictResult {
            success: false,
            message: format!("目标文件已存在: {}", file_name),
            target_path: target_path.to_string_lossy().to_string(),
            has_conflict: true,
        })
    } else {
        Ok(CopyWithConflictResult {
            success: true,
            message: "无冲突".to_string(),
            target_path: target_path.to_string_lossy().to_string(),
            has_conflict: false,
        })
    }
}

pub fn copy_file_to_folder_with_suffix(source_path: &str, target_folder: &str) -> Result<String, String> {
    let source = Path::new(source_path);
    let target_dir = Path::new(target_folder);
    
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }
    
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err(format!("目标文件夹不存在: {}", target_folder));
    }
    
    let file_name = source.file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = source.extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    
    let mut target_path = target_dir.join(format!("{}{}", file_name, extension));
    let mut counter = 1;
    
    while target_path.exists() {
        target_path = target_dir.join(format!("{}{}{}", file_name, counter, extension));
        counter += 1;
    }
    
    fs::copy(source, &target_path)
        .map_err(|e| format!("无法复制文件: {}", e))?;
    
    Ok(target_path.to_string_lossy().to_string())
}

pub fn copy_file_to_folder(source_path: &str, target_folder: &str) -> FileOperationResult {
    let source = Path::new(source_path);
    let target_dir = Path::new(target_folder);

    if !source.exists() {
        return FileOperationResult {
            success: false,
            message: format!("源文件不存在: {}", source_path),
            target_path: None,
        };
    }

    if !target_dir.exists() || !target_dir.is_dir() {
        return FileOperationResult {
            success: false,
            message: format!("目标文件夹不存在: {}", target_folder),
            target_path: None,
        };
    }

    let file_name = match source.file_name() {
        Some(name) => name,
        None => {
            return FileOperationResult {
                success: false,
                message: "无法获取文件名".to_string(),
                target_path: None,
            }
        }
    };

    let target_path = target_dir.join(file_name);

    if target_path.exists() {
        return FileOperationResult {
            success: false,
            message: format!("目标文件已存在: {}", target_path.display()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        };
    }

    match fs::copy(source, &target_path) {
        Ok(_) => FileOperationResult {
            success: true,
            message: format!("文件复制成功: {}", file_name.to_string_lossy()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        },
        Err(e) => FileOperationResult {
            success: false,
            message: format!("无法复制文件: {}", e),
            target_path: None,
        },
    }
}

pub fn move_file_to_folder(source_path: &str, target_folder: &str) -> FileOperationResult {
    let source = Path::new(source_path);
    let target_dir = Path::new(target_folder);

    if !source.exists() {
        return FileOperationResult {
            success: false,
            message: format!("源文件不存在: {}", source_path),
            target_path: None,
        };
    }

    if !target_dir.exists() || !target_dir.is_dir() {
        return FileOperationResult {
            success: false,
            message: format!("目标文件夹不存在: {}", target_folder),
            target_path: None,
        };
    }

    let file_name = match source.file_name() {
        Some(name) => name,
        None => {
            return FileOperationResult {
                success: false,
                message: "无法获取文件名".to_string(),
                target_path: None,
            }
        }
    };

    let target_path = target_dir.join(file_name);

    if target_path.exists() {
        return FileOperationResult {
            success: false,
            message: format!("目标文件已存在: {}", target_path.display()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        };
    }

    match fs::rename(source, &target_path) {
        Ok(_) => FileOperationResult {
            success: true,
            message: format!("文件移动成功: {}", file_name.to_string_lossy()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        },
        Err(e) => FileOperationResult {
            success: false,
            message: format!("无法移动文件: {}", e),
            target_path: None,
        },
    }
}

pub fn copy_folder_to_library(source_folder: &str, library_path: &str) -> FileOperationResult {
    let source = Path::new(source_folder);
    let target_dir = Path::new(library_path);

    if !source.exists() || !source.is_dir() {
        return FileOperationResult {
            success: false,
            message: format!("源文件夹不存在: {}", source_folder),
            target_path: None,
        };
    }

    if !target_dir.exists() || !target_dir.is_dir() {
        return FileOperationResult {
            success: false,
            message: format!("目标库路径不存在: {}", library_path),
            target_path: None,
        };
    }

    let folder_name = match source.file_name() {
        Some(name) => name,
        None => {
            return FileOperationResult {
                success: false,
                message: "无法获取文件夹名称".to_string(),
                target_path: None,
            }
        }
    };

    let target_path = target_dir.join(folder_name);

    if target_path.exists() {
        return FileOperationResult {
            success: false,
            message: format!("目标文件夹已存在: {}", target_path.display()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        };
    }

    match copy_dir_recursive(source, &target_path) {
        Ok(_) => FileOperationResult {
            success: true,
            message: format!("文件夹复制到库成功: {}", folder_name.to_string_lossy()),
            target_path: Some(target_path.to_string_lossy().to_string()),
        },
        Err(e) => FileOperationResult {
            success: false,
            message: format!("无法复制文件夹: {}", e),
            target_path: None,
        },
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("无法创建目录: {}", e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("无法读取目录: {}", e))? {
        let entry = entry.map_err(|e| format!("无法读取目录项: {}", e))?;
        let file_type = entry.file_type().map_err(|e| format!("无法获取文件类型: {}", e))?;
        let target = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err(|e| format!("无法复制文件: {}", e))?;
        }
    }

    Ok(())
}
