#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VALID_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const MODEL_ALIASES = new Map([
  ["sol", "gpt-5.6-sol"],
  ["spark", "gpt-5.3-codex-spark"]
]);
const JOB_DIR_NAME = ".senior-mode/codex/jobs";
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "stale"]);

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/codex-companion.mjs setup [--json] [--cwd <dir>]",
    "  node scripts/codex-companion.mjs task [--background|--wait] [--write|--read-only] [--resume-last|--resume|--fresh] [--model <model|sol|spark>] [--effort <none|minimal|low|medium|high|xhigh|max|ultra>] [--prompt-file <file>] [--cwd <dir>] [--timeout-ms <ms>] [--dry-run] [prompt]",
    "  node scripts/codex-companion.mjs review [--background|--wait] [--base <branch>|--commit <sha>|--uncommitted] [--model <model|sol|spark>] [--prompt-file <file>] [--cwd <dir>] [--timeout-ms <ms>] [--dry-run] [focus]",
    "  node scripts/codex-companion.mjs status [job-id] [--wait] [--all] [--json] [--cwd <dir>]",
    "  node scripts/codex-companion.mjs wait <job-id> [--json] [--cwd <dir>] [--timeout-ms <ms>] [--poll-interval-ms <ms>]",
    "  node scripts/codex-companion.mjs watch <job-id> [--cwd <dir>] [--timeout-ms <ms>] [--poll-interval-ms <ms>]",
    "  node scripts/codex-companion.mjs result [job-id] [--json] [--cwd <dir>]",
    "  node scripts/codex-companion.mjs cancel <job-id> [--json] [--cwd <dir>]"
  ].join("\n"));
}

function parseArgs(argv, config = {}) {
  const valueOptions = new Set(config.valueOptions ?? []);
  const booleanOptions = new Set(config.booleanOptions ?? []);
  const aliases = new Map(Object.entries(config.aliases ?? {}));
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eqIndex = token.indexOf("=");
      const rawName = token.slice(2, eqIndex === -1 ? undefined : eqIndex);
      const name = aliases.get(rawName) ?? rawName;
      if (booleanOptions.has(name)) {
        options[name] = true;
        continue;
      }
      if (!valueOptions.has(name)) {
        throw new Error(`Unknown option --${rawName}.`);
      }
      if (eqIndex !== -1) {
        options[name] = token.slice(eqIndex + 1);
        continue;
      }
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for --${rawName}.`);
      }
      options[name] = argv[index];
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const name = aliases.get(token.slice(1));
      if (!name) {
        positionals.push(token);
        continue;
      }
      if (booleanOptions.has(name)) {
        options[name] = true;
        continue;
      }
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${token}.`);
      }
      options[name] = argv[index];
      continue;
    }
    positionals.push(token);
  }

  return { options, positionals };
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    timeout: options.timeoutMs ?? 10000,
    windowsHide: true
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null
  };
}

function commandStatus(command, args = ["--version"], options = {}) {
  const result = runSync(command, args, options);
  return {
    available: result.status === 0,
    command,
    version: result.status === 0 ? firstLine(result.stdout || result.stderr) : null,
    error: result.status === 0 ? null : result.error || firstLine(result.stderr || result.stdout) || `Exit ${result.status}`
  };
}

function firstLine(value) {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function normalizeModel(model) {
  if (model == null) {
    return null;
  }
  const trimmed = String(model).trim();
  if (!trimmed) {
    return null;
  }
  return MODEL_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

function normalizeEffort(effort) {
  if (effort == null) {
    return null;
  }
  const normalized = String(effort).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!VALID_EFFORTS.has(normalized)) {
    throw new Error(`Unsupported effort "${effort}". Use one of: ${Array.from(VALID_EFFORTS).join(", ")}.`);
  }
  return normalized;
}

function resolveCwd(options = {}) {
  return path.resolve(process.cwd(), options.cwd ?? ".");
}

function findWorkspaceRoot(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }
    current = parent;
  }
}

