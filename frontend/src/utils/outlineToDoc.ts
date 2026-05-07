import type { TipTapDoc, TipTapNode } from "../types/editor";

interface OutlineSection {
  title: string;
  description: string;
  subsections: { title: string; description: string }[];
}

export function outlineToDoc(projectTitle: string, sections: OutlineSection[]): TipTapDoc {
  const content: TipTapNode[] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: projectTitle }] },
  ];

  for (const section of sections) {
    content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: section.title }] });
    if (section.description) {
      content.push({ type: "paragraph", content: [{ type: "text", text: section.description }] });
    }
    for (const sub of section.subsections) {
      content.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: sub.title }] });
      if (sub.description) {
        content.push({ type: "paragraph", content: [{ type: "text", text: sub.description }] });
      }
    }
  }

  return { type: "doc", content };
}
