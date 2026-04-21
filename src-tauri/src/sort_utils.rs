use std::cmp::Ordering;
use std::sync::LazyLock;
use regex::Regex;

// 参考: e:\06-xiangmu\处理中\new2\manga-reader\src-tauri\src\archive_parser.rs (原 L20-L65)
// 参考: e:\06-xiangmu\处理中\new2\manga-reader\src-tauri\src\library_scanner.rs (原 L170-L215)

/// 缓存的正则表达式，避免每次比较时重新编译
static NUMBER_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+)").unwrap());

/// 自然排序比较函数
/// 例如: "chapter1" < "chapter2" < "chapter10"
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    if a == b {
        return Ordering::Equal;
    }
    
    let re = &*NUMBER_RE;
    let mut a_parts = re.find_iter(a);
    let mut b_parts = re.find_iter(b);

    let mut a_pos = 0;
    let mut b_pos = 0;

    loop {
        let a_match = a_parts.next();
        let b_match = b_parts.next();

        match (a_match, b_match) {
            (Some(am), Some(bm)) => {
                let a_before = &a[a_pos..am.start()];
                let b_before = &b[b_pos..bm.start()];

                // 惰性小写转换：仅在需要时才创建小写字符串
                if a_before != b_before {
                    let a_lower = a.to_ascii_lowercase();
                    let b_lower = b.to_ascii_lowercase();
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
            _ => {
                let a_lower = a.to_ascii_lowercase();
                let b_lower = b.to_ascii_lowercase();
                return a_lower.cmp(&b_lower);
            }
        }
    }
}
