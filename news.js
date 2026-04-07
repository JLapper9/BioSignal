/* =============================================
   BioSignal — News Page Live Data  (news.js)
   Requires: biosignal-data.js  (window.BioSignal)
   ============================================= */
'use strict';

(function () {

  var BS = window.BioSignal;
  if (!BS) { console.error('[BioSignal] biosignal-data.js not loaded'); return; }

  function el(id) { return document.getElementById(id); }
  function skeletonCards(n) {
    n = n || 3;
    return Array.from({ length: n }, function() {
      return '<div class="skeleton-card" style="animation:pulse 1.5s ease-in-out infinite;">' +
        '<div class="skel skel-sm"></div><div class="skel skel-md"></div>' +
        '<div class="skel skel-lg"></div><div class="skel skel-p"></div></div>';
    }).join('');
  }
  function errorMsg(msg) {
    return '<div class="empty-state" style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-dark);">&#9888; ' + msg + '</div>';
  }

  var _animObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); _animObs.unobserve(e.target); }
    });
  }, { threshold: 0.06 });
  function observeNew(c) { c.querySelectorAll('.anim-in').forEach(function(n) { _animObs.observe(n); }); }

  /* ── Timestamp helper ─────────────────────────────────────── */

  function fetchedStamp(d) {
    if (!d) return '';
    var t = d instanceof Date ? d : new Date(d);
    if (isNaN(t)) return '';
    return 'Fetched ' + t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  /* ── Topic keyword map ───────────────────────────────────── */

  var NEWS_TOPIC_KW = { biotech: 'biotech', fda: 'fda', pharma: 'pharma', trials: 'trial' };
  var _newsAll = [];

  /* ── News card renderer ──────────────────────────────────── */

  function renderNewsCard(it) {
    var stamp = fetchedStamp(it.fetchedAt);
    return '<article class="news-card anim-in" data-title="' + (it.title || '').toLowerCase().replace(/"/g, '') + '" data-summary="' + (it.summary || '').toLowerCase().replace(/"/g, '') + '">' +
      (it.image
        ? '<img src="' + it.image + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" style="width:100%;height:160px;object-fit:cover;border-radius:8px 8px 0 0;display:block;">'
        : '<div class="card-ph ph-regulatory"></div>') +
      '<div class="card-body">' +
        '<div class="meta">' +
          '<span class="cat-badge regulatory">' + BS.truncate(it.source, 28) + '</span>' +
          '<span class="date">' + BS.relativeTime(it.pubDate) + '</span>' +
        '</div>' +
        '<h3>' + BS.truncate(it.title, 100) + '</h3>' +
        (it.summary ? '<p>' + BS.truncate(it.summary, 155) + '</p>' : '') +
        '<div class="card-footer-row">' +
          '<a href="' + it.link + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
          (stamp ? '<span class="fetch-stamp">' + stamp + '</span>' : '') +
        '</div>' +
      '</div></article>';
  }

  /* ── News section search bar ──────────────────────────────── */

  function initSectionSearch() {
    var wrap  = el('news-section-search-wrap');
    var input = el('news-section-search');
    var grid  = el('hub-rss-grid');
    if (!input || !grid) return;

    input.addEventListener('input', function() {
      var q = input.value.trim().toLowerCase();
      grid.querySelectorAll('.news-card').forEach(function(card) {
        if (!q) { card.style.display = ''; return; }
        var title   = card.dataset.title   || '';
        var summary = card.dataset.summary || '';
        card.style.display = (title.includes(q) || summary.includes(q)) ? '' : 'none';
      });
    });
  }

  /* ── Top Headlines ────────────────────────────────────────── */

  async function loadRSSSection() {
    var grid = el('hub-rss-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);
    BS.setAPIStatus('newsapi', 'loading');
    try {
      _newsAll = await BS.loadNews(40);
      if (!_newsAll.length) { grid.innerHTML = errorMsg('News headlines unavailable.'); BS.setAPIStatus('newsapi', 'warn'); return; }
      grid.innerHTML = _newsAll.slice(0, 6).map(renderNewsCard).join('');
      observeNew(grid);
      wireNewsPills();
      initSectionSearch();
      BS.setAPIStatus('newsapi', 'ok');
    } catch(e) {
      grid.innerHTML = errorMsg('News unavailable: ' + e.message);
      BS.setAPIStatus('newsapi', 'error');
    }
  }

  function wireNewsPills() {
    var pills = document.querySelectorAll('#hub-rss-pills .cat-pill');
    var grid  = el('hub-rss-grid');
    var input = el('news-section-search');
    if (!pills.length || !grid) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        if (input) input.value = '';
        var kw = NEWS_TOPIC_KW[pill.dataset.topic];
        var filtered = kw
          ? _newsAll.filter(function(it) { return (it.title + ' ' + it.summary).toLowerCase().includes(kw); }).slice(0, 6)
          : _newsAll.slice(0, 6);
        grid.innerHTML = filtered.length ? filtered.map(renderNewsCard).join('') : errorMsg('No recent headlines for this topic.');
        observeNew(grid);
        initSectionSearch();
      });
    });
  }

  /* ── FDA Spotlight ────────────────────────────────────────── */

  async function loadFDASection(tab) {
    tab = tab || 'approvals';
    var grid = el('hub-fda-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);
    BS.setAPIStatus('openfda', 'loading');
    try {
      var results = await BS.loadFDA(tab, 6);
      if (!results.length) { grid.innerHTML = errorMsg('No FDA data available.'); BS.setAPIStatus('openfda', 'warn'); return; }
      grid.innerHTML = results.map(function(r) { return renderFDACard(r, tab); }).join('');
      observeNew(grid);
      BS.setAPIStatus('openfda', 'ok');
    } catch(e) {
      grid.innerHTML = errorMsg('FDA data unavailable: ' + e.message);
      BS.setAPIStatus('openfda', 'error');
    }
  }

  function renderFDACard(r, tab) {
    var stamp = fetchedStamp(r._fetchedAt);
    if (tab === 'approvals') {
      var brand   = (r.openfda && r.openfda.brand_name && r.openfda.brand_name[0]) || (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || 'Unknown Drug';
      var generic = (r.openfda && r.openfda.generic_name && r.openfda.generic_name[0]) || '';
      var sponsor = r.sponsor_name || (r.openfda && r.openfda.manufacturer_name && r.openfda.manufacturer_name[0]) || '';
      var appNum  = (r.application_number || '').replace(/\D/g, '');
      var indication = r._indication || '';
      var division   = r._division   || '';
      var approvalDate = r._approvalDate || '';
      return '<article class="news-card anim-in"><div class="card-ph ph-regulatory"></div><div class="card-body">' +
        '<div class="meta"><span class="cat-badge regulatory">Approval</span><span class="date">' + BS.formatDate(approvalDate) + '</span></div>' +
        '<h3>' + brand + '</h3>' +
        (generic && generic !== brand ? '<p style="font-size:.8rem;color:var(--text-dark);margin-bottom:4px;">' + generic + '</p>' : '') +
        (sponsor ? '<p style="margin-bottom:4px;">' + BS.truncate(sponsor, 55) + '</p>' : '') +
        (indication ? '<p style="font-size:.78rem;color:var(--text-muted);margin-bottom:2px;"><strong style="color:var(--text-dark);">Indication:</strong> ' + indication + '</p>' : '') +
        (division   ? '<p style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px;"><strong style="color:var(--text-dark);">Division:</strong> ' + division + '</p>' : '') +
        '<div class="card-footer-row">' +
          '<a href="https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' + appNum + '" target="_blank" rel="noopener" class="read-more">View on FDA &rarr;</a>' +
          (stamp ? '<span class="fetch-stamp">' + stamp + '</span>' : '') +
        '</div>' +
        '</div></article>';
    }
    // Recalls (Class I / Class II only)
    var cls = r.classification || '';
    var clsIsI = cls.toUpperCase().includes('CLASS I') && !cls.toUpperCase().includes('CLASS II');
    return '<article class="news-card anim-in"><div class="card-ph ph-oncology"></div><div class="card-body">' +
      '<div class="meta">' +
        '<span class="' + (clsIsI ? 'class-i' : 'class-ii') + '" style="font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(248,113,113,.12);">' + cls + '</span>' +
        '<span class="date">' + BS.formatDate(r.recall_initiation_date) + '</span>' +
      '</div>' +
      '<h3>' + BS.truncate(r.product_description || 'Unnamed product', 90) + '</h3>' +
      '<p>' + BS.truncate(r.reason_for_recall || '', 140) + '</p>' +
      '<div class="card-footer-row">' +
        '<a href="https://www.accessdata.fda.gov/scripts/ires/" target="_blank" rel="noopener" class="read-more">View Recalls &rarr;</a>' +
        (stamp ? '<span class="fetch-stamp">' + stamp + '</span>' : '') +
      '</div>' +
      '</div></article>';
  }

  function wireFDAPills() {
    document.querySelectorAll('#hub-fda-pills .cat-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        document.querySelectorAll('#hub-fda-pills .cat-pill').forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        loadFDASection(pill.dataset.fdatab);
      });
    });
  }

  /* ── Clinical Trials Sidebar ──────────────────────────────── */

  async function loadTrialsSection() {
    var list = el('hub-trials-list');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:8px 0;">Loading trials...</div>';
    BS.setAPIStatus('trials', 'loading');
    try {
      // Phase 2+ by default
      var studies = await BS.loadTrials('biotech OR gene therapy OR oncology OR CRISPR OR rare disease', 'RECRUITING,ACTIVE_NOT_RECRUITING', 6, 2);
      if (!studies.length) { list.innerHTML = '<p style="color:var(--text-dark);font-size:.85rem;">No trials found.</p>'; BS.setAPIStatus('trials', 'warn'); return; }
      list.innerHTML = studies.map(function(s) {
        var p = s.protocolSection || {}, id = p.identificationModule || {}, status = p.statusModule || {};
        var design = p.designModule || {}, conds = p.conditionsModule || {}, sponsor = p.sponsorCollaboratorsModule || {};
        var nctId = id.nctId || '', phases = design.phases || [];
        var p0 = (phases[0] || '').toLowerCase();
        var pCls = p0.includes('4') ? 'phase3' : p0.includes('3') ? 'phase3' : p0.includes('2') ? 'phase2' : 'phase1';
        var conditions  = (conds.conditions || []).slice(0, 2).join(', ');
        var leadSponsor = (sponsor.leadSponsor && sponsor.leadSponsor.name) || '';
        var update      = (status.lastUpdatePostDateStruct && status.lastUpdatePostDateStruct.date) || '';
        return '<div class="trial-entry">' +
          '<div class="trial-header"><span class="phase-badge ' + pCls + '">' + BS.phaseLabel(phases) + '</span></div>' +
          '<div class="trial-drug">' + BS.truncate(id.briefTitle || nctId, 65) + '</div>' +
          (leadSponsor ? '<div class="trial-company">' + BS.truncate(leadSponsor, 40) + '</div>' : '') +
          (conditions  ? '<div class="trial-indication">' + conditions + '</div>' : '') +
          (update      ? '<div class="trial-date">Updated ' + BS.formatDate(update) + '</div>' : '') +
          '</div>';
      }).join('');
      BS.setAPIStatus('trials', 'ok');
    } catch(e) {
      list.innerHTML = '<p style="color:var(--text-dark);font-size:.85rem;">Trials unavailable: ' + e.message + '</p>';
      BS.setAPIStatus('trials', 'error');
    }
  }

  /* ── PubMed Research Strip ────────────────────────────────── */

  async function loadPubMedSection() {
    var strip = el('hub-pubmed-strip');
    if (!strip) return;
    strip.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading research...</div>';
    BS.setAPIStatus('pubmed', 'loading');
    try {
      var articles = await BS.loadPubMed('biotech life sciences gene therapy oncology CRISPR', 5);
      if (!articles.length) { strip.innerHTML = '<p>No articles available.</p>'; BS.setAPIStatus('pubmed', 'warn'); return; }
      var fetchedAt = new Date();
      strip.innerHTML = articles.map(function(a) {
        var authors = (a.authors || []).slice(0, 2).map(function(au) { return au.name; }).join(', ');
        return '<div class="pub-card anim-in">' +
          '<span class="pub-journal">' + (a.source || '') + '</span>' +
          '<h4>' + BS.truncate(a.title || '', 115) + '</h4>' +
          '<p class="pub-authors">' + (authors || '') + ((a.authors || []).length > 2 ? ' et al.' : '') + (a.pubdate ? ' &middot; ' + a.pubdate : '') + '</p>' +
          '<div class="card-footer-row">' +
            '<a href="' + BS.ENDPOINTS.pubmedAbstract(a.uid) + '" target="_blank" rel="noopener" style="font-size:.78rem;color:var(--accent);">Read on PubMed &rarr;</a>' +
            '<span class="fetch-stamp">' + fetchedStamp(fetchedAt) + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
      observeNew(strip);
      BS.setAPIStatus('pubmed', 'ok');
    } catch(e) {
      strip.innerHTML = '<p style="color:var(--text-dark);">Research unavailable: ' + e.message + '</p>';
      BS.setAPIStatus('pubmed', 'error');
    }
  }

  /* ── Init + Auto-refresh ──────────────────────────────────── */

  function init() {
    BS.initStatusBar([
      { id: 'newsapi', label: 'RSS / NewsAPI' },
      { id: 'openfda', label: 'OpenFDA' },
      { id: 'trials',  label: 'ClinicalTrials.gov' },
      { id: 'pubmed',  label: 'PubMed / NCBI' },
    ]);
    wireFDAPills();
    Promise.allSettled([
      loadRSSSection(),
      loadFDASection('approvals'),
      loadTrialsSection(),
      loadPubMedSection(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  setInterval(function() { BS.clearCache(); init(); }, 5 * 60 * 1000);

})();