/* ======================================================
   BioSignal — Shared Data Module  (biosignal-data.js)
   Sources: NewsAPI · OpenFDA · PubMed/NCBI · ClinicalTrials.gov · SEC EDGAR
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

  /* ── NewsAPI Config ─────────────────────────────────────────── */
  const NEWS_API_KEY = 'b386f6a037d44e919e9b08b9e5131f14';
  const NEWS_QUERY   = 'biotech OR "FDA approval" OR pharmaceutical OR "clinical trials" OR "life sciences" OR "drug development"';

  /* ── API Endpoints ──────────────────────────────────────────── */
  const ENDPOINTS = {

    fdaApprovals: 'https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status:AP&sort=submissions.submission_status_date:desc&limit=15',
    fdaRecalls:   'https://api.fda.gov/drug/enforcement.json?search=status:Ongoing&sort=recall_initiation_date:desc&limit=15',
    fdaEvents:    'https://api.fda.gov/drug/event.json?sort=receiptdate:desc&limit=15',

    pubmedSearch:   (t)   => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(t)}&sort=pub+date&retmode=json&retmax=15&tool=biosignal&email=data@biosignal.io`,
    pubmedSummary:  (ids) => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json&tool=biosignal&email=data@biosignal.io`,
    pubmedAbstract: (id)  => `https://pubmed.ncbi.nlm.nih.gov/${id}/`,

    trials: (q, st, n) => `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(q)}&filter.overallStatus=${encodeURIComponent(st)}&sort=LastUpdatePostDate:desc&pageSize=${n || 15}`,

    // SEC EDGAR Full-Text Search — free, public, CORS-enabled
    secSearch: (forms, days) => {
      const since = new Date(Date.now() - (days || 90) * 86400000).toISOString().split('T')[0];
      return `https://efts.sec.gov/LATEST/search-index?q=%22pharmaceutical%22+OR+%22biotech%22+OR+%22biopharma%22&forms=${encodeURIComponent(forms || 'S-1,8-K,10-K,10-Q')}&dateRange=custom&startdt=${since}`;
    },

    // ⚠️ REQUIRES FREE API KEY — set one of these when ready:
    // market: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=XBI&apikey=YOUR_KEY`
    // market: `https://finnhub.io/api/v1/quote?symbol=XBI&token=YOUR_KEY`
    market: null,
  };

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
    return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
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

  /* ── NewsAPI ─────────────────────────────────────────────────── */

  async function loadNews(limit) {
    limit = limit || 20;
    const cached = _get('news');
    if (cached) return cached.slice(0, limit);

    const apiUrl = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(NEWS_QUERY) +
      '&language=en&sortBy=publishedAt&pageSize=40&apiKey=' + NEWS_API_KEY;

    let data;

    // Direct call — works when served from localhost or a web server
    try {
      const r = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
      if (r.ok) data = await r.json();
    } catch (_) {}

    // CORS proxy fallback — works when opened from file:// or any other origin
    if (!data || data.status !== 'ok') {
      const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(apiUrl);
      const r2 = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (!r2.ok) throw new Error('HTTP ' + r2.status);
      const wrapper = await r2.json();
      data = JSON.parse(wrapper.contents || '{}');
    }

    if (data.status !== 'ok') throw new Error(data.message || 'NewsAPI error');

    const items = (data.articles || [])
      .filter(function(a) { return a.title && a.title !== '[Removed]' && a.url; })
      .map(function(a) {
        // NewsAPI appends " - Source Name" to titles — strip it
        const title = (a.title || '').replace(/ [-–] [^-–]{2,60}$/, '').trim();
        return {
          title,
          link:    a.url,
          pubDate: a.publishedAt || '',
          summary: truncate(stripHtml(a.description || ''), 220),
          image:   a.urlToImage  || null,
          source:  (a.source && a.source.name) || 'Unknown',
          author:  a.author || '',
          date:    a.publishedAt ? new Date(a.publishedAt) : new Date(0),
        };
      });

    _set('news', items);
    return items.slice(0, limit);
  }

  /* ── OpenFDA ─────────────────────────────────────────────────── */

  async function loadFDA(tab, limit) {
    tab   = tab   || 'approvals';
    limit = limit || 9;
    const key    = 'fda_' + tab;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const urls = {
      approvals: ENDPOINTS.fdaApprovals,
      recalls:   ENDPOINTS.fdaRecalls,
      events:    ENDPOINTS.fdaEvents,
    };
    const res  = await fetch(urls[tab]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out  = data.results || [];
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

  async function loadTrials(query, status, limit) {
    query  = query  || 'biotech OR gene therapy OR oncology OR CRISPR';
    status = status || 'RECRUITING,ACTIVE_NOT_RECRUITING';
    limit  = limit  || 9;
    const key    = 'tr_' + query + '_' + status;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const res  = await fetch(ENDPOINTS.trials(query, status, limit));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out  = data.studies || [];
    _set(key, out);
    return out.slice(0, limit);
  }

  /* ── SEC EDGAR ───────────────────────────────────────────────── */

  function _secFlag(ft) {
    var labels = { 'S-1': 'IPO Filing', 'S-1/A': 'IPO Amendment', '10-K': 'Annual Report', '10-Q': 'Quarterly Report', '8-K': 'Material Event' };
    var classes = { 'S-1': 'sec-ipo', 'S-1/A': 'sec-ipo', '10-K': 'sec-annual', '10-Q': 'sec-quarterly', '8-K': 'sec-event' };
    return { label: labels[ft] || ft, cls: classes[ft] || 'sec-other' };
  }

  async function loadSEC(forms, limit) {
    forms = forms || 'S-1,8-K,10-K,10-Q';
    limit = limit || 15;
    const key    = 'sec_' + forms;
    const cached = _get(key);
    if (cached) return cached.slice(0, limit);

    const res  = await fetch(ENDPOINTS.secSearch(forms));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const hits = (data.hits && data.hits.hits) || [];

    const filings = hits.map(function(h) {
      const s    = h._source || {};
      const pts  = (h._id || '').replace('edgar/data/', '').split('/');
      const cik  = pts[0] || '';
      const acc  = (pts[1] || '').replace('.txt', '');
      const url  = (cik && acc)
        ? 'https://www.sec.gov/Archives/edgar/data/' + cik + '/' + acc.replace(/-/g, '') + '/'
        : 'https://efts.sec.gov/LATEST/search-index?q=%22biotech%22&forms=' + encodeURIComponent(forms);
      return {
        company:  s.entity_name || 'Unknown',
        formType: s.form_type   || '',
        fileDate: s.file_date   || '',
        period:   s.period_of_report || '',
        cik, accession: acc, url,
        flag:     _secFlag(s.form_type || ''),
        isMajor:  s.form_type === 'S-1' || s.form_type === 'S-1/A',
      };
    });

    _set(key, filings);
    return filings.slice(0, limit);
  }

  /* ── Market Data (Placeholder) ──────────────────────────────── */

  function getMarketData() {
    return {
      isPlaceholder: true,
      // ⚠️ TO ENABLE: Set ENDPOINTS.market above with your Alpha Vantage or Finnhub key
      setupNote: 'Get a free key at alphavantage.co or finnhub.io, then set ENDPOINTS.market in biosignal-data.js',
      etfs: [
        { ticker: 'XBI',  name: 'SPDR S&P Biotech ETF',        price: null, change: null, range52w: '$64 – $102' },
        { ticker: 'IBB',  name: 'iShares Nasdaq Biotech ETF',   price: null, change: null, range52w: '$128 – $181' },
        { ticker: 'NBI',  name: 'NASDAQ Biotech Index',         price: null, change: null, range52w: '3,420 – 4,870' },
        { ticker: 'LABU', name: 'Direxion Biotech Bull 3×',     price: null, change: null, range52w: '$14 – $48' },
        { ticker: 'GNOM', name: 'Global X Genomics & Biotech',  price: null, change: null, range52w: '$10 – $18' },
        { ticker: 'ARKG', name: 'ARK Genomic Revolution ETF',   price: null, change: null, range52w: '$12 – $22' },
      ],
    };
  }

  /* ── Export ──────────────────────────────────────────────────── */
  window.BioSignal = {
    loadNews, loadFDA, loadPubMed, loadTrials, loadSEC, getMarketData, clearCache,
    formatDate, truncate, stripHtml, relativeTime,
    phaseClass, phaseLabel, trialStatusClass, trialStatusLabel,
    ENDPOINTS,
  };

})();
