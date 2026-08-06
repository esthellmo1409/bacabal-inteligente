# Locução do clipe TV — Bom Lugar Conecta (cenas com IA + saúde)
import asyncio
import edge_tts
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "assets"
VOICE = "pt-BR-FranciscaNeural"
RATE = "-2%"

SCRIPTS = [
    # 0 Abertura
    "Bom Lugar. Uma cidade que quer ser vista pelo que entrega. Este é o Bom Lugar Conecta — a plataforma da Prefeitura pra cidade, saúde e eventos, com a prefeita no comando e a população no protocolo.",
    # 1 Cidadão
    "Na rua, o cidadão encontra o problema, aponta a câmera e registra. Foto, local e pedido oficial. Simples. Direto. Sem depender só do WhatsApp.",
    # 2 Protocolo
    "Em segundos, nasce o protocolo. Obrigado pela colaboração. Agora tem número, rastreio e secretaria responsável — do início ao fim.",
    # 3 Gabinete da Prefeita
    "No Gabinete da Prefeita, Marlene Miranda enxerga a cidade inteira: o que está aberto, o que atrasa e o que precisa de prioridade. Cobra com registro — não no achismo.",
    # 4 IA no Gabinete
    "E tem mais: a assistente de inteligência artificial do Bom Lugar Conecta. No gabinete, ela analisa a plataforma, resume filas, aponta urgências e ajuda a prefeita a decidir com clareza.",
    # 5 Secretaria + IA
    "Na secretaria, a mesma inteligência apoia a equipe. Olha a foto do problema e sugere material, quantidade, tempo e ferramentas. Planejamento mais rápido. Execução mais segura.",
    # 6 Campo
    "No campo, a ordem chega no celular. A equipe aceita, navega, resolve e manda a foto do serviço pronto. Prova na mão. Sem desculpa sem registro.",
    # 7 Saúde
    "Na Saúde, o Conecta organiza o que o povo mais sente: fila, plantão, demanda e tempo de resposta. Menos surpresa. Mais controle. Mais dignidade no atendimento.",
    # 8 Resultado
    "Antes e depois, na mesma tela. O cidadão confere. A secretaria valida. O gabinete acompanha. Gestão com evidência — do protocolo ao resultado.",
    # 9 Fechamento impactante
    "Gabinete decide. Secretaria executa. Campo faz. Saúde cuida. Inteligência artificial orienta. Bom Lugar Conecta — a cidade conectada de verdade. Sob o olhar da prefeita. Com a cara do povo.",
]


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, text in enumerate(SCRIPTS):
        path = OUT / f"tv-bl-narracao-{i}.mp3"
        print(f"Gerando {path.name}…")
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
        print(f"  ok -> {path.stat().st_size} bytes")
        paths.append(path)

    # Concatenação simples (opcional) — só lista
    print(f"\n{len(paths)} faixas prontas em {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
