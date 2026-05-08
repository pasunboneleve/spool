const root = new URL("..", import.meta.url).pathname;
const shutdownTimeoutMs = 2_000;

type ManagedProcess = {
  name: string;
  command: string[];
  proc: Bun.Subprocess<"inherit", "inherit", "inherit">;
};

const processes: ManagedProcess[] = [
  spawnManaged("worker", ["bun", "--watch", "apps/worker-shell/src/server.ts"]),
  spawnManaged("frontend", [
    "bun",
    "run",
    "--cwd",
    "apps/frontend",
    "vite",
    "--host",
    "0.0.0.0",
    "--port",
    "5173",
    "--strictPort"
  ])
];

let shuttingDown = false;

function spawnManaged(name: string, command: string[]): ManagedProcess {
  console.log(`[dev] ${name}: ${command.join(" ")}`);
  return {
    name,
    command,
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
    await Promise.allSettled(processes.map(({ proc }) => proc.exited));
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
  const exitCode = await Promise.race(processes.map(({ name, command, proc }) => proc.exited.then((code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}: ${command.join(" ")}`);
    }
    return code;
  })));
  await shutdown("exit");
  process.exit(exitCode ?? 0);
} catch (error) {
  await shutdown("exit");
  throw error;
}
