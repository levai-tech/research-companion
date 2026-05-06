export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}

export interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}
