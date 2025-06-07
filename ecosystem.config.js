module.exports = {
  apps: [{
    name: 'evo-app',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    log_file: 'logs/combined.log',
    time: true,
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 4000,
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 10000,
    shutdown_with_message: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    node_args: '--max-old-space-size=4096'
  }]
}; 