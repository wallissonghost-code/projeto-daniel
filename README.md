# Projeto Daniel · TikTok Live Platform Base

Base isolada e comercializável do sistema de Live usado no Caos Live, reconstruída sem alterar o repositório `Game`.

## Objetivo

Este repositório serve como núcleo reutilizável para jogos e experiências interativas conectadas ao TikTok Live. Ele mantém o conector, painel, catálogo de presentes, automações e protocolo separados do gameplay.

O repositório `Game` continua sendo a referência estável do Caos Live e não precisa ser modificado para evoluir esta base.

## Mecânica TikTok estabilizada

A sessão segue a filosofia que se mostrou mais confiável no Caos Live:

- `tiktok-live-connector` 2.4.x
- modo `modern-direct` quando `SIGN_API_KEY` não existe
- somente uma conexão TikTok ativa por sessão
- novo clique não cria conexões paralelas
- `PARAR LIVE` é tratado como parada manual e não dispara Auto Recovery
- queda inesperada dispara Auto Recovery
- Auto Recovery limitado a 2 tentativas: 3s e 12s
- rate limit usa espera maior para não martelar o TikTok
- likes são agrupados antes de chegar ao painel
- gifts, chat, follow e share continuam disponíveis
- catálogo de presentes continua disponível

Não existe watchdog agressivo ou loop infinito de reconexão.

## Credenciais e isolamento por cliente

Nenhum usuário precisa utilizar o Render ou a chave de outra pessoa.

Cada instalação deve informar no painel:

- `WebSocket`: por exemplo `wss://meu-conector.onrender.com`
- `Key`: a chave criada pelo próprio cliente
- `@TikTok`: a conta/live que deseja conectar

No Render, cada instalação define sua própria variável:

- `LIVE_CONNECTOR_KEY` — protege o WebSocket
- `SIGN_API_KEY` — opcional; sem ela o sistema utiliza `modern-direct`

A Key do Connector não é uma credencial da conta TikTok.

## Organização

- `cloud/server.mjs` — servidor HTTP/WebSocket e autenticação
- `cloud/tiktok-session.mjs` — sessão TikTok estável e Auto Recovery bounded-2
- `cloud/tiktok-resilience.mjs` — classificação de erros e delays de recuperação
- `cloud/protocol.mjs` — normalização de usuários, gifts e catálogo
- `src/modules/connection.js` — cliente WebSocket do painel
- `src/modules/live-engine.js` — catálogo, eventos, regras e cooldown
- `src/modules/storage.js` — persistência local
- `src/modules/ui.js` — renderização do painel
- `src/app.js` — composição da interface

A camada TikTok deve permanecer independente da camada de jogos. Jogos futuros devem consumir as automações pelo protocolo `action` + `payload`, sem colocar gameplay dentro do Connector.

## Executar

```bash
npm install
npm start
```

Abra `http://localhost:8787`.

## Deploy no Render

O `render.yaml` já está preparado para Node 24 e não contém nenhuma Key fixa. Ao criar o serviço, preencha `LIVE_CONNECTOR_KEY` no próprio Render. `SIGN_API_KEY` é opcional.

## Regra de manutenção

Evite substituir o núcleo TikTok por versões antigas do painel ou por conectores históricos do `Game`. O histórico do Git preserva todas as versões; a implementação atual deste repositório é a base limpa destinada a evolução comercial.
