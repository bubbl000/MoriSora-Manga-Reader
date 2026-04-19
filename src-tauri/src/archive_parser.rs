// 参考: e:\06-xiangmu\处理中\new2\comic-shelf-main\src-tauri\src\lib.rs
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::io::Cursor;
use std::io::Read;
use std::path::Path;
use lopdf::Document;
use unrar::Archive;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchivePageInfo {
    pub page_number: usize,
    pub entry_path: String,
    pub file_name: String,
}

pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let re = regex::Regex::new(r"(\d+)").unwrap();
    let mut a_parts = re.find_iter(a);
    let mut b_parts = re.find_iter(b);

    let a_lower = a.to_ascii_lowercase();
    let b_lower = b.to_ascii_lowercase();

    if a_lower == b_lower {
        return a.cmp(b);
    }

    let mut a_pos = 0;
    let mut b_pos = 0;

    loop {
        let a_match = a_parts.next();
        let b_match = b_parts.next();

        match (a_match, b_match) {
            (Some(am), Some(bm)) => {
                let a_before = &a_lower[a_pos..am.start()];
                let b_before = &b_lower[b_pos..bm.start()];

                if a_before != b_before {
                    return a_lower.cmp(&b_lower);
                }

                let a_num = am.as_str();
                let b_num = bm.as_str();

                if a_num.len() != b_num.len() {
                    return a_num.len().cmp(&b_num.len());
                }
                match a_num.cmp(b_num) {
                    Ordering::Equal => {}
                    other => return other,
                }

                a_pos = am.end();
                b_pos = bm.end();
            }
            _ => return a_lower.cmp(&b_lower),
        }
    }
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_lowercase())
}

fn is_image_entry_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    IMAGE_EXTENSIONS.iter().any(|ext| lower.ends_with(&format!(".{}", ext)))
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
    let ext = extension_of(archive_path).unwrap_or_default();

    match ext.as_str() {
        "cbz" | "zip" => list_cbz_images(path),
        "cbr" | "rar" => list_cbr_images(path),
        "pdf" => list_pdf_pages(path),
        _ => Err(format!("不支持的格式: {}", ext)),
    }
}

pub fn read_archive_image_bytes(path: &str, entry_path: &str) -> Result<Vec<u8>, String> {
    let archive_path = Path::new(path);
    let ext = extension_of(archive_path).unwrap_or_default();

    match ext.as_str() {
        "cbz" | "zip" => read_cbz_image_entry(path, entry_path),
        "cbr" | "rar" => read_cbr_image_entry(path, entry_path),
        "pdf" => read_pdf_page(path, entry_path.parse::<usize>().unwrap_or(1)),
        _ => Err(format!("不支持的格式: {}", ext)),
    }
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
    let archive_path = Path::new(path);
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("无法打开CBZ文件 {}: {}", path, e))?;
    
    let mut archive = zip::ZipArchive::new(file)
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
    let mut archive = Archive::new(path)
        .open_for_processing()
        .map_err(|e| format!("无法打开CBR文件 {}: {}", path, e))?;

    loop {
        let Some(before_file) = archive
            .read_header()
            .map_err(|e| format!("读取CBR头失败 {}: {}", path, e))?
        else {
            break;
        };

        let current_name = before_file.entry().filename.to_string_lossy().replace('\\', "/");
        if current_name == entry_path {
            let (data, _after_read) = before_file
                .read()
                .map_err(|e| format!("读取CBR条目失败 {}: {}", entry_path, e))?;
            return Ok(data);
        }

        archive = before_file
            .skip()
            .map_err(|e| format!("跳过CBR条目失败 {}: {}", entry_path, e))?;
    }

    Err(format!("找不到CBR条目: {}", entry_path))
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
