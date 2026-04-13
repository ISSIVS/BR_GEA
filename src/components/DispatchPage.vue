<script setup>
import { ref, reactive, watch, onMounted, onUnmounted, shallowRef } from 'vue';
import DispatchEventModal from './DispatchEventModal.vue';
import SubscriptionsTab from './SubscriptionsTab.vue';
import './DispatchPage.css';

if (typeof structuredClone === 'undefined') {
  window.structuredClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
}

import {VueDatePicker} from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';

const API = import.meta.env.VITE_API_URL;

// --- Estado da View ---
const currentView = ref('dispatch');
const isAutoRefresh = ref(true); // <--- CONTROLE DA ATUALIZAÇÃO AUTOMÁTICA

// --- Utils ---
const getTodayStr = (h) => {
  const now = new Date();
  now.setHours(h, h === 23 ? 59 : 0, 0, 0);
  return now.toISOString();
};

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", 
    month: "2-digit", 
    year: "2-digit", 
    hour: "2-digit", 
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
};

const getStatusClass = (status) => {
  if (!status) return "";
  return `st-${status.toLowerCase().replace(/\s+/g, '-')}`;
};

// --- Estado dos Filtros ---
const filters = reactive({
  from: getTodayStr(0),
  to: getTodayStr(23),
  state: "",
  type: "",
  action: "",
  operator: "",
  priority: "",
});

const dateRange = ref([new Date(filters.from), new Date(filters.to)]);
const markers = shallowRef([]); 

const pagination = reactive({ limit: 50, offset: 0, total: 0 });
const rows = ref([]);
const loading = ref(false);
const isRefreshing = ref(false); // Estado para controlar atualização em background
const currentUser = ref(localStorage.getItem("dp_user") || "Usuário Externo");
const selectedRow = ref(null);

// Lógica de Destaque
const highlightedIds = ref([]);
// Persiste entre navegações: null = ainda não inicializado, 0+ = maior ID já visto
const _savedMaxId = sessionStorage.getItem('dispatch_max_id');
let knownMaxId = _savedMaxId !== null ? parseInt(_savedMaxId) : null;

let debounceTimer = null;
let pollingInterval = null;
let isPlayingAlert = false;

// Cache de nomes de câmeras { id: name }
const cameraNames = ref({});

const loadCameraNames = async () => {
  try {
    const res = await fetch(`${API}/api/cameras`);
    if (!res.ok) return;
    const json = await res.json();
    cameraNames.value = json.data || {};
  } catch (e) {
    console.error("Erro ao carregar nomes das câmeras:", e);
  }
};

const getCameraName = (camId) => {
  if (!camId) return '-';
  return cameraNames.value[camId] || camId;
};

// Cache das configurações de áudio (carregado uma vez no mount)
const audioSettings = { enabled: false, url: null };

const loadAudioSettings = async () => {
  try {
    const res = await fetch(`${API}/api/admin/settings`);
    if (!res.ok) return;
    const json = await res.json();
    audioSettings.enabled = json.data?.audio_enabled === true || json.data?.audio_enabled === 'true';
    const relativePath = json.data?.audio_file_url || null;
    // Constrói a URL completa a partir do caminho relativo armazenado
    audioSettings.url = relativePath ? `${API}${relativePath}?t=${Date.now()}` : null;
    console.log(`[Áudio] enabled: ${audioSettings.enabled}, url: ${audioSettings.url}`);
  } catch (e) {
    console.error("Erro ao carregar configurações de áudio:", e);
  }
};

const playAlert = async () => {
  if (isPlayingAlert) return;

  // Se as configs ainda não carregaram (ex: loadAudioSettings falhou no mount), tenta agora
  if (audioSettings.url === null) {
    await loadAudioSettings();
  }

  if (!audioSettings.enabled || !audioSettings.url) return;

  isPlayingAlert = true;
  const audio = new Audio(audioSettings.url);
  const reset = () => { isPlayingAlert = false; };
  // Segurança: libera a trava após 60s caso os eventos de fim não disparem
  const safety = setTimeout(reset, 60000);
  audio.onended = () => { clearTimeout(safety); reset(); };
  audio.onerror = () => { clearTimeout(safety); reset(); };
  audio.play().catch(e => {
    console.error("[Áudio] Erro ao tocar:", e);
    clearTimeout(safety);
    reset();
  });
};

