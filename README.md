# lt-open-data-sdk

TypeScript SDK for the **Lithuanian Open Data platform** ([data.gov.lt](https://data.gov.lt)) powered by the Spinta engine.

## Features

- 🔍 **QueryBuilder** - Fluent API for constructing DSQL queries
- 🌐 **SpintaClient** - HTTP client with automatic pagination
- 🛠️ **CLI Type Generator** - Generate TypeScript interfaces from live API
- 🔐 **OAuth Support** - Client credentials authentication _(untested)_

## Installation

```bash
npm install lt-open-data-sdk
```

Requires Node.js ≥18 (uses native `fetch`).

## Quick Start

```typescript
import { SpintaClient, QueryBuilder } from "lt-open-data-sdk";

const client = new SpintaClient();

// Fetch data with a query
const query = new QueryBuilder()
  .select("_id", "pavadinimas")
  .filter((f) => f.field("sav_kodas").gt(10))
  .sort("pavadinimas")
  .limit(10);

const data = await client.getAll(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe",
  query
);
console.log(data);
```

---

## QueryBuilder

Build type-safe queries with a fluent API:

```typescript
const query = new QueryBuilder<MyType>()
  .select("field1", "field2") // Select specific fields
  .filter((f) => f.field("x").eq(1)) // Add filters
  .sort("field1") // Sort ascending
  .sortDesc("field2") // Sort descending
  .limit(100); // Limit results

const queryString = query.toQueryString();
// Returns: ?select(field1,field2)&x=1&sort(field1,-field2)&limit(100)
```

### Filter Operators

| Method             | Query                     | Description           |
| ------------------ | ------------------------- | --------------------- |
| `.eq(value)`       | `field=value`             | Equals                |
| `.ne(value)`       | `field!=value`            | Not equals            |
| `.lt(value)`       | `field<value`             | Less than             |
| `.le(value)`       | `field<=value`            | Less than or equal    |
| `.gt(value)`       | `field>value`             | Greater than          |
| `.ge(value)`       | `field>=value`            | Greater than or equal |
| `.contains(str)`   | `field.contains("str")`   | Contains substring    |
| `.startswith(str)` | `field.startswith("str")` | Starts with           |

### Combining Filters

```typescript
// AND
.filter(f => f.field('a').eq(1).and(f.field('b').eq(2)))
// Output: a=1&b=2

// OR
.filter(f => f.field('a').eq(1).or(f.field('b').eq(2)))
// Output: a=1|b=2

// Complex (OR inside AND - auto-wrapped in parentheses)
.filter(f => f.field('a').gt(10).and(
  f.field('b').eq(1).or(f.field('b').eq(2))
))
// Output: a>10&(b=1|b=2)
```

---

## SpintaClient

### Basic Usage

```typescript
const client = new SpintaClient();
// Uses https://get.data.gov.lt by default
```

### Methods

#### `getAll(model, query?)` - Fetch one page

```typescript
const cities = await client.getAll("datasets/gov/example/City", query);
// Returns: Array of objects (unwrapped from _data)
```

> ⚠️ **Note**: Returns ONE page only. Use `stream()` for all records.

#### `getAllRaw(model, query?)` - Fetch with metadata

```typescript
const response = await client.getAllRaw("datasets/gov/example/City", query);
// Returns: { _type, _data: [...], _page: { next } }
```

#### `getOne(model, id)` - Fetch by UUID

```typescript
const city = await client.getOne("datasets/gov/example/City", "uuid-here");
```

#### `count(model, query?)` - Count records

```typescript
const total = await client.count("datasets/gov/example/City");
const filtered = await client.count(
  "datasets/gov/example/City",
  new QueryBuilder().filter((f) => f.field("population").gt(100000))
);
```

#### `stream(model, query?)` - Paginated iteration

```typescript
for await (const city of client.stream("datasets/gov/example/City")) {
  console.log(city.pavadinimas);
}
```

#### `listNamespace(namespace)` - List namespace contents

```typescript
const items = await client.listNamespace("datasets/gov/rc");
// Returns: [{ _id: 'path', _type: 'ns' | 'model', title? }]
```

#### `discoverModels(namespace)` - Find all models recursively

```typescript
// Discover all available models in a namespace
const models = await client.discoverModels("datasets/gov/rc/ar");
console.log(`Found ${models.length} models`);

for (const model of models) {
  console.log(`${model.path} - ${model.title}`);
}

// Then generate types for a specific model:
// npx lt-gen datasets/gov/rc/ar/savivaldybe -o ./types/savivaldybe.d.ts
```

Returns: `{ path, title?, namespace }[]`

---

## Type Safety & Autocomplete

The SDK provides full TypeScript support. The workflow is:

1. **Generate types** for your dataset:

   ```bash
   npx lt-gen datasets/gov/rc/ar/savivaldybe -o ./types/savivaldybe.d.ts
   ```

2. **Import and use** in your code:

   ```typescript
   import { SpintaClient } from "lt-open-data-sdk";
   import type { GovRcArSavivaldybe_Savivaldybe } from "./types/savivaldybe";

   const client = new SpintaClient();

   // Pass the type to the method to get full autocomplete!
   const data = await client.getAll<GovRcArSavivaldybe_Savivaldybe>(
     "datasets/gov/rc/ar/savivaldybe/Savivaldybe"
   );

   // ✅ TypeScript knows these fields exist:
   console.log(data[0].pavadinimas); // string
   console.log(data[0].sav_kodas); // number
   ```

---

## Pagination

The API uses cursor-based pagination with `_page.next` tokens.

### Automatic Pagination with `stream()`

Use `stream()` to iterate through all records automatically:

```typescript
const query = new QueryBuilder().limit(100); // 100 items per page

for await (const item of client.stream("datasets/gov/example/City", query)) {
  console.log(item.pavadinimas);
  // Automatically fetches next page when current page is exhausted
}
```

**How it works:**

1. Fetches first page with your query
2. Yields items one by one
3. When page exhausted, uses `_page.next` token to fetch next page
4. Continues until no more pages

### Manual Pagination with `getAllRaw()`

For more control, handle pagination yourself:

```typescript
let pageToken: string | undefined;

do {
  // Build query with page token
  let query = new QueryBuilder().limit(100);

  const response = await client.getAllRaw("datasets/gov/example/City", query);

  // Process this page
  for (const item of response._data) {
    console.log(item);
  }

  // Get next page token
  pageToken = response._page?.next;

  // Note: You need to add page(token) to next request manually
  // This is handled automatically by stream()
} while (pageToken);
```

> **Tip**: Use `stream()` for most cases. Use `getAllRaw()` when you need access to page metadata or custom page handling.

## CLI Type Generator

Generate TypeScript interfaces from live API metadata:

```bash
# Install globally or use npx
npx lt-gen datasets/gov/rc/ar/savivaldybe

# Save to file
npx lt-gen datasets/gov/rc/ar/savivaldybe -o ./types/savivaldybe.d.ts

# Custom API URL
npx lt-gen datasets/gov/rc/ar/savivaldybe --base-url https://get-test.data.gov.lt
```

### Generated Output

```typescript
export interface GovRcArSavivaldybe_Savivaldybe {
  _id: string;
  _type: string;
  _revision?: string;
  sav_kodas?: number;
  pavadinimas?: string;
  apskritis?: string | { _id: string }; // ref type
  sav_nuo?: string; // date
}

export interface ModelMap {
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe": GovRcArSavivaldybe_Savivaldybe;
}
```

> **Note**: Types are inferred from data samples since schema endpoints require authentication.

---

## Authentication _(Untested)_

For write operations or private data, provide OAuth credentials:

```typescript
const client = new SpintaClient({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  authUrl: "https://put.data.gov.lt", // optional, default
  scopes: ["spinta_getone", "spinta_getall"], // optional
});
```

The SDK handles:

- OAuth client credentials flow
- Automatic token caching
- Token refresh before expiry (5-minute buffer)

> ⚠️ **Note**: Authentication has been implemented but not tested against a live auth server.

---

## Error Handling

```typescript
import {
  SpintaError,
  NotFoundError,
  AuthenticationError,
  ValidationError,
} from "lt-open-data-sdk";

try {
  const data = await client.getOne("datasets/example", "invalid-id");
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log("Not found:", error.message);
  } else if (error instanceof AuthenticationError) {
    console.log("Auth failed:", error.status);
  } else if (error instanceof ValidationError) {
    console.log("Bad request:", error.body);
  }
}
```

---

## API Reference

### Exports

```typescript
// Client
export { SpintaClient } from "./client/SpintaClient";
export {
  SpintaError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "./client/errors";

// Query Builder
export { QueryBuilder } from "./builder/QueryBuilder";
export { FilterBuilder } from "./builder/FilterBuilder";

// Types
export type {
  ClientConfig,
  SpintaResponse,
  SpintaObject,
} from "./client/types";
```

---

## License

MIT
