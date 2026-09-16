// railway/iac uses `_` to locate the CLI during its version check. Shells may
// set it to Bun, Node, or an extensionless Windows path instead of Railway.
export function railwayCommand(args: string[]) {
  const executable = Bun.which("railway");
  if (!executable)
    throw new Error("Railway CLI not found. Install it with bun add -g @railway/cli.");
  return {
    cmd: [executable, ...args],
    env: { ...process.env, _: executable },
  };
}

if (import.meta.main) {
  const command = railwayCommand(process.argv.slice(2));
  const child = Bun.spawn({ ...command, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}
