/* BioSignal — app.js */

// ── Utility: Generic Pill Filter ─────────────────────────────────
function initPillFilter(pillContainerId, cardSelector, dataAttr) {
  const container = document.getElementById(pillContainerId);
  if (!container) return;

  const pills = container.querySelectorAll('.cat-pill');
  const cards = document.querySelectorAll(cardSelector);

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const val = pill.dataset[dataAttr] || pill.dataset.cat || pill.dataset.stage;

      cards.forEach(card => {
        const cardVal = card.dataset[dataAttr] || card.dataset.cat || card.dataset.stage;
        const show = val === 'all' || cardVal === val;
        card.classList.toggle('hidden', !show);
      });
    });
  });
}

// ── Science category filter ───────────────────────────────────────
initPillFilter('science-pills', '#science-grid .news-card', 'cat');

// ── Pipeline stage filter ─────────────────────────────────────────
(function initPipelineFilter() {
  const container = document.getElementById('stage-pills');
  if (!container) return;

  const pills = container.querySelectorAll('.cat-pill');
  const rows  = document.querySelectorAll('#pipeline-body tr');

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const stage = pill.dataset.stage;
      rows.forEach(row => {
        row.classList.toggle('hidden', stage !== 'all' && row.dataset.stage !== stage);
      });
    });
  });
})();

// ── Company card stage filter ─────────────────────────────────────
initPillFilter('company-stage-pills', '#company-strip .company-card', 'stage');

// ── Table Sort ────────────────────────────────────────────────────
function initTableSort(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll('th[data-col]');
  let lastCol = null;
  let ascending = true;

  headers.forEach((th, colIdx) => {
    th.addEventListener('click', () => {
      if (lastCol === colIdx) {
        ascending = !ascending;
      } else {
        ascending = true;
        lastCol = colIdx;
      }

      // Reset all sort icons
      headers.forEach(h => {
        const icon = h.querySelector('.sort-icon');
        if (icon) icon.textContent = '⇅';
      });
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = ascending ? '↑' : '↓';

      const tbody = table.querySelector('tbody');
      const rows  = Array.from(tbody.querySelectorAll('tr'));

      rows.sort((a, b) => {
        const aCell = a.cells[colIdx];
        const bCell = b.cells[colIdx];
        if (!aCell || !bCell) return 0;

        const aText = aCell.textContent.trim().toLowerCase();
        const bText = bCell.textContent.trim().toLowerCase();

        // Try numeric sort
        const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return ascending ? aNum - bNum : bNum - aNum;
        }

        return ascending
          ? aText.localeCompare(bText)
          : bText.localeCompare(aText);
      });

      rows.forEach(row => tbody.appendChild(row));
    });
  });
}

initTableSort('pipeline-table');

// ── Countdown Labels (PDUFA / Catalyst dates) ─────────────────────
function initCountdowns() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  document.querySelectorAll('[data-pdufa]').forEach(el => {
    const dateStr = el.dataset.pdufa;
    if (!dateStr) return;

    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

    const label = el.querySelector('.countdown-label');
    if (!label) return;

    if (diff === 0)      label.textContent = '· Today';
    else if (diff === 1) label.textContent = '· Tomorrow';
    else if (diff > 0)   label.textContent = `· in ${diff}d`;
    else                 label.textContent = `· ${Math.abs(diff)}d ago`;
  });
}

initCountdowns();

// ── Heatmap Cell Colors ───────────────────────────────────────────
document.querySelectorAll('.heatmap-cell').forEach(cell => {
  const intensity = parseFloat(cell.dataset.intensity || '0.5');
  cell.style.background = `rgba(0, 212, 170, ${intensity})`;
  cell.style.border = '1px solid rgba(0, 212, 170, 0.15)';
});

// ── Market Tiles: apply positive/negative classes ─────────────────
document.querySelectorAll('.market-tile[data-change]').forEach(tile => {
  const change = parseFloat(tile.dataset.change);
  const el = tile.querySelector('.tile-change');
  if (!el) return;
  el.classList.toggle('positive', change >= 0);
  el.classList.toggle('negative', change < 0);
});

// ── Active Nav on Scroll ──────────────────────────────────────────
function initActiveNav() {
  const sections = ['science', 'companies', 'investing'];
  const navLinks = document.querySelectorAll('.nav-link[data-section]');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.25, rootMargin: '-60px 0px -60px 0px' });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

initActiveNav();

// ── Mobile Nav ────────────────────────────────────────────────────
const navToggle = document.getElementById('nav-toggle');
const nav       = document.getElementById('main-nav');

navToggle.addEventListener('click', () => {
  nav.classList.toggle('open');
  navToggle.innerHTML = nav.classList.contains('open') ? '&times;' : '&#9776;';
});

nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    navToggle.innerHTML = '&#9776;';
  });
});

// ── Newsletter Form ───────────────────────────────────────────────
function handleSubscribe(e) {
  e.preventDefault();
  const msg = document.getElementById('success-msg');
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Subscribing…';

  setTimeout(() => {
    btn.style.display = 'none';
    msg.style.display = 'block';
  }, 900);
}

// ── Scroll-in animation ───────────────────────────────────────────
const animObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      animObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll(
  '.news-card, .pillar-card, .market-tile, .company-card, .fda-entry, .funding-entry, .stat, .pub-card'
).forEach(el => {
  el.classList.add('anim-in');
  animObserver.observe(el);
});
