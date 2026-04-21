use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Instant;
use std::fs;

struct CachedZip {
    data: Arc<Vec<u8>>,
    last_accessed: Instant,
}

struct CachedCbr {
    entries: Arc<HashMap<String, Vec<u8>>>,
    last_accessed: Instant,
}

static ZIP_CACHE: LazyLock<Mutex<HashMap<String, CachedZip>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static CBR_CACHE: LazyLock<Mutex<HashMap<String, CachedCbr>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn get_or_load_zip(path: &str) -> Result<Arc<Vec<u8>>, String> {
    {
        let mut cache = ZIP_CACHE.lock().unwrap();
        if let Some(cached) = cache.get_mut(path) {
            cached.last_accessed = Instant::now();
            return Ok(Arc::clone(&cached.data));
        }
    }
    
    let data = Arc::new(fs::read(path).map_err(|e| format!("无法打开CBZ文件 {}: {}", path, e))?);
    
    {
        let mut cache = ZIP_CACHE.lock().unwrap();
        // LRU 淘汰：移除到上限以下
        while cache.len() >= 50 {
            let oldest = cache.iter()
                .min_by_key(|(_, v)| v.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                cache.remove(&key);
            }
        }
        cache.insert(path.to_string(), CachedZip {
            data: Arc::clone(&data),
            last_accessed: Instant::now(),
        });
    }
    
    Ok(data)
}

pub fn get_or_extract_cbr(path: &str) -> Result<Arc<HashMap<String, Vec<u8>>>, String> {
    {
        let mut cache = CBR_CACHE.lock().unwrap();
        if let Some(cached) = cache.get_mut(path) {
            cached.last_accessed = Instant::now();
            return Ok(Arc::clone(&cached.entries));
        }
    }
    
    use unrar::Archive;
    let mut archive = Archive::new(path)
        .open_for_processing()
        .map_err(|e| format!("无法打开CBR文件 {}: {}", path, e))?;
    
    let mut entries = HashMap::new();
    
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
        
        entries.insert(current_name, data);
        archive = after_read;
    }
    
    let entries = Arc::new(entries);
    
    {
        let mut cache = CBR_CACHE.lock().unwrap();
        if cache.len() >= 10 {
            let oldest = cache.iter()
                .min_by_key(|(_, v)| v.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                cache.remove(&key);
            }
        }
        cache.insert(path.to_string(), CachedCbr {
            entries: Arc::clone(&entries),
            last_accessed: Instant::now(),
        });
    }
    
    Ok(entries)
}
