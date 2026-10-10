/**
 * Turning pulls into currency and real money (docs/spec/gacha2.md §5). Packs and prices are user data; the
 * defaults shipped with presets are examples, not any game's real price list.
 */
import type { Distribution } from "./chain";
import type { GachaModel } from "./model";

export interface TopUpPack {
  id: string;
  name: string;
  /** Price in real money (e.g. TWD). */
  price: number;
  /** Currency received. */
  amount: number;
  /** Extra currency on the first purchase only. */
  firstBonus?: number;
}

export interface Wallet {
  /** Currency already owned. */
  currency: number;
  /** Free pulls (tickets) used before paying. */
  freePulls: number;
}

/** Currency needed for n pulls on top of the wallet (§5.1). Batches use batchCost when set. */
export function currencyFor(m: GachaModel, pulls: number, wallet: Wallet = { currency: 0, freePulls: 0 }): number {
  const paid = Math.max(0, pulls - wallet.freePulls);
  const size = m.pull.batchSize;
  const raw = m.pull.batchCost !== undefined ? Math.floor(paid / size) * m.pull.batchCost + (paid % size) * m.pull.cost : paid * m.pull.cost;
  return Math.max(0, raw - wallet.currency);
}

export interface TopUpTable {
  /** Granularity: needs and amounts are measured in units of `unit` currency. */
  unit: number;
  /** price[x] = cheapest total price buying at least x·unit currency. */
  price: Float64Array;
  /** Cheapest plan for `need` currency: pack id → count (first-bonus purchases listed as `<id>#first`). */
  plan: (need: number) => Record<string, number>;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Covering knapsack (§5.2): each pack's first-bonus purchase is a 0/1 item (price, amount + firstBonus); every
 * pack is also an unlimited item (price, amount). dp[x] = min price to get ≥ x units.
 */
export function topUpTable(packs: TopUpPack[], maxNeed: number): TopUpTable {
  const valid = packs.filter((p) => p.price >= 0 && p.amount > 0 && Number.isInteger(p.amount) && Number.isInteger(p.firstBonus ?? 0));
  const once = valid.filter((p) => (p.firstBonus ?? 0) > 0).map((p) => ({ id: `${p.id}#first`, price: p.price, amount: p.amount + p.firstBonus! }));
  const many = valid.map((p) => ({ id: p.id, price: p.price, amount: p.amount }));
  const unit = [...once, ...many].reduce((g, p) => gcd(g, p.amount), 0) || 1;
  const X = Math.max(0, Math.ceil(Math.max(0, maxNeed) / unit));
  const price = new Float64Array(X + 1).fill(Infinity);
  price[0] = 0;
  const take = once.map(() => new Uint8Array(X + 1));
  once.forEach((p, i) => {
    const a = p.amount / unit;
    for (let x = X; x >= 1; x--) {
      const c = p.price + price[Math.max(0, x - a)]!;
      if (c < price[x]!) { price[x] = c; take[i]![x] = 1; }
    }
  });
  const choice = new Int16Array(X + 1).fill(-1);
  for (let x = 1; x <= X; x++) {
    many.forEach((p, j) => {
      const c = p.price + price[Math.max(0, x - p.amount / unit)]!;
      if (c < price[x]!) { price[x] = c; choice[x] = j; }
    });
  }
  const plan = (need: number) => {
    const out: Record<string, number> = {};
    let x = Math.min(X, Math.ceil(Math.max(0, need) / unit));
    if (!Number.isFinite(price[x]!)) return out;
    while (x > 0 && choice[x]! >= 0) { const p = many[choice[x]!]!; out[p.id] = (out[p.id] ?? 0) + 1; x = Math.max(0, x - p.amount / unit); }
    for (let i = once.length - 1; i >= 0 && x > 0; i--) if (take[i]![x]) { out[once[i]!.id] = 1; x = Math.max(0, x - once[i]!.amount / unit); }
    return out;
  };
  return { unit, price, plan };
}

/** Cheapest price for n pulls given the wallet. */
export function priceFor(m: GachaModel, table: TopUpTable, pulls: number, wallet?: Wallet): number {
  const need = currencyFor(m, pulls, wallet);
  return table.price[Math.min(table.price.length - 1, Math.ceil(need / table.unit))]!;
}

export interface SpendSummary {
  /** Expected money spent to finish (pay-as-you-go, cheapest packs at each point); excludes the tail. */
  mean: number;
  /** Money for the 50th / 90th / 99th percentile of pulls. */
  p50: number;
  p90: number;
  p99: number;
  /** Money for the guaranteed worst case (when there is one). */
  max: number;
}

export function spend(m: GachaModel, d: Distribution, packs: TopUpPack[], wallet?: Wallet): SpendSummary {
  const lastN = d.pmf.length - 1;
  const table = topUpTable(packs, currencyFor(m, lastN, wallet));
  const at = (n: number) => (n < 0 ? NaN : priceFor(m, table, n, wallet));
  let mean = 0;
  d.pmf.forEach((p, n) => { if (p > 0) mean = mean + p * at(n); });
  const pct = (q: number) => at(d.cdf.findIndex((v) => v >= q - 1e-12));
  let max = 0;
  d.pmf.forEach((p, n) => { if (p > 0) max = n; });
  return { mean, p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: at(max) };
}
