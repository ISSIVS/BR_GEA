<script setup>
import { ref, reactive, onMounted } from 'vue';
import './DispatchPage.css';

const API = import.meta.env.VITE_REST_API_URL;
const LOCAL_API = import.meta.env.VITE_API_URL;

// --- Estado de Autenticação ---
const isAuthenticated = ref(false);
const authLoading = ref(false);
const authError = ref("");
const loginForm = reactive({ username: "", password: "" });
const AUTH_HEADER = ref({});

// --- Abas internas ---
const activeAdminTab = ref('subscriptions');

// --- Configurações de Áudio ---
const audioEnabled = ref(false);
const selectedAudio = ref(null); // null | base64 (não salvo) | '/uploads/...' (salvo)

const loadAudioSettings = async () => {
  try {
    const res = await fetch(`${LOCAL_API}/api/admin/settings`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.data?.audio_enabled !== undefined) {
      audioEnabled.value = json.data.audio_enabled === true || json.data.audio_enabled === 'true';
    }
    if (json.data?.audio_file_url) {
      selectedAudio.value = json.data.audio_file_url;
    }
  } catch (e) {
    console.error("Erro ao carregar configurações de áudio:", e);
  }
};

const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert("Arquivo muito grande. Máximo 2MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => { selectedAudio.value = e.target.result; };
  reader.readAsDataURL(file);
};

