# Import sources: statement layouts

What a developer needs to parse the household's statements without seeing a real one. The import
sources are three PDF documents (D-126): the Migros Bank private-account statement, the Migros Bank
credit-card bill issued through Viseca ("one"), and the Yuh account statement. They are parsed in
the browser with pdf.js, and the file never leaves the device (D-127).

Everything here comes from one real sample of each document, in French. Every value shown below is
invented; the examples show the shape, not data. Anonymised fixtures with the exact pdf.js output
and the expected parse are in `test-fixtures/statements/` (see its README). Where this text gives
coordinates, they are PDF points with the origin at the bottom left of an A4 page (595 × 842), as
pdf.js reports them, and they are approximate: calibrate on the table heading of each page rather
than hard-coding them.

## 1. What all three have in common

### Text from pdf.js

- All three PDFs have a real text layer; no OCR is needed. Each `TextItem` is a run of text in one
  font; pdf.js decides where runs break, and it does not always break where the eye sees columns.
- Lines are not given: group items by baseline `y`. Items of one visual line can differ by 0.5 pt
  (a label and its amount, a bold total and its figure), so group with a tolerance of about 2 pt,
  then sort each line by `x`. Lines of one entry are 9 to 11 pt apart, so 2 pt never merges two
  lines.
- pdf.js emits whitespace-only items (height 0, widths that mean nothing, up to several page widths
  in the Yuh statement) and empty `""` items carrying an end of line. Ignore both for geometry.
- One item can cover several columns. When a text overflows its column, the next column's value is
  appended to the same item (seen in the Migros Bank account statement and, by design, in the card
  bill, where both dates and the details are one item). Split such items with patterns, not
  coordinates.
- One printed field can also be split into several items (a merchant name broken at a space, or a
  padded field broken at a run of spaces). Join the items of a line with a single space and
  collapse runs of spaces before matching.
- Amounts are right-aligned under their column heading. Classify an amount by its right edge
  (`x + width`), compared with the right edge of the heading label (Débits, Crédits, Solde ...);
  in the sample the amounts end within 3 pt of the heading's right edge.

### Numbers and dates

- Amounts: digits, ASCII apostrophe `'` (U+0027) as thousands separator, `.` before exactly two
  decimals: `1'234.50`. No currency symbol inside table cells. No negative numbers in the account
  statements: the column says debit or credit. The card bill marks a credit with a trailing ` -`
  (space, hyphen) in the same item: `1'234.50 -`.
- Money is converted to integer rappen at once (`1'234.50` → 123450).
- Dates are calendar dates, never timestamps: `DD.MM.YY` in the Migros Bank tables, `DD.MM.YYYY`
  inside Migros Bank texts and everywhere in the Yuh statement. Convert to `YYYY-MM-DD` without any
  time zone. A two-digit year is 20YY.

### Characters

- French accents (é, è, à, ü, ô, û, É) extract correctly.
- A character the bank's font could not print (for example an emoji in a TWINT display name)
  arrives as `¿` (U+00BF), one per character. Keep it; do not treat it as an error.
- The Yuh statement uses the typographic apostrophe `’` (U+2019) in some labels and the ASCII one in
  others (`Solde à l’ouverture` but `Solde d'ouverture`). Match both.

### Recognising the document

Detect the source from the text of page 1, not the file name or PDF metadata:

| Source                   | Signature on page 1                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Migros Bank account      | `Banque Migros SA`, a line `Extrait de compte DD.MM.YYYY - DD.MM.YYYY`, heading `Date Texte Valeur Débits Crédits Solde CHF` |
| Migros Bank card bill    | `Banque Migros SA`, `Facture du`, `No du compte de la carte`, footer `Recouvrement de la créance par` / `Viseca Payment Services SA,` |
| Yuh account              | `Relevé de ton compte`, `Yuh account`, footer `© ... Yuh Ltd`                                             |

