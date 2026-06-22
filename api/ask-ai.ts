// Rota serverless (Vercel) que conversa com a API do Gemini.
// A chave GEMINI_API_KEY fica APENAS no backend — nunca é enviada ao frontend.

const QUOTA_MESSAGE =
  "Assistente IA temporariamente indisponível. Limite de uso atingido.";
const GENERIC_MESSAGE =
  "Assistente IA indisponível no momento. Tente novamente mais tarde.";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY não configurada");
    return res.status(200).json({ text: GENERIC_MESSAGE });
  }

  try {
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt inválido" });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 700,
          },
        }),
      }
    );

    const data = await response.json();

    // Quota / rate limit -> mensagem amigável (sem expor erro técnico do Google)
    const isQuota =
      response.status === 429 ||
      data?.error?.code === 429 ||
      data?.error?.status === "RESOURCE_EXHAUSTED";

    if (isQuota) {
      console.warn("Gemini quota/rate limit:", data?.error?.message);
      return res.status(200).json({ text: QUOTA_MESSAGE });
    }

    // Qualquer outro erro do Google -> mensagem genérica (log fica só no servidor)
    if (data?.error) {
      console.error("Gemini error:", data.error);
      return res.status(200).json({ text: GENERIC_MESSAGE });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.status(200).json({
      text: text || "A IA não conseguiu responder.",
    });
  } catch (error) {
    console.error("Erro ao consultar Gemini:", error);
    return res.status(200).json({ text: GENERIC_MESSAGE });
  }
}
