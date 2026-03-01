# HappyClaw

综合项目仓库，包含 happy 和 openclaw 两个子项目。

## 项目结构

| 目录 | 描述 | 上游仓库 |
|------|------|----------|
| [happy](./happy) | Mobile and Web Client for Claude Code & Codex | [slopus/happy](https://github.com/slopus/happy) |
| [openclaw](./openclaw) | Open Source AI Terminal Assistant | [openclaw/openclaw](https://github.com/openclaw/openclaw) |

## 同步上游更新

```bash
# 同步 happy 上游更新
git fetch happy-upstream
git subtree pull --prefix=happy happy-upstream main --squash

# 同步 openclaw 上游更新
git fetch openclaw-upstream
git subtree pull --prefix=openclaw openclaw-upstream main --squash
```

## 推送到远程

```bash
git push origin main
```

## 许可证

各子项目遵循其原始许可证。
