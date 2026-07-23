# Coding Standards

## TypeScript

- Use
- No — use + type narrowing
- Prefer over for object shapes
- Use for literal types

## Naming

- files:
- functions:
- classes/interfaces:
- constants:

## Modules

- Deep modules: small interface, large implementation
- One export per module where possible
- Use for re-exports only

## Error Handling

- Use typed errors, not string throw
- Catch at boundaries, not internally

## Git

- Pre-commit: Husky + Prettier + typecheck
- Commit messages: conventional ()
