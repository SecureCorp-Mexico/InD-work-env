# InD work env

Default SecureCorp team workspace for Cursor Cloud Agents.

## Cursor Cloud specific instructions

- This repo is the team default Cloud Agent workspace.
- Keep setup light: prefer installing task-specific deps during the agent run unless they become permanent.
- Put shared secrets in the Cursor Dashboard → Cloud Agents → Secrets (not in this repo).
- When adding a real stack (Node, Python, Docker, etc.), update `.cursor/environment.json` `install` / `start` accordingly and commit that change.
