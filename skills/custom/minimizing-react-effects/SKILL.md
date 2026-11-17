---
name: minimizing-react-effects
description: Use when writing, reviewing or refactoring React components or hooks that use or might need useEffect or useLayoutEffect. Especially when state is set from props or other state, props are copied into state, a parent is notified through an onChange-style prop, state must reset when an id or prop changes, state updates cascade, startup logic should run once, data is fetched, browser events are subscribed to, or react-hooks/exhaustive-deps is being suppressed.
---

# Minimizing React Effects

## Overview

An Effect is an escape hatch for **synchronizing a component with a system
outside React**: the network, a browser API, a non-React widget, the DOM, or a
subscription. If no external system is involved, the Effect is almost always
wrong. It costs an extra render with stale values, leaves state redundant and
able to drift, and adds a bug that fires at the wrong time.

Ask one question about the code you want to run: **why does it need to run?**

- **The user did something** (clicked, typed, submitted): it goes in that
  **event handler**.
- **The component is on screen and must stay in sync with something external**:
  it goes in an **Effect**.
- **It can be calculated from props or state**: compute it **during render**.
  It needs no state and no Effect.

## The gate before every `useEffect`

Before you write or keep any Effect, fill in this line:

> **External system:** \<what outside React this synchronizes with\> ·
> **Cleanup:** \<what undoes it\>

If you cannot name an external system, use the replacement table below. A
parent component's callback, your own state, and a prop are not external
systems.

## Replacement table

| You want to… | Instead of an Effect, do this |
|---|---|
| Derive a value from props/state (`fullName`, a filtered list, `isGameOver`) | Compute it in the component body. Delete the state. |
| Avoid recomputing something expensive | Compute in render first. Add `useMemo(fn, deps)` only if timing shows ≥1 ms (or the project doesn't use React Compiler and the input is thousands of items). The function must be pure. |
| Reset **all** state when an id/prop changes | Render the stateful part with `key={id}`. A wrapper keeps `key` out of the public API. |
| Reset **some** state when a prop changes | First try storing an id and deriving (`items.find(i => i.id === selectedId) ?? null`). Otherwise adjust during render with a previous-value guard (see below). |
| Run logic in response to a click/submit (POST, toast, navigate, analytics for that action) | Put it in the handler. Share it between handlers with a plain function. |
| Tell the parent about a change (`onChange`, `onDirtyChange`, `onSelect`) | Call the callback **in the same handler** that sets the state, or make the child controlled and lift the state up. |
| Pass data a child loaded up to its parent | The parent fetches and passes it down. |
| Update several pieces of state that depend on each other | Compute all next values in one handler using local variables (`const nextRound = round + 1`). Do not chain Effects. |
| Run once per app load (read a token, init an SDK) | Use a module-level guard (`let didInit = false`) or module-level code in the entry file. Not `useEffect([])`, and not a `useRef` flag, which a remount resets. |
| Read a browser/external store (`navigator.onLine`, `matchMedia`, a store) | `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` with a stable `subscribe`, wrapped in a custom hook. |
| Fetch data | Use the project's data layer if it has one: framework loaders, server components, TanStack Query, SWR or RTK Query. Otherwise use an Effect **with cleanup** (see below), extracted into a custom hook. |
| Read the latest prop/callback inside a legitimate Effect without re-running it | Use `useEffectEvent` (React 19.2+). Never `// eslint-disable-next-line react-hooks/exhaustive-deps`. |

## Patterns

**Notify the parent in the handler, not after render:**

```tsx
// ❌ Effect: renders once with stale parent state, then calls back after commit
useEffect(() => { onDirtyChange(dirty); }, [dirty]); // eslint-disable … ← red flag

// ✅ Handler: one batched render for child and parent
function updateDraft(next: Contact) {
  setDraft(next);
  onDirtyChange(!isSameContact(next, contact));
}
```

If the parent needs a value the child holds at every moment, the parent
should own the state. Lift it up and pass `value` and `onChange` down.

When a `key` change resets the child, the parent triggered that change, so
the parent resets its own copy in the same handler. For example,
`selectContact(id)` calls `setDirty(false)`. The child does not report
"reset" from an Effect.

**Reset everything on identity change with `key`:**

```tsx
export function ContactEditor(props: Props) {
  return <ContactForm key={props.contact.id} {...props} />;
}
```

**Adjust one piece of state during render.** This beats an Effect but is
worse than `key` or derivation, so use it last:

```tsx
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {   // the guard prevents an infinite loop
  setPrevItems(items);
  setSelection(null);        // only this component's own state; no other side effects here
}
```

**Run app startup logic once (survives Strict Mode and remounts):**

```tsx
let didInit = false;
function App() {
  useEffect(() => {
    if (didInit) return;
    didInit = true;
    validateToken(localStorage.getItem('authToken')).then(setUser);
  }, []);
}
```

**Fetch in an Effect only with race-condition cleanup:**

```tsx
function useData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let ignore = false;
    fetch(url).then(r => r.json()).then(json => { if (!ignore) setData(json); });
    return () => { ignore = true; };   // AbortController is also fine
  }, [url]);
  return data;
}
```

Keep the fetch in an Effect rather than the input's handler. The URL can
change through back/forward navigation or a prefilled query with no typing.

## Effects that are legitimate

Keep these, but each one still needs cleanup and should live in a custom
hook with a declarative API:

- Connecting to or subscribing to something external (socket, `addEventListener`, `IntersectionObserver`, a third-party widget).
- Writing to non-React DOM or browser state (`document.title`, `document.body.dataset.theme`, focusing or measuring a node, where `useLayoutEffect` is right for measuring).
- Analytics or logging that should fire **because the component was displayed**. Firing twice in dev under Strict Mode is expected; don't add a ref guard to hide it.
- Effect chains where each step waits on the **network** (dropdown B's options depend on the selection in dropdown A).

## Red flags: stop and re-check against the table

- `setX(...)` is the only thing in the Effect body, and it uses props or state.
- The Effect's dependency is a prop, and its body resets state.
- The Effect calls a prop callback (`onChange`, `onSomething`).
- An Effect's `setState` triggers another Effect.
- `useEffect(..., [])` with a `useRef` "already ran" flag.
- `eslint-disable` for `react-hooks/exhaustive-deps`.
- A `jsonToSubmit` or `shouldSend` flag set in a handler so that an Effect does the real work.
- `useMemo` around a cheap `.filter`/`.map`, added "for performance" without measuring.

When you review or refactor existing code, list each Effect with its external
system. Rewrite each one that has none using the table, and say which row
applied.

---

Adapted from [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
(react.dev, CC BY 4.0).
