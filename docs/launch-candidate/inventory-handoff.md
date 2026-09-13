# Real inventory: owner input required

Status: **FAIL — real-shopping inventory is not complete.** The import workflow exists;
an empty Verified Products scope is an honest safety state, not a fulfilled shopping requirement.
No retailer products, photography, availability or permissions have been invented or imported.

## Files to use

- [CSV import template](../../catalog/import-template.csv)
- [JSON import template](../../catalog/import-template.json)
- [Illustrative example — DO NOT IMPORT](../../catalog/illustrative-example.DO-NOT-IMPORT.json)
- [Complete admin import guide](../real-catalog-import-guide.md)
- [Source policy](../real-product-source-policy.md)

The example is deliberately invalid: zero price, missing URL/image/rights, no purchase offer.
It illustrates a navy cotton overshirt's styling fields, not an available product. A regression
test requires it to fail validation. Replace every placeholder using authorized evidence.

## Obtain this evidence

Ask each retailer's affiliate/partnerships team for an approved product feed/API/export and written
permission to display product data in DRIP. Alternatively use your approved advertiser program
inside an affiliate network: [Awin's product feed guide](https://help.awin.com/developers/docs/product-feed-publisher-guide-intro)
explains downloadable product data; [impact.com's brand asset tools](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/marketing-content/brand-assets/manage-assets-as-a-partner)
provide partner assets. These are possible submission channels, **not endorsements, existing
DRIP relationships, or blanket image licenses**. Obtain approval for each participating brand.

Supply a small first batch with:

- Exact name, brand, SKU/external ID, variant-specific HTTPS product URL, category, color,
  material, fit, description, season/formality, sizes, currency, current price, availability,
  and source-updated timestamp. Preserve variant/size/color query parameters.
- Source organization/name, provenance URL or private evidence reference, acquisition date,
  verification method, and whether affiliate compensation applies. Include required disclosure.
- Each exact image file or authorized HTTPS image URL and evidence covering its use in DRIP:
  rights holder, permitted web/PWA display, whether storage/rehosting/cropping is permitted,
  attribution, territory, expiry, refresh/removal obligations, and which products it covers.
- Accessory subtype or fragrance family where applicable; vibe and price tier must reflect
  the actual item, not an unsupported marketing claim.

A retailer page being publicly visible is not permission to scrape or copy photography. Do not
download images from search results. If a feed licenses hotlinking only, do not rehost it. Ask the
rights holder to resolve unclear terms; use counsel for legal interpretation. Original photographs
you own can be supplied with ownership evidence and an accurate product/variant mapping.

## Submit and review

1. Attach the completed CSV/JSON and rights manifest in this task, plus authorized image files
   if rehosting is allowed. Use approved private storage for confidential agreements, sharing a
   non-secret reference and access grant. Do not commit contracts or credentials to the repo.
2. Keep tokens/passwords in the provider's secret settings, never in CSV/JSON or chat.
3. After dedicated staging is confirmed and its database preparation is approved, an approved
   admin opens `/admin/catalog/imports`, previews the file (1 MB / 500 rows max), fixes every
   validation error, and resolves duplicate create/update/skip decisions.
4. Review and approve rows; **Import approved** is a separate authorized write. Imported products
   remain unverified. Review each saved record, then explicitly **Verify/Reverify**. Critical edits
   clear timestamps atomically; ordinary description/material/fit edits preserve them.
5. Check the product, image, availability and disclosure in staging. Only after owner approval
   repeat a controlled import/verification against the intended live backend.

No step above has been executed on a connected backend in this implementation. Existing tests
exercise parser validation, batch planning, canonical variants, duplicate decisions, transactional
import guards, immutable demos and storage retention using isolated fixtures.
