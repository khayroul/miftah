# TypeScript Rules

## Immutability

Always create new objects, never mutate:

```typescript
// WRONG
user.name = newName
items.push(newItem)

// CORRECT
const updated = { ...user, name: newName }
const newItems = [...items, newItem]
```

## Error Handling

```typescript
try {
  const result = await operation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)
  return { success: false, error: 'User-friendly message' }
}
```

## Graceful Degradation (Miftah-specific)

- Missing manifest = render image without hitboxes (never crash)
- Missing word image = show text fallback (never crash)
- Missing audio = skip playback (never crash)

## File Organization

- 200-400 lines typical, 800 max
- Functions under 50 lines
- No nesting deeper than 4 levels — use early returns
- Components: PascalCase. Utilities: camelCase. Routes: kebab-case.

## Do Not

- Leave `console.log` in production code
- Use `any` when a specific type is possible
- Use `as` type assertions unless absolutely necessary
- Implement FSRS math from scratch — use ts-fsrs library
