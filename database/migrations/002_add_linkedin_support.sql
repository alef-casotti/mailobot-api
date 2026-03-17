-- Adicionar EMPRESAS_LINKEDIN ao enum campaign_type
ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'EMPRESAS_LINKEDIN';

-- Adicionar colunas LinkedIn na tabela leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industria VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS descricao TEXT;

-- Índice para deduplicação por linkedin_url
CREATE INDEX IF NOT EXISTS idx_leads_linkedin_url ON leads(linkedin_url) WHERE linkedin_url IS NOT NULL AND linkedin_url != '';
