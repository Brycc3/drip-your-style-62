import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const eslintExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const generatedFiles = new Set(["src/integrations/supabase/types.ts", "src/routeTree.gen.ts"]);

function extension(file) {
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot).toLowerCase() : "";
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function relevant(files) {
  return [...new Set(files)]
    .filter(Boolean)
    .filter(
      (file) =>
        fs.existsSync(file) && eslintExtensions.has(extension(file)) && !generatedFiles.has(file),
    );
}

function changedFiles() {
  if (git(["status", "--porcelain"])) {
    const tracked = git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
    const untracked = git(["ls-files", "--others", "--exclude-standard"]);
    return relevant(`${tracked}\n${untracked}`.split("\n"));
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  let range;
  if (baseRef) {
    const mergeBase = git(["merge-base", `origin/${baseRef}`, "HEAD"]);
    range = `${mergeBase}...HEAD`;
  } else {
    try {
      range = `${git(["rev-parse", "HEAD^"])}...HEAD`;
    } catch {
      range = "HEAD";
    }
  }
  return relevant(
    git(["diff", "--name-only", "--diff-filter=ACMR", range]).split("\n").filter(Boolean),
  );
}

const files = changedFiles();
if (files.length === 0) {
  console.log("No changed ESLint-supported files.");
  process.exit(0);
}

const eslint =
  process.platform === "win32" ? "node_modules/.bin/eslint.cmd" : "node_modules/.bin/eslint";
const result = spawnSync(eslint, files, { stdio: "inherit" });
process.exit(result.status ?? 1);
