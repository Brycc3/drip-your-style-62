import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SELF = "scripts/check-secrets.mjs";
const MAX_BYTES = 2_000_000;

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "service_role" ? "Supabase service-role JWT" : null;
  } catch {
    return null;
  }
}

function findings(content) {
  const results = new Set();
  for (const match of content.matchAll(/sb_secret_[A-Za-z0-9_-]{20,}/g)) {
    if (!/(?:placeholder|replace|example|your|test|dummy|sample|managed|lovable)/i.test(match[0])) {
      results.add("Supabase secret key");
    }
  }
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(content)) {
    results.add("private key material");
  }
  if (
    /(?:sk-proj-|sk_live_|rk_live_|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-|gh[pousr]_)[A-Za-z0-9_-]{16,}/.test(
      content,
    )
  ) {
    results.add("private API key");
  }
  for (const match of content.matchAll(
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  )) {
    const result = decodeJwtRole(match[0]);
    if (result) results.add(result);
  }
  for (const line of content.split(/\r?\n/)) {
    const assignment = line.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?([^\s"']+)/);
    if (
      assignment &&
      !/^(?:<|your_|replace_|placeholder|test_|managed_|process\.env)/i.test(assignment[1])
    ) {
      results.add("assigned Supabase service-role key");
    }
  }
  return results;
}

function currentTrackedFiles() {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter((file) => file !== SELF);
}

function scanCurrent() {
  const hits = [];
  for (const file of currentTrackedFiles()) {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const kind of findings(content)) hits.push({ file, kind });
  }
  return hits;
}

function blob(commit, file) {
  try {
    const value = git(["show", `${commit}:${file}`]);
    return value.length <= MAX_BYTES ? value : "";
  } catch {
    return "";
  }
}

function scanHistoryIntroductions() {
  const hits = [];
  const commits = git(["rev-list", "--all", "--reverse"]).trim().split("\n").filter(Boolean);
  for (const commit of commits) {
    const files = git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit])
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((file) => file !== SELF);
    let parent = "";
    try {
      parent = git(["rev-parse", `${commit}^`]).trim();
    } catch {
      // Root commit.
    }
    for (const file of files) {
      const currentKinds = findings(blob(commit, file));
      const parentKinds = parent ? findings(blob(parent, file)) : new Set();
      for (const kind of currentKinds) {
        if (!parentKinds.has(kind)) hits.push({ commit, file, kind });
      }
    }
  }
  return hits;
}

const history = process.argv.includes("--history");
const hits = history ? scanHistoryIntroductions() : scanCurrent();
if (hits.length === 0) {
  console.log(
    history
      ? "No suspected private secrets introduced in Git history."
      : "No suspected private secrets in tracked files.",
  );
  process.exit(0);
}

console.error("Suspected private secret locations (values suppressed):");
for (const hit of hits) {
  console.error([hit.commit, hit.file, hit.kind].filter(Boolean).join(" · "));
}
process.exit(1);
