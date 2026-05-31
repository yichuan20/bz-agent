# Coding Style & Conventions

## Overview

The BoltzBit app template uses [Biome](https://biomejs.dev/) for linting and formatting. This ensures consistent code style across the project with minimal configuration.

## Code Formatting

### Biome Configuration ([biome.json](../biome.json))

```json
{
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "asNeeded",
      "quoteStyle": "single"
    }
  }
}
```

### Formatting Rules

#### Indentation
- **2 spaces** for indentation (no tabs)
- Consistent across all file types

#### Line Width
- Maximum **100 characters** per line
- Improves readability and git diffs

#### Semicolons
- **Always required** at the end of statements
- Prevents ASI (Automatic Semicolon Insertion) issues

```typescript
// ✅ Good
const value = 'hello';
const fn = () => {
  return 42;
};

// ❌ Bad
const value = 'hello'
const fn = () => {
  return 42
}
```

#### Quotes
- **Single quotes** for strings
- Double quotes only for JSX attributes

```typescript
// ✅ Good
const message = 'Hello, world!';
<div className="container">

// ❌ Bad
const message = "Hello, world!";
```

#### Trailing Commas
- **Always include** trailing commas in multi-line structures
- Better git diffs and easier to add/remove lines

```typescript
// ✅ Good
const array = [
  'item1',
  'item2',
  'item3',
];

const object = {
  key1: 'value1',
  key2: 'value2',
};

// ❌ Bad
const array = [
  'item1',
  'item2',
  'item3'
];
```

#### Arrow Function Parentheses
- **Only when needed** (`asNeeded`)
- Single parameter: no parens
- Multiple or no parameters: use parens

```typescript
// ✅ Good
const single = x => x * 2;
const multiple = (x, y) => x + y;
const none = () => 42;

// ❌ Bad
const single = (x) => x * 2;
```

## TypeScript Standards

### Strict Mode

All TypeScript strict checks are enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "noUncheckedIndexedAccess": true,
    "useUnknownInCatchVariables": true
  }
}
```

### Type Annotations

#### Explicit Function Parameters
Always type function parameters:

```typescript
// ✅ Good
function greet(name: string): string {
  return `Hello, ${name}`;
}

const calculate = (x: number, y: number): number => x + y;

// ❌ Bad
function greet(name) {
  return `Hello, ${name}`;
}
```

#### Component Props
Use type aliases for props:

```typescript
// ✅ Good
type ButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

function Button({ label, onClick, disabled = false }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}

// ❌ Bad
function Button({ label, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}
```

#### Return Types
Explicit return types for complex functions:

```typescript
// ✅ Good
async function fetchUser(id: string): Promise<User | null> {
  const response = await api.getUser(id);
  return response.data;
}

// ⚠️ Acceptable for simple functions
const double = (x: number) => x * 2;
```

### No Explicit Any

The `any` type is forbidden:

```typescript
// ❌ Bad
function process(data: any) {
  return data.value;
}

// ✅ Good - use unknown
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return data.value;
  }
  return null;
}

// ✅ Better - use proper types
type Data = { value: string };
function process(data: Data) {
  return data.value;
}
```

### Unchecked Index Access

Arrays and objects require safe access:

```typescript
// ❌ Bad
const first = array[0]; // Type: T (could be undefined)

// ✅ Good
const first = array[0]; // Type: T | undefined
if (first !== undefined) {
  // use first safely
}

// ✅ Better - use optional chaining
const value = array[0]?.property;
```

### Catch Variables

Use `unknown` in catch blocks:

```typescript
// ✅ Good
try {
  await riskyOperation();
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Unknown error:', error);
  }
}

// ❌ Bad (auto-rejected by config)
try {
  await riskyOperation();
} catch (error: any) {
  console.error(error.message);
}
```

## React Patterns

### Component Definition

Use function declarations for components:

```typescript
// ✅ Good
export default function MyComponent() {
  return <div>Content</div>;
}

// ✅ Also good for named exports
export function MyComponent() {
  return <div>Content</div>;
}

// ❌ Avoid
const MyComponent = () => {
  return <div>Content</div>;
};
export default MyComponent;
```

### Hooks Usage

#### Dependency Arrays
Exhaustive dependencies are enforced:

```typescript
// ✅ Good
useEffect(() => {
  fetchData(userId);
}, [userId]); // All dependencies included

// ❌ Bad - will not compile
useEffect(() => {
  fetchData(userId);
}, []); // Missing dependency
```

#### Stable Callbacks

Use `useCallback` for event handlers passed to children:

```typescript
// ✅ Good
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

<ChildComponent onClick={handleClick} />
```

### JSX Conventions

#### Self-Closing Tags
Use self-closing tags when no children:

```typescript
// ✅ Good
<Component />
<input type="text" />

// ❌ Bad
<Component></Component>
<input type="text"></input>
```

#### Boolean Props
Omit `={true}` for boolean props:

```typescript
// ✅ Good
<Button disabled />
<Input required />

// ❌ Bad
<Button disabled={true} />
<Input required={true} />
```

#### Prop Spreading
Be explicit when possible:

```typescript
// ✅ Good - explicit props
<Component
  title={title}
  description={description}
  onClick={handleClick}
/>

