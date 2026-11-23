import { readFileSync } from "node:fs";
import path from "node:path";

let css: string | undefined;

/** Embedded faces also work on offline pages opened with setContent. */
export function clubFontCss(): string {
  if (css) return css;
  css = [
    ["Glanz", "glanz", "normal"],
    ["Glanz", "glanz-italic", "italic"],
    ["Noto Sans Armenian", "noto-sans-armenian", "normal"],
  ].map(([family, file, style]) => {
    const bytes = readFileSync(path.join(process.cwd(), "public", "fonts", file + ".woff2"));
    return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');font-style:${style};font-weight:400}`;
  }).join("\n");
  return css;
}
