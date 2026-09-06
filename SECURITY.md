# Security policy

## Supported versions

BorderCut is pre-1.0 software. Security fixes are applied to the latest minor release and the `main` branch.

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
| 0.1.x and older | No |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub's private vulnerability reporting form](https://github.com/kong75/bordercut/security/advisories/new). Include:

- the affected version or commit;
- the conditions needed to reproduce the issue;
- the expected impact;
- a minimal reproduction or proof of concept when safe; and
- any suggested mitigation.

Maintainers will acknowledge a report within five business days, investigate it confidentially, and coordinate disclosure and credit with the reporter. Never include real secrets, private images, or personal data in a report.

## Security scope

The core package performs local computation over caller-provided RGBA buffers and has no runtime dependencies or network behavior. Reports about memory exhaustion, malformed-input handling, package integrity, build or release compromise, and reference-example file handling are in scope. Algorithmic misclassification without a security consequence should be filed as a normal bug in the issue tracker.
