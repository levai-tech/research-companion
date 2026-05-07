import { describe, it, expect } from "vitest";
import { outlineToDoc } from "./outlineToDoc";

const SECTIONS = [
  {
    title: "The Ticking Clock",
    description: "Introduces the quantum threat timeline.",
    subsections: [
      { title: "What Quantum Computers Can Do Today", description: "Current capabilities." },
      { title: "The 10-Year Horizon", description: "When encryption breaks down." },
    ],
  },
  {
    title: "Ordinary People at Risk",
    description: "Makes the threat personal.",
    subsections: [],
  },
];

describe("outlineToDoc", () => {
  it("opens with an h1 containing the project title", () => {
    const doc = outlineToDoc("Quantum Security", SECTIONS);
    expect(doc.type).toBe("doc");
    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Quantum Security" }],
    });
  });

  it("renders each section as an h2 followed by its description paragraph", () => {
    const doc = outlineToDoc("Quantum Security", SECTIONS);
    const nodes = doc.content;
    const clockHeading = nodes.find(
      (n) => n.type === "heading" && n.attrs?.level === 2 && n.content?.[0]?.text === "The Ticking Clock",
    );
    expect(clockHeading).toBeDefined();
    const clockIdx = nodes.indexOf(clockHeading!);
    expect(nodes[clockIdx + 1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Introduces the quantum threat timeline." }],
    });
  });

  it("renders each subsection as an h3 followed by its description paragraph", () => {
    const doc = outlineToDoc("Quantum Security", SECTIONS);
    const nodes = doc.content;
    const subHeading = nodes.find(
      (n) => n.type === "heading" && n.attrs?.level === 3 && n.content?.[0]?.text === "What Quantum Computers Can Do Today",
    );
    expect(subHeading).toBeDefined();
    const subIdx = nodes.indexOf(subHeading!);
    expect(nodes[subIdx + 1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Current capabilities." }],
    });
  });

  it("sections with no subsections produce no h3 nodes", () => {
    const doc = outlineToDoc("Quantum Security", SECTIONS);
    const riskSection = SECTIONS[1];
    const h3sUnderRisk = doc.content.filter(
      (n) => n.type === "heading" && n.attrs?.level === 3,
    );
    expect(
      h3sUnderRisk.every((n) => n.content?.[0]?.text !== riskSection.title),
    ).toBe(true);
  });
});
