pub mod sidecar;

#[cfg(feature = "tauri-app")]
mod app;

#[cfg(feature = "tauri-app")]
pub use app::run;
