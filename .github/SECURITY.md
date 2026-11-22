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
- The fetch proxy refuses calls without a valid Firebase App Check token (`e2e/smoke.spec.ts`) and blocks private, link-local and redirect-to-private targets (`test/ssrf.test.ts`).
- Gemini calls go through Firebase AI Logic with App Check enforced; no model API key ships in the client.
- CI runs gitleaks over the full history, `npm audit` (high and critical fail the build), and CodeQL once the repository is public.
