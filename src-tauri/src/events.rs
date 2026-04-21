use tauri::{AppHandle, Emitter};
use serde::Serialize;

pub fn emit_event<T: serde::Serialize>(app: &AppHandle, event: &str, payload: &T) {
    let _ = app.emit(event, payload);
}

#[derive(Serialize)]
struct ScanProgressPayload<'a> {
    status: &'a str,
    message: &'a str,
    progress: Option<f64>,
}

pub fn emit_scan_progress(app: &AppHandle, status: &str, message: &str, progress: Option<f64>) {
    emit_event(
        app,
        "scan_progress",
        &ScanProgressPayload { status, message, progress },
    );
}

#[derive(Serialize)]
struct EmptyPayload {}

pub fn emit_library_updated(app: &AppHandle) {
    emit_event(app, "library_updated", &EmptyPayload {});
}

#[derive(Serialize)]
struct PathPayload<'a> {
    path: &'a str,
}

pub fn emit_path_added(app: &AppHandle, path: &str) {
    emit_event(app, "path_added", &PathPayload { path });
}

pub fn emit_path_removed(app: &AppHandle, path: &str) {
    emit_event(app, "path_removed", &PathPayload { path });
}

#[derive(Serialize)]
struct ReadingProgressPayload {
    comic_id: i64,
    page: i64,
}

pub fn emit_reading_progress_saved(app: &AppHandle, comic_id: i64, page: i64) {
    emit_event(
        app,
        "reading_progress_saved",
        &ReadingProgressPayload { comic_id, page },
    );
}

#[derive(Serialize)]
struct FavoritePayload {
    comic_id: i64,
    is_favorite: bool,
}

pub fn emit_favorite_toggled(app: &AppHandle, comic_id: i64, is_favorite: bool) {
    emit_event(
        app,
        "favorite_toggled",
        &FavoritePayload { comic_id, is_favorite },
    );
}

#[derive(Serialize)]
struct TagAddedPayload<'a> {
    comic_id: i64,
    tag_name: &'a str,
}

pub fn emit_tag_added(app: &AppHandle, comic_id: i64, tag_name: &str) {
    emit_event(
        app,
        "tag_added",
        &TagAddedPayload { comic_id, tag_name },
    );
}

#[derive(Serialize)]
struct TagRemovedPayload {
    comic_id: i64,
    tag_id: i64,
}

pub fn emit_tag_removed(app: &AppHandle, comic_id: i64, tag_id: i64) {
    emit_event(
        app,
        "tag_removed",
        &TagRemovedPayload { comic_id, tag_id },
    );
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    message: &'a str,
}

pub fn emit_error(app: &AppHandle, message: &str) {
    emit_event(app, "error", &ErrorPayload { message });
}
