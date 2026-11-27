# Building a React extension

API symbols are documented in the [local API reference](../README.md#local-api-reference).

Minimal pattern for wiring `@chili-publish/grafx-experience-extension-sdk` into a React app. Protocol details live in [Flows](flows.md). Public getting started: [docs.chiligrafx.com](https://docs.chiligrafx.com/GraFx-Developers/grafx-experience/extension-sdk/).

## Setup

```bash
npm create vite@latest my-extension -- --template react-ts
cd my-extension
npm install @chili-publish/grafx-experience-extension-sdk react-router-dom
```

Use **`HashRouter`**, not `BrowserRouter`. The host adds `tenantUrl` to the iframe query string; hash routing keeps that query intact while your app navigates. Pass `routingType: "client-hash"` on `connect` so the parent can soft-navigate without reloading the iframe.

## ExtensionSDKProvider

Create a provider that owns the SDK singleton, connects once, and exposes the handshake to the tree:

```tsx
// ExtensionSDKContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createExtensionSDK,
  type HandshakePayload,
  type IExtensionSDK,
} from "@chili-publish/grafx-experience-extension-sdk";

interface ExtensionSDKContextValue {
  sdk: IExtensionSDK;
  handshake: HandshakePayload | null;
  error: Error | null;
}

const ExtensionSDKContext =
  createContext<ExtensionSDKContextValue | null>(null);

export function ExtensionSDKProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sdk = createExtensionSDK();
  const [handshake, setHandshake] = useState<HandshakePayload | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connectToParent() {
      try {
        const payload = await sdk.connect({
          routingType: "client-hash",
          authTokenAutoRefresh: true,
        });

        if (cancelled) {
          return;
        }

        setHandshake(payload);
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (err instanceof Error) {
          setError(err);
        } else {
          setError(new Error(String(err)));
        }
      }
    }

    connectToParent();

    return () => {
      cancelled = true;
    };
  }, [sdk]);

  useEffect(() => {
    function onPageHide() {
      sdk.destroy();
    }

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sdk]);

  return (
    <ExtensionSDKContext.Provider value={{ sdk, handshake, error }}>
      {children}
    </ExtensionSDKContext.Provider>
  );
}

export function useExtensionSDK(): ExtensionSDKContextValue {
  const value = useContext(ExtensionSDKContext);

  if (value === null) {
    throw new Error(
      "useExtensionSDK must be used within ExtensionSDKProvider",
    );
  }

  return value;
}
```

Do **not** call `destroy()` in the connect effect cleanup — dependency changes would tear down the app-wide singleton. Destroy only on real unload (`pagehide`).

## App composition

```tsx
// App.tsx
import { HashRouter, Routes, Route } from "react-router-dom";
import {
  ExtensionSDKProvider,
  useExtensionSDK,
} from "./ExtensionSDKContext";
import { Home } from "./Home";

function ExtensionSDKGate({ children }: { children: React.ReactNode }) {
  const { handshake, error } = useExtensionSDK();

  if (error !== null) {
    return <p>Failed to connect: {error.message}</p>;
  }

  if (handshake === null) {
    return <p>Connecting…</p>;
  }

  return children;
}

export function App() {
  return (
    <HashRouter>
      <ExtensionSDKProvider>
        <ExtensionSDKGate>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </ExtensionSDKGate>
      </ExtensionSDKProvider>
    </HashRouter>
  );
}
```

Wrap order: `HashRouter` → `ExtensionSDKProvider` → ready gate → routes.

## Handshake data

After the gate, `handshake` is available. Context objects are `null` when
that host surface omitted them (Admin Console has no `spaceId` / `pageId`).
The host should still send [`designTokens`](flows.md#design-tokens) whenever
a tenant is in context.

Read it from the hook:

```tsx
function Home() {
  const { handshake } = useExtensionSDK();

  if (handshake === null) {
    return null;
  }

  const { extensionDetails, designTokens } = handshake;

  return (
    <p
      style={{
        color: designTokens?.primaryColor,
        fontFamily: designTokens?.fontFamily,
      }}
    >
      Tenant {extensionDetails?.tenantDomain} · locale {extensionDetails?.locale}
    </p>
  );
}
```

See `HandshakePayload`.

## API calls

```tsx
import { useEffect, useState } from "react";
import { useExtensionSDK } from "./ExtensionSDKContext";

function UserGreeting() {
  const { sdk } = useExtensionSDK();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const user = await sdk.apiCall<{ firstName: string }>(
        "/platform/v1/api/users/me",
      );
      setName(user.firstName);
    }

    loadUser();
  }, [sdk]);

  if (name === null) {
    return <p>Loading…</p>;
  }

  return <p>Hello, {name}</p>;
}
```

The SDK attaches auth and tenant headers. More detail: [API calls](flows.md#api-calls).

## Navigation sync

Notify the parent when the extension route changes, and handle host-driven soft navigation:

```tsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useExtensionSDK } from "./ExtensionSDKContext";

export function NavigationTracker() {
  const { sdk } = useExtensionSDK();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return sdk.onNavigate(({ path, search }) => {
      navigate(`${path}${search ?? ""}`);
    });
  }, [sdk, navigate]);

  useEffect(() => {
    sdk.emitNavigationChange({
      path: location.pathname,
      search: location.search,
    });
  }, [sdk, location.pathname, location.search]);

  return null;
}
```

Place `<NavigationTracker />` next to your routes inside the ready gate. See [Navigation](flows.md#navigation).

## Page settings

When the parent opens extension settings, listen with `onLoadPageSettings` and save with `emitUpdatePageSettings`. Full flow: [Page settings](flows.md#page-settings).

## Rules

- Use the SDK **once per app** — `createExtensionSDK()` is a singleton.
- Calling `connect` again from `useEffect` when deps change is safe.
- Call `destroy()` only on unload (`pagehide`), never in the connect effect cleanup.

See [Flows](flows.md) for handshake, auth-token refresh, API, page settings, and navigation.
