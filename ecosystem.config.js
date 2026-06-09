module.exports = {
  apps: [
    {
      name: 'solumada-rh',
      script: 'server.js',
      instances: 1,            // single instance (in-memory rate limiter + cal.com cache are not cluster-safe)
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
      },
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Log files
      out_file: '/var/log/solumada/out.log',
      error_file: '/var/log/solumada/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Memory guard — restart if leak goes above 500 MB
      max_memory_restart: '500M',
    },
  ],
};
