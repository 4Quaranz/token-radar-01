# Token Radar — which pre-token protocol is worth farming next?

A token launch radar for the make.fun `token-radar-01` bounty. It reads a sealed
DefiLlama snapshot of 758 protocols, keeps the ones that record no token, and ranks
them by what a token would be worth if the protocol's record stayed as it is — then
shows a reader how to farm each one.

## The model (radar-2)

```
implied = round(TVL × catMult × growth × maturity × breadth)
```

- **Category multiple** — read off the snapshot itself, never set by hand: for each
  category, the median market-cap over TVL of that category's live-token protocols,
  shrunk toward the global median when the sample is small, clamped to 0.05–1.50.
  A category with fewer than 3 live protocols takes the global median, so one
  outlier never sets a category's price.
- **Growth** — the 7-day TVL change, clamped to −60…+120%, weighted by 0.5.
- **Maturity** — 0.6 for a new protocol, rising to 1.0 after 1,095 days listed
  (unknown listing date counts as 365 days).
- **Chain breadth** — +2% per extra chain, up to 5 extra chains.

No protocol name is special-cased: the same function scores every row, so a future
snapshot scores protocols that do not exist yet the same way.

The board covers the snapshot's whole 40-protocol watchlist plus 138 early finds
below the $50M floor (pre-token, and not a wrapped, staked or bridged product of a
token that already trades, by the house rule's own tests). The 24 largest live-token
protocols are shown apart, at the market's own values, never mixed into the ranking.

## The farm plan

Every row carries seven steps, each with a cost and a time, derived from the
protocol's own record (category, chains, TVL, age): a fresh wallet, the category's
main action, a second qualifying action, a weekly action, a hold of 30–60 days,
claiming only from the protocol's own published link, and a farm log.

## Run it

Node 22 or later, standard library only:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

That writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's
data), `out/dashboard/` (the page), `out/screenshots/` (the three screenshots) and
`out/dossier.json` (the judge's dossier, built with the vendored library).

## The dashboard

`dashboard/` is a static page with no network and no framework: a sortable,
filterable board (search, category, chain, watchlist-only), a detail drawer for
every protocol with the model's own factor breakdown and the farm plan, a
live-token view, and the model itself with its category multiples table.

## Caveats

Implied value is this radar's own claim from the snapshot's figures, never a
promise that a token launches or what it would trade at. A protocol the snapshot
records as having no token may still have one its record does not carry. Never pay
to claim an airdrop.