The file names seen were a random identifier for the Migros Bank statement, `Bill - <Month YYYY>.pdf`
for the card bill and `Account Statement - <Month YYYY>.PDF` (upper-case extension) for Yuh, with
English names on French documents. Accept any name and either case of `.pdf`.

## 2. Migros Bank private-account statement

### The document

The monthly statement (_Extrait de compte_) of a Migros Bank private account (_Compte privé
Migros_), downloaded as a PDF from Migros Bank e-banking (the exact menu was not confirmed with the
product owner). One sample, in French, five pages: four pages of transactions and one closing page.
Card purchases are those of the account's debit card; TWINT payments made from this account appear
here too, so TWINT needs no source of its own.

### Pages

- **Every page** starts with the bank's block at the top right (x ≈ 340 and ≈ 436): `Banque Migros
  SA`, `Case postale`, `8010 Zurich`, `banquemigros.ch`, the VAT number, `BIC/Swift: ...`,
  `banquemigros.ch/contact`.
- **Page 1** then has, at the left (x ≈ 71): a three-digit code, the salutation, the holder's name,
  street, postcode and town; at the right (x ≈ 340 labels, ≈ 436 values): `Portefeuille` /
  `Portefeuille principal`, `Compte privé Migros` / `<account number> / CHF` (account number like
  `12.345.678`), `IBAN` / the IBAN in groups of four. Below, the **summary block**:
  `Solde initial CHF <amount>`, `Débits CHF <amount>`, `Crédits CHF <amount>`,
  `Solde final CHF <amount>`, with `<Town>, DD.MM.YYYY` (place and statement date) at the left on
  the `Solde final` line. Then the bold title `Extrait de compte DD.MM.YYYY - DD.MM.YYYY` (the
  period) and the table.
- **Pages 2 and following** repeat the bank block, then `<Town>, DD.MM.YYYY`, the holder's name and
  address with the portfolio, account and IBAN block beside it, the title line, and the table. There
  is no summary block and no carried-forward line at the top of later pages.
- **Footer** of every page (y ≈ 18): three internal numbers separated by ` | ` at the left, and
  `Page n / N` at the right.
- **Last page**: the title line, then fixed text (check the statement within 30 days, card and
  TWINT claims), `Avec nos meilleures salutations`, `Banque Migros SA`, `Avis sans signature`. No
  table.

### The table

Heading line (small font) at y ≈ 462 on page 1, ≈ 612 on later pages:

| Column      | Heading x | Content                                                   |
| ----------- | --------- | --------------------------------------------------------- |
| `Date`      | ≈ 72      | booking date `DD.MM.YY`, first line of an entry only       |
| `Texte`     | ≈ 112     | description, wrapped over one to five lines                |
| `Valeur`    | ≈ 310     | value date `DD.MM.YY`, first line only                     |
| `Débits`    | right ≈ 412 | debit amount, first line only                            |
| `Crédits`   | right ≈ 477 | credit amount, first line only                           |
| `Solde CHF` | right ≈ 551 | balance, only on the last entry of a booking day (below) |

The first table line is `Report à nouveau` (bold) with the opening balance in the Solde column.
The last lines, on the last page of transactions, are `Solde au DD.MM.YYYY` (bold) with the total of
debits, the total of credits and the closing balance in their three columns, then `Solde final`
with the closing balance again.

An entry starts on a line whose first item is a date at x ≈ 72. Every following line without a date
at x ≈ 72 belongs to the same entry, until the next date, the `Solde au` line or the footer.
Entries are about 12 pt apart per line (a two-line entry takes about 24 pt). In the sample no entry
was split across a page break, but a booking day was (see quirks).

The `Texte` column is about 195 pt wide (up to about 50 characters); the bank wraps the text
anywhere, including inside `Montant: CHF` / `<amount>`, between a date and its time, and between a
person's name and their phone number.

### Entry patterns

Invented examples, laid out as the columns are; continuation lines sit under the `Texte` column.

**Card purchase** (debit; debit card, CHF):

```text
03.02.25 Achat Boulangerie Exemple 01.02.2025 07:45 Carte:  01.02.25   6.40
         512345******9876 Montant: CHF 6.40
