// pm2 process file: `pm2 startOrRestart ecosystem.config.cjs` from bot/
module.exports = {
  apps: [
    {
      name: 'freeinf-ctf-bot',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
