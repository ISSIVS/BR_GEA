# BR GEA 2 — Central de Despacho de Eventos

Sistema de gerenciamento e despacho de eventos de segurança integrado a câmeras via REST API. Interface web construída em Vue 3 com backend Node.js/Express e banco de dados PostgreSQL.

## Visão Geral

A aplicação recebe eventos de câmeras de segurança, permite que operadores visualizem, filtrem, comentem e encerrem ocorrências, além de gerar relatórios em CSV, Excel e PDF.

## Tecnologias

- **Frontend:** Vue 3, Vue Router, Vite, VueDatePicker
- **Backend:** Node.js, Express, PostgreSQL (`pg`), Axios
- **Exportação:** json2csv, PDFKit, XLSX
- **Empacotamento:** `pkg` (gera executável `.exe` para Windows)

## Estrutura

```
BR_GEA_2/
├── index.js              # Servidor Express (API + serve do frontend)
├── dispatch_ddl.sql      # DDL do banco de dados
├── src/
│   ├── components/
│   │   ├── DispatchPage.vue        # Tela principal de despacho
│   │   ├── DispatchEventModal.vue  # Modal de detalhes do evento
│   │   ├── ReportsTab.vue          # Aba de relatórios
│   │   └── SubscriptionsTab.vue    # Aba de administração/assinaturas
│   └── router/index.js             # Rotas: /, /reports, /admin
├── public/
│   └── uploads/          # Arquivos enviados pelo sistema
└── vite.config.mjs
```

## Pré-requisitos

- Node.js 18+
- PostgreSQL com `psql` acessível no PATH
- Acesso à API REST do servidor de câmeras

## Configuração

Crie um arquivo `.env` na raiz do projeto (onde o executável será rodado):

```env
DB_CONNECTION_STRING=postgresql://usuario:senha@host:5432/dispatch
VITE_API_URL=http://localhost:3000
VITE_REST_API_USER=usuario_cameras
VITE_REST_API_PASS=senha_cameras
IP_SERVER=192.168.x.x
```

## Banco de Dados

Na primeira execução, o servidor tenta conectar ao banco configurado em `DB_CONNECTION_STRING`. Se não existir, executa `dispatch_ddl.sql` automaticamente para criar o banco `dispatch` com as tabelas:

| Tabela        | Descrição                                      |
|---------------|------------------------------------------------|
| `events`      | Ocorrências recebidas das câmeras              |
| `comments`    | Comentários dos operadores por evento          |
| `logs`        | Auditoria de ações realizadas nos eventos      |
| `app_settings`| Configurações persistidas da aplicação         |

Para criar o banco manualmente:

```bash
psql "postgresql://usuario:senha@host/postgres" -f dispatch_ddl.sql
```

## Instalação e Execução

```bash
# Instalar dependências
npm install

# Desenvolvimento (frontend com hot-reload + backend)
npm run dev

# Build de produção
npm run build

# Gerar executável Windows (.exe)
npm run dist
```

O servidor sobe na porta `3000` por padrão e serve o frontend compilado em `dist/`.

## Rotas da Interface

| Rota       | Tela                        |
|------------|-----------------------------|
| `/`        | Central de despacho         |
| `/reports` | Relatórios e exportações    |
| `/admin`   | Administração e assinaturas |

## Funcionalidades

- Listagem de eventos com filtros por data, estado, tipo, operador, prioridade e ação
- Atualização automática da lista a cada intervalo configurável
- Modal de evento com histórico de comentários e log de auditoria
- Sincronização automática dos nomes das câmeras a cada 10 minutos
- Exportação de relatórios em **CSV**, **Excel** e **PDF**
- Criação automática do banco de dados na primeira execução
