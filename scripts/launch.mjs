import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18))
  throw new Error(
    "Install Node.js 24 LTS or Node.js 22.18+ to start Signal Duel.",
  );
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync("node_modules/vinext")) {
  const npmCli = path.join(
    process.env.ProgramFiles || "C:/Program Files",
    "nodejs/node_modules/npm/bin/npm-cli.js",
  );
  if (existsSync(npmCli)) run([npmCli, "ci"]);
  else {
    console.error(
      "First run: install dependencies with npm ci, then start the game again.",
    );
    process.exit(1);
  }
}
run(["scripts/run-framework.mjs", "build"]);
run(["scripts/setup-db.mjs"]);
console.log(
  "\nOpen http://localhost:5173 in your browser. Keep this window open while playing.\n",
);
const server = spawn(process.execPath, ["scripts/run-framework.mjs", "dev"], {
  stdio: "inherit",
});
process.on("SIGINT", () => server.kill("SIGINT"));
server.on("exit", (code) => process.exit(code || 0));
