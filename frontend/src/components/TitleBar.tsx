import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        background: "var(--sidebar)",
        borderBottom: "1px solid var(--border)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div style={{ display: "flex" }}>
        <button aria-label="Minimize" onClick={() => win.minimize()} style={btnStyle}>
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
        </button>
        <button aria-label="Maximize" onClick={() => win.toggleMaximize()} style={btnStyle}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
        </button>
        <button aria-label="Close" onClick={() => win.close()} style={btnStyle}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 40,
  height: 28,
  border: "none",
  background: "transparent",
  color: "var(--foreground-muted)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
