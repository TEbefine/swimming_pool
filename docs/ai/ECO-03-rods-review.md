# Free fishing rods — review packet

Base dev-test-id 04d1c3a, pulled first. Gen buys fish and sells rods; Minato unchanged. Local/emulator only; no reset/main merge/release/shared database writes.

## Implemented

Four server-owned rod levels: Bamboo0 free/.20 net; Fiberglass1 600/.24; Carbon2 1800/.27; Master3 4500/.30. Shared rodConfig.ts drives catalogue, order, prices, icon IDs and landing snapshot. All free rods fill .28/s; drain .24. Normal responsive taps, rhythm timing/combo, yellow zone and star strike bonus retained. Dalbit uses unchanged net/fill/tap behavior and frozen trace.

rodLevel is normalized/defaulted to0, bounded0..3, projected through server load/write and account-scoped economy cache/wallet. Existing documents need no reset. shop.buy accepts existing intent schema only: exact target item must be next in stored order, quantity1 and at most one rod per cart. Normal supplies can share that atomic purchase. No client ownership field accepted, no goods slot consumed, no rod resale/discard. Exact request hashing/Replay, expectedTotal, operation limits, existing receipts and transaction read/write counts retained. Firestore permissions unchanged (all client writes denied).

Gen Supplies lists all four rods, marking current/owned/locked entries; only next tier can enter the cart. Upgrade automatically applies to future casts. The KEY pocket derives one current rod row, icon and Check description from wallet ownership, with the same menu/screen row source. Ownership remains server-authoritative; landing itself is client-side as before.

At cast time, numeric net size is snapshotted. Physics rails, in-net fill, event-time yellow-zone judgement and drawing use the same netSizeOf helper. The smaller starter net begins centered on the fish; upgrades arriving from another device during a reel cannot resize it. No roll, ticket/version, sale verification, pricing of fish, Book or cap changes.

## Art

Added explicit rods2x2 path and rods ID entry to process_shop_sheet.py. Original4x4 cutter remains unchanged. Cell-local keying retains disconnected guide-ring fragments instead of applying the large-shape filter. Four lossless transparent64x64 icons are in public/sprites/shop/. Inspected keyed icons on cream with enlarged nearest-neighbour view: full grips, reels and guide-ring outlines visible. Original sheet retained. Fine guide holes become tiny pixels at small Bag size; physical-phone readability remains a review item, not a promise of full source detail at32px.

## Earnings / first-upgrade condition

Reproduce `node docs/ai/analysis/ECO-03-rods-model.mjs`. JSON contains48 rows:4 rods ×3 profiles ×10/20/30/60min,1000 deterministic honest sessions each. Actual v2 roll and prices, shared3000/day cap, tier limits, cooler10 and operation budget. No rhythm in this baseline.

Casual30min median/P95: Bamboo534/833, Fiberglass622/989, Carbon674/1007, Master705/1037. Bamboo60min median1089 (P951488), including same-day glut/caps. Fiberglass600 is therefore reached during the second30-minute session by the median model; retain600. Carbon1800/Master4500 unchanged. Total6900 requires at least3 earning days from zero using fishing income alone.

These are occupancy estimates, not phone telemetry: existing skill/success/travel assumptions retained; net narrowing reduces assumed in-net share by .8 times lost zone height. This explicit width sensitivity is not calibrated human accuracy. Real casual players may differ; food/ice/other spending further delays upgrades. No universal two-session affordability claim. No new earnings source or cap refill on spending.

## Verification

323 unit/integration tests pass (319+4), zero failures/skips; polling enabled for this environment's watcher limits. npx tsc -b and npm run build pass, including four compiled Vercel API checks. npm run test:rules:11/11 pass, including new real Firestore concurrent upgrade/one-payment/Retry/denied client rodLevel write. Demo-lumen-bay only; CLI installed ephemerally without adding dependencies. git diff --check passes.

Bamboo level0 passes1920 non-rhythm controller runs at60/30/20fps with>=150ms queued input, all difficulty/big/star combinations and extreme targets. Controller geometry now uses .20 starter width/.10 half-width/.80 top rail; no rhythm bonus is granted to that controller. Existing real-session rig was corrected to read32px net height and target its center, rather than its former48px height. No difficulty/drain reduction. Random tapping, tap responsiveness, audio deadlines and38,400-frame story trace remain green.

New tests cover ordered server upgrades, skips/quantity/forged field rejection, exact Replay, funds/full goods bag/mixed tiers, wrong vendor and preservation through ordinary buy/load, per-cast widths/slower fill/centered start/story ignoring rods. Catalogue/storage-budget fixtures now include52 products and rodLevel (maximum compact economy JSON5353 bytes). Emulator race tests two distinct operation IDs against one next-rod SKU; one succeeds, one refuses, coins1400/rodLevel1 after starting2000, exact Retry creates no second log/payment.

Physical iPhone feel, Gen/Bag layout and new geometry remain for Teera's retest. No live browser screenshot or phone test claimed. No formal catchability proof. Unrelated existing untracked card-art file left untouched. Push dev-test-id and STOP for review.
