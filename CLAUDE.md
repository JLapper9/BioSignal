# CLAUDE.md — BioSignal Living Reference

> **Session startup:** Read this file first. Summarize current state in one paragraph, state which file(s) you'll edit, confirm before touching code. Update this file after any change per Section 9.

---

## 1. Project Summary

BioSignal is a biopharma intelligence hub for the RSM team. **Vanilla HTML/CSS/JS SPA** — no frameworks, no build tools, no package manager. Every page is a standalone `.html` file loading shared modules via `<script>` tags. Surfaces live regulatory, clinical, market, and company data for professional biopharma users.

---

## 2. File Map

| File | Role | Key exports / IDs |
|---|---|---|
| `biosignal-data.js` | Shared data module (`window.BioSignal`). All pages depend on it. | `ENDPOINTS`, `RSS_FEEDS`, `NEWS_KEYWORDS`, `loadNews`, `loadFDA`, `loadPubMed`, `loadTrials`, `loadSEC`, `loadPipeline`, `loadDrugs`, `loadStockQuotes`, `loadMarketStats`, `loadFundingRounds`, `loadIPOs`, `loadMADeals`, `loadFDACalendar`, `clearCache`, `formatDate`, `truncate`, `stripHtml`, `relativeTime`, `phaseClass`, `phaseLabel`, `trialStatusClass`, `trialStatusLabel`, `initStatusBar`, `setAPIStatus`, `_proxy`, `_cache`, `_qCache` |
| `styles.css` | Global design system | CSS custom props on `:root`, `.news-card`, `.pub-card`, `.pub-strip`, `.trial-card` |
| `dashboard.css` | Dashboard overrides | `.mkt-*` classes, `.ticker-wrap`, `.skeleton-card`, `.skel`, `.card-footer-row`, `.fetch-stamp` |
| `app.js` | Shared UI | `initNav()`, `initPills()`, `initTableSort()`, `initScrollAnim()` |
| `index.html` | Home page | No `#api-status-bar` (intentional) |
| `index.js` | Home page JS | `initHubSearch()` |
| `news.html` | News page | `#hub-rss-grid`, `#hub-fda-grid`, `#hub-trials-list`, `#hub-pubmed-strip`, `#hub-rss-pills`, `#news-section-search` |
| `news.js` | News page JS | `renderNewsCard`, `loadRSSSection`, `renderFDACard`, `loadTrialsSection`, `loadPubMedSection`, `initSectionSearch`, `fetchedStamp` |
| `market.html` | Market page — 8-widget dashboard | `#ticker-track`, `#mkt-sector-cards`, `#mkt-gainers`, `#mkt-losers`, `#mkt-watchlist-table`, `#mkt-recs`, `#mkt-earnings`, `#mkt-sentiment` |
| `market.js` | Market page JS | `WATCHLIST` (20 stocks), `TICKER_SYMBOLS` (13), `REC_SYMBOLS` (5), `SENT_SYMBOLS` (6), `loadWatchlistAndMovers`, `loadTicker`, `loadSectorCards`, `loadAnalystRecs`, `loadEarningsCalendar`, `loadSentiment`, `loadIPOSection`, `loadFundingSection`, `loadMASection`, `loadFDACalendarSection` |
| `companies.html` | Companies page | `#pipeline-grid`, `#sec-grid` |
| `companies.js` | Companies page JS | `loadPipelineSection`, `loadSECSection`, `fetchedStamp` |
| `science.html` | Science page | `#drugs-grid`, `#trials-grid`, `#research-grid`, trial phase pills |
| `science.js` | Science page JS | `loadDrugsSection`, `loadTrialsSection`, `loadResearchSection`, `wireTrialPills`, `_allTrials`, `_phaseNum` |

---

## 3. API Integrations

