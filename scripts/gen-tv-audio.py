# Regenera locução do clipe TV — ritmo calmo e textos alinhados às cenas
import asyncio
import edge_tts
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "assets"
VOICE = "pt-BR-FranciscaNeural"
RATE = "-3%"  # mais calmo que o +8% antigo (parecia acelerado)

SCRIPTS = [
    "Imagine Bacabal com cada problema da rua virando protocolo. Este é o Bacabal Conecta — a plataforma da Prefeitura pra cidade, saúde e eventos.",
    "Olha só: o seu João sai de casa, encontra o problema na rua, aponta a câmera… e registra. Simples assim. Foto, lugar e reclamação oficial, na hora.",
    "Ele manda pra plataforma e já recebe o número do protocolo. Obrigado pela colaboração. Agora tem rastreio de verdade — sem depender do WhatsApp.",
    "No Gabinete, o prefeito enxerga o que está aberto, o que está atrasado e o que precisa de prioridade. Cobra a secretaria com registro — não no achismo.",
    "A Secretaria de Obras recebe, organiza a fila e encaminha pra equipe. Quando o Gabinete cobra, tem alerta e prazo.",
    "No campo, a equipe chega com a ordem no celular, marca presença e registra a foto do serviço pronto. Sem desculpa sem prova.",
    "Antes e depois, na mesma tela. O cidadão confere, o Gabinete valida, a secretaria fecha o protocolo com evidência.",
    "Gabinete decide. Secretaria executa. Campo faz. Bacabal Conecta — a cidade conectada de verdade.",
]


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, text in enumerate(SCRIPTS):
        path = OUT / f"tv-narracao-{i}.mp3"
        print(f"Gerando {path.name}…")
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
        print(f"  ok -> {path.stat().st_size} bytes")


if __name__ == "__main__":
    asyncio.run(main())