const saveAudioSettings = async () => {
  try {
    // Upload se novo arquivo selecionado (base64)
    if (selectedAudio.value?.startsWith('data:')) {
      const uploadRes = await fetch(`${LOCAL_API}/api/admin/upload-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: selectedAudio.value })
      });
      if (!uploadRes.ok) throw new Error("Falha no upload do áudio");
      const { url } = await uploadRes.json();
      selectedAudio.value = url;

      const urlRes = await fetch(`${LOCAL_API}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'audio_file_url', value: url })
      });
      if (!urlRes.ok) throw new Error("Falha ao salvar URL do áudio");
    }

    const enabledRes = await fetch(`${LOCAL_API}/api/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'audio_enabled', value: audioEnabled.value })
    });
    if (!enabledRes.ok) throw new Error("Falha ao salvar configuração de alerta");

    alert("Configurações salvas com sucesso!");
  } catch (e) {
    alert("Erro ao salvar: " + e.message);
  }
};

const testAudio = () => {
  if (!selectedAudio.value) return alert("Nenhum áudio configurado.");
  const url = selectedAudio.value.startsWith('data:')
    ? selectedAudio.value
    : `${LOCAL_API}${selectedAudio.value}?t=${Date.now()}`;
  const audio = new Audio(url);
  audio.play().catch(e => alert("Erro playback: " + e.message));
};

// --- Assinaturas ---
const subs = ref([]);
const loading = ref(false);
const editingId = ref(null);
const form = reactive({ callback: "", type: "", id: "", action: "", priority: "" });

// --- Auth ---
const handleLogin = async () => {
  if (!loginForm.username || !loginForm.password) {
    authError.value = "Preencha usuário e senha";
    return;
  }
  authLoading.value = true;
  authError.value = "";
  try {
    const credentials = btoa(`${loginForm.username}:${loginForm.password}`);
    const res = await fetch(`${API}/api/v1/ws_auth`, {
      headers: { "Authorization": `Basic ${credentials}` }
    });
    if (res.ok) {
      AUTH_HEADER.value = { "Authorization": `Basic ${credentials}` };
      isAuthenticated.value = true;
      sessionStorage.setItem("gea_auth", credentials);
      loadSubs();
    } else if (res.status === 401) {
      authError.value = "Usuário ou senha incorretos";
    } else {
      authError.value = `Erro ao autenticar: ${res.statusText}`;
    }
  } catch (e) {
    authError.value = "Erro de conexão com o servidor";
  } finally {
    authLoading.value = false;
  }
};

const handleLogout = () => {
  isAuthenticated.value = false;
  AUTH_HEADER.value = {};
  sessionStorage.removeItem("gea_auth");
  loginForm.username = "";
  loginForm.password = "";
  subs.value = [];
};

const verifySession = async (credentials) => {
  try {
    const res = await fetch(`${API}/api/v1/ws_auth`, {
      headers: { "Authorization": `Basic ${credentials}` }
    });
    if (res.ok) {
      isAuthenticated.value = true;
      loadSubs();
    } else {
      sessionStorage.removeItem("gea_auth");
    }
  } catch (e) {
    sessionStorage.removeItem("gea_auth");
  }
};

onMounted(() => {
  loadAudioSettings();
  const savedAuth = sessionStorage.getItem("gea_auth");
  if (savedAuth) {
    AUTH_HEADER.value = { "Authorization": `Basic ${savedAuth}` };
    verifySession(savedAuth);
  }
});

// --- Carregar Assinaturas (GET) ---
const loadSubs = async () => {
  loading.value = true;
  try {
    const res = await fetch(`${API}/api/v1/events/subscriptions`, {
      headers: { ...AUTH_HEADER.value }
    });

    if (res.status === 401) {
      handleLogout();
      authError.value = "Sessão expirada. Faça login novamente.";
      return;
    }

    const json = await res.json();
    if (res.ok) {
      // Normaliza a resposta (pode vir como objeto único ou array)
      if (Array.isArray(json.data)) {
        subs.value = json.data;
      } else if (json.data) {
        subs.value = [json.data];
      } else {
        subs.value = [];
      }
    }
  } catch (e) {
    console.error("Erro ao carregar:", e);
  } finally {
    loading.value = false;
  }
};

// --- Salvar (POST ou PUT) ---
const handleSubmit = async () => {
  if (!form.callback) return alert("O campo Callback URL é obrigatório");

  loading.value = true;

  const body = {
    // Se tiver prioridade, adiciona como query param na URL
    callback: form.callback,
    filter: {}
  };

  if (form.priority) {
    try {
      const urlObj = new URL(form.callback);
      urlObj.searchParams.set("priority", form.priority);
      body.callback = urlObj.toString();
    } catch {
      // Se URL for inválida, apenas anexa (user pode estar digitando IP raw sem http)
      if (form.callback.includes('?')) {
         body.callback = `${form.callback}&priority=${form.priority}`;
      } else {
         body.callback = `${form.callback}?priority=${form.priority}`;
      }
    }
  }

  if (form.type) body.filter.type = form.type;
  if (form.id) body.filter.id = form.id;
  if (form.action) body.filter.action = form.action;

  try {
    let url = `${API}/api/v1/events/subscriptions`;
    let method = "POST";

    if (editingId.value) {
      url += `/${editingId.value}`;
      method = "PUT";
    }

    const res = await fetch(url, {
      method,
      // Combina os headers de JSON com o de Autenticação
      headers: {
        "Content-Type": "application/json",
        ...AUTH_HEADER.value
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      cancelEdit();
      loadSubs();
    } else {
      const err = await res.json();
      alert("Erro ao salvar: " + (err.message || res.statusText));
    }
  } catch (e) {
    alert(e.message);
  } finally {
    loading.value = false;
  }
};

// --- Deletar (DELETE) ---
const handleDelete = async (id) => {
  if (!confirm("Remover esta assinatura?")) return;
  loading.value = true;
  try {
    const res = await fetch(`${API}/api/v1/events/subscriptions/${id}`, {
      method: "DELETE",
      headers: { ...AUTH_HEADER.value }
    });

    if (res.ok) {
      loadSubs();
    } else {
      alert("Erro ao deletar.");
    }
  } catch (e) {
    alert("Erro de conexão");
  } finally {
    loading.value = false;
  }
};

// --- Helpers ---
const startEdit = (sub) => {
  editingId.value = sub.id || sub.subscription_id;

  // Extrair prioridade da URL se existir
  let cb = sub.callback || "";
  let prio = "";
  try {
    const urlObj = new URL(cb);
    if (urlObj.searchParams.has("priority")) {
        prio = urlObj.searchParams.get("priority");
        urlObj.searchParams.delete("priority");
        cb = urlObj.toString();
    }
  } catch (e) {
    // Falha silenciosa no parse
  }

  form.callback = cb;
  form.priority = prio;

  // Verifica se 'filter' existe antes de acessar propriedades
  form.type = sub.filter?.type || "";
  form.id = sub.filter?.id || "";
  form.action = sub.filter?.action || "";
};

const cancelEdit = () => {
  editingId.value = null;
  form.callback = "";
  form.type = "";
  form.id = "";
  form.action = "";
  form.priority = "";
};
</script>

<template>
  <div class="dp-container">
    <!-- TELA DE LOGIN -->
    <div v-if="!isAuthenticated" class="login-overlay">
      <div class="login-card">
        <div class="login-header">
          <svg alt="Logo" class="logo" width="60" height="60" viewBox="0 0 31 31" fill="none"
					xmlns="http://www.w3.org/2000/svg">
					<path fill-rule="evenodd" clip-rule="evenodd"
						d="M24.053 18.096a6.39 6.39 0 01-.282 1.882 5.344 5.344 0 01-.1.287c-.178.49-.41.954-.692 1.373l-.244.362H9.386v-1.61h12.458c.118-.215.22-.438.304-.668.02-.057.046-.128.073-.215.137-.445.213-.92.213-1.41h-.007a4.764 4.764 0 00-.583-2.29H9.36l-.244-.362a6.386 6.386 0 01-.697-1.373c-.015-.045-.027-.079-.038-.12-.02-.057-.042-.117-.057-.166a6.258 6.258 0 01-.286-1.882h-.003c0-.94.205-1.833.579-2.64.068-.151.144-.306.236-.464a5.85 5.85 0 01.266-.434v-.004L9.356 8H22.71v1.614H10.247a4.75 4.75 0 00-.152.31 4.707 4.707 0 00-.43 1.98H9.66a4.811 4.811 0 00.286 1.625 5.173 5.173 0 00.3.664h12.488l.244.362v.004c.091.132.179.279.267.434a6.321 6.321 0 01.811 3.104h-.004zm3.994-3.639C27.764 8.081 22.5 3 16.046 3 9.56 3 4.278 8.132 4.04 14.55c-.003.148-.01.299-.01.45 0 6.628 5.378 12 12.016 12 6.637 0 12.016-5.372 12.016-12 0-.182-.007-.36-.015-.543zM15.545 29C8.079 29 2.027 22.957 2.027 15.5c0-.042.005-.08.005-.123C2.096 7.977 8.12 2 15.545 2c7.39 0 13.388 5.92 13.511 13.27.004.076.008.153.008.23 0 7.457-6.051 13.5-13.518 13.5zm0-29C6.973 0 .024 6.94.024 15.5c0 8.56 6.948 15.5 15.522 15.5 8.572 0 15.52-6.94 15.52-15.5 0-8.56-6.948-15.5-15.52-15.5zm8.508 18.096a6.39 6.39 0 01-.282 1.882 5.344 5.344 0 01-.1.287c-.178.49-.41.954-.692 1.373l-.244.362H9.386v-1.61h12.458c.118-.215.22-.438.304-.668.02-.057.046-.128.073-.215.137-.445.213-.92.213-1.41h-.007a4.764 4.764 0 00-.583-2.29H9.36l-.244-.362a6.386 6.386 0 01-.697-1.373c-.015-.045-.027-.079-.038-.12-.02-.057-.042-.117-.057-.166a6.258 6.258 0 01-.286-1.882h-.003c0-.94.205-1.833.579-2.64.068-.151.144-.306.236-.464a5.85 5.85 0 01.266-.434v-.004L9.356 8H22.71v1.614H10.247a4.75 4.75 0 00-.152.31 4.707 4.707 0 00-.43 1.98H9.66a4.811 4.811 0 00.286 1.625 5.173 5.173 0 00.3.664h12.488l.244.362v.004c.091.132.179.279.267.434a6.321 6.321 0 01.811 3.104h-.004zM16.046 3C9.56 3 4.278 8.132 4.04 14.55c-.003.148-.01.299-.01.45 0 6.628 5.378 12 12.016 12 6.637 0 12.016-5.372 12.016-12 0-.182-.007-.36-.015-.543C27.764 8.081 22.5 3 16.046 3zm7.006 15.375c0 .61-.093 1.198-.264 1.748a4.884 4.884 0 01-.093.266 5.897 5.897 0 01-.65 1.275l-.229.336H9.302v-1.495H20.98c.11-.2.207-.407.285-.62a4.412 4.412 0 00.268-1.51h-.007a4.388 4.388 0 00-.546-2.125H9.277l-.229-.337a5.91 5.91 0 01-.653-1.274c-.014-.043-.025-.074-.035-.113-.019-.052-.04-.108-.054-.154a5.76 5.76 0 01-.268-1.747h-.003a5.777 5.777 0 01.764-2.883c.082-.143.164-.28.25-.402v-.004L9.273 9h12.518v1.499H10.109a4.407 4.407 0 00-.143.287c-.26.56-.403 1.18-.403 1.839h-.004a4.428 4.428 0 00.268 1.51 4.785 4.785 0 00.282.616h11.707l.23.336v.003c.085.123.166.26.249.403a5.822 5.822 0 01.76 2.882h-.003zm3.994-3.395C26.775 8.87 21.73 4 15.546 4 9.33 4 4.266 8.918 4.04 15.07c-.003.14-.01.285-.01.43 0 6.352 5.154 11.5 11.515 11.5 6.36 0 11.516-5.148 11.516-11.5 0-.175-.007-.345-.015-.52z"
						fill="currentColor"></path>
				</svg>
          <h2>SecurOS GEA</h2>
          <p>Área Administrativa</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="dp-field">
            <label>Usuário</label>
            <input
              type="text"
              v-model="loginForm.username"
              placeholder="Digite seu usuário"
              autocomplete="username"
            />
          </div>
          <div class="dp-field">
            <label>Senha</label>
            <input
              type="password"
              v-model="loginForm.password"
              placeholder="Digite sua senha"
              autocomplete="current-password"
            />
          </div>

          <p v-if="authError" class="login-error">{{ authError }}</p>

          <button
            type="submit"
            class="dp-btn dp-btn-primary login-btn"
            :disabled="authLoading"
          >
            {{ authLoading ? "Autenticando..." : "Entrar" }}
          </button>

          <router-link to="/" class="login-back">
            ← Voltar ao Despacho
          </router-link>
        </form>
      </div>
    </div>

    <!-- CONTEÚDO AUTENTICADO -->
    <template v-else>
      <!-- NAVBAR -->
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

        <!-- Abas de Navegação (Centralizado) -->
        <div class="dp-nav-tabs" style="position: absolute; left: 50%; transform: translateX(-50%);">
          <router-link to="/" class="dp-tab-btn">
            📋 Despacho
          </router-link>
          <router-link to="/admin" class="dp-tab-btn">
            ⚙️ Assinaturas
          </router-link>
        </div>

        <div class="dp-nav-right">

          <button
            class="dp-btn dp-btn-ghost"
            @click="handleLogout"
            title="Sair"
          >
            🚪 Sair
          </button>
        </div>
      </nav>

      <!-- CONTEÚDO PRINCIPAL -->
      <main class="dp-main">
        <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; height: 100%;">

          <!-- Abas internas -->
          <div class="admin-tabs">
            <button class="admin-tab-btn" :class="{ active: activeAdminTab === 'subscriptions' }" @click="activeAdminTab = 'subscriptions'">
              ⚙️ Assinaturas
            </button>
            <button class="admin-tab-btn" :class="{ active: activeAdminTab === 'audio' }" @click="activeAdminTab = 'audio'">
              🔊 Alertas Sonoros
            </button>
          </div>

          <!-- Aba: Assinaturas -->
          <template v-if="activeAdminTab === 'subscriptions'">
          <div class="dp-filters-card">
            <div class="dp-field dp-span-2" style="flex: 2">
              <label>Callback URL (Obrigatório)</label>
              <input
                placeholder="http://seu-sistema.com/webhook"
                v-model="form.callback"
              />
            </div>
            <div class="dp-field">
              <label>Prioridade</label>
              <select v-model="form.priority">
                  <option value="">(Padrão)</option>
                  <option value="Baixa">Baixa</option>
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Critico">Crítico</option>
              </select>
            </div>
            <div class="dp-field">
              <label>Tipo Objeto (Filtro)</label>
              <input
                placeholder="Ex: CAM"
                v-model="form.type"
              />
            </div>
            <div class="dp-field">
              <label>ID Objeto (Filtro)</label>
              <input
                placeholder="Ex: 1"
                v-model="form.id"
              />
            </div>
            <div class="dp-field">
              <label>Ação (Filtro)</label>
              <input
                placeholder="Ex: ALARM"
                v-model="form.action"
              />
            </div>
            <div class="dp-field" style="justify-content: flex-end; flex-direction: row; align-items: flex-end;">
              <button v-if="editingId" class="dp-btn dp-btn-ghost" @click="cancelEdit">Cancelar</button>
              <button class="dp-btn dp-btn-primary" @click="handleSubmit" :disabled="loading">
                {{ editingId ? "Atualizar" : "Criar Assinatura" }}
              </button>
            </div>
          </div>
          </template>

          <!-- Aba: Alertas Sonoros -->
          <template v-else-if="activeAdminTab === 'audio'">
          <div class="dp-filters-card">
            <div style="grid-column: 1 / -1;">
              <h3 style="margin: 0 0 0.25rem;">Configurações de Alerta Sonoro</h3>
              <p style="margin: 0 0 1rem; color: var(--text-muted); font-size: 0.9rem;">Personalize o comportamento de alertas para novos eventos.</p>

              <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
                  <label for="chk-audio" style="font-weight: 500;">Habilitar Alerta Sonoro</label>
                  <input id="chk-audio" type="checkbox" v-model="audioEnabled" style="transform: scale(1.2);">
                </div>

                <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
                  <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">Arquivo de Áudio (.mp3, .wav)</label>

                  <!-- Arquivo salvo no servidor -->
                  <div v-if="selectedAudio && !selectedAudio.startsWith('data:')"
                    style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); border-radius: 6px;">
                    <span style="font-size: 1rem;">🔊</span>
                    <div>
                      <div style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">Arquivo salvo: {{ selectedAudio.split('/').pop() }}</div>
                      <div style="font-size: 0.7rem; color: var(--text-muted);">Clique em "Escolher arquivo" para substituir</div>
                    </div>
                  </div>

                  <!-- Novo arquivo selecionado (ainda não salvo) -->
                  <div v-else-if="selectedAudio && selectedAudio.startsWith('data:')"
                    style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); border-radius: 6px;">
                    <span style="font-size: 1rem;">⚠️</span>
                    <div style="font-size: 0.8rem; color: #fbbf24;">Novo arquivo selecionado — clique em "Salvar" para confirmar</div>
                  </div>

                  <input type="file" accept="audio/*" @change="handleFileUpload" :disabled="!audioEnabled" style="margin-bottom: 0.5rem;" />
                </div>

                <div style="display: flex; gap: 1rem;">
                  <button class="dp-btn dp-btn-ghost" @click="testAudio" :disabled="!audioEnabled || !selectedAudio" style="flex: 1;">
                    🔊 Testar Som
                  </button>
                  <button class="dp-btn dp-btn-primary" @click="saveAudioSettings" style="flex: 1;">
                    💾 Salvar Preferências
                  </button>
                </div>
              </div>
            </div>
          </div>
          </template>

          <div class="dp-table-card" v-if="activeAdminTab === 'subscriptions'">
            <div class="dp-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID Assinatura</th>
                    <th>Callback URL</th>
                    <th>Filtro: Tipo</th>
                    <th>Filtro: ID</th>
                    <th>Filtro: Ação</th>
                    <th style="text-align: right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="subs.length === 0">
                    <td colspan="6" style="text-align: center; padding: 2rem;">
                      {{ loading ? "Carregando..." : "Nenhuma assinatura ativa encontrada." }}
                    </td>
                  </tr>
                  <tr v-for="sub in subs" :key="sub.id || sub.subscription_id">
                    <td style="font-family: monospace">{{ sub.id || sub.subscription_id }}</td>
                    <td>{{ sub.callback }}</td>
                    <td>{{ sub.filter?.type || "-" }}</td>
                    <td>{{ sub.filter?.id || "-" }}</td>
                    <td>{{ sub.filter?.action || "-" }}</td>
                    <td style="text-align: right">
                      <button class="dp-btn dp-btn-ghost" style="padding: 0.2rem 0.5rem" @click="startEdit(sub)">✎</button>
                      <button class="dp-btn dp-btn-danger" style="padding: 0.2rem 0.5rem; margin-left: 5px" @click="handleDelete(sub.id || sub.subscription_id)">🗑</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </template>
  </div>
</template>

<style scoped>
/* Admin Tabs */
.admin-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}

.admin-tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.6rem 1.25rem;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
  margin-bottom: -1px;
}

.admin-tab-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.04);
}

.admin-tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Login Overlay */
.login-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-app);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.login-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-logo {
  color: var(--primary);
  margin-bottom: 1rem;
}

.login-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(90deg, #fff, #94a3b8);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.login-header p {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0.5rem 0 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-form .dp-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.login-form .dp-field label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.login-form .dp-field input {
  padding: 0.875rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-main);
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.login-form .dp-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.login-form .dp-field input::placeholder {
  color: var(--text-muted);
}

.login-error {
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
  margin: 0;
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.login-btn {
  width: 100%;
  padding: 0.875rem;
  font-size: 1rem;
  margin-top: 0.5rem;
}

.login-back {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-decoration: none;
  margin-top: 1rem;
  transition: color 0.2s;
}

.login-back:hover {
  color: var(--primary);
}
</style>
