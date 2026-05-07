import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useAppStore } from "../store";
import type { TipTapDoc } from "../types/editor";
import EditorRibbon from "./EditorRibbon";

const AUTOSAVE_DEBOUNCE_MS = 1000;

interface Props {
  projectId: string;
}

export default function BlockEditor({ projectId }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (doc: TipTapDoc) => {
      if (!port) return;
      fetch(`http://127.0.0.1:${port}/projects/${projectId}/document`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
      });
    },
    [port, projectId],
  );

  const editor = useEditor({
    extensions: [StarterKit],
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(editor.getJSON() as TipTapDoc), AUTOSAVE_DEBOUNCE_MS);
    },
  });

  useEffect(() => {
    if (!port || !editor) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/document`)
      .then((r) => r.json())
      .then((doc: TipTapDoc) => editor.commands.setContent(doc));
  }, [port, projectId, editor]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <EditorRibbon editor={editor} />
      <div className="flex-1 overflow-y-auto px-8 py-6 prose prose-neutral max-w-3xl mx-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
