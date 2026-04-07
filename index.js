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

    // Mark all search APIs as loading
    BS.setAPIStatus('newsapi', 'loading');
    BS.setAPIStatus('openfda', 'loading');
    BS.setAPIStatus('trials',  'loading');

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
      BS.setAPIStatus('newsapi', 'ok');
    } catch (e) { BS.setAPIStatus('newsapi', 'error'); }

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
              '<a href="news.html" style="font-size:.75rem;color:var(--accent);">View in News &rarr;</a>' +
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

      BS.setAPIStatus('openfda', fdaR.status === 'fulfilled' ? 'ok' : 'error');
      BS.setAPIStatus('trials',  trR.status  === 'fulfilled' ? 'ok' : 'error');
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    // Home page search uses these APIs on demand — show as idle until triggered
    BS.initStatusBar([
      { id: 'newsapi', label: 'NewsAPI', idle: true },
      { id: 'openfda', label: 'OpenFDA', idle: true },
      { id: 'trials',  label: 'ClinicalTrials.gov', idle: true },
    ]);
    initSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
