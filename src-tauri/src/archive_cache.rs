use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Instant;
use std::fs;

struct CachedZipEntries {
    entries: Arc<HashMap<String, Arc<Vec<u8>>>>,
    total_size: usize,
    last_accessed: Instant,
}

struct CachedCbr {
    entries: Arc<HashMap<String, Arc<Vec<u8>>>>,
    last_accessed: Instant,
}

struct CachedZipEntryList {
    names: Arc<Vec<String>>,
    last_accessed: Instant,
}

const ZIP_CACHE_LIMIT: usize = 50;
const CBR_CACHE_MAX_MEMORY: usize = 512 * 1024 * 1024;
const ENTRY_LIST_CACHE_LIMIT: usize = 100;

static ZIP_CACHE: LazyLock<Mutex<HashMap<String, CachedZipEntries>>> = LazyLock::new(|| Mutex::new(HashMap::with_capacity(ZIP_CACHE_LIMIT)));
static CBR_CACHE: LazyLock<Mutex<HashMap<String, CachedCbr>>> = LazyLock::new(|| Mutex::new(HashMap::with_capacity(20)));
static ZIP_ENTRY_LIST_CACHE: LazyLock<Mutex<HashMap<String, CachedZipEntryList>>> = LazyLock::new(|| Mutex::new(HashMap::with_capacity(ENTRY_LIST_CACHE_LIMIT)));

static mut ZIP_TOTAL_MEMORY: usize = 0;
static mut CBR_TOTAL_MEMORY: usize = 0;

fn add_zip_memory(bytes: usize) {
    unsafe { ZIP_TOTAL_MEMORY += bytes; }
}

fn remove_zip_memory(bytes: usize) {
    unsafe { ZIP_TOTAL_MEMORY = ZIP_TOTAL_MEMORY.saturating_sub(bytes); }
}

fn add_cbr_memory(bytes: usize) {
    unsafe { CBR_TOTAL_MEMORY += bytes; }
}

fn remove_cbr_memory(bytes: usize) {
    unsafe { CBR_TOTAL_MEMORY = CBR_TOTAL_MEMORY.saturating_sub(bytes); }
}

pub fn get_or_load_zip_entry(path: &str, entry_path: &str) -> Result<Arc<Vec<u8>>, String> {
    {
        let mut cache = ZIP_CACHE.lock().unwrap();
        if let Some(cached) = cache.get_mut(path) {
            cached.last_accessed = Instant::now();
            match cached.entries.get(entry_path) {
                Some(data) => return Ok(Arc::clone(data)),
                None => return Err(format!("ZIP中找不到条目: {} -> {}", path, entry_path)),
            }
        }
    }

    let data = fs::read(path).map_err(|e| format!("无法打开CBZ文件 {}: {}", path, e))?;
    let cursor = std::io::Cursor::new(&data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("无法读取CBZ档案 {}: {}", path, e))?;

    let mut entries: HashMap<String, Arc<Vec<u8>>> = HashMap::new();
    let mut total_size = 0;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("无法读取CBZ条目 {}: {}", i, e))?;
        let name = entry.name().replace('\\', "/");
        if entry.is_file() {
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut buf)
                .map_err(|e| format!("读取CBZ条目失败 {}: {}", name, e))?;
            total_size += buf.len();
            entries.insert(name, Arc::new(buf));
        }
    }

    let entries = Arc::new(entries);

    {
        let mut cache = ZIP_CACHE.lock().unwrap();
        while cache.len() >= ZIP_CACHE_LIMIT {
            let oldest = cache.iter()
                .min_by_key(|(_, v)| v.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                if let Some(removed) = cache.remove(&key) {
                    remove_zip_memory(removed.total_size);
                }
            }
        }
        add_zip_memory(total_size);
        cache.insert(path.to_string(), CachedZipEntries {
            entries: Arc::clone(&entries),
            total_size,
            last_accessed: Instant::now(),
        });
    }

    match entries.get(entry_path) {
        Some(data) => Ok(Arc::clone(data)),
        None => Err(format!("ZIP中找不到条目: {}", entry_path)),
    }
}