### RSS Feeds (primary news source)
- **Proxy:** `https://api.allorigins.win/get?url=<encoded>` — required for all RSS + SEC EDGAR
- **Sources:** Fierce Biotech, Fierce Pharma, BioSpace, Google News biopharma
- **Parsed with:** `DOMParser`, deduplicated by normalized 80-char title key
- **Keyword filtered:** `NEWS_KEYWORDS` array (25+ terms)
- **Fallback:** NewsAPI (key via `NEWSAPI_KEY` env var, injected server-side by `proxy.js`) — only if <10 RSS results

### OpenFDA (`api.fda.gov`) — no key
| Endpoint | URL pattern | Notes |
|---|---|---|
| Drug approvals | `/drug/drugsfda.json?search=submissions.submission_status:AP&limit=20` | **No `sort=`** — nested array → HTTP 400 |
| Drug recalls | `/drug/enforcement.json?search=status:Ongoing&sort=recall_initiation_date:desc&limit=40` | Filter Class I/II client-side |
| Drug events | `/drug/event.json?sort=receiptdate:desc&limit=15` | FDA calendar |

### PubMed / NCBI — no key
- `esearch.fcgi` → IDs → `esummary.fcgi`. Required params: `tool=biosignal&email=data@biosignal.io`

### ClinicalTrials.gov v2
- Endpoint: `https://clinicaltrials.gov/api/v2/studies`
- Phase field: `protocolSection.designModule.phases` → `["PHASE2"]` string array
- Default `minPhase=2`; science page fetches all (`minPhase=0`) into `_allTrials`, filters client-side

### SEC EDGAR (`efts.sec.gov`) — **always use `_proxy()`**
- No CORS headers → direct fetch blocked
- Response fields: `display_names[0]`, `form`, `adsh`, `ciks[0]`, `period_ending`
- **Do NOT `encodeURIComponent` the `forms=` param** — encoded commas break query
- Priority 8-K keywords: `"clinical results" OR "partnership" OR "license agreement" OR "merger" OR "acquisition" OR "FDA approval" OR "PDUFA"`

### Finnhub — key via `FINNHUB_API_KEY` env var, injected server-side by `netlify/functions/finnhub.js`
- Rate limit: 60 calls/min. Budget: 20 watchlist + recs + sentiment ≈ 32/cycle
- `_qCache` TTL = 55s (separate from 5-min `_cache`). Quotes refresh every 60s, rest every 5min
- Endpoints: `/quote`, `/calendar/ipo` (needs `from`+`to`), `/stock/recommendation`, `/calendar/earnings`, `/news-sentiment`

### ChEMBL (EBI REST) — no key, CORS-enabled
| Endpoint | Used for | Key fields |
|---|---|---|
| `/molecule?max_phase=4&therapeutic_flag=true` | Approved drugs | `pref_name`, `max_phase`, `first_approval`, `atc_classifications` |
| `/drug_indication?max_phase_for_ind__gte=1&max_phase_for_ind__lt=4` | Pipeline | `molecule_chembl_id`, `efo_term`, `mesh_heading`, `max_phase_for_ind` |

**ChEMBL critical:** `max_phase_for_ind` is a float string → always `Math.round(parseFloat(...))`. Filter by `molecule_chembl_id` (no `molecule_name` field). Never use `__exact=4` → HTTP 400.

---

## 4. Coding Patterns

| Pattern | Key details |
|---|---|
| API fetch | Check `_cache` first. Use `AbortSignal.timeout(12000)`. Throw on `!res.ok`. `_set()` result before return. Log warnings as `[BioSignal] fnName: err.message`. |
| CORS proxy | `const w = await _proxy(url, 15000)` → `w.contents` is string; `JSON.parse(w.contents)` or `DOMParser().parseFromString(w.contents, 'text/xml')` |
| News card | Use `renderNewsCard(it)` in `news.js` — expects `{ title, summary, image, source, pubDate, link, fetchedAt }`. Uses `.news-card` / `.card-body` classes. |
| Error handling | In page JS: `BS.setAPIStatus(id, 'loading'/'ok'/'error')`. On catch: render `errorMsg(...)` into the grid element. Never catch in `biosignal-data.js`. |
| Status bar | `BS.initStatusBar([{id, label}, ...])` at page load. **Not on `index.html`** — home page has no status bar. |

