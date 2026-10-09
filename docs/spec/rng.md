# 亂數規格

全部使用 32 位元無號整數運算（uint32，溢位即取模 2^32）。

## 1. 亂數流種子
```
key   = UTF-8 bytes of (String(seed) + ":" + stream)
h     = FNV-1a 32：h = 0x811C9DC5；對每個 byte：h = (h XOR byte) * 0x01000193  (mod 2^32)
state = h
for i in 0..3:
    state = state + 0x9E3779B9
    z = state
    z = (z XOR (z >> 16)) * 0x85EBCA6B
    z = (z XOR (z >> 13)) * 0xC2B2AE35
    z =  z XOR (z >> 16)
    word[i] = z
(a, b, c, d) = word[0..3]
執行 sfc32 12 次並丟棄輸出（暖機）
```
- `seed` 只允許 0..4294967295 的整數或字串；整數以十進位、無前導零轉字串。因此整數 `5` 與字串 `"5"` 產生相同亂數流。
- 每個子系統使用自己的 `stream` 名稱，例如 `damage.crit`。新增亂數抽取點不會影響其他子系統的重播。

## 2. sfc32
```
t = a + b + d
d = d + 1
a = b XOR (b >> 9)
b = c + (c << 3)
c = (c << 21) | (c >> 11)
c = c + t
return t
```

## 3. 衍生函式
- `next()`：`u32 / 4294967296`，以 double 除法計算（不可整數除法），範圍 [0, 1)。
- `chance(p)`：`next() < p`，**固定消耗一次**抽取（即使 p 為 0 或 1）。
- `int(n)`：n 必須是 1..2^32 的整數，否則為錯誤。拒絕取樣。`limit = 2^32 − (2^32 mod n)`；重抽直到 `u32 < limit`，回傳 `u32 mod n`。
