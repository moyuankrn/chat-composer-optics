// Bend the fixed wallpaper only along the composer's inner edge. Keeping the
// centre live avoids smearing message text as it scrolls behind the input.
export function composerGlassFallback(elements) {
  const wall = document.querySelector('.wall');
  if (!wall) return () => {};
  let frame = 0;
  const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const image = () => wall.querySelector('img.on');

  function draw() {
    frame = 0;
    const img = image();
    if (!img?.complete || !img.naturalWidth) {
      for (const el of elements) el.style.backgroundImage = '';
      return;
    }
    const view = wall.getBoundingClientRect();
    const cover = Math.max(view.width / img.naturalWidth, view.height / img.naturalHeight);
    const imageLeft = view.left + (view.width - img.naturalWidth * cover) / 2;
    const imageTop = view.top + (view.height - img.naturalHeight * cover) / 2;
    const density = Math.min(devicePixelRatio || 1, 2);
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const width = Math.round(rect.width * density), height = Math.round(rect.height * density);
      const margin = Math.round(18 * density);
      const source = document.createElement('canvas');
      source.width = width + margin * 2; source.height = height + margin * 2;
      const sourceContext = source.getContext('2d', { willReadFrequently: true });
      try {
        const theme = getComputedStyle(document.body);
        const wallBlur = parseFloat(theme.getPropertyValue('--convo-blur')) || 0;
        sourceContext.filter = `blur(${Math.min(wallBlur * density, 24)}px)`;
        sourceContext.drawImage(img,
          (rect.left - margin / density - imageLeft) / cover,
          (rect.top - margin / density - imageTop) / cover,
          source.width / density / cover, source.height / density / cover,
          0, 0, source.width, source.height);
        sourceContext.filter = 'none';
        sourceContext.globalAlpha = Math.min(.4, (parseFloat(theme.getPropertyValue('--convo-veil')) || 12) / 100);
        sourceContext.fillStyle = theme.getPropertyValue('--bg').trim() || '#f4f3ee';
        sourceContext.fillRect(0, 0, source.width, source.height);
        sourceContext.globalAlpha = 1;
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        const result = document.createElement('canvas');
        result.width = width; result.height = height;
        const resultContext = result.getContext('2d');
        const out = resultContext.createImageData(width, height);
        const radius = Math.min(width, height) / 2;
        const bevel = Math.min(11 * density, height * .3);
        const distance = (x, y) => {
          const qx = Math.abs(x - width / 2) - (width / 2 - radius);
          const qy = Math.abs(y - height / 2) - (height / 2 - radius);
          return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
        };
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const depth = -distance(x + .5, y + .5);
          if (depth <= 0 || depth >= bevel) continue;
          const nx = (distance(x + 1.5, y + .5) - distance(x - .5, y + .5)) / 2;
          const ny = (distance(x + .5, y + 1.5) - distance(x + .5, y - .5)) / 2;
          const magnitude = Math.hypot(nx, ny) || 1;
          const t = depth / bevel;
          const shift = 9 * density * (1 - t) ** 1.4;
          const sx = Math.round(x + margin - nx / magnitude * shift);
          const sy = Math.round(y + margin - ny / magnitude * shift);
          if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
          const src = (sy * source.width + sx) * 4, dst = (y * width + x) * 4;
          out.data[dst] = pixels[src]; out.data[dst + 1] = pixels[src + 1];
          out.data[dst + 2] = pixels[src + 2];
          out.data[dst + 3] = Math.round(pixels[src + 3] * .22 * Math.sin(Math.PI * t));
        }
        resultContext.putImageData(out, 0, 0);
        el.style.backgroundImage = `url("${result.toDataURL('image/png')}")`;
      } catch { el.style.backgroundImage = ''; }
    }
  }

  const resize = new ResizeObserver(queue);
  elements.forEach(el => resize.observe(el));
  const changes = new MutationObserver(queue);
  changes.observe(wall, { subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
  wall.addEventListener('load', queue, true);
  window.addEventListener('resize', queue);
  window.visualViewport?.addEventListener('resize', queue);
  queue();
  return () => {
    cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect();
    wall.removeEventListener('load', queue, true);
    window.removeEventListener('resize', queue);
    window.visualViewport?.removeEventListener('resize', queue);
    for (const el of elements) el.style.backgroundImage = '';
  };
}
