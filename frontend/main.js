import { invoke } from "@tauri-apps/api/core";

async function checkBackend() {
  const port = await invoke("backend_port");
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const data = await res.json();
  document.getElementById("app").textContent =
    `Backend status: ${data.status} (port ${port})`;
}

checkBackend().catch(console.error);