```

Pattern, once the lines are joined: `Achat <merchant> <DD.MM.YYYY> <HH:MM> Carte: <card> Montant:
<CUR> <amount>`. The purchase date and time are inside the text; the value date equals the purchase
date; the booking date is one to four days later. `<card>` is the masked debit card, six digits,
six asterisks, four digits. `Montant:` repeats the amount in the purchase currency.

**Card purchase in a foreign currency** (debit):

```text
14.02.25 Achat EXAMPLE SHOP REF0012345 10.02.2025  10.02.25   25.35
         19:20 Carte: 512345******9876 Montant: EUR
         23.80
         EUR 23.80 au cours de 0.987654
         plus frais de CHF 1.85
```

The debit is in CHF and includes the fee. The CHF amount is close to, but not exactly,
`amount × rate + fee` (in the sample it looked rounded to 0.05). Keep the original currency and
amount, the rate and the fee.

**Card refund** (credit): `Crédit <merchant> <DD.MM.YYYY> <HH:MM> Carte: <card> Montant: CHF
<amount>`, same shape as a purchase, amount in the Crédits column. The value date is the booking
date, not the purchase date.

**TWINT payment to a merchant** (debit): `Débit TWINT <merchant> <id>`, usually one line, `<id>` a
16-digit TWINT transaction id:

```text
05.02.25 Débit TWINT Example Shop 0400001234567890  05.02.25   13.70
```

**TWINT payment to a person** (debit): `Débit TWINT <Last>, <First>, +41<9 digits>` then the id on
the next line. Long names push the phone number to the next line:

```text
06.02.25 Débit TWINT Muster, Anna, +41700000001     06.02.25   20.00
         0400001234567891
07.02.25 Débit TWINT Exemple de Muster, Jean-Luc,   07.02.25    8.50
         +41700000002 0400001234567892
```

**TWINT credit** (money received from a person): `Crédit TWINT <Last>, <First>, +41<9 digits>` and
the id, in the Crédits column.

The value date of a TWINT entry is the day of the payment and can be earlier than the booking date.

**Payment** (e-banking or QR-bill payment, debit): `Paiement` alone on the first line, then the
payee's name, street, postcode and town, and for a QR bill the 27-digit QR reference printed
`NN NNNNN NNNNN NNNNN NNNNN NNNNN` (its last digit is a modulo-10 recursive check digit):

```text
10.02.25 Paiement                                   10.02.25  350.00
         Exemple Energie SA
         Rue de l'Exemple 1
         9999 Exempleville
         00 00000 00000 00000 00000 00000             12'345.60
