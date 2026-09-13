import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const prettierExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".json5",
  ".css",
  ".scss",
  ".md",
  ".mdx",
  ".html",
  ".yaml",
  ".yml",
]);
const generatedFiles = new Set(["src/integrations/supabase/types.ts", "src/routeTree.gen.ts"]);

function extension(file) {
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot).toLowerCase() : "";
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedFiles() {
  if (git(["status", "--porcelain"])) {
    const tracked = git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
    const untracked = git(["ls-files", "--others", "--exclude-standard"]);
    return [...new Set(`${tracked}\n${untracked}`.split("\n"))]
      .filter(Boolean)
      .filter(
        (file) =>
          fs.existsSync(file) &&
          prettierExtensions.has(extension(file)) &&
          !generatedFiles.has(file),
      );
  }
  const baseRef = process.env.GITHUB_BASE_REF;
  let range;
  if (baseRef) {
    const remoteBase = `origin/${baseRef}`;
    const mergeBase = git(["merge-base", remoteBase, "HEAD"]);
    range = `${mergeBase}...HEAD`;
  } else {
    try {
      range = `${git(["rev-parse", "HEAD^"])}...HEAD`;
    } catch {
      range = "HEAD";
    }
  }
  return git(["diff", "--name-only", "--diff-filter=ACMR", range])
    .split("\n")
    .filter(Boolean)
    .filter(
      (file) =>
        fs.existsSync(file) && prettierExtensions.has(extension(file)) && !generatedFiles.has(file),
    );
}

const files = changedFiles();
if (files.length === 0) {
  console.log("No changed Prettier-supported files.");
  process.exit(0);
}

const prettier =
  process.platform === "win32" ? "node_modules/.bin/prettier.cmd" : "node_modules/.bin/prettier";
const result = spawnSync(prettier, ["--check", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
