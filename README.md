# My Node App

A monorepo Node.js application with three packages:

## Structure

```
packages/
├── website/   — Express server serving the website (port 3000)
├── api/       — Express server for REST APIs (port 4000)
└── utils/     — CLI utility commands
```

## Setup

```bash
npm install
```

## Running

Start the website server:
```bash
npm run start:website
```

Start the API server:
```bash
npm run start:api
```

Start both servers together:
```bash
npm run dev
```

Run a utility command:
```bash
npm run utils -- greet Alice
npm run utils -- info
npm run utils -- --help
```
