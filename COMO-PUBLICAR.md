# Como colocar o Bacabal Conecta online

## Opção recomendada — Railway (link fixo)

1. Código no GitHub: `esthellmo1409/bacabal-inteligente`
2. Em [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Selecione `bacabal-inteligente` (usa `railway.toml` → `node server.js`)
4. Em **Settings** → **Networking** → **Generate Domain**
5. URL fica tipo: `https://bacabal-inteligente-xxxx.up.railway.app`

### Volume (obrigatório pra dados não sumirem)

Sem volume, cada **redeploy apaga** chamados, visitas, plantões etc.

1. No serviço do app → clique direito no canvas **ou** **+ Volume**
2. Conecte o volume ao serviço **bacabal-inteligente**
3. **Mount Path:** `/data`  
   - **Não** use `/app` (apaga o código)  
   - **Não** use `/app/data` (cobre o seed e complica o bootstrap)
4. Redeploy (Railway reinicia sozinho)
5. Confira: abra `https://SEU-DOMINIO/api/health`  
   - `"volume": true`  
   - `"dataDir": "/data"`  
   - `"ok": true`

Na **primeira** subida com volume vazio, o sistema **copia o seed** (Bacabal + Saúde demo) para `/data`. Depois disso, o que você alterar no app **permanece** entre deploys.

Variáveis que o Railway cria sozinho (não precisa cadastrar):
- `RAILWAY_VOLUME_MOUNT_PATH` (= `/data`)
- `RAILWAY_VOLUME_NAME`

Opcional: defina `DATA_DIR=/data` nas Variables do serviço (já é o padrão se o volume estiver em `/data`).

### Links para a reunião
- Kit: `/reuniao.html?cidade=bacabal`
- Pitch: `/pitch.html?cidade=bacabal`
- Gabinete: `/prefeito.html?cidade=bacabal`
- Demo 5 min: `/demo.html?cidade=bacabal`
- Saúde (olho): `/prefeito.html?cidade=bacabal` → aba Saúde
- Health/volume: `/api/health`

## Render (alternativa)
Blueprint/`render.yaml` ou Web Service Node: Start `node server.js`.  
Use disco persistente apontando para o mesmo `DATA_DIR`.

## Túnel rápido (PC ligado)
```bash
node server.js
.\cloudflared.exe tunnel --url http://localhost:4000
```

## Docker
```bash
docker build -t bacabal-inteligente .
docker run -p 4000:4000 -v bacabal-data:/data -e DATA_DIR=/data bacabal-inteligente
```
