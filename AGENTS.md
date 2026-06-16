# Project Agent Guidelines

## Git Safety

- Never commit secrets or private runtime data.
- Keep `data/local-config.json` out of Git because it may contain DingTalk Webhook URLs and signing secrets.
- Keep `data/daily-records.json` out of Git because it contains real personal work records.
- Commit only safe templates such as `data/local-config.example.json` and `data/daily-records.example.json`.
- Before every commit, run `git status --short` and check the staged files.
- Before every push, confirm no sensitive files are included with `git diff --cached --name-only` or `git ls-tree -r --name-only HEAD`.

## Commit And Push Rhythm

- After each meaningful code or documentation change, create a Git commit.
- Push the committed changes to the remote repository as soon as the change is verified.
- Use concise commit messages that describe the user-visible change.
- Do not include unrelated local files in commits. For this project, `build_comm_solution_doc.py` is currently treated as unrelated unless the user explicitly says otherwise.

## Local Runtime

- Run the local service from the project root:

```bash
npm start
```

- The local app is served at:

```text
http://127.0.0.1:4173
```

- If port `4173` is already in use, do not start a duplicate server. Use the running service or stop the old process first.

## DingTalk Configuration

- Store real DingTalk configuration only in `data/local-config.json`.
- `webhook` must be the full DingTalk robot URL, usually starting with `https://oapi.dingtalk.com/`.
- `secret` must be the optional signing secret, usually starting with `SEC`.
- If these values are accidentally swapped, fix the local file but do not commit it.
