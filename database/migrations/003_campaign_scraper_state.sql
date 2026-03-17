-- Estado do scraper por campanha (para retomar de onde parou)
CREATE TABLE IF NOT EXISTS campaign_scraper_state (
  campaign_id INTEGER PRIMARY KEY REFERENCES campanhas(id) ON DELETE CASCADE,
  last_place_identifier VARCHAR(500),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
