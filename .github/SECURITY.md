# Security Policy

## Supported versions
| Version | Supported |
|---|---|
| latest (`main`, the deployed build) | ✅ |

## Reporting a vulnerability
Please **do not** open a public issue for security vulnerabilities. Report them privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

You will get an acknowledgment within 48 hours and a resolution timeline after triage. Please allow a reasonable window to patch before public disclosure.

## What is already tested
- The fetch proxy refuses calls without a valid Firebase App Check token (`e2e/smoke.spec.ts`) and its URL guard blocks private, link-local and metadata addresses, re-checking every redirect hop (`test/ssrf.test.ts` covers the guard as a function; the proxy follows redirects manually through it in `src/lib/net/fetchSource.ts`).
- Gemini calls go through Firebase AI Logic with App Check enforced; no model API key ships in the client.
- CI is configured to run gitleaks over the full history and `npm audit` (high and critical fail the build), and CodeQL once the repository is public. Until GitHub Actions can run, the same stages are run locally with `scripts/ci-local.sh`.
