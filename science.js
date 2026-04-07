/* =============================================
   BioSignal — Science Page Live Data  (science.js)
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

  /* ── Drug Database (ChEMBL approved) ─────────────────────── */

  async function loadDrugsSection() {
    var grid = el('drugs-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);
    BS.setAPIStatus('chembl', 'loading');
    try {
      var drugs = await BS.loadDrugs(9);
      if (!drugs.length) { grid.innerHTML = errorMsg('No drug data available.'); BS.setAPIStatus('chembl', 'warn'); return; }
      grid.innerHTML = drugs.map(function(drug) {
        var statusCls = (drug.status || '').toLowerCase().replace(/\s+/g, '-');
        return '<article class="news-card anim-in"><div class="card-body">' +
          '<div class="meta">' +
            '<span class="cat-badge science">' + (drug.category || 'Drug') + '</span>' +
            '<span class="status-badge ' + statusCls + '">' + (drug.status || 'Unknown') + '</span>' +
          '</div>' +
          '<h3>' + BS.truncate(drug.name, 50) + '</h3>' +
          '<p>' + BS.truncate(drug.description || '', 120) + '</p>' +
          '<div style="margin-top:8px;font-size:.85rem;color:var(--text-muted);">Source: ChEMBL</div>' +
          '<a href="' + (drug.url || '#') + '" target="_blank" rel="noopener" class="read-more">View on ChEMBL &rarr;</a>' +
          '</div></article>';
      }).join('');
      observeNew(grid);
      wireDrugPills();
      BS.setAPIStatus('chembl', 'ok');
    } catch (e) {
      grid.innerHTML = errorMsg('Drug data unavailable: ' + e.message);
      BS.setAPIStatus('chembl', 'error');
    }
  }

  function wireDrugPills() {
    var pills = document.querySelectorAll('#drug-pills .cat-pill');
    var grid  = el('drugs-grid');
    if (!pills.length || !grid) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var category = pill.dataset.category;
        grid.querySelectorAll('.news-card').forEach(function(card) {
          var badge = card.querySelector('.cat-badge');
          var cardCat = badge ? badge.textContent.toLowerCase() : '';
          card.style.display = (category === 'all' || cardCat.includes(category.toLowerCase())) ? '' : 'none';
        });
      });
    });
  }

  /* ── Clinical Trials (ClinicalTrials.gov) ─────────────────── */

  var _allTrials = []; // full loaded set for client-side filtering

  async function loadTrialsSection(minPhase) {
    minPhase = (minPhase !== undefined) ? minPhase : 2;
    var list = el('trials-list');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading trials...</div>';
    BS.setAPIStatus('trials', 'loading');
    try {
      // Fetch Phase 1+ so we have all data for client-side toggling, but default display is Phase 2+
      var studies = await BS.loadTrials('biotech OR gene therapy OR oncology OR CRISPR OR rare disease', 'RECRUITING,ACTIVE_NOT_RECRUITING', 40, 0);
      _allTrials = studies;
      if (!studies.length) { list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;">No trials found.</div>'; BS.setAPIStatus('trials', 'warn'); return; }
      renderTrials(list, minPhase);
      wireTrialPills();
      BS.setAPIStatus('trials', 'ok');
    } catch (e) {
      list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;">Trials unavailable: ' + e.message + '</div>';
      BS.setAPIStatus('trials', 'error');
    }
  }

  function _phaseNum(phases) {
    var PHASE_ORDER = { 'PHASE1': 1, 'PHASE2': 2, 'PHASE3': 3, 'PHASE4': 4, 'EARLY_PHASE1': 0 };
    if (!phases || !phases.length) return 0;
    return phases.reduce(function(max, p) {
      return Math.max(max, PHASE_ORDER[p.toUpperCase().replace(/\s/g, '')] || 0);
    }, 0);
  }

  function renderTrials(list, minPhase) {
    var PHASE_KEY = { 1: 'phase1', 2: 'phase2', 3: 'phase3', 4: 'phase3' }; // phase4 uses phase3 class for styling
    var filtered = (minPhase > 0)
      ? _allTrials.filter(function(s) {
          var design = (s.protocolSection && s.protocolSection.designModule) || {};
          return _phaseNum(design.phases || []) >= minPhase;
        })
      : _allTrials;
    filtered = filtered.slice(0, 12);

    if (!filtered.length) {
      list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;">No trials found for selected phase.</div>';
      return;
    }

    list.innerHTML = filtered.map(function(s) {
      var p = s.protocolSection || {}, id = p.identificationModule || {}, status = p.statusModule || {};
      var design = p.designModule || {}, conds = p.conditionsModule || {}, sponsor = p.sponsorCollaboratorsModule || {};
      var nctId = id.nctId || '', phases = design.phases || [];
      var phaseN = _phaseNum(phases);
      var pCls   = PHASE_KEY[phaseN] || 'phase1';
      var conditions  = (conds.conditions || []).slice(0, 2).join(', ');
      var leadSponsor = (sponsor.leadSponsor && sponsor.leadSponsor.name) || '';
      var update      = (status.lastUpdatePostDateStruct && status.lastUpdatePostDateStruct.date) || '';
      return '<div class="trial-entry" data-phase="' + pCls + '" data-phasenum="' + phaseN + '">' +
        '<div class="trial-header"><span class="phase-badge ' + pCls + '">' + BS.phaseLabel(phases) + '</span></div>' +
        '<div class="trial-drug">' + BS.truncate(id.briefTitle || nctId, 65) + '</div>' +
        (leadSponsor ? '<div class="trial-company">' + BS.truncate(leadSponsor, 40) + '</div>' : '') +
        (conditions  ? '<div class="trial-indication">' + conditions + '</div>' : '') +
        (update      ? '<div class="trial-date">Updated ' + BS.formatDate(update) + '</div>' : '') +
        '<a href="https://clinicaltrials.gov/study/' + nctId + '" target="_blank" rel="noopener" style="font-size:.8rem;color:var(--accent);margin-top:4px;display:inline-block;">View on ClinicalTrials.gov &rarr;</a>' +
        '</div>';
    }).join('');
  }

  function wireTrialPills() {
    var pills = document.querySelectorAll('#trial-pills .cat-pill');
    var list  = el('trials-list');
    if (!pills.length || !list) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var phase = pill.dataset.phase;
        if (phase === 'all')       { renderTrials(list, 0); }
        else if (phase === 'phase1') { renderTrials(list, 1); }
        else if (phase === 'phase2') { renderTrials(list, 2); }
        else if (phase === 'phase3') { renderTrials(list, 3); }
        else if (phase === 'phase4') { renderTrials(list, 4); }
        else { renderTrials(list, 2); } // recruiting defaults to Phase 2+
      });
    });
  }

  /* ── Research & Publications (PubMed) ────────────────────── */

  var _pubTopics = {
    biotech:  'biotech life sciences',
    genetics: 'gene therapy CRISPR genomics',
    therapy:  'cancer immunotherapy treatment',
    clinical: 'clinical trial randomized controlled',
  };

  async function loadResearchSection(topic) {
    var strip = el('research-strip');
    if (!strip) return;
    strip.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading research...</div>';
    BS.setAPIStatus('pubmed', 'loading');
    var query = _pubTopics[topic] || 'biotech life sciences gene therapy oncology CRISPR';
    try {
      var articles = await BS.loadPubMed(query, 6);
      if (!articles.length) { strip.innerHTML = '<div>No articles available.</div>'; BS.setAPIStatus('pubmed', 'warn'); return; }
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
      wireResearchPills();
      BS.setAPIStatus('pubmed', 'ok');
    } catch (e) {
      strip.innerHTML = '<div style="color:var(--text-dark);">Research unavailable: ' + e.message + '</div>';
      BS.setAPIStatus('pubmed', 'error');
    }
  }

  function wireResearchPills() {
    var pills = document.querySelectorAll('#research-pills .cat-pill');
    if (!pills.length) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        loadResearchSection(pill.dataset.topic);
      });
    });
  }

  /* ── Init + Auto-refresh ──────────────────────────────────── */

  function init() {
    BS.initStatusBar([
      { id: 'chembl',  label: 'ChEMBL' },
      { id: 'trials',  label: 'ClinicalTrials.gov' },
      { id: 'pubmed',  label: 'PubMed / NCBI' },
    ]);
    Promise.allSettled([
      loadDrugsSection(),
      loadTrialsSection(2),
      loadResearchSection('all'),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  setInterval(function() { BS.clearCache(); init(); }, 5 * 60 * 1000);

})();