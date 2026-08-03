# Real catalog import guide

Phase 4A stages authorized product data without mixing it with the 51 Demo Concepts. No real
products are bundled with the repository.

## Before importing

1. Review `docs/real-product-source-policy.md` and obtain written source and image authorization.
2. Apply the reviewed forward-only Phase 4A migration in a controlled database change window.
3. Set `profiles.is_admin=true` only for the administrators who will review catalog data.
4. Start with `catalog/import-template.csv` or `catalog/import-template.json` and remove the
   placeholder row.

## Workflow

1. Open `/admin/catalog/imports` and enter the real source name and optional HTTPS source URL.
2. Select a CSV or JSON file of at most 1 MB and 500 rows.
3. Acknowledge the rights/provenance warning and choose **Preview before import**.
4. Filter valid, invalid, duplicate, and warning rows. Every validation error is retained with the
   staged row.
5. Correct normalized JSON as needed. The original raw row remains immutable.
6. Approve or reject each row, or approve every currently valid non-ambiguous row.
7. Choose **Import approved**. Creates enter `shop_catalog` with `is_demo=false`, `archived=false`,
   `verified_at=null`, and `last_checked_at=null`. Exact source matches update an existing non-demo
   product; critical changes clear old verification in the same database update.
8. Open `/admin/catalog`, review the complete stored record, then use the separate Verify/Reverify
   action. Only that RPC can assign both verification timestamps.

## Duplicate decisions

- **create**: no source or descriptive identity matched;
- **update**: retailer + external ID or normalized product URL matched a non-demo catalog row;
- **skip**: an exact identity already appeared earlier in the same batch;
- **manual review**: descriptive identity matched, validation failed, or a protected demo conflict
  was detected.

The importer never silently overwrites an ambiguous match.

## CSV details

The parser supports quoted fields, escaped quotes, commas inside quoted fields, and CRLF files.
Available sizes may be separated with `|` or `;`. Booleans accept `true/false`, `yes/no`, or `1/0`.
Currency defaults to USD; supported currencies are USD, CAD, EUR, GBP, and AUD.

## JSON details

Use either a top-level array or `{ "products": [] }`. Each product must be an object. The same
server validation runs for CSV, JSON, staged corrections, and final database import.

## Authorized image upload

Inside a staged-row correction, acknowledge display rights and upload a PNG, JPG, WebP, or AVIF.
The browser uploads only to the administrator-protected `catalog-products` bucket and inserts the
resulting URL into normalized data. Record `image_rights_basis` and `source_url` accurately before
saving. Uploading an image does not approve, import, or verify the row.
