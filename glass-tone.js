// Sample the backdrop at nine points so the material stays legible on both
// bright and dark wallpapers without painting an opaque white centre.
export function updateGlassTone(el, wall = document.querySelector('.wall'), control = false) {
  const image = wall?.querySelector('img.on');
  let samples = [];
  if (image?.complete && image.naturalWidth) {
    try {
      const rect = el.getBoundingClientRect();
      const bounds = wall.getBoundingClientRect();
      const cover = Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
      const imageLeft = bounds.left + (bounds.width - image.naturalWidth * cover) / 2;
      const imageTop = bounds.top + (bounds.height - image.naturalHeight * cover) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 3;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const sx = (rect.left + rect.width * (x + .5) / 3 - imageLeft) / cover;
        const sy = (rect.top + rect.height * (y + .5) / 3 - imageTop) / cover;
        ctx.drawImage(image, Math.max(0, Math.min(image.naturalWidth - 1, sx)),
          Math.max(0, Math.min(image.naturalHeight - 1, sy)), 1, 1, x, y, 1, 1);
      }
      const pixels = ctx.getImageData(0, 0, 3, 3).data;
      for (let i = 0; i < pixels.length; i += 4) {
        const linear = [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => {
          const c = v / 255;
          return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        });
        samples.push(linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722);
      }
    } catch { samples = []; }
  }
  if (!samples.length) {
    const rgb = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [244, 243, 238];
    samples = [rgb.reduce((sum, value, i) => sum + (value / 255) ** 2.2 * [.2126, .7152, .0722][i], 0)];
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const spread = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
  const complex = Math.min(1, spread * 2.5);
  const noWallpaper = !image?.complete || !image.naturalWidth;
  const lightGlass = mean < .5 || complex < .55;
  const neutralControl = control && mean >= .5;
  const alpha = neutralControl ? (noWallpaper ? .07 : .085 + .035 * complex)
    : noWallpaper ? .07 : lightGlass ? .06 + .16 * complex : .16 + .22 * complex;
  el.style.setProperty('--chat-glass-fill', neutralControl || noWallpaper
    ? `rgba(48,66,82,${alpha.toFixed(3)})`
    : lightGlass ? `rgba(255,255,255,${alpha.toFixed(3)})`
      : `rgba(20,20,24,${alpha.toFixed(3)})`);
  el.style.setProperty('--chat-glass-saturation', neutralControl ? '90%' : lightGlass ? '180%' : '160%');
  el.style.setProperty('--chat-glass-brightness', neutralControl ? '.97' : noWallpaper ? '1.02' : lightGlass ? '1.06' : '.8');
  el.classList.toggle('chat-glass-light', lightGlass);
}
