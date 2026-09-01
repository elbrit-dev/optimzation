# Sample payloads

**No code imports these files.** They are here purely so you have something to
paste into the Plasmic props, or to check the shape a GraphQL query needs to
return.

| File | Plasmic prop |
| --- | --- |
| `profile.json` | Profile |
| `leaveBalance.json` | Leave balance |
| `payslips.json` | Payslips |
| `documents.json` | Documents |

The component renders only from its props. An unbound prop shows an empty
section - it never falls back to anything here, so a half-loaded query cannot
mix real values with sample ones.

Safe to delete once the props are wired to live data.
