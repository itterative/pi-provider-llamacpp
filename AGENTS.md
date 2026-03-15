# Development Rules

## Project Structure

- `index.ts` - Entry point
- `common/` - Shared types and utilities
- `providers/` - Llama.cpp provider registration and API calls
- `commands/` - Command handlers
- `components/` - TUI components

## General

- When axon is available, prefer using its tools over bash commands (fallback)
- When using grep, find, or other similar tools, you should ignore node_modules unless necessary

## Code Quality

- No `any` types unless absolutely necessary
- Check node_modules for external API type definitions instead of guessing
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions, no dynamic imports for types. Always use standard top-level imports.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Always ask before removing functionality or code that appears to be intentional

## Commands

- After code changes (not documentation changes): `npx prettier -c [FILES ...]` for warnings regarding code-style (you may pass -w flag instead if there are too many warnings to autofix)
- Note: `npm run check` does not run tests.
- NEVER run: `npm run dev`, `npm run build`
- Only run specific tests if user instructs: `npx vitest --run test/specific.test.ts`
- You may check compilation using `npx tsc --noEmit` on the entire project
- When writing tests, run them, identify issues in either the test or implementation, and iterate until fixed.
- NEVER commit unless user asks

## Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