// --- Carregar Dados ---
const loadData = async (isBackground = false) => {
  if (!isBackground) {
    loading.value = true;
  } else {
    // Se for background e já estiver atualizando, ignora para evitar sobreposição
    if (isRefreshing.value) return;
    isRefreshing.value = true;
  }
  
  const params = new URLSearchParams({
    from: new Date(filters.from).toISOString(),
    to: new Date(filters.to).toISOString(),
    limit: pagination.limit,
    offset: pagination.offset,
  });

  if (filters.state) params.append('state', filters.state);
  if (filters.type) params.append('type', filters.type);
  if (filters.action) params.append('action', filters.action);
  if (filters.operator) params.append('operator', filters.operator);
  if (filters.priority) params.append('priority', filters.priority);

  try {
    const res = await fetch(`${API}/api/dispatch?${params}`);
    const json = await res.json();
    if (res.ok) {
      const newRows = json.data || [];

      // Detecta novos eventos apenas no polling de background (não em recargas por filtro)
      // knownMaxId === null significa que ainda não houve carga inicial — ignora
      if (isBackground && knownMaxId !== null) {
        let newCount = 0;
        newRows.forEach(row => {
          if (Number(row.id) > knownMaxId) {
            highlightedIds.value.push(row.id);
            newCount++;
            setTimeout(() => {
              highlightedIds.value = highlightedIds.value.filter(id => id !== row.id);
            }, 2500);
          }
        });
        if (newCount > 0) {
          console.log(`[Dispatch] ${newCount} novos eventos detectados. Acionando alerta.`);
          playAlert();
        }
      }

      // Após qualquer carga bem-sucedida, inicializa knownMaxId (mesmo que não haja eventos)
      const maxId = newRows.reduce((max, r) => Math.max(max, Number(r.id)), 0);
      if (knownMaxId === null || maxId > knownMaxId) {
        knownMaxId = maxId;
        sessionStorage.setItem('dispatch_max_id', maxId.toString());
      }

      rows.value = newRows;
      pagination.total = Number(json.total || 0);
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (!isBackground) loading.value = false;
    else isRefreshing.value = false;
  }
};

const loadMarkers = async () => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.type) params.append('type', filters.type);
  if (filters.action) params.append('action', filters.action);
  if (filters.operator) params.append('operator', filters.operator);
  if (filters.priority) params.append('priority', filters.priority);

  try {
    const res = await fetch(`${API}/api/dispatch/markers?${params}`);
    const json = await res.json();
    
    if (res.ok && Array.isArray(json.data)) {
      markers.value = json.data.map(m => ({
        date: new Date(m.date), 
        type: 'dot',            
        color: m.isCritical ? '#ef4444' : '#38bdf8',
        tooltip: [{ text: `${m.count} eventos`, color: '#fff' }]
      }));
    }
  } catch (e) {
    console.error("Erro ao carregar marcadores:", e);
  }
};

// --- Exportação ---
const showExportModal = ref(false);
const showExportSuccess = ref(false);
const exportFormat = ref('xlsx');
const exportLimit = ref(500);

const isExporting = ref(false);
const isQtWebEngine = navigator.userAgent.includes('QtWebEngine');

