const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  ready:    { bg: "rgba(31, 138, 91, 0.12)",  fg: "var(--signal-success, #1f8a5b)" },
  indexing: { bg: "rgba(11, 158, 209, 0.12)", fg: "var(--brand-cyan-600, #0b9ed1)" },
  failed:   { bg: "rgba(192, 57, 43, 0.10)",  fg: "var(--signal-danger, #c0392b)" },
  queued:   { bg: "var(--surface-sunken, #f4f3ef)", fg: "var(--foreground-muted, #888)" },
};

export default function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.queued;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 999,
        background: colors.bg,
        color: colors.fg,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: "currentColor" }} />
      {status}
    </span>
  );
}
