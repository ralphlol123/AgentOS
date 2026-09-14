# Nuxt E2E Specifics

Load this reference only when the assigned frontend repo is a Nuxt app.

## Procedure

1. Start the Nuxt dev/preview server (`nuxt dev` or `nuxt preview` per the repo's scripts).
2. Exercise the changed route/component through real navigation and interaction, not just unit tests.
3. Check network requests and console for errors during the flow, including hydration warnings.
4. Run the project e2e test command if one is configured (e.g. `@nuxt/test-utils`/Playwright).

## Notes

- Prefer testing the golden path plus at least one edge case (empty state, error state) over the golden path alone.
- Server/client hydration mismatches surface in the console but not always in the build — always do a live browser pass.
