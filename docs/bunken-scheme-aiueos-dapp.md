# app-bunken（書誌 identifier）— itonami（dapp）上の分散型設計

状態: 第 1 スライス実装（2026-10-20）。正本はこの文書。
追跡: Linear JUN-128（親 JUN-116）。

## 位置づけ

app-bunken は**文献書誌 Intelligence** —— 世界の図書館・アーカイブ文献を
actor 化（Common Crawl CDX で書誌 URL 発見 → CollectionJob → enrich →
path-based DID 登録 → SAME_AS edge）。この project の wasm 面は T3 fallback。

## このスライス: identifier 体系・ジョブ判定コア

| 層 | 実体 | 状態 |
|---|---|---|
| 判定コア guest | `aiueos/bunken_scheme.cljk` — scheme-ok（**BunkenScheme の 9 つ**: ndl:bib / ndl:pid / ncid / lccn / oclc / isbn / doi / viaf / ark）/ material-ok（**MaterialType の 7 つ**）/ job-admission（scheme 検証 + urlPattern 必須）/ job-pick（**pending が無いジョブは noPendingJob**） | **実装済み・実測** |
| 記述子 | `aiueos/bunken-scheme.edn` | **実装済み** |
| parity | `kotoba/test/bunken/scheme_parity_test.cljk` — 正本（types.ts / collection.ts）の閉じた集合・拒否名と一致 | **実装済み・実測** |

実測: `amu test aiueos/bunken_scheme.cljk` → **15/15**（jvm-kir / js / wasm）。
parity → 2 tests / 20 assertions / 0 failures。

## 正本の正確な規則（guest はこれに追従）

- **BunkenScheme** = ndl:bib / ndl:pid / ncid / lccn / oclc / isbn / doi /
  viaf / ark。「Scheme-native identifier（NDL bibId, NCID, DOI suffix,
  ISBN-13, …）」—— **scheme 固有の identifier は scheme の中でしか意味を
  持たない**。CollectionJob も `BUNKEN_SCHEMES.has` で検証。
- **MaterialType** = book / article / serial / thesis / manuscript / map /
  other。
- CollectionJob: scheme 検証 + urlPattern 必須、status は pending から
  （失敗は failed）。**pending が無ければ noPendingJob**。

## 未実装境界

- CDX 結果パース（fetchCdxBatch）、enrich（LLM メタデータ抽出）、
  SAME_AS 同一文献リンクの判定。
- scheme 固有 identifier の形判定（ISBN-13 チェックは app-isbn の判定コアと
  接続候補）。
- mon（DNA）化、aiueos session 載せ（fleet 共通）。
