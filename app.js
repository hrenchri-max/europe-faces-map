(async function () {
  const [world, data] = await Promise.all([
    fetch('data/countries-50m.json').then(r => r.json()),
    fetch('data/europe.json').then(r => r.json()),
  ]);
  const thumb = (file, w) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=' + w;
  const byIso = new Map(data.countries.map(c => [c.iso_numeric, c]));
  const byCode = new Map(data.countries.map(c => [c.code, c]));
  const people = d3.group(data.people, p => p.country);

  const all = topojson.feature(world, world.objects.countries).features;
  const land = topojson.feature(world, world.objects.land);
  // keep only the European parts of each country (drops French Guiana, Reunion, the Canaries...)
  const inEurope = poly => { const [x, y] = d3.geoCentroid({ type: 'Polygon', coordinates: poly }); return x > -26 && x < 50 && y > 33 && y < 82; };
  const ours = all.filter(f => byIso.has(f.id)).map(f => f.geometry.type !== 'MultiPolygon' ? f
    : { ...f, geometry: { type: 'MultiPolygon', coordinates: f.geometry.coordinates.filter(inEurope) } });
  // view: Iceland to Ukraine, North Cape to Malta and Cyprus
  const extent = { type: 'MultiPoint', coordinates: [[-24.5, 66.5], [-10.5, 51.5], [-9.6, 37], [14.5, 35.7], [34.6, 34.6], [40.2, 49.5], [31, 71.2], [12, 71], [24, 34.9]] };

  const svg = d3.select('#map');
  const wrap = document.getElementById('mapwrap');
  const tip = document.getElementById('tip');
  const defs = svg.append('defs');
  defs.append('clipPath').attr('id', 'round').attr('clipPathUnits', 'objectBoundingBox')
    .append('circle').attr('cx', .5).attr('cy', .5).attr('r', .5);
  const gBase = svg.append('g');
  const gCtry = svg.append('g').attr('class', 'countries');
  const gLbl = svg.append('g');
  const gFace = svg.append('g');
  const bg = gBase.append('rect').attr('fill', 'transparent').on('click', () => setActive(null));
  let projection, path, active = null, W = 0, H = 0;

  function draw() {
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg.attr('viewBox', [0, 0, W, H]);
    const pad = W < 500 ? 6 : 18;
    projection = d3.geoAzimuthalEqualArea().rotate([-12, -52]).clipAngle(70).fitExtent([[pad, pad], [W - pad, H - pad]], extent);
    path = d3.geoPath(projection);
    bg.attr('width', W).attr('height', H);
    gBase.selectAll('path').data([land]).join('path').attr('class', 'land').attr('d', path);
    gCtry.selectAll('path').data(ours, f => f.id).join('path')
      .attr('class', 'ctry').attr('d', path).attr('fill', f => byIso.get(f.id).color)
      .attr('data-code', f => byIso.get(f.id).code)
      .on('mouseenter', (e, f) => setActive(byIso.get(f.id).code))
      .on('click', (e, f) => setActive(byIso.get(f.id).code));
    const small = W < 500;
    const fw = small ? 13 : 20, fh = fw * .75;
    const lbl = gLbl.selectAll('g.lbl').data(data.countries, c => c.code).join(enter => {
      const g = enter.append('g').attr('class', 'lbl');
      g.append('image').attr('preserveAspectRatio', 'none');
      g.append('rect');
      g.append('text').attr('text-anchor', 'middle');
      return g;
    });
    lbl.attr('transform', c => { const [x, y] = projection(c.label); return `translate(${x},${y})`; });
    lbl.select('image').attr('href', c => c.flag).attr('x', -fw / 2).attr('y', -fh).attr('width', fw).attr('height', fh);
    lbl.select('rect').attr('x', -fw / 2).attr('y', -fh).attr('width', fw).attr('height', fh);
    lbl.select('text').attr('y', small ? 8 : 11).style('font-size', small ? '7.5px' : '10px').text(c => c.code);
    if (active) showFaces(active);
  }

  function setActive(code) {
    if (code === active) return;
    active = code;
    gCtry.selectAll('path').classed('on', f => byIso.get(f.id).code === code);
    svg.classed('dim', !!code);
    d3.selectAll('#grid button').classed('on', function () { return this.dataset.code === code; });
    hideTip();
    showFaces(code);
    showPanel(code);
  }

  function showFaces(code) {
    const list = (people.get(code) || []);
    const r = W < 500 ? 10 : Math.max(14, Math.min(19, W / 60));
    const nodes = list.map((p, i) => { const [x, y] = projection([p.lon, p.lat]); return { p, tx: x, ty: y, x: x + Math.cos(i * 2.4) * 2, y: y + Math.sin(i * 2.4) * 2 }; });
    const sim = d3.forceSimulation(nodes).stop()
      .force('x', d3.forceX(d => d.tx).strength(.18))
      .force('y', d3.forceY(d => d.ty).strength(.18))
      .force('c', d3.forceCollide(r + 2).iterations(3));
    for (let i = 0; i < 260; i++) sim.tick();
    nodes.forEach(n => { n.x = Math.max(r + 2, Math.min(W - r - 2, n.x)); n.y = Math.max(r + 2, Math.min(H - r - 2, n.y)); });
    const g = gFace.selectAll('g.face').data(nodes, n => n.p.wikidata).join(enter => {
      const f = enter.append('g').attr('class', 'face').style('opacity', 0);
      f.append('line');
      f.append('circle').attr('class', 'dot');
      const a = f.append('a').attr('target', '_blank').attr('rel', 'noopener');
      a.append('circle').attr('class', 'ring');
      a.append('image').attr('clip-path', 'url(#round)').attr('preserveAspectRatio', 'xMidYMin slice');
      f.transition().duration(250).style('opacity', 1);
      return f;
    });
    g.select('line').attr('x1', n => n.tx).attr('y1', n => n.ty).attr('x2', n => n.x).attr('y2', n => n.y);
    g.select('.dot').attr('cx', n => n.tx).attr('cy', n => n.ty).attr('r', 2.2);
    g.select('a').attr('href', n => n.p.wikipedia).attr('aria-label', n => n.p.name + ', Wikipedia')
      .on('mouseenter', (e, n) => showTip(n)).on('mouseleave', hideTip).on('focus', (e, n) => showTip(n)).on('blur', hideTip);
    g.select('.ring').attr('cx', n => n.x).attr('cy', n => n.y).attr('r', r + 1.5);
    g.select('image').attr('href', n => thumb(n.p.image, 120)).attr('x', n => n.x - r).attr('y', n => n.y - r).attr('width', 2 * r).attr('height', 2 * r);
  }

  function showTip(n) {
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = n.p.name;
    const s = document.createElement('span'); s.textContent = n.p.about + '. Born in ' + n.p.born + '.';
    tip.append(b, s);
    tip.hidden = false;
    const x = n.x + 30, y = n.y - 10;
    tip.style.left = Math.min(x, W - 250) + 'px';
    tip.style.top = Math.max(4, Math.min(y, H - 90)) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function showPanel(code) {
    const el = document.getElementById('active');
    el.innerHTML = '';
    if (!code) { el.innerHTML = '<p class="meta">Hover or tap a country on the map, or pick one below.</p>'; return; }
    const c = byCode.get(code), list = people.get(code) || [];
    const h = document.createElement('h2');
    const img = document.createElement('img'); img.src = c.flag; img.alt = '';
    h.append(img, document.createTextNode(c.name + ' (' + c.code + ')'));
    const m = document.createElement('p'); m.className = 'meta';
    m.textContent = (c.group === 'EU' ? 'EU member' : 'Neighbor') + (list.length ? ' · ' + list.length + ' people, shown where they were born' : ' · Try Belgium, Germany or France to see their faces.');
    el.append(h, m);
    if (!list.length) return;
    const ol = document.createElement('ol');
    for (const p of list) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = p.wikipedia; a.target = '_blank'; a.rel = 'noopener';
      const im = document.createElement('img'); im.src = thumb(p.image, 120); im.alt = ''; im.loading = 'lazy';
      const t = document.createElement('div');
      const b = document.createElement('b'); b.textContent = p.name;
      const s = document.createElement('small'); s.textContent = p.about + ' · ' + p.born;
      t.append(b, s); a.append(im, t); li.append(a); ol.append(li);
    }
    el.append(ol);
  }

  const grid = d3.select('#grid');
  grid.selectAll('button').data(data.countries).join('button')
    .attr('type', 'button').attr('data-code', c => c.code).attr('title', c => c.name)
    .classed('has', c => people.has(c.code))
    .html(c => `<img src="${c.flag}" alt="">${c.code}`)
    .on('click', (e, c) => setActive(c.code));

  showPanel(null);
  draw();
  setActive('BE');
  window.addEventListener('resize', () => { const a = active; draw(); if (a) showFaces(a); });

  const audio = document.getElementById('anthem');
  const btn = document.getElementById('music');
  btn.addEventListener('click', async () => {
    if (audio.paused) {
      try { await audio.play(); } catch (err) { console.warn('music', err); return; }
    } else audio.pause();
  });
  audio.addEventListener('play', () => { btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.lbl').textContent = 'Pause music'; });
  audio.addEventListener('pause', () => { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('.lbl').textContent = 'Play music'; });
})();
