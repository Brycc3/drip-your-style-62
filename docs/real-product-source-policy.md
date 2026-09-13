# DRIP real-product source policy

DRIP may display a real product only when an authorized administrator can document where the data
came from, why DRIP may display the image, and when price and availability were checked. Importing
data stages it for review; it never verifies a product automatically.

## Acceptable sources

- a retailer or brand file supplied with written permission;
- an authorized affiliate feed whose terms permit the intended display;
- a partner API or authorized Shopify store integration;
- a manual product record checked against an authorized primary source;
- original project-owned media or media with a documented license or display authorization.

The batch source name and, when available, source URL must identify the actual source. Affiliate
status and disclosure must reflect a real relationship.

## Prohibited behavior

- Do not scrape retailer pages or bypass site controls.
- Do not copy, download, or re-host retailer photography without permission.
- Do not fabricate a retailer, price, discount, availability state, source timestamp, or product ID.
- Do not fabricate or imply an affiliate relationship.
- Do not mark stale or incomplete products verified.
- Do not reuse a Phase 2 demo ID or `/catalog/phase-2/` image for a real product.
- Do not import the placeholder row in either template.

If authorization is unclear, reject the row. A polished empty Verified Shop is more honest than an
unverified catalog.

## Image handling

Remote images must use HTTPS and must remain at the authorized source unless separate permission
allows storage by DRIP. The `catalog-products` bucket accepts authenticated administrator uploads
only. An upload must include an accurate rights basis and source reference, and upload success does
not verify the product.

## Freshness and reverification

Verification expires after 30 days in the application. Critical edits—including price, currency,
availability, URLs, image/rights, source/provenance, affiliate data, sizing, recommendation
metadata, restocking, or archive restoration—atomically clear both verification timestamps.
Description, material, and fit-only edits may preserve them. Verify/Reverify is always a separate
administrator action.
