use std::net::TcpListener;
use std::process::{Child, Command};

pub struct SidecarHandle {
    process: Child,
    pub port: u16,
}

impl SidecarHandle {
    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for SidecarHandle {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}

pub fn find_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind");
    listener.local_addr().unwrap().port()
}

pub fn start_backend(python: &str, backend_dir: &str) -> Result<SidecarHandle, std::io::Error> {
    let port = find_free_port();
    let process = Command::new(python)
        .args(["-m", "backend.main", "--port", &port.to_string()])
        .env("PYTHONPATH", backend_dir)
        .current_dir(backend_dir)
        .spawn()?;
    Ok(SidecarHandle { process, port })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpStream;
    use std::time::{Duration, Instant};

    fn backend_dir() -> String {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("backend")
            .to_str()
            .unwrap()
            .to_owned()
    }

    fn wait_for_port(port: u16, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        false
    }

    #[test]
    fn find_free_port_returns_valid_range() {
        let port = find_free_port();
        assert!(port >= 1024);
    }

    #[test]
    fn find_free_port_is_bindable() {
        let port = find_free_port();
        TcpListener::bind(format!("127.0.0.1:{port}"))
            .expect("port returned by find_free_port should be bindable");
    }

    #[test]
    fn sidecar_starts_and_health_responds() {
        let dir = backend_dir();
        let handle = start_backend("python3", &dir).expect("failed to start backend");
        let port = handle.port();
        assert!(
            wait_for_port(port, Duration::from_secs(5)),
            "backend did not start on port {port}"
        );
    }

    #[test]
    fn dropping_handle_kills_process() {
        let dir = backend_dir();
        let handle = start_backend("python3", &dir).expect("failed to start backend");
        let port = handle.port();
        assert!(wait_for_port(port, Duration::from_secs(5)), "backend never started");

        drop(handle);
        std::thread::sleep(Duration::from_millis(300));

        assert!(
            TcpStream::connect(format!("127.0.0.1:{port}")).is_err(),
            "port {port} still reachable after drop — process was not killed"
        );
    }
}
