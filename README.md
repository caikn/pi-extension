# pi-extension

Monorepo of [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extensions and packages.

## Packages

- **[context-breakdown](./context-breakdown)** — Pi extension adding a `/context` command: a per-category estimate of what fills the model's context window.
- **[pi-pstack](./pi-pstack)** — Pi-native fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack) skills, Poteto Mode, and bundled agents. Delegates through the native `pi-subagents` `subagent` tool.

Each package has its own `README.md` and `package.json`. See those for usage.

## Installation

### From Git

Install both packages directly from the repository's `main` branch:

```bash
pi install git:github.com/caikn/pi-extension@main
pi install npm:pi-subagents
```

The repository package exposes both extensions, pstack skills, and bundled agents. `pi-subagents` provides the native delegation tool.

The explicit `@main` ref is pinned by Pi's update policy. Re-run the install command to refresh it from `main`. To follow the repository's default branch through `pi update`, install without an explicit ref instead:

```bash
pi install git:github.com/caikn/pi-extension
pi update git:github.com/caikn/pi-extension
```

Choose one installation method. Do not also install the subpackages locally, which would load duplicate extensions and skills.

### From a local checkout

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
pi -e .                     # both packages
pi -e ./context-breakdown    # context breakdown only
pi -e ./pi-pstack            # pstack only
```

Local installs reference the cloned directories. Keep the checkout in place and use `git pull` to update it.

## Thanks

Thanks to [casualjim's pi-mimir](https://github.com/casualjim/pi-mimir) for the Pi port of [pstack](https://github.com/cursor/plugins/tree/main/pstack). This repository builds on that work and replaces pi-mimir's subagent package with the native [pi-subagents](https://www.npmjs.com/package/pi-subagents) extension.

## License

MIT
