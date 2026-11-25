import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // Coloque index.html, styles.css e app.js na pasta /public

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const plantDiagnosisSchema = {
  type: Type.OBJECT,
  properties: {
    is_plant: { type: Type.BOOLEAN },
    plant_name: { type: Type.STRING },
    scientific_name: { type: Type.STRING },
    health_status: { type: Type.STRING, enum: ["Saudável", "Atenção", "Crítico"] },
    diagnosis_title: { type: Type.STRING },
    confidence_percentage: { type: Type.INTEGER },
    detailed_analysis: { type: Type.STRING },
    treatment_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    care_tips: {
      type: Type.OBJECT,
      properties: {
        water: { type: Type.STRING },
        light: { type: Type.STRING },
        soil: { type: Type.STRING }
      },
      required: ["water", "light", "soil"]
    }
  },
  required: [
    "is_plant", "plant_name", "scientific_name", "health_status",
    "diagnosis_title", "confidence_percentage", "detailed_analysis",
    "treatment_steps", "care_tips"
  ]
};

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType, userContext } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Imagem não enviada.' });
    }

    const prompt = userContext
      ? `Analise esta planta. Contexto do usuário: "${userContext}"`
      : `Analise esta planta e forneça o diagnóstico fitossanitário completo.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType
          }
        }
      ],
      config: {
        systemInstruction: 'Você é um Engenheiro Agrônomo e Botânico especialista. Diagnostique a planta com precisão técnica e linguagem acessível em Português do Brasil.',
        responseMimeType: 'application/json',
        responseSchema: plantDiagnosisSchema,
        temperature: 0.2
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error('Erro na API Gemini:', error);
    res.status(500).json({ error: 'Falha ao processar diagnóstico da planta.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PlantDoc AI rodando em http://localhost:${PORT}`));