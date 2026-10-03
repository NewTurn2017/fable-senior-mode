import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HELPER = fileURLToPath(new URL("../scripts/codex-companion.mjs", import.meta.url));

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "senior-completion-"));
  const stateDir = path.join(cwd, "state with spaces ' quote");
  const bin = path.join(cwd, "bin");
  fs.mkdirSync(bin);
  fs.mkdirSync(stateDir);
  fs.writeFileSync(path.join(bin, "codex"), `#!${process.execPath}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const spec = JSON.parse(input || "{}");
  setTimeout(() => {
    process.stdout.write(spec.outputBytes ? "x".repeat(spec.outputBytes) + "\\nREPORT_END\\n" : "REPORT_COMPLETE\\n");
    if (spec.code) process.stderr.write("delegate failed\\n");
    process.exitCode = spec.code || 0;
  }, spec.delay || 0);
});
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const run = (args) => spawnSync(process.execPath, [HELPER, ...args, "--cwd", cwd, "--state-dir", stateDir], {
    env, input: "", encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024
  });
  const jobs = () => fs.readdirSync(stateDir).filter(name => name.endsWith(".json"))
    .map(name => JSON.parse(fs.readFileSync(path.join(stateDir, name), "utf8")));
  t.after(() => {
    for (const job of jobs()) {
      if (["running", "queued"].includes(job.status)) run(["cancel", job.id]);
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  const launch = (spec = {}, kind = "task") => {
    const result = run([kind, "--background", "--json", JSON.stringify(spec)]);
    assert.equal(result.status, 0, result.stderr);
    return { result, job: jobs().at(-1) };
  };
  const wait = (id) => run(["wait", id, "--json", "--poll-interval-ms", "10", "--timeout-ms", "5000"]);
  return { cwd, stateDir, env, run, jobs, launch, wait };
}

test("detached JSON launch provides recoverable monitor commands, not a completion notification", t => {
  const f = fixture(t);
  const { result, job } = f.launch({ delay: 50 });
  const launch = JSON.parse(result.stdout);
  assert.equal(launch.job.id, job.id);
  assert.equal(launch.notification, "none");
  const monitor = spawnSync("/bin/sh", ["-c", launch.waitCommand], {
    env: f.env, input: "", encoding: "utf8", timeout: 10000
  });
  assert.equal(monitor.status, 0, monitor.stderr);
  assert.match(monitor.stdout, /REPORT_COMPLETE/);
  assert.equal(f.jobs().length, 1);
});

for (const kind of ["task", "review"]) {
  test(`${kind} watcher propagates failure and offers an executable result command`, t => {
    const f = fixture(t);
    const { job } = f.launch({ code: 7 }, kind);
    assert.equal(f.wait(job.id).status, 7);
    const watched = f.run(["watch", job.id]);
    assert.equal(watched.status, 7);
    const done = JSON.parse(watched.stdout.trim().split("\n").at(-1));
    assert.equal(done.event, "done");
    assert.equal(done.status, "failed");
    assert.equal(done.success, false);
    const result = spawnSync("/bin/sh", ["-c", done.resultCommand], {
      env: f.env, input: "", encoding: "utf8", timeout: 5000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /delegate failed/);
  });
}

test("timeout does not cancel or duplicate work; reattached wait delivers the complete report", t => {
  const f = fixture(t);
  const output = "x".repeat(1024 * 1024) + "\nREPORT_END\n";
  const started = f.run(["task", "--wait", "--json", "--timeout-ms", "5", JSON.stringify({ delay: 120, outputBytes: 1024 * 1024 })]);
  assert.equal(started.status, 124);
  const pending = JSON.parse(started.stdout);
  assert.equal(pending.timedOut, true);
  const done = f.wait(pending.job.id);
  assert.equal(done.status, 0, done.stderr);
  const payload = JSON.parse(done.stdout);
  assert.equal(payload.stdout, output);
  assert.equal(payload.job.outputBytes, Buffer.byteLength(output));
  assert.equal(f.jobs().length, 1);
});

test("reading a terminal report leaves it pending until explicit acknowledgement, across CLI sessions", t => {
  const f = fixture(t);
  const { job } = f.launch();
  assert.equal(f.wait(job.id).status, 0);
  assert.equal(f.run(["result", job.id]).status, 0);
  const pending = f.run(["status", "--pending", "--json"]);
  assert.equal(pending.status, 0, pending.stderr);
  assert.deepEqual(JSON.parse(pending.stdout).jobs.map(job => job.id), [job.id]);
  const ack = f.run(["ack", job.id, "--json"]);
  assert.equal(ack.status, 0, ack.stderr);
  assert.ok(JSON.parse(ack.stdout).acknowledgedAt);
  assert.deepEqual(JSON.parse(f.run(["status", "--pending", "--json"]).stdout).jobs, []);
  assert.equal(f.run(["ack", job.id]).status, 0);
  assert.match(f.run(["result", job.id]).stdout, /REPORT_COMPLETE/);
});

test("ack rejects running and unknown jobs", t => {
  const f = fixture(t);
  const { job } = f.launch({ delay: 1500 });
  assert.notEqual(f.run(["ack", job.id]).status, 0);
  assert.notEqual(f.run(["ack", "missing"]).status, 0);
  assert.equal(fs.existsSync(path.join(f.stateDir, `${job.id}.ack`)), false);
});

test("cancelled jobs remain pending and monitors do not report success", t => {
  const f = fixture(t);
  const { job } = f.launch({ delay: 1500 });
  assert.equal(f.run(["cancel", job.id]).status, 0);
  assert.notEqual(f.wait(job.id).status, 0);
  assert.notEqual(f.run(["watch", job.id]).status, 0);
  assert.equal(JSON.parse(f.run(["status", "--pending", "--json"]).stdout).jobs[0].status, "cancelled");
});

test("pending discovery includes old unacknowledged and stale jobs beyond the recent ten", t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) {
    fs.writeFileSync(path.join(f.stateDir, `old-${i}.json`), JSON.stringify({
      id: `old-${i}`, kind: "task", cwd: f.cwd, createdAt: String(i).padStart(2, "0"),
      status: i === 0 ? "running" : "completed", pid: null, codexPid: null
    }));
  }
  const result = f.run(["status", "--pending", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const jobs = JSON.parse(result.stdout).jobs;
  assert.equal(jobs.length, 12);
  assert.equal(jobs.find(job => job.id === "old-0").status, "stale");
  assert.notEqual(f.run(["watch", "old-0"]).status, 0);
});
