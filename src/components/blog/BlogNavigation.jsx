"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@heroui/react";
import { Home, BookOpen, FileText, Rss } from "lucide-react";

export default function BlogNavigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/blog", label: "Blog", icon: BookOpen },
    { href: "/blog?category=page", label: "Pages", icon: FileText },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Navigation Links */}
          <div className="flex items-center space-x-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || 
                (href === "/blog" && pathname.startsWith("/blog"));
              
              return (
                <Link key={href} href={href}>
                  <Button
                    variant={isActive ? "solid" : "light"}
                    color={isActive ? "primary" : "default"}
                    size="sm"
                    startContent={<Icon className="w-4 h-4" />}
                    className={isActive ? "" : "text-gray-600 hover:text-gray-900"}
                  >
                    {label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* RSS Feed Link (optional) */}
          <div className="flex items-center">
            <Button
              as={Link}
              href="/api/rss" // You would need to implement this
              variant="light"
              size="sm"
              startContent={<Rss className="w-4 h-4" />}
              className="text-gray-600 hover:text-gray-900"
            >
              RSS
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}