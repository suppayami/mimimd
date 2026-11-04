# Overflow and fallback review

## Long code

```ts
const longMessage =
	'A long line that remains inside the code scroller rather than widening the reading page. Spaces and punctuation remain readable while horizontal scrolling exposes the rest of this deliberately extended example.'
```

## Wide table

| Description             | A long heading              | Another long heading              | More information        | Final detail                   |
| ----------------------- | --------------------------- | --------------------------------- | ----------------------- | ------------------------------ |
| A deliberately wide row | Never forces page scrolling | Keyboard-accessible page controls | Columns remain readable | Scroll this table horizontally |

## Math fallback

Before $\notacommand{x}$ after.

```mermaid
invalid diagram
```

Surrounding content remains readable.
