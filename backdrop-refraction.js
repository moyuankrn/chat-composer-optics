// A live backdrop displacement lens. One SVG hosts filters for currently
// visible surfaces; the browser samples scrolling content beneath each one.
export function createBackdropRefraction() {
  if (!/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) ||
      !CSS.supports('backdrop-filter', 'url("#glass-probe")')) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
  document.body.append(svg);
  const records = new Map();
  const resize = new ResizeObserver(entries => {
    for (const { target } of entries) update(target);
  });
  let sequence = 0;

  const distanceFor = (width, height, radii) => (x, y) => {
    const radius = radii[y < height / 2 ? (x < width / 2 ? 0 : 1) : (x < width / 2 ? 3 : 2)];
    const qx = Math.abs(x - width / 2) - (width / 2 - radius);
    const qy = Math.abs(y - height / 2) - (height / 2 - radius);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };

  function update(el) {
    const record = records.get(el);
    if (!record) return;
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (!width || !height || (width === record.width && height === record.height)) return;
    record.width = width; record.height = height;
    const style = getComputedStyle(el);
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius]
      .map(value => Math.min(parseFloat(value) || 0, width / 2, height / 2));
    const sdf = distanceFor(width, height, radii);
    const band = Math.min(record.band, height * record.bandHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const depth = Math.max(0, -sdf(x + .5, y + .5));
      const falloff = Math.max(0, 1 - depth / band) ** 1.8;
      const nx = sdf(x + 1.5, y + .5) - sdf(x - .5, y + .5);
      const ny = sdf(x + .5, y + 1.5) - sdf(x + .5, y - .5);
      const length = Math.hypot(nx, ny) || 1;
      const offset = (y * width + x) * 4;
      pixels.data[offset] = Math.round(128 - nx / length * falloff * 112);
      pixels.data[offset + 1] = Math.round(128 - ny / length * falloff * 112);
      pixels.data[offset + 2] = 128;
      pixels.data[offset + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    record.map.setAttribute('width', String(width));
    record.map.setAttribute('height', String(height));
    record.map.setAttribute('href', canvas.toDataURL('image/png'));
  }

  function attach(el, { strength = 36, band = 27, bandHeight = .4 } = {}) {
    if (records.has(el)) return;
    const filter = document.createElementNS(ns, 'filter');
    const id = `glass-refraction-${Date.now()}-${sequence++}`;
    filter.id = id;
    filter.setAttribute('x', '0%'); filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%');
    const map = document.createElementNS(ns, 'feImage');
    map.setAttribute('x', '0'); map.setAttribute('y', '0');
    map.setAttribute('preserveAspectRatio', 'none'); map.setAttribute('result', 'map');
    const displacement = document.createElementNS(ns, 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic'); displacement.setAttribute('in2', 'map');
    displacement.setAttribute('scale', String(strength));
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    filter.append(map, displacement); svg.append(filter);
    records.set(el, { filter, map, width: 0, height: 0, band, bandHeight });
    el.classList.add('has-backdrop-refraction');
    el.style.setProperty('backdrop-filter', `url("#${id}")`, 'important');
    el.style.setProperty('-webkit-backdrop-filter', `url("#${id}")`, 'important');
    resize.observe(el);
    update(el);
  }

  function detach(el) {
    const record = records.get(el);
    if (!record) return;
    resize.unobserve(el);
    record.filter.remove(); records.delete(el);
    el.classList.remove('has-backdrop-refraction');
    el.style.removeProperty('backdrop-filter');
    el.style.removeProperty('-webkit-backdrop-filter');
  }

  return { attach, detach, dispose() {
    for (const el of records.keys()) detach(el);
    resize.disconnect(); svg.remove();
  } };
}
