use tauri::{AppHandle, Emitter};

pub fn emit_event<T: serde::Serialize>(app: &AppHandle, event: &str, payload: &T) {
    app.emit(event, payload).unwrap_or_else(|e| {
        eprintln!("Failed to emit event {}: {}", event, e);
    });
}

pub fn emit_scan_progress(app: &AppHandle, status: &str, message: &str, progress: Option<f64>) {
    emit_event(
        app,
        "scan_progress",
        &serde_json::json!({
            "status": status,
            "message": message,
            "progress": progress,
        }),
    );
}

pub fn emit_library_updated(app: &AppHandle) {
    emit_event(app, "library_updated", &serde_json::json!({}));
}

pub fn emit_path_added(app: &AppHandle, path: &str) {
    emit_event(
        app,
        "path_added",
        &serde_json::json!({ "path": path }),
    );
}

pub fn emit_path_removed(app: &AppHandle, path: &str) {
    emit_event(
        app,
        "path_removed",
        &serde_json::json!({ "path": path }),
    );
}

pub fn emit_reading_progress_saved(app: &AppHandle, comic_id: i64, page: i64) {
    emit_event(
        app,
        "reading_progress_saved",
        &serde_json::json!({
            "comic_id": comic_id,
            "page": page,
        }),
    );
}

pub fn emit_favorite_toggled(app: &AppHandle, comic_id: i64, is_favorite: bool) {
    emit_event(
        app,
        "favorite_toggled",
        &serde_json::json!({
            "comic_id": comic_id,
            "is_favorite": is_favorite,
        }),
    );
}

pub fn emit_tag_added(app: &AppHandle, comic_id: i64, tag_name: &str) {
    emit_event(
        app,
        "tag_added",
        &serde_json::json!({
            "comic_id": comic_id,
            "tag_name": tag_name,
        }),
    );
}

pub fn emit_tag_removed(app: &AppHandle, comic_id: i64, tag_id: i64) {
    emit_event(
        app,
        "tag_removed",
        &serde_json::json!({
            "comic_id": comic_id,
            "tag_id": tag_id,
        }),
    );
}

pub fn emit_error(app: &AppHandle, message: &str) {
    emit_event(
        app,
        "error",
        &serde_json::json!({ "message": message }),
    );
}
