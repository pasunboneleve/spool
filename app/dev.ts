const root = new URL("..", import.meta.url).pathname;
const frontendRoot = new URL("../apps/frontend/", import.meta.url).pathname;
const shutdownTimeoutMs = 2_000;

type ManagedProcess = {
  name: string;
  command: string[];
  cwd: string;
  proc: Bun.Subprocess<"inherit", "inherit", "inherit">;
};

const processes: ManagedProcess[] = [
  spawnManaged("worker", ["bun", "--watch", "apps/worker-shell/src/server.ts"]),
  spawnManaged("frontend", [
    "node_modules/.bin/vite",
    "--host",
    "0.0.0.0",
    "--port",
    "5173",
    "--strictPort"
  ], frontendRoot)
];

let shuttingDown = false;
let requestedShutdown = false;

function isExpectedSignalExit(code: number | null) {
  return code === 130 || code === 143;
}

function spawnManaged(name: string, command: string[], cwd = root): ManagedProcess {
  console.log(`[dev] ${name}: ${command.join(" ")}`);
  return {
    name,
    command,
    cwd,
    proc: Bun.spawn(command, {
      cwd,
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
  requestedShutdown = true;
  shutdown("SIGINT").finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  requestedShutdown = true;
  shutdown("SIGTERM").finally(() => process.exit(0));
});

try {
  const exitCode = await Promise.race(processes.map(({ name, command, proc }) => proc.exited.then((code) => {
    if (isExpectedSignalExit(code)) {
      requestedShutdown = true;
    }
    if (!requestedShutdown && !shuttingDown && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}: ${command.join(" ")}`);
    }
    return code;
  })));
  await shutdown("exit");
  process.exit(requestedShutdown ? 0 : exitCode ?? 0);
} catch (error) {
  await shutdown("exit");
  throw error;
}
