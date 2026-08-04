# Como colocar o Bacabal Inteligente online

## Opção recomendada — Render (grátis, link fixo)

1. Código no GitHub (este repositório).
2. Conta em [render.com](https://render.com) → **New** → **Blueprint** → selecione o repo (usa `render.yaml`).
   - Ou **Web Service**: Runtime Node, Build `echo ready`, Start `node server.js`.
3. Aguarde o deploy. A URL fica tipo:
   `https://bacabal-inteligente.onrender.com`

### Links para a reunião
- Kit: `/reuniao.html?cidade=bacabal`
- Pitch: `/pitch.html?cidade=bacabal`
- Gabinete: `/prefeito.html?cidade=bacabal`
- Demo 5 min: `/demo.html?cidade=bacabal`

> Plano free do Render “dorme” após ~15 min sem acesso. Abra o site 1–2 min antes da reunião.

## Opção rápida — túnel (PC ligado)
```bash
node server.js
.\cloudflared.exe tunnel --url http://localhost:4000
```

## Docker
```bash
docker build -t bacabal-inteligente .
docker run -p 4000:4000 bacabal-inteligente
```
