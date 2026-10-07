# Slowread MVP

Live: https://slowread-app.gmij.workers.dev/

Search book/author → obtain Gutenberg text → detect chapter headings (fallback to reading sections) → quote for selected language → explicitly confirm free chapter translation → read, compare, pause and resume.

Chinese aliases are available for four curated books. Other English queries use Gutendex with direct Gutenberg search fallback. Sources are only fixed HTTPS Gutenberg origins with numeric book IDs. Search does not imply a matching downloadable or regionally licensed edition. Source metadata must mark US public domain before unfamiliar books are imported.

Translation uses Cloudflare Workers AI Qwen3-30B-A3B-FP8. A deployment with `TRANSLATION_ENABLED=true` is authorized for the user's **Workers Free plan only**. Free quota exhaustion stops requests; do not upgrade or migrate to Paid without a spending decision. Readers pay US$0 during this MVP. Quotes separately disclose a rough provider-cost estimate based on current input/output token prices; these are estimates, not checkout or measured bills.

Only source paragraph text is submitted to AI, never arbitrary client text. Origin and chapter/index validation, chapter/paragraph size limits, bounded source URLs, short-lived in-memory caches, and incomplete-model-output detection constrain the prototype. This is not a hardened multi-tenant paid service; no authentication, payment, or globally durable rate/budget ledger exists.

Source cache: up to eight books, ten minutes per Worker isolate. Translation cache: up to 500 paragraphs, one hour per isolate. Completed and partial translations additionally persist in browser localStorage keyed by source content and model version; they resume without retranslating completed paragraphs. No server-side durable shared translation library is implemented. Share links send location and target language, not another reader's local translations. Clearing browser storage loses translations.

Two repositories remain: app/frontend/Worker here, authored sample originals/translations in `gmij/slowread-library`. The first Pride and Prejudice chapter snapshot in `src/sample` comes from that private content repo. Dynamically imported books and new translations are not committed to GitHub automatically.

Deploy: `npm install`, `npm run deploy`. GitHub main also triggers Cloudflare builds. Local source is E:/Slowread/app, library is E:/Slowread/library. Tests: `npm test`; dry-run `npx wrangler deploy --dry-run`. UI and live model output must be verified separately from unit tests.
