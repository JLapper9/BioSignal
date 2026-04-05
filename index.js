/* =============================================
   BioSignal — Hub Page Live Data  (index.js)
   Requires: biosignal-data.js  (window.BioSignal)
   Supplements app.js (static UI) with live data
   ============================================= */
'use strict';

(function () {

  var BS = window.BioSignal;
  if (!BS) { console.error('[BioSignal] biosignal-data.js not loaded'); return; }

  /* ── Helpers ──────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function skeletonCards(n) {
    n = n || 3;
    return Array.from({ length: n }, function() {
      return '<div class="skeleton-card" style="animation:pulse 1.5s ease-in-out infinite;">' +
        '<div class="skel skel-sm"></div><div class="skel skel-md"></div>' +
        '<div class="skel skel-lg"></div><div class="skel skel-p"></div>' +
        '</div>';
    }).join('');
  }

  function errorMsg(msg) {
    return '<div class="empty-state" style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-dark);">⚠️ ' + msg + '</div>';
  }

  /* ── Scroll-in animation ──────────────────────────────────── */

  var _animObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); _animObs.unobserve(e.target); }
    });
  }, { threshold: 0.06 });

  function observeNew(container) {
    container.querySelectorAll('.anim-in').forEach(function(el) { _animObs.observe(el); });
  }
  function setPageView(page) {
    var tabs = document.querySelectorAll('.page-tab');
    var panes = document.querySelectorAll('.page-pane');
    tabs.forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.page === page);
    });
    panes.forEach(function(pane) {
      if (page === 'overview') {
        pane.classList.remove('hidden');
      } else {
        pane.classList.toggle('hidden', pane.dataset.page !== page);
      }
    });
    var hash = page === 'overview' ? '#page-tabs' : '#' + page;
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  }

  function initPageTabs() {
    document.querySelectorAll('.page-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        setPageView(tab.dataset.page);
      });
    });

    var hash = location.hash.replace('#', '');
    var pageMap = {
      news: 'news',
      science: 'news',
      fda: 'fda',
      'fda-spotlight': 'fda',
      companies: 'pipeline',
      pipeline: 'pipeline',
      sec: 'sec',
      'sec-activity': 'sec',
      investing: 'investing',
      overview: 'overview',
      'page-tabs': 'news',
    };
    setPageView(pageMap[hash] || 'news');
  }
  /* ── Ticker (live news headlines) ──────────────────────────── */

  async function updateTicker() {
    var track = el('ticker-track');
    if (!track) return;
    try {
      var items = await BS.loadNews(20);
      if (!items.length) return;
      // Duplicate for seamless loop
      var html = items.concat(items).map(function(it) {
        return '<span><a href="' + it.link + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' + it.title + '</a> &nbsp;&bull;&nbsp;</span>';
      }).join('');
      track.innerHTML = html;
    } catch (e) { /* leave static ticker */ }
  }

  /* ── Top Headlines (NewsAPI) ──────────────────────────────── */

  // topic keyword map (mirrors dashboard.js)
  var NEWS_TOPIC_KW = { biotech: 'biotech', fda: 'fda', pharma: 'pharma', trials: 'trial' };

  var _newsAll = [];

  function renderNewsCard(it) {
    var date = BS.relativeTime(it.pubDate);
    return '<article class="news-card anim-in">' +
      (it.image
        ? '<img src="' + it.image + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:100%;height:160px;object-fit:cover;border-radius:8px 8px 0 0;display:block;">'
        : '<div class="card-ph ph-regulatory"></div>') +
      '<div class="card-body">' +
        '<div class="meta"><span class="cat-badge regulatory">' + BS.truncate(it.source, 28) + '</span><span class="date">' + date + '</span></div>' +
        '<h3>' + BS.truncate(it.title, 100) + '</h3>' +
        (it.summary ? '<p>' + BS.truncate(it.summary, 155) + '</p>' : '') +
        '<a href="' + it.link + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
      '</div></article>';
  }

  async function loadRSSSection() {
    var grid = el('hub-rss-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);

    try {
      _newsAll = await BS.loadNews(40);
      var items = _newsAll.slice(0, 6);
      if (!items.length) { grid.innerHTML = errorMsg('News headlines unavailable.'); return; }
      grid.innerHTML = items.map(renderNewsCard).join('');
      observeNew(grid);
      wireNewsPills();
    } catch (e) {
      grid.innerHTML = errorMsg('News unavailable: ' + e.message);
    }
  }

  function wireNewsPills() {
    var pills = document.querySelectorAll('#hub-rss-pills .cat-pill');
    var grid  = el('hub-rss-grid');
    if (!pills.length || !grid) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var topic = pill.dataset.topic;
        var kw    = NEWS_TOPIC_KW[topic];
        var filtered = kw
          ? _newsAll.filter(function(it) { return (it.title + ' ' + it.summary).toLowerCase().includes(kw); }).slice(0, 6)
          : _newsAll.slice(0, 6);
        grid.innerHTML = filtered.length
          ? filtered.map(renderNewsCard).join('')
          : errorMsg('No recent headlines for this topic.');
        observeNew(grid);
      });
    });
  }

  /* ── FDA Spotlight ────────────────────────────────────────── */

  async function loadFDASection(tab) {
    tab = tab || 'approvals';
    var grid = el('hub-fda-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);

    try {
      var results = await BS.loadFDA(tab, 6);
      if (!results.length) { grid.innerHTML = errorMsg('No FDA data available.'); return; }
      grid.innerHTML = results.map(function(r) { return renderFDACard(r, tab); }).join('');
      observeNew(grid);
    } catch (e) {
      grid.innerHTML = errorMsg('FDA data unavailable: ' + e.message);
    }
  }

  function renderFDACard(r, tab) {
    if (tab === 'approvals') {
      var brand   = (r.openfda && r.openfda.brand_name && r.openfda.brand_name[0]) || (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || 'Unknown Drug';
      var generic = (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || '';
      var sponsor = r.sponsor_name || (r.openfda && r.openfda.manufacturer_name && r.openfda.manufacturer_name[0]) || '';
      var appNum  = r.application_number || '';
      var sub     = ((r.submissions || []).find(function(s) { return s.submission_status === 'AP'; }) || (r.submissions || [])[0] || {});
      var date    = BS.formatDate(sub.submission_status_date);
      return '<article class="news-card anim-in">' +
        '<div class="card-ph ph-regulatory"></div>' +
        '<div class="card-body">' +
          '<div class="meta"><span class="cat-badge regulatory">Approval</span><span class="date">' + date + '</span></div>' +
          '<h3>' + brand + '</h3>' +
          (generic && generic !== brand ? '<p style="font-size:.8rem;color:var(--text-dark);">' + generic + '</p>' : '') +
          (sponsor ? '<p>' + BS.truncate(sponsor, 55) + '</p>' : '') +
          '<a href="https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' + appNum.replace(/\D/g, '') + '" target="_blank" rel="noopener" class="read-more">View on FDA &rarr;</a>' +
        '</div></article>';
    } else {
      // recalls
      var cls    = r.classification || '';
      var clsCls = (cls.includes('I') && !cls.includes('II')) ? 'class-i' : 'class-ii';
      return '<article class="news-card anim-in">' +
        '<div class="card-ph ph-oncology"></div>' +
        '<div class="card-body">' +
          '<div class="meta"><span class="' + clsCls + '" style="font-size:.7rem;font-weight:700;">' + cls + '</span><span class="date">' + BS.formatDate(r.recall_initiation_date) + '</span></div>' +
          '<h3>' + BS.truncate(r.product_description || 'Unnamed product', 90) + '</h3>' +
          '<p>' + BS.truncate(r.reason_for_recall || '', 140) + '</p>' +
          '<a href="https://www.accessdata.fda.gov/scripts/ires/" target="_blank" rel="noopener" class="read-more">View Recalls &rarr;</a>' +
        '</div></article>';
    }
  }

  function wireFDAPills() {
    var pills = document.querySelectorAll('#hub-fda-pills .cat-pill');
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        loadFDASection(pill.dataset.fdatab);
      });
    });
  }

  /* ── Clinical Trials Sidebar ──────────────────────────────── */

  async function loadTrialsSection() {
    var list = el('hub-trials-list');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:8px 0;">Loading trials…</div>';

    try {
      var studies = await BS.loadTrials(
        'biotech OR gene therapy OR oncology OR CRISPR OR rare disease',
        'RECRUITING,ACTIVE_NOT_RECRUITING',
        6
      );
      if (!studies.length) { list.innerHTML = '<p style="color:var(--text-dark);font-size:.85rem;">No trials found.</p>'; return; }
      list.innerHTML = studies.map(function(s) {
        var p       = s.protocolSection || {};
        var id      = p.identificationModule || {};
        var status  = p.statusModule || {};
        var design  = p.designModule || {};
        var conds   = p.conditionsModule || {};
        var sponsor = p.sponsorCollaboratorsModule || {};
        var nctId   = id.nctId || '';
        var phases  = design.phases || [];
        var p0      = (phases[0] || '').toLowerCase();
        var phaseCls = p0.includes('3') ? 'phase3' : p0.includes('2') ? 'phase2' : 'phase1';
        var conditions = (conds.conditions || []).slice(0, 2).join(', ');
        var leadSponsor = (sponsor.leadSponsor && sponsor.leadSponsor.name) || '';
        var update  = (status.lastUpdatePostDateStruct && status.lastUpdatePostDateStruct.date) || '';
        return '<div class="trial-entry">' +
          '<div class="trial-header">' +
            '<span class="phase-badge ' + phaseCls + '">' + BS.phaseLabel(phases) + '</span>' +
          '</div>' +
          '<div class="trial-drug">' + BS.truncate(id.briefTitle || nctId, 65) + '</div>' +
          (leadSponsor ? '<div class="trial-company">' + BS.truncate(leadSponsor, 40) + '</div>' : '') +
          (conditions ? '<div class="trial-indication">' + conditions + '</div>' : '') +
          (update ? '<div class="trial-date">Updated ' + BS.formatDate(update) + '</div>' : '') +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<p style="color:var(--text-dark);font-size:.85rem;">Trials unavailable: ' + e.message + '</p>';
    }
  }

  /* ── PubMed Research Strip ────────────────────────────────── */

  async function loadPubMedSection() {
    var strip = el('hub-pubmed-strip');
    if (!strip) return;
    strip.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:8px 0;">Loading research…</div>';

    try {
      var articles = await BS.loadPubMed('biotech life sciences gene therapy oncology CRISPR', 5);
      if (!articles.length) { strip.innerHTML = '<p>No articles available.</p>'; return; }
      strip.innerHTML = articles.map(function(a) {
        var authors = (a.authors || []).slice(0, 2).map(function(au) { return au.name; }).join(', ');
        return '<div class="pub-card anim-in">' +
          '<span class="pub-journal">' + (a.source || '') + '</span>' +
          '<h4>' + BS.truncate(a.title || '', 115) + '</h4>' +
          '<p class="pub-authors">' + (authors || '') + ((a.authors || []).length > 2 ? ' et al.' : '') + (a.pubdate ? ' &middot; ' + a.pubdate : '') + '</p>' +
          '<a href="' + BS.ENDPOINTS.pubmedAbstract(a.uid) + '" target="_blank" rel="noopener" style="font-size:.78rem;color:var(--accent);">Read on PubMed &rarr;</a>' +
          '</div>';
      }).join('');
      observeNew(strip);
    } catch (e) {
      strip.innerHTML = '<p style="color:var(--text-dark);">Research unavailable: ' + e.message + '</p>';
    }
  }

  /* ── SEC Activity ─────────────────────────────────────────── */

  async function loadSECSection() {
    var grid = el('hub-sec-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(4);

    try {
      var filings = await BS.loadSEC('S-1,8-K,10-K,10-Q', 6);
      if (!filings.length) { grid.innerHTML = errorMsg('No recent SEC filings found.'); return; }
      grid.innerHTML = filings.map(function(f) {
        var badgeCls = f.flag.cls === 'sec-ipo' ? 'funding' : f.flag.cls === 'sec-event' ? 'trials' : 'regulatory';
        return '<article class="news-card anim-in"' + (f.isMajor ? ' style="border-left:3px solid var(--accent);"' : '') + '>' +
          '<div class="card-body" style="padding-top:16px;">' +
            '<div class="meta">' +
              '<span class="cat-badge ' + badgeCls + '">' + f.flag.label + '</span>' +
              '<span class="date">' + BS.formatDate(f.fileDate) + '</span>' +
            '</div>' +
            '<h3>' + BS.truncate(f.company, 58) + '</h3>' +
            '<p>Form ' + f.formType + (f.period ? ' &middot; ' + BS.formatDate(f.period) : '') + '</p>' +
            (f.isMajor ? '<p style="color:var(--accent);font-size:.75rem;font-weight:600;margin-top:4px;">&#9733; IPO / Major Filing</p>' : '') +
            '<a href="' + f.url + '" target="_blank" rel="noopener" class="read-more">View on EDGAR &rarr;</a>' +
          '</div></article>';
      }).join('');
      observeNew(grid);
    } catch (e) {
      grid.innerHTML = errorMsg('SEC data unavailable: ' + e.message);
    }
  }

  /* ── Global Search ────────────────────────────────────────── */

  function initSearch() {
    var input   = el('hub-search');
    var btn     = el('hub-search-btn');
    var panel   = el('hub-search-panel');
    var closeBtn = el('hub-search-close');
    var display = el('hub-search-query');
    if (!input) return;

    var _timer;
    input.addEventListener('input', function() {
      var val = input.value.trim();
      clearTimeout(_timer);
      if (!val) { closeSearch(); return; }
      _timer = setTimeout(function() { runSearch(val); }, 500);
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter')  { clearTimeout(_timer); var v = input.value.trim(); if (v) runSearch(v); }
      if (e.key === 'Escape') closeSearch();
    });
    if (btn) btn.addEventListener('click', function() { var v = input.value.trim(); if (v) runSearch(v); });
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    // Tab switching
    document.querySelectorAll('#hub-search-panel .search-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('#hub-search-panel .search-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('#hub-search-panel .search-results-pane').forEach(function(p) { p.classList.add('hidden'); });
        tab.classList.add('active');
        var target = document.getElementById(tab.dataset.target);
        if (target) target.classList.remove('hidden');
      });
    });
  }

  function closeSearch() {
    var panel = el('hub-search-panel');
    var input = el('hub-search');
    if (panel) panel.classList.add('hidden');
    if (input) input.value = '';
  }

  async function runSearch(query) {
    var panel   = el('hub-search-panel');
    var display = el('hub-search-query');
    if (!panel) return;
    panel.classList.remove('hidden');
    if (display) display.textContent = query;

    ['hs-news', 'hs-fda', 'hs-trials'].forEach(function(id) {
      var pane = el(id);
      if (pane) pane.innerHTML = '<div style="padding:12px;color:var(--text-dark);">Searching…</div>';
    });

    var q = query.toLowerCase();

    // News local search
    try {
      var rssItems = (await BS.loadNews(60)).filter(function(it) {
        return it.title.toLowerCase().includes(q) || it.summary.toLowerCase().includes(q);
      }).slice(0, 5);
      var cnt = el('hs-news-count');
      if (cnt) cnt.textContent = rssItems.length;
      var pane = el('hs-news');
      if (pane) pane.innerHTML = rssItems.length
        ? rssItems.map(function(it) {
            return '<div class="search-result-item">' +
              '<span class="cat-badge regulatory" style="font-size:.62rem;">' + BS.truncate(it.source, 28) + '</span>' +
              ' <span class="date" style="margin-left:4px;">' + BS.relativeTime(it.pubDate) + '</span>' +
              '<h4 style="margin:4px 0;font-size:.88rem;">' + BS.truncate(it.title, 100) + '</h4>' +
              '<a href="' + it.link + '" target="_blank" rel="noopener" style="font-size:.75rem;color:var(--accent);">Read article &rarr;</a>' +
              '</div>';
          }).join('')
        : '<div style="padding:12px;color:var(--text-dark);">No news matches.</div>';
    } catch (e) {}

    // FDA + Trials in parallel
    var enc = encodeURIComponent(query);
    Promise.allSettled([
      fetch('https://api.fda.gov/drug/drugsfda.json?search=openfda.brand_name:' + enc + '+openfda.generic_name:' + enc + '&limit=5').then(function(r) { return r.json(); }),
      fetch(BS.ENDPOINTS.trials(query, 'RECRUITING,ACTIVE_NOT_RECRUITING,COMPLETED', 5)).then(function(r) { return r.json(); }),
    ]).then(function(results) {
      var fdaR = results[0], trR = results[1];

      var fdaResults = (fdaR.status === 'fulfilled' && fdaR.value.results) || [];
      var fdaCnt = el('hs-fda-count');
      if (fdaCnt) fdaCnt.textContent = fdaResults.length;
      var fdaPane = el('hs-fda');
      if (fdaPane) fdaPane.innerHTML = fdaResults.length
        ? fdaResults.map(function(r) {
            var brand = (r.openfda && r.openfda.brand_name && r.openfda.brand_name[0]) || (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || 'Unknown';
            return '<div class="search-result-item"><span class="cat-badge regulatory" style="font-size:.62rem;">FDA</span>' +
              '<h4 style="margin:4px 0;font-size:.88rem;">' + brand + '</h4>' +
              (r.sponsor_name ? '<p style="font-size:.78rem;color:var(--text-dark);">' + BS.truncate(r.sponsor_name, 50) + '</p>' : '') +
              '<a href="#fda-spotlight" style="font-size:.75rem;color:var(--accent);">View in Dashboard &rarr;</a>' +
              '</div>';
          }).join('')
        : '<div style="padding:12px;color:var(--text-dark);">No FDA matches.</div>';

      var trStudies = (trR.status === 'fulfilled' && trR.value.studies) || [];
      var trCnt = el('hs-trials-count');
      if (trCnt) trCnt.textContent = trStudies.length;
      var trPane = el('hs-trials');
      if (trPane) trPane.innerHTML = trStudies.length
        ? trStudies.map(function(s) {
            var p   = s.protocolSection || {};
            var id  = p.identificationModule || {};
            var nct = id.nctId || '';
            return '<div class="search-result-item"><span class="cat-badge trials" style="font-size:.62rem;">Trial</span>' +
              '<h4 style="margin:4px 0;font-size:.88rem;">' + BS.truncate(id.briefTitle || '', 100) + '</h4>' +
              '<a href="https://clinicaltrials.gov/study/' + nct + '" target="_blank" rel="noopener" style="font-size:.75rem;color:var(--accent);">' + nct + ' &rarr;</a>' +
              '</div>';
          }).join('')
        : '<div style="padding:12px;color:var(--text-dark);">No trials matched.</div>';
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    wireFDAPills();
    initSearch();
    initPageTabs();

    Promise.allSettled([
      updateTicker(),
      loadRSSSection(),
      loadFDASection('approvals'),
      loadTrialsSection(),
      loadPubMedSection(),
      loadSECSection(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
