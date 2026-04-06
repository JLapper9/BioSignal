/* =============================================
   BioSignal — News Page Live Data  (news.js)
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
    strip.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading research…</div>';

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

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
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

})();