# pi-extension

Monorepo of [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extensions and packages.

## Packages

- **[context-breakdown](./context-breakdown)** — Pi extension adding a `/context` command: a per-category estimate of what fills the model's context window.
- **[pi-pstack](./pi-pstack)** — Pi-native fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack) skills, Poteto Mode, and bundled agents. Delegates through the native `pi-subagents` `subagent` tool.

Each package has its own `README.md` and `package.json`. See those for usage.

## Installation

Clone this repository, then install the packages you want with Pi:

```bash
git clone https://github.com/caikn/pi-extension.git
cd pi-extension

pi install ./context-breakdown
pi install ./pi-pstack
```

For `pi-pstack` subagent delegation, also install the native subagent extension:

```bash
pi install npm:pi-subagents
```

Restart Pi after installation. Use `/context` for the context breakdown, or `/poteto-mode` and `/setup-pstack` for pstack.

Installs above apply to your user configuration. Add `--local` to a `pi install` command to install only for the current project.

To try a package for one session without installing it, run from the repository root:

```bash
pi -e ./context-breakdown
pi -e ./pi-pstack
```

Local installs reference the cloned directories. Keep the checkout in place and use `git pull` to update it.

## License

MIT
