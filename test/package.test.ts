import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  files?: string[];
  engines?: { node?: string };
};

/**
 * Guards the promises the package makes about itself.
 *
 * "Zero runtime dependencies" is asserted in the README, the package
 * description and a badge, and it is a reason to choose this library over
 * writing the same logic inline — a billing system does not want a transitive
 * dependency tree under its VAT arithmetic. Three claims would quietly become
 * false the moment someone ran `npm install --save` and the badge, being
 * static, would go on saying zero.
 *
 * The files allowlist is checked for the same reason: it is the only thing
 * keeping src/, test/ and .claude/ out of the published tarball, and it fails
 * open — a typo there ships more than intended rather than less.
 */

describe("package claims", () => {
  it("has no runtime dependencies", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("has no peer or optional dependencies either", () => {
    // Both install transitively in their own way, so neither is compatible
    // with the zero-dependency claim.
    expect({
      peer: Object.keys(pkg.peerDependencies ?? {}),
      optional: Object.keys(pkg.optionalDependencies ?? {}),
    }).toEqual({ peer: [], optional: [] });
  });

  it("ships only the built output and the documents", () => {
    // The three oracle implementations are devDependencies and must never be
    // reachable from the published package; nothing in src/ imports them.
    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE", "CHANGELOG.md"]);
  });

  it("declares the minimum node the CI matrix actually covers", () => {
    expect(pkg.engines?.node).toBe(">=20");
  });
});
