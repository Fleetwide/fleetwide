import { Link, useLocation } from 'react-router-dom';
import { Box, GitBranch, Github, Home, Settings } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/workspaces', label: 'Workspaces', icon: Box },
  { path: '/import', label: 'Import', icon: GitBranch },
  { path: '/settings/github', label: 'GitHub', icon: Github },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen">
      <nav className="w-56 shrink-0 border-r border-gray-800 bg-gray-900 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight text-white">Fleetwide</h1>
          <p className="text-xs text-gray-500 mt-0.5">Repository Fleet Manager</p>
        </div>

        <ul className="space-y-1 flex-1">
          {navItems.map((item) => {
            const active =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-gray-800 pt-3 mt-3">
          <Link
            to="/settings/github"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Settings size={14} />
            Settings
          </Link>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
