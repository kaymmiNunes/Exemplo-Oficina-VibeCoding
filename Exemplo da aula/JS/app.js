/**
 * PlantDoc AI - Lógica Frontend & Integração Gemini 2.5 Flash
 * Estruturado para suportar chamada direta (testes locais) ou via Backend Proxy (/api/analyze).
 */

const CONFIG = {
  // Altere para true quando migrar para o backend Node.js (server.js)
  USE_BACKEND_PROXY: false,
  BACKEND_ENDPOINT: '/api/analyze',
  GEMINI_MODEL: 'gemini-3.8-flash',
  HISTORY_KEY: 'plantdoc_history_v1',
  MAX_HISTORY: 5
};

// Schema rigoroso exigido para Structured Outputs do Gemini
const PLANT_DIAGNOSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_plant: {
      type: "BOOLEAN",
      description: "Verdadeiro se a imagem contiver claramente uma planta, folha, flor, fruto ou cultivo."
    },
    plant_name: {
      type: "STRING",
      description: "Nome popular da planta em português (ou 'Não identificada' se is_plant for false)."
    },
    scientific_name: {
      type: "STRING",
      description: "Nome científico em latim (ex: Monstera deliciosa)."
    },
    health_status: {
      type: "STRING",
      enum: ["Saudável", "Atenção", "Crítico"],
      description: "Classificação geral do estado fitossanitário da planta."
    },
    diagnosis_title: {
      type: "STRING",
      description: "Título curto e objetivo do diagnóstico (ex: 'Planta Saudável e Vigorosa', 'Deficiência de Nitrogênio', 'Infestação por Cochonilha')."
    },
    confidence_percentage: {
      type: "INTEGER",
      description: "Nível de confiança da identificação e diagnóstico de 0 a 100."
    },
    detailed_analysis: {
      type: "STRING",
      description: "Explicação agronômica clara detalhando os sinais visuais observados nas folhas, caule ou substrato."
    },
    treatment_steps: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Lista prática e sequencial de ações imediatas para tratar ou manter a planta."
    },
    care_tips: {
      type: "OBJECT",
      properties: {
        water: { type: "STRING", description: "Frequência e método ideal de rega para a espécie." },
        light: { type: "STRING", description: "Necessidade de luminosidade (sol pleno, meia-sombra, luz difusa)." },
        soil: { type: "STRING", description: "Substrato ideal e recomendação de adubação." }
      },
      required: ["water", "light", "soil"]
    }
  },
  required: [
    "is_plant",
    "plant_name",
    "scientific_name",
    "health_status",
    "diagnosis_title",
    "confidence_percentage",
    "detailed_analysis",
    "treatment_steps",
    "care_tips"
  ]
};

const SYSTEM_INSTRUCTION = `
Você é um Engenheiro Agrônomo, Fitopatologista e Botânico Sênior especialista em diagnóstico visual de plantas ornamentais, hortaliças, frutíferas e culturas agrícolas.
Analise a imagem fornecida com rigor técnico, mas comunique-se de forma acessível e prática para o usuário.
1. Primeiro, verifique se a imagem realmente mostra uma planta. Caso contrário, defina "is_plant": false e explique o motivo em "detailed_analysis".
2. Identifique a espécie (nome popular no Brasil e nome científico) e o grau de confiança.
3. Avalie manchas foliares, clorose, necrose, pragas (cochonilhas, pulgões, ácaros, fungos como oídio/ferrugem), estiolamento ou sinais de estresse hídrico/nutricional.
4. Considere o contexto adicional fornecido pelo usuário (se houver) para refinar o diagnóstico.
5. Responda estritamente no formato JSON especificado, em Português do Brasil.
`;

// Estado da Aplicação
let currentImageBase64 = null;
let currentImageMime = null;
let currentThumbnailDataUrl = null;

