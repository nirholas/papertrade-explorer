# Security

Report vulnerabilities in this project privately through GitHub's "Report a vulnerability" on https://github.com/nirholas/papertrade-explorer/security. Do not open a public issue.

Vulnerabilities in the Papertrade protocol itself belong with the Papertrade team (https://papertrade.xyz), not here.

This site is read-only. It never asks for a private key, never requests a signature, and never sends a transaction. The same-origin proxies forward only a fixed allowlist of read routes and read-only JSON-RPC methods. Every string that comes from the API or the chain is escaped before it is rendered.
