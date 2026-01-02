# lt-open-data-sdk

A TypeScript SDK for accessing **Lithuania's Open Data Portal** ([data.gov.lt](https://data.gov.lt)).

## What is this?

Lithuania publishes thousands of government datasets through its Open Data Portal, powered by the [Spinta](https://docs.data.gov.lt/projects/atviriduomenys/latest/api/) API engine. This SDK makes it easy to:

- **Query data** with a fluent, type-safe API instead of crafting raw URL parameters
- **Generate TypeScript types** from live datasets for full autocomplete support
- **Paginate automatically** through large datasets with async iterators
- **Track changes** for incremental data synchronization

### Quick Links

- [📡 API Reference](#api) - Client methods and query builder
- [⌨️ CLI Reference](#cli) - Type generation commands

---

## Installation

```bash
npm install lt-open-data-sdk
```

Requires Node.js ≥18.

## Quick Example

```typescript
import { SpintaClient, QueryBuilder } from "lt-open-data-sdk";

const client = new SpintaClient();

// Find municipalities with code greater than 30
const query = new QueryBuilder()
  .filter((f) => f.field("sav_kodas").gt(30))
  .sort("pavadinimas")
  .limit(10);

const municipalities = await client.getAll(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe",
  query
);

console.log(municipalities);
```

---

## API

The SDK provides a `SpintaClient` for making requests and a `QueryBuilder` for constructing queries.

### Client Setup

```typescript
import { SpintaClient } from "lt-open-data-sdk";

const client = new SpintaClient();
// Connects to https://get.data.gov.lt by default

// Or specify a custom base URL:
const client = new SpintaClient({
  baseUrl: "https://get-test.data.gov.lt",
});
```

### Data Retrieval

#### `getAll(model, query?)` — Fetch records

Returns an array of records from a dataset. Use with `QueryBuilder` to filter, sort, and limit.

````typescript
const localities = await client.getAll(
  "datasets/gov/rc/ar/gyvenamojivietove/GyvenamojiVietove"
);
// Returns: [{ _id, _type, pavadinimas, tipas, ... }, ...]

> ⚠️ Returns one page only (default 100 items). Use `stream()` for all records.

#### `getOne(model, id)` — Fetch by ID

Returns a single record by its UUID.

```typescript
const locality = await client.getOne(
  "datasets/gov/rc/ar/gyvenamojivietove/GyvenamojiVietove",
  "b19e801d-95d9-401f-8b00-b70b5f971f0e"
);
````

#### `getAllRaw(model, query?)` — Fetch with metadata

Returns the full API response including pagination info.

```typescript
const response = await client.getAllRaw("datasets/gov/rc/ar/miestas/Miestas");
// Returns: { _type, _data: [...], _page: { next: "token" } }
```

#### `count(model, query?)` — Count records

Returns the total number of records matching the query.

```typescript
const total = await client.count("datasets/gov/rc/ar/savivaldybe/Savivaldybe");

const filtered = await client.count(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe",
  new QueryBuilder().filter((f) => f.field("pavadinimas").contains("Vilni"))
);
```

#### `stream(model, query?)` — Iterate all records

Async iterator that automatically handles pagination.

```typescript
for await (const municipality of client.stream(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe"
)) {
  console.log(municipality.pavadinimas);
  // Automatically fetches next pages
}
```

> ⚠️ **Do not use `.select()` with `stream()`**. The API does not return pagination tokens when field projection is used, causing the stream to stop after the first page (100 items).

### Discovery

#### `listNamespace(namespace)` — Browse datasets

Lists namespaces and models within a path.

```typescript
const items = await client.listNamespace("datasets/gov/rc");
// Returns: [{ _id: "datasets/gov/rc/ar", _type: "ns" }, ...]
```

#### `discoverModels(namespace)` — Find all models

Recursively discovers all data models in a namespace.

```typescript
const models = await client.discoverModels("datasets/gov/rc/ar");
console.log(`Found ${models.length} models`);
// Returns: [{ path, title, namespace }, ...]
```

### Changes API

Track data modifications for incremental sync.

#### `getLatestChange(model)` — Get most recent change

```typescript
const latest = await client.getLatestChange("datasets/gov/uzt/ldv/Vieta");
if (latest) {
  console.log(`Last change: ${latest._op} at ${latest._created}`);
  console.log(`Change ID: ${latest._cid}`);
}
// Returns: ChangeEntry | null
```

#### `getLastUpdatedAt(model)` — Get last update timestamp

Convenience method for cache invalidation and freshness indicators.

```typescript
const lastUpdate = await client.getLastUpdatedAt("datasets/gov/uzt/ldv/Vieta");
if (lastUpdate) {
  console.log("Last updated:", lastUpdate.toISOString());
  // Check if data is stale (e.g., older than 1 hour)
  const isStale = Date.now() - lastUpdate.getTime() > 3600000;
}
// Returns: Date | null
```

#### `getChanges(model, sinceId?, limit?)` — Fetch changes

Returns changes since a given change ID.

```typescript
const changes = await client.getChanges(
  "datasets/gov/uzt/ldv/Vieta",
  0, // Start from beginning
  100 // Max 100 changes
);
// Returns: [{ _cid, _created, _op, _id, _data }, ...]
```

#### `streamChanges(model, sinceId?, pageSize?)` — Stream all changes

Async iterator for processing all changes with automatic pagination.

```typescript
for await (const change of client.streamChanges(
  "datasets/gov/uzt/ldv/Vieta",
  lastKnownCid
)) {
  console.log(`${change._op}: ${change._id}`);
}
```

#### `getSummary(model, field)` — Get histogram data

Returns binned distribution for a numeric field. Useful for data profiling and visualization.

```typescript
const histogram = await client.getSummary(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe",
  "sav_kodas"
);
for (const bin of histogram) {
  console.log(`Value ~${bin.bin}: ${bin.count} records`);
}
// Returns: [{ bin, count, _type, _id? }, ...]
```

---

### QueryBuilder

Build queries with a fluent API.

```typescript
import { QueryBuilder } from "lt-open-data-sdk";

const query = new QueryBuilder()
  .select("_id", "pavadinimas", "gyventoju_skaicius")
  .filter((f) => f.field("gyventoju_skaicius").gt(10000))
  .sort("pavadinimas")
  .limit(50);

const data = await client.getAll("datasets/gov/example/Model", query);
```

#### Filter Operators

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
| `.endswith(str)`   | `field.endswith("str")`   | Ends with ⚠️          |
| `.in([...])`       | `field.in(a,b,c)`         | Value in list ⚠️      |
| `.notin([...])`    | `field.notin(a,b,c)`      | Value not in list ⚠️  |

> ⚠️ `endswith`, `in`, `notin` are in the Spinta spec but not yet supported by the live API.

#### Combining Filters

```typescript
// AND - both conditions must match
.filter(f => f.field('a').gt(10).and(f.field('b').lt(100)))
// Output: a>10&b<100

// OR - either condition matches
.filter(f => f.field('status').eq('active').or(f.field('status').eq('pending')))
// Output: status="active"|status="pending"

// Complex - parentheses added automatically
.filter(f => f.field('a').gt(10).and(
  f.field('b').eq(1).or(f.field('b').eq(2))
))
// Output: a>10&(b=1|b=2)
```

#### Sorting

```typescript
new QueryBuilder()
  .sort("name") // Ascending
  .sortDesc("created_at"); // Descending
// Output: ?sort(name,-created_at)
```

---

## CLI

Generate TypeScript interfaces from live API data.

### Basic Usage

```bash
# Generate types for a dataset (prints to stdout)
npx lt-gen datasets/gov/rc/ar/savivaldybe

# Save to a file
npx lt-gen datasets/gov/rc/ar/savivaldybe -o ./types/savivaldybe.d.ts

# Use a different API endpoint
npx lt-gen datasets/gov/rc/ar/savivaldybe --base-url https://get-test.data.gov.lt
```

### Options

| Option                | Description          |
| --------------------- | -------------------- |
| `-o, --output <file>` | Write output to file |
| `--base-url <url>`    | Custom API base URL  |
| `-h, --help`          | Show help            |

### Generated Output

```typescript
// Generated from datasets/gov/rc/ar/savivaldybe/Savivaldybe

export interface GovRcArSavivaldybe_Savivaldybe {
  _id: string;
  _type: string;
  _revision?: string;
  sav_kodas?: number;
  pavadinimas?: string;
  apskritis?: string | { _id: string };
  sav_nuo?: string;
}

export interface ModelMap {
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe": GovRcArSavivaldybe_Savivaldybe;
}
```

### Using Generated Types

```typescript
import { SpintaClient } from "lt-open-data-sdk";
import type { GovRcArSavivaldybe_Savivaldybe } from "./types/savivaldybe";

const client = new SpintaClient();

// Full autocomplete on fields!
const data = await client.getAll<GovRcArSavivaldybe_Savivaldybe>(
  "datasets/gov/rc/ar/savivaldybe/Savivaldybe"
);

console.log(data[0].pavadinimas); // TypeScript knows this is string
console.log(data[0].sav_kodas); // TypeScript knows this is number
```

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
    console.log("Record not found");
  } else if (error instanceof ValidationError) {
    console.log("Invalid query:", error.message);
  }
}
```

---

## Authentication

For write operations or private datasets, provide OAuth credentials:

```typescript
const client = new SpintaClient({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});
```

The SDK handles token caching and automatic refresh.

> ⚠️ Authentication is implemented but untested against the live auth server.

---

## Known Limitations

- **Boolean filtering** may not work on some datasets due to inconsistent data formats in the source
- **`in()`, `notin()`, `endswith()`** operators are implemented but not yet supported by the live API
- **Type inference** is based on data sampling, not schema (schema endpoints require auth)

---

## MCP Server (AI Agent Integration)

This SDK exposes a **Model Context Protocol (MCP)** server, allowing AI agents (like Claude Desktop, Cursor, or other MCP clients) to directly access Lithuanian Open Data.

### Setup

Add this to your MCP configuration file (`claude_desktop_config.json` or similar):

```json
{
  "mcpServers": {
    "lt-open-data": {
      "command": "npx",
      "args": ["-y", "lt-open-data-sdk", "--mcp"]
    }
  }
}
```

### Available Tools

| Tool               | Description                                              |
| ------------------ | -------------------------------------------------------- |
| **Metadata**       |                                                          |
| `list_namespace`   | Browse dataset hierarchy (Start here!)                   |
| `search_datasets`  | Find datasets by keyword (returns titles & descriptions) |
| `describe_model`   | Get schema/fields for a dataset (auto-infers if needed)  |
| `get_last_updated` | Check when a dataset was last modified                   |
| **Data Access**    |                                                          |
| `query_data`       | Query records with filtering, sorting, pagination        |
| `count_records`    | Count records matching a filter                          |
| `get_record`       | Fetch a single record by ID                              |
| `get_sample_data`  | Get a small sample to inspect data structure             |
| **Analysis**       |                                                          |
| `get_summary`      | Get distribution histograms for numeric fields           |
| `generate_types`   | Generate TypeScript interfaces for a dataset             |

### Example Agent Workflow

1. **User:** "Find datasets about population in Vilnius"
2. **Agent:**
   - `search_datasets("population Vilnius")` → Finds `dataset/path`
   - `describe_model("dataset/path")` → Sees fields `year`, `count`, `district`
   - `query_data("dataset/path", filter="year=2024")` → Returns data

---

## License

MIT
