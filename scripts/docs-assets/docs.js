(function () {
  var doc = document;
  var root = doc.documentElement;

  var menu = doc.querySelector('.menu-btn');
  if (menu) {
    menu.addEventListener('click', function () {
      var open = doc.body.classList.toggle('nav-open');
      menu.setAttribute('aria-expanded', String(open));
    });
    doc.querySelectorAll('.sidebar a').forEach(function (a) {
      a.addEventListener('click', function () {
        doc.body.classList.remove('nav-open');
        menu.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var themeBtn = doc.querySelector('.theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('pt-docs-theme', next); } catch (e) {}
    });
  }

  doc.querySelectorAll('.doc pre').forEach(function (pre) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var text = code ? code.textContent : pre.textContent;
      var done = function (ok) {
        btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var range = doc.createRange();
        range.selectNodeContents(code || pre);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done(false);
      }
    });
    pre.appendChild(btn);
  });

  var input = doc.getElementById('doc-search');
  var list = doc.getElementById('doc-results');
  if (!input || !list) return;
  var index = null;
  var loading = null;
  var active = -1;

  function load() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch('/docs/search-index.json').then(function (r) {
        if (!r.ok) throw new Error('index ' + r.status);
        return r.json();
      }).then(function (j) { index = j; return j; });
    }
    return loading;
  }

  function terms(q) {
    return q.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  }

  function search(q) {
    var ts = terms(q);
    if (!ts.length) return [];
    var hits = [];
    index.forEach(function (page) {
      page.s.forEach(function (s) {
        var h = s.h.toLowerCase();
        var x = s.x.toLowerCase();
        var t = page.t.toLowerCase();
        var score = 0;
        for (var i = 0; i < ts.length; i++) {
          var term = ts[i];
          var inH = h.indexOf(term) >= 0;
          var inX = x.indexOf(term) >= 0;
          var inT = t.indexOf(term) >= 0;
          if (!inH && !inX && !inT) return;
          score += (inH ? 6 : 0) + (inT ? 2 : 0) + (inX ? 1 : 0);
        }
        hits.push({ page: page, s: s, score: score });
      });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, 8);
  }

  function snippet(text, ts) {
    if (!text) return '';
    var low = text.toLowerCase();
    var at = -1;
    for (var i = 0; i < ts.length && at < 0; i++) at = low.indexOf(ts[i]);
    var start = Math.max(0, at - 40);
    return (start ? '...' : '') + text.slice(start, start + 120) + (text.length > start + 120 ? '...' : '');
  }

  function show(hits, q) {
    list.textContent = '';
    active = -1;
    if (!q.trim()) { hide(); return; }
    if (!hits.length) {
      var empty = doc.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No results for "' + q + '". Try a tool name or a single word.';
      list.appendChild(empty);
    }
    var ts = terms(q);
    hits.forEach(function (h) {
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.href = h.page.u + (h.s.id ? '#' + h.s.id : '');
      var t = doc.createElement('strong');
      t.textContent = h.s.h && h.s.h !== h.page.t ? h.page.t + ' / ' + h.s.h : h.page.t;
      var p = doc.createElement('span');
      p.textContent = snippet(h.s.x, ts);
      a.appendChild(t);
      a.appendChild(p);
      li.appendChild(a);
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function hide() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function move(d) {
    var items = list.querySelectorAll('a');
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    items[active].focus();
  }

  input.addEventListener('focus', function () { load().catch(function () {}); });
  input.addEventListener('input', function () {
    var q = input.value;
    load().then(function () { show(search(q), q); }, function () {
      list.textContent = '';
      var err = doc.createElement('li');
      err.className = 'empty';
      err.textContent = 'Search is unavailable right now. Reload the page to try again.';
      list.appendChild(err);
      list.hidden = false;
    });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'Escape') { input.value = ''; hide(); }
  });
  list.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (active <= 0) { input.focus(); active = -1; } else move(-1); }
    if (e.key === 'Escape') { hide(); input.focus(); }
  });
  doc.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.search')) hide();
  });
  doc.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); input.focus(); }
  });
})();
