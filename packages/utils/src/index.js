#!/usr/bin/env node

const commands = require('./commands');

const [,, command, ...args] = process.argv;

if (!command || command === '--help') {
  console.log('Available commands:');
  Object.keys(commands).forEach((name) => {
    console.log(`  ${name} - ${commands[name].description}`);
  });
  process.exit(0);
}

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error('Run with --help to see available commands.');
  process.exit(1);
}

commands[command].run(args);
