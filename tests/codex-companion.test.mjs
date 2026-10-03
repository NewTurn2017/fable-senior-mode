import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = path.join(ROOT, "scripts", "codex-companion.mjs");

function dryRun(args) {
  const result = spawnSync(process.execPath, [HELPER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    input: ""
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("astra alias selects gpt-6-astra with the requested task effort", () => {
  const invocation = dryRun([
    "task", "--dry-run", "--read-only", "--model", "astra", "--effort", "high",
    "--cwd", ROOT, "inspect the difficult issue"
  ]);

  assert.deepEqual(invocation.args.slice(6, 10), [
    "--model", "gpt-6-astra", "-c", 'model_reasoning_effort="high"'
  ]);
});

test("difficult review accepts the astra model and high effort", () => {
  const invocation = dryRun([
    "review", "--dry-run", "--uncommitted", "--model", "astra", "--effort", "high",
    "--cwd", ROOT, "review the high-risk change"
  ]);

  assert.deepEqual(invocation.args.slice(2, 6), [
    "--model", "gpt-6-astra", "-c", 'model_reasoning_effort="high"'
  ]);
});

test("sol alias selects gpt-6.1-sol for the heavy worker tier", () => {
  const invocation = dryRun([
    "task", "--dry-run", "--read-only", "--model", "sol", "--effort", "high",
    "--cwd", ROOT, "implement the heavy change"
  ]);

  assert.deepEqual(invocation.args.slice(6, 10), [
    "--model", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"'
  ]);
});

test("luna alias selects gpt-6-luna at max effort", () => {
  const invocation = dryRun([
    "task", "--dry-run", "--read-only", "--model", "luna", "--effort", "max",
    "--cwd", ROOT, "gather the bounded evidence"
  ]);

  assert.deepEqual(invocation.args.slice(6, 10), [
    "--model", "gpt-6-luna", "-c", 'model_reasoning_effort="max"'
  ]);
});

test("omitting --model leaves Codex on its configured default", () => {
  const invocation = dryRun([
    "task", "--dry-run", "--read-only", "--cwd", ROOT, "inspect the bounded issue"
  ]);

  assert.equal(invocation.args.includes("--model"), false);
  assert.equal(invocation.args.includes("-c"), false);
});
