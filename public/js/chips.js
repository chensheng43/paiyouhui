// 原创筹码素材：按面值拆成一小摞筹码，金额始终以文字为准
export const CHIP_DENOMS = [100, 25, 5, 1];

/**
 * 生成筹码堆 HTML（装饰用，旁边必须另带金额文字）
 * @param {number} amount 筹码数
 * @param {{ max?: number }} [opts] 最多显示几张，默认 4
 */
export function chipStackHtml(amount, opts = {}) {
  const max = Math.max(1, Number(opts.max) || 4);
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  if (!left) return '';
  const chips = [];
  for (const d of CHIP_DENOMS) {
    while (left >= d && chips.length < max) {
      chips.push(d);
      left -= d;
    }
  }
  return chips
    .map(
      (d, i) =>
        `<img class="chip chip-${d}" src="/assets/chip-${d}.svg" alt="" draggable="false" style="--i:${i}">`
    )
    .join('');
}
