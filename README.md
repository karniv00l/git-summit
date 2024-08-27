# GitSummit 🎢

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

Welcome to **GitSummit** – your AI-powered, release note-writing, changelog-managing, version-bumping superhero! 🦸‍♂️ No more slaving over tedious release notes or worrying about how to summarize all those commits. GitSummit does the heavy lifting for you, leveraging the incredible powers of OpenAI to turn your commit messages into clear, concise, and even fun release notes – all while following the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. 🚀

## Features

- **AI-Powered Summaries**: Let OpenAI do the talking – literally! It turns your commits into easy-to-read release notes faster than you can say "merge conflict." 🤖
- **Automatic Version Bumping**: Major, minor, or patch? GitSummit handles version bumps like a pro. 📈
- **Customizable Output**: Add a splash of fun, sprinkle in some emojis, or throw in some extra context. Your release notes, your style! 🎨
- **Changelog Management**: Automatically updates your `CHANGELOG.md` so you can focus on coding, not documenting. 📝

## Installation

Ready to give **GitSummit** a go? Here’s how to get started:

First, add this repository as a submodule to your project (GitSummit likes to be close to the action):

```bash
cd /path/to/your/project
git submodule add https://github.com/karniv00l/git-summit.git
```

Now, let's install the required Node.js version (because GitSummit likes its tools sharp and up-to-date):

```bash
cd git-summit
nvm install
# or using volta
volta install node
```

Install the required dependencies and head back to your project root:

```bash
npm i && cd ../
```

Set OpenAI API key:

```bash
export OPENAI_API_KEY="your-api-key"
```

Now you’re ready to roll! 🎉

## Usage

Let GitSummit work its magic: ✨

- It will look at the latest git **tag** (must be in proper semver format) and whip up some dazzling release notes for everything that’s happened since. 🌟
- Your freshly minted release notes will land in `RELEASE.md`, while `CHANGELOG.md` will be updated like clockwork. 🕒

```bash
npx ts-node ./git-summit/git-summit.ts
  --changelog CHANGELOG.md \
  --output RELEASE.md \
  --bump minor \
  --fun \
  --emoji \
  --summary \
  --dry-run \
  --context "Company name is Acme Inc., app name is SuperApp"
```