// ⚠️ Use sparingly
<Component {...props} />
```

## Naming Conventions

### Files
- **Components**: PascalCase (`Chat.tsx`, `Sidebar.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAppChat.ts`)
- **Utils**: camelCase (`auth.ts`, `query-client.ts`)
- **Types**: PascalCase (`types.ts`, `UserTypes.ts`)

### Variables & Functions
- **Variables**: camelCase (`userName`, `isLoading`)
- **Functions**: camelCase (`handleClick`, `fetchData`)
- **Components**: PascalCase (`MyComponent`)
- **Constants**: UPPER_SNAKE_CASE for true constants

```typescript
// ✅ Good
const MAX_RETRY_COUNT = 3;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export default function UserProfile() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = () => {
    // ...
  };

  return <div>...</div>;
}
```

### Types & Interfaces
- **Types**: PascalCase (`UserData`, `ChatMessage`)
- **Props**: ComponentName + `Props` (`ChatProps`, `ButtonProps`)

```typescript
// ✅ Good
type UserData = {
  id: string;
  name: string;
};

type ChatProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
};
```

## Import Organization

### Import Order
Biome automatically organizes imports:

1. External packages
2. Internal packages (`@boltzbit/*`)
3. Path alias imports (`#/*`)
4. Relative imports (`./`, `../`)
5. Type-only imports at the end

```typescript
// ✅ Good (auto-organized by Biome)
import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useBzApiTools } from '@boltzbit/chat';
import { dynasClient } from '#/auth';
import Chat from '#/components/Chat';
import { useAppChat } from './useAppChat';
import type { ChatMessage } from '@boltzbit/chat';
```

### Type-Only Imports
Use `type` keyword for type imports:

```typescript
// ✅ Good
import type { FC, ReactNode } from 'react';
import type { ChatMessage, UseChatReturn } from '@boltzbit/chat';

// ❌ Bad
import { FC, ReactNode } from 'react';
```

## Code Quality Rules

### No Unused Imports
Unused imports are auto-removed (error level):

```typescript
// ❌ Bad - compile error
import { useState, useEffect } from 'react'; // useEffect unused

// ✅ Good
import { useState } from 'react';
```

### No Floating Promises
Promises must be handled (nursery rule):

```typescript
// ❌ Bad
async function doSomething() { }
doSomething(); // Floating promise

// ✅ Good
void doSomething(); // Explicitly ignored

// ✅ Better
await doSomething();

// ✅ Best
doSomething().catch(console.error);
```

### Exhaustive Switch Cases
All enum cases must be handled:

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error';

function getStatusColor(status: Status): string {
  switch (status) {
    case 'idle':
      return 'gray';
    case 'loading':
      return 'blue';
    case 'success':
      return 'green';
    case 'error':
      return 'red';
    // ✅ All cases covered
  }
}
```

### No Unused Template Literals
Use regular strings when no interpolation:

```typescript
// ❌ Bad
const message = `Hello`;

// ✅ Good
const message = 'Hello';

// ✅ Good - has interpolation
const message = `Hello, ${name}`;
```

## CSS & Styling

### Tailwind CSS
Classes are auto-sorted by Tailwind plugin:

```tsx
// ✅ Good (auto-formatted)
<div className="flex h-screen items-center justify-center bg-background px-4">
  <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
    Click me
  </button>
</div>
```

### Class Utilities
Use `cn()` for conditional classes:

```typescript
import { cn } from '@boltzbit/react-utils';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  'another-class',
)} />
```

## Accessibility

### Semantic Elements
Warnings for non-semantic HTML:

```tsx
// ✅ Good
<button type="button" onClick={handleClick}>
  Click me
</button>

<nav>
  <Link to="/">Home</Link>
</nav>

// ⚠️ Warning
<div onClick={handleClick}>Click me</div>
```

## Scripts & Commands

### Available Commands

```bash
# Development
pnpm dev              # Start dev server on port 3000

# Code Quality
pnpm check            # Run Biome linter
pnpm check:fix        # Auto-fix issues
pnpm typecheck        # Run TypeScript compiler

# Testing
pnpm test             # Run Vitest tests

# Build
pnpm build            # Production build
pnpm preview          # Preview production build
```

### Pre-commit Hooks
Lefthook ensures code quality:

```yaml
pre-commit:
  commands:
    lint:
      run: pnpm check
    typecheck:
      run: pnpm typecheck
```

## Best Practices Summary

### Do's ✅
- Always use TypeScript types
- Handle all promises (`void` or `await`)
- Include trailing commas
- Use single quotes
- Use 2-space indentation
- Keep lines under 100 characters
- Auto-organize imports
- Use semantic HTML
- Type all function parameters
- Use strict TypeScript settings

### Don'ts ❌
- Never use `any` type
- Don't leave unused imports
- Don't ignore floating promises
- Don't use double quotes (except JSX)
- Don't skip semicolons
- Don't use tabs for indentation
- Don't exceed 100 character lines
- Don't use non-semantic divs for buttons
- Don't ignore TypeScript errors

## Editor Setup

### VS Code Settings ([.vscode/settings.json](../.vscode/settings.json))

Recommended settings for VS Code:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": "explicit"
  }
}
```

### Extensions
- **Biome**: Official formatter/linter
- **TypeScript**: Built-in language support
- **Tailwind CSS IntelliSense**: Class autocomplete

## Migration Notes

If adapting existing code:
1. Run `pnpm check:fix` to auto-fix formatting
2. Address any remaining Biome errors
3. Fix TypeScript strict mode errors
4. Update imports to use path aliases (`#/`)
5. Convert `any` types to proper types
6. Add missing type annotations
