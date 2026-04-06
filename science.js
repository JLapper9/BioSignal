/* =============================================
   BioSignal — Science Page Live Data  (science.js)
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

  /* ── Drug Database ────────────────────────────────────────── */

  async function loadDrugsSection() {
    var grid = el('drugs-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);

    try {
      var drugs = await BS.loadDrugs(9);
      if (!drugs.length) { grid.innerHTML = errorMsg('No drug data available.'); return; }

      grid.innerHTML = drugs.map(function(drug) {
        var statusCls = (drug.status || '').toLowerCase().replace(/\s+/g, '-');
        return '<article class="news-card anim-in">' +
          '<div class="card-body">' +
            '<div class="meta">' +
              '<span class="cat-badge science">' + (drug.category || 'Drug') + '</span>' +
              '<span class="status-badge ' + statusCls + '">' + (drug.status || 'Unknown') + '</span>' +
            '</div>' +
            '<h3>' + BS.truncate(drug.name, 50) + '</h3>' +
            '<p>' + BS.truncate(drug.description || '', 120) + '</p>' +
            '<div style="margin-top:8px;font-size:.85rem;color:var(--text-muted);">' +
              'Developer: ' + BS.truncate(drug.company || 'Unknown', 30) +
            '</div>' +
            '<a href="' + (drug.url || '#') + '" target="_blank" rel="noopener" class="read-more">View details &rarr;</a>' +
          '</div></article>';
      }).join('');
      observeNew(grid);

      // Wire drug filters
      wireDrugPills();

    } catch (e) {
      grid.innerHTML = errorMsg('Drug data unavailable: ' + e.message);
    }
  }

  function wireDrugPills() {
    var pills = document.querySelectorAll('#drug-pills .cat-pill');
    var grid = el('drugs-grid');
    if (!pills.length || !grid) return;

    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');

        var category = pill.dataset.category;
        var cards = grid.querySelectorAll('.news-card');
        cards.forEach(function(card) {
          var cardCategory = card.querySelector('.cat-badge').textContent.toLowerCase();
          var show = category === 'all' || cardCategory.includes(category.toLowerCase());
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ── Clinical Trials ──────────────────────────────────────── */

  async function loadTrialsSection() {
    var list = el('trials-list');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading trials...</div>';

    try {
      var studies = await BS.loadTrials(
        'biotech OR gene therapy OR oncology OR CRISPR OR rare disease',
        'RECRUITING,ACTIVE_NOT_RECRUITING',
        8
      );
      if (!studies.length) {
        list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;">No trials found.</div>';
        return;
      }

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
          '<a href="https://clinicaltrials.gov/study/' + nctId + '" target="_blank" rel="noopener" style="font-size:.8rem;color:var(--accent);margin-top:4px;display:inline-block;">View on ClinicalTrials.gov &rarr;</a>' +
          '</div>';
      }).join('');

      // Wire trial filters
      wireTrialPills();

    } catch (e) {
      list.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;">Trials unavailable: ' + e.message + '</div>';
    }
  }

  function wireTrialPills() {
    var pills = document.querySelectorAll('#trial-pills .cat-pill');
    var list = el('trials-list');
    if (!pills.length || !list) return;

    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');

        var phase = pill.dataset.phase;
        var entries = list.querySelectorAll('.trial-entry');
        entries.forEach(function(entry) {
          var entryPhase = entry.querySelector('.phase-badge').textContent.toLowerCase().replace(/\s+/g, '');
          var show = phase === 'all' ||
                    (phase === 'recruiting' && entry.querySelector('.trial-date')) ||
                    entryPhase.includes(phase.replace('phase', ''));
          entry.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ── Research & Publications ──────────────────────────────── */

  async function loadResearchSection() {
    var strip = el('research-strip');
    if (!strip) return;
    strip.innerHTML = '<div style="color:var(--text-dark);font-size:.85rem;padding:12px 0;">Loading research...</div>';

    try {
      var articles = await BS.loadPubMed('biotech life sciences gene therapy oncology CRISPR', 6);
      if (!articles.length) {
        strip.innerHTML = '<div>No articles available.</div>';
        return;
      }

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

      // Wire research filters
      wireResearchPills();

    } catch (e) {
      strip.innerHTML = '<div style="color:var(--text-dark);">Research unavailable: ' + e.message + '</div>';
    }
  }

  function wireResearchPills() {
    var pills = document.querySelectorAll('#research-pills .cat-pill');
    var strip = el('research-strip');
    if (!pills.length || !strip) return;

    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');

        var topic = pill.dataset.topic;
        var cards = strip.querySelectorAll('.pub-card');
        cards.forEach(function(card) {
          var title = card.querySelector('h4').textContent.toLowerCase();
          var show = topic === 'all' ||
                    title.includes(topic.toLowerCase()) ||
                    (topic === 'genetics' && (title.includes('gene') || title.includes('dna'))) ||
                    (topic === 'therapy' && (title.includes('therap') || title.includes('treatment'))) ||
                    (topic === 'clinical' && (title.includes('clinic') || title.includes('trial')));
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    Promise.allSettled([
      loadDrugsSection(),
      loadTrialsSection(),
      loadResearchSection(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();