```

**Standing order** (debit): `Ordre permanent`, then the payee's name, street, postcode and town. No
reference in the sample.

**Salary** (credit): `Paiement de salaire <employer>`, continued on the next line (the employer's
name may run over two lines, for example `<company> c/o` / `<parent company>`).

### Recognising special entries

- **Credit-card bill payment**: a `Paiement` whose payee is `Viseca Payment Services SA`,
  `Hagenholzstrasse 56`, `8050 Zürich`. In the sample its QR reference is ten zeros, the 16-digit card account
  number (`No du compte de la carte` on the card bill) and a check digit, so it can be matched to a
  specific card account and to the reference on that bill's payment slip.
- **Transfer to the owner's own account**: a `Paiement` (or `Ordre permanent`) whose payee name is
  the statement holder's name, possibly in the order `<Last> <First>`, at the holder's address. The
  statement does not print the payee's IBAN, so the name and address are the only clue; a payment to
  another person at the same address is not an own transfer.
- **Salary**: `Paiement de salaire`.
- **Other credits**: TWINT credits from people, card refunds (`Crédit <merchant>`), and anything
  else in the Crédits column.

### What is not a transaction

- `Report à nouveau` (opening balance carried forward), `Solde au DD.MM.YYYY` (totals and closing
  balance) and `Solde final`.
- The page 1 summary block, the address and portfolio block, the title line, the headings, footers
  and the last page.

There were no interest, fee or account-charge lines in the sample (see open points).

### Identifying the merchant

- Card purchase or refund: the text between `Achat ` (or `Crédit `) and the purchase date. The bank
  cuts merchant names at 24 characters, mid-word (`Restaurant Exemple du Lac` becomes `Restaurant
  Exemple du La`); the same merchant can appear with different capitalisation
  (`PayUp *Shop` and `PAYUP *SHOP`), and chains carry a branch number (`Mini Market 5210`).
- TWINT: the text between `TWINT ` and the id, or the `<Last>, <First>` before the phone number.
- Payment and standing order: the payee's name (first continuation line).
- Salary: the employer text.

### Checks the statement allows

- Opening balance (`Report à nouveau`) + credits − debits = closing balance.
- The sums of the Débits and Crédits columns equal the `Solde au` totals and the page 1 summary.
- Every printed balance equals the running balance after that entry.

### Quirks

- **The balance is printed once per booking day**, on the last entry of the day; other entries have
  an empty Solde cell. When the last entry of the day has several lines, the balance can sit on its
  last continuation line (seen on `Paiement` and `Ordre permanent` entries) instead of its first.
  Read the balance from any line of the entry. A booking day can start on one page and end on the
  next; the balance then appears on the next page.
- **Value date glued to the text**: when the first text line is long, the value date is appended to
  the text item (`Débit TWINT <merchant> <id> DD.MM.YY`) and there is no item at x ≈ 310. Take a
  trailing `DD.MM.YY` of the first text line as the value date.
- **Amount-looking strings in the text column** (`Montant: CHF` wrapped and the amount alone on the
  next line, or an `EUR 23.80 ...` line) are text, not amounts: only amounts at x ≥ the Valeur
  column count.
- The totals and `Report à nouveau` lines use a second font (bold).
- The value-date and amount columns hold nothing on continuation lines, except the day's balance.

## 3. Migros Bank credit-card bill (Viseca "one")

### The document

The monthly bill (_Facture_) of a Migros Bank credit card issued by Viseca Payment Services SA,
downloaded as a PDF from Viseca's "one" app or portal. One sample, in French, with one card (a Visa)
on the card account. The PDF has four pages; the page numbers say `Page n/3` and the fourth page,
the payment slip, carries no number.

### Pages

- **Page 1**, top: the bank's block at x ≈ 388 (`Banque Migros SA`, `Case postale`, `8010 Zurich`,
  phone, `banquemigros.ch`), a postal franking block at the left (`P.P.`, `Response Zentral`,
  `Post CH AG`, `Postbox ...`, `CH-8050 Zürich`, `E`), the holder's salutation, name and address
  (x ≈ 67; the town may be all lower case). Then the **bill block** at x ≈ 388, values right-aligned
  near x ≈ 574: `Facture du DD.MM.YYYY` (bill date), `Limite globale CHF <limit>`,
  `Payable jusqu'au DD.MM.YYYY` (due date), `No du compte de la carte NNNN NNNN NNNN NNNN`,
  `Titulaire du compte <name>`. Limits are written without decimals (`CHF 5'000`).
- **Table heading** on two lines: `Date de` / `valeur` above the second date column, `Montant en` /
  `CHF` above the last column; the second line also has `Date`, `Détails`, `Monnaie`, `Montant`.
- **Footer** of pages 1 to 3: `Page n/3` at the left, and `Recouvrement de la créance par` /
  `Viseca Payment Services SA,` / `Hagenholzstrasse 56, 8050 Zurich` at the right.
- **Page 2** repeats the bank block (without phone) and the heading, then `Report total <amount>`,
  the card heading again, `Limite de carte`, `Report de la carte <amount>`, and the rest of the
  rows. After the totals: a Cumulus block (`Informations sur le programme de bonus Cumulus`,
  `Numéro Cumulus <13 digits>`, a sentence naming the month of the next Cumulus statement).
