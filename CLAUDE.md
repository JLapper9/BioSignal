# CLAUDE.md — BioSignal Living Reference

> **Session startup instruction:** Read this file first. Summarize the current state in one paragraph, state which file(s) you plan to edit, and confirm before touching any code. Update this file after any change that affects project structure, APIs, or coding patterns.

---

## 1. Project Summary

BioSignal is a biopharma intelligence hub built for the RSM team. It is a **vanilla HTML/CSS/JS single-page application** — no frameworks, no build tools, no package manager. Every page is a standalone `.html` file that loads shared modules via `<script>` tags. The site surfaces live regulatory, clinical, market, and company data for scientists, investors, and strategy teams.

Audience: professional biopharma/biotech users who need fast, accurate signal — not a demo site.

---

## 2. File Map

| File | Role | Key variables / functions |
|---|---|---|
| `biosignal-data.js` | Shared data module — attached as `window.BioSignal`. All pages depend on it. | `ENDPOINTS`, `RSS_FEEDS`, `NEWS_KEYWORDS`, `loadNews`, `loadFDA`, `loadPubMed`, `loadTrials`, `loadSEC`, `loadPipeline`, `loadDrugs`, `loadStockQuotes`, `loadMarketStats`, `loadFundingRounds`, `loadIPOs`, `loadMADeals`, `loadFDACalendar`, `clearCache`, `formatDate`, `truncate`, `stripHtml`, `relativeTime`, `phaseClass`, `phaseLabel`, `trialStatusClass`, `trialStatusLabel`, `initStatusBar`, `setAPIStatus`, `_proxy`, `_cache`, `_qCache` |
| `styles.css` | Global design system — colors, typography, layout, components | CSS custom properties on `:root` (`--accent`, `--bg-*`, `--text-*`, `--border`, etc.), `.news-card`, `.pub-card`, `.pub-strip` (3-col grid), `.trial-card`, audience/feature cards |
| `dashboard.css` | Dashboard and page-specific overrides | `.mkt-overview-section`, `.ticker-wrap/@keyframes ticker-scroll`, `.mkt-sector-cards`, `.mkt-panel`, `.mkt-two-col`, `.mkt-table`, `.mkt-rec-row`, `.mkt-earn-row`, `.mkt-sentiment-grid`, `.news-section-controls`, `.news-section-search-wrap`, `.card-footer-row`, `.fetch-stamp`, `.skeleton-card`, `.skel` |
| `app.js` | Shared UI — pill filters, table sort, mobile nav, scroll animations | `initNav()`, `initPills()`, `initTableSort()`, `initScrollAnim()` |
| `index.html` | Home page — hero, feature cards, mission/audience sections | No `<div id="api-status-bar">` (removed intentionally) |
| `index.js` | Home page JS — global hub search across news/FDA/trials | `initHubSearch()`, status bar for home page only |
| `news.html` | News page — RSS grid, FDA spotlight, trial sidebar, PubMed strip | `#hub-rss-grid`, `#hub-fda-grid`, `#hub-trials-list`, `#hub-pubmed-strip`, `#hub-rss-pills`, `#news-section-search` |
| `news.js` | News page JS | `renderNewsCard`, `loadRSSSection`, `renderFDACard`, `loadTrialsSection`, `loadPubMedSection`, `initSectionSearch`, `fetchedStamp` |
| `market.html` | Market page — 8-widget financial dashboard | `#ticker-track`, `#mkt-sector-cards`, `#mkt-gainers`, `#mkt-losers`, `#mkt-watchlist-table`, `#mkt-recs`, `#mkt-earnings`, `#mkt-sentiment` |
| `market.js` | Market page JS — Finnhub-powered dashboard | `WATCHLIST` (20 stocks), `TICKER_SYMBOLS` (13), `REC_SYMBOLS` (5), `SENT_SYMBOLS` (6), `loadWatchlistAndMovers`, `loadTicker`, `loadSectorCards`, `loadAnalystRecs`, `loadEarningsCalendar`, `loadSentiment`, `loadIPOSection`, `loadFundingSection`, `loadMASection`, `loadFDACalendarSection` |
| `companies.html` | Companies page — pipeline tracker, SEC filings | `#pipeline-grid`, `#sec-grid` |
| `companies.js` | Companies page JS | `loadPipelineSection`, `loadSECSection`, `fetchedStamp` |
| `science.html` | Science page — drugs DB, clinical trials, PubMed research | `#drugs-grid`, `#trials-grid`, `#research-grid`, trial phase pills |
| `science.js` | Science page JS | `loadDrugsSection`, `loadTrialsSection`, `loadResearchSection`, `wireTrialPills`, `_allTrials` cache, `_phaseNum` |

