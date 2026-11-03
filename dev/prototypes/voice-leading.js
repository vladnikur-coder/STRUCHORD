'use strict';
// Эксперимент: сравнение уже построенных вариантов. Не подключён к приложению.
// Минимальная стоимость однозначного сопоставления голосов и входов/выходов.
function motionCost(previous, candidate, entryCost = 12) {
  const clean = ns => [...new Set(ns.filter(Number.isInteger).filter(n => n >= 0 && n <= 127))].sort((a, b) => a - b);
  const a = clean(previous), b = clean(candidate);
  if (a.length > 8 || b.length > 8) throw new RangeError('Не более восьми голосов');
  if (!Number.isFinite(entryCost) || entryCost < 0) throw new RangeError('Неверная цена входа голоса');
  // Сопоставление с сохранением порядка: голоса не пересекаются.
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(Infinity));
  dp[0][0] = 0;
  for (let i = 0; i <= a.length; i++) for (let j = 0; j <= b.length; j++) {
    if (i < a.length) dp[i + 1][j] = Math.min(dp[i + 1][j], dp[i][j] + entryCost);
    if (j < b.length) dp[i][j + 1] = Math.min(dp[i][j + 1], dp[i][j] + entryCost);
    if (i < a.length && j < b.length) dp[i + 1][j + 1] = Math.min(dp[i + 1][j + 1], dp[i][j] + Math.abs(a[i] - b[j]));
  }
  return dp[a.length][b.length];
}
function rankCandidates(previous, candidates) {
  return candidates.map((notes, index) => ({ index, notes: notes.slice(), cost: motionCost(previous, notes) }))
    .sort((a, b) => a.cost - b.cost || a.index - b.index);
}
module.exports = { motionCost, rankCandidates };
