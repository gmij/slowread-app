# Slowread MVP

Architecture and roadmap: [架构设计说明](ARCHITECTURE.md) records the proposed multilingual library, ad-funded chapter access, sharing attribution and referral revenue model, including unresolved cost and settlement decisions.

Live: https://slowread-app.gmij.workers.dev/

Search book/author → obtain Gutenberg text → detect chapter headings (fallback to reading sections) → quote for selected language → explicitly confirm free chapter translation → read, compare, pause and resume.

Chinese aliases are available for four curated books. Other English queries use Gutendex with direct Gutenberg search fallback. Sources are only fixed HTTPS Gutenberg origins with numeric book IDs. Search does not imply a matching downloadable or regionally licensed edition. Source metadata must mark US public domain before unfamiliar books are imported.

Translation uses Cloudflare Workers AI Qwen3-30B-A3B-FP8. A deployment with `TRANSLATION_ENABLED=true` is authorized for the user's **Workers Free plan only**. Free quota exhaustion stops requests; do not upgrade or migrate to Paid without a spending decision. Readers pay US$0 during this MVP. Quotes separately disclose a rough provider-cost estimate based on current input/output token prices; these are estimates, not checkout or measured bills.

Only source paragraph text is submitted to AI, never arbitrary client text. Origin and chapter/index validation, chapter/paragraph size limits, bounded source URLs, short-lived in-memory caches, and incomplete-model-output detection constrain the prototype. This is not a hardened multi-tenant paid service; no authentication, payment, or globally durable rate/budget ledger exists.

Source cache: up to eight books, ten minutes per Worker isolate. Translation cache: up to 500 paragraphs, one hour per isolate. Partial progress and signed receipts additionally persist in browser localStorage keyed by source content and model version. Completed chapter translations are saved to the shared content repository and reused by other readers. Clearing browser storage loses only unsubmitted progress.

Two repositories remain: app/frontend/Worker here, originals/translations in the public `gmij/slowread-library`. The first Pride and Prejudice chapter snapshot in `src/sample` supplies the initial sample. New completed translations and corresponding original chapters are committed automatically through the Worker using a repository-scoped runtime secret.

Deploy: `npm install`, `npm run deploy`. GitHub main also triggers Cloudflare builds. Local source is E:/Slowread/app, library is E:/Slowread/library. Tests: `npm test`; dry-run `npx wrangler deploy --dry-run`. UI and live model output must be verified separately from unit tests.

Shared library: full chapters are saved to gmij/slowread-library with source-version hashes and server-signed translation receipts. GITHUB_CONTENT_TOKEN is a runtime encrypted secret with Contents write access limited to the library repository. It is never committed. Readers reuse matching shared chapters before translating. Partial progress remains in localStorage; save failures can retry without regenerating text. Untranslated paragraphs are omitted, a bottom progress bar shows progress, and symbol-only paragraphs are filtered. There is no distributed translation-job lock; simultaneous readers may translate a missing chapter before the first save completes.

Book status: /api/books/:id/status?target=zh-CN counts saved whole chapters whose source hashes match the current imported edition. A 30-second repository tree cache is invalidated on chapter save. Readers and shares are explicitly untracked (null), not fabricated numbers. Default target resolves verified account preference (future integration), shared-link language, manually saved browser preference, then supported browser languages; unsupported languages fall back to English original. Browser choices currently support Simplified Chinese, Japanese, and English original. No sign-in exists yet.
