// 参考 YACReader initial_comic_info_extractor.cpp + cover_utils.cpp
// 封面预生成并缓存到磁盘，避免每次实时生成

use std::fs;
use std::path::PathBuf;

/// 封面缓存目录
fn cover_cache_dir() -> PathBuf {
    let cache_dir = std::env::temp_dir().join("manga-reader-covers");
    if !cache_dir.exists() {
        let _ = fs::create_dir_all(&cache_dir);
    }
    cache_dir
}

/// 根据文件路径生成唯一的缓存文件名
/// 参考 YACReader: 使用文件路径的哈希作为缓存键
fn cover_cache_path(source_path: &str) -> PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    source_path.hash(&mut hasher);
    let hash = hasher.finish();

    cover_cache_dir().join(format!("{:x}.jpg", hash))
}

/// 检查封面是否已缓存
pub fn has_cached_cover(source_path: &str) -> bool {
    cover_cache_path(source_path).exists()
}

/// 获取缓存的封面路径
pub fn get_cached_cover_path(source_path: &str) -> Option<PathBuf> {
    let path = cover_cache_path(source_path);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// 生成并缓存封面到磁盘
/// 参考 YACReader cover_utils.cpp:
///   - 宽高比智能缩放
///   - JPEG 质量 75 压缩
///   - SmoothTransformation (Lanczos3)
pub fn generate_and_cache_cover(source_path: &str, thumbnail_bytes: &[u8]) -> Result<PathBuf, String> {
    let cache_path = cover_cache_path(source_path);

    // 使用 image crate 缩放
    if let Ok(img) = image::load_from_memory(thumbnail_bytes) {
        let (w, h) = (img.width(), img.height());

        // 参考 YACReader cover_utils.cpp 的宽高比逻辑
        let (new_w, new_h) = if w as f32 / h as f32 > 640.0 / 960.0 {
            // 宽图：限制宽度 640
            let ratio = 640.0 / w as f32;
            (640, (h as f32 * ratio).round() as u32)
        } else if (w as f32) / (h as f32) < 0.5 {
            // 高图（webtoon）：限制高度 960
            let ratio = 960.0 / h as f32;
            ((w as f32 * ratio).round() as u32, 960)
        } else {
            // 正常比例：限制宽度 480
            let ratio = 480.0 / w as f32;
            (480, (h as f32 * ratio).round() as u32)
        };

        let resized = img.resize(new_w, new_h, image::imageops::FilterType::Lanczos3);

        // 保存为 JPEG，质量 75（参考 YACReader）
        let mut jpeg_buf = Vec::new();
        resized
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg_buf),
                image::ImageFormat::Jpeg,
            )
            .map_err(|e| format!("保存封面失败: {}", e))?;

        fs::write(&cache_path, &jpeg_buf)
            .map_err(|e| format!("写入封面缓存失败: {}", e))?;

        Ok(cache_path)
    } else {
        Err("无法加载图片生成封面".to_string())
    }
}

/// 清理封面缓存（可选功能）
pub fn clear_cover_cache() -> Result<(), String> {
    let cache_dir = cover_cache_dir();
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| format!("清理缓存失败: {}", e))?;
        let _ = fs::create_dir_all(&cache_dir);
    }
    Ok(())
}

/// 获取缓存封面字节（用于直接返回给前端）
pub fn read_cached_cover_bytes(source_path: &str) -> Result<Vec<u8>, String> {
    let cache_path = cover_cache_path(source_path);
    if cache_path.exists() {
        fs::read(&cache_path).map_err(|e| format!("读取封面缓存失败: {}", e))
    } else {
        Err("封面缓存不存在".to_string())
    }
}
