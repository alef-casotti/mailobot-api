-- Campanhas
DO $$ BEGIN
  CREATE TYPE campaign_type AS ENUM (
    'NEGOCIO_LOCAL',
    'DESCOBERTA_NO_INSTAGRAM',
    'INTENCAO_DE_COMPRA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'ativo',
    'pausado',
    'encerrado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM (
    'novo',
    'qualificado',
    'contatado',
    'convertido',
    'descartado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS campanhas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  nome VARCHAR(255) NOT NULL,
  tipo campaign_type NOT NULL,
  cidade_alvo VARCHAR(255),
  palavras_chave JSONB DEFAULT '[]',
  seguidores_minimos INTEGER DEFAULT 0,
  meta_de_leads_diarios INTEGER NOT NULL DEFAULT 10,
  data_de_inicio DATE NOT NULL,
  data_de_termino DATE NOT NULL,
  status campaign_status DEFAULT 'ativo',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campanhas_status ON campanhas(status);
CREATE INDEX IF NOT EXISTS idx_campanhas_datas ON campanhas(data_de_inicio, data_de_termino);
CREATE INDEX IF NOT EXISTS idx_campanhas_user ON campanhas(user_id);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  telefone VARCHAR(50),
  instagram VARCHAR(255),
  email VARCHAR(255),
  seguidores INTEGER DEFAULT 0,
  cidade VARCHAR(255),
  origem VARCHAR(100),
  pontuacao DECIMAL(5,2) DEFAULT 0,
  status lead_status DEFAULT 'novo',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_created ON leads(campaign_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone) WHERE telefone IS NOT NULL AND telefone != '';
CREATE INDEX IF NOT EXISTS idx_leads_instagram ON leads(instagram) WHERE instagram IS NOT NULL AND instagram != '';
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL AND email != '';
