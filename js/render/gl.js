// WebGL2 인스턴싱 렌더러 (없으면 WebGL1 + ANGLE_instanced_arrays)
// 작은 내부 프레임버퍼(짧은 변 360~600px)에 그린 뒤 최근접(nearest)으로 화면에 확대.
// 셰이더는 GLSL ES 1.0 으로 작성해 두 컨텍스트에서 모두 동작.

const LOC_CORNER = 0, LOC_A = 1, LOC_B = 2, LOC_C = 3;

const HP = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const VS_FULL = `
attribute vec2 a_corner;
uniform vec2 u_scale;
varying vec2 v_uv;
void main(){ v_uv = a_corner * u_scale; gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0); }`;

const FS_BLIT = HP + `
uniform sampler2D u_tex;
varying vec2 v_uv;
void main(){ gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb, 1.0); }`;

// 지면: 반복 타일을 UV 이동으로. 타일마다 해시로 좌우/상하 반전해 반복감을 줄이고,
// 저주파 노이즈로 흙 지대(두 번째 타일)를 군데군데 섞는다. 경계는 2픽셀 단위로 거칠게.
const FS_GROUND = HP + `
uniform sampler2D u_tex;
uniform vec2 u_atlas;
uniform vec4 u_rect;
uniform vec4 u_rect2;
uniform float u_dirt;
uniform vec2 u_origin;
uniform float u_ih;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 m = vec2(256.0);
  float a = h21(mod(i, m)), b = h21(mod(i + vec2(1.0, 0.0), m));
  float c = h21(mod(i + vec2(0.0, 1.0), m)), d = h21(mod(i + vec2(1.0, 1.0), m));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  vec2 fc = floor(gl_FragCoord.xy);
  vec2 wp = vec2(u_origin.x + fc.x, u_origin.y + (u_ih - 1.0 - fc.y));
  float n = vnoise(wp / (u_rect.z * 2.0)) * 0.7 + vnoise(wp / (u_rect.z * 0.5) + vec2(37.0, 11.0)) * 0.3;
  n += (h21(mod(floor(wp / 2.0), 256.0)) - 0.5) * 0.06;
  if (n > u_dirt) {
    vec2 lp2 = mod(wp, u_rect2.zw);
    gl_FragColor = texture2D(u_tex, (u_rect2.xy + lp2 + 0.5) / u_atlas);
    return;
  }
  vec2 tile = floor(wp / u_rect.zw);
  vec2 lp = wp - tile * u_rect.zw;
  float h = h21(mod(tile, 256.0));
  if (h > 0.5) lp.x = u_rect.z - 1.0 - lp.x;
  if (fract(h * 7.31) > 0.5) lp.y = u_rect.w - 1.0 - lp.y;
  gl_FragColor = texture2D(u_tex, (u_rect.xy + lp + 0.5) / u_atlas);
}`;

// 스프라이트: a_info = (스프라이트 번호, 플래그, 위상, 정수배율(1~7)+페이드(0~31)*8)
// 플래그 비트: 1 좌우반전, 2 피격 흰색, 4 통통 튀기, 8 잔상(디더 반투명), 16 유령(디더 반투명, 색 유지)
const VS_SPRITE = `
attribute vec2 a_corner;
attribute vec2 a_pos;
attribute vec4 a_info;
uniform vec2 u_view;
uniform vec2 u_atlas;
uniform vec4 u_rects[64];
uniform float u_time;
varying vec2 v_uv;
varying vec3 v_fx;
varying float v_wound;
void main(){
  vec4 r = u_rects[int(a_info.x + 0.5)];
  float fl = a_info.y;
  float flip = mod(fl, 2.0);
  float flash = mod(floor(fl / 2.0), 2.0);
  float bobOn = mod(floor(fl / 4.0), 2.0);
  float ghost = mod(floor(fl / 8.0), 2.0);
  float sc = max(1.0, mod(a_info.w, 8.0));
  float fade = floor(a_info.w / 8.0) / 31.0;
  vec2 size = r.zw * sc;
  float bob = bobOn * step(0.5, fract(u_time * 3.2 + a_info.z / 255.0));
  vec2 tl = floor(a_pos - size * 0.5 + 0.5);
  tl.y -= bob;
  vec2 p = tl + a_corner * size;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
  float cx = mix(a_corner.x, 1.0 - a_corner.x, flip);
  v_uv = (r.xy + vec2(cx, a_corner.y) * r.zw) / u_atlas;
  float spook = mod(floor(fl / 16.0), 2.0);
  v_fx = vec3(flash, ghost, max(fade, spook * 0.45));
  v_wound = mod(floor(fl / 32.0), 2.0);
}`;