const exportData = async () => {
  const params = new URLSearchParams({
    from: new Date(filters.from).toISOString(),
    to: new Date(filters.to).toISOString(),
    limit: exportLimit.value,
    generatedBy: currentUser.value,
  });

  if (filters.state) params.append('state', filters.state);
  if (filters.type) params.append('type', filters.type);
  if (filters.action) params.append('action', filters.action);
  if (filters.operator) params.append('operator', filters.operator);
  if (filters.priority) params.append('priority', filters.priority);

  const format = exportFormat.value;
  const url = `${API}/api/dispatch/export/${format}?${params.toString()}`;

  // QtWebEngine não suporta blob URL — usa iframe oculto e o Qt captura o download
  if (isQtWebEngine) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 15000);
    showExportModal.value = false;
    showExportSuccess.value = true;
    return;
  }

  // Navegadores modernos: fetch → blob → anchor download
  isExporting.value = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro ${res.status}`);

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `relatorio_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);

    showExportModal.value = false;
    showExportSuccess.value = true;
  } catch (e) {
    alert('Erro ao exportar: ' + e.message);
  } finally {
    isExporting.value = false;
  }
};

const handleRowUpdate = (id, patch) => {
  const idx = rows.value.findIndex(r => r.id === id);
  if (idx !== -1) {
    rows.value[idx] = { ...rows.value[idx], ...patch };
  }
  if (selectedRow.value?.id === id) {
    selectedRow.value = { ...selectedRow.value, ...patch };
  }
};

const onDayClick = (date) => {
  setTimeout(() => {
    if (!date) return;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    dateRange.value = [start, end];
  }, 10);
};

// --- CONTROLE DE POLLING (Start/Stop) ---
const startPolling = () => {
  if (pollingInterval) return; // Já está rodando
  pollingInterval = setInterval(() => {
    // Verifica se não está carregando e nem atualizando em background
    if (currentView.value === 'dispatch' && !loading.value && !isRefreshing.value) {
      loadData(true); // background update
      loadMarkers();
    }
  }, 3000);
};

const stopPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
};

// Watch para ligar/desligar dinamicamente
watch(isAutoRefresh, (isEnabled) => {
  if (isEnabled) startPolling();
  else stopPolling();
});

// --- Outros Watchers ---
watch(dateRange, (newRange) => {
  if (newRange && newRange[0] && newRange[1]) {
    filters.from = newRange[0].toISOString();
    filters.to = newRange[1].toISOString();
    pagination.offset = 0;
    isFirstLoad = true; 
    loadData(); 
  }
});

watch(currentUser, (val) => localStorage.setItem("dp_user", val));

watch(filters, (newVal, oldVal) => {
  if (newVal.from !== oldVal.from || newVal.to !== oldVal.to) return;
  pagination.offset = 0;
  
  if (newVal.type !== oldVal.type || newVal.state !== oldVal.state || newVal.action !== oldVal.action) {
     loadMarkers();
  }

  if (newVal.type !== oldVal?.type || newVal.action !== oldVal?.action || newVal.operator !== oldVal?.operator) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadData, 500);
  } else {
    loadData();
  }
});

watch(() => pagination.offset, loadData);