// Elementos DOM
const els = {
  toggleApiBtn: document.getElementById('toggleApiBtn'),
  apiStatusText: document.getElementById('apiStatusText'),
  apiConfigDrawer: document.getElementById('apiConfigDrawer'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  saveApiBtn: document.getElementById('saveApiBtn'),
  
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  cameraInput: document.getElementById('cameraInput'),
  btnGallery: document.getElementById('btnGallery'),
  btnCamera: document.getElementById('btnCamera'),
  uploadPlaceholder: document.getElementById('uploadPlaceholder'),
  previewContainer: document.getElementById('previewContainer'),
  imagePreview: document.getElementById('imagePreview'),
  scannerOverlay: document.getElementById('scannerOverlay'),
  btnRemoveImage: document.getElementById('btnRemoveImage'),
  
  contextInput: document.getElementById('contextInput'),
  btnAnalyze: document.getElementById('btnAnalyze'),
  errorAlert: document.getElementById('errorAlert'),
  errorMessage: document.getElementById('errorMessage'),
  
  historyList: document.getElementById('historyList'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  
  emptyResultState: document.getElementById('emptyResultState'),
  loadingSkeleton: document.getElementById('loadingSkeleton'),
  notPlantCard: document.getElementById('notPlantCard'),
  notPlantReason: document.getElementById('notPlantReason'),
  resultsContainer: document.getElementById('resultsContainer'),
  
  healthBadge: document.getElementById('healthBadge'),
  confidenceBadge: document.getElementById('confidenceBadge'),
  plantName: document.getElementById('plantName'),
  scientificName: document.getElementById('scientificName'),
  diagnosisTitle: document.getElementById('diagnosisTitle'),
  detailedAnalysis: document.getElementById('detailedAnalysis'),
  treatmentSteps: document.getElementById('treatmentSteps'),
  careWater: document.getElementById('careWater'),
  careLight: document.getElementById('careLight'),
  careSoil: document.getElementById('careSoil')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initApiKeyState();
  bindEvents();
  renderHistory();
});

function initApiKeyState() {
  const savedKey = sessionStorage.getItem('GEMINI_API_KEY');
  if (savedKey) {
    els.apiKeyInput.value = savedKey;
    els.toggleApiBtn.classList.add('configured');
    els.apiStatusText.textContent = 'API Conectada';
  } else if (!CONFIG.USE_BACKEND_PROXY) {
    els.apiConfigDrawer.classList.remove('hidden');
  }
}

function bindEvents() {
  // Toggle API Drawer
  els.toggleApiBtn.addEventListener('click', () => {
    els.apiConfigDrawer.classList.toggle('hidden');
  });

  els.saveApiBtn.addEventListener('click', () => {
    const key = els.apiKeyInput.value.trim();
    if (!key) {
      showError('Insira uma chave de API válida do Google AI Studio.');
      return;
    }
    sessionStorage.setItem('GEMINI_API_KEY', key);
    els.toggleApiBtn.classList.add('configured');
    els.apiStatusText.textContent = 'API Conectada';
    els.apiConfigDrawer.classList.add('hidden');
    hideError();
  });

  // Botões de Upload e Câmera
  els.btnGallery.addEventListener('click', (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });

  els.btnCamera.addEventListener('click', (e) => {
    e.stopPropagation();
    els.cameraInput.click();
  });

  els.fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));
  els.cameraInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

  // Drag & Drop
  ['dragenter', 'dragover'].forEach(evt => {
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('drag-over');
    });
  });

  els.dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelection(file);
  });

  // Remover Imagem
  els.btnRemoveImage.addEventListener('click', resetImageState);

  // Analisar Planta
  els.btnAnalyze.addEventListener('click', runPlantDiagnosis);

  // Limpar Histórico
  els.btnClearHistory.addEventListener('click', () => {
    localStorage.removeItem(CONFIG.HISTORY_KEY);
    renderHistory();
  });
}

/**
 * Redimensiona e comprime a imagem no cliente antes de enviar para a API.
 * Reduz o consumo de banda e acelera drasticamente a latência do Gemini.
 */
async function handleFileSelection(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showError('Por favor, selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
    return;
  }

  hideError();

  try {
    const processed = await compressImage(file, 1024, 0.85);
    const thumb = await compressImage(file, 120, 0.7);

    currentImageBase64 = processed.base64;
    currentImageMime = processed.mimeType;
    currentThumbnailDataUrl = thumb.dataUrl;

    els.imagePreview.src = processed.dataUrl;
    els.uploadPlaceholder.classList.add('hidden');
    els.previewContainer.classList.remove('hidden');
    els.btnAnalyze.disabled = false;
  } catch (err) {
    showError('Erro ao processar a imagem selecionada.');
    console.error(err);
  }
}

function compressImage(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1];

        resolve({ dataUrl, base64, mimeType });
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetImageState() {
  currentImageBase64 = null;
  currentImageMime = null;
  currentThumbnailDataUrl = null;
  els.fileInput.value = '';
  els.cameraInput.value = '';
  els.imagePreview.src = '';
  els.previewContainer.classList.add('hidden');
  els.uploadPlaceholder.classList.remove('hidden');
  els.btnAnalyze.disabled = true;
  hideError();
}

/**
 * Executa a chamada ao Gemini 2.5 Flash com Structured Outputs
 */