---

## 3. API Integrations

### RSS Feeds (primary news source)
- **Proxy:** `https://api.allorigins.win/get?url=<encoded>` — required for all RSS + SEC EDGAR
- **Sources:** Fierce Biotech, Fierce Pharma, BioSpace, Google News biopharma
- **Parsed with:** `DOMParser`, deduplicated by normalized 80-char title key
- **Keyword filtered:** `NEWS_KEYWORDS` array (25+ terms)
- **Fallback:** NewsAPI `b386f6a037d44e919e9b08b9e5131f14` (only if <10 RSS results)

### OpenFDA (`api.fda.gov`) — no API key required
| Endpoint | URL pattern | Notes |
|---|---|---|
| Drug approvals | `/drug/drugsfda.json?search=submissions.submission_status:AP&limit=20` | No `sort=` param — nested array fields cause HTTP 400 |
| Drug recalls | `/drug/enforcement.json?search=status:Ongoing&sort=recall_initiation_date:desc&limit=40` | Fetch 40, filter Class I/II client-side: `cls.includes('CLASS I') \|\| cls.includes('CLASS II')` |
| Drug events | `/drug/event.json?sort=receiptdate:desc&limit=15` | Used for FDA calendar page |
| FDA RSS | `/about-fda/...rss.xml` | Via `_proxy()` |

### PubMed / NCBI — no API key required
- `esearch.fcgi` → get IDs → `esummary.fcgi` → get metadata
- Tool/email params required: `tool=biosignal&email=data@biosignal.io`

### ClinicalTrials.gov v2
- Endpoint: `https://clinicaltrials.gov/api/v2/studies`
- Phase field: `protocolSection.designModule.phases` → string array `["PHASE2"]`
- Default `minPhase=2` (Phase 2+); `_phaseNum()` maps strings to integers
- Science page: fetch all (`minPhase=0`) into `_allTrials`, filter client-side on pill click

### SEC EDGAR (`efts.sec.gov`) — **must use `_proxy()`**
- Does not send `Access-Control-Allow-Origin` headers → direct fetch blocked
- Response fields: `display_names[0]` (company), `form`, `adsh` (accession), `ciks[0]`, `period_ending`
- Do NOT use `encodeURIComponent` on the `forms=` parameter (commas must be literal)
- Priority 8-K keywords: `"clinical results" OR "partnership" OR "license agreement" OR "merger" OR "acquisition" OR "FDA approval" OR "PDUFA"`

### Finnhub (primary market data)
- **Key:** `d79gh9hr01qqpmhgn5c0d79gh9hr01qqpmhgn5cg`
- **Rate limit:** 60 calls/min (free tier) — budget carefully
- **Quote cache:** `_qCache` with 55-second TTL (separate from 5-min `_cache`)
- **Refresh:** quotes every 60s, analyst/earnings/sentiment every 5min

| Endpoint | Function | Notes |
|---|---|---|
| `/quote?symbol=` | `loadStockQuotes(symbols)` | Parallel fetch, returns `{ c, h, l, o, pc, dp }` |
| `/calendar/ipo` | `loadIPOs()` | Requires `from` + `to` date strings |
| `/stock/recommendation` | `finnhubRecs` | Returns array of recommendation objects |
| `/calendar/earnings` | `finnhubEarnings` | Date range required |
| `/news-sentiment` | `finnhubSentiment` | Per-symbol sentiment score |