function getStateDir(cwd, options = {}) {
  if (options["state-dir"]) {
    return path.resolve(cwd, options["state-dir"]);
  }
  return path.join(findWorkspaceRoot(cwd), JOB_DIR_NAME);
}

function resolveJobContext(options) {
  const cwd = resolveCwd(options);
  return { cwd, stateDir: getStateDir(cwd, options) };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function jobPath(stateDir, jobId) {
  return path.join(stateDir, `${jobId}.json`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readJob(stateDir, jobId) {
  return readJson(jobPath(stateDir, jobId));
}

function writeJob(stateDir, job) {
  writeJson(jobPath(stateDir, job.id), job);
}

function listJobs(stateDir) {
  if (!fs.existsSync(stateDir)) {
    return [];
  }
  return fs.readdirSync(stateDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(path.join(stateDir, name)))
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function nowIso() {
  return new Date().toISOString();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveWaitTimings(options) {
  return {
    timeoutMs: parsePositiveInt(options["timeout-ms"], DEFAULT_WAIT_TIMEOUT_MS),
    pollIntervalMs: parsePositiveInt(options["poll-interval-ms"], DEFAULT_POLL_INTERVAL_MS)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function pidAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fileSize(filePath) {
  if (!filePath) {
    return 0;
  }
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function reconcileJob(stateDir, job) {
  if (!job || isTerminalStatus(job.status)) {
    return job;
  }

  const workerAlive = pidAlive(job.pid);
  const codexAlive = pidAlive(job.codexPid);
  if (workerAlive || codexAlive) {
    return job;
  }

  const updated = {
    ...job,
    status: "stale",
    staleReason: "No tracked worker or Codex process is alive. Read the stored result before deciding to rerun.",
    outputBytes: fileSize(job.outputFile),
    errorBytes: fileSize(job.errorFile),
    finishedAt: job.finishedAt ?? nowIso(),
    updatedAt: nowIso()
  };
  writeJob(stateDir, updated);
  return updated;
}

function readJobReconciled(stateDir, jobId) {
  return reconcileJob(stateDir, readJob(stateDir, jobId));
}

function latestFinishedJobReconciled(stateDir, jobs) {
  let newest = null;
  for (const job of jobs) {
    const reconciled = reconcileJob(stateDir, job);
    if (newest === null) {
      newest = reconciled;
    }
    if (isTerminalStatus(reconciled.status)) {
      return reconciled;
    }
  }
  return newest;
}

function generateJobId(kind) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${kind}-${stamp}-${random}`;
}

function readStdinIfPiped() {
  if (process.stdin.isTTY) {
    return "";
  }
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readPrompt(cwd, options, positionals) {
  const filePrompt = options["prompt-file"] ? fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8") : "";
  const positionalPrompt = positionals.join(" ").trim();
  const stdinPrompt = readStdinIfPiped().trim();
  return [filePrompt, positionalPrompt, stdinPrompt].filter(Boolean).join("\n\n<stdin>\n");
}

function summarizePrompt(prompt) {
  const normalized = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Resume previous Codex task";
  }
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}

function buildCodexExecInvocation(request) {
  const sandbox = request.write ? "workspace-write" : "read-only";
  const args = ["-C", request.cwd, "--sandbox", sandbox, "--ask-for-approval", "never"];
  if (request.model) {
    args.push("--model", request.model);
  }
  if (request.effort) {
    args.push("-c", `model_reasoning_effort=\"${request.effort}\"`);
  }
  args.push("exec");
  if (request.resumeLast) {
    args.push("resume", "--last");
  }
  args.push("--skip-git-repo-check", "-");
  return {
    command: "codex",
    args,
    stdin: request.prompt || "Continue the previous Codex task."
  };
}

function buildCodexReviewInvocation(request) {
  const args = ["-C", request.cwd];
  if (request.model) {
    args.push("--model", request.model);
  }
  args.push("review");
  if (request.base) {
    args.push("--base", request.base);
  } else if (request.commit) {
    args.push("--commit", request.commit);
  } else {
    args.push("--uncommitted");
  }
  if (request.title) {
    args.push("--title", request.title);
  }
  if (request.prompt) {
    args.push("-");
  }
  return {
    command: "codex",
    args,
    stdin: request.prompt || ""
  };
}

function buildInvocation(request) {
  return request.kind === "review" ? buildCodexReviewInvocation(request) : buildCodexExecInvocation(request);
}

function renderDryRun(invocation, request) {
  return `${JSON.stringify({
    kind: request.kind,
    cwd: request.cwd,
    write: Boolean(request.write),
    resumeLast: Boolean(request.resumeLast),
    command: invocation.command,
    args: invocation.args,
    promptBytes: Buffer.byteLength(invocation.stdin ?? "", "utf8"),
    promptPreview: summarizePrompt(invocation.stdin)
  }, null, 2)}\n`;
}

function runInvocation(invocation, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    function finish(status, signal) {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ status: status ?? (signal ? 1 : 0), signal });
    }

    options.onChild?.(child);
    child.stdout.pipe(options.stdout ?? process.stdout);
    child.stderr.pipe(options.stderr ?? process.stderr);
    child.on("error", (error) => {
      const line = `${error.message}\n`;
      if (options.stderr) {
        options.stderr.write(line);
      } else {
        process.stderr.write(line);
      }
      finish(127, null);
    });
    child.on("close", (status, signal) => finish(status, signal));
    child.stdin.end(invocation.stdin ?? "");
  });
}

function renderSetup(report) {
  const lines = [
    `Node: ${report.node.available ? report.node.version : `missing (${report.node.error})`}`,
    `Codex: ${report.codex.available ? report.codex.version : `missing (${report.codex.error})`}`
  ];
  if (report.doctor) {
    lines.push(`Doctor: ${report.doctor.status === 0 ? "ok" : `failed (${report.doctor.error || report.doctor.stderr || report.doctor.stdout})`}`);
  }
  lines.push(report.ready ? "Ready: Codex helper can run." : "Ready: no. Install/login with Codex before delegating.");
  if (!report.codex.available) {
    lines.push("Next: npm install -g @openai/codex");
  }
  return `${lines.join("\n")}\n`;
}

function handleSetup(argv) {
  const { options } = parseArgs(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCwd(options);
  const node = commandStatus(process.execPath, ["--version"], { cwd });
  const codex = commandStatus("codex", ["--version"], { cwd });
  const doctor = codex.available ? runSync("codex", ["doctor", "--json"], { cwd, timeoutMs: 30000 }) : null;
  const report = {
    ready: Boolean(node.available && codex.available && (!doctor || doctor.status === 0)),
    cwd,
    script: SCRIPT_PATH,
    node,
    codex,
    doctor: doctor ? {
      status: doctor.status,
      stdout: doctor.stdout,
      stderr: doctor.stderr,
      error: doctor.error
    } : null
  };
  if (options.json) {
    printJson(report);
  } else {
    process.stdout.write(renderSetup(report));
  }
}

async function runForeground(request) {
  const invocation = buildInvocation(request);
  if (request.dryRun) {
    process.stdout.write(renderDryRun(invocation, request));
    return;
  }
  const result = await runInvocation(invocation, { cwd: request.cwd });
  process.exitCode = result.status;
}

function createJob(kind, cwd, stateDir, request) {
  const id = generateJobId(kind);
  const outputFile = path.join(stateDir, `${id}.stdout.log`);
  const errorFile = path.join(stateDir, `${id}.stderr.log`);
  return {
    id,
    kind,
    status: "queued",
    cwd,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    pid: null,
    codexPid: null,
    exitStatus: null,
    signal: null,
    summary: summarizePrompt(request.prompt),
    outputFile,
    errorFile,
    request
  };
}

function enqueueBackground(request, stateDir, options = {}) {
  ensureDir(stateDir);
  const job = createJob(request.kind, request.cwd, stateDir, request);
  writeJob(stateDir, job);
  const child = spawn(process.execPath, [SCRIPT_PATH, "worker", "--job-id", job.id, "--state-dir", stateDir], {
    cwd: request.cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  job.pid = child.pid ?? null;
  job.status = "running";
  job.updatedAt = nowIso();
  writeJob(stateDir, job);
  if (!options.silent) {
    process.stdout.write(`${request.kind === "review" ? "Codex review" : "Codex task"} started as ${job.id}. Use wait/status/result/cancel with this helper.\n`);
  }
  return job;
}

function buildCommonRequest(kind, cwd, options, prompt) {
  return {
    kind,
    cwd,
    prompt,
    model: normalizeModel(options.model),
    background: Boolean(options.background),
    wait: Boolean(options.wait),
    json: Boolean(options.json),
    dryRun: Boolean(options["dry-run"]),
    stateDir: getStateDir(cwd, options),
    ...resolveWaitTimings(options)
  };
}

function buildTaskRequest(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["model", "effort", "cwd", "prompt-file", "state-dir", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["background", "wait", "write", "read-only", "resume-last", "resume", "fresh", "dry-run", "json"],
    aliases: { m: "model", C: "cwd" }
  });
  const cwd = resolveCwd(options);
  const prompt = readPrompt(cwd, options, positionals);
  const resumeLast = Boolean(options["resume-last"] || options.resume);
  if (resumeLast && options.fresh) {
    throw new Error("Choose either --resume/--resume-last or --fresh.");
  }
  if (!prompt && !resumeLast) {
    throw new Error("Provide a prompt, --prompt-file, piped stdin, or --resume-last.");
  }
  return {
    ...buildCommonRequest("task", cwd, options, prompt),
    effort: normalizeEffort(options.effort),
    write: Boolean(options.write && !options["read-only"]),
    resumeLast
  };
}

function buildReviewRequest(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["model", "cwd", "prompt-file", "state-dir", "base", "commit", "title", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["background", "wait", "uncommitted", "dry-run", "json"],
    aliases: { m: "model", C: "cwd" }
  });
  const cwd = resolveCwd(options);
  if (options.base && options.commit) {
    throw new Error("Choose either --base or --commit, not both.");
  }
  return {
    ...buildCommonRequest("review", cwd, options, readPrompt(cwd, options, positionals)),
    base: options.base ?? null,
    commit: options.commit ?? null,
    title: options.title ?? null
  };
}

async function dispatchRequest(request) {
  if (request.background || request.wait) {
    if (request.dryRun) {
      process.stdout.write(renderDryRun(buildInvocation(request), request));
      return;
    }
    const job = enqueueBackground(request, request.stateDir, { silent: request.wait });
    if (request.wait) {
      await waitThenPrintResult(request.stateDir, job.id, request);
    }
    return;
  }
  await runForeground(request);
}

async function handleTask(argv) {
  await dispatchRequest(buildTaskRequest(argv));
}

async function handleReview(argv) {
  await dispatchRequest(buildReviewRequest(argv));
}

async function handleWorker(argv) {
  const { options } = parseArgs(argv, {
    valueOptions: ["job-id", "state-dir"],
    booleanOptions: []
  });
  if (!options["job-id"] || !options["state-dir"]) {
    throw new Error("worker requires --job-id and --state-dir.");
  }
  const stateDir = path.resolve(options["state-dir"]);
  const job = readJob(stateDir, options["job-id"]);
  if (!job) {
    throw new Error(`No job found for ${options["job-id"]}.`);
  }
  job.status = "running";
  job.pid = process.pid;
  job.startedAt = job.startedAt ?? nowIso();
  job.updatedAt = nowIso();
  writeJob(stateDir, job);

  ensureDir(path.dirname(job.outputFile));
  const stdout = fs.createWriteStream(job.outputFile, { flags: "a" });
  const stderr = fs.createWriteStream(job.errorFile, { flags: "a" });
  const invocation = buildInvocation(job.request);
  const result = await runInvocation(invocation, {
    cwd: job.cwd,
    stdout,
    stderr,
    onChild(child) {
      job.codexPid = child.pid ?? null;
      job.updatedAt = nowIso();
      writeJob(stateDir, job);
    }
  });
  stdout.end();
  stderr.end();

  const latest = readJob(stateDir, job.id) ?? job;
  latest.status = latest.status === "cancelled" ? "cancelled" : (result.status === 0 ? "completed" : "failed");
  latest.exitStatus = result.status;
  latest.signal = result.signal;
  latest.finishedAt = nowIso();
  latest.updatedAt = nowIso();
  latest.outputBytes = fileSize(latest.outputFile);
  latest.errorBytes = fileSize(latest.errorFile);
  writeJob(stateDir, latest);
  process.exitCode = result.status;
}

function renderJobLine(job) {
  const exit = job.exitStatus == null ? "" : ` exit=${job.exitStatus}`;
  const bytes = job.outputBytes || job.errorBytes ? ` out=${job.outputBytes ?? 0} err=${job.errorBytes ?? 0}` : "";
  return `${job.id}  ${job.status}  ${job.kind}  ${job.updatedAt}${exit}${bytes}  ${job.summary}`;
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function buildResultPayload(stateDir, job) {
  const reconciled = reconcileJob(stateDir, job);
  return {
    job: reconciled,
    stdout: readTextIfExists(reconciled.outputFile),
    stderr: readTextIfExists(reconciled.errorFile)
  };
}

function printStoredResult(payload, asJson = false) {
  if (asJson) {
    printJson(payload);
    return;
  }

  const { job, stdout, stderr } = payload;
  process.stdout.write(`Job: ${job.id}\nStatus: ${job.status}\nExit: ${job.exitStatus ?? ""}\n`);
  if (job.staleReason) {
    process.stdout.write(`Note: ${job.staleReason}\n`);
  }
  process.stdout.write("\n");
  if (stdout) {
    process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
  }
  if (stderr) {
    process.stdout.write(`\n[stderr]\n${stderr.endsWith("\n") ? stderr : `${stderr}\n`}`);
  }
}

async function waitForJob(stateDir, jobId, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  let lastUpdatedAt = null;

  while (true) {
    const job = readJobReconciled(stateDir, jobId);
    if (!job) {
      throw new Error(`No job found for ${jobId}.`);
    }
    if (job.status !== lastStatus || job.updatedAt !== lastUpdatedAt) {
      options.onUpdate?.(job);
      lastStatus = job.status;
      lastUpdatedAt = job.updatedAt;
    }
    if (isTerminalStatus(job.status)) {
      return { job, timedOut: false, timeoutMs };
    }
    if (Date.now() >= deadline) {
      return { job, timedOut: true, timeoutMs };
    }
    await sleep(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
}

async function waitThenPrintResult(stateDir, jobId, options = {}) {
  if (!options.json) {
    process.stdout.write(`Codex ${jobId} started. Waiting for completion...\n`);
  }
  const waitResult = await waitForJob(stateDir, jobId, options);
  if (waitResult.timedOut) {
    if (options.json) {
      printJson({ ...waitResult, stateDir });
    } else {
      process.stdout.write(`Timed out waiting for ${jobId} after ${waitResult.timeoutMs}ms. Use status/result with the same job id; do not rerun the task.\n`);
      process.stdout.write(`${renderJobLine(waitResult.job)}\n`);
    }
    process.exitCode = 124;
    return;
  }

  const payload = buildResultPayload(stateDir, waitResult.job);
  printStoredResult(payload, Boolean(options.json));
  process.exitCode = payload.job.exitStatus ?? (payload.job.status === "completed" ? 0 : 1);
}

async function handleStatus(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "state-dir", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["json", "all", "wait"],
    aliases: { C: "cwd" }
  });
  const { stateDir } = resolveJobContext(options);
  if (options.wait) {
    const jobId = positionals[0];
    if (!jobId) {
      throw new Error("status --wait requires a job id.");
    }
    await waitThenPrintResult(stateDir, jobId, { json: Boolean(options.json), ...resolveWaitTimings(options) });
    return;
  }

  const jobs = positionals[0] ? [readJob(stateDir, positionals[0])].filter(Boolean) : listJobs(stateDir);
  const visible = (options.all ? jobs : jobs.slice(0, 10)).map((job) => reconcileJob(stateDir, job));
  if (options.json) {
    printJson({ stateDir, jobs: visible });
    return;
  }
  if (!visible.length) {
    process.stdout.write(`No Codex jobs found in ${stateDir}.\n`);
    return;
  }
  process.stdout.write(`${visible.map(renderJobLine).join("\n")}\n`);
}

async function handleWait(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "state-dir", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["json"],
    aliases: { C: "cwd" }
  });
  const { stateDir } = resolveJobContext(options);
  const jobId = positionals[0];
  if (!jobId) {
    throw new Error("wait requires a job id.");
  }
  await waitThenPrintResult(stateDir, jobId, { json: Boolean(options.json), ...resolveWaitTimings(options) });
}

async function handleWatch(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "state-dir", "timeout-ms", "poll-interval-ms"],
    booleanOptions: [],
    aliases: { C: "cwd" }
  });
  const { cwd, stateDir } = resolveJobContext(options);
  const jobId = positionals[0];
  if (!jobId) {
    throw new Error("watch requires a job id.");
  }
  const waitResult = await waitForJob(stateDir, jobId, {
    ...resolveWaitTimings(options),
    onUpdate(job) {
      process.stdout.write(`${JSON.stringify({ event: "status", jobId: job.id, status: job.status, updatedAt: job.updatedAt, summary: job.summary })}\n`);
    }
  });
  process.stdout.write(`${JSON.stringify({ event: waitResult.timedOut ? "timeout" : "done", jobId, status: waitResult.job.status, resultCommand: `node ${SCRIPT_PATH} result ${jobId} --cwd ${cwd}` })}\n`);
  process.exitCode = waitResult.timedOut ? 124 : 0;
}

