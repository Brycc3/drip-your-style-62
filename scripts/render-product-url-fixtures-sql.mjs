import fs from "node:fs";

const fixtures = JSON.parse(
  fs.readFileSync(new URL("../tests/fixtures/product-url-canonicalization.json", import.meta.url)),
);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = fixtures
  .map(({ name, input, expected }) => `(${literal(name)}, ${literal(input)}, ${literal(expected)})`)
  .join(",\n  ");

process.stdout.write(`
BEGIN;
CREATE TEMP TABLE phase4a_product_url_fixtures (
  fixture_name text NOT NULL,
  input_url text NOT NULL,
  expected_identity text NOT NULL
);
INSERT INTO phase4a_product_url_fixtures VALUES
  ${rows};
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1
    FROM phase4a_product_url_fixtures
    WHERE public.catalog_canonical_product_url(input_url) IS DISTINCT FROM expected_identity
  ),
  'PostgreSQL product URL identities must match the shared fixtures'
);
ROLLBACK;
`);
