# Live+ server-authoritative stable checkpoint

Validated on iPhone with the panel in background and the game remaining foreground.

Working flow:

TikTok → Render → Cloudflare Durable Object → Game

Validated stable commit before diagnostics-only cleanup: `de4ad0c911e0e72683bc3e112ab01a787a204fb4`.

Rollback branch: `stable/server-authoritative-working-2026-09-05`.

Do not move TikTok rule execution back into the browser panel. The panel is configuration/control only; the server owns the live session, automation configuration, rule evaluation path and delivery to the game.
