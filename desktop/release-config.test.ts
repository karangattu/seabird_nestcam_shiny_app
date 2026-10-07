import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = JSON.parse(readFileSync("package.json", "utf8"));
test("uses installer names that GitHub uploads without changing update URLs", () => {
  const names = new Set<string>();
  for (const [platform, arch, ext] of [["win","x64","exe"],["mac","x64","zip"],["mac","arm64","zip"],["mac","x64","dmg"],["mac","arm64","dmg"]]) {
    const template = config.build[platform].artifactName;
    expect(template).toEqual(expect.any(String));
    const values: Record<string, string> = {version:config.version, arch, ext, productName:config.build.productName};
    const name = template.replace(/\$\{(\w+)\}/g, (_: string, key: string) => values[key]);
    expect(name).toMatch(/^Seabird-NestCam-Annotation-/);
    expect(name.replace(/[^a-zA-Z0-9_.-]/g, ".")).toBe(name);
    expect(names.has(name)).toBe(false);
    names.add(name);
  }
});
