# NestJS Auth Guards

Load this reference only when the assigned backend repo is a NestJS app.

## Procedure

1. Implement authorization checks in guards/decorators, not scattered inline checks in controllers.
2. Fail closed: default to denying access when a check cannot be evaluated.
3. Apply guards at the appropriate scope (route/controller/global) and combine with metadata decorators for roles/permissions.
4. Add a test for both an authorized and an unauthorized request, asserting the correct status code.

## Notes

- Treat auth/permission code as security-sensitive: prefer explicit allow-lists over implicit deny-by-omission.
