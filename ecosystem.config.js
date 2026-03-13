module.exports = {
  apps: [
    {
      name: 'mailobot-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mailobot-scheduler',
      script: 'scheduler/campaign-runner.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mailobot-worker-maps',
      script: 'workers/maps-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mailobot-worker-instagram',
      script: 'workers/instagram-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mailobot-worker-intent',
      script: 'workers/intent-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
  ],
};
