import { createBackdropRefraction } from './backdrop-refraction.js';

// A single wallpaper crop feeds every composer lens. WebGL bends that crop
// across the whole control while the live chat remains visible underneath.
const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = (position + 1.0) * 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D backdrop;
uniform vec4 rect;
uniform vec2 screen;
uniform float radius;
uniform float time;
uniform float strength;

float roundedBox(vec2 p) {
  vec2 halfSize = rect.zw * 0.5;
  vec2 q = abs(p - halfSize) - (halfSize - vec2(radius));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 local = vec2(uv.x * rect.z, (1.0 - uv.y) * rect.w);
  float distance = roundedBox(local);
  float inside = max(0.0, -distance);
  float mask = 1.0 - smoothstep(-0.5, 1.0, distance);
  if (mask <= 0.0) discard;

  vec2 normal = normalize(vec2(
    roundedBox(local + vec2(0.75, 0.0)) - roundedBox(local - vec2(0.75, 0.0)),
    roundedBox(local + vec2(0.0, 0.75)) - roundedBox(local - vec2(0.0, 0.75))
  ) + vec2(0.00001));
  float edgeWidth = min(25.0, rect.w * 0.32);
  float edge = exp(-inside / max(edgeWidth, 1.0));
  vec2 flow = vec2(sin(local.y * 0.043 + time * 0.7),
                   cos(local.x * 0.039 - time * 0.5)) * (0.45 + 0.9 * edge);
  vec2 sampleAt = rect.xy + local - normal * strength * pow(edge, 1.4) + flow;
  vec2 textureUv = clamp(vec2(sampleAt.x / screen.x, 1.0 - sampleAt.y / screen.y), 0.001, 0.999);
  vec3 color = texture2D(backdrop, textureUv).rgb;

  float angle = atan(normal.y, normal.x);
  float hairline = exp(-pow((inside + 0.55) / 0.62, 2.0));
  float upperLeft = exp(-pow((angle + 2.38) / 0.60, 2.0));
  float lowerRight = exp(-pow((angle - 0.76) / 0.62, 2.0));
  float glint = hairline * (upperLeft * 0.66 + lowerRight * 0.48);
  color = mix(color, vec3(1.0), clamp(glint * 0.35, 0.0, 0.22));
  gl_FragColor = vec4(color, mask * 0.46);
}`;

function shader(gl, type, source) {
  const value = gl.createShader(type);
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
  return value;
}

function createLens(el) {
  const canvas = document.createElement('canvas');
  canvas.className = 'composer-optics';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
  if (!gl) return null;
  const program = gl.createProgram();
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vertex); gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'backdrop'), 0);
  el.append(canvas);
  el.classList.add('has-composer-optics');
  return { el, canvas, gl, program, buffer, texture,
    rect: gl.getUniformLocation(program, 'rect'),
    screen: gl.getUniformLocation(program, 'screen'),
    radius: gl.getUniformLocation(program, 'radius'),
    time: gl.getUniformLocation(program, 'time'),
    strength: gl.getUniformLocation(program, 'strength') };
}

export function mountComposerOptics(elements) {
  const live = createBackdropRefraction();
  if (live) {
    elements.forEach(el => live.attach(el));
    return () => live.dispose();
  }
  const wall = document.querySelector('.wall');
  if (!wall || !document.createElement('canvas').getContext('webgl')) return null;
  const lenses = [];
  try {
    for (const el of elements) {
      const lens = createLens(el);
      if (!lens) throw new Error('WebGL unavailable');
      lenses.push(lens);
    }
  } catch {
    for (const lens of lenses) { lens.canvas.remove(); lens.el.classList.remove('has-composer-optics'); }
    return null;
  }
  const source = document.createElement('canvas');
  let sourceDirty = true;
  let frame = 0;
  let disposed = false;

  const upload = () => {
    const image = wall.querySelector('img.on');
    if (!image?.complete || !image.naturalWidth) return false;
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    if (source.width !== w || source.height !== h) { source.width = w; source.height = h; }
    const ctx = source.getContext('2d');
    const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const iw = image.naturalWidth * cover, ih = image.naturalHeight * cover;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    for (const lens of lenses) {
      const { gl, texture } = lens;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    sourceDirty = false;
    return true;
  };

  const draw = now => {
    frame = 0;
    if (disposed || document.hidden) return;
    if (sourceDirty && !upload()) return;
    for (const lens of lenses) {
      const { el, canvas, gl, program } = lens;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const density = Math.min(devicePixelRatio || 1, 2);
      const width = Math.ceil(rect.width * density), height = Math.ceil(rect.height * density);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform4f(lens.rect, rect.left, rect.top, rect.width, rect.height);
      gl.uniform2f(lens.screen, innerWidth, innerHeight);
      gl.uniform1f(lens.radius, Math.min(rect.height / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || rect.height / 2));
      gl.uniform1f(lens.time, now / 1000);
      gl.uniform1f(lens.strength, Math.min(26, rect.height * .24));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
  const refresh = () => { sourceDirty = true; if (!frame) frame = requestAnimationFrame(draw); };
  const resize = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(draw); });
  elements.forEach(el => resize.observe(el));
  const wallChanges = new MutationObserver(refresh);
  wallChanges.observe(wall, { subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
  wall.addEventListener('load', refresh, true);
  addEventListener('resize', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  document.addEventListener('visibilitychange', refresh);
  frame = requestAnimationFrame(draw);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    wallChanges.disconnect();
    wall.removeEventListener('load', refresh, true);
    removeEventListener('resize', refresh);
    window.visualViewport?.removeEventListener('resize', refresh);
    document.removeEventListener('visibilitychange', refresh);
    for (const lens of lenses) {
      lens.el.classList.remove('has-composer-optics');
      lens.gl.deleteTexture(lens.texture);
      lens.gl.deleteBuffer(lens.buffer);
      lens.gl.deleteProgram(lens.program);
      lens.canvas.remove();
    }
  };
}
