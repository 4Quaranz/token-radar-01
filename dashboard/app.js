// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable and sortable table, a per-protocol detail
// drawer with the model's own inputs and the protocol's farm plan, the live-token view, and the
// model itself. No network: every byte it shows is in data.js.
//
// The farm plan and the implied value are the same derivations main.ts writes to board.json:
// category, chains, TVL and age decide the action, the capital, the hold and every cost and time.
// No name is special-cased. The category multiple is the snapshot's own: the median market-cap
// over TVL of the category's live-token protocols, shrunk toward the global median.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var watchSet = {};
  DATA.rows.forEach(function (r) { watchSet[r.slug] = false; });
  // The watchlist is the floor: mark its rows so the board can filter and tag them.
  (DATA.watchlist_slugs || []).forEach(function (s) { watchSet[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return "Join " + name + "'s next launch on " + chain + ' with $' + capital + ' and hold the allocation.';
    if (c.indexOf('ai') >= 0) return 'Use ' + name + ' on ' + chain + ' with $' + capital + ' of activity and keep the usage history.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the deposit on ' + name + ' and repay it within the week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + ' through ' + name + "'s pool on " + chain + ' once, then leave the liquidity in place.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back through ' + name + ' so the record shows two-way use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Add a second, smaller stake through ' + name + ' a week later and keep both receipts.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one half the size the next week.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first market on ' + name + ' and place a second, smaller position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Top up the ' + name + ' vault with $' + small + ' after the first week.';
    if (c.indexOf('stable') >= 0) return 'Redeem a small part of the stable position on ' + name + ' and re-mint it the same week.';
    if (c.indexOf('rwa') >= 0) return 'Reinvest the first yield payout from ' + name + ' back into the same asset.';
    if (c.indexOf('insurance') >= 0) return 'File a test claim on ' + name + ' only if a covered event happens; never fake one.';
    return 'Repeat the first action with $' + small + ' a week later so the record shows repeat use.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + (capital >= 150 ? 6 : 3) + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !watchSet[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'implied') { va = a.implied_value_usd; vb = b.implied_value_usd; }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'change') { va = a.change_7d === null ? 0 : a.change_7d; vb = b.change_7d === null ? 0 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else { va = a.rank; vb = b.rank; }
      return (va - vb) * dir || (a.rank - b.rank);
    });
    return rows;
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
    return el('button', { type: 'button', text: label + arrow, onclick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
      render();
    } });
  }

  function renderTable(rows) {
    var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    var table = el('table', null);
    var head = el('thead', null, el('tr', null,
      el('th', null, sortButton('Rank', 'rank')),
      el('th', null, el('span', { text: 'Protocol' })),
      el('th', null, el('span', { text: 'Chains' })),
      el('th', null, sortButton('TVL', 'tvl')),
      el('th', null, sortButton('7d', 'change')),
      el('th', null, sortButton('Age', 'age')),
      el('th', null, sortButton('Implied value', 'implied'))
    ));
    var body = el('tbody', null);
    rows.forEach(function (r) {
      var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', onclick: function () { state.selected = r.slug; render(); } });
      var nameCell = el('td', null);
      var nameWrap = el('div', { class: 'name' }, el('b', { text: r.name }));
      var sub = el('span', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Uncategorized') });
      nameWrap.appendChild(sub);
      var tags = el('div', null);
      if (r.rank <= 10) tags.appendChild(el('span', { class: 'tag hot', text: 'TOP 10' }));
      if (watchSet[r.slug]) tags.appendChild(el('span', { class: 'tag watch', text: 'WATCHLIST' }));
      if (tags.childNodes.length) nameWrap.appendChild(tags);
      nameCell.appendChild(nameWrap);
      var chg = el('span', { class: r.change_7d !== null && r.change_7d < 0 ? 'neg' : 'pos', text: fmtPct(r.change_7d) });
      var bar = el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(1, Math.round(100 * r.implied_value_usd / maxImplied)) + '%' }));
      var implied = el('div', { class: 'implied' }, el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }), bar);
      tr.appendChild(el('td', { class: 'num', text: '#' + r.rank }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { text: r.chains.length ? r.chains.join(', ') : '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', null, chg));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', null, implied));
      body.appendChild(tr);
    });
    table.appendChild(head);
    table.appendChild(body);
    return table;
  }

  function renderLive() {
    var table = el('table', null);
    var head = el('thead', null, el('tr', null,
      el('th', null, el('span', { text: 'Protocol' })),
      el('th', null, el('span', { text: 'Chains' })),
      el('th', null, el('span', { text: 'TVL' })),
      el('th', null, el('span', { text: 'Market cap' })),
      el('th', null, el('span', { text: '7d' }))
    ));
    var body = el('tbody', null);
    DATA.live.forEach(function (r) {
      var tr = el('tr', { onclick: function () { state.selected = r.slug; render(); } });
      tr.appendChild(el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Uncategorized') }))));
      tr.appendChild(el('td', { text: r.chains.length ? r.chains.join(', ') : '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
      tr.appendChild(el('td', null, el('span', { class: r.change_7d !== null && r.change_7d < 0 ? 'neg' : 'pos', text: fmtPct(r.change_7d) })));
      body.appendChild(tr);
    });
    table.appendChild(head);
    table.appendChild(body);
    return table;
  }

  function renderDetail() {
    var slug = state.selected;
    if (!slug) return null;
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    var live = null;
    if (!row) DATA.live.forEach(function (r) { if (r.slug === slug) live = r; });
    if (!row && !live) return null;
    var p = row || live;
    var detail = el('aside', { class: 'detail', role: 'dialog', 'aria-label': p.name });
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'status', text: row ? 'Pre-token · records no token' : 'Live token · already trades' }),
        el('h2', { text: p.name }),
        el('div', { class: 'sub', text: p.slug + ' · ' + (p.category || 'Uncategorized') })
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { state.selected = null; render(); } })
    );
    detail.appendChild(head);
    var stats = el('div', { class: 'detail-section' }, el('h3', { text: 'Snapshot' }));
    var grid = el('div', { class: 'stat-grid' });
    grid.appendChild(el('div', { class: 'fact' }, el('span', { text: 'TVL' }), el('b', { text: fmtMoney(p.tvl_usd) })));
    grid.appendChild(el('div', { class: 'fact' }, el('span', { text: '7-day change' }), el('b', { text: fmtPct(p.change_7d) })));
    grid.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Chains' }), el('b', { text: p.chains.length ? p.chains.join(', ') : '—' })));
    grid.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Listed' }), el('b', { text: row && row.listed_at ? row.listed_at : 'unknown' })));
    if (live) grid.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Market cap' }), el('b', { text: fmtMoney(live.mcap_usd) })));
    stats.appendChild(grid);
    detail.appendChild(stats);
    if (row) {
      var eq = el('div', { class: 'detail-section' }, el('h3', { text: 'Implied value — how the number is built' }));
      var lines = el('div', { class: 'equation' });
      lines.appendChild(el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtMoney(row.tvl_usd) })));
      lines.appendChild(el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Uncategorized') + ')' }), el('b', { text: fmtMult(row.category_multiple) })));
      lines.appendChild(el('div', null, el('span', { text: 'Growth (' + fmtPct(row.change_7d) + ' over 7d)' }), el('b', { text: fmtMult(row.growth_multiplier) })));
      lines.appendChild(el('div', null, el('span', { text: 'Maturity (' + fmtAge(row.age_days) + ' listed)' }), el('b', { text: fmtMult(row.maturity_multiplier) })));
      lines.appendChild(el('div', null, el('span', { text: 'Chain breadth (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')' }), el('b', { text: fmtMult(row.breadth_multiplier) })));
      lines.appendChild(el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtMoney(row.implied_value_usd) })));
      eq.appendChild(lines);
      eq.appendChild(el('p', { text: 'The category multiple is the snapshot\u2019s own: the median market-cap over TVL of the category\u2019s live-token protocols, shrunk toward the global median.' }));
      detail.appendChild(eq);
      var plan = el('div', { class: 'detail-section' }, el('h3', { text: 'How to farm it' }));
      var steps = el('ol', { class: 'steps' });
      farmSteps(row).forEach(function (s, i) {
        var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
        var li = el('li', null);
        if (m) {
          li.appendChild(el('b', { text: 'Step ' + (i + 1) + ' — ' + m[1] }));
          li.appendChild(el('span', { class: 'cost', text: 'Cost: ' + m[2] + ' · Time: ' + m[3] }));
        } else {
          li.appendChild(el('b', { text: 'Step ' + (i + 1) }));
          li.appendChild(el('span', { text: s }));
        }
        steps.appendChild(li);
      });
      plan.appendChild(steps);
      detail.appendChild(plan);
      detail.appendChild(el('div', { class: 'detail-section' },
        el('p', { text: 'This protocol records no token in the snapshot. That is DefiLlama\u2019s record, not proof it has none: check the protocol\u2019s own pages before you farm it. Implied value is this radar\u2019s own claim, never a promise of a launch or a price.' })));
    } else {
      detail.appendChild(el('div', { class: 'detail-section' },
        el('h3', { text: 'Already trading' }),
        el('p', { text: 'This protocol already has a token that trades, so the board shows the market\u2019s own value for it and never mixes it into the pre-token ranking. There is no launch left to farm here.' })));
    }
    return detail;
  }

  function renderModel() {
    var m = DATA.model;
    var section = el('section', { class: 'panel model' },
      el('h2', { text: 'The model — ' + DATA.model_version }),
      el('p', { text: 'Implied value = TVL × category multiple × growth × maturity × chain breadth. The category multiple is read off this snapshot, not set by hand: for each category it is the median market-cap over TVL of that category\u2019s live-token protocols, shrunk toward the global median when the sample is small, then clamped to 0.05–1.50; a category with fewer than 3 live protocols takes the global median. Growth clamps the 7-day TVL change to −60…+120% and weights it by ' + m.growth_weight + '. Maturity runs 0.6 for a new protocol to 1.0 after ' + m.maturity_days + ' days listed. Chain breadth adds ' + (m.breadth_per_chain * 100) + '% per extra chain, up to ' + m.breadth_max_chains + ' extra chains.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round(TVL × catMult × (1 + clamp(chg7d, −60, 120) / 100 × 0.5) × (0.6 + min(age, 1095) / 1095 × 0.4) × (1 + 0.02 × min(chains − 1, 5)))' })
      )
    );
    var top = DATA.category_multiples.slice(0, 10);
    var table = el('table', { class: 'mult-table' });
    table.appendChild(el('thead', null, el('tr', null,
      el('th', { text: 'Category' }),
      el('th', { class: 'num', text: 'Multiple' }),
      el('th', { class: 'num', text: 'Live protocols' }),
      el('th', { class: 'num', text: 'Median mcap / TVL' })
    )));
    var body = el('tbody', null);
    top.forEach(function (c) {
      var tr = el('tr', null);
      tr.appendChild(el('td', { text: c.category }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(c.multiple) }));
      tr.appendChild(el('td', { class: 'num', text: String(c.live_count) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(c.median_ratio) }));
      body.appendChild(tr);
    });
    var gr = el('tr', null);
    gr.appendChild(el('td', { text: 'Global (all live protocols)' }));
    gr.appendChild(el('td', { class: 'num', text: fmtMult(DATA.global_multiple) }));
    gr.appendChild(el('td', { class: 'num', text: '—' }));
    gr.appendChild(el('td', { class: 'num', text: '—' }));
    body.appendChild(gr);
    table.appendChild(body);
    section.appendChild(el('h3', { text: 'Category multiples from this snapshot — top 10' }));
    section.appendChild(table);
    return section;
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    var top = el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Model ' + DATA.model_version }),
        el('span', { text: 'Floor ' + fmtUsd(DATA.floor_usd) })
      )
    );
    shell.appendChild(top);
    var lede = el('div', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { text: 'The radar reads a sealed snapshot of 758 protocols, keeps the ones that record no token, and ranks them by what a token would be worth if the protocol\u2019s record stayed as it is. The price comes from the snapshot itself: each category is priced off its own live-token protocols. Click a row for the farm plan.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist (floor $50M, no token)' }), el('b', { text: String(DATA.watchlist_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Ranked board' }), el('b', { text: String(DATA.board_size) + ' rows' })),
        el('div', { class: 'fact' }, el('span', { text: 'Early finds below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtMoney(DATA.rows.length ? DATA.rows[0].implied_value_usd : 0) }))
      )
    );
    shell.appendChild(lede);

    var controls = el('div', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol or slug…', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; render(); } });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Search' }), search));
    var cats = ['all'];
    DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorized'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    var catSel = el('select', { 'aria-label': 'Filter by category', onchange: function (e) { state.category = e.target.value; render(); } });
    cats.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All categories' : c });
      if (state.category === c) o.selected = true;
      catSel.appendChild(o);
    });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel));
    var chains = ['all'];
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var chainSel = el('select', { 'aria-label': 'Filter by chain', onchange: function (e) { state.chain = e.target.value; render(); } });
    chains.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All chains' : c });
      if (state.chain === c) o.selected = true;
      chainSel.appendChild(o);
    });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel));
    var watchBox = el('input', { type: 'checkbox', id: 'watch-only', checked: state.watchOnly ? true : null, onchange: function (e) { state.watchOnly = e.target.checked; render(); } });
    controls.appendChild(el('label', { class: 'check', for: 'watch-only' }, watchBox, el('span', { text: 'Watchlist only' })));
    var tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Board view' });
    tabs.appendChild(el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } }));
    tabs.appendChild(el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } }));
    controls.appendChild(tabs);
    shell.appendChild(controls);

    var panel = el('div', { class: 'panel' });
    var wrap = el('div', { class: 'table-wrap' });
    var count = el('div', { class: 'count' });
    if (state.tab === 'pre-token') {
      var rows = filteredRows();
      wrap.appendChild(renderTable(rows));
      count.textContent = rows.length + ' of ' + DATA.board_size + ' rows';
    } else {
      wrap.appendChild(renderLive());
      count.textContent = DATA.live.length + ' live-token protocols';
    }
    panel.appendChild(wrap);
    shell.appendChild(panel);
    var countRow = el('div', { class: 'controls' }, count);
    shell.appendChild(countRow);
    if (state.tab === 'pre-token' && filteredRows().length === 0) {
      panel.appendChild(el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches' }),
        el('p', { text: 'Loosen the search or clear a filter.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; render(); } })
      ));
    }
    shell.appendChild(renderModel());
    shell.appendChild(el('p', { class: 'note' },
      el('b', { text: 'Read this first. ' }),
      document.createTextNode('Implied value is this radar\u2019s own claim from the snapshot\u2019s figures, never a promise that a token launches or what it would trade at. A protocol the snapshot records as having no token may still have one its record does not carry. Never pay to claim an airdrop, and never connect a wallet holding funds you cannot lose. Snapshot source: ' + DATA.source + '.')
    ));
    app.appendChild(shell);
    var detail = renderDetail();
    if (detail) app.appendChild(detail);
  }

  render();
})();