async function runPlantDiagnosis() {
  if (!currentImageBase64) return;

  const apiKey = sessionStorage.getItem('GEMINI_API_KEY');
  if (!CONFIG.USE_BACKEND_PROXY && !apiKey) {
    els.apiConfigDrawer.classList.remove('hidden');
    showError('Configure sua Google Gemini API Key no topo da página antes de analisar.');
    return;
  }

  setLoadingState(true);
  hideError();

  const userContext = els.contextInput.value.trim();
  const promptText = userContext
    ? `Analise esta planta e forneça o diagnóstico completo. Contexto relatado pelo usuário: "${userContext}"`
    : `Analise esta planta, identifique a espécie e forneça o diagnóstico fitossanitário completo.`;

  try {
    let diagnosisData;

    if (CONFIG.USE_BACKEND_PROXY) {
      // Modo Produção: Chama o servidor Node.js/Express
      const response = await fetch(CONFIG.BACKEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImageBase64,
          mimeType: currentImageMime,
          userContext
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro no servidor (${response.status})`);
      }
      diagnosisData = await response.json();
    } else {
      // Modo Teste Local: Chamada REST direta para o Google Gemini
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const payload = {
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: currentImageMime,
                  data: currentImageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: PLANT_DIAGNOSIS_SCHEMA
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Falha na comunicação com a API do Gemini.');
      }

      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('A IA não retornou uma resposta válida.');
      }

      diagnosisData = JSON.parse(rawText);
    }

    renderDiagnosisResult(diagnosisData);

    if (diagnosisData.is_plant) {
      saveToHistory(diagnosisData, currentThumbnailDataUrl);
    }
  } catch (error) {
    console.error('Erro no diagnóstico:', error);
    showError(error.message || 'Ocorreu um erro inesperado durante a análise.');
    els.emptyResultState.classList.remove('hidden');
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  els.btnAnalyze.disabled = isLoading;
  els.btnRemoveImage.disabled = isLoading;

  if (isLoading) {
    els.scannerOverlay.classList.remove('hidden');
    els.emptyResultState.classList.add('hidden');
    els.resultsContainer.classList.add('hidden');
    els.notPlantCard.classList.add('hidden');
    els.loadingSkeleton.classList.remove('hidden');
  } else {
    els.scannerOverlay.classList.add('hidden');
    els.loadingSkeleton.classList.add('hidden');
  }
}

function renderDiagnosisResult(data) {
  if (!data.is_plant) {
    els.notPlantReason.textContent = data.detailed_analysis || 'Nenhuma planta foi detectada na imagem.';
    els.notPlantCard.classList.remove('hidden');
    els.resultsContainer.classList.add('hidden');
    return;
  }

  // Identificação
  els.plantName.textContent = data.plant_name;
  els.scientificName.textContent = data.scientific_name;
  els.confidenceBadge.innerHTML = `<i data-lucide="sparkles"></i> ${data.confidence_percentage}% de confiança`;

  // Badge de Status
  els.healthBadge.textContent = data.health_status;
  els.healthBadge.className = 'status-badge';
  const normalizedStatus = data.health_status
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // 'saudavel', 'atencao', 'critico'
  els.healthBadge.classList.add(`status-${normalizedStatus}`);

  // Diagnóstico
  els.diagnosisTitle.textContent = data.diagnosis_title;
  els.detailedAnalysis.textContent = data.detailed_analysis;

  // Passo a Passo
  els.treatmentSteps.innerHTML = '';
  data.treatment_steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    els.treatmentSteps.appendChild(li);
  });

  // Cuidados Preventivos
  els.careWater.textContent = data.care_tips.water;
  els.careLight.textContent = data.care_tips.light;
  els.careSoil.textContent = data.care_tips.soil;

  els.resultsContainer.classList.remove('hidden');
  els.notPlantCard.classList.add('hidden');
  lucide.createIcons();
}

/**
 * Gerenciamento de Histórico no localStorage (últimas 5 análises)
 */
function saveToHistory(diagnosis, thumbnail) {
  const history = getHistory();
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    thumbnail,
    diagnosis
  };

  const updated = [entry, ...history].slice(0, CONFIG.MAX_HISTORY);
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(updated));
  renderHistory();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = getHistory();

  if (history.length === 0) {
    els.historyList.innerHTML = '<p class="empty-state">Nenhuma análise realizada ainda.</p>';
    els.btnClearHistory.classList.add('hidden');
    return;
  }

  els.btnClearHistory.classList.remove('hidden');
  els.historyList.innerHTML = '';

  const statusColors = {
    'Saudável': '#15803d',
    'Atenção': '#d97706',
    'Crítico': '#dc2626'
  };

  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <img src="${item.thumbnail}" alt="${item.diagnosis.plant_name}" class="history-thumb" />
      <div class="history-info">
        <h4>${item.diagnosis.plant_name}</h4>
        <p>${item.diagnosis.diagnosis_title} • ${item.date}</p>
      </div>
      <span class="history-dot" style="background: ${statusColors[item.diagnosis.health_status] || '#64748b'}" title="${item.diagnosis.health_status}"></span>
    `;

    div.addEventListener('click', () => {
      els.emptyResultState.classList.add('hidden');
      renderDiagnosisResult(item.diagnosis);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.historyList.appendChild(div);
  });
}

function showError(msg) {
  els.errorMessage.textContent = msg;
  els.errorAlert.classList.remove('hidden');
}

function hideError() {
  els.errorAlert.classList.add('hidden');
}