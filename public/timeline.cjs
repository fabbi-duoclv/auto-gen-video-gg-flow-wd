/**
 * Logic timeline dùng CHUNG cho trình duyệt (public/edit.js) và server (src/edit/*).
 * Một nguồn duy nhất để thời gian trên UI, phụ đề và bản dựng luôn khớp nhau.
 *
 * Item: { kind: 'shot'|'title', use, start, srcLen?, missing?, skip?, out: 'cut'|'dissolve' }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GGTimeline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DISSOLVE = 0.6; // giây
  var MIN_USE = 0.2;

  /** Độ dài thật được dùng: không vượt quá phần còn lại của clip gốc kể từ điểm bắt đầu. */
  function effUse(it) {
    var u = Number(it.use) || 0;
    if (it.kind === 'shot' && !it.missing && it.srcLen > 0) {
      u = Math.min(u, Math.max(0.1, it.srcLen - (Number(it.start) || 0)));
    }
    return Math.max(0.1, u);
  }

  /**
   * Tính vị trí từng item. Dissolve làm item sau chồng lên đuôi item trước, nên tổng ngắn đi.
   * Item bị bỏ (skip) không chiếm thời gian.
   * @returns {{ total: number, rows: {t0:number, use:number, d:number}[] }}
   */
  function layout(items) {
    var rows = items.map(function () { return { t0: 0, use: 0, d: 0 }; });
    var t = 0;
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.skip) { rows[i].t0 = t; continue; }
      var use = effUse(it);
      var nxt = null;
      for (var j = i + 1; j < items.length; j++) { if (!items[j].skip) { nxt = items[j]; break; } }
      var d = 0;
      if (it.out === 'dissolve' && nxt) d = Math.min(DISSOLVE, use * 0.5, effUse(nxt) * 0.5);
      rows[i].t0 = t; rows[i].use = use; rows[i].d = d;
      total = t + use;
      t += use - d;
    }
    return { total: total, rows: rows };
  }

  /** Item đang hiển thị tại thời điểm t (nếu chồng dissolve thì lấy item sau). */
  function indexAt(items, rows, t) {
    var found = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].skip) continue;
      if (rows[i].t0 <= t + 1e-6) found = i;
    }
    return found;
  }

  /**
   * Canh điểm cắt theo lời hát: với mỗi dòng lời, kéo điểm cắt shot-sang-shot gần nhất (trong `windowSec`)
   * về đúng thời điểm dòng lời bắt đầu, bằng cách kéo dài hoặc rút ngắn shot đứng ngay trước điểm cắt.
   * Không đụng tới thẻ chương, shot có dissolve, và không đẩy độ dài ra ngoài [minUse, phần còn lại của clip].
   * Trả về bản sao items (không sửa đầu vào).
   */
  function snapToLyrics(items, lyrics, opts) {
    opts = opts || {};
    var windowSec = opts.windowSec == null ? 0.6 : opts.windowSec;
    var minUse = opts.minUse == null ? 0.3 : opts.minUse;
    var out = items.map(function (it) { return Object.assign({}, it); });
    var moved = [];
    var starts = lyrics.map(function (l) { return l.s; }).sort(function (a, b) { return a - b; });
    starts.forEach(function (ls) {
      var lay = layout(out);
      var best = -1, bestDist = Infinity;
      for (var i = 1; i < out.length; i++) {
        if (out[i].skip) continue;
        var p = -1;
        for (var k = i - 1; k >= 0; k--) { if (!out[k].skip) { p = k; break; } }
        if (p < 0 || out[p].kind !== 'shot' || out[p].missing || out[p].out === 'dissolve') continue;
        var dist = Math.abs(lay.rows[i].t0 - ls);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best < 0 || bestDist > windowSec || bestDist < 0.02) return;
      var prev = best - 1;
      while (prev >= 0 && out[prev].skip) prev--;
      var wanted = out[prev].use + (ls - lay.rows[best].t0);
      var maxUse = out[prev].srcLen > 0 ? out[prev].srcLen - (Number(out[prev].start) || 0) : 8;
      wanted = Math.round(Math.min(Math.max(wanted, minUse), maxUse) * 10) / 10;
      if (Math.abs(wanted - out[prev].use) < 0.05) return;
      moved.push({ index: prev, from: out[prev].use, to: wanted });
      out[prev].use = wanted;
    });
    return { items: out, moved: moved };
  }

  return { DISSOLVE: DISSOLVE, MIN_USE: MIN_USE, effUse: effUse, layout: layout, indexAt: indexAt, snapToLyrics: snapToLyrics };
});
