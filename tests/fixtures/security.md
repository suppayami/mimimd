# Untrusted content

<script>window.__compromised = true</script>

<img alt="Untrusted image" src="x" onerror="window.__compromised = true">

[Unsafe link](javascript:window.__compromised=true)

$\href{javascript:window.__compromised=true}{Unsafe math}$

```mermaid
%%{init: {"securityLevel": "loose"}}%%
graph TD
A --> B
```

```mermaid
graph TD
A --> B
click A "javascript:window.__compromised=true"
```

```mermaid
not a valid diagram
```

## Still readable

The rest of the document survives.
