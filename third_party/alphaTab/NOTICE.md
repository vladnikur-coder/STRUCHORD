# Third-party runtime notice

- **alphaTab 1.8.4**, Copyright © 2025 Daniel Kuschny and Contributors.
- Distributed under the **Mozilla Public License 2.0 (MPL-2.0)**. The complete license text is in `LICENSE`.
- The upstream UMD distribution is embedded as an inert, lazily evaluated script in `STRUCHORD.html`; it is used offline to import Guitar Pro 3–5 files. The literal `</html>` in one embedded template is JavaScript-escaped as `<\/html>` so it cannot be mistaken for the host document end tag; JavaScript evaluates it back to the upstream string.
- The upstream distribution header, including integrated-library notices, is preserved in `LICENSE.header`.
- Upstream project: <https://github.com/CoderLine/alphaTab>.
