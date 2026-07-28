#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  ASSET_DIRECTORY,
  MIGRATION_PATH,
  loadProducts,
  renderMigration,
  renderProductSvg,
  validateManifest,
} from "./shop-catalog-lib.mjs";

const checkOnly = process.argv.includes("--check");
const products = loadProducts();
const manifestErrors = validateManifest(products);

if (manifestErrors.length) {
  for (const error of manifestErrors) console.error(`Catalog validation failed: ${error}`);
  process.exitCode = 1;
} else {
  const expectedFiles = new Map(
    products.map((product, index) => [
      path.join(ASSET_DIRECTORY, `${product.slug}.svg`),
      renderProductSvg(product, index),
    ]),
  );
  expectedFiles.set(MIGRATION_PATH, renderMigration(products));

  if (checkOnly) {
    const mismatches = [];
    for (const [filePath, expected] of expectedFiles) {
      if (!fs.existsSync(filePath)) {
        mismatches.push(`missing ${path.relative(process.cwd(), filePath)}`);
      } else if (fs.readFileSync(filePath, "utf8") !== expected) {
        mismatches.push(`stale ${path.relative(process.cwd(), filePath)}`);
      }
    }

    const expectedNames = new Set(products.map((product) => `${product.slug}.svg`));
    if (fs.existsSync(ASSET_DIRECTORY)) {
      for (const filename of fs.readdirSync(ASSET_DIRECTORY)) {
        if (filename.endsWith(".svg") && !expectedNames.has(filename))
          mismatches.push(
            `unexpected ${path.relative(process.cwd(), path.join(ASSET_DIRECTORY, filename))}`,
          );
      }
    }

    if (mismatches.length) {
      for (const mismatch of mismatches)
        console.error(`Catalog generation check failed: ${mismatch}`);
      process.exitCode = 1;
    } else {
      console.log(
        `Catalog is current: ${products.length} products, ${products.length} SVG assets.`,
      );
    }
  } else {
    fs.mkdirSync(ASSET_DIRECTORY, { recursive: true });
    fs.mkdirSync(path.dirname(MIGRATION_PATH), { recursive: true });
    for (const [filePath, contents] of expectedFiles) fs.writeFileSync(filePath, contents);
    console.log(`Generated ${products.length} product SVGs and the Phase 2 catalog migration.`);
  }
}
