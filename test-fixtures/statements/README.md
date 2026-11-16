# Statement fixtures

Parser fixtures for the statement import (F-IMPORT, step 6). Each folder holds one document type:

| Folder                     | Document                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| `migros-bank-account/`     | Migros Bank private-account statement (_Extrait de compte_), fr    |
| `migros-bank-credit-card/` | Migros Bank credit-card bill issued through Viseca (_Facture_), fr |
| `yuh-account/`             | Yuh account statement (_Relevé de ton compte_), fr                 |

`docs/import-sources.md` describes each layout in prose. Read it before changing a parser.

## Invented data on a real layout

Every fixture was captured from a real statement and then anonymised. **No value in these files is
real.** What was kept, exactly as the real document has it:

- the number of pages, page sizes, and every text item in pdf.js order, including whitespace-only
  and empty items;
- every item's position, width, height, font and end-of-line flag;
- the length of every string;
- column headings, fixed labels, bank names, the banks' public addresses, phone numbers, websites
  and legal text, and merchant category labels of the card bill.

What was replaced by invented values: the holder's name and address; every account, card, customer,
client, document and reference number; IBANs; phone numbers; payees, payers and other people;
merchants and their locations; employers; securities and ISINs; every amount, balance, total,
quantity, price, exchange rate and fee; purchase times; and every date (moved to another month and
year, keeping weekdays plausible and the statement's internal order). Amounts were chosen so that
the document still adds up: running balances, page subtotals, carried-forward lines, totals,
summary blocks, payment slips, foreign-currency conversions and securities purchases (amount plus
commission plus tax) are all consistent, so a parser can check them. Invented identifiers keep
their check digits valid (IBAN modulo 97, QR reference modulo 10 recursive, ISIN), phone numbers use
an unassigned range and ISINs an unassigned country code. Replacements keep each string's length,
not its glyph widths: an item's `width` is the width of the original text, so a parser must not
measure strings.

The anonymisation was done by a script that needs the real documents, so it is not in this
repository, nor are the real documents. It checks that every invented number differs from every
number in the real documents, and a separate leak check compares these files with a deny-list
built from the real documents (names, address tokens, digit runs of four or more, amounts,
merchants, counterparties, references, dates). To add a fixture, capture a new statement the same
way, anonymise it outside the repository, and run a leak check before the file enters the working
tree.

## `fixture.json`: pdf.js text items

Captured with `pdfjs-dist` 6.4.299 in Node (`getDocument({ data, disableFontFace: true,
useSystemFonts: false })`, then `page.getTextContent()` with default options on each page). Those
options only affect rendering; the text items are what the browser build returns.

```jsonc
{
  "format": "pdfjs-text-items/1",
  "pdfjs": "6.4.299",
  "source": "yuh-account",
  "item": ["str", "x", "y", "width", "height", "font", "eol"],
  "fonts": { "f1": { "family": "serif", "ascent": 0.92, "descent": -0.21 } },
  "pages": [
    {
      "page": 1,
      "width": 595,
      "height": 842,
      "items": [["Achat", 78.2, 596.5, 21.06, 8, "f3", 0]],
    },
  ],
}
```

- `str`: `TextItem.str`.
- `x`, `y`: `TextItem.transform[4]` and `[5]`, in PDF points, origin at the bottom left of the page
  (y grows upwards), at the text baseline. Rounded to 0.01.
- `width`, `height`: `TextItem.width` and `height`. Whitespace-only items have height 0 and
  meaningless widths (up to several page widths): ignore them for geometry.
- `font`: a short id for `TextItem.fontName`, stable within the file; `fonts` gives pdf.js's style
  for it.
- `eol`: `TextItem.hasEOL` as 0 or 1. pdf.js also emits empty `""` items carrying an end of line.
- An eighth element, an object, would hold `transform` (rotated or skewed text) or `dir` (not
  left-to-right). No item in these fixtures needs one.

A test can rebuild what `getTextContent()` returns from this (`{ str, transform: [h, 0, 0, h, x, y],
width, height, fontName, hasEOL }`) and feed it to the parser without loading a PDF.

## `expected.json`: the parse a correct parser produces

- `statement`: document-level fields (holder, IBAN or card account, period or bill date, opening and
  closing balances, printed totals, and for the card bill the previous total, payment received,
  interest, amount due and payment-slip reference).
- `checks`: the arithmetic a parser should verify before accepting the file, with the expected
  results (all `true`); see the planned rule on refusing a statement that does not add up.
- `transactions`: in document order. Common fields:
  - `n`, `page`;
  - `bookingDate`, `valueDate`, `purchaseDate` (ISO calendar dates; `null` when absent),
    `purchaseTime` (account statement card purchases only);
  - `date`: the date to store, the purchase date when the statement gives one, else the booking
    date;
  - `direction` (`debit` or `credit`) and `amount` in integer rappen, always positive;
  - `kind`: `card-purchase`, `card-refund`, `twint-debit`, `twint-credit`, `payment`,
    `standing-order`, `salary` (account statement); `card-purchase`, `interest` (card bill);
    `securities-purchase`, `transfer-in` (Yuh);
  - `merchant`: the merchant or counterparty string as printed, the candidate key for merchant
    rules; `description`: the proposed stored description (the merchant, with the original amount
    appended for a foreign-currency purchase);
  - `counterparty`, `reference`, `card`, `original` (original currency, amount in that currency's
    minor unit, exchange rate, conversion fee), `fee`, `category` (card bill), `security` (Yuh),
    `balanceAfter` (only where the statement prints a balance);
  - `flags`: `card-bill-payment`, `own-account-transfer`, `salary`;
  - `handling`: the proposed default (`import`, `skip-by-default`, `skip-if-matches-income`,
    `review-credit`) and why;
  - `text` (all text lines of the entry joined with single spaces) and `textLines`.
- `skipped`: the lines inside the transaction area, and the summary blocks, that are not
  transactions, with the reason (opening and closing balances, carried-forward lines, totals,
  previous bill total, payment received, card headings).

The fields `description` and `handling` encode decisions that the product owner may still overrule;
update them with the decisions.
