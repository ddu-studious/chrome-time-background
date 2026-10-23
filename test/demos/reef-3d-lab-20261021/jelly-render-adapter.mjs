// Isolated build-only seam for our own controller. Production source remains untouched.
export function injectJellyRenderer(source){
 const point='    function create(env = {}) {',call='                draw(ctx, world, palette, clamp(';
 if(source.split(point).length!==2||source.split(call).length!==2)throw new Error('JellyfishSkin renderer seam changed; review integration before rebuilding');
 return source.replace(point,point+'\n        const drawFrame = typeof env.drawFrame === "function" ? env.drawFrame : draw;').replace(call,'                drawFrame(ctx, world, palette, clamp(');
}
