/* Balloon Defense — loads SVG art from /assets and pre-renders it into bitmaps.
   If an image fails to load, the game falls back to simple shapes. */
const ASSET_ROOT = 'assets/';
const SPR = {};
const ASSET_LIST = (() => {
    const l = [];
    for (const t of SHOP)
        l.push('towers/' + t + '-base', 'towers/' + t + '-top');
    for (const b of Object.keys(BT))
        l.push('balloons/' + b);
    l.push('balloons/camo', 'balloons/frozen');
    ['tree', 'autumntree', 'bush', 'flowers', 'rock', 'icerock', 'lavarock', 'mushroom', 'cactus', 'drybush', 'deadtree', 'snowpine', 'pine']
        .forEach(s => l.push('scenery/' + s));
    ['grass', 'autumn', 'sand', 'snow', 'ash', 'dirt', 'sandpath', 'snowpath', 'basalt', 'water', 'lava', 'ice'].forEach(s => l.push('tiles/' + s));
    return l;
})();
const PRERENDER = 3; // bitmap resolution multiplier (crisp on high-DPI screens)
function loadAssets(onProgress) {
    let done = 0, failed = 0;
    return new Promise(resolve => {
        const finish = () => {
            done++;
            if (onProgress)
                onProgress(done / ASSET_LIST.length);
            if (done === ASSET_LIST.length)
                resolve({ failed });
        };
        ASSET_LIST.forEach(name => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                const mul = name.startsWith('tiles/') ? 1 : PRERENDER;
                const c = document.createElement('canvas');
                c.width = w * mul;
                c.height = h * mul;
                try {
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    SPR[name] = { img, c, w, h };
                }
                catch (e) {
                    SPR[name] = { img, c: img, w, h };
                }
                finish();
            };
            img.onerror = () => { failed++; finish(); };
            img.src = ASSET_ROOT + name + '.svg';
        });
    });
}
function spr(name) { return SPR[name] || null; }
/** Draw a sprite so that point (ax, ay) inside the SVG lands on (x, y), scaled by s, rotated by rot. */
function drawSpr(c, name, x, y, s, ax?, ay?, rot?) {
    const sp = SPR[name];
    if (!sp)
        return false;
    if (ax === undefined) {
        ax = sp.w / 2;
        ay = sp.h / 2;
    }
    if (rot) {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.drawImage(sp.c, -ax * s, -ay * s, sp.w * s, sp.h * s);
        c.restore();
    }
    else
        c.drawImage(sp.c, x - ax * s, y - ay * s, sp.w * s, sp.h * s);
    return true;
}
