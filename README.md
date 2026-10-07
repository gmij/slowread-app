# Slowread

Cloudflare Worker and static reader. Deploy using `npm install` and `npm run deploy`.

Search four curated classics by Chinese/English title or author. Other English queries use Gutendex's public metadata API; an upstream failure produces an explicit message rather than fake results. Selecting a book retrieves its Gutenberg plain text and automatically splits chapter headings (or reading sections when none are present). Original text is displayed when no translation exists.

The first chapter of Pride and Prejudice has an AI-assisted Chinese reading sample. Its build snapshot in src/sample comes from gmij/slowread-library, which remains the content authoring repository. This snapshot permits the free sample to work without a private GitHub credential. Source originals are obtained on demand, temporarily cached in Worker memory (up to 8 books for ten minutes); this is not durable storage.

No realtime translation, payment, user accounts or permanent import pipeline is implemented. Gutendex's public API is for prototyping; production scale requires a maintained metadata index. Sources retain attribution and regional copyright limitations. Source fetches accept only numeric Gutenberg IDs and fixed HTTPS origins.

Tests: `npm test`. Chapter parser tests cover preface exclusion, paragraph extraction, source URL validation, cache reuse, and upstream failure.
