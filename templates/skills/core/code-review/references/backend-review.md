# Backend Review Checklist

Load this reference only when the change under review touches backend/service code.

- Check for missing input validation and unhandled error paths.
- Check for N+1 queries or unbounded loops over external calls/DB rows.
- Confirm migrations (if any) are backward compatible with the currently deployed code.
- Confirm secrets/config are read from environment/config service, not hardcoded.
- A backward-incompatible migration deployed before the code that needs it is a common source of production incidents.

Cover validation, error handling, performance, and migration safety in review comments, or explicitly note that none apply.
