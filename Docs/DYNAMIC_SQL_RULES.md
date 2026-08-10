# Dynamic SQL Rules

Several routes and services build SQL strings with runtime-conditional pieces:
filter clauses that only appear when a query param is set, column names that
vary by deployment schema (mileage's `date`/`trip_date`) or by business
region (tax summary's `tax_map_ca`/`tax_map_us`), and `SET` clauses that only
include the fields being updated. Every one of these follows the same four
rules. New dynamic SQL should too.

1. **Values are always parameters.** User- or request-derived data (search
   text, IDs, dates, amounts) is passed through `$1`, `$2`, ... — never
   interpolated into the SQL string, even when it's already been validated.
2. **Identifiers come only from constants or closed maps.** Column and table
   names that vary (e.g. `tax_map_ca` vs `tax_map_us`, `date` vs `trip_date`)
   are selected from a fixed, hardcoded set of choices the code owns — never
   from a request field, even indirectly (e.g. via a client-supplied "sort
   column" name).
3. **Structural fragments come from closed enums.** Things like which `SET`
   clauses appear, or whether a `WHERE` clause includes a name-match branch,
   are driven by a fixed set of internal flags/filters — not by arbitrary
   client-supplied structure.
4. **No request-derived text inside a SQL template string, ever.** Not even
   for things that feel safe, like an already-validated enum value — route
   it through a parameter or a local constant lookup instead.

Existing examples that follow this: `transactionListQueryService.js`
(`buildTransactionListWhereClause`), `mileageQueryService.js`
(`mileageDateColumn`, `buildMileageInsertSql`), `taxSummaryService.js`
(region-based tax column selection), `usageLimitEmailService.js`
(`RESOURCE_CONFIG`-driven `SET` clause).

When adding a new dynamic SQL fragment, prefer a small pure function that
takes the relevant flags/filters and returns the SQL fragment (and, where
values are involved, the parameter array to go with it). Keeping it
side-effect-free means it can be tested directly against the exact shapes
you expect, without a database.
