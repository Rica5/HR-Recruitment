module.exports = {
  apps: [
    {
      name:             'solumada-recruitment',
      script:           './server.js',
      instances:        1,           // Mettre 'max' si multi-core souhaité
      exec_mode:        'fork',      // Passer à 'cluster' si instances > 1
      env: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
      error_file:           '/var/log/solumada/error.log',
      out_file:             '/var/log/solumada/out.log',
      log_date_format:      'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:           true,
      max_memory_restart:   '500M',
      watch:                false,
      ignore_watch:         ['node_modules', 'uploads', 'logs'],
      exp_backoff_restart_delay: 100,
      listen_timeout:       8000,
      kill_timeout:         5000,
      wait_ready:           false,
    },
  ],
};
