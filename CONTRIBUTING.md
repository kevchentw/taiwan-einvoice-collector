# Contributing

Thanks for considering a contribution to Taiwan E-Invoice Collector.

## Development setup

This is a [Google Apps Script](https://developers.google.com/apps-script) project managed locally with [`clasp`](https://github.com/google/clasp).

```bash
npm install
npm run login          # one-time Google OAuth login for clasp
cp .clasp.json.example .clasp.json
# edit .clasp.json with your own scriptId, or run `npm run create`
npm run push            # push local src/ to the Apps Script project
npm run open            # open the project in the Apps Script editor
```

Source files live under [`src/`](src/):

- `Fetch.js` — login + sync logic against the official Taiwan e-invoice API
- `WebApp.js` + `InvoiceUi.html` — the in-sheet web app UI

Categorization and downstream automation are intentionally not part of this script — see the "分類、消費分析與自動化" section in [README.md](README.md).

## Making changes

1. Fork the repo and create a branch from `main`.
2. Keep changes focused; avoid unrelated formatting churn.
3. Test manually against a real (or sandbox) Google Sheet — there is no automated GAS test runner, so describe your manual test steps in the PR.
4. Run `npm run lint` if you touch `src/*.js`.
5. Open a PR describing what changed and why.

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce, expected vs actual behavior, and relevant `Logger.log` / Stackdriver output (redact your mobile number, password, and API keys).

## Security issues

Do not open a public issue for security vulnerabilities — see [SECURITY.md](SECURITY.md).
