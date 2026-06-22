import type { Key, Movement, User } from "../types";



async function callAI(prompt: string) {
  try {
    const response = await fetch("/api/ask-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();

    if (!response.ok) {
      return (
        data?.text ||
        "Assistente IA indisponível no momento. Tente novamente mais tarde."
      );
    }

    return data.text || "A IA não conseguiu responder.";
  } catch (error) {
    console.error("Erro IA:", error);
    return "Assistente IA indisponível no momento. Tente novamente mais tarde.";
  }
}

export async function getSmartKeyReport(
  keys: Key[],
  movements: Movement[],
  users: User[]
) {
  const availableKeys = keys.filter(
    (key) => key.status === "DISPONIVEL"
  );

  const borrowedKeys = keys.filter(
    (key) => key.status === "EM_USO"
  );

  const recentMovements = movements.slice(0, 10).map((movement) => ({
    keyId: movement.keyId,
    userId: movement.userId,
    withdrawnAt: movement.withdrawnAt,
    returnedAt: movement.returnedAt,
  }));

  const openKeys = borrowedKeys.map((key) => ({
    code: key.code,
    label: key.label,
    sector: key.sector,
    status: key.status,
  }));

  const prompt = `
Você é um assistente operacional do sistema SYNTRA.

Analise o resumo abaixo e gere um relatório curto, prático e objetivo.

DADOS:
- Total de chaves: ${keys.length}
- Chaves disponíveis: ${availableKeys.length}
- Chaves em uso: ${borrowedKeys.length}
- Total de movimentações: ${movements.length}
- Total de usuários: ${users.length}

CHAVES EM ABERTO:
${JSON.stringify(openKeys, null, 2)}

ÚLTIMAS MOVIMENTAÇÕES:
${JSON.stringify(recentMovements, null, 2)}

Gere em português:
1. Resumo operacional
2. Riscos principais
3. Chaves em aberto
4. Recomendações práticas

Seja direto. Não escreva texto longo.
`;

  const summary = await callAI(prompt);

  return {
    summary,
    recommendations: [],
  };
}

export async function askAssistant(
  question: string,
  keys?: Key[],
  movements?: Movement[]
) {
  const summarizedKeys = (keys || []).slice(0, 30).map((key) => ({
    code: key.code,
    label: key.label,
    sector: key.sector,
    status: key.status,
  }));

  const summarizedMovements = (movements || []).slice(0, 20).map((movement) => ({
    keyId: movement.keyId,
    userId: movement.userId,
    withdrawnAt: movement.withdrawnAt,
    returnedAt: movement.returnedAt,
  }));

  const prompt = `
Você é um assistente operacional de controle de chaves do sistema SYNTRA.

Pergunta:
${question}

Resumo das chaves:
${JSON.stringify(summarizedKeys, null, 2)}

Movimentações recentes:
${JSON.stringify(summarizedMovements, null, 2)}

Responda em português, de forma objetiva e curta.
`;

  return await callAI(prompt);
}