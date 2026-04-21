// 参考: e:\06-xiangmu\处理中\new2\comic-shelf-main\src-tauri\src\lib.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::io::Read;
use std::path::Path;
use crate::sort_utils::natural_cmp;
use crate::archive_cache::{get_or_load_zip, get_or_extract_cbr};
use unrar::Archive;
use lopdf::Document;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchivePageInfo {
    pub page_number: usize,
    pub entry_path: String,
    pub file_name: String,
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .or_else(|| {
            let path_str = path.to_string_lossy().to_lowercase();
            if path_str.ends_with(".zip") {
                Some("zip".to_string())
            } else if path_str.ends_with(".cbz") {
                Some("cbz".to_string())
            } else if path_str.ends_with(".cbr") {
                Some("cbr".to_string())
            } else if path_str.ends_with(".rar") {
                Some("rar".to_string())
            } else if path_str.ends_with(".pdf") {
                Some("pdf".to_string())
            } else {
                None
            }
        })
}

fn is_image_entry_name(name: &str) -> bool {
    // 直接提取扩展名进行比较，避免分配完整的小写字符串
    if let Some(dot_pos) = name.rfind('.') {
        let ext = &name[dot_pos + 1..];
        IMAGE_EXTENSIONS.iter().any(|&ie| ext.eq_ignore_ascii_case(ie))
    } else {
        false
    }
}

fn get_file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

pub fn get_archive_type(path: &str) -> Option<String> {
    let p = Path::new(path);
    match extension_of(p).as_deref() {
        Some("cbz" | "zip") => Some("zip".to_string()),
        Some("cbr" | "rar") => Some("rar".to_string()),
        Some("pdf") => Some("pdf".to_string()),
        _ => None,
    }
}

pub fn list_archive_images(path: &str) -> Result<Vec<ArchivePageInfo>, String> {
    let archive_path = Path::new(path);
    let ext = extension_of(archive_path);

    match ext.as_deref() {
        Some("cbz") | Some("zip") => list_cbz_images(path),
        Some("cbr") | Some("rar") => list_cbr_images(path),
        Some("pdf") => list_pdf_pages(path),
        _ => match detect_format_by_magic_bytes(path) {
            Some("zip") => list_cbz_images(path),
            Some("rar") => list_cbr_images(path),
            Some("pdf") => list_pdf_pages(path),
            None => Err(format!("文件没有扩展名且无法识别格式: {}", path)),
            _ => Err(format!("不支持的格式: '{:?}' (仅支持 cbz/zip/cbr/rar/pdf)", ext)),
        },
    }
}

pub fn read_archive_image_bytes(path: &str, entry_path: &str) -> Result<Vec<u8>, String> {
    let archive_path = Path::new(path);
    let ext = extension_of(archive_path);

    match ext.as_deref() {
        Some("cbz") | Some("zip") => read_cbz_image_entry(path, entry_path),
        Some("cbr") | Some("rar") => read_cbr_image_entry(path, entry_path),
        Some("pdf") => read_pdf_page(path, entry_path.parse::<usize>().unwrap_or(1)),
        _ => match detect_format_by_magic_bytes(path) {
            Some("zip") => read_cbz_image_entry(path, entry_path),
            Some("rar") => read_cbr_image_entry(path, entry_path),
            Some("pdf") => read_pdf_page(path, entry_path.parse::<usize>().unwrap_or(1)),
            None => Err(format!("文件没有扩展名且无法识别格式: {}", path)),
            _ => Err(format!("不支持的格式: '{:?}' (文件: {})", ext, path)),
        },
    }
}

fn detect_format_by_magic_bytes(path: &str) -> Option<&'static str> {
    let mut file = fs::File::open(path).ok()?;
    let mut buf = [0u8; 8];
    let n = file.read(&mut buf).ok()?;
    if n < 4 {
        return None;
    }
    if buf[0] == 0x50 && buf[1] == 0x4B && buf[2] == 0x03 && buf[3] == 0x04 {
        return Some("zip");
    }
    if n >= 7 && buf[0] == 0x52 && buf[1] == 0x61 && buf[2] == 0x72 && buf[3] == 0x21 && buf[4] == 0x1A && buf[5] == 0x07 {
        return Some("rar");
    }
    if buf[0] == 0x25 && buf[1] == 0x50 && buf[2] == 0x44 && buf[3] == 0x46 {
        return Some("pdf");
    }
    None
}

