# Data Services & Dynas Integration

## Overview

The BoltzBit app template uses two primary data service clients:
- **BZ API Client**: General-purpose API for BoltzHub services
- **Dynas Client**: Database operations and SQL queries

Both clients are authenticated and configured in [src/auth.ts](../src/auth.ts).

## Client Configuration

### API Clients ([src/auth.ts](../src/auth.ts))

```typescript
import { createBzApiClient } from '@boltzbit/bz-api-client';
import { createDynasClient } from '@boltzbit/dynas-client';

const apiClient = createBzApiClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

const dynasClient = createDynasClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-dynas/api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

export { apiClient, dynasClient };
```

## React Query Setup

### Query Client ([src/query-client.ts](../src/query-client.ts))

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
```

### Provider Setup ([src/routes/__root.tsx](../src/routes/__root.tsx))

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '#/query-client';

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
```

**Benefits:**
- Global query client for all data fetching
- Automatic caching and revalidation
- Optimistic updates support
- Built-in loading and error states

## Dynas Database Tools

### Database Operations Hook ([src/hooks/useAppChat.ts](../src/hooks/useAppChat.ts))

```typescript
import { useDynasDbTools } from '@boltzbit/tools__dynas-db';
import { dynasClient } from '#/auth';

export function useAppChat() {
  const dynasDbTools = useDynasDbTools({
    client: dynasClient,
    appId: import.meta.env.VITE_DYNAS_APP_ID,
  });

  return useChat({
    chatKey: 'app-chat',
    model: 'anthropic-claude-4.5-sonnet',
    tools: [...apiTools, ...dynasDbTools],
  });
}
```

**Features:**
- AI-powered database operations
- SQL query execution through chat
- Table management
- CRUD operations

## Pebble Data Source

### Custom Data Source ([src/hooks/usePebbleChat.ts](../src/hooks/usePebbleChat.ts))

For visualization and dashboard features, a custom data source is defined:

```typescript
import { createDataSource } from '@boltzbit/pebble';
import { z } from 'zod';

export const pebbleDataSource = createDataSource({
  description: 'Query data from Dynas tables using SQL',
  querySchema: z.string(),
  queryResultHint: 'Returns an array of row objects with dynamic keys based on table columns.',
  queryFn: async (query: string) => {
    const { data, error } = await dynasClient.POST('/v1/apps/{appId}/tables/query', {
      params: { path: { appId: import.meta.env.VITE_DYNAS_APP_ID } },
      body: { query, readonly: true },
    });
    if (error) throw new Error(`Query failed: ${JSON.stringify(error)}`);
    return data.data;
  },
});
```

**Key Features:**
- Type-safe schema validation with Zod
- Read-only queries for safety
- Error handling with detailed messages
- Returns structured data for visualizations

### Using the Data Source

```typescript
import { PebbleProvider } from '@boltzbit/pebble';
import { pebbleDataSource } from '#/hooks/usePebbleChat';

function PebblePage() {
  return (
    <PebbleProvider dataSource={pebbleDataSource}>
      <PebblePageInner />
    </PebbleProvider>
  );
}
```

## AI Chat with Tools

### App Chat Hook

The `useAppChat` hook combines multiple tool sets:

```typescript
export function useAppChat() {
  const apiTools = useBzApiTools();
  const dynasDbTools = useDynasDbTools({
    client: dynasClient,
    appId: import.meta.env.VITE_DYNAS_APP_ID,
  });

  return useChat({
    chatKey: 'app-chat',
    model: 'anthropic-claude-4.5-sonnet',
    tools: [...apiTools, ...dynasDbTools],
  });
}
```

**Available Tools:**
- **API Tools**: BoltzHub API operations
- **Dynas DB Tools**: Database queries and management

### Pebble Chat Hook

For dashboard building, additional Pebble-specific tools are included:

```typescript
export function usePebbleChat({ onConfirm }: UsePebbleChatOptions) {
  const apiTools = useBzApiTools();
  const pebbleTools = usePebbleTools({ bzApiClient: apiClient, onConfirm });
  const dynasDbTools = useDynasDbTools({
    client: dynasClient,
    appId: import.meta.env.VITE_DYNAS_APP_ID,
  });

  return useChat({
    chatKey: 'pebble-chat',
    model: 'anthropic-claude-4.5-sonnet',
    tools: [...apiTools, ...pebbleTools, ...dynasDbTools],
  });
}
```

