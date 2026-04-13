<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';

const props = defineProps({
  row: { type: Object, required: true },
  currentUser: { type: String, default: '' }
});

const emit = defineEmits(['close', 'updateList']);
const API = import.meta.env.VITE_API_URL;
const SECUROS_API = import.meta.env.VITE_REST_API_URL;

const secUser = import.meta.env.VITE_REST_API_USER;
const secPass = import.meta.env.VITE_REST_API_PASS;
const CREDENTIALS = btoa(`${secUser}:${secPass}`);

const comments = ref([]);
const newComment = ref("");
const loading = ref(false);
const isQtWebEngine = ref(false)
const chatEndRef = ref(null);
const images = ref({ detected: null, db: null, loading: false });
const selectedState = ref(props.row.state || "Novo");
const mediaClientId = "10"

// Estados para as abas
const activeTab = ref('details'); // 'details' | 'settings'
const audioEnabled = ref(false);
const selectedAudio = ref(null);

const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Limite de 2MB
  if (file.size > 2 * 1024 * 1024) {
    alert("Arquivo muito grande. Máximo 2MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedAudio.value = e.target.result;
  };
  reader.readAsDataURL(file);
};

const availableStates = [
  "Novo", "Reconhecido", "Em Tratamento", "Solucionado", "Falha de Sistema", "Alarme Falso"
];

// --- Helpers ---
const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit"
  });
};

const saveSettings = () => {
  localStorage.setItem("gea2_audio_enabled", JSON.stringify(audioEnabled.value));
  if (selectedAudio.value) {
    localStorage.setItem("gea2_audio_file", selectedAudio.value);
  }
  alert("Configurações salvas com sucesso!");
};

const testAudio = () => {
  if (!selectedAudio.value) return alert("Nenhum áudio carregado.");
  
  try {
    const audio = new Audio(selectedAudio.value);
    audio.play().catch(e => alert("Erro playback: " + e.message));
  } catch(e) {
    console.error(e);
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatEndRef.value) chatEndRef.value.scrollIntoView({ behavior: "smooth" });
  });
};

// --- Imagens ---
const fetchImageBlob = async (path) => {
  if (!path) return null;
  try {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${SECUROS_API}${cleanPath}`;
    const res = await fetch(url, { headers: { "Authorization": `Basic ${CREDENTIALS}` } });
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) { console.error(e); }
  return null;
};

const loadComments = async () => {
  try {
    const res = await fetch(`${API}/api/dispatch/${props.row.id}/comments`);
    const j = await res.json();
    if (res.ok) {
      comments.value = j.data || [];
      scrollToBottom();
    }
  } catch (e) { console.error(e); }
};

const formatToSecurOS = (isoString) => {
  const d = new Date(isoString);

  // Data: DD/MM/YYYY (ou DD-MM-YY conforme doc, mas seu código usava slashes)
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  // Hora: HH:MM:SS.mmm
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');

  return {
    date: `${day}-${month}-${year}`,
    time: `${hours}:${minutes}:${seconds}.${ms}`
  };
};

// TODO: Lógica dos Botões de Vídeo
const handleOpenLive = () => {
  const camId = props.row.cam_id;
  if (!camId) return alert("Câmera não identificada.");

  // Tratamento igual ao legado: vírgula vira pipe
  const seqCam = camId.toString().replace(/,/g, "|");
  const mode = "1x1"; // Fixo conforme legado

  const payload = JSON.stringify({ mode: mode, seq: seqCam });

  console.log(`[LIVE] Enviando ADD_SEQUENCE: ${payload}`);

  if (typeof ISScustomAPI !== 'undefined') {
    try {
      ISScustomAPI.sendReact("MEDIA_CLIENT", mediaClientId, "ADD_SEQUENCE", payload);

    } catch (e) {
      console.error("Erro ISScustomAPI (Live):", e);
      alert("Erro ao enviar comando para o SecurOS.");
    }
  } else {
    confirm("ISScustomAPI não disponível. (Ambiente de desenvolvimento?)");
  }
};

// Função PLAY (Botão Acessar Momento)
const handleOpenPlayback = () => {
  const camId = props.row.cam_id;
  const eventTime = props.row.time;
  if (!camId || !eventTime) return alert("Dados incompletos para playback.");

  const seqCam = camId;
  const mode = "1x1";

  let date, time;

  // Para eventos LPR, usa best_view_date_time se disponível
  // formato salvo: "09-04-2026 15:53:51.889" → date: "09-04-2026", time: "15:53:51.889"
  try {
    const p = typeof props.row.params === 'string' ? JSON.parse(props.row.params) : props.row.params;
    if (p?.bestViewTime) {
      [date, time] = p.bestViewTime.split(' ');
    }
  } catch {}

  // Fallback: usa o timestamp do evento
  if (!date || !time) {
    ({ date, time } = formatToSecurOS(eventTime));
  }

  const seqPayload  = JSON.stringify({ mode, seq: seqCam });
  const seekPayload = JSON.stringify({ date, time, cam: seqCam });

  if (typeof ISScustomAPI !== 'undefined') {
    try {
      ISScustomAPI.sendReact("MEDIA_CLIENT", mediaClientId, "ADD_SEQUENCE", seqPayload);
      ISScustomAPI.sendReact("MEDIA_CLIENT", mediaClientId, "SEEK", seekPayload);
    } catch (e) {
      console.error("Erro ISScustomAPI (Play):", e);
      alert("Erro ao enviar comando de playback.");
    }
  } else {
    confirm("ISScustomAPI não disponível.");
  }
};

const submitComment = async () => {
  if (!props.currentUser) return alert("Preencha seu nome de operador.");
  if (!newComment.value.trim()) return;

  loading.value = true;
  try {
    const res = await fetch(`${API}/api/dispatch/${props.row.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: props.currentUser, comment: newComment.value })
    });

    if (res.ok) {
      comments.value.push({ user: props.currentUser, comment: newComment.value, date: new Date() });
      newComment.value = "";
      scrollToBottom();
      emit('updateList', props.row.id, { operator: props.currentUser });
    }
  } catch (e) { alert(e.message); } finally { loading.value = false; }
};

