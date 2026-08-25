# Projeto Daniel · Live+ Connector

Base modular para conectar TikTok Live a jogos e experiências interativas, derivada das mecânicas estáveis do Caos Live sem depender do gameplay do repositório `Game`.

## Arquitetura atual

O projeto está dividido em três camadas independentes:

- **Connector TikTok** — WebSocket, autenticação, sessão TikTok, eventos e Auto Recovery.
- **Painel Live+** — conexão, saúde/diagnóstico, eventos, Catálogo Mestre e regras.
- **Partida** — sessão PeerJS/WebRTC separada do TikTok; o painel gera o código e o jogo entra na sessão.

Uma falha na Partida não deve derrubar o Connector TikTok, e o gameplay não fica embutido no backend da Live.

## Catálogo Mestre

`data/verified-gifts.json` é a única fonte oficial de presentes disponíveis para regras.

- presentes do arquivo são marcados como verificados;
- eventos da Live são cruzados por ID/nome com o Catálogo Mestre;
- um gift desconhecido pode aparecer como evento da sessão, mas **não entra no catálogo e não dispara regras de gift**;
- o painel não mantém mais Observador antigo, catálogo descoberto ou cache local de presentes verificados.

Isso evita que metadados incompletos de uma Live alterem imagem, valor ou identidade dos presentes oficiais.

## Connector TikTok

- `tiktok-live-connector` 2.4.x
- `modern-direct` quando `SIGN_API_KEY` não existe
- uma sessão TikTok ativa por conexão
- parada manual não dispara Auto Recovery
- queda inesperada pode disparar Auto Recovery limitado
- likes são agrupados antes de chegar ao painel
- gifts, chat, follow e share são normalizados pelo protocolo

## Partida

O painel é o dono da sessão de jogo:

1. painel gera um código temporário;
2. jogo informa esse código;
3. conexão ocorre via PeerJS/WebRTC;
4. primeiro jogo conectado consome o código;
5. a sessão fica travada em `1 painel · 1 jogo`;
6. o mesmo jogo recebe uma janela curta de reconexão.

O adaptador reutilizável para jogos fica em `sdk/liveplus-game-session.js`.

## Estrutura

- `index.html` — interface atual do painel
- `src/app.js` — composição da camada Live
- `src/partida.js` — sessão de jogo controlada pelo painel
- `src/partida.css` — estilos exclusivos da Partida
- `src/modules/connection.js` — cliente WebSocket do Connector
- `src/modules/live-engine.js` — eventos, Catálogo Mestre e regras
- `src/modules/diagnostics.js` — diagnóstico técnico da sessão
- `src/modules/storage.js` — somente configurações e regras persistentes
- `src/modules/ui.js` — renderização do painel
- `data/verified-gifts.json` — Catálogo Mestre
- `cloud/server.mjs` — servidor HTTP/WebSocket e autenticação
- `cloud/tiktok-session.mjs` — sessão TikTok e Auto Recovery
- `cloud/tiktok-resilience.mjs` — classificação de falhas e backoff
- `cloud/protocol.mjs` — normalização de eventos TikTok
- `sdk/liveplus-game-session.js` — adaptador de jogo para a sessão Partida
- `tests/live-engine.mjs` — validação da lógica do Catálogo Mestre e regras

## Executar

```bash
npm install
npm start
```

Abra `http://localhost:8787`.

Para validar a base:

```bash
npm run check
```

## Deploy

O `render.yaml` usa Node e não contém chave fixa. Cada instalação deve definir sua própria `LIVE_CONNECTOR_KEY`. `SIGN_API_KEY` permanece opcional.

## Manutenção

Não reintroduza arquivos ou fluxos históricos do painel antigo. Funcionalidades novas devem entrar em módulos próprios e possuir uma referência clara a partir de `index.html`, `src/app.js`, `src/partida.js`, backend, SDK ou testes.
