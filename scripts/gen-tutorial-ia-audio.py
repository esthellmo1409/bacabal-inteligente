# Locução do tutorial com IA — Bacabal / Bom Lugar (marca via página)
import asyncio
import edge_tts
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "tutorial-ia-audio"
VOICE = "pt-BR-FranciscaNeural"
RATE = "-2%"

SCRIPTS = [
    # 0
    "Bem-vindo ao tutorial com inteligência artificial. Vamos do protocolo na rua até o gabinete — com a assistente ajudando a secretaria e o gestor a decidir.",
    # 1
    "O cidadão já registrou o problema com foto e ganhou o protocolo. Agora a secretaria abre o chamado e vê a assistente de inteligência artificial.",
    # 2
    "A assistente pergunta: posso analisar a foto e sugerir material, quantidade, tempo e ferramentas? Clique em Sim, analisar.",
    # 3
    "Pronto. A assistente montou o plano de serviço: material, quantidade, tempo estimado e ferramentas. A equipe confirma e segue.",
    # 4
    "Com o plano na mão, a secretaria encaminha ao campo. Clique em Encaminhar ao campo.",
    # 5
    "No gabinete, a mesma inteligência apoia quem decide. Clique em Analisar a cidade na plataforma.",
    # 6
    "A assistente resume filas, urgências e o que priorizar. Quem decide é o gestor — a inteligência só organiza a visão.",
    # 7
    "Tutorial concluído. Cidadão no protocolo. Secretaria com plano da assistente. Campo com prova. Gabinete com visão. A inteligência artificial orienta. A gestão decide.",
]


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, text in enumerate(SCRIPTS):
        path = OUT / f"{i:02d}.mp3"
        print(f"Gerando {path.name}…")
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
        print(f"  ok -> {path.stat().st_size} bytes")
    print(f"\n{len(SCRIPTS)} faixas em {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
