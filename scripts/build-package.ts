import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

// TypeScript paths only affect resolution. Publish portable ESM and declarations
// so consumers do not need this repository's aliases in their own configuration.
const output = resolve("dist");
for (const entry of await readdir(output, { recursive: true })) {
  if (!entry.endsWith(".js") && !entry.endsWith(".d.ts")) continue;
  const filename = join(output, entry);
  const source = await readFile(filename, "utf8");
  const rewritten = source.replace(
    /(["'])@cardgame\/([^"']+)\1/g,
    (_, quote: string, target: string) => {
      const path = relative(dirname(filename), join(output, target)).replaceAll("\\", "/");
      return `${quote}${path.startsWith(".") ? path : `./${path}`}${quote}`;
    },
  );
  await writeFile(filename, rewritten);
}
await cp("src/assets", join(output, "assets"), { recursive: true });
