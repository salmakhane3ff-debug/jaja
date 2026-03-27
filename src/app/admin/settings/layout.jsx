"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Store, 
  FileText, 
  Globe, 
  Menu as MenuIcon, 
  Settings as SettingsIcon,
  ChevronRight,
  Home
} from "lucide-react";

const settingsMenuItems = [
  {
    title: "Store Settings",
    href: "/admin/settings/store",
    icon: Store,
    description: "Store name, logo, currency"
  },
  {
    title: "Footer Settings", 
    href: "/admin/settings/footer",
    icon: FileText,
    description: "Footer content, contact info"
  },
  {
    title: "Social Media",
    href: "/admin/settings/social", 
    icon: Globe,
    description: "Social media links"
  },
  {
    title: "Menu Settings",
    href: "/admin/settings/menu",
    icon: MenuIcon,
    description: "Footer menu columns"
  }
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="w-full lg:w-80 bg-white lg:h-min rounded-2xl shadow lg:m-4">
          <div className="p-4 lg:p-6">
            {/* Header */}
            <div className="flex items-center gap-2 lg:gap-3 mb-6 lg:mb-8">
              <div className="p-1.5 lg:p-2 bg-blue-50 rounded-lg">
                <SettingsIcon className="w-4 h-4 lg:w-6 lg:h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg lg:text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-xs lg:text-sm text-gray-500">Configure your store</p>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 lg:gap-2 mb-4 lg:mb-6 text-xs lg:text-sm text-gray-500">
              <Link href="/admin" className="hover:text-gray-700 transition-colors">
                <Home className="w-3 h-3 lg:w-4 lg:h-4" />
              </Link>
              <ChevronRight className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
              <span>Settings</span>
              {pathname !== "/admin/settings" && (
                <>
                  <ChevronRight className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
                  <span className="text-gray-900 font-medium">
                    {settingsMenuItems.find(item => item.href === pathname)?.title || "Unknown"}
                  </span>
                </>
              )}
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-1 lg:space-y-2">
              {settingsMenuItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-start gap-2 lg:gap-3 p-3 lg:p-4 rounded-lg lg:rounded-xl transition-all duration-200
                      ${isActive 
                        ? 'bg-blue-50 border border-blue-200 text-blue-700' 
                        : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'
                      }
                    `}
                  >
                    <Icon className={`w-4 h-4 lg:w-5 lg:h-5 mt-0.5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-xs lg:text-sm ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                        {item.title}
                      </div>
                      <div className={`text-xs mt-0.5 lg:mt-1 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                        {item.description}
                      </div>
                    </div>
                    {isActive && (
                      <ChevronRight className="w-3 h-3 lg:w-4 lg:h-4 text-blue-600 mt-0.5" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Settings Info */}
            <div className="mt-6 lg:mt-8 p-3 lg:p-4 bg-gray-50 rounded-lg lg:rounded-xl">
              <h3 className="text-xs lg:text-sm font-medium text-gray-900 mb-1 lg:mb-2">Settings Overview</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Configure your store's appearance, functionality, and branding. 
                Changes are saved automatically and will reflect on your storefront immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}