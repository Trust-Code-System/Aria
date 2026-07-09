import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', href: '/projects', icon: 'folder_open' },
    { label: 'Agents', href: '/agents', icon: 'smart_toy' },
    { label: 'Knowledge', href: '/knowledge', icon: 'book_2' },
    { label: 'Memory', href: '/memory', icon: 'psychology' },
    { label: 'Reports', href: '/reports', icon: 'assessment' },
    { label: 'Admin', href: '/admin', icon: 'admin_panel_settings' },
    { label: 'Settings', href: '/settings', icon: 'settings' },
  ];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-low p-md">
      {/* Brand Header */}
      <div className="mb-lg flex items-center gap-md">
        <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-primary-container">smart_toy</span>
        </div>
        <div>
          <h1 className="font-display-md text-display-md font-bold text-on-surface dark:text-on-surface">Aria</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Premium AI Workspace</p>
        </div>
      </div>

      {/* CTA */}
      <Link href="/chat" className="mb-lg flex w-full items-center justify-center gap-sm rounded-full bg-primary-container px-md py-sm font-label-md text-label-md text-on-primary-container transition-colors hover:bg-inverse-primary hover:text-white">
        <span className="material-symbols-outlined text-[18px]">add</span>
        + New chat
      </Link>

      {/* Main Navigation */}
      <nav className="flex min-h-0 flex-1 flex-col gap-sm">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={
                isActive
                  ? "flex items-center gap-md px-md py-sm bg-secondary-container text-on-secondary-container rounded-xl font-label-md text-label-md scale-[0.98] transition-transform duration-150"
                  : "flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-xl font-label-md text-label-md"
              }
            >
              <span className="material-symbols-outlined" style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Navigation */}
      <div className="mt-auto flex flex-col gap-sm border-t border-outline-variant pt-md">
        <Link href="/profile" className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-xl font-label-md text-label-md">
          <span className="material-symbols-outlined">account_circle</span>
          Profile
        </Link>
        <button className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-xl font-label-md text-label-md">
          <span className="material-symbols-outlined">dark_mode</span>
          Theme
        </button>
        <button className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-xl font-label-md text-label-md">
          <span className="material-symbols-outlined">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
