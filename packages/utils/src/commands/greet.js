module.exports = {
  description: 'Print a greeting message',
  run(args) {
    const name = args[0] || 'World';
    console.log(`Hello, ${name}!`);
  },
};
