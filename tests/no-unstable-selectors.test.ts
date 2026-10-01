// Regression guard for the "Maximum update depth exceeded" crash.
// Zustand selectors must return referentially stable values: a selector like
//   useOfficeStore((s) => s.tasks.filter(...))
// allocates a new array on every snapshot, so useSyncExternalStore sees the
// snapshot change on every render and React re-renders forever.
// Rule: selectors may only project stable state (properties, .find() hits,
// primitives). Derive filtered lists with useMemo in the component body.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["components", "hooks", "app"];
// Patterns that allocate a fresh reference on every selector evaluation.
const FORBIDDEN = [/\.filter\s*\(/, /\.map\s*\(/, /\.slice\s*\(/, /\.sort\s*\(/, /\?\?\s*\[\]/];

/** Extract the bodies of useXStore((s) => <body>) selectors from source. */
function selectorBodies(src: string): string[] {
  const bodies: string[] = [];
  const re = /use\w+Store\s*\(\s*\(\s*s\s*\)\s*=>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // body starts after the arrow; it ends at the matching close paren
    // of the useXStore( call (depth tracking from the open paren).
    let i = m.index + m[0].length;
    let depth = 1; // inside useXStore(
    let body = "";
    let inStr: string | null = null;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      const prev = src[i - 1];
      if (inStr) {
        if (ch === inStr && prev !== "\\") inStr = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inStr = ch;
      } else if (ch === "(" || ch === "{" || ch === "[") {
        depth++;
      } else if (ch === ")" || ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) break;
      }
      body += ch;
      i++;
    }
    bodies.push(body);
  }
  return bodies;
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("stable zustand selectors", () => {
  it("no selector allocates a new array/object per snapshot", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const abs = path.join(process.cwd(), root);
      if (!fs.existsSync(abs)) continue;
      for (const file of tsxFiles(abs)) {
        const src = fs.readFileSync(file, "utf-8");
        for (const body of selectorBodies(src)) {
          for (const pat of FORBIDDEN) {
            if (pat.test(body)) {
              offenders.push(`${path.relative(process.cwd(), file)}: selector uses ${pat} — move it into useMemo`);
              break;
            }
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