pub fn get_cached_zip_entry_list(path: &str) -> Option<Arc<Vec<String>>> {
    let mut cache = ZIP_ENTRY_LIST_CACHE.lock().unwrap();
    if let Some(cached) = cache.get_mut(path) {
        cached.last_accessed = Instant::now();
        return Some(Arc::clone(&cached.names));
    }
    None
}

pub fn set_cached_zip_entry_list(path: &str, names: Vec<String>) -> Arc<Vec<String>> {
    let names = Arc::new(names);
    {
        let mut cache = ZIP_ENTRY_LIST_CACHE.lock().unwrap();
        while cache.len() >= ENTRY_LIST_CACHE_LIMIT {
            let oldest = cache.iter()
                .min_by_key(|(_, v)| v.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                cache.remove(&key);
            }
        }
        cache.insert(path.to_string(), CachedZipEntryList {
            names: Arc::clone(&names),
            last_accessed: Instant::now(),
        });
    }
    names
}

pub fn get_or_load_zip(path: &str) -> Result<Arc<Vec<u8>>, String> {
    let data = fs::read(path).map_err(|e| format!("无法打开CBZ文件 {}: {}", path, e))?;
    Ok(Arc::new(data))
}

pub fn get_or_extract_cbr(path: &str) -> Result<Arc<HashMap<String, Arc<Vec<u8>>>>, String> {
    {
        let cache = CBR_CACHE.lock().unwrap();
        if let Some(cached) = cache.get(path) {
            return Ok(Arc::clone(&cached.entries));
        }
    }

    use unrar::Archive;
    let mut archive = Archive::new(path)
        .open_for_processing()
        .map_err(|e| format!("无法打开CBR文件 {}: {}", path, e))?;

    let mut entries: HashMap<String, Arc<Vec<u8>>> = HashMap::new();
    let mut total_size = 0;

    loop {
        let Some(before_file) = archive
            .read_header()
            .map_err(|e| format!("读取CBR头失败 {}: {}", path, e))?
        else {
            break;
        };

        let current_name = before_file.entry().filename.to_string_lossy().replace('\\', "/");
        let (data, after_read) = before_file
            .read()
            .map_err(|e| format!("读取CBR条目失败 {}: {}", current_name, e))?;

        total_size += data.len();
        entries.insert(current_name, Arc::new(data));
        archive = after_read;
    }

    let entries = Arc::new(entries);

    {
        let mut cache = CBR_CACHE.lock().unwrap();
        while unsafe { CBR_TOTAL_MEMORY } + total_size > CBR_CACHE_MAX_MEMORY || cache.len() >= 20 {
            let oldest = cache.iter()
                .min_by_key(|(_, v)| v.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                if let Some(removed) = cache.remove(&key) {
                    remove_cbr_memory(removed.entries.values().map(|v| v.len()).sum());
                }
            } else {
                break;
            }
        }
        add_cbr_memory(total_size);
        cache.insert(path.to_string(), CachedCbr {
            entries: Arc::clone(&entries),
            last_accessed: Instant::now(),
        });
    }

    Ok(entries)
}

pub fn get_cache_stats() -> CacheStats {
    let zip_cache = ZIP_CACHE.lock().unwrap();
    let cbr_cache = CBR_CACHE.lock().unwrap();
    CacheStats {
        zip_count: zip_cache.len(),
        cbr_count: cbr_cache.len(),
        zip_memory_mb: unsafe { ZIP_TOTAL_MEMORY } / (1024 * 1024),
        cbr_memory_mb: unsafe { CBR_TOTAL_MEMORY } / (1024 * 1024),
    }
}

#[derive(Debug)]
pub struct CacheStats {
    pub zip_count: usize,
    pub cbr_count: usize,
    pub zip_memory_mb: usize,
    pub cbr_memory_mb: usize,
}
