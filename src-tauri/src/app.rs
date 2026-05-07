use std::sync::Mutex;
use tauri::{Manager, State};

use crate::sidecar;

struct BackendState(Mutex<Option<sidecar::SidecarHandle>>);

#[tauri::command]
fn backend_port(state: State<BackendState>) -> u16 {
    state
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|h| h.port)
        .unwrap_or(0)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let backend_dir = app
                .path()
                .resource_dir()
                .unwrap()
                .join("backend")
                .to_string_lossy()
                .to_string();

            let python = format!("{}/.venv/bin/python3", backend_dir);
            let handle = sidecar::start_backend(&python, &backend_dir)
                .expect("failed to start Python backend");

            app.manage(BackendState(Mutex::new(Some(handle))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_port])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
