/* =============================================
   BioSignal — Companies Page Live Data  (companies.js)
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

  /* ── Pipeline Tracker ─────────────────────────────────────── */

  async function loadPipelineSection() {
    var tbody = el('pipeline-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Loading pipeline data...</td></tr>';

    try {
      var pipeline = await BS.loadPipeline(25);
      if (!pipeline.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">No pipeline data available.</td></tr>';
        return;
      }

      tbody.innerHTML = pipeline.map(function(item) {
        var stageCls = 'stage-' + (item.stage || 'unknown').toLowerCase().replace(/\s+/g, '-');
        var newsLink = item.newsUrl ? '<a href="' + item.newsUrl + '" target="_blank" rel="noopener">News &rarr;</a>' : '—';
        return '<tr data-stage="' + (item.stage || '').toLowerCase() + '">' +
          '<td class="company-cell">' + BS.truncate(item.company || '', 25) + '</td>' +
          '<td class="drug-cell">' + BS.truncate(item.drug || '', 30) + '</td>' +
          '<td class="indication-cell">' + BS.truncate(item.indication || '', 35) + '</td>' +
          '<td><span class="stage-badge ' + stageCls + '">' + (item.stage || 'Unknown') + '</span></td>' +
          '<td class="moa-cell">' + BS.truncate(item.moa || '', 40) + '</td>' +
          '<td class="partners-cell">' + BS.truncate(item.partners || '', 30) + '</td>' +
          '<td class="news-cell">' + newsLink + '</td>' +
          '</tr>';
      }).join('');

      // Wire stage filter
      wireStagePills();

    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Pipeline data unavailable: ' + e.message + '</td></tr>';
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
        var rows = document.querySelectorAll('#pipeline-body tr');
        rows.forEach(function(row) {
          if (stage === 'all') {
            row.style.display = '';
          } else {
            row.style.display = (row.dataset.stage === stage) ? '' : 'none';
          }
        });
      });
    });
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

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
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

})();