**Pebble Tools Include:**
- Component generation
- Layout management
- Data query setup
- Visualization creation

## Dynas Client API

### Making Queries

The Dynas client uses OpenAPI-style method chaining:

```typescript
// POST request
const { data, error } = await dynasClient.POST('/v1/apps/{appId}/tables/query', {
  params: {
    path: { appId: 'your-app-id' }
  },
  body: {
    query: 'SELECT * FROM users',
    readonly: true
  },
});

// GET request
const { data, error } = await dynasClient.GET('/v1/apps/{appId}/tables', {
  params: {
    path: { appId: 'your-app-id' }
  },
});
```

### Error Handling

Always check for errors and handle them appropriately:

```typescript
const { data, error } = await dynasClient.POST('/endpoint', {
  body: { /* ... */ },
});

if (error) {
  throw new Error(`Query failed: ${JSON.stringify(error)}`);
}

// Use data safely
return data.data;
```

## BZ API Client

### Usage Pattern

```typescript
import { apiClient } from '#/auth';

// Example API call
const result = await apiClient.someMethod({
  // parameters
});
```

The API client is automatically authenticated via the `getAuthToken` function.

## Environment Variables

Required for data services:

```env
VITE_API_BASE_URL=https://api.example.com
VITE_DYNAS_APP_ID=your_dynas_app_id
```

## Best Practices

### 1. Error Handling

Always handle errors from API calls:

```typescript
try {
  const { data, error } = await dynasClient.POST('/endpoint', { body });
  if (error) {
    console.error('API error:', error);
    // Show user-friendly message
    return;
  }
  // Use data
} catch (err) {
  console.error('Unexpected error:', err);
}
```

### 2. Type Safety

Use TypeScript types from API clients:

```typescript
import type { DynasClient } from '@boltzbit/dynas-client';

const client: DynasClient = dynasClient;
```

### 3. Read-Only Queries

For data visualization, always use read-only queries:

```typescript
body: { query, readonly: true }
```

### 4. Query Keys

Use consistent query keys for caching:

```typescript
chatKey: 'app-chat'  // Consistent key for the same chat context
```

### 5. Tool Composition

Combine tools thoughtfully based on the use case:

```typescript
// For general app functionality
tools: [...apiTools, ...dynasDbTools]

// For dashboard building
tools: [...apiTools, ...pebbleTools, ...dynasDbTools]
```

## Data Flow Architecture

```
User Input → Chat Interface → AI Model → Tools
                                          ↓
                            ┌─────────────┴─────────────┐
                            ↓                           ↓
                      Dynas Client              BZ API Client
                            ↓                           ↓
                      Database Ops            BoltzHub Services
                            ↓                           ↓
                            └─────────────┬─────────────┘
                                          ↓
                                    Response to User
```

## Advanced Patterns

### Custom Data Queries

Create type-safe data sources with Zod schemas:

```typescript
const customDataSource = createDataSource({
  description: 'Your custom data source',
  querySchema: z.object({
    filter: z.string(),
    limit: z.number().optional(),
  }),
  queryResultHint: 'Describe the expected result format',
  queryFn: async (query) => {
    // Fetch and return data
  },
});
```

### Streaming Responses

The chat system supports streaming for real-time updates:

```typescript
const { messages, status } = chat;

// status: 'idle' | 'streaming' | 'error'
```

### Tool Callbacks

Handle tool confirmations in Pebble chat:

```typescript
const handleConfirm = useCallback(
  (pebble: { spec: PebbleSpec; queries?: Record<string, DataQuery> }) => {
    const id = crypto.randomUUID();
    setPebbles(prev => [...prev, { id, spec: pebble.spec, queries: pebble.queries }]);
  },
  [],
);

const chat = usePebbleChat({ onConfirm: handleConfirm });
```

## Performance Optimization

1. **Memoize tool arrays** to prevent recreation on every render
2. **Use stable chat keys** for consistent caching
3. **Implement query debouncing** for user input
4. **Cache API responses** with React Query
5. **Use read-only queries** when possible for better performance
