#!/bin/bash
# ============================================================
# Jampa Control — Setup local automático
# Uso: bash setup.sh
# Sobe PostgreSQL + API + executa seed em um comando só
# ============================================================

set -e
GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo ""
echo "🚀 Jampa Control — Setup local"
echo "================================"

# Verificar Docker
command -v docker      >/dev/null 2>&1 || err "Docker não encontrado. Instale em https://docker.com"
command -v docker compose >/dev/null 2>&1 || err "Docker Compose não encontrado."

# Verificar schema SQL
[ -f "jampa-control-schema.sql" ] || err "jampa-control-schema.sql não encontrado na pasta atual."

# Criar .env se não existir
if [ ! -f ".env" ]; then
  warn ".env não encontrado — criando com valores padrão para desenvolvimento..."
  JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "dev_secret_$(date +%s)")
  cat > .env << EOF
DATABASE_URL=postgresql://jampa_user:jampa_pass_local@localhost:5432/jampa_control
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=8h
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000
BCRYPT_ROUNDS=10
EOF
  ok ".env criado (valores de desenvolvimento)"
fi

# Subir containers
echo ""
echo "📦 Subindo banco de dados e API..."
docker compose up -d --build

# Aguardar banco ficar pronto
echo "⏳ Aguardando PostgreSQL inicializar..."
for i in $(seq 1 20); do
  if docker compose exec db pg_isready -U jampa_user -d jampa_control >/dev/null 2>&1; then
    ok "PostgreSQL pronto"
    break
  fi
  sleep 2
  if [ $i -eq 20 ]; then
    err "PostgreSQL não inicializou em tempo. Verifique: docker compose logs db"
  fi
done

# Executar seed
echo ""
echo "🌱 Executando seed inicial..."
docker compose exec api node src/db/seed.js

echo ""
echo "═══════════════════════════════════════"
ok "Setup concluído!"
echo ""
echo "  Sistema: abra o arquivo jampa-control-v5.html no browser"
echo "  API:     http://localhost:3001/health"
echo "  Banco:   postgresql://jampa_user:jampa_pass_local@localhost:5432/jampa_control"
echo ""
warn "Primeiro login:"
echo "  E-mail: admin@jampa.com"
echo "  Senha:  admin@2025"
warn "Troque a senha imediatamente após o primeiro acesso!"
echo "═══════════════════════════════════════"
echo ""
