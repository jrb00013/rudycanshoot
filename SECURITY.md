# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✓         |

## Reporting a Vulnerability

Please report security issues to joseph.black@lighthouseavionics.com rather than opening a public issue.

## Notes

- rudycanshoot executes shell commands provided by the user. Never pass untrusted user input directly to `capture_command`.
- Screenshots may contain sensitive information. Use `redactRegions` before sharing.
- The MCP server runs with stdio transport only — it is not exposed over the network.
- Imgur uploads use Client-ID only. Never store API keys in screenshots.
