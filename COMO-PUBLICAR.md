# Como colocar o Bacabal Conecta online

## Opção recomendada — Railway (link fixo)

1. Código no GitHub: `esthellmo1409/bacabal-inteligente`
2. Em [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Selecione `bacabal-inteligente` (usa `railway.toml` → `node server.js`)
4. Em **Settings** → **Networking** → **Generate Domain**
5. URL fica tipo: `https://bacabal-inteligente-xxxx.up.railway.app`

### Links para a reunião
- Kit: `/reuniao.html?cidade=bacabal`
- Pitch: `/pitch.html?cidade=bacabal`
- Gabinete: `/prefeito.html?cidade=bacabal`
- Demo 5 min: `/demo.html?cidade=bacabal`

## Render (alternativa)
Blueprint/`render.yaml` ou Web Service Node: Start `node server.js`.

## Túnel rápido (PC ligado)
```bash
node server.js
.\cloudflared.exe tunnel --url http://localhost:4000
```

## Docker
```bash
docker build -t bacabal-inteligente .
docker run -p 4000:4000 bacabal-inteligente
```
