import { spawn } from "node:child_process";

const commands = [
  { cwd: "server", script: "node_modules/nodemon/bin/nodemon.js", args: ["src/index.js"] },
  { cwd: "client", script: "node_modules/vite/bin/vite.js", args: [] },
];

const children = commands.map(({ cwd, script, args }) =>
  spawn(process.execPath, [script, ...args], { cwd, stdio: "inherit" })
);

function stop(exitCode = 0) {
  for (const child of children) child.kill();
  process.exit(exitCode);
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) stop(code);
  });
}
