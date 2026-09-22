import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
const marker = ".wrangler/signal-migrations.json";
if (!existsSync("dist/server/wrangler.json"))
  throw new Error("Run npm run build before setting up the database.");
const done = existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")) : [];
for (const file of readdirSync("drizzle")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  if (done.includes(file)) continue;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      `drizzle/${file}`,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`Migration failed: ${file}`);
  done.push(file);
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(marker, JSON.stringify(done));
}
console.log("Local database is ready.");
