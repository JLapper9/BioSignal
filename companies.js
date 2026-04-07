/* =============================================
   BioSignal — Companies Page Live Data  (companies.js)
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

  /* ── Pipeline Tracker (ChEMBL) ────────────────────────────── */

  async function loadPipelineSection() {
    var tbody = el('pipeline-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Loading pipeline data...</td></tr>';
    BS.setAPIStatus('chembl', 'loading');
    try {
      var pipeline = await BS.loadPipeline(25);
      if (!pipeline.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">No pipeline data available.</td></tr>';
        BS.setAPIStatus('chembl', 'warn');
        return;
      }
      tbody.innerHTML = pipeline.map(function(item) {
        // stageKey is normalised ("phase1", "phase2" etc) for data-stage filter matching
        var stageNorm = item.stageKey || (item.stage || '').toLowerCase().replace(/\s+/g, '');
        var stageCls  = 'stage-' + stageNorm;
        var newsLink  = item.newsUrl && item.newsUrl !== '#'
          ? '<a href="' + item.newsUrl + '" target="_blank" rel="noopener">ChEMBL &rarr;</a>'
          : '\u2014';
        return '<tr data-stage="' + stageNorm + '">' +
          '<td class="company-cell">'    + BS.truncate(item.company    || '', 25) + '</td>' +
          '<td class="drug-cell">'       + BS.truncate(item.drug       || '', 30) + '</td>' +
          '<td class="indication-cell">' + BS.truncate(item.indication || '', 35) + '</td>' +
          '<td><span class="stage-badge ' + stageCls + '">' + (item.stage || 'Unknown') + '</span></td>' +
          '<td class="moa-cell">'        + BS.truncate(item.moa        || '', 40) + '</td>' +
          '<td class="partners-cell">'   + BS.truncate(item.partners   || '', 30) + '</td>' +
          '<td class="news-cell">'       + newsLink + '</td>' +
          '</tr>';
      }).join('');
      wireStagePills();
      BS.setAPIStatus('chembl', 'ok');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Pipeline data unavailable: ' + e.message + '</td></tr>';
      BS.setAPIStatus('chembl', 'error');
    }
  }

  function wireStagePills() {
    var pills = document.querySelectorAll('#stage-pills .cat-pill');
    if (!pills.length) return;
    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var stage = pill.dataset.stage;
        document.querySelectorAll('#pipeline-body tr').forEach(function(row) {
          row.style.display = (stage === 'all' || row.dataset.stage === stage) ? '' : 'none';
        });
      });
    });
  }

  /* ── SEC Activity ─────────────────────────────────────────── */

  function fetchedStamp(d) {
    if (!d) return '';
    var t = d instanceof Date ? d : new Date(d);
    if (isNaN(t)) return '';
    return 'Fetched ' + t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  async function loadSECSection() {
    var grid = el('hub-sec-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(4);
    BS.setAPIStatus('sec-edgar', 'loading');
    try {
      var filings = await BS.loadSEC('S-1,8-K,10-K,10-Q', 9);
      if (!filings.length) { grid.innerHTML = errorMsg('No recent SEC filings found.'); BS.setAPIStatus('sec-edgar', 'warn'); return; }
      grid.innerHTML = filings.map(function(f) {
        var badgeCls  = f.flag.cls === 'sec-ipo' ? 'funding' : f.flag.cls === 'sec-event' ? 'trials' : 'regulatory';
        var highlight = f.isPriority ? ' style="border-left:3px solid var(--accent);"' : (f.isMajor ? ' style="border-left:3px solid var(--funding-col);"' : '');
        var stamp     = fetchedStamp(f.fetchedAt);
        return '<article class="news-card anim-in"' + highlight + '>' +
          '<div class="card-body" style="padding-top:16px;">' +
            '<div class="meta">' +
              '<span class="cat-badge ' + badgeCls + '">' + f.flag.label + '</span>' +
              '<span class="date">' + BS.formatDate(f.fileDate) + '</span>' +
            '</div>' +
            '<h3>' + BS.truncate(f.company, 58) + '</h3>' +
            '<p>Form ' + f.formType + (f.period ? ' &middot; ' + BS.formatDate(f.period) : '') + '</p>' +
            (f.isPriority ? '<p style="color:var(--accent);font-size:.75rem;font-weight:600;margin-top:4px;">&#9733; Clinical / Partnership / FDA Event</p>' : '') +
            (f.isMajor && !f.isPriority ? '<p style="color:var(--funding-col);font-size:.75rem;font-weight:600;margin-top:4px;">&#9733; IPO / Major Filing</p>' : '') +
            '<div class="card-footer-row">' +
              '<a href="' + f.url + '" target="_blank" rel="noopener" class="read-more">View on EDGAR &rarr;</a>' +
              (stamp ? '<span class="fetch-stamp">' + stamp + '</span>' : '') +
            '</div>' +
          '</div></article>';
      }).join('');
      observeNew(grid);
      BS.setAPIStatus('sec-edgar', 'ok');
    } catch (e) {
      grid.innerHTML = errorMsg('SEC data unavailable: ' + e.message);
      BS.setAPIStatus('sec-edgar', 'error');
    }
  }

  /* ── Init + Auto-refresh ──────────────────────────────────── */

  function init() {
    BS.initStatusBar([
      { id: 'chembl',    label: 'ChEMBL (Pipeline)' },
      { id: 'sec-edgar', label: 'SEC EDGAR' },
    ]);
    Promise.allSettled([
      loadPipelineSection(),
      loadSECSection(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  setInterval(function() { BS.clearCache(); init(); }, 5 * 60 * 1000);

})();