- **Page 3**: marketing text only.
- **Page 4**: the Swiss QR-bill payment part (`Récépissé`, `Section paiement`, `Compte / Payable à`
  with Viseca's QR-IBAN, `Référence`, `Payable par`, `Monnaie` / `Montant` with the amount due,
  `Point de dépôt`). Each value appears twice (receipt and payment part). The QR code itself is an
  image, not text.

### The table

| Column             | x                | Content                                                                |
| ------------------ | ---------------- | ---------------------------------------------------------------------- |
| `Date`             | ≈ 67             | transaction (purchase) date `DD.MM.YY`                                  |
| `Date de valeur`   | ≈ 101            | booking date `DD.MM.YY`                                                 |
| `Détails`          | ≈ 135            | merchant and location; continuation lines start at x ≈ 135             |
| `Monnaie`          | ≈ 410            | currency of the original amount (`EUR`, `USD`, also `CHF`), or empty   |
| `Montant`          | right ≈ 514      | original amount, or on continuation lines the converted amount and fee |
| `Montant en CHF`   | right ≈ 571      | the amount billed in CHF (` -` appended for a credit, ending ≈ 577)    |

**The two dates and the details are one pdf.js item** starting at x ≈ 67:
`DD.MM.YY DD.MM.YY <details>`. Split it with a pattern. The item may itself be split in two at a
space inside the details (`... CABZ` + `*RIDE, CITY NL`), or at a run of spaces inside a padded
merchant field.

### Rows

Before the card section, three header rows (examples invented):

```text
           12.01.25 Montant total dernier relevé                                    1'500.00
09.02.25 09.02.25 Votre paiement - Merci                                            1'500.00 -
12.02.25 12.02.25 Intérêt moratoire pour 27 jours                                       8.40
                  Intérêt par année 12.50%
```

- `Montant total dernier relevé`: the previous bill's total, with only the second date (the
  previous bill date), its item starting at x ≈ 101. Not a transaction.
- `Votre paiement - Merci`: the payment received, a credit (trailing ` -`). Not an expense: it is
  the other side of the card-bill payment on the bank account.
- `Intérêt moratoire pour N jours` with `Intérêt par année R%` below: late-payment interest charged
  on the previous bill, a debit. Imported as a transaction (D-132).

Then one section per card: a bold heading `<card> <product>, <holder>` (card masked as
`NNNN NNXX XXXX NNNN`) and `Limite de carte CHF <limit>`, then one row per purchase:

```text
13.01.25 14.01.25 EXAMPLE SOFTWARE, CITY IE        CHF        40.00       40.70
                  Logiciels informatiques
                  Frais de traitement 1.75%        CHF         0.70
18.01.25 19.01.25 EXAMPLE HOTEL, CITY FR           EUR       110.00      106.35
                  Hôtels, établ. d'hébergement
                  Taux de conversion 0.9500000 du 19.01.25    CHF 104.50
                  Frais de traitement 1.75%        CHF         1.85
23.01.25 26.01.25 EXAMPLE RIDE, CITY NL                                    7.80
                  Taxis
```

- First line: purchase date, booking date, details `<MERCHANT>, <LOCATION> <CC>` (location is a
  city, sometimes followed by a district number, or a phone number for some online merchants;
  `<CC>` is the two-letter country code), then, for a purchase not in CHF or made abroad, the
  currency and original amount, and always the CHF amount.
- Second line: the merchant category (Viseca's French label, for example `Taxis`,
  `Restaurants, bistros`, `Supermarchés, alimentation`, `Logiciels informatiques`). Present on
  every purchase in the sample.
- For a foreign currency: `Taux de conversion <rate, 7 decimals> du DD.MM.YY` with `CHF` and the
  converted amount in the Montant column, then `Frais de traitement <p>%` with `CHF` and the fee. The
  CHF column = converted amount + fee. Purchases with the same rate date share one rate.
- For a CHF amount charged by a merchant abroad (currency `CHF` in the Monnaie column): no rate
  line, only the fee line; the CHF column is the amount plus fee rounded, and may differ by 0.01
  from the sum of the printed figures.
