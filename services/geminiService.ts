import type { Key, Movement, User } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function callGemini(prompt: string) {
  if (!API_KEY || API_KEY === "PLACEHOLDER_API_KEY") {
    return "IA não configurada. Adicione sua chave Gemini no arquivo .env";
  }

  try {
    const response = await fetch(
      `${GEMINI_URL}?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log("RESPOSTA GEMINI:", data);

    if (data.error) {
      return `Erro Gemini: ${data.error.message}`;
    }

    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "A IA não conseguiu responder."
    );
  } catch (error) {
    console.error("Erro Gemini:", error);

    return "Erro ao consultar Gemini.";
  }
}

export async function getSmartKeyReport(
  keys: Key[],
  movements: Movement[],
  users: User[]
) {
  const prompt = `
Você é um assistente inteligente de um sistema de controle de chaves.

Analise os dados abaixo:

CHAVES:
${JSON.stringify(keys, null, 2)}

MOVIMENTAÇÕES:
${JSON.stringify(movements, null, 2)}

USUÁRIOS:
${JSON.stringify(users, null, 2)}

Gere:
- resumo operacional
- riscos
- chaves em aberto
- recomendações
`;

  const summary = await callGemini(prompt);

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
  const prompt = `
Você é um assistente operacional de controle de chaves.

Pergunta:
${question}

CHAVES:
${JSON.stringify(keys || [], null, 2)}

MOVIMENTOS:
${JSON.stringify(movements || [], null, 2)}

Responda de forma objetiva em português.
`;

  return await callGemini(prompt);
}