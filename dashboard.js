/* =============================================
   BioSignal — Dashboard JS  (dashboard.js)
   Requires: biosignal-data.js  (window.BioSignal)
   Sections: RSS · OpenFDA · PubMed · ClinicalTrials · SEC EDGAR · Market
   ============================================= */
'use strict';

const BS = window.BioSignal;

// ── State ──────────────────────────────────────────────────────
const state = {
  fda:    { tab: 'approvals' },
  pubmed: { topic: 'biotech life sciences gene therapy' },
  trials: { query: 'biotech OR gene therapy OR oncology OR CRISPR', status: 'RECRUITING,ACTIVE_NOT_RECRUITING' },
  news:   { topic: 'all' },
  sec:    { forms: 'S-1,8-K,10-K,10-Q' },
  search: { active: false },
};

// ── DOM shortcuts ──────────────────────────────────────────────
const $ = function(id) { return document.getElementById(id); };

// ── Utilities ──────────────────────────────────────────────────
function setApiStatus(api, status) {
  const el = $('status-' + api);
  if (!el) return;
  el.querySelector('.status-dot').className = 'status-dot dot-' + status;
}

function updateLastUpdated() {
  const el = $('last-updated');
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function skeletons(n) {
  n = n || 9;
  return Array.from({ length: n }, function() {
    return '<div class="skeleton-card"><div class="skel skel-sm"></div><div class="skel skel-md"></div><div class="skel skel-lg"></div><div class="skel skel-p"></div><div class="skel skel-p2"></div><div class="skel skel-p3"></div></div>';
  }).join('');
}

function errorState(message, retryFn) {
  return '<div class="error-state"><div class="error-icon">⚠️</div><h4>Could not load data</h4><p>' + message + '</p><button class="retry-btn" onclick="(' + retryFn.toString() + ')()">↻ Retry</button></div>';
}

// ══════════════════════════════════════════════════════════════
//   SECTION 1 — NewsAPI News Timeline
// ══════════════════════════════════════════════════════════════

const rssGrid = $('rss-grid');

// topic keyword → filter articles whose title or summary includes it
const NEWS_TOPICS = { biotech: 'biotech', fda: 'fda', pharma: 'pharma', trials: 'trial' };

async function loadRSSSection(topic) {
  topic = topic || 'all';
  state.news.topic = topic;
  if (!rssGrid) return;
  rssGrid.innerHTML = skeletons(9);
  setApiStatus('rss', 'loading');

  try {
    const all   = await BS.loadNews(60);
    const kw    = NEWS_TOPICS[topic];
    const items = (kw
      ? all.filter(function(it) {
          var hay = (it.title + ' ' + it.summary).toLowerCase();
          return hay.includes(kw);
        })
      : all
    ).slice(0, 9);
    renderNews(items);
    setApiStatus('rss', 'ok');
  } catch (err) {
    rssGrid.innerHTML = errorState('News unavailable: ' + err.message, function() { loadRSSSection(topic); });
    setApiStatus('rss', 'error');
  }
}

function renderNews(items) {
  if (!items.length) {
    rssGrid.innerHTML = '<div class="empty-state">No headlines available for this topic right now.</div>';
    return;
  }
  rssGrid.innerHTML = items.map(function(it) {
    return '<div class="data-card card-rss">' +
      (it.image ? '<img src="' + it.image + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:100%;height:150px;object-fit:cover;border-radius:6px;margin-bottom:10px;display:block;">' : '') +
      '<div class="data-card-source"><span>' + it.source + '</span><span class="date">' + BS.relativeTime(it.pubDate) + '</span></div>' +
      '<h3>' + BS.truncate(it.title, 110) + '</h3>' +
      (it.summary ? '<p>' + BS.truncate(it.summary, 160) + '</p>' : '') +
      '<a class="data-card-link" href="' + it.link + '" target="_blank" rel="noopener">Read full article ↗</a>' +
      '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//   SECTION 2 — OpenFDA
// ══════════════════════════════════════════════════════════════

const fdaGrid = $('fda-grid');

async function loadFDA(tab) {
  state.fda.tab = tab;
  if (!fdaGrid) return;
  fdaGrid.innerHTML = skeletons(9);
  fdaGrid.style.display = 'grid';
  setApiStatus('fda', 'loading');

  try {
    const results = await BS.loadFDA(tab, 9);
    renderFDA(results, tab);
    setApiStatus('fda', 'ok');
  } catch (err) {
    fdaGrid.innerHTML = errorState('OpenFDA error: ' + err.message, function() { loadFDA(tab); });
    setApiStatus('fda', 'error');
  }
}

function renderFDA(results, tab) {
  if (!results.length) {
    fdaGrid.innerHTML = '<div class="empty-state">No results returned from OpenFDA.</div>';
    return;
  }

  var html = '';

  if (tab === 'approvals') {
    html = results.map(function(r) {
      var brand   = (r.openfda && r.openfda.brand_name && r.openfda.brand_name[0]) || (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || 'Unknown Drug';
      var generic = (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || '';
      var sponsor = r.sponsor_name || (r.openfda && r.openfda.manufacturer_name && r.openfda.manufacturer_name[0]) || '';
      var appNum  = r.application_number || '';
      var sub     = ((r.submissions || []).find(function(s) { return s.submission_status === 'AP'; }) || (r.submissions || [])[0] || {});
      var date    = BS.formatDate(sub.submission_status_date);
      var type    = sub.submission_class_code_description || sub.submission_type || '';
      return '<div class="data-card card-approval">' +
        '<div class="data-card-source"><span>Drug Approval</span><span class="cat-badge regulatory" style="font-size:.62rem;">' + appNum + '</span></div>' +
        '<h3>' + brand + '</h3>' +
        (generic && generic !== brand ? '<p style="color:var(--text-dark);font-size:.78rem;margin-bottom:0;">' + generic + '</p>' : '') +
        '<p>' + (type || 'FDA Approved Drug Application') + '</p>' +
        '<div class="data-card-meta">' +
          (sponsor ? '<span class="cat-badge funding" style="font-size:.62rem;">' + BS.truncate(sponsor, 40) + '</span>' : '') +
          (date ? '<span class="date">' + date + '</span>' : '') +
        '</div>' +
        '<a class="data-card-link" href="https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' + appNum.replace(/\D/g, '') + '" target="_blank" rel="noopener">View on FDA ↗</a>' +
        '</div>';
    }).join('');

  } else if (tab === 'recalls') {
    html = results.map(function(r) {
      var cls    = r.classification || '';
      var clsCls = (cls.includes('I') && !cls.includes('II')) ? 'class-i' : (cls.includes('II') && !cls.includes('III')) ? 'class-ii' : 'class-iii';
      return '<div class="data-card card-recall">' +
        '<div class="data-card-source"><span>Safety Recall</span><span class="' + clsCls + '" style="font-size:.72rem;">' + cls + '</span></div>' +
        '<h3>' + BS.truncate(r.product_description || 'Unnamed product', 100) + '</h3>' +
        '<p>' + BS.truncate(r.reason_for_recall || '', 160) + '</p>' +
        '<div class="data-card-meta">' +
          (r.recalling_firm ? '<span class="cat-badge oncology" style="font-size:.62rem;">' + BS.truncate(r.recalling_firm, 35) + '</span>' : '') +
          '<span class="date">' + BS.formatDate(r.recall_initiation_date) + '</span>' +
        '</div>' +
        '<a class="data-card-link" href="https://www.accessdata.fda.gov/scripts/ires/index.cfm" target="_blank" rel="noopener">View FDA Recalls ↗</a>' +
        '</div>';
    }).join('');

  } else if (tab === 'events') {
    html = results.map(function(r) {
      var drugs     = ((r.patient && r.patient.drug) || []).slice(0, 2).map(function(d) { return d.medicinalproduct || (d.openfda && d.openfda.brand_name && d.openfda.brand_name[0]) || 'Unknown'; }).filter(Boolean);
      var reactions = ((r.patient && r.patient.reaction) || []).slice(0, 3).map(function(rx) { return rx.reactionmeddrapt || ''; }).filter(Boolean);
      var serious   = r.serious === '1' || r.serious === 1;
      return '<div class="data-card card-event">' +
        '<div class="data-card-source"><span>Adverse Event</span>' +
          (serious ? '<span style="color:var(--negative);font-size:.7rem;font-weight:700;">SERIOUS</span>' : '<span style="color:var(--text-dark);font-size:.7rem;">Non-serious</span>') +
        '</div>' +
        '<h3>' + (drugs.length ? drugs.join(' / ') : 'Drug not specified') + '</h3>' +
        (reactions.length ? '<p>Reported: ' + reactions.join(', ') + '</p>' : '<p>No reaction terms recorded.</p>') +
        '<div class="data-card-meta">' +
          '<span class="date">' + BS.formatDate(r.receiptdate) + '</span>' +
          (r.primarysource && r.primarysource.reportercountry ? '<span class="cat-badge" style="font-size:.62rem;background:var(--bg-card2);color:var(--text-muted);">' + r.primarysource.reportercountry + '</span>' : '') +
        '</div>' +
        '<a class="data-card-link" href="https://www.fda.gov/drugs/questions-and-answers-fdas-adverse-event-reporting-system-faers" target="_blank" rel="noopener">About FAERS ↗</a>' +
        '</div>';
    }).join('');
  }

  fdaGrid.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//   SECTION 3 — PubMed / NCBI
// ══════════════════════════════════════════════════════════════

const pubmedGrid = $('pubmed-grid');

async function loadPubMed(topic) {
  state.pubmed.topic = topic;
  if (!pubmedGrid) return;
  pubmedGrid.innerHTML = skeletons(9);
  setApiStatus('pubmed', 'loading');

  try {
    const articles = await BS.loadPubMed(topic, 9);
    if (!articles.length) {
      pubmedGrid.innerHTML = '<div class="empty-state">No articles found for this topic.</div>';
      setApiStatus('pubmed', 'warn');
      return;
    }
    renderPubMed(articles);
    setApiStatus('pubmed', 'ok');
  } catch (err) {
    pubmedGrid.innerHTML = errorState('PubMed error: ' + err.message, function() { loadPubMed(topic); });
    setApiStatus('pubmed', 'error');
  }
}

function renderPubMed(articles) {
  pubmedGrid.innerHTML = articles.map(function(a) {
    var authors = (a.authors || []).slice(0, 3).map(function(au) { return au.name; }).join(', ');
    return '<div class="data-card card-pubmed">' +
      '<div class="data-card-source"><span>' + (a.source || '') + '</span><span class="cat-badge publications" style="font-size:.62rem;">PubMed</span></div>' +
      '<h3>' + BS.truncate(a.title || '', 120) + '</h3>' +
      (authors ? '<p style="color:var(--text-dark);font-size:.75rem;">' + authors + ((a.authors || []).length > 3 ? ' et al.' : '') + '</p>' : '') +
      '<div class="data-card-meta">' +
        '<span class="date">' + (a.pubdate || '') + '</span>' +
        (a.pubtype && a.pubtype.length ? '<span class="cat-badge" style="font-size:.62rem;background:rgba(232,121,249,.1);color:var(--publications);">' + a.pubtype[0] + '</span>' : '') +
      '</div>' +
      '<a class="data-card-link" href="' + BS.ENDPOINTS.pubmedAbstract(a.uid) + '" target="_blank" rel="noopener">Read on PubMed ↗</a>' +
      '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//   SECTION 4 — ClinicalTrials.gov
// ══════════════════════════════════════════════════════════════

const trialsGrid = $('trials-grid');

async function loadTrials(query, status) {
  state.trials.query  = query;
  state.trials.status = status;
  if (!trialsGrid) return;
  trialsGrid.innerHTML = '<div class="ds-grid">' + skeletons(6) + '</div>';
  setApiStatus('trials', 'loading');

  try {
    const studies = await BS.loadTrials(query, status, 9);
    renderTrials(studies);
    setApiStatus('trials', 'ok');
  } catch (err) {
    trialsGrid.innerHTML = '<div class="ds-grid">' + errorState('ClinicalTrials error: ' + err.message, function() { loadTrials(query, status); }) + '</div>';
    setApiStatus('trials', 'error');
  }
}

function renderTrials(studies) {
  if (!studies.length) {
    trialsGrid.innerHTML = '<div class="empty-state">No trials found for this filter.</div>';
    return;
  }
  var rows = studies.map(function(s) {
    var p       = s.protocolSection || {};
    var id      = p.identificationModule || {};
    var status  = p.statusModule || {};
    var design  = p.designModule || {};
    var sponsor = p.sponsorCollaboratorsModule || {};
    var conds   = p.conditionsModule || {};
    var desc    = p.descriptionModule || {};
    var nctId      = id.nctId || '';
    var phases     = design.phases || [];
    var conditions = (conds.conditions || []).slice(0, 3).join(', ');
    var summary    = BS.truncate(desc.briefSummary || '', 200);
    var startDate  = (status.startDateStruct && status.startDateStruct.date) || '';
    var leadSponsor = (sponsor.leadSponsor && sponsor.leadSponsor.name) || '';
    return '<div class="trial-row">' +
      '<div class="trial-row-left">' +
        '<div class="trial-row-meta">' +
          '<span class="phase-tag ' + BS.phaseClass(phases) + '">' + BS.phaseLabel(phases) + '</span>' +
          '<span class="trial-status-tag ' + BS.trialStatusClass(status.overallStatus) + '">' + BS.trialStatusLabel(status.overallStatus) + '</span>' +
          (conditions ? '<span style="font-size:.75rem;color:var(--text-muted);">' + conditions + '</span>' : '') +
        '</div>' +
        '<h3>' + BS.truncate(id.briefTitle || '', 140) + '</h3>' +
        (summary ? '<p>' + summary + '</p>' : '') +
        '<div class="trial-row-meta" style="margin-top:4px;">' +
          (leadSponsor ? '<span class="cat-badge funding" style="font-size:.62rem;">' + BS.truncate(leadSponsor, 40) + '</span>' : '') +
          (startDate ? '<span class="date">Started ' + startDate + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="trial-row-right">' +
        '<span class="nct-id">' + nctId + '</span>' +
        '<a class="data-card-link" href="https://clinicaltrials.gov/study/' + nctId + '" target="_blank" rel="noopener" style="font-size:.75rem;">View Trial ↗</a>' +
      '</div>' +
    '</div>';
  }).join('');
  trialsGrid.innerHTML = '<div class="trials-list">' + rows + '</div>';
}

// ══════════════════════════════════════════════════════════════
//   SECTION 5 — SEC EDGAR
// ══════════════════════════════════════════════════════════════

const secGrid = $('sec-grid');

var SEC_BADGE = {
  'sec-ipo':       'funding',
  'sec-event':     'trials',
  'sec-annual':    'regulatory',
  'sec-quarterly': 'genomics',
  'sec-other':     'cns',
};

async function loadSECSection(forms) {
  if (forms) state.sec.forms = forms;
  if (!secGrid) return;
  secGrid.innerHTML = skeletons(9);
  setApiStatus('sec', 'loading');

  try {
    const filings = await BS.loadSEC(state.sec.forms, 9);
    renderSEC(filings);
    setApiStatus('sec', 'ok');
  } catch (err) {
    secGrid.innerHTML = errorState('SEC EDGAR error: ' + err.message, function() { loadSECSection(); });
    setApiStatus('sec', 'error');
  }
}

function renderSEC(filings) {
  if (!filings.length) {
    secGrid.innerHTML = '<div class="empty-state">No recent biotech/pharma SEC filings found.</div>';
    return;
  }
  secGrid.innerHTML = filings.map(function(f) {
    var bCls = SEC_BADGE[f.flag.cls] || 'cns';
    return '<div class="data-card card-sec' + (f.isMajor ? ' card-major' : '') + '">' +
      '<div class="data-card-source">' +
        '<span>' + f.formType + '</span>' +
        (f.isMajor ? '<span style="color:var(--accent);font-size:.65rem;font-weight:700;">★ MAJOR</span>' : '') +
      '</div>' +
      '<h3>' + BS.truncate(f.company, 60) + '</h3>' +
      '<p>' + f.flag.label + (f.period ? ' &middot; Period: ' + BS.formatDate(f.period) : '') + '</p>' +
      '<div class="data-card-meta">' +
        '<span class="cat-badge ' + bCls + '" style="font-size:.62rem;">' + f.flag.label + '</span>' +
        (f.fileDate ? '<span class="date">' + BS.formatDate(f.fileDate) + '</span>' : '') +
      '</div>' +
      '<a class="data-card-link" href="' + f.url + '" target="_blank" rel="noopener">View on EDGAR ↗</a>' +
      '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//   SECTION 6 — Market Overview (Placeholder)
// ══════════════════════════════════════════════════════════════

function renderMarket() {
  const grid = $('market-grid');
  if (!grid) return;
  const mkt = BS.getMarketData();
  grid.innerHTML = mkt.etfs.map(function(e) {
    return '<div class="placeholder-tile">' +
      '<span class="ph-label">' + e.ticker + '</span>' +
      '<span class="ph-value">— —</span>' +
      '<span style="font-size:.72rem;color:var(--text-dark);display:block;margin-top:2px;">' + e.name + '</span>' +
      '<span style="font-size:.68rem;color:var(--text-dark);">52W: ' + e.range52w + '</span>' +
      '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//   UNIFIED SEARCH
// ══════════════════════════════════════════════════════════════

const searchPanel = $('search-panel');
const searchInput = $('global-search');

async function searchAll(query) {
  if (!query.trim()) return;
  state.search.active = true;

  searchPanel.classList.remove('hidden');
  $('search-query-display').textContent = query;

  // Show loading in all panes
  ['sr-rss', 'sr-fda', 'sr-pubmed', 'sr-trials'].forEach(function(id) {
    var el = $(id);
    if (el) el.innerHTML = '<div class="ds-grid">' + skeletons(3) + '</div>';
    var cnt = $(id + '-count');
    if (cnt) cnt.textContent = '…';
  });

  var q = query.toLowerCase();

  // News: local filter on already-cached articles (no extra fetch needed)
  var rssPromise = BS.loadNews(60).then(function(all) {
    var items = all.filter(function(it) {
      return it.title.toLowerCase().includes(q) || it.summary.toLowerCase().includes(q);
    }).slice(0, 6);
    $('sr-rss-count').textContent = items.length;
    $('sr-rss').innerHTML = items.length
      ? '<div class="ds-grid">' + items.map(function(it) {
          return '<div class="data-card card-rss">' +
            (it.image ? '<img src="' + it.image + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">' : '') +
            '<div class="data-card-source"><span>' + it.source + '</span><span class="date">' + BS.relativeTime(it.pubDate) + '</span></div>' +
            '<h3>' + BS.truncate(it.title, 100) + '</h3>' +
            '<a class="data-card-link" href="' + it.link + '" target="_blank" rel="noopener">Read ↗</a>' +
            '</div>';
        }).join('') + '</div>'
      : '<div class="empty-state">No news matches.</div>';
  }).catch(function() {
    $('sr-rss').innerHTML = '<div class="empty-state">News search failed.</div>';
  });

  var enc = encodeURIComponent(query);
  var [fdaR, pmR, trR] = await Promise.allSettled([
    fetch('https://api.fda.gov/drug/drugsfda.json?search=openfda.brand_name:' + enc + '+openfda.generic_name:' + enc + '&limit=6').then(function(r) { return r.json(); }),
    (async function() {
      var s   = await fetch(BS.ENDPOINTS.pubmedSearch(query)).then(function(r) { return r.json(); });
      var ids = (s.esearchresult && s.esearchresult.idlist) || [];
      if (!ids.length) return { articles: [] };
      var sm  = await fetch(BS.ENDPOINTS.pubmedSummary(ids.slice(0, 6).join(','))).then(function(r) { return r.json(); });
      return { articles: ids.map(function(id) { return sm.result && sm.result[id]; }).filter(Boolean) };
    })(),
    fetch(BS.ENDPOINTS.trials(query, 'RECRUITING,ACTIVE_NOT_RECRUITING,COMPLETED', 6)).then(function(r) { return r.json(); }),
  ]);

  await rssPromise;

  // FDA results
  var fdaResults = (fdaR.status === 'fulfilled' && fdaR.value.results) || [];
  $('sr-fda-count').textContent = fdaResults.length;
  $('sr-fda').innerHTML = fdaResults.length
    ? '<div class="ds-grid">' + fdaResults.slice(0, 6).map(function(r) {
        var brand = (r.openfda && r.openfda.brand_name && r.openfda.brand_name[0]) || (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || 'Unknown';
        return '<div class="data-card card-approval"><div class="data-card-source"><span>Drug Application</span></div><h3>' + brand + '</h3>' +
          (r.sponsor_name ? '<p>' + BS.truncate(r.sponsor_name, 60) + '</p>' : '') +
          '<a class="data-card-link" href="https://www.accessdata.fda.gov/scripts/cder/daf/" target="_blank" rel="noopener">FDA Database ↗</a></div>';
      }).join('') + '</div>'
    : '<div class="empty-state">No FDA records matched.</div>';

  // PubMed results
  var pmArticles = (pmR.status === 'fulfilled' && pmR.value.articles) || [];
  $('sr-pubmed-count').textContent = pmArticles.length;
  $('sr-pubmed').innerHTML = pmArticles.length
    ? '<div class="ds-grid">' + pmArticles.map(function(a) {
        return '<div class="data-card card-pubmed"><div class="data-card-source"><span>' + (a.source || '') + '</span><span class="cat-badge publications" style="font-size:.62rem;">PubMed</span></div>' +
          '<h3>' + BS.truncate(a.title || '', 120) + '</h3>' +
          '<div class="data-card-meta"><span class="date">' + (a.pubdate || '') + '</span></div>' +
          '<a class="data-card-link" href="' + BS.ENDPOINTS.pubmedAbstract(a.uid) + '" target="_blank" rel="noopener">Read ↗</a></div>';
      }).join('') + '</div>'
    : '<div class="empty-state">No PubMed articles matched.</div>';

  // Trials results
  var trStudies = (trR.status === 'fulfilled' && trR.value.studies) || [];
  $('sr-trials-count').textContent = trStudies.length;
  $('sr-trials').innerHTML = trStudies.length
    ? '<div class="ds-grid">' + trStudies.slice(0, 6).map(function(s) {
        var p   = s.protocolSection || {};
        var id  = p.identificationModule || {};
        var st  = p.statusModule || {};
        var d   = p.designModule || {};
        var nct = id.nctId || '';
        return '<div class="data-card card-trial"><div class="data-card-source"><span>' + nct + '</span><span class="phase-tag ' + BS.phaseClass(d.phases || []) + '">' + BS.phaseLabel(d.phases || []) + '</span></div>' +
          '<h3>' + BS.truncate(id.briefTitle || '', 120) + '</h3>' +
          '<div class="data-card-meta"><span class="trial-status-tag ' + BS.trialStatusClass(st.overallStatus || '') + '">' + BS.trialStatusLabel(st.overallStatus || '') + '</span></div>' +
          '<a class="data-card-link" href="https://clinicaltrials.gov/study/' + nct + '" target="_blank" rel="noopener">View Trial ↗</a></div>';
      }).join('') + '</div>'
    : '<div class="empty-state">No trials matched.</div>';
}

function clearSearch() {
  state.search.active = false;
  searchPanel.classList.add('hidden');
  if (searchInput) searchInput.value = '';
  var sc = $('search-clear');
  if (sc) sc.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
//   EVENT LISTENERS
// ══════════════════════════════════════════════════════════════

// News topic pills
document.querySelectorAll('#rss-source-pills .cat-pill').forEach(function(p) {
  p.addEventListener('click', function() {
    document.querySelectorAll('#rss-source-pills .cat-pill').forEach(function(x) { x.classList.remove('active'); });
    p.classList.add('active');
    loadRSSSection(p.dataset.topic);
  });
});

// FDA tabs
document.querySelectorAll('#fda-tabs .ds-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('#fda-tabs .ds-tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    loadFDA(tab.dataset.tab);
  });
});

// PubMed topic pills
document.querySelectorAll('#pubmed-pills .cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('#pubmed-pills .cat-pill').forEach(function(p) { p.classList.remove('active'); });
    pill.classList.add('active');
    loadPubMed(pill.dataset.topic);
  });
});

// Trials filter pills
document.querySelectorAll('#trials-pills .cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('#trials-pills .cat-pill').forEach(function(p) { p.classList.remove('active'); });
    pill.classList.add('active');
    loadTrials(pill.dataset.query, pill.dataset.status);
  });
});

// SEC filing type pills
document.querySelectorAll('#sec-pills .cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('#sec-pills .cat-pill').forEach(function(p) { p.classList.remove('active'); });
    pill.classList.add('active');
    loadSECSection(pill.dataset.forms);
  });
});

// Search input
if (searchInput) {
  var _searchTimer;
  searchInput.addEventListener('input', function() {
    var val = searchInput.value.trim();
    var sc  = $('search-clear');
    if (sc) sc.classList.toggle('hidden', !val);
    clearTimeout(_searchTimer);
    if (!val) { clearSearch(); return; }
    _searchTimer = setTimeout(function() { searchAll(val); }, 600);
  });
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { clearTimeout(_searchTimer); var v = searchInput.value.trim(); if (v) searchAll(v); }
    if (e.key === 'Escape') clearSearch();
  });
}

var searchBtn = $('search-btn');
if (searchBtn) searchBtn.addEventListener('click', function() { var v = searchInput && searchInput.value.trim(); if (v) searchAll(v); });

var searchClear = $('search-clear');
if (searchClear) searchClear.addEventListener('click', clearSearch);

var closeSearch = $('close-search');
if (closeSearch) closeSearch.addEventListener('click', clearSearch);

// Search result tabs
document.querySelectorAll('.search-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.search-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.search-results-pane').forEach(function(p) { p.classList.add('hidden'); });
    tab.classList.add('active');
    var target = document.getElementById(tab.dataset.target);
    if (target) target.classList.remove('hidden');
  });
});

// Refresh button
var refreshBtn = $('refresh-all-btn');
if (refreshBtn) refreshBtn.addEventListener('click', function() {
  BS.clearCache();
  loadAll();
});

// Mobile nav
var navToggle = $('nav-toggle');
var nav       = $('main-nav');
if (navToggle && nav) {
  navToggle.addEventListener('click', function() {
    nav.classList.toggle('open');
    navToggle.innerHTML = nav.classList.contains('open') ? '&times;' : '&#9776;';
  });
}

// ══════════════════════════════════════════════════════════════
//   INIT — load all sections in parallel
// ══════════════════════════════════════════════════════════════

async function loadAll() {
  await Promise.allSettled([
    loadRSSSection(state.news.topic),
    loadFDA(state.fda.tab),
    loadPubMed(state.pubmed.topic),
    loadTrials(state.trials.query, state.trials.status),
    loadSECSection(state.sec.forms),
  ]);
  renderMarket();
  updateLastUpdated();
}

loadAll();
