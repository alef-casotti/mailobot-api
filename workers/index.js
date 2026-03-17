/**
 * Inicia todos os workers em um único processo.
 * Para produção, prefira rodar cada worker separadamente (worker:maps, worker:instagram, worker:intent, worker:linkedin)
 * para melhor isolamento e escalabilidade.
 */
require('./maps-worker');
require('./instagram-worker');
require('./intent-worker');
require('./linkedin-worker');
