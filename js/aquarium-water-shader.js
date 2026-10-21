(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumWaterShader = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水体层的着色器（WebGL 1 / GLSL ES 1.00）：页面底部一条“岸线”——海浪一波波冲上沙滩、再退下去，潮水慢慢涨落。
    // 画布只有页面底部的一条带子（高度是页面的 BAND，见 aquarium-water-core.js），带子之外没有这层的任何像素，所以壁纸不会被遮。
    // 从下往上依次是：干沙（最靠页面底边）→ 湿沙（水线能冲到的范围，更深更实，带一层映着天光的薄水膜和退水留下的泡沫纹）→ 水线（一圈白色浪花）
    // → 水线上方的浅水（青绿、沙面上有水光斑，往上越来越薄）→ 正从海里推过来的下一道浪线（越近越白，贴近水线时与退水相撞）。
    // 输出是预乘 alpha 的颜色，页面用普通混合（source-over）叠在壁纸与压暗层之上；不用 mix-blend-mode: screen——首页的壁纸是 body 的背景，
    // 被传播到了画布上，而 body 自成堆叠上下文，里面的 screen 看不到壁纸（2026-10-19 的教训，见 aquarium-water-20261019.md）。
    // 合成公式：最终颜色 = pre + 壁纸 × (1 - a)；末尾把 a 抬到 max(pre)，保证每个像素都是合法的预乘值（颜色分量不超过 alpha）。
    // 一个浪的一生（rush）：冲上沙滩时先快后慢，在最高处停一下，退下来时先慢后快（受重力与摩擦，真实的冲流/回流就是这样）；浪是成组的（一组四个，大小
    // 0.55/0.80/1.00/0.68）、斜着来的（右边比左边晚 SHEAR 个周期）；水线沿横向有缓慢的起伏，冲得越深越有指状的水舌。
    // 水线的高度只有一份：水线 = TOP（退得最远时的高度，由潮位决定）- REACH × 浪的大小 × rush + 横向起伏；JS 一侧（aquarium-water-core.js 的 frontAt）
    // 用同一条公式（不含只存在于着色器里的水舌噪声，它的幅度有上界），鱼避开岸线用的是同一份数字。
    // 画面以页面高度为 1 的各向同性坐标：h 是离页面底边的高度（向上为正），xp 是横向位置。全部自写，没有纹理、没有外部资源；
    // 数值是看真实截图调出来的（参考：沙滩浪花的冲流/回流/湿沙反光/浪花的碎纹，只借做法不借代码），改动必须重新看截图，不能只看单测。
    // 单测只守合同（uniform 名称、与核心共用的常数、循环上界、没有纹理采样/外部资源）；能不能编译链接由真实浏览器验证。

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
uniform float uBand;
uniform float uAspect;
uniform float uTime;
uniform float uNight;
uniform float uAmount;
uniform float uQuality;
uniform float uTop;
uniform float uReach;
uniform float uTideV;

const float WAVE_PERIOD = 9.0;
const float RISE = 0.26;
const float SHEAR = 0.22;
const float APPROACH = 0.55;
const float APPROACH_DIST = 0.14;
const float AMP_WOBBLE = 0.22;
const float LAT_A = 0.0065;
const float LAT_B = 0.0040;
const float LAT_PERIOD_A = 36.0;
const float LAT_PERIOD_B = 27.0;
const float RILL = 0.020;
const float PI2 = 6.2831853;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p) { return 0.55 * vnoise2(p) + 0.30 * vnoise2(p * 2.07 + 3.1) + 0.15 * vnoise2(p * 4.3 + 7.7); }

// 一组四个浪的大小（k 是 0…3）
float setAmp(float k) {
  return k < 0.5 ? 0.55 : (k < 1.5 ? 0.80 : (k < 2.5 ? 1.00 : 0.68));
}
// 一个浪冲上沙滩的一生：0 = 退得最远（水线在最高处），1 = 冲得最深（水线最靠近页面底边）。冲上去先快后慢，退下来先慢后快
float rush(float phi) {
  if (phi < RISE) { float u = phi / RISE; return 1.0 - (1.0 - u) * (1.0 - u); }
  float v = (phi - RISE) / (1.0 - RISE);
  return 1.0 - pow(v, 1.6);
}
// 水线移动的快慢（每个浪周期里 rush 的变化量）：冲上去为正，退下去为负
float rushVel(float phi) {
  if (phi < RISE) { float u = phi / RISE; return 2.0 * (1.0 - u) / RISE; }
  float v = (phi - RISE) / (1.0 - RISE);
  return -1.6 * pow(max(v, 0.0001), 0.6) / (1.0 - RISE);
}