### ChEMBL (EBI REST API) — no key, CORS-enabled
| Endpoint | Used for | Key fields |
|---|---|---|
| `/molecule?max_phase=4&therapeutic_flag=true` | Approved drugs (`loadDrugs`) | `pref_name`, `max_phase`, `first_approval`, `atc_classifications` |
| `/drug_indication?max_phase_for_ind__gte=1&max_phase_for_ind__lt=4` | Pipeline (`loadPipeline`) | `molecule_chembl_id`, `efo_term`, `mesh_heading`, `max_phase_for_ind` (float string e.g. `"3.0"`) |

**Critical ChEMBL notes:**
- `max_phase_for_ind` is a float string — always `Math.round(parseFloat(...))` before phase lookup
- Filter by `molecule_chembl_id` (not `molecule_name` — field does not exist)
- `max_phase_for_ind__exact=4` → HTTP 400; use `__gte` / `__lt` operators

---

## 4. Coding Patterns

### API call template
```js
async function loadSomething(params) {
  const cacheKey = 'something_' + JSON.stringify(params);
  const cached = _get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(ENDPOINTS.something(params), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const result = /* transform data */;
    _set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[BioSignal] loadSomething:', err.message);
    throw err;
  }
}
```

### CORS proxy pattern (for SEC EDGAR, RSS, etc.)
```js
const w = await _proxy(url, 15000);      // returns { contents: '...', status: {...} }
const data = JSON.parse(w.contents);     // for JSON
// or
const doc = new DOMParser().parseFromString(w.contents, 'text/xml');  // for RSS/XML
```

### News card component
```js
function renderNewsCard(it) {
  return `<article class="news-card" data-title="${escHtml(it.title)}" data-summary="${escHtml(it.summary)}">
    ${it.image ? `<img class="card-img" src="${it.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
    <div class="card-body">
      <div class="card-meta"><span class="card-source">${escHtml(it.source)}</span><span class="card-date">${BS.relativeTime(it.pubDate)}</span></div>
      <h3 class="card-title"><a href="${it.link}" target="_blank" rel="noopener">${escHtml(it.title)}</a></h3>
      <p class="card-summary">${escHtml(it.summary)}</p>
      <div class="card-footer-row">
        <a href="${it.link}" class="card-read" target="_blank" rel="noopener">Read more →</a>
        <span class="fetch-stamp">${fetchedStamp(it.fetchedAt)}</span>
      </div>
    </div>
  </article>`;
}
```

### Error handling pattern
```js
// In page JS (not biosignal-data.js):
try {
  BS.setAPIStatus('myapi', 'loading');
  const data = await BS.loadSomething();
  BS.setAPIStatus('myapi', 'ok');
  renderResults(data);
} catch (err) {
  BS.setAPIStatus('myapi', 'error');
  el('my-grid').innerHTML = errorMsg('Data unavailable: ' + err.message);
}
```

### Status bar initialization
```js
// At page load (not on home page — home page has no status bar):
BS.initStatusBar([
  { id: 'newsapi',  label: 'News RSS'   },
  { id: 'openfda',  label: 'OpenFDA'    },
  { id: 'trials',   label: 'Trials'     },
  { id: 'pubmed',   label: 'PubMed'     },
]);
```

---

## 5. Style Reference

**Always use CSS custom properties from `styles.css`. Never hardcode colors, font sizes, or spacing.**

Key design tokens:
```css
--accent         /* primary teal/green brand color */
--bg-page        /* page background */
--bg-card        /* card surface */
--bg-card2       /* alternate card surface */
--bg-card3       /* section background */
--text-main      /* primary text */
--text-dark      /* muted/secondary text */
--border         /* border color */
--oncology       /* red — used for FDA/recall/danger signals */
--phase-3        /* dark green — Phase 3 indicator */
--phase-2        /* blue — Phase 2 indicator */
--phase-1        /* orange — Phase 1 indicator */
```

Component classes to reuse (do not recreate):
- `.news-card`, `.card-body`, `.card-meta`, `.card-title`, `.card-summary`, `.card-footer-row`, `.fetch-stamp`
- `.pub-card`, `.pub-strip` (3-col grid, see `styles.css`)
- `.skeleton-card`, `.skel`, `.skel-sm`, `.skel-md`, `.skel-lg`, `.skel-p`
- `.section-badge`, `.section-header-row`, `.section-title`, `.view-all`
- `.cat-pill`, `.pill-row`, `.two-col-layout`, `.sidebar`
- `.mkt-panel`, `.mkt-table`, `.mkt-sector-card`, `.ticker-wrap`, `.ticker-track`
- `.empty-state`, `.mkt-unavail`

---

## 6. Hard Coding Rules

| Rule | Reason |
|---|---|
| **NEVER** sort OpenFDA approvals by `submissions.submission_status_date` | Nested array field → HTTP 400 |
| **NEVER** use `encodeURIComponent` on the `forms=` parameter in SEC EDGAR URLs | Encoded commas (`%2C`) break the API query |
| **NEVER** fetch `efts.sec.gov` directly — always use `_proxy()` | No CORS headers; browser blocks cross-origin |
| **NEVER** hardcode colors, px values, or font sizes in JS-generated HTML | Use CSS custom properties and existing component classes |
| **NEVER** add `<div id="api-status-bar"></div>` to `index.html` | Home page intentionally has no status bar |
| **ALWAYS** `Math.round(parseFloat(ind.max_phase_for_ind))` before comparing phase | Field is a float string (`"3.0"`), not an integer |
| **ALWAYS** filter news by `NEWS_KEYWORDS` after RSS parse | Feeds contain non-biotech content |
| **ALWAYS** run `_dedupe()` after combining multiple RSS feeds | Feeds overlap significantly |

---

## 7. Placeholder / Static Sections

These sections currently display hardcoded or placeholder data and need real API integration:

| Page | Section | Current state |
|---|---|---|
| `market.html` | Funding rounds (`#funding`) | Hardcoded sample rounds; should pull from Crunchbase or similar |
| `companies.html` | Company profiles | Static HTML company cards; no live data |
| `science.html` | Drug database (`#drugs`) | ChEMBL live but drug names may be CHEMBL IDs if `pref_name` is null |
| All pages | Subscribe / newsletter CTA | Static link, no backend |