fn list_cbz_images(path: &str) -> Result<Vec<ArchivePageInfo>, String> {
    let archive_path = Path::new(path);
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("无法打开CBZ文件 {}: {}", path, e))?;
    
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("无法读取CBZ档案 {}: {}", path, e))?;

    let mut image_entries = Vec::new();

    for i in 0..archive.len() {
        let entry = archive.by_index(i)
            .map_err(|e| format!("无法读取CBZ条目 {}: {}", i, e))?;
        
        let name = entry.name().replace('\\', "/");
        
        if entry.is_file() && is_image_entry_name(&name) {
            image_entries.push(name);
        }
    }

    image_entries.sort_by(|a, b| natural_cmp(a, b));

    let pages = image_entries
        .into_iter()
        .enumerate()
        .map(|(idx, entry_path)| {
            let file_name = get_file_name_from_path(&entry_path);
            ArchivePageInfo {
                page_number: idx + 1,
                entry_path,
                file_name,
            }
        })
        .collect();

    Ok(pages)
}

fn read_cbz_image_entry(path: &str, entry_path: &str) -> Result<Vec<u8>, String> {
    // 使用缓存的 ZIP 数据，Arc::clone 仅增加引用计数
    let data = get_or_load_zip(path)?;
    
    let cursor = Cursor::new((*data).clone());
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("无法读取CBZ档案 {}: {}", path, e))?;

    let mut entry = archive.by_name(entry_path)
        .map_err(|e| format!("找不到CBZ条目 {}: {}", entry_path, e))?;
    
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)
        .map_err(|e| format!("读取CBZ条目失败 {}: {}", entry_path, e))?;

    Ok(bytes)
}

fn list_cbr_images(path: &str) -> Result<Vec<ArchivePageInfo>, String> {
    let mut names = Vec::new();
    let listed = Archive::new(path)
        .open_for_listing()
        .map_err(|e| format!("无法打开CBR文件 {}: {}", path, e))?;

    for header in listed {
        let header = header
            .map_err(|e| format!("读取CBR头失败 {}: {}", path, e))?;
        let name = header.filename.to_string_lossy().replace('\\', "/");
        if is_image_entry_name(&name) {
            names.push(name);
        }
    }

    names.sort_by(|a, b| natural_cmp(a, b));

    let pages = names
        .into_iter()
        .enumerate()
        .map(|(idx, entry_path)| {
            let file_name = get_file_name_from_path(&entry_path);
            ArchivePageInfo {
                page_number: idx + 1,
                entry_path,
                file_name,
            }
        })
        .collect();

    Ok(pages)
}

fn read_cbr_image_entry(path: &str, entry_path: &str) -> Result<Vec<u8>, String> {
    // 使用缓存的 CBR 解压数据，避免重复遍历
    let entries = get_or_extract_cbr(path)?;
    
    match entries.get(entry_path) {
        Some(data) => Ok(data.clone()),
        None => Err(format!("找不到CBR条目: {}", entry_path)),
    }
}

fn list_pdf_pages(path: &str) -> Result<Vec<ArchivePageInfo>, String> {
    let pdf_path = Path::new(path);
    if !pdf_path.exists() {
        return Err(format!("PDF文件不存在: {}", path));
    }
    
    let data = fs::read(pdf_path)
        .map_err(|e| format!("无法读取PDF文件 {}: {}", path, e))?;
    let cursor = Cursor::new(&data);
    let doc = Document::load_from(cursor)
        .map_err(|e| format!("无法解析PDF文档 {}: {}", path, e))?;

    let page_count = doc.get_pages().len();
    
    let pages = (1..=page_count)
        .map(|idx| ArchivePageInfo {
            page_number: idx,
            entry_path: idx.to_string(),
            file_name: format!("page-{}.png", idx),
        })
        .collect();

    Ok(pages)
}

fn read_pdf_page(_path: &str, _page_number: usize) -> Result<Vec<u8>, String> {
    Err("PDF渲染功能尚未实现，建议使用CBZ/CBR格式".to_string())
}
