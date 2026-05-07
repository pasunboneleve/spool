const root = new URL("..", import.meta.url).pathname;

async function runStep(name: string, command: string[]) {
  console.log(`[dev] ${name}: ${command.join(" ")}`);
  const proc = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit"
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${name} failed with exit code ${code}`);
  }
}

await runStep("build wasm", ["bun", "run", "wasm:build"]);
await runStep("build mock-agent", ["bun", "run", "mock:build"]);

const processes = [
  Bun.spawn(["bun", "run", "worker:dev"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit"
  }),
  Bun.spawn(["bun", "run", "frontend:dev"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit"
  })
];

const shutdown = () => {
  for (const proc of processes) {
    proc.kill();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(processes.map((proc) => proc.exited));
shutdown();
