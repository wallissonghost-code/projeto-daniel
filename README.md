# Projeto Daniel · TikTok Live Connector

Base isolada do conector de Live do Caos Live, reconstruída a partir do repositório `Game` sem alterar o projeto original.

## Escopo

Este repositório contém somente a infraestrutura de conexão TikTok Live: WebSocket/Cloud, autenticação por chave, conexão e reconexão da Live, eventos de gifts/likes/comentários/follow/share, catálogo de presentes, observação de conta, contadores, diagnóstico básico e motor de automações.

Não contém gameplay, player, mobs, bosses, skills, mapas ou regras específicas do Caos Live. A saída das automações é genérica: `action` + `payload`, para qualquer jogo consumir depois.

## Organização

- `cloud/server.mjs` — servidor HTTP/WebSocket e roteamento do protocolo
- `cloud/tiktok-session.mjs` — sessão TikTok, eventos, catálogo e auto recovery
- `cloud/protocol.mjs` — normalização de usuários, gifts e catálogo
- `src/modules/connection.js` — cliente WebSocket do painel
- `src/modules/live-engine.js` — captura, catálogo, regras e cooldown
- `src/modules/storage.js` — persistência local
- `src/modules/ui.js` — renderização/estado visual do painel
- `src/app.js` — composição dos módulos e eventos da interface

## Executar

```bash
npm install
npm start
```

Abra `http://localhost:8787`.

Variáveis opcionais: `PORT`, `LIVE_CONNECTOR_KEY` e `SIGN_API_KEY`.
