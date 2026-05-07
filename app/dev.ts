const root = new URL("..", import.meta.url).pathname;
const shutdownTimeoutMs = 2_000;

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

type ManagedProcess = {
  name: string;
  proc: Bun.Subprocess<"inherit", "inherit", "inherit">;
};

const processes: ManagedProcess[] = [
  spawnManaged("worker", ["bun", "run", "worker:dev"]),
  spawnManaged("frontend", ["bun", "run", "frontend:dev"])
];

let shuttingDown = false;

function spawnManaged(name: string, command: string[]): ManagedProcess {
  return {
    name,
    proc: Bun.spawn(command, {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
      detached: true
    })
  };
}

async function shutdown(signal: NodeJS.Signals | "exit") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[dev] shutting down (${signal})`);

  for (const { name, proc } of processes) {
    terminateProcessGroup(name, proc, "SIGTERM");
  }

  const settled = await Promise.race([
    Promise.allSettled(processes.map(({ proc }) => proc.exited)),
    Bun.sleep(shutdownTimeoutMs).then(() => "timeout" as const)
  ]);

  if (settled === "timeout") {
    for (const { name, proc } of processes) {
      terminateProcessGroup(name, proc, "SIGKILL");
    }
  }
}

function terminateProcessGroup(
  name: string,
  proc: Bun.Subprocess<"inherit", "inherit", "inherit">,
  signal: NodeJS.Signals
) {
  try {
    process.kill(-proc.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      console.warn(`[dev] failed to send ${signal} to ${name}:`, error);
    }
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT").finally(() => process.exit(130));
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM").finally(() => process.exit(143));
});

try {
  const exitCode = await Promise.race(processes.map(({ proc }) => proc.exited));
  await shutdown("exit");
  process.exit(exitCode ?? 0);
} catch (error) {
  await shutdown("exit");
  throw error;
}
