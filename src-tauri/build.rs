#[cfg(feature = "tauri-app")]
fn main() {
    tauri_build::build()
}

#[cfg(not(feature = "tauri-app"))]
fn main() {}
