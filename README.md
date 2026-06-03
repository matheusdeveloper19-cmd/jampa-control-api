# Jampa Control — API REST v1.0

Backend Node.js + Express + PostgreSQL para o sistema Jampa Control.

---

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+ **ou** conta gratuita no [Supabase](https://supabase.com)
- npm ou yarn

---

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais reais

# 3. Criar o banco de dados
# No PostgreSQL local:
createdb jampa_control
# Ou use o painel do Supabase para criar um projeto

# 4. Executar o schema (cria todas as tabelas)
npm run db:migrate

# 5. Popular dados estruturais (perfis, tipos, admin)
npm run db:seed

# 6. Iniciar o servidor
npm run dev       # desenvolvimento (com hot-reload)
npm start         # produção
```

---

## Estrutura do projeto

```
jampa-control-api/
├── src/
│   ├── server.js              # Ponto de entrada — Express + middlewares
│   ├── routes/
│   │   ├── auth.js            # POST /auth/login | logout | /me | /senha
│   │   ├── lancamentos.js     # GET/POST rotas e despesas | PUT aprovar | DELETE
│   │   ├── usuarios.js        # CRUD funcionários + controle de acesso
│   │   ├── adiantamentos.js   # Extrato + lançar + aprovar adiantamentos
│   │   ├── combustivel.js     # Histórico de preços + recálculo retroativo
│   │   ├── frota.js           # Veículos + histórico de uso e NFs
│   │   ├── centros.js         # Centros de custo + vínculos
│   │   ├── auditoria.js       # Log de todas as ações com filtros
│   │   └── dashboard.js       # KPIs executivos + custo por funcionário
│   ├── middleware/
│   │   └── auth.js            # Verificação JWT + adminOnly guard
│   ├── services/
│   │   ├── audit.js           # auditLog() — registra ações no banco
│   │   ├── combustivel.js     # Cálculo de custo por km + recálculo retroativo
│   │   └── saldo.js           # Recalcula saldo do usuário a partir do extrato
│   └── db/
│       ├── pool.js            # Pool de conexões PostgreSQL
│       ├── migrate.js         # Executa o schema SQL
│       └── seed.js            # Dados estruturais iniciais
├── .env.example
├── package.json
└── README.md
```

---

## Endpoints da API

### Autenticação
| Método | Rota              | Descrição                        | Acesso    |
|--------|-------------------|----------------------------------|-----------|
| POST   | /api/auth/login   | Login → retorna JWT              | Público   |
| POST   | /api/auth/logout  | Logout + auditoria               | Logado    |
| GET    | /api/auth/me      | Dados do usuário logado          | Logado    |
| PUT    | /api/auth/senha   | Trocar a própria senha           | Logado    |

### Lançamentos (rotas e despesas)
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/lancamentos              | Listar (com filtros)             | Logado    |
| POST   | /api/lancamentos/rota         | Nova rota                        | Logado    |
| POST   | /api/lancamentos/despesa      | Nova despesa                     | Logado    |
| PUT    | /api/lancamentos/:id/aprovar  | Aprovar ou reprovar              | Admin     |
| DELETE | /api/lancamentos/:id          | Exclusão suave                   | Admin     |

### Usuários / Controle de Acesso
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/usuarios                 | Listar funcionários              | Admin     |
| POST   | /api/usuarios                 | Novo funcionário                 | Admin     |
| PUT    | /api/usuarios/:id             | Editar cadastro                  | Admin     |
| PUT    | /api/usuarios/:id/acesso      | Bloquear / ativar                | Admin     |
| PUT    | /api/usuarios/:id/senha       | Redefinir senha (admin)          | Admin     |
| PUT    | /api/usuarios/senha/lote      | Reset em lote                    | Admin     |

### Adiantamentos
| Método | Rota                              | Descrição                    | Acesso    |
|--------|-----------------------------------|------------------------------|-----------|
| GET    | /api/adiantamentos/:id/extrato    | Extrato + saldo              | Logado    |
| POST   | /api/adiantamentos                | Lançar adiantamento          | Admin     |
| PUT    | /api/adiantamentos/:id/aprovar    | Aprovar / reprovar           | Admin     |

### Combustível
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/combustivel/preco-atual  | Preço vigente                    | Logado    |
| GET    | /api/combustivel/historico    | Histórico de preços              | Logado    |
| POST   | /api/combustivel              | Novo preço + recálculo rotas     | Admin     |

### Frota
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/frota                    | Listar veículos                  | Admin     |
| POST   | /api/frota                    | Cadastrar veículo                | Admin     |
| GET    | /api/frota/:id/historico      | Histórico do veículo             | Admin     |
| POST   | /api/frota/:id/uso            | Registrar uso                    | Admin     |
| POST   | /api/frota/:id/nf             | Registrar NF / manutenção        | Admin     |

### Centro de Custos
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/centros                  | Listar centros                   | Admin     |
| POST   | /api/centros                  | Criar centro                     | Admin     |
| PUT    | /api/centros/:id              | Editar centro                    | Admin     |
| POST   | /api/centros/:id/vincular     | Vincular funcionário             | Admin     |

### Dashboard e Relatórios
| Método | Rota                                    | Descrição                    | Acesso    |
|--------|-----------------------------------------|------------------------------|-----------|
| GET    | /api/dashboard/kpis                     | KPIs financeiros + operac.   | Logado    |
| GET    | /api/dashboard/custo-por-funcionario    | Custo por funcionário        | Admin     |

### Auditoria
| Método | Rota                          | Descrição                        | Acesso    |
|--------|-------------------------------|----------------------------------|-----------|
| GET    | /api/auditoria                | Log com filtros + paginação      | Admin     |

---

## Formato do JWT

O token retornado no login deve ser enviado em **toda** requisição protegida:

```
Authorization: Bearer eyJhbGci...
```

O payload contém: `sub` (id do usuário), `nome`, `perfil`, `is_admin`.

---

## Deploy gratuito recomendado

| Serviço     | Para quê        | Link                         |
|-------------|-----------------|------------------------------|
| Supabase    | Banco de dados  | supabase.com                 |
| Railway     | API Node.js     | railway.app                  |
| Render      | API Node.js     | render.com                   |
| Vercel      | Frontend HTML   | vercel.com                   |

### Deploy no Railway (mais simples)
```bash
# Instalar CLI
npm install -g @railway/cli

# Login e criar projeto
railway login
railway init

# Configurar variáveis de ambiente
railway variables set DATABASE_URL=... JWT_SECRET=... NODE_ENV=production

# Deploy
railway up
```

---

## Variáveis de ambiente obrigatórias

| Variável         | Descrição                                    |
|------------------|----------------------------------------------|
| `DATABASE_URL`   | URL de conexão PostgreSQL                    |
| `JWT_SECRET`     | String aleatória de 64+ bytes                |
| `PORT`           | Porta do servidor (padrão: 3001)             |
| `CORS_ORIGIN`    | Domínio do frontend                          |
| `NODE_ENV`       | `development` ou `production`                |

---

## Próximo passo — Passo 3

Com a API no ar, o **Passo 3** conecta o frontend HTML ao backend:
- Substituir as variáveis JS (`DB[]`, `SALDOS_ADV{}`) por chamadas `fetch()` à API
- Adicionar o token JWT em cada requisição
- Implementar loading states enquanto a API responde

---

*Jampa Control API — Gestão de Despesas Corporativas*
