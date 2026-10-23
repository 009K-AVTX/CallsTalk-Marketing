// PM2 process file: `pm2 start ecosystem.config.cjs` from the server folder.
// Run exactly one instance: two copies polling the same bot token conflict.
module.exports = {
  apps: [
    {
      name: 'callstalk-chat',
      script: 'src/index.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      time: true,
    },
  ],
};
