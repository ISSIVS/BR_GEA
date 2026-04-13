<script setup>
import './DispatchPage.css';
</script>

<template>
  <div class="dp-container">
    <!-- NAVBAR -->
    <nav class="dp-navbar">
      <div class="dp-nav-left">
        <svg alt="Logo" class="logo" width="40" height="40" viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M24.053 18.096a6.39 6.39 0 01-.282 1.882 5.344 5.344 0 01-.1.287c-.178.49-.41.954-.692 1.373l-.244.362H9.386v-1.61h12.458c.118-.215.22-.438.304-.668.02-.057.046-.128.073-.215.137-.445.213-.92.213-1.41h-.007a4.764 4.764 0 00-.583-2.29H9.36l-.244-.362a6.386 6.386 0 01-.697-1.373c-.015-.045-.027-.079-.038-.12-.02-.057-.042-.117-.057-.166a6.258 6.258 0 01-.286-1.882h-.003c0-.94.205-1.833.579-2.64.068-.151.144-.306.236-.464a5.85 5.85 0 01.266-.434v-.004L9.356 8H22.71v1.614H10.247a4.75 4.75 0 00-.152.31 4.707 4.707 0 00-.43 1.98H9.66a4.811 4.811 0 00.286 1.625 5.173 5.173 0 00.3.664h12.488l.244.362v.004c.091.132.179.279.267.434a6.321 6.321 0 01.811 3.104h-.004zm3.994-3.639C27.764 8.081 22.5 3 16.046 3 9.56 3 4.278 8.132 4.04 14.55c-.003.148-.01.299-.01.45 0 6.628 5.378 12 12.016 12 6.637 0 12.016-5.372 12.016-12 0-.182-.007-.36-.015-.543zM15.545 29C8.079 29 2.027 22.957 2.027 15.5c0-.042.005-.08.005-.123C2.096 7.977 8.12 2 15.545 2c7.39 0 13.388 5.92 13.511 13.27.004.076.008.153.008.23 0 7.457-6.051 13.5-13.518 13.5zm0-29C6.973 0 .024 6.94.024 15.5c0 8.56 6.948 15.5 15.522 15.5 8.572 0 15.52-6.94 15.52-15.5 0-8.56-6.948-15.5-15.52-15.5z" fill="currentColor"></path>
        </svg>
        <div class="dp-nav-info">
          <h1>SecurOS GEA</h1>
          <p>Gerenciador de Eventos Avançado</p>
        </div>
      </div>

      <div class="dp-nav-tabs">
        <router-link to="/" class="dp-tab-btn">📋 Despacho</router-link>
        <router-link to="/reports" class="dp-tab-btn">📊 Relatórios</router-link>
        <router-link to="/admin" class="dp-tab-btn">⚙️ Admin</router-link>
      </div>

      <div class="dp-nav-right"></div>
    </nav>

    <!-- CONTEÚDO -->
    <main class="empty-page">
      <div class="empty-content">
        <span class="empty-icon">🚧</span>
        <h2>Em Desenvolvimento</h2>
        <p>Esta funcionalidade estará disponível em breve.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.empty-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.empty-content {
  text-align: center;
  padding: 3rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-width: 400px;
}

.empty-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 1rem;
  opacity: 0.6;
}

.empty-content h2 {
  margin: 0 0 0.5rem;
  color: var(--text-main);
  font-size: 1.5rem;
}

.empty-content p {
  margin: 0;
  color: var(--text-muted);
}
</style>
