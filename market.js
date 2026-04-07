/* =============================================
   BioSignal — Market Page Live Data  (market.js)
   Requires: biosignal-data.js  (window.BioSignal)
   ============================================= */
'use strict';

(function () {

  var BS = window.BioSignal;
  if (!BS) { console.error('[BioSignal] biosignal-data.js not loaded'); return; }

  function el(id) { return document.getElementById(id); }

  function errorMsg(msg) {
    return '<div class="empty-state" style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-dark);">&#9888; ' + msg + '</div>';
  }

  function unavail(msg) {
    return '<div class="mkt-unavail">&#9888; ' + (msg || 'Data unavailable') + '</div>';
  }

  var _animObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); _animObs.unobserve(e.target); }
    });
  }, { threshold: 0.06 });
  function observeNew(c) { c.querySelectorAll('.anim-in').forEach(function(n) { _animObs.observe(n); }); }

  /* ── Watchlist stocks ──────────────────────────────────────── */

  var WATCHLIST = [
    { symbol: 'NVO',  name: 'Novo Nordisk'       },
    { symbol: 'LLY',  name: 'Eli Lilly'          },
    { symbol: 'PFE',  name: 'Pfizer'             },
    { symbol: 'MRK',  name: 'Merck'              },
    { symbol: 'ABBV', name: 'AbbVie'             },
    { symbol: 'BMY',  name: 'Bristol-Myers Squibb'},
    { symbol: 'GILD', name: 'Gilead Sciences'    },
    { symbol: 'BIIB', name: 'Biogen'             },
    { symbol: 'REGN', name: 'Regeneron'          },
    { symbol: 'VRTX', name: 'Vertex Pharma'      },
    { symbol: 'AMGN', name: 'Amgen'              },
    { symbol: 'MRNA', name: 'Moderna'            },
    { symbol: 'BNTX', name: 'BioNTech'          },
    { symbol: 'AZN',  name: 'AstraZeneca'        },
    { symbol: 'GSK',  name: 'GSK'                },
    { symbol: 'SNY',  name: 'Sanofi'             },
    { symbol: 'ALNY', name: 'Alnylam Pharma'     },
    { symbol: 'INCY', name: 'Incyte'             },
    { symbol: 'EXAS', name: 'Exact Sciences'     },
    { symbol: 'JAZZ', name: 'Jazz Pharma'        },
  ];

  var TICKER_SYMBOLS = ['NVO','LLY','PFE','MRK','ABBV','BMY','GILD','BIIB','REGN','VRTX','AMGN','MRNA','BNTX'];
  var REC_SYMBOLS    = ['LLY','ABBV','AMGN','GILD','MRNA'];
  var SENT_SYMBOLS   = ['AMGN','LLY','ABBV','GILD','MRNA','BIIB'];

  var _nameMap = {};
  WATCHLIST.forEach(function(s) { _nameMap[s.symbol] = s.name; });

  /* ── Format helpers ────────────────────────────────────────── */

  function fmtPrice(v) {
    if (v === null || v === undefined || isNaN(v) || v === 0) return '—';
    return '$' + Number(v).toFixed(2);
  }

  function fmtChgPct(c, pc) {
    if (!c || !pc || pc === 0) return { str: '—', cls: '' };
    var pct = ((c - pc) / pc * 100);
    var str = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    return { str: str, cls: pct >= 0 ? 'mkt-up' : 'mkt-dn' };
  }

  function fmtChgAmt(c, pc) {
    if (!c || !pc) return { str: '—', cls: '' };
    var amt = c - pc;
    var str = (amt >= 0 ? '+$' : '-$') + Math.abs(amt).toFixed(2);
    return { str: str, cls: amt >= 0 ? 'mkt-up' : 'mkt-dn' };
  }

  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ── 1. Ticker tape ────────────────────────────────────────── */

  async function loadTicker(quotes) {
    var track = el('ticker-track');
    if (!track) return;

    var items = TICKER_SYMBOLS.map(function(sym) {
      var q    = quotes && quotes[sym];
      var price = (q && q.c) ? '$' + q.c.toFixed(2) : '—';
      var pct   = (q && q.c && q.pc) ? fmtChgPct(q.c, q.pc) : { str: '—', cls: '' };
      return '<span class="ticker-item">' +
        '<span class="ticker-sym">' + sym + '</span>' +
        '<span class="ticker-price">' + price + '</span>' +
        '<span class="ticker-chg ' + pct.cls + '">' + pct.str + '</span>' +
        '</span>';
    }).join('');

    // Double for seamless loop
    track.innerHTML = items + items;
  }

  /* ── 2. Sector overview cards ──────────────────────────────── */

  async function loadSectorCards() {
    BS.setAPIStatus('finnhub', 'loading');
    try {
      var stats = await BS.loadMarketStats();
      if (!stats || stats.noKey) {
        ['sc-xbi-price','sc-ibb-price','sc-sentiment','sc-ipo-count'].forEach(function(id) {
          var e = el(id); if (e) e.textContent = '—';
        });
        BS.setAPIStatus('finnhub', 'warn');
        return null;
      }

      var xbi = stats.xbi, ibb = stats.ibb;

      if (xbi && xbi.c) {
        var xbiEl = el('sc-xbi-price');
        if (xbiEl) xbiEl.textContent = '$' + xbi.c.toFixed(2);
        var xbiChg = fmtChgPct(xbi.c, xbi.pc);
        var xbiChgEl = el('sc-xbi-chg');
        if (xbiChgEl) {
          xbiChgEl.textContent = xbiChg.str;
          xbiChgEl.className = 'mkt-sc-change ' + (xbiChg.cls === 'mkt-up' ? 'up' : xbiChg.cls === 'mkt-dn' ? 'dn' : '');
        }
      }

      if (ibb && ibb.c) {
        var ibbEl = el('sc-ibb-price');
        if (ibbEl) ibbEl.textContent = '$' + ibb.c.toFixed(2);
        var ibbChg = fmtChgPct(ibb.c, ibb.pc);
        var ibbChgEl = el('sc-ibb-chg');
        if (ibbChgEl) {
          ibbChgEl.textContent = ibbChg.str;
          ibbChgEl.className = 'mkt-sc-change ' + (ibbChg.cls === 'mkt-up' ? 'up' : ibbChg.cls === 'mkt-dn' ? 'dn' : '');
        }
      }

      // Sector sentiment: based on XBI momentum
      var sentEl = el('sc-sentiment');
      if (sentEl && xbi && xbi.c && xbi.pc) {
        var xbiPctVal = (xbi.c - xbi.pc) / xbi.pc * 100;
        var label  = xbiPctVal > 0.5 ? 'Bullish' : xbiPctVal < -0.5 ? 'Bearish' : 'Neutral';
        var cls    = xbiPctVal > 0.5 ? 'mkt-up'  : xbiPctVal < -0.5 ? 'mkt-dn'  : '';
        sentEl.innerHTML = '<span class="' + cls + '">' + label + '</span>';
      } else if (sentEl) {
        sentEl.textContent = '—';
      }

      // IPO count
      var ipoEl = el('sc-ipo-count');
      if (ipoEl) {
        ipoEl.textContent = (stats.ipoCount !== null && stats.ipoCount !== undefined) ? stats.ipoCount : '—';
      }

      BS.setAPIStatus('finnhub', 'ok');
      return stats;
    } catch(e) {
      ['sc-xbi-price','sc-ibb-price','sc-sentiment','sc-ipo-count'].forEach(function(id) {
        var node = el(id); if (node) node.textContent = '—';
      });
      BS.setAPIStatus('finnhub', 'error');
      return null;
    }
  }

  /* ── 3 + 4. Watchlist + Movers (shared quotes fetch) ──────── */

  var _watchData = [];  // [{symbol, name, q}] after load
  var _sortCol   = 'chgPct';
  var _sortAsc   = false;

  async function loadWatchlistAndMovers() {
    var bodyEl    = el('mkt-watchlist-body');
    var gainersEl = el('mkt-gainers');
    var losersEl  = el('mkt-losers');
    if (!bodyEl) return;

    var symbols = WATCHLIST.map(function(s) { return s.symbol; });
    var quotes  = await BS.loadStockQuotes(symbols);

    _watchData = WATCHLIST.map(function(s) {
      return { symbol: s.symbol, name: s.name, q: quotes[s.symbol] || null };
    });

    renderWatchlist(bodyEl);
    renderMovers(gainersEl, losersEl);

    // Wire sorting
    var ths = document.querySelectorAll('#mkt-watchlist-table thead th.sortable');
    ths.forEach(function(th) {
      th.removeEventListener('click', th._sortHandler);
      th._sortHandler = function() {
        var col = th.dataset.col;
        if (_sortCol === col) { _sortAsc = !_sortAsc; }
        else { _sortCol = col; _sortAsc = col === 'name' || col === 'symbol'; }
        ths.forEach(function(t) { t.classList.remove('sort-asc','sort-desc'); });
        th.classList.add(_sortAsc ? 'sort-asc' : 'sort-desc');
        renderWatchlist(bodyEl);
      };
      th.addEventListener('click', th._sortHandler);
    });

    // Also populate ticker with the same quotes
    loadTicker(quotes);

    return quotes;
  }

  function _sortVal(row, col) {
    var q = row.q;
    switch(col) {
      case 'name':   return row.name;
      case 'symbol': return row.symbol;
      case 'price':  return (q && q.c)  || -Infinity;
      case 'chgAmt': return (q && q.c && q.pc) ? (q.c - q.pc) : -Infinity;
      case 'chgPct': return (q && q.c && q.pc) ? ((q.c - q.pc) / q.pc) : -Infinity;
      case 'open':   return (q && q.o)  || -Infinity;
      case 'high':   return (q && q.h)  || -Infinity;
      case 'low':    return (q && q.l)  || -Infinity;
      default:       return -Infinity;
    }
  }

  function renderWatchlist(bodyEl) {
    var sorted = _watchData.slice().sort(function(a, b) {
      var av = _sortVal(a, _sortCol), bv = _sortVal(b, _sortCol);
      if (typeof av === 'string') return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return _sortAsc ? av - bv : bv - av;
    });

    bodyEl.innerHTML = sorted.map(function(row) {
      var q    = row.q;
      var pct  = (q && q.c && q.pc) ? fmtChgPct(q.c, q.pc) : { str: '—', cls: '' };
      var amt  = (q && q.c && q.pc) ? fmtChgAmt(q.c, q.pc) : { str: '—', cls: '' };
      return '<tr>' +
        '<td>' + row.name + '</td>' +
        '<td>' + row.symbol + '</td>' +
        '<td>' + fmtPrice(q && q.c) + '</td>' +
        '<td class="' + amt.cls + '">' + amt.str + '</td>' +
        '<td class="' + pct.cls + '">' + pct.str + '</td>' +
        '<td>' + fmtPrice(q && q.o) + '</td>' +
        '<td>' + fmtPrice(q && q.h) + '</td>' +
        '<td>' + fmtPrice(q && q.l) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderMovers(gainersEl, losersEl) {
    var withPct = _watchData.filter(function(r) { return r.q && r.q.c && r.q.pc; });
    withPct.sort(function(a, b) {
      var ap = (a.q.c - a.q.pc) / a.q.pc, bp = (b.q.c - b.q.pc) / b.q.pc;
      return bp - ap;
    });

    function renderRows(arr, cls) {
      return arr.map(function(r) {
        var pct = fmtChgPct(r.q.c, r.q.pc);
        return '<div class="mkt-mover-row">' +
          '<div class="mkt-mover-left">' +
            '<span class="mkt-mover-sym">' + r.symbol + '</span>' +
            '<span class="mkt-mover-name">' + r.name + '</span>' +
          '</div>' +
          '<div class="mkt-mover-right">' +
            '<span class="mkt-mover-price">' + fmtPrice(r.q.c) + '</span>' +
            '<span class="mkt-mover-pct ' + cls + '">' + pct.str + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    if (gainersEl) {
      var top5g = withPct.slice(0, 5);
      gainersEl.innerHTML = top5g.length ? renderRows(top5g, 'mkt-up') : unavail('No gainer data');
    }
    if (losersEl) {
      var top5l = withPct.slice(-5).reverse();
      losersEl.innerHTML = top5l.length ? renderRows(top5l, 'mkt-dn') : unavail('No loser data');
    }
  }

  /* ── 5. IPO Pipeline ────────────────────────────────────────── */

  async function loadIPOSection() {
    var tbody = el('ipo-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">Loading IPO data...</td></tr>';
    BS.setAPIStatus('finnhub-ipo', 'loading');
    try {
      var ipos = await BS.loadIPOs(10);
      if (!ipos.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">No IPO data — add your Finnhub key in biosignal-data.js</td></tr>';
        BS.setAPIStatus('finnhub-ipo', 'warn');
        return;
      }
      tbody.innerHTML = ipos.map(function(ipo) {
        var change    = ipo.change;
        var changeCls = change !== null ? (change >= 0 ? 'mkt-up' : 'mkt-dn') : '';
        var changeStr = change !== null ? (change >= 0 ? '+' : '') + change + '%' : '\u2014';
        var priceCell   = ipo.ipoPrice   !== '\u2014' ? '$' + ipo.ipoPrice   : '\u2014';
        var currentCell = ipo.currentPrice !== '\u2014' ? '$' + ipo.currentPrice : '\u2014';
        var raisedCell  = ipo.raised     !== '\u2014' ? '$' + ipo.raised     : '\u2014';
        var statusBadge = ipo.status ? ' <span style="font-size:.65rem;opacity:.7;">(' + ipo.status + ')</span>' : '';
        return '<tr>' +
          '<td class="company-cell">' + BS.truncate(ipo.company, 25) + statusBadge + '</td>' +
          '<td class="symbol-cell">'  + ipo.symbol + '</td>' +
          '<td class="price-cell">'   + priceCell + '</td>' +
          '<td class="price-cell">'   + currentCell + '</td>' +
          '<td class="' + changeCls + '">' + changeStr + '</td>' +
          '<td class="date-cell">'   + BS.formatDate(ipo.ipoDate) + '</td>' +
          '<td class="amount-cell">' + raisedCell + '</td>' +
          '</tr>';
      }).join('');
      BS.setAPIStatus('finnhub-ipo', 'ok');
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dark);">IPO data unavailable: ' + e.message + '</td></tr>';
      BS.setAPIStatus('finnhub-ipo', 'error');
    }
  }

  /* ── 6. Analyst Recommendations ───────────────────────────── */

  async function loadAnalystRecs() {
    var recsEl = el('mkt-recs');
    if (!recsEl) return;

    try {
      var settled = await Promise.allSettled(
        REC_SYMBOLS.map(function(sym) {
          return fetch(BS.ENDPOINTS.finnhubRecs(sym), { signal: AbortSignal.timeout(8000) }).then(function(r) { return r.json(); });
        })
      );

      var html = '';
      settled.forEach(function(res, i) {
        var sym = REC_SYMBOLS[i];
        if (res.status !== 'fulfilled' || !res.value || !res.value.length) return;
        var latest = res.value[0]; // most recent period
        var sb = latest.strongBuy || 0, b = latest.buy || 0, h = latest.hold || 0,
            s  = latest.sell     || 0, ss = latest.strongSell || 0;
        var total = sb + b + h + s + ss;
        if (!total) return;
        var pSB = (sb / total * 100).toFixed(1), pB = (b / total * 100).toFixed(1),
            pH  = (h  / total * 100).toFixed(1), pS = (s / total * 100).toFixed(1),
            pSS = (ss / total * 100).toFixed(1);
        html += '<div class="mkt-rec-row">' +
          '<span class="mkt-rec-sym">' + sym + '</span>' +
          '<div class="mkt-rec-bar">' +
            '<div class="rec-sb" style="width:' + pSB + '%"  title="Strong Buy ' + sb + '"></div>' +
            '<div class="rec-b"  style="width:' + pB  + '%"  title="Buy ' + b + '"></div>' +
            '<div class="rec-h"  style="width:' + pH  + '%"  title="Hold ' + h + '"></div>' +
            '<div class="rec-s"  style="width:' + pS  + '%"  title="Sell ' + s + '"></div>' +
            '<div class="rec-ss" style="width:' + pSS + '%"  title="Strong Sell ' + ss + '"></div>' +
          '</div>' +
          '<span class="mkt-rec-total">' + total + ' analysts</span>' +
        '</div>';
      });

      recsEl.innerHTML = html || unavail('Recommendation data unavailable');
    } catch(e) {
      recsEl.innerHTML = unavail('Recommendations unavailable');
    }
  }

  /* ── 7. Earnings Calendar ──────────────────────────────────── */

  async function loadEarningsCalendar() {
    var earnEl = el('mkt-earnings');
    if (!earnEl) return;

    try {
      var now  = new Date();
      var from = now.toISOString().split('T')[0];
      var to   = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];

      var res  = await fetch(BS.ENDPOINTS.finnhubEarnings(from, to), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      var symbols = new Set(WATCHLIST.map(function(s) { return s.symbol; }));
      var entries = (data.earningsCalendar || []).filter(function(e) {
        return symbols.has(e.symbol);
      }).slice(0, 10);

      if (!entries.length) {
        earnEl.innerHTML = unavail('No upcoming earnings for watchlist');
        return;
      }

      earnEl.innerHTML = entries.map(function(e) {
        var ampm = e.hour === 'bmo' ? '<span class="mkt-earn-ampm earn-bmo">BMO</span>'
                 : e.hour === 'amc' ? '<span class="mkt-earn-ampm earn-amc">AMC</span>'
                 : '<span class="mkt-earn-ampm earn-na">TBD</span>';
        var eps = (e.epsEstimate !== null && e.epsEstimate !== undefined)
                  ? '<span class="mkt-earn-eps">EPS est. $' + Number(e.epsEstimate).toFixed(2) + '</span>'
                  : '';
        return '<div class="mkt-earn-row">' +
          '<div class="mkt-earn-left">' +
            '<span class="mkt-earn-sym">' + e.symbol + '</span>' +
            '<span class="mkt-earn-name">' + ((_nameMap[e.symbol]) || '') + '</span>' +
          '</div>' +
          '<div class="mkt-earn-right">' +
            '<span class="mkt-earn-date">' + fmtDate(e.date) + '</span>' +
            ampm +
            eps +
          '</div>' +
        '</div>';
      }).join('');
    } catch(e) {
      earnEl.innerHTML = unavail('Earnings calendar unavailable');
    }
  }

  /* ── 8. News Sentiment ─────────────────────────────────────── */

  async function loadSentiment() {
    var sentEl = el('mkt-sentiment');
    if (!sentEl) return;

    try {
      var settled = await Promise.allSettled(
        SENT_SYMBOLS.map(function(sym) {
          return fetch(BS.ENDPOINTS.finnhubSentiment(sym), { signal: AbortSignal.timeout(8000) }).then(function(r) { return r.json(); });
        })
      );

      var html = '';
      settled.forEach(function(res, i) {
        var sym = SENT_SYMBOLS[i];
        var d   = res.status === 'fulfilled' ? res.value : null;
        var bull = (d && d.buzz && d.sentiment) ? Math.round((d.sentiment.bullishPercent || 0) * 100) : null;
        var bear = bull !== null ? (100 - bull) : null;
        var label = bull === null ? 'N/A' : bull > 60 ? 'Bullish' : bull < 40 ? 'Bearish' : 'Neutral';
        var bullCls = bull === null ? '' : bull > 60 ? 'mkt-sent-bull-pct' : bull < 40 ? 'mkt-sent-bear-pct' : '';
        html += '<div class="mkt-sent-card">' +
          '<div class="mkt-sent-sym">' + sym + '</div>' +
          '<div class="mkt-sent-label">' + (_nameMap[sym] || '') + '</div>' +
          (bull !== null
            ? '<div class="mkt-sent-bar-wrap"><div class="mkt-sent-bar-fill mkt-sent-bull" style="width:' + bull + '%"></div></div>' +
              '<div style="display:flex;justify-content:space-between;margin-top:2px;">' +
                '<span class="mkt-sent-pct mkt-sent-bull-pct">' + bull + '% bull</span>' +
                '<span class="mkt-sent-pct mkt-sent-bear-pct">' + bear + '% bear</span>' +
              '</div>'
            : '<div style="font-size:.72rem;color:var(--text-dark);margin-top:6px;">No sentiment data</div>'
          ) +
          '<div class="mkt-sent-pct ' + bullCls + '" style="margin-top:6px;font-size:.75rem;">' + label + '</div>' +
        '</div>';
      });

      sentEl.innerHTML = html || unavail('Sentiment data unavailable');
    } catch(e) {
      sentEl.innerHTML = '<div class="mkt-unavail" style="grid-column:1/-1">&#9888; Sentiment unavailable</div>';
    }
  }

  /* ── Funding Roundup ────────────────────────────────────────── */

  function skeletonCards(n) {
    n = n || 3;
    return Array.from({ length: n }, function() {
      return '<div class="skeleton-card" style="animation:pulse 1.5s ease-in-out infinite;">' +
        '<div class="skel skel-sm"></div><div class="skel skel-md"></div>' +
        '<div class="skel skel-lg"></div><div class="skel skel-p"></div></div>';
    }).join('');
  }

  async function loadFundingSection() {
    var grid = el('funding-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);
    BS.setAPIStatus('newsapi', 'loading');
    try {
      var rounds = await BS.loadFundingRounds(6);
      if (!rounds.length) { grid.innerHTML = errorMsg('No recent funding rounds found.'); BS.setAPIStatus('newsapi', 'warn'); return; }
      grid.innerHTML = rounds.map(function(r) {
        var roundCls = (r.roundType || '').toLowerCase().replace(/\s+/g, '-');
        return '<article class="funding-card anim-in">' +
          '<div class="funding-header">' +
            '<span class="round-badge ' + roundCls + '">' + (r.roundType || 'Funding') + '</span>' +
            '<span class="funding-date">' + BS.relativeTime(r.date) + '</span>' +
          '</div>' +
          '<div class="funding-company">' + BS.truncate(r.company, 35) + '</div>' +
          '<div class="funding-amount">' + (r.amount || 'Undisclosed') + '</div>' +
          '<div class="funding-meta">' + BS.truncate(r.description || '', 80) + '</div>' +
          '<a href="' + (r.url || '#') + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
          '</article>';
      }).join('');
      observeNew(grid);
      BS.setAPIStatus('newsapi', 'ok');
    } catch(e) {
      grid.innerHTML = errorMsg('Funding data unavailable: ' + e.message);
      BS.setAPIStatus('newsapi', 'error');
    }
  }

  /* ── M&A Activity ─────────────────────────────────────────── */

  async function loadMASection() {
    var grid = el('ma-grid');
    if (!grid) return;
    grid.innerHTML = skeletonCards(6);
    BS.setAPIStatus('sec-edgar', 'loading');
    try {
      var deals = await BS.loadMADeals(6);
      if (!deals.length) { grid.innerHTML = errorMsg('No recent M&A activity found.'); BS.setAPIStatus('sec-edgar', 'warn'); return; }
      grid.innerHTML = deals.map(function(deal) {
        return '<article class="news-card anim-in"><div class="card-body">' +
          '<div class="meta">' +
            '<span class="cat-badge companies">M&amp;A</span>' +
            '<span class="date">' + BS.relativeTime(deal.date) + '</span>' +
          '</div>' +
          '<h3>' + BS.truncate(deal.title, 70) + '</h3>' +
          '<p>' + BS.truncate(deal.description || '', 120) + '</p>' +
          '<div style="margin-top:8px;font-size:.82rem;color:var(--text-muted);">Source: ' + (deal.source || 'Unknown') + '</div>' +
          '<a href="' + (deal.url || '#') + '" target="_blank" rel="noopener" class="read-more">Read more &rarr;</a>' +
          '</div></article>';
      }).join('');
      observeNew(grid);
      BS.setAPIStatus('sec-edgar', 'ok');
    } catch(e) {
      grid.innerHTML = errorMsg('M&A data unavailable: ' + e.message);
      BS.setAPIStatus('sec-edgar', 'error');
    }
  }

  /* ── FDA Calendar ─────────────────────────────────────────── */

  async function loadFDACalendarSection() {
    var list = el('fda-calendar');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">Loading FDA calendar...</div>';
    BS.setAPIStatus('fda-rss', 'loading');
    try {
      var events = await BS.loadFDACalendar(10);
      if (!events.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">No upcoming FDA events found.</div>';
        BS.setAPIStatus('fda-rss', 'warn');
        return;
      }
      var today = new Date(); today.setHours(0, 0, 0, 0);
      list.innerHTML = events.map(function(event) {
        var daysUntil  = Math.ceil((new Date(event.date) - today) / (1000 * 60 * 60 * 24));
        var urgencyCls = daysUntil >= 0 && daysUntil <= 7  ? 'urgent'
                       : daysUntil >= 0 && daysUntil <= 30 ? 'soon' : 'normal';
        var countdown  = daysUntil > 0  ? daysUntil + ' day' + (daysUntil !== 1 ? 's' : '') + ' away'
                       : daysUntil === 0 ? 'Today'
                       : Math.abs(daysUntil) + ' day' + (Math.abs(daysUntil) !== 1 ? 's' : '') + ' ago';
        return '<div class="calendar-item ' + urgencyCls + '">' +
          '<div class="calendar-date">' + BS.formatDate(event.date) + '</div>' +
          '<div class="calendar-content">' +
            '<h4>' + BS.truncate(event.drug, 65) + '</h4>' +
            '<p>' + BS.truncate(event.company, 40) + ' &middot; ' + event.eventType + '</p>' +
            '<div class="calendar-meta">' + countdown + '</div>' +
            (event.url ? '<a href="' + event.url + '" target="_blank" rel="noopener" style="font-size:.78rem;color:var(--accent);display:inline-block;margin-top:4px;">View on FDA.gov &rarr;</a>' : '') +
          '</div></div>';
      }).join('');
      BS.setAPIStatus('fda-rss', 'ok');
    } catch(e) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dark);">FDA calendar unavailable: ' + e.message + '</div>';
      BS.setAPIStatus('fda-rss', 'error');
    }
  }

  /* ── Last refresh timestamp ────────────────────────────────── */

  function updateRefreshLabel() {
    var lbl = el('mkt-last-refresh');
    if (lbl) {
      var now = new Date();
      lbl.textContent = 'Updated ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  /* ── Init + refresh cycles ─────────────────────────────────── */

  async function initOverview() {
    // Quotes underpin ticker, watchlist, movers, sector cards — run in parallel
    var [, quotes] = await Promise.allSettled([
      loadSectorCards(),
      loadWatchlistAndMovers(),
    ]);
    updateRefreshLabel();
    return quotes;
  }

  async function initSlowWidgets() {
    // Analyst recs, earnings, sentiment — less rate-limit sensitive, run once per 5 min
    await Promise.allSettled([
      loadAnalystRecs(),
      loadEarningsCalendar(),
      loadSentiment(),
    ]);
  }

  function init() {
    BS.initStatusBar([
      { id: 'finnhub',     label: 'Finnhub (Market)' },
      { id: 'finnhub-ipo', label: 'Finnhub (IPO)'    },
      { id: 'newsapi',     label: 'NewsAPI (Funding)' },
      { id: 'sec-edgar',   label: 'SEC EDGAR (M&A)'  },
      { id: 'fda-rss',     label: 'FDA RSS'           },
    ]);

    Promise.allSettled([
      initOverview(),
      loadIPOSection(),
      loadFundingSection(),
      loadMASection(),
      loadFDACalendarSection(),
      initSlowWidgets(),
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 60-second refresh for live market data
  setInterval(function() {
    initOverview();
  }, 60 * 1000);

  // 5-minute refresh for everything else
  setInterval(function() {
    BS.clearCache();
    Promise.allSettled([
      loadIPOSection(),
      loadFundingSection(),
      loadMASection(),
      loadFDACalendarSection(),
      initSlowWidgets(),
    ]);
  }, 5 * 60 * 1000);

})();