onMounted(() => {
  loadData();
  loadMarkers();
  loadAudioSettings();
  loadCameraNames();

  // Inicia polling se estiver habilitado
  if (isAutoRefresh.value) startPolling();

  // Integração SecurOS
  if (typeof ISScustomAPI !== 'undefined' && ISScustomAPI.onSetup) {
    try {
      ISScustomAPI.onSetup((info) => {
        const data = JSON.parse(info);
        if (data.operator) currentUser.value = data.operator; 
      });
    } catch (e) { console.error("Erro SecurOS API:", e); }
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="dp-container">
    <nav class="dp-navbar">
      
      <div class="dp-nav-left">
        <svg alt="Logo" class="logo" width="40" height="40" viewBox="0 0 31 31" fill="none"
					xmlns="http://www.w3.org/2000/svg">
					<path fill-rule="evenodd" clip-rule="evenodd"
						d="M24.053 18.096a6.39 6.39 0 01-.282 1.882 5.344 5.344 0 01-.1.287c-.178.49-.41.954-.692 1.373l-.244.362H9.386v-1.61h12.458c.118-.215.22-.438.304-.668.02-.057.046-.128.073-.215.137-.445.213-.92.213-1.41h-.007a4.764 4.764 0 00-.583-2.29H9.36l-.244-.362a6.386 6.386 0 01-.697-1.373c-.015-.045-.027-.079-.038-.12-.02-.057-.042-.117-.057-.166a6.258 6.258 0 01-.286-1.882h-.003c0-.94.205-1.833.579-2.64.068-.151.144-.306.236-.464a5.85 5.85 0 01.266-.434v-.004L9.356 8H22.71v1.614H10.247a4.75 4.75 0 00-.152.31 4.707 4.707 0 00-.43 1.98H9.66a4.811 4.811 0 00.286 1.625 5.173 5.173 0 00.3.664h12.488l.244.362v.004c.091.132.179.279.267.434a6.321 6.321 0 01.811 3.104h-.004zm3.994-3.639C27.764 8.081 22.5 3 16.046 3 9.56 3 4.278 8.132 4.04 14.55c-.003.148-.01.299-.01.45 0 6.628 5.378 12 12.016 12 6.637 0 12.016-5.372 12.016-12 0-.182-.007-.36-.015-.543zM15.545 29C8.079 29 2.027 22.957 2.027 15.5c0-.042.005-.08.005-.123C2.096 7.977 8.12 2 15.545 2c7.39 0 13.388 5.92 13.511 13.27.004.076.008.153.008.23 0 7.457-6.051 13.5-13.518 13.5zm0-29C6.973 0 .024 6.94.024 15.5c0 8.56 6.948 15.5 15.522 15.5 8.572 0 15.52-6.94 15.52-15.5 0-8.56-6.948-15.5-15.52-15.5zm8.508 18.096a6.39 6.39 0 01-.282 1.882 5.344 5.344 0 01-.1.287c-.178.49-.41.954-.692 1.373l-.244.362H9.386v-1.61h12.458c.118-.215.22-.438.304-.668.02-.057.046-.128.073-.215.137-.445.213-.92.213-1.41h-.007a4.764 4.764 0 00-.583-2.29H9.36l-.244-.362a6.386 6.386 0 01-.697-1.373c-.015-.045-.027-.079-.038-.12-.02-.057-.042-.117-.057-.166a6.258 6.258 0 01-.286-1.882h-.003c0-.94.205-1.833.579-2.64.068-.151.144-.306.236-.464a5.85 5.85 0 01.266-.434v-.004L9.356 8H22.71v1.614H10.247a4.75 4.75 0 00-.152.31 4.707 4.707 0 00-.43 1.98H9.66a4.811 4.811 0 00.286 1.625 5.173 5.173 0 00.3.664h12.488l.244.362v.004c.091.132.179.279.267.434a6.321 6.321 0 01.811 3.104h-.004zM16.046 3C9.56 3 4.278 8.132 4.04 14.55c-.003.148-.01.299-.01.45 0 6.628 5.378 12 12.016 12 6.637 0 12.016-5.372 12.016-12 0-.182-.007-.36-.015-.543C27.764 8.081 22.5 3 16.046 3zm7.006 15.375c0 .61-.093 1.198-.264 1.748a4.884 4.884 0 01-.093.266 5.897 5.897 0 01-.65 1.275l-.229.336H9.302v-1.495H20.98c.11-.2.207-.407.285-.62a4.412 4.412 0 00.268-1.51h-.007a4.388 4.388 0 00-.546-2.125H9.277l-.229-.337a5.91 5.91 0 01-.653-1.274c-.014-.043-.025-.074-.035-.113-.019-.052-.04-.108-.054-.154a5.76 5.76 0 01-.268-1.747h-.003a5.777 5.777 0 01.764-2.883c.082-.143.164-.28.25-.402v-.004L9.273 9h12.518v1.499H10.109a4.407 4.407 0 00-.143.287c-.26.56-.403 1.18-.403 1.839h-.004a4.428 4.428 0 00.268 1.51 4.785 4.785 0 00.282.616h11.707l.23.336v.003c.085.123.166.26.249.403a5.822 5.822 0 01.76 2.882h-.003zm3.994-3.395C26.775 8.87 21.73 4 15.546 4 9.33 4 4.266 8.918 4.04 15.07c-.003.14-.01.285-.01.43 0 6.352 5.154 11.5 11.515 11.5 6.36 0 11.516-5.148 11.516-11.5 0-.175-.007-.345-.015-.52z"
						fill="currentColor"></path>
				</svg>

        <div class="dp-nav-info">
          <h1>SecurOS GEA</h1>
          <p>Gerenciador de Eventos Avançado</p>
        </div>
      </div>

      <div class="dp-nav-right">
        
        <div class="dp-toggle-wrapper" title="Atualização Automática">
          <span class="label-auto">Auto</span>
          <label class="dp-switch">
            <input type="checkbox" v-model="isAutoRefresh">
            <span class="dp-slider"></span>
          </label>
        </div>

        <div class="dp-user-input-group">
          <span class="user-icon">👤</span>
          <input 
            v-model="currentUser" 
            readonly 
            title="Identificado automaticamente"
          />
        </div>

        <button 
          v-if="currentView === 'dispatch'" 
          class="dp-btn-icon" 
          @click="loadData(false)" 
          :disabled="loading"
          title="Atualizar Agora"
        >
          🔄
        </button>
      </div>
    </nav>

    <template v-if="currentView === 'dispatch'">
      
      <section class="dp-filters-card">
        <div class="dp-field dp-span-2">
          <label>Período (De / Até)</label>
          <VueDatePicker 
            v-model="dateRange" range dark teleport="body" :markers="markers"
            :enable-time-picker="true" :auto-apply="true" @day-click="onDayClick"
            format="dd/MM/yyyy HH:mm" placeholder="Selecione o período"
            input-class-name="dp-custom-input"
          />
        </div>
        <div class="dp-field">
          <label>Status</label>
          <select v-model="filters.state">
            <option value="">Todos</option>
            <option value="Novo">Novo</option>
            <option value="Reconhecido">Reconhecido</option>
            <option value="Em Tratamento">Em Tratamento</option>
            <option value="Solucionado">Solucionado</option>
            <option value="Falha de Sistema">Falha</option>
            <option value="Alarme Falso">Alarme Falso</option>
          </select>
        </div>
        <div class="dp-field"><label>Tipo</label><input placeholder="Ex: CAM..." v-model="filters.type" /></div>
        <div class="dp-field"><label>Ação</label><input placeholder="Ex: MATCH..." v-model="filters.action" /></div>
        <div class="dp-field"><label>Operador</label><input placeholder="Ex: Admin..." v-model="filters.operator" /></div>
      </section>

      <section class="dp-table-card">
        <div class="dp-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Prioridade</th><th>Hora</th><th>Câmera</th><th>Nome / Alvo</th><th>Tipo</th><th>Ação</th><th>Status</th><th>Operador</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="rows.length === 0 && !loading">
                <td colspan="9" style="text-align: center; padding: 2rem;">Nenhum evento encontrado</td>
              </tr>
              <tr 
                v-else 
                v-for="row in rows" 
                :key="row.id" 
                @click="selectedRow = row"
                :class="{ 'new-row-flash': highlightedIds.includes(row.id) }"
              >
                <td>#{{ row.id }}</td>
                <td><span :class="['prio-badge', `prio-${(row.priority || 'low').toLowerCase()}`]">{{ row.priority || 'Normal' }}</span></td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">{{ formatDate(row.time) }}</td>
                <td style="font-family: 'JetBrains Mono', monospace; color: var(--accent);">{{ getCameraName(row.cam_id) }}</td>
                <td style="font-weight: 500; color: white;">{{ row.name || row.object_id || '-' }}</td>
                <td>{{ row.type }}</td>
                <td>{{ row.action }}</td>
                <td><span :class="['dp-badge', getStatusClass(row.state)]">{{ row.state || "Novo" }}</span></td>
                <td style="color: var(--text-muted)">{{ row.operator || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dp-pagination">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Total: <strong>{{ pagination.total }}</strong></span>
            <button class="dp-btn dp-btn-ghost" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" @click="showExportModal = true">
              ⬇ Exportar
            </button>
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <button class="dp-btn dp-btn-ghost" :disabled="pagination.offset === 0" @click="pagination.offset -= pagination.limit">← Anterior</button>
            <button class="dp-btn dp-btn-ghost" :disabled="pagination.offset + pagination.limit >= pagination.total" @click="pagination.offset += pagination.limit">Próximo →</button>
          </div>
        </div>

        <!-- Modal de Exportação -->
        <div v-if="showExportModal" class="export-modal-overlay" @click.self="showExportModal = false">
          <div class="export-modal">
            <h3>Exportar Eventos</h3>
            <p class="export-subtitle">Os filtros ativos serão aplicados na exportação.</p>

            <div class="export-field">
              <label>Formato</label>
              <div class="export-format-group">
                <label :class="['export-format-btn', exportFormat === 'xlsx' && 'active']">
                  <input type="radio" v-model="exportFormat" value="xlsx" hidden /> XLSX
                </label>
                <label :class="['export-format-btn', exportFormat === 'csv' && 'active']">
                  <input type="radio" v-model="exportFormat" value="csv" hidden /> CSV
                </label>
                <label :class="['export-format-btn', exportFormat === 'pdf' && 'active']">
                  <input type="radio" v-model="exportFormat" value="pdf" hidden /> PDF
                </label>
              </div>
            </div>

            <div class="export-field">
              <label>Limite de eventos <span style="color: var(--text-muted)">(máx. {{ exportFormat === 'pdf' ? 500 : 10000 }})</span></label>
              <input
                type="number"
                v-model.number="exportLimit"
                :max="exportFormat === 'pdf' ? 500 : 10000"
                min="1"
                class="export-limit-input"
              />
            </div>

            <div class="export-actions">
              <button class="dp-btn dp-btn-ghost" @click="showExportModal = false" :disabled="isExporting">Cancelar</button>
              <button class="dp-btn dp-btn-primary" @click="exportData" :disabled="isExporting">
                {{ isExporting ? 'Gerando...' : '⬇ Baixar' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <SubscriptionsTab v-else />

    <!-- Modal de Sucesso na Exportação -->
    <div v-if="showExportSuccess" class="export-modal-overlay" @click.self="showExportSuccess = false">
      <div class="export-modal" style="text-align: center; gap: 1rem;">
        <div style="font-size: 2.5rem;">✅</div>
        <h3 style="margin: 0;">Exportação concluída!</h3>
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
          O arquivo foi baixado para o seu computador.
        </p>
        <button class="dp-btn dp-btn-primary" style="width: 100%;" @click="showExportSuccess = false">OK</button>
      </div>
    </div>

    <DispatchEventModal 
      v-if="currentView === 'dispatch' && selectedRow" 
      :row="selectedRow" 
      :current-user="currentUser" 
      @close="selectedRow = null"
      @update-list="handleRowUpdate"
    />
  </div>
</template>

<style>
/* CSS Global */
.dp__theme_dark {
  --dp-background-color: var(--bg-app);
  --dp-text-color: var(--text-main);
  --dp-hover-color: var(--bg-panel);
  --dp-hover-text-color: var(--primary);
  --dp-primary-color: var(--primary);
  --dp-primary-text-color: #ffffff;
  --dp-border-color: var(--border);
  --dp-menu-border-color: var(--border);
}
.dp__input {
  background-color: var(--bg-app) !important;
  border-color: var(--border) !important;
  color: var(--text-main) !important;
}
.dp__menu { z-index: 99999 !important; }
.dp__outer_menu_wrap { z-index: 99999 !important; }

/* Modal de Exportação */
.export-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.export-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.75rem;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.export-modal h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-main);
}
.export-subtitle {
  margin: -0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.export-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.export-field label {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-weight: 500;
}
.export-format-group {
  display: flex;
  gap: 0.5rem;
}
.export-format-btn {
  flex: 1;
  text-align: center;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-muted);
  background: var(--bg-app);
  transition: border-color 0.15s, color 0.15s;
}
.export-format-btn.active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-glow);
}
.export-limit-input {
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-main);
  font-size: 0.95rem;
  width: 100%;
  box-sizing: border-box;
}
.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>