function handleResult(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "state-dir"],
    booleanOptions: ["json"],
    aliases: { C: "cwd" }
  });
  const { stateDir } = resolveJobContext(options);
  const job = positionals[0]
    ? readJobReconciled(stateDir, positionals[0])
    : latestFinishedJobReconciled(stateDir, listJobs(stateDir));
  if (!job) {
    throw new Error(`No Codex jobs found in ${stateDir}.`);
  }
  printStoredResult(buildResultPayload(stateDir, job), Boolean(options.json));
}

function killProcessGroup(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
}

function handleCancel(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "state-dir"],
    booleanOptions: ["json"],
    aliases: { C: "cwd" }
  });
  const { stateDir } = resolveJobContext(options);
  const jobId = positionals[0];
  if (!jobId) {
    throw new Error("cancel requires a job id.");
  }
  const job = readJob(stateDir, jobId);
  if (!job) {
    throw new Error(`No job found for ${jobId}.`);
  }
  const killedWorker = killProcessGroup(job.pid);
  const killedCodex = killProcessGroup(job.codexPid);
  job.status = "cancelled";
  job.cancelledAt = nowIso();
  job.updatedAt = nowIso();
  job.cancelSignalSent = killedWorker || killedCodex;
  writeJob(stateDir, job);
  if (options.json) {
    printJson({ job, killedWorker, killedCodex });
    return;
  }
  process.stdout.write(`${job.id} cancelled${killedWorker || killedCodex ? "" : " (process was not running)"}.\n`);
}

const COMMANDS = {
  setup: handleSetup,
  task: handleTask,
  review: handleReview,
  status: handleStatus,
  wait: handleWait,
  watch: handleWatch,
  result: handleResult,
  cancel: handleCancel,
  worker: handleWorker
};

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    throw new Error(`Unknown command "${command}".`);
  }
  await handler(argv);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