- Domestic CHF purchase: no currency, no original amount, only the category line.
- Every amount in the CHF column of the sample is a multiple of 0.05, conversions and fees
  included.

Rows are sorted by booking date (second column), not by purchase date.

### Totals

Bold lines with the amount in the CHF column:

- `Total intermédiaire de la carte` (end of a page): the card's rows on that page.
- `Total intermédiaire` (end of a page): the bill so far.
- `Report total` and `Report de la carte` (start of the next page): the same two figures carried
  forward.
- `Total carte <product> <card>`: all rows of the card.
- `Montant total de la facture en notre faveur` and `Montant dû`: the bill total, equal to the
  amount on the payment slip.

Bill total = previous bill total − payment received + interest + the card totals. None of these
lines is a transaction.

### Recognising special entries

- **Payment received**: `Votre paiement - Merci` (skip; the bank-account side is the card-bill
  payment, D-129).
- **Interest and fees**: `Intérêt moratoire ...` in the sample; an annual card fee or other charges
  would presumably look similar but were not seen.
- **Refunds**: not seen; presumably a purchase row with a trailing ` -` in the CHF column.

### Identifying the merchant

The details text before the last `, `; the location and country after it. Merchant strings carry
processor prefixes and store or terminal numbers (`XYZ* PREAUTH.EXAMPLE.NET`, `NAME 1234567`), and
several rows of one merchant can have different prefixes. The category line is a useful second key.

### Extra data

Purchase date, booking date, merchant category, location and country, original currency and amount,
conversion rate and its date, the fee and its percentage, the masked card (one bill can cover
several cards), the card account number, bill date and due date, the previous total and the payment
received, the interest rate and number of days.

## 4. Yuh account statement

### The document

The monthly statement (_Relevé de ton compte_) of a Yuh account (Yuh is the app of Swissquote Bank
and PostFinance; the bank is Swissquote Bank Ltd), downloaded as a PDF from the Yuh app. One sample,
in French (informal "tu"), three pages, one currency section (CHF). The only entry types in the
sample were securities purchases and an incoming transfer.

### Pages

- **Page 1**: title `Relevé de ton compte` (large), `Extrait de compte du DD.MM.YYYY au DD.MM.YYYY`
  (the period, as separate items), `Document généré le DD.MM.YYYY`; at the right (x ≈ 359) the
  salutation and name on one line, street, postcode and town; `Yuh account`, `IBAN` with the IBAN
  in groups of four, `Client` with the client number, `SWIFT` with the BIC. At the left:
  `Solde à l’ouverture`, `Solde à la clôture`, `Solde du compte d'épargne`, each with the amount (a
  larger font) and `CHF` as separate items. Then `Solde de clôture réparti entre toutes les
  devises` with one entry per currency (`Franc suisse`, then the amount and `CHF`). Legal text at
  the bottom, `© <year> Yuh Ltd` and `Page n / N`.
- **Page 2 and following**: a header with the name, `IBAN : <IBAN>`, `Document généré le ...` and
  `Du DD.MM.YYYY au DD.MM.YYYY`; then one section per currency: `Extrait de compte en CHF` (large),
  the section summary `Solde reporté au <start date> <amount> CHF`, `Total débit <amount> CHF`,
  `Total crédit <amount> CHF`, `Solde reporté au <end date> <amount> CHF`, and the table. The legal
  text and a footer with Swissquote's address and customer-care number end each page.
- **Last page**: header and legal text only.

### The table

| Column        | x           | Content                                     |
| ------------- | ----------- | ------------------------------------------- |
| `DATE`        | ≈ 31        | booking date `DD.MM.YYYY`                   |
| `INFORMATION` | ≈ 78        | type label (bold) and continuation lines    |
| `RÉFÉRENCE`   | ≈ 228       | 10-digit reference, increasing              |
| `DÉBIT`       | right ≈ 298 | debit amount                                |
| `CRÉDIT`      | right ≈ 377 | credit amount                               |
| `DATE VALEUR` | ≈ 431       | value date `DD.MM.YYYY`                     |
| `SOLDE (CHF)` | right ≈ 558 | balance after the row, **on every row**     |