---

## 5. Style Reference

Never hardcode colors, px values, or font sizes. Always use CSS custom properties from `styles.css`.

**Design tokens:** `--accent`, `--bg-page`, `--bg-card`, `--bg-card2`, `--bg-card3`, `--text-main`, `--text-dark`, `--border`, `--oncology` (red/danger), `--phase-3` (dark green), `--phase-2` (blue), `--phase-1` (orange)

**Reuse these classes — do not recreate:**
- Cards: `.news-card`, `.card-body`, `.card-meta`, `.card-title`, `.card-summary`, `.card-footer-row`, `.fetch-stamp`
- Publications: `.pub-card`, `.pub-strip` (3-col grid)
- Skeletons: `.skeleton-card`, `.skel`, `.skel-sm`, `.skel-md`, `.skel-lg`, `.skel-p`
- Layout: `.section-badge`, `.section-header-row`, `.section-title`, `.view-all`, `.cat-pill`, `.pill-row`, `.two-col-layout`, `.sidebar`
- Market: `.mkt-panel`, `.mkt-table`, `.mkt-sector-card`, `.ticker-wrap`, `.ticker-track`
- States: `.empty-state`, `.mkt-unavail`

---

## 6. Hard Rules

| Rule | Reason |
|---|---|
| **NEVER** sort OpenFDA approvals by `submissions.submission_status_date` | Nested array → HTTP 400 |
| **NEVER** `encodeURIComponent` the `forms=` param in SEC EDGAR URLs | `%2C` breaks query |
| **NEVER** fetch `efts.sec.gov` directly | No CORS; must use `_proxy()` |
| **NEVER** hardcode colors/sizes in JS-generated HTML | Use CSS vars and component classes |
| **NEVER** add `#api-status-bar` to `index.html` | Home page intentionally has none |
| **ALWAYS** `Math.round(parseFloat(ind.max_phase_for_ind))` | Float string, not integer |
| **ALWAYS** filter RSS results by `NEWS_KEYWORDS` | Feeds contain non-biotech content |
| **ALWAYS** run `_dedupe()` after combining feeds | Significant overlap between sources |

---

## 7. Placeholder Sections

| Page | Section | State |
|---|---|---|
| `market.html` | Funding rounds (`#funding`) | Hardcoded; needs Crunchbase or similar |
| `companies.html` | Company profiles | Static HTML cards; no live data |
| `science.html` | Drug database | ChEMBL live; names may show CHEMBL IDs if `pref_name` null |
| All pages | Subscribe / newsletter CTA | Static; no backend |

---

## 8. Known Issues

| Issue | Details |
|---|---|
| Finnhub rate limit | 60/min; adding WATCHLIST symbols requires recalculating budget |
| ChEMBL drug names | No `molecule_name` on `/drug_indication`; pipeline shows `molecule_chembl_id` |
| AllOrigins latency | Public CORS proxy; can be 5–15s or down |
| NewsAPI CORS | Blocked in browser; AllOrigins proxy fallback. Primary source is RSS |
| ClinicalTrials phases | Some studies return null `phases`; `_phaseNum()` returns 0 |
| PubMed rate limits | 3 req/sec without key; rapid reloads may throttle |
| OpenFDA sort | No safe sort field; cards appear in API-default order |

---

## 9. Auto-Update Rule

Update this file before ending any session where you: add/rename/remove a file, change an API endpoint, introduce a new pattern or component, fix a bug that was a wrong assumption above, or add reusable CSS classes. Mark changed sections with `<!-- updated: YYYY-MM-DD -->`.

---

## 10. Session Checklist

1. Read this file in full
2. Read the relevant page file(s)
3. State: "I will edit `[files]` to accomplish `[goal]`"
4. Check §8 (Known Issues) before any API call
5. Check §6 (Hard Rules) before any fetch URL
6. Update this file per §9 after completing work