---

## 8. Known Issues & Limitations

| Issue | Details |
|---|---|
| Finnhub free tier rate limit | 60 calls/min; 20 watchlist + recs + sentiment = ~32 per refresh cycle. If symbols are added to WATCHLIST, recalculate budget |
| ChEMBL pipeline drug names | `/drug_indication` has no `molecule_name` field; pipeline cards show `molecule_chembl_id` as identifier |
| SEC EDGAR proxy latency | AllOrigins is a public CORS proxy — can be slow (5–15s) or occasionally down |
| NewsAPI CORS block | NewsAPI blocks direct browser fetch; uses AllOrigins proxy as fallback. Primary source is now RSS |
| ClinicalTrials.gov v2 phases | Some studies return empty or null `phases` array; `_phaseNum()` returns 0 for those |
| PubMed rate limits | NCBI allows 3 requests/sec without API key; rapid reloads may get throttled |
| OpenFDA approval dates | No reliable sort field available without HTTP 400; cards appear in API-default order |

---

## 9. Auto-Update Rule

**After any session where you:**
- Add, rename, or remove a file
- Add or change an API endpoint or data source
- Introduce a new coding pattern or component
- Fix a bug caused by a wrong assumption documented above
- Add new CSS classes intended for reuse

**→ Update the relevant section(s) of this file before ending the session.**

Mark changed sections with `<!-- updated: YYYY-MM-DD -->` at the end of the section heading line.

---

## 10. Session Startup Checklist

1. Read `CLAUDE.md` (this file) in full
2. Read the specific page file(s) relevant to the task
3. State in one sentence: "I will edit `[files]` to accomplish `[goal]`"
4. Check Section 8 (Known Issues) before touching any API call
5. Check Section 6 (Hard Coding Rules) before generating any fetch URLs
6. After completing work, update this file if Section 9 (Auto-Update Rule) applies