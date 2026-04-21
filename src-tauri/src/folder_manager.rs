use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderOperationResult {
    pub success: bool,
    pub message: String,
    pub path: Option<String>,
}

pub fn create_folder(parent_path: &str, folder_name: &str) -> FolderOperationResult {
    let parent = Path::new(parent_path);
    if !parent.exists() || !parent.is_dir() {
        return FolderOperationResult {
            success: false,
            message: format!("父目录不存在: {}", parent_path),
            path: None,
        };
    }

    let new_path = parent.join(folder_name);
    if new_path.exists() {
        return FolderOperationResult {
            success: false,
            message: format!("文件夹已存在: {}", new_path.display()),
            path: None,
        };
    }

    match fs::create_dir_all(&new_path) {
        Ok(()) => FolderOperationResult {
            success: true,
            message: format!("文件夹创建成功: {}", folder_name),
            path: Some(new_path.to_string_lossy().to_string()),
        },
        Err(e) => FolderOperationResult {
            success: false,
            message: format!("无法创建文件夹: {}", e),
            path: None,
        },
    }
}

pub fn rename_folder(old_path: &str, new_name: &str) -> FolderOperationResult {
    let old = Path::new(old_path);
    if !old.exists() || !old.is_dir() {
        return FolderOperationResult {
            success: false,
            message: format!("原文件夹不存在: {}", old_path),
            path: None,
        };
    }

    let parent = match old.parent() {
        Some(p) => p,
        None => {
            return FolderOperationResult {
                success: false,
                message: "无法获取父目录".to_string(),
                path: None,
            }
        }
    };

    let new_path = parent.join(new_name);
    if new_path.exists() {
        return FolderOperationResult {
            success: false,
            message: format!("目标文件夹已存在: {}", new_name),
            path: None,
        };
    }

    match fs::rename(old, &new_path) {
        Ok(()) => FolderOperationResult {
            success: true,
            message: format!("文件夹重命名成功: {} -> {}", old_path, new_name),
            path: Some(new_path.to_string_lossy().to_string()),
        },
        Err(e) => FolderOperationResult {
            success: false,
            message: format!("无法重命名文件夹: {}", e),
            path: None,
        },
    }
}

pub fn delete_folder(folder_path: &str, force: bool) -> FolderOperationResult {
    let path = Path::new(folder_path);
    if !path.exists() || !path.is_dir() {
        return FolderOperationResult {
            success: false,
            message: format!("文件夹不存在: {}", folder_path),
            path: None,
        };
    }

    if force {
        match fs::remove_dir_all(path) {
            Ok(()) => FolderOperationResult {
                success: true,
                message: format!("文件夹删除成功: {}", folder_path),
                path: None,
            },
            Err(e) => FolderOperationResult {
                success: false,
                message: format!("无法删除文件夹: {}", e),
                path: None,
            },
        }
    } else {
        match fs::remove_dir(path) {
            Ok(()) => FolderOperationResult {
                success: true,
                message: format!("文件夹删除成功: {}", folder_path),
                path: None,
            },
            Err(e) => FolderOperationResult {
                success: false,
                message: format!("文件夹不为空，无法删除: {}", e),
                path: None,
            },
        }
    }
}

pub fn rename_file_or_folder(old_path: &str, new_name: &str) -> FolderOperationResult {
    let old = Path::new(old_path);
    if !old.exists() {
        return FolderOperationResult {
            success: false,
            message: format!("原文件或文件夹不存在: {}", old_path),
            path: None,
        };
    }

    let parent = match old.parent() {
        Some(p) => p,
        None => {
            return FolderOperationResult {
                success: false,
                message: "无法获取父目录".to_string(),
                path: None,
            }
        }
    };

    let new_path = parent.join(new_name);
    if new_path.exists() {
        return FolderOperationResult {
            success: false,
            message: format!("目标名称已存在: {}", new_name),
            path: None,
        };
    }

    match fs::rename(old, &new_path) {
        Ok(()) => FolderOperationResult {
            success: true,
            message: format!("重命名成功: {}", new_name),
            path: Some(new_path.to_string_lossy().to_string()),
        },
        Err(e) => FolderOperationResult {
            success: false,
            message: format!("无法重命名: {}", e),
            path: None,
        },
    }
}
