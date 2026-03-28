module.exports = {
  apps: [
    {
      name: 'whatsapp-bot-redcem',
      script: './app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3011
      },
      error_file: './logs/bot-err.log',
      out_file: './logs/bot-out.log',
      log_file: './logs/bot-combined.log',
      time: true,
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    }
  ]
};
