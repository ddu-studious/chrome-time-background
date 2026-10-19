(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumWaterShader = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水体层的着色器（WebGL 1 / GLSL ES 1.00）：水面波光、体积光束、焦散网、悬浮颗粒与气泡，全部是“加光”——输出的颜色
    // 由页面用 mix-blend-mode: screen 叠在壁纸和深海色调之上，黑色等于什么都没加，所以没有任何东西需要透明通道。
    // 全部自写：焦散用“域扭曲的 Voronoi 边缘”，光束用方位角上的值噪声，水面是横向拉长的 Voronoi 细胞；没有纹理、没有外部资源。
    // 画面以页面高度为 1 的各向同性坐标 p（y 向下 = 水深）。数值是看真实截图调出来的（参考：水面从下往上看的镜面波纹、
    // 太阳眩光放射的光束、海底的软边焦散网），改动必须重新看截图，不能只看单测。
    // 单测只守合同（uniform 名称、循环上界、没有纹理采样/外部资源）；能不能编译链接由真实浏览器验证。

    const VERTEX = [
        'attribute vec2 aPos;',
        'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }',
    ].join('\n');

    const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uNight;
uniform float uAmount;
uniform float uQuality;
uniform float uSunX;

float hash11(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453123); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// F2 - F1：到最近两个特征点的距离差，细胞边缘附近趋近 0
float voronoiEdge(vec2 x, float t) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.5 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

// 域扭曲：让细胞边不是直线，而是随水波起伏
vec2 warp(vec2 x, float t, float amt) {
  return x + amt * vec2(sin(x.y * 1.7 + t * 0.9) + 0.5 * sin(x.y * 3.9 - t * 1.3),
                        cos(x.x * 1.5 - t * 0.8) + 0.5 * cos(x.x * 3.3 + t * 1.1));
}

// 焦散：两层不同尺度、不同流速的软边细胞边缘叠加（三次方让亮芯细、裙边软，像光在水里聚焦又散开）；
// 再乘一层很慢的低频“光池”，让网不是处处一样亮（真实水底的焦散一片亮一片暗）。省流量只算一层
float caustic(vec2 p, float t, float quality) {
  float e1 = voronoiEdge(warp(p * 4.2, t, 0.22), t * 0.50);
  float c1 = 1.0 - smoothstep(0.0, 0.42, e1);
  c1 = c1 * c1 * c1;
  float pool = 0.40 + 1.10 * vnoise2(p * 2.6 + vec2(t * 0.05, -t * 0.04));
  if (quality < 0.5) return c1 * pool;
  float e2 = voronoiEdge(warp(p * 7.4 + 3.7, t * 1.15 + 2.0, 0.18), t * 0.70 + 2.0);
  float c2 = 1.0 - smoothstep(0.0, 0.34, e2);
  c2 = c2 * c2 * c2;
  return (c1 * 0.85 + c2 * 0.50 + c1 * c2 * 0.9) * pool;
}

// 气泡：从下往上升，带一点横向摇摆；只有一部分格子里有气泡
float bubbleLayer(vec2 p, float t, float scale, float speed, float seed) {
  vec2 g = vec2(p.x * scale, p.y * scale + t * speed);
  vec2 cell = floor(g), f = fract(g);
  float present = step(0.84, hash21(cell + seed));
  vec2 o = hash22(cell + seed * 3.7);
  vec2 c = vec2(0.22 + 0.56 * o.x + 0.10 * sin(t * 1.1 + o.y * 30.0), 0.2 + 0.6 * o.y);
  float r = 0.075 + 0.07 * hash21(cell + seed + 9.0);
  float d = length(f - c);
  float disk = smoothstep(r, r * 0.80, d);
  float inner = smoothstep(r * 0.78, r * 0.35, d);
  float shell = clamp(disk - inner * 0.82, 0.0, 1.0);
  float spec = smoothstep(r * 0.28, 0.0, length(f - c - vec2(-0.32, -0.34) * r));
  return present * (shell * 0.55 + spec * 0.9);
}

// 体积光束：以水面之上的太阳为圆心，按方位角取值噪声，三档频率叠加后压成一条条分明的光柱
float godRays(vec2 p, vec2 sun, float t) {
  vec2 dv = p - sun;
  float ang = atan(dv.x, dv.y);
  float dist = length(dv);
  float r = vnoise1(ang * 6.5 + t * 0.03 + 11.0) * 0.55
          + vnoise1(ang * 15.0 - t * 0.045 + 3.0) * 0.33
          + vnoise1(ang * 37.0 + t * 0.08) * 0.12;
  r = smoothstep(0.40, 0.88, r);
  float shimmer = 0.72 + 0.28 * vnoise2(vec2(ang * 24.0, dist * 3.2 - t * 0.35));
  return r * shimmer * exp(-dist * 0.95);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, 1.0 - uv.y);
  float t = uTime;
  float night = uNight;

  vec3 colRay  = mix(vec3(0.55, 0.93, 1.00), vec3(0.30, 0.45, 0.95), night);
  vec3 colCaus = mix(vec3(0.66, 0.97, 1.00), vec3(0.28, 0.50, 0.90), night);
  vec3 colSurf = mix(vec3(0.84, 0.99, 1.00), vec3(0.45, 0.60, 1.00), night);
  vec3 colAmb  = mix(vec3(0.02, 0.22, 0.28), vec3(0.01, 0.05, 0.16), night);
  float kRay  = mix(0.42, 0.24, night);
  float kCaus = mix(0.46, 0.26, night);
  float kSurf = mix(0.85, 0.42, night);

  // 水面：从下往上看，镜面一样的亮色起伏带；波纹是横向拉长的细胞，细胞之间是青色的细缝
  float y0 = 0.075 + 0.016 * sin(p.x * 4.6 + t * 0.50) + 0.009 * sin(p.x * 9.7 - t * 0.80 + 1.3) + 0.005 * sin(p.x * 21.0 + t * 1.20 + 4.0);
  float d = p.y - y0;
  float cells = 1.0;
  if (p.y < 0.24) {
    vec2 sq = warp(vec2(p.x * 7.0, p.y * 26.0), t * 0.6, 0.22);
    cells = smoothstep(0.02, 0.20, voronoiEdge(sq, t * 0.35));
  }
  float sn = vnoise2(vec2(p.x * 3.0 + t * 0.09, p.y * 9.0 - t * 0.05));
  float inside = smoothstep(0.012, -0.030, d);
  float glow = exp(-max(d, 0.0) * 8.0);
  float rim = exp(-abs(d) * 70.0);
  float surf = inside * (0.30 + 0.55 * cells + 0.25 * sn) + glow * 0.26 + rim * 0.50;
  vec2 sun = vec2((uSunX + 0.035 * sin(t * 0.045) + 0.02 * sin(t * 0.11 + 1.0)) * aspect, -0.32);
  float glare = exp(-length((p - vec2(sun.x, 0.0)) * vec2(1.0, 2.0)) * 3.2);
  surf += glare * 0.60;

  float rays = godRays(p, sun, t) * smoothstep(0.0, 0.12, p.y);

  // 焦散：靠近水面与远处海底最强，中间水体里只有淡淡的一层（那里是时钟和内容，不能抢）
  float cw = 0.06 + 0.50 * exp(-p.y * 6.0) + 0.95 * smoothstep(0.58, 1.0, p.y);
  float caus = cw > 0.03 ? caustic(p, t, uQuality) * cw : 0.0;
  caus *= 0.55 + 0.9 * rays;

  float amb = 0.30 * exp(-p.y * 2.6) + 0.12 * smoothstep(0.6, 1.0, p.y);

  float dust = 0.0;
  float bub = 0.0;
  if (uQuality > 0.5) {
    for (int L = 0; L < 3; L++) {
      float fl = float(L);
      float sc = 22.0 + fl * 17.0;
      vec2 g = p * sc + vec2(t * (0.15 + fl * 0.09), -t * (0.08 + fl * 0.05)) + fl * 7.31;
      vec2 cell = floor(g), f = fract(g);
      vec2 o = hash22(cell + fl * 13.0);
      float sz = 0.045 + 0.075 * hash21(cell + 5.0 + fl);
      float dd = length(f - o);
      float tw = 0.55 + 0.45 * sin(t * (0.6 + o.x) + o.y * 40.0);
      dust += smoothstep(sz, 0.0, dd) * tw * (0.35 + 1.6 * rays) * (1.0 - 0.28 * fl);
    }
    bub = (bubbleLayer(p, t, 8.0, 0.30, 1.0) + bubbleLayer(p + 0.37, t, 14.0, 0.45, 2.0) * 0.7) * smoothstep(0.05, 0.25, p.y);
  }

  vec3 col = colAmb * amb
           + colRay * rays * kRay
           + colCaus * caus * kCaus
           + colSurf * surf * kSurf
           + vec3(0.8, 0.95, 1.0) * dust * mix(0.5, 0.26, night)
           + vec3(0.85, 0.97, 1.0) * bub * mix(0.42, 0.24, night);
  col *= uAmount;
  col += (hash21(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

    // 着色器里声明的 uniform（控制器按这份名单取位置；单测核对源码里确实声明了、且只有这些）
    const UNIFORMS = Object.freeze(['uRes', 'uTime', 'uNight', 'uAmount', 'uQuality', 'uSunX']);

    return Object.freeze({ VERTEX, FRAGMENT, UNIFORMS });
});
