/* ======================================================
   BioSignal — Shared Data Module  (biosignal-data.js)
   Sources: NewsAPI · OpenFDA · PubMed/NCBI · ClinicalTrials.gov · SEC EDGAR
            Finnhub · FDA RSS · ChEMBL
   Attaches as window.BioSignal — no dependencies
====================================================== */
'use strict';

(function () {

  /* ── Cache ─────────────────────────────────────────────────── */
  const _cache = {};
  const TTL    = 5 * 60 * 1000; // 5 min

  function _get(k)    { const e = _cache[k]; return (e && Date.now()-e.ts < TTL) ? e.d : null; }
  function _set(k, d) { _cache[k] = { d, ts: Date.now() }; }
  function clearCache() { Object.keys(_cache).forEach(k => delete _cache[k]); }

  /* ── API Keys ───────────────────────────────────────────────── */
  const NEWS_API_KEY = 'b386f6a037d44e919e9b08b9e5131f14';

  // ⚠️  Replace with your free Finnhub key from https://finnhub.io
  const FINNHUB_KEY  = 'd79gh9hr01qqpmhgn5c0d79gh9hr01qqpmhgn5cg';

  /* ── Queries ────────────────────────────────────────────────── */
  const NEWS_QUERY = 'biotech OR "FDA approval" OR pharmaceutical OR "clinical trials" OR "life sciences" OR "drug development"';

  /* ── API Endpoints ──────────────────────────────────────────── */
  const ENDPOINTS = {

    // OpenFDA
    fdaApprovals: 'https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status:AP&limit=20',
    fdaRecalls:   'https://api.fda.gov/drug/enforcement.json?search=status:Ongoing&sort=recall_initiation_date:desc&limit=40',
    fdaEvents:    'https://api.fda.gov/drug/event.json?sort=receiptdate:desc&limit=15',

    // FDA RSS feeds (fetched via CORS proxy)
    fdaAdcomRSS: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/advisory-committee-meetings/rss.xml',
    fdaDrugRSS:  'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml',

    // PubMed / NCBI
    pubmedSearch:   (t)   => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(t)}&sort=pub+date&retmode=json&retmax=15&tool=biosignal&email=data@biosignal.io`,
    pubmedSummary:  (ids) => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json&tool=biosignal&email=data@biosignal.io`,
    pubmedAbstract: (id)  => `https://pubmed.ncbi.nlm.nih.gov/${id}/`,

    // ClinicalTrials.gov v2
    trials: (q, st, n) => `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(q)}&filter.overallStatus=${encodeURIComponent(st)}&sort=LastUpdatePostDate:desc&pageSize=${n || 15}`,

    // SEC EDGAR full-text search (via CORS proxy)
    secSearch: (forms, days) => {
      const since = new Date(Date.now() - (days || 90) * 86400000).toISOString().split('T')[0];
      return `https://efts.sec.gov/LATEST/search-index?q=%22pharmaceutical%22+OR+%22biotech%22+OR+%22biopharma%22&forms=${forms || 'S-1,8-K,10-K,10-Q'}&dateRange=custom&startdt=${since}`;
    },

    // SEC 8-K M&A keyword filter
    secMASearch: (days) => {
      const since = new Date(Date.now() - (days || 60) * 86400000).toISOString().split('T')[0];
      return `https://efts.sec.gov/LATEST/search-index?q=%22merger%22+OR+%22acquisition%22+OR+%22acquires%22+OR+%22acquired%22&forms=8-K&dateRange=custom&startdt=${since}`;
    },

    // Finnhub (CORS-enabled, free tier)
    finnhubQuote:     (symbol)  => `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`,
    finnhubIPO:       (from, to) => `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
    finnhubRecs:      (symbol)  => `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_KEY}`,
    finnhubEarnings:  (from, to) => `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
    finnhubSentiment: (symbol)  => `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${FINNHUB_KEY}`,

    // ChEMBL (public REST API, CORS-enabled, no key required)
    // drug_indication: returns molecule_chembl_id + efo_term/mesh_heading + max_phase_for_ind (float string)
    chemblPipeline: (n) => `https://www.ebi.ac.uk/chembl/api/data/drug_indication?format=json&limit=${n || 50}&order_by=-max_phase_for_ind&max_phase_for_ind__gte=1&max_phase_for_ind__lt=4`,
    // molecule: returns pref_name, max_phase, first_approval — used for approved drug database
    chemblDrugs:    (n) => `https://www.ebi.ac.uk/chembl/api/data/molecule?format=json&limit=${n || 30}&max_phase=4&therapeutic_flag=true&order_by=-first_approval`,
    chemblCompound: (id) => `https://www.ebi.ac.uk/chembl/compound_report_card/${id}/`,

    // SEC EDGAR priority 8-K keyword search
    secPrioritySearch: (days) => {
      const since = new Date(Date.now() - (days || 60) * 86400000).toISOString().split('T')[0];
      return `https://efts.sec.gov/LATEST/search-index?q=%22clinical+results%22+OR+%22partnership%22+OR+%22license+agreement%22+OR+%22merger%22+OR+%22acquisition%22+OR+%22FDA+approval%22+OR+%22PDUFA%22&forms=8-K&dateRange=custom&startdt=${since}`;
    },
  };

  /* ── RSS Feed Sources ───────────────────────────────────────── */

  const RSS_FEEDS = [
    { url: 'https://www.fiercebiotech.com/rss/xml',   source: 'Fierce Biotech' },
    { url: 'https://www.fiercepharma.com/rss/xml',    source: 'Fierce Pharma'  },
    { url: 'https://www.biospace.com/rss/',            source: 'BioSpace'       },
    { url: 'https://news.google.com/rss/search?q=biopharma+biotech+FDA&hl=en-US&gl=US&ceid=US:en', source: 'Google News' },
  ];

  const NEWS_KEYWORDS = [
    'fda approval', 'phase 3', 'phase 2', 'phase iii', 'phase ii', 'clinical trial',
    'nda', 'bla', 'pdufa', 'partnership', 'licensing', 'license agreement',
    'acquisition', 'merger', 'ipo', 'funding round', 'drug approval', 'clinical readout',
    'trial data', 'regulatory', 'breakthrough therapy', 'fast track', 'priority review',
    'biotech', 'biopharma', 'pharmaceutical', 'biologic', 'fda', 'oncology',
    'gene therapy', 'crispr', 'clinical study', 'efficacy', 'safety data',
  ];

  /* ── Utilities ──────────────────────────────────────────────── */

  function formatDate(s) {
    if (!s) return '';
    const str = String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    const d   = new Date(str);
    return isNaN(d) ? String(s) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function truncate(s, n) {
    n = n || 180;
    if (!s) return '';
    return s.length > n ? s.slice(0, n).trimEnd() + '\u2026' : s;
  }

  function stripHtml(h) {
    if (!h) return '';
    return h.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  function relativeTime(ds) {
    const d = new Date(ds);
    if (isNaN(d)) return '';
    const h = Math.floor((Date.now() - d) / 3600000);
    if (h < 1)  return 'Just now';
    if (h < 24) return h + 'h ago';
    const days = Math.floor(h / 24);
    if (days < 7) return days + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function phaseClass(phases) {
    const p = (phases || [])[0] ? (phases[0] + '').toLowerCase() : '';
    return p.includes('3') ? 'phase-3' : p.includes('2') ? 'phase-2' : p.includes('1') ? 'phase-1' : 'phase-na';
  }

  function phaseLabel(phases) {
    if (!(phases || []).length) return 'N/A';
    return phases.map(function(p) { return p.replace('PHASE', 'Phase ').replace('_', ' '); }).join(', ');
  }

  function trialStatusClass(s) {
    const u = (s || '').toUpperCase();
    if (u.includes('RECRUITING') && !u.includes('NOT')) return 'ts-recruiting';
    if (u.includes('ACTIVE'))     return 'ts-active';
    if (u.includes('COMPLETED'))  return 'ts-completed';
    if (u.includes('TERMINATED') || u.includes('WITHDRAWN')) return 'ts-terminated';
    return 'ts-unknown';
  }

  function trialStatusLabel(s) {
    return (s || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  /* ── CORS proxy helper ──────────────────────────────────────── */

  async function _proxy(url, timeout) {
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeout || 15000) });
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    return res.json(); // returns { contents: '...', status: {...} }
  }

  /* ── NewsAPI (fallback only) ─────────────────────────────────── */

  async function _loadNewsAPIFallback() {
    const apiUrl = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(NEWS_QUERY) +
      '&language=en&sortBy=publishedAt&pageSize=40&apiKey=' + NEWS_API_KEY;
    let data;
    try {
      const r = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
      if (r.ok) data = await r.json();
    } catch (_) {}
    if (!data || data.status !== 'ok') {
      try {
        const w = await _proxy(apiUrl);
        data = JSON.parse(w.contents || '{}');
      } catch (_) {}
    }
    if (!data || data.status !== 'ok') return [];
    const fetchedAt = new Date();
    return (data.articles || [])
      .filter(function(a) { return a.title && a.title !== '[Removed]' && a.url; })
      .map(function(a) {
        const title = (a.title || '').replace(/ [-\u2013] [^\-\u2013]{2,60}$/, '').trim();
        return {
          title,
          link:      a.url,
          pubDate:   a.publishedAt || '',
          summary:   truncate(stripHtml(a.description || ''), 220),
          image:     a.urlToImage || null,
          source:    (a.source && a.source.name) || 'NewsAPI',
          author:    a.author || '',
          date:      a.publishedAt ? new Date(a.publishedAt) : new Date(0),
          fetchedAt,
        };
      });
  }

  /* ── RSS Feed Parser ─────────────────────────────────────────── */

  async function _fetchRSSFeed(feed) {
    const w   = await _proxy(feed.url, 14000);
    const xml = w.contents || '';
    if (!xml) return [];

    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    const items  = Array.from(doc.querySelectorAll('item'));
    const fetchedAt = new Date();

    return items.map(function(item) {
      const title   = (item.querySelector('title')?.textContent   || '').trim();
      const link    = (item.querySelector('link')?.textContent    || '').trim();
      const pubDate = (item.querySelector('pubDate')?.textContent || '').trim();
      const descRaw = item.querySelector('description')?.textContent || '';
      const encImg  = item.querySelector('enclosure[type^="image"]');
      const mediaImg= item.querySelector('content[url]') || item.querySelector('thumbnail');
      const image   = (encImg && encImg.getAttribute('url')) ||
                      (mediaImg && (mediaImg.getAttribute('url') || mediaImg.textContent.trim())) || null;
      const dateObj = pubDate ? new Date(pubDate) : new Date(0);
      return {
        title:     title.replace(/ [-\u2013] [^\-\u2013]{2,60}$/, '').trim(),
        link,
        pubDate:   pubDate,
        summary:   truncate(stripHtml(descRaw), 220),
        image,
        source:    feed.source,
        author:    '',
        date:      dateObj,
        fetchedAt,
      };
    }).filter(function(it) { return it.title && it.link; });
  }

  /* ── Deduplication ───────────────────────────────────────────── */

  function _dedupe(items) {
    const seen = new Set();
    return items.filter(function(it) {
      // Normalise title: lowercase, strip punctuation, collapse spaces
      const key = it.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /* ── Keyword relevance filter ────────────────────────────────── */

  function _matchesKeywords(it) {
    const haystack = (it.title + ' ' + it.summary).toLowerCase();
    return NEWS_KEYWORDS.some(function(kw) { return haystack.includes(kw); });
  }

  /* ── Primary loadNews (RSS first, NewsAPI fallback) ─────────── */

  async function loadNews(limit) {
    limit = limit || 20;
    const cached = _get('news');
    if (cached) return cached.slice(0, limit);

    // Fetch all RSS feeds in parallel, ignore individual failures
    const settled = await Promise.allSettled(
      RSS_FEEDS.map(function(feed) { return _fetchRSSFeed(feed); })
    );

    let items = [];
    settled.forEach(function(r) {
      if (r.status === 'fulfilled') items = items.concat(r.value);
    });

    // If RSS returned very few items, supplement with NewsAPI
    if (items.length < 10) {
      try {
        const fallback = await _loadNewsAPIFallback();
        items = items.concat(fallback);
      } catch (_) {}
    }

    // Sort by date descending, dedupe, then keyword-filter
    items.sort(function(a, b) { return b.date - a.date; });
    items = _dedupe(items);
    const relevant = items.filter(_matchesKeywords);
    // If keyword filter is too aggressive, fall back to all items
    const final = relevant.length >= 10 ? relevant : items;

    _set('news', final);
    return final.slice(0, limit);
  }

  /* ── OpenFDA ─────────────────────────────────────────────────── */

  async function loadFDA(tab, limit) {
    tab   = tab   || 'approvals';
    limit = limit || 9;
    const key    = 'fda_' + tab;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const fetchedAt = new Date();

    if (tab === 'approvals') {
      const res  = await fetch(ENDPOINTS.fdaApprovals);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const out  = (data.results || []).map(function(r) {
        r._fetchedAt = fetchedAt;
        // Most recent approved submission
        const sub = (r.submissions || []).find(function(s) { return s.submission_status === 'AP'; })
                 || (r.submissions || [])[0] || {};
        // Indication from pharmacological class in openfda
        const pharmClass = (r.openfda && r.openfda.pharm_class_epc && r.openfda.pharm_class_epc[0]) || '';
        r._indication   = pharmClass.replace(/\s*\[EPC\]\s*$/i, '').replace(/\s*\[.*?\]\s*$/g, '').trim();
        r._division     = sub.review_priority === 'PRIORITY' ? 'Priority Review' : sub.submission_type || '';
        r._approvalDate = sub.submission_status_date || '';
        return r;
      });
      _set(key, out);
      return out.slice(0, limit);
    }

    if (tab === 'recalls') {
      // Fetch a larger set and filter Class I / II client-side — avoids compound query 400s
      const res = await fetch(ENDPOINTS.fdaRecalls);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const out  = (data.results || [])
        .filter(function(r) {
          const cls = (r.classification || '').toUpperCase();
          return cls.includes('CLASS I') || cls.includes('CLASS II');
        })
        .map(function(r) { r._fetchedAt = fetchedAt; return r; });
      _set(key, out);
      return out.slice(0, limit);
    }

    // events tab
    const res  = await fetch(ENDPOINTS.fdaEvents);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out  = (data.results || []).map(function(r) { r._fetchedAt = fetchedAt; return r; });
    _set(key, out);
    return out.slice(0, limit);
  }

  /* ── PubMed / NCBI ───────────────────────────────────────────── */

  async function loadPubMed(topic, limit) {
    topic = topic || 'biotech life sciences gene therapy';
    limit = limit || 9;
    const key    = 'pm_' + topic;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const sRes  = await fetch(ENDPOINTS.pubmedSearch(topic));
    if (!sRes.ok) throw new Error('HTTP ' + sRes.status);
    const sData = await sRes.json();
    const ids   = (sData.esearchresult && sData.esearchresult.idlist) || [];
    if (!ids.length) return [];

    const sumRes  = await fetch(ENDPOINTS.pubmedSummary(ids.join(',')));
    if (!sumRes.ok) throw new Error('HTTP ' + sumRes.status);
    const sumData = await sumRes.json();
    const articles = ids.map(function(id) { return sumData.result && sumData.result[id]; }).filter(Boolean);
    _set(key, articles);
    return articles.slice(0, limit);
  }

  /* ── ClinicalTrials.gov ──────────────────────────────────────── */

  async function loadTrials(query, status, limit, minPhase) {
    query    = query    || 'biotech OR gene therapy OR oncology OR CRISPR';
    status   = status   || 'RECRUITING,ACTIVE_NOT_RECRUITING';
    limit    = limit    || 9;
    minPhase = minPhase !== undefined ? minPhase : 2; // default Phase 2+
    const key    = 'tr_' + query + '_' + status + '_p' + minPhase;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    // Fetch extra to allow for phase filtering client-side
    const fetchSize = Math.min(limit * 4, 60);
    const res  = await fetch(ENDPOINTS.trials(query, status, fetchSize));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const PHASE_ORDER = { 'PHASE1': 1, 'PHASE2': 2, 'PHASE3': 3, 'PHASE4': 4, 'EARLY_PHASE1': 0 };

    const studies = (data.studies || []).filter(function(s) {
      if (minPhase <= 0) return true;
      const design = (s.protocolSection && s.protocolSection.designModule) || {};
      const phases = design.phases || [];
      if (!phases.length) return false;
      // Keep if any phase meets the minimum
      return phases.some(function(p) {
        const n = PHASE_ORDER[p.toUpperCase().replace(/\s/g, '')] || 0;
        return n >= minPhase;
      });
    });

    _set(key, studies);
    return studies.slice(0, limit);
  }

  /* ── SEC EDGAR ───────────────────────────────────────────────── */

  function _secFlag(ft) {
    var labels  = { 'S-1': 'IPO Filing', 'S-1/A': 'IPO Amendment', '10-K': 'Annual Report', '10-Q': 'Quarterly Report', '8-K': 'Material Event' };
    var classes = { 'S-1': 'sec-ipo', 'S-1/A': 'sec-ipo', '10-K': 'sec-annual', '10-Q': 'sec-quarterly', '8-K': 'sec-event' };
    return { label: labels[ft] || ft, cls: classes[ft] || 'sec-other' };
  }

  function _parseSecHit(h, isPrioritySet) {
    const s = h._source || {};

    // display_names: ["Company Name/ST  (CIK 0001234567)"] — strip state + CIK suffix
    const rawName = (s.display_names && s.display_names[0]) || (s.entity_name) || 'Unknown';
    const company = rawName.replace(/\s*\(CIK[^)]*\)\s*$/, '').replace(/\/[A-Z]{2}\s*$/, '').trim();

    // form type: "form" field in new API, "form_type" in old
    const formType = s.form || s.root_forms && s.root_forms[0] || s.form_type || '';

    // accession: "adsh" field e.g. "0001262463-22-000008", old API used _id
    const adsh = s.adsh || (h._id || '').split(':')[0] || '';
    const accNoDashes = adsh.replace(/-/g, '');

    // CIK: "ciks" array in new API
    const cik = ((s.ciks && s.ciks[0]) || s.cik || '').replace(/^0+/, '');

    const url = (cik && accNoDashes)
      ? 'https://www.sec.gov/Archives/edgar/data/' + cik + '/' + accNoDashes + '/'
      : 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=' + encodeURIComponent(formType) + '&dateb=&owner=include&count=40';

    const period     = s.period_ending || s.period_of_report || '';
    const isPriority = isPrioritySet || formType === 'S-1' || formType === 'S-1/A';

    return {
      company, formType,
      fileDate:  s.file_date || '',
      period,
      cik, accession: adsh, url,
      flag:      _secFlag(formType),
      isMajor:   formType === 'S-1' || formType === 'S-1/A',
      isPriority,
      fetchedAt: new Date(),
    };
  }

  async function loadSEC(forms, limit) {
    forms = forms || 'S-1,8-K,10-K,10-Q';
    limit = limit || 15;
    const key    = 'sec_' + forms;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    // Both fetches go through CORS proxy — efts.sec.gov blocks direct cross-origin requests
    const [generalRes, priorityRes] = await Promise.allSettled([
      _proxy(ENDPOINTS.secSearch(forms), 15000).then(function(w) { return JSON.parse(w.contents || '{}'); }),
      _proxy(ENDPOINTS.secPrioritySearch(), 15000).then(function(w) { return JSON.parse(w.contents || '{}'); }),
    ]);

    const seenAcc = new Set();
    const priority = [];
    const general  = [];

    // Priority 8-Ks first
    if (priorityRes.status === 'fulfilled') {
      const hits = (priorityRes.value.hits && priorityRes.value.hits.hits) || [];
      hits.forEach(function(h) {
        const f = _parseSecHit(h, true);
        if (!seenAcc.has(f.accession)) { seenAcc.add(f.accession); priority.push(f); }
      });
    }

    // General filings
    if (generalRes.status === 'fulfilled') {
      const hits = (generalRes.value.hits && generalRes.value.hits.hits) || [];
      hits.forEach(function(h) {
        const f = _parseSecHit(h, false);
        if (!seenAcc.has(f.accession)) { seenAcc.add(f.accession); general.push(f); }
      });
    }

    if (!priority.length && !general.length) throw new Error('No SEC filings returned');

    // Priority items at top, then general, both sorted by date
    priority.sort(function(a, b) { return new Date(b.fileDate) - new Date(a.fileDate); });
    general.sort(function(a, b)  { return new Date(b.fileDate) - new Date(a.fileDate); });

    const filings = priority.concat(general).slice(0, Math.max(limit, 20));
    _set(key, filings);
    return filings.slice(0, limit);
  }

  /* ── Finnhub: Market Stats (XBI + IBB ETFs) ─────────────────── */

  async function loadMarketStats() {
    const key    = 'market_stats';
    const cached = _get(key);
    if (cached) return cached;

    if (!FINNHUB_KEY || FINNHUB_KEY === 'YOUR_FINNHUB_KEY') {
      return { noKey: true };
    }

    const [xbiRes, ibbRes] = await Promise.allSettled([
      fetch(ENDPOINTS.finnhubQuote('XBI'), { signal: AbortSignal.timeout(8000) }).then(function(r) { return r.json(); }),
      fetch(ENDPOINTS.finnhubQuote('IBB'), { signal: AbortSignal.timeout(8000) }).then(function(r) { return r.json(); }),
    ]);

    const stats = {
      xbi:      xbiRes.status === 'fulfilled' ? xbiRes.value : null,
      ibb:      ibbRes.status === 'fulfilled' ? ibbRes.value : null,
      ipoCount: null,
      noKey:    false,
    };

    // IPO count for current quarter
    try {
      const now    = new Date();
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const from   = new Date(now.getFullYear(), qMonth, 1).toISOString().split('T')[0];
      const to     = now.toISOString().split('T')[0];
      const ipoRes = await fetch(ENDPOINTS.finnhubIPO(from, to), { signal: AbortSignal.timeout(8000) });
      const ipoData = await ipoRes.json();
      stats.ipoCount = (ipoData.ipoCalendar || []).length;
    } catch (_) {}

    _set(key, stats);
    return stats;
  }

  /* ── Finnhub: Multi-stock Quotes (55 s TTL) ────────────────────── */

  const _qCache = {};
  const Q_TTL   = 55000;

  async function loadStockQuotes(symbols) {
    const now    = Date.now();
    const result = {};
    const need   = [];

    symbols.forEach(function(s) {
      const e = _qCache[s];
      if (e && now - e.ts < Q_TTL) { result[s] = e.d; }
      else { need.push(s); }
    });

    if (need.length) {
      const settled = await Promise.allSettled(
        need.map(function(s) {
          return fetch(ENDPOINTS.finnhubQuote(s), { signal: AbortSignal.timeout(8000) }).then(function(r) { return r.json(); });
        })
      );
      need.forEach(function(s, i) {
        const r = settled[i];
        result[s] = r.status === 'fulfilled' ? r.value : null;
        if (r.status === 'fulfilled') _qCache[s] = { d: r.value, ts: now };
      });
    }

    return result;
  }

  /* ── Finnhub: IPO Calendar ───────────────────────────────────── */

  async function loadIPOs(limit) {
    limit = limit || 10;
    const key    = 'ipos';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    if (!FINNHUB_KEY || FINNHUB_KEY === 'YOUR_FINNHUB_KEY') {
      return [];
    }

    const now  = new Date();
    const from = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    const to   = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];

    const res = await fetch(ENDPOINTS.finnhubIPO(from, to), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const ipos = (data.ipoCalendar || [])
      .map(function(ipo) {
        // Finnhub price can be a range "18.00-20.00" — take the lower bound
        const priceStr = String(ipo.price || '');
        const dp       = parseFloat(priceStr.split('-')[0]);
        const raised   = ipo.totalSharesValue
          ? (ipo.totalSharesValue / 1e6).toFixed(0) + 'M'
          : (ipo.numberOfShares && !isNaN(dp))
            ? (ipo.numberOfShares * dp / 1e6).toFixed(0) + 'M'
            : '\u2014';
        return {
          company:      ipo.name     || 'Unknown',
          symbol:       ipo.symbol   || '\u2014',
          ipoPrice:     !isNaN(dp)   ? dp.toFixed(2) : '\u2014',
          currentPrice: '\u2014',
          change:       null,
          ipoDate:      ipo.date     || '',
          raised,
          status:       ipo.status   || '',
          exchange:     ipo.exchange || '',
        };
      })
      .sort(function(a, b) { return new Date(b.ipoDate) - new Date(a.ipoDate); });

    _set(key, ipos);
    return ipos.slice(0, limit);
  }

  /* ── FDA Calendar: Advisory Committee RSS ────────────────────── */

  async function loadFDACalendar(limit) {
    limit = limit || 10;
    const key    = 'fda_calendar';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    let xml = '';
    let usedFallback = false;

    // Primary: advisory committee meetings RSS; fallback: drug news RSS
    try {
      const w = await _proxy(ENDPOINTS.fdaAdcomRSS, 15000);
      xml = w.contents || '';
    } catch (_) {
      try {
        const w = await _proxy(ENDPOINTS.fdaDrugRSS, 15000);
        xml = w.contents || '';
        usedFallback = true;
      } catch (_2) {
        throw new Error('FDA RSS unavailable');
      }
    }

    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    const items  = Array.from(doc.querySelectorAll('item'));

    const events = items.map(function(item) {
      const title   = (item.querySelector('title')?.textContent || '').trim();
      const pubDate = (item.querySelector('pubDate')?.textContent || '').trim();
      const link    = (item.querySelector('link')?.textContent || '').trim();
      const desc    = item.querySelector('description')?.textContent || '';

      // Adcom titles often begin "Month DD, YYYY: Committee..."
      const dateMatch = title.match(/^([A-Za-z]+ \d{1,2},?\s*\d{4})\s*[:–\-]/);
      let eventDate  = '';
      let eventTitle = title;

      if (dateMatch) {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed)) {
          eventDate  = parsed.toISOString().split('T')[0];
          eventTitle = title.slice(dateMatch[0].length).trim();
        }
      }
      if (!eventDate && pubDate) {
        const parsed = new Date(pubDate);
        if (!isNaN(parsed)) eventDate = parsed.toISOString().split('T')[0];
      }

      return {
        drug:      truncate(eventTitle || title, 65),
        company:   usedFallback ? 'FDA Drug News' : 'FDA Advisory Committee',
        eventType: usedFallback ? 'News'           : 'AdComm',
        date:      eventDate,
        event:     truncate(stripHtml(desc), 120),
        url:       link,
      };
    }).filter(function(e) { return !!e.date; });

    _set(key, events);
    return events.slice(0, limit);
  }

  /* ── M&A Deals: SEC 8-K + NewsAPI ───────────────────────────── */

  async function loadMADeals(limit) {
    limit = limit || 6;
    const key    = 'ma_deals';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const maQuery = 'acquisition OR merger biotech OR pharma OR biopharma';
    const newsUrl = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(maQuery) +
      '&language=en&sortBy=publishedAt&pageSize=10&apiKey=' + NEWS_API_KEY;

    const [secRes, newsRes] = await Promise.allSettled([
      _proxy(ENDPOINTS.secMASearch(), 12000).then(function(w) { return JSON.parse(w.contents || '{}'); }),
      fetch(newsUrl, { signal: AbortSignal.timeout(12000) })
        .then(function(r) { return r.json(); })
        .catch(function() {
          return _proxy(newsUrl).then(function(w) { return JSON.parse(w.contents || '{}'); });
        }),
    ]);

    const deals = [];
    const half  = Math.ceil(limit / 2);

    if (secRes.status === 'fulfilled') {
      const hits = (secRes.value.hits && secRes.value.hits.hits) || [];
      hits.slice(0, half).forEach(function(h) {
        const s      = h._source || {};
        const raw    = (s.display_names && s.display_names[0]) || s.entity_name || 'Unknown Company';
        const name   = raw.replace(/\s*\(CIK[^)]*\)\s*$/, '').replace(/\/[A-Z]{2}\s*$/, '').trim();
        const adsh   = s.adsh || (h._id || '').split(':')[0] || '';
        const cik    = ((s.ciks && s.ciks[0]) || '').replace(/^0+/, '');
        const url    = (cik && adsh)
          ? 'https://www.sec.gov/Archives/edgar/data/' + cik + '/' + adsh.replace(/-/g, '') + '/'
          : 'https://efts.sec.gov/';
        deals.push({
          title:       truncate(name + ' \u2014 8-K Material Event', 70),
          date:        s.file_date || '',
          description: 'Merger / acquisition material event filed with SEC.',
          value:       'SEC filing',
          url,
          source:      'SEC',
        });
      });
    }

    if (newsRes.status === 'fulfilled') {
      const articles = (newsRes.value.articles || []).filter(function(a) {
        return a.title && a.title !== '[Removed]';
      });
      articles.slice(0, half).forEach(function(a) {
        deals.push({
          title:       truncate((a.title || '').replace(/ [-\u2013] [^\-\u2013]{2,60}$/, '').trim(), 70),
          date:        a.publishedAt || '',
          description: truncate(stripHtml(a.description || ''), 120),
          value:       'News',
          url:         a.url || '#',
          source:      (a.source && a.source.name) || 'News',
        });
      });
    }

    deals.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    _set(key, deals.slice(0, limit));
    return deals.slice(0, limit);
  }

  /* ── Funding Rounds: NewsAPI ─────────────────────────────────── */

  async function loadFundingRounds(limit) {
    limit = limit || 6;
    const key    = 'funding_rounds';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const fundingQuery = '"series A" OR "series B" OR "series C" OR "series D" OR "funding round" OR raised biotech OR pharma OR biopharma';
    const apiUrl = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(fundingQuery) +
      '&language=en&sortBy=publishedAt&pageSize=15&apiKey=' + NEWS_API_KEY;

    let data;
    try {
      const r = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
      if (r.ok) data = await r.json();
    } catch (_) {}

    if (!data || data.status !== 'ok') {
      const w = await _proxy(apiUrl);
      data = JSON.parse(w.contents || '{}');
    }

    if (data.status !== 'ok') throw new Error(data.message || 'NewsAPI error');

    const rounds = (data.articles || [])
      .filter(function(a) { return a.title && a.title !== '[Removed]' && a.url; })
      .map(function(a) {
        const text       = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
        const amtMatch   = text.match(/\$([\d.]+)\s*(m|b|million|billion)/i);
        const roundMatch = text.match(/series ([a-e])/i);
        // Heuristic: company name is text before common funding verbs
        const compMatch  = (a.title || '').match(/^([^,]+?)\s+(?:raises?|secures?|closes?|announces?|completes?)/i);
        return {
          company:     truncate(compMatch ? compMatch[1] : ((a.source && a.source.name) || 'Unknown'), 35),
          amount:      amtMatch
            ? '$' + amtMatch[1] + (amtMatch[2][0].toLowerCase() === 'b' ? 'B' : 'M')
            : 'Undisclosed',
          roundType:   roundMatch ? 'Series ' + roundMatch[1].toUpperCase() : 'Funding',
          date:        a.publishedAt || '',
          description: truncate(stripHtml(a.description || ''), 120),
          url:         a.url || '#',
        };
      });

    _set(key, rounds);
    return rounds.slice(0, limit);
  }

  /* ── ChEMBL: Pipeline Tracker (Phase 1–3) ────────────────────── */

async function loadPipeline(limit) {
    limit = limit || 25;
    const key    = 'pipeline';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const res = await fetch(ENDPOINTS.chemblPipeline(Math.min(limit + 25, 80)), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // max_phase_for_ind is a float string e.g. "3.0", "2.0" — parse with parseFloat
    const pipeline = (data.drug_indications || [])
      .filter(function(ind) { return ind.molecule_chembl_id; }) // molecule_name does not exist in this endpoint
      .map(function(ind) {
        const phase    = Math.round(parseFloat(ind.max_phase_for_ind) || 0);
        const chemblId = ind.molecule_chembl_id || '';
        const phaseLabels = { 1: 'Phase 1', 2: 'Phase 2', 3: 'Phase 3' };
        const phaseKeys   = { 1: 'phase1',  2: 'phase2',  3: 'phase3'  };
        return {
          company:    '\u2014',
          drug:       chemblId,                                       // best identifier available without secondary lookup
          indication: truncate((ind.efo_term || ind.mesh_heading || '\u2014'), 45),
          stage:      phaseLabels[phase] || ('Phase ' + phase),
          stageKey:   phaseKeys[phase]   || ('phase' + phase),
          moa:        '\u2014',
          partners:   '\u2014',
          newsUrl:    chemblId ? ENDPOINTS.chemblCompound(chemblId) : '#',
        };
      });

    _set(key, pipeline);
    return pipeline.slice(0, limit);
  }

  /* ── ChEMBL: Drug Database (Approved, Phase 4) ───────────────── */

  // ATC first letter → therapeutic area
  function _chemblCategoryFromATC(codes) {
    if (!codes || !codes.length) return 'Other';
    const map = { L: 'Oncology', N: 'Neurology', C: 'Cardiology', M: 'Immunology', J: 'Infectious Disease', R: 'Respiratory', A: 'Gastroenterology' };
    return map[(codes[0] || '').charAt(0).toUpperCase()] || 'Other';
  }

  async function loadDrugs(limit) {
    limit = limit || 9;
    const key    = 'drugs';
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    // Use /molecule endpoint — has pref_name, max_phase, first_approval, atc_classifications
    const res = await fetch(ENDPOINTS.chemblDrugs(Math.min(limit + 10, 40)), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const drugs = (data.molecules || [])
      .filter(function(m) { return m.pref_name && m.therapeutic_flag; })
      .map(function(m) {
        const chemblId = m.molecule_chembl_id || '';
        const atcCodes = m.atc_classifications || [];
        const description = m.usan_stem_definition
          ? m.usan_stem_definition.charAt(0).toUpperCase() + m.usan_stem_definition.slice(1)
          : 'Approved ' + (m.molecule_type || 'drug').toLowerCase();
        return {
          name:          m.pref_name,
          company:       'See ChEMBL',
          category:      _chemblCategoryFromATC(atcCodes),
          status:        'Approved',
          description:   truncate(description, 120),
          firstApproval: m.first_approval || '',
          url:           chemblId ? ENDPOINTS.chemblCompound(chemblId) : '#',
        };
      });

    _set(key, drugs);
    return drugs.slice(0, limit);
  }

  /* ── API Status Bar ─────────────────────────────────────────── */

  function initStatusBar(indicators) {
    var bar = document.getElementById('api-status-bar');
    if (!bar) return;
    bar.className = 'api-status-bar';
    bar.innerHTML =
      '<div class="container api-status-inner">' +
        '<span class="api-status-label">API Status</span>' +
        indicators.map(function(ind) {
          return '<span class="api-ind ' + (ind.idle ? 'idle' : 'loading') + '" id="api-ind-' + ind.id + '" title="' + ind.label + '">' +
            '<span class="api-dot"></span>' +
            '<span>' + ind.label + '</span>' +
            '</span>';
        }).join('') +
      '</div>';
  }

  function setAPIStatus(id, state) {
    var node = document.getElementById('api-ind-' + id);
    if (node) node.className = 'api-ind ' + (state || 'loading');
  }

  /* ── Export ──────────────────────────────────────────────────── */
  window.BioSignal = {
    loadNews, loadFDA, loadPubMed, loadTrials, loadSEC, clearCache,
    loadPipeline, loadMarketStats, loadFundingRounds, loadIPOs, loadMADeals, loadFDACalendar, loadDrugs,
    loadStockQuotes,
    formatDate, truncate, stripHtml, relativeTime,
    phaseClass, phaseLabel, trialStatusClass, trialStatusLabel,
    initStatusBar, setAPIStatus,
    ENDPOINTS,
  };

})();