import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor | null;
}

function Btn({
  label,
  active,
  onActivate,
  children,
}: {
  label: string;
  active: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onActivate();
      }}
      className={`flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded text-sm select-none transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-5 bg-neutral-200 mx-1" />;
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
    <div className="sticky top-0 z-10 flex items-center gap-0.5 px-3 py-1.5 border-b border-neutral-200 bg-white shrink-0">
      <Btn label="Normal text" active={isPara} onActivate={() => editor.commands.setParagraph()}>
        <span className="text-xs leading-none">¶</span>
      </Btn>

      <Sep />

      <Btn label="H1" active={isH1} onActivate={() => editor.commands.toggleHeading({ level: 1 })}>
        <span className="font-mono font-bold text-xs leading-none">H1</span>
      </Btn>
      <Btn label="H2" active={isH2} onActivate={() => editor.commands.toggleHeading({ level: 2 })}>
        <span className="font-mono font-bold text-xs leading-none">H2</span>
      </Btn>
      <Btn label="H3" active={isH3} onActivate={() => editor.commands.toggleHeading({ level: 3 })}>
        <span className="font-mono font-bold text-xs leading-none">H3</span>
      </Btn>

      <Sep />

      <Btn label="Bold" active={isBold} onActivate={() => editor.commands.toggleBold()}>
        <span className="font-serif font-black text-sm leading-none">B</span>
      </Btn>
      <Btn label="Italic" active={isItalic} onActivate={() => editor.commands.toggleItalic()}>
        <span className="font-serif italic font-bold text-sm leading-none">I</span>
      </Btn>

      <Sep />

      <Btn label="Bullet List" active={isBullet} onActivate={() => editor.commands.toggleBulletList()}>
        <BulletListIcon />
      </Btn>
      <Btn label="Numbered List" active={isOrdered} onActivate={() => editor.commands.toggleOrderedList()}>
        <NumberedListIcon />
      </Btn>
    </div>
  );
}

export default function EditorRibbon({ editor }: Props) {
  if (!editor) return null;
  return <RibbonContent editor={editor} />;
}
