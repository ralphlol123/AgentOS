# NestJS Feature Structure

Load this reference only when the assigned backend repo is a NestJS app.

## Procedure

1. Follow the existing module boundary conventions (module/controller/service/DTO) instead of inventing a new structure.
2. Validate input DTOs explicitly (e.g. `class-validator` + `ValidationPipe`); do not trust unvalidated request bodies.
3. Keep controllers thin; put business logic in services.
4. Wire the new provider into its module and confirm Nest resolves the dependency graph at boot.

## Notes

- A missing provider/module import can surface as a boot-time DI error even when isolated unit tests pass — always boot-check after wiring changes.
