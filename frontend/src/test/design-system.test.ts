import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const ROOT = resolve(__dirname, "../..");

const REQUIRED_TOKENS = [
  "--background",
  "--border",
  "--border-strong",
  "--brand-cyan-400",
  "--brand-cyan-500",
  "--brand-cyan-600",
  "--brand-navy-700",
  "--brand-navy-800",
  "--ease-out",
  "--font-mono",
  "--font-sans",
  "--font-serif",
  "--foreground",
  "--foreground-muted",
  "--foreground-subtle",
  "--ink-700",
  "--paper-0",
  "--shadow-focus",
  "--shadow-lg",
  "--shadow-xl",
  "--shadow-xs",
  "--sidebar",
  "--sidebar-active",
  "--sidebar-fg",
  "--sidebar-hover",
  "--sidebar-muted",
  "--signal-danger",
  "--signal-success",
  "--surface",
  "--surface-sunken",
];

describe("design system: tokens.css", () => {
  const tokenPath = resolve(ROOT, "src/styles/tokens.css");

  it("tokens.css exists", () => {
    expect(existsSync(tokenPath)).toBe(true);
  });

  it("defines all required CSS custom properties", () => {
    const css = readFileSync(tokenPath, "utf-8");
    const missing = REQUIRED_TOKENS.filter((token) => !css.includes(`${token}:`));
    expect(missing).toEqual([]);
  });
});

describe("design system: index.css", () => {
  const indexPath = resolve(ROOT, "src/index.css");
  let css: string;

  it("tokens.css is imported before tailwindcss", () => {
    css = readFileSync(indexPath, "utf-8");
    const tokensPos = css.indexOf("tokens.css");
    const tailwindPos = css.indexOf("tailwindcss");
    expect(tokensPos).toBeGreaterThan(-1);
    expect(tailwindPos).toBeGreaterThan(-1);
    expect(tokensPos).toBeLessThan(tailwindPos);
  });

  it("has a @theme block mapping brand-cyan and brand-navy tokens", () => {
    css = css ?? readFileSync(indexPath, "utf-8");
    expect(css).toContain("@theme");
    expect(css).toContain("--color-brand-cyan");
    expect(css).toContain("--color-brand-navy");
  });
});

describe("design system: font vars", () => {
  it("--font-serif references Source Serif 4", () => {
    const tokenPath = resolve(ROOT, "src/styles/tokens.css");
    const css = readFileSync(tokenPath, "utf-8");
    expect(css).toContain("--font-serif:");
    expect(css.toLowerCase()).toContain("source serif");
  });
});

describe("design system: logo assets", () => {
  it("logo-mark.png exists at frontend/public/assets/", () => {
    expect(existsSync(resolve(ROOT, "public/assets/logo-mark.png"))).toBe(true);
  });

  it("logo-mark-square.png exists at frontend/public/assets/", () => {
    expect(existsSync(resolve(ROOT, "public/assets/logo-mark-square.png"))).toBe(true);
  });
});
