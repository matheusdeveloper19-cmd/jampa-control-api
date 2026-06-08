require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRoutes          = require('./routes/auth');
const lancamentosRoutes   = require('./routes/lancamentos');
const usuariosRoutes      = require('./routes/usuarios');
const adiantamentosRoutes = require('./routes/adiantamentos');
const combustivelRoutes   = require('./routes/combustivel');
const frotaRoutes         = require('./routes/frota');
const centrosRoutes       = require('./routes/centros');
const auditoriaRoutes     = require('./routes/auditoria');
const dashboardRoutes     = require('./routes/dashboard');
const perfisRoutes        = require('./routes/perfis');

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
}));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Jampa Control API', version: '1.0.0',
             env: process.env.NODE_ENV || 'development', time: new Date().toISOString() });
});

app.use('/api/auth',          authRoutes);
app.use('/api/perfis',        perfisRoutes);
app.use('/api/lancamentos',   lancamentosRoutes);
app.use('/api/usuarios',      usuariosRoutes);
app.use('/api/adiantamentos', adiantamentosRoutes);
app.use('/api/combustivel',   combustivelRoutes);
app.use('/api/frota',         frotaRoutes);
app.use('/api/centros',       centrosRoutes);
app.use('/api/auditoria',     auditoriaRoutes);
app.use('/api/dashboard',     dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor.' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Jampa Control API rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health:   http://localhost:${PORT}/health\n`);
});

module.exports = app;