const BAYER = `
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

const FS_SPRITE = HP + BAYER + `
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec3 v_fx;
varying float v_wound;
void main(){
  vec4 c = texture2D(u_tex, v_uv);
  if (c.a < 0.5) discard;
  if (v_fx.y > 0.5) {
    if (bayer4(gl_FragCoord.xy) < 0.5 + v_fx.z * 0.5) discard;
    c.rgb = mix(c.rgb, vec3(0.45, 0.94, 0.97), 0.55);
  } else if (v_fx.z > 0.0 && bayer4(gl_FragCoord.xy) < v_fx.z) discard;
  if (v_wound > 0.5) c.rgb = c.rgb * vec3(0.85, 0.45, 0.42);           // 메테오를 맞고 살아남은 몹: 붉게 어두워짐
  if (v_fx.x > 0.5) c.rgb = v_wound > 0.5 ? vec3(1.0, 0.3, 0.25) : vec3(1.0);   // 맞을 때 깜빡(다친 몹은 붉게)
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

// 도형: a_geo = (x, y, 반경, 두께), a_col = 색, a_kind = (종류, 밀도, 점선 수, 점선 위상)
// 종류 0 원판, 1 고리, 2 점선 고리, 3 사각형(파티클), 4 직사각형(반폭 r, 반높이 두께값)
const VS_SHAPE = `
attribute vec2 a_corner;
attribute vec4 a_geo;
attribute vec4 a_col;
attribute vec4 a_kind;
uniform vec2 u_view;
varying vec2 v_local;
varying vec4 v_col;
varying vec4 v_k;
varying vec2 v_rp;
void main(){
  float ext = a_geo.z + a_geo.w + 1.0;
  vec2 c = floor(a_geo.xy + 0.5);
  vec2 off = (a_corner * 2.0 - 1.0) * ext;
  vec2 p = c + off;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
  v_local = off;
  v_col = a_col;
  v_k = vec4(a_kind.x, a_kind.y / 255.0, a_kind.z, a_kind.w / 255.0);
  v_rp = a_geo.zw;
}`;

const FS_SHAPE = HP + BAYER + `
varying vec2 v_local;
varying vec4 v_col;
varying vec4 v_k;
varying vec2 v_rp;
void main(){
  float kind = v_k.x;
  float d = length(v_local);
  float r = v_rp.x, th = v_rp.y;
  bool inside;
  if (kind < 0.5) inside = d <= r;
  else if (kind < 1.5) inside = abs(d - r) <= th * 0.5;
  else if (kind < 2.5) inside = abs(d - r) <= th * 0.5 && fract(atan(v_local.y, v_local.x) / 6.2831853 * v_k.z + v_k.w) < 0.5;
  else if (kind < 3.5) inside = max(abs(v_local.x), abs(v_local.y)) <= r;
  else inside = abs(v_local.x) <= r && abs(v_local.y) <= th;
  if (!inside) discard;
  if (v_k.y < 0.999 && bayer4(gl_FragCoord.xy) >= v_k.y) discard;
  gl_FragColor = vec4(v_col.rgb, 1.0);
}`;

// ------------------------------------------------------------ CPU 쪽 인스턴스 배치
export class SpriteBatch {
  constructor(cap) {
    this.cap = cap; this.count = 0;
    this.buf = new ArrayBuffer(cap * 12);
    this.f32 = new Float32Array(this.buf);
    this.u32 = new Uint32Array(this.buf);
    this.glBuf = null; this.gen = -1;
  }
  reset() { this.count = 0; }
  /** x,y: 내부 픽셀 중심, sprite: 아틀라스 번호, flags: 비트, phase: 0~255, scale: 정수 1~7, fade: 0~63 (0 = 불투명) */
  push(x, y, sprite, flags, phase, scale, fade) {
    if (this.count >= this.cap) return;
    const o = this.count * 3;
    this.f32[o] = x; this.f32[o + 1] = y;
    const sc = scale < 1 ? 1 : scale > 7 ? 7 : scale | 0;
    this.u32[o + 2] = (sprite | (flags << 8) | (phase << 16) | ((sc + (fade >> 1) * 8) << 24)) >>> 0;
    this.count++;
  }
}

export class ShapeBatch {
  constructor(cap) {
    this.cap = cap; this.count = 0;
    this.buf = new ArrayBuffer(cap * 24);
    this.f32 = new Float32Array(this.buf);
    this.u32 = new Uint32Array(this.buf);
    this.glBuf = null; this.gen = -1;
  }
  reset() { this.count = 0; }
  /** kind 0 원판 1 고리 2 점선고리 3 사각형, density 0~255 (255=꽉 참) */
  push(x, y, r, th, color, kind, density, dashes, phase) {
    if (this.count >= this.cap) return;
    const o = this.count * 6;
    this.f32[o] = x; this.f32[o + 1] = y; this.f32[o + 2] = r; this.f32[o + 3] = th;
    this.u32[o + 4] = color;
    this.u32[o + 5] = (kind | (density << 8) | (dashes << 16) | (phase << 24)) >>> 0;
    this.count++;
  }
}

// ------------------------------------------------------------ 렌더러
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gen = 0;
    this.lost = false;
    this.atlas = null;
    this.fboW = 0; this.fboH = 0;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { this._init(); this.lost = false; }, false);
    this._init();
  }

  _init() {
    const opts = { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = this.canvas.getContext('webgl2', opts);
    this.isGL2 = !!gl;
    if (!gl) {
      gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
      if (!gl) throw new Error('WebGL not supported');
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      if (!ext) throw new Error('ANGLE_instanced_arrays not supported');
      this.divisor = (l, d) => ext.vertexAttribDivisorANGLE(l, d);
      this.drawInst = (n) => ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, n);
    } else {
      this.divisor = (l, d) => gl.vertexAttribDivisor(l, d);
      this.drawInst = (n) => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    this.gl = gl;
    this.gen++;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.pBlit = this._program(VS_FULL, FS_BLIT, ['u_scale', 'u_tex']);
    this.pGround = this._program(VS_FULL, FS_GROUND, ['u_scale', 'u_tex', 'u_atlas', 'u_rect', 'u_rect2', 'u_dirt', 'u_origin', 'u_ih']);
    this.pSprite = this._program(VS_SPRITE, FS_SPRITE, ['u_view', 'u_atlas', 'u_rects', 'u_time', 'u_tex'],
      { a_pos: LOC_A, a_info: LOC_B });
    this.pShape = this._program(VS_SHAPE, FS_SHAPE, ['u_view'], { a_geo: LOC_A, a_col: LOC_B, a_kind: LOC_C });

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    this.atlasTex = null;
    if (this.atlas) this.setAtlas(this.atlas);
    this.fboTex = null; this.fbo = null;
    if (this.fboW) this._makeFbo(this.fboW, this.fboH);
  }

  _program(vs, fs, uniforms, attribs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, LOC_CORNER, 'a_corner');
    if (attribs) for (const k in attribs) gl.bindAttribLocation(p, attribs[k], k);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  setAtlas(atlas) {
    this.atlas = atlas;
    const gl = this.gl;
    if (this.atlasTex) gl.deleteTexture(this.atlasTex);
    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    this._nearest();
  }

  _nearest() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _makeFbo(w, h) {
    const gl = this.gl;
    if (this.fboTex) gl.deleteTexture(this.fboTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this._nearest();
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 화면(장치 픽셀) 크기와 내부 프레임버퍼 최대 크기 설정 */
  resize(devW, devH, fboW, fboH) {
    if (this.canvas.width !== devW) this.canvas.width = devW;
    if (this.canvas.height !== devH) this.canvas.height = devH;
    if (fboW !== this.fboW || fboH !== this.fboH) {
      this.fboW = fboW; this.fboH = fboH;
      if (!this.lost) this._makeFbo(fboW, fboH);
    }
  }

  begin(iw, ih) {
    const gl = this.gl;
    this.iw = iw; this.ih = ih;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, iw, ih);
    gl.clearColor(0.15, 0.3, 0.17, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  _bindQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(LOC_CORNER);
    gl.vertexAttribPointer(LOC_CORNER, 2, gl.FLOAT, false, 0, 0);
    this.divisor(LOC_CORNER, 0);
  }

  /** originX/Y: 내부 화면 좌상단 픽셀의 월드 픽셀 좌표 */
  ground(originX, originY, rect, rect2, dirt) {
    const gl = this.gl, P = this.pGround;
    gl.useProgram(P.p);
    this._bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.uniform2f(P.u.u_scale, 1, 1);
    gl.uniform2f(P.u.u_atlas, this.atlas.size, this.atlas.size);
    gl.uniform4f(P.u.u_rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform4f(P.u.u_rect2, rect2[0], rect2[1], rect2[2], rect2[3]);
    gl.uniform1f(P.u.u_dirt, dirt);
    const period = rect[2] * 512;   // 타일·노이즈가 모두 이 주기로 반복 → 좌표를 작게 유지
    gl.uniform2f(P.u.u_origin, ((originX % period) + period) % period, ((originY % period) + period) % period);
    gl.uniform1f(P.u.u_ih, this.ih);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _upload(batch, bytesPer) {
    const gl = this.gl;
    if (batch.gen !== this.gen || !batch.glBuf) {
      batch.glBuf = gl.createBuffer();
      batch.gen = this.gen;
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.glBuf);
      gl.bufferData(gl.ARRAY_BUFFER, batch.buf.byteLength, gl.DYNAMIC_DRAW);
    } else gl.bindBuffer(gl.ARRAY_BUFFER, batch.glBuf);
    const words = batch.count * (bytesPer >> 2);
    if (this.isGL2) gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.f32, 0, words);
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.f32.subarray(0, words));
  }

  sprites(batch, time) {
    if (batch.count === 0) return;
    const gl = this.gl, P = this.pSprite;
    gl.useProgram(P.p);
    this._bindQuad();
    this._upload(batch, 12);
    gl.enableVertexAttribArray(LOC_A);
    gl.vertexAttribPointer(LOC_A, 2, gl.FLOAT, false, 12, 0);
    this.divisor(LOC_A, 1);
    gl.enableVertexAttribArray(LOC_B);
    gl.vertexAttribPointer(LOC_B, 4, gl.UNSIGNED_BYTE, false, 12, 8);
    this.divisor(LOC_B, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.uniform2f(P.u.u_view, this.iw, this.ih);
    gl.uniform2f(P.u.u_atlas, this.atlas.size, this.atlas.size);
    gl.uniform4fv(P.u.u_rects, this.atlas.flat);
    gl.uniform1f(P.u.u_time, time);
    this.drawInst(batch.count);
    this._unbindInst(2);
  }

  shapes(batch) {
    if (batch.count === 0) return;
    const gl = this.gl, P = this.pShape;
    gl.useProgram(P.p);
    this._bindQuad();
    this._upload(batch, 24);
    gl.enableVertexAttribArray(LOC_A);
    gl.vertexAttribPointer(LOC_A, 4, gl.FLOAT, false, 24, 0);
    this.divisor(LOC_A, 1);
    gl.enableVertexAttribArray(LOC_B);
    gl.vertexAttribPointer(LOC_B, 4, gl.UNSIGNED_BYTE, true, 24, 16);
    this.divisor(LOC_B, 1);
    gl.enableVertexAttribArray(LOC_C);
    gl.vertexAttribPointer(LOC_C, 4, gl.UNSIGNED_BYTE, false, 24, 20);
    this.divisor(LOC_C, 1);
    gl.uniform2f(P.u.u_view, this.iw, this.ih);
    this.drawInst(batch.count);
    this._unbindInst(3);
  }

  _unbindInst(n) {
    const gl = this.gl;
    for (let l = 1; l <= n; l++) { this.divisor(l, 0); gl.disableVertexAttribArray(l); }
  }

  /** 내부 화면을 실제 화면 크기로 최근접 확대 */
  end() {
    const gl = this.gl, P = this.pBlit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(P.p);
    this._bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.uniform2f(P.u.u_scale, this.iw / this.fboW, this.ih / this.fboH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
