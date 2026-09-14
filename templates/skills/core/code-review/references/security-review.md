# Security Review Checklist

Load this reference only when the change under review is security-sensitive (auth, secrets, input handling, access control).

- Treat auth/permission code as security-sensitive: prefer explicit allow-lists over implicit deny-by-omission.
- Confirm authorization checks fail closed when a check cannot be evaluated.
- Confirm no secrets, tokens, or private keys are introduced in the diff; they must come from environment/config services.
- Check that user-controlled input is validated and encoded/escaped before use in queries, commands, or markup.
- Flag any already-committed secret to the owner rather than silently rewriting history.