The first row is `Solde d'ouverture` with the opening balance and the last `Solde de clôture` with
the closing balance (date, label and balance only). An entry starts on a line with a date at x ≈ 31;
following lines at x ≈ 78 belong to it.

### Entry patterns

**Securities purchase** (debit; invented example):

```text
05.03.2025 Achat                 3001234567   45.07          07.03.2025      120.00
           Example World Equity ETF (EXWE)
           Quantité: 0.6500
           Prix: CHF 69.23
           Montant: CHF 45.00
           Commission: CHF 0.00
           Taxe: CHF 0.07
           Plateforme de négoce: SIX Swiss
           Exchange
           ISIN: ZZ0000000000
```

The debit = Montant + Commission + Taxe; Quantité = Montant / Prix, four decimals; the value date is
the settlement date (two business days later). The venue wraps onto its own line.

**Transfer in** (credit): `Virement de`, then the payer's name, street (with a comma before the
number), postcode and town, country code, and the payer's IBAN without spaces. A transfer from the
owner's own account shows the holder's name (as `<Last> <First>`) and the IBAN of their other
account.

### Checks

- Every row's balance is the previous balance plus the credit or minus the debit.
- Sum of debits = `Total débit`, sum of credits = `Total crédit`, start + credits − debits = end,
  and the page 1 opening, closing and per-currency balances agree.

### Quirks

- Section summary amounts are followed by `CHF` as a separate, smaller item.
- pdftotext indents some rows differently; pdf.js gives the same x for every row.
- Typographic and ASCII apostrophes are mixed (see section 1).
- `Solde du compte d'épargne` is a separate savings balance; movements of the savings account were
  not seen.

### Identifying the merchant

Securities purchase: the security's name (first continuation line), with the ISIN as a stable key.
Transfer: the payer's name.

## 5. What a parser must guarantee

The planned import rules (R-IMPORT-084 and following) build on this analysis. In short:

- Detect the source from the content, and refuse a PDF that matches none, or that has no text
  layer, with an explanation.
- Find every entry of the table; never take a heading, footer, balance, carried-forward, total or
  summary line for a transaction.
- Add up what was parsed and compare it with what the statement prints (column totals, running
  balances, bill total); refuse the import with an explanation when they differ.
- Treat every money amount as integer rappen and every date as a calendar date.
- Keep the extra data (purchase date and time, value date, references, original currency, rate,
  fee, category, security) available to the review screen, and store the description with the
  original amount for foreign currencies (D-133).
- Flag card-bill payments and transfers between the owner's own accounts (D-129), salary and other
  credits (D-130).

## 6. What one sample of each could not settle

- **Languages**: only French was seen. German, Italian and English versions exist for these banks
  and will have other labels, possibly other date or number formats (D-134 supports French first).
- **Migros Bank account**: entry types not in the sample (cash withdrawals, eBill and direct debits,
  incoming transfers from other people, TWINT refunds, interest and account fees at period end,
  foreign-currency accounts); an entry split across a page break; a negative balance; amounts of a
  million or more; a statement covering several accounts or portfolios; whether the e-banking also
  offers CSV or camt.053 exports.
- **Card bill**: several cards on one account (supplementary cards), refunds and credits, annual
  fees, cash withdrawals, a bill longer than two pages of rows, a bill without a previous payment or
  with a partial payment, how late-payment interest is computed, and whether the 0.05 rounding is a
  rule.
- **Yuh**: other currencies (one section each, presumably), sales, dividends, fees and currency
  exchange, card purchases with the Yuh card, TWINT, outgoing transfers, savings-account movements,
  amounts of a thousand or more (the thousands separator was not seen), and an entry split across a
  page.
- **All**: whether the layouts change over time; the fixtures pin one version of each.
