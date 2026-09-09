# Contributing to iLoveMd

Thank you for helping improve iLoveMd. Contributions are welcome from experienced developers and first-time contributors, including code, documentation, design, accessibility, testing, and translations.

## Before you start

Search the [existing issues](https://github.com/razibit/ilovemd/issues) before beginning substantial work. Open an issue for a bug or proposal when discussion will help clarify scope. For small documentation or typo fixes, a pull request is usually enough.

Please do not include private documents, credentials, or personal data in issues, tests, screenshots, or pull requests. Report suspected security vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Set up locally

Use Node.js 22 and npm:

```powershell
npm ci
npx playwright install chromium
npm run build
```

Run `npm run dev` for the Vite workspace and export service, or `npm start` after a production build. See the [README quick start](README.md#quick-start) and [deployment guide](docs/deployment.md) for configuration and service boundaries.

## Make and validate changes

Keep changes focused and preserve authored Markdown, local-storage compatibility, and export behavior unless the issue explicitly requires otherwise. Add or update tests for behavior changes. For rendering, accessibility, or export changes, inspect the browser result and generated artifacts as well as the source.

Run the checks relevant to your change:

```powershell
npm run typecheck
npm run build
npm test
npm run test:e2e
```

The PDF integration suite also needs `pdftotext`, `pdfinfo`, and `pdffonts` on `PATH`. See [validation.md](docs/validation.md) for the recorded checks and their limits.

## Open a pull request

1. Explain the problem and the approach taken.
2. Include tests or clear manual validation steps.
3. Call out compatibility, accessibility, privacy, or deployment implications.
4. Keep unrelated formatting and generated changes out of the pull request.

GitHub will run the repository's configured checks. Maintainers may ask for revisions to improve clarity, test coverage, or user impact.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
