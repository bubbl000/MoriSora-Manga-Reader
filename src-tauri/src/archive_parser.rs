use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use crate::sort_utils::natural_cmp;
use crate::archive_cache::{get_or_load_zip, get_or_extract_cbr, get_cached_zip_entry_list, set_cached_zip_entry_list};
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

#[inline]
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
    if let Some(cached_names) = get_cached_zip_entry_list(path) {
        return Ok(cached_names.iter().enumerate().map(|(idx, name)| {
            let file_name = if let Some(slash_pos) = name.rfind('/') {
                name[slash_pos + 1..].to_string()
            } else {
                name.clone()
            };
            ArchivePageInfo {
                page_number: idx + 1,
                entry_path: name.clone(),
                file_name,
            }
        }).collect());
    }

    let data = get_or_load_zip(path)?;
    let cursor = Cursor::new(data.as_ref().clone());
    let mut archive = zip::ZipArchive::new(cursor)
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

    let entry_list = set_cached_zip_entry_list(path, image_entries);

    Ok(entry_list.iter().enumerate().map(|(idx, name)| {
        let file_name = if let Some(slash_pos) = name.rfind('/') {
            name[slash_pos + 1..].to_string()
        } else {
            name.clone()
        };
        ArchivePageInfo {
            page_number: idx + 1,
            entry_path: name.clone(),
            file_name,
        }
    }).collect())
}

fn read_cbz_image_entry(path: &str, entry_path: &str) -> Result<Vec<u8>, String> {
    let data = crate::archive_cache::get_or_load_zip_entry(path, entry_path)?;
    Ok((*(data)).clone())
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
    let entries = get_or_extract_cbr(path)?;
    match entries.get(entry_path) {
        Some(data) => Ok(data.as_ref().clone()),
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

pub fn generate_cover_thumbnail(path: &str) -> Result<Vec<u8>, String> {
    let archive_path = Path::new(path);
    let ext = extension_of(archive_path);

    match ext.as_deref() {
        Some("cbz") | Some("zip") => generate_zip_thumbnail(path),
        Some("cbr") | Some("rar") => generate_cbr_thumbnail(path),
        Some("pdf") => generate_pdf_thumbnail(path),
        _ => match detect_format_by_magic_bytes(path) {
            Some("zip") => generate_zip_thumbnail(path),
            Some("rar") => generate_cbr_thumbnail(path),
            Some("pdf") => generate_pdf_thumbnail(path),
            None => Err(format!("文件没有扩展名且无法识别格式: {}", path)),
            _ => Err(format!("不支持的格式: '{:?}'", ext)),
        },
    }
}

fn generate_zip_thumbnail(path: &str) -> Result<Vec<u8>, String> {
    let data = get_or_load_zip(path)?;
    let cursor = Cursor::new(data.as_ref().clone());
    let mut archive = zip::ZipArchive::new(cursor)
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

    if image_entries.is_empty() {
        return Err("找不到图片条目".to_string());
    }

    let first_entry = &image_entries[0];
    let mut entry = archive.by_name(first_entry)
        .map_err(|e| format!("无法读取条目 {}: {}", first_entry, e))?;

    let mut buf = Vec::new();
    std::io::Read::read_to_end(&mut entry, &mut buf)
        .map_err(|e| format!("读取条目失败: {}", e))?;

    Ok(scale_image_to_thumbnail(&buf, 200, 280))
}

fn generate_cbr_thumbnail(path: &str) -> Result<Vec<u8>, String> {
    let entries = get_or_extract_cbr(path)?;

    let mut image_names: Vec<&String> = entries.keys()
        .filter(|name| is_image_entry_name(name))
        .collect();
    image_names.sort_by(|a, b| natural_cmp(a, b));

    if image_names.is_empty() {
        return Err("找不到图片条目".to_string());
    }

    let first_entry = image_names[0];
    let data = entries.get(first_entry).unwrap();
    Ok(scale_image_to_thumbnail(data.as_ref(), 200, 280))
}

fn generate_pdf_thumbnail(path: &str) -> Result<Vec<u8>, String> {
    let pdf_path = Path::new(path);
    if !pdf_path.exists() {
        return Err(format!("PDF文件不存在: {}", path));
    }

    // 参考 YACReader 策略：PDF 需要渲染第一页作为封面
    // lopdf 只能解析结构无法渲染，尝试提取 PDF 中的嵌入图片
    let doc = Document::load(pdf_path)
        .map_err(|e| format!("无法解析PDF: {}", e))?;

    // 遍历所有对象找图片流
    for (obj_id, obj) in doc.objects.iter() {
        if let lopdf::Object::Stream(stream) = obj {
            let dict = &stream.dict;
            let is_image = match dict.get(b"Subtype") {
                Ok(lopdf::Object::Name(subtype)) => subtype == b"Image",
                _ => false,
            };

            if is_image {
                // 获取图片格式
                let filter = dict.get(b"Filter").ok();
                let color_space = dict.get(b"ColorSpace").ok();

                // 尝试获取流数据
                let mut data = stream.content.clone();
                if !data.is_empty() {
                    // 如果是 DCTDecode (JPEG) 可以直接使用
                    if let Some(lopdf::Object::Array(filters)) = filter {
                        if let Some(lopdf::Object::Name(name)) = filters.first() {
                            if name == b"DCTDecode" {
                                return Ok(scale_image_to_thumbnail(&data, 200, 280));
                            }
                        }
                    } else if let Some(lopdf::Object::Name(name)) = filter {
                        if name == b"DCTDecode" {
                            return Ok(scale_image_to_thumbnail(&data, 200, 280));
                        }
                    }
                }
            }
        }
    }

    // 没找到直接可用的图片，返回错误让前端显示占位符
    Err("PDF中没有找到可直接使用的封面图片".to_string())
}

fn scale_image_to_thumbnail(data: &[u8], max_width: u32, max_height: u32) -> Vec<u8> {
    if let Ok(img) = image::load_from_memory(data) {
        let (w, h) = (img.width(), img.height());

        let (new_w, new_h) = if w as f32 / h as f32 > max_width as f32 / max_height as f32 {
            let ratio = max_width as f32 / w as f32;
            (max_width, (h as f32 * ratio).round() as u32)
        } else {
            let ratio = max_height as f32 / h as f32;
            ((w as f32 * ratio).round() as u32, max_height)
        };

        let resized = img.resize(new_w, new_h, image::imageops::FilterType::Lanczos3);

        // 使用 JPEG 编码器，质量 75（参考 YACReader cover_utils.cpp）
        let mut jpeg_buf = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_buf);
        if let Err(_) = resized.write_to(&mut cursor, image::ImageFormat::Jpeg) {
            return data.to_vec();
        }

        jpeg_buf
    } else {
        data.to_vec()
    }
}
