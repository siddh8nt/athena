# Stockist lists

Public stockist data from each brand's own store locator, collected on 8 Oct 2026 for the blind test (PRD §10.2). This is public business data, not Qloo data.

Each row is one stockist inside one of the 25 largest US metros. Columns: brand, category, venue, address, city, state, zip, metro, type, is_chain, lat, lon, source_url, date_collected.

| Brand | Category | Rows | Independent | Metros with ≥ 20 independents | Strongest metros (independents) |
|---|---|---|---|---|---|
| Fishwife | G1 | 5,044 | 1,516 | 21 | NYC 223, LA 218, SF Bay 156, Seattle 113, Boston 92, Denver 69 |
| Paddywax | G4 | 870 | 785 | 13 | LA 105, NYC 100, Dallas 67, Seattle 64, Chicago 53, SF Bay 43 |
| Brightland | G1 | 964 | 531 | 9 | NYC 108, LA 87, SF Bay 49, Denver 33, Boston 24, Chicago 23 |
| Rishi Tea & Botanicals | G2 | 1,929 | 323 | 6 | NYC 74, SF Bay 34, Chicago 29, Boston 22, LA 20, Minneapolis 20 |
| Raaka Chocolate | G1 | 771 | 391 | 5 | NYC 141, LA 31, SF Bay 29, Boston 24, Philadelphia 21 |
| MUD\WTR | G2 | 600 | 284 | 4 | LA 101, Chicago 62, Minneapolis 55, SF Bay 49 |
| McClure's Pickles | G1 | 613 | 418 | 3 | Detroit 142, NYC 95, Minneapolis 32 |
| Dick Taylor Craft Chocolate | G1 | 191 | 168 | 2 | SF Bay 56, LA 28 |
| Diaspora Co. | G1 | 147 | 114 | 2 | SF Bay 28, LA 21 |
| Juniper Ridge | G3 | 295 | 123 | 2 | SF Bay 31, LA 22 |

## Caveats

- **`is_chain` is a heuristic:** a name on a list of about 200 known chains, or a name that appears 3 or more times in the brand's list. Review it by hand before registering the test.
- **`type` is empty.** The locators don't provide venue types.
- **"Independent" includes bars, restaurants and gift shops,** not only cafés and grocers.
- **MUD\WTR covers four metros only:** LA, Chicago, Minneapolis and the SF Bay Area.
- **A few addresses are incomplete,** such as airport terminals.
