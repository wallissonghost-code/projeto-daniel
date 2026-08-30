# Live+ Game SDK

Use a versão fixada do SDK em novos jogos:

```html
<script src="https://wallissonghost-code.github.io/projeto-daniel/sdk/liveplus-game-sdk-v1.js"></script>
```

Depois crie a sessão com o manifesto do jogo:

```js
const session = LivePlusGameSDK.createSession({
  storageKey: 'meu-jogo-liveplus-token',
  manifest
});

await session.connect(codigoOuTicketCopiado);
```

O SDK v1 inclui:
- código de 8 caracteres;
- ticket invisível `LIVEPLUS1` com endpoint do relay;
- persistência local do endpoint público do relay;
- conexão WebSocket relay-first quando houver endpoint conhecido;
- WebRTC/PeerJS como bootstrap e fallback;
- provisionamento `relay_config` recebido do painel;
- migração para relay após provisionamento;
- manifesto, comandos, estado, eventos e transferência de imagem;
- nenhuma chave privada do relay é armazenada ou enviada ao jogo.

Cada jogo precisa definir apenas `gameId`, nome/versão, manifesto de ações e os handlers de gameplay.

Para evitar quebrar jogos existentes, não altere `liveplus-game-sdk-v1.js` de forma incompatível. Mudanças incompatíveis devem criar `liveplus-game-sdk-v2.js` e os jogos devem migrar explicitamente.