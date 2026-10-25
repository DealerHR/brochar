import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Params = Record<string, string>;

interface RouterCtx {
  path: string;
  navigate: (to: string, replace?: boolean) => void;
}

const RouterContext = createContext<RouterCtx>({ path: '/', navigate: () => {} });
const ParamsContext = createContext<Params>({});
const OutletContext = createContext<React.ReactNode>(null);

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const h = () => setPath(window.location.pathname);
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  const navigate = useCallback((to: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPath(to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useLocation() {
  return { pathname: useContext(RouterContext).path };
}

export function useParams<T extends Params = Params>(): T {
  return useContext(ParamsContext) as T;
}

export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

// Match a route pattern against a path, returning params or null
function matchPattern(pattern: string, path: string, exact: boolean): Params | null {
  const pp = pattern.split('/').filter(Boolean);
  const dp = path.split('/').filter(Boolean);
  if (exact && pp.length !== dp.length) return null;
  if (!exact && dp.length < pp.length) return null;
  const params: Params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      params[pp[i].slice(1)] = decodeURIComponent(dp[i] ?? '');
    } else if (pp[i] !== dp[i]) {
      return null;
    }
  }
  return params;
}

// Internal route config gathered by Routes
type RouteConfig = {
  path: string;
  element: React.ReactNode;
  children?: RouteConfig[];
  index?: boolean;
};

function collectRoutes(nodes: React.ReactNode, parentPath: string): RouteConfig[] {
  const configs: RouteConfig[] = [];
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = child.props as any;
    const seg = props.path ?? '';
    const fullPath = (parentPath + '/' + seg).replace(/\/+/g, '/') || '/';
    const cfg: RouteConfig = {
      path: fullPath,
      element: props.element ?? null,
      index: props.index,
    };
    if (props.children) {
      cfg.children = collectRoutes(props.children, fullPath);
    }
    configs.push(cfg);
  });
  return configs;
}

function renderRoutes(configs: RouteConfig[], path: string): React.ReactNode {
  for (const cfg of configs) {
    // Try to match this route (non-exact if it has children)
    const exact = !cfg.children || cfg.children.length === 0;
    const params = matchPattern(cfg.path, path, exact);
    if (params === null) continue;

    if (cfg.children && cfg.children.length > 0) {
      // Match a child route for the outlet
      const outlet = renderRoutes(cfg.children, path);
      return (
        <ParamsContext.Provider value={params}>
          <OutletContext.Provider value={outlet}>
            {cfg.element}
          </OutletContext.Provider>
        </ParamsContext.Provider>
      );
    }

    return (
      <ParamsContext.Provider value={params}>
        {cfg.element}
      </ParamsContext.Provider>
    );
  }
  return null;
}

export function Routes({ children }: { children: React.ReactNode }) {
  const { path } = useContext(RouterContext);
  const configs = collectRoutes(children, '');
  return <>{renderRoutes(configs, path)}</>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Route(_props: {
  path?: string;
  element?: React.ReactNode;
  index?: boolean;
  children?: React.ReactNode;
}) {
  return null; // Config-only; consumed by Routes
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const { navigate } = useContext(RouterContext);
  useEffect(() => { navigate(to, replace); }, [to, replace]);
  return null;
}

export function Link({
  to, children, className, style, onClick, target, rel,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  target?: string;
  rel?: string;
}) {
  const { navigate } = useContext(RouterContext);
  return (
    <a
      href={to}
      className={className}
      style={style}
      target={target}
      rel={rel}
      onClick={(e) => {
        if (target === '_blank') return;
        e.preventDefault();
        onClick?.(e);
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function NavLink({
  to,
  end,
  children,
  className,
  onClick,
}: {
  to: string;
  end?: boolean;
  children: ((props: { isActive: boolean }) => React.ReactNode) | React.ReactNode;
  className?: string | ((props: { isActive: boolean }) => string);
  onClick?: () => void;
}) {
  const { path, navigate } = useContext(RouterContext);
  const isActive = end ? path === to : path === to || path.startsWith(to + '/');
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className;
  return (
    <a
      href={to}
      className={resolvedClass}
      onClick={(e) => { e.preventDefault(); onClick?.(); navigate(to); }}
    >
      {typeof children === 'function' ? children({ isActive }) : children}
    </a>
  );
}