// F2 - F1：到最近两个特征点的距离差，细胞边缘附近趋近 0（水下沙面的光斑）
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
vec2 warp(vec2 x, float t, float amt) {
  return x + amt * vec2(sin(x.y * 1.7 + t * 0.9) + 0.5 * sin(x.y * 3.9 - t * 1.3),
                        cos(x.x * 1.5 - t * 0.8) + 0.5 * cos(x.x * 3.3 + t * 1.1));
}
float caustic(vec2 p, float t) {
  float e1 = voronoiEdge(warp(p * 8.0, t, 0.30), t * 0.45);
  float c1 = 1.0 - smoothstep(0.0, 0.55, e1);
  return c1 * c1 * c1;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float h = uv.y * uBand;
  float xp = uv.x * uAspect;
  float t = uTime;
  float px = uBand / uRes.y;                          // 一个内部像素的高度（页面高度为 1）
  float night = uNight;

  // 这个横坐标上正在发生的是第 n 个浪的第 phi 阶段；浪是斜着来的，右边比左边晚一点
  float ph = t / WAVE_PERIOD - SHEAR * uv.x;
  float n = floor(ph);
  float phi = ph - n;
  float k4 = mod(n, 4.0);
  float amp = setAmp(k4) * (1.0 + AMP_WOBBLE * sin(xp * 3.1 + k4 * 1.9));
  float r = rush(phi);
  float vel = rushVel(phi);
  float lat = LAT_A * sin(xp * 2.3 + PI2 / LAT_PERIOD_A * t) + LAT_B * sin(xp * 5.9 - PI2 / LAT_PERIOD_B * t + 1.7);
  float rill = (fbm2(vec2(xp * 11.0 + k4 * 5.3, 1.7 + k4)) - 0.5) * RILL * (0.3 + r);      // 水线不是直线：冲得越深越有指状的水舌
  float hF = uTop - uReach * amp * r + lat + rill;    // 水线高度
  float d = h - hF;                                   // 正 = 海一侧（上），负 = 沙一侧（下）
  float dd = max(d, 0.0);
  float behind = max(-d, 0.0);
  float sea = smoothstep(-1.3 * px, 1.3 * px, d);
  float back = clamp(-vel * 0.40, 0.0, 1.0);          // 退水的快慢 0…1
  float up = clamp(vel * 0.15, 0.0, 1.0);             // 冲水的快慢 0…1

  // 沙：越靠页面底边越干；水线能冲到的最低处以上是湿沙，更深更实。水下的沙随水变深慢慢看不见
  float hLow = uTop - uReach * 1.25 - 0.006;
  float wet = smoothstep(hLow - 0.006, hLow + 0.020, h);
  vec2 g = vec2(xp, h) * 560.0;
  float grain = 0.6 * vnoise2(g) + 0.4 * vnoise2(g * 2.3 + 7.0);
  float marks = fbm2(vec2(xp * 8.0, h * 60.0) + vec2(sin(xp * 5.0) * 2.0, 0.0));
  vec3 dryDay = vec3(0.95, 0.85, 0.64);
  vec3 wetDay = vec3(0.50, 0.38, 0.26);
  vec3 dryNight = vec3(0.32, 0.35, 0.50);
  vec3 wetNight = vec3(0.09, 0.12, 0.24);
  vec3 sandCol = mix(mix(dryDay, dryNight, night), mix(wetDay, wetNight, night), wet);
  sandCol *= 0.88 + 0.16 * grain + 0.10 * (marks - 0.5);
  float sandVis = mix(1.0, exp(-dd / 0.040), sea);
  float sandA = mix(0.54, 0.66, wet) * sandVis;

  vec3 pre = sandCol * sandA;
  float a = sandA;

  // 水：靠近水线是清浅的青绿，往上渐深渐薄，最后消失（壁纸要透出来）
  vec3 shallow = mix(vec3(0.36, 0.82, 0.86), vec3(0.10, 0.22, 0.46), night);
  vec3 deep = mix(vec3(0.05, 0.50, 0.62), vec3(0.03, 0.12, 0.34), night);
  float waterA = sea * (0.10 + 0.20 * smoothstep(0.0, 0.05, dd)) * (1.0 - smoothstep(0.06, 0.12, dd));
  vec3 waterCol = mix(shallow, deep, smoothstep(0.0, 0.09, dd));
  pre = pre * (1.0 - waterA) + waterCol * waterA;
  a = waterA + a * (1.0 - waterA);

  vec3 add = vec3(0.0);
  // 水下沙面的光斑：只在浅水里，柔和；省流量时不算
  if (uQuality > 0.5 && d > 0.0 && d < 0.10) {
    float cs = caustic(vec2(xp, h), t) * exp(-dd / 0.045) * smoothstep(0.0, 0.012, dd);
    add += mix(vec3(0.86, 1.0, 0.98), vec3(0.35, 0.55, 0.95), night) * cs * mix(0.26, 0.14, night);
  }

  // 刚露出来的湿沙上一层薄水膜，映出天光：退得越快越亮，离水线远了很快淡掉；斑驳不匀
  float film = exp(-behind / 0.024) * (0.20 + 0.80 * back) * (1.0 - sea);
  film *= 0.45 + 0.55 * fbm2(vec2(xp * 16.0, h * 70.0 + 3.0));
  add += mix(vec3(0.97, 0.99, 1.0), vec3(0.60, 0.70, 0.98), night) * film * 0.42;

  // 浪花 ① 冲水：水线前沿一圈白，冲得越快越宽，身后是碎纹
  float foamW = 0.010 + 0.024 * up + 0.006 * amp;
  float lace = fbm2(vec2(xp * 34.0 - t * 0.7, h * 90.0 + t * 0.3));
  float lace2 = vnoise2(vec2(xp * 95.0 + t * 0.5, h * 230.0));
  float body = exp(-dd / foamW) * sea;
  float foamBody = body * smoothstep(0.30, 0.62, 0.55 * lace + 0.45 * lace2 + 0.50 * body);
  float edge = 1.0 - smoothstep(0.0, 2.8 * px, abs(d));
  // 浪花 ② 退水在沙上留下的泡沫纹：细细的网状线加零星的小泡
  float residue = exp(-behind / 0.045) * (1.0 - sea);
  float rn = fbm2(vec2(xp * 22.0, h * 17.0 + t * 0.08));
  float ridge = 1.0 - smoothstep(0.0, 0.085, abs(rn - 0.5));
  float rn2 = fbm2(vec2(xp * 60.0 + 4.0, h * 48.0 - t * 0.05));
  float ridge2 = 1.0 - smoothstep(0.0, 0.07, abs(rn2 - 0.5));
  float dots = smoothstep(0.80, 0.92, vnoise2(vec2(xp * 150.0, h * 150.0)));
  float foamRes = residue * clamp(ridge * 0.9 + ridge2 * 0.6 + dots * 0.7, 0.0, 1.0) * (0.25 + 0.75 * back);
  float foam = foamBody * (0.80 + 0.20 * up) + edge * (0.50 + 0.45 * up) + foamRes * 0.85;

  // 浪花 ③ 下一个浪正从海里推过来：一道逐渐变白的浪线，贴近水线时与退水相撞，白得最厉害
  float pa = clamp((phi - (1.0 - APPROACH)) / APPROACH, 0.0, 1.0);
  float en = smoothstep(0.0, 1.0, pa);
  float hb = uTop + APPROACH_DIST * (1.0 - en) * (1.0 - en) + 0.004;
  float kNext = mod(n + 1.0, 4.0);
  float ampN = setAmp(kNext) * (1.0 + AMP_WOBBLE * sin(xp * 3.1 + kNext * 1.9));
  float bd = h - hb - 0.012 * sin(xp * 4.7 + PI2 / 20.0 * t) * (1.0 - en);
  float bw = 0.005 + 0.012 * en;
  float bore = exp(-abs(bd) / bw) * smoothstep(0.0, 0.5, pa) * (0.35 + 0.65 * ampN);
  float boreLace = smoothstep(0.34, 0.64, 0.6 * fbm2(vec2(xp * 46.0 - t * 0.9, h * 120.0 + 11.0)) + 0.4 * vnoise2(vec2(xp * 120.0, h * 260.0)) + 0.35 * bore);
  float boreFoam = bore * boreLace;
  float swellLight = exp(-abs(bd + 0.010) / 0.02) * pa * 0.22;          // 浪前水面微微隆起的一线浅色

  foam = clamp((foam + boreFoam * 0.95) * (0.92 + 0.10 * clamp(uTideV, -1.0, 1.0)), 0.0, 1.0);       // 涨潮时浪花略浓
  vec3 foamCol = mix(vec3(0.99, 1.0, 1.0), vec3(0.62, 0.72, 0.96), night);
  float fa = clamp(foam * 0.94, 0.0, 0.94);
  pre = pre * (1.0 - fa) + foamCol * fa;
  a = fa + a * (1.0 - fa);
  add += mix(vec3(0.90, 1.0, 1.0), vec3(0.45, 0.60, 0.95), night) * swellLight * sea;

  // 水面碎光：省流量时不算
  if (uQuality > 0.5 && sea > 0.0) {
    float sp = vnoise2(vec2(xp * 170.0 + t * 0.9, h * 170.0 - t * 0.55));
    sp = pow(sp, 14.0) * 5.0;
    add += mix(vec3(1.0), vec3(0.7, 0.8, 1.0), night) * sp * sea * (1.0 - smoothstep(0.0, 0.10, dd)) * mix(0.22, 0.12, night);
  }

  // 总强度（设置里的“强度”）与顶部淡出：带子上沿不能有硬边
  float fadeTop = 1.0 - smoothstep(uBand * 0.80, uBand, h);
  add *= uAmount;
  float k = mix(0.62, 1.0, uAmount);
  pre *= k;
  a *= k;
  pre += add;
  pre *= fadeTop;
  a *= fadeTop;
  a = max(a, max(pre.r, max(pre.g, pre.b)));          // 预乘 alpha 合法：颜色分量不超过 alpha
  pre += (hash21(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * step(0.001, a);
  gl_FragColor = vec4(clamp(pre, 0.0, 1.0), clamp(a, 0.0, 1.0));
}
`;

    // 着色器里声明的 uniform（控制器按这份名单取位置；单测核对源码里确实声明了、且只有这些）
    const UNIFORMS = Object.freeze(['uRes', 'uBand', 'uAspect', 'uTime', 'uNight', 'uAmount', 'uQuality', 'uTop', 'uReach', 'uTideV']);

    return Object.freeze({ VERTEX, FRAGMENT, UNIFORMS });
});
