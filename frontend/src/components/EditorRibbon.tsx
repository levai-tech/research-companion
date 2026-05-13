import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor | null;
}

const btnBase: React.CSSProperties = {
  width: 28, height: 28, border: "none", borderRadius: 4,
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  transition: "background 140ms var(--ease-out), color 140ms var(--ease-out)",
};

function Btn({ label, active, onActivate, children }: {
  label: string; active: boolean; onActivate: () => void; children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); onActivate(); }}
      style={{ ...btnBase, background: active ? "var(--brand-navy-800)" : "transparent", color: active ? "var(--paper-0)" : "var(--foreground-muted)" }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-sunken)"; if (!active) e.currentTarget.style.color = "var(--foreground)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; if (!active) e.currentTarget.style.color = "var(--foreground-muted)"; }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px", display: "inline-block" }} />;
}

function BulletListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="3.5" r="1.5" />
      <rect x="6" y="2.5" width="8.5" height="2" rx="1" />
      <circle cx="2.5" cy="8" r="1.5" />
      <rect x="6" y="7" width="8.5" height="2" rx="1" />
      <circle cx="2.5" cy="12.5" r="1.5" />
      <rect x="6" y="11.5" width="8.5" height="2" rx="1" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1.75 1.25h.75v3h-.75V2.5H1v-.75h.75V1.25z" />
      <rect x="5.5" y="2" width="9" height="1.75" rx="0.875" />
      <path d="M1 6.25h1.25c.41 0 .75.34.75.75s-.34.75-.75.75H1.5v.5H3V9H1V6.25z" />
      <rect x="5.5" y="6.875" width="9" height="1.75" rx="0.875" />
      <path d="M1 11.25h1.5c.28 0 .5.22.5.5s-.22.5-.5.5H1.5v.5h.75c.28 0 .5.22.5.5s-.22.5-.5.5H1v-.75h1v-.5H1v-.75z" />
      <rect x="5.5" y="11.75" width="9" height="1.75" rx="0.875" />
    </svg>
  );
}

function RibbonContent({ editor }: { editor: Editor }) {
  const { isH1, isH2, isH3, isPara, isBold, isItalic, isBullet, isOrdered } =
    useEditorState({
      editor,
      selector: (ctx) => ({
        isH1: ctx.editor.isActive("heading", { level: 1 }),
        isH2: ctx.editor.isActive("heading", { level: 2 }),
        isH3: ctx.editor.isActive("heading", { level: 3 }),
        isPara: ctx.editor.isActive("paragraph"),
        isBold: ctx.editor.isActive("bold"),
        isItalic: ctx.editor.isActive("italic"),
        isBullet: ctx.editor.isActive("bulletList"),
        isOrdered: ctx.editor.isActive("orderedList"),
      }),
    });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 2, padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
      <Btn label="Normal text" active={isPara} onActivate={() => editor.commands.setParagraph()}>
        <span style={{ fontSize: 12, lineHeight: 1 }}>¶</span>
      </Btn>

      <Sep />

      <Btn label="H1" active={isH1} onActivate={() => editor.commands.toggleHeading({ level: 1 })}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, lineHeight: 1 }}>H1</span>
      </Btn>
      <Btn label="H2" active={isH2} onActivate={() => editor.commands.toggleHeading({ level: 2 })}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, lineHeight: 1 }}>H2</span>
      </Btn>
      <Btn label="H3" active={isH3} onActivate={() => editor.commands.toggleHeading({ level: 3 })}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, lineHeight: 1 }}>H3</span>
      </Btn>

      <Sep />

      <Btn label="Bold" active={isBold} onActivate={() => editor.commands.toggleBold()}>
        <span style={{ fontFamily: "var(--font-serif)", fontWeight: 900, fontSize: 14, lineHeight: 1 }}>B</span>
      </Btn>
      <Btn label="Italic" active={isItalic} onActivate={() => editor.commands.toggleItalic()}>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>I</span>
      </Btn>

      <Sep />

      <Btn label="Bullet List" active={isBullet} onActivate={() => editor.commands.toggleBulletList()}>
        <BulletListIcon />
      </Btn>
      <Btn label="Numbered List" active={isOrdered} onActivate={() => editor.commands.toggleOrderedList()}>
        <NumberedListIcon />
      </Btn>

      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground-muted)" }}>saved</span>
    </div>
  );
}

export default function EditorRibbon({ editor }: Props) {
  if (!editor) return null;
  return <RibbonContent editor={editor} />;
}
