// Production process file. Run from this directory:
//   pm2 start ecosystem.config.cjs
//
// One fork only. Startup drops leftover indexes, and the cleanup worker
// sweeps temp files and storage. PM2 cluster mode is Node's cluster module,
// which does not apply when the interpreter is Bun.
module.exports = {
  apps: [
    {
      name: "frame-backend",
      cwd: __dirname,
      script: "server.js",
      interpreter: "bun",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1536M",
      kill_timeout: 10_000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: "production",
      },
      time: true,
    },
  ],
};
