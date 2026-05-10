#!/usr/bin/env node
// Publish smithers-webui at the current version. Expects a clean tree.
//
// Usage:
//   bun run release                 # check clean, typecheck, test, publish
//   bun run release -- --dry-run    # same but stop before `npm publish`
//   bun run release -- --otp=123456
//   bun run release -- --skip-checks  # skip typecheck/test
//   bun run release -- --skip-git     # skip the clean-tree check

import { execSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=")
    return [k, v ?? true]
  }),
)
const DRY_RUN = !!args["dry-run"]
const SKIP_CHECKS = !!args["skip-checks"]
const SKIP_GIT = !!args["skip-git"]
const OTP = typeof args.otp === "string" ? args.otp : null

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const version = pkg.version
const name = pkg.name

function log(step, msg) {
  console.log(`\n▸ [${step}] ${msg}`)
}
function run(cmd) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: "inherit", cwd: root })
}

log("version", `releasing ${name}@${version}`)

if (!SKIP_GIT) {
  log("git", "checking clean working tree")
  const out = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
  if (out.stdout && out.stdout.trim()) {
    throw new Error(
      `working tree is dirty — commit first, or pass --skip-git:\n${out.stdout}`,
    )
  }
}

if (!SKIP_CHECKS) {
  log("typecheck", "bun run check:types")
  run("bun run check:types")

  log("test", "bun run test:run")
  run("bun run test:run")
}

if (!DRY_RUN) {
  log("auth", "checking npm login")
  const who = spawnSync("npm", ["whoami"], { cwd: root, encoding: "utf8" })
  if (who.status === 0) {
    console.log(`  logged in as ${who.stdout.trim()}`)
  } else {
    console.log("  not logged in — running `npm login`")
    run("npm login")
  }
}

const otpFlag = OTP ? ` --otp=${OTP}` : ""
if (DRY_RUN) {
  log("publish", `DRY RUN — would run: npm publish --access public${otpFlag}`)
  // Also do a `--dry-run` of npm publish itself so we see the file list
  run(`npm publish --access public --dry-run${otpFlag}`)
} else {
  log("publish", `npm publish --access public${otpFlag}`)
  run(`npm publish --access public${otpFlag}`)
}

console.log(`\n✓ ${name}@${version} ${DRY_RUN ? "(dry run) " : ""}done`)