const getBubbleStyle = (username) => {
  if (!username) return {};
  
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  
  // Usar ângulo áureo para distribuir as cores de forma bem distinta mesmo para nomes parecidos
  const hue = Math.abs((hash * 137) % 360);
  
  return {
    backgroundColor: `hsla(${hue}, 70%, 40%, 0.25)`, // Cor de fundo translúcida
    border: `1px solid hsla(${hue}, 70%, 50%, 0.5)`  // Borda da mesma matiz
  };
};

const updateStatus = async () => {
  if (!props.currentUser) return alert("Preencha seu nome de operador.");
  loading.value = true;
  try {
    const res = await fetch(`${API}/api/dispatch/${props.row.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operator: props.currentUser, state: selectedState.value })
    });
    if (!res.ok) throw new Error("Erro ao atualizar status");
    emit('updateList', props.row.id, { state: selectedState.value, operator: props.currentUser });
    alert(`Status atualizado para: ${selectedState.value}`);
  } catch (e) { alert(e.message); } finally { loading.value = false; }
};

onMounted(() => {
  loadComments();

  const ua = navigator.userAgent.toLowerCase()
  isQtWebEngine.value = ua.includes('qtwebengine')

  // Carregar configurações salvas
  const savedEnabled = localStorage.getItem("gea2_audio_enabled");
  if (savedEnabled) audioEnabled.value = JSON.parse(savedEnabled);

  const savedAudio = localStorage.getItem("gea2_audio_file");
  if (savedAudio) selectedAudio.value = savedAudio;
});

</script>

<template>
  <div class="dp-panel-backdrop" @click="$emit('close')"></div>

  <div class="dp-side-panel" @click.stop>

    <div class="dp-panel-header">
      <div>
        <h2 style="margin: 0; font-size: 1.2rem; color: var(--text-main);">Evento #{{ row.id }}</h2>
        <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
          <span :class="['dp-badge', `st-${(row.state || '').toLowerCase().replace(/\s+/g, '-')}`]">
            {{ row.state }}
          </span>
          <span v-if="row.priority" :class="['prio-badge', `prio-${(row.priority || 'low').toLowerCase()}`]" style="margin-left: 10px; font-size: 0.7rem;">
            {{ row.priority }}
          </span>
        </div>
      </div>
      <button class="dp-btn dp-btn-ghost" @click="$emit('close')" style="padding: 0.4rem 0.8rem;">✕ ESC</button>
    </div>

    <!-- Abas de Navegação -->
    <div class="dp-tabs">
      <button 
        class="dp-tab-btn" 
        :class="{ active: activeTab === 'details' }" 
        @click="activeTab = 'details'"
      >
        Detalhes
      </button>
      <button 
        class="dp-tab-btn" 
        :class="{ active: activeTab === 'settings' }" 
        @click="activeTab = 'settings'"
      >
        Configurações
      </button>
    </div>

    <div class="dp-panel-scroll-area">

      <!-- Conteúdo da Aba: Detalhes -->
      <div v-if="activeTab === 'details'" style="display: flex; flex-direction: column; flex: 1; height: 100%;">
        <div class="dp-panel-section">

          <div v-if="isQtWebEngine" style="display: flex; gap: 1rem;">
            <button class="dp-btn dp-btn-ghost action-card-btn" @click="handleOpenLive">
              <span style="font-size: 1.5rem;">📹</span>
              <span>Modo ao Vivo</span>
            </button>

            <button class="dp-btn dp-btn-ghost action-card-btn" @click="handleOpenPlayback">
              <span style="font-size: 1.5rem;">⏮</span>
              <span>Acessar Momento</span>
            </button>
          </div>

          <div
            style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); margin-top: 0.5rem;">
            <label
              style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 600;">
              Definir Status
            </label>
            <div style="display: flex; gap: 0.5rem;">
              <select v-model="selectedState" style="flex: 1;">
                <option v-for="st in availableStates" :key="st" :value="st">{{ st }}</option>
              </select>
              <button class="dp-btn dp-btn-primary" @click="updateStatus" :disabled="loading">
                Salvar
              </button>
            </div>
          </div>
        </div>

        <hr style="width: 100%; border: 0; border-top: 1px solid var(--border); margin: 0;">

        <div class="dp-panel-section" style="flex: 1;">
          <h3 style="margin:0; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Histórico /
            Comentários</h3>

          <div class="dp-chat-container">
            <div
              style="max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1rem; padding-right: 5px;">
              <div v-if="comments.length === 0" style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">
                Sem histórico.
              </div>

              <div v-for="(c, i) in comments" :key="i" class="dp-chat-bubble" :style="getBubbleStyle(c.user)">
                <div class="dp-chat-meta">
                  <span class="chat-user">{{ c.user }}</span>
                  <span class="chat-time">{{ formatDate(c.date) }}</span>
                </div>
                <div class="dp-chat-text">{{ c.comment }}</div>
              </div>
              <div ref="chatEndRef"></div>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <input v-model="newComment" placeholder="Escrever observação..." @keydown.enter="submitComment"
                style="font-size: 0.85rem;" />
              <button class="dp-btn dp-btn-primary" style="padding: 0.5rem 1rem;"
                :disabled="!newComment.trim() || loading" @click="submitComment">➤</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Conteúdo da Aba: Configurações -->
      <div v-else-if="activeTab === 'settings'" class="dp-panel-section">
        <h3 style="margin-top: 0;">Configurações de Alerta</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Personalize o comportamento de alertas para novos eventos.</p>

        <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
          
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
            <label for="chk-audio" style="font-weight: 500;">Habilitar Alerta Sonoro</label>
            <input id="chk-audio" type="checkbox" v-model="audioEnabled" style="transform: scale(1.2);">
          </div>

          <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">Arquivo de Áudio (.mp3, .wav)</label>
            
            <input type="file" accept="audio/*" @change="handleFileUpload" :disabled="!audioEnabled" style="margin-bottom: 0.5rem;" />
            
            <div v-if="selectedAudio" style="font-size: 0.8rem; color: var(--primary); margin-top: 5px;">
              ✔ Áudio personalizado carregado
            </div>
          </div>

          <div style="display: flex; gap: 1rem;">
            <button class="dp-btn dp-btn-ghost" @click="testAudio" :disabled="!audioEnabled || !selectedAudio" style="flex: 1;">
              🔊 Testar Som
            </button>
            <button class="dp-btn dp-btn-primary" @click="saveSettings" style="flex: 1;">
              💾 Salvar Preferências
            </button>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Tabs Styles */
.dp-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border);
}

.dp-tab-btn {
  flex: 1;
  background: none;
  border: none;
  padding: 1rem;
  color: var(--text-muted);
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  text-transform: uppercase;
  font-size: 0.85rem;
}

.dp-tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-main);
}

.dp-tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  background: rgba(255, 255, 255, 0.02);
}

/* Estilo dos Botões Grandes de Vídeo */
.action-card-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  transition: all 0.2s;
}

.action-card-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--primary);
  transform: translateY(-2px);
}

/* Chat Styles */
.dp-chat-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.chat-user {
  font-weight: 700;
  color: var(--accent);
  font-size: 0.85rem;
}

.chat-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: monospace;
}

.dp-chat-text {
  font-size: 0.9rem;
  color: var(--text-main);
  line-height: 1.4;
  word-break: break-word;
}
</style>