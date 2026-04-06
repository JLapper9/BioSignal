/* =============================================
   BioSignal — Market Page Live Data  (market.js)
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

  /* ── Market Overview Stats ────────────────────────────────── */

  async function loadMarketStats() {
    try {
      var stats = await BS.loadMarketStats();
      if (stats) {
        el('market-cap').textContent = stats.marketCap || '$1.2T';
        el('companies-count').textContent = stats.companiesCount || '1,847';
        el('funding-ytd').textContent = stats.fundingYTD || '$45.2B';
        el('ipos-qtr').textContent = stats.iposQtr || '23';
      }
    } catch (e) {
      console.log('Market stats unavailable:', e.message);
    }
  }

  /* ── Funding Roundup ──────────────────────────────────────── */

  async function loadFundingSection() {
    var grid = el('funding-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);

    try {
      var rounds = await BS.loadFundingRounds(6);
      if (!rounds.length) { grid.innerHTML = errorMsg('No recent funding rounds found.'); return; }

      grid.innerHTML = rounds.map(function(r) {
        var roundCls = (r.roundType || '').toLowerCase().replace(/\s+/g, '-');
        return '<article class="funding-card anim-in">' +
          '<div class="funding-header">' +
            '<span class="round-badge ' + roundCls + '">' + (r.roundType || 'Funding') + '</span>' +
            '<span class="funding-date">' + BS.formatDate(r.date) + '</span>' +
          '</div>' +
          '<div class="funding-company">' + BS.truncate(r.company, 35) + '</div>' +
          '<div class="funding-amount">' + (r.amount || 'Undisclosed') + '</div>' +
          '<div class="funding-meta">' + BS.truncate(r.description || '', 80) + '</div>' +
          '<a href="' + (r.url || '#') + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
          '</article>';
      }).join('');
      observeNew(grid);
    } catch (e) {
      grid.innerHTML = errorMsg('Funding data unavailable: ' + e.message);
    }
  }

  /* ── IPO Tracker ──────────────────────────────────────────── */

  async function loadIPOSection() {
    var tbody = el('ipo-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Loading IPO data...</td></tr>';

    try {
      var ipos = await BS.loadIPOs(10);
      if (!ipos.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">No recent IPOs found.</td></tr>';
        return;
      }

      tbody.innerHTML = ipos.map(function(ipo) {
        var change = ipo.change || 0;
        var changeCls = change >= 0 ? 'positive' : 'negative';
        var changeStr = (change >= 0 ? '+' : '') + change + '%';
        return '<tr>' +
          '<td class="company-cell">' + BS.truncate(ipo.company, 25) + '</td>' +
          '<td class="symbol-cell">' + (ipo.symbol || '—') + '</td>' +
          '<td class="price-cell">$' + (ipo.ipoPrice || '—') + '</td>' +
          '<td class="price-cell">$' + (ipo.currentPrice || '—') + '</td>' +
          '<td class="' + changeCls + '">' + changeStr + '</td>' +
          '<td class="date-cell">' + BS.formatDate(ipo.ipoDate) + '</td>' +
          '<td class="amount-cell">$' + (ipo.raised || '—') + 'M</td>' +
          '</tr>';
      }).join('');

    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">IPO data unavailable: ' + e.message + '</td></tr>';
    }
  }

  /* ── M&A Activity ─────────────────────────────────────────── */

  async function loadMASection() {
    var grid = el('ma-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);

    try {
      var deals = await BS.loadMADeals(6);
      if (!deals.length) { grid.innerHTML = errorMsg('No recent M&A activity found.'); return; }

      grid.innerHTML = deals.map(function(deal) {
        return '<article class="news-card anim-in">' +
          '<div class="card-body">' +
            '<div class="meta">' +
              '<span class="cat-badge companies">M&A</span>' +
              '<span class="date">' + BS.formatDate(deal.date) + '</span>' +
            '</div>' +
            '<h3>' + BS.truncate(deal.title, 70) + '</h3>' +
            '<p>' + BS.truncate(deal.description || '', 120) + '</p>' +
            '<div style="margin-top:8px;font-size:.85rem;color:var(--text-muted);">' +
              'Value: ' + (deal.value || 'Undisclosed') +
            '</div>' +
            '<a href="' + (deal.url || '#') + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
          '</div></article>';
      }).join('');
      observeNew(grid);
    } catch (e) {
      grid.innerHTML = errorMsg('M&A data unavailable: ' + e.message);
    }
  }

  /* ── FDA Calendar ─────────────────────────────────────────── */

  async function loadFDACalendar() {
    var list = el('fda-calendar');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">Loading FDA calendar...</div>';

    try {
      var events = await BS.loadFDACalendar(10);
      if (!events.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">No upcoming FDA events found.</div>';
        return;
      }

      list.innerHTML = events.map(function(event) {
        var daysUntil = Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
        var urgencyCls = daysUntil <= 7 ? 'urgent' : daysUntil <= 30 ? 'soon' : 'normal';
        return '<div class="calendar-item ' + urgencyCls + '">' +
          '<div class="calendar-date">' + BS.formatDate(event.date) + '</div>' +
          '<div class="calendar-content">' +
            '<h4>' + BS.truncate(event.drug, 50) + '</h4>' +
            '<p>' + BS.truncate(event.company, 40) + ' &middot; ' + event.eventType + '</p>' +
            '<div class="calendar-meta">' + daysUntil + ' days until decision</div>' +
          '</div>' +
          '</div>';
      }).join('');

    } catch (e) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">FDA calendar unavailable: ' + e.message + '</div>';
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    Promise.allSettled([
      loadMarketStats(),
      loadFundingSection(),
      loadIPOSection(),
      loadMASection(),
      loadFDACalendar(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();